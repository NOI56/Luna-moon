// Script to check ALL tokens in escrow wallet (not just Luna)
import dotenv from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET || "FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU";
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;

async function checkAllTokens() {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const escrowPublicKey = new PublicKey(ESCROW_WALLET);

    console.log("🔍 Checking ALL tokens in escrow wallet...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Escrow Wallet: ${ESCROW_WALLET}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Get all token accounts owned by escrow wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      escrowPublicKey,
      {
        programId: TOKEN_PROGRAM_ID,
      }
    );

    const token2022Accounts = await connection.getParsedTokenAccountsByOwner(
      escrowPublicKey,
      {
        programId: TOKEN_2022_PROGRAM_ID,
      }
    );

    const allAccounts = [
      ...tokenAccounts.value.map(acc => ({ ...acc, program: 'Token' })),
      ...token2022Accounts.value.map(acc => ({ ...acc, program: 'Token-2022' }))
    ];

    if (allAccounts.length === 0) {
      console.log("❌ No token accounts found in escrow wallet");
      console.log("\n💡 This means:");
      console.log("   - No tokens have been deposited yet");
      console.log("   - Or all tokens have been withdrawn");
      return;
    }

    console.log(`✅ Found ${allAccounts.length} token account(s)\n`);

    for (const account of allAccounts) {
      const parsedInfo = account.account.data.parsed.info;
      const mint = parsedInfo.mint;
      const tokenAmount = parsedInfo.tokenAmount;
      const balance = parseFloat(tokenAmount.uiAmountString || '0');
      const decimals = tokenAmount.decimals;

      const isLunaToken = LUNA_TOKEN_MINT && mint === LUNA_TOKEN_MINT;

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`Token Mint: ${mint}`);
      if (isLunaToken) {
        console.log(`🎯 This is LUNA TOKEN (configured in system)`);
      }
      console.log(`Program: ${account.program}`);
      console.log(`Decimals: ${decimals}`);
      console.log(`Balance: ${balance.toLocaleString()} tokens`);
      console.log(`Raw Amount: ${tokenAmount.amount}`);
      console.log(`Token Account: ${account.pubkey.toBase58()}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    }

    // Highlight Luna token
    const lunaAccount = allAccounts.find(acc => 
      LUNA_TOKEN_MINT && acc.account.data.parsed.info.mint === LUNA_TOKEN_MINT
    );

    if (lunaAccount) {
      const lunaBalance = parseFloat(lunaAccount.account.data.parsed.info.tokenAmount.uiAmountString || '0');
      console.log("📋 Summary:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`🎯 Luna Token Balance: ${lunaBalance.toLocaleString()} Luna`);
      console.log(`   (This is what withdraw-escrow-tokens.js will withdraw)`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    } else if (LUNA_TOKEN_MINT) {
      console.log("⚠️  Luna token not found in escrow wallet");
      console.log(`   Expected mint: ${LUNA_TOKEN_MINT}`);
    }

  } catch (error) {
    console.error("\n❌ Error checking tokens:", error.message);
    console.error(error);
  }
}

checkAllTokens();



