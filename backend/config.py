"""Configuration constants for the LiquiFi backend."""

import logging
import os
import sys

logger = logging.getLogger("liquifi.config")

# --- Server ---
HOST = os.getenv("LIQUIFI_HOST", "0.0.0.0")
PORT = int(os.getenv("LIQUIFI_PORT", "8000"))

# CORS — configurable via env; defaults to localhost for development only
_cors_env = os.getenv("LIQUIFI_CORS_ORIGINS", "")
if _cors_env:
    CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()]
elif os.getenv("LIQUIFI_ENV", "development") == "production":
    CORS_ORIGINS: list[str] = []
    logger.warning("LIQUIFI_CORS_ORIGINS not set in production — CORS will reject all cross-origin requests.")
else:
    CORS_ORIGINS = ["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173"]

# API Key — NO hardcoded default. Must be set via env in production.
RETRAIN_API_KEY = os.getenv("LIQUIFI_RETRAIN_KEY", "")
REQUIRE_HTTPS = os.getenv("LIQUIFI_REQUIRE_HTTPS", "false").lower() == "true"

if not RETRAIN_API_KEY:
    if os.getenv("LIQUIFI_ENV", "development") == "production":
        logger.critical("LIQUIFI_RETRAIN_KEY is required in production. Exiting.")
        sys.exit(1)
    else:
        RETRAIN_API_KEY = "liquifi-retrain-dev"
        logger.warning(
            "LIQUIFI_RETRAIN_KEY not set — using development default. "
            "Set LIQUIFI_RETRAIN_KEY env var for production."
        )

# Rate limit for retrain endpoint (requests per minute)
RETRAIN_RATE_LIMIT_PER_MIN = int(os.getenv("LIQUIFI_RETRAIN_RATE_LIMIT", "2"))

# --- Scraping ---
SCRAPE_INTERVAL_S = 30          # seconds between RBI/CCIL scrapes
RATE_PUSH_INTERVAL_S = 3        # seconds between WebSocket pushes
CACHE_TTL_S = 300               # file-cache TTL (5 minutes)
CACHE_DIR = os.path.join(os.path.dirname(__file__), "data", "_cache")
LIVE_SNAPSHOT_PATH = os.path.join(os.path.dirname(__file__), "seed_data", "live_snapshots.csv")
TRAINING_DATA_PATH = os.path.join(os.path.dirname(__file__), "seed_data", "training_rates.csv")
LIVE_DATA_MIN_GAP_S = 15        # minimum gap between appended live rows
AUTO_RETRAIN_INTERVAL_S = 3600  # default auto-retrain interval for intensive runner

# --- Rate base values (used when scraping fails) ---
BASE_RATES = {
    "repo": 6.50,
    "reverse_repo": 3.35,
    "tbill_91d": 6.85,
    "tbill_182d": 6.95,
    "tbill_364d": 7.05,
    "usdinr_spot": 83.25,
    "gsec_10y": 7.15,
    "call_money_high": 6.90,
    "call_money_low": 6.50,
    "mibor_overnight": 6.75,
    "cblo_bid": 6.55,
    "cblo_ask": 6.62,
    "sofr": 5.33,
}

# --- Derived-rate formulas (offsets in percentage points) ---
DERIVED_OFFSETS = {
    "usdinr_1m_fwd_points": 0.23,          # forward points added to spot
    "mifor_3m_premium": 0.20,              # bps over mifor_1m
    "mifor_6m_premium": 0.35,
    "mmf_liquid_spread": 0.55,             # over repo
}

# --- Simulated-rate anchoring ---
# Each entry: (anchor_field, offset_bps/100, drift_bps/100)
SIMULATED_FIELDS = {
    "mibor_14d":       ("mibor_overnight", 0.15, 0.05),
    "mibor_1m":        ("mibor_overnight", 0.25, 0.04),
    "mibor_3m":        ("mibor_overnight", 0.45, 0.03),
    "cd_1m":           ("repo", 0.45, 0.04),
    "cd_3m":           ("repo", 0.60, 0.03),
    "cd_6m":           ("repo", 0.75, 0.02),
    "cd_12m":          ("repo", 0.95, 0.02),
    "cp_1m":           ("cd_1m", 0.25, 0.05),
    "cp_3m":           ("cd_3m", 0.25, 0.04),
    "ois_1y":          ("repo", 0.15, 0.03),
    "ois_3y":          ("repo", 0.30, 0.02),
    "ois_5y":          ("repo", 0.40, 0.02),
    "notice_7d":       ("mibor_overnight", 0.05, 0.04),
    "notice_14d":      ("mibor_overnight", 0.10, 0.03),
    "mmf_overnight":   ("repo", -0.05, 0.02),
    "mmf_ultra_short": ("repo", 0.65, 0.02),
}

# --- All Indian rate fields (33 fields) ---
RATE_FIELDS = [
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
]

# --- Global macro rate fields (50+ fields across 4 regions) ---
GLOBAL_RATE_FIELDS_US = [
    "us_fed_funds", "us_fed_target_upper", "us_fed_target_lower", "us_sofr",
    "us_tsy_1m", "us_tsy_3m", "us_tsy_6m", "us_tsy_1y",
    "us_tsy_2y", "us_tsy_5y", "us_tsy_10y", "us_tsy_30y",
    "us_tsy_10y2y_spread", "us_vix", "us_dxy", "us_wti_crude", "us_hy_spread",
]

