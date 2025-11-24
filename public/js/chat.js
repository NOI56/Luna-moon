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

  createUI(roomId, roomType = 'lobby') {
    // Check if already exists for this room
    const existing = document.getElementById('chat-container');
    if (existing) {
      // Update room ID if different
      if (this.currentRoomId !== roomId) {
        this.currentRoomId = roomId;
        this.loadMessages();
      }
      return; // Already created
    }
    
    this.currentRoomId = roomId;

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

    // Load messages
    this.loadMessages();
    
    // Auto-scroll to bottom
    this.scrollToBottom();
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    const body = document.getElementById('chat-body');
    const toggle = document.querySelector('.chat-toggle');
    
    if (body) {
      body.style.display = this.isOpen ? 'flex' : 'none';
    }
    if (toggle) {
      toggle.textContent = this.isOpen ? '−' : '+';
    }
    
    if (this.isOpen) {
      this.scrollToBottom();
    }
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
        <div class="chat-message-content">${this.escapeHtml(msg.message)}</div>
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
        this.input.value = '';
        // Message will be added via WebSocket
      } else {
        alert('Failed to send message: ' + (data.error || data.message));
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
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

  scrollToBottom() {
    if (this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }
}

// Global instance
const chatManager = new ChatManager();

