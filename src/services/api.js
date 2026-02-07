/**
 * Backend API client + WebSocket manager for LiquiFi.
 *
 * Provides:
 * - WebSocket connection with auto-reconnect for live rate streaming
 * - REST client for forecast, monte-carlo, cashflow-history, data-quality
 * - Connection state tracking with fallback flag
 * - Data quality metrics from WebSocket stream
 */

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/rates`;
const API_BASE = '/api';

let _ws = null;
let _connected = false;
let _reconnectTimer = null;
let _onRates = null;
let _onConnectionChange = null;
let _onDataQuality = null;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
let _reconnectAttempt = 0;

/**
 * Connect WebSocket to backend for live rate streaming.
 * @param {Object} opts
 * @param {Function} opts.onRates - Called with { rates, rateHistory, source } on each message
 * @param {Function} opts.onConnectionChange - Called with (connected: boolean)
 * @param {Function} [opts.onDataQuality] - Called with { realFieldsCount, totalFields, fallbackFields, stalenessSeconds }
 */
export function connectWebSocket({ onRates, onConnectionChange, onDataQuality }) {
  _onRates = onRates;
  _onConnectionChange = onConnectionChange;
  _onDataQuality = onDataQuality || null;
  _connect();
}

function _connect() {
  if (_ws) {
    try { _ws.close(); } catch (err) { console.debug('[WS] Close error during reconnect:', err.message); }
  }

  try {
    _ws = new WebSocket(WS_URL);
  } catch (err) {
    console.warn('[WS] WebSocket construction failed:', err.message);
    _setConnected(false);
    _scheduleReconnect();
    return;
  }

  _ws.onopen = () => {
    _reconnectAttempt = 0;
    _setConnected(true);
    console.info('[WS] Connected to backend');
  };

  _ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'rates' && msg.data) {
        if (_onRates) _onRates(msg.data);
        if (_onDataQuality && msg.data.dataQuality) _onDataQuality(msg.data.dataQuality);
      }
    } catch (err) {
      console.warn('[WS] Failed to parse message:', err.message);
    }
  };

  _ws.onclose = (evt) => {
    console.info('[WS] Connection closed:', evt.code, evt.reason);
    _setConnected(false);
    _scheduleReconnect();
  };

  _ws.onerror = (err) => {
    console.warn('[WS] WebSocket error:', err);
    _setConnected(false);
    try { _ws.close(); } catch (closeErr) { console.debug('[WS] Close after error failed:', closeErr.message); }
  };
}

function _setConnected(val) {
  if (_connected !== val) {
    _connected = val;
    if (_onConnectionChange) _onConnectionChange(val);
  }
}

function _scheduleReconnect() {
  if (_reconnectTimer) return;
  const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, _reconnectAttempt), MAX_RECONNECT_DELAY_MS);
  _reconnectAttempt += 1;
  console.info(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${_reconnectAttempt})`);
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    _connect();
  }, delay);
}

/**
 * Disconnect WebSocket and stop reconnection attempts.
 */
export function disconnectWebSocket() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_ws) {
    try { _ws.close(); } catch (err) { console.debug('[WS] Close error during disconnect:', err.message); }
    _ws = null;
  }
  _setConnected(false);
}

/**
 * Whether the backend WebSocket is currently connected.
 * @returns {boolean}
 */
export function isBackendConnected() {
  return _connected;
}

/**
 * Fetch 24-hour LSTM forecast from backend.
 * @returns {Promise<Object|null>} { clockData, source } or null on failure
 */
