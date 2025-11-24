# ระบบคุย Luna - คู่มืออธิบายแบบละเอียดครบถ้วน

## 📋 สรุปภาพรวม

ระบบคุย Luna เป็นระบบ AI Chatbot ที่ใช้ OpenAI/OpenRouter API ในการตอบกลับข้อความ โดยมีฟีเจอร์หลักดังนี้:

### 🎯 ฟีเจอร์หลัก
1. **Emotion Detection** - ตรวจจับอารมณ์จากข้อความ (angry, sad, sleepy, hype, soft)
2. **Memory System** - จำประวัติการสนทนาและความชอบของผู้ใช้
3. **Personality System** - มีบุคลิกภาพที่เปลี่ยนแปลงตามอารมณ์ (energy, sadness)
4. **TTS (Text-to-Speech)** - แปลงข้อความเป็นเสียงพูด (ElevenLabs API)
5. **VTS Integration** - เชื่อมต่อกับ VTube Studio สำหรับแสดงอารมณ์
6. **Smart Model Selection** - เลือกใช้โมเดล AI ตามความยากของคำถาม
7. **Chat Reading System** - อ่านข้อความแชทออกเสียง
8. **Rate Limiting** - จำกัดจำนวนคำขอต่อนาที
9. **Caching System** - Cache ข้อความตอบกลับที่เหมือนกัน
10. **WebSocket Broadcasting** - ส่งข้อความแบบ real-time

---

## 🔄 Flow การทำงานของระบบ (แบบละเอียด)

### 1. **Endpoint**
```
POST /luna/message
POST /Luna/message (รองรับทั้งตัวพิมพ์เล็ก-ใหญ่)
```

### 2. **Request Format**
```json
{
  "text": "ข้อความที่ต้องการส่ง",
  "user": "ชื่อผู้ใช้"
}
```

### 3. **Validation** (`validateMessageRequest`)
- ✅ ตรวจสอบว่า `text` ไม่ว่าง
- ✅ ตรวจสอบความยาวข้อความ (ไม่เกิน 1000 ตัวอักษร)
- ✅ ตรวจสอบชื่อผู้ใช้ (ไม่เกิน 100 ตัวอักษร)
- ❌ ถ้าไม่ผ่าน → ส่ง error message ที่เป็นมิตร

### 4. **Processing Flow** (`handleLunaMessage` → `handleLunaMessageResponse`)

#### 4.1 **Custom Commands** (ตรวจสอบก่อน)
ถ้าข้อความขึ้นต้นด้วย `/luna `:
- **`/luna dance`** → ให้ Luna เต้น (trigger emotion "hype" ใน VTS)
- **`/luna mood`** → แสดงอารมณ์ปัจจุบันของ Luna
- **`/luna joke`** → เล่า joke แบบสุ่ม
- **`/luna help`** → แสดงคำสั่งที่ใช้ได้
- ถ้าไม่ใช่ command → ลบ `/luna ` ออกแล้วดำเนินการต่อ

#### 4.2 **Update Statistics**
- เพิ่มจำนวนข้อความทั้งหมด
- เพิ่มจำนวนข้อความต่อผู้ใช้

#### 4.3 **Social Awareness: ตรวจสอบผู้ใช้ใหม่**
- ถ้าเป็นผู้ใช้ใหม่ → เพิ่มเข้า `activeUsers`
- 70% โอกาสหันหน้าไปดูผู้ใช้ใหม่ (VTS) → หันหน้าเล็กน้อย (-15° หรือ +15°) แล้วกลับมา

#### 4.4 **Energy System: ลดพลังงานเมื่อพูดนาน**
- ถ้าพูดต่อเนื่องมากกว่า 5 ข้อความใน 1 นาที → ลดพลังงาน 0.05
- ถ้าพักนานกว่า 5 นาที → เพิ่มพลังงาน 0.1
- ถ้าพูดรวมมากกว่า 10 นาที → ลดพลังงาน 0.02

#### 4.5 **Physical Reaction: กระพริบตา**
- ทุก 3-5 วินาที → 30% โอกาสกระพริบตา
- ใช้ `setFaceAngle(0, -5, 0)` แล้วกลับมา (200ms)

#### 4.6 **Rate Limiting** (`checkRateLimit`)
- จำกัด **30 คำขอต่อนาที** ต่อผู้ใช้
- ถ้าเกิน → ส่ง error 429 "Whoa, slow down there! I need a moment to catch up~ 😅"

#### 4.7 **Chat Reading System**
- เพิ่มข้อความเข้า `chatReadingQueue` (เก็บสูงสุด 50 ข้อความ)
- ถ้าข้อความยาวเกิน 200 ตัวอักษร → พิมพ์แทนอ่าน
- **อ่านข้อความล่าสุดเสมอ** (ถ้า TTS enabled)
- **30% โอกาสกลับไปอ่านข้อความก่อนหน้า 1 ข้อความ** แล้วกลับมาอ่านล่าสุด
- **7% โอกาสอ่านผิด** (เฉพาะข้อความล่าสุด) → สลับคำหรือเปลี่ยนเสียงสระ
- ใช้เสียง `reading` หรือ `reading_quiet` (50-50) สำหรับอ่านเม้น

