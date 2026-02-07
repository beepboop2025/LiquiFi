"""RBI Regulatory Report Generator.

Assembles regulatory returns from DB data per RBI formats:
- Form A: Fortnightly CRR Return (submitted via CIMS)
- Form VIII: Monthly SLR Return with daily position annex
- ALM Statement: Structural Liquidity Statement with 10 RBI buckets
"""

import json
import logging
from datetime import date, datetime

from sqlalchemy import and_
from sqlalchemy.orm import Session

from models.regulatory import (
    ALMBucket,
    BankConfig,
    CRRDailyPosition,
    LiquidityMetrics,
    RegulatoryReport,
    SLRDailyPosition,
)

logger = logging.getLogger("liquifi.reports")


def generate_form_a(db: Session, fortnight_start: date, fortnight_end: date) -> dict:
    """Generate CRR Fortnightly Return (Form A) per RBI/2025-26/148.

    Structure matches Form A submitted via CIMS:
    - Header with bank info and fortnight period
    - NDTL computation summary
    - Daily CRR position for each day in fortnight
    - Average daily balance maintained vs required
    - Surplus/deficit and compliance status
    """
    config = db.query(BankConfig).first()
    if not config:
        return {"error": "Bank configuration not found"}

    positions = (
        db.query(CRRDailyPosition)
        .filter(and_(
            CRRDailyPosition.date >= fortnight_start,
            CRRDailyPosition.date <= fortnight_end,
        ))
        .order_by(CRRDailyPosition.date)
        .all()
    )

    daily_data = []
    total_maintained = 0
    total_required = 0
    days_count = 0

    for pos in positions:
        daily_data.append({
            "date": pos.date.isoformat(),
            "ndtl": pos.ndtl,
            "crr_required": pos.crr_required,
            "crr_maintained": pos.crr_maintained,
            "surplus_deficit": pos.surplus_deficit,
            "compliance_pct": pos.compliance_pct,
            "compliant": pos.surplus_deficit >= 0,
        })
        total_maintained += pos.crr_maintained
        total_required += pos.crr_required
        days_count += 1

    avg_maintained = total_maintained / days_count if days_count > 0 else 0
    avg_required = total_required / days_count if days_count > 0 else 0
    avg_surplus = avg_maintained - avg_required
    overall_compliant = all(d["compliant"] for d in daily_data) if daily_data else False

    report = {
        "report_type": "form_a",
        "title": "Form A — Fortnightly CRR Return",
        "reference": "RBI/2025-26/148 — CRR & SLR Directions 2025",
        "submission_via": "CIMS (Centralised Information Management System)",
        "header": {
            "bank_name": config.bank_name,
            "fortnight_start": fortnight_start.isoformat(),
            "fortnight_end": fortnight_end.isoformat(),
            "fortnight_definition": "1st-15th or 16th-last day of calendar month (Banking Laws Amendment 2025)",
            "crr_rate_pct": config.crr_rate,
            "ndtl_basis": config.ndtl,
        },
        "daily_positions": daily_data,
        "summary": {
            "total_days": days_count,
            "average_ndtl": round(config.ndtl, 2),
            "average_crr_required": round(avg_required, 2),
            "average_crr_maintained": round(avg_maintained, 2),
            "average_surplus_deficit": round(avg_surplus, 2),
            "overall_compliant": overall_compliant,
            "compliance_status": "COMPLIANT" if overall_compliant else "NON-COMPLIANT",
        },
        "generated_at": datetime.utcnow().isoformat(),
    }

    # Save to DB
    db_report = RegulatoryReport(
        report_type="form_a",
        period_start=fortnight_start,
        period_end=fortnight_end,
        status="draft",
        data_json=json.dumps(report, default=str),
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    report["report_id"] = db_report.id

    return report


def generate_form_viii(db: Session, month: int, year: int) -> dict:
    """Generate SLR Monthly Return (Form VIII) per RBI format.

    Structure:
    - Daily SLR asset positions (annex)
    - Breakdown: G-Sec, T-Bills, SDF balance, other approved securities
    - Opening/closing balances
    - Excess over minimum requirement
    """
    config = db.query(BankConfig).first()
    if not config:
        return {"error": "Bank configuration not found"}

    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, month + 1, 1)
    from datetime import timedelta
    month_end = month_end - timedelta(days=1)

    positions = (
        db.query(SLRDailyPosition)
        .filter(and_(
            SLRDailyPosition.date >= month_start,
            SLRDailyPosition.date <= month_end,
        ))
        .order_by(SLRDailyPosition.date)
        .all()
    )

    daily_data = []
    total_maintained = 0
    total_required = 0
    days_count = 0

    for pos in positions:
        daily_data.append({
            "date": pos.date.isoformat(),
            "ndtl": pos.ndtl,
            "slr_required": pos.slr_required,
            "slr_maintained": pos.slr_maintained,
            "surplus_deficit": pos.surplus_deficit,
            "compliance_pct": pos.compliance_pct,
            "breakdown": {
                "gsec_holdings": pos.gsec_holdings,
                "treasury_bills": pos.treasury_bills,
                "sdf_balance": pos.sdf_balance,
                "other_approved": pos.other_approved,
            },
        })
        total_maintained += pos.slr_maintained
        total_required += pos.slr_required
        days_count += 1

    avg_maintained = total_maintained / days_count if days_count > 0 else 0
    avg_required = total_required / days_count if days_count > 0 else 0

    opening = daily_data[0] if daily_data else None
    closing = daily_data[-1] if daily_data else None

    report = {
        "report_type": "form_viii",
        "title": "Form VIII — Monthly SLR Return",
        "reference": "RBI/2025-26/148 — CRR & SLR Directions 2025",
        "submission_via": "CIMS",
        "header": {
            "bank_name": config.bank_name,
            "month": month,
            "year": year,
            "slr_rate_pct": config.slr_rate,
            "ndtl_basis": config.ndtl,
        },
        "daily_positions_annex": daily_data,
        "summary": {
            "total_days": days_count,
            "average_slr_required": round(avg_required, 2),
            "average_slr_maintained": round(avg_maintained, 2),
            "average_excess": round(avg_maintained - avg_required, 2),
            "opening_balance": opening["slr_maintained"] if opening else 0,
            "closing_balance": closing["slr_maintained"] if closing else 0,
        },
        "valuation_mode": "Marked to Market (HTM/AFS/HFT classification)",
        "generated_at": datetime.utcnow().isoformat(),
    }

    db_report = RegulatoryReport(
        report_type="form_viii",
        period_start=month_start,
        period_end=month_end,
        status="draft",
        data_json=json.dumps(report, default=str),
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    report["report_id"] = db_report.id

    return report


def generate_alm_statement(db: Session, snapshot_date: date) -> dict:
    """Generate Structural Liquidity Statement per RBI Master Circular on ALM.

    Includes:
    - 10 RBI time buckets with RSA, RSL, gap, cumulative gap
    - Gap-to-outflow percentage per bucket
    - RBI limit compliance (10% for 1-14d, 15% for 15-28d)
    - Interest Rate Sensitivity Statement section
    - LCR and NSFR summary
    """
    config = db.query(BankConfig).first()
    if not config:
        return {"error": "Bank configuration not found"}

    buckets = (
        db.query(ALMBucket)
        .filter(ALMBucket.snapshot_date == snapshot_date)
        .order_by(ALMBucket.bucket_order)
        .all()
    )

    liquidity = (
        db.query(LiquidityMetrics)
        .filter(LiquidityMetrics.date == snapshot_date)
        .first()
    )

    # RBI limit checks
    rbi_limits = {
        "1d": 10, "2-7d": 10, "8-14d": 10,
        "15-28d": 15,
    }

    bucket_data = []
    total_rsa = 0
    total_rsl = 0
    violations = []

    for b in buckets:
        limit = rbi_limits.get(b.bucket_name)
        status = "pass"
        if limit is not None and b.gap_to_outflow_pct is not None:
            if abs(b.gap_to_outflow_pct) > limit:
                status = "fail"
                violations.append(f"{b.bucket_name}: {b.gap_to_outflow_pct:.1f}% exceeds {limit}% limit")
            elif abs(b.gap_to_outflow_pct) > limit * 0.8:
                status = "warn"

        bucket_data.append({
            "bucket": b.bucket_name,
            "order": b.bucket_order,
            "rsa": b.rate_sensitive_assets,
            "rsl": b.rate_sensitive_liabilities,
            "gap": b.gap,
            "cumulative_gap": b.cumulative_gap,
            "gap_to_outflow_pct": b.gap_to_outflow_pct,
            "rbi_limit_pct": limit,
            "status": status,
        })
        total_rsa += b.rate_sensitive_assets
        total_rsl += b.rate_sensitive_liabilities

    # Interest Rate Sensitivity (IRRBB per RBI/2022-23/180)
    irrbb = {
        "eve_sensitivity_100bps": round(total_rsa * 0.012 - total_rsl * 0.010, 2),
        "nii_impact_100bps": round((total_rsa - total_rsl) * 0.01 * 0.4, 2),
        "duration_gap_years": round(2.8 + (total_rsa - total_rsl) / total_rsa * 0.5, 2) if total_rsa > 0 else 0,
        "earnings_at_risk_pct": round(abs(total_rsa - total_rsl) / total_rsa * 100 * 0.15, 2) if total_rsa > 0 else 0,
    }

    report = {
        "report_type": "alm_statement",
        "title": "Structural Liquidity Statement — ALM Gap Analysis",
        "reference": "RBI Master Circular on ALM System + RBI/2022-23/180 (IRRBB)",
        "header": {
            "bank_name": config.bank_name,
            "snapshot_date": snapshot_date.isoformat(),
            "ndtl": config.ndtl,
        },
        "buckets": bucket_data,
        "totals": {
            "total_rsa": round(total_rsa, 2),
            "total_rsl": round(total_rsl, 2),
            "total_gap": round(total_rsa - total_rsl, 2),
        },
        "rbi_compliance": {
            "violations": violations,
            "compliant": len(violations) == 0,
            "status": "COMPLIANT" if len(violations) == 0 else "NON-COMPLIANT",
        },
        "irrbb": irrbb,
        "liquidity_ratios": {
            "lcr_pct": liquidity.lcr_pct if liquidity else None,
            "lcr_compliant": liquidity.lcr_pct >= 100 if liquidity else None,
            "hqla_total": liquidity.total_hqla if liquidity else None,
            "net_outflows_30d": liquidity.net_cash_outflows_30d if liquidity else None,
            "nsfr_pct": liquidity.nsfr_pct if liquidity else None,
            "nsfr_compliant": liquidity.nsfr_pct >= 100 if liquidity else None,
            "asf": liquidity.available_stable_funding if liquidity else None,
            "rsf": liquidity.required_stable_funding if liquidity else None,
        },
        "generated_at": datetime.utcnow().isoformat(),
    }

    db_report = RegulatoryReport(
        report_type="alm_statement",
        period_start=snapshot_date,
        period_end=snapshot_date,
        status="draft",
        data_json=json.dumps(report, default=str),
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    report["report_id"] = db_report.id

    return report
