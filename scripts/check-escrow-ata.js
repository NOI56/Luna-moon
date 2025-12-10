// Script to check if escrow ATA exists
import dotenv from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const DEPOSIT_ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET || "FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8RU";
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;

async function checkEscrowAta() {
  if (!LUNA_TOKEN_MINT) {
    console.error("❌ LUNA_TOKEN_MINT is not set in environment variables");
    return;
  }

  if (!DEPOSIT_ESCROW_WALLET) {
    console.error("❌ DEPOSIT_ESCROW_WALLET is not set in environment variables");
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    const escrowPublicKey = new PublicKey(DEPOSIT_ESCROW_WALLET);

    // Calculate escrow ATA address
    const escrowTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      escrowPublicKey,
      false
    );

    console.log("\n📋 Escrow ATA Information:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Escrow Wallet: ${DEPOSIT_ESCROW_WALLET}`);
    console.log(`Luna Token Mint: ${LUNA_TOKEN_MINT}`);
    console.log(`Escrow ATA Address: ${escrowTokenAccount.toBase58()}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Check if ATA exists
    const accountInfo = await connection.getAccountInfo(escrowTokenAccount);
    
    if (accountInfo) {
      console.log("✅ Escrow ATA EXISTS!");
      console.log(`   Account Data Size: ${accountInfo.data.length} bytes`);
      console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
      
      // Try to get token balance
      try {
        const tokenAccountInfo = await connection.getParsedAccountInfo(escrowTokenAccount);
        const parsed = tokenAccountInfo.value?.data?.parsed;
        if (parsed?.info?.tokenAmount) {
          const balance = parsed.info.tokenAmount.uiAmount;
          console.log(`   Balance: ${balance} Luna tokens`);
        }
      } catch (e) {
        console.log("   (Could not parse token balance)");
      }
    } else {
      console.log("❌ Escrow ATA DOES NOT EXIST!");
      console.log("\n⚠️  This means:");
      console.log("   - Deposits will fail with 'InvalidAccountData' error");
      console.log("   - You need to create the ATA first");
      console.log("\n💡 Solution:");
      console.log("   1. Make sure DEPOSIT_ESCROW_PRIVATE_KEY is set");
      console.log("   2. Make sure escrow wallet has SOL (at least 0.001 SOL)");
      console.log("   3. Restart the server - it will create ATA automatically");
    }

    // Check escrow wallet SOL balance
    const escrowBalance = await connection.getBalance(escrowPublicKey);
    const solBalance = escrowBalance / 1e9;
    console.log(`\n💰 Escrow Wallet SOL Balance: ${solBalance} SOL (${escrowBalance} lamports)`);
    
    if (escrowBalance < 5000) {
      console.log("⚠️  WARNING: Escrow wallet has insufficient SOL!");
      console.log("   Minimum needed: 0.000005 SOL (5000 lamports)");
      console.log("   Recommended: 0.001 SOL for safety");
    } else {
      console.log("✅ Escrow wallet has sufficient SOL");
    }

  } catch (error) {
    console.error("❌ Error checking escrow ATA:", error.message);
  }
}

checkEscrowAta();