#### 4.8 **ตรวจสอบภาษา** (`isEnglishOnly`)
- ✅ รับเฉพาะภาษาอังกฤษเท่านั้น
- ❌ ถ้าไม่ใช่ภาษาอังกฤษ → ตอบกลับว่า "Sorry, I can only understand English right now"
- ตรวจสอบโดยดูว่ามีตัวอักษรละติน (a-zA-Z) และไม่มีตัวอักษรไทย ([\u0E00-\u0E7F])

#### 4.9 **Heuristic Check** (`shouldRespondHeuristic`)
- ตรวจสอบว่าควรตอบหรือไม่:
  - ข้อความยาว ≥ 120 ตัวอักษร → **ตอบเสมอ**
  - มีคำสำคัญ (luna, moon, help, please, love, hate, why, how, what, when, where, who, ?, gm, gn) → **ตอบเสมอ**
  - ลงท้ายด้วย `?` → **ตอบเสมอ**
  - ข้อความสั้น ≤ 3 ตัวอักษร → **20% โอกาสตอบ**
  - ข้อความสั้น ≤ 10 ตัวอักษร → **40% โอกาสตอบ**
  - อื่นๆ → **70% โอกาสตอบ**
- ถ้าไม่ควรตอบ → ส่ง `{ ok: true, skipped: true }`

#### 4.10 **คิดก่อนตอบ** (`thinkBeforeRespond`)
- **40% โอกาส** คิดก่อนตอบ (ถ้า TTS enabled)
- สุ่มคำคิด: "Um", "Uh", "Hmm", "Well", "Let me think", "Aaa", "Eee", etc.
- สร้าง TTS สำหรับคำคิด (ใช้ voice mode "normal")
- Broadcast ผ่าน WebSocket

#### 4.11 **Cache Check** (`getCacheKey`, `getCachedResponse`)
- สร้าง cache key จาก 100 ตัวอักษรแรกของข้อความ (lowercase, trim)
- ตรวจสอบ cache (TTL = 5 นาที)
- ถ้ามี cache → ใช้คำตอบจาก cache (ไม่ต้องเรียก AI)
- ถ้าไม่มี cache → เรียก AI และ cache คำตอบ

