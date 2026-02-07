import { rand, randInt, clamp } from '../utils/math.js';
import { MIBOR_BASE, REPO_BASE } from '../constants/rates.js';

/**
 * Generate 90-day historical rate data for MIBOR, CBLO, and Repo.
 * @param {number} [days=90] - Number of days of history
 * @returns {Array<Object>} Historical rate data with spread
 */
export const generateHistoricalRates = (days = 90) => {
  const data = [];
  let mibor = MIBOR_BASE;
  let cblo = 6.55;
  let repo = REPO_BASE;
  for (let i = 0; i < days; i++) {
    mibor = clamp(mibor + rand(-0.05, 0.05), 6.2, 7.3);
    cblo = clamp(cblo + rand(-0.04, 0.04), 6.1, 7.0);
    repo = clamp(repo + rand(-0.03, 0.03), 6.1, 6.9);
    data.push({
      day: `D-${days - i}`,
      dayNum: i,
      mibor: +mibor.toFixed(2),
      cblo: +cblo.toFixed(2),
      repo: +repo.toFixed(2),
      spread: +((mibor - repo) * 100).toFixed(1),
    });
  }
  return data;
};

/**
 * Generate 90-day cash flow history with payroll, GST, and advance tax markers.
 * @param {number} [days=90] - Number of days of history
 * @returns {Array<Object>} Cash flow data with event markers
 */
export const generateCashFlowHistory = (days = 90) => {
  const data = [];
  for (let i = 0; i < days; i++) {
    const isPayroll = i % 30 === 0;
    const isGST = i % 30 === 20;
    const isAdvTax = [14, 44, 74].includes(i);
    data.push({
      day: i,
      label: `D-${days - i}`,
      inflow: rand(15, 60) + (isPayroll ? 0 : rand(0, 20)),
      outflow: rand(10, 45) + (isPayroll ? 80 : 0) + (isGST ? 40 : 0) + (isAdvTax ? 60 : 0),
      net: 0,
      payroll: isPayroll,
      gst: isGST,
      advtax: isAdvTax,
    });
    data[data.length - 1].net = +(data[data.length - 1].inflow - data[data.length - 1].outflow).toFixed(1);
  }
  return data;
};
