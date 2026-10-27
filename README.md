# Wind Position

A web app for a UK utility's day-ahead power desk. It answers two questions for every purchase decision in January 2026:

1. **What did the wind forecast say when we had to commit?** The latest national wind forecast that existed at day-ahead gate closure, for each hour of the delivery day.
2. **How much should we trust it?** The forecast's error, measured against metered outturn, so purchases can allow for it.

- **Live app:** https://xq7wnd.vercel.app
- **Video walkthrough:** https://youtu.be/btVVRQrYlfQ

## What the January 2026 data shows

Computed from the live Elexon API (744 delivery hours, gate closure 09:50 UK time) and independently cross-checked (see [Verification](#verification)):

| Measure | Value |
| --- | --- |
| Mean absolute error | 2.0 GW |
| Root mean square error | 2.5 GW |
| Average miss (outturn − forecast) | −1.7 GW |
| 8 in 10 hours fall within | −4.2 GW to +0.5 GW of the forecast |

- **The forecast runs high.** The median hour delivered 1.5 GW less wind than forecast at gate closure. For a buyer this is the costly direction: under-buying, then covering the gap closer to delivery.
- **Day-ahead decisions use stale forecasts.** Gate closure falls 14–37 hours before the delivered hours. Error grows with lead time, from about 1.65 GW for forecasts 0–6 h ahead to 1.8–2.2 GW across the day-ahead window.
- **The 09:30 UTC publication is always the one in force** at 09:50 gate closure; it arrives 20 minutes before the decision.

A hypothesis worth testing with the client, not a conclusion: outturn (`FUELHH`) is metered output after any curtailment, while the forecast estimates generation from the weather, so constrained-off wind would show up as systematic over-forecasting.

## How it works

```
 Browser (React)                        FastAPI                              Elexon BMRS
┌──────────────────────┐  /api/*   ┌────────────────────────────┐  async  ┌─────────────────────┐
│ Delivery day view    │ ───────▶  │ routes (main.py)           │ ──────▶ │ FUELHH  (outturn)   │
│ Forecast accuracy    │           │ service.py  fetch-once+TTL │  httpx  │ WINDFOR (forecasts) │
│ TanStack Query cache │ ◀───────  │ analysis.py pure pandas    │ ◀────── │ /stream, 7-day      │
└──────────────────────┘   JSON    └────────────────────────────┘ retries │ chunks in parallel  │
                                                                           └─────────────────────┘
```

**Domain rules** (all in `backend/app/analysis.py`, all unit-tested):

- **Decision time** is gate closure of the GB day-ahead auction, 09:50 UK local time, converted to UTC per day so British Summer Time is handled. It's a request parameter, so the desk can ask "what if we had decided at 08:00?"
- **Delivery day** is the UK calendar day after the decision: 24 hours normally, 23 or 25 on clock-change days.
- **Forecast in force** for a target hour is the latest `WINDFOR` publication with `publishTime ≤ gate closure` that covers that hour. Selection is per hour, so a gap in the newest publication falls back to an older one.
- **Error** = outturn − forecast, matched on `startTime`. Forecasts are hourly and outturn half-hourly, so accuracy uses the hours where both exist. Negative means the forecast was too high.
- **Likely range** on the chart is the forecast plus the 10th and 90th percentile of all January gate-closure errors. It is in-sample: it describes January rather than predicting a new month.
- **Lead-time analysis** uses every forecast published for January delivery, bucketed by hours between publication and delivery.

**Design decisions**

- The backend fetches the pilot window once (two datasets, concurrent, chunked) and caches it with a TTL; an `asyncio.Lock` stops concurrent first requests from triggering duplicate fetches. Historical data is immutable, so responses carry `Cache-Control` for the CDN.
- Analysis code is pure functions over DataFrames with no I/O, so it is tested without mocks. HTTP concerns (retries, backoff, chunking, payload validation) live only in `elexon.py`.
- Elexon failures become a clear 502; out-of-scope dates a 404; malformed input a 422 from FastAPI's validation.
- The API service is created lazily rather than in an ASGI lifespan hook, because serverless runtimes don't always run lifespan events.
- The frontend keeps view state in the URL (`?view=accuracy&gate=08:00`), so any screen can be shared as a link. Charts plot GW so axes get round ticks in the unit shown. Pages are lazy-loaded so the charting library doesn't delay first paint.

## Repository layout

```
.
├── backend/                      FastAPI service (Python 3.13)
│   ├── app/
│   │   ├── main.py               App factory, routes, error handling, request logging/timing middleware
│   │   ├── config.py             Settings from environment variables (APP_*)
│   │   ├── elexon.py             Async Elexon client: chunking, retries with backoff, validation
│   │   ├── analysis.py           Pure domain logic: gate closure, forecast selection, error metrics
│   │   ├── service.py            Loads and caches data, assembles API responses
│   │   └── schemas.py            Pydantic response models (also the OpenAPI docs)
│   ├── tests/
│   │   ├── test_analysis.py      Domain rules incl. BST and clock-change days, real-data regression
│   │   ├── test_elexon.py        HTTP client against mocked Elexon (respx)
│   │   ├── test_api.py           Endpoints end to end with an in-memory data source
│   │   ├── test_live.py          Opt-in full-month check against the live API
│   │   └── fixtures/             Real BMRS data for one delivery day (2 Jan 2026)
│   ├── Dockerfile
│   ├── requirements.txt          Runtime dependencies (pinned)
│   ├── requirements-dev.txt      Test, lint and type-check tools (pinned)
│   └── pyproject.toml            pytest, ruff and mypy configuration
├── frontend/                     React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx               Shell, tabs, URL state
│   │   ├── api/                  Typed API client and TanStack Query hooks
│   │   ├── pages/                Delivery day and Forecast accuracy views
│   │   ├── components/           Gate-closure timeline, figures, controls, charts (Recharts)
│   │   ├── lib/                  Formatting (UK time, GW), axis ticks, URL state, chart theme
│   │   └── test/                 Test setup and fixtures generated from the real API
│   ├── Dockerfile                Build, then serve with nginx (proxies /api to the backend)
│   ├── nginx.conf
├── vercel.json                   Vercel Services: /api/* to the backend, everything else to the frontend
├── start.sh                      One-command local setup and run (macOS/Linux)
├── docker-compose.yml            Runs the whole product locally
└── .github/workflows/ci.yml      Lint, types, tests, build, Docker build + smoke test, weekly live check
```

## Running it

### Quickest: one command (macOS / Linux)

```bash
./start.sh
```

It creates a Python 3.12+ environment (using [uv](https://docs.astral.sh/uv/) if installed), installs both sides' dependencies, and starts the backend on :8000 and the frontend on http://localhost:5173. Ctrl+C stops both. If no suitable Python is found, it prints how to get one.

### With Docker

```bash
docker compose up --build
```

Open http://localhost:8080. The API and its interactive docs are at http://localhost:8000/docs. The first request takes a few seconds while January's data is fetched from Elexon; after that it's served from cache.

### For development

Backend (Python 3.12+):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload            # http://localhost:8000/docs
```

Frontend (Node 22+), in a second terminal:

```bash
cd frontend
npm ci
npm run dev                               # http://localhost:5173, proxies /api to :8000
```

Example API calls:

```bash
curl localhost:8000/api/meta
curl "localhost:8000/api/decisions/2026-01-14?gate_closure=09:50"
curl localhost:8000/api/accuracy
curl "localhost:8000/api/accuracy/horizon?bucket_hours=6"
```

## Testing and quality checks

```bash
# backend
cd backend
pytest                                   # 37 tests, no network
RUN_LIVE=1 pytest -m live                # full January back-test against the live API
ruff check . && ruff format --check .
mypy app                                 # strict mode

# frontend
cd frontend
npm test                                 # Vitest + Testing Library
npm run lint && npm run typecheck && npm run format:check
```

CI runs all of these on every push, builds both Docker images and smoke-tests the backend container. A weekly scheduled job runs the live back-test.

### Verification

The January figures were reproduced two independent ways: a separate JavaScript implementation run directly against the BMRS API, and this backend. `tests/test_live.py` asserts the backend matches those reference numbers to within 0.2 MW, and `tests/test_analysis.py` pins one real delivery day (MAE 3,157 MW on 2 Jan) from captured data so the check also runs offline.

## Deployment (Vercel)

The whole app deploys as **one Vercel project** using [Vercel Services](https://vercel.com/docs/services), configured by `vercel.json` at the repo root:

- `backend` (FastAPI, `backend/app/main.py`) receives every `/api/*` request, with the path unchanged.
- `frontend` (Vite static build) receives everything else.

Both live on one domain, so the browser calls the API same-origin with no CORS setup. To deploy: import the repository in Vercel with the root directory left at `./`; Vercel reads `vercel.json` and builds both services. Check `https://<project>.vercel.app/api/health`.

The backend image also runs unchanged on Heroku, Render or Fly (it honours `$PORT`).

## Limitations and next steps

- **Scope is national wind and January 2026**, as briefed. The date window is configuration (`APP_FIRST_DECISION_DATE`, `APP_LAST_DECISION_DATE`), not code.
- **The likely range is in-sample.** For live use it should come from a trailing window of past errors, ideally conditioned on lead time and forecast level, then checked for calibration (do 80% of hours actually land inside?).
- **Hourly vs half-hourly.** Accuracy compares the forecast hour with the half-hour starting on it. Averaging both half-hours is a reasonable alternative; it would be a one-function change.
- **Cache is per process.** Fine for a pilot; a shared store (Redis or a small Postgres table filled by a scheduled ingest job) would remove the cold-start fetch and support many instances.
- **Next for the desk:** turn the error distribution into a purchase recommendation (for example "buy wind shortfall cover at the P20 level"), and add solar and demand forecasts in the same frame.

## Use of AI tools

This project was built with help from Claude (Anthropic) as a pair-programming assistant: researching the Elexon API and GB market timing, drafting code and tests, and reviewing the UI from screenshots. I reviewed, ran and verified everything, including cross-checking the headline numbers with an independent implementation against the live API.
