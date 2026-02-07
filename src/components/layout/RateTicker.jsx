import { memo, useMemo } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

const RateTicker = memo(({ rateItems }) => {
  const doubled = useMemo(() => [...rateItems, ...rateItems], [rateItems]);
  return (
    <div className="rate-ticker-wrap" style={{ borderTop: "1px solid var(--border-1)", padding: "7px 0" }} aria-label="Market rate ticker" role="marquee">
      <div className="rate-ticker-inner">
        {doubled.map((r, i) => (
          <div key={`${r.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            <span style={{ color: "var(--text-4)", fontSize: 10, fontWeight: 500 }}>{r.name}</span>
            <span className="mono" style={{ color: "var(--text-0)", fontSize: 12, fontWeight: 600 }}>{r.rate.toFixed(2)}{r.isFx ? "" : "%"}</span>
            <span className="mono" style={{ fontSize: 9, color: r.ch >= 0 ? "var(--green)" : "var(--red)", display: "flex", alignItems: "center" }}>
              {r.ch >= 0 ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
              {Math.abs(r.ch).toFixed(1)}{r.isFx ? "p" : "bp"}
            </span>
            <span style={{ color: "var(--border-2)", fontSize: 10 }}>{"\u2502"}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
RateTicker.displayName = "RateTicker";
export default RateTicker;
