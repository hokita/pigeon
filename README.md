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
