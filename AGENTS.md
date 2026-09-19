# AGENTS.md

## Mission

Maintain **成语故事** as a small, local-first Chinese idiom storybook. The deployable product is a static browser application: canonical story data + image/audio assets + reader UI + local browser state.

## Hard boundaries

- Do not add authentication, accounts, cloud databases, server functions, SSR, API routes, multiplayer, analytics SDKs, or vendor preview bridges unless a concrete product requirement explicitly needs them.
- Do not reintroduce `@tanstack/react-start`, Nitro, Better Auth, PostgreSQL/PGlite/Kysely, or Grok Builder runtime code as generic infrastructure.
- Keep the deployable runtime static: Vite + React + TanStack Router + files under `public/`.
- The product in this repository is the commercial dual-hall illustrated storybook (`/` shelf + `IllustratedStoryReader`). Do not add three.js, paper pop-up books, `/study` rooms, or StoryComet-style 3D here.
- Do not silently rename story IDs, page IDs, or asset paths; these are persistence/content keys.
- Do not commit generated deployment output, screenshots, local workspace state, secrets, or `.env` files.
- Do not claim content provenance, copyright clearance, narration freshness, release readiness, or production readiness merely because files exist.

## Canonical content boundary

There is one live canonical content tier; browser/runtime adapters are **not** canonical sources.

- `content/published-stories.json` is the canonical text/page-structure source for all 100 official illustrated stories.
- `content/story-drafts/*.json` is a historical text snapshot from before those 76 Imagine titles were promoted. It is not the live catalog. `scripts/draft-story-catalog.mjs` must continue to report `draftCount: 0`.
- Official images live under `public/stories/<id>/`. Do not reintroduce `public/draft-stories/` as a runtime media root.
- Canonical Imagine release JPEGs live under `public/stories/`. The duplicate `content/imagine-drafts/` tree is not kept in git; byte identity is recorded in `content/evidence/story-images/imagine-drafts-origin.json`.
- `content/imagine-gongbi-jpeg/` is the committed 工笔 release set for 24 childOnly ids. PNG working masters under `content/imagine-gongbi/` are not kept in git. Dev/build syncs JPEGs to gitignored `public/classic-stories/<id>/`.
- `content/imagine-child-drafts/` is origin evidence for children's redraws of 古风馆 ids. Do not copy those JPEGs over 古风 art in `public/stories/`. Complete-8 drafts currently on the 儿童馆 shelf sync to gitignored `public/child-stories/<id>/`. Partial folders stay off the shelf.
- `scripts/story-model.mjs` directly parses `content/published-stories.json` for content checks, reports, narration planning/generation, and other production tooling.
- `src/data/stories.ts` is the full-body browser runtime adapter used by story routes. `src/data/story-catalog.ts` must stay empty.
- `scripts/runtime-story-index.mjs` derives the homepage shelf metadata from the canonical published model at build time.
- Vite injects that metadata as `__STORY_INDEX__`; `src/data/story-index.ts` is the browser adapter for the shelf only.
- The shelf index may contain only display metadata (`kind`, `id`, `title`, `pinyin`, `tagline`, `tone`, `hall`, and media `cover`). It must not become a second story-body source.
- `hall` is the live art line (`child` = 儿童馆, `classic` = 古风馆). It is not a second story id. `content/story-editions.json` lists published ids whose `public/stories/<id>/` art is currently the children's line; those same ids also appear in 古风馆 via the gongbi overlay. Complete children's redraws of 古风馆 ids appear in 儿童馆 via the child overlay. Runtime attribution must distinguish Grok Imagine overlays (`Created with Grok`) from later Cursor redraws. Remaining published ids stay 古风-only until a complete-8 redraw lands.
- Do not duplicate idiom ids to fake a 200-book catalog. When both art lines exist for one idiom, keep one id and select images with `?hall=`.
- Do not copy story text into generators, migrations, fixtures, tests, or one-off scripts. Tests that need synthetic data should derive it from canonical input or use deliberately synthetic fixture text.

## Active reader boundary

