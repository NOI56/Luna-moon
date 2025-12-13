// Chat System UI Component
// Handles real-time chat functionality

class ChatManager {
  constructor() {
    this.wallet = null;
    this.username = null;
    this.currentRoomId = null;
    this.messages = [];
    this.ws = null;
    this.container = null;
    this.input = null;
    this.isOpen = false;
    this.features = {
      enableStickers: false,
      autoOpen: false
    };
    this.stickers = {
      rock: { label: 'Rock', src: '/images/hands/rock.png' },
      paper: { label: 'Paper', src: '/images/hands/paper.png' },
      scissors: { label: 'Scissors', src: '/images/hands/scissors.png' }
    };
  }

  init(wallet, username = null) {
    this.wallet = wallet;
    this.username = username || (wallet ? wallet.substring(0, 8) + '...' : 'Guest');
    this.connectWebSocket();
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'chat_message' && msg.roomId === this.currentRoomId) {
          this.addMessage(msg.message);
        }
      } catch (e) {
        console.error('WebSocket chat error:', e);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  createUI(roomId, roomType = 'lobby', options = {}) {
    const normalizedOptions = {
      enableStickers: options.enableStickers ?? this.features.enableStickers,
      autoOpen: options.autoOpen ?? false
    };
    this.features = normalizedOptions;
    
    // Check if already exists for this room
    const existing = document.getElementById('chat-container');
    if (existing) {
      // Update room ID if different
      if (this.currentRoomId !== roomId) {
        this.currentRoomId = roomId;
        this.loadMessages();
      }
      
      // Update feature-driven UI pieces without rebuilding
      this.syncStickerBar();
      if (this.features.autoOpen) {
        this.setChatOpen(true);
      }
      return; // Already created
    }
    
    this.currentRoomId = roomId;
    if (this.features.autoOpen) {
      this.isOpen = true;
    }

    // Create chat container
    const container = document.createElement('div');
    container.id = 'chat-container';
    container.className = 'chat-container';
    container.innerHTML = `
      <div class="chat-header" onclick="chatManager.toggleChat()">
        <span>💬 Chat</span>
        <span class="chat-toggle">${this.isOpen ? '−' : '+'}</span>
      </div>
      <div class="chat-body" id="chat-body" style="display: ${this.isOpen ? 'flex' : 'none'}">
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-sticker-bar" id="chat-sticker-bar" style="${this.features.enableStickers ? '' : 'display: none;'}">
          ${Object.entries(this.stickers).map(([key, data]) => `
            <button class="chat-sticker-btn" data-sticker="${key}" title="${data.label}">
              <img src="${data.src}" alt="${data.label}">
              <span>${data.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="chat-input-container">
          <input type="text" id="chat-input" placeholder="Type a message..." maxlength="500">
          <button onclick="chatManager.sendMessage()" id="chat-send-btn">Send</button>
        </div>
      </div>
    `;

    // Add to page (always add to body for fixed positioning)
    document.body.appendChild(container);

    this.container = document.getElementById('chat-messages');
    this.input = document.getElementById('chat-input');
    this.stickerBar = document.getElementById('chat-sticker-bar');

    // Enter key to send
    if (this.input) {
      this.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendMessage();
        }
      });
      
      // Disable input if no wallet
      if (!this.wallet) {
        this.input.placeholder = 'Connect wallet to send messages';
        this.input.disabled = true;
      }
    }
    
    // Sticker buttons
    if (this.stickerBar) {
      this.stickerBar.querySelectorAll('.chat-sticker-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sticker = btn.dataset.sticker;
          this.sendSticker(sticker);
        });
      });
    }

    // Load messages
    this.loadMessages();
    
    // Auto-scroll to bottom
    this.scrollToBottom();
  }

  toggleChat() {
    this.setChatOpen(!this.isOpen);
  }

  async loadMessages() {
    if (!this.currentRoomId) return;

    try {
      const response = await fetch(`${window.location.origin}/luna/chat/messages?roomId=${this.currentRoomId}&limit=50`);
      const data = await response.json();
      
      if (data.ok) {
        this.messages = data.messages || [];
        this.updateMessages();
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }

  addMessage(message) {
    // Check if message already exists
    if (this.messages.find(m => m.id === message.id)) {
      return;
    }
    
    this.messages.push(message);
    this.notifySticker(message);
    
    // Keep only last 100 messages
    if (this.messages.length > 100) {
      this.messages.shift();
    }
    
    this.updateMessages();
    this.scrollToBottom();
  }

  updateMessages() {
    if (!this.container) return;

    if (this.messages.length === 0) {
      this.container.innerHTML = '<div class="chat-empty">No messages yet. Connect wallet to start chatting!</div>';
      return;
    }

    this.container.innerHTML = this.messages.map(msg => `
      <div class="chat-message ${msg.wallet === this.wallet ? 'own' : ''}">
        <div class="chat-message-header">
          <span class="chat-username">${msg.username || (msg.wallet ? msg.wallet.substring(0, 8) + '...' : 'Guest')}</span>
          <span class="chat-time">${this.formatTime(msg.timestamp)}</span>
        </div>
        <div class="chat-message-content">${this.renderMessageContent(msg)}</div>
      </div>
    `).join('');
  }

  async sendMessage() {
    if (!this.input || !this.currentRoomId) return;
    
    if (!this.wallet) {
      alert('Please connect your wallet to send messages');
      return;
    }

    const message = this.input.value.trim();
    if (message.length === 0) return;

    const result = await this.submitMessage(message);
    if (result?.ok && this.input) {
      this.input.value = '';
    }
  }

  async sendSticker(stickerKey) {
    if (!this.currentRoomId) return;
    if (!this.wallet) {
      alert('Please connect your wallet to send stickers');
      return;
    }
    
    const normalizedKey = typeof stickerKey === 'string' ? stickerKey.toLowerCase() : '';
    if (!this.stickers[normalizedKey]) {
      return;
    }
    
    const stickerMessage = `[sticker:${normalizedKey}]`;
    const result = await this.submitMessage(stickerMessage);
    if (result?.ok) {
      this.playStickerSound();
    }
  }

  async submitMessage(message) {
    try {
      const response = await fetch(`${window.location.origin}/luna/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.currentRoomId,
          wallet: this.wallet,
          message: message,
          username: this.username
        })
      });

      const data = await response.json();
      if (data.ok) {
        // Message will be added via WebSocket
        return { ok: true };
      } else {
        alert('Failed to send message: ' + (data.error || data.message));
        return { ok: false, error: data.error || data.message };
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
      return { ok: false, error: error?.message || 'network' };
    }
  }

  renderMessageContent(msg) {
    const sticker = this.parseSticker(msg?.message);
    if (sticker) {
      const src = this.getStickerSrc(sticker.key);
      const label = this.stickers[sticker.key]?.label || 'Sticker';
      const safeLabel = this.escapeHtml(label);
      const safeSrc = this.escapeAttribute(src);
      return `
        <div class="chat-message-sticker">
          <img src="${safeSrc}" alt="${safeLabel}">
          <div class="chat-sticker-label">${safeLabel}</div>
        </div>
      `;
    }

    return this.escapeHtml(msg?.message || '');
  }

  parseSticker(message) {
    if (!message || typeof message !== 'string') return null;
    const match = message.trim().match(/^\[sticker:(rock|paper|scissors)\]$/i);
    if (!match) return null;
    const key = match[1].toLowerCase();
    if (!this.stickers[key]) return null;
    return { key };
  }

  getStickerSrc(key) {
    return this.stickers[key]?.src || this.stickers.rock.src;
  }

  playStickerSound() {
    if (typeof window.playSound === 'function') {
      window.playSound(720, 0.12, 'square', 0.35);
      return;
    }
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'square';
      oscillator.frequency.value = 720;
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
      // Fallback: silent failure to avoid blocking UI
    }
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  escapeAttribute(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  scrollToBottom() {
    if (this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  syncStickerBar() {
    if (!this.stickerBar) return;
    this.stickerBar.style.display = this.features.enableStickers ? 'flex' : 'none';
  }

  setChatOpen(isOpen) {
    this.isOpen = isOpen;
    const body = document.getElementById('chat-body');
    const toggle = document.querySelector('.chat-toggle');

    if (body) {
      body.style.display = isOpen ? 'flex' : 'none';
    }
    if (toggle) {
      toggle.textContent = isOpen ? '−' : '+';
    }

    if (isOpen) {
      this.scrollToBottom();
    }
  }

  notifySticker(message) {
    const sticker = this.parseSticker(message?.message);
    if (!sticker) return;
    try {
      if (typeof window.onChatStickerReceived === 'function') {
        window.onChatStickerReceived({
          sticker: sticker.key,
          roomId: message?.roomId,
          wallet: message?.wallet,
          message
        });
      }
    } catch (err) {
      // Silent fail to avoid breaking chat flow
      console.warn('[chat] sticker callback error:', err);
    }
  }
}

// Global instance
const chatManager = new ChatManager();

