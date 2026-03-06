import { rand, clamp } from '../utils/math';
import { MIBOR_BASE, REPO_BASE } from '../constants/rates';
import type { HistoricalRatePoint, CashFlowPoint } from '../types';

/**
 * Generate 90-day historical rate data for MIBOR, CBLO, and Repo.
 */
export const generateHistoricalRates = (days: number = 90): HistoricalRatePoint[] => {
  const data: HistoricalRatePoint[] = [];
  let mibor: number = MIBOR_BASE;
  let cblo = 6.55;
  let repo: number = REPO_BASE;
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
 */
export const generateCashFlowHistory = (days: number = 90): CashFlowPoint[] => {
  const data: CashFlowPoint[] = [];
  for (let i = 0; i < days; i++) {
    const isPayroll = i % 30 === 0;
    const isGST = i % 30 === 20;
    const isAdvTax = [14, 44, 74].includes(i);
    const inflow = rand(15, 60) + (isPayroll ? 0 : rand(0, 20));
    const outflow = rand(10, 45) + (isPayroll ? 80 : 0) + (isGST ? 40 : 0) + (isAdvTax ? 60 : 0);
    data.push({
      day: i,
      label: `D-${days - i}`,
      inflow,
      outflow,
      net: +(inflow - outflow).toFixed(1),
      payroll: isPayroll,
      gst: isGST,
      advtax: isAdvTax,
    });
  }
  return data;
};
