// Script to check Luna token balance in escrow wallet
import dotenv from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET || "FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU";
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;

async function checkEscrowBalance() {
  if (!LUNA_TOKEN_MINT) {
    console.error("❌ LUNA_TOKEN_MINT is not set in environment variables");
    console.log("   Please set LUNA_TOKEN_MINT in your .env file");
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    const escrowPublicKey = new PublicKey(ESCROW_WALLET);

    // Get token account
    const escrowTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      escrowPublicKey,
      false
    );

    console.log("🔍 Checking Escrow Wallet Balance...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Escrow Wallet: ${ESCROW_WALLET}`);
    console.log(`Luna Token Mint: ${LUNA_TOKEN_MINT}`);
    console.log(`Token Account (ATA): ${escrowTokenAccount.toBase58()}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Check which token program the mint uses
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintInfo) {
      console.error("❌ Mint account does not exist!");
      return;
    }

    const mintOwner = mintInfo.owner.toBase58();
    const isToken2022 = mintOwner === TOKEN_2022_PROGRAM_ID.toBase58();
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const decimals = mintInfo.data[44]; // Decimals are at offset 44

    console.log(`Token Program: ${isToken2022 ? 'Token-2022' : 'Token'}`);
    console.log(`Decimals: ${decimals}\n`);

    // Check token balance
    try {
      const tokenAccountInfo = await getAccount(connection, escrowTokenAccount, "confirmed", tokenProgramId);
      const rawBalance = tokenAccountInfo.amount;
      const uiBalance = Number(rawBalance) / Math.pow(10, decimals);

      console.log("💰 Token Balance:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`Raw Amount: ${rawBalance.toString()}`);
      console.log(`UI Amount: ${uiBalance.toLocaleString()} Luna`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      if (rawBalance === 0n) {
        console.log("⚠️  No tokens in escrow wallet");
      } else {
        console.log(`✅ Escrow wallet has ${uiBalance.toLocaleString()} Luna tokens`);
        console.log("\n💡 To withdraw tokens, run:");
        console.log(`   node scripts/withdraw-escrow-tokens.js <destination_wallet_address>`);
      }
    } catch (error) {
      console.error("❌ Token account does not exist or has no balance");
      console.log(`   Error: ${error.message}`);
      console.log("\n💡 This means:");
      console.log("   - Token account (ATA) has not been created yet");
      console.log("   - Or there are no tokens in the escrow wallet");
    }

    // Check SOL balance
    const solBalance = await connection.getBalance(escrowPublicKey);
    const solBalanceUi = solBalance / 1e9;
    console.log("\n💰 SOL Balance:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`${solBalanceUi} SOL (${solBalance} lamports)`);
    if (solBalance < 5000) {
      console.log("⚠️  Low SOL balance - may need more for transaction fees");
    } else {
      console.log("✅ Sufficient SOL for transaction fees");
    }

  } catch (error) {
    console.error("\n❌ Error checking balance:", error.message);
    console.error(error);
  }
}

checkEscrowBalance();



