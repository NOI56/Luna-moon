'use strict';

(function initRuntimeUtilities(global) {
  if (global.__LUNA_RUNTIME_INITIALIZED__) {
    return;
  }
  global.__LUNA_RUNTIME_INITIALIZED__ = true;

  const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
  const DEBUG_STORAGE_KEY = 'luna:debugLogs';
  const FALLBACK_STYLE_ID = 'luna-toast-fallback-style';
  const FALLBACK_CONTAINER_ID = 'luna-toast-fallback-container';
  const SUPPRESSED_CONSOLE_LEVELS = ['log', 'info', 'debug', 'trace'];
  const toastQueue = [];
  const originalConsole = {};
  const signalIdSymbol = Symbol('lunaSignalId');
  let signalIdCounter = 0;
  let consoleSuppressed = false;

  const hostname = global.location?.hostname || '';
  const search = global.location?.search || '';

  function safeLocalStorage(fn) {
    try {
      return fn();
    } catch (err) {
      return null;
    }
  }

  // Handle ?debugLogs=true|false overrides
  try {
    const params = new URLSearchParams(search);
    if (params.get('debugLogs') === 'true') {
      safeLocalStorage(() => global.localStorage.setItem(DEBUG_STORAGE_KEY, 'true'));
    } else if (params.get('debugLogs') === 'false') {
      safeLocalStorage(() => global.localStorage.removeItem(DEBUG_STORAGE_KEY));
    }
  } catch (err) {
    // Ignore query parsing failures
  }

  const forceDebug = safeLocalStorage(() => global.localStorage.getItem(DEBUG_STORAGE_KEY) === 'true') || false;
  const isLocalHost = DEV_HOSTS.has(hostname) || hostname.endsWith('.local') || hostname === '';
  const isProduction = !isLocalHost && global.location?.protocol !== 'file:';

  const env = {
    hostname,
    isLocal: isLocalHost,
    isProduction,
    forceDebug,
    consoleSuppressed: false
  };
  global.__LUNA_ENV__ = env;

  function suppressConsole() {
    if (consoleSuppressed || !env.isProduction || env.forceDebug) {
      return;
    }
    SUPPRESSED_CONSOLE_LEVELS.forEach((level) => {
      if (typeof global.console?.[level] === 'function') {
        originalConsole[level] = global.console[level];
        global.console[level] = () => {};
      }
    });
    consoleSuppressed = true;
    env.consoleSuppressed = true;
  }

  function restoreConsole() {
    if (!consoleSuppressed) {
      return;
    }
    Object.entries(originalConsole).forEach(([level, fn]) => {
      global.console[level] = fn;
    });
    consoleSuppressed = false;
    env.consoleSuppressed = false;
  }

  if (env.isProduction && !env.forceDebug) {
    suppressConsole();
  }

  global.consoleManager = {
    suppress: suppressConsole,
    restore: restoreConsole,
    isSuppressed: () => consoleSuppressed,
    enableDebug: () => {
      safeLocalStorage(() => global.localStorage.setItem(DEBUG_STORAGE_KEY, 'true'));
      env.forceDebug = true;
      restoreConsole();
    }
  };

  function detectToastType(message) {
    const normalized = (message || '').toLowerCase();
    if (!normalized) return 'info';
    if (normalized.includes('success') || normalized.includes('complete') || normalized.includes('copied')) {
      return 'success';
    }
    if (normalized.includes('warning') || normalized.includes('⚠') || normalized.includes('caution')) {
      return 'warning';
    }
    if (
      normalized.includes('error') ||
      normalized.includes('fail') ||
      normalized.includes('unable') ||
      normalized.includes('missing')
    ) {
      return 'error';
    }
    return 'info';
  }

  function ensureFallbackStyles() {
    if (document.getElementById(FALLBACK_STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = FALLBACK_STYLE_ID;
    style.textContent = `
      #${FALLBACK_CONTAINER_ID} {
        position: fixed;
        top: 16px;
        right: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 9999;
        max-width: min(360px, 90vw);
        pointer-events: none;
      }
      #${FALLBACK_CONTAINER_ID} .luna-fallback-toast {
        padding: 14px 16px;
        border-radius: 12px;
        background: rgba(5, 8, 30, 0.92);
        border: 1px solid rgba(0, 255, 255, 0.25);
        box-shadow: 0 12px 35px rgba(0, 0, 0, 0.45);
        color: rgba(255, 255, 255, 0.95);
        font-family: 'Space Grotesk', 'Courier New', monospace;
        font-size: 0.95rem;
        letter-spacing: 0.02em;
        line-height: 1.4;
        pointer-events: auto;
      }
      #${FALLBACK_CONTAINER_ID} .luna-fallback-toast.success {
        border-color: rgba(0, 255, 157, 0.4);
      }
      #${FALLBACK_CONTAINER_ID} .luna-fallback-toast.warning {
        border-color: rgba(255, 224, 102, 0.4);
      }
      #${FALLBACK_CONTAINER_ID} .luna-fallback-toast.error {
        border-color: rgba(255, 77, 77, 0.45);
      }
      @media (max-width: 600px) {
        #${FALLBACK_CONTAINER_ID} {
          left: 10px;
          right: 10px;
        }
      }
    `;
    document.head?.appendChild(style);
  }

  function renderFallbackToast({ message, type, duration }) {
    if (!document.body) {
      // Body not ready yet, queue for later
      toastQueue.push({ message, type, duration });
      return;
    }
    ensureFallbackStyles();
    let container = document.getElementById(FALLBACK_CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = FALLBACK_CONTAINER_ID;
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `luna-fallback-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, duration || 5000);
  }

  function flushToastQueue() {
    if (typeof global.showToast !== 'function') {
      return;
    }
    while (toastQueue.length) {
      const entry = toastQueue.shift();
      global.showToast(entry.message, entry.type, entry.duration);
    }
    const fallback = document.getElementById(FALLBACK_CONTAINER_ID);
    if (fallback) {
      fallback.remove();
    }
  }

  function enqueueToast(message, type = 'info', duration = 5000) {
    const normalizedMessage = message == null ? '' : String(message);
    if (typeof global.showToast === 'function') {
      global.showToast(normalizedMessage, type, duration);
      return;
    }
    const domReady = document.readyState === 'interactive' || document.readyState === 'complete';
    if (!domReady) {
      toastQueue.push({ message: normalizedMessage, type, duration });
      return;
    }
    renderFallbackToast({ message: normalizedMessage, type, duration });
  }

  global.__processQueuedToasts = flushToastQueue;
  global.addEventListener('luna:toast-ready', flushToastQueue);
  document.addEventListener('DOMContentLoaded', flushToastQueue);

  const nativeAlert = typeof global.alert === 'function' ? global.alert.bind(global) : () => undefined;
  global.nativeAlert = nativeAlert;
  global.alert = function runtimeAlert(message, overrideType, duration) {
    const type = overrideType || detectToastType(message);
    enqueueToast(message, type, duration);
  };

  function isResourceError(event) {
    if (!event || !event.target) return false;
    const tagName = event.target.tagName;
    return tagName === 'IMG' || tagName === 'SCRIPT' || tagName === 'LINK' || tagName === 'IFRAME';
  }

  function notifyGlobalError(prefix, detail) {
    if (!detail) {
      enqueueToast(`${prefix}: Unknown error`, 'error', 6000);
      return;
    }
    const base = detail.message || detail.reason || detail.error || detail;
    let text = typeof base === 'string' ? base : JSON.stringify(base, null, 2);
    
    // Clean up error messages for better UX
    if (text.includes('isTrusted')) {
      text = 'An unexpected error occurred. Please refresh the page.';
    } else if (text.length > 150) {
      text = text.substring(0, 150) + '...';
    }
    
    enqueueToast(`${prefix}: ${text}`, 'error', 6000);
  }

  global.addEventListener(
    'error',
    (event) => {
      // Ignore resource loading errors (404 images, scripts, etc.)
      if (isResourceError(event)) {
        return;
      }
      
      // Only show meaningful errors
      if (event.error && event.error.message) {
        notifyGlobalError('Error', event.error);
      } else if (event.message) {
        notifyGlobalError('Error', { message: event.message });
      }
      // Ignore events without meaningful error info
    },
    { capture: true }
  );

  global.addEventListener('unhandledrejection', (event) => {
    // Ignore aborted fetch requests
    if (event.reason && (event.reason.name === 'AbortError' || event.reason.message?.includes('aborted'))) {
      return;
    }
    notifyGlobalError('Request failed', event);
  });

  function getOptionsKey(options) {
    if (options == null) {
      return 'false|false|false|nosignal';
    }

    if (typeof options === 'boolean') {
      return `${options}|false|false|nosignal`;
    }

    const capture = !!options.capture;
    const once = !!options.once;
    const passive = !!options.passive;
    let signalKey = 'nosignal';
    if (options.signal) {
      if (!options.signal[signalIdSymbol]) {
        Object.defineProperty(options.signal, signalIdSymbol, {
          value: ++signalIdCounter,
          enumerable: false
        });
      }
      signalKey = options.signal[signalIdSymbol];
    }
    return `${capture}|${once}|${passive}|${signalKey}`;
  }

  if (!global.__LUNA_EVENT_PATCHED__) {
    const listenerRegistry = new WeakMap();
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
      if (typeof originalAdd !== 'function' || !listener) {
        return originalAdd.call(this, type, listener, options);
      }

      const key = `${type}|${getOptionsKey(options)}`;
      let targetStore = listenerRegistry.get(this);
      if (!targetStore) {
        targetStore = new Map();
        listenerRegistry.set(this, targetStore);
      }

      let listenersForKey = targetStore.get(key);
      if (!listenersForKey) {
        listenersForKey = new Set();
        targetStore.set(key, listenersForKey);
      }

      if (listenersForKey.has(listener)) {
        return undefined;
      }

      listenersForKey.add(listener);
      return originalAdd.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function patchedRemoveEventListener(type, listener, options) {
      if (listener) {
        const targetStore = listenerRegistry.get(this);
        if (targetStore) {
          const key = `${type}|${getOptionsKey(options)}`;
          const listenersForKey = targetStore.get(key);
          if (listenersForKey && listenersForKey.has(listener)) {
            listenersForKey.delete(listener);
            if (listenersForKey.size === 0) {
              targetStore.delete(key);
            }
          }
        }
      }
      return originalRemove.call(this, type, listener, options);
    };

    global.__LUNA_EVENT_PATCHED__ = true;
  }
})(window);

(function autoLoadGroupChatWidgetAssets() {
  if (typeof window === 'undefined') {
    return;
  }

  const READY_STATES = new Set(['interactive', 'complete']);
  const DISABLED_PATHS = new Set([
    '/group_chat.html',
    '/group_chat',
    '/luna_guide.html',
    '/luna_guide'
  ]);
  const STYLE_ID = 'group-chat-widget-style';
  const SCRIPT_ID = 'group-chat-widget-script';
  const ASSET_VERSION = '20251203b';

  function pathIsExcluded() {
    const pathname = (window.location.pathname || '').toLowerCase();
    return DISABLED_PATHS.has(pathname);
  }

  function ensureAssets() {
    if (document.body?.dataset.disableGroupChatWidget === 'true') {
      return;
    }
    if (!document.getElementById(STYLE_ID)) {
      const link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.href = `/css/group-chat-widget.css?v=${ASSET_VERSION}`;
      document.head?.appendChild(link);
    }
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = `/js/group-chat-widget.js?v=${ASSET_VERSION}`;
      script.defer = true;
      document.head?.appendChild(script);
    }
  }

  function schedule() {
    if (READY_STATES.has(document.readyState)) {
      ensureAssets();
    } else {
      document.addEventListener('DOMContentLoaded', ensureAssets, { once: true });
    }
  }

  if (!pathIsExcluded()) {
    schedule();
  }
})();

