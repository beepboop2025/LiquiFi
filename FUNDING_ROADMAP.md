# LiquiFi Funding Roadmap: Seed to Series A

## Executive Summary

| Metric | Current | Seed Ready | Series A Ready |
|--------|---------|------------|----------------|
| **Valuation** | ₹1-2 Cr | ₹8-15 Cr | ₹50-100 Cr |
| **Raise Amount** | - | ₹3-5 Cr | ₹25-40 Cr |
| **Timeline** | - | 6 months | 18-24 months |
| **Team Size** | 1 | 4-6 | 15-25 |
| **MRR** | $0 | $2K-5K | $50K+ |
| **Customers** | 0 | 5-10 pilots | 50+ paying |

---

## PHASE 1: SEED ROUND (₹3-5 Crores / $400K-600K)

### Goal: Prove Product-Market Fit with Early Adopters

---

### SECTION A: TECHNICAL REQUIREMENTS (₹25-35 Lakhs effort)

#### A1. Security & Compliance Foundation

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Authentication System** | P0 | 2 weeks | ₹50K | ❌ Missing |
| Implement JWT-based auth with refresh tokens | | | | |
| Add role-based access (admin, analyst, viewer) | | | | |
| Password hashing (bcrypt) + password reset | | | | |
| OAuth2 integration (Google, Microsoft) | | | | |

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Data Encryption** | P0 | 1 week | ₹30K | ❌ Missing |
| AES-256 encryption for sensitive fields | | | | |
| TLS 1.3 for all API communications | | | | |
| Secrets management (AWS Secrets Manager) | | | | |
| API key rotation mechanism | | | | |

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Audit Logging** | P1 | 1 week | ₹25K | ❌ Missing |
| Immutable audit trail (who, what, when) | | | | |
| Structured logging with correlation IDs | | | | |
| Log retention policy (7 years for financial) | | | | |

#### A2. Production Infrastructure

| Item | Priority | Effort | Cost (Monthly) | Status |
|------|----------|--------|----------------|--------|
| **Database Migration** | P0 | 3 days | ₹15K | ❌ Missing |
| PostgreSQL 15 on AWS RDS | | | ₹8K/mo | |
| Read replicas for reporting queries | | | ₹4K/mo | |
| Automated backups (point-in-time) | | | Included | |

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Containerization** | P0 | 1 week | ₹20K | ❌ Missing |
| Docker for backend + frontend | | | | |
| Docker Compose for local dev | | | | |
| Kubernetes manifests (EKS prep) | | | | |

| Item | Priority | Effort | Cost (Monthly) | Status |
|------|----------|--------|----------------|--------|
| **CI/CD Pipeline** | P1 | 3 days | ₹10K | ❌ Missing |
| GitHub Actions for automated testing | | | ₹0 | |
| Automated deployment to staging/prod | | | | |
| Database migration automation | | | | |

| Item | Priority | Effort | Cost (Monthly) | Status |
|------|----------|--------|----------------|--------|
| **Cloud Infrastructure** | P0 | 3 days | ₹25K/mo | ⚠️ Basic |
| AWS EC2 → ECS Fargate migration | | | ₹15K/mo | |
| CloudFront CDN for static assets | | | ₹3K/mo | |
| Route53 for DNS management | | | ₹2K/mo | |
| S3 for data lake (raw rate storage) | | | ₹5K/mo | |

#### A3. Monitoring & Reliability

| Item | Priority | Effort | Cost (Monthly) | Status |
|------|----------|--------|----------------|--------|
| **Observability Stack** | P1 | 1 week | ₹20K/mo | ❌ Missing |
| Datadog/NewRelic APM | | | ₹15K/mo | |
| PagerDuty for critical alerts | | | ₹5K/mo | |
| Custom dashboards (rate freshness, accuracy) | | | | |

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Data Quality Monitoring** | P0 | 3 days | ₹15K | ⚠️ Partial |
| Automated data freshness alerts | | | | |
| Anomaly detection for rate spikes | | | | |
| Source health dashboard | | | | |

#### A4. API & Documentation

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **API Documentation** | P1 | 3 days | ₹20K | ❌ Missing |
| OpenAPI/Swagger spec | | | | |
| Postman collection | | | | |
| API versioning strategy (v1, v2) | | | | |
| Rate limiting documentation | | | | |

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Developer Portal** | P2 | 2 weeks | ₹75K | ❌ Missing |
| Self-service API key generation | | | | |
| Usage analytics dashboard | | | | |
| SDK examples (Python, Node.js) | | | | |

---

### SECTION B: BUSINESS REQUIREMENTS (₹15-25 Lakhs effort)