- The active routes use `IllustratedStoryReader` for all 100 official illustrated stories. Those books load `/stories/{id}/` images and gated `/audio/{id}/` narration.
- `DraftStoryReader` remains only as a fallback if a book is still classified as text. The live catalog currently has zero text books.
- The historical `StoryReader`, `HighlightedText`, heuristic character timing, WebAudio music, listening progress, and legacy settings modules have been removed from the active source tree.
- Do not reintroduce that retired reader state machine wholesale. If a useful interaction is needed later, implement it against the current reader architecture with current tests and release boundaries.
- Do not reconnect playback UI by checking whether an MP3 exists under `public/audio`.
- Narration playback may be exposed only through an explicit runtime-availability decision derived from technically current narration **and** satisfied release provenance.
- Preserve current reading, page navigation, mobile-safe-area, accessibility, and media-loading behavior unless the task explicitly changes UX.

## Content pipeline boundary

- `scripts/story-model.mjs` is the shared parser for the published canonical story model.
- `npm run content:check` must pass: referenced images/audio must exist, have valid file signatures, and the story/audio trees must not contain unreferenced orphan assets.
- `npm run content:report` is the deterministic machine-readable inventory for story/page counts, byte sizes, hashes, warnings, and asset issues.
- Narration planning is derived from canonical page text with SHA-256 fingerprints. `content/narration-state.json` records only narration generated/verified through the current pipeline.
- Existing MP3 files without a matching state entry are **unverified**, not current. Never fabricate or infer provenance for them.
- Do not restore duplicate story-text sources or historical bulk-generation scripts into the active pipeline.
- Narration generation must be explicitly scoped and must respect committed provider/runtime/encoder evidence. No silent bulk replacement of evidence-bound audio.
- API credentials stay in environment variables only. Never commit API keys, tokens, or generated secret-bearing logs.

## Narration production boundary

- Treat narration generation as a production transaction, not as a convenient rebuild step.
- Never use broad `--all --replace` behavior against evidence-bound narration.
- The verified `shou-zhu` pilot must remain byte-identical unless an explicit new review/evidence transaction supersedes it.
- A production batch must prove its exact input scope, durable receipts, text/audio hashes, provider profile, runtime environment, encoder profile, QC, staged-file accounting, and release gate before committing assets.
- A generated asset commit is not mergeable merely because synthesis completed; its exact diff and exact-head CI must still be verified.

## Source-lineage boundary

- `content/source-lineage.json` records exact historical origin for current release fingerprints; it is not a rights registry.
- `scripts/source-lineage.mjs` may recover origin only through exact Git blob identity or byte-identical canonical story source identity.
- A known Grok-export origin does **not** authorize public distribution. Rights remain governed by release provenance.
- Do not fill lineage from filenames, commit-message guesses, model assertions, or visual similarity.
- If a current asset fingerprint changes, the old lineage entry becomes stale and normal CI must fail until it is recovered or removed.
- `npm run source:recover` requires full Git history and is an explicit maintenance operation; normal CI uses only `npm run source:check`.
- See `content/LINEAGE.md` for the evidence model.

## Release provenance boundary

