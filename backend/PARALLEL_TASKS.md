# Parallel Task Assignment: Kimi + Codex

## Strategy
Split work into INDEPENDENT tracks that can proceed in parallel.

---

## 🎯 CODEX FOCUS: ML & Data Pipeline

### Priority 1: Critical Fix (15 min)
- [ ] Fix test import error in `tests/test_ccil_scraper.py`
  - Export `_extract_rate_from_cells` from `ccil_playwright.py`
  - Remove underscore prefix to make it public

### Priority 2: Data Collection (Ongoing)
- [ ] Resume training data collection
  - Target: 10,000+ snapshots
  - Current: 360
  - Run in background: `python multi_ai_collector.py --mode continuous`

### Priority 3: ML Improvements (2-3 hours)
- [ ] Ensemble model hyperparameter tuning
- [ ] Feature engineering experiments
- [ ] Model drift detection setup
- [ ] A/B test framework for model versions

### Priority 4: Validation & Monitoring (1-2 hours)
- [ ] Data quality alerts
- [ ] Model performance dashboard
- [ ] Automated retraining triggers

---

## 🔧 KIMI FOCUS: Infrastructure & Production

### Track A: Authentication System (2 hours)
- [x] Design JWT auth architecture
- [x] Implement auth middleware
- [x] User model and database schema
- [x] Login/logout endpoints
- [x] Password hashing (bcrypt)
- [x] Token refresh mechanism

### Track B: Database Migration (1-2 hours)
- [x] PostgreSQL schema design
- [x] Migration scripts
- [x] Data validation layer
- [x] Connection pooling setup

### Track C: Docker & Deployment (1 hour)
- [x] Dockerfile for backend
- [x] Docker Compose configuration
- [x] Environment variable management
- [x] Health check endpoints

### Track D: Documentation (30 min)
- [x] API documentation (OpenAPI/Swagger)
- [x] README update
- [x] Deployment guide

---

## 📋 Shared Resources & Sync Points

### Files We Both Touch (BE CAREFUL)
- `config.py` - Coordinate on new settings
- `requirements.txt` - Add deps independently, resolve conflicts
- `rate_manager.py` - Notify before major changes

### Communication Protocol
1. Update this file with status: `[WIP]`, `[DONE]`, `[BLOCKED]`
2. Comment in code with `# CODEX:` or `# KIMI:` tags
3. Use git commits with clear prefixes: `ml:`, `infra:`, `fix:`

### Sync Schedule
- Every 2 hours: Quick sync on progress
- Before major commits: Check for conflicts
- End of day: Update this document

---

## 🚀 Quick Wins (Can do in parallel immediately)

### Kimi Starting Now:
1. ✅ Fix test import error (blocking CI)
2. ✅ Auth middleware scaffold
3. ✅ Docker setup

### Codex Starting Now:
1. Resume data collection (run in tmux)
2. ML model tuning experiments
3. Feature engineering

---

## Current Status

| Task | Owner | Status | Started | ETA |
|------|-------|--------|---------|-----|
| Test import fix | Kimi | [WIP] | 12:45 | 12:50 |
| Auth system | Kimi | [PENDING] | - | 15:00 |
| Data collection | Codex | [PENDING] | - | Ongoing |
| ML tuning | Codex | [PENDING] | - | 18:00 |
| Docker setup | Kimi | [PENDING] | - | 14:00 |
