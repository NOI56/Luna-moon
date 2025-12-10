// Script to create destination token account (ATA) for receiving Luna tokens
// This must be run BEFORE withdraw-escrow-tokens.js if destination ATA doesn't exist
import dotenv from "dotenv";
import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";
import bs58 from "bs58";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const DESTINATION_WALLET = process.argv[2] || process.env.WITHDRAW_DESTINATION_WALLET;
const DESTINATION_PRIVATE_KEY = process.env.DESTINATION_PRIVATE_KEY; // Optional: if you have private key
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;

async function createDestinationAta() {
  if (!LUNA_TOKEN_MINT) {
    console.error("❌ LUNA_TOKEN_MINT is not set in environment variables");
    return;
  }

  if (!DESTINATION_WALLET) {
    console.error("❌ Destination wallet is not provided");
    console.log("\n💡 Usage:");
    console.log("   node scripts/create-destination-ata.js <destination_wallet_address>");
    console.log("\n   Or set in .env:");
    console.log("   WITHDRAW_DESTINATION_WALLET=<destination_wallet_address>");
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    let destinationPublicKey;
    try {
      destinationPublicKey = new PublicKey(DESTINATION_WALLET);
    } catch (error) {
      console.error("❌ Invalid destination wallet address");
      return;
    }

    // Check which token program the mint uses
    const mintInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintInfo) {
      console.error("❌ Mint account does not exist!");
      return;
    }

    const mintOwner = mintInfo.owner.toBase58();
    const isToken2022 = mintOwner === TOKEN_2022_PROGRAM_ID.toBase58();
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    // Calculate destination token account (ATA)
    const destinationTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      destinationPublicKey,
      false,
      tokenProgramId
    );

    console.log("🔍 Checking destination token account...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Destination Wallet: ${DESTINATION_WALLET}`);
    console.log(`Luna Token Mint: ${LUNA_TOKEN_MINT}`);
    console.log(`Token Account (ATA): ${destinationTokenAccount.toBase58()}`);
    console.log(`Token Program: ${isToken2022 ? 'Token-2022' : 'Token'}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Check if ATA already exists
    try {
      await getAccount(connection, destinationTokenAccount, "confirmed", tokenProgramId);
      console.log("✅ Token account already exists!");
      console.log(`   Address: ${destinationTokenAccount.toBase58()}`);
      console.log("\n💡 You can now run withdraw-escrow-tokens.js");
      return;
    } catch (error) {
      console.log("⚠️  Token account does not exist - will create it\n");
    }

    // Check if we have private key
    let destinationKeypair = null;
    if (DESTINATION_PRIVATE_KEY) {
      try {
        destinationKeypair = Keypair.fromSecretKey(bs58.decode(DESTINATION_PRIVATE_KEY));
        if (destinationKeypair.publicKey.toBase58() !== DESTINATION_WALLET) {
          console.error("❌ DESTINATION_PRIVATE_KEY does not match DESTINATION_WALLET");
          destinationKeypair = null;
        }
      } catch (error) {
        console.warn("⚠️  Invalid DESTINATION_PRIVATE_KEY, will need manual creation");
      }
    }

    if (!destinationKeypair) {
      console.log("📋 Manual Creation Required:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Since we don't have the destination wallet's private key,");
      console.log("you need to create the token account manually:");
      console.log("\n💡 Option 1: Use Phantom Wallet");
      console.log("   1. Open Phantom wallet");
      console.log("   2. Go to your wallet");
      console.log("   3. Click 'Receive' or 'Add Token'");
      console.log("   4. Add Luna token (paste mint address):");
      console.log(`      ${LUNA_TOKEN_MINT}`);
      console.log("\n💡 Option 2: Send a small amount of Luna token");
      console.log("   Sending any amount will automatically create the token account");
      console.log("\n💡 Option 3: Use Solana CLI");
      console.log(`   solana create-token-account ${destinationTokenAccount.toBase58()} \\`);
      console.log(`     --owner ${DESTINATION_WALLET} \\`);
      console.log(`     --mint ${LUNA_TOKEN_MINT}`);
      return;
    }

    // Check SOL balance
    const solBalance = await connection.getBalance(destinationPublicKey);
    const solBalanceUi = solBalance / 1e9;
    console.log(`💰 Destination Wallet SOL Balance: ${solBalanceUi} SOL`);

    if (solBalance < 5000) {
      console.error("❌ Insufficient SOL for creating token account!");
      console.log("   Minimum needed: 0.000005 SOL (5000 lamports)");
      console.log("   Recommended: 0.001 SOL for safety");
      return;
    }

    // Create ATA
    console.log("\n🚀 Creating token account...");
    const instruction = createAssociatedTokenAccountInstruction(
      destinationPublicKey, // payer (destination wallet pays for creation)
      destinationTokenAccount,
      destinationPublicKey,
      mintPublicKey,
      tokenProgramId
    );

    const tx = new Transaction().add(instruction);
    tx.feePayer = destinationPublicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [destinationKeypair],
      {
        commitment: "confirmed",
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    console.log("\n✅ Token account created successfully!");
    console.log(`Transaction: ${signature}`);
    console.log(`Token Account: ${destinationTokenAccount.toBase58()}`);
    console.log("\n💡 You can now run withdraw-escrow-tokens.js");

  } catch (error) {
    console.error("\n❌ Error creating token account:", error.message);
    console.error(error);
  }
}

createDestinationAta();