GLOBAL_RATE_FIELDS_EU = [
    "ecb_main_refi", "ecb_deposit", "ecb_marginal", "estr",
    "euribor_1w", "euribor_1m", "euribor_3m", "euribor_6m", "euribor_12m",
    "de_bund_2y", "de_bund_5y", "de_bund_10y", "de_bund_30y", "eurusd",
]

GLOBAL_RATE_FIELDS_CN = [
    "cn_lpr_1y", "cn_lpr_5y", "cn_mlf_1y", "cn_rrr",
    "cn_shibor_on", "cn_shibor_1w", "cn_shibor_1m", "cn_shibor_3m",
    "cn_shibor_6m", "cn_shibor_1y",
    "cn_bond_1y", "cn_bond_5y", "cn_bond_10y", "cn_bond_30y", "usdcny",
]

# --- Mega library fields (BIS, akshare, World Bank, IMF) ---
GLOBAL_RATE_FIELDS_BIS = [
    "bis_india_policy_rate", "bis_us_policy_rate", "bis_china_policy_rate",
    "bis_eurozone_policy_rate", "bis_japan_policy_rate", "bis_uk_policy_rate",
    "bis_brazil_policy_rate", "bis_korea_policy_rate", "bis_australia_policy_rate",
    "bis_canada_policy_rate", "bis_switzerland_policy_rate", "bis_mexico_policy_rate",
    "bis_south_africa_policy_rate", "bis_indonesia_policy_rate", "bis_turkey_policy_rate",
]

GLOBAL_RATE_FIELDS_AKSHARE = [
    "ak_cn_gov_3m", "ak_cn_gov_6m", "ak_cn_gov_1y", "ak_cn_gov_3y",
    "ak_cn_gov_5y", "ak_cn_gov_7y", "ak_cn_gov_10y", "ak_cn_gov_30y",
    "ak_cn_corp_aaa_1y", "ak_cn_corp_aaa_3y", "ak_cn_corp_aaa_5y",
    "ak_cn_lpr_1y", "ak_cn_lpr_5y",
]

GLOBAL_RATE_FIELDS_WB = [
    "wb_india_cpi_inflation", "wb_us_cpi_inflation", "wb_china_cpi_inflation",
    "wb_india_gdp_growth", "wb_us_gdp_growth", "wb_china_gdp_growth",
    "wb_india_lending_rate", "wb_india_deposit_rate",
]

GLOBAL_RATE_FIELDS_YF = [
    "yf_us_10y", "yf_us_5y", "yf_us_30y", "yf_us_2y", "yf_us_13w",
    "yf_dxy", "yf_usdinr", "yf_eurusd", "yf_usdcny", "yf_gbpusd", "yf_usdjpy",
    "yf_gold", "yf_crude_wti", "yf_crude_brent", "yf_natgas",
    "yf_sp500", "yf_nifty50", "yf_vix", "yf_shanghai", "yf_nikkei", "yf_dax", "yf_ftse",
]

ALL_GLOBAL_FIELDS = (
    RATE_FIELDS + GLOBAL_RATE_FIELDS_US + GLOBAL_RATE_FIELDS_EU + GLOBAL_RATE_FIELDS_CN
    + GLOBAL_RATE_FIELDS_BIS + GLOBAL_RATE_FIELDS_AKSHARE + GLOBAL_RATE_FIELDS_WB + GLOBAL_RATE_FIELDS_YF
)

# --- Real fields (scraped from RBI/CCIL/FBIL/NSE) ---
REAL_FIELDS = [
    "repo", "reverse_repo", "tbill_91d", "tbill_182d", "tbill_364d",
    "usdinr_spot", "gsec_10y",
    "call_money_high", "call_money_low",
    "mibor_overnight", "cblo_bid", "cblo_ask",
]

# --- Derived fields ---
DERIVED_FIELDS = [
    "sofr", "usdinr_1m_fwd", "mifor_1m", "mifor_3m", "mifor_6m", "mmf_liquid",
]

# --- FRED API key (free from https://fred.stlouisfed.org/docs/api/api_key.html) ---
FRED_API_KEY = os.getenv("FRED_API_KEY", "")

# --- LSTM model ---
MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "lstm_liquidity.pt")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "models", "scaler.npz")
META_PATH = os.path.join(os.path.dirname(__file__), "models", "training_meta.json")
SEED_DATA_PATH = os.path.join(os.path.dirname(__file__), "seed_data", "historical_rates.csv")
SEQ_LEN = 48
FORECAST_HORIZON = 24
LSTM_HIDDEN = 128
LSTM_LAYERS = 3
LSTM_DROPOUT = 0.2
NUM_FEATURES = 24  # 6 rates + 3 temporal + 3 lagged + 5 spreads + 3 momentum + 4 calendar
TARGET_MODE_DEFAULT = "delta"

# --- Ensemble models ---
GRU_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "gru_model.pt")
TRANSFORMER_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "transformer_model.pt")
ENSEMBLE_WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), "models", "ensemble_weights.json")

# --- Real data ---
REAL_HISTORY_PATH = os.path.join(os.path.dirname(__file__), "seed_data", "real_historical_rates.csv")
MIN_REAL_HOURS_FOR_TRAINING = 168  # 1 week
IDEAL_REAL_HOURS_FOR_TRAINING = 720  # 30 days

# --- Monitoring ---
RETRAIN_THRESHOLD_RMSE = 25.0  # Auto-retrain if model RMSE exceeds this
MONITORING_DIR = os.path.join(os.path.dirname(__file__), "metrics")

# --- Monte Carlo ---
MC_PATHS = 300
MC_HOURS = 24
MC_DROPOUT_SAMPLES = 50

# --- Rate history ---
MAX_RATE_HISTORY = 240
