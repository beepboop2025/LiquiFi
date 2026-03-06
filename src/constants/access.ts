import type { AccessRole } from "../types";

export const ACCESS_ROLES: AccessRole[] = [
  { role: "Treasurer", users: ["Rajesh Sharma", "Priya Patel"], permissions: ["Full Access", "Trade Execution", "Risk Override"], level: "Admin", twoFA: true },
  { role: "CFO", users: ["Amit Verma"], permissions: ["Dashboard View", "Approve >₹100Cr", "Risk Reports"], level: "Executive", twoFA: true },
  { role: "Trader", users: ["Vikram Singh", "Neha Gupta", "Arjun Mehta"], permissions: ["Trade Execution", "Order Management", "Rate Monitor"], level: "Operator", twoFA: true },
  { role: "Auditor", users: ["Sanjay Kumar"], permissions: ["Read-Only", "Audit Trail", "Compliance Reports", "Export Data"], level: "Observer", twoFA: true },
  { role: "Risk Manager", users: ["Deepa Iyer"], permissions: ["Risk Dashboard", "Stress Testing", "Limit Management", "Alert Config"], level: "Manager", twoFA: true },
];
