/**
 * Generate a random float between min and max, rounded to 4 decimal places.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const normalizeBounds = (min, max) => {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 0];
  return lo <= hi ? [lo, hi] : [hi, lo];
};

export const rand = (min, max) => {
  const [lo, hi] = normalizeBounds(min, max);
  return +(lo + Math.random() * (hi - lo)).toFixed(4);
};

/**
 * Generate a random integer between min (inclusive) and max (exclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export const randInt = (min, max) => {
  const [lo, hi] = normalizeBounds(min, max);
  if (lo === hi) return Math.floor(lo);
  return Math.floor(lo + Math.random() * (hi - lo));
};

/**
 * Generate a random integer between min and max, both inclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export const randIntInclusive = (min, max) => {
  const [loRaw, hiRaw] = normalizeBounds(min, max);
  const lo = Math.ceil(loRaw);
  const hi = Math.floor(hiRaw);
  if (lo >= hi) return lo;
  return Math.floor(lo + Math.random() * (hi - lo + 1));
};

/**
 * Clamp a value between lo and hi bounds.
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
