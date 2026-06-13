# Cadence

**Prevent academic burnout by pacing your workload — not just tracking deadlines.**

Cadence is a Manifest V3 Chrome extension that forecasts your 13-day academic workload, detects incoming crunch periods before they happen, and rewards sustainable study habits with a coin system that deliberately earns zero for cramming.

---

## Three differentiators

1. **Crunch forecast, not just deadline list** — Cadence models both a "paced" schedule (load levelled across available days) and a "natural cram" schedule (back-loaded toward due dates) and shows you side-by-side bar charts. When the natural plan creates consecutive overload days (>4h), a Crunch Forecast banner tells you exactly when it starts and how bad the peak gets.

2. **Anti-grind reward system** — Coins are earned for early submission, paced daily load, rest protection, and smooth weeks. Cramming, working past 22:00, and exceeding the 4h daily cap earn exactly zero coins — by explicit design. A Recharge day (guilt-free rest) costs 40 coins and can only be unlocked by having been sustainable first.

3. **Drift detection** — The extension tracks cram events, late-night sessions, and over-cap days over a rolling 20-event window. It classifies your state as `steady`, `watch`, or `strained` and shows appropriate messaging. If `strained`, it links directly to Crisis Text Line.

---

## How to run

### Prerequisites
- Node.js 18+
- npm 9+

### Install dependencies
```bash
cd cadence
npm install
```

### Run tests
```bash
npm test
```

### Build for Chrome
```bash
npm run build
```

The extension is output to `dist/`.

### Load unpacked in Chrome
1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` directory
5. Click the Cadence icon in the toolbar — the popup opens immediately with mock seed data

---

## Engine architecture

All business logic lives in `src/engine/` and is completely DOM-free (pure TypeScript), making it fully unit-testable with Vitest.

### `types.ts`
Core data types: `Assignment`, `Zone` (healthy/tight/overload), `CrunchInfo`, `RewardEvent`, `DriftResult`, `Multipliers`.

### `estimator.ts`
- `PRIORS` — baseline hour estimates per assignment type (reading: 1.5h, essay: 4h, exam: 5h, etc.)
- `calcEst(type, estHours?, multipliers)` — returns rounded-to-half-hour estimate, using provided `estHours` or `prior × multiplier`
- `calibrate(type, estimated, actual, multipliers)` — Bayesian-style blend: `0.3 × (actual/estimated) + 0.7 × currentMultiplier`

### `scheduler.ts`
- `paced(items, horizon=13)` — greedy min-load scheduler: repeatedly assigns 0.5h chunks to the least-loaded day before each due date
- `natural(items, horizon=13)` — back-loads work toward due dates, simulating cram behaviour (cap 6h/day)
- `crunch(naturalLoad)` — scans for the longest consecutive run of overload days (>4h), returns start day, run length, and peak

### `rewards.ts`
Reward functions return `{ delta, label, reason }`. Positive rewards: `earlyBird` (8 coins/day, capped at 4 days = 32 max), `pacedDay` (6), `restProtected` (15), `smoothWeek` (25), `honestLog` (4). Zero-delta functions: `cram`, `overCap`, `lateNight`. `rechargeSpend` deducts 40 coins with balance check.

### `drift.ts`
`computeDrift(recentEvents)` counts cram/lateNight/overCap events in the last 20. Thresholds: 3+ crams or late nights → `strained`; 2+ overCap → `strained`; any single → `watch`.

---

## Data sources

| Source | How it works |
|--------|-------------|
| `MockSource` | Seed data with a deliberate day 9–11 cluster (essay + project + exam) to demonstrate crunch detection |
| `CanvasSource` | Fetches `/api/v1/planner/items` on `*.instructure.com` pages, guesses assignment type from title keywords |
| `ClassroomSource` | DOM scrape on `classroom.google.com` using `[data-coursework-id]` cards |

---

## Project structure

```
src/
  engine/         Pure TS business logic (estimator, scheduler, rewards, drift)
  adapters/       Data source adapters (Mock, Canvas, Classroom)
  background/     MV3 service worker — storage & message routing
  content/        Content scripts for Canvas and Classroom
  popup/          Extension popup (React + Tailwind)
  dashboard/      Options page dashboard with full forecast chart
  components/     Reusable React components (AssignmentList, RewardLog)
  styles/         Tailwind globals
tests/            Vitest unit tests for all engine modules
```
