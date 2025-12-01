// services/walletBalanceService.js
// Shared wallet balance checker using Solana RPC

import { Connection, PublicKey } from "@solana/web3.js";
import { log } from "../modules/logger.js";
import { resolveLunaMint } from "../utils/mint.js";

const DEFAULT_RPC_ENDPOINTS = [
  process.env.SOLANA_RPC_URL,
  "https://api.mainnet-beta.solana.com",
  "https://solana-api.projectserum.com",
  "https://rpc.ankr.com/solana",
].filter(Boolean);

/**
 * Fetch Luna token balance for a wallet with caching + rate-limit fallbacks
 * @param {Object} params
 * @param {string} params.wallet - Wallet address
 * @param {string} [params.mint] - Token mint address
 * @param {Map} params.balanceCache - Cache map shared across routes
 * @param {number} params.cacheTtl - Cache TTL in ms
 * @param {boolean} [params.forceRefresh=false] - Skip cache if true
 * @param {Array<string>} [params.rpcEndpoints] - Optional custom RPC endpoints
 * @returns {Promise<{balance: number, cached: boolean, warning?: string}>}
 */
export async function getWalletBalance({
  wallet,
  mint,
  balanceCache,
  cacheTtl,
  forceRefresh = false,
  rpcEndpoints = DEFAULT_RPC_ENDPOINTS,
}) {
  if (!wallet || typeof wallet !== "string") {
    throw new Error("Wallet address is required");
  }
  if (!balanceCache || typeof balanceCache.get !== "function") {
    throw new Error("balanceCache Map is required");
  }

  const resolvedMint = resolveLunaMint(mint);

  if (!resolvedMint) {
    throw new Error("Invalid mint address. Please configure LUNA_TOKEN_MINT.");
  }

  const cacheKey = `${wallet}:${resolvedMint}`;
  const now = Date.now();

  if (!forceRefresh && balanceCache.has(cacheKey)) {
    const cached = balanceCache.get(cacheKey);
    if (now - cached.timestamp < cacheTtl) {
      return {
        balance: cached.balance,
        cached: true,
      };
    }
  }

  const endpoints =
    rpcEndpoints && rpcEndpoints.length > 0
      ? rpcEndpoints
      : ["https://api.mainnet-beta.solana.com"];

  let connection = null;
  let lastError = null;
  let rateLimited = false;

  for (const endpoint of endpoints) {
    try {
      connection = new Connection(endpoint, "confirmed");
      await connection.getVersion();
      log.verbose?.(`[wallet-balance] Connected to RPC ${endpoint}`);
      break;
    } catch (err) {
      lastError = err;
      if (
        err.message &&
        (err.message.includes("429") || err.message.includes("Too Many Requests"))
      ) {
        rateLimited = true;
        log.verbose?.(`[wallet-balance] Rate limited on ${endpoint}`);
      } else {
        log.verbose?.(`[wallet-balance] RPC ${endpoint} failed: ${err.message}`);
      }
      continue;
    }
  }

  if (!connection) {
    if (rateLimited && balanceCache.has(cacheKey)) {
      const cached = balanceCache.get(cacheKey);
      return {
        balance: cached.balance,
        cached: true,
        warning: "Rate limited, returning cached balance",
      };
    }
    throw new Error(
      `Failed to connect to Solana RPC: ${lastError?.message || "Unknown error"}`
    );
  }

  let mintPublicKey;
  let walletPublicKey;
  try {
    mintPublicKey = new PublicKey(resolvedMint);
    walletPublicKey = new PublicKey(wallet);
  } catch (error) {
    throw new Error(
      `Invalid address format (wallet or mint). Details: ${error.message}`
    );
  }

  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      { mint: mintPublicKey }
    );

    let balance = 0;
    if (tokenAccounts.value && tokenAccounts.value.length > 0) {
      const tokenAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;

      if (tokenAmount.uiAmountString) {
        balance = parseFloat(tokenAmount.uiAmountString);
      } else if (
        tokenAmount.uiAmount !== null &&
        tokenAmount.uiAmount !== undefined
      ) {
        balance = tokenAmount.uiAmount;
      } else {
        const rawAmount = parseFloat(tokenAmount.amount || "0");
        const decimals = tokenAmount.decimals || 0;
        balance = rawAmount / Math.pow(10, decimals);
      }

      if (balance >= 1000000) {
        balance = Math.round(balance);
      } else {
        balance = Math.round(balance * 100) / 100;
      }
    }

    balanceCache.set(cacheKey, { balance, timestamp: now });

    return {
      balance,
      cached: false,
    };
  } catch (rpcError) {
    if (
      rpcError.message &&
      (rpcError.message.includes("429") || rpcError.message.includes("Too Many Requests"))
    ) {
      if (balanceCache.has(cacheKey)) {
        const cached = balanceCache.get(cacheKey);
        return {
          balance: cached.balance,
          cached: true,
          warning: "Rate limited, returning cached balance",
        };
      }
      throw new Error("Rate limited while fetching balance. Please retry.");
    }

    throw new Error(`Failed to fetch wallet balance: ${rpcError.message}`);
  }
}




