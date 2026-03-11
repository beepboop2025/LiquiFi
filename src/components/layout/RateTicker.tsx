import { memo, useMemo, useRef, useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export interface RateTickerItem {
  name: string;
  rate: number;
  ch: number;
  isFx?: boolean;
}

interface RateTickerProps {
  rateItems: RateTickerItem[];
}

/** Track which rates just changed for flash animation */
function useChangedRates(rateItems: RateTickerItem[]): Set<string> {
  const prevRef = useRef<Map<string, number>>(new Map());
  const [changed, setChanged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newChanged = new Set<string>();
    rateItems.forEach((r) => {
      const prev = prevRef.current.get(r.name);
      if (prev !== undefined && prev !== r.rate) {
        newChanged.add(r.name);
      }
      prevRef.current.set(r.name, r.rate);
    });
    if (newChanged.size > 0) {
      setChanged(newChanged);
      const timer = setTimeout(() => setChanged(new Set()), 1200);
      return () => clearTimeout(timer);
    }
  }, [rateItems]);

  return changed;
}

const RateTicker = memo<RateTickerProps>(({ rateItems }) => {
  const doubled = useMemo(() => [...rateItems, ...rateItems], [rateItems]);
  const changedNames = useChangedRates(rateItems);

  return (
    <div
      className="rate-ticker-wrap"
      style={{
        borderTop: "1px solid rgba(30, 48, 80, 0.25)",
        padding: "8px 0",
        background: "linear-gradient(180deg, rgba(10, 15, 30, 0.3), rgba(10, 15, 30, 0.15))",
      }}
      aria-label="Market rate ticker"
      role="marquee"
    >
      <div className="rate-ticker-inner">
        {doubled.map((r, i) => {
          const isChanged = changedNames.has(r.name);
          return (
            <div
              key={`${r.name}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                whiteSpace: "nowrap",
                padding: "2px 6px",
                borderRadius: 4,
                background: isChanged ? "rgba(6, 214, 224, 0.05)" : "transparent",
                transition: "background 0.8s ease",
              }}
            >
              <span style={{ color: "var(--text-4)", fontSize: 10, fontWeight: 500, letterSpacing: "0.02em" }}>{r.name}</span>
              <span className="mono" style={{
                color: "var(--text-0)",
                fontSize: 12,
                fontWeight: 600,
                transition: "color 0.6s ease",
              }}>
                {(r.rate ?? 0).toFixed(2)}{r.isFx ? "" : "%"}
              </span>
              <span className="mono" style={{
                fontSize: 9,
                color: (r.ch ?? 0) >= 0 ? "var(--green)" : "var(--red)",
                display: "flex",
                alignItems: "center",
                gap: 1,
                transition: "color 0.6s ease",
                fontWeight: 500,
              }}>
                {(r.ch ?? 0) >= 0 ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
                {Math.abs(r.ch ?? 0).toFixed(1)}{r.isFx ? "p" : "bp"}
              </span>
              <span style={{ color: "rgba(46, 64, 112, 0.3)", fontSize: 10, userSelect: "none" }}>{"\u2502"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
RateTicker.displayName = "RateTicker";
export default RateTicker;
