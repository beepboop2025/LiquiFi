import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { AppBackendState, RatesSnapshot, ForecastPoint, HistoricalRatePoint, CashFlowPoint, MonteCarloData, DataQuality, ForecastSource, DeploymentLeg } from "./types";
import { TABS } from "./constants/tabs";
import { ALERTS_FULL } from "./constants/alerts";
import { generateCashFlowHistory, generateHistoricalRates } from "./generators/history";
import { generateHourlyForecast } from "./generators/forecast";
import { generateRates } from "./generators/rates";
import { createBackendEngine } from "./engine/backendEngine";
import { validateDeploymentPlan } from "./engine/validation";
import { createBackendState, createRealtimePayment } from "./engine/backendState";
import { createAuditEntry } from "./utils/audit";
import { sleep } from "./utils/helpers";
import { clamp, rand } from "./utils/math";
import { exportJsonFile } from "./utils/export";
import { connectWebSocket, disconnectWebSocket, fetchForecast, fetchMonteCarlo, fetchCashFlowHistory } from "./services/api";

import Header from "./components/layout/Header";
import TabNav from "./components/layout/TabNav";
import Footer from "./components/layout/Footer";

import { ErrorBoundary } from "./components/shared/ErrorBoundary";

import TabCommandCenter from "./components/tabs/TabCommandCenter";
import TabAIEngine from "./components/tabs/TabAIEngine";
import TabOptimizer from "./components/tabs/TabOptimizer";
import TabExecution from "./components/tabs/TabExecution";
import TabRisk from "./components/tabs/TabRisk";
import TabInstruments from "./components/tabs/TabInstruments";
import TabAnalytics from "./components/tabs/TabAnalytics";
import TabRegulatory from "./components/tabs/TabRegulatory";
import TabBranches from "./components/tabs/TabBranches";
import TabSettings from "./components/tabs/TabSettings";

import type { RateTickerItem } from "./components/layout/RateTicker";

const FORECAST_REFRESH_MS = 30 * 60 * 1000;
const CASHFLOW_REFRESH_MS = 60 * 60 * 1000;
const MC_REFRESH_MS = 30 * 60 * 1000;

interface DeploymentResult {
  ok: boolean;
  partial?: boolean;
  message: string;
}

