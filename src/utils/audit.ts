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
