// Toast Notification System
// Replaces alert() calls with modern toast notifications

class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = new Set();
    this.waitingForDom = false;
    this.readySignaled = false;
    this.init();
  }

  init() {
    if (this.container) {
      this.signalReady();
      return;
    }

    if (!document.body) {
      if (!this.waitingForDom) {
        this.waitingForDom = true;
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            this.waitingForDom = false;
            this.init();
          },
          { once: true }
        );
      }
      return;
    }

    // Create toast container if it doesn't exist
    if (!document.getElementById('toast-container')) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById('toast-container');
    }

    this.signalReady();
  }

  show(message, type = 'info', duration = 4000) {
    if (!this.container) {
      this.init();
    }
    if (!this.container) {
      console.warn('[Toast] Container missing, cannot show toast');
      return null;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = this.getIcon(type);
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-message">${this.escapeHtml(message)}</div>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    this.container.appendChild(toast);
    this.toasts.add(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    // Auto remove
    const timeout = setTimeout(() => {
      this.remove(toast);
    }, duration);

    // Pause on hover
    toast.addEventListener('mouseenter', () => {
      clearTimeout(timeout);
    });

    toast.addEventListener('mouseleave', () => {
      const newTimeout = setTimeout(() => {
        this.remove(toast);
      }, duration);
      toast.dataset.timeout = newTimeout;
    });

    return toast;
  }

  remove(toast) {
    if (!toast || !this.toasts.has(toast)) return;
    
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
      this.toasts.delete(toast);
    }, 300);
  }

  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Convenience methods
  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration || 6000);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }

  signalReady() {
    if (this.readySignaled) {
      if (typeof window.__processQueuedToasts === 'function') {
        window.__processQueuedToasts();
      }
      return;
    }
    this.readySignaled = true;
    if (typeof window.__processQueuedToasts === 'function') {
      window.__processQueuedToasts();
    }
    window.dispatchEvent(new CustomEvent('luna:toast-ready'));
  }
}

// Global instance
window.toastManager = new ToastManager();

// Global helper function to replace alert()
window.showToast = function(message, type = 'info', duration) {
  return window.toastManager.show(message, type, duration);
};

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.toastManager.init();
  });
} else {
  window.toastManager.init();
}
