export default function TabNav({ tab, setTab, tabs }) {
  return (
    <nav style={{ padding: "12px 24px 0", display: "flex", gap: 4, position: "relative", zIndex: 10, borderBottom: "1px solid var(--border-1)", paddingBottom: 12 }}>
      {tabs.map((t) => (
        <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
          <t.icon size={13} /> {t.label}
        </button>
      ))}
    </nav>
  );
}
