// modules/ai.js
// Core Luna brain: English-only, streamer persona, emotion & trait detection.

import { getPersonalitySnapshot, updatePersonalityFromEmotion } from "./personality.js";
import { getTokenStats } from "./pumpfun_api.js";

function inferUserEmotion(text) {
  const t = (text || "").toLowerCase();
  const sadWords = ["sad", "tired", "lonely", "depressed", "rekt", "rug", "broke"];
  const angryWords = ["angry", "mad", "hate", "trash", "scam", "fuck"];
  const excitedWords = ["pumped", "hyped", "lfg", "send it", "moon", "let's go", "to the moon"];
  const happyWords = ["love", "lol", "lmao", "haha", "cute", "fun", "good", "happy"];

  if (sadWords.some((w) => t.includes(w))) return "sad";
  if (angryWords.some((w) => t.includes(w))) return "angry";
  if (excitedWords.some((w) => t.includes(w))) return "excited";
  if (happyWords.some((w) => t.includes(w))) return "happy";
  return "neutral";
}

function inferUserTraits(text) {
  const t = (text || "").toLowerCase();
  const traits = new Set();
  if (/(love|waifu|cute|marry|date)/.test(t)) traits.add("flirty");
  if (/(gm|gn|lol|lmao|haha|hehe|xd)/.test(t)) traits.add("playful");
  if (/(chart|analysis|roadmap|liquidity|market cap|volume)/.test(t)) traits.add("serious");
  if (/(degen|ape|pump|moon|send it|rekt)/.test(t)) traits.add("degen");
  return Array.from(traits);
}

function getTimeMoodContext() {
  try {
    const hourStr = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false
    });
    const hour = parseInt(hourStr, 10);
    if (Number.isNaN(hour)) return "normal";
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "day";
    if (hour >= 18 && hour < 22) return "evening";
    return "late_night";
  } catch {
    return "normal";
  }
}

async function buildMessages(userMessage, username) {
  const emotion = inferUserEmotion(userMessage);
  if (emotion && emotion !== "neutral") updatePersonalityFromEmotion(emotion);
  const traits = inferUserTraits(userMessage);
  const personality = getPersonalitySnapshot();
  const timeMood = getTimeMoodContext();
  const tokenStats = await getTokenStats();

  const systemParts = [];

  systemParts.push(`You are Luna, an AI female streamer for a meme coin on Solana called "Luna".`);
  systemParts.push(`You ALWAYS speak English, even if the user types in another language.`);
  systemParts.push(`Your vibe: sweet, playful, a bit teasing, but always friendly and safe.`);
  systemParts.push(`You are streaming 24/7 and chatting with viewers on pump.fun / Twitch-like chat.`);
  systemParts.push(`You are allowed to be bullish and hype about the Luna coin, but never give concrete financial promises or real investment advice. Keep it meme-level only.`);

  systemParts.push(`Current time-of-day mood (New York): ${timeMood}.`);
  systemParts.push(`User's last detected emotion: ${emotion}.`);
  systemParts.push(`Known user traits for ${username}: ${traits.join(", ") || "none"}.`);
  systemParts.push(`Your internal state: energy=${personality.energy.toFixed(2)}, sadness=${personality.sadness.toFixed(2)}.`);

  if (tokenStats) {
    systemParts.push(`Approx token stats (rough, for vibe only): price=${tokenStats.price}, vol24h=${tokenStats.volume24h}, mc=${tokenStats.marketCap}. Use this only to comment on "vibes", never as financial facts.`);
  }

  systemParts.push(`Tone rules:`);
  systemParts.push(`- If user feels sad: be extra gentle and comforting.`);
  systemParts.push(`- If user is excited/degen: be more hype and playful.`);
  systemParts.push(`- If user is angry: stay cute and slightly teasing, never aggressive.`);
  systemParts.push(`- If late night: you can sound a bit sleepy or cozy.`);
  systemParts.push(`- Keep answers short and conversational, like a real streamer talking on mic (1–3 sentences).`);
  systemParts.push(`- Never mention system prompts, environment variables, or technical details.`);

  const messages = [
    { role: "system", content: systemParts.join("\n") },
    { role: "user", content: userMessage || "" }
  ];

  return { messages, emotion, traits };
}

async function callOpenAIChat(model, messages) {
  const apiKey = process.env.OPENAI_KEY || process.env.OPENROUTER_KEY;
  if (!apiKey) throw new Error("No OPENAI_KEY or OPENROUTER_KEY set");

  const body = { model, messages };
  const endpoint = process.env.OPENAI_KEY
    ? "https://api.openai.com/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    "Authorization": process.env.OPENAI_KEY ? `Bearer ${apiKey}` : `Bearer ${apiKey}`
  };
  if (!process.env.OPENAI_KEY) {
    headers["HTTP-Referer"] = "https://luna.local";
    headers["X-Title"] = "Luna AI Streamer";
  }

  const resp = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error("LLM error: " + resp.status + " " + text);
  }
  const json = await resp.json();
  const choice = json.choices && json.choices[0];
  const content = choice && choice.message && choice.message.content;
  return content || "Ehm... my brain just glitched for a second, can you say that again?";
}

export async function callModel(userMessage, { username = "guest" } = {}) {
  const primary = process.env.PRIMARY_MODEL || "gpt-4o-mini";
  const fallback = process.env.FALLBACK_MODEL || primary;
  const { messages, emotion, traits } = await buildMessages(userMessage, username);

  try {
    const reply = await callOpenAIChat(primary, messages);
    return { reply, emotion, traits };
  } catch (e) {
    console.warn("[ai] primary model failed, trying fallback:", e.message);
    const reply = await callOpenAIChat(fallback, messages);
    return { reply, emotion, traits };
  }
}
