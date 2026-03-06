import { Eye, Brain, Sliders, Zap, Shield, Scale, BarChart3, Settings, Landmark, GitBranch } from "lucide-react";
import type { TabConfig } from "../types";

export const TABS: TabConfig[] = [
  { id: "command", label: "Command Center", icon: Eye },
  { id: "ai", label: "AI Engine", icon: Brain },
  { id: "optimizer", label: "Optimizer", icon: Sliders },
  { id: "execution", label: "Execution", icon: Zap },
  { id: "risk", label: "Risk & Compliance", icon: Shield },
  { id: "instruments", label: "Instruments", icon: Scale },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "regulatory", label: "Regulatory", icon: Landmark },
  { id: "branches", label: "Branches", icon: GitBranch },
  { id: "settings", label: "Settings", icon: Settings },
];
