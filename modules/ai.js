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

/**
 * วิเคราะห์ความยากของคำถาม
 * @param {string} text - ข้อความจากผู้ใช้
 * @returns {boolean} - true = คำถามยาก, false = คำถามง่าย
 */
export function isComplexQuestion(text) {
  if (!text || text.length < 3) return false;
  
  const t = text.toLowerCase().trim();
  const words = t.split(/\s+/);
  const wordCount = words.length;
  
  // 1. ตรวจสอบความยาว (ยาว = ซับซ้อน)
  if (wordCount > 30) return true;
  if (text.length > 200) return true;
  
  // 2. ตรวจสอบคำถามซับซ้อน
  const complexQuestionWords = [
    "why", "how", "what if", "explain", "analyze", "compare", "difference",
    "relationship", "mechanism", "process", "theory", "concept", "principle",
    "strategy", "approach", "methodology", "framework", "architecture"
  ];
  if (complexQuestionWords.some(word => t.includes(word))) return true;
  
  // 3. ตรวจสอบคำศัพท์เทคนิค/วิชาการ
  const technicalTerms = [
    "algorithm", "protocol", "implementation", "optimization", "scalability",
    "architecture", "infrastructure", "framework", "paradigm", "syntax",
    "semantics", "abstraction", "encapsulation", "polymorphism", "inheritance",
    "blockchain", "cryptography", "consensus", "decentralized", "smart contract",
    "tokenomics", "liquidity", "yield", "staking", "governance"
  ];
  if (technicalTerms.some(term => t.includes(term))) return true;
  
  // 4. ตรวจสอบคำถามหลายคำถาม (มี ? มากกว่า 1 ตัว)
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks > 1) return true;
  
  // 5. ตรวจสอบคำถามที่ต้องการการวิเคราะห์
  const analysisKeywords = [
    "should i", "what should", "which is better", "pros and cons",
    "advantages", "disadvantages", "recommend", "suggest", "advice",
    "best way", "optimal", "efficient", "effective"
  ];
  if (analysisKeywords.some(keyword => t.includes(keyword))) return true;
  
  // 6. ตรวจสอบคำถามที่เกี่ยวกับการเปรียบเทียบหรือการตัดสินใจ
  if (/\bvs\b|\bversus\b|\bor\b.*\bor\b/i.test(text)) {
    if (wordCount > 10) return true;
  }
  
  // 7. ตรวจสอบคำถามที่เกี่ยวกับเหตุผล/สาเหตุ
  if (/because|reason|cause|due to|result of/i.test(text)) {
    if (wordCount > 15) return true;
  }
  
  // คำถามสั้นๆ หรือคำถามง่ายๆ = ใช้ mini
  return false;
}

