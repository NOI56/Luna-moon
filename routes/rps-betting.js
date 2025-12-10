// routes/rps-betting.js
// RPS Betting Routes

import { log } from "../modules/logger.js";
import { saveMatchHistory } from "../modules/db.js";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";

const TOKEN_PROGRAM_ID_STR = TOKEN_PROGRAM_ID.toBase58();

/**
 * Setup RPS Betting routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupRpsBettingRoutes(app, dependencies) {
  const {
    rpsBettingRooms,
    rpsLeaderboard,
    collectedFees,
    walletIpMap,
    broadcast,
    sendNotification,
    validateWalletAddress,
    getClientIp,
    checkIpRateLimit,
    updateIpActivity,
    validateGameRequest,
    recordWalletPairMatch,
    fetchLunaPriceInSol,
    lunaToSol,
    calculateFee,
    collectFee,
    saveLeaderboardEntry,
    generateTTSClip,
    RPS_BETTING_ROOM_TIMEOUT,
    LUNA_TOKEN_MINT,
    SOL_MINT,
    PRICE_CACHE_TTL,
    priceCache,
    BETTING_ESCROW_WALLET,
    BETTING_ESCROW_PRIVATE_KEY,
    SOLANA_RPC_URL,
    FEE_PERCENTAGE,
    BETTING_FEE_DEFAULT,
    BETTING_FEE_3_DAYS,
    BETTING_FEE_6_DAYS,
  } = dependencies;

  // Specific cooldown for betting games to avoid long lockouts between rooms
  const BETTING_GAME_COOLDOWN_MS = 5 * 1000; // 5 seconds
  const MAX_BET_AMOUNT = 1000000000; // 1 billion Luna
  const feeWalletAddressRaw = process.env.BETTING_FEE_WALLET || null;
  const feeWalletAddress =
    typeof feeWalletAddressRaw === "string" ? feeWalletAddressRaw.trim() : feeWalletAddressRaw;
  let feeWalletPublicKey = null;
  if (feeWalletAddress && feeWalletAddress !== "your_fee_wallet_address_here") {
    try {
      feeWalletPublicKey = new PublicKey(feeWalletAddress);
    } catch (error) {
      log.error("[rps-betting] Invalid BETTING_FEE_WALLET address:", error.message);
    }
  } else {
    log.warn("[rps-betting] BETTING_FEE_WALLET not configured; fee transactions cannot be built");
  }
  const SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();

  const rpcUrl = SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  let mintPublicKey = null;
  try {
    if (LUNA_TOKEN_MINT && LUNA_TOKEN_MINT !== "your_token_mint_address_from_pumpfun_here") {
      mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    } else {
      log.warn("[rps-betting] LUNA_TOKEN_MINT not configured. Betting escrow transfers are disabled.");
    }
  } catch (error) {
    log.error("[rps-betting] Invalid LUNA_TOKEN_MINT:", error);
  }

  let bettingEscrowPublicKey = null;
  let bettingEscrowKeypair = null;
  let bettingEscrowTokenAccount = null;

  try {
    if (BETTING_ESCROW_WALLET) {
      bettingEscrowPublicKey = new PublicKey(BETTING_ESCROW_WALLET);
    }
  } catch (error) {
    log.error("[rps-betting] Invalid BETTING_ESCROW_WALLET:", error);
  }

  try {
    if (BETTING_ESCROW_PRIVATE_KEY && BETTING_ESCROW_PRIVATE_KEY !== "your_private_key_here") {
      bettingEscrowKeypair = Keypair.fromSecretKey(bs58.decode(BETTING_ESCROW_PRIVATE_KEY));
    }
  } catch (error) {
    log.error("[rps-betting] Invalid BETTING_ESCROW_PRIVATE_KEY:", error);
  }

  if (bettingEscrowPublicKey && mintPublicKey) {
    bettingEscrowTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, bettingEscrowPublicKey, false);
  }

  const bettingEscrowReady = !!(mintPublicKey && bettingEscrowPublicKey && bettingEscrowKeypair && bettingEscrowTokenAccount);

  let mintDecimalsCache = null;
  async function getMintDecimals() {
    if (mintDecimalsCache !== null) {
      return mintDecimalsCache;
    }
    if (!mintPublicKey) {
      return 6;
    }
    try {
      const info = await connection.getParsedAccountInfo(mintPublicKey);
      const parsed = info?.value?.data?.parsed;
      const decimals = parsed?.info?.decimals;
      mintDecimalsCache = Number.isFinite(decimals) ? decimals : 6;
    } catch (error) {
      log.warn("[rps-betting] Failed to fetch mint decimals:", error?.message || error);
      mintDecimalsCache = 6;
    }
    return mintDecimalsCache;
  }

  async function ensureBettingEscrowAtaExists() {
    if (!bettingEscrowReady) {
      log.warn("[rps-betting] Cannot create betting escrow ATA: Betting escrow not configured.");
      return;
    }
    if (!bettingEscrowKeypair || !bettingEscrowTokenAccount || !mintPublicKey) {
      log.warn("[rps-betting] Cannot create betting escrow ATA: Missing required configuration.");
      return;
    }
    try {
      const info = await connection.getAccountInfo(bettingEscrowTokenAccount);
      if (info) {
        log.info("[rps-betting] Betting escrow ATA already exists:", bettingEscrowTokenAccount.toBase58());
        return;
      }
      
      // Check if betting escrow wallet has SOL for transaction fee
      const escrowBalance = await connection.getBalance(bettingEscrowPublicKey);
      if (escrowBalance < 5000) { // Minimum SOL needed (0.000005 SOL)
        log.warn(`[rps-betting] Betting escrow wallet has insufficient SOL (${escrowBalance} lamports). Cannot create ATA. Please fund the escrow wallet.`);
        return;
      }
      
      log.info("[rps-betting] Creating betting escrow ATA...");
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          bettingEscrowPublicKey,
          bettingEscrowTokenAccount,
          bettingEscrowPublicKey,
          mintPublicKey
        )
      );
      tx.feePayer = bettingEscrowPublicKey;
      const signature = await sendAndConfirmTransaction(connection, tx, [bettingEscrowKeypair], {
        commitment: "confirmed",
      });
      log.info(`[rps-betting] Created betting escrow ATA (tx: ${signature.substring(0, 8)}...)`);
    } catch (error) {
      const errorMsg = error?.message || String(error);
      log.error("[rps-betting] Failed to create betting escrow ATA:", errorMsg);
      // Don't throw - betting can still work, ATA will be created on-demand if needed
    }
  }

  if (bettingEscrowReady) {
    ensureBettingEscrowAtaExists().catch((err) => log.error("[rps-betting] ensureBettingEscrowAtaExists error:", err));
  }

  const usedStakeSignatures = new Set();
  const MAX_VOICE_TEXT_LENGTH = 240;
  const MAX_VOICE_CACHE_ENTRIES = 20;
  const voiceLineCache = new Map();

  app.post("/luna/rps/betting/voice/start", async (req, res) => {
    if (typeof generateTTSClip !== "function") {
      return res.status(503).json({
        ok: false,
        error: "VoiceUnavailable",
        message: "Voice system is not configured.",
      });
    }
    try {
      const { text, mode } = req.body || {};
      if (!text || typeof text !== "string") {
        return res.status(400).json({
          ok: false,
          error: "InvalidVoiceRequest",
          message: "Voice line text is required.",
        });
      }
      const trimmed = text.trim();
      if (!trimmed) {
        return res.status(400).json({
          ok: false,
          error: "InvalidVoiceRequest",
          message: "Voice line text cannot be empty.",
        });
      }
      const limitedText = trimmed.slice(0, MAX_VOICE_TEXT_LENGTH);
      const voiceMode = typeof mode === "string" && mode.trim() ? mode.trim() : "soft";
      const cacheKey = `${voiceMode}:${limitedText}`;
      const cached = voiceLineCache.get(cacheKey);
      if (cached?.ttsUrl) {
        return res.json({
          ok: true,
          ttsUrl: cached.ttsUrl,
          clipId: cached.clipId,
          cached: true,
        });
      }
      const clipId = await generateTTSClip(limitedText, voiceMode);
      if (!clipId) {
        return res.status(503).json({
          ok: false,
          error: "VoiceGenerationFailed",
          message: "Unable to synthesize Luna's voice right now. Please try again.",
        });
      }
      const ttsUrl = `/public/tts/${clipId}.mp3`;
      voiceLineCache.set(cacheKey, {
        clipId,
        ttsUrl,
        ts: Date.now(),
      });
      if (voiceLineCache.size > MAX_VOICE_CACHE_ENTRIES) {
        let oldestKey = null;
        let oldestTs = Infinity;
        for (const [key, value] of voiceLineCache.entries()) {
          if (value.ts < oldestTs) {
            oldestTs = value.ts;
            oldestKey = key;
          }
        }
        if (oldestKey) {
          voiceLineCache.delete(oldestKey);
        }
      }
      return res.json({
        ok: true,
        ttsUrl,
        clipId,
      });
    } catch (error) {
      log.error("[rps-betting] Failed to generate Luna voice line:", error);
      return res.status(500).json({
        ok: false,
        error: "VoiceGenerationError",
        message: "Failed to generate Luna voice line.",
      });
    }
  });

  async function verifyStakeTransaction(signature, wallet, requiredAmount, expectedFeeLamports = 0) {
    if (!bettingEscrowReady) {
      throw new Error("Betting escrow wallet is not configured. Please contact administrator.");
    }
    if (!signature || typeof signature !== "string") {
      throw new Error("Stake transaction signature is required.");
    }
    if (usedStakeSignatures.has(signature)) {
      throw new Error("This transaction signature has already been used.");
    }

    const parsedTx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!parsedTx) {
      throw new Error("Stake transaction not found or not confirmed yet. Please try again after it confirms.");
    }

    if (parsedTx.meta?.err) {
      throw new Error("Stake transaction failed on-chain. Please submit a successful transfer.");
    }

    const instructions = parsedTx.transaction?.message?.instructions || [];
    const escrowAtaBase58 = bettingEscrowTokenAccount.toBase58();
    const mintBase58 = mintPublicKey.toBase58();

    const transferInstruction = instructions.find((ix) => {
      if (!ix.parsed) return false;
      const programId = (ix.programId && ix.programId.toBase58) ? ix.programId.toBase58() : ix.programId;
      if (programId !== TOKEN_PROGRAM_ID_STR) return false;
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

    if (!transferInstruction) {
      throw new Error("No Luna transfer to the betting escrow wallet was found in this transaction.");
    }

    const info = transferInstruction.parsed?.info || {};
    const tokenAmountInfo = info.tokenAmount || {};
    const rawAmountStr = tokenAmountInfo.amount || info.amount;

    if (!rawAmountStr) {
      throw new Error("Unable to read the transferred amount from the stake transaction.");
    }

    const decimals = tokenAmountInfo.decimals ?? info.decimals ?? (await getMintDecimals());
    const rawAmount = BigInt(rawAmountStr);
    const divisor = Math.pow(10, decimals);
    const uiAmount =
      tokenAmountInfo.uiAmount !== undefined ? Number(tokenAmountInfo.uiAmount) : Number(rawAmount) / divisor;

    if (!Number.isFinite(uiAmount) || uiAmount <= 0) {
      throw new Error("Stake amount is invalid.");
    }

    if (uiAmount + 1e-6 < requiredAmount) {
      throw new Error(`Stake transaction sent only ${uiAmount.toFixed(6)} Luna (required ${requiredAmount}).`);
    }

    let feeLamportsActual = 0;
    if (expectedFeeLamports > 0) {
      const solIx = instructions.find((ix) => {
        if (!ix.parsed) return false;
        const programId = ix.programId?.toBase58?.() ? ix.programId.toBase58() : ix.programId;
        if (programId !== SYSTEM_PROGRAM_ID) return false;
        const type = ix.parsed?.type;
        if (type !== "transfer") return false;
        const info = ix.parsed?.info || {};
        const source = info.source || info.fromPubkey || info.authority;
        const destination = info.destination || info.toPubkey;
        return source === wallet && destination === feeWalletPublicKey?.toBase58();
      });

      if (!solIx) {
        throw new Error("Fee transaction not found in combined transaction. Please try again.");
      }
      const solInfo = solIx.parsed?.info || {};
      const lamportsStr = solInfo.lamports || solInfo.amount;
      if (!lamportsStr) {
        throw new Error("Unable to read the fee amount from the transaction.");
      }
      feeLamportsActual = Number(lamportsStr);
      if (!Number.isFinite(feeLamportsActual) || feeLamportsActual <= 0) {
        throw new Error("Fee transaction amount is invalid.");
      }
      if (feeLamportsActual + 1e-6 < expectedFeeLamports) {
        throw new Error(
          `Fee transaction sent only ${feeLamportsActual} lamports (required ${expectedFeeLamports}). Please resend transaction.`
        );
      }
    }

    return {
      uiAmount,
      rawAmount,
      signature,
      feeLamports: feeLamportsActual,
    };
  }

  async function transferFromBettingEscrow(toWallet, amountInLuna, reason = "payout") {
    if (!bettingEscrowReady) {
      throw new Error("Betting escrow wallet is not configured.");
    }
    if (!toWallet || !Number.isFinite(amountInLuna) || amountInLuna <= 0) {
      return null;
    }

    const decimals = await getMintDecimals();
    const multiplier = Math.pow(10, decimals);
    const rawAmount = Math.round(amountInLuna * multiplier);
    if (rawAmount <= 0) {
      return null;
    }
    if (rawAmount > Number.MAX_SAFE_INTEGER) {
      throw new Error("Transfer amount exceeds supported range.");
    }

    const toPublicKey = new PublicKey(toWallet);
    const toTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, toPublicKey, false);
    const instructions = [];
    const ataInfo = await connection.getAccountInfo(toTokenAccount);
    if (!ataInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          bettingEscrowPublicKey,
          toTokenAccount,
          toPublicKey,
          mintPublicKey
        )
      );
    }

    instructions.push(
      createTransferInstruction(
        bettingEscrowTokenAccount,
        toTokenAccount,
        bettingEscrowPublicKey,
        rawAmount
      )
    );

    const tx = new Transaction().add(...instructions);
    tx.feePayer = bettingEscrowPublicKey;
    const signature = await sendAndConfirmTransaction(connection, tx, [bettingEscrowKeypair], {
      commitment: "confirmed",
    });
    log.info(
      `[rps-betting] Escrow transfer ${amountInLuna} Luna to ${toWallet.substring(0, 8)}... (${reason}) (tx: ${signature.substring(
        0,
        8
      )}...)`
    );
    return signature;
  }

  function ensureRoomEscrow(room) {
    if (!room.escrow) {
      room.escrow = {
        creatorStake: 0,
        creatorSignature: null,
        player2Stake: 0,
        player2Signature: null,
        settled: false,
        refunded: false,
      };
    }
    return room.escrow;
  }

  async function refundRoomEscrow(room, reason = "cancelled") {
    if (!bettingEscrowReady || !room) return;
    const escrow = ensureRoomEscrow(room);
    if (escrow.settled || escrow.refunded) {
      return;
    }
    escrow.refunded = true;
    const operations = [];
    if (escrow.creatorStake > 0 && room.creator) {
      operations.push(transferFromBettingEscrow(room.creator, escrow.creatorStake, `${reason}-creator`));
    }
    if (escrow.player2Stake > 0 && room.player2) {
      operations.push(transferFromBettingEscrow(room.player2, escrow.player2Stake, `${reason}-player2`));
    }
    await Promise.allSettled(operations);
    escrow.settled = true;
  }
  /**
   * Build unsigned transaction for staking (user -> betting escrow)
   * POST /luna/rps/betting/stake/build
   */
  app.post("/luna/rps/betting/stake/build", async (req, res) => {
    try {
      if (!bettingEscrowReady) {
        return res.status(503).json({
          ok: false,
          error: "EscrowUnavailable",
          message: "Betting escrow wallet is not configured. Please contact administrator.",
        });
      }

      const { wallet, amount } = req.body || {};

      try {
        validateWalletAddress(wallet, "wallet");
      } catch (error) {
        return res.status(400).json({
          ok: false,
          error: "InvalidWallet",
          message: error.message || "Invalid wallet address format",
        });
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          ok: false,
          error: "InvalidAmount",
          message: "Stake amount must be greater than 0 Luna",
        });
      }

      if (amount > MAX_BET_AMOUNT) {
        return res.status(400).json({
          ok: false,
          error: "AmountTooLarge",
          message: "Bet amount exceeds maximum limit",
        });
      }

      const ip = typeof getClientIp === "function" ? getClientIp(req) : null;
      if (ip && typeof checkIpRateLimit === "function") {
        const rateLimitCheck = checkIpRateLimit(ip);
        if (!rateLimitCheck.allowed) {
          return res.status(429).json({
            ok: false,
            error: "Cooldown active",
            message: rateLimitCheck.reason || "Cooldown active. Please wait a moment.",
            code: "COOLDOWN",
          });
        }
      }

      const decimals = await getMintDecimals();
      const rawAmount = Math.round(amount * Math.pow(10, decimals));
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
        return res.status(400).json({
          ok: false,
          error: "InvalidRawAmount",
          message: "Unable to calculate transfer amount",
        });
      }

      const userPublicKey = new PublicKey(wallet);
      const userTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, userPublicKey, false);

      const instructions = [];
      const userAtaInfo = await connection.getAccountInfo(userTokenAccount);
      if (!userAtaInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            userPublicKey,
            userTokenAccount,
            userPublicKey,
            mintPublicKey
          )
        );
      }

      instructions.push(
        createTransferInstruction(userTokenAccount, bettingEscrowTokenAccount, userPublicKey, rawAmount)
      );

      let feeInSol = 0;
      let feeLamports = 0;
      if (feeWalletPublicKey) {
        feeInSol = await calculateFee(amount, wallet);
        if (Number.isFinite(feeInSol) && feeInSol > 0) {
          feeLamports = Math.max(1, Math.round(feeInSol * LAMPORTS_PER_SOL));
          instructions.push(
            SystemProgram.transfer({
              fromPubkey: userPublicKey,
              toPubkey: feeWalletPublicKey,
              lamports: feeLamports,
            })
          );
        }
      }

      if (instructions.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "NoInstructions",
          message: "Failed to create stake instructions",
        });
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

      const tx = new Transaction({
        feePayer: userPublicKey,
        recentBlockhash: blockhash,
        lastValidBlockHeight,
      });
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      instructions.forEach((ix) => tx.add(ix));

      const serialized = tx.serialize({ requireAllSignatures: false }).toString("base64");

      return res.json({
        ok: true,
        transaction: serialized,
        blockhash,
        lastValidBlockHeight,
        needsAta: !userAtaInfo,
        amount,
        rawAmount,
        feeInSol,
        feeLamports,
      });
    } catch (error) {
      log.error("[rps-betting] Failed to build stake transaction:", error);
      return res.status(500).json({
        ok: false,
        error: "BuildStakeTxFailed",
        message: error.message || "Failed to build stake transaction",
      });
    }
  });

  /**
   * Create a betting room
   * POST /luna/rps/betting/create
   */
  app.post("/luna/rps/betting/create", async (req, res) => {
    let creatorStakeAmount = 0;
    let creatorStakeSignature = null;
    let creatorWallet = null;
    try {
      const { wallet, betAmount, txSignature } = req.body || {};
      creatorWallet = wallet;
      
      // Security: Validate wallet address format
      try {
        validateWalletAddress(wallet, 'wallet');
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: e.message || "Invalid wallet address format",
        });
      }
      
      if (!betAmount || typeof betAmount !== "number" || betAmount < 1) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Bet amount must be at least 1 Luna",
        });
      }
      
      // Security: Limit maximum bet amount to prevent abuse
      if (betAmount > MAX_BET_AMOUNT) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Bet amount exceeds maximum limit",
        });
      }
      
      // Check if user already has an active room (waiting or in-progress)
      for (const [roomId, room] of rpsBettingRooms.entries()) {
        if (room.creator === wallet) {
          return res.status(400).json({
            ok: false,
            error: "RoomActive",
            roomId,
            message: "You already have a room in progress. Please finish or cancel it before creating another.",
          });
        }
      }

      if (!bettingEscrowReady) {
        return res.status(503).json({
          ok: false,
          error: "EscrowUnavailable",
          message: "Betting escrow wallet is not configured. Please contact administrator.",
        });
      }

      if (!txSignature || typeof txSignature !== "string") {
        return res.status(400).json({
          ok: false,
          error: "StakeSignatureRequired",
          message: "กรุณาโอน Luna ไปยังกระเป๋าเดิมพันและกรอก transaction signature ก่อนสร้างห้อง",
        });
      }

      // Anti-abuse: Check IP cooldown only
      const ip = getClientIp(req);
      const rateLimitCheck = checkIpRateLimit(ip);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          ok: false,
          error: "Cooldown active",
          message: rateLimitCheck.reason,
          code: "COOLDOWN"
        });
      }

      const feeInSol = await calculateFee(betAmount, wallet);
      const expectedFeeLamports =
        feeWalletPublicKey && feeInSol > 0 ? Math.max(1, Math.round(feeInSol * LAMPORTS_PER_SOL)) : 0;

      await verifyStakeTransaction(txSignature, wallet, betAmount, expectedFeeLamports);
      creatorStakeAmount = betAmount;
      creatorStakeSignature = txSignature;

      const roomId = `betting_${wallet}_${Date.now()}`;
      rpsBettingRooms.set(roomId, {
        creator: wallet,
        betAmount: betAmount,
        player2: null,
        choices: {},
        timestamp: Date.now(),
        escrow: {
          creatorStake: betAmount,
          creatorSignature: txSignature,
          player2Stake: 0,
          player2Signature: null,
          settled: false,
          refunded: false,
        },
      });
      usedStakeSignatures.add(txSignature);
      
      // Record betting fee in SOL (already paid on-chain by user)
      await collectFee(wallet, feeInSol, roomId, betAmount, { skipTransfer: true });
      
      // Auto-cleanup after timeout
      setTimeout(async () => {
        try {
          if (rpsBettingRooms.has(roomId)) {
            const room = rpsBettingRooms.get(roomId);
            if (!room.player2) {
              await refundRoomEscrow(room, "timeout");
              rpsBettingRooms.delete(roomId);
              log.info(`[rps-betting] Room ${roomId} expired (no challenger)`);
              broadcast({
                type: "rps_betting_room_removed",
                roomId: roomId,
              });
            }
          }
        } catch (timeoutErr) {
          log.error("[rps-betting] Timeout cleanup error:", timeoutErr);
        }
      }, RPS_BETTING_ROOM_TIMEOUT);
      
      // Broadcast new room
      broadcast({
        type: "rps_betting_room_created",
        roomId: roomId,
        creator: wallet,
        betAmount: betAmount,
      });
      
      // Send notification to all users about new room
      sendNotification(null, 'room_new', 'New Betting Room!', 
        `New room created with bet amount: ${betAmount} Luna tokens`, 
        { roomId: roomId, creator: wallet, betAmount: betAmount });
      
      log.info(`[rps-betting] Room created: ${roomId} by ${wallet} with bet ${betAmount}`);
      
      return res.json({
        ok: true,
        roomId: roomId,
        message: "Room created successfully",
      });
    } catch (e) {
      if (creatorStakeAmount > 0 && creatorStakeSignature && creatorWallet) {
        usedStakeSignatures.delete(creatorStakeSignature);
        try {
          await transferFromBettingEscrow(creatorWallet, creatorStakeAmount, "create-room-error");
        } catch (refundErr) {
          log.error("[rps-betting] Failed to refund creator stake after error:", refundErr);
        }
      }
      log.error("[rps-betting] Create room error:", e);
      res.status(500).json({
        ok: false,
        error: "Internal server error",
        message: "Failed to create room. Please try again later.",
      });
    }
  });

  /**
   * Cancel a betting room
   * POST /luna/rps/betting/cancel
   */
  app.post("/luna/rps/betting/cancel", async (req, res) => {
    try {
      log.info(`[rps-betting] Cancel room request received:`, req.body);
      const { wallet, roomId } = req.body || {};
      
      // Security: Validate wallet address format
      try {
        validateWalletAddress(wallet, 'wallet');
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: e.message || "Invalid wallet address format",
        });
      }
      
      if (!roomId || typeof roomId !== "string" || roomId.length > 200) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Room ID is required and must be a valid string",
        });
      }
      
      const room = rpsBettingRooms.get(roomId);
      
      if (!room) {
        return res.status(404).json({
          ok: false,
          error: "Room not found",
          message: "This room no longer exists",
        });
      }
      
      // Check if user is the creator or player2
      if (room.creator !== wallet && room.player2 !== wallet) {
        return res.status(403).json({
          ok: false,
          error: "Not authorized",
          message: "You are not a player in this room",
        });
      }
      
      // Only allow cancellation if game hasn't started (no choices submitted)
      if (room.choices && (room.choices.player1 || room.choices.player2)) {
        return res.status(400).json({
          ok: false,
          error: "Game in progress",
          message: "Cannot cancel room while game is in progress",
        });
      }
      
      // Remove room
      await refundRoomEscrow(room, "cancelled");
      rpsBettingRooms.delete(roomId);
      
      // Broadcast room cancellation
      broadcast({
        type: "rps_betting_room_cancelled",
        roomId: roomId,
        cancelledBy: wallet,
      });
      
      log.info(`[rps-betting] Room ${roomId} cancelled by ${wallet}`);
      
      return res.json({
        ok: true,
        message: "Room cancelled successfully",
      });
    } catch (e) {
      log.error("[rps-betting] Cancel room error:", e);
      res.status(500).json({
        ok: false,
        error: "Internal server error",
        message: "Failed to cancel room. Please try again later.",
      });
    }
  });

  /**
   * Get all available betting rooms
   * GET /luna/rps/betting/rooms
   */
  app.get("/luna/rps/betting/rooms", async (req, res) => {
    try {
      const rooms = [];
      
      // Clean up expired rooms
      const now = Date.now();
      for (const [roomId, room] of rpsBettingRooms.entries()) {
        if (now - room.timestamp > RPS_BETTING_ROOM_TIMEOUT && !room.player2) {
          rpsBettingRooms.delete(roomId);
          continue;
        }
        
        rooms.push({
          roomId: roomId,
          creator: room.creator,
          betAmount: room.betAmount,
          player2: room.player2,
          timestamp: room.timestamp,
        });
      }
      
      // Sort by timestamp (newest first)
      rooms.sort((a, b) => b.timestamp - a.timestamp);
      
      return res.json({
        ok: true,
        rooms: rooms,
        escrowWallet: bettingEscrowReady ? bettingEscrowPublicKey?.toBase58() : null,
      });
    } catch (e) {
      log.error("[rps-betting] Get rooms error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get rooms",
      });
    }
  });

  /**
   * Join a betting room
   * POST /luna/rps/betting/join
   */
  app.post("/luna/rps/betting/join", async (req, res) => {
    let challengerStakeAmount = 0;
    let challengerStakeSignature = null;
    let challengerWallet = null;
    try {
      const { wallet, roomId, txSignature } = req.body || {};
      challengerWallet = wallet;
      
      // Security: Validate wallet address format
      try {
        validateWalletAddress(wallet, 'wallet');
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: e.message || "Invalid wallet address format",
        });
      }
      
      if (!roomId || typeof roomId !== "string" || roomId.length > 200) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Room ID is required and must be a valid string",
        });
      }
      
      const room = rpsBettingRooms.get(roomId);
      
      if (!room) {
        return res.status(404).json({
          ok: false,
          error: "Room not found",
          message: "This room no longer exists",
        });
      }
      
      if (room.creator === wallet) {
        return res.status(400).json({
          ok: false,
          error: "Cannot join own room",
          message: "You cannot join your own room",
        });
      }
      
      if (room.player2) {
        return res.status(400).json({
          ok: false,
          error: "Room full",
          message: "This room already has a challenger",
        });
      }
      
      if (!bettingEscrowReady) {
        return res.status(503).json({
          ok: false,
          error: "EscrowUnavailable",
          message: "Betting escrow wallet is not configured. Please contact administrator.",
        });
      }

      if (!txSignature || typeof txSignature !== "string") {
        return res.status(400).json({
          ok: false,
          error: "StakeSignatureRequired",
          message: "กรุณาโอน Luna ไปยังกระเป๋าเดิมพันและกรอก transaction signature ก่อนเข้าร่วม",
        });
      }

      // Anti-abuse: Validate game request
      const validation = validateGameRequest(room.creator, wallet, req);
      if (!validation.valid) {
        return res.status(403).json({
          ok: false,
          error: validation.error,
          code: validation.code,
          message: validation.error
        });
      }

      const feeInSol = await calculateFee(room.betAmount, wallet);
      const expectedFeeLamports =
        feeWalletPublicKey && feeInSol > 0 ? Math.max(1, Math.round(feeInSol * LAMPORTS_PER_SOL)) : 0;

      await verifyStakeTransaction(txSignature, wallet, room.betAmount, expectedFeeLamports);
      challengerStakeAmount = room.betAmount;
      challengerStakeSignature = txSignature;
      
      // Add player2
      room.player2 = wallet;
      room.choices = {};
      const escrow = ensureRoomEscrow(room);
      escrow.player2Stake = room.betAmount;
      escrow.player2Signature = txSignature;
      usedStakeSignatures.add(txSignature);
      
      // Record betting fee in SOL from player2 (already paid on-chain)
      await collectFee(wallet, feeInSol, roomId, room.betAmount, { skipTransfer: true });
      
      // Broadcast room joined
      broadcast({
        type: "rps_betting_room_joined",
        roomId: roomId,
        creator: room.creator,
        opponent: wallet,
        betAmount: room.betAmount,
        opponentLabel: room.creator === wallet ? `vs ${room.player2?.substring(0, 4)}...${room.player2?.substring(room.player2.length - 4)}` : `vs ${room.creator.substring(0, 4)}...${room.creator.substring(room.creator.length - 4)}`,
      });
      
      log.info(`[rps-betting] Room ${roomId} joined by ${wallet}`);
      
      return res.json({
        ok: true,
        roomId: roomId,
        creator: room.creator,
        betAmount: room.betAmount,
        message: "Joined room successfully",
      });
    } catch (e) {
      if (challengerStakeAmount > 0 && challengerStakeSignature && challengerWallet) {
        usedStakeSignatures.delete(challengerStakeSignature);
        try {
          await transferFromBettingEscrow(challengerWallet, challengerStakeAmount, "join-room-error");
        } catch (refundErr) {
          log.error("[rps-betting] Failed to refund challenger stake after error:", refundErr);
        }
      }
      log.error("[rps-betting] Join room error:", e);
      res.status(500).json({
        ok: false,
        error: "Internal server error",
        message: "Failed to join room. Please try again later.",
      });
    }
  });

  /**
   * Get current Luna price in SOL
   * GET /luna/rps/betting/price
   */
  app.get("/luna/rps/betting/price", async (req, res) => {
    try {
      const price = await fetchLunaPriceInSol();
      const cached = priceCache.get(LUNA_TOKEN_MINT);
      
      if (price === null) {
        return res.status(503).json({
          ok: false,
          error: "Price not available",
          message: "Could not fetch Luna price. Please check LUNA_TOKEN_MINT in .env",
        });
      }
      
      return res.json({
        ok: true,
        price: price,
        pricePerLuna: price,
        cached: cached ? Date.now() - cached.timestamp < PRICE_CACHE_TTL : false,
        cacheAge: cached ? Date.now() - cached.timestamp : null,
        mint: LUNA_TOKEN_MINT,
      });
    } catch (e) {
      log.error("[rps-betting] Get price error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get price",
      });
    }
  });

  /**
   * Get collected fees (admin endpoint)
   * GET /luna/rps/betting/fees?wallet=wallet_address (optional - if not provided, returns all fees)
   */
  app.get("/luna/rps/betting/fees", async (req, res) => {
    try {
      const { wallet } = req.query || {};
      const feeWallet = process.env.BETTING_FEE_WALLET || null;
      
      if (wallet && typeof wallet === "string") {
        // Get fees for specific wallet
        const feeData = collectedFees.get(wallet);
        if (!feeData) {
          return res.json({
            ok: true,
            wallet: wallet,
            totalFees: 0,
            transactions: [],
            feeWallet: feeWallet,
            note: feeWallet ? `Fees should be sent to: ${feeWallet}` : "No fee wallet configured"
          });
        }
        
        return res.json({
          ok: true,
          wallet: wallet,
          totalFees: feeData.totalFees,
          transactions: feeData.transactions,
          feeWallet: feeWallet,
          note: feeWallet ? `Fees should be sent to: ${feeWallet}` : "No fee wallet configured"
        });
      } else {
        // Get all fees
        const allFees = {};
        let totalAllFees = 0;
        
        for (const [walletAddr, feeData] of collectedFees.entries()) {
          allFees[walletAddr] = {
            totalFees: feeData.totalFees,
            transactionCount: feeData.transactions.length
          };
          totalAllFees += feeData.totalFees;
        }
        
        return res.json({
          ok: true,
          totalCollectedFees: totalAllFees,
          feeBreakdown: allFees,
          feeWallet: feeWallet,
          note: feeWallet ? `All fees should be sent to: ${feeWallet}` : "No fee wallet configured. Fees are tracked in memory only."
        });
      }
    } catch (e) {
      log.error("[rps-betting] Get fees error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get fees",
      });
    }
  });

  /**
   * Submit choice in betting match
   * POST /luna/rps/betting/submit
   */
  app.post("/luna/rps/betting/submit", async (req, res) => {
    try {
      const { wallet, roomId, choice } = req.body || {};
      
      // Security: Validate wallet address format
      try {
        validateWalletAddress(wallet, 'wallet');
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: e.message || "Invalid wallet address format",
        });
      }
      
      if (!roomId || typeof roomId !== "string" || roomId.length > 200) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Room ID is required and must be a valid string",
        });
      }
      
      // Security: Validate choice (case-insensitive, trim whitespace)
      const normalizedChoice = choice ? choice.toLowerCase().trim() : '';
      if (!normalizedChoice || !["rock", "paper", "scissors"].includes(normalizedChoice)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Valid choice (rock, paper, scissors) is required",
        });
      }
      
      const room = rpsBettingRooms.get(roomId);
      
      if (!room) {
        return res.status(404).json({
          ok: false,
          error: "Room not found",
          message: "This room no longer exists",
        });
      }
      
      if (room.creator !== wallet && room.player2 !== wallet) {
        return res.status(403).json({
          ok: false,
          error: "Not a player in this room",
          message: "You are not a player in this room",
        });
      }
      
      if (!room.player2) {
        return res.status(400).json({
          ok: false,
          error: "Room not ready",
          message: "Waiting for opponent to join",
        });
      }
      
      // Store choice
      if (wallet === room.creator) {
        room.choices.player1 = normalizedChoice;
      } else {
        room.choices.player2 = normalizedChoice;
      }
      
      // Check if both players have submitted
      if (room.choices.player1 && room.choices.player2) {
        // Determine winner
        const p1Choice = room.choices.player1;
        const p2Choice = room.choices.player2;
        room.choices.player1 = null;
        room.choices.player2 = null;
        
        let winner = null;
        if (p1Choice === p2Choice) {
          winner = "draw";
        } else if (
          (p1Choice === "rock" && p2Choice === "scissors") ||
          (p1Choice === "paper" && p2Choice === "rock") ||
          (p1Choice === "scissors" && p2Choice === "paper")
        ) {
          winner = room.creator; // Player 1 wins
        } else {
          winner = room.player2; // Player 2 wins
        }
        
        // Update leaderboard and calculate rewards
        const betAmountInSol = await lunaToSol(room.betAmount);
        const totalPot = betAmountInSol * 2; // Both players bet the same amount
        
        // Anti-abuse: Record wallet pair match
        recordWalletPairMatch(room.creator, room.player2);
        
        // Anti-abuse: Update IP activity (both players)
        const creatorIp = walletIpMap.get(room.creator) || getClientIp(req);
        const player2Ip = walletIpMap.get(room.player2) || getClientIp(req);
        updateIpActivity(creatorIp, BETTING_GAME_COOLDOWN_MS);
        updateIpActivity(player2Ip, BETTING_GAME_COOLDOWN_MS);

        if (bettingEscrowReady) {
          const escrow = ensureRoomEscrow(room);
          const creatorStake = escrow.creatorStake || 0;
          const challengerStake = escrow.player2Stake || 0;
          const totalStake = creatorStake + challengerStake;

          try {
            if (winner === "draw") {
              if (creatorStake > 0) {
                await transferFromBettingEscrow(room.creator, creatorStake, "draw");
              }
              if (challengerStake > 0) {
                await transferFromBettingEscrow(room.player2, challengerStake, "draw");
              }
            } else if (winner === room.creator && totalStake > 0) {
              await transferFromBettingEscrow(room.creator, totalStake, "payout");
            } else if (winner === room.player2 && totalStake > 0) {
              await transferFromBettingEscrow(room.player2, totalStake, "payout");
            }
          } catch (payoutErr) {
            log.error("[rps-betting] Failed to settle betting escrow:", payoutErr);
          } finally {
            escrow.creatorStake = 0;
            escrow.player2Stake = 0;
            escrow.settled = true;
          }
        }
        
        // Update leaderboard stats
        if (!rpsLeaderboard.has(room.creator)) {
          rpsLeaderboard.set(room.creator, { wins: 0, losses: 0, totalWon: 0, totalSolWon: 0 });
        }
        if (!rpsLeaderboard.has(room.player2)) {
          rpsLeaderboard.set(room.player2, { wins: 0, losses: 0, totalWon: 0, totalSolWon: 0 });
        }
        
        const creatorStats = rpsLeaderboard.get(room.creator);
        const player2Stats = rpsLeaderboard.get(room.player2);
        
        if (winner === "draw") {
          // Draw - return bets (no winner, no loser)
          // No leaderboard update needed for draws
        } else if (winner === room.creator) {
          creatorStats.wins++;
          creatorStats.totalWon += room.betAmount * 2; // Win both bets
          creatorStats.totalSolWon += totalPot;
          player2Stats.losses++;
        } else {
          player2Stats.wins++;
          player2Stats.totalWon += room.betAmount * 2;
          player2Stats.totalSolWon += totalPot;
          creatorStats.losses++;
        }

        if (typeof saveLeaderboardEntry === "function") {
          try {
            const creatorPayload = {
              wins: creatorStats.wins || 0,
              losses: creatorStats.losses || 0,
              totalWon: creatorStats.totalWon || 0,
              totalSolWon: creatorStats.totalSolWon || 0,
            };
            const player2Payload = {
              wins: player2Stats.wins || 0,
              losses: player2Stats.losses || 0,
              totalWon: player2Stats.totalWon || 0,
              totalSolWon: player2Stats.totalSolWon || 0,
            };
            await Promise.all([
              saveLeaderboardEntry(room.creator, creatorPayload),
              saveLeaderboardEntry(room.player2, player2Payload),
            ]);
          } catch (persistErr) {
            log.error("[rps-betting] Failed to persist leaderboard stats:", persistErr);
          }
        }
        
        // Save match history for both players
        try {
          // For creator
          const creatorResult = winner === "draw" ? "draw" : (winner === room.creator ? "win" : "lose");
          const creatorPrize = winner === room.creator ? totalPot : 0;
          await saveMatchHistory(
            room.creator,
            room.player2,
            "Betting",
            p1Choice,
            p2Choice,
            creatorResult,
            winner === "draw" ? null : winner,
            room.betAmount,
            creatorPrize
          );
          
          // For player2
          const player2Result = winner === "draw" ? "draw" : (winner === room.player2 ? "win" : "lose");
          const player2Prize = winner === room.player2 ? totalPot : 0;
          await saveMatchHistory(
            room.player2,
            room.creator,
            "Betting",
            p2Choice,
            p1Choice,
            player2Result,
            winner === "draw" ? null : winner,
            room.betAmount,
            player2Prize
          );
        } catch (historyErr) {
          log.error("[rps-betting] Failed to save match history:", historyErr);
          // Don't fail the match if history save fails
        }
        
        // Broadcast result
        const result = {
          type: "rps_betting_match_result",
          roomId: roomId,
          player1Wallet: room.creator,
          player2Wallet: room.player2,
          player1Choice: p1Choice,
          player2Choice: p2Choice,
          winner: winner,
          betAmount: room.betAmount,
          betAmountInSol: betAmountInSol,
          totalPotInSol: totalPot,
        };
        
        broadcast(result);
        
        // Remove room shortly after result so players exit immediately
        setTimeout(() => {
          if (rpsBettingRooms.has(roomId)) {
            rpsBettingRooms.delete(roomId);
            log.info(`[rps-betting] Room ${roomId} removed after match`);
            broadcast({
              type: "rps_betting_room_removed",
              roomId,
            });
          }
        }, 7000);
        
        log.info(`[rps-betting] Match result in room ${roomId}: ${p1Choice} vs ${p2Choice}, winner: ${winner}`);
        
        return res.json({
          ok: true,
          result: result,
          message: "Choice submitted, match result determined",
        });
      }
      
      return res.json({
        ok: true,
        message: "Choice submitted, waiting for opponent",
      });
    } catch (e) {
      log.error("[rps-betting] Submit choice error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to submit choice",
      });
    }
  });
}









