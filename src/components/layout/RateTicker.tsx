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
  /** Data quality info for freshness badge */
  dataQuality?: {
    realFieldsCount: number;
    totalFields: number;
    stalenessSeconds: number;
  };
}

/** Track which rates just changed for flash animation */
function useChangedRates(rateItems: RateTickerItem[]): { changed: Set<string>; lastChangeTs: Map<string, number> } {
  const prevRef = useRef<Map<string, number>>(new Map());
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const lastChangeTsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const newChanged = new Set<string>();
    const now = Date.now();
    rateItems.forEach((r) => {
      const prev = prevRef.current.get(r.name);
      if (prev !== undefined && prev !== r.rate) {
        newChanged.add(r.name);
        lastChangeTsRef.current.set(r.name, now);
      }
      prevRef.current.set(r.name, r.rate);
    });
    if (newChanged.size > 0) {
      setChanged(newChanged);
      const timer = setTimeout(() => setChanged(new Set()), 1200);
      return () => clearTimeout(timer);
    }
  }, [rateItems]);

  return { changed, lastChangeTs: lastChangeTsRef.current };
}

/** Freshness color for individual rate based on seconds since last change */
function freshnessColor(secondsAgo: number | undefined): string | undefined {
  if (secondsAgo === undefined) return undefined;
  if (secondsAgo <= 10) return undefined; // fresh — no special color
  if (secondsAgo <= 30) return "var(--amber)"; // stale
  return "var(--red)"; // very stale
}

const RateTicker = memo<RateTickerProps>(({ rateItems, dataQuality }) => {
  const doubled = useMemo(() => [...rateItems, ...rateItems], [rateItems]);
  const { changed: changedNames, lastChangeTs } = useChangedRates(rateItems);
  const [now, setNow] = useState(Date.now());

  // Update "now" every 5s so freshness colors update
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

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
        {/* Data quality badge at start of ticker */}
        {dataQuality && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 10px 2px 6px",
            whiteSpace: "nowrap",
            borderRight: "1px solid rgba(30,48,80,0.25)",
            marginRight: 4,
          }}>
            <span style={{
              fontSize: 8,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: dataQuality.realFieldsCount >= 20 ? "var(--green)" : dataQuality.realFieldsCount >= 10 ? "var(--amber)" : "var(--red)",
            }}>
              {dataQuality.realFieldsCount}/{dataQuality.totalFields} LIVE
            </span>
            {dataQuality.stalenessSeconds > 0 && (
              <span className="mono" style={{
                fontSize: 8,
                color: dataQuality.stalenessSeconds < 10 ? "var(--green)" : dataQuality.stalenessSeconds < 30 ? "var(--amber)" : "var(--red)",
              }}>
                {dataQuality.stalenessSeconds.toFixed(0)}s
              </span>
            )}
          </div>
        )}

        {doubled.map((r, i) => {
          const isChanged = changedNames.has(r.name);
          const lastTs = lastChangeTs.get(r.name);
          const ageSeconds = lastTs ? Math.round((now - lastTs) / 1000) : undefined;
          const staleColor = freshnessColor(ageSeconds);
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
              <span style={{ color: staleColor || "var(--text-4)", fontSize: 10, fontWeight: 500, letterSpacing: "0.02em", transition: "color 1s ease" }}>{r.name}</span>
              <span className="mono" style={{
                color: staleColor || "var(--text-0)",
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
