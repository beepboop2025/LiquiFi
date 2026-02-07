"""Regulatory API router — CRR/SLR tracking, ALM, branches, RBI reports."""

import json
import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from models.database import get_db
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
from data.report_generator import generate_form_a, generate_form_viii, generate_alm_statement

logger = logging.getLogger("liquifi.regulatory")

router = APIRouter(prefix="/api/regulatory", tags=["regulatory"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ConfigUpdate(BaseModel):
    ndtl: float | None = None
    crr_rate: float | None = None
    slr_rate: float | None = None
    repo_rate: float | None = None
    sdf_rate: float | None = None
    msf_rate: float | None = None


class ReportRequest(BaseModel):
    report_type: str  # form_a, form_viii, alm_statement
    period_start: date | None = None
    period_end: date | None = None
    month: int | None = None
    year: int | None = None


class BucketUpdate(BaseModel):
    bucket_name: str
    rate_sensitive_assets: float
    rate_sensitive_liabilities: float


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    """Full regulatory dashboard data — CRR + SLR + LCR + NSFR summary."""
    config = db.query(BankConfig).first()
    if not config:
        return {"error": "No bank configuration found. Seed data may not have loaded."}

    # Latest CRR position
    latest_crr = (
        db.query(CRRDailyPosition)
        .order_by(desc(CRRDailyPosition.date))
        .first()
    )

    # Latest SLR position
    latest_slr = (
        db.query(SLRDailyPosition)
        .order_by(desc(SLRDailyPosition.date))
        .first()
    )

    # Latest liquidity metrics
    liquidity = (
        db.query(LiquidityMetrics)
        .order_by(desc(LiquidityMetrics.date))
        .first()
    )

    # Branch count
    branch_count = db.query(func.count(Branch.id)).filter(Branch.is_active == True).scalar()

    # Report counts by status
    report_counts = {}
    for status in ["draft", "submitted", "archived"]:
        count = db.query(func.count(RegulatoryReport.id)).filter(
            RegulatoryReport.status == status
        ).scalar()
        report_counts[status] = count

    return {
        "config": {
            "bank_name": config.bank_name,
            "ndtl": config.ndtl,
            "crr_rate": config.crr_rate,
            "slr_rate": config.slr_rate,
            "repo_rate": config.repo_rate,
            "sdf_rate": config.sdf_rate,
            "msf_rate": config.msf_rate,
            "bank_rate": config.bank_rate,
            "fortnight_start": config.fortnight_start.isoformat() if config.fortnight_start else None,
            "fortnight_end": config.fortnight_end.isoformat() if config.fortnight_end else None,
        },
        "crr": {
            "required": latest_crr.crr_required if latest_crr else 0,
            "maintained": latest_crr.crr_maintained if latest_crr else 0,
            "surplus": latest_crr.surplus_deficit if latest_crr else 0,
            "compliance_pct": latest_crr.compliance_pct if latest_crr else 0,
            "date": latest_crr.date.isoformat() if latest_crr else None,
        },
        "slr": {
            "required": latest_slr.slr_required if latest_slr else 0,
            "maintained": latest_slr.slr_maintained if latest_slr else 0,
            "surplus": latest_slr.surplus_deficit if latest_slr else 0,
            "compliance_pct": latest_slr.compliance_pct if latest_slr else 0,
            "gsec": latest_slr.gsec_holdings if latest_slr else 0,
            "tbills": latest_slr.treasury_bills if latest_slr else 0,
            "sdf": latest_slr.sdf_balance if latest_slr else 0,
            "other": latest_slr.other_approved if latest_slr else 0,
            "date": latest_slr.date.isoformat() if latest_slr else None,
        },
        "lcr": {
            "hqla_level1": liquidity.hqla_level1 if liquidity else 0,
            "hqla_level2": liquidity.hqla_level2 if liquidity else 0,
            "total_hqla": liquidity.total_hqla if liquidity else 0,
            "net_outflows": liquidity.net_cash_outflows_30d if liquidity else 0,
            "lcr_pct": liquidity.lcr_pct if liquidity else 0,
            "compliant": liquidity.lcr_pct >= 100 if liquidity else False,
        },
        "nsfr": {
            "asf": liquidity.available_stable_funding if liquidity else 0,
            "rsf": liquidity.required_stable_funding if liquidity else 0,
            "nsfr_pct": liquidity.nsfr_pct if liquidity else 0,
            "compliant": liquidity.nsfr_pct >= 100 if liquidity else False,
        },
        "branches_active": branch_count,
        "reports": report_counts,
    }


# ---------------------------------------------------------------------------
# CRR/SLR History
# ---------------------------------------------------------------------------
@router.get("/crr/history")
def get_crr_history(days: int = Query(default=90, ge=1, le=365), db: Session = Depends(get_db)):
    """90-day CRR daily positions."""
    cutoff = date.today() - timedelta(days=days)
    positions = (
        db.query(CRRDailyPosition)
        .filter(CRRDailyPosition.date >= cutoff)
        .order_by(CRRDailyPosition.date)
        .all()
    )
    return {
        "history": [
            {
                "date": p.date.isoformat(),
                "ndtl": p.ndtl,
                "required": p.crr_required,
                "maintained": p.crr_maintained,
                "surplus": p.surplus_deficit,
                "compliance_pct": p.compliance_pct,
            }
            for p in positions
        ]
    }


@router.get("/slr/history")
def get_slr_history(days: int = Query(default=90, ge=1, le=365), db: Session = Depends(get_db)):
    """90-day SLR daily positions."""
    cutoff = date.today() - timedelta(days=days)
    positions = (
        db.query(SLRDailyPosition)
        .filter(SLRDailyPosition.date >= cutoff)
        .order_by(SLRDailyPosition.date)
        .all()
    )
    return {
        "history": [
            {
                "date": p.date.isoformat(),
                "ndtl": p.ndtl,
                "required": p.slr_required,
                "maintained": p.slr_maintained,
                "surplus": p.surplus_deficit,
                "compliance_pct": p.compliance_pct,
                "gsec": p.gsec_holdings,
                "tbills": p.treasury_bills,
                "sdf": p.sdf_balance,
                "other": p.other_approved,
            }
            for p in positions
        ]
    }


# ---------------------------------------------------------------------------
# Config Update
# ---------------------------------------------------------------------------
@router.put("/config")
def update_config(update: ConfigUpdate, db: Session = Depends(get_db)):
    """Update NDTL / rates (admin only)."""
    config = db.query(BankConfig).first()
    if not config:
        raise HTTPException(status_code=404, detail="Bank configuration not found")

    if update.ndtl is not None:
        config.ndtl = update.ndtl
    if update.crr_rate is not None:
        config.crr_rate = update.crr_rate
    if update.slr_rate is not None:
        config.slr_rate = update.slr_rate
    if update.repo_rate is not None:
        config.repo_rate = update.repo_rate
    if update.sdf_rate is not None:
        config.sdf_rate = update.sdf_rate
    if update.msf_rate is not None:
        config.msf_rate = update.msf_rate

    db.commit()
    return {"status": "ok", "message": "Configuration updated"}


# ---------------------------------------------------------------------------
# ALM
# ---------------------------------------------------------------------------
@router.get("/alm/current")
def get_alm_current(db: Session = Depends(get_db)):
    """Current ALM gap analysis (10 buckets)."""
    # Find latest snapshot date
    latest_date = db.query(func.max(ALMBucket.snapshot_date)).scalar()
    if not latest_date:
        return {"buckets": [], "snapshot_date": None}

    buckets = (
        db.query(ALMBucket)
        .filter(ALMBucket.snapshot_date == latest_date)
        .order_by(ALMBucket.bucket_order)
        .all()
    )

    rbi_limits = {"1d": 10, "2-7d": 10, "8-14d": 10, "15-28d": 15}

    bucket_data = []
    for b in buckets:
        limit = rbi_limits.get(b.bucket_name)
        status = "pass"
        if limit is not None and b.gap_to_outflow_pct is not None:
            if abs(b.gap_to_outflow_pct) > limit:
                status = "fail"
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

    return {"buckets": bucket_data, "snapshot_date": latest_date.isoformat()}


@router.get("/alm/liquidity")
def get_alm_liquidity(db: Session = Depends(get_db)):
    """LCR and NSFR metrics."""
    liquidity = (
        db.query(LiquidityMetrics)
        .order_by(desc(LiquidityMetrics.date))
        .first()
    )
    if not liquidity:
        return {"lcr": None, "nsfr": None}

    return {
        "date": liquidity.date.isoformat(),
        "lcr": {
            "hqla_level1": liquidity.hqla_level1,
            "hqla_level2": liquidity.hqla_level2,
            "total_hqla": liquidity.total_hqla,
            "net_outflows": liquidity.net_cash_outflows_30d,
            "lcr_pct": liquidity.lcr_pct,
            "compliant": liquidity.lcr_pct >= 100,
        },
        "nsfr": {
            "asf": liquidity.available_stable_funding,
            "rsf": liquidity.required_stable_funding,
            "nsfr_pct": liquidity.nsfr_pct,
            "compliant": liquidity.nsfr_pct >= 100,
        },
    }


@router.put("/alm/buckets")
def update_alm_buckets(buckets: list[BucketUpdate], db: Session = Depends(get_db)):
    """Update bucket data."""
    today = date.today()
    cumulative = 0.0

    for bu in buckets:
        existing = (
            db.query(ALMBucket)
            .filter(ALMBucket.snapshot_date == today, ALMBucket.bucket_name == bu.bucket_name)
            .first()
        )
        gap = bu.rate_sensitive_assets - bu.rate_sensitive_liabilities
        cumulative += gap
        gap_to_outflow = (gap / bu.rate_sensitive_liabilities * 100) if bu.rate_sensitive_liabilities > 0 else 0

        if existing:
            existing.rate_sensitive_assets = bu.rate_sensitive_assets
            existing.rate_sensitive_liabilities = bu.rate_sensitive_liabilities
            existing.gap = gap
            existing.cumulative_gap = cumulative
            existing.gap_to_outflow_pct = gap_to_outflow
        else:
            logger.warning(f"ALM bucket {bu.bucket_name} not found for date {today}")

    db.commit()
    return {"status": "ok", "message": f"Updated {len(buckets)} ALM buckets"}


# ---------------------------------------------------------------------------
# Branches
# ---------------------------------------------------------------------------
@router.get("/branches")
def get_branches(db: Session = Depends(get_db)):
    """All branches with latest positions."""
    branches = db.query(Branch).filter(Branch.is_active == True).all()
    result = []

    for br in branches:
        latest_pos = (
            db.query(BranchPosition)
            .filter(BranchPosition.branch_id == br.id)
            .order_by(desc(BranchPosition.date))
            .first()
        )
        result.append({
            "code": br.code,
            "name": br.name,
            "region": br.region,
            "city": br.city,
            "position": {
                "date": latest_pos.date.isoformat() if latest_pos else None,
                "cash": latest_pos.cash_position if latest_pos else 0,
                "deployed": latest_pos.deployed_capital if latest_pos else 0,
                "deposits": latest_pos.deposits if latest_pos else 0,
                "advances": latest_pos.advances if latest_pos else 0,
                "crr": latest_pos.crr_position if latest_pos else 0,
                "slr": latest_pos.slr_position if latest_pos else 0,
                "pnl": latest_pos.pnl_today if latest_pos else 0,
            } if latest_pos else None,
        })

    return {"branches": result}


@router.get("/branches/summary")
def get_branches_summary(db: Session = Depends(get_db)):
    """Regional aggregation."""
    branches = db.query(Branch).filter(Branch.is_active == True).all()
    regions = {}

    for br in branches:
        latest_pos = (
            db.query(BranchPosition)
            .filter(BranchPosition.branch_id == br.id)
            .order_by(desc(BranchPosition.date))
            .first()
        )
        if br.region not in regions:
            regions[br.region] = {"branch_count": 0, "cash": 0, "deployed": 0, "deposits": 0, "advances": 0, "pnl": 0}

        regions[br.region]["branch_count"] += 1
        if latest_pos:
            regions[br.region]["cash"] += latest_pos.cash_position
            regions[br.region]["deployed"] += latest_pos.deployed_capital
            regions[br.region]["deposits"] += latest_pos.deposits
            regions[br.region]["advances"] += latest_pos.advances
            regions[br.region]["pnl"] += latest_pos.pnl_today

    # Round values
    for r in regions.values():
        for k in ["cash", "deployed", "deposits", "advances", "pnl"]:
            r[k] = round(r[k], 2)

    # Bank-wide totals
    totals = {"branch_count": 0, "cash": 0, "deployed": 0, "deposits": 0, "advances": 0, "pnl": 0}
    for r in regions.values():
        for k in totals:
            totals[k] += r[k]
    for k in ["cash", "deployed", "deposits", "advances", "pnl"]:
        totals[k] = round(totals[k], 2)

    return {"regions": regions, "totals": totals}


@router.get("/branches/{code}")
def get_branch_detail(code: str, db: Session = Depends(get_db)):
    """Single branch + 30-day history."""
    branch = db.query(Branch).filter(Branch.code == code).first()
    if not branch:
        raise HTTPException(status_code=404, detail=f"Branch {code} not found")

    cutoff = date.today() - timedelta(days=30)
    positions = (
        db.query(BranchPosition)
        .filter(BranchPosition.branch_id == branch.id, BranchPosition.date >= cutoff)
        .order_by(BranchPosition.date)
        .all()
    )

    return {
        "branch": {
            "code": branch.code,
            "name": branch.name,
            "region": branch.region,
            "city": branch.city,
        },
        "history": [
            {
                "date": p.date.isoformat(),
                "cash": p.cash_position,
                "deployed": p.deployed_capital,
                "deposits": p.deposits,
                "advances": p.advances,
                "crr": p.crr_position,
                "slr": p.slr_position,
                "pnl": p.pnl_today,
            }
            for p in positions
        ],
    }


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
@router.post("/reports/generate")
def generate_report(req: ReportRequest, db: Session = Depends(get_db)):
    """Generate Form A / Form VIII / ALM Statement."""
    if req.report_type == "form_a":
        if not req.period_start or not req.period_end:
            # Default to current fortnight
            today = date.today()
            if today.day <= 15:
                req.period_start = today.replace(day=1)
                req.period_end = today.replace(day=15)
            else:
                req.period_start = today.replace(day=16)
                next_month = today.replace(day=28) + timedelta(days=4)
                req.period_end = next_month - timedelta(days=next_month.day)
        return generate_form_a(db, req.period_start, req.period_end)

    elif req.report_type == "form_viii":
        if not req.month or not req.year:
            today = date.today()
            req.month = today.month
            req.year = today.year
        return generate_form_viii(db, req.month, req.year)

    elif req.report_type == "alm_statement":
        snapshot = req.period_start or date.today()
        return generate_alm_statement(db, snapshot)

    else:
        raise HTTPException(status_code=400, detail=f"Unknown report type: {req.report_type}")


@router.get("/reports")
def list_reports(db: Session = Depends(get_db)):
    """List generated reports."""
    reports = (
        db.query(RegulatoryReport)
        .order_by(desc(RegulatoryReport.generated_at))
        .limit(20)
        .all()
    )
    return {
        "reports": [
            {
                "id": r.id,
                "report_type": r.report_type,
                "period_start": r.period_start.isoformat(),
                "period_end": r.period_end.isoformat(),
                "generated_at": r.generated_at.isoformat() if r.generated_at else None,
                "status": r.status,
            }
            for r in reports
        ]
    }


@router.get("/reports/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    """Get report data."""
    report = db.query(RegulatoryReport).filter(RegulatoryReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    data = json.loads(report.data_json) if report.data_json else {}
    return {
        "id": report.id,
        "report_type": report.report_type,
        "period_start": report.period_start.isoformat(),
        "period_end": report.period_end.isoformat(),
        "generated_at": report.generated_at.isoformat() if report.generated_at else None,
        "status": report.status,
        "data": data,
    }


@router.get("/reports/{report_id}/export")
def export_report(report_id: int, db: Session = Depends(get_db)):
    """Export report as JSON."""
    report = db.query(RegulatoryReport).filter(RegulatoryReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    data = json.loads(report.data_json) if report.data_json else {}
    return JSONResponse(
        content=data,
        headers={
            "Content-Disposition": f'attachment; filename="{report.report_type}_{report.period_start}_{report.period_end}.json"',
        },
    )
