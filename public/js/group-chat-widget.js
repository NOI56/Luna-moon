'use strict';

(function initGroupChatWidget() {
  if (window.__GROUP_CHAT_WIDGET_INIT__) {
    return;
  }
  window.__GROUP_CHAT_WIDGET_INIT__ = true;

  const GROUP_CHAT_ROOM_ID = 'group_chat';
  const API_BASE = window.location.origin;
  const DOCKED_STORAGE_KEY = 'groupChatWidgetDocked';
  const MAX_MESSAGES = 32;
  const FETCH_LIMIT = 60;
  const RECONNECT_DELAY_MS = 4000;
  const RESYNC_INTERVAL_MS = 2000;
  const REALTIME_FALLBACK_THRESHOLD_MS = 3000;
  const READY_STATES = new Set(['interactive', 'complete']);
  const WIDGET_HEIGHT_STORAGE_KEY = 'groupChatWidgetHeight';
  const MIN_WIDGET_HEIGHT = 280;
  const MAX_WIDGET_HEIGHT = 720;
  const DYNAMIC_STYLE_ID = 'groupChatWidgetDynamicStyles';
  const CHAT_ACCESS_STORAGE_KEY = 'groupChatUnlocked';
  const CHAT_ACCESS_UNLOCK_TTL_MS = 5 * 1000;
  const CHAT_ACCESS_LOCK_TTL_MS = 5 * 1000;
  const ACCESS_CHECK_INTERVAL_MS = 5 * 1000;
  const REQUIREMENT_CACHE_TTL_MS = 60 * 1000;
  const DEFAULT_CHAT_MIN_BALANCE = 100000;
  const DEFAULT_WIDGET_BLUR_MESSAGE = 'Connect your wallet and hold Luna tokens to unlock live chat preview.';
  const DYNAMIC_STYLE_BLOCK = `
#groupChatWidget .group-chat-widget__messages {
  display: flex !important;
  flex-direction: column;
  justify-content: flex-end;
  gap: 18px;
  padding: 16px 14px 18px 14px;
  min-height: 0;
}

#groupChatWidget .group-chat-widget__messages-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

#groupChatWidget .group-chat-widget__message {
  position: relative;
  padding: 6px 10px 6px 22px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  isolation: isolate;
}

#groupChatWidget .group-chat-widget__message::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, #00f0ff, #8f5dff);
  box-shadow: 0 0 14px rgba(0, 255, 255, 0.65);
  opacity: 0.95;
}

#groupChatWidget .group-chat-widget__message-header {
  justify-content: space-between;
  color: rgba(255, 255, 255, 0.75);
  padding-right: 6px;
}

#groupChatWidget .group-chat-widget__text {
  position: relative;
  z-index: 1;
  text-align: left;
  padding: 14px 18px;
  border: 1.5px solid rgba(0, 255, 255, 0.55);
  border-radius: 18px;
  background:
    linear-gradient(145deg, rgba(0, 40, 70, 0.92), rgba(10, 0, 27, 0.85)),
    radial-gradient(circle at top left, rgba(0, 255, 255, 0.25), transparent 55%);
  box-shadow:
    inset 0 0 22px rgba(0, 255, 255, 0.14),
    0 18px 28px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
}

#groupChatWidget .group-chat-widget__text::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 18px;
  padding: 1px;
  background: linear-gradient(120deg, rgba(0, 255, 255, 0.7), rgba(143, 93, 255, 0.6));
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
  opacity: 0.4;
}

#groupChatWidget .group-chat-widget__messages.blurred {
  filter: blur(6px);
  pointer-events: none;
  user-select: none;
}

#groupChatWidget .group-chat-widget__blur-overlay {
  position: absolute;
  inset: 0;
  border-radius: 22px;
  border: 1px solid rgba(0, 255, 255, 0.15);
  background: rgba(3, 10, 28, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 18px;
  z-index: 10;
  transition: opacity 0.25s ease;
}

#groupChatWidget .group-chat-widget__blur-overlay.hidden {
  opacity: 0;
  pointer-events: none;
}

#groupChatWidget .group-chat-widget__blur-content {
  max-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: rgba(255, 255, 255, 0.9);
}

#groupChatWidget .group-chat-widget__blur-title {
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #00ffbf;
  font-size: 0.85rem;
}

#groupChatWidget .group-chat-widget__blur-message {
  font-size: 0.78rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.85);
}
`;

  const state = {
    messages: [],
    ws: null,
    reconnectTimer: null,
    refreshTimer: null,
    isCollapsed: false,
    isDocked: readDockedPreference(),
    userOverrideCollapse: false,
    unread: 0,
    isLoading: false,
    elements: {},
    mediaQuery: null,
    mediaQueryHandler: null,
    lastRealtimeUpdate: 0,
    currentHeight: null,
    requirementCache: {
      value: null,
      expires: 0
    },
    accessCheckInterval: null
  };

  function readDockedPreference() {
    try {
      return window.localStorage.getItem(DOCKED_STORAGE_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }

  function writeDockedPreference(value) {
    try {
      if (value) {
        window.localStorage.setItem(DOCKED_STORAGE_KEY, 'true');
      } else {
        window.localStorage.removeItem(DOCKED_STORAGE_KEY);
      }
    } catch (error) {
      // ignore
    }
  }

  function readStoredWidgetHeight() {
    try {
      const raw = window.localStorage.getItem(WIDGET_HEIGHT_STORAGE_KEY);
      if (raw == null) {
        return null;
      }
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        return clampWidgetHeight(parsed);
      }
    } catch (error) {
      // ignore
    }
    return null;
  }

  function writeStoredWidgetHeight(value) {
    try {
      window.localStorage.setItem(WIDGET_HEIGHT_STORAGE_KEY, String(clampWidgetHeight(value)));
    } catch (error) {
      // ignore
    }
  }

  function clampWidgetHeight(value) {
    return Math.max(MIN_WIDGET_HEIGHT, Math.min(MAX_WIDGET_HEIGHT, value));
  }

  function applyWidgetHeight(value) {
    const { widget } = state.elements;
    if (!widget) {
      return;
    }
    const clamped = clampWidgetHeight(value);
    widget.style.setProperty('--gcw-height', `${clamped}px`);
    state.currentHeight = clamped;
  }

  function onReady(callback) {
    if (READY_STATES.has(document.readyState)) {
      callback();
    } else {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    }
  }

  function shouldDisable() {
    if (!document.body) {
      return false;
    }
    if (document.body.dataset.disableGroupChatWidget === 'true') {
      return true;
    }
    return false;
  }

  function injectDynamicStyles() {
    if (document.getElementById(DYNAMIC_STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = DYNAMIC_STYLE_ID;
    style.textContent = DYNAMIC_STYLE_BLOCK;
    document.head?.appendChild(style);
  }

  function bootstrap() {
    if (!document.body || shouldDisable()) {
      return;
    }

    injectDynamicStyles();
    state.mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 1180px)')
      : null;
    state.isCollapsed = !!state.mediaQuery?.matches;

    createWidget();
    attachEvents();
    loadMessages();
    connectWebSocket();
    startRefreshLoop();
  }

  function attachEvents() {
    const { toggle, fullBtn, dockBtn, rail, resizeHandle } = state.elements;
    if (toggle) {
      toggle.addEventListener('click', () => {
        state.userOverrideCollapse = true;
        setCollapsed(!state.isCollapsed);
      });
    }
    if (fullBtn) {
      fullBtn.addEventListener('click', () => {
        window.location.href = '/group_chat.html';
      });
    }
    if (dockBtn) {
      dockBtn.addEventListener('click', () => {
        setDocked(true);
      });
    }
    if (rail) {
    if (resizeHandle) {
      setupResizeHandle(resizeHandle);
    }

      const activate = (event) => {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        event.preventDefault();
        setDocked(false);
      };
      rail.addEventListener('click', activate);
      rail.addEventListener('keydown', activate);
    }

    if (state.mediaQuery) {
      state.mediaQueryHandler = (event) => {
        if (!state.userOverrideCollapse) {
          setCollapsed(event.matches);
        }
      };
      if (typeof state.mediaQuery.addEventListener === 'function') {
        state.mediaQuery.addEventListener('change', state.mediaQueryHandler);
      } else if (typeof state.mediaQuery.addListener === 'function') {
        state.mediaQuery.addListener(state.mediaQueryHandler);
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetUnread();
        loadMessages(true);
      }
    });

    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('storage', (event) => {
      if (event.key === CHAT_ACCESS_STORAGE_KEY) {
        syncWidgetBlurState();
      }
    });
  }

  function createWidget() {
    const existing = document.getElementById('groupChatWidget');
    if (existing) {
      return;
    }

    const widget = document.createElement('aside');
    widget.id = 'groupChatWidget';
    widget.className = 'group-chat-widget';
    widget.setAttribute('role', 'complementary');
    widget.setAttribute('aria-label', 'Live group chat preview');
    widget.setAttribute('data-status', 'syncing');
    widget.setAttribute('data-collapsed', state.isCollapsed ? 'true' : 'false');
    widget.setAttribute('data-docked', state.isDocked ? 'true' : 'false');

    widget.innerHTML = `
      <div class="group-chat-widget__header">
        <div class="group-chat-widget__title">
          <span class="group-chat-widget__title-main">Group Chat</span>
          <span class="group-chat-widget__status" id="groupChatWidgetStatus">
            <span class="group-chat-widget__status-dot"></span>
            Syncing...
          </span>
        </div>
        <div class="group-chat-widget__controls">
          <button
            type="button"
            class="group-chat-widget__dock-btn"
            id="groupChatWidgetDockBtn"
            aria-pressed="false"
            title="Hide chat panel"
          >
            Hide
          </button>
          <span class="group-chat-widget__badge" id="groupChatWidgetBadge" aria-live="polite">0</span>
          <button
            type="button"
            class="group-chat-widget__toggle"
            id="groupChatWidgetToggle"
            aria-label="Collapse group chat preview"
            aria-expanded="${state.isCollapsed ? 'false' : 'true'}"
          >
            ${state.isCollapsed ? '+' : '−'}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="group-chat-widget__resize-handle"
        id="groupChatWidgetResizeHandle"
        aria-label="Resize chat preview"
      ></button>
      <div class="group-chat-widget__body" id="groupChatWidgetBody">
        <div class="group-chat-widget__messages-wrapper">
        <div class="group-chat-widget__messages" id="groupChatWidgetMessages">
          <div class="group-chat-widget__empty">Loading group chat...</div>
          </div>
          <div class="group-chat-widget__blur-overlay hidden" id="groupChatWidgetBlurOverlay" aria-live="polite">
            <div class="group-chat-widget__blur-content">
              <div class="group-chat-widget__blur-title">Luna holders only</div>
              <div class="group-chat-widget__blur-message" id="groupChatWidgetBlurMessage">${DEFAULT_WIDGET_BLUR_MESSAGE}</div>
            </div>
          </div>
        </div>
        <div class="group-chat-widget__footer">
          <button type="button" class="group-chat-widget__full-btn" id="groupChatWidgetFullBtn">
            Open full chat ↗
          </button>
        </div>
      </div>
      <div
        class="group-chat-widget__handle"
        id="groupChatWidgetHandle"
        role="button"
        tabindex="-1"
        aria-label="Show group chat panel"
      >
        CHAT
      </div>
      <button
        type="button"
        class="group-chat-widget__rail"
        id="groupChatWidgetRail"
        aria-label="Show group chat panel"
        tabindex="-1"
      >
        <span class="group-chat-widget__rail-icon">💬</span>
        <span class="group-chat-widget__rail-text">CHAT</span>
        <span class="group-chat-widget__rail-badge" id="groupChatWidgetRailBadge">0</span>
      </button>
    `;

    document.body.appendChild(widget);

    state.elements = {
      widget,
      messages: widget.querySelector('#groupChatWidgetMessages'),
      status: widget.querySelector('#groupChatWidgetStatus'),
      badge: widget.querySelector('#groupChatWidgetBadge'),
      toggle: widget.querySelector('#groupChatWidgetToggle'),
      fullBtn: widget.querySelector('#groupChatWidgetFullBtn'),
      dockBtn: widget.querySelector('#groupChatWidgetDockBtn'),
      rail: widget.querySelector('#groupChatWidgetRail'),
      railBadge: widget.querySelector('#groupChatWidgetRailBadge'),
      blurOverlay: widget.querySelector('#groupChatWidgetBlurOverlay'),
      blurOverlayMessage: widget.querySelector('#groupChatWidgetBlurMessage'),
      resizeHandle: widget.querySelector('#groupChatWidgetResizeHandle')
    };
    applyDockState();

    const storedHeight = readStoredWidgetHeight();
    if (storedHeight) {
      applyWidgetHeight(storedHeight);
    } else {
      const rect = widget.getBoundingClientRect();
      applyWidgetHeight(rect.height);
    }

    syncWidgetBlurState(DEFAULT_WIDGET_BLUR_MESSAGE);
    startAccessWatcher();
  }

  function setCollapsed(nextState) {
    state.isCollapsed = !!nextState;
    const { widget, toggle } = state.elements;
    if (!widget || !toggle) {
      return;
    }
    widget.setAttribute('data-collapsed', state.isCollapsed ? 'true' : 'false');
    toggle.setAttribute('aria-expanded', state.isCollapsed ? 'false' : 'true');
    toggle.textContent = state.isCollapsed ? '+' : '−';
    if (!state.isCollapsed) {
      resetUnread();
      scrollToBottom();
    }
  }

  function setDocked(nextState) {
    const normalized = !!nextState;
    if (state.isDocked === normalized) {
      return;
    }
    state.isDocked = normalized;
    applyDockState();
    writeDockedPreference(state.isDocked);
    if (!normalized) {
      resetUnread();
      scrollToBottom();
    }
  }

  function applyDockState() {
    const { widget, dockBtn, rail } = state.elements;
    if (!widget) {
      return;
    }
    const dockedAttr = state.isDocked ? 'true' : 'false';
    widget.setAttribute('data-docked', dockedAttr);
    if (dockBtn) {
      dockBtn.setAttribute('aria-pressed', dockedAttr);
      dockBtn.textContent = state.isDocked ? 'Hidden' : 'Hide';
      dockBtn.title = state.isDocked ? 'Show chat panel' : 'Hide chat panel';
    }
    if (rail) {
      rail.setAttribute('tabindex', state.isDocked ? '0' : '-1');
      rail.setAttribute('aria-hidden', state.isDocked ? 'false' : 'true');
    }
  }

  function setupResizeHandle(handle) {
    const startResize = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startY = event.clientY;
      const startHeight = state.currentHeight || state.elements.widget?.getBoundingClientRect().height || MIN_WIDGET_HEIGHT;

      const onMove = (moveEvent) => {
        const delta = startY - moveEvent.clientY;
        applyWidgetHeight(startHeight + delta);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        writeStoredWidgetHeight(state.currentHeight || MIN_WIDGET_HEIGHT);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };

    handle.addEventListener('pointerdown', startResize);
  }

  function readChatAccessPayload() {
    try {
      const raw = window.localStorage.getItem(CHAT_ACCESS_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        window.localStorage.removeItem(CHAT_ACCESS_STORAGE_KEY);
        return null;
      }
      if (typeof parsed.expires === 'number' && parsed.expires <= Date.now()) {
        window.localStorage.removeItem(CHAT_ACCESS_STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch (error) {
      window.localStorage.removeItem(CHAT_ACCESS_STORAGE_KEY);
      return null;
    }
  }

  function hasChatAccessFlag() {
    const payload = readChatAccessPayload();
    return !!(payload && payload.unlocked === true);
  }

  function persistWidgetAccessState(unlocked, message) {
    try {
      const payload = {
        unlocked: !!unlocked,
        message: message || DEFAULT_WIDGET_BLUR_MESSAGE,
        expires: Date.now() + (unlocked ? CHAT_ACCESS_UNLOCK_TTL_MS : CHAT_ACCESS_LOCK_TTL_MS)
      };
      window.localStorage.setItem(CHAT_ACCESS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // ignore
    }
  }

  function setWidgetBlurState(shouldBlur, message) {
    const { messages, blurOverlay, blurOverlayMessage } = state.elements;
    if (!messages || !blurOverlay) {
      return;
    }
    messages.classList.toggle('blurred', !!shouldBlur);
    blurOverlay.classList.toggle('hidden', !shouldBlur);
    if (shouldBlur && blurOverlayMessage) {
      blurOverlayMessage.textContent = message || DEFAULT_WIDGET_BLUR_MESSAGE;
    }
  }

  function syncWidgetBlurState(customMessage) {
    const payload = readChatAccessPayload();
    const unlocked = !!(payload && payload.unlocked === true);
    const message = customMessage || payload?.message || DEFAULT_WIDGET_BLUR_MESSAGE;
    setWidgetBlurState(!unlocked, message);
  }

  function getGlobalWalletPublicKey() {
    if (typeof window.walletPublicKey === 'string' && window.walletPublicKey.length > 20) {
      return window.walletPublicKey;
    }
    try {
      const stored = window.localStorage.getItem('phantomWalletAddress');
      if (stored && stored.length > 20) {
        return stored;
      }
    } catch (error) {
      // ignore
    }
    return null;
  }

  function formatNumberCompact(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) {
      return '0';
    }
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  async function getWidgetMinRequirement() {
    if (state.requirementCache.value && state.requirementCache.expires > Date.now()) {
      return state.requirementCache.value;
    }
    const url = new URL(`${API_BASE}/luna/dynamic-requirement`);
    url.searchParams.set('context', 'group-chat');
    const response = await (window.lunaUtils?.retryFetch || fetch)(url.toString());
    const data = await response.json();
    let amount = DEFAULT_CHAT_MIN_BALANCE;
    if (data?.requirement?.amount) {
      amount = Number(data.requirement.amount);
    } else if (data?.amount) {
      amount = Number(data.amount);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      amount = DEFAULT_CHAT_MIN_BALANCE;
    }
    state.requirementCache = {
      value: amount,
      expires: Date.now() + REQUIREMENT_CACHE_TTL_MS
    };
    return amount;
  }

  async function fetchWalletBalance(wallet) {
    const response = await (window.lunaUtils?.retryFetch || fetch)(`${API_BASE}/luna/rps/balance?wallet=${wallet}`);
    const data = await response.json();
    if (!data?.ok) {
      throw new Error(data?.error || 'Balance check failed');
    }
    return Number(data.balance || 0);
  }

  async function refreshWidgetAccessFromWallet() {
    const wallet = getGlobalWalletPublicKey();
    if (!wallet) {
      const msg = DEFAULT_WIDGET_BLUR_MESSAGE;
      persistWidgetAccessState(false, msg);
      syncWidgetBlurState(msg);
      return;
    }
    try {
      const [minRequirement, balance] = await Promise.all([
        getWidgetMinRequirement(),
        fetchWalletBalance(wallet)
      ]);
      if (balance >= minRequirement) {
        persistWidgetAccessState(true, `Access granted for ${wallet.substring(0, 6)}...`);
      } else {
        const msg = `Hold at least ${formatNumberCompact(minRequirement)} Luna to view the conversation.`;
        persistWidgetAccessState(false, msg);
      }
    } catch (error) {
      const msg = 'Unable to verify Luna balance. Please try again.';
      persistWidgetAccessState(false, msg);
    }
    syncWidgetBlurState();
  }

  function startAccessWatcher() {
    refreshWidgetAccessFromWallet();
    if (state.accessCheckInterval) {
      clearInterval(state.accessCheckInterval);
    }
    state.accessCheckInterval = window.setInterval(() => {
      refreshWidgetAccessFromWallet();
    }, ACCESS_CHECK_INTERVAL_MS);
  }

  function startRefreshLoop() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
    }
    state.refreshTimer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      const now = Date.now();
      const last = state.lastRealtimeUpdate || 0;
      if (now - last >= REALTIME_FALLBACK_THRESHOLD_MS) {
        loadMessages(true, true);
      }
    }, RESYNC_INTERVAL_MS);
  }

  async function loadMessages(isSilent = false, force = false) {
    if (!state.elements.widget || (state.isLoading && !force)) {
      return;
    }
    state.isLoading = true;
    if (!isSilent) {
      setStatus('Syncing...', 'syncing');
    }
    try {
      const url = new URL(`${API_BASE}/luna/chat/messages`);
      url.searchParams.set('roomId', GROUP_CHAT_ROOM_ID);
      url.searchParams.set('limit', String(FETCH_LIMIT));
      url.searchParams.set('ts', Date.now().toString());
      const response = await (window.lunaUtils?.retryFetch || fetch)(url.toString());
      const data = await response.json();
      if (data?.ok && Array.isArray(data.messages)) {
        mergeMessages(data.messages);
        if (!isSilent) {
          setStatus('Live now', 'online');
        }
        markRealtimeUpdate();
      } else if (!isSilent) {
        setStatus('Offline', 'offline');
      }
    } catch (error) {
      console.warn('[GroupChatWidget] Failed to load messages', error);
      if (!isSilent) {
        setStatus('Offline', 'offline');
      }
    } finally {
      state.isLoading = false;
      renderMessages();
    }
  }

  function mergeMessages(list = []) {
    if (!list.length) {
      return;
    }
    const map = new Map();
    state.messages.forEach((msg) => {
      if (msg && msg.id) {
        map.set(msg.id, msg);
      }
    });
    list.forEach((msg) => {
      const normalized = normalizeMessage(msg);
      if (normalized && normalized.id) {
        map.set(normalized.id, normalized);
      }
    });
    const merged = Array.from(map.values())
      .filter(Boolean)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    if (merged.length > MAX_MESSAGES) {
      merged.splice(0, merged.length - MAX_MESSAGES);
    }
    state.messages = merged;
  }

  function renderMessages() {
    const container = state.elements.messages;
    if (!container) {
      return;
    }
    if (!state.messages.length) {
      container.innerHTML = `
        <div class="group-chat-widget__empty">
          ${state.isLoading ? 'Loading group chat...' : 'No chat activity yet'}
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    const recent = state.messages.slice(-MAX_MESSAGES).reverse();
    recent.forEach((message) => {
      fragment.appendChild(renderMessageNode(message));
    });
    container.innerHTML = '';
    container.appendChild(fragment);
    if (!state.isCollapsed && !document.hidden) {
      scrollToBottom();
    }
  }

  function renderMessageNode(message) {
    const wrapper = document.createElement('article');
    wrapper.className = 'group-chat-widget__message';
    wrapper.setAttribute('data-message-id', message.id || '');

    const header = document.createElement('div');
    header.className = 'group-chat-widget__message-header';
    const usernameEl = document.createElement('span');
    usernameEl.className = 'group-chat-widget__user';
    usernameEl.textContent = formatUsername(message);

    const timeEl = document.createElement('span');
    timeEl.className = 'group-chat-widget__time';
    timeEl.textContent = formatTime(message.timestamp);

    header.appendChild(usernameEl);
    header.appendChild(timeEl);

    const text = document.createElement('div');
    text.className = 'group-chat-widget__text';
    text.innerHTML = formatMessageContent(message.message);

    wrapper.appendChild(header);
    wrapper.appendChild(text);

    if (Array.isArray(message.attachments) && message.attachments.length) {
      const attachment = document.createElement('div');
      attachment.className = 'group-chat-widget__attachment';
      attachment.textContent = `📎 ${message.attachments.length} attachment${message.attachments.length > 1 ? 's' : ''}`;
      wrapper.appendChild(attachment);
    }

    return wrapper;
  }

  function formatMessageContent(text) {
    if (!text) {
      return '<span style="opacity:0.7;">(Attachment)</span>';
    }
    const safe = escapeHtml(text);
    const truncated = safe.length > 320 ? `${safe.slice(0, 317)}…` : safe;
    return truncated.replace(/\n/g, '<br>');
  }

  function formatUsername(message) {
    if (message?.username) {
      return message.username;
    }
    const wallet = message?.wallet || '';
    return wallet.length > 12 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet || 'Friend';
  }

  function formatTime(timestamp) {
    if (!timestamp) {
      return '--:--';
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return '--:--';
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function scrollToBottom() {
    const container = state.elements.messages;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function connectWebSocket() {
    cleanupWebSocket();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    state.ws = ws;

    ws.addEventListener('open', () => {
      setStatus('Live now', 'online');
    });

    ws.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'chat_message' && payload.roomId === GROUP_CHAT_ROOM_ID && payload.message) {
          addIncomingMessage(payload.message);
        }
      } catch (error) {
        console.warn('[GroupChatWidget] WS message parse error', error);
      }
    });

    ws.addEventListener('error', () => {
      setStatus('Offline', 'offline');
    });

    ws.addEventListener('close', () => {
      setStatus('Reconnecting…', 'syncing');
      scheduleReconnect();
    });
  }

  function addIncomingMessage(message) {
    const normalized = normalizeMessage(message);
    if (!normalized || !normalized.id) {
      return;
    }
    state.messages = state.messages.filter((msg) => msg && msg.id !== normalized.id);
    state.messages.push(normalized);
    if (state.messages.length > MAX_MESSAGES) {
      state.messages.shift();
    }
    renderMessages();
    markRealtimeUpdate();
    if (state.isCollapsed || state.isDocked || document.hidden) {
      incrementUnread();
    } else {
      resetUnread();
    }
  }

  function incrementUnread() {
    state.unread += 1;
    updateUnreadBadge();
  }

  function resetUnread() {
    if (state.unread === 0) {
      return;
    }
    state.unread = 0;
    updateUnreadBadge();
  }

  function updateUnreadBadge() {
    const { widget, badge, railBadge, toggle } = state.elements;
    if (!widget || !badge) {
      return;
    }
    if (state.unread > 0) {
      badge.textContent = state.unread > 9 ? '9+' : String(state.unread);
      widget.setAttribute('data-unread', 'true');
      if (toggle) {
        toggle.dataset.unread = 'true';
        toggle.setAttribute('aria-label', `Collapsed group chat preview (unread: ${Math.min(state.unread, 99)})`);
      }
    } else {
      badge.textContent = '0';
      widget.setAttribute('data-unread', 'false');
      if (toggle) {
        delete toggle.dataset.unread;
        toggle.setAttribute('aria-label', 'Collapse group chat preview');
    }
    if (railBadge) {
        railBadge.textContent = '0';
      }
    }
  }

  function markRealtimeUpdate() {
    state.lastRealtimeUpdate = Date.now();
  }

  function normalizeMessage(message) {
    if (!message) {
      return null;
    }
    const normalized = { ...message };
    if (!normalized.id) {
      normalized.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    const ts = Number(normalized.timestamp);
    normalized.timestamp = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
    if (typeof normalized.message !== 'string') {
      normalized.message = normalized.message == null ? '' : String(normalized.message);
    }
    if (!normalized.username && normalized.wallet) {
      normalized.username = formatUsername(normalized);
    }
    return normalized;
  }

  function setStatus(text, status) {
    const { widget, status: statusEl } = state.elements;
    if (statusEl) {
      statusEl.innerHTML = `<span class="group-chat-widget__status-dot"></span>${escapeHtml(text)}`;
    }
    if (widget) {
      widget.setAttribute('data-status', status || 'offline');
    }
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) {
      return;
    }
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null;
      connectWebSocket();
    }, RECONNECT_DELAY_MS);
  }

  function cleanupWebSocket() {
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }

  function cleanup() {
    cleanupWebSocket();
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.accessCheckInterval) {
      clearInterval(state.accessCheckInterval);
      state.accessCheckInterval = null;
    }
    if (state.mediaQuery && state.mediaQueryHandler) {
      if (typeof state.mediaQuery.removeEventListener === 'function') {
        state.mediaQuery.removeEventListener('change', state.mediaQueryHandler);
      } else if (typeof state.mediaQuery.removeListener === 'function') {
        state.mediaQuery.removeListener(state.mediaQueryHandler);
      }
      state.mediaQueryHandler = null;
    }
  }

  onReady(bootstrap);
})();

