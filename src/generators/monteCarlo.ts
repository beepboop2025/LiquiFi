import { rand } from '../utils/math';
import { MONTE_CARLO_PATHS } from '../constants/rates';
import type { MonteCarloPoint } from '../types';

/**
 * Generate Monte Carlo simulation paths for Liquidity at Risk analysis.
 * (Synchronous — used as fallback when worker is unavailable)
 */
export const generateMonteCarloSims = (): MonteCarloPoint[][] => {
  const paths: MonteCarloPoint[][] = [];
  for (let p = 0; p < MONTE_CARLO_PATHS; p++) {
    let val = 245 + rand(-20, 20);
    const path: MonteCarloPoint[] = [];
    for (let t = 0; t < 24; t++) {
      val += rand(-18, 18);
      val = Math.max(20, val);
      path.push({ hour: t, value: +val.toFixed(1), pathId: p });
    }
    paths.push(path);
  }
  return paths;
};

/**
 * Run Monte Carlo simulation off the main thread via a Web Worker.
 * Falls back to synchronous generation if workers are unavailable.
 */
export function generateMonteCarloAsync(
  paths = MONTE_CARLO_PATHS,
  steps = 24,
  startVal = 245,
): Promise<MonteCarloPoint[][]> {
  return new Promise((resolve) => {
    try {
      const worker = new Worker(
        new URL('../workers/monteCarloWorker.ts', import.meta.url),
        { type: 'module' },
      );
      const timeout = setTimeout(() => {
        worker.terminate();
        console.warn('[MonteCarlo] Worker timed out, falling back to sync');
        resolve(generateMonteCarloSims());
      }, 10_000);

      worker.onmessage = (evt) => {
        clearTimeout(timeout);
        worker.terminate();
        if (evt.data.ok) {
          resolve(evt.data.paths);
        } else {
          console.warn('[MonteCarlo] Worker error:', evt.data.error);
          resolve(generateMonteCarloSims());
        }
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(generateMonteCarloSims());
      };
      worker.postMessage({ paths, steps, startVal });
    } catch {
      // Worker construction failed (e.g., SSR) — fallback
      resolve(generateMonteCarloSims());
    }
  });
}
