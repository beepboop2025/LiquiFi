import { RATE_FIELDS } from '../constants/rates.js';
import { COUNTERPARTIES, COUNTERPARTY_ALIASES } from '../constants/counterparties.js';
import { clamp } from '../utils/math.js';
import { isInfraCounterparty } from '../utils/helpers.js';
import { generateRates } from '../generators/rates.js';

/**
 * Validate and sanitize a rates snapshot, clamping values and fixing inversions.
 * @param {Object} candidate - Rates to validate
 * @param {Object} [fallback] - Fallback rates if candidate fields are invalid
 * @returns {{ rates: Object, corrected: boolean }}
 */
// Per-field validation bounds for realistic rate ranges
const RATE_BOUNDS = {
  usdinr_spot: [60, 120],
  usdinr_1m_fwd: [60, 125],
  sofr: [0, 15],
};
const DEFAULT_RATE_BOUNDS = [0, 30]; // Interest rates should not exceed 30%

export const validateRates = (candidate, fallback = generateRates()) => {
  const next = { ...fallback };
  let corrected = false;

  RATE_FIELDS.forEach((field) => {
    const value = candidate?.[field];
    const [lo, hi] = RATE_BOUNDS[field] || DEFAULT_RATE_BOUNDS;
    if (typeof value === "number" && Number.isFinite(value)) {
      const clamped = +clamp(value, lo, hi).toFixed(4);
      if (clamped !== +value.toFixed(4)) corrected = true;
      next[field] = clamped;
    } else {
      corrected = true;
    }
  });

  if (next.cblo_ask < next.cblo_bid) {
    next.cblo_ask = +(next.cblo_bid + 0.01).toFixed(4);
    corrected = true;
  }
  if (next.call_money_high < next.call_money_low) {
    const prevHigh = next.call_money_high;
    next.call_money_high = next.call_money_low;
    next.call_money_low = prevHigh;
    corrected = true;
  }

  return { rates: next, corrected };
};

/**
 * Resolve a raw counterparty name to a known counterparty record.
 * @param {string} rawName
 * @returns {Object|null} Matched counterparty or null
 */
export const resolveCounterparty = (rawName = "") => {
  if (!rawName) return null;
  const key = rawName.trim().toLowerCase();
  const normalized = COUNTERPARTY_ALIASES[key] || rawName.trim();
  return COUNTERPARTIES.find((cp) => cp.name.toLowerCase() === normalized.toLowerCase()) || null;
};

/**
 * Validate a multi-leg deployment plan against surplus, counterparty limits, and watchlist.
 * @param {Array} plan - Deployment legs
 * @param {number} surplus - Available surplus in Crores
 * @param {boolean} [killSwitch=false] - Whether kill switch is active
 * @returns {{ valid: boolean, errors: string[], warnings: string[], total: number }}
 */
export const validateDeploymentPlan = (plan, surplus, killSwitch = false) => {
  const errors = [];
  const warnings = [];
  const cpDelta = {};
  let total = 0;

  if (killSwitch) {
    errors.push("Global kill switch is active. Deployments are blocked.");
  }
  if (!Array.isArray(plan) || plan.length === 0) {
    errors.push("Deployment plan is empty.");
    return { valid: false, errors, warnings, total: 0 };
  }

  plan.forEach((leg, idx) => {
    const amount = Number(leg.amount);
    const rate = Number(leg.rate);
    const legLabel = leg.instrument || `Leg ${idx + 1}`;
    total += Number.isFinite(amount) ? amount : 0;

    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`${legLabel}: amount must be > 0.`);
    }
    if (!Number.isFinite(rate) || rate <= 0 || rate > 30) {
      errors.push(`${legLabel}: rate must be in (0, 30].`);
    }

    const splits = Array.isArray(leg.splits) ? leg.splits : [];
    const splitTotal = splits.reduce((sum, split) => sum + (Number(split.amt) || 0), 0);
    if (Math.abs(splitTotal - amount) > 0.01) {
      errors.push(`${legLabel}: split total \u20B9${splitTotal.toFixed(1)}Cr does not match leg amount \u20B9${amount.toFixed(1)}Cr.`);
    }

    splits.forEach((split) => {
      const splitAmt = Number(split.amt) || 0;
      const cpName = split.cp || "";
      const cp = resolveCounterparty(cpName);

      if (!cp && !isInfraCounterparty(cpName)) {
        warnings.push(`${legLabel}: ${cpName} not mapped to known counterparty limits.`);
        return;
      }
      if (!cp) return;

      cpDelta[cp.name] = (cpDelta[cp.name] || 0) + splitAmt;
      const projectedExposure = cp.exposure + cpDelta[cp.name];
      const projectedUtilization = projectedExposure / cp.limit;

      if (cp.watchlist) {
        errors.push(`${legLabel}: ${cp.name} is watchlisted and cannot receive new deployment.`);
      }
      if (projectedExposure > cp.limit) {
        errors.push(`${legLabel}: ${cp.name} exceeds limit (${projectedExposure.toFixed(1)}Cr > ${cp.limit}Cr).`);
      } else if (projectedUtilization > 0.9) {
        warnings.push(`${legLabel}: ${cp.name} projected utilization at ${(projectedUtilization * 100).toFixed(1)}%.`);
      }
    });
  });

  if (total > surplus + 0.01) {
    errors.push(`Plan total \u20B9${total.toFixed(1)}Cr exceeds available surplus \u20B9${surplus.toFixed(1)}Cr.`);
  }

  return { valid: errors.length === 0, errors, warnings, total: +total.toFixed(2) };
};
