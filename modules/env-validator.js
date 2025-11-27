// modules/env-validator.js
// Enhanced environment variable validation for Luna AI

import { log } from './logger.js';

/**
 * Validate environment variables
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateEnvironment() {
  const errors = [];
  const warnings = [];

  // Helper functions
  const isValidPort = (port) => {
    const num = parseInt(port, 10);
    return !isNaN(num) && num >= 1 && num <= 65535;
  };

  const isValidUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const isValidWalletAddress = (address) => {
    if (!address || typeof address !== 'string') return false;
    if (address.length < 32 || address.length > 44) return false;
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(address);
  };

  const isValidApiKey = (key, prefix = null) => {
    if (!key || typeof key !== 'string') return false;
    if (key.includes('your_') || key.includes('here')) return false;
    if (prefix && !key.startsWith(prefix)) return false;
    return key.length > 10; // Minimum length check
  };

  const isValidBoolean = (value) => {
    return value === 'true' || value === 'false' || value === '1' || value === '0' || value === '';
  };

  const isValidNumber = (value, min = null, max = null) => {
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    if (min !== null && num < min) return false;
    if (max !== null && num > max) return false;
    return true;
  };

  const isValidLogLevel = (level) => {
    const validLevels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];
    return validLevels.includes(level);
  };

  // ============================================
  // Server Configuration
  // ============================================
  const PORT = process.env.PORT || '8787';
  if (!isValidPort(PORT)) {
    errors.push(`PORT must be a number between 1 and 65535, got: ${PORT}`);
  }

  // ============================================
  // AI / LLM Configuration
  // ============================================
  const OPENAI_KEY = process.env.OPENAI_KEY;
  const OPENROUTER_KEY = process.env.OPENROUTER_KEY;

  if (!OPENAI_KEY && !OPENROUTER_KEY) {
    errors.push("Missing AI API key: OPENAI_KEY or OPENROUTER_KEY required");
  } else {
    if (OPENAI_KEY && !isValidApiKey(OPENAI_KEY, 'sk-')) {
      if (OPENAI_KEY.includes('your_') || OPENAI_KEY.includes('here')) {
        warnings.push("OPENAI_KEY appears to be a placeholder. Please set a valid API key.");
      } else {
        warnings.push("OPENAI_KEY format may be invalid (should start with 'sk-')");
      }
    }
    if (OPENROUTER_KEY && !isValidApiKey(OPENROUTER_KEY, 'sk-or-v1-')) {
      if (OPENROUTER_KEY.includes('your_') || OPENROUTER_KEY.includes('here')) {
        warnings.push("OPENROUTER_KEY appears to be a placeholder. Please set a valid API key.");
      } else {
        warnings.push("OPENROUTER_KEY format may be invalid (should start with 'sk-or-v1-')");
      }
    }
  }

  // Model names validation (basic check)
  const SIMPLE_MODEL = process.env.SIMPLE_MODEL;
  const COMPLEX_MODEL = process.env.COMPLEX_MODEL;
  if (SIMPLE_MODEL && SIMPLE_MODEL.length < 3) {
    warnings.push(`SIMPLE_MODEL seems too short: ${SIMPLE_MODEL}`);
  }
  if (COMPLEX_MODEL && COMPLEX_MODEL.length < 3) {
    warnings.push(`COMPLEX_MODEL seems too short: ${COMPLEX_MODEL}`);
  }

  // ============================================
  // VTube Studio Configuration
  // ============================================
  const VTS_ENABLED = process.env.VTS_ENABLED;
  if (VTS_ENABLED && !isValidBoolean(VTS_ENABLED)) {
    warnings.push(`VTS_ENABLED should be 'true' or 'false', got: ${VTS_ENABLED}`);
  }

  if (VTS_ENABLED === 'true') {
    if (!process.env.VTS_AUTH_TOKEN) {
      warnings.push("VTS_ENABLED=true but VTS_AUTH_TOKEN is missing. Run 'node scripts/vts/vts-auth.cjs' to get token.");
    } else if (process.env.VTS_AUTH_TOKEN.length < 10) {
      warnings.push("VTS_AUTH_TOKEN seems too short. Please verify the token is correct.");
    }

    const VTS_PORT = process.env.VTS_PORT || '8001';
    if (!isValidPort(VTS_PORT)) {
      warnings.push(`VTS_PORT must be a number between 1 and 65535, got: ${VTS_PORT}`);
    }

    const VTS_HOST = process.env.VTS_HOST;
    if (VTS_HOST && !/^[\d\.]+$/.test(VTS_HOST) && !/^[\w\.-]+$/.test(VTS_HOST)) {
      warnings.push(`VTS_HOST format may be invalid: ${VTS_HOST}`);
    }
  }

  // ============================================
  // ElevenLabs TTS Configuration
  // ============================================
  const TTS_ENABLED = process.env.TTS_ENABLED;
  if (TTS_ENABLED && !isValidBoolean(TTS_ENABLED)) {
    warnings.push(`TTS_ENABLED should be 'true' or 'false', got: ${TTS_ENABLED}`);
  }

  if (TTS_ENABLED !== 'false') {
    const ELEVEN_KEY = process.env.ELEVEN_KEY;
    if (!ELEVEN_KEY) {
      warnings.push("TTS enabled but ELEVEN_KEY is missing. TTS will not work.");
    } else if (ELEVEN_KEY.includes('your_') || ELEVEN_KEY.includes('here')) {
      warnings.push("ELEVEN_KEY appears to be a placeholder. Please set a valid API key.");
    } else if (ELEVEN_KEY.length < 20) {
      warnings.push("ELEVEN_KEY seems too short. Please verify the API key is correct.");
    }
  }

  // ============================================
  // Rate Limiting
  // ============================================
  const RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX;
  if (RATE_LIMIT_MAX && !isValidNumber(RATE_LIMIT_MAX, 1, 1000)) {
    warnings.push(`RATE_LIMIT_MAX should be a number between 1 and 1000, got: ${RATE_LIMIT_MAX}`);
  }

  // ============================================
  // Logging Configuration
  // ============================================
  const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
  if (!isValidLogLevel(LOG_LEVEL)) {
    warnings.push(`LOG_LEVEL must be one of: error, warn, info, verbose, debug, silly. Got: ${LOG_LEVEL}`);
  }

  const LOG_CONSOLE = process.env.LOG_CONSOLE;
  if (LOG_CONSOLE && !isValidBoolean(LOG_CONSOLE)) {
    warnings.push(`LOG_CONSOLE should be 'true' or 'false', got: ${LOG_CONSOLE}`);
  }

  const LOG_VERBOSE = process.env.LOG_VERBOSE;
  if (LOG_VERBOSE && !isValidBoolean(LOG_VERBOSE)) {
    warnings.push(`LOG_VERBOSE should be 'true' or 'false', got: ${LOG_VERBOSE}`);
  }

  // ============================================
  // CORS Configuration
  // ============================================
  const CORS_ORIGINS = process.env.CORS_ORIGINS;
  if (CORS_ORIGINS && CORS_ORIGINS !== '*') {
    const origins = CORS_ORIGINS.split(',').map(o => o.trim());
    for (const origin of origins) {
      if (!isValidUrl(origin) && origin !== '*') {
        warnings.push(`CORS_ORIGINS contains invalid URL: ${origin}`);
      }
    }
  }

  // ============================================
  // Solana Configuration
  // ============================================
  const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
  if (SOLANA_RPC_URL && !isValidUrl(SOLANA_RPC_URL)) {
    warnings.push(`SOLANA_RPC_URL format may be invalid: ${SOLANA_RPC_URL}`);
  }

  const LUNA_WALLET = process.env.LUNA_WALLET;
  if (LUNA_WALLET && LUNA_WALLET !== 'your_solana_wallet_address_here') {
    if (!isValidWalletAddress(LUNA_WALLET)) {
      warnings.push(`LUNA_WALLET format may be invalid: ${LUNA_WALLET.substring(0, 16)}...`);
    }
  }

  // ============================================
  // Luna Token Configuration
  // ============================================
  const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT;
  if (LUNA_TOKEN_MINT && LUNA_TOKEN_MINT !== 'your_token_mint_address_from_pumpfun_here') {
    if (!isValidWalletAddress(LUNA_TOKEN_MINT)) {
      warnings.push(`LUNA_TOKEN_MINT format may be invalid: ${LUNA_TOKEN_MINT.substring(0, 16)}...`);
    }
  }

  const LUNA_TO_SOL_RATE = process.env.LUNA_TO_SOL_RATE;
  if (LUNA_TO_SOL_RATE && !isValidNumber(LUNA_TO_SOL_RATE, 0, 1)) {
    warnings.push(`LUNA_TO_SOL_RATE should be a number between 0 and 1, got: ${LUNA_TO_SOL_RATE}`);
  }

  const LUNA_BUY_LINK = process.env.LUNA_BUY_LINK;
  if (LUNA_BUY_LINK && LUNA_BUY_LINK !== 'https://pump.fun/your_token_mint_address_from_pumpfun_here') {
    if (!isValidUrl(LUNA_BUY_LINK)) {
      warnings.push(`LUNA_BUY_LINK format may be invalid: ${LUNA_BUY_LINK}`);
    }
  }

  const LUNA_X_LINK = process.env.LUNA_X_LINK;
  if (LUNA_X_LINK && LUNA_X_LINK !== 'https://x.com/your_community') {
    if (!isValidUrl(LUNA_X_LINK)) {
      warnings.push(`LUNA_X_LINK format may be invalid: ${LUNA_X_LINK}`);
    }
  }

  // ============================================
  // Wallet Addresses Validation
  // ============================================
  const BETTING_FEE_WALLET = process.env.BETTING_FEE_WALLET;
  if (BETTING_FEE_WALLET && BETTING_FEE_WALLET !== 'your_fee_wallet_address_here') {
    if (!isValidWalletAddress(BETTING_FEE_WALLET)) {
      warnings.push(`BETTING_FEE_WALLET format may be invalid: ${BETTING_FEE_WALLET.substring(0, 16)}...`);
    }
  }

  const REWARD_DISTRIBUTION_WALLET = process.env.REWARD_DISTRIBUTION_WALLET;
  if (REWARD_DISTRIBUTION_WALLET) {
    if (!isValidWalletAddress(REWARD_DISTRIBUTION_WALLET)) {
      warnings.push(`REWARD_DISTRIBUTION_WALLET format may be invalid: ${REWARD_DISTRIBUTION_WALLET.substring(0, 16)}...`);
    }
  }

  const DEPOSIT_ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET;
  if (DEPOSIT_ESCROW_WALLET) {
    if (!isValidWalletAddress(DEPOSIT_ESCROW_WALLET)) {
      warnings.push(`DEPOSIT_ESCROW_WALLET format may be invalid: ${DEPOSIT_ESCROW_WALLET.substring(0, 16)}...`);
    }
  }

  // ============================================
  // Private Keys Validation (format only, not actual validation)
  // ============================================
  const REWARD_SENDER_PRIVATE_KEY = process.env.REWARD_SENDER_PRIVATE_KEY;
  if (REWARD_SENDER_PRIVATE_KEY && REWARD_SENDER_PRIVATE_KEY !== 'your_private_key_here') {
    if (REWARD_SENDER_PRIVATE_KEY.length < 40) {
      warnings.push("REWARD_SENDER_PRIVATE_KEY seems too short. Please verify the private key is correct.");
    }
  }

  const DEPOSIT_ESCROW_PRIVATE_KEY = process.env.DEPOSIT_ESCROW_PRIVATE_KEY;
  if (DEPOSIT_ESCROW_PRIVATE_KEY && DEPOSIT_ESCROW_PRIVATE_KEY !== 'your_base58_private_key_here') {
    if (DEPOSIT_ESCROW_PRIVATE_KEY.length < 40) {
      warnings.push("DEPOSIT_ESCROW_PRIVATE_KEY seems too short. Please verify the private key is correct.");
    }
  }

  // ============================================
  // Admin Configuration
  // ============================================
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (ADMIN_SECRET && ADMIN_SECRET.length < 8) {
    warnings.push("ADMIN_SECRET should be at least 8 characters long for security.");
  }

  const PURCHASE_SECRET = process.env.PURCHASE_SECRET;
  if (PURCHASE_SECRET && PURCHASE_SECRET.length < 8) {
    warnings.push("PURCHASE_SECRET should be at least 8 characters long for security.");
  }

  // ============================================
  // Boolean Flags Validation
  // ============================================
  const booleanFlags = [
    'ENABLE_CSRF',
    'IDLE_MONOLOGUE_ENABLED',
    'AMBIENT_MURMUR_ENABLED',
    'ENHANCED_LOGGING',
    'DEBUG'
  ];

  for (const flag of booleanFlags) {
    const value = process.env[flag];
    if (value && !isValidBoolean(value)) {
      warnings.push(`${flag} should be 'true' or 'false', got: ${value}`);
    }
  }

  return { errors, warnings };
}

