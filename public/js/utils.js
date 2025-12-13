// Utility functions for Luna RPS
// Error Recovery, Form Validation, Performance, Security, UX

(function initLunaUtils(global) {
  if (global.__LUNA_UTILS_INITIALIZED__) {
    return;
  }
  global.__LUNA_UTILS_INITIALIZED__ = true;

  // ============================================
  // Error Recovery & Retry
  // ============================================
  const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
    retryableErrors: ['NetworkError', 'TimeoutError', 'AbortError']
  };

  async function retryFetch(url, options = {}, config = {}) {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError;
    let delay = retryConfig.initialDelay;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok || !retryConfig.retryableStatuses.includes(response.status)) {
          return response;
        }

        if (attempt < retryConfig.maxRetries) {
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelay);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        
        if (attempt < retryConfig.maxRetries) {
          const shouldRetry = retryConfig.retryableErrors.some(
            errType => error.name === errType || error.message?.includes(errType)
          );
          
          if (shouldRetry) {
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelay);
            continue;
          }
        }
        
        throw error;
      }
    }

    throw lastError || new Error('Retry failed');
  }

  // ============================================
  // Form Validation
  // ============================================
  const validators = {
    required: (value, message = 'This field is required') => {
      if (value == null || String(value).trim() === '') {
        return message;
      }
      return null;
    },
    
    min: (value, min, message) => {
      const num = Number(value);
      if (isNaN(num) || num < min) {
        return message || `Value must be at least ${min}`;
      }
      return null;
    },
    
    max: (value, max, message) => {
      const num = Number(value);
      if (isNaN(num) || num > max) {
        return message || `Value must be at most ${max}`;
      }
      return null;
    },
    
    minLength: (value, min, message) => {
      if (String(value).length < min) {
        return message || `Must be at least ${min} characters`;
      }
      return null;
    },
    
    maxLength: (value, max, message) => {
      if (String(value).length > max) {
        return message || `Must be at most ${max} characters`;
      }
      return null;
    },
    
    pattern: (value, pattern, message) => {
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      if (!regex.test(String(value))) {
        return message || 'Invalid format';
      }
      return null;
    },
    
    walletAddress: (value, message) => {
      const walletRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!walletRegex.test(String(value).trim())) {
        return message || 'Invalid wallet address';
      }
      return null;
    },
    
    number: (value, message) => {
      const num = Number(value);
      if (isNaN(num) || !isFinite(num)) {
        return message || 'Must be a valid number';
      }
      return null;
    },
    
    positive: (value, message) => {
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        return message || 'Must be a positive number';
      }
      return null;
    }
  };

  function validateField(value, rules) {
    if (!Array.isArray(rules)) {
      rules = [rules];
    }
    
    for (const rule of rules) {
      if (typeof rule === 'function') {
        const error = rule(value);
        if (error) return error;
      } else if (typeof rule === 'object' && rule !== null) {
        for (const [validatorName, params] of Object.entries(rule)) {
          if (validators[validatorName]) {
            const error = validators[validatorName](value, ...(Array.isArray(params) ? params : [params]));
            if (error) return error;
          }
        }
      }
    }
    
    return null;
  }

  function setupRealTimeValidation(input, rules, options = {}) {
    const {
      showError = true,
      errorContainer = null,
      onValid = null,
      onInvalid = null
    } = options;

    let timeoutId;
    
    function validate() {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const value = input.value;
        const error = validateField(value, rules);
        
        if (error) {
          input.setAttribute('aria-invalid', 'true');
          if (showError && errorContainer) {
            errorContainer.textContent = error;
            errorContainer.style.display = 'block';
          }
          if (onInvalid) onInvalid(error);
        } else {
          input.setAttribute('aria-invalid', 'false');
          if (showError && errorContainer) {
            errorContainer.style.display = 'none';
          }
          if (onValid) onValid();
        }
      }, 300);
    }

    input.addEventListener('input', validate);
    input.addEventListener('blur', validate);
    
    return {
      validate: () => {
        clearTimeout(timeoutId);
        const error = validateField(input.value, rules);
        if (error) {
          input.setAttribute('aria-invalid', 'true');
          if (showError && errorContainer) {
            errorContainer.textContent = error;
            errorContainer.style.display = 'block';
          }
        }
        return error;
      },
      destroy: () => {
        clearTimeout(timeoutId);
        input.removeEventListener('input', validate);
        input.removeEventListener('blur', validate);
      }
    };
  }

  // ============================================
  // Performance: Debounce & Throttle
  // ============================================
  function debounce(func, wait, immediate = false) {
    let timeoutId;
    return function executedFunction(...args) {
      const later = () => {
        timeoutId = null;
        if (!immediate) func.apply(this, args);
      };
      const callNow = immediate && !timeoutId;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(later, wait);
      if (callNow) func.apply(this, args);
    };
  }

  function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // ============================================
  // Offline Detection
  // ============================================
  let isOnline = navigator.onLine;
  const onlineListeners = new Set();
  const offlineListeners = new Set();

  function notifyOnlineListeners() {
    onlineListeners.forEach(listener => {
      try {
        listener();
      } catch (err) {
        console.error('[Utils] Online listener error:', err);
      }
    });
  }

  function notifyOfflineListeners() {
    offlineListeners.forEach(listener => {
      try {
        listener();
      } catch (err) {
        console.error('[Utils] Offline listener error:', err);
      }
    });
  }

  global.addEventListener('online', () => {
    isOnline = true;
    if (global.showToast) {
      global.showToast('Connection restored', 'success', 3000);
    }
    notifyOnlineListeners();
  });

  global.addEventListener('offline', () => {
    isOnline = false;
    if (global.showToast) {
      global.showToast('No internet connection', 'warning', 5000);
    }
    notifyOfflineListeners();
  });

  // ============================================
  // Security: Input Sanitization
  // ============================================
  function sanitizeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeWalletAddress(address) {
    if (typeof address !== 'string') return '';
    return address.replace(/[^A-Za-z0-9]/g, '').substring(0, 44);
  }

  function sanitizeNumber(value) {
    const num = Number(value);
    return isNaN(num) ? 0 : (isFinite(num) ? num : 0);
  }

  // ============================================
  // UX: Keyboard Shortcuts
  // ============================================
  const shortcuts = new Map();
  
  function registerShortcut(key, handler, options = {}) {
    const {
      ctrl = false,
      shift = false,
      alt = false,
      meta = false,
      preventDefault = true
    } = options;

    const keyId = `${ctrl ? 'ctrl+' : ''}${shift ? 'shift+' : ''}${alt ? 'alt+' : ''}${meta ? 'meta+' : ''}${key.toLowerCase()}`;
    
    shortcuts.set(keyId, { handler, preventDefault });
  }

  global.addEventListener('keydown', (e) => {
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    if (e.metaKey) parts.push('meta');
    parts.push(e.key.toLowerCase());
    
    const keyId = parts.join('+');
    const shortcut = shortcuts.get(keyId);
    
    if (shortcut) {
      if (shortcut.preventDefault) {
        e.preventDefault();
      }
      shortcut.handler(e);
    }
  });

  // ============================================
  // UX: Tooltips
  // ============================================
  function createTooltip(element, text, position = 'top') {
    if (!element || !text) return null;
    
    const tooltip = document.createElement('div');
    tooltip.className = 'luna-tooltip';
    tooltip.textContent = text;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.style.cssText = `
      position: absolute;
      background: rgba(5, 8, 30, 0.95);
      color: rgba(255, 255, 255, 0.95);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.85rem;
      pointer-events: none;
      z-index: 10000;
      white-space: nowrap;
      border: 1px solid rgba(0, 255, 255, 0.3);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      opacity: 0;
      transition: opacity 0.2s;
    `;
    
    document.body.appendChild(tooltip);
    
    function show() {
      const rect = element.getBoundingClientRect();
      let top, left;
      
      switch (position) {
        case 'top':
          top = rect.top - tooltip.offsetHeight - 8;
          left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
          break;
        case 'bottom':
          top = rect.bottom + 8;
          left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
          break;
        case 'left':
          top = rect.top + (rect.height / 2) - (tooltip.offsetHeight / 2);
          left = rect.left - tooltip.offsetWidth - 8;
          break;
        case 'right':
          top = rect.top + (rect.height / 2) - (tooltip.offsetHeight / 2);
          left = rect.right + 8;
          break;
        default:
          top = rect.top - tooltip.offsetHeight - 8;
          left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
      }
      
      tooltip.style.top = `${Math.max(8, top + window.scrollY)}px`;
      tooltip.style.left = `${Math.max(8, Math.min(left + window.scrollX, window.innerWidth - tooltip.offsetWidth - 8))}px`;
      tooltip.style.opacity = '1';
    }
    
    function hide() {
      tooltip.style.opacity = '0';
    }
    
    element.addEventListener('mouseenter', show);
    element.addEventListener('mouseleave', hide);
    element.addEventListener('focus', show);
    element.addEventListener('blur', hide);
    
    return {
      destroy: () => {
        element.removeEventListener('mouseenter', show);
        element.removeEventListener('mouseleave', hide);
        element.removeEventListener('focus', show);
        element.removeEventListener('blur', hide);
        tooltip.remove();
      }
    };
  }

  // ============================================
  // Export to global
  // ============================================
  global.lunaUtils = {
    // Error Recovery
    retryFetch,
    
    // Form Validation
    validateField,
    setupRealTimeValidation,
    validators,
    
    // Performance
    debounce,
    throttle,
    
    // Offline Detection
    isOnline: () => isOnline,
    onOnline: (listener) => {
      onlineListeners.add(listener);
      return () => onlineListeners.delete(listener);
    },
    onOffline: (listener) => {
      offlineListeners.add(listener);
      return () => offlineListeners.delete(listener);
    },
    
    // Security
    sanitizeHtml,
    sanitizeWalletAddress,
    sanitizeNumber,
    
    // UX
    registerShortcut,
    createTooltip
  };
})(window);





















