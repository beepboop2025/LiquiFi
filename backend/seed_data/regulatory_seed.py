"""Seed data generator for regulatory models.

Generates realistic demo data for a mid-size Indian bank (NDTL ~75,000 Cr):
- 90 days CRR/SLR daily positions
- ALM buckets (10 RBI-mandated time buckets)
- LCR/NSFR liquidity metrics
- 8 branches with 30 days of position history
- 5 demo regulatory reports

Idempotent — only seeds if tables are empty.
"""

import json
import logging
import random
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from models.regulatory import (
    ALMBucket,
    BankConfig,
    Branch,
    BranchPosition,
    CRRDailyPosition,
    LiquidityMetrics,
    RegulatoryReport,
    SLRDailyPosition,
)

logger = logging.getLogger("liquifi.seed")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
NDTL = 75000.0  # Crores
CRR_RATE = 3.00
SLR_RATE = 18.00
CRR_REQUIRED = NDTL * CRR_RATE / 100  # 2250 Cr
SLR_REQUIRED = NDTL * SLR_RATE / 100  # 13500 Cr

BRANCHES = [
    {"code": "HO-MUM", "name": "Head Office Mumbai", "region": "West", "city": "Mumbai"},
    {"code": "BR-DEL", "name": "Delhi Main Branch", "region": "North", "city": "Delhi"},
    {"code": "BR-BLR", "name": "Bangalore Tech Park", "region": "South", "city": "Bangalore"},
    {"code": "BR-CHN", "name": "Chennai Central", "region": "South", "city": "Chennai"},
    {"code": "BR-KOL", "name": "Kolkata Park Street", "region": "East", "city": "Kolkata"},
    {"code": "BR-JAI", "name": "Jaipur Malviya Nagar", "region": "North", "city": "Jaipur"},
    {"code": "BR-HYD", "name": "Hyderabad HITEC City", "region": "South", "city": "Hyderabad"},
    {"code": "BR-AMD", "name": "Ahmedabad SG Highway", "region": "West", "city": "Ahmedabad"},
]

# Proportional share of bank activity per branch
BRANCH_WEIGHTS = {
    "HO-MUM": 0.38,
    "BR-DEL": 0.14,
    "BR-BLR": 0.12,
    "BR-CHN": 0.09,
    "BR-KOL": 0.08,
    "BR-JAI": 0.06,
    "BR-HYD": 0.07,
    "BR-AMD": 0.06,
}

ALM_BUCKETS = [
    {"name": "1d",     "order": 1,  "rsa": 3200,  "rsl": 4800,  "limit_pct": 10},
    {"name": "2-7d",   "order": 2,  "rsa": 4500,  "rsl": 5200,  "limit_pct": 10},
    {"name": "8-14d",  "order": 3,  "rsa": 3800,  "rsl": 4100,  "limit_pct": 10},
    {"name": "15-28d", "order": 4,  "rsa": 5200,  "rsl": 5800,  "limit_pct": 15},
    {"name": "29d-3m", "order": 5,  "rsa": 7500,  "rsl": 6800,  "limit_pct": None},
    {"name": "3-6m",   "order": 6,  "rsa": 8200,  "rsl": 7100,  "limit_pct": None},
    {"name": "6-12m",  "order": 7,  "rsa": 9800,  "rsl": 8500,  "limit_pct": None},
    {"name": "1-3y",   "order": 8,  "rsa": 12500, "rsl": 10200, "limit_pct": None},
    {"name": "3-5y",   "order": 9,  "rsa": 8800,  "rsl": 7500,  "limit_pct": None},
    {"name": ">5y",    "order": 10, "rsa": 6500,  "rsl": 8000,  "limit_pct": None},
]


def seed_regulatory_data(db: Session) -> bool:
    """Seed all regulatory tables. Returns True if data was seeded."""
    existing = db.query(BankConfig).first()
    if existing:
        logger.info("Regulatory seed data already exists, skipping")
        return False

    logger.info("Seeding regulatory demo data...")
    random.seed(42)  # Reproducible

    _seed_bank_config(db)
    _seed_crr_positions(db)
    _seed_slr_positions(db)
    _seed_alm_buckets(db)
    _seed_liquidity_metrics(db)
    branch_map = _seed_branches(db)
    _seed_branch_positions(db, branch_map)
    _seed_demo_reports(db)

    db.commit()
    logger.info("Regulatory seed data created successfully")
    return True


