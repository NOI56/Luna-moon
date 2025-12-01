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
  const RESYNC_INTERVAL_MS = 60000;
  const READY_STATES = new Set(['interactive', 'complete']);

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
    mediaQueryHandler: null
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

  function bootstrap() {
    if (!document.body || shouldDisable()) {
      return;
    }

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
    const { toggle, fullBtn, dockBtn, rail } = state.elements;
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
      <div class="group-chat-widget__body" id="groupChatWidgetBody">
        <div class="group-chat-widget__messages" id="groupChatWidgetMessages">
          <div class="group-chat-widget__empty">Loading group chat...</div>
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
      railBadge: widget.querySelector('#groupChatWidgetRailBadge')
    };
    applyDockState();
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

  function startRefreshLoop() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
    }
    state.refreshTimer = window.setInterval(() => {
      if (!document.hidden) {
        loadMessages(true);
      }
    }, RESYNC_INTERVAL_MS);
  }

  async function loadMessages(isSilent = false) {
    if (!state.elements.widget || state.isLoading) {
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
      const response = await (window.lunaUtils?.retryFetch || fetch)(url.toString());
      const data = await response.json();
      if (data?.ok && Array.isArray(data.messages)) {
        mergeMessages(data.messages);
        if (!isSilent) {
          setStatus('Live now', 'online');
        }
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
      if (msg && msg.id) {
        map.set(msg.id, msg);
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
    const recent = state.messages.slice(-MAX_MESSAGES);
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
    if (!message || !message.id) {
      return;
    }
    state.messages = state.messages.filter((msg) => msg && msg.id !== message.id);
    state.messages.push(message);
    if (state.messages.length > MAX_MESSAGES) {
      state.messages.shift();
    }
    renderMessages();
    if (state.isCollapsed || document.hidden) {
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
    const { widget, badge, railBadge } = state.elements;
    if (!widget || !badge) {
      return;
    }
    if (state.unread > 0) {
      badge.textContent = state.unread > 9 ? '9+' : String(state.unread);
      widget.setAttribute('data-unread', 'true');
    } else {
      badge.textContent = '0';
      widget.setAttribute('data-unread', 'false');
    }
    if (railBadge) {
      railBadge.textContent = state.unread > 9 ? '9+' : String(state.unread);
    }
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

