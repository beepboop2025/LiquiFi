import { rand, clamp } from '../utils/math.js';

/**
 * Generate 24-hour liquidity forecast data with confidence intervals.
 * @returns {Array<Object>} Array of hourly forecast data points
 */
export const generateHourlyForecast = () => {
  const data = [];
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