def _seed_bank_config(db: Session):
    today = date.today()
    # Determine current fortnight per Banking Laws Amendment 2025
    if today.day <= 15:
        fn_start = today.replace(day=1)
        fn_end = today.replace(day=15)
    else:
        fn_start = today.replace(day=16)
        # Last day of month
        next_month = today.replace(day=28) + timedelta(days=4)
        fn_end = next_month - timedelta(days=next_month.day)

    config = BankConfig(
        bank_name="LiquiFi Demo Bank",
        ndtl=NDTL,
        crr_rate=CRR_RATE,
        slr_rate=SLR_RATE,
        crr_maintained=2295.0,
        slr_holdings=14250.0,
        fortnight_start=fn_start,
        fortnight_end=fn_end,
        repo_rate=5.25,
        sdf_rate=5.00,
        msf_rate=5.50,
        bank_rate=5.50,
    )
    db.add(config)


def _seed_crr_positions(db: Session):
    today = date.today()
    near_miss_days = {15, 42, 71}  # Days with tight compliance for alert demo

    for i in range(90):
        d = today - timedelta(days=89 - i)
        ndtl_var = NDTL + random.uniform(-200, 200)
        required = ndtl_var * CRR_RATE / 100

        if i in near_miss_days:
            maintained = required + random.uniform(-5, 2)
        else:
            maintained = required + random.uniform(10, 80)

        surplus = maintained - required
        compliance = (maintained / required * 100) if required > 0 else 100.0

        db.add(CRRDailyPosition(
            date=d,
            ndtl=round(ndtl_var, 2),
            crr_required=round(required, 2),
            crr_maintained=round(maintained, 2),
            surplus_deficit=round(surplus, 2),
            compliance_pct=round(compliance, 2),
        ))


def _seed_slr_positions(db: Session):
    today = date.today()
    for i in range(90):
        d = today - timedelta(days=89 - i)
        ndtl_var = NDTL + random.uniform(-200, 200)
        required = ndtl_var * SLR_RATE / 100

        # SLR maintained 3-8% above requirement
        surplus_pct = random.uniform(3, 8)
        maintained = required * (1 + surplus_pct / 100)

        # Breakdown of SLR assets
        gsec = maintained * random.uniform(0.62, 0.68)
        tbills = maintained * random.uniform(0.15, 0.20)
        sdf = maintained * random.uniform(0.08, 0.12)
        other = maintained - gsec - tbills - sdf

        surplus = maintained - required
        compliance = (maintained / required * 100) if required > 0 else 100.0

        db.add(SLRDailyPosition(
            date=d,
            ndtl=round(ndtl_var, 2),
            slr_required=round(required, 2),
            slr_maintained=round(maintained, 2),
            surplus_deficit=round(surplus, 2),
            compliance_pct=round(compliance, 2),
            gsec_holdings=round(gsec, 2),
            treasury_bills=round(tbills, 2),
            sdf_balance=round(sdf, 2),
            other_approved=round(other, 2),
        ))


def _seed_alm_buckets(db: Session):
    today = date.today()
    cumulative = 0.0

    for bucket in ALM_BUCKETS:
        rsa = bucket["rsa"] + random.uniform(-100, 100)
        rsl = bucket["rsl"] + random.uniform(-100, 100)
        gap = rsa - rsl
        cumulative += gap
        gap_to_outflow = (gap / rsl * 100) if rsl > 0 else 0

        db.add(ALMBucket(
            snapshot_date=today,
            bucket_name=bucket["name"],
            bucket_order=bucket["order"],
            rate_sensitive_assets=round(rsa, 2),
            rate_sensitive_liabilities=round(rsl, 2),
            gap=round(gap, 2),
            cumulative_gap=round(cumulative, 2),
            gap_to_outflow_pct=round(gap_to_outflow, 2),
        ))


def _seed_liquidity_metrics(db: Session):
    today = date.today()
    # LCR ~120%, NSFR ~115%
    hqla_l1 = 9200.0 + random.uniform(-100, 100)  # Cash + G-Sec
    hqla_l2 = 1800.0 + random.uniform(-50, 50)     # Corp bonds
    total_hqla = hqla_l1 + hqla_l2
    net_outflows = total_hqla / 1.20  # Target ~120% LCR
    lcr = (total_hqla / net_outflows * 100) if net_outflows > 0 else 0

    asf = 52000.0 + random.uniform(-200, 200)
    rsf = asf / 1.15  # Target ~115% NSFR
    nsfr = (asf / rsf * 100) if rsf > 0 else 0

    db.add(LiquidityMetrics(
        date=today,
        hqla_level1=round(hqla_l1, 2),
        hqla_level2=round(hqla_l2, 2),
        total_hqla=round(total_hqla, 2),
        net_cash_outflows_30d=round(net_outflows, 2),
        lcr_pct=round(lcr, 2),
        available_stable_funding=round(asf, 2),
        required_stable_funding=round(rsf, 2),
        nsfr_pct=round(nsfr, 2),
    ))


