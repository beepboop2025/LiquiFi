import { useCallback, useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Globe,
  MapPin,
  TrendingUp,
} from "lucide-react";

import { DEMO_BRANCHES, DEMO_REGIONAL_SUMMARY, REGIONS } from "../../constants/branches.js";
import { fetchBranches, fetchBranchDetail, fetchBranchesSummary } from "../../services/api.js";
import SectionTitle from "../shared/SectionTitle.jsx";
import StatBox from "../shared/StatBox.jsx";

export default function TabBranches() {
  const [branches, setBranches] = useState(DEMO_BRANCHES);
  const [regionSummary, setRegionSummary] = useState(DEMO_REGIONAL_SUMMARY);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [branchHistory, setBranchHistory] = useState([]);
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    fetchBranches().then((d) => { if (d) setBranches(d); });
    fetchBranchesSummary().then((d) => {
      if (d) {
        setRegionSummary(d.regions || DEMO_REGIONAL_SUMMARY);
        setTotals(d.totals || null);
      }
    });
  }, []);

  const handleSelectBranch = useCallback(async (code) => {
    if (selectedBranch === code) {
      setSelectedBranch(null);
      setBranchHistory([]);
      return;
    }
    setSelectedBranch(code);
    const detail = await fetchBranchDetail(code);
    if (detail) setBranchHistory(detail);
  }, [selectedBranch]);

  // Compute totals from branches if not from backend
  const bankTotals = totals || {
    branch_count: branches.length,
    cash: branches.reduce((s, b) => s + (b.position?.cash || 0), 0),
    deployed: branches.reduce((s, b) => s + (b.position?.deployed || 0), 0),
    deposits: branches.reduce((s, b) => s + (b.position?.deposits || 0), 0),
    advances: branches.reduce((s, b) => s + (b.position?.advances || 0), 0),
    pnl: branches.reduce((s, b) => s + (b.position?.pnl || 0), 0),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Section 1: Consolidated Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <StatBox label="Active Branches" value={bankTotals.branch_count || bankTotals.branchCount || branches.length} sub="Across 4 regions" color="var(--cyan)" icon={Building2} />
        <StatBox label="Bank-wide Cash" value={`₹${Math.round(bankTotals.cash).toLocaleString()} Cr`} sub="Consolidated position" color="var(--green)" icon={TrendingUp} />
        <StatBox label="Total Deployed" value={`₹${Math.round(bankTotals.deployed).toLocaleString()} Cr`} sub="Capital deployment" color="var(--blue)" icon={TrendingUp} />
        <StatBox label="Total Deposits" value={`₹${Math.round(bankTotals.deposits).toLocaleString()} Cr`} sub="CASA + Term deposits" color="var(--purple)" icon={Globe} />
        <StatBox label="Total Advances" value={`₹${Math.round(bankTotals.advances).toLocaleString()} Cr`} sub="Loans & advances" color="var(--amber)" icon={TrendingUp} />
      </div>

      {/* Section 2: Regional + Branch Table */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 18 }}>
        {/* Regional Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionTitle icon={Globe} title="Regional Summary" subtitle="Aggregated by geography" color="var(--cyan)" />
          {Object.entries(regionSummary).map(([region, data]) => (
            <div key={region} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14, borderLeft: `3px solid ${REGIONS[region]?.color || "var(--text-3)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: REGIONS[region]?.color || "var(--text-1)" }}>{region}</span>
                <span className="badge mono" style={{ background: "var(--bg-2)", color: "var(--text-2)" }}>
                  {data.branchCount || data.branch_count} {(data.branchCount || data.branch_count) === 1 ? "branch" : "branches"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: "var(--text-4)" }}>Cash</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>₹{Math.round(data.cash)} Cr</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--text-4)" }}>Deployed</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>₹{Math.round(data.deployed).toLocaleString()} Cr</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--text-4)" }}>P&L</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: data.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                    {data.pnl >= 0 ? "+" : ""}₹{data.pnl?.toFixed(1)} Cr
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Branch Table */}
        <div className="card">
          <SectionTitle icon={Building2} title="Branch Comparison" subtitle="Click a row to drill down into 30-day history" color="var(--blue)" badge={`${branches.length} branches`} />
          <div style={{ display: "grid", gridTemplateColumns: "0.3fr 0.6fr 1.5fr 0.6fr 0.6fr 0.8fr 0.8fr 0.8fr 0.8fr 0.6fr", padding: "8px 0", borderBottom: "2px solid var(--border-2)", gap: 4 }}>
            {["", "Code", "Name", "City", "Region", "Cash (Cr)", "Deployed (Cr)", "Deposits (Cr)", "Advances (Cr)", "P&L (Cr)"].map((h) => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>
          <div className="scrollbar-thin" style={{ maxHeight: 400, overflowY: "auto" }}>
            {branches.map((b) => {
              const pos = b.position || {};
              const isSelected = selectedBranch === b.code;
              return (
                <div key={b.code}>
                  <div
                    onClick={() => handleSelectBranch(b.code)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "0.3fr 0.6fr 1.5fr 0.6fr 0.6fr 0.8fr 0.8fr 0.8fr 0.8fr 0.6fr",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border-1)",
                      cursor: "pointer",
                      background: isSelected ? "var(--bg-3)" : "transparent",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    <span>{isSelected ? <ChevronDown size={12} color="var(--cyan)" /> : <ChevronRight size={12} color="var(--text-4)" />}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--cyan)" }}>{b.code}</span>
                    <span style={{ fontSize: 11, color: "var(--text-1)" }}>{b.name}</span>
                    <span style={{ fontSize: 10, color: "var(--text-3)" }}>{b.city}</span>
                    <span className="badge mono" style={{ background: `${REGIONS[b.region]?.color || "var(--text-3)"}18`, color: REGIONS[b.region]?.color || "var(--text-3)", justifySelf: "start" }}>{b.region}</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>{Math.round(pos.cash || 0).toLocaleString()}</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>{Math.round(pos.deployed || 0).toLocaleString()}</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>{Math.round(pos.deposits || 0).toLocaleString()}</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>{Math.round(pos.advances || 0).toLocaleString()}</span>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: (pos.pnl || 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                      {(pos.pnl || 0) >= 0 ? "+" : ""}{(pos.pnl || 0).toFixed(1)}
                    </span>
                  </div>

                  {/* Drill-down panel */}
                  {isSelected && (
                    <div className="anim-in" style={{ background: "var(--bg-1)", borderRadius: 8, padding: 16, margin: "8px 0 12px", borderLeft: "3px solid var(--cyan)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{b.name}</div>
                          <div style={{ fontSize: 10, color: "var(--text-3)" }}><MapPin size={10} /> {b.city}, {b.region} Region</div>
                        </div>
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 9, color: "var(--text-4)" }}>CRR Position</div>
                            <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--green)" }}>₹{Math.round(pos.crr || 0).toLocaleString()} Cr</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 9, color: "var(--text-4)" }}>SLR Position</div>
                            <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--amber)" }}>₹{Math.round(pos.slr || 0).toLocaleString()} Cr</div>
                          </div>
                        </div>
                      </div>
                      {branchHistory.length > 0 ? (
                        <ResponsiveContainer width="100%" height={180}>
                          <AreaChart data={branchHistory}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-1)" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--text-4)" }} interval={4} tickFormatter={(v) => v?.split("-").slice(1).join("/")} />
                            <YAxis tick={{ fontSize: 9, fill: "var(--text-4)" }} />
                            <Tooltip contentStyle={{ background: "var(--bg-1)", border: "1px solid var(--border-2)", fontSize: 11 }} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Area type="monotone" dataKey="cash" stroke="var(--cyan)" fill="var(--cyan)" fillOpacity={0.1} name="Cash" />
                            <Area type="monotone" dataKey="deployed" stroke="var(--blue)" fill="var(--blue)" fillOpacity={0.1} name="Deployed" />
                            <Area type="monotone" dataKey="pnl" stroke="var(--green)" fill="var(--green)" fillOpacity={0.1} name="P&L" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ textAlign: "center", padding: 30, color: "var(--text-4)", fontSize: 11 }}>Loading history...</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
