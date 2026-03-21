import type { BackendEvent, AuditEntry, EventLevel } from "../types";
import { backendId, createId, shortHash } from "./helpers";

export const createBackendEvent = (
  level: EventLevel,
  module: string,
  message: string,
  meta: Record<string, unknown> = {}
): BackendEvent => ({
  id: backendId("evt"),
  ts: new Date().toISOString(),
  level,
  module,
  message,
  meta,
});

export const createAuditEntry = ({
  action,
  detail,
  actor = "System",
  level = "info",
}: {
  action: string;
  detail: string;
  actor?: string;
  level?: "info" | "warn" | "error";
}): AuditEntry => {
  const id = createId("AUD");
  const time = new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  });
  // Hash based on CONTENT ONLY (action + detail + actor + time) — not the random id
  // This makes the hash deterministic and tamper-evident for the same content
  return {
    id,
    time,
    action,
    detail,
    user: actor,
    level,
    hash: shortHash(`${action}|${detail}|${actor}|${time}`),
  };
};
