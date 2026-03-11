import { useRef, useEffect, useState, useCallback } from "react";
import type { TabConfig } from "../../types";

interface TabNavProps {
  tab: string;
  setTab: (id: string) => void;
  tabs: TabConfig[];
}

export default function TabNav({ tab, setTab, tabs }: TabNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  const updateIndicator = useCallback(() => {
    if (!navRef.current) return;
    const activeBtn = navRef.current.querySelector<HTMLButtonElement>(".tab-btn.active");
    if (activeBtn) {
      const navRect = navRef.current.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setIndicator({
        left: btnRect.left - navRect.left + navRef.current.scrollLeft,
        width: btnRect.width,
        ready: true,
      });
    }
  }, []);

  useEffect(() => {
    // Small delay to allow DOM layout to settle
    const raf = requestAnimationFrame(updateIndicator);
    return () => cancelAnimationFrame(raf);
  }, [tab, updateIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  return (
    <nav ref={navRef} className="tab-nav-container" style={{ position: "relative" }}>
      {/* Animated sliding indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: indicator.left,
          width: indicator.width,
          height: 2,
          background: "linear-gradient(90deg, var(--cyan), var(--blue))",
          borderRadius: "2px 2px 0 0",
          transition: indicator.ready
            ? "left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)"
            : "none",
          boxShadow: "0 0 12px rgba(6, 214, 224, 0.35), 0 0 4px rgba(6, 214, 224, 0.2)",
          zIndex: 2,
          opacity: indicator.ready ? 1 : 0,
        }}
      />

      {/* Indicator glow backdrop */}
      <div
        style={{
          position: "absolute",
          bottom: -1,
          left: indicator.left - 6,
          width: indicator.width + 12,
          height: 6,
          background: "radial-gradient(ellipse at center, rgba(6, 214, 224, 0.15) 0%, transparent 70%)",
          transition: indicator.ready
            ? "left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)"
            : "none",
          zIndex: 1,
          opacity: indicator.ready ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tab-btn ${tab === t.id ? "active" : ""}`}
          onClick={() => setTab(t.id)}
        >
          <t.icon size={13} /> {t.label}
        </button>
      ))}
    </nav>
  );
}
