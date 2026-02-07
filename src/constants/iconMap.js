import {
  AlertTriangle, TrendingUp, Shield, Activity, CheckCircle,
  FileText, Radio, Flame, Users, Landmark, CreditCard, Building
} from "lucide-react";

/**
 * Map of string icon keys to lucide-react components.
 * Used by constants that store icon references as strings
 * to avoid coupling data files to React imports.
 */
export const ICON_MAP = {
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

/**
 * Resolve an icon key string to a React component.
 * @param {string} key - Icon name from ICON_MAP
 * @returns {import('lucide-react').LucideIcon|null}
 */
export const resolveIcon = (key) => ICON_MAP[key] || null;
