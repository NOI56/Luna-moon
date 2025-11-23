// modules/solana.js
// Very lightweight watcher stub for Solana wallet (buy detection should be implemented for real).

import { logEvent } from "./db.js";

export function startSolanaWatcher() {
  const url = process.env.SOLANA_RPC_URL;
  const wallet = process.env.LUNA_WALLET;
  if (!url || !wallet) {
    console.log("[solana] watcher disabled (missing SOLANA_RPC_URL or LUNA_WALLET)");
    return;
  }
  console.log("[solana] watcher stub active for", wallet);
  // Real implementation would poll or subscribe to RPC and call logEvent("solana_tx", ...)
}
