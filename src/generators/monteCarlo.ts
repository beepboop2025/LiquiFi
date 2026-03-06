import { rand } from '../utils/math';
import { MONTE_CARLO_PATHS } from '../constants/rates';
import type { MonteCarloPoint } from '../types';

/**
 * Generate Monte Carlo simulation paths for Liquidity at Risk analysis.
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
