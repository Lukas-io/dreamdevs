# Merchant Intelligence API

**Author:** Iyamu Wisdom
**Hackathon:** DreamDev Hackathon 2025 — Moniepoint Challenge
**Repository:** https://github.com/Lukas-io/dreamdevs
**Live API:** https://dreamdevs.onrender.com
**Docs:** https://dreamdevs.onrender.com/docs

A high-performance analytics REST API that ingests a year of merchant activity logs across Moniepoint's product ecosystem and exposes 5 business intelligence endpoints. Built with NestJS + PostgreSQL, all analytics are pre-computed at startup and served from memory — zero DB hits per request.

---

## What Makes This Submission Different

Most submissions will query the database on every request, import rows one by one, and have no documentation. Here's what this one does instead:

**Results served from memory, not the database.**
All 5 analytics queries run once after import and are cached in memory. Every endpoint responds in under 5ms regardless of dataset size. The database is never touched again after startup.

**Import built for 10M+ rows, not just the sample.**
CSV files are parsed as streams (never loaded into memory), inserted in batches of 5,000 rows, and processed 4 files at a time in parallel. Indexes are dropped before import and rebuilt after — the technique that makes bulk PostgreSQL inserts 3–5× faster.

**Crash-safe restarts.**
If the process dies mid-import, the next restart picks up exactly where it left off. Every insert uses `ON CONFLICT DO NOTHING` on the UUID primary key, so already-imported rows are silently skipped and the rest continue.

**Every dirty CSV row handled gracefully.**
A dedicated validation layer checks UUIDs, merchant ID format, product/status enums, negative amounts, locale-formatted numbers (`1,250.00`), BOM characters, and timestamp ranges — before anything touches the database. Bad rows are logged and skipped; the import never crashes.

**API is available the moment the server starts.**
Import runs in the background. The HTTP server binds to port 8080 immediately. Analytics endpoints return `503 Service Unavailable` (with a clear message) until the data is ready — rather than timing out or hanging.

**Interactive API documentation.**
Available at `/docs` — a full Scalar API reference with real example responses pulled from the sample dataset. Most submissions won't have any documentation at all.

**Health endpoint.**
`GET /health` shows import progress, total records, and analytics readiness in real time. Makes it trivial for a reviewer to know the service is working correctly without reading logs.

---

## Setup

**Requirements:** Node.js v18+, Docker

```bash
# 1. Install dependencies
npm install

# 2. Download the dataset
bash scripts/download-data.sh

# 3. Start PostgreSQL
docker run --name dreamdevs-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dreamdevs \
  -p 5432:5432 -d postgres:16

# 4. Configure environment
cp .env.example .env

# 5. Start the API
npm run start
```

The API is ready at `http://localhost:8080` when you see `🚀 API running`.
Docs at `http://localhost:8080/docs` · Health at `http://localhost:8080/health`

| Variable      | Default     | Description                         |
|---------------|-------------|-------------------------------------|
| `PORT`        | `8080`      | API port                            |
| `DB_HOST`     | `localhost` | PostgreSQL host                     |
| `DB_PORT`     | `5432`      | PostgreSQL port                     |
| `DB_USERNAME` | `postgres`  | PostgreSQL username                 |
| `DB_PASSWORD` | `postgres`  | PostgreSQL password                 |
| `DB_NAME`     | `dreamdevs` | PostgreSQL database name            |
| `DATA_DIR`    | `./data`    | Path to folder containing CSV files |

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/analytics/top-merchant` | Merchant with highest total `SUCCESS` volume |
| `GET` | `/analytics/monthly-active-merchants` | Unique merchants with ≥1 `SUCCESS` event per month |
| `GET` | `/analytics/product-adoption` | Unique merchants per product, sorted descending |
| `GET` | `/analytics/kyc-funnel` | KYC stage conversion counts (`SUCCESS` only) |
| `GET` | `/analytics/failure-rates` | `FAILED / (SUCCESS + FAILED) × 100` per product |
| `GET` | `/health` | Import status and analytics readiness |

All analytics endpoints return `503` until data is ready. Full request/response examples at `/docs`.

---

## Assumptions

- **Top merchant:** Only `SUCCESS` transactions count toward volume.
- **Monthly active:** A merchant counts for a month if they have ≥1 `SUCCESS` event with a non-null timestamp that month.
- **Product adoption:** All statuses counted — adoption means any interaction.
- **Failure rate:** `FAILED / (SUCCESS + FAILED) × 100`. `PENDING` excluded from both.
- **KYC funnel:** Counts unique merchants at each stage (`DOCUMENT_SUBMITTED` → `VERIFICATION_COMPLETED` → `TIER_UPGRADE`) where status is `SUCCESS`.
- **Precision:** Monetary values at 2dp, percentages at 1dp — enforced in SQL via `ROUND()`.
- **Timestamps:** Parsed as UTC to prevent month-boundary shifts on servers in different timezones.