#### B1. Legal & Compliance

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Company Incorporation** | P0 | 2 weeks | ₹75K | ❌ Missing |
| Private Limited registration | | | ₹25K | |
| PAN, TAN, GST registration | | | ₹15K | |
| Shops & Establishment Act | | | ₹5K | |
| Startup India registration | | | ₹10K | |
| Trademark filing (LiquiFi) | | | ₹20K | |

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Financial Regulations** | P1 | 4 weeks | ₹3L | ❌ Missing |
| Legal opinion on data usage (RBI/CCIL) | | | ₹1L | |
| Terms of Service drafting | | | ₹50K | |
| Privacy Policy (GDPR + DPDP compliant) | | | ₹50K | |
| Data Processing Agreements | | | ₹50K | |
| SLA documentation | | | ₹50K | |

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Cybersecurity Compliance** | P1 | 2 weeks | ₹2L | ❌ Missing |
| ISO 27001 gap analysis | | | ₹75K | |
| SOC 2 Type I readiness | | | ₹1.25L | |
| Basic security audit | | | ₹50K | |

#### B2. Go-to-Market

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Pilot Customer Acquisition** | P0 | 8 weeks | ₹2L | ❌ Missing |
| Target: 5 corporate treasury departments | | | | |
| Outreach: NBFCs, corporates, banks | | | | |
| Cost: Travel + demos + POC setup | | | | |

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Pitch Materials** | P0 | 2 weeks | ₹1L | ❌ Missing |
| 12-slide investor deck | | | ₹30K | |
| Financial model (3-year projections) | | | ₹40K | |
| Product demo video (3 min) | | | ₹30K | |

| Item | Priority | Effort | Cost | Status |
|------|----------|--------|------|--------|
| **Market Research** | P1 | 2 weeks | ₹75K | ❌ Missing |
| TAM/SAM/SOM analysis | | | ₹30K | |
| Competitor deep-dive (5 competitors) | | | ₹25K | |
| Customer interviews (20 treasurers) | | | ₹20K | |

---

### SECTION C: TEAM BUILDING (₹40-60 Lakhs/year)

| Role | Timing | Salary/Year | Equity | Responsibilities |
|------|--------|-------------|--------|------------------|
| **Co-founder/CEO** | Month 1 | ₹18-24L | 40-50% | Fundraising, sales, strategy |
| **Full-stack Engineer** | Month 2 | ₹15-20L | 2-4% | Backend, infrastructure |
| **ML Engineer** | Month 3 | ₹18-25L | 2-3% | Model improvement, features |
| **Growth/Biz Dev** | Month 4 | ₹12-18L | 1-2% | Customer acquisition |

---

### SEED FUNDING SUMMARY

| Category | Amount (₹) | % of Raise |
|----------|-----------|------------|
| Technical Development | ₹35,00,000 | 35% |
| Team Salaries (18 months) | ₹25,00,000 | 25% |
| Legal & Compliance | ₹6,00,000 | 6% |
| Infrastructure (18 months) | ₹8,00,000 | 8% |
| Go-to-Market | ₹10,00,000 | 10% |
| Contingency | ₹16,00,000 | 16% |
| **TOTAL** | **₹1,00,00,000** | **100%** |

**Recommended Ask: ₹3-5 Crores for 18-24 months runway**

---

## PHASE 2: SERIES A (₹25-40 Crores / $3-5 Million)

### Goal: Scale to 50+ Enterprise Customers with Predictable Revenue

---

### SECTION D: SCALABILITY REQUIREMENTS (₹1.5-2 Crores)

#### D1. Enterprise Infrastructure

| Item | Current | Series A Requirement | Effort | Cost |
|------|---------|---------------------|--------|------|
| **Database** | Single PostgreSQL | Aurora PostgreSQL (multi-AZ) | 2 weeks | ₹50K/mo |
| **Caching** | None | Redis Cluster (ElastiCache) | 1 week | ₹25K/mo |
| **Message Queue** | None | Apache Kafka / AWS MSK | 2 weeks | ₹40K/mo |
| **Search** | None | Elasticsearch (OpenSearch) | 1 week | ₹30K/mo |
| **Data Lake** | S3 basic | Delta Lake/Apache Iceberg | 3 weeks | ₹60K/mo |

| Item | Description | Effort | Cost |
|------|-------------|--------|------|
| **Kubernetes Platform** | EKS with auto-scaling, spot instances | 4 weeks | ₹1.5L/mo |
| **Multi-region Deployment** | Mumbai + Singapore DR | 3 weeks | ₹2L/mo |
| **CDN + Edge Caching** | CloudFront with edge functions | 1 week | ₹50K/mo |
| **API Gateway** | Kong/AWS API Gateway with throttling | 1 week | ₹30K/mo |

