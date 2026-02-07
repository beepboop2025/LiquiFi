import { randInt, randIntInclusive } from './math.js';

/**
 * Generate a unique ID with a prefix and timestamp.
 * @param {string} prefix
 * @returns {string}
 */
export const backendId = (prefix = "id") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Create a unique ID with prefix and random suffix.
 * @param {string} prefix
 * @returns {string}
 */
export const createId = (prefix) =>
  `${prefix}-${Date.now()}-${randIntInclusive(1000, 9999)}`;

/**
 * Pick a random element from an array.
 * @template T
 * @param {T[]} list
 * @returns {T|undefined}
 */
export const randomOf = (list) => (Array.isArray(list) && list.length > 0 ? list[randInt(0, list.length)] : undefined);

/**
 * Generate a deterministic short hash from input string using DJB2 algorithm.
 * Falls back to timestamp-based hash if no input is provided.
 * @param {string} [input] - Content to hash for tamper-evidence
 * @returns {string}
 */
export const shortHash = (input) => {
  const str = input || `${Date.now()}-${Math.random()}`;
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + ch) >>> 0;
    h2 = ((h2 << 5) + h2 + ch) >>> 0;
  }
  return `${h1.toString(16).slice(0, 4)}...${h2.toString(16).slice(0, 4)}`;
};

/**
 * Check if a counterparty name refers to an infrastructure entity (CCIL, triparty, liquid fund).
 * @param {string} name
 * @returns {boolean}
 */
export const isInfraCounterparty = (name = "") => /ccil|triparty|liquid/i.test(name);

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
