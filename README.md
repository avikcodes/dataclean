```markdown
# DataClean 🧹

> Upload any messy CSV. Download a clean one.

Stop wasting hours manually cleaning data before training.
DataClean automatically detects and fixes every common data quality issue
and gives you a visual before/after report showing exactly what changed.

![demo](demo.gif)

---

## The Problem

```
You download a dataset.
You open it in pandas.
You see NaN everywhere.
You spend 3 hours writing cleaning code.
You realize you missed the outliers.
You retrain. Still bad results.
You find duplicate rows you never noticed.
```

**DataClean handles all of this in seconds.**

---

## What Gets Fixed

| Issue | How DataClean fixes it |
|-------|----------------------|
| 🔴 Duplicate rows | Detected and removed automatically |
| 🟡 Missing numeric values | Filled with column median |
| 🟡 Missing categorical values | Filled with column mode |
| 🟠 Outliers | Capped using IQR bounds |
| 🔵 Inconsistent text | Stripped whitespace + lowercased |

---

## How It Works

```
┌──────────────────────────────────────────────────────┐
│                      USER                            │
│            Uploads messy CSV file                    │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│             Next.js Frontend                         │
│   Reads file → encodes base64 → opens WebSocket      │
└─────────────────────┬────────────────────────────────┘
                      │ ws://localhost:8000/ws/clean
                      ▼
┌──────────────────────────────────────────────────────┐
│           Python FastAPI Backend                     │
│                                                      │
│  1. Check Upstash Redis cache (MD5 hash)             │
│     ↓ cache miss                                    │
│  2. Parse CSV with pandas                            │
│  3. Remove duplicate rows                            │
│  4. Fill missing values (median/mode)                │
│  5. Cap outliers using IQR bounds                    │
│  6. Clean text columns                               │
│  7. Generate before/after comparison                 │
│  8. Generate AI cleaning report via Groq             │
│  9. Save session to Supabase                         │
│  10. Cache result in Redis (24hr TTL)                │
│  11. Return cleaned CSV as base64                    │
└─────────────────────┬────────────────────────────────┘
                      │ WebSocket progress messages
                      ▼
┌──────────────────────────────────────────────────────┐
│          Real-time Progress Bar                      │
│  Checking cache → Parsing → Duplicates →             │
│  Missing values → Outliers → Text → Complete         │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│    Visual Before/After Dashboard + Download          │
└──────────────────────────────────────────────────────┘
```

---

## Real-time Progress

```
Checking cache...        ████░░░░░░░░░░░░░░░░  10%
Parsing CSV...           ████████░░░░░░░░░░░░  20%
Removing duplicates...   ████████████░░░░░░░░  30%
Fixing missing values... ██████████████████░░  45%
Capping outliers...      ████████████████████  60%
Cleaning text columns... ████████████████████  70%
Generating report...     ████████████████████  80%
Saving to history...     ████████████████████  90%
Complete!                ████████████████████ 100%
```

---

## Outlier Detection Method

DataClean uses the **IQR (Interquartile Range)** method:

```
Q1 = 25th percentile
Q3 = 75th percentile
IQR = Q3 - Q1

Lower bound = Q1 - 1.5 × IQR
Upper bound = Q3 + 1.5 × IQR

Values outside bounds → capped to bound value
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 + TypeScript | UI and interactions |
| Styling | Tailwind CSS | Dark minimal aesthetic |
| Charts | Recharts | Before/after visualizations |
| Backend | Python FastAPI | Cleaning engine |
| Server | Uvicorn | ASGI server |
| Data | Pandas + NumPy | Cleaning logic |
| AI | Groq llama-3.1-8b-instant | Plain English report |
| Database | Supabase (PostgreSQL) | Session history |
| Cache | Upstash Redis | 24hr result caching |
| Realtime | WebSockets | Live progress streaming |

---

## Project Structure

```
DataClean/
├── app/
│   ├── page.tsx              ← Full UI + WebSocket client
│   ├── layout.tsx
│   └── globals.css
├── dataclean-api/
│   ├── main.py               ← FastAPI + WebSocket server
│   │   ├── clean_dataframe()     ← Core cleaning logic
│   │   ├── generate_comparison() ← Before/after stats
│   │   ├── generate_report()     ← Groq AI report
│   │   ├── get_cache()           ← Redis read
│   │   ├── set_cache()           ← Redis write
│   │   ├── save_to_supabase()    ← History storage
│   │   ├── /ws/clean             ← WebSocket endpoint
│   │   ├── /history              ← GET past sessions
│   │   └── /health               ← Health check
│   ├── requirements.txt
│   └── .env
├── .env.local
└── README.md
```

