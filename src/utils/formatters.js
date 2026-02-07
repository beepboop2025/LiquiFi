/**
 * Format a number as Indian Crore currency string.
 * @param {number} v - Value in Crores
 * @returns {string}
 */
export const formatCr = (v) => `\u20B9${(Number(v) || 0).toFixed(1)}Cr`;

/**
 * Format a number as Indian Lakh currency string.
 * @param {number} v - Value in Lakhs
 * @returns {string}
 */
export const formatL = (v) => `\u20B9${(Number(v) || 0).toFixed(1)}L`;

/**
 * Format a number as a percentage string.
 * @param {number} v
 * @returns {string}
 */
export const formatPct = (v) => `${(Number(v) || 0).toFixed(2)}%`;

/**
 * Format latency in milliseconds.
 * @param {number|null} latency
 * @returns {string}
 */
export const formatLatency = (latency) => (latency == null ? "N/A" : `${(Number(latency) || 0).toFixed(0)}ms`);

/**
 * Format uptime as percentage string.
 * @param {number} uptime
 * @returns {string}
 */
export const formatUptime = (uptime) => `${uptime.toFixed(2)}%`;
