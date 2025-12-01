// utils/mint.js
// Helper utilities for resolving the Luna token mint address

const PLACEHOLDER_MINT = "your_token_mint_address_from_pumpfun_here";
const DEFAULT_LUNA_MINT = "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";

function sanitizeMint(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === PLACEHOLDER_MINT) {
    return null;
  }

  if (trimmed.length < 32) {
    return null;
  }

  return trimmed;
}

export function resolveLunaMint(...preferred) {
  for (const candidate of preferred) {
    const sanitized = sanitizeMint(candidate);
    if (sanitized) {
      return sanitized;
    }
  }

  const envMint = sanitizeMint(process.env.LUNA_TOKEN_MINT);
  if (envMint) {
    return envMint;
  }

  return sanitizeMint(DEFAULT_LUNA_MINT);
}

export { PLACEHOLDER_MINT, DEFAULT_LUNA_MINT };






