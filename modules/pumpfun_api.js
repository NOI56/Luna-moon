// modules/pumpfun_api.js
// Optional: fetch price / volume from a pump.fun-compatible endpoint.

import fetch from "node-fetch";
import { Connection, PublicKey } from "@solana/web3.js";

const PUMPFUN_API_URL = process.env.PUMPFUN_API_URL || "";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/**
 * Get token statistics (price, volume, market cap)
 */
export async function getTokenStats() {
  if (!PUMPFUN_API_URL) return null;
  try {
    const resp = await fetch(PUMPFUN_API_URL);
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      price: data.price || data.tokenPrice || null,
      volume24h: data.volume24h || data.volume || null,
      marketCap: data.marketCap || data.mc || null
    };
  } catch (e) {
    console.warn("[pumpfun_api] error:", e.message);
    return null;
  }
}

/**
 * Get token holders from Solana blockchain
 * @param {string} tokenMintAddress - Token mint address
 * @param {number} limit - Maximum number of holders to fetch (default: 100)
 * @returns {Promise<Array<{wallet: string, balance: number}>>}
 */
export async function getTokenHolders(tokenMintAddress, limit = 100) {
  if (!tokenMintAddress) return [];
  
  try {
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const mintPublicKey = new PublicKey(tokenMintAddress);
    
    // Get all token accounts for this mint
    // Token account structure: mint (32 bytes) at offset 0, owner (32 bytes) at offset 32
    const tokenAccounts = await connection.getParsedProgramAccounts(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // Token Program ID
      {
        filters: [
          {
            dataSize: 165, // Token account data size
          },
          {
            memcmp: {
              offset: 0, // Mint address is at offset 0
              bytes: mintPublicKey.toBase58(),
            },
          },
        ],
      }
    );
    
    console.log(`[pumpfun_api] Found ${tokenAccounts.length} token accounts for mint ${tokenMintAddress.substring(0, 8)}...`);
    
    // Parse token accounts to get wallet addresses and balances
    const holders = [];
    for (const account of tokenAccounts) {
      try {
        const parsedInfo = account.account.data.parsed?.info;
        if (parsedInfo && parsedInfo.owner && parsedInfo.tokenAmount) {
          const owner = parsedInfo.owner;
          const balance = parseFloat(parsedInfo.tokenAmount.uiAmountString || '0');
          
          // Only include holders with positive balance
          if (balance > 0) {
            holders.push({
              wallet: owner,
              balance: balance,
            });
          }
        }
      } catch (e) {
        console.warn(`[pumpfun_api] Error parsing token account:`, e.message);
      }
    }
    
    // Sort by balance (descending)
    holders.sort((a, b) => b.balance - a.balance);
    
    // Limit results
    const limitedHolders = holders.slice(0, limit);
    
    console.log(`[pumpfun_api] Returning ${limitedHolders.length} token holders (sorted by balance)`);
    
    return limitedHolders;
  } catch (e) {
    console.warn("[pumpfun_api] Error fetching token holders:", e.message);
    // Return empty array on error
    return [];
  }
}

/**
 * Get token information from DexScreener API
 * @param {string} tokenMintAddress - Token mint address
 * @returns {Promise<Object|null>}
 */
export async function getTokenInfoFromDexScreener(tokenMintAddress) {
  if (!tokenMintAddress) return null;
  
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenMintAddress}`;
    const resp = await fetch(url);
    
    if (!resp.ok) return null;
    
    const data = await resp.json();
    
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0]; // Get the first (most liquid) pair
      return {
        price: parseFloat(pair.priceUsd || 0),
        priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
        volume24h: parseFloat(pair.volume?.h24 || 0),
        liquidity: parseFloat(pair.liquidity?.usd || 0),
        marketCap: parseFloat(pair.marketCap || 0),
        fdv: parseFloat(pair.fdv || 0),
        pairAddress: pair.pairAddress,
        dexId: pair.dexId,
      };
    }
    
    return null;
  } catch (e) {
    console.warn("[pumpfun_api] Error fetching from DexScreener:", e.message);
    return null;
  }
}

/**
 * Get wallet IP address from Solscan API
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<string|null>} - IP address or null if not found
 */
export async function getWalletIpFromSolscan(walletAddress) {
  if (!walletAddress) return null;
  
  try {
    // Solscan API endpoint for account info
    const url = `https://api.solscan.io/account?address=${walletAddress}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    });
    
    if (!resp.ok) return null;
    
    const data = await resp.json();
    // Note: Solscan API may not directly provide IP, but we can try to get transaction patterns
    // For now, return null as Solscan doesn't expose IP addresses
    return null;
  } catch (e) {
    console.warn(`[pumpfun_api] Error fetching wallet IP from Solscan for ${walletAddress.substring(0, 8)}...:`, e.message);
    return null;
  }
}

/**
 * Get transaction history for a wallet to analyze patterns
 * @param {string} walletAddress - Wallet address
 * @param {string} tokenMint - Token mint address (optional)
 * @returns {Promise<Array>} - Array of transactions
 */