#### 4.12 **Emotion Detection** (`classifyEmotion`)
ตรวจจับอารมณ์จากข้อความ (rule-based, deterministic):
- **angry** - โกรธ (fuck you, stupid, trash, scam, hate, idiot, dumb)
- **sad** - เศร้า (sad, depressed, rekt, broke, lonely, cry, hurt, heartbroken)
- **sleepy** - ง่วง (sleepy, tired, going to bed, need sleep, yawning, bedtime)
- **hype** - ตื่นเต้น (lfg, moon, pump, let's go, to the moon, bullish, pog, fire, lit)
- **soft** - นุ่มนวล (cute, love you, thank you, sweet, adorable, wholesome, cozy)
- **null** - ไม่มีอารมณ์

**Priority Order**: angry → sad → sleepy → hype → soft (อารมณ์ที่แรงกว่า override อารมณ์ที่อ่อนกว่า)

#### 4.13 **Mixed Emotions** (`classifyMixedEmotions`)
- ตรวจจับอารมณ์หลายตัวพร้อมกัน
- คืนค่า: `{ primary: string, secondary: string | null }`
- ถ้ามีหลายอารมณ์ → ใช้อารมณ์แรกเป็น primary, อารมณ์ที่สองเป็น secondary
- ถ้ามีอารมณ์เดียว → secondary = null

#### 4.14 **Context-Aware Emotions** (`classifyEmotionContext`)
ตรวจจับบริบทของอารมณ์:
- **financial** - เรื่องเงิน/การเงิน (money, lost, broke, rich, trade, crypto, token, coin, sol, rekt, rug, pump, dump, moon, crash)
- **achievement** - ความสำเร็จ (promoted, won, achieved, success, victory, champion, award, prize)
- **loss** - การสูญเสีย (died, death, lost, gone, missing, left, abandoned, betrayed, cheated, lied, broken, heartbroken)
- **health** - สุขภาพ (sick, ill, pain, hurt, injured, hospital, doctor, medicine, cure, heal, recover)
- **relationship** - ความสัมพันธ์ (girlfriend, boyfriend, wife, husband, friend, family, parent, divorce, breakup, together, marry, marriage, love, hate)
- **work** - งาน (work, job, boss, colleague, fired, hired, promoted, salary, office, meeting, project, deadline, stress, pressure)
- **null** - ไม่มีบริบท

#### 4.15 **Social Context Detection**
- **isUserSad** - ผู้ใช้เศร้า (ตรวจจับจาก emotion "sad" หรือคำว่า sad, depressed, lonely, hurt, pain, suffering, struggling, difficult, hard, tough, problem, issue, worry, worried, anxious, stress, stressed)
- **isUserHappy** - ผู้ใช้มีความสุข (ตรวจจับจาก emotion "excited" หรือ "happy" หรือคำว่า happy, excited, great, awesome, amazing, wonderful, fantastic, success, succeed, won, achieved, accomplished, celebrate, celebration, yay, woo, yes!)
- **userDidSomething** - ผู้ใช้ทำอะไรให้ (ตรวจจับจากคำว่า bought, purchased, shared, share, support, helped, help, donated, donate, gifted, gift, subscribed, subscribe, followed, follow)
- **hasNews** - มีข่าวดี/ร้าย (ตรวจจับจากคำว่า news, happened, happening, just, got, received, found, discovered, told, said และข้อความยาว > 20 ตัวอักษร)

#### 4.16 **Negative Emotions Detection** (Luna's own emotions)
- **isAnnoyed** - หงุดหงิด:
  - ข้อความซ้ำ (80% เหมือนกับข้อความก่อนหน้า 3 ข้อความล่าสุด)
  - Spam (มากกว่า 3 ข้อความใน 30 วินาที)
- **isBored** - เบื่อ:
  - ข้อความสั้น (< 10 ตัวอักษร) หรือเป็นคำทักทายสั้นๆ (hi, hello, hey, gm, gn, lol, haha, ok, yes, no, thanks, thx)
  - ถ้ามีข้อความน่าเบื่อติดกัน ≥ 5 ครั้ง → Luna จะเบื่อ
  - ถ้ามีข้อความน่าสนใจ → ลด counter

**เก็บประวัติ**:
- เก็บประวัติข้อความของผู้ใช้ (10 ข้อความล่าสุด)
- เก็บข้อความล่าสุดทั้งหมด (20 ข้อความ) สำหรับตรวจสอบ spam

#### 4.17 **Model Selection** (`callModel`, `isComplexQuestion`)
เลือกใช้โมเดล AI ตามความยากของคำถาม:

**Simple Questions** → `gpt-4o-mini` (SIMPLE_MODEL)
- คำถามสั้นๆ (< 30 คำ และ < 200 ตัวอักษร)
- คำถามง่ายๆ
- การทักทาย

**Complex Questions** → `claude-3-opus` (COMPLEX_MODEL)
- คำถามยาว (> 30 คำ หรือ > 200 ตัวอักษร)
- คำถามที่ซับซ้อน (why, how, explain, analyze, compare, difference, relationship, mechanism, process, theory, concept, principle, strategy, approach, methodology, framework, architecture)
- คำถามเทคนิค (algorithm, protocol, implementation, optimization, scalability, infrastructure, paradigm, syntax, semantics, abstraction, encapsulation, polymorphism, inheritance, blockchain, cryptography, consensus, decentralized, smart contract, tokenomics, liquidity, yield, staking, governance)
- คำถามหลายคำถาม (มี ? มากกว่า 1 ตัว)
- คำถามที่ต้องการการวิเคราะห์ (should i, what should, which is better, pros and cons, advantages, disadvantages, recommend, suggest, advice, best way, optimal, efficient, effective)
- คำถามเปรียบเทียบ (vs, versus, or...or) และยาว > 10 คำ
- คำถามเกี่ยวกับเหตุผล/สาเหตุ (because, reason, cause, due to, result of) และยาว > 15 คำ

**Retry Logic**:
- พยายามใช้ selected model ก่อน
- ถ้าล้มเหลว → ใช้ fallback model (FALLBACK_MODEL)
- Retry สูงสุด 2 ครั้ง (exponential backoff: 1s, 2s, 5s)

#### 4.18 **Memory System** (`getUserMemory`, `updateUserMemory`)
เก็บข้อมูลผู้ใช้ในไฟล์ `tmp/luna_memory.json`:

**ข้อมูลที่เก็บ**:
- **conversationHistory** - ประวัติการสนทนา (5 ครั้งล่าสุด)
  - แต่ละ entry: `{ user: string, assistant: string, emotion: string | null, ts: string }`
  - มีการ "ลืม" แบบสุ่ม (20% โอกาสจำแค่ 2 ครั้งล่าสุด)
- **preferences** - ความชอบ (10 รายการล่าสุด)
  - ตรวจจับจากคำว่า like, love, favorite, prefer, enjoy + game/music/food/color/movie/show
  - มีการ "ลืม" แบบสุ่ม (30% โอกาสจำแค่ 2 รายการล่าสุด)
- **emotionHistory** - ประวัติอารมณ์ (7 รายการล่าสุด)
  - แต่ละ entry: `{ text: string, reply: string, emotion: string | null, ts: string }`
- **emotionScore** - คะแนนอารมณ์ (-10 ถึง +10)
  - soft/hype → +1
  - sad/angry → -1
  - Reset เมื่อ session เปลี่ยน
- **timesSeen** - จำนวนครั้งที่คุยกัน
- **traits** - ลักษณะพิเศษ (flirty, playful, serious, degen)
- **lastMessage** - ข้อความล่าสุด
- **lastReply** - คำตอบล่าสุด
- **lastEmotion** - อารมณ์ล่าสุด
- **sessionTag** - Tag สำหรับ session ปัจจุบัน (reset emotionScore เมื่อเปลี่ยน)

**Memory Decay**:
- Preferences เก่ากว่า 30 วัน → ถูกลบ
- Conversation history เก่ากว่า 7 วัน → ถูกลบ
- Emotion history → เก็บแค่ 7 รายการล่าสุด

#### 4.19 **Personality System** (`modules/personality.js`)
เก็บในไฟล์ `tmp/personality.json`:

**State**:
- **energy** - ระดับพลังงาน (0.0 - 1.0)
  - excited/happy → +0.05
  - sad → -0.03
  - angry → +0.02
  - Decay: ค่อยๆ กลับไป 0.5 (rate 0.06)
- **sadness** - ระดับความเศร้า (0.0 - 1.0)
  - sad → +0.06
  - excited/happy → -0.02
  - Decay: ค่อยๆ กลับไป 0.0 (rate 0.12)
- **lastReset** - เวลาที่ reset ล่าสุด

**Decay System**:
- เรียก `decayPersonality()` เป็นระยะ (ทุก 10 วินาที)
- energy → ค่อยๆ กลับไป 0.5
- sadness → ค่อยๆ กลับไป 0.0

#### 4.20 **Response Generation** (`callModel`)
เรียก AI model ผ่าน `modules/ai.js`:

**Input**:
- `userMessage` - ข้อความจากผู้ใช้
- `username` - ชื่อผู้ใช้
- `options` - Context เพิ่มเติม:
  - `lunaEnergy` - ระดับพลังงาน
  - `isNewUser` - ผู้ใช้ใหม่หรือไม่
  - `viewerCount` - จำนวนผู้ชม
  - `currentEmotion` - อารมณ์ปัจจุบัน
  - `emotionIntensity` - ความแรงของอารมณ์
  - `isAnnoyed` - หงุดหงิดหรือไม่
  - `isBored` - เบื่อหรือไม่
  - `isUserSad` - ผู้ใช้เศร้าหรือไม่
  - `isUserHappy` - ผู้ใช้มีความสุขหรือไม่
  - `userDidSomething` - ผู้ใช้ทำอะไรให้หรือไม่
  - `hasNews` - มีข่าวหรือไม่
  - `primaryEmotion` - อารมณ์หลัก
  - `secondaryEmotion` - อารมณ์รอง
  - `emotionContext` - บริบทของอารมณ์

**System Prompt** (สร้างโดย `buildMessages`):
- บทบาท: Luna, AI female streamer สำหรับ meme coin บน Solana
- **ALWAYS speak English** (แม้ผู้ใช้พิมพ์ภาษาอื่น)
- Vibe: sweet, playful, a bit teasing, friendly and safe, แต่ก็เป็นคน → อาจหงุดหงิด/เบื่อ/ผิดหวังได้
- Streaming 24/7 บน pump.fun / Twitch-like chat
- อนุญาตให้ bullish/hype เกี่ยวกับ Luna coin แต่ไม่ให้คำแนะนำการลงทุนจริง
- Context: time-of-day mood, user emotion, user traits, personality state (energy, sadness)
- Token stats (ถ้ามี): price, volume24h, marketCap (ใช้แค่ vibe เท่านั้น)
- Conversation history (3 ครั้งล่าสุด, มีการ "ลืม" แบบสุ่ม 20%)
- Preferences (มีการ "ลืม" แบบสุ่ม 30%)
- Relationship context (timesSeen, emotionScore)
- Tone rules: ปรับตามอารมณ์, เวลา, พลังงาน, จำนวนผู้ชม
- Natural speech patterns: ใช้ "um", "uh", "like", "you know" (10-15%)
- Self-correction: "Wait, actually...", "Hmm, let me think..." (5-10%)
- Reference previous messages (เมื่อเกี่ยวข้อง)
- Ask questions back (15-20%): "What about you?", "How about you?", "What do you think?"
- Apologize when unsure (5-10%): "Oh sorry, I think I misunderstood..."
- Transition topics (10%): "Oh, that reminds me...", "Speaking of which..."
- Forget/misremember old details (เป็นธรรมชาติ)
- Show uncertainty (10-15%): "I think", "maybe", "probably", "I'm not entirely sure"
- Repeat words when thinking/excited (5-10%): "I think... I think it's really cool!"
- Stop mid-sentence and change topic (5-10%)
- Express emotions through speech (10-15%): CAPS for emphasis ("That's SO cool!")
- Casual slang (5-10%): "That's lit!", "No cap!", "That's sus", "That's fire"
- Emojis (10-15%): 😊, 🎉, 😅, 😴, 💭
- Social connection: gratitude (10-15%), celebrate (10-15%), empathy (15-20%), care (10-15%), nicknames (5+ conversations), interest in users' lives (10-15%), surprise reactions (10-15%), thank users (20-30%), celebrate user happiness (15-20%)

**Output**:
- `reply` - ข้อความตอบกลับ
- `emotion` - อารมณ์ที่ตรวจจับได้
- `traits` - ลักษณะพิเศษของผู้ใช้

#### 4.21 **Emotion Continuity & Decay**
- **Emotion Duration**: อารมณ์คงอยู่ 30 วินาที
- **Emotion Decay**: ลด intensity ทุก 10 วินาที (rate 0.1)
  - ถ้า intensity < 0.2 → กลับเป็น neutral
- **Emotion Transition**: ถ้าอารมณ์เปลี่ยนเร็วเกินไป (< 30 วินาที) → 30% โอกาสเปลี่ยนทันที (ถ้า intensity > 0.8) หรือใช้อารมณ์เดิม
- **Sleepy Mode**: ถ้าอยู่ในโหมดง่วง → ทับเป็น sleepy เว้นแต่ angry/hype

#### 4.22 **Natural Pauses** (Thinking Time)
- คำถามยาก → หยุดคิด 1-3 วินาที
- เหนื่อย (energy < 0.5) → หยุดคิด 0.5-1.5 วินาที
- Simulate thinking time ก่อนตอบ

#### 4.23 **Reply Decoration** (`decorateReplyForEmotion`)
ปรับแต่งข้อความตามอารมณ์:
- **angry**: เพิ่ม prefix "Hey, that's kinda rude, you know? ", "Oi, don't be mean like that… "
- **sad**: เพิ่ม prefix "I'm really sorry you feel that way… ", "Hey, it's okay to feel sad sometimes… "
- **sleepy**: เพิ่ม prefix "Mmm... I'm a bit sleepy... ", "Yawn... "
- **hype**: เพิ่ม prefix "Yay! ", "Let's go! ", "Woo! "
- **soft**: เพิ่ม prefix "Aww~ ", "Ehehe~ ", "Mmm~ "

#### 4.24 **Human-like Speech Patterns**
- **Word Repetition** (4-15% โอกาส):
  - คำถามยาก → 15%
  - คำถามง่าย → 4%
  - ตัวอย่าง: "I think... I think it's really cool!"
- **Stutter** (2-8% โอกาส):
  - คำถามยาก → 8%
  - คำถามง่าย → 2%
  - ตัวอย่าง: "Th-that's amazing!"
- **Emphasis (CAPS)** (12% โอกาส, เมื่อ hype/excited):
  - ตัวอย่าง: "That's SO cool!", "I'm REALLY excited!"
- **Natural Response Length** (30% โอกาสตัดให้สั้น):
  - ถ้าคำตอบยาว > 100 ตัวอักษร → 50% โอกาสใช้แค่ประโยคแรก, 50% โอกาสใช้ 2 ประโยคแรก
  - ถ้ายังยาว > 150 ตัวอักษร → ตัดให้เหลือแค่ประโยคแรก

#### 4.25 **Negative Emotions Prefix**
- **isAnnoyed**: เพิ่ม prefix "Hmm, you're asking that again? ", "Ugh, we just talked about this... ", "Seriously? Again? "
- **isBored**: เพิ่ม prefix "Hmm... ", "Okay... ", "Right... ", "I see... " และตัดคำตอบให้สั้นลง

#### 4.26 **Personal Habits**
- **Catchphrases** (30% โอกาส, ทุก 5 นาที):
  - "Ehehe~", "Hmm~", "Aww~", "Let's go~", "Yay~"
- **Topic Changes** (15% โอกาส, ทุก 10 นาที):
  - "Oh, that reminds me...", "Speaking of which...", "Hmm, random thought...", "By the way..."
- **Inside Jokes** (20% โอกาส, กับผู้ใช้ที่คุย > 10 ครั้ง):
  - "Ehehe, you know what I'm gonna say~"

#### 4.27 **Inconsistency & Mistakes** (Human-like)
- **Misunderstand** (5% โอกาส): "Hmm, I'm not sure I understood that... could you say it again?"
- **Forget** (8% โอกาส): "Oh wait, what were we talking about again?", "Hmm, I think I forgot something..."
- **Answer Wrong** (3% โอกาส): "Hmm, I'm not 100% sure about this, but...", "I might be wrong, but I think..."

#### 4.28 **Voice Mode Selection**
เลือก voice mode ตามอารมณ์/พลังงาน/เวลา/จำนวนผู้ชม:
- **Base on emotion**:
  - sleepy → soft
  - sad/soft → soft
  - hype/excited → passion
  - angry → normal
- **Adjust based on energy**:
  - energy < 0.4 → soft (แม้จะปกติ)
  - energy > 0.8 + viewerCount > 20 → passion (แม้จะปกติ)
- **Adjust based on time**:
  - ดึก (22:00-06:00 US time) → soft (แม้จะปกติ)

#### 4.29 **TTS Generation** (`generateTTS`, `modules/tts.js`)
แปลงข้อความเป็นเสียงพูดด้วย ElevenLabs API:

**Voice Modes**:
- **normal** - เสียงปกติ (stability: 0.65, similarity: 0.9, style: 0.3, speed: 0.85)
- **soft** - เสียงนุ่ม (stability: 0.18, similarity: 0.98, style: 1.0, speed: 0.70)
- **passion** - เสียงตื่นเต้น (stability: 0.4, similarity: 0.95, style: 0.9, speed: 0.95)
- **reading** - อ่านเม้น (stability: 0.5, similarity: 0.9, style: 0.2, speed: 0.60)
- **reading_quiet** - อ่านเม้นแบบเบา (stability: 0.4, similarity: 0.85, style: 0.15, speed: 0.55, no speaker boost)

**Text Preprocessing**:
- **Soft mode**: เพิ่ม prefix "Mmm~ ", "Aww~ ", "Ehehe~ " และเปลี่ยน you → y-you, thank → th-thank, love → l-love, really → reaaally, so → soo, very → veery, เพิ่ม ending " okay~?", "~", " alright~?"
- **Passion mode**: เพิ่ม prefix "Let's goo~ ", "Yatta~! ", "Waaah~ " และเพิ่ม ending "!!", "~!!", "!! ✨", "!! 🚀"

**Process**:
1. Preprocess text ตาม voice mode
2. เรียก ElevenLabs API (`/v1/text-to-speech/{voiceId}`)
3. ใช้ model `eleven_multilingual_v2`
4. บันทึกไฟล์ MP3 ใน `public/tts/{uuid}.mp3`
5. คืนค่า UUID
6. Retry 1 ครั้งสำหรับ 5xx errors

**TTS_ENABLED**: ถ้าเป็น "false" → ไม่สร้างเสียง แต่ยังส่งข้อความได้

#### 4.30 **VTS Integration** (`modules/vts.js`)
เชื่อมต่อกับ VTube Studio ผ่าน WebSocket:

**Connection**:
- Host: `VTS_HOST` (default: 127.0.0.1)
- Port: `VTS_PORT` (default: 8001)
- Token: `VTS_AUTH_TOKEN`
- Enabled: `VTS_ENABLED === "true"`

**Authentication**:
- ถ้าไม่มี token → Request token จาก VTS
- ถ้ามี token → Send authentication request
- Auto-reconnect with backoff (3s → 5s → 10s)

**Emotion Hotkeys**:
- `emotion_angry` - โกรธ
- `emotion_sad` - เศร้า
- `emotion_sleepy` - ง่วง
- `emotion_hype` - ตื่นเต้น
- `emotion_soft` - นุ่มนวล
- `emotion_clear` - หน้า default ปกติ

**Functions**:
- `triggerForEmotion(emotion)` - Trigger emotion hotkey
- `clearExpressions()` - กลับหน้า default
- `setFaceAngle(x, y, z)` - ขยับหน้ากล้อง (หมุนหัว)
- `startIdleLoop()` - Idle animations (ทุก 20-45 วินาที)
- `startTalkReact(durationMs, mode)` - ขยับปากตามเวลาพูด (ใช้ MouthOpen parameter)
- `startBreathingLoop()` - หายใจ (ใช้ Breath parameter)
- `setBreathingMode(mode)` - เปลี่ยนโหมดหายใจ (normal/sleepy/hype)

**Talk-React**:
- ขยับปากตามเวลาพูด (ใช้ wave pattern)
- Speed factor: soft (0.8x), passion (1.2x), normal (1.0x)
- Update ทุก 60ms

**Breathing**:
- Normal: speed 0.055, amplitude 0.8
- Sleepy: speed 0.03, amplitude 0.7
- Hype: speed 0.09, amplitude 1.0
- Update ทุก 80ms

#### 4.31 **Broadcast** (WebSocket)
ส่งข้อความไปยังผู้ใช้ที่เชื่อมต่อ WebSocket:

**Message Types**:
- `luna_message` - ข้อความตอบกลับ
  ```json
  {
    "type": "luna_message",
    "from": "Luna",
    "text": "ข้อความตอบกลับ",
    "ttsUrl": "/public/tts/{uuid}.mp3",
    "voiceMode": "normal|soft|passion|hype|sleepy|angry"
  }
  ```
- `luna_typing_message` - พิมพ์ข้อความ (ไม่อ่าน)
- `emotion_update` - อัปเดตอารมณ์
  ```json
  {
    "type": "emotion_update",
    "emotion": "neutral|angry|sad|sleepy|hype|soft",
    "intensity": 0.0-1.0
  }
  ```
- `energy_update` - อัปเดตพลังงาน
  ```json
  {
    "type": "energy_update",
    "energy": 0.0-1.0
  }
  ```
- `character_state` - State ทั้งหมด
  ```json
  {
    "type": "character_state",
    "emotion": "...",
    "energy": 0.0-1.0,
    "emotionIntensity": 0.0-1.0
  }
  ```
- `face_angle` - ขยับหน้ากล้อง
  ```json
  {
    "type": "face_angle",
    "x": -15 to 15,
    "y": -15 to 15,
    "z": -15 to 15
  }
  ```
- `blink` - กระพริบตา
- `rps_match_found` - RPS match found
- `rps_betting_room_created` - RPS betting room created
- `rps_betting_room_removed` - RPS betting room removed
- `rps_betting_room_joined` - RPS betting room joined
- `rps_betting_match_result` - RPS betting match result

**Connection Management**:
- เก็บ clients ใน `Set<WebSocket>`
- Track reconnect attempts
- Send welcome message เมื่อเชื่อมต่อ
- Auto-cleanup เมื่อ disconnect

#### 4.32 **Update Memory & Logging**
- อัปเดต user memory (`updateUserMemory`)
- Log chat ลง database (`logChat`)
- Update statistics

#### 4.33 **VTS Emotion Display**
- ถ้าไม่ใช่ sleepy mode หรือ forceAwake:
  - Clear expressions (กลับหน้า default)
  - ถ้ามีอารมณ์ → Trigger emotion hotkey
  - หลังพูดเสร็จ (speakDuration + 400ms) → Clear expressions อีกครั้ง
- ถ้าเป็น sleepy mode → Lock หน้า sleepy
- ขยับหน้าเล็กน้อยซ้าย/ขวาแบบสุ่ม (-10° ถึง +10°)

#### 4.34 **Response**
```json
{
  "ok": true,
  "reply": "ข้อความตอบกลับ",
  "ttsUrl": "/public/tts/{uuid}.mp3",
  "voiceMode": "normal|soft|passion|hype|sleepy|angry",
  "emotion": "neutral|angry|sad|sleepy|hype|soft",
  "isCached": false,
  "responseTime": 1234
}
```

**Error Response**:
```json
{
  "ok": false,
  "error": "Error message",
  "message": "Friendly error message"
}
```

---

## 📁 โครงสร้างไฟล์และโมดูล

### ไฟล์หลัก
- **`index.js`** (3883 บรรทัด) - Express server, endpoints, WebSocket, chat handling
- **`modules/ai.js`** (417 บรรทัด) - AI model calling, message building, complex question detection
- **`modules/classifier.js`** (427 บรรทัด) - Emotion detection, heuristic checks, emotion intensity, mixed emotions, emotion context
- **`modules/memory.js`** (227 บรรทัด) - User memory management, conversation history, preferences, emotion history
- **`modules/personality.js`** (51 บรรทัด) - Personality system, energy/sadness decay
- **`modules/tts.js`** (307 บรรทัด) - Text-to-Speech (ElevenLabs), voice modes, text preprocessing
- **`modules/vts.js`** (638 บรรทัด) - VTube Studio integration, emotion triggers, idle loop, talk-react, breathing
- **`modules/db.js`** (116 บรรทัด) - Database logging (SQLite/Postgres), chat log, memory log, event log

---

## 🎨 ฟีเจอร์พิเศษ

### 1. **Custom Commands**
- `/luna dance` - ให้ Luna เต้น (trigger emotion "hype" ใน VTS)
- `/luna mood` - ดูอารมณ์ปัจจุบัน (แสดง emotion + intensity)
- `/luna joke` - เล่า joke แบบสุ่ม (3 jokes)
- `/luna help` - แสดงคำสั่งที่ใช้ได้

### 2. **Caching System**
- Cache ข้อความตอบกลับที่เหมือนกัน (ใช้ 100 ตัวอักษรแรกเป็น key)
- TTL = 5 นาที
- เก็บสูงสุด 1000 entries
- ลดการใช้ API และเพิ่มความเร็ว

### 3. **Natural Pauses**
- หยุดคิดก่อนตอบ (1-3 วินาที) สำหรับคำถามยาก
- เหนื่อย → หยุดคิดนานขึ้น (0.5-1.5 วินาที)
- Simulate thinking time เพื่อให้เหมือนคนจริง

### 4. **Emotion Decay**
- อารมณ์ลดลงตามเวลา (ทุก 10 วินาที, rate 0.1)
- ถ้า intensity < 0.2 → กลับเป็น neutral
- อารมณ์คงอยู่ 30 วินาที (Emotion Duration)

### 5. **Emotion Continuity**
- อารมณ์คงอยู่สักพัก (30 วินาที)
- ป้องกันการเปลี่ยนอารมณ์เร็วเกินไป
- ถ้าอารมณ์เปลี่ยนเร็ว (< 30 วินาที) → 30% โอกาสเปลี่ยนทันที (ถ้า intensity > 0.8) หรือใช้อารมณ์เดิม

### 6. **Human-like Speech Patterns**
- **Word Repetition** (4-15% โอกาส): "I think... I think it's really cool!"
- **Stutter** (2-8% โอกาส): "Th-that's amazing!"
- **Emphasis (CAPS)** (12% โอกาส, เมื่อ hype/excited): "That's SO cool!"
- **Natural Response Length** (30% โอกาสตัดให้สั้น): ตัดคำตอบยาว > 100 ตัวอักษร
- **Filler Words** (10-15%): "um", "uh", "like", "you know"
- **Self-correction** (5-10%): "Wait, actually...", "Hmm, let me think..."
- **Emojis** (10-15%): 😊, 🎉, 😅, 😴, 💭
- **Show Uncertainty** (10-15%): "I think", "maybe", "probably", "I'm not entirely sure"
- **Stop Mid-sentence** (5-10%): "I was thinking about... oh wait, did you see that message earlier?"
- **Casual Slang** (5-10%): "That's lit!", "No cap!", "That's sus", "That's fire"

### 7. **Social Connection Features**
- **Gratitude** (10-15%): "Thanks for watching!", "I really appreciate you being here!"
- **Celebrate** (10-15%): "Congratulations! That's amazing!", "Wow, that's so cool!"
- **Empathy** (15-20%): "I'm so sorry to hear that... I'm here for you"
- **Care** (10-15%): "Are you okay? I'm worried about you", "Take care of yourself, okay?"
- **Nicknames** (5+ conversations): "Hey there, {username}!", "What's up, {username}?"
- **Interest in Users' Lives** (10-15%, โดยเฉพาะกับผู้ใช้ที่คุยบ่อย): "How's your day going?", "What have you been up to?"
- **Surprise Reactions** (10-15%): "Oh my god! Really?!", "Wait, what?! That's incredible!"
- **Thank Users** (20-30% เมื่อผู้ใช้ทำอะไรให้): "Thanks for buying! That means a lot!"
- **Celebrate User Happiness** (15-20%): "I'm so happy you're happy!", "That's great! I'm glad to hear that!"

---

## 🔧 Configuration

### Environment Variables
```env
# AI API (ต้องมีอย่างน้อย 1 ตัว)
OPENAI_KEY=sk-... (ใช้ OpenAI API)
OPENROUTER_KEY=sk-... (ใช้ OpenRouter API)

# Models
PRIMARY_MODEL=gpt-4o-mini (ไม่ใช้แล้ว, ใช้ SIMPLE_MODEL/COMPLEX_MODEL แทน)
SIMPLE_MODEL=gpt-4o-mini (สำหรับคำถามง่าย)
COMPLEX_MODEL=anthropic/claude-3-opus (สำหรับคำถามยาก)
FALLBACK_MODEL=gpt-4o-mini (fallback เมื่อ model หลักล้มเหลว)

# TTS (ElevenLabs)
TTS_ENABLED=true (false = ปิด TTS)
ELEVEN_KEY=...
ELEVEN_VOICE_NORMAL=21m00Tcm4TlvDq8ikWAM (voice ID สำหรับ normal)
ELEVEN_VOICE_SOFT=21m00Tcm4TlvDq8ikWAM (voice ID สำหรับ soft)
ELEVEN_VOICE_PASSION=21m00Tcm4TlvDq8ikWAM (voice ID สำหรับ passion)

# VTS (VTube Studio)
VTS_ENABLED=true (false = ปิด VTS)
VTS_HOST=127.0.0.1
VTS_PORT=8001
VTS_AUTH_TOKEN=... (รัน 'node vts-auth.cjs' เพื่อขอ token)

# Database
DB_DRIVER=sqlite (sqlite|postgres|none)
DB_SQLITE_PATH=tmp/luna.db (สำหรับ SQLite)
DB_URL=postgresql://... (สำหรับ Postgres)

# Server
PORT=8787
CORS_ORIGINS=* (หรือ comma-separated list)

# Luna Token (สำหรับ RPS game)
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
```

---

## 📊 Statistics

ระบบเก็บสถิติใน `stats` object:
- **messages.total** - จำนวนข้อความทั้งหมด
- **messages.byUser** - จำนวนข้อความต่อผู้ใช้ (Map<username, count>)
- **messages.byEmotion** - จำนวนข้อความต่ออารมณ์ (Map<emotion, count>)
- **messages.byModel.simple** - จำนวนข้อความที่ใช้ simple model
- **messages.byModel.complex** - จำนวนข้อความที่ใช้ complex model
- **performance.totalResponseTime** - เวลาตอบกลับรวม (ms)
- **performance.responseCount** - จำนวนครั้งที่ตอบกลับ
- **performance.avgResponseTime** - เวลาตอบกลับเฉลี่ย (ms)
- **performance.cacheHits** - จำนวน cache hits
- **performance.cacheMisses** - จำนวน cache misses

---

## 🐛 Error Handling

### Error Messages (Friendly)
- **Rate limit** (429) → "Whoa, slow down there! I need a moment to catch up~ 😅"
- **Timeout** → "Oops! That took too long. Let me try again~"
- **Network** → "Hmm, something's wrong with the connection. Can you try again?"
- **API** (OpenAI/Claude error) → "Oh no! I'm having trouble connecting right now. Please wait a moment~"
- **Validation** → "Ehehe, I didn't quite understand that. Can you say it differently?"
- **Default** → "Oops! Something went wrong. Let me try again~ 😊"

### Error Logging
- Log errors ลง console พร้อม context (endpoint, user, message)
- ใช้ `logError()` function

---

## 🎯 สรุป

ระบบคุย Luna เป็นระบบที่ซับซ้อนและมีฟีเจอร์ครบถ้วน:

### ✅ ฟีเจอร์หลัก
- ตรวจจับอารมณ์และตอบสนองตามอารมณ์ (angry, sad, sleepy, hype, soft)
- จำประวัติการสนทนาและความชอบ (conversation history, preferences)
- มีบุคลิกภาพที่เปลี่ยนแปลงตามอารมณ์ (energy, sadness)
- เลือกใช้โมเดล AI ตามความยากของคำถาม (simple/complex)
- รองรับ TTS (ElevenLabs) และ VTS (VTube Studio)
- มี WebSocket สำหรับ real-time updates
- มีระบบ cache และ error handling
- อ่านข้อความแชทออกเสียง (chat reading system)
- Rate limiting (30 req/min)
- Natural pauses (thinking time)
- Human-like speech patterns (repetition, stutter, emphasis)
- Social connection features (gratitude, empathy, care)
- Memory decay (ลืมข้อมูลเก่า)
- Emotion continuity & decay
- Energy system (ลดพลังงานเมื่อพูดนาน)

### 📊 ตัวเลขสำคัญ
- **Rate Limit**: 30 คำขอต่อนาทีต่อผู้ใช้
- **Cache TTL**: 5 นาที
- **Max Message Length**: 1000 ตัวอักษร
- **Max Username Length**: 100 ตัวอักษร
- **Emotion Duration**: 30 วินาที
- **Emotion Decay Interval**: 10 วินาที
- **Max Queue Size**: 50 ข้อความ
- **Max Read Length**: 200 ตัวอักษร
- **Max Cache Entries**: 1000 entries

### 🔄 Flow สรุป
1. รับข้อความ → Validate → Custom Commands
2. Update Statistics → Social Awareness → Energy System
3. Physical Reactions → Rate Limiting → Chat Reading
4. Language Check → Heuristic Check → Think Before Respond
5. Cache Check → Emotion Detection → Model Selection
6. AI Response → Emotion Continuity → Natural Pauses
7. Reply Decoration → Human-like Patterns → Voice Selection
8. TTS Generation → VTS Display → Broadcast → Response

---

## 📝 หมายเหตุ

- ระบบรับเฉพาะภาษาอังกฤษเท่านั้น (ตรวจสอบด้วย `isEnglishOnly()`)
- ข้อความต้องไม่เกิน 1000 ตัวอักษร
- ชื่อผู้ใช้ต้องไม่เกิน 100 ตัวอักษร
- ระบบใช้ OpenAI/OpenRouter API สำหรับการตอบกลับ
- ระบบใช้ ElevenLabs API สำหรับ TTS
- ระบบใช้ VTube Studio API สำหรับแสดงอารมณ์
- ข้อมูลเก็บในไฟล์ JSON (memory, personality) และ SQLite/Postgres (logs)
- WebSocket ใช้สำหรับ real-time broadcasting
- Rate Limiting: 30 req/min ต่อผู้ใช้
- Cache: 5 นาที TTL, สูงสุด 1000 entries

