// services/solanaService.js
// Solana blockchain service

import { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import { log } from "../modules/logger.js";

/**
 * Send SOL to a wallet address
 * @param {string} toWallet - Recipient wallet address
 * @param {number} amountInSol - Amount in SOL
 * @returns {Promise<string|null>} - Transaction signature or null if failed
 */
export async function sendSol(toWallet, amountInSol) {
  try {
    const privateKey = process.env.REWARD_SENDER_PRIVATE_KEY;
    if (!privateKey || privateKey === "your_private_key_here") {
      log.warn("[rps] REWARD_SENDER_PRIVATE_KEY not configured, cannot send SOL");
      return null;
    }
    
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      "confirmed"
    );
    
    // Decode private key
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const toPublicKey = new PublicKey(toWallet);
    
    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: toPublicKey,
        lamports: amountInSol * LAMPORTS_PER_SOL, // Convert SOL to lamports
      })
    );
    
    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: "confirmed" }
    );
    
    log.info(`[rps] ✓ Sent ${amountInSol} SOL to ${toWallet.substring(0, 8)}... (tx: ${signature})`);
    return signature;
  } catch (error) {
    log.error("[rps] Error sending SOL:", error);
    return null;
  }
}

/**
 * Send Luna tokens to a wallet address
 * @param {string} toWallet - Recipient wallet address
 * @param {number} amountInLuna - Amount in Luna tokens
 * @param {string} LUNA_TOKEN_MINT - Luna token mint address
 * @returns {Promise<string|null>} - Transaction signature or null if failed
 */
export async function sendLunaToken(toWallet, amountInLuna, LUNA_TOKEN_MINT) {
  try {
    const privateKey = process.env.REWARD_SENDER_PRIVATE_KEY;
    if (!privateKey || privateKey === "your_private_key_here") {
      log.warn("[rps] REWARD_SENDER_PRIVATE_KEY not configured, cannot send Luna tokens");
      return null;
    }
    
    if (!LUNA_TOKEN_MINT || LUNA_TOKEN_MINT === "your_token_mint_address_from_pumpfun_here") {
      log.warn("[rps] LUNA_TOKEN_MINT not configured, cannot send Luna tokens");
      return null;
    }
    
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      "confirmed"
    );
    
    // Decode private key
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    const toPublicKey = new PublicKey(toWallet);
    
    // Get or create associated token accounts
    const fromTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, keypair.publicKey);
    const toTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, toPublicKey);
    
    // Convert Luna to smallest units (assuming 6 decimals for pump.fun tokens)
    const lunaDecimals = 6;
    const amountInSmallestUnits = Math.floor(amountInLuna * Math.pow(10, lunaDecimals));
    
    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      keypair.publicKey,
      amountInSmallestUnits,
      [],
      TOKEN_PROGRAM_ID
    );
    
    // Create transaction
    const transaction = new Transaction().add(transferInstruction);
    
    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: "confirmed" }
    );
    
    log.info(`[rps] ✓ Sent ${amountInLuna} Luna tokens to ${toWallet.substring(0, 8)}... (tx: ${signature})`);
    return signature;
  } catch (error) {
    log.error("[rps] Error sending Luna tokens:", error);
    return null;
  }
}

/**
 * Distribute rewards to top 5 players
 * @param {Map} rpsLeaderboard - RPS leaderboard map
 * @param {number} rewardPool - Current reward pool
 * @param {Set} rewardBannedWallets - Reward banned wallets set
 * @param {string} REWARD_DISTRIBUTION_WALLET - Reward distribution wallet address
 * @param {Object} REWARD_PERCENTAGES - Reward percentages object
 * @param {Function} sendSol - Function to send SOL
 * @param {number} totalRewardPool - Total reward pool in SOL (optional, uses accumulated pool if not provided)
 * @returns {Promise<{ok: boolean, message?: string, error?: string, totalDistributed?: number}>}
 */
export async function distributeRewards(
  rpsLeaderboard,
  rewardPool,
  rewardBannedWallets,
  REWARD_DISTRIBUTION_WALLET,
  REWARD_PERCENTAGES,
  sendSol,
  totalRewardPool = null
) {
  try {
    const poolToDistribute = totalRewardPool !== null ? totalRewardPool : rewardPool;
    
    if (poolToDistribute <= 0) {
      return {
        ok: false,
        error: "Reward pool is empty",
        message: "No rewards to distribute",
      };
    }
    
    // Get top 5 players
    const leaderboardArray = Array.from(rpsLeaderboard.entries())
      .map(([wallet, stats]) => ({
        wallet: wallet,
        totalWon: stats.totalWon || 0,
        totalSolWon: stats.totalSolWon || 0,
      }))
      .sort((a, b) => (b.totalWon || 0) - (a.totalWon || 0))
      .slice(0, 5);
    
    if (leaderboardArray.length === 0) {
      return {
        ok: false,
        error: "No players in leaderboard",
        message: "Cannot distribute rewards - no players found",
      };
    }
    
    // Check if private key is configured
    const privateKey = process.env.REWARD_SENDER_PRIVATE_KEY;
    if (!privateKey || privateKey === "your_private_key_here") {
      return {
        ok: false,
        error: "REWARD_SENDER_PRIVATE_KEY not configured",
        message: "Cannot distribute rewards - private key not set",
      };
    }
    
    let totalDistributed = 0;
    const distributions = [];
    
    // Distribute to top 5 players
    for (let i = 0; i < leaderboardArray.length; i++) {
      const rank = i + 1;
      const player = leaderboardArray[i];
      const percentage = REWARD_PERCENTAGES[rank];
      const amount = poolToDistribute * percentage;
      
      if (amount > 0) {
        // Check if wallet is reward banned
        if (rewardBannedWallets.has(player.wallet)) {
          log.warn(`[rps] Skipping reward for banned wallet: ${player.wallet.substring(0, 8)}...`);
          continue;
        }
        
        const signature = await sendSol(player.wallet, amount);
        if (signature) {
          totalDistributed += amount;
          distributions.push({
            rank: rank,
            wallet: player.wallet,
            amount: amount,
            signature: signature,
          });
        }
      }
    }
    
    // Distribute remaining 60% to distribution wallet
    if (REWARD_DISTRIBUTION_WALLET) {
      const remainingAmount = poolToDistribute * REWARD_PERCENTAGES.remaining;
      if (remainingAmount > 0) {
        const signature = await sendSol(REWARD_DISTRIBUTION_WALLET, remainingAmount);
        if (signature) {
          totalDistributed += remainingAmount;
          distributions.push({
            rank: "distribution",
            wallet: REWARD_DISTRIBUTION_WALLET,
            amount: remainingAmount,
            signature: signature,
          });
        }
      }
    }
    
    return {
      ok: true,
      message: `Distributed ${totalDistributed.toFixed(6)} SOL to ${distributions.length} recipients`,
      totalDistributed: totalDistributed,
      distributions: distributions,
    };
  } catch (error) {
    log.error("[rps] Error distributing rewards:", error);
    return {
      ok: false,
      error: error.message,
      message: "Failed to distribute rewards",
    };
  }
}











