// services/pricingService.js
// Pricing and fee calculation service

import { log } from "../modules/logger.js";
import { getActiveDeposit } from "../modules/db.js";
import fetch from "node-fetch";

/**
 * Fetch Luna token price in SOL from Jupiter API
 * @param {Map} priceCache - Price cache map
 * @param {string} LUNA_TOKEN_MINT - Luna token mint address
 * @param {string} SOL_MINT - SOL mint address
 * @param {number} PRICE_CACHE_TTL - Price cache TTL in milliseconds
 * @returns {Promise<number|null>} - Price in SOL per Luna token, or null if failed
 */
export async function fetchLunaPriceInSol(priceCache, LUNA_TOKEN_MINT, SOL_MINT, PRICE_CACHE_TTL) {
  if (!LUNA_TOKEN_MINT) {
    log.warn("[rps-betting-fee] LUNA_TOKEN_MINT not set in .env, cannot fetch price");
    return null;
  }

  // Validate mint address format
  if (LUNA_TOKEN_MINT.length < 32 || LUNA_TOKEN_MINT === "your_token_mint_address_from_pumpfun_here") {
    log.warn(`[rps-betting-fee] Invalid LUNA_TOKEN_MINT: ${LUNA_TOKEN_MINT}, using fallback rate`);
    return null;
  }

  log.debug(`[rps-betting-fee] Fetching price for Luna token: ${LUNA_TOKEN_MINT}`);

  try {
    // Check cache first
    const cacheKey = LUNA_TOKEN_MINT;
    if (priceCache.has(cacheKey)) {
      const cached = priceCache.get(cacheKey);
      if (Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
        console.log(`[rps-betting-fee] Using cached price: ${cached.price.toFixed(9)} SOL per Luna (mint: ${LUNA_TOKEN_MINT.substring(0, 8)}...)`);
        return cached.price;
      }
    }

    // Method 1: Try DexScreener API first (like the UI shows - direct token to SOL conversion)
    // DexScreener API: https://api.dexscreener.com/latest/dex/tokens/TOKEN_MINT
    const dexscreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${LUNA_TOKEN_MINT}`;
    console.log(`[rps-betting-fee] Fetching from DexScreener API: ${dexscreenerUrl}`);
    
    try {
      const dexResponse = await fetch(dexscreenerUrl);
      if (dexResponse.ok) {
        const dexData = await dexResponse.json();
        
        // DexScreener returns pairs, find the one with SOL
        if (dexData.pairs && dexData.pairs.length > 0) {
          // Find pair with SOL (quoteToken.symbol === 'SOL' or quoteToken.address === SOL_MINT)
          const solPair = dexData.pairs.find(pair => 
            pair.quoteToken?.symbol === 'SOL' || 
            pair.quoteToken?.address === SOL_MINT ||
            pair.quoteToken?.address?.toLowerCase() === SOL_MINT.toLowerCase()
          );
          
          if (solPair && solPair.priceNative) {
            // priceNative is the price in native token (SOL)
            const pricePerLuna = parseFloat(solPair.priceNative);
            
            if (pricePerLuna > 0) {
              // Cache the price
              priceCache.set(cacheKey, {
                price: pricePerLuna,
                timestamp: Date.now()
              });
              
              console.log(`[rps-betting-fee] Fetched Luna price from DexScreener: ${pricePerLuna.toFixed(9)} SOL per Luna`);
              return pricePerLuna;
            }
          }
          
          // If no SOL pair found, try to use first pair and convert
          const firstPair = dexData.pairs[0];
          if (firstPair.priceNative && firstPair.quoteToken?.symbol === 'SOL') {
            const pricePerLuna = parseFloat(firstPair.priceNative);
            if (pricePerLuna > 0) {
              priceCache.set(cacheKey, {
                price: pricePerLuna,
                timestamp: Date.now()
              });
              console.log(`[rps-betting-fee] Fetched Luna price from DexScreener (first pair): ${pricePerLuna.toFixed(9)} SOL per Luna`);
              return pricePerLuna;
            }
          }
        }
      }
    } catch (dexError) {
      console.warn(`[rps-betting-fee] DexScreener API error: ${dexError.message}, trying Jupiter...`);
    }

    // Method 2: Fetch price from Jupiter API (fallback)
    // Jupiter price API: https://price.jup.ag/v4/price?ids=TOKEN_MINT
    const jupiterPriceUrl = `https://price.jup.ag/v4/price?ids=${LUNA_TOKEN_MINT}`;
    console.log(`[rps-betting-fee] Fetching from Jupiter Price API: ${jupiterPriceUrl}`);
    
    const response = await fetch(jupiterPriceUrl);
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[rps-betting-fee] Jupiter Price API error: ${response.status} - ${errorText}`);
      throw new Error(`Jupiter API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.data || !data.data[LUNA_TOKEN_MINT]) {
      console.warn(`[rps-betting-fee] Price data not found for mint ${LUNA_TOKEN_MINT} in Jupiter response:`, JSON.stringify(data).substring(0, 200));
      throw new Error("Price data not found in Jupiter response");
    }

    const priceData = data.data[LUNA_TOKEN_MINT];
    // Jupiter returns price in USD, we need to convert to SOL
    // We need to get SOL price first, then calculate Luna/SOL ratio
    
    // Use Jupiter quote API to get direct Luna -> SOL price
    // Request quote for 1 Luna token (we'll use 1 with proper decimals)
    // First, try to get token info to know decimals, or use common decimals (6 for pump.fun tokens)
    const lunaDecimals = 6; // Pump.fun tokens typically use 6 decimals
    const oneLunaInSmallestUnit = Math.pow(10, lunaDecimals); // 1 Luna = 1,000,000 smallest units
    
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${LUNA_TOKEN_MINT}&outputMint=${SOL_MINT}&amount=${oneLunaInSmallestUnit}&slippageBps=50`;
    const quoteResponse = await fetch(quoteUrl);
    
    if (quoteResponse.ok) {
      const quoteData = await quoteResponse.json();
      if (quoteData.outAmount && quoteData.inAmount) {
        // outAmount is in lamports (1 SOL = 1,000,000,000 lamports)
        // inAmount is in smallest Luna units (1 Luna = 10^6 smallest units for pump.fun tokens)
        const outputAmountLamports = parseInt(quoteData.outAmount);
        const inputAmountSmallest = parseInt(quoteData.inAmount);
        
        // Price per Luna = (output in SOL) / (input in Luna)
        // outputAmountLamports / 1e9 = SOL amount
        // inputAmountSmallest / 1e6 = Luna amount (assuming 6 decimals)
        const solAmount = outputAmountLamports / 1e9; // Convert lamports to SOL
        const lunaAmount = inputAmountSmallest / 1e6; // Convert smallest units to Luna
        const pricePerLuna = solAmount / lunaAmount;
        
        // Cache the price
        priceCache.set(cacheKey, {
          price: pricePerLuna,
          timestamp: Date.now()
        });
        
        console.log(`[rps-betting-fee] Fetched Luna price from Jupiter: ${pricePerLuna.toFixed(9)} SOL per Luna (1 Luna = ${solAmount.toFixed(9)} SOL)`);
        return pricePerLuna;
      }
    } else {
      const errorText = await quoteResponse.text();
      console.warn(`[rps-betting-fee] Jupiter quote API error: ${quoteResponse.status} - ${errorText}`);
    }

    // Fallback: Use USD price and SOL/USD price
    const solPriceUrl = `https://price.jup.ag/v4/price?ids=${SOL_MINT}`;
    const solResponse = await fetch(solPriceUrl);
    
    if (solResponse.ok) {
      const solData = await solResponse.json();
      const lunaPriceUSD = priceData.price;
      const solPriceUSD = solData.data?.[SOL_MINT]?.price;
      
      if (lunaPriceUSD && solPriceUSD) {
        const pricePerLuna = lunaPriceUSD / solPriceUSD;
        
        // Cache the price
        priceCache.set(cacheKey, {
          price: pricePerLuna,
          timestamp: Date.now()
        });
        
        console.log(`[rps-betting-fee] Fetched Luna price (via USD): ${pricePerLuna.toFixed(9)} SOL per Luna`);
        return pricePerLuna;
      }
    }

    throw new Error("Could not determine Luna price in SOL");
  } catch (error) {
    console.error("[rps-betting-fee] Error fetching Luna price:", error.message);
    
    // Return cached price if available (even if expired)
    if (priceCache.has(LUNA_TOKEN_MINT)) {
      const cached = priceCache.get(LUNA_TOKEN_MINT);
      console.warn(`[rps-betting-fee] Using expired cache: ${cached.price} SOL per Luna`);
      return cached.price;
    }
    
    // Fallback to env rate if available
    const fallbackRate = parseFloat(process.env.LUNA_TO_SOL_RATE);
    if (fallbackRate) {
      console.warn(`[rps-betting-fee] Using fallback rate from env: ${fallbackRate} SOL per Luna`);
      return fallbackRate;
    }
    
    return null;
  }
}

