// modules/pumpfun_api.js
// Optional: fetch price / volume from a pump.fun-compatible endpoint.

import fetch from "node-fetch";

const PUMPFUN_API_URL = process.env.PUMPFUN_API_URL || "";

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
