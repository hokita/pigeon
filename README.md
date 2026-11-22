# pigeon

pigeon is a personal web app that keeps what Muse (Meta's AI assistant) collects — news, research, price drops, anything — and shows each item as a rich page. Muse saves an item and a JSON component tree through an MCP tool; pigeon validates and stores both, then renders the stored tree with assistant-ui's generative UI components. Viewing an item never calls an LLM.

See the [design doc](docs/superpowers/specs/2026-11-15-pigeon-design.md).

## How it works

```
Muse ──MCP save_feed_item──► backend /mcp ──► validate item + UI tree ──► Firestore
                                                                            │
browser ◄── React page ◄── renderGenerativeUI(guarded tree) ◄── REST /api ◄─┘
```

Muse sends one item (its write-up, sources, optional products with prices) plus a JSON component tree, through the `save_feed_item` MCP tool. The backend checks the item strictly and the tree against an allowlist of assistant-ui components and limits. An invalid tree never loses the item: it's saved without a tree, and the tool returns the problems so Muse can fix them. Firestore stores the item, its tree (as JSON text), one price observation per product per item, and a count per item type. The React app reads items over a REST API that only the signed-in owner can use. It checks each stored tree again and renders it with `renderGenerativeUI` from `@assistant-ui/generative-ui`. The page frame around the tree is always pigeon's own: title, "Written by Muse", type, date and a Sources footer. Viewing an item never calls an LLM.

## Major files

| Path | What it does |
| --- | --- |
| `backend/src/mcp/server.ts`, `guide.ts` | The MCP server: `save_feed_item`, `get_ui_guide`, server instructions, per-call rate limit |
| `backend/src/items/input.ts` | `save_feed_item` input schema (published to Muse) and parsing: slugs, URLs, prices, dedupe key, content hash |
| `backend/src/ui/library.ts`, `validate.ts`, `limits.ts` | UI tree allowlist (official assistant-ui schemas, made strict, plus pigeon's caps) and validation |
| `backend/src/urls.ts` | Link/image URL safety and the generic product identity (`productKey` or canonical URL) |
| `backend/src/items/store.ts` | The save transaction: full replace on re-save, observations, product fields, stored price change, type counts |
| `backend/src/items/read.ts`, `routes/items.ts` | Feed, type list and item detail (history up to the item's own observation) over REST |
| `backend/src/middleware/` | Firebase sign-in + `ALLOWED_EMAILS`, MCP Bearer token (hashed constant-time compare), HTTPS, rate limiter |
| `frontend/src/generative-ui/` | pigeon's component library, safe Markdown, render guard, fallback tree, `PriceHistory`, vendored CSS |
| `frontend/src/components/ItemRenderer.tsx` | Migrate → guard → render, with the fallback and an error boundary |
| `frontend/src/pages/` | Sign-in, feed (type filter, Load more) and item pages |
| `fixtures/` | Sample `save_feed_item` inputs shared by every test layer |
| `e2e/` | Playwright tests of the whole flow against the emulators |
| `scripts/` | Node pin check, CSS vendoring, local seeding |

## Local development

Everything runs locally against the Firebase emulators; no cloud project is needed.

**Prerequisites:** Node 24.22.3 (pinned with [Volta](https://volta.sh)) and Java 21 for the Firebase emulators.

```sh
# 1. Install
(cd backend && npm ci) && (cd frontend && npm ci)

# 2. Start the Auth and Firestore emulators (ports 9199 and 8181; leave running)
cd backend && npx firebase emulators:start --project demo-pigeon --only auth,firestore

# 3. Backend on http://127.0.0.1:8180 (in another terminal)
cd backend
cp .env.example .env
# set PIGEON_MCP_TOKEN in .env to a dev token, e.g. the output of: openssl rand -hex 32
npm run dev

# 4. Frontend on http://localhost:5180 (in another terminal)
cd frontend && cp .env.example .env && npm run dev

# 5. Save the sample items through the MCP tool, as Muse would (in another terminal)
cd backend && PIGEON_MCP_TOKEN=<the token from .env> npm run seed
```

Sign in through the Auth emulator's Google popup with any account whose email is `dev@example.com` (the `ALLOWED_EMAILS` in `backend/.env.example`). Running `npm run seed` again reports `unchanged` for every item.

## Tests

```sh
cd backend && npm test          # unit tests (Vitest)
cd backend && npm run test:db   # Firestore emulator tests (Java 21)
cd frontend && npm test         # component tests (Vitest + Testing Library)
cd e2e && npm ci && npx playwright install chromium && CI=1 npm test   # full flow, starts its own servers
cd e2e && npm run test:servers-stopped                                  # nothing left listening
scripts/check-node-pins.sh      # every Node pin is 24.22.3 (Dockerfile base digest-pinned)
```

Each package also has `npm run lint`, `npm run format:check` and `npx tsc --noEmit`. CI runs all of these on pull requests.

## MCP server

- **URL:** `<BACKEND_URL>/mcp` (Streamable HTTP, stateless). Locally `http://127.0.0.1:8180/mcp`.
- **Auth:** `Authorization: Bearer <PIGEON_MCP_TOKEN>`. Missing or wrong tokens get `401` before the body is read. The token is never logged.
- **Tools:**
  - `save_feed_item` saves one item. Saving again with the same `dedupeKey` replaces it (`updated`), or does nothing if nothing changed (`unchanged`). It returns `{ id, status, uiStatus, uiIssues?, url }`.
  - `get_ui_guide` (read-only) returns the allowed components, limits, examples, a JSON Schema and the item types already in use.
- **Limits:**
  - 120 tool calls per hour per instance.
  - Request body up to 512 KB.
  - UI tree up to 200 KB, 400 nodes, 12 levels and 30 images.
  - Items: up to 30 sources and 20 products. Prices are whole yen.
- **Errors:** schema errors come back as the SDK's `Input validation error: …`. pigeon's own checks (a future `observedAt`, a duplicate product) come back as `Invalid input: <field>: <message>`. Both have `isError: true`.

## Sample data

`npm run seed` in `backend` saves the four fixtures (news, research, price drop, broken tree) through the real MCP tool, plus an earlier observation of the same products, so the price chart has two points. See "Local development".

## Decisions

- **Tree format:** assistant-ui's own wire format and component names (`_type`/`$type`), `schemaVersion: 1`, with an allowlist of 19 components. Interactive components, `Box`, `Diagram`, `Map` and custom card backgrounds aren't allowed.
- **Validation happens twice:** the backend reuses assistant-ui's official prop schemas, made strict and tightened, and the frontend guards every stored tree again before rendering. A bad node becomes a small notice. An unusable tree falls back to a layout built from the saved content.
- **Content is the record;** the tree is only presentation. A re-save fully replaces the item, so an old tree never shows outdated text.
- **Item types are open:** a short slug Muse picks. The feed's filter is built from the types that exist.
- **Price history is optional and generic:** a product is the same product if it has the same `productKey`, or else the same canonical URL (tracking parameters stripped, the same rules for every shop). Only observations are history, and the "was" price is never used. Each item stores its change against the observation just before it, and shows history only up to its own observation.
- **Firestore stores the tree as JSON text,** because Firestore can't hold nested arrays (table rows).
- **Copied from owlet:** auth, the MCP token check, the rate limiter, deny-all Firestore rules, Volta pins, the CI layout and the Playwright server handling.

The full reasoning is in the [design doc](docs/superpowers/specs/2026-11-15-pigeon-design.md).

## Known limitations and future work

- Whether Muse **scheduled tasks** can call custom MCP tools is not verified yet (Bearer auth from a chat is verified). The Muse setup guide and prompts (Phase 4) come later.
- No delete tool and no editing in the web app.
- Product identity is a `productKey` or a generic canonical URL. A shop that puts session IDs in its URLs splits history unless Muse sends a key.
- If an observation is saved later with an earlier date, already-saved items keep their stored price change.
- No image proxy: images load straight from their (https) hosts, with no referrer.
- The rate limit is in memory, so it's per Cloud Run instance.
- `@assistant-ui/generative-ui` is pre-1.0 (pinned at 0.0.11). The vendored CSS must be regenerated by hand (`scripts/vendor-aui-css.mjs`).
- The frontend bundle is about 650 KB (about 200 KB gzipped) and isn't code-split yet.
- Pushes to `main` deploy through `backend.yml`, `frontend.yml` and `firestore-rules.yml`. Each one runs only when its own files change, and can also be run by hand.

## Deploy (one-time owner setup)

pigeon deploys like owlet and hamster: one GCP/Firebase project, region `asia-northeast1`, GitHub Actions authenticating through Workload Identity Federation (no static keys), and secrets in Secret Manager. **The owner runs every command below.** Nothing is created automatically.

Placeholders: `<PROJECT_ID>` (e.g. `pigeon-<6 hex>`), `<PROJECT_NUMBER>` (from `gcloud projects describe <PROJECT_ID> --format='value(projectNumber)'`) and `<BILLING_ACCOUNT_ID>` (never commit it).

```sh
# 1. Project, Firebase and billing
gcloud projects create <PROJECT_ID>
firebase projects:addfirebase <PROJECT_ID>
gcloud billing projects link <PROJECT_ID> --billing-account=<BILLING_ACCOUNT_ID>

# 2. APIs (no Cloud Build: the image is built in GitHub Actions)
gcloud services enable run.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com firebasehosting.googleapis.com \
  identitytoolkit.googleapis.com --project <PROJECT_ID>

# 3. Firestore (native mode)
gcloud firestore databases create --location=asia-northeast1 --project <PROJECT_ID>

# 4. Artifact Registry, keeping the 2 most recent images
gcloud artifacts repositories create pigeon --repository-format=docker \
  --location=asia-northeast1 --project <PROJECT_ID>
cat > /tmp/pigeon-cleanup.json <<'JSON'
[
  { "name": "keep-recent", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 2 } },
  { "name": "delete-rest", "action": { "type": "Delete" }, "condition": { "tagState": "any" } }
]
JSON
gcloud artifacts repositories set-cleanup-policies pigeon --location=asia-northeast1 \
  --project <PROJECT_ID> --policy=/tmp/pigeon-cleanup.json --no-dry-run

# 5. Auth: register a web app (its config is public, as in owlet), then turn on the
#    Google sign-in provider in the Firebase console (Authentication → Sign-in method).
firebase apps:create web pigeon --project <PROJECT_ID>
firebase apps:sdkconfig web --project <PROJECT_ID>

# 6. Secrets, readable by the Cloud Run runtime service account (the default compute SA)
printf '%s' '<owner email>' | gcloud secrets create ALLOWED_EMAILS --data-file=- --project <PROJECT_ID>
RUNTIME_SA=<PROJECT_NUMBER>-compute@developer.gserviceaccount.com
gcloud secrets add-iam-policy-binding ALLOWED_EMAILS --project <PROJECT_ID> \
  --member serviceAccount:$RUNTIME_SA --role roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member serviceAccount:$RUNTIME_SA --role roles/datastore.user

# 7. Workload Identity Federation for GitHub Actions (main branch of hokita/pigeon only)
gcloud iam workload-identity-pools create github-pool --location=global --project <PROJECT_ID>
gcloud iam workload-identity-pools providers create-oidc github-provider --location=global \
  --workload-identity-pool=github-pool --project <PROJECT_ID> \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref' \
  --attribute-condition="assertion.repository == 'hokita/pigeon' && assertion.ref == 'refs/heads/main'"
gcloud iam service-accounts create github-actions-deploy --project <PROJECT_ID>
DEPLOY_SA=github-actions-deploy@<PROJECT_ID>.iam.gserviceaccount.com
for role in roles/run.admin roles/artifactregistry.writer roles/firebasehosting.admin \
  roles/serviceusage.serviceUsageViewer roles/firebaserules.admin roles/datastore.indexAdmin; do
  gcloud projects add-iam-policy-binding <PROJECT_ID> --member serviceAccount:$DEPLOY_SA --role $role
done
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA --project <PROJECT_ID> \
  --member serviceAccount:$DEPLOY_SA --role roles/iam.serviceAccountUser
gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA --project <PROJECT_ID> \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-pool/attribute.repository/hokita/pigeon"
gh secret set WIF_PROVIDER --repo hokita/pigeon \
  --body projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-pool/providers/github-provider
gh secret set WIF_SERVICE_ACCOUNT --repo hokita/pigeon --body $DEPLOY_SA

# 8. Budget alert at ¥100, as owlet has
gcloud billing budgets create --billing-account=<BILLING_ACCOUNT_ID> --display-name=pigeon \
  --budget-amount=100JPY --filter-projects=projects/<PROJECT_ID> \
  --threshold-rule=percent=0.5 --threshold-rule=percent=1.0
```

Then give the project ID, project number and Firebase web config to whoever adds the deploy workflows. They are copied from owlet and written with the real values, which are public by design. The backend is deployed once by hand to learn its URL, so no placeholder is ever committed:

```sh
gcloud auth configure-docker asia-northeast1-docker.pkg.dev
docker build --platform linux/amd64 -t asia-northeast1-docker.pkg.dev/<PROJECT_ID>/pigeon/backend:latest backend
docker push asia-northeast1-docker.pkg.dev/<PROJECT_ID>/pigeon/backend:latest
gcloud run deploy pigeon-backend --region asia-northeast1 --project <PROJECT_ID> \
  --image asia-northeast1-docker.pkg.dev/<PROJECT_ID>/pigeon/backend:latest \
  --allow-unauthenticated --min-instances 0 --max-instances 2 \
  --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=<PROJECT_ID>,FRONTEND_URL=https://<PROJECT_ID>.web.app" \
  --set-secrets "ALLOWED_EMAILS=ALLOWED_EMAILS:latest"
```

The deploy PR then sets that URL as `VITE_API_URL` in `frontend.yml`, and **in the same PR adds the backend origin (for example `https://pigeon-backend-…-an.a.run.app`, exactly, with no `*.run.app` wildcard) to `connect-src` in `firebase.json`**. Without it, the hosting CSP blocks every API call. `frontend/src/csp.test.ts` fails CI if a workflow's `VITE_API_URL` origin is missing from `connect-src`. The same PR removes the local development hosts from `connect-src`.

### MCP token (after the first deploy)

```sh
# 1. Generate a token: 32 random bytes, kept only in this shell for now
TOKEN="$(openssl rand -hex 32)"

# 2. Store it in Secret Manager
printf %s "$TOKEN" | gcloud secrets create pigeon-mcp-token \
  --project <PROJECT_ID> --replication-policy automatic --data-file=-

# 3. Let the Cloud Run runtime service account read it
gcloud secrets add-iam-policy-binding pigeon-mcp-token --project <PROJECT_ID> \
  --member serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor

# 4. Wire it into backend deploys, then redeploy
gh variable set PIGEON_MCP_TOKEN_SECRET --repo hokita/pigeon --body pigeon-mcp-token
gh workflow run backend.yml --repo hokita/pigeon --ref main

# 5. Check it (after the redeploy): 401 without the token, 200 with it
curl -s -o /dev/null -w "%{http_code}\n" -X POST <BACKEND_URL>/mcp
curl -s -o /dev/null -w "%{http_code}\n" -X POST <BACKEND_URL>/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 6. Paste the token into the Muse connector's Bearer token field, then drop it from the shell
unset TOKEN
```

Until step 4, deploys run without the token and `/mcp` stays off. To rotate (and revoke the old token), add a new version with `gcloud secrets versions add pigeon-mcp-token --data-file=-`, redeploy, and update the token in the Muse connector.
