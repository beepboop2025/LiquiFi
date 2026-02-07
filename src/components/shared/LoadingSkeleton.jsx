import { memo } from "react";

const SkeletonBox = ({ width = "100%", height = 20, style }) => (
  <div className="skeleton" style={{ width, height, ...style }} />
);

export const CardSkeleton = memo(() => (
  <div className="card" style={{ padding: 18 }}>
    <SkeletonBox height={14} width="40%" style={{ marginBottom: 12 }} />
    <SkeletonBox height={10} width="60%" style={{ marginBottom: 16 }} />
    <SkeletonBox height={160} />
  </div>
));
CardSkeleton.displayName = "CardSkeleton";

export const TabSkeleton = memo(() => (
  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 16, border: "1px solid var(--border-1)" }}>
          <SkeletonBox height={10} width="50%" style={{ marginBottom: 8 }} />
          <SkeletonBox height={24} width="70%" style={{ marginBottom: 8 }} />
          <SkeletonBox height={8} width="40%" />
        </div>
      ))}
    </div>
    <CardSkeleton />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  </div>
));
TabSkeleton.displayName = "TabSkeleton";
