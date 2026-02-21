# Merchant Intelligence API

**Author:** Iyamu Wisdom
**Hackathon:** DreamDev Hackathon 2025 — Moniepoint Challenge
**Repository:** https://github.com/Lukas-io/dreamdevs
**Live API:** https://dreamdevs.onrender.com

A high-performance analytics REST API that ingests a year's worth of merchant activity logs across Moniepoint's product ecosystem and exposes key business insights through 5 endpoints. Built with NestJS + PostgreSQL, with all analytics pre-computed at startup for sub-millisecond response times.

---

## Architecture

```
src/
├── config/             # Environment-based database configuration
├── database/           # TypeORM + PostgreSQL setup
├── ingestion/          # CSV → PostgreSQL pipeline (runs on startup)
│   └── entities/       # Activity table definition with indexes
├── analytics/          # 5 analytics endpoints + pre-computation engine
├── health/             # Health check endpoint
└── main.ts             # App bootstrap, Scalar docs, port 8080
```

**Key design decisions:**
- **Pre-computation:** All 5 analytics queries run once after ingestion completes and results are stored in memory. Every subsequent request is served from cache — no DB hit per request.
- **Bulk ingestion:** CSVs are stream-parsed and inserted in batches of 1,000 rows using `orIgnore()` on the primary key, making re-runs safe and idempotent.
- **Indexed queries:** Composite indexes on `(status, product)`, `merchant_id`, and `event_timestamp` ensure analytics queries complete in seconds even on large datasets.
- **Graceful error handling:** Malformed rows (missing timestamps, invalid UUIDs, bad amounts) are skipped and logged — the import never crashes.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/) (for PostgreSQL)

---

## Setup & Run

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd <repo-folder>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Download the CSV dataset

Run the provided script to automatically download and extract the data:

```bash
bash scripts/download-data.sh
```

This will create a `data/` folder and populate it with the CSV files. Alternatively, place your own CSV files there manually:

```
data/
├── activities_20240101.csv
├── activities_20240102.csv
└── ...
```

### 4. Configure environment

Copy the example env file and update if needed:

```bash
cp .env.example .env
```

| Variable      | Default     | Description                          |
|---------------|-------------|--------------------------------------|
| `PORT`        | `8080`      | API port                             |
| `DB_HOST`     | `localhost` | PostgreSQL host                      |
| `DB_PORT`     | `5432`      | PostgreSQL port                      |
| `DB_USERNAME` | `postgres`  | PostgreSQL username                  |
| `DB_PASSWORD` | `postgres`  | PostgreSQL password                  |
| `DB_NAME`     | `dreamdevs` | PostgreSQL database name             |
| `DATA_DIR`    | `./data`    | Path to folder containing CSV files  |

### 5. Start PostgreSQL via Docker

```bash
docker run --name dreamdevs-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dreamdevs \
  -p 5432:5432 \
  -d postgres:16
```

### 6. Start the API

```bash
npm run start
```

On startup the app will:
1. Connect to PostgreSQL and create the `activities` table
2. Scan `DATA_DIR` for all `activities_YYYYMMDD.csv` files
3. Stream and bulk-import them into the database
4. Pre-compute all 5 analytics results
5. Begin serving requests on port 8080

> The API is ready when you see `🚀 API running on http://localhost:8080`

---

## API Endpoints

Base URL (live): `https://dreamdevs.onrender.com`
Base URL (local): `http://localhost:8080`

### `GET /analytics/top-merchant`
Returns the merchant with the highest total successful transaction volume across all products.

```json
{
  "merchant_id": "MRC-009405",
  "total_volume": 181479333.57
}
```

### `GET /analytics/monthly-active-merchants`
Returns the count of unique merchants with at least one successful event per month.

```json
{
  "2024-01": 9847,
  "2024-02": 9901,
  ...
}
```

### `GET /analytics/product-adoption`
Returns unique merchant count per product, sorted by count descending.

```json
{
  "BILLS": 4379,
  "SAVINGS": 4368,
  "POS": 4348,
  ...
}
```

### `GET /analytics/kyc-funnel`
Returns the KYC conversion funnel — unique merchants at each stage (successful events only).

```json
{
  "documents_submitted": 3760,
  "verifications_completed": 3389,
  "tier_upgrades": 2496
}
```

### `GET /analytics/failure-rates`
Returns failure rate per product — `(FAILED / (SUCCESS + FAILED)) × 100`. PENDING excluded. Sorted descending.

```json
[
  { "product": "BILLS", "failure_rate": 5.3 },
  { "product": "CARD_PAYMENT", "failure_rate": 5.2 },
  ...
]
```

### `GET /health`
Returns import and analytics readiness status.

```json
{
  "status": "ok",
  "import": {
    "complete": true,
    "totalImported": 845573,
    "totalSkipped": 102
  },
  "analytics": {
    "ready": true
  }
}
```

---

## Interactive API Docs

Scalar API reference is available at:

```
http://localhost:8080/docs
```

