// Notification System UI Component
// Handles displaying and managing notifications

class NotificationManager {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.wallet = null;
    this.ws = null;
    this.container = null;
    this.badge = null;
    this.isOpen = false;
  }

  init(wallet) {
    this.wallet = wallet;
    if (!this.container) {
      this.createUI();
    }
    this.connectWebSocket();
    if (wallet) {
      this.loadNotifications();
      this.startPolling();
    }
  }

  createUI() {
    // Check if already exists
    if (document.getElementById('notification-btn')) {
      return;
    }
    
    // Try to find navigation in modeNavigation first (for rps_betting.html)
    const modeNav = document.getElementById('modeNavigation');
    if (modeNav) {
      const notificationBtn = document.createElement('button');
      notificationBtn.id = 'notification-btn';
      notificationBtn.className = 'notification-btn';
      notificationBtn.innerHTML = '🔔 <span id="notification-badge" class="notification-badge">0</span>';
      notificationBtn.onclick = () => this.toggleNotifications();
      notificationBtn.style.marginLeft = '10px';
      notificationBtn.style.position = 'relative';
      modeNav.appendChild(notificationBtn);
      this.badge = document.getElementById('notification-badge');
      this.createNotificationPanel();
      return;
    }
    
    // Fallback: Create notification button/badge
    const nav = document.querySelector('nav .nav-container') || document.querySelector('nav');
    if (!nav) {
      // Create floating button as last resort
      const notificationBtn = document.createElement('button');
      notificationBtn.id = 'notification-btn';
      notificationBtn.className = 'notification-btn';
      notificationBtn.innerHTML = '🔔 <span id="notification-badge" class="notification-badge">0</span>';
      notificationBtn.onclick = () => this.toggleNotifications();
      notificationBtn.style.position = 'fixed';
      notificationBtn.style.top = '20px';
      notificationBtn.style.right = '20px';
      notificationBtn.style.zIndex = '10000';
      document.body.appendChild(notificationBtn);
      this.badge = document.getElementById('notification-badge');
      this.createNotificationPanel();
      return;
    }

    const notificationBtn = document.createElement('button');
    notificationBtn.id = 'notification-btn';
    notificationBtn.className = 'notification-btn';
    notificationBtn.innerHTML = '🔔 <span id="notification-badge" class="notification-badge">0</span>';
    notificationBtn.onclick = () => this.toggleNotifications();

    // Try to add to nav links
    const navLinks = nav.querySelector('.nav-links');
    if (navLinks) {
      const li = document.createElement('li');
      li.style.listStyle = 'none';
      li.appendChild(notificationBtn);
      navLinks.appendChild(li);
    } else {
      // Create floating button
      notificationBtn.style.position = 'fixed';
      notificationBtn.style.top = '20px';
      notificationBtn.style.right = '20px';
      notificationBtn.style.zIndex = '10000';
      document.body.appendChild(notificationBtn);
    }

    this.badge = document.getElementById('notification-badge');
    this.createNotificationPanel();
  }

  createNotificationPanel() {
    // Check if panel already exists
    if (document.getElementById('notification-panel')) {
      this.container = document.getElementById('notification-list');
      return;
    }
    
    // Create notification panel
    const panel = document.createElement('div');
    panel.id = 'notification-panel';
    panel.className = 'notification-panel';
    panel.innerHTML = `
      <div class="notification-header">
        <h3>Notifications</h3>
        <button class="notification-close" onclick="notificationManager.closeNotifications()">×</button>
      </div>
      <div class="notification-list" id="notification-list">
        <div class="notification-empty">${this.wallet ? 'No notifications yet' : 'Connect wallet to receive notifications'}</div>
      </div>
      <div class="notification-footer">
        <button onclick="notificationManager.markAllRead()">Mark all as read</button>
      </div>
    `;
    document.body.appendChild(panel);
    this.container = document.getElementById('notification-list');
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'notification') {
          // Check if notification is for this wallet or broadcast
          if (!msg.wallet || msg.wallet === this.wallet) {
            this.addNotification(msg.notification);
          }
        }
      } catch (e) {
        console.error('WebSocket notification error:', e);
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

  async loadNotifications() {
    if (!this.wallet) return;

    try {
      const response = await fetch(`${window.location.origin}/luna/notifications?wallet=${this.wallet}`);
      const data = await response.json();
      
      if (data.ok) {
        this.notifications = data.notifications || [];
        this.unreadCount = data.unreadCount || 0;
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  addNotification(notification) {
    this.notifications.unshift(notification);
    if (!notification.read) {
      this.unreadCount++;
    }
    
    // Keep only last 50 notifications
    if (this.notifications.length > 50) {
      this.notifications.pop();
    }
    
    this.updateUI();
    this.showNotificationToast(notification);
  }

  showNotificationToast(notification) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `
      <div class="notification-toast-icon">${this.getNotificationIcon(notification.type)}</div>
      <div class="notification-toast-content">
        <div class="notification-toast-title">${notification.title}</div>
        <div class="notification-toast-message">${notification.message}</div>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 5 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  getNotificationIcon(type) {
    const icons = {
      'room_new': '🏠',
      'match_found': '🎮',
      'reward_time': '💰',
      'reward_received': '🎁',
      'referral_reward': '👥',
      'default': '🔔'
    };
    return icons[type] || icons.default;
  }

  updateUI() {
    // Update badge
    if (this.badge) {
      this.badge.textContent = this.unreadCount > 0 ? this.unreadCount : '';
      this.badge.style.display = this.unreadCount > 0 ? 'inline-block' : 'none';
    }

    // Update list
    if (this.container) {
      if (this.notifications.length === 0) {
        this.container.innerHTML = '<div class="notification-empty">No notifications yet</div>';
        return;
      }

      this.container.innerHTML = this.notifications.map(notif => `
        <div class="notification-item ${notif.read ? 'read' : 'unread'}" onclick="notificationManager.markRead('${notif.id}')">
          <div class="notification-icon">${this.getNotificationIcon(notif.type)}</div>
          <div class="notification-content">
            <div class="notification-title">${notif.title}</div>
            <div class="notification-message">${notif.message}</div>
            <div class="notification-time">${this.formatTime(notif.timestamp)}</div>
          </div>
          ${!notif.read ? '<div class="notification-dot"></div>' : ''}
        </div>
      `).join('');
    }
  }

  formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  async markRead(notificationId) {
    if (!this.wallet) return;

    try {
      const response = await fetch(`${window.location.origin}/luna/notifications/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: this.wallet,
          notificationId: notificationId
        })
      });

      const data = await response.json();
      if (data.ok) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification && !notification.read) {
          notification.read = true;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
          this.updateUI();
        }
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  async markAllRead() {
    if (!this.wallet || this.unreadCount === 0) return;

    // Mark all unread notifications
    const unreadIds = this.notifications.filter(n => !n.read).map(n => n.id);
    
    for (const id of unreadIds) {
      await this.markRead(id);
    }
  }

  toggleNotifications() {
    this.isOpen = !this.isOpen;
    const panel = document.getElementById('notification-panel');
    if (panel) {
      panel.classList.toggle('open', this.isOpen);
    }
  }

  closeNotifications() {
    this.isOpen = false;
    const panel = document.getElementById('notification-panel');
    if (panel) {
      panel.classList.remove('open');
    }
  }

  startPolling() {
    // Poll for new notifications every 30 seconds
    setInterval(() => {
      if (this.wallet) {
        this.loadNotifications();
      }
    }, 30000);
  }
}

// Global instance
const notificationManager = new NotificationManager();

