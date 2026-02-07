"""Regulatory models for CRR/SLR tracking, ALM, branches, and RBI reports.

Aligned with:
- RBI/2025-26/148 — CRR & SLR Directions 2025
- RBI Master Circular on ALM System
- LCR/NSFR guidelines
- CIMS submission specifications (Form A, Form VIII)
"""

import uuid
from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from models.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class ReportType(str, PyEnum):
    FORM_A = "form_a"
    FORM_VIII = "form_viii"
    ALM_STATEMENT = "alm_statement"


class ReportStatus(str, PyEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    ARCHIVED = "archived"


# ---------------------------------------------------------------------------
# BankConfig — NDTL, CRR/SLR rates, reserves, reporting period
# ---------------------------------------------------------------------------
class BankConfig(Base):
    __tablename__ = "bank_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bank_name = Column(String(200), nullable=False, default="LiquiFi Demo Bank")
    ndtl = Column(Float, nullable=False, default=75000.0)  # Crores
    crr_rate = Column(Float, nullable=False, default=3.00)  # %
    slr_rate = Column(Float, nullable=False, default=18.00)  # %
    crr_maintained = Column(Float, nullable=False, default=2295.0)  # Crores
    slr_holdings = Column(Float, nullable=False, default=14250.0)  # Crores
    fortnight_start = Column(Date, nullable=True)
    fortnight_end = Column(Date, nullable=True)
    repo_rate = Column(Float, nullable=False, default=5.25)
    sdf_rate = Column(Float, nullable=False, default=5.00)
    msf_rate = Column(Float, nullable=False, default=5.50)
    bank_rate = Column(Float, nullable=False, default=5.50)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# CRRDailyPosition — Daily CRR position (for Form A)
# ---------------------------------------------------------------------------
class CRRDailyPosition(Base):
    __tablename__ = "crr_daily_position"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True)
    ndtl = Column(Float, nullable=False)
    crr_required = Column(Float, nullable=False)
    crr_maintained = Column(Float, nullable=False)
    surplus_deficit = Column(Float, nullable=False)
    compliance_pct = Column(Float, nullable=False)  # maintained / required * 100

    __table_args__ = (
        UniqueConstraint("date", name="uq_crr_date"),
    )


# ---------------------------------------------------------------------------
# SLRDailyPosition — Daily SLR position (for Form VIII)
# ---------------------------------------------------------------------------
class SLRDailyPosition(Base):
    __tablename__ = "slr_daily_position"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True)
    ndtl = Column(Float, nullable=False)
    slr_required = Column(Float, nullable=False)
    slr_maintained = Column(Float, nullable=False)
    surplus_deficit = Column(Float, nullable=False)
    compliance_pct = Column(Float, nullable=False)
    gsec_holdings = Column(Float, nullable=False, default=0)
    treasury_bills = Column(Float, nullable=False, default=0)
    sdf_balance = Column(Float, nullable=False, default=0)
    other_approved = Column(Float, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("date", name="uq_slr_date"),
    )


# ---------------------------------------------------------------------------
# ALMBucket — Per-bucket asset/liability data (10 RBI buckets)
# ---------------------------------------------------------------------------
class ALMBucket(Base):
    __tablename__ = "alm_bucket"

    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    bucket_name = Column(String(20), nullable=False)  # e.g. "1d", "2-7d"
    bucket_order = Column(Integer, nullable=False)  # 1-10 for sorting
    rate_sensitive_assets = Column(Float, nullable=False, default=0)
    rate_sensitive_liabilities = Column(Float, nullable=False, default=0)
    gap = Column(Float, nullable=False, default=0)
    cumulative_gap = Column(Float, nullable=False, default=0)
    gap_to_outflow_pct = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("snapshot_date", "bucket_name", name="uq_alm_bucket"),
        Index("ix_alm_snapshot_order", "snapshot_date", "bucket_order"),
    )


# ---------------------------------------------------------------------------
# LiquidityMetrics — LCR and NSFR tracking
# ---------------------------------------------------------------------------
class LiquidityMetrics(Base):
    __tablename__ = "liquidity_metrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True, unique=True)
    hqla_level1 = Column(Float, nullable=False, default=0)  # Cash + G-Sec
    hqla_level2 = Column(Float, nullable=False, default=0)  # Corp bonds, covered bonds
    total_hqla = Column(Float, nullable=False, default=0)
    net_cash_outflows_30d = Column(Float, nullable=False, default=0)
    lcr_pct = Column(Float, nullable=False, default=0)  # >= 100%
    available_stable_funding = Column(Float, nullable=False, default=0)
    required_stable_funding = Column(Float, nullable=False, default=0)
    nsfr_pct = Column(Float, nullable=False, default=0)  # >= 100%


# ---------------------------------------------------------------------------
# Branch — Branch definition
# ---------------------------------------------------------------------------
class Branch(Base):
    __tablename__ = "branch"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), nullable=False, unique=True, index=True)
    name = Column(String(100), nullable=False)
    region = Column(String(20), nullable=False)  # North, South, East, West
    city = Column(String(50), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    positions = relationship("BranchPosition", back_populates="branch", lazy="dynamic")


# ---------------------------------------------------------------------------
# BranchPosition — Daily position per branch
# ---------------------------------------------------------------------------
class BranchPosition(Base):
    __tablename__ = "branch_position"

    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(Integer, ForeignKey("branch.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    cash_position = Column(Float, nullable=False, default=0)  # Crores
    deployed_capital = Column(Float, nullable=False, default=0)
    deposits = Column(Float, nullable=False, default=0)
    advances = Column(Float, nullable=False, default=0)
    crr_position = Column(Float, nullable=False, default=0)
    slr_position = Column(Float, nullable=False, default=0)
    pnl_today = Column(Float, nullable=False, default=0)

    branch = relationship("Branch", back_populates="positions")

    __table_args__ = (
        UniqueConstraint("branch_id", "date", name="uq_branch_position"),
        Index("ix_branch_pos_date", "branch_id", "date"),
    )


# ---------------------------------------------------------------------------
# RegulatoryReport — Generated report archive
# ---------------------------------------------------------------------------
class RegulatoryReport(Base):
    __tablename__ = "regulatory_report"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_type = Column(String(30), nullable=False)  # form_a, form_viii, alm_statement
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(20), nullable=False, default="draft")  # draft, submitted, archived
    data_json = Column(Text, nullable=True)  # Full report data as JSON

    __table_args__ = (
        Index("ix_report_type_period", "report_type", "period_start", "period_end"),
    )