/**
 * Convert Luna tokens to SOL value (using real-time price)
 * @param {Map} priceCache - Price cache map
 * @param {string} LUNA_TOKEN_MINT - Luna token mint address
 * @param {string} SOL_MINT - SOL mint address
 * @param {number} PRICE_CACHE_TTL - Price cache TTL in milliseconds
 * @param {number} lunaAmount - Amount in Luna tokens
 * @returns {Promise<number>} - Value in SOL
 */
export async function lunaToSol(priceCache, LUNA_TOKEN_MINT, SOL_MINT, PRICE_CACHE_TTL, lunaAmount) {
  const price = await fetchLunaPriceInSol(priceCache, LUNA_TOKEN_MINT, SOL_MINT, PRICE_CACHE_TTL);
  if (price === null) {
    // Fallback to default rate if price fetch failed
    const fallbackRate = parseFloat(process.env.LUNA_TO_SOL_RATE) || 0.00009;
    console.warn(`[rps-betting-fee] Using fallback rate: ${fallbackRate}`);
    return lunaAmount * fallbackRate;
  }
  return lunaAmount * price;
}

/**
 * Get current Luna price in SOL (synchronous, uses cache)
 * @param {Map} priceCache - Price cache map
 * @param {string} LUNA_TOKEN_MINT - Luna token mint address
 * @returns {number|null} - Price in SOL per Luna token, or null if not available
 */
