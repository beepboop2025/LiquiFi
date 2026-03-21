/**
 * Web Worker for Monte Carlo simulation — runs off main thread.
 *
 * Accepts: { paths: number; steps: number; startVal?: number }
 * Returns: MonteCarloPoint[][] via postMessage
 */

interface MonteCarloParams {
  paths: number;
  steps: number;
  startVal?: number;
}

interface MonteCarloPoint {
  hour: number;
  value: number;
  pathId: number;
}

function mcRand(min: number, max: number): number {
  return +(min + Math.random() * (max - min)).toFixed(4);
}

function runSimulation(params: MonteCarloParams): MonteCarloPoint[][] {
  const { paths = 300, steps = 24, startVal = 245 } = params;
  const result: MonteCarloPoint[][] = [];

  for (let p = 0; p < paths; p++) {
    let val = startVal + mcRand(-20, 20);
    const path: MonteCarloPoint[] = [];
    for (let t = 0; t < steps; t++) {
      val += mcRand(-18, 18);
      val = Math.max(20, val);
      path.push({ hour: t, value: +val.toFixed(1), pathId: p });
    }
    result.push(path);
  }

  return result;
}

self.onmessage = (evt: MessageEvent<MonteCarloParams>) => {
  try {
    const paths = runSimulation(evt.data);
    self.postMessage({ ok: true, paths });
  } catch (err: unknown) {
    self.postMessage({ ok: false, error: (err as Error).message });
  }
};