#### D2. Advanced Security (Enterprise-Grade)

| Item | Description | Effort | Cost |
|------|-------------|--------|------|
| **SOC 2 Type II Certification** | Full audit + certification | 6 months | ₹8-10L |
| **ISO 27001 Certification** | Information security standard | 4 months | ₹5-6L |
| **RBI Cyber Security Compliance** | CB circular compliance | 2 months | ₹3-4L |
| **Penetration Testing** | Quarterly external pentests | Ongoing | ₹2L/quarter |
| **Bug Bounty Program** | HackerOne/Bugcrowd integration | 2 weeks | ₹3L/year |
| **SIEM Implementation** | Splunk/Elastic Security | 3 weeks | ₹1.5L/mo |
| **DLP (Data Loss Prevention)** | Prevent data exfiltration | 2 weeks | ₹75K/mo |

#### D3. ML Platform Maturity

| Item | Current | Series A Requirement | Effort | Cost |
|------|---------|---------------------|--------|------|
| **Training Data** | 360 samples | 10M+ samples | Ongoing | ₹5L/year storage |
| **Feature Store** | None | Feast/Databricks Feature Store | 4 weeks | ₹50K/mo |
| **Model Registry** | Basic file-based | MLflow/Weights & Biases | 1 week | ₹30K/mo |
| **Experiment Tracking** | None | Full ML experiment management | 1 week | Included |
| **Model Monitoring** | None | Evidently/WhyLabs for drift | 2 weeks | ₹40K/mo |
| **A/B Testing Framework** | None | Multi-armed bandit testing | 3 weeks | ₹25K/mo |
| **AutoML Pipeline** | None | Hyperparameter optimization | 4 weeks | ₹50K/mo GPU |
| **Real-time Inference** | Batch | Sub-100ms prediction latency | 3 weeks | ₹1L/mo GPU |

---

### SECTION E: PRODUCT EXPANSION (₹1-1.5 Crores)

#### E1. Core Product Enhancements

| Feature | Description | Effort | Business Value |
|---------|-------------|--------|----------------|
| **Historical Data API** | 10+ years of backfilled rates | 4 weeks | ₹50K/mo revenue |
| **Real-time WebSocket API** | Sub-second rate updates | 3 weeks | ₹75K/mo revenue |
| **Custom Alerts Engine** | SMS/Email/Slack alerts | 2 weeks | ₹30K/mo revenue |
| **Excel Add-in** | Direct Excel integration | 4 weeks | ₹40K/mo revenue |
| **Bloomberg Terminal Integration** | EMSX/API integration | 6 weeks | ₹1L/mo revenue |
| **Custom Dashboard Builder** | Drag-drop visualization | 6 weeks | ₹60K/mo revenue |

#### E2. New Data Sources

| Source | Data Points | Effort | Monthly Cost |
|--------|-------------|--------|--------------|
| **NSE Bond Prices** | Corporate bond yields | 2 weeks | ₹25K data fees |
| **BSE Corporate Actions** | Dividends, splits | 1 week | ₹15K data fees |
| **Clearcorp Repo Rates** | Triparty repo rates | 2 weeks | ₹30K data fees |
| **FX Forward Rates** | USD/INR forwards | 2 weeks | ₹50K data fees |
| **Mutual Fund Yields** | Liquid fund NAVs | 2 weeks | ₹20K data fees |

#### E3. Advanced Analytics

| Feature | Description | Effort |
|---------|-------------|--------|
| **Cash Flow Forecasting** | ML-based liquidity prediction | 6 weeks |
| **Counterparty Risk Scoring** | Bank/NBFC risk ratings | 4 weeks |
| **Regulatory Reporting** | RBI/SEBI automated reports | 4 weeks |
| **Portfolio Optimization** | Mean-variance optimization | 8 weeks |
| **Scenario Analysis** | Stress testing framework | 6 weeks |

---

### SECTION F: ENTERPRISE FEATURES (₹80 Lakhs - 1 Crore)

| Feature | Description | Effort | Why Enterprise Needs It |
|---------|-------------|--------|------------------------|
| **SSO Integration** | SAML 2.0 / Azure AD / Okta | 2 weeks | IT security requirement |
| **Audit Reports** | Compliance-ready exports | 3 weeks | Regulatory audits |
| **RBAC (Fine-grained)** | Field-level permissions | 3 weeks | Data governance |
| **Data Residency Controls** | Region-specific data storage | 2 weeks | Data localization laws |
| **Custom SLA** | 99.9% uptime guarantee | 4 weeks | Enterprise contracts |
| **Dedicated Support** | 24/7 phone support | - | ₹30K/mo per customer |
| **On-premise Option** | Self-hosted deployment | 8 weeks | Banks with strict policies |
| **Custom Integrations** | ERP connectors (SAP, Oracle) | 6 weeks | Workflow automation |

