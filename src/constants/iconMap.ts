import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, TrendingUp, Shield, Activity, CheckCircle,
  FileText, Radio, Flame, Users, Landmark, CreditCard, Building
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  AlertTriangle,
  TrendingUp,
  Shield,
  Activity,
  CheckCircle,
  FileText,
  Radio,
  Flame,
  Users,
  Landmark,
  CreditCard,
  Building,
};

export const resolveIcon = (key: string): LucideIcon | null => ICON_MAP[key] || null;
