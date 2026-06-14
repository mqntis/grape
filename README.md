# Grape

**Good things take time.**

Grape is a Manifest V3 Chrome extension that prevents academic burnout by pacing your workload instead of just tracking deadlines. It pulls your assignments from Google Classroom and Canvas, forecasts your 13-day workload, flags crunch periods before they hit, and rewards sustainable study with a coin system that deliberately earns nothing for cramming. This repository also contains the marketing landing page.

---

## What it does

1. **Crunch forecast, not just a deadline list.** Grape models two schedules side by side — a *paced* plan (load levelled across the days you have) and a *natural cram* plan (back-loaded toward due dates) — and renders them as bar charts. When the natural plan stacks consecutive overload days (>4h), a Crunch Forecast banner tells you when the crunch starts and how bad the peak gets.
2. **Anti-grind rewards.** Coins are earned for early submission, paced daily load, protected rest, and smooth weeks. Cramming, working past 22:00, and exceeding the 4h daily cap earn exactly zero — by design. A guilt-free Recharge day costs 40 coins and can only be unlocked once you've actually been sustainable.
3. **Drift detection.** A rolling 20-event window tracks cram events, late-night sessions, and over-cap days, classifying your state as `steady`, `watch`, or `strained`. When `strained`, the UI surfaces support and links to Crisis Text Line.

## How it works

1. Pulls assignments from Google Classroom and Canvas.
2. Turns them into a browser to-do list and a 13-day workload forecast.
3. Estimates each task's effort and assigns coin values, rewarding paced work rather than cramming.
4. Blocks distracting sites while you work.
5. Earn coins by working sustainably, then spend them on guilt-free breaks.

## Repository layout

This is a two-package monorepo with **no root workspace config** — install and run inside each package independently.

```
.
├── AGENTS.md          Contributor notes (per-package commands, conventions)
├── extension/         The Chrome extension (Manifest V3)
└── landing_page/      Marketing site (React + Vite)
```

## Tech stack

**Extension**
- Manifest V3 Chrome extension
- React 19 + TypeScript 6
- Vite 8 with `@crxjs/vite-plugin` 2 (wires manifest entrypoints straight to source)
- Tailwind CSS v4 via `@tailwindcss/postcss` + Autoprefixer
- Vitest 4 for unit tests (engine modules)
- `@types/chrome` for extension API types
- Site blocking via `declarativeNetRequest` dynamic redirect rules

**Landing page**
- React 19 + TypeScript 6
- Vite 8
- ESLint 10 (flat config) with `typescript-eslint` and React Hooks / React Refresh plugins

## Getting started

### Prerequisites
- Node.js 20+ and npm 10+ (a current LTS — the Vite 8 / Vitest 4 toolchain expects it)

### Extension

```bash
cd extension
npm install

npm run dev          # CRX dev build with HMR
npm run preview:dev  # browser preview using the Chrome API mock (src/dev)
npm test             # run Vitest once  (npm run test:watch to watch)
npm run build        # type-check + production build into dist/
```

Load it in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select `extension/dist/`
4. Click the toolbar icon — the popup opens with mock seed data immediately

### Landing page

```bash
cd landing_page
npm install

npm run dev      # dev server with HMR
npm run lint     # ESLint
npm run build    # type-check (tsc -b) + production build
npm run preview  # preview the production build
```

## Extension architecture

The business logic is intentionally DOM-free and lives in `src/engine/`, which is the only part covered by tests. UI and adapters sit on top of it.

```
extension/src/
├── engine/         Pure TS logic (types, estimator, scheduler, rewards, drift, index)
├── adapters/       Data sources behind a shared DataSource interface (Mock, Canvas, Classroom)
├── background/     MV3 service worker: storage, message routing, blocking rules
├── content/        Content scripts injected on Canvas and Classroom pages
├── popup/          Toolbar popup (React + Tailwind)
├── dashboard/      Options-page dashboard with the full forecast chart
├── components/     Shared React components (AssignmentList, ForecastChart, RewardLog)
├── dev/            Chrome API mock + entry for out-of-extension preview
├── styles/         Tailwind globals
├── blocked.html    Redirect target for blocked sites
└── blocked.ts
extension/tests/    Vitest suites: estimator, scheduler, rewards, drift
```

Key engine pieces:
- `estimator.ts` — baseline hour priors per assignment type plus a Bayesian-style `calibrate` that blends estimated vs actual time.
- `scheduler.ts` — `paced` (greedy least-loaded-day allocation), `natural` (cram simulation), and `crunch` (finds the longest run of overload days).
- `rewards.ts` — reward functions returning `{ delta, label, reason }`; cram / over-cap / late-night return zero by design; `rechargeSpend` deducts 40 coins.
- `drift.ts` — classifies recent behaviour as `steady` / `watch` / `strained`.

The service worker seeds `chrome.storage.local` with `MockSource` data on install, and the popup and dashboard read state via messages (`GET_STATE`, `UPDATE_ASSIGNMENTS`, `ADD_REWARD`).

## Data sources

| Source | How it works |
|---|---|
| `MockSource` | Seed data with a deliberate day 9–11 cluster (essay + project + exam) to demonstrate crunch detection |
| `CanvasSource` | Fetches `/api/v1/planner/items` on `*.instructure.com`, inferring assignment type from title keywords |
| `ClassroomSource` | DOM scrape on `classroom.google.com` using `[data-coursework-id]` cards |

## Configuration and permissions

The extension currently runs entirely on-device and needs no API keys or environment variables. Manifest permissions: `storage`, `alarms`, `tabs`, `scripting`, `declarativeNetRequest`. Host permissions cover Canvas, Google Classroom, and the sites eligible for focus blocking (Instagram, Discord, YouTube). Blocked sites are redirected to `src/blocked.html` via dynamic `declarativeNetRequest` rules.

## Conventions

- Keep `.js` suffixes on internal TS imports in `extension/src` (the code uses ESM-style specifiers like `../engine/types.js`).
- Formatting differs per package: `extension/` uses single quotes + semicolons; `landing_page/` uses double quotes.
- Keep changes scoped to the package you touch — there is no shared root tooling.

## Roadmap

- Tiered plans (Free, Plus, Premium)
- School and Chromebook site licenses
- Parent or peer accountability tracking
- ADHD-friendly features (for example, extra flexible breaks)