export function getLunaPriceSync(priceCache, LUNA_TOKEN_MINT) {
  if (!LUNA_TOKEN_MINT) return null;
  
  if (priceCache.has(LUNA_TOKEN_MINT)) {
    const cached = priceCache.get(LUNA_TOKEN_MINT);
    return cached.price;
  }
  
  // Return fallback from env
  return parseFloat(process.env.LUNA_TO_SOL_RATE) || null;
}

/**
 * Get betting fee percentage based on deposit status
 * @param {string} wallet - Wallet address
 * @param {number} BETTING_FEE_DEFAULT - Default betting fee percentage
 * @param {number} BETTING_FEE_3_DAYS - Betting fee percentage after 3 days
 * @param {number} BETTING_FEE_6_DAYS - Betting fee percentage after 6 days
 * @returns {Promise<number>} - Fee percentage (0.01, 0.02, or 0.03)
 */
export async function getBettingFeePercentage(wallet, BETTING_FEE_DEFAULT, BETTING_FEE_3_DAYS, BETTING_FEE_6_DAYS) {
  try {
    const deposit = await getActiveDeposit(wallet);
    if (!deposit) {
      return BETTING_FEE_DEFAULT; // 3% default
    }
    
    const depositAge = Date.now() - deposit.createdAt;
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const sixDays = 6 * 24 * 60 * 60 * 1000;
    
    if (depositAge >= sixDays) {
      return BETTING_FEE_6_DAYS; // 1% after 6 days
    } else if (depositAge >= threeDays) {
      return BETTING_FEE_3_DAYS; // 2% after 3 days
    } else {
      return BETTING_FEE_DEFAULT; // 3% default
    }
  } catch (error) {
    log.error("[rps] Error getting betting fee percentage:", error);
    return BETTING_FEE_DEFAULT; // Fallback to default
  }
}

