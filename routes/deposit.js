// routes/deposit.js
// Deposit/Withdraw Routes

import { log } from "../modules/logger.js";
import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import {
  saveLunaDeposit,
  getActiveDeposit,
  getDepositForStatus,
  withdrawDeposit,
  getDepositBySignature,
  clearAllDeposits,
  setWithdrawIntent,
  clearWithdrawIntent,
  getPendingWithdrawals,
  getTotalBurnedLuna,
  getQueueMetrics,
  pingDb,
} from "../modules/db.js";
import { getTokenInfoFromDexScreener } from "../modules/pumpfun_api.js";

/**
 * Setup Deposit routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupDepositRoutes(app, dependencies) {
  const {
    DEPOSIT_ESCROW_WALLET,
    DEPOSIT_ESCROW_PRIVATE_KEY,
    DEPOSIT_MIN_BALANCE,
    LUNA_TOKEN_MINT,
    SOLANA_RPC_URL,
    isValidWalletAddress,
    DEPOSIT_BURN_WALLET,
  } = dependencies;

  const FALLBACK_ESCROW_WALLET = DEPOSIT_ESCROW_WALLET || "FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU";
  const DEFAULT_BURN_WALLET = "1nc1nerator11111111111111111111111111111111";
  const DEFAULT_DEPOSIT_NOTE =
    "Send Luna to the escrow wallet via Phantom, then submit the transaction signature to verify. SOL gas fees are paid by the sender.";
  const toNumberOrFallback = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const MIN_DEPOSIT = typeof DEPOSIT_MIN_BALANCE === "number" ? DEPOSIT_MIN_BALANCE : 150000;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const RPC_URL = SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const BASE_MIN_USD = toNumberOrFallback(process.env.DEPOSIT_BASE_MIN_USD, 15);
  const MIN_USD_FLOOR = toNumberOrFallback(process.env.DEPOSIT_MIN_USD_FLOOR, 15);
  const MAX_USD_CAP = toNumberOrFallback(process.env.DEPOSIT_MIN_USD_CAP, 30);
  const DYNAMIC_MIN_CACHE_MS = toNumberOrFallback(process.env.DEPOSIT_DYNAMIC_CACHE_MS, 5 * 60 * 1000);
  const MINT_PROGRAM_CACHE_MS = toNumberOrFallback(process.env.MINT_PROGRAM_CACHE_MS, 5 * 60 * 1000);
  const RATE_LIMIT_MAX = toNumberOrFallback(process.env.DEPOSIT_RATE_LIMIT_MAX, 5);
  const RATE_LIMIT_WINDOW_MS = toNumberOrFallback(process.env.DEPOSIT_RATE_LIMIT_WINDOW_MS, 60 * 1000);
  const HEALTH_RPC_TIMEOUT_MS = toNumberOrFallback(process.env.HEALTH_RPC_TIMEOUT_MS, 5000);
  const walletLocks = new Map();
  const connection = new Connection(RPC_URL, "confirmed");
  let cachedMintDecimals = null;

  let escrowPublicKey = null;
  try {
    escrowPublicKey = new PublicKey(FALLBACK_ESCROW_WALLET);
  } catch (error) {
    log.error("[deposit] Invalid DEPOSIT_ESCROW_WALLET:", FALLBACK_ESCROW_WALLET, error);
  }

  let escrowKeypair = null;
  if (DEPOSIT_ESCROW_PRIVATE_KEY) {
    try {
      escrowKeypair = Keypair.fromSecretKey(bs58.decode(DEPOSIT_ESCROW_PRIVATE_KEY));
    } catch (error) {
      log.error("[deposit] Invalid DEPOSIT_ESCROW_PRIVATE_KEY:", error);
    }
  }

  let mintPublicKey = null;
  if (LUNA_TOKEN_MINT) {
    try {
      mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    } catch (error) {
      log.error("[deposit] Invalid LUNA_TOKEN_MINT:", LUNA_TOKEN_MINT, error);
    }
  }

  const burnWalletSource = DEPOSIT_BURN_WALLET || DEFAULT_BURN_WALLET;
  let burnWalletPublicKey = null;
  if (burnWalletSource) {
    try {
      burnWalletPublicKey = new PublicKey(burnWalletSource);
    } catch (error) {
      log.error("[deposit] Invalid burn wallet address:", burnWalletSource, error);
    }
  }

  const TOKEN_PROGRAM_ID_STR = TOKEN_PROGRAM_ID.toBase58();
  const TOKEN_2022_PROGRAM_ID_STR = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
  
  // Helper to check if program ID is a token program (Token or Token-2022)
  const isTokenProgram = (programId) => {
    const programIdStr = toProgramIdString(programId);
    return programIdStr === TOKEN_PROGRAM_ID_STR || programIdStr === TOKEN_2022_PROGRAM_ID_STR;
  };
  const burnRateRaw = Number(process.env.DEPOSIT_BURN_RATE ?? 0.03);
  const DEPOSIT_BURN_RATE = Number.isFinite(burnRateRaw)
    ? Math.min(Math.max(burnRateRaw, 0), 1)
    : 0.03;

  let tokenProgramId = TOKEN_PROGRAM_ID;
  let escrowTokenAccount = null;
  let burnTokenAccount = null;
  let tokenProgramCache = {
    tokenProgramId,
    expiresAt: 0,
  };
  const rateLimiter = new Map(); // key -> array of timestamps
  let lastHealthStatus = { ok: true, db: true, rpc: true, ts: Date.now() };

  async function withWalletLock(wallet, task) {
    const prev = walletLocks.get(wallet) || Promise.resolve();
    let result;
    const next = prev.then(async () => {
      result = await task();
      return result;
    });
    walletLocks.set(wallet, next.catch(() => {}));
    try {
      await next;
      return result;
    } finally {
      const current = walletLocks.get(wallet);
      if (current === next) {
        walletLocks.delete(wallet);
      }
    }
  }

  function checkRateLimit(key) {
    if (!key) return { ok: true };
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    const arr = rateLimiter.get(key) || [];
    const filtered = arr.filter((ts) => ts >= windowStart);
    if (filtered.length >= RATE_LIMIT_MAX) {
      const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - filtered[0]);
      rateLimiter.set(key, filtered);
      return { ok: false, retryAfterMs };
    }
    filtered.push(now);
    rateLimiter.set(key, filtered);
    return { ok: true };
  }

  async function healthCheck() {
    const start = Date.now();
    let dbOk = false;
    let rpcOk = false;

    // DB check: simple query depending on driver
    try {
      dbOk = await pingDb();
    } catch (err) {
      dbOk = false;
      log.debug("[health] db check failed:", err?.message || err);
    }

    // RPC check: getLatestBlockhash with timeout
    try {
      const rpcPromise = connection.getLatestBlockhash("finalized");
      const timed = Promise.race([
        rpcPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("RPC timeout")), HEALTH_RPC_TIMEOUT_MS)
        ),
      ]);
      await timed;
      rpcOk = true;
    } catch (err) {
      rpcOk = false;
      log.debug("[health] rpc check failed:", err?.message || err);
    }

    const ok = dbOk && rpcOk;
    lastHealthStatus = { ok, db: dbOk, rpc: rpcOk, ts: Date.now(), durationMs: Date.now() - start };
    return lastHealthStatus;
  }

  async function resolveTokenProgramAndAtas() {
    if (!mintPublicKey) {
      return;
    }

    const now = Date.now();
    const cacheValid = tokenProgramCache.expiresAt && tokenProgramCache.expiresAt > now && tokenProgramCache.tokenProgramId;

    if (!cacheValid) {
      try {
        const mintInfo = await connection.getAccountInfo(mintPublicKey);
        if (mintInfo?.owner) {
          const ownerStr = mintInfo.owner.toBase58();
          tokenProgramId =
            ownerStr === TOKEN_2022_PROGRAM_ID_STR ? new PublicKey(TOKEN_2022_PROGRAM_ID_STR) : TOKEN_PROGRAM_ID;
        } else {
          tokenProgramId = TOKEN_PROGRAM_ID;
        }
      } catch (error) {
        log.error("[deposit] Failed to fetch mint info for token program detection:", error?.message || error);
        tokenProgramId = TOKEN_PROGRAM_ID;
      }

      tokenProgramCache = {
        tokenProgramId,
        expiresAt: now + MINT_PROGRAM_CACHE_MS,
      };
    } else {
      tokenProgramId = tokenProgramCache.tokenProgramId;
    }

    try {
      escrowTokenAccount =
    mintPublicKey && escrowPublicKey
          ? getAssociatedTokenAddressSync(mintPublicKey, escrowPublicKey, false, tokenProgramId)
      : null;
    } catch (error) {
      log.error("[deposit] Failed to derive escrow ATA:", error?.message || error);
      escrowTokenAccount = null;
    }

    try {
      burnTokenAccount =
    mintPublicKey && burnWalletPublicKey
          ? getAssociatedTokenAddressSync(mintPublicKey, burnWalletPublicKey, true, tokenProgramId)
      : null;
    } catch (error) {
      log.error("[deposit] Failed to derive burn ATA:", error?.message || error);
      burnTokenAccount = null;
    }
  }

  async function ensureEscrowAtaExists() {
    if (!escrowKeypair || !escrowTokenAccount || !mintPublicKey || !escrowPublicKey) {
      return;
    }
    try {
      const info = await connection.getAccountInfo(escrowTokenAccount);
      if (info) {
        return;
      }
      const rentLamports = await connection.getMinimumBalanceForRentExemption(165);
      const balanceLamports = await connection.getBalance(escrowPublicKey);
      const minLamports = rentLamports + 5000; // add small fee buffer
      if (balanceLamports < minLamports) {
        log.warn(
          `[deposit] Escrow wallet has ${balanceLamports} lamports (< ${minLamports}). Top up SOL to create escrow ATA.`
        );
        return;
      }
      log.info("[deposit] Creating escrow ATA for", escrowPublicKey.toBase58());
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          escrowKeypair.publicKey,
          escrowTokenAccount,
          escrowPublicKey,
          mintPublicKey,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      await sendAndConfirmTransaction(connection, tx, [escrowKeypair], {
        commitment: "confirmed",
      });
      log.info("[deposit] Escrow ATA created successfully:", escrowTokenAccount.toBase58());
    } catch (error) {
      log.error("[deposit] Failed to ensure escrow ATA exists:", error?.message || error);
    }
  }

  async function ensureBurnAtaExists() {
    if (!escrowKeypair || !burnTokenAccount || !mintPublicKey || !burnWalletPublicKey) {
      return;
    }
    try {
      const info = await connection.getAccountInfo(burnTokenAccount);
      if (info) {
        return;
      }
      log.info("[deposit] Creating burn ATA for", burnWalletPublicKey.toBase58());
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          escrowKeypair.publicKey,
          burnTokenAccount,
          burnWalletPublicKey,
          mintPublicKey,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      await sendAndConfirmTransaction(connection, tx, [escrowKeypair], {
        commitment: "confirmed",
      });
      log.info("[deposit] Burn ATA created successfully:", burnTokenAccount.toBase58());
    } catch (error) {
      log.error("[deposit] Failed to ensure burn ATA exists:", error?.message || error);
    }
  }

  resolveTokenProgramAndAtas()
    .then(() =>
      ensureEscrowAtaExists().catch((err) => {
        log.error("[deposit] ensureEscrowAtaExists error:", err?.message || err);
      })
    )
    .then(() =>
  ensureBurnAtaExists().catch((err) => {
    log.error("[deposit] ensureBurnAtaExists error:", err?.message || err);
      })
    )
    .catch((err) => {
      log.error("[deposit] init ATA setup error:", err?.message || err);
  });

  const getCurrentMintDecimals = () => (cachedMintDecimals ?? 9);

  const formatFeeDisplay = (value) => {
    const percentage = (value * 100).toFixed(1);
    return `${percentage.endsWith(".0") ? percentage.slice(0, -2) : percentage}% fee`;
  };

  const resolveFeePercentage = (days) => {
    if (days >= 6) return 0.01;
    if (days >= 3) return 0.02;
    return 0.03;
  };

  const formatNumber = (num) => Number(num || 0).toLocaleString("en-US");
  const clampNumber = (value, min, max) => {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
  };

  const dynamicRequirementCaches = new Map();
  const dynamicRequirementPromises = new Map();

  const DEFAULT_DYNAMIC_CONTEXTS = {
    deposit: {
      context: "deposit",
      baseUsd: BASE_MIN_USD > 0 ? BASE_MIN_USD : 10,
      floorUsd: MIN_USD_FLOOR,
      capUsd: MIN_USD_FLOOR, // lock to the floor (no upsizing)
      fallbackAmount: MIN_DEPOSIT,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    "vs-luna": {
      context: "vs-luna",
      baseUsd: 30,
      floorUsd: 30,
      capUsd: 30,
      fallbackAmount: 1_000_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    "vs_luna": {
      context: "vs-luna",
      baseUsd: 30,
      floorUsd: 30,
      capUsd: 30,
      fallbackAmount: 1_000_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    "vs luna": {
      context: "vs-luna",
      baseUsd: 30,
      floorUsd: 30,
      capUsd: 30,
      fallbackAmount: 1_000_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    "play-pvp": {
      context: "play-pvp",
      baseUsd: 10,
      floorUsd: 10,
      capUsd: 10,
      fallbackAmount: 100_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    "play_pvp": {
      context: "play-pvp",
      baseUsd: 10,
      floorUsd: 10,
      capUsd: 10,
      fallbackAmount: 100_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    "play pvp": {
      context: "play-pvp",
      baseUsd: 10,
      floorUsd: 10,
      capUsd: 10,
      fallbackAmount: 100_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    pvp: {
      context: "play-pvp",
      baseUsd: 10,
      floorUsd: 10,
      capUsd: 10,
      fallbackAmount: 100_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    "group-chat": {
      context: "group-chat",
      baseUsd: 10,
      floorUsd: 10,
      capUsd: 10,
      fallbackAmount: 100_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    "group_chat": {
      context: "group-chat",
      baseUsd: 10,
      floorUsd: 10,
      capUsd: 10,
      fallbackAmount: 100_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    chat: {
      context: "group-chat",
      baseUsd: 10,
      floorUsd: 10,
      capUsd: 10,
      fallbackAmount: 100_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
    "group chat": {
      context: "group-chat",
      baseUsd: 10,
      floorUsd: 10,
      capUsd: 10,
      fallbackAmount: 100_000,
      cacheMs: DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments: false,
    },
  };

  const getContextDefaults = (context = "deposit") => {
    const key = context && DEFAULT_DYNAMIC_CONTEXTS[context]
      ? context
      : "deposit";
    return { ...DEFAULT_DYNAMIC_CONTEXTS[key] };
  };

  async function getDynamicRequirement(options = {}) {
    const defaults = getContextDefaults(options.context);
    const {
      context = defaults.context || "deposit",
      baseUsd = defaults.baseUsd,
      floorUsd = defaults.floorUsd,
      capUsd = defaults.capUsd,
      fallbackAmount = defaults.fallbackAmount,
      cacheMs = defaults.cacheMs || DYNAMIC_MIN_CACHE_MS,
      allowMarketAdjustments = defaults.allowMarketAdjustments !== false,
      force = false,
    } = { ...defaults, ...options };

    const cacheKey = JSON.stringify({
      context,
      baseUsd,
      floorUsd,
      capUsd,
      fallbackAmount,
      allowMarketAdjustments,
    });

    const now = Date.now();
    const cached = dynamicRequirementCaches.get(cacheKey);
    if (!force && cached && now - cached.updatedAt < cacheMs) {
      return cached;
    }

    if (!force && dynamicRequirementPromises.has(cacheKey)) {
      return dynamicRequirementPromises.get(cacheKey);
    }

    const fetchPromise = (async () => {
      let usdRequirement = baseUsd > 0 ? baseUsd : 10;
      let amountLuna = fallbackAmount;
      let priceUsd = null;
      let marketCap = null;
      let volume24h = null;
      let liquidity = null;
      let priceChange24h = null;
      let source = "fallback";

      if (LUNA_TOKEN_MINT) {
        try {
          const info = await getTokenInfoFromDexScreener(LUNA_TOKEN_MINT);
          if (info && Number(info.price) > 0) {
            priceUsd = Number(info.price);
            marketCap = Number(info.marketCap) || null;
            volume24h = Number(info.volume24h) || null;
            liquidity = Number(info.liquidity) || null;
            priceChange24h = Number(info.priceChange24h) || null;

            let multiplier = 1;
            if (allowMarketAdjustments) {
              if (marketCap) {
                if (marketCap >= 2_000_000) multiplier *= 0.7;
                else if (marketCap >= 1_000_000) multiplier *= 0.85;
                else if (marketCap <= 250_000) multiplier *= 1.2;
              }
              if (volume24h) {
                if (volume24h >= 200_000) multiplier *= 0.9;
                else if (volume24h <= 25_000) multiplier *= 1.1;
              }
              if (liquidity && liquidity <= 50_000) {
                multiplier *= 1.05;
              }
            }

            usdRequirement = clampNumber(baseUsd * multiplier, floorUsd, capUsd);
            amountLuna = Math.max(Math.round(usdRequirement / priceUsd), 1);
            source = "dexscreener";
          }
        } catch (error) {
          log.warn(`[deposit] Failed to fetch DexScreener data (${context}):`, error?.message || error);
        }
      }

      if (!amountLuna || !Number.isFinite(amountLuna) || amountLuna <= 0) {
        amountLuna = fallbackAmount;
      }

      const payload = {
        context,
        amount: amountLuna,
        usd: source === "dexscreener" ? usdRequirement : null,
        priceUsd,
        marketCap,
        volume24h,
        liquidity,
        priceChange24h,
        updatedAt: now,
        source,
        baseUsd,
        floorUsd,
        capUsd,
        fallbackAmount,
        allowMarketAdjustments,
      };

      dynamicRequirementCaches.set(cacheKey, payload);
      dynamicRequirementPromises.delete(cacheKey);
      return payload;
    })().catch((error) => {
      dynamicRequirementPromises.delete(cacheKey);
      log.warn(`[deposit] Dynamic requirement fetch failed (${options.context || "deposit"}):`, error?.message || error);
      const fallbackPayload = {
        context,
        amount: fallbackAmount,
        usd: null,
        priceUsd: null,
        marketCap: null,
        volume24h: null,
        liquidity: null,
        priceChange24h: null,
        updatedAt: now,
        source: "fallback",
        baseUsd,
        floorUsd,
        capUsd,
        fallbackAmount,
        allowMarketAdjustments,
      };
      dynamicRequirementCaches.set(cacheKey, fallbackPayload);
      return fallbackPayload;
    });

    dynamicRequirementPromises.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  const buildDepositPayload = (depositRow) => {
    if (!depositRow) return null;
    const depositDate =
      typeof depositRow.deposit_date === "number"
        ? depositRow.deposit_date
        : Number(depositRow.deposit_date) || Date.now();
    const amount = Number(depositRow.deposit_amount) || 0;
    const daysSinceDeposit = Math.max(0, (Date.now() - depositDate) / MS_PER_DAY);
    const feePercentage = resolveFeePercentage(daysSinceDeposit);

    return {
      wallet: depositRow.wallet,
      amount,
      depositAmount: amount,
      status: depositRow.status,
      depositDate,
      withdrawDate: depositRow.withdraw_date || null,
      daysSinceDeposit,
      feePercentage,
      feePercentageDisplay: formatFeeDisplay(feePercentage),
      escrowWallet: escrowPublicKey ? escrowPublicKey.toBase58() : FALLBACK_ESCROW_WALLET,
      note: DEFAULT_DEPOSIT_NOTE,
      createdAt: depositRow.created_at || depositDate,
      txSignature: depositRow.tx_signature || null,
      grossAmount: depositRow.gross_amount || amount,
      blockTime: depositRow.block_time || null,
      withdrawSignature: depositRow.withdraw_signature || null,
      rawAmount: depositRow.raw_amount || null,
      pendingWithdrawIntent: Boolean(depositRow.withdraw_intent_at),
      withdrawIntentAt: depositRow.withdraw_intent_at || null,
      pendingWithdrawSignature: depositRow.pending_withdraw_signature || null,
      burnAmount: Number(depositRow.burn_amount || 0),
      minRequirement: Number(depositRow.min_requirement || depositRow.deposit_amount || amount),
      minRequirementUsd:
        typeof depositRow.min_requirement_usd === "number"
          ? Number(depositRow.min_requirement_usd)
          : null,
    };
  };

  const sendDepositStatusResponse = async (res, deposit, extra = {}, context = "deposit") => {
    const dynamicMin = await getDynamicRequirement({ context });
    const isActiveDeposit = deposit && deposit.status !== "withdrawn";
    const payloadDeposit = isActiveDeposit ? buildDepositPayload(deposit) : null;

    return res.json({
      ok: true,
      hasDeposit: Boolean(isActiveDeposit),
      deposit: payloadDeposit,
      escrowWallet: escrowPublicKey ? escrowPublicKey.toBase58() : FALLBACK_ESCROW_WALLET,
      mint: mintPublicKey ? mintPublicKey.toBase58() : LUNA_TOKEN_MINT || null,
      minDeposit: dynamicMin.amount,
      minDepositUsd: dynamicMin.usd,
      minDepositSource: dynamicMin.source,
      minDepositUpdatedAt: dynamicMin.updatedAt,
      priceUsd: dynamicMin.priceUsd,
      marketCap: dynamicMin.marketCap,
      volume24h: dynamicMin.volume24h,
      liquidityUsd: dynamicMin.liquidity,
      dynamicMin,
      mintDecimals: getCurrentMintDecimals(),
      note: DEFAULT_DEPOSIT_NOTE,
      burnRate: DEPOSIT_BURN_RATE,
      burnWallet: burnWalletPublicKey ? burnWalletPublicKey.toBase58() : null,
      ...extra,
    });
  };

  const isDepositSystemReady = () => Boolean(escrowPublicKey && mintPublicKey && escrowTokenAccount);

  const ensureSignatureFormat = (signature) => {
    try {
      bs58.decode(signature);
      return true;
    } catch {
      return false;
    }
  };

  const toProgramIdString = (programId) => {
    if (!programId) return null;
    if (typeof programId === "string") return programId;
    if (typeof programId.toBase58 === "function") return programId.toBase58();
    return null;
  };

  async function getMintDecimals() {
    if (cachedMintDecimals !== null) return cachedMintDecimals;
    if (!mintPublicKey) {
      cachedMintDecimals = 9;
      return cachedMintDecimals;
    }
    try {
      const info = await connection.getParsedAccountInfo(mintPublicKey);
      const decimals = info.value?.data?.parsed?.info?.decimals;
      cachedMintDecimals = typeof decimals === "number" ? decimals : 9;
    } catch (error) {
      log.error("[deposit] Failed to fetch mint decimals:", error);
      cachedMintDecimals = 9;
    }
    return cachedMintDecimals;
  }

  function uiAmountToRawBigInt(amountUi, decimals) {
    if (!Number.isFinite(amountUi) || amountUi <= 0) {
      return 0n;
    }
    const multiplier = Math.pow(10, decimals);
    return BigInt(Math.round(amountUi * multiplier));
  }

  async function sendBurnTransfer(burnAmountUi) {
    if (!burnWalletPublicKey) {
      throw new Error("Burn wallet is not configured. Please set DEPOSIT_BURN_WALLET.");
    }
    if (!escrowKeypair) {
      throw new Error("Escrow private key is required to burn fees.");
    }
    if (!mintPublicKey || !escrowTokenAccount) {
      throw new Error("Mint or escrow token account not configured for burn.");
    }
    if (!Number.isFinite(burnAmountUi) || burnAmountUi <= 0) {
      return null;
    }

    const decimals = await getMintDecimals();
    const rawAmount = uiAmountToRawBigInt(burnAmountUi, decimals);
    if (rawAmount <= 0n) {
      return null;
    }
    if (rawAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Burn amount exceeds supported range.");
    }

    const destinationAta = burnTokenAccount
      ? burnTokenAccount
      : getAssociatedTokenAddressSync(mintPublicKey, burnWalletPublicKey, false);
    const instructions = [];
    const destinationInfo = await connection.getAccountInfo(destinationAta);
    if (!destinationInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          escrowPublicKey,
          destinationAta,
          burnWalletPublicKey,
          mintPublicKey
        )
      );
    }
    instructions.push(
      createTransferInstruction(
        escrowTokenAccount,
        destinationAta,
        escrowPublicKey,
        Number(rawAmount)
      )
    );

    const tx = new Transaction();
    tx.feePayer = escrowPublicKey;
    instructions.forEach((ix) => tx.add(ix));
    const signature = await sendAndConfirmTransaction(connection, tx, [escrowKeypair], {
      commitment: "confirmed",
    });
    log.info(
      `[deposit] Burned ${burnAmountUi.toFixed(4)} Luna fee (tx: ${signature.substring(0, 8)}...)`
    );
    return signature;
  }

  async function verifyOnchainDeposit(signature, wallet, requiredMinAmount = null) {
    await resolveTokenProgramAndAtas();
    if (!isDepositSystemReady()) {
      throw new Error("Deposit system is not fully configured. Please contact an administrator.");
    }

    const parsedTx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!parsedTx) {
      throw new Error("Transaction not found or not confirmed yet. Please try again in a few seconds.");
    }

    if (parsedTx.meta?.err) {
      throw new Error("Transaction failed on the Solana blockchain. Please try again with a successful transaction.");
    }

    const instructions = parsedTx.transaction?.message?.instructions || [];
    const escrowAtaBase58 = escrowTokenAccount.toBase58();
    const mintBase58 = mintPublicKey.toBase58();
    const userAtaBase58 = getAssociatedTokenAddressSync(mintPublicKey, new PublicKey(wallet), false, tokenProgramId).toBase58();

    // Try to find transfer instruction in parsed format first
    let transferInstruction = instructions.find((ix) => {
      if (!ix.parsed) return false;
      if (!isTokenProgram(ix.programId)) return false;
      const type = ix.parsed?.type;
      if (type !== "transfer" && type !== "transferChecked") return false;
      const info = ix.parsed?.info || {};
      const destination = info.destination || info.dest;
      const authority = info.authority || info.owner || info.sourceOwner;
      const mint = info.mint || info.tokenMint;
      return (
        destination === escrowAtaBase58 &&
        authority === wallet &&
        (!mint || mint === mintBase58)
      );
    });

    // If not found in parsed format, try to find in raw format
    if (!transferInstruction) {
      const rawTx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      
      if (rawTx && rawTx.transaction && rawTx.transaction.message) {
        const rawInstructions = rawTx.transaction.message.instructions || [];
        const escrowAtaPubkey = escrowTokenAccount;
        const userAtaPubkey = new PublicKey(userAtaBase58);
        const walletPubkey = new PublicKey(wallet);
        
        for (const ix of rawInstructions) {
          if (!isTokenProgram(ix.programId)) continue;
          
          // Check if this is a transfer instruction (instruction discriminator = 3)
          if (ix.data && ix.data.length >= 9 && ix.data[0] === 3) {
            // Check account keys match
            const accounts = ix.accountKeys || rawTx.transaction.message.accountKeys || [];
            const accountIndices = ix.accounts || [];
            
            // Find source and destination accounts
            let sourceIdx = -1;
            let destIdx = -1;
            let authorityIdx = -1;
            
            for (let i = 0; i < accountIndices.length; i++) {
              const accountKey = accounts[accountIndices[i]];
              if (accountKey && accountKey.equals(userAtaPubkey)) {
                sourceIdx = i;
              }
              if (accountKey && accountKey.equals(escrowAtaPubkey)) {
                destIdx = i;
              }
              if (accountKey && accountKey.equals(walletPubkey)) {
                authorityIdx = i;
              }
            }
            
            // Transfer instruction should have: source (writable), dest (writable), authority (signer)
            if (sourceIdx >= 0 && destIdx >= 0 && authorityIdx >= 0) {
              transferInstruction = {
                parsed: {
                  type: "transfer",
                  info: {
                    source: userAtaBase58,
                    destination: escrowAtaBase58,
                    authority: wallet,
                    amount: ix.data.slice(1, 9).toString(),
                  },
                },
              };
              break;
            }
          }
        }
      }
    }

    if (!transferInstruction) {
      throw new Error("No Luna transfer to the escrow wallet was found in this transaction.");
    }

    const info = transferInstruction.parsed.info || {};
    const tokenAmountInfo = info.tokenAmount || {};
    const decimals = tokenAmountInfo.decimals ?? info.decimals ?? (await getMintDecimals());
    const rawAmountStr = tokenAmountInfo.amount || info.amount;

    if (!rawAmountStr) {
      throw new Error("Unable to read the transferred amount from the transaction.");
    }

    const rawAmount = BigInt(rawAmountStr);
    const divisor = Math.pow(10, decimals);
    const uiAmount =
      tokenAmountInfo.uiAmount !== undefined
        ? Number(tokenAmountInfo.uiAmount)
        : Number(rawAmount) / divisor;

    if (!Number.isFinite(uiAmount) || uiAmount <= 0) {
      throw new Error("Transfer amount is invalid.");
    }

    const blockTimeMs = parsedTx.blockTime ? parsedTx.blockTime * 1000 : Date.now();

    let burnAmountUi = 0;
    let burnRawAmount = 0n;
    if (burnTokenAccount) {
      const burnIx = instructions.find((ix) => {
        if (!ix.parsed) return false;
        if (!isTokenProgram(ix.programId)) return false;
        const type = ix.parsed?.type;
        if (type !== "transfer" && type !== "transferChecked") return false;
        const info = ix.parsed?.info || {};
        const destination = info.destination || info.dest;
        const authority = info.authority || info.owner || info.sourceOwner;
        return destination === burnTokenAccount.toBase58() && authority === wallet;
      });

      if (burnIx && burnIx.parsed) {
        const info = burnIx.parsed.info || {};
        const tokenAmountInfo = info.tokenAmount || {};
        const burnDecimals = tokenAmountInfo.decimals ?? info.decimals ?? (await getMintDecimals());
        const burnRawStr = tokenAmountInfo.amount || info.amount;
        if (burnRawStr) {
          burnRawAmount = BigInt(burnRawStr);
          const uiAmountValue =
            tokenAmountInfo.uiAmount !== undefined
              ? Number(tokenAmountInfo.uiAmount)
              : info.uiAmount !== undefined
                ? Number(info.uiAmount)
                : Number(burnRawAmount) / Math.pow(10, burnDecimals);
          burnAmountUi = uiAmountValue;
        }
      }
    }

    if (burnAmountUi <= 0) {
      const burnIx = instructions.find((ix) => {
        if (!ix.parsed) return false;
        if (!isTokenProgram(ix.programId)) return false;
        const type = ix.parsed?.type;
        if (type !== "burn" && type !== "burnChecked") return false;
        const info = ix.parsed?.info || {};
        const account = info.account || info.source || info.tokenAccount;
        const authority = info.authority || info.owner;
        const mint = info.mint || info.tokenMint;
        return (
          account === userAtaBase58 &&
          authority === wallet &&
          (!mint || mint === mintBase58)
        );
      });

      if (burnIx && burnIx.parsed) {
        const info = burnIx.parsed.info || {};
        const tokenAmountInfo = info.tokenAmount || {};
        const burnDecimals = tokenAmountInfo.decimals ?? info.decimals ?? (await getMintDecimals());
        const burnRawStr = tokenAmountInfo.amount || info.amount;
        if (burnRawStr) {
          burnRawAmount = BigInt(burnRawStr);
          burnAmountUi =
            tokenAmountInfo.uiAmount !== undefined
              ? Number(tokenAmountInfo.uiAmount)
              : Number(burnRawAmount) / Math.pow(10, burnDecimals);
        }
      }
    }

    const grossRawAmount = burnRawAmount > 0n ? rawAmount + burnRawAmount : rawAmount;
    const grossAmountUi = burnAmountUi > 0 ? uiAmount + burnAmountUi : uiAmount;

    const minRequirementAmount = Number(requiredMinAmount) || MIN_DEPOSIT;
    const amountForMinCheck = burnAmountUi > 0 ? grossAmountUi : uiAmount;
    if (amountForMinCheck < minRequirementAmount) {
      throw new Error(
        `Minimum deposit is ${formatNumber(minRequirementAmount)} Luna. Transaction sent ${formatNumber(
          amountForMinCheck
        )} Luna.`
      );
    }

    return {
      uiAmount,
      rawAmount: rawAmount.toString(),
      burnAmountUi,
      burnRawAmount: burnRawAmount > 0n ? burnRawAmount.toString() : null,
      grossAmountUi,
      grossRawAmount: grossRawAmount.toString(),
      blockTime: blockTimeMs,
      slot: parsedTx.slot,
    };
  }

  async function getDepositRawAmount(deposit) {
    if (!deposit) return null;
    if (deposit.raw_amount) {
      try {
        const raw = BigInt(deposit.raw_amount);
        if (raw > 0n) {
          return raw;
        }
      } catch (error) {
        log.warn("[deposit] Invalid raw_amount stored for deposit:", error);
      }
    }

    const decimals = await getMintDecimals();
    const multiplier = BigInt(Math.pow(10, decimals));
    const baseAmount = Number(deposit.deposit_amount || deposit.gross_amount || 0);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return multiplier;
    }
    const calculated = BigInt(Math.round(baseAmount * Math.pow(10, decimals)));
    return calculated > 0n ? calculated : multiplier;
  }

  async function fetchLatestBlockhash(commitment = "finalized") {
    try {
      return await connection.getLatestBlockhash(commitment);
    } catch (error) {
      if (commitment !== "processed") {
        log.warn(
          `[deposit] getLatestBlockhash(${commitment}) failed: ${error.message}. Falling back to processed.`
        );
        return fetchLatestBlockhash("processed");
      }
      throw error;
    }
  }

  async function buildClientWithdrawTransaction(wallet) {
    if (!isDepositSystemReady()) {
      throw new Error("Deposit system is not configured. Please contact administrator.");
    }

    await resolveTokenProgramAndAtas();

    if (!escrowKeypair) {
      throw new Error("Escrow private key is not configured. Withdrawal is unavailable.");
    }

    let deposit = await getActiveDeposit(wallet);
    if (!deposit) {
      // Fallback: include withdrawn/pending records for recovery
      deposit = await getDepositForStatus(wallet);
      if (!deposit) {
        throw new Error("No active deposit found for this wallet");
      }
    }

    const userPubkey = new PublicKey(wallet);
    const userTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, userPubkey, false, tokenProgramId);
    const userAtaInfo = await connection.getAccountInfo(userTokenAccount);

    const rawAmount = await getDepositRawAmount(deposit);
    if (!rawAmount || rawAmount <= 0n) {
      throw new Error("Deposit record is missing amount information.");
    }
    if (rawAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Withdrawal amount exceeds supported range.");
    }

    const { blockhash, lastValidBlockHeight } = await fetchLatestBlockhash();

    if (!blockhash) {
      throw new Error("Failed to fetch recent blockhash. Please try again.");
    }

    const transaction = new Transaction({
      feePayer: userPubkey,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
    });

    // Some @solana/web3.js versions ignore constructor props, so set explicitly
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    if (!userAtaInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          userPubkey,
          userTokenAccount,
          userPubkey,
          mintPublicKey,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    transaction.add(
      createTransferInstruction(
        escrowTokenAccount,
        userTokenAccount,
        escrowPublicKey,
        Number(rawAmount),
        [],
        tokenProgramId
      )
    );

    transaction.partialSign(escrowKeypair);

    const serialized = transaction.serialize({ requireAllSignatures: false }).toString("base64");

    return {
      transaction: serialized,
      blockhash,
      lastValidBlockHeight,
      amount: deposit.deposit_amount,
      rawAmount: rawAmount.toString(),
      needsAtaCreation: !userAtaInfo,
    };
  }

  async function verifyWithdrawTransactionSignature(signature, wallet) {
    if (!isDepositSystemReady()) {
      throw new Error("Deposit system is not configured. Please contact administrator.");
    }

    await resolveTokenProgramAndAtas();

    const parsedTx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!parsedTx) {
      throw new Error("Transaction not found or not confirmed yet. Please try again in a few seconds.");
    }

    if (parsedTx.meta?.err) {
      throw new Error("Transaction failed on the Solana blockchain. Please submit a successful transaction.");
    }

    const instructions = parsedTx.transaction?.message?.instructions || [];
    const escrowAtaBase58 = escrowTokenAccount.toBase58();
    const userTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      new PublicKey(wallet),
      false,
      tokenProgramId
    ).toBase58();

    const transferInstruction = instructions.find((ix) => {
      if (!ix.parsed) return false;
      if (!isTokenProgram(ix.programId)) return false;
      const type = ix.parsed?.type;
      if (type !== "transfer" && type !== "transferChecked") return false;
      const info = ix.parsed?.info || {};
      const destination = info.destination || info.dest;
      const source = info.source || info.src;
      const authority = info.authority || info.owner;
      return (
        destination === userTokenAccount &&
        source === escrowAtaBase58 &&
        authority === escrowPublicKey.toBase58()
      );
    });

    if (!transferInstruction) {
      throw new Error("Withdrawal transaction does not transfer funds from escrow to your wallet.");
    }

    const info = transferInstruction.parsed.info || {};
    const tokenAmountInfo = info.tokenAmount || {};
    const rawAmountStr = tokenAmountInfo.amount || info.amount;
    if (!rawAmountStr) {
      throw new Error("Unable to determine withdrawal amount from transaction.");
    }

    const rawAmount = BigInt(rawAmountStr);
    if (rawAmount <= 0n) {
      throw new Error("Withdrawal amount is invalid.");
    }

    const blockTimeMs = parsedTx.blockTime ? parsedTx.blockTime * 1000 : Date.now();

    return {
      rawAmount,
      blockTime: blockTimeMs,
    };
  }

  /**
   * GET /luna/deposit/token-program
   * Returns the token program ID for the configured mint (Token or Token-2022)
   */
  app.get("/luna/deposit/token-program", async (req, res) => {
    try {
      if (!mintPublicKey) {
        return res.status(503).json({
          ok: false,
          error: "Mint not configured",
        });
      }

      try {
        const mintInfo = await connection.getAccountInfo(mintPublicKey);
        if (!mintInfo) {
          return res.status(404).json({
            ok: false,
            error: "Mint account not found",
          });
        }

        const mintOwner = toProgramIdString(mintInfo.owner);
        const TOKEN_2022_PROGRAM_ID_STR = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
        const isToken2022 = mintOwner === TOKEN_2022_PROGRAM_ID_STR;

        return res.json({
          ok: true,
          tokenProgramId: isToken2022 ? TOKEN_2022_PROGRAM_ID_STR : TOKEN_PROGRAM_ID_STR,
          programName: isToken2022 ? "Token-2022" : "Token",
          mint: mintPublicKey.toBase58(),
        });
      } catch (error) {
        log.error("[deposit] Error detecting token program:", error);
        // Fallback to Token Program
        return res.json({
          ok: true,
          tokenProgramId: TOKEN_PROGRAM_ID_STR,
          programName: "Token",
          mint: mintPublicKey.toBase58(),
        });
      }
    } catch (error) {
      log.error("[deposit] Error in /luna/deposit/token-program:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to get token program",
        message: error.message,
      });
    }
  });

  /**
   * GET /luna/deposit/status
   */
  app.get("/luna/deposit/status", async (req, res) => {
    try {
      const wallet = req.query.wallet;

      if (!wallet) {
        return sendDepositStatusResponse(res, null, { message: "No wallet provided" });
      }

      if (!isValidWalletAddress(wallet)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid wallet address",
        });
      }

      const rawContext = (req.query.context || "deposit").toString().toLowerCase();
      const contextKey = rawContext || "deposit";
      const deposit = await getDepositForStatus(wallet);
      return sendDepositStatusResponse(res, deposit, {}, contextKey);
    } catch (error) {
      log.error("[deposit] Error getting deposit status:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to get deposit status",
        message: error.message,
      });
    }
  });

  /**
   * GET /luna/dynamic-requirement
   * Query params:
   *  - context: deposit | vs-luna | play-pvp | group-chat | ...
   *  - force: true/false (optional) to bypass cache
   */
  app.get("/luna/dynamic-requirement", async (req, res) => {
    try {
      const rawContext = (req.query.context || "deposit").toString().toLowerCase();
      const force = req.query.force === "true" || req.query.force === "1";

      const overrides = {};
      const maybeNumber = (val) => {
        const num = Number(val);
        return Number.isFinite(num) ? num : undefined;
      };

      const baseOverride = maybeNumber(req.query.baseUsd);
      const floorOverride = maybeNumber(req.query.floorUsd);
      const capOverride = maybeNumber(req.query.capUsd);
      const fallbackOverride = maybeNumber(req.query.fallbackAmount);
      const cacheOverride = maybeNumber(req.query.cacheMs);
      const allowAdjustOverride =
        typeof req.query.allowMarketAdjustments !== "undefined"
          ? req.query.allowMarketAdjustments === "true"
          : undefined;

      if (typeof baseOverride === "number") overrides.baseUsd = baseOverride;
      if (typeof floorOverride === "number") overrides.floorUsd = floorOverride;
      if (typeof capOverride === "number") overrides.capUsd = capOverride;
      if (typeof fallbackOverride === "number") overrides.fallbackAmount = fallbackOverride;
      if (typeof cacheOverride === "number") overrides.cacheMs = cacheOverride;
      if (typeof allowAdjustOverride === "boolean") {
        overrides.allowMarketAdjustments = allowAdjustOverride;
      }

      const requirement = await getDynamicRequirement({
        context: rawContext,
        force,
        ...overrides,
      });

      return res.json({
        ok: true,
        context: requirement.context || rawContext,
        requirement,
      });
    } catch (error) {
      log.error("[deposit] Dynamic requirement endpoint error:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to get dynamic requirement",
        message: error.message,
      });
    }
  });

  /**
   * GET /luna/deposit/blockhash
   * Provides latest blockhash/lastValidBlockHeight for client transactions
   */
  app.get("/luna/deposit/blockhash", async (req, res) => {
    try {
      const { blockhash, lastValidBlockHeight } = await fetchLatestBlockhash();
      return res.json({
        ok: true,
        blockhash,
        lastValidBlockHeight,
      });
    } catch (error) {
      log.error("[deposit] Failed to fetch blockhash:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to fetch recent blockhash",
        message: error.message,
      });
    }
  });

  /**
   * POST /luna/deposit/withdraw/init
   * Prepare a partially signed withdrawal transaction (user pays fees)
   */
  app.post("/luna/deposit/withdraw/init", async (req, res) => {
    try {
      const { wallet } = req.body || {};

      if (!wallet) {
        return res.status(400).json({
          ok: false,
          error: "Wallet is required",
        });
      }

      if (!isValidWalletAddress(wallet)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid wallet address",
        });
      }

      if (!isDepositSystemReady()) {
        return res.status(503).json({
          ok: false,
          error: "Deposit system is not configured. Please contact administrator.",
        });
      }

      if (!escrowKeypair) {
        return res.status(503).json({
          ok: false,
          error: "Escrow wallet is not configured for withdrawals.",
        });
      }

      return await withWalletLock(wallet, async () => {
      const payload = await buildClientWithdrawTransaction(wallet);
      await setWithdrawIntent(wallet, Date.now());
      return res.json({
        ok: true,
        transaction: payload.transaction,
        blockhash: payload.blockhash,
        lastValidBlockHeight: payload.lastValidBlockHeight,
        amount: payload.amount,
        rawAmount: payload.rawAmount,
        needsAtaCreation: payload.needsAtaCreation,
        message: payload.needsAtaCreation
          ? "Phantom may ask to create a token account before completing the withdrawal."
          : "Sign the transaction in Phantom to complete withdrawal.",
        });
      });
    } catch (error) {
      log.error("[deposit] Failed to prepare withdrawal transaction:", error);
      return res.status(400).json({
        ok: false,
        error: error.message || "Failed to prepare withdrawal transaction",
      });
    }
  });

  /**
   * POST /luna/deposit/init
   * Body: { wallet, amount }
   */
  app.post("/luna/deposit/init", async (req, res) => {
    try {
      const { wallet, amount } = req.body || {};
      const ipKey = req.ip || req.connection?.remoteAddress || "unknown";
      const rateKey = `${wallet || "unknown"}|${ipKey}`;
      const rl = checkRateLimit(rateKey);
      if (!rl.ok) {
        return res.status(429).json({
          ok: false,
          error: "Too many requests. Please wait a moment before trying again.",
          retryAfterMs: rl.retryAfterMs,
        });
      }

      if (!wallet || !amount) {
        return res.status(400).json({
          ok: false,
          error: "Wallet and amount are required",
        });
      }

      if (!isValidWalletAddress(wallet)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid wallet address",
        });
      }

      if (!isDepositSystemReady()) {
        return res.status(503).json({
          ok: false,
          error: "Deposit system is not configured. Please contact administrator.",
        });
      }

      await resolveTokenProgramAndAtas();

      return await withWalletLock(wallet, async () => {
      const dynamicMin = await getDynamicRequirement({ context: "deposit" });
      const minDepositAmount = Number(dynamicMin.amount) || MIN_DEPOSIT;
      const requestedAmount = Number(amount);
      if (!Number.isFinite(requestedAmount) || requestedAmount < minDepositAmount) {
        return res.status(400).json({
          ok: false,
          error: `Minimum deposit amount is ${formatNumber(minDepositAmount)} Luna.`,
        });
      }

      const existingDeposit = await getActiveDeposit(wallet);
      if (existingDeposit) {
        return res.status(400).json({
          ok: false,
          error: "You already have an active deposit. Please withdraw first.",
        });
      }

      const decimals = await getMintDecimals();

        const escrowAtaInfo = escrowTokenAccount ? await connection.getAccountInfo(escrowTokenAccount) : null;
        const burnAtaInfo = burnTokenAccount ? await connection.getAccountInfo(burnTokenAccount) : null;

      return res.json({
        ok: true,
        escrowWallet: escrowPublicKey.toBase58(),
        escrowTokenAccount: escrowTokenAccount ? escrowTokenAccount.toBase58() : null,
        mint: mintPublicKey?.toBase58() || null,
        minDeposit: minDepositAmount,
        minDepositUsd: dynamicMin.usd,
        minDepositSource: dynamicMin.source,
        minDepositUpdatedAt: dynamicMin.updatedAt,
        priceUsd: dynamicMin.priceUsd,
        dynamicMin,
        mintDecimals: decimals,
        note: DEFAULT_DEPOSIT_NOTE,
        burnRate: DEPOSIT_BURN_RATE,
        burnWallet: burnWalletPublicKey ? burnWalletPublicKey.toBase58() : null,
          needsEscrowAta: !escrowAtaInfo,
          needsBurnAta: burnTokenAccount ? !burnAtaInfo : false,
          tokenProgramId: tokenProgramId?.toBase58?.() || TOKEN_PROGRAM_ID_STR,
        });
      });
    } catch (error) {
      log.error("[deposit] Error initializing deposit:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to initialize deposit",
        message: error.message,
      });
    }
  });

  /**
   * POST /luna/deposit/verify
   * Body: { wallet, signature }
   */
  app.post("/luna/deposit/verify", async (req, res) => {
    try {
      const { wallet, signature } = req.body || {};
      const ipKey = req.ip || req.connection?.remoteAddress || "unknown";
      const rateKey = `${wallet || "unknown"}|${ipKey}`;
      const rl = checkRateLimit(rateKey);
      if (!rl.ok) {
        return res.status(429).json({
          ok: false,
          error: "Too many requests. Please wait a moment before trying again.",
          retryAfterMs: rl.retryAfterMs,
        });
      }

      if (!wallet || !signature) {
        return res.status(400).json({
          ok: false,
          error: "Wallet and signature are required",
        });
      }

      if (!isValidWalletAddress(wallet)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid wallet address",
        });
      }

      if (!ensureSignatureFormat(signature)) {
        return res.status(400).json({
          ok: false,
          error: "Signature must be base58 encoded.",
        });
      }

      if (!isDepositSystemReady()) {
        return res.status(503).json({
          ok: false,
          error: "Deposit system is not configured. Please contact administrator.",
        });
      }

      const existingDeposit = await getActiveDeposit(wallet);
      if (existingDeposit) {
        return res.status(400).json({
          ok: false,
          error: "You already have an active deposit. Please withdraw first.",
        });
      }

      const signatureRecord = await getDepositBySignature(signature);
      if (signatureRecord) {
        return res.status(400).json({
          ok: false,
          error: "This transaction has already been linked to a deposit.",
        });
      }

      return await withWalletLock(wallet, async () => {
      const dynamicMin = await getDynamicRequirement({ context: "deposit" });
      const minRequirementAmount = Number(dynamicMin.amount) || MIN_DEPOSIT;
      const verification = await verifyOnchainDeposit(signature, wallet, minRequirementAmount);
      const decimals = await getMintDecimals();
      const burnAmountFromTx = typeof verification.burnAmountUi === "number" ? verification.burnAmountUi : 0;
      const netAmount = Number(verification.uiAmount.toFixed(6));
      let burnAmount = burnAmountFromTx;

      if (burnAmount <= 0 && burnWalletPublicKey && DEPOSIT_BURN_RATE > 0) {
        const inferredGross = netAmount / (1 - DEPOSIT_BURN_RATE);
        burnAmount = Number((inferredGross - netAmount).toFixed(6));
        if (burnAmount > 0) {
          await sendBurnTransfer(burnAmount);
        }
      }

      const grossAmount = Number((netAmount + (burnAmount > 0 ? burnAmount : 0)).toFixed(6));

      await saveLunaDeposit({
        wallet,
        depositAmount: netAmount,
        depositDate: verification.blockTime,
        txSignature: signature,
        grossAmount,
        blockTime: verification.blockTime,
        rawAmount: verification.rawAmount,
        burnAmount: burnAmount > 0 ? burnAmount : 0,
        minRequirement: minRequirementAmount,
        minRequirementUsd: dynamicMin.usd ?? null,
      });

      const depositRecord = await getDepositBySignature(signature);

      log.info(
        `[deposit] Verified deposit ${signature.substring(0, 8)}... for wallet ${wallet.substring(0, 8)}... amount ${formatNumber(
          verification.uiAmount
        )} Luna`
      );

      return res.json({
        ok: true,
        deposit: buildDepositPayload(depositRecord),
        });
      });
    } catch (error) {
      log.error("[deposit] Error verifying deposit:", error);
      return res.status(400).json({
        ok: false,
        error: error.message || "Failed to verify deposit",
      });
    }
  });

  /**
   * POST /luna/deposit/reset
   * (Testing utility) Clear all active deposits
   */
  app.post("/luna/deposit/reset", async (_req, res) => {
    try {
      await clearAllDeposits();
      log.warn("[deposit] All deposit records cleared via /luna/deposit/reset");
      return res.json({
        ok: true,
        message: "All deposits cleared",
      });
    } catch (error) {
      log.error("[deposit] Failed to clear deposits:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to clear deposits",
        message: error.message,
      });
    }
  });

  /**
   * Withdraw deposit (send Luna back to user)
   */
  const handleWithdrawRequest = async (req, res) => {
    try {
      const { wallet, signature } = req.body || {};

      if (!wallet) {
        return res.status(400).json({
          ok: false,
          error: "Wallet is required",
        });
      }

      if (!isValidWalletAddress(wallet)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid wallet address",
        });
      }

      if (!signature) {
        return res.status(400).json({
          ok: false,
          error: "Signature is required to confirm withdrawal. Please sign and send the transaction first.",
        });
      }

      if (!ensureSignatureFormat(signature)) {
        return res.status(400).json({
          ok: false,
          error: "Signature must be base58 encoded.",
        });
      }

      if (!isDepositSystemReady()) {
        return res.status(503).json({
          ok: false,
          error: "Deposit system is not configured. Please contact administrator.",
        });
      }

      if (!escrowKeypair) {
        return res.status(503).json({
          ok: false,
          error: "Escrow wallet is not configured for withdrawals.",
        });
      }

      return await withWalletLock(wallet, async () => {
      const deposit = await getActiveDeposit(wallet);
      if (!deposit) {
        return res.status(404).json({
          ok: false,
          error: "No active deposit found for this wallet",
        });
      }

      const verification = await verifyWithdrawTransactionSignature(signature, wallet);
      const expectedRawAmount = await getDepositRawAmount(deposit);

      if (expectedRawAmount && verification.rawAmount < expectedRawAmount) {
        return res.status(400).json({
          ok: false,
          error: "Withdrawal transaction sent less than the deposited amount.",
        });
      }

      const withdrawDate = verification.blockTime || Date.now();
      await withdrawDeposit(wallet, withdrawDate, signature);
      await clearWithdrawIntent(wallet);

      log.info(
        `[deposit] Withdrawal confirmed for ${wallet.substring(0, 8)}... (tx: ${signature.substring(0, 8)}...)`
      );

      return res.json({
        ok: true,
        message: "Deposit withdrawal completed",
        deposit: {
          wallet,
          depositAmount: deposit.deposit_amount,
          withdrawDate,
          status: "withdrawn",
        },
        withdrawal: {
          amount: deposit.deposit_amount,
          signature,
        },
        });
      });
    } catch (error) {
      log.error("[deposit] Error processing withdrawal:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Failed to confirm withdrawal",
      });
    }
  };

  app.post("/luna/deposit/withdraw", handleWithdrawRequest);
  app.post("/luna/withdraw", handleWithdrawRequest);

  app.get("/luna/deposit/burn-stats", async (_req, res) => {
    try {
      const totalBurned = await getTotalBurnedLuna();
      return res.json({
        ok: true,
        totalBurned,
        burnRate: DEPOSIT_BURN_RATE,
        formattedTotal: formatNumber(totalBurned),
        burnWallet: burnWalletPublicKey ? burnWalletPublicKey.toBase58() : null,
      });
    } catch (error) {
      log.error("[deposit] Failed to fetch burn stats:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to fetch burn stats",
      });
    }
  });

  app.get("/healthz", async (_req, res) => {
    try {
      const status = await healthCheck();
      const httpCode = status.ok ? 200 : 503;
      return res.status(httpCode).json({
        ok: status.ok,
        db: status.db,
        rpc: status.rpc,
        ts: status.ts,
        durationMs: status.durationMs,
      });
    } catch (error) {
      log.error("[health] Failed to run health check:", error);
      return res.status(503).json({ ok: false, error: "Health check failed" });
    }
  });

  app.get("/luna/deposit/queue-metrics", async (_req, res) => {
    try {
      const metrics = await getQueueMetrics();
      return res.json({ ok: true, metrics });
    } catch (error) {
      log.error("[deposit] Failed to fetch queue metrics:", error);
      return res.status(500).json({ ok: false, error: "Failed to fetch queue metrics" });
    }
  });

  const WITHDRAW_MONITOR_INTERVAL_MS = Number(process.env.WITHDRAW_MONITOR_INTERVAL_MS || 20000);
  const QUEUE_MONITOR_INTERVAL_MS = Number(process.env.QUEUE_MONITOR_INTERVAL_MS || 60000);
  let withdrawMonitorHandle = null;
  let withdrawMonitorRunning = false;
  let queueMonitorHandle = null;
  let queueMonitorRunning = false;

  async function emitQueueMetrics(trigger = "timer") {
    if (queueMonitorRunning) return;
    queueMonitorRunning = true;
    try {
      const metrics = await getQueueMetrics();
      log.info(
        `[queue] ${trigger} total=${metrics.totalDeposits} active=${metrics.activeDeposits} pendingWithdraw=${metrics.pendingWithdrawals} withdrawn=${metrics.withdrawnDeposits}`
      );
    } catch (error) {
      log.debug("[deposit] Queue monitor check failed:", error.message || error);
    } finally {
      queueMonitorRunning = false;
    }
  }

  function startQueueMonitor() {
    if (queueMonitorHandle) return;
    queueMonitorHandle = setInterval(() => emitQueueMetrics("timer"), QUEUE_MONITOR_INTERVAL_MS);
    emitQueueMetrics("startup").catch((error) => {
      log.debug("[deposit] Queue monitor initial run failed:", error.message || error);
    });
  }

  async function processPendingWithdrawals() {
    if (withdrawMonitorRunning) return;
    if (!isDepositSystemReady()) return;

    withdrawMonitorRunning = true;
    try {
      const pending = await getPendingWithdrawals(Number(process.env.WITHDRAW_MONITOR_FETCH_LIMIT || 20));
      if (!pending.length) return;

      for (const depositRow of pending) {
        try {
          const wallet = depositRow.wallet;
          const intentAt = Number(depositRow.withdraw_intent_at || 0);
          if (!wallet || !intentAt) continue;

          const userPubkey = new PublicKey(wallet);
          const userTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, userPubkey, false);

          let signatures = [];
          try {
            signatures = await connection.getSignaturesForAddress(userTokenAccount, {
              limit: Number(process.env.WITHDRAW_MONITOR_SIGNATURE_LIMIT || 10),
            });
          } catch (error) {
            log.debug(
              `[deposit] Withdraw monitor: failed to fetch signatures for ${wallet.substring(0, 8)}...`,
              error.message
            );
            continue;
          }

          const threshold = intentAt ? Math.floor(intentAt / 1000) - 60 : null;

          for (const sigInfo of signatures) {
            if (!sigInfo || !sigInfo.signature) continue;
            if (threshold && sigInfo.blockTime && sigInfo.blockTime < threshold) {
              continue;
            }

            try {
              const verification = await verifyWithdrawTransactionSignature(sigInfo.signature, wallet);
              const expectedRaw = await getDepositRawAmount(depositRow);
              if (expectedRaw && verification.rawAmount < expectedRaw) {
                continue;
              }

              await withdrawDeposit(wallet, verification.blockTime, sigInfo.signature);
              await clearWithdrawIntent(wallet);
              log.info(
                `[deposit] Auto-withdraw finalized for ${wallet.substring(0, 8)}... via worker (tx: ${sigInfo.signature.substring(
                  0,
                  8
                )}...)`
              );
              break;
            } catch (verifyError) {
              const message = verifyError?.message || "";
              if (
                message.includes("Withdrawal transaction does not transfer") ||
                message.includes("Transaction failed on the Solana blockchain") ||
                message.includes("Transaction not found")
              ) {
                continue;
              }
              log.debug(
                `[deposit] Withdraw monitor verification skip for ${wallet.substring(0, 8)}...: ${message}`
              );
            }
          }
        } catch (error) {
          log.warn("[deposit] Withdraw monitor iteration error:", error);
        }
      }
    } finally {
      withdrawMonitorRunning = false;
    }
  }

  function startWithdrawMonitor() {
    if (withdrawMonitorHandle) return;
    withdrawMonitorHandle = setInterval(processPendingWithdrawals, WITHDRAW_MONITOR_INTERVAL_MS);
    processPendingWithdrawals().catch((error) => {
      log.error("[deposit] Initial withdraw monitor run failed:", error);
    });
  }

  startWithdrawMonitor();
  startQueueMonitor();
}