export default function App() {
  const engineRef = useRef(createBackendEngine(generateRates()));

  const [tab, setTab] = useState("command");
  const [backend, setBackend] = useState<AppBackendState>(() => createBackendState());
  const [rates, setRates] = useState<RatesSnapshot>(() => engineRef.current.getSnapshot().rates);
  const [clockData, setClockData] = useState<ForecastPoint[]>(() => generateHourlyForecast());
  const [historicalRates] = useState<HistoricalRatePoint[]>(() => generateHistoricalRates());
  const [cashFlowHistory, setCashFlowHistory] = useState<CashFlowPoint[]>(() => generateCashFlowHistory());
  const [mcData, setMcData] = useState<MonteCarloData | null>(null);
  const [time, setTime] = useState(new Date());
  const [backendConnected, setBackendConnected] = useState(false);
  const [forecastSource, setForecastSource] = useState<ForecastSource>("local");
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null);
  const backendRatesRef = useRef<RatesSnapshot | null>(null);

  const syncBackendTelemetry = useCallback((opts: { skipPayments?: boolean } = {}) => {
    const snapshot = engineRef.current.getSnapshot();
    const queueDepth = snapshot.orderQueue.filter((o) => o.status === "queued" || o.status === "retry").length;
    const processedTx24h = 1248 + snapshot.metrics.processedOrders;
    const failedTx24h = 4 + snapshot.metrics.hardFailures;
    const totalTx = processedTx24h + failedTx24h;
    const successRate = totalTx > 0 ? (processedTx24h / totalTx) * 100 : 100;

    const liveOrders = snapshot.orderQueue.map((order) => ({
      id: order.id,
      time: new Date(order.updatedAt || order.createdAt || Date.now()).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }),
      instrument: order.instrument,
      side: order.side,
      amount: order.amount,
      rate: order.rate,
      counterparty: order.counterparty || "Liquidity Pool",
      platform: order.platform || "Engine",
      status: order.status,
      fillPct: order.status === "settled" ? 100 : 0,
    }));

    const auditFromEngine = snapshot.events.slice(0, 3).map((evt) => createAuditEntry({
      action: (evt.module || "ENGINE").toUpperCase().slice(0, 12),
      detail: evt.message,
      actor: "Backend Engine",
      level: evt.level === "error" ? "error" : evt.level === "warn" ? "warn" : "info",
    }));

    setRates(snapshot.rates);
    setBackend((prev) => ({
      ...prev,
      killSwitch: snapshot.killSwitch,
      circuitOpen: snapshot.metrics.circuitState === "open",
      circuitHalfOpen: snapshot.metrics.circuitState === "half_open",
      circuitOpenedAt: snapshot.metrics.circuitOpenedAt,
      queueDepth,
      throughputPerMin: Math.max(40, Math.round((snapshot.metrics.processedOrders + snapshot.metrics.retries + queueDepth) * 4)),
      processedTx24h,
      failedTx24h,
      successRate: +successRate.toFixed(2),
      apiLatencyP99: +clamp(18 + queueDepth * 1.8 + (snapshot.metrics.circuitState === "open" ? 35 : 0) + rand(-3, 3), 12, 180).toFixed(1),
      idempotencyKeys: Array.from({ length: Math.min(snapshot.processedKeys.size || 0, 12) }, (_, i) => `idem-${String(i + 1).padStart(3, "0")}`),
      orderBook: [...liveOrders, ...prev.orderBook.filter((old) => !liveOrders.some((curr) => curr.id === old.id))].slice(0, 60),
      paymentStreams: opts.skipPayments ? prev.paymentStreams : [createRealtimePayment(), ...prev.paymentStreams].slice(0, 40),
      integrations: prev.integrations.map((sys) => {
        const baseLatency = sys.latency ?? 8;
        const nextLatency = +clamp(baseLatency + rand(-2, 2) + queueDepth * 0.04, 2, 220).toFixed(1);
        const baseUptime = sys.uptime ?? 99.9;
        const nextUptime = +clamp(baseUptime - rand(0, 0.02), 99.4, 99.99).toFixed(2);
        let status = sys.status;
        if (nextLatency > 120 || nextUptime < 99.5) {
          status = "Down";
        } else if (nextLatency > 65 || snapshot.metrics.circuitState === "half_open") {
          status = "Degraded";
        } else if (snapshot.metrics.circuitState === "open" && /CCIL|NDS-Call|Bank APIs/.test(sys.system)) {
          status = "Degraded";
        } else if (sys.status !== "Healthy") {
          status = "Connected";
        }
        return { ...sys, status, latency: nextLatency, uptime: nextUptime };
      }),
      auditTrail: [...auditFromEngine, ...prev.auditTrail].slice(0, 80),
      dataQuality: dataQuality ?? undefined,
      forecastSource: forecastSource,
    }));
  }, [dataQuality, forecastSource]);

  const syncRef = useRef(syncBackendTelemetry);
  syncRef.current = syncBackendTelemetry;

  useEffect(() => {
    engineRef.current.hydrate();
    syncRef.current({ skipPayments: true });

    connectWebSocket({
      onRates: (data) => {
        if (data.rates) backendRatesRef.current = data.rates;
      },
      onConnectionChange: (connected) => setBackendConnected(connected),
      onDataQuality: (dq) => setDataQuality(dq),
    });

    fetchForecast().then((data) => {
      if (data) {
        setClockData(data);
        setForecastSource("backend");
      }
    }).catch((err) => console.warn("[App] Forecast fetch failed:", err));
    fetchCashFlowHistory().then((data) => { if (data) setCashFlowHistory(data); }).catch((err) => console.warn("[App] Cash flow fetch failed:", err));
    fetchMonteCarlo().then((data) => { if (data) setMcData(data); }).catch((err) => console.warn("[App] Monte Carlo fetch failed:", err));

    const tickInterval = setInterval(() => {
      if (backendRatesRef.current) {
        engineRef.current.tick(backendRatesRef.current);
      } else {
        engineRef.current.tick();
      }
      engineRef.current.processQueue();
      syncRef.current();
      setTime(new Date());
    }, 3000);

    const forecastInterval = setInterval(() => {
      fetchForecast().then((data) => {
        if (data) {
          setClockData(data);
          setForecastSource("backend");
          console.info("[Refresh] Forecast updated from backend");
        }
      });
    }, FORECAST_REFRESH_MS);

    const cashflowInterval = setInterval(() => {
      fetchCashFlowHistory().then((data) => {
        if (data) {
          setCashFlowHistory(data);
          console.info("[Refresh] Cash flow history updated");
        }
      });
    }, CASHFLOW_REFRESH_MS);

    const mcInterval = setInterval(() => {
      fetchMonteCarlo().then((data) => {
        if (data) {
          setMcData(data);
          console.info("[Refresh] Monte Carlo simulation updated");
        }
      });
    }, MC_REFRESH_MS);

    return () => {
      clearInterval(tickInterval);
      clearInterval(forecastInterval);
      clearInterval(cashflowInterval);
      clearInterval(mcInterval);
      disconnectWebSocket();
    };
  }, []);

  const handleExecuteDeployment = useCallback(async ({ plan, surplus }: { plan: DeploymentLeg[]; surplus: number }): Promise<DeploymentResult> => {
    try {
      const preCheck = validateDeploymentPlan(plan, surplus, backend.killSwitch);
      if (!preCheck.valid) {
        return { ok: false, message: preCheck.errors[0] || "Pre-trade validation failed." };
      }
      if (engineRef.current.getSnapshot().metrics.circuitState === "open") {
        return { ok: false, message: "Execution circuit is open. Reset circuit breaker from Settings." };
      }

      await sleep(250);

      let accepted = 0;
      let rejected = 0;
      let firstError = "";
      const requestSignature = plan
        .flatMap((leg) => leg.splits.map((split) => `${leg.instrument}:${split.cp}:${split.amt}:${Number(leg.rate).toFixed(4)}`))
        .sort()
        .join("|");

      plan.forEach((leg, legIndex) => {
        leg.splits.forEach((split, splitIndex) => {
          const idempotencyKey = `${requestSignature}:${legIndex}:${splitIndex}`.replace(/\s+/g, "-").toLowerCase();
          const response = engineRef.current.submitOrder({
            instrument: leg.instrument,
            side: "LEND",
            amount: split.amt,
            rate: leg.rate,
            counterparty: split.cp,
            platform: "CCIL",
          }, { idempotencyKey });
          if (response.ok) {
            accepted += 1;
          } else {
            rejected += 1;
            if (!firstError) firstError = response.error || "Unknown error";
          }
        });
      });

      for (let i = 0; i < 3; i += 1) {
        engineRef.current.processQueue();
        await sleep(120);
      }
      syncBackendTelemetry();

      if (accepted === 0) {
        return { ok: false, message: firstError || "No child orders accepted by backend." };
      }
      if (rejected > 0) {
        return { ok: true, partial: true, message: `${accepted} child orders queued, ${rejected} rejected (${firstError}).` };
      }
      return { ok: true, message: `Deployment accepted with ${accepted} child orders and replay protection enabled.` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Deployment Error]", err);
      return { ok: false, message: `Deployment failed: ${message}` };
    }
  }, [backend.killSwitch, syncBackendTelemetry]);

  const handleExportOrderBook = useCallback(() => {
    const safeTs = new Date().toISOString().replace(/[:.]/g, "-");
    exportJsonFile(`liquifi-order-book-${safeTs}.json`, backend.orderBook);
  }, [backend.orderBook]);

  const handleRefreshTelemetry = useCallback(() => {
    engineRef.current.tick();
    engineRef.current.processQueue();
    syncBackendTelemetry();
  }, [syncBackendTelemetry]);

  const handleExportAuditTrail = useCallback(() => {
    const safeTs = new Date().toISOString().replace(/[:.]/g, "-");
    exportJsonFile(`liquifi-audit-trail-${safeTs}.json`, backend.auditTrail);
  }, [backend.auditTrail]);

  const handleToggleKillSwitch = useCallback(() => {
    engineRef.current.setKillSwitch(!backend.killSwitch);
    syncBackendTelemetry({ skipPayments: true });
  }, [backend.killSwitch, syncBackendTelemetry]);

  const handleToggleFailover = useCallback(() => {
    setBackend((prev) => {
      const nextMode = prev.failoverMode === "auto" ? "manual" : "auto";
      return {
        ...prev,
        failoverMode: nextMode,
        auditTrail: [
          createAuditEntry({
            action: "FAILOVER",
            detail: `Failover mode switched to ${nextMode.toUpperCase()}.`,
            actor: "Ops Console",
            level: "warn",
          }),
          ...prev.auditTrail,
        ].slice(0, 80),
      };
    });
  }, []);

  const handleResetCircuit = useCallback(() => {
    engineRef.current.forceRecover();
    syncBackendTelemetry({ skipPayments: true });
  }, [syncBackendTelemetry]);

  const alertCount = useMemo(() => {
    const dynamic = backend.auditTrail.filter((log) => log.level === "warn" || log.level === "error").length;
    return Math.min(99, ALERTS_FULL.length + dynamic);
  }, [backend.auditTrail]);

  const prevRatesRef = useRef<RatesSnapshot>(rates);
  const rateItems = useMemo<RateTickerItem[]>(() => {
    const prev = prevRatesRef.current || rates;
    return [
      { name: "MIBOR O/N", rate: rates.mibor_overnight, ch: +((rates.mibor_overnight - prev.mibor_overnight) * 100).toFixed(1) },
      { name: "MIBOR 14D", rate: rates.mibor_14d, ch: +((rates.mibor_14d - prev.mibor_14d) * 100).toFixed(1) },
      { name: "MIBOR 1M", rate: rates.mibor_1m, ch: +((rates.mibor_1m - prev.mibor_1m) * 100).toFixed(1) },
      { name: "MIBOR 3M", rate: rates.mibor_3m, ch: +((rates.mibor_3m - prev.mibor_3m) * 100).toFixed(1) },
      { name: "CBLO Bid", rate: rates.cblo_bid, ch: +((rates.cblo_bid - prev.cblo_bid) * 100).toFixed(1) },
      { name: "CBLO Ask", rate: rates.cblo_ask, ch: +((rates.cblo_ask - prev.cblo_ask) * 100).toFixed(1) },
      { name: "Repo", rate: rates.repo, ch: +((rates.repo - prev.repo) * 100).toFixed(1) },
      { name: "CD 3M", rate: rates.cd_3m, ch: +((rates.cd_3m - prev.cd_3m) * 100).toFixed(1) },
      { name: "T-Bill 91D", rate: rates.tbill_91d, ch: +((rates.tbill_91d - prev.tbill_91d) * 100).toFixed(1) },
      { name: "MIFOR 1M", rate: rates.mifor_1m, ch: +((rates.mifor_1m - prev.mifor_1m) * 100).toFixed(1) },
      { name: "OIS 1Y", rate: rates.ois_1y, ch: +((rates.ois_1y - prev.ois_1y) * 100).toFixed(1) },
      { name: "G-Sec 10Y", rate: rates.gsec_10y, ch: +((rates.gsec_10y - prev.gsec_10y) * 100).toFixed(1) },
      { name: "USD/INR", rate: rates.usdinr_spot, ch: +((rates.usdinr_spot - prev.usdinr_spot) * 100).toFixed(1), isFx: true },
      { name: "SOFR", rate: rates.sofr, ch: +((rates.sofr - prev.sofr) * 100).toFixed(1) },
      { name: "MMF Liquid", rate: rates.mmf_liquid, ch: +((rates.mmf_liquid - prev.mmf_liquid) * 100).toFixed(1) },
    ];
  }, [rates]);
  useLayoutEffect(() => { prevRatesRef.current = rates; }, [rates]);

  const renderTab = () => {
    if (tab === "command") {
      return <TabCommandCenter rates={rates} clockData={clockData} historicalRates={historicalRates} cashFlowHistory={cashFlowHistory} paymentStreams={backend.paymentStreams} />;
    }
    if (tab === "ai") {
      return <TabAIEngine clockData={clockData} cashFlowHistory={cashFlowHistory} mcData={mcData} />;
    }
    if (tab === "optimizer") {
      return <TabOptimizer rates={rates} />;
    }
    if (tab === "execution") {
      return (
        <TabExecution
          rates={rates}
          backend={backend}
          onExecuteDeployment={handleExecuteDeployment}
          onExportOrderBook={handleExportOrderBook}
          onRefreshTelemetry={handleRefreshTelemetry}
        />
      );
    }
    if (tab === "risk") {
      return <TabRisk backend={backend} onExportAuditTrail={handleExportAuditTrail} />;
    }
    if (tab === "instruments") {
      return <TabInstruments rates={rates} />;
    }
    if (tab === "analytics") {
      return <TabAnalytics />;
    }
    if (tab === "regulatory") {
      return <TabRegulatory />;
    }
    if (tab === "branches") {
      return <TabBranches />;
    }
    return (
      <TabSettings
        backend={backend}
        onToggleKillSwitch={handleToggleKillSwitch}
        onToggleFailover={handleToggleFailover}
        onResetCircuit={handleResetCircuit}
      />
    );
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, var(--bg-0) 0%, #080d1a 50%, var(--bg-0) 100%)",
      position: "relative",
    }}>
      <div className="grid-overlay" />

      <Header backend={backend} time={time} alertCount={alertCount} rateItems={rateItems} backendConnected={backendConnected} />
      <TabNav tab={tab} setTab={setTab} tabs={TABS} />

      <main style={{ padding: "18px 24px 40px", position: "relative", zIndex: 10 }}>
        <ErrorBoundary label="Tab render failed">
          <div key={tab} className="tab-content-enter">
            {renderTab()}
          </div>
        </ErrorBoundary>
      </main>

      <Footer backend={backend} />
    </div>
  );
}