def _seed_branches(db: Session) -> dict:
    branch_map = {}
    for b in BRANCHES:
        branch = Branch(
            code=b["code"],
            name=b["name"],
            region=b["region"],
            city=b["city"],
            is_active=True,
        )
        db.add(branch)
        db.flush()
        branch_map[b["code"]] = branch.id
    return branch_map


def _seed_branch_positions(db: Session, branch_map: dict):
    today = date.today()
    bank_cash = 2400.0
    bank_deployed = 42000.0
    bank_deposits = 62000.0
    bank_advances = 48000.0

    for code, branch_id in branch_map.items():
        w = BRANCH_WEIGHTS.get(code, 0.05)
        for i in range(30):
            d = today - timedelta(days=29 - i)
            daily_var = 1 + random.uniform(-0.03, 0.03)
            cash = bank_cash * w * daily_var
            deployed = bank_deployed * w * daily_var
            deposits = bank_deposits * w * daily_var
            advances = bank_advances * w * daily_var
            crr_pos = CRR_REQUIRED * w * daily_var
            slr_pos = SLR_REQUIRED * w * daily_var
            pnl = random.uniform(-2, 5) * w * 10

            db.add(BranchPosition(
                branch_id=branch_id,
                date=d,
                cash_position=round(cash, 2),
                deployed_capital=round(deployed, 2),
                deposits=round(deposits, 2),
                advances=round(advances, 2),
                crr_position=round(crr_pos, 2),
                slr_position=round(slr_pos, 2),
                pnl_today=round(pnl, 2),
            ))


def _seed_demo_reports(db: Session):
    today = date.today()

    # Form A — last completed fortnight
    if today.day <= 15:
        prev_fn_end = (today.replace(day=1) - timedelta(days=1))
        prev_fn_start = prev_fn_end.replace(day=16)
    else:
        prev_fn_start = today.replace(day=1)
        prev_fn_end = today.replace(day=15)

    db.add(RegulatoryReport(
        report_type="form_a",
        period_start=prev_fn_start,
        period_end=prev_fn_end,
        status="submitted",
        data_json=json.dumps({
            "bank_name": "LiquiFi Demo Bank",
            "ndtl": NDTL,
            "crr_rate": CRR_RATE,
            "average_maintained": 2280.0,
            "average_required": CRR_REQUIRED,
            "compliance": True,
        }),
    ))

    # Form A — current fortnight (draft)
    if today.day <= 15:
        curr_fn_start = today.replace(day=1)
        curr_fn_end = today.replace(day=15)
    else:
        curr_fn_start = today.replace(day=16)
        next_month = today.replace(day=28) + timedelta(days=4)
        curr_fn_end = next_month - timedelta(days=next_month.day)

    db.add(RegulatoryReport(
        report_type="form_a",
        period_start=curr_fn_start,
        period_end=curr_fn_end,
        status="draft",
        data_json=json.dumps({
            "bank_name": "LiquiFi Demo Bank",
            "ndtl": NDTL,
            "crr_rate": CRR_RATE,
            "note": "Current fortnight — provisional data",
        }),
    ))

    # Form VIII — previous month
    first_of_month = today.replace(day=1)
    prev_month_end = first_of_month - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1)

    db.add(RegulatoryReport(
        report_type="form_viii",
        period_start=prev_month_start,
        period_end=prev_month_end,
        status="submitted",
        data_json=json.dumps({
            "bank_name": "LiquiFi Demo Bank",
            "ndtl": NDTL,
            "slr_rate": SLR_RATE,
            "average_maintained": 14100.0,
            "average_required": SLR_REQUIRED,
        }),
    ))

    # Form VIII — current month (draft)
    db.add(RegulatoryReport(
        report_type="form_viii",
        period_start=first_of_month,
        period_end=today,
        status="draft",
        data_json=json.dumps({
            "bank_name": "LiquiFi Demo Bank",
            "note": "Current month — provisional",
        }),
    ))

    # ALM Statement
    db.add(RegulatoryReport(
        report_type="alm_statement",
        period_start=prev_month_start,
        period_end=prev_month_end,
        status="archived",
        data_json=json.dumps({
            "bank_name": "LiquiFi Demo Bank",
            "snapshot_date": prev_month_end.isoformat(),
            "lcr_pct": 120.0,
            "nsfr_pct": 115.0,
        }),
    ))
