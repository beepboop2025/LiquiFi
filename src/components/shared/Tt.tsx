import { memo } from "react";

interface TtPayload {
  name: string;
  value: number | string;
  color?: string;
}

interface TtProps {
  active?: boolean;
  payload?: TtPayload[];
  label?: string;
}

const Tt = memo<TtProps>(({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#151e35", border: "1px solid #2e4070", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
      <p className="mono" style={{ color: "#64748b", marginBottom: 6, fontSize: 10 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="mono" style={{ color: p.color || "#e2e8f0", fontSize: 11, lineHeight: 1.6 }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
});
Tt.displayName = "Tt";
export default Tt;