export async function fetchForecast() {
  try {
    const res = await fetch(`${API_BASE}/forecast`);
    if (!res.ok) {
      console.warn(`[API] Forecast fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    return data.clockData || null;
  } catch (err) {
    console.warn('[API] Forecast fetch error:', err.message);
    return null;
  }
}

/**
 * Fetch Monte Carlo simulation from backend.
 * @returns {Promise<Object|null>} { paths, metrics, hourly_stats } or null on failure
 */
export async function fetchMonteCarlo() {
  try {
    const res = await fetch(`${API_BASE}/monte-carlo`);
    if (!res.ok) {
      console.warn(`[API] Monte Carlo fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[API] Monte Carlo fetch error:', err.message);
    return null;
  }
}

/**
 * Fetch 90-day cash-flow history from backend.
 * @returns {Promise<Array|null>} history array or null on failure
 */
export async function fetchCashFlowHistory() {
  try {
    const res = await fetch(`${API_BASE}/cashflow-history`);
    if (!res.ok) {
      console.warn(`[API] Cash flow history fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    return data.history || null;
  } catch (err) {
    console.warn('[API] Cash flow history fetch error:', err.message);
    return null;
  }
}

/**
 * Fetch data quality metrics from backend.
 * @returns {Promise<Object|null>} { current, trend, recommendations } or null
 */
export async function fetchDataQuality() {
  try {
    const res = await fetch(`${API_BASE}/data-quality`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[API] Data quality fetch error:', err.message);
    return null;
  }
}

/**
 * Trigger model retrain.
 * @param {string} [apiKey] - Optional API key (for development)
 * @returns {Promise<Object|null>} { status, message } or null on failure
 */
export async function triggerRetrain(apiKey) {
  try {
    const headers = {};
    if (apiKey) headers['X-Api-Key'] = apiKey;
    const res = await fetch(`${API_BASE}/model/retrain`, { method: 'POST', headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn(`[API] Retrain failed: ${res.status}`, data.message);
      return { status: 'error', message: data.message || `HTTP ${res.status}` };
    }
    return await res.json();
  } catch (err) {
    console.warn('[API] Retrain error:', err.message);
    return null;
  }
}

/**
 * Health check.
 * @returns {Promise<Object|null>} health object or null
 */
export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) {
      console.warn(`[API] Health check failed: ${res.status} ${res.statusText}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[API] Health check error:', err.message);
    return null;
  }
}


// ---------------------------------------------------------------------------
// Regulatory API
// ---------------------------------------------------------------------------

/**
 * Fetch full regulatory dashboard (CRR + SLR + LCR + NSFR + config).
 */
export async function fetchRegulatoryDashboard() {
  try {
    const res = await fetch(`${API_BASE}/regulatory/dashboard`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[API] Regulatory dashboard error:', err.message);
    return null;
  }
}

/**
 * Fetch 90-day CRR history.
 */
export async function fetchCRRHistory() {
  try {
    const res = await fetch(`${API_BASE}/regulatory/crr/history`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.history || null;
  } catch (err) {
    console.warn('[API] CRR history error:', err.message);
    return null;
  }
}

/**
 * Fetch 90-day SLR history.
 */
export async function fetchSLRHistory() {
  try {
    const res = await fetch(`${API_BASE}/regulatory/slr/history`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.history || null;
  } catch (err) {
    console.warn('[API] SLR history error:', err.message);
    return null;
  }
}

/**
 * Fetch current ALM gap analysis (10 buckets).
 */
export async function fetchALMCurrent() {
  try {
    const res = await fetch(`${API_BASE}/regulatory/alm/current`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.buckets || null;
  } catch (err) {
    console.warn('[API] ALM current error:', err.message);
    return null;
  }
}

/**
 * Fetch LCR and NSFR metrics.
 */
export async function fetchALMLiquidity() {
  try {
    const res = await fetch(`${API_BASE}/regulatory/alm/liquidity`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[API] ALM liquidity error:', err.message);
    return null;
  }
}

/**
 * Fetch all branches with latest positions.
 */
export async function fetchBranches() {
  try {
    const res = await fetch(`${API_BASE}/regulatory/branches`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.branches || null;
  } catch (err) {
    console.warn('[API] Branches error:', err.message);
    return null;
  }
}

/**
 * Fetch single branch 30-day history.
 */
export async function fetchBranchDetail(code) {
  try {
    const res = await fetch(`${API_BASE}/regulatory/branches/${code}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.history || null;
  } catch (err) {
    console.warn('[API] Branch detail error:', err.message);
    return null;
  }
}

/**
 * Fetch regional aggregation summary.
 */
export async function fetchBranchesSummary() {
  try {
    const res = await fetch(`${API_BASE}/regulatory/branches/summary`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[API] Branches summary error:', err.message);
    return null;
  }
}

/**
 * Generate a regulatory report.
 */
export async function generateReport(reportType) {
  try {
    const res = await fetch(`${API_BASE}/regulatory/reports/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_type: reportType }),
    });
    if (!res.ok) {
      console.warn(`[API] Report generation failed: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[API] Report generation error:', err.message);
    return null;
  }
}

/**
 * Fetch list of generated reports.
 */
export async function fetchReports() {
  try {
    const res = await fetch(`${API_BASE}/regulatory/reports`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.reports || null;
  } catch (err) {
    console.warn('[API] Reports list error:', err.message);
    return null;
  }
}
