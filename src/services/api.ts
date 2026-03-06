/**
 * Backend API client + WebSocket manager for LiquiFi.
 *
 * Provides:
 * - WebSocket connection with auto-reconnect for live rate streaming
 * - REST client for forecast, monte-carlo, cashflow-history, data-quality
 * - Connection state tracking with fallback flag
 * - Data quality metrics from WebSocket stream
 */

import type {
  WebSocketCallbacks,
  HealthResponse,
  ForecastPoint,
  MonteCarloResponse,
  CashFlowPoint,
  DataQualityResponse,
  DataQuality,
  AlmBucket,
  LcrNsfr,
  Branch,
  RegionalSummary,
  CrrHistoryPoint,
} from '../types';

// Electron uses direct URLs since there's no Vite proxy
declare global {
  interface Window {
    __ELECTRON__?: boolean;
  }
}

const API_BASE: string = window.__ELECTRON__
  ? 'http://127.0.0.1:8000/api'
  : '/api';

const WS_URL: string = window.__ELECTRON__
  ? 'ws://127.0.0.1:8000/ws/rates'
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/rates`;

// ---------------------------------------------------------------------------
// Offline detection
// ---------------------------------------------------------------------------
let _offline: boolean = !navigator.onLine;
window.addEventListener('online', () => { _offline = false; });
window.addEventListener('offline', () => { _offline = true; });

/**
 * Whether the browser/app is currently offline.
 */
export function isOffline(): boolean {
  return _offline;
}

let _ws: WebSocket | null = null;
let _connected: boolean = false;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _onRates: WebSocketCallbacks['onRates'] | null = null;
let _onConnectionChange: WebSocketCallbacks['onConnectionChange'] | null = null;
let _onDataQuality: WebSocketCallbacks['onDataQuality'] | null = null;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
let _reconnectAttempt: number = 0;

/**
 * Connect WebSocket to backend for live rate streaming.
 */
export function connectWebSocket({ onRates, onConnectionChange, onDataQuality }: WebSocketCallbacks): void {
  _onRates = onRates;
  _onConnectionChange = onConnectionChange;
  _onDataQuality = onDataQuality || null;
  _connect();
}

function _connect(): void {
  if (_ws) {
    try { _ws.close(); } catch (err: unknown) {
      console.debug('[WS] Close error during reconnect:', (err as Error).message);
    }
  }

  try {
    _ws = new WebSocket(WS_URL);
  } catch (err: unknown) {
    console.warn('[WS] WebSocket construction failed:', (err as Error).message);
    _setConnected(false);
    _scheduleReconnect();
    return;
  }

  _ws.onopen = (): void => {
    _reconnectAttempt = 0;
    _setConnected(true);
    console.info('[WS] Connected to backend');
  };

  _ws.onmessage = (evt: MessageEvent): void => {
    try {
      const msg = JSON.parse(evt.data as string) as { type?: string; data?: Record<string, unknown> };
      if (msg.type === 'rates' && msg.data) {
        if (_onRates) _onRates(msg.data as Parameters<WebSocketCallbacks['onRates']>[0]);
        if (_onDataQuality && msg.data.dataQuality) {
          _onDataQuality(msg.data.dataQuality as DataQuality);
        }
      }
    } catch (err: unknown) {
      console.warn('[WS] Failed to parse message:', (err as Error).message);
    }
  };

  _ws.onclose = (evt: CloseEvent): void => {
    console.info('[WS] Connection closed:', evt.code, evt.reason);
    _setConnected(false);
    _scheduleReconnect();
  };

  _ws.onerror = (err: Event): void => {
    console.warn('[WS] WebSocket error:', err);
    _setConnected(false);
    try { _ws!.close(); } catch (closeErr: unknown) {
      console.debug('[WS] Close after error failed:', (closeErr as Error).message);
    }
  };
}

function _setConnected(val: boolean): void {
  if (_connected !== val) {
    _connected = val;
    if (_onConnectionChange) _onConnectionChange(val);
  }
}

function _scheduleReconnect(): void {
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
export function disconnectWebSocket(): void {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_ws) {
    try { _ws.close(); } catch (err: unknown) {
      console.debug('[WS] Close error during disconnect:', (err as Error).message);
    }
    _ws = null;
  }
  _setConnected(false);
}

/**
 * Whether the backend WebSocket is currently connected.
 */
export function isBackendConnected(): boolean {
  return _connected;
}

/**
 * Fetch 24-hour LSTM forecast from backend.
 */
export async function fetchForecast(): Promise<ForecastPoint[] | null> {
  try {
    const res = await fetch(`${API_BASE}/forecast`);
    if (!res.ok) {
      console.warn(`[API] Forecast fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as { clockData?: ForecastPoint[] };
    return data.clockData || null;
  } catch (err: unknown) {
    console.warn('[API] Forecast fetch error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch Monte Carlo simulation from backend.
 */
export async function fetchMonteCarlo(): Promise<MonteCarloResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/monte-carlo`);
    if (!res.ok) {
      console.warn(`[API] Monte Carlo fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as MonteCarloResponse;
  } catch (err: unknown) {
    console.warn('[API] Monte Carlo fetch error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch 90-day cash-flow history from backend.
 */
export async function fetchCashFlowHistory(): Promise<CashFlowPoint[] | null> {
  try {
    const res = await fetch(`${API_BASE}/cashflow-history`);
    if (!res.ok) {
      console.warn(`[API] Cash flow history fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as { history?: CashFlowPoint[] };
    return data.history || null;
  } catch (err: unknown) {
    console.warn('[API] Cash flow history fetch error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch data quality metrics from backend.
 */
export async function fetchDataQuality(): Promise<DataQualityResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/data-quality`);
    if (!res.ok) return null;
    return (await res.json()) as DataQualityResponse;
  } catch (err: unknown) {
    console.warn('[API] Data quality fetch error:', (err as Error).message);
    return null;
  }
}

/**
 * Trigger model retrain.
 */
export async function triggerRetrain(apiKey?: string): Promise<{ status: string; message: string } | null> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-Api-Key'] = apiKey;
    const res = await fetch(`${API_BASE}/model/retrain`, { method: 'POST', headers });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      console.warn(`[API] Retrain failed: ${res.status}`, data.message);
      return { status: 'error', message: data.message || `HTTP ${res.status}` };
    }
    return (await res.json()) as { status: string; message: string };
  } catch (err: unknown) {
    console.warn('[API] Retrain error:', (err as Error).message);
    return null;
  }
}

/**
 * Health check.
 */
export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) {
      console.warn(`[API] Health check failed: ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as HealthResponse;
  } catch (err: unknown) {
    console.warn('[API] Health check error:', (err as Error).message);
    return null;
  }
}


// ---------------------------------------------------------------------------
// Regulatory API
// ---------------------------------------------------------------------------

/**
 * Fetch full regulatory dashboard (CRR + SLR + LCR + NSFR + config).
 */
export async function fetchRegulatoryDashboard(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${API_BASE}/regulatory/dashboard`);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch (err: unknown) {
    console.warn('[API] Regulatory dashboard error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch 90-day CRR history.
 */
export async function fetchCRRHistory(): Promise<CrrHistoryPoint[] | null> {
  try {
    const res = await fetch(`${API_BASE}/regulatory/crr/history`);
    if (!res.ok) return null;
    const data = (await res.json()) as { history?: CrrHistoryPoint[] };
    return data.history || null;
  } catch (err: unknown) {
    console.warn('[API] CRR history error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch 90-day SLR history.
 */
export async function fetchSLRHistory(): Promise<CrrHistoryPoint[] | null> {
  try {
    const res = await fetch(`${API_BASE}/regulatory/slr/history`);
    if (!res.ok) return null;
    const data = (await res.json()) as { history?: CrrHistoryPoint[] };
    return data.history || null;
  } catch (err: unknown) {
    console.warn('[API] SLR history error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch current ALM gap analysis (10 buckets).
 */
export async function fetchALMCurrent(): Promise<AlmBucket[] | null> {
  try {
    const res = await fetch(`${API_BASE}/regulatory/alm/current`);
    if (!res.ok) return null;
    const data = (await res.json()) as { buckets?: AlmBucket[] };
    return data.buckets || null;
  } catch (err: unknown) {
    console.warn('[API] ALM current error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch LCR and NSFR metrics.
 */
export async function fetchALMLiquidity(): Promise<LcrNsfr | null> {
  try {
    const res = await fetch(`${API_BASE}/regulatory/alm/liquidity`);
    if (!res.ok) return null;
    return (await res.json()) as LcrNsfr;
  } catch (err: unknown) {
    console.warn('[API] ALM liquidity error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch all branches with latest positions.
 */
export async function fetchBranches(): Promise<Branch[] | null> {
  try {
    const res = await fetch(`${API_BASE}/regulatory/branches`);
    if (!res.ok) return null;
    const data = (await res.json()) as { branches?: Branch[] };
    return data.branches || null;
  } catch (err: unknown) {
    console.warn('[API] Branches error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch single branch 30-day history.
 */
export async function fetchBranchDetail(code: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${API_BASE}/regulatory/branches/${code}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { history?: unknown[] };
    return data.history || null;
  } catch (err: unknown) {
    console.warn('[API] Branch detail error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch regional aggregation summary.
 */
export async function fetchBranchesSummary(): Promise<Record<string, RegionalSummary> | null> {
  try {
    const res = await fetch(`${API_BASE}/regulatory/branches/summary`);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, RegionalSummary>;
  } catch (err: unknown) {
    console.warn('[API] Branches summary error:', (err as Error).message);
    return null;
  }
}

/**
 * Generate a regulatory report.
 */
export async function generateReport(reportType: string): Promise<Record<string, unknown> | null> {
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
    return (await res.json()) as Record<string, unknown>;
  } catch (err: unknown) {
    console.warn('[API] Report generation error:', (err as Error).message);
    return null;
  }
}

/**
 * Fetch list of generated reports.
 */
export async function fetchReports(): Promise<Record<string, unknown>[] | null> {
  try {
    const res = await fetch(`${API_BASE}/regulatory/reports`);
    if (!res.ok) return null;
    const data = (await res.json()) as { reports?: Record<string, unknown>[] };
    return data.reports || null;
  } catch (err: unknown) {
    console.warn('[API] Reports list error:', (err as Error).message);
    return null;
  }
}
