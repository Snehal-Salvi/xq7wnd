# Demo video script

Two parts, under 10 minutes total. Record the screen with the deployed app open; speak to the timings, not the exact words.

---

## Part 1: For the client (about 4½ minutes)

**Goal:** show the desk that the pilot answers their two questions with their own data, and leave them with one memorable finding.

**0:00 – 0:30 · The problem in their words**
> "Every morning before 09:50 your desk commits to tomorrow's day-ahead purchase. Whatever wind doesn't deliver, you buy later, usually at a worse price. So two things matter: what the wind forecast said at that moment, and how far you can trust it. This pilot replays every one of your January 2026 decisions to answer both."

**0:30 – 2:00 · Delivery day view** (open `?date=2026-01-14`)
- Point at the timeline strip: forecast published 09:30, gate closure 09:50, then the delivery day. "Every hour you're buying was forecast 14 to 37 hours ahead. That's the forecast you're actually exposed to, not tomorrow morning's better one."
- The three figures: which forecast was in force, the forecast energy, and the likely range per hour.
- The chart: blue is the forecast you bought against, the shaded band is where outturn usually lands, orange is what actually happened.
- Step a few days with the arrows. Pick a day with a big miss and read the "Wind short of forecast" figure: "that's the energy you'd have had to source later."

**2:00 – 3:45 · Forecast accuracy view**
- Read the headline sentence aloud. That sentence is the finding.
- Figures: 2.0 GW typical miss, and on balance the forecast is **1.7 GW too high**. "This isn't random noise you can ignore: it leans one way, and it's the expensive way for a buyer."
- Daily chart: "some days are much worse; click any bar to open it."
- Lead-time chart: "fresher forecasts are better, but your decision is locked into the shaded window."
- Change gate closure to 08:00, then back: "you can test what an earlier or later decision would have meant."

**3:45 – 4:30 · What this means and next step**
> "Three takeaways: you can now see exactly what you knew at each decision; the forecast's error is quantified; and it is biased high, so a plain forecast-based purchase systematically under-buys. Next we'd suggest turning the error into a cover recommendation, for example buying to a chosen percentile, and adding solar and demand."

---

## Part 2: For the tech lead (about 4½ minutes)

**Goal:** make the review easy: architecture, where the logic lives, how it's verified, what I'd change.

**0:00 – 0:45 · Architecture** (README diagram)
- React + TypeScript frontend, FastAPI backend, Elexon BMRS as the only source. Two Vercel projects; the frontend rewrites `/api` to the backend so it's same-origin. Docker Compose runs the same shape locally.

**0:45 – 2:15 · Backend walkthrough**
- `elexon.py`: async httpx client; `/stream` endpoints fetched in 7-day chunks concurrently; retry with exponential backoff on 429/5xx and transport errors only; pydantic validation of payloads; upstream failure becomes `UpstreamError`, which the app maps to a 502.
- `analysis.py`: pure functions, no I/O. Show `decision_time_utc` (BST-aware), `delivery_window_utc` (23/25-hour days) and `forecast_at_decision` (latest publish ≤ gate closure, per target hour). Error sign convention.
- `service.py`: fetch once with TTL; an asyncio lock stops a cold-start stampede. Assembles the views.
- `main.py`: routes, validation (404 out of scope, 422 malformed), request-id and timing middleware with structured log lines, cache headers. Show `/docs`.

**2:15 – 3:15 · Verification**
- Tests: domain rules including BST and clock-change days; HTTP client with respx (chunking, retries, bad payloads); API end to end with an in-memory source; one real delivery day captured from BMRS as a regression fixture.
- The headline numbers were reproduced by an independent JavaScript implementation against the live API; `test_live.py` asserts the backend matches, and CI runs it weekly.
- Quality gates in CI: ruff, mypy strict, Prettier, ESLint, tsc, Vitest, Docker build plus container smoke test.

**3:15 – 4:00 · Frontend**
- TanStack Query (infinite staleTime: historical data), URL as state so views are linkable, lazy-loaded pages, charts plot GW with computed round ticks, HTML legend, data table for accessibility, light and dark themes.
- Frontend tests run on fixtures generated from the real API responses, so the contract can't drift silently.

**4:00 – 4:30 · Trade-offs and next steps**
- In-sample uncertainty band; hourly vs half-hourly matching; per-process cache. Next: scheduled ingest into a shared store, trailing-window calibrated bands, more datasets.
