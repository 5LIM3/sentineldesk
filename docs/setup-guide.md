# Setup guide

## 1. Prerequisites

Node.js 22 or later and npm. Docker is optional.

## 2. Run it locally

```bash
git clone https://github.com/5LIM3/sentineldesk.git
cd sentineldesk
npm install
```

On Windows, if `npm install` fails with a node-gyp or "Visual Studio" error, run `npm install --ignore-scripts`
(`better-sqlite3` ships a prebuilt Windows binary). Then check that `npm test` passes.

Create your settings file and a secret:

```powershell
# PowerShell
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
```bash
# macOS / Linux
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the printed value after `JWT_SECRET=` in `.env`, then:

```bash
npm run seed    # creates the database and demo data (only if it is empty)
npm run dev     # http://localhost:3000
```

Check `GET http://localhost:3000/health`. Demo logins are in the README (password `Password123!`).
Sample requests: `requests.http` (VS Code REST Client). API reference: `docs/openapi.yaml`
(open it at https://editor.swagger.io or in any OpenAPI viewer) and `docs/api-spec.md`.

## 3. Settings (environment variables)

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `JWT_SECRET` | **yes** | none | Signs login tokens. 32+ random characters. The server will not start without it |
| `PORT` | no | 3000 | Port to listen on |
| `DB_PATH` | no | `./data/sentineldesk.db` | SQLite file. On a host, point it at a persistent disk |
| `JWT_EXPIRES_IN` | no | `1h` | Token lifetime |
| `BCRYPT_ROUNDS` | no | 10 | Password hashing cost (4 to 15) |
| `CORS_ORIGINS` | no | empty | Exact browser origins allowed, comma separated. Empty means none. `*` is refused |
| `AUTH_RATE_LIMIT_MAX` | no | 10 | Failed logins (and sign-ups) allowed per IP per window |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` | no | 15 | Length of that window |
| `TRUST_PROXY` | no | 0 | Set to 1 behind a host's reverse proxy so each client IP is counted separately |

## 4. Tests

```bash
npm test                # 108 tests, no .env needed
npm run test:coverage   # with coverage report
```

## 5. Production build

```bash
npm run build
npm start               # runs dist/server.js; set the variables above first
```

## 6. Docker (optional)

```bash
docker build -t sentineldesk .
docker run --rm -p 3000:3000 -v sentineldesk-data:/data -e JWT_SECRET=<your-32+-char-secret> sentineldesk
```

Load the demo data once, into the same volume:

```bash
docker run --rm -v sentineldesk-data:/data sentineldesk node dist/seed.js
```

The database lives in the `/data` volume: without `-v`, everything is lost when the container is removed.

**Not yet verified:** the image itself has not been built on the machine used for development. The same steps
were checked with the compiled build and production-only dependencies. Run `docker build` once before relying on it.

## 7. Deploying to a host

1. Choose a host and plan that offers a **persistent disk or volume**, and confirm it before deploying.
2. Set the variables above on the host, including a fresh `JWT_SECRET`, `TRUST_PROXY=1`, and `DB_PATH` inside the mounted disk.
3. Build command `npm install --ignore-scripts && npm run build`, start command `npm start`.
4. Create a record, redeploy, and confirm the record survived.
5. Check `/health`, log in, and confirm a 6th failed login from one address returns `429`.
6. Serve it over HTTPS. If no persistent disk is available, call the deployment a disposable demo.

## 8. Troubleshooting

| Problem | Cause and fix |
|---|---|
| "JWT_SECRET is missing or too short" | Add a 32+ character value to `.env` |
| `401 INVALID_CREDENTIALS` for a demo user | The database was seeded by an older version. Delete `data/*.db*`, then `npm run seed` |
| `429 TOO_MANY_REQUESTS` while testing | Too many failed logins from one IP. Wait for the window, or restart the server (counters are in memory) |
| `EADDRINUSE` | Another copy of the server is still running. Stop it or change `PORT` |
| A browser app is blocked by CORS | Add its exact origin to `CORS_ORIGINS` |
