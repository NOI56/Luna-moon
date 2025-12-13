// Script to create burn ATA manually
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
const DEPOSIT_ESCROW_PRIVATE_KEY = process.env.DEPOSIT_ESCROW_PRIVATE_KEY;
const DEPOSIT_BURN_WALLET = process.env.DEPOSIT_BURN_WALLET || "1nc1nerator11111111111111111111111111111111";
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;

async function getTokenProgramIdForMint(mintPublicKey) {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintInfo) {
      console.error("❌ Mint account does not exist!");
      return TOKEN_PROGRAM_ID; // Fallback
    }
    const mintOwner = mintInfo.owner.toBase58();
    const TOKEN_2022_PROGRAM_ID_STR = TOKEN_2022_PROGRAM_ID.toBase58();
    return mintOwner === TOKEN_2022_PROGRAM_ID_STR ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  } catch (error) {
    console.warn("⚠️  Failed to fetch mint owner to determine token program. Falling back to Token Program.", error.message);
    return TOKEN_PROGRAM_ID;
  }
}

async function createBurnAta() {
  if (!DEPOSIT_ESCROW_PRIVATE_KEY) {
    console.error("❌ DEPOSIT_ESCROW_PRIVATE_KEY is not set in environment variables");
    return;
  }

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
    const escrowKeypair = Keypair.fromSecretKey(bs58.decode(DEPOSIT_ESCROW_PRIVATE_KEY));
    const escrowPublicKey = escrowKeypair.publicKey;
    const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    const burnWalletPublicKey = new PublicKey(DEPOSIT_BURN_WALLET);

    // Check mint account
    console.log("🔍 Checking mint account...");
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintInfo) {
      console.error("❌ Mint account does not exist!");
      return;
    }
    const mintOwner = mintInfo.owner.toBase58();
    const isToken2022 = mintOwner === TOKEN_2022_PROGRAM_ID.toBase58();
    console.log("✅ Mint account verified");
    console.log(`   Owner: ${mintOwner}`);
    if (isToken2022) {
      console.log("   ⚠️  This mint uses Token-2022 Program");
    }

    // Determine which token program to use
    const tokenProgramId = await getTokenProgramIdForMint(mintPublicKey);

    // Calculate burn ATA address using the correct token program
    const burnTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      burnWalletPublicKey,
      true, // allowOwnerOffCurve for incinerator
      tokenProgramId
    );

    console.log("\n📋 Creating Burn ATA:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Escrow Wallet: ${escrowPublicKey.toBase58()}`);
    console.log(`Burn Wallet: ${DEPOSIT_BURN_WALLET}`);
    console.log(`Luna Token Mint: ${LUNA_TOKEN_MINT}`);
    console.log(`Burn ATA Address: ${burnTokenAccount.toBase58()}`);
    console.log(`Token Program: ${isToken2022 ? 'Token-2022' : 'Token'}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Check if ATA already exists
    const accountInfo = await connection.getAccountInfo(burnTokenAccount);
    if (accountInfo) {
      console.log("✅ Burn ATA already exists!");
      console.log(`   Address: ${burnTokenAccount.toBase58()}`);
      return;
    }

    // Check if escrow wallet has SOL
    const escrowBalance = await connection.getBalance(escrowPublicKey);
    console.log(`💰 Escrow Wallet SOL Balance: ${escrowBalance / 1e9} SOL (${escrowBalance} lamports)`);
    if (escrowBalance < 5000) {
      console.error("❌ Escrow wallet has insufficient SOL (need at least 0.000005 SOL)");
      return;
    }
    console.log("✅ Escrow wallet has sufficient SOL\n");

    // Create ATA instruction
    const instruction = createAssociatedTokenAccountInstruction(
      escrowKeypair.publicKey, // payer
      burnTokenAccount,         // ata
      burnWalletPublicKey,      // owner (incinerator)
      mintPublicKey,            // mint
      tokenProgramId            // token program ID
    );

    const tx = new Transaction().add(instruction);
    console.log("📤 Sending transaction to create burn ATA...");
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [escrowKeypair],
      {
        commitment: "confirmed",
        skipPreflight: false
      }
    );

    console.log("\n✅ Burn ATA created successfully!");
    console.log(`   Transaction Signature: ${signature}`);
    console.log(`   Burn ATA Address: ${burnTokenAccount.toBase58()}`);
    console.log(`   View on Solana Explorer: https://solscan.io/tx/${signature}`);

  } catch (error) {
    console.error("❌ Error creating burn ATA:", error.message);
    if (error.logs) {
      console.error("Transaction logs:", error.logs);
    }
  }
}

createBurnAta();











