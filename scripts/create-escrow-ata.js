// Script to create escrow ATA manually
import dotenv from "dotenv";
import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import bs58 from "bs58";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const DEPOSIT_ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET || "FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU";
const DEPOSIT_ESCROW_PRIVATE_KEY = process.env.DEPOSIT_ESCROW_PRIVATE_KEY;
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;

async function createEscrowAta() {
  if (!LUNA_TOKEN_MINT) {
    console.error("❌ LUNA_TOKEN_MINT is not set in environment variables");
    console.log("   Please set LUNA_TOKEN_MINT in your .env file");
    return;
  }

  if (!DEPOSIT_ESCROW_PRIVATE_KEY) {
    console.error("❌ DEPOSIT_ESCROW_PRIVATE_KEY is not set in environment variables");
    console.log("   Please set DEPOSIT_ESCROW_PRIVATE_KEY in your .env file");
    console.log("   This is the private key of the escrow wallet (base58 encoded)");
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    const escrowPublicKey = new PublicKey(DEPOSIT_ESCROW_WALLET);

    // Decode private key
    let escrowKeypair;
    try {
      escrowKeypair = Keypair.fromSecretKey(bs58.decode(DEPOSIT_ESCROW_PRIVATE_KEY));
    } catch (error) {
      console.error("❌ Invalid DEPOSIT_ESCROW_PRIVATE_KEY format");
      console.log("   Make sure it's base58 encoded");
      return;
    }

    // Verify the keypair matches the wallet
    if (escrowKeypair.publicKey.toBase58() !== DEPOSIT_ESCROW_WALLET) {
      console.error("❌ DEPOSIT_ESCROW_PRIVATE_KEY does not match DEPOSIT_ESCROW_WALLET");
      console.log(`   Expected: ${DEPOSIT_ESCROW_WALLET}`);
      console.log(`   Got: ${escrowKeypair.publicKey.toBase58()}`);
      return;
    }

    // Verify mint account exists and check which token program it uses
    console.log("🔍 Checking mint account...");
    let mintInfo;
    try {
      mintInfo = await connection.getAccountInfo(mintPublicKey);
      if (!mintInfo) {
        console.error("❌ Mint account does not exist!");
        console.log(`   Mint: ${LUNA_TOKEN_MINT}`);
        return;
      }
    } catch (error) {
      console.error("❌ Error verifying mint account:", error.message);
      return;
    }
    
    // Check which token program this mint uses
    const mintOwner = mintInfo.owner.toBase58();
    const isToken2022 = mintOwner === TOKEN_2022_PROGRAM_ID.toBase58();
    const isTokenProgram = mintOwner === TOKEN_PROGRAM_ID.toBase58();
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    
    console.log(`✅ Mint account verified`);
    console.log(`   Owner: ${mintOwner}`);
    if (isToken2022) {
      console.log(`   ⚠️  This mint uses Token-2022 Program`);
    } else if (isTokenProgram) {
      console.log(`   ✅ This mint uses standard Token Program`);
    } else {
      console.log(`   ⚠️  Unknown token program: ${mintOwner}`);
      console.log(`   ⚠️  Will use standard Token Program`);
    }

    // Calculate escrow ATA address using the correct token program
    const escrowTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      escrowPublicKey,
      false,
      tokenProgramId
    );

    console.log("\n📋 Creating Escrow ATA:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Escrow Wallet: ${DEPOSIT_ESCROW_WALLET}`);
    console.log(`Luna Token Mint: ${LUNA_TOKEN_MINT}`);
    console.log(`Escrow ATA Address: ${escrowTokenAccount.toBase58()}`);
    console.log(`Token Program: ${isToken2022 ? 'Token-2022' : 'Token'}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Check if ATA already exists
    const accountInfo = await connection.getAccountInfo(escrowTokenAccount);
    if (accountInfo) {
      console.log("✅ Escrow ATA already exists!");
      console.log(`   Address: ${escrowTokenAccount.toBase58()}`);
      return;
    }

    // Check escrow wallet SOL balance
    const escrowBalance = await connection.getBalance(escrowKeypair.publicKey);
    const solBalance = escrowBalance / 1e9;
    console.log(`💰 Escrow Wallet SOL Balance: ${solBalance} SOL (${escrowBalance} lamports)`);

    if (escrowBalance < 5000) {
      console.error("❌ Insufficient SOL in escrow wallet!");
      console.log("   Minimum needed: 0.000005 SOL (5000 lamports)");
      console.log("   Recommended: 0.001 SOL for safety");
      console.log(`   Current: ${solBalance} SOL`);
      return;
    }

    console.log("🚀 Creating Escrow ATA...");

    // Create transaction with instruction
    // Parameter order for createAssociatedTokenAccountInstruction:
    // payer, ata, owner, mint, programId (optional)
    console.log("📝 Creating instruction...");
    const instruction = createAssociatedTokenAccountInstruction(
      escrowKeypair.publicKey, // payer (who pays for the account creation)
      escrowTokenAccount,      // ata (the ATA address to create)
      escrowPublicKey,         // owner (who owns the token account)
      mintPublicKey,           // mint (the token mint)
      tokenProgramId           // token program ID (Token or Token-2022)
    );
    
    console.log(`   Program ID: ${instruction.programId.toBase58()}`);
    console.log(`   Keys: ${instruction.keys.length} accounts`);
    
    const tx = new Transaction().add(instruction);

    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [escrowKeypair],
      {
        commitment: "confirmed",
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    console.log("\n✅ Escrow ATA created successfully!");
    console.log(`   Transaction: ${signature}`);
    console.log(`   ATA Address: ${escrowTokenAccount.toBase58()}`);
    console.log("\n💡 You can now restart your server and deposits should work!");

  } catch (error) {
    console.error("\n❌ Error creating escrow ATA:", error.message);
    if (error.message.includes("insufficient funds")) {
      console.log("\n💡 Solution: Send more SOL to the escrow wallet");
    } else if (error.message.includes("already in use")) {
      console.log("\n💡 The ATA might already exist, checking...");
      // Re-check
      const connection = new Connection(RPC_URL, "confirmed");
      const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
      const escrowPublicKey = new PublicKey(DEPOSIT_ESCROW_WALLET);
      const escrowTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        escrowPublicKey,
        false
      );
      const accountInfo = await connection.getAccountInfo(escrowTokenAccount);
      if (accountInfo) {
        console.log("✅ Escrow ATA exists!");
      }
    }
  }
}

createEscrowAta();