/**
 * Calculate betting fee in SOL from Luna bet amount (based on deposit status)
 * @param {Map} priceCache - Price cache map
 * @param {string} LUNA_TOKEN_MINT - Luna token mint address
 * @param {string} SOL_MINT - SOL mint address
 * @param {number} PRICE_CACHE_TTL - Price cache TTL in milliseconds
 * @param {number} FEE_PERCENTAGE - Default fee percentage
 * @param {number} BETTING_FEE_DEFAULT - Default betting fee percentage
 * @param {number} BETTING_FEE_3_DAYS - Betting fee percentage after 3 days
 * @param {number} BETTING_FEE_6_DAYS - Betting fee percentage after 6 days
 * @param {number} lunaAmount - Bet amount in Luna tokens
 * @param {string} wallet - Wallet address (optional, for checking deposit status)
 * @returns {Promise<number>} - Fee in SOL
 */
export async function calculateFee(
  priceCache,
  LUNA_TOKEN_MINT,
  SOL_MINT,
  PRICE_CACHE_TTL,
  FEE_PERCENTAGE,
  BETTING_FEE_DEFAULT,
  BETTING_FEE_3_DAYS,
  BETTING_FEE_6_DAYS,
  lunaAmount,
  wallet = null
) {
  const solValue = await lunaToSol(priceCache, LUNA_TOKEN_MINT, SOL_MINT, PRICE_CACHE_TTL, lunaAmount);
  let feePercentage = FEE_PERCENTAGE; // Default 3%
  
  // If wallet provided, check deposit status for reduced fee
  if (wallet) {
    feePercentage = await getBettingFeePercentage(wallet, BETTING_FEE_DEFAULT, BETTING_FEE_3_DAYS, BETTING_FEE_6_DAYS);
  }
  
  return solValue * feePercentage;
}

/**
 * Collect fee from a wallet and send to BETTING_FEE_WALLET automatically
 * @param {Map} collectedFees - Collected fees map
 * @param {Function} sendSol - Function to send SOL (from solanaService)
 * @param {string} wallet - Wallet address
 * @param {number} feeInSol - Fee amount in SOL
 * @param {string} roomId - Room ID for reference
 * @param {number} betAmount - Original bet amount in Luna
 * @param {Object} rewardPool - Reward pool state object with getter/setter (optional)
 */
export async function collectFee(collectedFees, sendSol, wallet, feeInSol, roomId, betAmount, rewardPool = null) {
  if (!collectedFees.has(wallet)) {
    collectedFees.set(wallet, {
      totalFees: 0,
      transactions: []
    });
  }
  
  const feeData = collectedFees.get(wallet);
  feeData.totalFees += feeInSol;
  feeData.transactions.push({
    roomId: roomId,
    betAmount: betAmount,
    feeInSol: feeInSol,
    timestamp: Date.now()
  });
  
  console.log(`[rps-betting-fee] Collected ${feeInSol.toFixed(6)} SOL fee from ${wallet.substring(0, 8)}... (bet: ${betAmount} Luna)`);
  
  // Auto-add to reward pool (if provided)
  if (rewardPool && typeof rewardPool.value !== 'undefined') {
    rewardPool.value += feeInSol;
    log.info(`[rps-betting-fee] ✓ Added ${feeInSol.toFixed(6)} SOL to reward pool. Total: ${rewardPool.value.toFixed(6)} SOL`);
  }
  
  // Send fee to BETTING_FEE_WALLET automatically
  const feeWallet = process.env.BETTING_FEE_WALLET;
  if (feeWallet && feeWallet !== "your_fee_wallet_address_here") {
    try {
      const signature = await sendSol(feeWallet, feeInSol);
      if (signature) {
        console.log(`[rps-betting-fee] ✓ Sent ${feeInSol.toFixed(6)} SOL fee to ${feeWallet.substring(0, 8)}... (tx: ${signature})`);
      } else {
        console.warn(`[rps-betting-fee] ✗ Failed to send ${feeInSol.toFixed(6)} SOL fee to ${feeWallet.substring(0, 8)}... (check REWARD_SENDER_PRIVATE_KEY and wallet balance)`);
      }
    } catch (error) {
      console.error(`[rps-betting-fee] Error sending fee to ${feeWallet.substring(0, 8)}...:`, error.message);
    }
  } else {
    console.warn(`[rps-betting-fee] BETTING_FEE_WALLET not configured, fee recorded in memory only`);
  }
}