---

### SECTION G: ORGANIZATION SCALING (₹3-4 Crores/year)

#### G1. Engineering Team (8-10 people)

| Role | Count | Salary/Year/Head | Total/Year |
|------|-------|------------------|------------|
| VP of Engineering | 1 | ₹40-50L | ₹45L |
| Senior Backend Engineers | 3 | ₹25-35L | ₹90L |
| ML Engineers | 2 | ₹30-40L | ₹70L |
| DevOps/SRE Engineers | 2 | ₹20-30L | ₹50L |
| QA Automation Engineer | 1 | ₹15-20L | ₹17L |
| Security Engineer | 1 | ₹25-35L | ₹30L |
| **Total Engineering** | **10** | | **₹3.02 Cr** |

#### G2. Go-to-Market Team (6-8 people)

| Role | Count | Salary/Year/Head | Total/Year |
|------|-------|------------------|------------|
| VP of Sales | 1 | ₹35-45L | ₹40L |
| Enterprise Account Executives | 3 | ₹20-30L + commission | ₹75L |
| Sales Development Reps | 2 | ₹8-12L + commission | ₹20L |
| Customer Success Managers | 2 | ₹15-20L | ₹35L |
| Marketing Manager | 1 | ₹15-20L | ₹17L |
| **Total GTM** | **9** | | **₹1.87 Cr** |

#### G3. Operations & Support (3-4 people)

| Role | Count | Salary/Year/Head | Total/Year |
|------|-------|------------------|------------|
| Head of Operations | 1 | ₹25-30L | ₹27L |
| Data Analysts | 2 | ₹12-18L | ₹30L |
| Support Engineers | 2 | ₹8-12L | ₹20L |
| **Total Operations** | **5** | | **₹77L** |

---

### SECTION H: GTM & SALES (₹2-3 Crores/year)

| Activity | Description | Cost/Year |
|----------|-------------|-----------|
| **Events & Conferences** | Treasury conferences, fintech events | ₹40L |
| **Digital Marketing** | LinkedIn, Google Ads, content | ₹30L |
| **Sales Collateral** | Case studies, whitepapers, videos | ₹15L |
| **Partnerships** | System integrator partnerships | ₹20L |
| **Pilot Programs** | Free pilots for enterprise prospects | ₹25L |
| **Customer Events** | Annual user conference | ₹20L |
| **PR & Communications** | Media relations, thought leadership | ₹15L |

---

### SERIES A FUNDING SUMMARY

| Category | Amount (₹ Crores) | % of Raise |
|----------|-------------------|------------|
| Product Development (18 months) | ₹5.0 | 14% |
| Infrastructure & Security | ₹3.5 | 10% |
| Team Salaries (18 months) | ₹11.5 | 32% |
| Sales & Marketing | ₹5.0 | 14% |
| Compliance & Certifications | ₹1.5 | 4% |
| Working Capital | ₹4.0 | 11% |
| Contingency | ₹4.5 | 12% |
| **TOTAL** | **₹35.0** | **100%** |

**Recommended Ask: ₹25-40 Crores for 18-24 months runway**

---

## COMPARISON: SEED vs SERIES A

| Aspect | Seed (Now) | Series A (18-24 months) |
|--------|-----------|------------------------|
| **Monthly Burn** | ₹4-5L | ₹60-80L |
| **Team Size** | 4-6 | 25-30 |
| **Revenue** | ₹0 | ₹50L+/mo |
| **Customers** | 5-10 pilots | 50+ paying |
| **Data Points** | 360 | 10M+ |
| **Uptime SLA** | Best effort | 99.9% |
| **Compliance** | Basic legal | SOC 2, ISO 27001 |
| **Geography** | India | India + Singapore |
| **Valuation** | ₹10-15 Cr | ₹100-200 Cr |

---

## CRITICAL SUCCESS METRICS

### For Seed Round Closure
- [ ] 5 pilot customers with LOIs
- [ ] ₹2-5K MRR from at least 2 customers
- [ ] 99.5% data uptime
- [ ] <100ms API response time
- [ ] Legal opinion on data usage

### For Series A Closure
- [ ] ₹50L+ MRR with 20% MoM growth
- [ ] 50+ enterprise customers
- [ ] 120% Net Revenue Retention
- [ ] <12 months CAC payback
- [ ] SOC 2 Type II certified
- [ ] 15+ person team

