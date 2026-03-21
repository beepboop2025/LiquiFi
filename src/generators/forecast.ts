import { rand, clamp } from '../utils/math';
import type { ForecastPoint } from '../types';

/**
 * Generate 24-hour liquidity forecast data with confidence intervals.
 * (Synchronous — used as fallback when worker is unavailable)
 */
export const generateHourlyForecast = (): ForecastPoint[] => {
  const data: ForecastPoint[] = [];
  let bal = 245 + Math.random() * 30;
  let predicted = bal;
  for (let i = 0; i < 24; i++) {
    const hour = `${String(i).padStart(2, "0")}:00`;
    const isBusinessHour = i >= 9 && i <= 17;
    const inflow = rand(2, isBusinessHour ? 45 : 8);
    const outflow = rand(3, isBusinessHour ? 40 : 5);
    bal = clamp(bal + inflow - outflow, 60, 400);
    predicted = clamp(predicted + inflow - outflow + rand(-15, 15), 50, 420);
    const ci95_upper = predicted + rand(10, 25);
    const ci95_lower = predicted - rand(10, 25);
    const ci99_upper = predicted + rand(20, 40);
    const ci99_lower = Math.max(30, predicted - rand(20, 40));
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
};

/**
 * Run forecast generation off the main thread via a Web Worker.
 * Falls back to synchronous generation if workers are unavailable.
 */
export function generateHourlyForecastAsync(): Promise<ForecastPoint[]> {
  return new Promise((resolve) => {
    try {
      const worker = new Worker(
        new URL('../workers/forecastWorker.ts', import.meta.url),
        { type: 'module' },
      );
      const timeout = setTimeout(() => {
        worker.terminate();
        console.warn('[Forecast] Worker timed out, falling back to sync');
        resolve(generateHourlyForecast());
      }, 5_000);

      worker.onmessage = (evt) => {
        clearTimeout(timeout);
        worker.terminate();
        if (evt.data.ok) {
          resolve(evt.data.forecast);
        } else {
          console.warn('[Forecast] Worker error:', evt.data.error);
          resolve(generateHourlyForecast());
        }
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(generateHourlyForecast());
      };
      worker.postMessage({ action: 'generate' });
    } catch {
      resolve(generateHourlyForecast());
    }
  });
}
