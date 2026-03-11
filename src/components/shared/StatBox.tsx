import { memo, useRef, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

interface StatBoxProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: LucideIcon;
  small?: boolean;
}

const StatBox = memo<StatBoxProps>(({ label, value, sub, color, icon: Icon, small }) => {
  const [flash, setFlash] = useState(false);
  const prevValue = useRef<string | number>(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      setFlash(true);
      prevValue.current = value;
      const timer = setTimeout(() => setFlash(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <div
      className="stat-box"
      style={{
        padding: small ? "10px 12px" : "14px 16px",
        borderColor: flash ? `${color || "var(--cyan)"}25` : undefined,
        transition: "border-color 0.8s ease, transform var(--duration-normal) var(--ease-smooth), box-shadow var(--duration-slow) var(--ease-smooth)",
      }}
      aria-label={`${label}: ${value}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: small ? 4 : 8 }}>
        <span style={{ fontSize: 10, color: "var(--text-4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        {Icon && (
          <div style={{
            background: `${color || "var(--text-3)"}10`,
            borderRadius: 6,
            padding: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background var(--duration-normal) var(--ease-smooth)",
          }}>
            <Icon size={small ? 12 : 14} color={color || "var(--text-3)"} />
          </div>
        )}
      </div>
      <div className="mono" style={{
        fontSize: small ? 16 : 22,
        fontWeight: 700,
        color: color || "var(--text-0)",
        lineHeight: 1.1,
        transition: "color var(--duration-slow) var(--ease-smooth)",
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4, lineHeight: 1.3 }}>{sub}</div>}
    </div>
  );
});
StatBox.displayName = "StatBox";
export default StatBox;