export async function getWalletTransactions(walletAddress, tokenMint = null) {
  if (!walletAddress) return [];
  
  try {
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const publicKey = new PublicKey(walletAddress);
    
    // Get transaction signatures
    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit: 100,
    });
    
    // Get transaction details
    const transactions = [];
    for (const sigInfo of signatures.slice(0, 50)) { // Limit to 50 for performance
      try {
        const tx = await connection.getTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (tx) {
          transactions.push({
            signature: sigInfo.signature,
            timestamp: sigInfo.blockTime ? new Date(sigInfo.blockTime * 1000) : null,
            slot: sigInfo.slot,
            err: sigInfo.err,
          });
        }
      } catch (e) {
        // Skip failed transactions
        continue;
      }
    }
    
    return transactions;
  } catch (e) {
    console.warn(`[pumpfun_api] Error fetching transactions for ${walletAddress.substring(0, 8)}...:`, e.message);
    return [];
  }
}

/**
 * Get wallet IP from Axiom API (if available)
 * Note: Axiom may require API key or may not expose IP directly
 * @param {string} walletAddress - Wallet address
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<string|null>} - IP address or null
 */
export async function getWalletIpFromAxiom(walletAddress, tokenMint) {
  if (!walletAddress || !tokenMint) return null;
  
  // Check if Axiom API key is configured
  const AXIOM_API_KEY = process.env.AXIOM_API_KEY;
  
  try {
    // Try Axiom Pro API (may require authentication)
    const url = `https://api.axiom.trade/v1/token/${tokenMint}/holder/${walletAddress}`;
    
    const headers = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    };
    
    if (AXIOM_API_KEY) {
      headers['Authorization'] = `Bearer ${AXIOM_API_KEY}`;
    }
    
    const resp = await fetch(url, { headers });
    
    if (!resp.ok) {
      // Try alternative endpoint format
      const altUrl = `https://axiom.trade/api/meme/${tokenMint}/holders?wallet=${walletAddress}`;
      const altResp = await fetch(altUrl, { headers });
      
      if (!altResp.ok) return null;
      
      const altData = await altResp.json();
      // Axiom may return IP in different formats
      if (altData.ip) return altData.ip;
      if (altData.ipAddress) return altData.ipAddress;
      if (altData.data && altData.data.ip) return altData.data.ip;
      
      return null;
    }
    
    const data = await resp.json();
    // Check various possible response formats
    if (data.ip) return data.ip;
    if (data.ipAddress) return data.ipAddress;
    if (data.data && data.data.ip) return data.data.ip;
    if (data.result && data.result.ip) return data.result.ip;
    
    return null;
  } catch (e) {
    // Silently fail - Axiom API may not be available
    return null;
  }
}

/**
 * Get token purchase transactions for a wallet
 * @param {string} walletAddress - Wallet address
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<Array>} - Array of purchase transactions with timestamps
 */
export async function getTokenPurchaseTransactions(walletAddress, tokenMint) {
  if (!walletAddress || !tokenMint) return [];
  
  try {
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const publicKey = new PublicKey(walletAddress);
    const mintPublicKey = new PublicKey(tokenMint);
    
    // Get all transaction signatures for this wallet
    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit: 200, // Get more transactions to find token purchases
    });
    
    const purchaseTransactions = [];
    
    // Check each transaction to see if it involves the token
    for (const sigInfo of signatures.slice(0, 100)) { // Limit to 100 for performance
      try {
        const tx = await connection.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (!tx || !tx.blockTime) continue;
        
        // Check if transaction involves the token mint
        const accountKeys = tx.transaction.message.accountKeys.map(key => key.pubkey.toString());
        const involvesToken = accountKeys.includes(tokenMint);
        
        if (involvesToken) {
          purchaseTransactions.push({
            signature: sigInfo.signature,
            timestamp: new Date(sigInfo.blockTime * 1000),
            blockTime: sigInfo.blockTime,
            slot: sigInfo.slot,
          });
        }
      } catch (e) {
        // Skip failed transactions
        continue;
      }
    }
    
    // Sort by timestamp (oldest first)
    purchaseTransactions.sort((a, b) => a.blockTime - b.blockTime);
    
    return purchaseTransactions;
  } catch (e) {
    console.warn(`[pumpfun_api] Error fetching purchase transactions for ${walletAddress.substring(0, 8)}...:`, e.message);
    return [];
  }
}

/**
 * Analyze transaction patterns to detect potential same-IP wallets
 * Uses token purchase timing to group wallets that bought at similar times
 * @param {Array<string>} walletAddresses - Array of wallet addresses
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<Map<string, string>>} - Map of wallet -> inferred IP group
 */
