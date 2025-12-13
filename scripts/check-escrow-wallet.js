// Script to check escrow wallet account type and properties
import dotenv from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const DEPOSIT_ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET || "FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU";

async function checkEscrowWallet() {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const escrowPublicKey = new PublicKey(DEPOSIT_ESCROW_WALLET);

    console.log("🔍 Checking Escrow Wallet Account...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Wallet Address: ${DEPOSIT_ESCROW_WALLET}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Get account info
    const accountInfo = await connection.getAccountInfo(escrowPublicKey);
    
    if (!accountInfo) {
      console.log("❌ Account does not exist on-chain!");
      return;
    }

    console.log("✅ Account exists on-chain\n");
    console.log("📋 Account Information:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Owner Program: ${accountInfo.owner.toBase58()}`);
    console.log(`Data Length: ${accountInfo.data.length} bytes`);
    console.log(`Executable: ${accountInfo.executable}`);
    console.log(`Lamports: ${accountInfo.lamports} (${accountInfo.lamports / 1e9} SOL)`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Check if it's owned by System Program
    const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
    const isSystemOwned = accountInfo.owner.toBase58() === SYSTEM_PROGRAM_ID;
    
    if (isSystemOwned) {
      console.log("✅ Account is owned by System Program");
      
      if (accountInfo.data.length > 0) {
        console.log("⚠️  WARNING: Account has data but is owned by System Program");
        console.log("   This means it's NOT a standard wallet account.");
        console.log("   Accounts with data cannot use System Program transfers directly.");
        console.log("\n💡 Solution:");
        console.log("   - Use Token Transfer instead of SOL Transfer");
        console.log("   - Or use the program that owns the account to transfer");
        console.log("   - This wallet should only be used for token operations, not SOL transfers");
      } else {
        console.log("✅ Account is a standard wallet (no data)");
        console.log("   This wallet can be used for SOL transfers normally.");
      }
    } else {
      console.log(`⚠️  Account is owned by Program: ${accountInfo.owner.toBase58()}`);
      console.log("   This is a Program Derived Account (PDA) or program-owned account.");
      console.log("   Cannot use System Program transfers directly.");
      console.log("\n💡 Solution:");
      console.log("   - Must use the owning program to transfer funds");
      console.log("   - Or use Token Transfer for token operations");
    }

    // Check SOL balance
    const balance = accountInfo.lamports / 1e9;
    console.log("\n💰 SOL Balance:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`${balance} SOL (${accountInfo.lamports} lamports)`);
    
    if (balance < 0.001) {
      console.log("⚠️  Low SOL balance - may need more SOL for transaction fees");
    } else {
      console.log("✅ Sufficient SOL for transaction fees");
    }

    // Try to get parsed account info
    try {
      const parsedInfo = await connection.getParsedAccountInfo(escrowPublicKey);
      if (parsedInfo.value && parsedInfo.value.data && typeof parsedInfo.value.data === 'object') {
        console.log("\n📊 Parsed Account Data:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(JSON.stringify(parsedInfo.value.data, null, 2));
      }
    } catch (error) {
      // Not parseable, that's okay
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Check complete!");
    
  } catch (error) {
    console.error("\n❌ Error checking escrow wallet:", error.message);
    console.error(error);
  }
}

checkEscrowWallet();










