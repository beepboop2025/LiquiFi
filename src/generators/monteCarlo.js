import { rand } from '../utils/math.js';
import { MONTE_CARLO_PATHS } from '../constants/rates.js';

/**
 * Generate Monte Carlo simulation paths for Liquidity at Risk analysis.
 * @returns {Array<Array<Object>>} Array of simulation paths, each containing hourly data points
 */
export const generateMonteCarloSims = () => {
  const paths = [];
  for (let p = 0; p < MONTE_CARLO_PATHS; p++) {
    let val = 245 + rand(-20, 20);
    const path = [];
    for (let t = 0; t < 24; t++) {
      val += rand(-18, 18);
      val = Math.max(20, val);
      path.push({ hour: t, value: +val.toFixed(1), pathId: p });
    }
    paths.push(path);
  }
  return paths;
};
