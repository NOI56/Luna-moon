'use strict';

(function initSimulationMode(global) {
  if (global.lunaSimulation) return;

  const qs = (() => {
    try {
      return new URLSearchParams(global.location.search || '');
    } catch (_) {
      return new URLSearchParams();
    }
  })();

  const storedPref = (() => {
    try {
      return global.localStorage?.getItem('luna:simulate');
    } catch (_) {
      return null;
    }
  })();

  const queryPref = (() => {
    const value = qs.get('simulate') || qs.get('sim') || qs.get('demo');
    if (value === null) return null;
    return value === '1' || value === 'true';
  })();

  if (queryPref !== null) {
    try {
      global.localStorage?.setItem('luna:simulate', String(queryPref));
    } catch (_) {
      // ignore
    }
  }

  let configFetched = false;
  let configSimulation = null;

  async function fetchConfigFlag() {
    if (configFetched) return configSimulation;
    configFetched = true;
    try {
      const resp = await global.fetch('/luna/frontend-config', { method: 'GET' });
      const data = await resp.json();
      if (data && typeof data === 'object') {
        global.__LUNA_FRONTEND_CONFIG__ = data;
      }
      if (data && data.simulationMode === true) {
        configSimulation = true;
      } else {
        configSimulation = false;
      }
    } catch (_) {
      configSimulation = null;
    }
    return configSimulation;
  }

  function computeEnabled() {
    const envFlag = global.__LUNA_SIM_MODE__ === true || global.__LUNA_SIM_MODE__ === 'true';
    const storedFlag = storedPref === 'true';
    const queryFlag = queryPref === true;
    return Boolean(envFlag || storedFlag || queryFlag || configSimulation === true);
  }

  const bannerId = 'luna-simulation-banner';
  function attachBanner() {
    if (!sim.enabled) return;
    if (document.getElementById(bannerId)) return;
    const banner = document.createElement('div');
    banner.id = bannerId;
    banner.textContent = 'Simulation mode: frontend demo only (ไม่แตะบล็อกเชน / backend)';
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.zIndex = '99999';
    banner.style.padding = '10px 16px';
    banner.style.background = 'linear-gradient(90deg, rgba(0,255,255,0.28), rgba(255,0,200,0.28))';
    banner.style.backdropFilter = 'blur(10px)';
    banner.style.color = '#fff';
    banner.style.textAlign = 'center';
    banner.style.fontFamily = "'Space Grotesk','Inter','Courier New',monospace";
    banner.style.fontSize = '14px';
    banner.style.letterSpacing = '0.04em';
    banner.style.boxShadow = '0 10px 35px rgba(0,0,0,0.35)';
    document.body?.appendChild(banner);
    document.body?.style?.setProperty('padding-top', '50px');
  }

  function jsonResponse(obj) {
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    return new Response(blob, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  function buildMockHandlers() {
    const now = Date.now();
    return [
      {
        match: (url) => url.pathname.includes('/luna/rps/balance'),
        reply: () => jsonResponse({ ok: true, balance: 1_250_000, cacheTs: now }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/sol/balance'),
        reply: () => jsonResponse({ ok: true, balance: 2.48, cacheTs: now }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/betting/price'),
        reply: () => jsonResponse({ ok: true, price: 0.0123, source: 'simulation', updatedAt: now }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/betting/rooms'),
        reply: () =>
          jsonResponse({
            ok: true,
            escrowWallet: 'DemoEscrowWallet11111111111111111111111111111',
            rooms: [
              { roomId: 'demo-room-1', creator: 'DemoCreator111', betAmount: 25_000, player2: null, timestamp: now - 30_000 },
              { roomId: 'demo-room-2', creator: 'DemoWhale999', betAmount: 120_000, player2: 'DemoChallenger', timestamp: now - 90_000 },
            ],
          }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/betting/fees'),
        reply: () =>
          jsonResponse({
            ok: true,
            totalFees: 4200,
            fees: [
              { roomId: 'demo-room-1', fee: 1200 },
              { roomId: 'demo-room-2', fee: 3000 },
            ],
          }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/betting') && ['create', 'join', 'cancel', 'submit', 'stake', 'rematch'].some((p) => url.pathname.includes(p)),
        reply: () => jsonResponse({ ok: true, message: 'Simulation: action accepted (no on-chain call)' }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/history'),
        reply: () =>
          jsonResponse({
            ok: true,
            history: [
              { result: 'win', betAmount: 20_000, opponent: 'DemoBot', timestamp: now - 60_000, roomId: 'demo-room-1' },
              { result: 'lose', betAmount: 15_000, opponent: 'DemoWhale', timestamp: now - 120_000, roomId: 'demo-room-2' },
            ],
          }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/stats'),
        reply: () =>
          jsonResponse({
            ok: true,
            stats: {
              totalGames: 128,
              wins: 72,
              losses: 40,
              draws: 16,
              totalWon: 123_456,
              winRate: 0.5625,
            },
            rewards: { pending: 12_345 },
            system: { ts: now, note: `Simulation data as of ${new Date(now).toLocaleString()}` },
          }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/leaderboard'),
        reply: () => {
          const leaderboard = Array.from({ length: 50 }).map((_, idx) => {
            const rank = idx + 1;
            const wins = Math.max(3, 52 - idx); // descending wins
            const losses = Math.max(1, 10 + Math.floor(idx / 2));
            const totalWon = Math.max(10_000 * (51 - rank), 500); // descending prize placeholder
            return {
              rank,
              wallet: `Demo${rank.toString().padStart(2, "0")}Walletxxxxxxxxxxxxxx`,
              wins,
              losses,
              totalWon,
            };
          });
          return jsonResponse({
            ok: true,
            leaderboard,
            totalPlayers: leaderboard.length,
            updatedAt: now,
          });
        },
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/rewards/pool'),
        reply: () => jsonResponse({ ok: true, totalPool: 345_678, updatedAt: now }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/competition/time'),
        reply: () =>
          jsonResponse({
            ok: true,
            now,
            start: now - 60 * 60 * 1000,
            end: now + 60 * 60 * 1000,
          }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/contract-address'),
        reply: () => jsonResponse({ ok: true, contractAddress: 'DemoContract11111111111111111111111111111' }),
      },
      {
        match: (url) => url.pathname.includes('/luna/dynamic-requirement'),
        reply: () => jsonResponse({ ok: true, requiredBalance: 100_000 }),
      },
      {
        match: (url) => url.pathname.includes('/luna/rps/play'),
        reply: async () => {
          const bodyText = await (async () => {
            try {
              return typeof init?.body === 'string' ? init.body : '';
            } catch (_) {
              return '';
            }
          })();
          return jsonResponse({
            ok: true,
            result: 'win',
            lunaChoice: 'scissors',
            userChoice: 'rock',
            reward: 2_500,
            roundId: `sim-${Math.floor(Math.random() * 1e6)}`,
            echo: bodyText || null,
            message: 'Simulation round complete',
          });
        },
      },
      {
        match: (url) => url.pathname.startsWith('/luna/deposit'),
        reply: () => jsonResponse({ ok: true, message: 'Simulation deposit endpoint', simulation: true }),
      },
    ];
  }

  const handlers = buildMockHandlers();
  const originalFetch = global.fetch.bind(global);
  let wrapped = false;
  let init = null;

  async function mockFetch(input, initArg) {
    init = initArg;
    try {
      const url = new URL(typeof input === 'string' ? input : input.url || '', global.location.origin);
      const handler = handlers.find((h) => h.match(url));
      if (handler) {
        return typeof handler.reply === 'function' ? handler.reply() : handler.reply;
      }
    } catch (_) {
      // fall through
    }
    return originalFetch(input, initArg);
  }

  const sim = {
    enabled: false,
    async refresh() {
      await fetchConfigFlag();
      this.enabled = computeEnabled();
      return this.enabled;
    },
    attachBanner,
    wrapFetch() {
      if (!this.enabled || wrapped) return;
      wrapped = true;
      global.fetch = mockFetch;
      attachBanner();
    },
  };

  global.lunaSimulation = sim;

  // Initialize
  sim.refresh().then(() => {
    sim.wrapFetch();
  });
})(window);

