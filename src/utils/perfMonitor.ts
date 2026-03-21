/**
 * Performance monitoring utility for LiquiFi.
 *
 * Tracks API response times, render durations, and WebSocket latency
 * using the Performance API (mark/measure) for accurate timing.
 */

interface PerfEntry {
  name: string;
  duration: number;
  ts: number;
}

interface PerfReport {
  apiLatency: { avg: number; p95: number; p99: number; count: number };
  wsLatency: { avg: number; last: number; count: number };
  renderTime: { avg: number; p95: number; count: number };
  uptime: number;
}

const MAX_ENTRIES = 500;
const _startTime = Date.now();

const _apiTimings: PerfEntry[] = [];
const _wsTimings: PerfEntry[] = [];
const _renderTimings: PerfEntry[] = [];

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * pct / 100) - 1;
  return sorted[Math.max(0, idx)];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function trimOld(arr: PerfEntry[]): void {
  if (arr.length > MAX_ENTRIES) {
    arr.splice(0, arr.length - MAX_ENTRIES);
  }
}

// ---------------------------------------------------------------------------
// API timing
// ---------------------------------------------------------------------------
export function markApiStart(label: string): string {
  const id = `api-${label}-${Date.now()}`;
  try { performance.mark(`${id}-start`); } catch { /* noop */ }
  return id;
}

export function markApiEnd(id: string): number {
  try {
    performance.mark(`${id}-end`);
    performance.measure(id, `${id}-start`, `${id}-end`);
    const entries = performance.getEntriesByName(id, 'measure');
    const dur = entries.length > 0 ? entries[0].duration : 0;
    _apiTimings.push({ name: id, duration: dur, ts: Date.now() });
    trimOld(_apiTimings);
    // Cleanup marks
    performance.clearMarks(`${id}-start`);
    performance.clearMarks(`${id}-end`);
    performance.clearMeasures(id);
    return dur;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// WebSocket latency
// ---------------------------------------------------------------------------
export function recordWsLatency(ms: number): void {
  _wsTimings.push({ name: 'ws', duration: ms, ts: Date.now() });
  trimOld(_wsTimings);
}

// ---------------------------------------------------------------------------
// Render timing
// ---------------------------------------------------------------------------
export function markRenderStart(label: string): string {
  const id = `render-${label}-${Date.now()}`;
  try { performance.mark(`${id}-start`); } catch { /* noop */ }
  return id;
}

export function markRenderEnd(id: string): number {
  try {
    performance.mark(`${id}-end`);
    performance.measure(id, `${id}-start`, `${id}-end`);
    const entries = performance.getEntriesByName(id, 'measure');
    const dur = entries.length > 0 ? entries[0].duration : 0;
    _renderTimings.push({ name: id, duration: dur, ts: Date.now() });
    trimOld(_renderTimings);
    performance.clearMarks(`${id}-start`);
    performance.clearMarks(`${id}-end`);
    performance.clearMeasures(id);
    return dur;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
export function getPerfReport(): PerfReport {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;

  const recentApi = _apiTimings.filter((e) => now - e.ts < fiveMin).map((e) => e.duration).sort((a, b) => a - b);
  const recentWs = _wsTimings.filter((e) => now - e.ts < fiveMin).map((e) => e.duration).sort((a, b) => a - b);
  const recentRender = _renderTimings.filter((e) => now - e.ts < fiveMin).map((e) => e.duration).sort((a, b) => a - b);

  return {
    apiLatency: {
      avg: +avg(recentApi).toFixed(1),
      p95: +percentile(recentApi, 95).toFixed(1),
      p99: +percentile(recentApi, 99).toFixed(1),
      count: recentApi.length,
    },
    wsLatency: {
      avg: +avg(recentWs).toFixed(1),
      last: recentWs.length > 0 ? recentWs[recentWs.length - 1] : 0,
      count: recentWs.length,
    },
    renderTime: {
      avg: +avg(recentRender).toFixed(1),
      p95: +percentile(recentRender, 95).toFixed(1),
      count: recentRender.length,
    },
    uptime: Math.round((now - _startTime) / 1000),
  };
}

// ---------------------------------------------------------------------------
// API success rate (last 5 min)
// ---------------------------------------------------------------------------
let _apiSuccess = 0;
let _apiFail = 0;
let _apiSuccessWindow: number[] = [];
let _apiFailWindow: number[] = [];

export function recordApiSuccess(): void {
  _apiSuccess++;
  _apiSuccessWindow.push(Date.now());
}

export function recordApiFailure(): void {
  _apiFail++;
  _apiFailWindow.push(Date.now());
}

export function getApiSuccessRate(): number {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  _apiSuccessWindow = _apiSuccessWindow.filter((t) => now - t < fiveMin);
  _apiFailWindow = _apiFailWindow.filter((t) => now - t < fiveMin);
  const total = _apiSuccessWindow.length + _apiFailWindow.length;
  if (total === 0) return 100;
  return +( (_apiSuccessWindow.length / total) * 100 ).toFixed(1);
}

export function getTotalApiCalls(): { success: number; fail: number } {
  return { success: _apiSuccess, fail: _apiFail };
}
