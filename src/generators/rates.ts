import { MIBOR_BASE, REPO_BASE } from '../constants/rates';
import type { RatesSnapshot } from '../types';

/**
 * Generate a new rates snapshot with random drift from previous values.
 */
export const generateRates = (prev?: Partial<RatesSnapshot>): RatesSnapshot => {
  const drift = (base: number, prev_val: number | undefined, vol: number): number => {
    if (!prev_val) return base;
    return +(prev_val + (Math.random() - 0.5) * vol).toFixed(4);
  };
  return {
    mibor_overnight: drift(MIBOR_BASE, prev?.mibor_overnight || MIBOR_BASE, 0.08),
    mibor_14d: drift(MIBOR_BASE + 0.15, prev?.mibor_14d || MIBOR_BASE + 0.15, 0.05),
    mibor_1m: drift(MIBOR_BASE + 0.25, prev?.mibor_1m || MIBOR_BASE + 0.25, 0.04),
    mibor_3m: drift(MIBOR_BASE + 0.45, prev?.mibor_3m || MIBOR_BASE + 0.45, 0.03),
    cblo_bid: drift(6.55, prev?.cblo_bid || 6.55, 0.06),
    cblo_ask: drift(6.62, prev?.cblo_ask || 6.62, 0.06),
    repo: drift(REPO_BASE, prev?.repo || REPO_BASE, 0.03),
    reverse_repo: drift(6.25, prev?.reverse_repo || 6.25, 0.02),
    cd_1m: drift(6.95, prev?.cd_1m || 6.95, 0.04),
    cd_3m: drift(7.10, prev?.cd_3m || 7.10, 0.03),
    cd_6m: drift(7.25, prev?.cd_6m || 7.25, 0.02),
    cd_12m: drift(7.45, prev?.cd_12m || 7.45, 0.02),
    cp_1m: drift(7.20, prev?.cp_1m || 7.20, 0.05),
    cp_3m: drift(7.35, prev?.cp_3m || 7.35, 0.04),
    tbill_91d: drift(6.85, prev?.tbill_91d || 6.85, 0.03),
    tbill_182d: drift(6.95, prev?.tbill_182d || 6.95, 0.02),
    tbill_364d: drift(7.05, prev?.tbill_364d || 7.05, 0.02),
    mifor_1m: drift(7.25, prev?.mifor_1m || 7.25, 0.06),
    mifor_3m: drift(7.45, prev?.mifor_3m || 7.45, 0.05),
    mifor_6m: drift(7.60, prev?.mifor_6m || 7.60, 0.04),
    sofr: drift(5.33, prev?.sofr || 5.33, 0.02),
    usdinr_spot: drift(83.25, prev?.usdinr_spot || 83.25, 0.15),
    usdinr_1m_fwd: drift(83.48, prev?.usdinr_1m_fwd || 83.48, 0.12),
    ois_1y: drift(6.65, prev?.ois_1y || 6.65, 0.03),
    ois_3y: drift(6.80, prev?.ois_3y || 6.80, 0.02),
    ois_5y: drift(6.90, prev?.ois_5y || 6.90, 0.02),
    gsec_10y: drift(7.15, prev?.gsec_10y || 7.15, 0.02),
    call_money_high: drift(6.90, prev?.call_money_high || 6.90, 0.10),
    call_money_low: drift(6.50, prev?.call_money_low || 6.50, 0.08),
    notice_7d: drift(6.80, prev?.notice_7d || 6.80, 0.04),
    notice_14d: drift(6.85, prev?.notice_14d || 6.85, 0.03),
    mmf_liquid: drift(7.05, prev?.mmf_liquid || 7.05, 0.02),
    mmf_overnight: drift(6.45, prev?.mmf_overnight || 6.45, 0.02),
    mmf_ultra_short: drift(7.15, prev?.mmf_ultra_short || 7.15, 0.02),
  };
};
