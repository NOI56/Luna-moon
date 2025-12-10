// Script to transfer tokens from old escrow wallet to new wallet
import dotenv from "dotenv";
import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";
import bs58 from "bs58";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const OLD_ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET || "FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU";
const OLD_ESCROW_PRIVATE_KEY = process.env.DEPOSIT_ESCROW_PRIVATE_KEY;
const NEW_ESCROW_WALLET = process.env.NEW_ESCROW_WALLET; // Set this in .env
const NEW_ESCROW_PRIVATE_KEY = process.env.NEW_ESCROW_PRIVATE_KEY; // Set this in .env
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;

async function transferEscrowTokens() {
  if (!LUNA_TOKEN_MINT) {
    console.error("❌ LUNA_TOKEN_MINT is not set in environment variables");
    return;
  }

  if (!OLD_ESCROW_PRIVATE_KEY) {
    console.error("❌ DEPOSIT_ESCROW_PRIVATE_KEY is not set");
    return;
  }

  if (!NEW_ESCROW_WALLET || !NEW_ESCROW_PRIVATE_KEY) {
    console.error("❌ NEW_ESCROW_WALLET or NEW_ESCROW_PRIVATE_KEY is not set");
    console.log("   Please set these in your .env file:");
    console.log("   NEW_ESCROW_WALLET=<new_wallet_address>");
    console.log("   NEW_ESCROW_PRIVATE_KEY=<new_wallet_private_key_base58>");
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    const oldEscrowPublicKey = new PublicKey(OLD_ESCROW_WALLET);
    const newEscrowPublicKey = new PublicKey(NEW_ESCROW_WALLET);

    // Decode keypairs
    let oldEscrowKeypair;
    let newEscrowKeypair;
    try {
      oldEscrowKeypair = Keypair.fromSecretKey(bs58.decode(OLD_ESCROW_PRIVATE_KEY));
      newEscrowKeypair = Keypair.fromSecretKey(bs58.decode(NEW_ESCROW_PRIVATE_KEY));
    } catch (error) {
      console.error("❌ Invalid private key format");
      return;
    }

    // Verify keypairs match wallets
    if (oldEscrowKeypair.publicKey.toBase58() !== OLD_ESCROW_WALLET) {
      console.error("❌ OLD_ESCROW_PRIVATE_KEY does not match OLD_ESCROW_WALLET");
      return;
    }

    if (newEscrowKeypair.publicKey.toBase58() !== NEW_ESCROW_WALLET) {
      console.error("❌ NEW_ESCROW_PRIVATE_KEY does not match NEW_ESCROW_WALLET");
      return;
    }

    // Get token accounts
    const oldEscrowTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      oldEscrowPublicKey,
      false
    );
    const newEscrowTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      newEscrowPublicKey,
      false
    );

    console.log("🔍 Checking token balances...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Old Escrow Wallet: ${OLD_ESCROW_WALLET}`);
    console.log(`New Escrow Wallet: ${NEW_ESCROW_WALLET}`);
    console.log(`Old Escrow ATA: ${oldEscrowTokenAccount.toBase58()}`);
    console.log(`New Escrow ATA: ${newEscrowTokenAccount.toBase58()}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Check old escrow token balance
    let oldBalance = 0n;
    try {
      const oldTokenAccount = await getAccount(connection, oldEscrowTokenAccount);
      oldBalance = oldTokenAccount.amount;
      console.log(`💰 Old Escrow Token Balance: ${oldBalance.toString()}`);
    } catch (error) {
      console.error("❌ Old escrow token account does not exist or has no balance");
      return;
    }

    if (oldBalance === 0n) {
      console.log("✅ No tokens to transfer");
      return;
    }

    // Check if new escrow ATA exists
    let newAtaExists = false;
    try {
      await getAccount(connection, newEscrowTokenAccount);
      newAtaExists = true;
      console.log("✅ New escrow ATA already exists");
    } catch (error) {
      console.log("⚠️  New escrow ATA does not exist - will be created");
    }

    // Check which token program the mint uses
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintInfo) {
      console.error("❌ Mint account does not exist");
      return;
    }

    const mintOwner = mintInfo.owner.toBase58();
    const isToken2022 = mintOwner === TOKEN_2022_PROGRAM_ID.toBase58();
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    console.log(`\n📋 Transfer Details:`);
    console.log(`Token Program: ${isToken2022 ? 'Token-2022' : 'Token'}`);
    console.log(`Amount: ${oldBalance.toString()} (raw)`);
    console.log(`\n⚠️  Are you sure you want to transfer all tokens?`);
    console.log(`   This will move all Luna tokens from old escrow to new escrow.`);
    console.log(`   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n`);

    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Create transfer instruction
    const instructions = [];

    // Create new ATA if needed
    if (!newAtaExists) {
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      instructions.push(
        createAssociatedTokenAccountInstruction(
          oldEscrowPublicKey, // payer
          newEscrowTokenAccount,
          newEscrowPublicKey,
          mintPublicKey,
          tokenProgramId
        )
      );
    }

    // Add transfer instruction
    instructions.push(
      createTransferInstruction(
        oldEscrowTokenAccount,
        newEscrowTokenAccount,
        oldEscrowPublicKey,
        Number(oldBalance),
        [],
        tokenProgramId
      )
    );

    // Build and send transaction
    const tx = new Transaction();
    tx.feePayer = oldEscrowPublicKey;
    instructions.forEach(ix => tx.add(ix));

    console.log("🚀 Sending transfer transaction...");
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [oldEscrowKeypair],
      {
        commitment: "confirmed",
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    console.log("\n✅ Transfer completed successfully!");
    console.log(`Transaction: ${signature}`);
    console.log(`\n💡 Next steps:`);
    console.log(`1. Update .env file:`);
    console.log(`   DEPOSIT_ESCROW_WALLET=${NEW_ESCROW_WALLET}`);
    console.log(`   DEPOSIT_ESCROW_PRIVATE_KEY=${NEW_ESCROW_PRIVATE_KEY}`);
    console.log(`2. Restart your server`);

  } catch (error) {
    console.error("\n❌ Error transferring tokens:", error.message);
    console.error(error);
  }
}

transferEscrowTokens();



