# KoinX Transaction Reconciliation Engine

A **Transaction Reconciliation Engine** built with Node.js, Express, and MongoDB. It ingests user and exchange transaction CSV files, performs intelligent matching with configurable tolerances, and generates detailed reconciliation reports.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Setup Instructions](#setup-instructions)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Data Quality Handling](#data-quality-handling)
- [Key Design Decisions](#key-design-decisions)
- [Project Structure](#project-structure)

---

## Project Overview

This engine reconciles cryptocurrency transactions between a **user's records** and an **exchange's records**. Real-world transaction exports from both sides rarely match perfectly — timestamps may differ by seconds, quantities may have minor rounding differences, and the same transfer appears as `TRANSFER_OUT` on one side and `TRANSFER_IN` on the other.

The engine identifies:

- **Matched** — both sides agree on all key fields within tolerance
- **Conflicting** — same transaction identified, but key fields differ beyond tolerance
- **Unmatched (User only)** — present in user file, not found in exchange file
- **Unmatched (Exchange only)** — present in exchange file, not found in user file
- **Flagged** — rows with data quality issues (duplicates, malformed timestamps, negative quantities)

Each reconciliation run is independent and produces a downloadable CSV report and a JSON summary stored in MongoDB.

---

## Setup Instructions

### Prerequisites

- **Node.js** v18 or higher
- **MongoDB** — local instance or MongoDB Atlas (cloud)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/himanshu1029g/koinx-reconciliation-engine
cd koinx-reconciliation-engine

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Open .env and set your MONGODB_URI and other values
```

### Environment Setup (`.env`)

```env
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/koinx_reconciliation
TIMESTAMP_TOLERANCE_SECONDS=300
QUANTITY_TOLERANCE_PCT=0.0001
LOG_LEVEL=info
```

### Running the Server

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Server starts at `http://localhost:3000`. On startup you should see:

```
info: MongoDB connected: cluster0.xxxxx.mongodb.net/koinx_reconciliation
info: Server running on port 3000
```

---

## API Documentation

### 1. `POST /reconcile`

Trigger a full reconciliation run. Ingests both CSV files, runs the matching engine, and generates a report.

**Request Body** (optional — overrides `.env` values):
```json
{
  "timestampToleranceSeconds": 600,
  "quantityTolerancePct": 0.05
}
```

**Response** (`200 OK`):
```json
{
  "runId": "661f3a2b4c5d6e7f8a9b0c1d",
  "status": "completed",
  "summary": {
    "matched": 20,
    "conflicting": 2,
    "unmatchedUser": 0,
    "unmatchedExchange": 3,
    "flaggedRows": 4
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/reconcile \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### 2. `GET /report/:runId`

Download the full reconciliation report as a CSV file.

**Response**: CSV file (`Content-Type: text/csv`)

Columns: `category, reason, user_transaction_id, user_timestamp, user_type, user_asset, user_quantity, user_price_usd, user_fee, exchange_transaction_id, exchange_timestamp, exchange_type, exchange_asset, exchange_quantity, exchange_price_usd, exchange_fee`

**Example:**
```bash
curl http://localhost:3000/report/661f3a2b4c5d6e7f8a9b0c1d -o report.csv
```

---

### 3. `GET /report/:runId/summary`

Get the JSON summary of a reconciliation run.

**Response** (`200 OK`):
```json
{
  "runId": "661f3a2b4c5d6e7f8a9b0c1d",
  "status": "completed",
  "config": {
    "timestampToleranceSeconds": 300,
    "quantityTolerancePct": 0.0001
  },
  "summary": {
    "matched": 20,
    "conflicting": 2,
    "unmatchedUser": 0,
    "unmatchedExchange": 3,
    "flaggedRows": 4
  }
}
```

**Example:**
```bash
curl http://localhost:3000/report/661f3a2b4c5d6e7f8a9b0c1d/summary
```

---

### 4. `GET /report/:runId/unmatched`

Get only unmatched entries (user-only and exchange-only) with reasons.

**Response** (`200 OK`): JSON array of unmatched rows.

**Example:**
```bash
curl http://localhost:3000/report/661f3a2b4c5d6e7f8a9b0c1d/unmatched
```

---

## Configuration

All tolerances are configurable without code changes — via `.env` or the `/reconcile` request body.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `MONGODB_URI` | — | MongoDB connection string (required) |
| `TIMESTAMP_TOLERANCE_SECONDS` | `300` | Max allowed timestamp difference in seconds for a match (default: 5 minutes) |
| `QUANTITY_TOLERANCE_PCT` | `0.0001` | Max allowed quantity difference as a fraction (0.0001 = 0.01%) |
| `LOG_LEVEL` | `info` | Winston log level: `error`, `warn`, `info`, `debug` |

---

## Data Quality Handling

Every row from both CSV files is validated during ingestion. Invalid rows are **flagged with a reason but never dropped** — they are stored in MongoDB with `isValid: false` and appear in the report under the `FLAGGED` category.

| Issue | Flag Reason | Effect |
|---|---|---|
| Duplicate `transaction_id` within same source | `Duplicate transaction_id` | Excluded from matching |
| Malformed timestamp (e.g. `2024-03-09T`) | `Malformed timestamp` | Excluded from matching |
| Missing timestamp | `Missing timestamp` | Excluded from matching |
| Negative quantity | `Negative quantity` | Excluded from matching |
| Missing required fields | `Missing required field: <field>` | Excluded from matching |

All flagged rows are visible in the CSV report for manual review.

---

## Key Design Decisions

### 1. TRANSFER_IN / TRANSFER_OUT Equivalence

A `TRANSFER_OUT` on the user side is the same physical transaction as a `TRANSFER_IN` on the exchange side — just seen from opposite perspectives. Both types are normalized to `TRANSFER` internally before matching, so these pairs reconcile correctly.

### 2. Invalid Rows Are Flagged, Not Dropped

Silently dropping bad rows would hide data quality issues. Every row — valid or not — is stored in MongoDB with its original data and a human-readable reason for any issues. This creates a complete audit trail and makes upstream data problems visible.

### 3. Strict 1-to-1 Matching

Once a transaction is matched, it is locked and cannot match again. This prevents double-counting in financial reconciliation, which would lead to incorrect tax calculations — a core concern at KoinX.

### 4. Asset Alias Normalization at Ingestion Time

Users may record assets as `bitcoin`, `BTC`, or `Bitcoin`. The engine normalizes all asset names to canonical uppercase tickers (`BTC`, `ETH`, `SOL`, `MATIC`) during ingestion, so matching always compares apples to apples.

### 5. Matched vs Conflicting

After a candidate pair is found (within timestamp and quantity tolerances):
- **MATCHED** — quantity, price, and fee all agree
- **CONFLICTING** — the pair is identified as the same transaction, but one or more fields differ beyond tolerance. The report includes exactly which fields differ and by how much (e.g., `Fee differs: user=0.0015, exchange=0.002 (diff=33.3%)`), enabling targeted investigation.

### 6. Each Run is Independent and Idempotent

Every call to `POST /reconcile` creates a new run with a unique `runId`. Historical runs are preserved in MongoDB. This allows comparison across runs with different tolerance settings and provides a full audit history.

---

## Project Structure

```
koinx-reconciliation-engine/
├── src/
│   ├── config/
│   │   ├── db.js                    # MongoDB connection
│   │   └── tolerance.js             # Tolerance config loader
│   ├── models/
│   │   ├── Transaction.js           # Transaction schema (valid + flagged rows)
│   │   └── ReconciliationRun.js     # Run tracking schema
│   ├── services/
│   │   ├── ingestion.service.js     # CSV parsing + validation
│   │   ├── matching.service.js      # Core matching algorithm
│   │   └── report.service.js        # CSV report generation
│   ├── routes/
│   │   └── reconcile.routes.js      # All 4 API endpoints
│   ├── utils/
│   │   ├── assetAliases.js          # Asset name normalization map
│   │   ├── typeMapping.js           # TRANSFER_IN/OUT equivalence
│   │   └── logger.js                # Winston logger setup
│   └── app.js                       # Express entry point
├── data/
│   ├── user_transactions.csv        # User-side input data
│   └── exchange_transactions.csv    # Exchange-side input data
├── reports/                         # Auto-generated CSV reports (git-ignored)
├── logs/                            # Application logs (git-ignored)
├── .env                             # Environment config (git-ignored)
├── .env.example                     # Safe-to-commit env template
├── .gitignore
├── package.json
└── README.md
```

---

## License

ISC