(function initPhantomHelper(global) {
  const STORAGE_KEY = 'phantomConnectionState';
  const FORCE_DISCONNECT_KEY = 'phantomForceDisconnect';
  let listenersBound = false;
  let autoConnectInFlight = false;

  function isPhantomReady() {
    return typeof global.solana !== 'undefined' && !!global.solana?.isPhantom;
  }

  function readState() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[PhantomHelper] Failed to read state:', err);
      return null;
    }
  }

  function writeState(state) {
    try {
      if (!state || !state.publicKey) {
        global.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('[PhantomHelper] Failed to persist state:', err);
    }
  }

  function hasForceDisconnect() {
    try {
      return !!global.localStorage.getItem(FORCE_DISCONNECT_KEY);
    } catch (err) {
      console.warn('[PhantomHelper] Failed to read force disconnect flag:', err);
      return false;
    }
  }

  function markForceDisconnect(reason) {
    try {
      global.localStorage.setItem(FORCE_DISCONNECT_KEY, JSON.stringify({
        reason: reason || 'manual',
        timestamp: Date.now()
      }));
    } catch (err) {
      console.warn('[PhantomHelper] Failed to set force disconnect flag:', err);
    }
  }

  function clearForceDisconnect() {
    try {
      global.localStorage.removeItem(FORCE_DISCONNECT_KEY);
    } catch (err) {
      console.warn('[PhantomHelper] Failed to clear force disconnect flag:', err);
    }
  }

  function mergeState(partial = {}) {
    const previous = readState() || {};
    const next = { ...previous };

    if (partial.publicKey) {
      next.publicKey = typeof partial.publicKey === 'string'
        ? partial.publicKey
        : partial.publicKey.toString();
    }

    if (typeof partial.hasSignature !== 'undefined') {
      next.hasSignature = !!partial.hasSignature;
    } else if (typeof previous.hasSignature !== 'undefined' && typeof next.hasSignature === 'undefined') {
      next.hasSignature = previous.hasSignature;
    }

    if (!next.publicKey) {
      return previous;
    }

    next.updatedAt = Date.now();
    writeState(next);
    clearForceDisconnect();
    return next;
  }

  function clearState() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('[PhantomHelper] Failed to clear state:', err);
    }
  }

  function hasStoredSession() {
    const state = readState();
    return !!(state && state.publicKey);
  }

  async function waitForPhantom(maxAttempts = 60, delayMs = 100) {
    if (isPhantomReady()) {
      return;
    }

    await new Promise((resolve) => {
      let attempts = 0;
      const timer = setInterval(() => {
        if (isPhantomReady() || attempts >= maxAttempts) {
          clearInterval(timer);
          resolve();
        }
        attempts += 1;
      }, delayMs);
    });
  }

  function bindListeners() {
    if (listenersBound || !isPhantomReady()) {
      return;
    }

    const provider = global.solana;
    if (!provider || typeof provider.on !== 'function') {
      return;
    }

    listenersBound = true;

    provider.on('connect', () => {
      if (provider.publicKey) {
        mergeState({ publicKey: provider.publicKey.toString() });
      }
    });

    provider.on('disconnect', () => {
      clearState();
    });

    provider.on('accountChanged', (publicKey) => {
      if (publicKey) {
        const normalized = typeof publicKey === 'string' ? publicKey : publicKey.toString();
        mergeState({ publicKey: normalized });
      } else {
        clearState();
      }
    });
  }

  async function autoConnect(options = {}) {
    const { onConnected, onError } = options;

    if (hasForceDisconnect()) {
      return false;
    }

    await waitForPhantom();
    if (!isPhantomReady()) {
      return false;
    }

    bindListeners();

    if (autoConnectInFlight) {
      return false;
    }

    const provider = global.solana;
    const saved = readState();
    const alreadyConnected = provider.isConnected && provider.publicKey;

    if (!saved && !alreadyConnected) {
      return false;
    }

    autoConnectInFlight = true;

    try {
      if (alreadyConnected) {
        const key = provider.publicKey.toString();
        const state = mergeState({ publicKey: key });
        onConnected?.(key, state || saved || { publicKey: key });
        return true;
      }

      if (!saved) {
        return false;
      }

      if (typeof provider.connect !== 'function') {
        return false;
      }

      const response = await provider.connect({ onlyIfTrusted: true });
      if (response?.publicKey) {
        const key = response.publicKey.toString();
        const state = mergeState({ publicKey: key });
        onConnected?.(key, state || saved || { publicKey: key });
        return true;
      }
    } catch (err) {
      if (onError) {
        onError(err);
      } else {
        console.warn('[PhantomHelper] Auto-connect failed:', err);
      }
    } finally {
      autoConnectInFlight = false;
    }

    return false;
  }

  waitForPhantom().then(bindListeners);
  global.addEventListener('focus', () => {
    if (isPhantomReady()) {
      bindListeners();
    }
  });

  global.phantomHelper = {
    autoConnect,
    saveState: mergeState,
    clearState,
    getState: readState,
    hasStoredSession,
    isPhantomReady,
    waitForPhantom,
    markForceDisconnect,
    clearForceDisconnect,
    hasForceDisconnect
  };
})(window);