---

## Assumptions

- **Malformed rows:** Rows with missing `event_timestamp` are stored with a `null` timestamp and included in all non-time-based queries. Rows with missing required fields (`event_id`, `merchant_id`, `product`, `event_type`, `status`) or invalid UUID format are skipped entirely.
- **Top merchant:** Only `SUCCESS` transactions contribute to total volume. Non-monetary events (e.g. KYC) have `amount = 0` and are included in the sum without impact.
- **Monthly active merchants:** A merchant is considered active in a month if they have at least one `SUCCESS` event with a non-null timestamp in that month.
- **Product adoption:** Counts unique merchants regardless of transaction status — adoption means any interaction with a product.
- **Failure rate:** Calculated as `FAILED / (SUCCESS + FAILED) × 100`. `PENDING` events are excluded from both numerator and denominator.
- **KYC funnel:** Counts unique merchants per KYC event type (`DOCUMENT_SUBMITTED`, `VERIFICATION_COMPLETED`, `TIER_UPGRADE`) where status is `SUCCESS`.
- **Decimal precision:** Monetary values rounded to 2 decimal places. Percentages rounded to 1 decimal place. Both enforced at the SQL query level.
- **Idempotent import:** Re-running the app against the same dataset is safe — duplicate `event_id` rows are silently ignored via `ON CONFLICT DO NOTHING`.

## Validation Rules

Every CSV row is validated before insert. The following rules are enforced:

| Field | Rule | On Failure |
|---|---|---|
| `event_id` | Must be a valid UUID v4 | Row skipped |
| `merchant_id` | Must match `MRC-XXXXXX` pattern | Warning logged, row imported |
| `product` | Must be one of: `POS`, `AIRTIME`, `BILLS`, `CARD_PAYMENT`, `SAVINGS`, `MONIEBOOK`, `KYC` | Row skipped |
| `status` | Must be one of: `SUCCESS`, `FAILED`, `PENDING` | Row skipped |
| `channel` | Must be one of: `POS`, `APP`, `USSD`, `WEB`, `OFFLINE` (optional) | Stored as `null` |
| `merchant_tier` | Must be one of: `STARTER`, `VERIFIED`, `PREMIUM` (optional) | Stored as `null` |
| `amount` | Must be non-negative decimal | Clamped to `0` |
| `event_timestamp` | Must be parseable ISO 8601; outside 2024 flagged as suspicious | Stored as `null` if unparseable; imported either way |
| Required fields | `event_id`, `merchant_id`, `product`, `event_type`, `status` must all be present | Row skipped |

Validation stats are logged at the end of each import run.

---

## Performance

Tested against January 2024 sample data (31 CSV files):

- **Total rows imported:** 849,573
- **Rows skipped (malformed):** 0 (102 warnings logged for suspicious fields, all imported)
- **Import time:** ~30 seconds (first run) / skipped on restart if DB already populated
- **Analytics pre-computation:** ~2 seconds (runs once at startup)
- **Endpoint response time:** <5ms (served from memory cache)
- **Heap usage after precompute:** ~50MB
- **Responses:** gzip compressed via `compression` middleware

---

## Render Deployment (Recommended)

### 1. Connect your repository
Go to [render.com](https://render.com), create a new account or log in, and connect your GitHub repo (`https://github.com/Lukas-io/dreamdevs`).

### 2. Deploy with Blueprint
The repo includes a `render.yaml` that configures everything automatically — web service + managed PostgreSQL.

From the Render dashboard:
- Click **New → Blueprint**
- Select the `dreamdevs` repository
- Render will detect `render.yaml` and provision both the web service and the database

### 3. That's it
Render will:
1. Download the CSV dataset from Google Drive
2. Build the app
3. Connect to the managed PostgreSQL instance
4. Start importing and serving on port 8080

Your live URL will be: `https://dreamdevs.onrender.com`

---

## VPS Deployment

### 1. Provision your server

Recommended: Ubuntu 22.04 LTS. The following steps assume a fresh VPS.

### 2. Install dependencies

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Docker (for PostgreSQL)
sudo apt-get install -y docker.io
sudo systemctl enable docker && sudo systemctl start docker

# unzip (for data download script)
sudo apt-get install -y unzip
```

### 3. Clone and set up the project

```bash
git clone https://github.com/Lukas-io/dreamdevs.git
cd dreamdevs
npm install
```

### 4. Download the dataset

```bash
bash scripts/download-data.sh
```

### 5. Start PostgreSQL

```bash
docker run --name dreamdevs-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dreamdevs \
  -p 5432:5432 \
  -d postgres:16
```

### 6. Configure environment

```bash
cp .env.example .env
# Edit .env if your DB credentials differ
```

### 7. Build and start with PM2

```bash
npm install -g pm2
npm run build
pm2 start dist/main.js --name dreamdevs
pm2 save
```

The API will be live on port 8080. If you have a domain, point it at your VPS IP and optionally set up Nginx as a reverse proxy.
