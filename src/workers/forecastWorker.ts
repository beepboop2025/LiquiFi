/**
 * Web Worker for LSTM forecast processing — runs off main thread.
 *
 * Accepts: { action: 'generate' } or raw data to process
 * Returns: ForecastPoint[] via postMessage
 */

interface FcWorkerForecastPoint {
  hour: string;
  balance: number;
  predicted: number;
  ci95_upper: number;
  ci95_lower: number;
  ci99_upper: number;
  ci99_lower: number;
  min_buffer: number;
  inflow: number;
  outflow: number;
}

function fcRand(min: number, max: number): number {
  return +(min + Math.random() * (max - min)).toFixed(4);
}

function fcClamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function fcGenerateHourlyForecast(): FcWorkerForecastPoint[] {
  const data: FcWorkerForecastPoint[] = [];
  let bal = 245 + Math.random() * 30;
  let predicted = bal;

  for (let i = 0; i < 24; i++) {
    const hour = `${String(i).padStart(2, '0')}:00`;
    const isBusinessHour = i >= 9 && i <= 17;
    const inflow = fcRand(2, isBusinessHour ? 45 : 8);
    const outflow = fcRand(3, isBusinessHour ? 40 : 5);
    bal = fcClamp(bal + inflow - outflow, 60, 400);
    predicted = fcClamp(predicted + inflow - outflow + fcRand(-15, 15), 50, 420);
    const ci95_upper = predicted + fcRand(10, 25);
    const ci95_lower = predicted - fcRand(10, 25);
    const ci99_upper = predicted + fcRand(20, 40);
    const ci99_lower = Math.max(30, predicted - fcRand(20, 40));
    data.push({
      hour,
      balance: +bal.toFixed(1),
      predicted: +predicted.toFixed(1),
      ci95_upper: +ci95_upper.toFixed(1),
      ci95_lower: +ci95_lower.toFixed(1),
      ci99_upper: +ci99_upper.toFixed(1),
      ci99_lower: +ci99_lower.toFixed(1),
      min_buffer: 120,
      inflow: +inflow.toFixed(1),
      outflow: +outflow.toFixed(1),
    });
  }
  return data;
}

self.onmessage = (evt: MessageEvent<{ action: string }>) => {
  try {
    if (evt.data.action === 'generate') {
      const forecast = fcGenerateHourlyForecast();
      self.postMessage({ ok: true, forecast });
    } else {
      self.postMessage({ ok: false, error: 'Unknown action' });
    }
  } catch (err: unknown) {
    self.postMessage({ ok: false, error: (err as Error).message });
  }
};
