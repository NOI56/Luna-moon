const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
const container = document.getElementById("container");
const player = document.getElementById("player");

ws.onmessage = (ev) => {
  try {
    const msg = JSON.parse(ev.data);
    if (msg.type === "purchase") showPurchase(msg);
    if (msg.type === "tts_play") playTTS(msg.url);
    if (msg.type === "attention") showAttention(msg);
    if (msg.type === "fame_update") showFame(msg);
    if (msg.type === "luna_message") showLunaMessage(msg);
  } catch (e) {
    console.error(e);
  }
};

function makeCard() {
  const el = document.createElement("div");
  el.className = "card";
  return el;
}

function showPurchase(p) {
  const el = makeCard();
  const buyer = p.buyer || "Someone";
  const amount = typeof p.amount === "number" ? p.amount : p.amount || "";
  const currency = p.currency || "SOL";
  const isBig = !!p.big;

  if (isBig) {
    el.classList.add("big-purchase");
    el.innerHTML = `
      <div class="title">🐳 BIG BUY</div>
      <div class="sub">${buyer} bought <b>${amount} ${currency}</b></div>
      <div class="sub small">${p.text || ""}</div>
    `;
  } else {
    el.innerHTML = `
      <div class="title">${buyer} bought ${amount} ${currency}</div>
      <div class="sub">${p.text || ""}</div>
    `;
  }

  container.prepend(el);
  setTimeout(() => el.remove(), isBig ? 9000 : 5000);
  if (p.ttsUrl) playTTS(p.ttsUrl);
}

function showAttention(m) {
  const el = makeCard();
  el.innerHTML = `
    <div class="title">Attention</div>
    <div class="sub">${m.user || "Someone"}: ${m.text || ""}</div>
  `;
  container.prepend(el);
  setTimeout(() => el.remove(), 4000);
}

function showFame(m) {
  const el = makeCard();
  const top = (m.fame || [])[0];
  if (top) {
    el.innerHTML = `
      <div class="title">Top: ${top.user} — ${top.score}</div>
      <div class="sub">Top 10 supporters</div>
    `;
    container.prepend(el);
    setTimeout(() => el.remove(), 6000);
  }
}

function showLunaMessage(m) {
  const el = makeCard();
  el.innerHTML = `
    <div class="title">Luna</div>
    <div class="sub"><span class="from">${m.from || "chat"}</span>: ${m.text}</div>
  `;
  container.prepend(el);
  setTimeout(() => el.remove(), 6000);
  if (m.ttsUrl) playTTS(m.ttsUrl);
}

function playTTS(url) {
  if (!player) return;
  const src = url.startsWith("/") ? (location.origin + url) : url;
  player.src = src;
  player.play().catch(() => {});
}