export async function analyzeTransactionPatterns(walletAddresses, tokenMint) {
  const patternMap = new Map();
  
  try {
    console.log(`[pumpfun_api] Analyzing token purchase patterns for ${walletAddresses.length} wallets...`);
    
    // Analyze all wallets (not just sample) to get better results
    const walletPurchaseData = [];
    
    for (let i = 0; i < walletAddresses.length; i++) {
      const wallet = walletAddresses[i];
      
      try {
        // Get token purchase transactions for this wallet
        const purchases = await getTokenPurchaseTransactions(wallet, tokenMint);
        
        if (purchases.length > 0) {
          const firstPurchase = purchases[0];
          walletPurchaseData.push({
            wallet,
            firstPurchaseTime: firstPurchase.timestamp.getTime(),
            purchaseCount: purchases.length,
            purchases: purchases,
          });
        }
        
        // Progress logging
        if ((i + 1) % 10 === 0) {
          console.log(`[pumpfun_api] Analyzed ${i + 1}/${walletAddresses.length} wallets...`);
        }
      } catch (e) {
        // Skip failed wallets
        continue;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`[pumpfun_api] Found purchase data for ${walletPurchaseData.length} wallets`);
    
    // Group wallets by similar purchase timing
    // Wallets that bought within 2 minutes of each other are likely from same IP
    const TIME_WINDOW = 2 * 60 * 1000; // 2 minutes
    const groups = new Map();
    let groupId = 0;
    
    // Sort by first purchase time
    walletPurchaseData.sort((a, b) => a.firstPurchaseTime - b.firstPurchaseTime);
    
    for (const data of walletPurchaseData) {
      let foundGroup = false;
      
      // Check existing groups
      for (const [gId, groupData] of groups.entries()) {
        // Check if this wallet's first purchase is close to any purchase in the group
        for (const groupWallet of groupData) {
          const timeDiff = Math.abs(data.firstPurchaseTime - groupWallet.firstPurchaseTime);
          
          if (timeDiff < TIME_WINDOW) {
            // Same group - likely same IP
            groupData.push(data);
            patternMap.set(data.wallet, `same-ip-group-${gId}`);
            foundGroup = true;
            break;
          }
        }
        
        if (foundGroup) break;
      }
      
      if (!foundGroup) {
        // Create new group
        groups.set(groupId, [data]);
        patternMap.set(data.wallet, `same-ip-group-${groupId}`);
        groupId++;
      }
    }
    
    console.log(`[pumpfun_api] Found ${groups.size} potential IP groups (wallets that bought within 2 minutes)`);
    
    // Log groups with multiple wallets (suspicious)
    for (const [gId, groupData] of groups.entries()) {
      if (groupData.length > 1) {
        const wallets = groupData.map(d => d.wallet.substring(0, 8)).join(', ');
        const times = groupData.map(d => new Date(d.firstPurchaseTime).toISOString()).join(', ');
        console.log(`[pumpfun_api] Group ${gId}: ${groupData.length} wallets bought at similar times: ${wallets}... (times: ${times})`);
      }
    }
    
  } catch (e) {
    console.warn(`[pumpfun_api] Error analyzing transaction patterns:`, e.message);
  }
  
  return patternMap;
}

/**
 * Get wallet IP addresses for multiple wallets using various sources
 * @param {Array<string>} walletAddresses - Array of wallet addresses
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<Map<string, string>>} - Map of wallet -> IP address
 */
export async function getWalletIpsBatch(walletAddresses, tokenMint) {
  const walletIpMap = new Map();
  
  console.log(`[pumpfun_api] Fetching IP addresses for ${walletAddresses.length} wallets from external sources...`);
  
  // Process in batches to avoid rate limiting
  const batchSize = 5; // Smaller batch size for external APIs
  let foundCount = 0;
  
  for (let i = 0; i < walletAddresses.length; i += batchSize) {
    const batch = walletAddresses.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (wallet) => {
        // Try Axiom first (most likely to have IP data)
        let ip = await getWalletIpFromAxiom(wallet, tokenMint);
        
        // If not found, try Solscan
        if (!ip) {
          ip = await getWalletIpFromSolscan(wallet);
        }
        
        if (ip) {
          walletIpMap.set(wallet, ip);
          foundCount++;
          if (foundCount % 10 === 0) {
            console.log(`[pumpfun_api] Found IPs for ${foundCount} wallets so far...`);
          }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      })
    );
    
    // Delay between batches
    if (i + batchSize < walletAddresses.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`[pumpfun_api] Found IP addresses for ${walletIpMap.size} out of ${walletAddresses.length} wallets from external sources`);
  
  // Always use transaction pattern analysis (since external APIs may not work)
  console.log(`[pumpfun_api] Analyzing transaction patterns to detect wallet farming...`);
  const patternMap = await analyzeTransactionPatterns(walletAddresses, tokenMint);
  
  // Merge pattern groups (treat as same IP if same pattern group)
  for (const [wallet, patternGroup] of patternMap.entries()) {
    if (!walletIpMap.has(wallet)) {
      walletIpMap.set(wallet, patternGroup); // Use pattern group as IP identifier
    } else {
      // If we have both external IP and pattern, prefer external IP but note the pattern
      const existingIp = walletIpMap.get(wallet);
      if (existingIp && !existingIp.startsWith('pattern-group-') && !existingIp.startsWith('same-ip-group-')) {
        // Keep external IP, but we can add pattern info if needed
      } else {
        walletIpMap.set(wallet, patternGroup);
      }
    }
  }
  
  console.log(`[pumpfun_api] Final result: Found IP/pattern data for ${walletIpMap.size} out of ${walletAddresses.length} wallets`);
  
  return walletIpMap;
}
