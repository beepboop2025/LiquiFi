import { memo } from "react";
const STATUS_CONFIG = {
  FILLED: { bg: "rgba(16,185,129,0.12)", color: "var(--green)" },
  PARTIAL: { bg: "rgba(245,158,11,0.12)", color: "var(--amber)" },
  OPEN: { bg: "rgba(59,130,246,0.12)", color: "var(--blue)" },
  CANCELLED: { bg: "rgba(239,68,68,0.08)", color: "var(--red)" },
  FAILED: { bg: "rgba(239,68,68,0.14)", color: "var(--red)" },
  blocked: { bg: "rgba(239,68,68,0.14)", color: "var(--red)" },
  queued: { bg: "rgba(59,130,246,0.1)", color: "var(--blue)" },
  retry: { bg: "rgba(245,158,11,0.12)", color: "var(--amber)" },
  retrying: { bg: "rgba(245,158,11,0.12)", color: "var(--amber)" },
  pass: { bg: "rgba(16,185,129,0.12)", color: "var(--green)" },
  warn: { bg: "rgba(245,158,11,0.12)", color: "var(--amber)" },
  fail: { bg: "rgba(239,68,68,0.12)", color: "var(--red)" },
  settled: { bg: "rgba(16,185,129,0.1)", color: "var(--green)" },
  pending: { bg: "rgba(245,158,11,0.1)", color: "var(--amber)" },
  processing: { bg: "rgba(59,130,246,0.1)", color: "var(--blue)" },
  failed: { bg: "rgba(239,68,68,0.12)", color: "var(--red)" },
};
const StatusBadge = memo(({ status }) => {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
  return <span className="badge mono" style={{ background: c.bg, color: c.color }} aria-label={`Status: ${status}`}>{status}</span>;
});
StatusBadge.displayName = "StatusBadge";
export default StatusBadge;