- `content/release-provenance.json` is an evidence registry for exact fingerprints; it is not a place to guess legal/rights status.
- `scripts/release-readiness.mjs` derives the release inventory from canonical story text, referenced `public/stories` images, committed children's overlay JPEGs under `content/imagine-child-drafts/`, committed 工笔 JPEGs under `content/imagine-gongbi-jpeg/`, narration, fonts, and product artwork. Overlay rights are a split claim (Cursor GenerateImage vs Grok Imagine overlays) and must not be merged into the 800-image Grok digest. 工笔 JPEG origin stays technical-origin-only (`rightsClaimApplied: false`). The Cursor 工笔 claim lives in `content/evidence/story-images/cursor-generate-image-gongbi-rights.json`; those JPEGs enter inventory as `gongbi-classic-image` and must not be merged into the 800-image Grok digest. Dual-hall `productReady` requires both overlay split claims and that 工笔 claim; a green inventory `release:check` is not dual-hall commercial clearance.
- Published/draft story text, `public/stories` image, children's overlay image, 工笔 classic-hall image, and narration provenance may be generated only from their dedicated durable evidence validators; this is still evidence-derived, not inferred from file presence.
- Missing evidence stays `unverified`. Never fill the registry merely to improve a coverage percentage.
- A provenance entry must contain a current SHA-256 fingerprint, an allowed claim (`owned`, `licensed`, `public-domain`, or `permission`), and durable evidence.
- Do not use `AI generated`, `downloaded from the internet`, `probably public domain`, repository presence, source-lineage status, or another agent's assertion as rights evidence.
- If an asset changes after evidence was recorded, the old entry becomes `stale`; normal CI must fail until that stale claim is removed or updated with evidence for the new fingerprint.
- Narration synchronization and narration distribution provenance are separate requirements. A technically current MP3 is not automatically release-cleared.
- `npm run provenance:check` belongs to normal development CI and fails on malformed/stale/invalid claims. `npm run release:check` is the fail-closed release gate and requires the complete release inventory to be verified/current.
- Do not weaken `release:check` to make the repository appear release-ready. See `content/PROVENANCE.md`.

## Homepage payload boundary

- The homepage shelf must consume `src/data/story-index.ts`, not `src/data/story-catalog.ts`.
- `scripts/runtime-story-index.mjs` must remain canonical-derived and metadata-only.
- Do not leak `meaning`, `moral`, `sections`, `pages`, `audio`, or page `image` data into the shelf index.
- Full story data belongs to the story route/runtime adapters, where TanStack route code splitting can isolate it from the shelf bundle.

## Offline/PWA boundary

- `public/sw.js` is a small product-owned service worker, not a framework runtime.
- Offline support covers the app shell, built static assets, and story images that were previously visited while online.
- Do not automatically cache `/audio/*` or HTTP Range responses. Narration files can be large and browsers may request byte ranges; full offline narration needs an explicit user-facing download/storage design.
- Cache cleanup must only delete keys owned by this application (`chengyu-storybook-*`), never every Cache Storage entry on the origin.
- Service-worker registration is progressive enhancement: a registration failure must not prevent online reading.

## CI boundary

- `.github/workflows/exact-head-ci.yml` is the observable gate for **pull requests targeting `main`** and **manual `workflow_dispatch`**. It does not run on `push` to `main` (the pack is large; do not re-add a same-repository main-push trigger).
- The exact-head gate runs Node 20/22, zero-warning lint, the complete project check, dependency audit, and Chromium desktop/mobile E2E before publishing the machine-readable `exact-head-ci` commit status.
- Playwright diagnostics are uploaded only on E2E failure; diagnostic artifacts must not change success semantics.
- Same-branch stale exact-head runs are canceled; do not add parallel workflows that duplicate the same PR/dispatch gate.
- `storybook-ci.yml` and `storybook-e2e.yml` exist only as read-only fork-PR validation. Do not re-add same-repository push triggers to them.
- Third-party GitHub Actions must be pinned to immutable commit SHAs, not floating tags.

## Required verification

Before claiming a change is complete, run:

```bash
npm run deps:inventory
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run content:check
npm run source:check
npm run provenance:check
npm run build
```

CI must pass on Node 20 and Node 22. Dependency audit must not report high/critical findings.

For changes that affect routing, the reader UI, media loading, responsive layout, PWA/offline behavior, or deployment behavior, also run:

```bash
npx playwright install chromium
npm run test:e2e
```

For story text, page structure, image, narration, font, or product-artwork changes, also inspect:

```bash
npm run content:report
npm run narration:plan
npm run source:report
npm run release:report
```

Before any public/content release claim, run:

```bash
npm run release:check
```

A failing release gate means the release claim is not supported yet; it is not a reason to bypass the check.

## Routing and deployment

Routes are file-based under `src/routes/` and generated through `@tanstack/router-plugin`. Static hosts must use an SPA fallback to `index.html` so direct navigation to `/story/<id>` works.

## Architecture changes

Prefer deleting unused infrastructure over keeping speculative abstractions. Add a service only when the product has a user-facing requirement that cannot be met by the static/local-first architecture.
