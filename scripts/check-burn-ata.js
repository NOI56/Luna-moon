// Script to check if burn ATA exists
import dotenv from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const DEPOSIT_BURN_WALLET = process.env.DEPOSIT_BURN_WALLET || "1nc1nerator11111111111111111111111111111111";
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;

async function checkBurnAta() {
  if (!LUNA_TOKEN_MINT) {
    console.error("❌ LUNA_TOKEN_MINT is not set in environment variables");
    return;
  }

  if (!DEPOSIT_BURN_WALLET) {
    console.error("❌ DEPOSIT_BURN_WALLET is not set in environment variables");
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    const burnWalletPublicKey = new PublicKey(DEPOSIT_BURN_WALLET);

    // Check which token program this mint uses
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintInfo) {
      console.error("❌ Mint account does not exist!");
      return;
    }
    
    const mintOwner = mintInfo.owner.toBase58();
    const isToken2022 = mintOwner === TOKEN_2022_PROGRAM_ID.toBase58();
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    // Calculate burn ATA address using the correct token program
    const burnTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      burnWalletPublicKey,
      true, // allowOwnerOffCurve for incinerator
      tokenProgramId
    );

    console.log("\n📋 Burn ATA Information:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Burn Wallet: ${DEPOSIT_BURN_WALLET}`);
    console.log(`Luna Token Mint: ${LUNA_TOKEN_MINT}`);
    console.log(`Token Program: ${isToken2022 ? 'Token-2022' : 'Token'}`);
    console.log(`Burn ATA Address: ${burnTokenAccount.toBase58()}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Check if ATA exists
    const accountInfo = await connection.getAccountInfo(burnTokenAccount);
    
    if (accountInfo) {
      console.log("✅ Burn ATA EXISTS!");
      console.log(`   Account Data Size: ${accountInfo.data.length} bytes`);
      console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
      
      // Try to get token balance
      try {
        const tokenAccountInfo = await connection.getParsedAccountInfo(burnTokenAccount);
        const parsed = tokenAccountInfo.value?.data?.parsed;
        if (parsed?.info?.tokenAmount) {
          const balance = parsed.info.tokenAmount.uiAmount;
          console.log(`   Balance: ${balance} Luna tokens`);
        }
      } catch (e) {
        console.log("   (Could not parse token balance)");
      }
    } else {
      console.log("❌ Burn ATA DOES NOT EXIST!");
      console.log("\n⚠️  This means:");
      console.log("   - Burn transfers will fail with 'InvalidAccountData' or 'IncorrectProgramId' error");
      console.log("   - You need to create the burn ATA first");
      console.log("\n💡 Solution:");
      console.log("   1. Make sure DEPOSIT_ESCROW_PRIVATE_KEY is set");
      console.log("   2. Make sure escrow wallet has SOL (at least 0.001 SOL)");
      console.log("   3. Restart the server - it will create burn ATA automatically");
    }

  } catch (error) {
    console.error("❌ Error checking burn ATA:", error.message);
  }
}

checkBurnAta();











