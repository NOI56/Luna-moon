// Script to withdraw Luna tokens from escrow wallet
import dotenv from "dotenv";
import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";
import bs58 from "bs58";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET || "FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU";
const ESCROW_PRIVATE_KEY = process.env.DEPOSIT_ESCROW_PRIVATE_KEY;
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;

// Get destination wallet from command line argument or environment
const DESTINATION_WALLET = process.argv[2] || process.env.WITHDRAW_DESTINATION_WALLET;

async function withdrawEscrowTokens() {
  if (!LUNA_TOKEN_MINT) {
    console.error("❌ LUNA_TOKEN_MINT is not set in environment variables");
    console.log("   Please set LUNA_TOKEN_MINT in your .env file");
    return;
  }

  if (!ESCROW_PRIVATE_KEY) {
    console.error("❌ DEPOSIT_ESCROW_PRIVATE_KEY is not set in environment variables");
    console.log("   Please set DEPOSIT_ESCROW_PRIVATE_KEY in your .env file");
    return;
  }

  if (!DESTINATION_WALLET) {
    console.error("❌ Destination wallet is not provided");
    console.log("\n💡 Usage:");
    console.log("   node scripts/withdraw-escrow-tokens.js <destination_wallet_address>");
    console.log("\n   Or set in .env:");
    console.log("   WITHDRAW_DESTINATION_WALLET=<destination_wallet_address>");
    return;
  }

  // Validate that destination is not a token mint address
  if (DESTINATION_WALLET === LUNA_TOKEN_MINT) {
    console.error("❌ Error: Destination address is the same as Luna Token Mint!");
    console.log("\n💡 You provided the token mint address instead of a wallet address.");
    console.log(`   Token Mint: ${LUNA_TOKEN_MINT}`);
    console.log(`   You need to provide a WALLET ADDRESS (not token mint address)`);
    console.log("\n   Example wallet address format: 2b7wNjkNuCw5WVSoczA2xTrgkAv2ccDwCKee4z4Hacvr");
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPublicKey = new PublicKey(LUNA_TOKEN_MINT);
    const escrowPublicKey = new PublicKey(ESCROW_WALLET);
    let destinationPublicKey;
    try {
      destinationPublicKey = new PublicKey(DESTINATION_WALLET);
    } catch (error) {
      console.error("❌ Invalid destination wallet address format");
      console.log(`   Provided: ${DESTINATION_WALLET}`);
      console.log("   Please provide a valid Solana wallet address");
      return;
    }

    // Decode escrow keypair
    let escrowKeypair;
    try {
      escrowKeypair = Keypair.fromSecretKey(bs58.decode(ESCROW_PRIVATE_KEY));
    } catch (error) {
      console.error("❌ Invalid DEPOSIT_ESCROW_PRIVATE_KEY format");
      console.log("   Make sure it's base58 encoded");
      return;
    }

    // Verify keypair matches wallet
    if (escrowKeypair.publicKey.toBase58() !== ESCROW_WALLET) {
      console.error("❌ DEPOSIT_ESCROW_PRIVATE_KEY does not match DEPOSIT_ESCROW_WALLET");
      console.log(`   Expected: ${ESCROW_WALLET}`);
      console.log(`   Got: ${escrowKeypair.publicKey.toBase58()}`);
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
    const decimals = mintInfo.data[44]; // Decimals are at offset 44 in mint account

    console.log("🔍 Finding Luna token account in escrow wallet...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Escrow Wallet: ${ESCROW_WALLET}`);
    console.log(`Destination Wallet: ${DESTINATION_WALLET}`);
    console.log(`Luna Token Mint: ${LUNA_TOKEN_MINT}`);
    console.log(`Token Program: ${isToken2022 ? 'Token-2022' : 'Token'}`);
    console.log(`Decimals: ${decimals}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Find actual token account (not just ATA)
    let escrowTokenAccount = null;
    let escrowBalance = 0n;
    let escrowBalanceUi = 0;

    try {
      // Get all token accounts owned by escrow wallet
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        escrowPublicKey,
        {
          programId: tokenProgramId,
        }
      );

      // Find Luna token account
      for (const account of tokenAccounts.value) {
        const parsedInfo = account.account.data.parsed.info;
        if (parsedInfo.mint === LUNA_TOKEN_MINT) {
          escrowTokenAccount = new PublicKey(account.pubkey);
          escrowBalance = BigInt(parsedInfo.tokenAmount.amount);
          escrowBalanceUi = parseFloat(parsedInfo.tokenAmount.uiAmountString || '0');
          break;
        }
      }

      if (!escrowTokenAccount) {
        console.error("❌ Luna token account not found in escrow wallet");
        console.log("\n💡 Possible reasons:");
        console.log("   - No Luna tokens have been deposited yet");
        console.log("   - All tokens have been withdrawn");
        console.log("   - Token account was created with different method");
        return;
      }

      console.log(`✅ Found Luna token account: ${escrowTokenAccount.toBase58()}`);
      console.log(`💰 Escrow Token Balance: ${escrowBalanceUi.toLocaleString()} Luna (${escrowBalance.toString()} raw)\n`);
    } catch (error) {
      console.error("❌ Error finding token account:", error.message);
      return;
    }

    if (escrowBalance === 0n) {
      console.log("✅ No tokens to withdraw");
      return;
    }

    // Calculate destination token account (ATA)
    const destinationTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      destinationPublicKey,
      false,
      tokenProgramId
    );

    // Check if destination ATA exists
    let destinationAtaExists = false;
    try {
      await getAccount(connection, destinationTokenAccount, "confirmed", tokenProgramId);
      destinationAtaExists = true;
      console.log(`✅ Destination token account exists: ${destinationTokenAccount.toBase58()}`);
    } catch (error) {
      console.log(`⚠️  Destination token account does not exist: ${destinationTokenAccount.toBase58()}`);
      console.log("\n❌ Cannot create ATA automatically because escrow wallet is a Nonce Account");
      console.log("   (Nonce Accounts cannot use System Program transfers)");
      console.log("\n💡 Solution:");
      console.log("   1. Create the token account manually first, OR");
      console.log("   2. Use a different wallet that can receive tokens directly");
      console.log("\n   To create ATA manually, you can:");
      console.log("   - Use Phantom wallet: Send any amount of Luna token to your wallet");
      console.log("   - Use Solana CLI: solana create-token-account ...");
      console.log("   - Or use another script that uses a regular wallet as fee payer");
      return;
    }

    // Check escrow SOL balance for fees (only for transfer, not ATA creation)
    const escrowSolBalance = await connection.getBalance(escrowPublicKey);
    const escrowSolBalanceUi = escrowSolBalance / 1e9;
    console.log(`\n💰 Escrow SOL Balance: ${escrowSolBalanceUi} SOL (${escrowSolBalance} lamports)`);

    if (escrowSolBalance < 5000) {
      console.error("❌ Insufficient SOL in escrow wallet for transaction fees!");
      console.log("   Minimum needed: 0.000005 SOL (5000 lamports)");
      console.log("   Recommended: 0.001 SOL for safety");
      console.log(`   Current: ${escrowSolBalanceUi} SOL`);
      return;
    }

    // Ask for confirmation
    console.log("\n📋 Withdrawal Details:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Amount: ${escrowBalanceUi.toLocaleString()} Luna`);
    console.log(`From: ${ESCROW_WALLET}`);
    console.log(`To: ${DESTINATION_WALLET}`);
    console.log(`Destination Token Account: ${destinationTokenAccount.toBase58()}`);
    console.log(`ATA Exists: ${destinationAtaExists ? 'Yes ✅' : 'No ❌'}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n⚠️  Are you sure you want to withdraw ALL tokens?");
    console.log("   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n");

    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Build transaction
    // Note: We don't create ATA here because escrow wallet is Nonce Account
    // ATA must be created separately by destination wallet
    const instructions = [];

    // Add transfer instruction only (ATA must exist already)
    instructions.push(
      createTransferInstruction(
        escrowTokenAccount,
        destinationTokenAccount,
        escrowPublicKey,
        Number(escrowBalance),
        [],
        tokenProgramId
      )
    );

    // Build and send transaction
    const tx = new Transaction();
    tx.feePayer = escrowPublicKey;
    instructions.forEach(ix => tx.add(ix));

    console.log("🚀 Sending withdrawal transaction...");
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

    console.log("\n✅ Withdrawal completed successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Transaction: ${signature}`);
    console.log(`Amount: ${escrowBalanceUi.toLocaleString()} Luna`);
    console.log(`From: ${ESCROW_WALLET}`);
    console.log(`To: ${DESTINATION_WALLET}`);
    console.log(`View on Solscan: https://solscan.io/tx/${signature}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  } catch (error) {
    console.error("\n❌ Error withdrawing tokens:", error.message);
    if (error.message.includes("insufficient funds")) {
      console.log("\n💡 Solution: Send more SOL to the escrow wallet for transaction fees");
    } else if (error.message.includes("Invalid public key")) {
      console.log("\n💡 Solution: Check that the destination wallet address is correct");
    }
    console.error(error);
  }
}

withdrawEscrowTokens();

