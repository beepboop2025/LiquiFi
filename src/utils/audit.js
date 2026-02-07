import { backendId, createId, shortHash } from './helpers.js';

/**
 * Create a structured backend event log entry.
 * @param {string} level - "info" | "warn" | "error" | "success"
 * @param {string} module - Source module name
 * @param {string} message - Event description
 * @param {Object} [meta] - Optional metadata
 * @returns {Object} Event object
 */
export const createBackendEvent = (level, module, message, meta = {}) => ({
  id: backendId("evt"),
  ts: new Date().toISOString(),
  level,
  module,
  message,
  meta,
});

/**
 * Create an audit trail entry with IST timestamp and hash.
 * @param {Object} params
 * @param {string} params.action - Action type
 * @param {string} params.detail - Action detail
 * @param {string} [params.actor] - Actor name
 * @param {string} [params.level] - Log level
 * @returns {Object} Audit entry
 */
export const createAuditEntry = ({ action, detail, actor = "System", level = "info" }) => {
  const id = createId("AUD");
  const time = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
  return {
    id,
    time,
    action,
    detail,
    user: actor,
    level,
    hash: shortHash(`${id}|${time}|${action}|${detail}|${actor}`),
  };
};
