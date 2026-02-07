export const MIBOR_BASE = 6.75;
export const REPO_BASE = 6.50;
export const MONTE_CARLO_PATHS = 300;

export const RATE_FIELDS = [
  "mibor_overnight", "mibor_14d", "mibor_1m", "mibor_3m",
  "cblo_bid", "cblo_ask", "repo", "reverse_repo",
  "cd_1m", "cd_3m", "cd_6m", "cd_12m",
  "cp_1m", "cp_3m",
  "tbill_91d", "tbill_182d", "tbill_364d",
  "mifor_1m", "mifor_3m", "mifor_6m",
  "sofr", "usdinr_spot", "usdinr_1m_fwd",
  "ois_1y", "ois_3y", "ois_5y", "gsec_10y",
  "call_money_high", "call_money_low",
  "notice_7d", "notice_14d",
  "mmf_liquid", "mmf_overnight", "mmf_ultra_short",
];
