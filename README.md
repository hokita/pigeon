# pigeon

pigeon is a personal web app that keeps what Muse (Meta's AI assistant) collects — news, research, price drops, anything — and shows each item as a rich page. Muse saves an item and a JSON component tree through an MCP tool; pigeon validates and stores both, then renders the stored tree with assistant-ui's generative UI components. Viewing an item never calls an LLM.

See the [design doc](docs/superpowers/specs/2026-11-15-pigeon-design.md).

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
