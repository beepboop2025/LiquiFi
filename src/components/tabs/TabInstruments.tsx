import { useState } from "react";
import {
  Activity,
  Compass,
  Globe,
  Navigation,
  Scale,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import SectionTitle from "../shared/SectionTitle";
import StatBox from "../shared/StatBox";
import Tt from "../shared/Tt";
import type { RatesSnapshot } from "../../types";

interface TabInstrumentsProps {
  rates: RatesSnapshot;
}

interface CalcTabDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface RateGroupItem {
  l: string;
  v: number;
}

interface RateGroup {
  category: string;
  items: RateGroupItem[];
}

interface CdPoint {
  tenor: string;
  rate: number;
  days: number;
}

export default function TabInstruments({ rates }: TabInstrumentsProps) {
  const [calcTab, setCalcTab] = useState<string>("ois");

  const oisNotional = 100;
  const oisFixedRate = rates.ois_1y;
  const oisFloatingRate = rates.mibor_overnight;
  const oisPnL = +((oisFloatingRate - oisFixedRate) * oisNotional / 100).toFixed(3);

  const fraNotional = 50;
  const fraRate = rates.mifor_3m;
  const fraSettlement = rates.mibor_3m;
  const fraPnL = +((fraSettlement - fraRate) * fraNotional / 100 * 0.25).toFixed(3);

  const miforCalc = +(rates.sofr + ((rates.usdinr_1m_fwd - rates.usdinr_spot) / rates.usdinr_spot) * 1200).toFixed(4);
  const forwardPointsPaise = +((rates.usdinr_1m_fwd - rates.usdinr_spot) * 100).toFixed(0);

  const cdPoints: CdPoint[] = [
    { tenor: "1M", rate: rates.cd_1m, days: 30 },
    { tenor: "3M", rate: rates.cd_3m, days: 90 },
    { tenor: "6M", rate: rates.cd_6m, days: 180 },
    { tenor: "12M", rate: rates.cd_12m, days: 365 },
  ];
  const cd2m = +((rates.cd_1m + rates.cd_3m) / 2).toFixed(2);
  const cd9m = +((rates.cd_6m + rates.cd_12m) / 2).toFixed(2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card card-glow">
        <SectionTitle icon={Globe} title="Complete Rate Matrix" subtitle="All money market instrument rates — live from FBIL, CCIL, FIMMDA, NDS-OM" color="var(--cyan)" badge="LIVE" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {([
            { category: "MIBOR (FBIL)", items: [{ l: "Overnight", v: rates.mibor_overnight }, { l: "14-Day", v: rates.mibor_14d }, { l: "1-Month", v: rates.mibor_1m }, { l: "3-Month", v: rates.mibor_3m }] },
            { category: "Secured (CCIL/NDS)", items: [{ l: "CBLO Bid", v: rates.cblo_bid }, { l: "CBLO Ask", v: rates.cblo_ask }, { l: "Repo", v: rates.repo }, { l: "Reverse Repo", v: rates.reverse_repo }] },
            { category: "CD / CP (FIMMDA)", items: [{ l: "CD 1M", v: rates.cd_1m }, { l: "CD 3M", v: rates.cd_3m }, { l: "CD 6M", v: rates.cd_6m }, { l: "CP 3M", v: rates.cp_3m }] },
            { category: "T-Bills (NDS-OM)", items: [{ l: "91-Day", v: rates.tbill_91d }, { l: "182-Day", v: rates.tbill_182d }, { l: "364-Day", v: rates.tbill_364d }, { l: "G-Sec 10Y", v: rates.gsec_10y }] },
            { category: "MIFOR (Cross-Ccy)", items: [{ l: "1-Month", v: rates.mifor_1m }, { l: "3-Month", v: rates.mifor_3m }, { l: "6-Month", v: rates.mifor_6m }, { l: "Calculated", v: miforCalc }] },
            { category: "OIS (Swap)", items: [{ l: "1-Year", v: rates.ois_1y }, { l: "3-Year", v: rates.ois_3y }, { l: "5-Year", v: rates.ois_5y }, { l: "SOFR", v: rates.sofr }] },
            { category: "Call & Notice", items: [{ l: "Call High", v: rates.call_money_high }, { l: "Call Low", v: rates.call_money_low }, { l: "Notice 7D", v: rates.notice_7d }, { l: "Notice 14D", v: rates.notice_14d }] },
            { category: "MMF / FX", items: [{ l: "Liquid Fund", v: rates.mmf_liquid }, { l: "O/N Fund", v: rates.mmf_overnight }, { l: "USD/INR Spot", v: rates.usdinr_spot }, { l: "USD/INR 1M Fwd", v: rates.usdinr_1m_fwd }] },
          ] as RateGroup[]).map((group, i) => (
            <div key={i} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{group.category}</div>
              {group.items.map((item, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: j < 3 ? "1px solid var(--border-1)" : "none" }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>{item.l}</span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--cyan)" }}>{item.v.toFixed(item.l.includes("USD") ? 2 : 2)}{item.l.includes("USD") ? "" : "%"}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: -10 }}>
        {([
          { id: "ois", label: "OIS Pricing", icon: Scale },
          { id: "fra", label: "FRA Settlement", icon: Compass },
          { id: "mifor", label: "MIFOR Derivation", icon: Globe },
          { id: "cd", label: "CD Curve Interpolation", icon: Activity },
          { id: "notice", label: "Notice Money", icon: Timer },
          { id: "cross", label: "Cross-Currency", icon: Navigation },
        ] as CalcTabDef[]).map((t) => (
          <button key={t.id} className={`tab-btn ${calcTab === t.id ? "active" : ""}`} onClick={() => setCalcTab(t.id)}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {calcTab === "ois" && (
          <>
            <SectionTitle icon={Scale} title="OIS (Overnight Index Swap) Pricing" subtitle="MIBOR-linked OIS settlement calculation" color="var(--purple)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="Notional" value={`\u20B9${oisNotional}Cr`} small />
              <StatBox label="Fixed Leg" value={`${oisFixedRate.toFixed(2)}%`} sub="OIS 1Y Rate" color="var(--purple)" small />
              <StatBox label="Floating Leg" value={`${oisFloatingRate.toFixed(2)}%`} sub="MIBOR O/N Compounded" color="var(--cyan)" small />
              <StatBox label="Net Settlement" value={`\u20B9${Math.abs(oisPnL).toFixed(2)}Cr`} sub={oisPnL >= 0 ? "Receive floating" : "Pay floating"} color={oisPnL >= 0 ? "var(--green)" : "var(--red)"} small />
              <StatBox label="DV01" value="\u20B94.2L" sub="Per 1bp move in MIBOR" color="var(--amber)" small />
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 2 }}>
                <span style={{ color: "var(--text-4)" }}>Settlement Formula:</span><br />
                <span style={{ color: "var(--cyan)" }}>Net = Notional × (Floating_Compound - Fixed) × DayCount/365</span><br />
                <span style={{ color: "var(--text-4)" }}>Where Floating_Compound = Π(1 + MIBOR_i/365) - 1 over the swap tenor</span><br />
                <span style={{ color: "var(--text-4)" }}>Cleared through CCIL • Daily margin via SPAN methodology</span>
              </div>
            </div>
          </>
        )}

        {calcTab === "fra" && (
          <>
            <SectionTitle icon={Compass} title="FRA (Forward Rate Agreement) Calculator" subtitle="MIFOR-based FRA booking and settlement rate calculation" color="var(--amber)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="Notional" value={`\u20B9${fraNotional}Cr`} small />
              <StatBox label="FRA Rate" value={`${fraRate.toFixed(2)}%`} sub="MIFOR 3M" color="var(--amber)" small />
              <StatBox label="Settlement Rate" value={`${fraSettlement.toFixed(2)}%`} sub="MIBOR 3M at expiry" color="var(--cyan)" small />
              <StatBox label="Settlement Amount" value={`\u20B9${Math.abs(fraPnL).toFixed(2)}Cr`} sub={fraPnL >= 0 ? "Receive" : "Pay"} color={fraPnL >= 0 ? "var(--green)" : "var(--red)"} small />
              <StatBox label="Tenor" value="3M × 6M" sub="3-month forward, 6-month reference" color="var(--purple)" small />
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 2 }}>
                <span style={{ color: "var(--text-4)" }}>Settlement Formula:</span><br />
                <span style={{ color: "var(--cyan)" }}>PV = Notional × (Settlement_Rate - FRA_Rate) × Period / (1 + Settlement_Rate × Period)</span><br />
                <span style={{ color: "var(--text-4)" }}>Settlement Reference: FBIL MIBOR fixing at 10:45 AM IST</span>
              </div>
            </div>
          </>
        )}

        {calcTab === "mifor" && (
          <>
            <SectionTitle icon={Globe} title="MIFOR Derivation Engine" subtitle="USD/INR forward premium + SOFR = Implied INR forward rate" color="var(--teal)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="SOFR" value={`${rates.sofr.toFixed(2)}%`} sub="USD overnight rate" color="var(--blue)" small />
              <StatBox label="USD/INR Spot" value={rates.usdinr_spot.toFixed(2)} sub="RBI reference rate" color="var(--text-1)" small />
              <StatBox label="1M Forward" value={rates.usdinr_1m_fwd.toFixed(2)} sub="Forward points: +23p" color="var(--amber)" small />
              <StatBox label="Forward Premium" value={`${(((rates.usdinr_1m_fwd - rates.usdinr_spot) / rates.usdinr_spot) * 1200).toFixed(2)}%`} sub="Annualized" color="var(--purple)" small />
              <StatBox label="MIFOR 1M" value={`${miforCalc.toFixed(2)}%`} sub="Derived rate" color="var(--cyan)" small />
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 2 }}>
                <span style={{ color: "var(--text-4)" }}>MIFOR Formula:</span><br />
                <span style={{ color: "var(--cyan)" }}>MIFOR = SOFR + Forward_Premium = SOFR + ((Fwd - Spot) / Spot) × (12/Tenor_Months) × 100</span><br />
                <span style={{ color: "var(--text-4)" }}>Used for: Importer/Exporter hedge pricing, Cross-currency swap valuation</span><br />
                <span style={{ color: "var(--text-4)" }}>Published by: FBIL (Financial Benchmarks India Ltd)</span>
              </div>
            </div>
          </>
        )}

        {calcTab === "cd" && (
          <>
            <SectionTitle icon={Activity} title="CD Yield Curve Interpolation" subtitle="FIMMDA secondary market data with fallback logic for insufficient trades" color="var(--pink)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
              {cdPoints.map((pt, i) => (
                <StatBox key={i} label={`CD ${pt.tenor}`} value={`${pt.rate.toFixed(2)}%`} sub={`${pt.days} days`} color="var(--pink)" small />
              ))}
              <StatBox label="CD 2M (Interp)" value={`${cd2m}%`} sub="Linear interpolation" color="var(--amber)" small />
              <StatBox label="CD 9M (Interp)" value={`${cd9m}%`} sub="Linear interpolation" color="var(--amber)" small />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={[...cdPoints, { tenor: "2M*", rate: cd2m, days: 60 }, { tenor: "9M*", rate: cd9m, days: 270 }].sort((a, b) => a.days - b.days)}>
                <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
                <XAxis dataKey="tenor" tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1a2540" }} tickLine={false} />
                <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<Tt />} />
                <Line type="monotone" dataKey="rate" stroke="var(--pink)" strokeWidth={2} dot={{ r: 4, fill: "var(--pink)" }} name="Rate" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 8, background: "var(--bg-1)", borderRadius: 8, padding: 12 }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", lineHeight: 1.8 }}>
                Fallback Logic: If FIMMDA has &lt;3 trades for a tenor, use previous day's rate + MIBOR trend adjustment.<br />
                Interpolation: Linear between nearest observed tenors, Nelson-Siegel for full curve fitting.
              </div>
            </div>
          </>
        )}

        {calcTab === "notice" && (
          <>
            <SectionTitle icon={Timer} title="Notice Money Management" subtitle="7-day and 14-day booking with automated notice period reminders" color="var(--orange)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="7-Day Notice Rate" value={`${rates.notice_7d.toFixed(2)}%`} color="var(--orange)" small />
              <StatBox label="14-Day Notice Rate" value={`${rates.notice_14d.toFixed(2)}%`} color="var(--orange)" small />
              <StatBox label="Active 7D Positions" value="\u20B912Cr" sub="Notice due: Mar 2" color="var(--cyan)" small />
              <StatBox label="Active 14D Positions" value="\u20B90Cr" sub="None outstanding" color="var(--text-3)" small />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>7-Day Notice Lifecycle</div>
                {["Day 0: Placement at agreed rate", "Day 1-5: Accruing interest", "Day 5: Notice period reminder (2 days before)", "Day 6: Notice sent to counterparty", "Day 7: Principal + Interest settlement"].map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 11, color: i === 2 ? "var(--amber)" : "var(--text-2)" }}>
                    <span style={{ color: "var(--text-4)", minWidth: 14 }}>{i + 1}.</span> {step}
                  </div>
                ))}
              </div>
              <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Auto-Reminder Schedule</div>
                {([
                  { label: "2 days before notice", action: "Email + dashboard alert to Treasurer" },
                  { label: "1 day before notice", action: "Confirm recall or extend with counterparty" },
                  { label: "Notice day", action: "Auto-send notice via NDS-Call if pre-approved" },
                  { label: "Settlement day", action: "Verify principal + interest credited" },
                ] as { label: string; action: string }[]).map((r, i) => (
                  <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-1)" }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-1)" }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.action}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {calcTab === "cross" && (
          <>
            <SectionTitle icon={Navigation} title="Cross-Currency Module" subtitle="MIFOR-based hedging for importers/exporters • USD/INR forward + SOFR integration" color="var(--blue)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="USD/INR Spot" value={rates.usdinr_spot.toFixed(2)} color="var(--text-1)" small />
              <StatBox label="1M Forward" value={rates.usdinr_1m_fwd.toFixed(2)} sub={`${forwardPointsPaise >= 0 ? "+" : ""}${forwardPointsPaise} paise`} color="var(--amber)" small />
              <StatBox label="SOFR (USD)" value={`${rates.sofr.toFixed(2)}%`} color="var(--blue)" small />
              <StatBox label="MIFOR 1M" value={`${rates.mifor_1m.toFixed(2)}%`} color="var(--cyan)" small />
              <StatBox label="Hedge Cost" value={`${(rates.mifor_1m - rates.mibor_1m).toFixed(2)}%`} sub="MIFOR - MIBOR spread" color="var(--purple)" small />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Importer Hedge (USD Payable)</div>
                <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.8 }}>
                  Payable: $10M due in 1 month<br />
                  Forward Rate: {"\u20B9"}{rates.usdinr_1m_fwd.toFixed(2)}/$<br />
                  Locked Cost: {"\u20B9"}{(rates.usdinr_1m_fwd * 10).toFixed(1)}Cr<br />
                  vs Spot: {"\u20B9"}{(rates.usdinr_spot * 10).toFixed(1)}Cr<br />
                  <span style={{ color: "var(--amber)", fontWeight: 600 }}>Premium: {"\u20B9"}{((rates.usdinr_1m_fwd - rates.usdinr_spot) * 10).toFixed(2)}Cr</span>
                </div>
              </div>
              <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Exporter Hedge (USD Receivable)</div>
                <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.8 }}>
                  Receivable: $5M due in 3 months<br />
                  MIFOR 3M: {rates.mifor_3m.toFixed(2)}%<br />
                  FRA suggestion: Lock at {rates.mifor_3m.toFixed(2)}% for 3M<br />
                  Hedge: Sell USD forward + enter receive-MIFOR FRA<br />
                  <span style={{ color: "var(--green)", fontWeight: 600 }}>Net INR yield enhancement: ~{(rates.mifor_3m - rates.mibor_3m).toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
