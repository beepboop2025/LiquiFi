import { useEffect, useCallback } from "react";
import { AlertTriangle, Shield } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
  confirmLabel?: string;
}

export default function ConfirmDialog({ title, message, onConfirm, onCancel, variant = "warning", confirmLabel = "Confirm" }: ConfirmDialogProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  }, [onCancel]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const Icon = variant === "danger" ? AlertTriangle : Shield;
  const iconColor = variant === "danger" ? "var(--red)" : "var(--amber)";

  return (
    <div className="dialog-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ background: `${iconColor}14`, borderRadius: 8, padding: 8 }}>
            <Icon size={20} color={iconColor} />
          </div>
          <h3 id="confirm-title" style={{ fontSize: 16, fontWeight: 600 }}>{title}</h3>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 20 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={onConfirm} style={variant === "danger" ? { background: "linear-gradient(135deg, var(--red), var(--red-dim))" } : {}}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