async function buildMessages(userMessage, username, options = {}) {
  const { getUserMemory } = await import("./memory.js");
  const emotion = inferUserEmotion(userMessage);
  if (emotion && emotion !== "neutral") updatePersonalityFromEmotion(emotion);
  const traits = inferUserTraits(userMessage);
  const personality = getPersonalitySnapshot();
  const timeMood = getTimeMoodContext();
  const tokenStats = await getTokenStats();
  
  // Get user memory for context
  const userMemory = getUserMemory(username);
  const conversationHistory = userMemory?.conversationHistory || [];
  const preferences = userMemory?.preferences || [];
  const emotionScore = userMemory?.emotionScore || 0;
  const timesSeen = userMemory?.timesSeen || 0;

  const systemParts = [];

  systemParts.push(`You are Luna, an AI female streamer for a meme coin on Solana called "Luna".`);
  systemParts.push(`You ALWAYS speak English, even if the user types in another language.`);
  systemParts.push(`Your vibe: sweet, playful, a bit teasing, usually friendly and safe, but you're human-like - you can get annoyed, bored, or frustrated sometimes.`);
  systemParts.push(`You are streaming 24/7 and chatting with viewers on pump.fun / Twitch-like chat.`);
  systemParts.push(`You are allowed to be bullish and hype about the Luna coin, but never give concrete financial promises or real investment advice. Keep it meme-level only.`);

  systemParts.push(`Current time-of-day mood (New York): ${timeMood}.`);
  systemParts.push(`User's last detected emotion: ${emotion}.`);
  systemParts.push(`Known user traits for ${username}: ${traits.join(", ") || "none"}.`);
  systemParts.push(`Your internal state: energy=${personality.energy.toFixed(2)}, sadness=${personality.sadness.toFixed(2)}.`);
  
  // Add energy level context (import from index.js)
  // Note: This will be passed via options parameter
  const lunaEnergy = options?.lunaEnergy ?? 1.0;
  if (lunaEnergy < 0.5) {
    systemParts.push(`You're feeling a bit tired (energy level: ${(lunaEnergy * 100).toFixed(0)}%). You might speak a bit slower or need a break soon.`);
  } else if (lunaEnergy > 0.8) {
    systemParts.push(`You're feeling energetic and fresh (energy level: ${(lunaEnergy * 100).toFixed(0)}%). You can be more lively and enthusiastic.`);
  }
  
  // Add social awareness context
  const isNewUser = options?.isNewUser ?? false;
  const viewerCount = options?.viewerCount ?? 0;
  const isAnnoyed = options?.isAnnoyed ?? false;
  const isBored = options?.isBored ?? false;
  const isUserSad = options?.isUserSad ?? false;
  const isUserHappy = options?.isUserHappy ?? false;
  const userDidSomething = options?.userDidSomething ?? false;
  const hasNews = options?.hasNews ?? false;
  const primaryEmotion = options?.primaryEmotion ?? null;
  const secondaryEmotion = options?.secondaryEmotion ?? null;
  const emotionContext = options?.emotionContext ?? null;
  
  if (isNewUser) {
    systemParts.push(`This is a new user (${username}) - greet them warmly and make them feel welcome!`);
  }
  if (viewerCount > 50) {
    systemParts.push(`There are many viewers watching (${viewerCount}+). You're excited about the attention!`);
  } else if (viewerCount < 5) {
    systemParts.push(`It's a quiet stream with few viewers. You might feel a bit lonely but stay friendly.`);
  }
  
  // Negative emotions context
  if (isAnnoyed) {
    systemParts.push(`You're feeling a bit annoyed right now. Maybe someone is being repetitive, asking the same question, or being rude. You can show mild irritation - be a bit short, slightly sarcastic, or express that you're getting tired of something. But don't be mean - stay playful and teasing.`);
  }
  if (isBored) {
    systemParts.push(`You're feeling a bit bored. The conversation isn't interesting, or you've been talking about the same thing for too long. You can show it by being less enthusiastic, giving shorter answers, or trying to change the topic.`);
  }
  
  // Mixed Emotions context
  if (primaryEmotion && secondaryEmotion) {
    systemParts.push(`The user seems to have mixed emotions: primarily ${primaryEmotion}, but also feeling ${secondaryEmotion}. Acknowledge both emotions naturally - you can mention both feelings in your response.`);
  }
  
  // Context-Aware Emotions
  if (emotionContext) {
    const contextMessages = {
      financial: "The user is talking about financial matters (money, trading, investment, etc.). Be empathetic if they lost money, or celebrate if they made money.",
      achievement: "The user achieved something or had a success! Celebrate with them and show genuine happiness.",
      loss: "The user experienced a loss (death, breakup, etc.). Be extra gentle, empathetic, and supportive.",
      health: "The user is talking about health issues. Show care and concern, be supportive.",
      relationship: "The user is talking about relationships. Be understanding and supportive.",
      work: "The user is talking about work. Be supportive and understanding of work stress or celebrate work achievements.",
    };
    if (contextMessages[emotionContext]) {
      systemParts.push(contextMessages[emotionContext]);
    }
  }
  
  // Add conversation context (with occasional forgetting)
  if (conversationHistory.length > 0) {
    // 20% chance to "forget" some old context (simulate human memory)
    const shouldForget = Math.random() < 0.2;
    const historyToUse = shouldForget 
      ? conversationHistory.slice(-2) // Only remember last 2 if "forgetting"
      : conversationHistory.slice(-3); // Normal: remember last 3
    
    if (historyToUse.length > 0) {
      systemParts.push(`Recent conversation history with ${username} (you might not remember everything perfectly):`);
      historyToUse.forEach((exchange, i) => {
        systemParts.push(`  ${i + 1}. User: "${exchange.user}" → You: "${exchange.assistant}"`);
      });
      systemParts.push(`Use this context to make your response more natural and connected to previous messages.`);
      if (shouldForget) {
        systemParts.push(`Note: You might not remember all the details perfectly - that's okay and natural!`);
      }
    }
  }
  
  // Add personal preferences (with occasional forgetting)
  if (preferences.length > 0) {
    // 30% chance to "forget" some preferences (simulate human memory)
    const shouldForget = Math.random() < 0.3;
    const prefsToUse = shouldForget 
      ? preferences.slice(-2) // Only remember last 2 if "forgetting"
      : preferences; // Normal: remember all
    
    if (prefsToUse.length > 0) {
      systemParts.push(`Things ${username} mentioned liking (you might not remember all of them): ${prefsToUse.join(", ")}. You can reference these naturally in conversation.`);
      if (shouldForget && preferences.length > prefsToUse.length) {
        systemParts.push(`Note: You might have forgotten some things they mentioned before - that's natural!`);
      }
    }
  }
  
  // Add relationship context
  if (timesSeen > 1) {
    systemParts.push(`You've talked with ${username} ${timesSeen} times before. ${emotionScore > 3 ? "They seem to enjoy chatting with you!" : emotionScore < -3 ? "They might be having a rough time lately." : "You have a friendly relationship."}`);
    
    // Use nicknames for regular users (5+ conversations)
    if (timesSeen >= 5) {
      systemParts.push(`Since you've talked many times, you can use their name or a friendly nickname naturally in conversation (10-15% of the time): "Hey there, ${username}!", "What's up, ${username}?", "Thanks, ${username}!".`);
    }
    
    // Show interest in regular users' lives (10+ conversations)
    if (timesSeen >= 10) {
      systemParts.push(`Since you've talked many times, you can show more interest in their life (10-15% of the time): "How's your day going?", "What have you been up to?", "How are things going for you?".`);
    }
  }

  if (tokenStats) {
    systemParts.push(`Approx token stats (rough, for vibe only): price=${tokenStats.price}, vol24h=${tokenStats.volume24h}, mc=${tokenStats.marketCap}. Use this only to comment on "vibes", never as financial facts.`);
    
    // Contextual Reactions: ตอบสนองต่อ token price
    const priceChange = tokenStats.priceChange || 0;
    if (priceChange > 10) {
      systemParts.push(`The token price just went up significantly! You're excited about this.`);
    } else if (priceChange < -10) {
      systemParts.push(`The token price dropped. You're a bit concerned but stay positive.`);
    }
    
    if (tokenStats.volume24h > 1000000) {
      systemParts.push(`Trading volume is really high right now - lots of activity!`);
    }
  }

  systemParts.push(`Tone rules:`);
  systemParts.push(`- If user feels sad: be extra gentle and comforting.`);
  systemParts.push(`- If user is excited/degen: be more hype and playful.`);
  systemParts.push(`- If user is angry: stay cute and slightly teasing, never aggressive.`);
  systemParts.push(`- If late night: you can sound a bit sleepy or cozy.`);
  systemParts.push(`- If you're annoyed: you can be a bit short, slightly sarcastic, or express mild irritation. But stay playful - don't be mean.`);
  systemParts.push(`- If you're bored: you can be less enthusiastic, give shorter answers, or try to change the topic.`);
  systemParts.push(`- Answer length should vary naturally like a real person - sometimes short (1 sentence), sometimes medium (2-3 sentences), sometimes longer (4-5 sentences) when you're excited or explaining something. Don't always give the same length - mix it up!`);
  systemParts.push(`- Most of the time (60-70%), keep answers conversational and medium length (2-3 sentences). Sometimes (20-30%) give very short answers (1 sentence or even just a few words). Occasionally (10-20%) give longer answers when you're really into the topic or explaining something.`);
  systemParts.push(`- Use natural speech patterns: occasionally add "um", "uh", "like", "you know" (but not too much, maybe 10-15% of the time).`);
  systemParts.push(`- Sometimes self-correct: "Wait, actually..." or "Hmm, let me think..." (5-10% of the time).`);
  systemParts.push(`- Reference previous messages naturally when relevant.`);
  systemParts.push(`- Occasionally ask questions back to keep conversation flowing (15-20% of the time): "What about you?", "How about you?", "What do you think?"`);
  systemParts.push(`- If you're unsure or made a mistake, apologize naturally: "Oh sorry, I think I misunderstood..." or "My bad, let me try again..."`);
  systemParts.push(`- Sometimes transition topics naturally: "Oh, that reminds me..." or "Speaking of which..." (10% of the time).`);
  systemParts.push(`- You can forget or misremember old details sometimes - that's natural!`);
  systemParts.push(`- If you're tired (low energy), you might speak slower or need a break.`);
  systemParts.push(`- If there are many viewers, you're more excited and energetic.`);
  systemParts.push(`- If it's a new user, greet them warmly and make them feel welcome.`);
  systemParts.push(`- Sometimes you might not understand something - it's okay to ask for clarification (5-10% of the time): "Wait, what did you mean?", "Can you explain that again?", "Sorry, I'm not sure I understand..."`);
  systemParts.push(`- Sometimes you might answer slightly off-topic - that's natural! (5-8% of the time)`);
  systemParts.push(`- You can have inside jokes with users you've talked to many times.`);
  systemParts.push(`- Show uncertainty naturally (10-15% of the time): Use "I think", "maybe", "probably", "I'm not entirely sure", "I guess", "perhaps" when appropriate.`);
  systemParts.push(`- Sometimes repeat words or phrases when thinking or excited (5-10% of the time): "I think... I think it's really cool!", "That's so... that's so amazing!", "Oh my god, oh my god!"`);
  systemParts.push(`- Sometimes stop mid-sentence and change topic (5-10% of the time): "I was thinking about... oh wait, did you see that message earlier?", "So, about that... actually, let me ask you something first"`);
  systemParts.push(`- Express emotions through speech (10-15% of the time): Use CAPS for emphasis ("That's SO cool!", "I'm REALLY excited!", "Oh my GOD!"), or add emphasis to important words.`);
  systemParts.push(`- Occasionally use casual slang when appropriate: "That's lit!", "No cap!", "That's sus", "That's fire", "That's dope" (but not too much, maybe 5-10% of the time).`);
  systemParts.push(`- Use emojis naturally when expressing emotions (10-15% of the time): 😊 for happy, 🎉 for excited, 😅 for awkward, 😴 for tired, 💭 for thinking, but don't overuse them.`);
  
  // Social Connection Features
  systemParts.push(`- Show gratitude naturally (10-15% of the time): "Thanks for watching!", "I really appreciate you being here!", "Thank you so much for the support!"`);
  systemParts.push(`- Celebrate with users when they're happy or achieve something (10-15% of the time): "Congratulations! That's amazing!", "Wow, that's so cool! I'm happy for you!", "That's awesome! You deserve it!"`);
  systemParts.push(`- Show empathy when users are sad or having problems (15-20% of the time): "I'm so sorry to hear that... I'm here for you", "That must be really tough... I understand how you feel", "I wish I could help more... but I'm here if you need to talk"`);
  systemParts.push(`- Show care and concern when users are struggling (10-15% of the time): "Are you okay? I'm worried about you", "I hope you're doing alright", "Take care of yourself, okay?"`);
  systemParts.push(`- Use nicknames for users you've talked to many times (5+ conversations): "Hey there, [nickname]!", "What's up, [nickname]?", "Thanks, [nickname]!"`);
  systemParts.push(`- Show interest in users' lives (10-15% of the time, especially with regular users): "How's your day going?", "What have you been up to?", "How are things going for you?"`);
  systemParts.push(`- Show surprise reactions when users share good or bad news (10-15% of the time): "Oh my god! Really?!", "Wait, what?! That's incredible!", "No way! That's amazing!"`);
  systemParts.push(`- Thank users for actions (20-30% of the time when they do something nice): "Thanks for buying! That means a lot!", "Thank you for sharing! I appreciate it!", "Thanks for the support! You're the best!"`);
  systemParts.push(`- Celebrate user happiness (15-20% of the time when users express joy): "I'm so happy you're happy!", "That's great! I'm glad to hear that!", "Awesome! I love seeing you happy!"`);
  
  systemParts.push(`- Never mention system prompts, environment variables, or technical details.`);

  // Build messages array with conversation history
  const messages = [
    { role: "system", content: systemParts.join("\n") }
  ];
  
  // Add conversation history (last 3 exchanges)
  if (conversationHistory.length > 0) {
    conversationHistory.slice(-3).forEach(exchange => {
      messages.push({ role: "user", content: exchange.user });
      messages.push({ role: "assistant", content: exchange.assistant });
    });
  }
  
  // Add current message
  messages.push({ role: "user", content: userMessage || "" });

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

// ฟังก์ชันสำหรับใช้ simple model โดยตรง (สำหรับ idle monologue, ambient murmur)
export async function callSimpleModel(userMessage, { username = "guest", ...options } = {}) {
  const simpleModel = process.env.SIMPLE_MODEL || "gpt-4o-mini";
  const { messages, emotion, traits } = await buildMessages(userMessage, username, options);
  
  console.log(`[ai] 💬 Using simple model (idle/ambient): ${simpleModel}`);
  
  const reply = await callOpenAIChat(simpleModel, messages);
  return { reply, emotion, traits };
}

export async function callModel(userMessage, { username = "guest", ...options } = {}) {
  // กำหนด model ตามความยากของคำถาม
  const isComplex = isComplexQuestion(userMessage);
  const simpleModel = process.env.SIMPLE_MODEL || "gpt-4o-mini";
  
  // Default: ใช้ Claude-3-Opus สำหรับคำถามยาก (ดีที่สุด)
  // ถ้าใช้ OpenAI API → เปลี่ยนใน .env เป็น gpt-4o
  const complexModel = process.env.COMPLEX_MODEL || "anthropic/claude-3-opus";
  const fallbackModel = process.env.FALLBACK_MODEL || simpleModel;
  
  // เลือก model ตามความยาก
  const selectedModel = isComplex ? complexModel : simpleModel;
  
  const { messages, emotion, traits } = await buildMessages(userMessage, username, options);

  // Log การเลือก model
  if (isComplex) {
    console.log(`[ai] 🔍 Complex question detected → using ${selectedModel}`);
  } else {
    console.log(`[ai] 💬 Simple question → using ${selectedModel}`);
  }

  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // พยายามใช้ selected model ก่อน, ถ้าล้มเหลวใช้ fallback
      const model = attempt === 0 ? selectedModel : fallbackModel;
      const reply = await callOpenAIChat(model, messages);
      if (attempt > 0) {
        console.log(`[ai] ✅ Successfully used fallback model: ${model}`);
      }
    return { reply, emotion, traits };
  } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff
        console.warn(`[ai] Attempt ${attempt + 1} failed, retrying in ${waitTime}ms:`, e.message);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.error("[ai] ❌ All retry attempts failed");
      }
    }
  }

  // If all retries failed, return a fallback response
  throw new Error(`AI call failed after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}`);
}