---

## API Reference

### WebSocket `/ws/clean`

**Send:**
```json
{
  "filename": "messy_data.csv",
  "data": "base64_encoded_file_content"
}
```

**Receive (progress):**
```json
{"step": "Removing duplicates...", "progress": 30}
{"step": "Fixing missing values...", "progress": 45}
```

**Receive (final):**
```json
{
  "step": "Complete",
  "progress": 100,
  "session_id": "uuid",
  "cleaned_csv": "base64_encoded_clean_csv",
  "ai_report": "3 duplicate rows were removed...",
  "comparison": {
    "rows_before": 1000,
    "rows_after": 997,
    "duplicates_removed": 3,
    "missing_before": {"age": 45, "salary": 12},
    "missing_after": {"age": 0, "salary": 0},
    "outliers_capped": {"salary": 8, "age": 2},
    "text_cleaned": ["city", "name"],
    "columns_modified": ["age", "salary", "city", "name"]
  }
}
```

### GET `/history`

```json
[
  {
    "id": "uuid",
    "session_id": "uuid",
    "file_name": "messy_data.csv",
    "original_rows": 1000,
    "cleaned_rows": 997,
    "ai_report": "3 duplicates removed...",
    "created_at": "2026-04-01T12:00:00"
  }
]
```

---

## Database Schema

```sql
create table cleaning_sessions (
  id uuid default gen_random_uuid() primary key,
  session_id text not null,
  file_name text not null,
  original_rows int,
  cleaned_rows int,
  changes_made jsonb,
  ai_report text,
  created_at timestamp default now()
);
```

---

## Caching Strategy

```
First upload:
CSV → MD5 hash → Redis lookup → MISS
→ Full cleaning pipeline
→ Store result in Redis with 24hr TTL

Same file again:
CSV → MD5 hash → Redis lookup → HIT
→ Return instantly (< 100ms)
→ No reprocessing
```

---

## Example — Messy Dataset

Input CSV:
```
name,age,salary,city
John,25,50000,new york
Jane,,60000,NEW YORK
John,25,50000,new york
Bob,30,,london
Alice,999,70000,LONDON
,28,45000,paris
```

Output after DataClean:
```
name,age,salary,city
john,25,50000,new york
jane,27,60000,new york
bob,30,55000,london
alice,28,70000,london
,28,45000,paris
```

What was fixed:
```
✅ 1 duplicate row removed (John, 25, 50000, new york)
✅ Age missing → filled with median (27)
✅ Salary missing → filled with median (55000)
✅ Age outlier (999) → capped to IQR upper bound (28)
✅ City text → lowercased and stripped
✅ Name text → lowercased and stripped
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10–3.13
- Groq API key — free at console.groq.com
- Supabase project — free at supabase.com
- Upstash Redis — free at upstash.com

### Installation

```bash
git clone https://github.com/avikcodes/DataClean
cd DataClean
```

**Frontend:**
```bash
npm install
```

**Backend:**
```bash
cd dataclean-api
pip install -r requirements.txt
```

### Environment Setup

**dataclean-api/.env:**
```
GROQ_API_KEY=your_groq_key
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

**DataClean/.env.local:**
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Run

**Terminal 1 — Backend:**
```bash
cd dataclean-api
uvicorn main:app --reload
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

Open `http://localhost:3000`

---

## Roadmap

- [x] Duplicate row removal
- [x] Missing value imputation (median/mode)
- [x] Outlier capping (IQR method)
- [x] Text normalization
- [x] Real-time WebSocket progress
- [x] Before/after visual comparison
- [x] Redis caching
- [x] Supabase session history
- [x] AI cleaning report
- [x] Download cleaned CSV
- [ ] Support Excel files (.xlsx)
- [ ] Custom cleaning rules
- [ ] Column-level cleaning options
- [ ] Export cleaning report as PDF
- [ ] API endpoint for programmatic access

---

## Part of 30 Projects

This is **Project 5 of 30** in my open-source build sprint.

Building 30 open-source AI and ML tools for developers and researchers — March to December 2026.

→ Follow on X: [@avikcodes](https://x.com/avikcodes)
→ All projects: [github.com/avikcodes](https://github.com/avikcodes)

---

## License

MIT — free to use, modify, and distribute.
```
