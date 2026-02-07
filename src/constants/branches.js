/**
 * Branch constants — demo branches and regional groupings.
 * Used as fallback data when backend is not available.
 */

// ---------------------------------------------------------------------------
// Demo Branches with latest positions
// ---------------------------------------------------------------------------
export const DEMO_BRANCHES = [
  {
    code: "HO-MUM",
    name: "Head Office Mumbai",
    region: "West",
    city: "Mumbai",
    position: { cash: 912, deployed: 15960, deposits: 23560, advances: 18240, crr: 855, slr: 5130, pnl: 12.4 },
  },
  {
    code: "BR-DEL",
    name: "Delhi Main Branch",
    region: "North",
    city: "Delhi",
    position: { cash: 336, deployed: 5880, deposits: 8680, advances: 6720, crr: 315, slr: 1890, pnl: 5.8 },
  },
  {
    code: "BR-BLR",
    name: "Bangalore Tech Park",
    region: "South",
    city: "Bangalore",
    position: { cash: 288, deployed: 5040, deposits: 7440, advances: 5760, crr: 270, slr: 1620, pnl: 8.2 },
  },
  {
    code: "BR-CHN",
    name: "Chennai Central",
    region: "South",
    city: "Chennai",
    position: { cash: 216, deployed: 3780, deposits: 5580, advances: 4320, crr: 202.5, slr: 1215, pnl: 3.1 },
  },
  {
    code: "BR-KOL",
    name: "Kolkata Park Street",
    region: "East",
    city: "Kolkata",
    position: { cash: 192, deployed: 3360, deposits: 4960, advances: 3840, crr: 180, slr: 1080, pnl: -1.2 },
  },
  {
    code: "BR-JAI",
    name: "Jaipur Malviya Nagar",
    region: "North",
    city: "Jaipur",
    position: { cash: 144, deployed: 2520, deposits: 3720, advances: 2880, crr: 135, slr: 810, pnl: 2.5 },
  },
  {
    code: "BR-HYD",
    name: "Hyderabad HITEC City",
    region: "South",
    city: "Hyderabad",
    position: { cash: 168, deployed: 2940, deposits: 4340, advances: 3360, crr: 157.5, slr: 945, pnl: 4.7 },
  },
  {
    code: "BR-AMD",
    name: "Ahmedabad SG Highway",
    region: "West",
    city: "Ahmedabad",
    position: { cash: 144, deployed: 2520, deposits: 3720, advances: 2880, crr: 135, slr: 810, pnl: 1.9 },
  },
];

// ---------------------------------------------------------------------------
// Regional Groupings
// ---------------------------------------------------------------------------
export const REGIONS = {
  North: { branches: ["BR-DEL", "BR-JAI"], color: "var(--blue)" },
  South: { branches: ["BR-BLR", "BR-CHN", "BR-HYD"], color: "var(--green)" },
  East: { branches: ["BR-KOL"], color: "var(--amber)" },
  West: { branches: ["HO-MUM", "BR-AMD"], color: "var(--purple)" },
};

// ---------------------------------------------------------------------------
// Regional Summary (pre-computed from branch data)
// ---------------------------------------------------------------------------
export const DEMO_REGIONAL_SUMMARY = {
  North: { branchCount: 2, cash: 480, deployed: 8400, deposits: 12400, pnl: 8.3 },
  South: { branchCount: 3, cash: 672, deployed: 11760, deposits: 17360, pnl: 16.0 },
  East:  { branchCount: 1, cash: 192, deployed: 3360, deposits: 4960, pnl: -1.2 },
  West:  { branchCount: 2, cash: 1056, deployed: 18480, deposits: 27280, pnl: 14.3 },
};
