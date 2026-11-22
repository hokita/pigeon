# Audit Checks (pigeon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pigeon cannot merge a known high/critical vulnerability, anything that turns vulnerable after shipping fails a nightly run on `main`, and fixes arrive as Dependabot PRs.

**Architecture:** One fix PR (grpc-js override in `frontend`) lands first. Then one gates PR adds PR jobs to `ci.yml`, a new `audit-nightly.yml`, `dependabot.yml`, SHA/digest pins, and two small tested Node scripts. GitHub settings are switched on by the orchestrator via `gh api` around those PRs.

**Tech Stack:** npm 11 / Node 24.22.3, GitHub Actions, Trivy 0.76.2 (official image by digest), gcloud on the runner, `node:test` for scripts.

**Spec:** the cross-repo audit-checks design (2026-11-22, approved by the user) (pigeon rows of §5, §6, §7, §8, §9). The pigeon section of the survey report was used.

## Global Constraints

- High+ = HIGH or CRITICAL. No `--ignore-unfixed`, `|| true`, `continue-on-error`, audit-level tricks, or dropped directories.
- No code comments, no lint/type ignores. SHA pins carry no `# vX` comment.
- No exception file unless the user approves an entry (then §6: `.github/audit-exceptions.yml`, `{id, package, reason, expires ≤ 90 days, approved}`, filtered by a TDD'd script). Never add one yourself.
- Trivy runs only as `aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb` (released 2026-11-05, after GHSA-69fq-xp46-6x23; only 0.69.4 was malicious). Never `trivy-action` / `setup-trivy`.
- Nightly uses the deploy workflows' WIF secrets (`WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`), `permissions: contents: read, id-token: write`. No new secrets, no new identifiers in files (project ID, region, service name are already in `backend.yml`; the image digest is read at run time).
- Node pins stay 24.22.3 everywhere, enforced by `scripts/check-node-pins.sh`.
- Workers never merge or comment. Merging deploys (path filters).

## Today's findings (2026-11-22, `npm audit --package-lock-only`)

| Dir | Prod high+ | All high+ | Notes |
|---|---|---|---|
| backend | 0 | 0 | 19 moderate (dev) |
| frontend | 4 | 4 | one chain: `@grpc/grpc-js@1.9.16` (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4, both ≤1.13.5) via `firebase@13.3.0` → `@firebase/firestore@4.20.0` (`~1.9.0`). firebase 13.4.0 still pins `~1.9.0`. 9 moderate |
| e2e | 0 | 0 | 14 moderate |

Override dry-run in a scratch copy: `"overrides": {"@grpc/grpc-js": "1.13.7"}` → `npm ls` shows only `1.13.7 overridden`, prod and full audit 0 high (lock diff +16/−6). `1.14.7` also clean but pulls `@grpc/proto-loader@0.8` (+34 lines); use **1.13.7**, the smallest fixed version.
`frontend/src` never imports `firebase/firestore` (only app/auth), so no test or page loads grpc-js.
Unknown until CI runs: Trivy findings in `node:24.22.3-alpine` (Alpine packages, the npm bundled in the image) and in the image's `node_modules`. No Go in pigeon, so no govulncheck.

Trivy on draft PR #5 (2026-11-22): 6 HIGH, all in the npm bundled in `node:24.22.3-alpine` (brace-expansion 5.0.9: CVE-2026-102276, CVE-2026-102278; undici 6.28.0: CVE-2026-109383, CVE-2026-109869, CVE-2026-19534, CVE-2026-87018). Alpine 3.24.4 and the app's `node_modules`: 0. Fixed by PR #8 (npm, npx and corepack removed from the runtime stage, owlet's shape with a `deps` stage), proven red/green on throwaway PR #7. The Dockerfile now has 3 `FROM` lines, all digest-pinned.

---

## Phase 0 — settings before any PR (orchestrator, `gh api`)

- `gh api -X PUT repos/hokita/pigeon/vulnerability-alerts` (today: 404 = off). Done when it returns 204 and `gh api repos/hokita/pigeon/dependabot/alerts --jq 'length'` lists the grpc-js alert(s).
- Do **not** turn on security updates yet.

## PR 1 — `fix/grpc-js-override` (from origin/main)

### Task 1: Override grpc-js in frontend

**Files:** Modify `frontend/package.json` (add top-level `"overrides": {"@grpc/grpc-js": "1.13.7"}`), `frontend/package-lock.json` (via `npm install` in `frontend`).

Behaviour does not change (no code), so the red/green here is the audit itself:

- [ ] **Red:** `cd frontend && npm audit --omit=dev --audit-level=high` → exit 1, 4 high.
- [ ] Add the override, `npm install`, commit lock + manifest.
- [ ] **Green:** same command → exit 0; `npm audit --audit-level=high` → exit 0; `npm ls @grpc/grpc-js` → only `1.13.7 overridden`.
- [ ] Full verification, all must pass: frontend `npm ci && npm run lint && npm run format:check && npx tsc --noEmit && npm test && npm run build`; backend `npm ci && npm run lint && npm run format:check && npx tsc --noEmit && npm test && npm run test:db && npm run build`; e2e `npm ci && npx tsc --noEmit && npm test && npm run test:servers-stopped`; `scripts/check-node-pins.sh`.
- [ ] `grep -rl "grpc" frontend/dist` and record the result (expected: none).
- [ ] PR body states: audit before/after, the `npm ls` output, the suites run, the dist grep, and plainly that **no test exercises grpc-js** because the frontend never imports Firestore; the override is proven only by "installs, builds, tests pass, not in the bundle".
- [ ] Merge (orchestrator) deploys the frontend via `frontend.yml`; watch it.

## PR 2 — `chore/audit-gates`

Open as a **draft first** (spec step 1) so Trivy runs on CI and lists image findings. Record them in this plan. If any high+ appear, stop and choose with the orchestrator: a separate fix PR (e.g. drop npm/npx from the runtime stage of `backend/Dockerfile`, or a newer patched base), or, only if no fix exists, ask the user for an exception entry. Rebase onto main after PR 1 (and any image fix) merges; all jobs must be green before it leaves draft.

### Task 2: Node pin check requires a digest-pinned base

**Files:** Modify `scripts/check-node-pins.sh`, `backend/Dockerfile`. Create `scripts/check-node-pins.test.mjs`.

- [ ] **Failing tests** (`node:test`; each copies `scripts/check-node-pins.sh`, `backend/Dockerfile`, `.github/workflows/*.yml`, and the three `package.json` into a temp dir with the same layout, mutates it, runs the copied script):
  - `accepts FROM node:24.22.3-alpine@sha256:<64 hex> in every stage` → exit 0
  - `rejects a FROM without a digest` → exit 1, stdout contains `wrong Dockerfile FROM`
  - `rejects a short or uppercase digest` → exit 1
  - `rejects a digest-pinned FROM with another version` (`node:24.22.1-alpine@sha256:…`) → exit 1
- [ ] Run `node --test 'scripts/*.test.mjs'` → first test fails.
- [ ] Change the FROM pattern to `^FROM node:${v}-alpine@sha256:[0-9a-f]{64}( AS [a-z]+)?$`; pin all three `FROM` lines to `node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5` (re-resolve the index digest at implementation time and use that).
- [ ] Tests pass; `scripts/check-node-pins.sh` passes on the real tree. Commit.

### Task 3: Action pin check

**Files:** Create `scripts/check-action-pins.mjs`, `scripts/check-action-pins.test.mjs`.

**Produces:** `export function unpinnedUses(text: string): Array<{ line: number, ref: string }>`; CLI `node scripts/check-action-pins.mjs` scans `.github/workflows/*.yml`, prints `file:line ref` per hit, exits 1 if any, else prints `All actions are pinned by SHA` and exits 0.

- [ ] **Failing tests:**
  - `owner/repo@<40 hex>` and `- uses: owner/repo/path@<40 hex>` → `[]`
  - quoted `uses: 'owner/repo@<40 hex>'` and `"…"` → `[]`
  - `uses: ./local-action` → `[]`
  - `uses: actions/checkout@v4`, `@main`, `@<39 hex>`, `@<40 HEX>` → each reported with its 1-based line number
  - `uses: docker://alpine:3` → reported; `docker://alpine@sha256:<64 hex>` → `[]`
  - CLI on a temp dir with one tag-pinned file exits 1 and prints `file:line`.
- [ ] Run → fail. Implement. Run → pass. Commit.

### Task 4: Node security-release check

**Files:** Create `scripts/node-security.mjs`, `scripts/node-security.test.mjs`.

**Produces:** `export function newerSecurityReleases(current: string, index: Array<{ version: string, security: boolean }>): string[]` — versions in the same major, strictly newer than `current`, with `security: true`, newest first. Both `v24.1.0` and `24.1.0` are accepted for `current`. CLI `node scripts/node-security.mjs --current <v> --index <path to nodejs.org/dist/index.json>`: exit 0 with `Node <current> is the latest security release of v<major>`; exit 1 with `Production runs Node <current>; security release(s) <list> exist. Rebuild and redeploy the backend.`

- [ ] **Failing tests:** current newest → `[]`; newer non-security only → `[]`; newer security in same major → listed, newest first; newer security only in another major → `[]`; older security releases → `[]`; `24.22.10` vs `24.22.9` compares numerically; CLI exit codes and messages with a fixture index.
- [ ] Run → fail. Implement. Run → pass. Commit.

### Task 5: PR gate jobs in `ci.yml` + SHA pins everywhere

**Files:** Modify `.github/workflows/ci.yml`, `backend.yml`, `frontend.yml`, `firestore-rules.yml`, `scripts/check-node-pins.sh` (setup-node count), `README.md` (scripts list).

New jobs (names are the required-check names):
- `prod-audit`, `name: Prod audit (${{ matrix.dir }})`, matrix `dir: [backend, frontend]`, `fail-fast: false`: checkout, setup-node 24.22.3, `npm audit --omit=dev --audit-level=high` in `matrix.dir` (lockfile-based; no install).
- `image-scan`, `name: Image scan (backend)`: `docker build -t pigeon-backend:ci backend`, then `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock <trivy image@digest> image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 pigeon-backend:ci`.
- `action-pins`, `name: Action pins`: setup-node, `node scripts/check-action-pins.mjs`.
- `script-tests`, `name: Script tests`: setup-node, `node --test 'scripts/*.test.mjs'`.

- [ ] Pin every `uses:` to a 40-char SHA of the **current major** (no version jumps in this PR; Dependabot proposes majors later). Values resolved 2026-11-22, re-resolve with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`: checkout v4 `11d5960a326750d5838078e36cf38b85af677262`, setup-node v4 `49933ea5288caeca8642d1e84afbd3f7d6820020`, setup-java v4 `cf277c60eb25467037889841efdb72551f06f6c3`, upload-artifact v4 `ea165f8d65b6e75b540449e92b4886f43607fa02`, google-github-actions/auth v3 `7c6bc770dae815cd3e89ee6cdf493a5fab2cc093`, docker/setup-buildx-action v3 `8d2750c68a42422c14e847fe6c8ac0403b4cbd6f`, docker/build-push-action v6 `10e90e3645eae34f1e60eeb005ba3a3d33f178e8`.
- [ ] Set the setup-node count in `check-node-pins.sh` to the real total: 9 after this task (6 today + 3 in ci.yml), 13 after Task 6 adds 4 in the nightly. Script tests still pass because they copy the real tree.
- [ ] Verify: `node scripts/check-action-pins.mjs` exit 0; `scripts/check-node-pins.sh` exit 0; `node --test 'scripts/*.test.mjs'` pass; push and all CI jobs green (Frontend, Backend, E2E, Node pins + 4 new).
- [ ] Commit.

### Task 6: `audit-nightly.yml` and `dependabot.yml`

**Files:** Create `.github/workflows/audit-nightly.yml`, `.github/dependabot.yml`.

Nightly: `name: Audit (nightly)`, `on: schedule: cron '25 18 * * *'` + `workflow_dispatch`, permissions as in Global Constraints. Jobs (separate, `fail-fast: false`):
- `prod-audit` (backend, frontend) and `dev-audit` `name: Dev audit (${{ matrix.dir }})` matrix `[backend, frontend, e2e]` running `npm audit --audit-level=high`.
- `action-pins` as in ci.yml.
- `deployed-image`, `name: Deployed image (backend)`, `if: github.ref == 'refs/heads/main'`: auth (same step as `backend.yml`), `gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet`; `rev=$(gcloud run services describe pigeon-backend --region asia-northeast1 --format='value(status.latestReadyRevisionName)')`; `img=$(gcloud run revisions describe "$rev" --region asia-northeast1 --format='value(status.imageDigest)')`; `docker pull "$img"`; Trivy as in ci.yml on `"$img"`; then `v=$(docker run --rm --entrypoint node "$img" --version)`, `curl -fsS https://nodejs.org/dist/index.json -o "$RUNNER_TEMP/index.json"`, `node scripts/node-security.mjs --current "$v" --index "$RUNNER_TEMP/index.json"`. Trivy and the Node check are separate steps; the Node step runs `if: always()` after the pull so a Trivy failure doesn't hide it.

dependabot.yml (`version: 2`):
- `npm`, `directories: ["/backend", "/frontend", "/e2e"]`, weekly, `open-pull-requests-limit: 0`.
- `docker`, `directories: ["/backend"]`, weekly, `groups: {docker: {patterns: ["*"]}}`, `ignore: [{dependency-name: node, update-types: ["version-update:semver-major"]}]` (Node 26 is out of scope).
- `github-actions`, `directories: ["/"]`, weekly, `groups: {github-actions: {patterns: ["*"]}}`.

- [ ] Verify: `node scripts/check-action-pins.mjs` and `scripts/check-node-pins.sh` pass with the new file; locally `npm audit --package-lock-only --audit-level=high` in all three dirs exit 0 (that is what dev-audit runs). The nightly can't be dispatched before it exists on main, and the WIF provider only accepts `refs/heads/main`, so its first real run is after merge.
- [ ] Commit.

### Task 7: Red once, then green

- [ ] From the gates branch, push a throwaway branch `demo/audit-red` that (a) removes the grpc-js override from `frontend/package.json` + lock, and (b) sets only the runtime (last) `FROM` to `node:20.0.0-alpine@sha256:<its digest>` (changing every stage breaks `docker build`, since TypeScript fails on Node 20, so Trivy never runs). Open it as a draft PR against main **without** a description beyond "throwaway red demo, never merged".
- [ ] Expect red: `Prod audit (frontend)` (grpc-js) and `Image scan (backend)` (old Node/Alpine). Node pins also red, expected. Record the run URL.
- [ ] Close that PR and delete the branch. Gates PR shows all jobs green; its body links the red run.
- [ ] Merge (orchestrator) triggers all three deploy workflows (their files changed); watch them. Then `gh workflow run audit-nightly.yml --ref main`; done when that run is green.

**Done:** red demo run 45020270542 on throwaway PR #9 (closed, branch deleted): `Image scan (backend)` failed on a real Trivy result, `Total: 10 (HIGH: 10, CRITICAL: 0)` in alpine 3.17.3; `Prod audit (frontend)` failed on grpc-js (4 high); `Node pins` red as expected. Run 45019968061 is not evidence: its image red was a build failure. The green run on the rebased PR is 45020270542's counterpart, run 45019935238 (9/9).

## Phase 4 — settings after PR 2 merges and the first nightly is green (orchestrator, `gh api`)

1. Security updates: `gh api -X PUT repos/hokita/pigeon/automated-security-fixes`.
2. Secret scanning, then push protection: `gh api -X PATCH repos/hokita/pigeon -f 'security_and_analysis[secret_scanning][status]=enabled' -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'`.
3. Ruleset: `gh api -X POST repos/hokita/pigeon/rulesets` with corgi's "Protect main" shape (target branch, `~DEFAULT_BRANCH`, active, no bypass; rules `deletion`, `non_fast_forward`, `pull_request` with 0 approvals) plus `required_status_checks` (`strict_required_status_checks_policy: false`): `Frontend`, `Backend`, `E2E`, `Node pins`, `Action pins`, `Script tests`, `Prod audit (backend)`, `Prod audit (frontend)`, `Image scan (backend)`.
- Done when each reads back through `gh api repos/hokita/pigeon` / `.../rulesets/<id>` and a test PR lists the nine checks as Required.

## Review Focus

1. Trivy silently scanning nothing (wrong image name, DB download error) must fail, not pass → Task 7's red image-scan demo proves the job can go red.
2. Weekly Dependabot docker PR that changes only the digest must pass Node pins; one that changes the version must fail until every pin matches → Task 2 tests.
3. Dependabot must not open a Node 26 base-image PR → `ignore` semver-major in Task 6.
4. Node check with other majors, non-security newer releases, numeric patch compare → Task 4 tests.
5. `uses:` written quoted, as reusable workflows, as `docker://` → Task 3 tests.

## Risks to flag

- Enabling secret scanning will likely raise an alert on the Firebase **web** API key already committed in `frontend.yml` (public by design). The user decides how to close it.
- The first weekly grouped github-actions PR will jump several majors at once (checkout v4→v7, setup-node v4→v7, setup-java v4→v6, upload-artifact v4→v7, buildx v3→v4, build-push v6→v7) and touches deploy workflows, so merging it deploys. Review it like any other PR.
- Trivy findings in the base image are unknown until the draft PR runs; they may add a fix PR before the gates PR.
