// utils/validation.js
// Wallet address validation utilities

/**
 * Check if a wallet address is valid
 * @param {string} address - Wallet address to validate
 * @returns {boolean} - True if valid
 */
export function isValidWalletAddress(address) {
  if (!address || typeof address !== 'string') return false;
  // Solana addresses are base58 encoded, typically 32-44 characters
  if (address.length < 32 || address.length > 44) return false;
  // Check if it's base58 (alphanumeric except 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(address);
}

/**
 * Validate wallet address before using PublicKey
 * @param {string} address - Wallet address to validate
 * @param {string} fieldName - Field name for error message
 * @returns {string} - Validated address
 * @throws {Error} - If address is invalid
 */
export function validateWalletAddress(address, fieldName = 'wallet') {
  if (!address || typeof address !== 'string') {
    throw new Error(`${fieldName} address is required and must be a string`);
  }
  if (!isValidWalletAddress(address)) {
    throw new Error(`Invalid ${fieldName} address format: ${address.substring(0, 16)}...`);
  }
  return address;
}











