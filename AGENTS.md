# Agent Notes

## Repo shape
- This repo has two independent npm projects: `extension/` (Chrome extension) and `landing_page/` (marketing site).
- There is no root workspace config or root scripts; run installs/checks inside the package you changed.

## Install and run
- `extension/`: `npm install`, then `npm run dev` (CRX dev build), `npm run preview:dev` (browser preview with Chrome API mock), `npm run build`, `npm test`.
- `landing_page/`: `npm install`, then `npm run dev`, `npm run lint`, `npm run build`, `npm run preview`.

## Focused verification
- Extension logic changes: run a targeted test file, e.g. `npm test -- tests/scheduler.test.ts`.
- Extension UI/manifest/background changes: run `npm run build` in `extension/` and reload unpacked extension from `extension/dist/`.
- Landing page changes: run `npm run lint && npm run build` in `landing_page/`.

## Extension architecture (non-obvious)
- Manifest entrypoints are wired directly to source files (`src/popup/popup.html`, `src/background/service-worker.ts`, `src/content/*.ts`, `src/dashboard/dashboard.html`) via `@crxjs/vite-plugin`.
- `src/engine/` is pure TS business logic and is what current tests cover; adapters/UI are not covered by Vitest.
- Service worker seeds `chrome.storage.local` with `MockSource` data on install; popup/dashboard state reads are message-based (`GET_STATE`, `UPDATE_ASSIGNMENTS`, `ADD_REWARD`).
- Keep `.js` suffixes on internal TS imports in `extension/src` (current code relies on ESM-style import specifiers like `../engine/types.js`).

## Preview and debugging quirks
- `extension/preview.html` loads `src/dev/main.tsx`, which must import `src/dev/chrome-mock.ts` first so dashboard UI can run outside Chrome extension context.
- Canvas and Classroom sync logic lives in content scripts (`src/content/canvas.ts`, `src/content/classroom.ts`) and only runs on matching host permissions in `manifest.json`.

## Conventions to preserve
- Formatting style differs by package: `extension/` currently uses single quotes + semicolons; `landing_page/` currently uses double quotes.
- Keep changes scoped to the touched package; do not assume cross-package shared tooling.
