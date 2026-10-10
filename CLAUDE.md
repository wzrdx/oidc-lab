# oidc-lab

A learning project: building a complete OAuth 2.0 / OpenID Connect system by hand (identity provider, client app, and resource API) to understand how token-based authentication works end to end.

## Why this project exists

I've built auth with Better Auth, which uses database-backed session cookies. That works well, but it hides the token-based model most other systems use: access and refresh tokens, JWT verification against a JWKS endpoint, PKCE, refresh token rotation, and SSO. The goal is to understand each of these by implementing every party in the flow myself, so I know what happens at every step and why each security check exists.

The goal is understanding, not shipping. When there's a choice between a shortcut and seeing the mechanism, prefer seeing the mechanism.

## How to help me

- This is a learning project. Explain the "why" behind code and decisions, in plain language.
- The OAuth client side in `notes-app` is written by hand on purpose. Do not add `openid-client`, Auth.js/NextAuth, Passport, or any other auth library. `jose` is the only allowed helper (signing, verifying, JWKS).
- Don't write the hand-written parts (login, callback, token exchange, id_token verification, refresh) unless I ask. When I do, keep changes small and explain each step.
- Point out security mistakes directly, including in code I wrote.
- TypeScript is mandatory for every project. Prefer concise snippets over large scaffolds.

## Architecture

pnpm monorepo with three apps:

| App              | Stack                          | URL                         | Role                                                                     |
| ---------------- | ------------------------------ | --------------------------- | ------------------------------------------------------------------------ |
| `idp`            | Express + `node-oidc-provider` | `http://idp.localhost:4000` | Identity provider: users, login/consent pages, issues tokens, serves JWKS |
| `notes-app`      | Next.js                        | `http://app.localhost:3000` | Client app: UI + BFF. Runs the OAuth flow, holds tokens server-side       |
| `notes-api`      | NestJS                         | `http://api.localhost:5000` | Resource server: notes CRUD, verifies JWT access tokens                   |

The browser only ever holds a session ID cookie for `notes-app`. It never sees a token.

## Design decisions

- **`notes-app` is a BFF (confidential client).** The code exchange happens server-side with a client secret, and tokens never reach the browser. This is the current recommendation for browser-based apps.
- **UI and BFF are one Next.js app.** Same origin by construction. Downside: the server/client boundary is a convention, not a wall. Passing a token as a prop to a client component leaks it into the page. All token code lives in a module that starts with `import "server-only"`.
- **Server-side session store.** The cookie holds only a random session ID; tokens are stored server-side, keyed by it. Reason: server components can't set cookies, so a refresh (which rotates the refresh token) has to be saved somewhere other than a cookie. Start with a `Map` on `globalThis` (survives hot reload), move to Redis in phase 5.
- **Login transactions are stored server-side too.** Between the redirect to the IdP and the callback, `state`, `nonce`, and the PKCE `code_verifier` live in a server-side record; the browser only holds a short-lived httpOnly cookie with the record's random ID. The verifier never leaves the server. Same storage approach as sessions (`Map` now, Redis in phase 5), with a short expiry.
- **JWT access tokens.** `node-oidc-provider` issues opaque access tokens by default. Enable the `resourceIndicators` feature and return `accessTokenFormat: 'jwt'` for the `notes-api` resource, so `notes-api` can verify tokens locally with `jose` instead of calling the introspection endpoint on every request.
- **`notes-api` verifies, never logs in.** It checks the signature via JWKS (`createRemoteJWKSet`), an `alg` allowlist, `iss`, `aud`, `exp`, and scopes. Implemented as a NestJS guard plus a scopes decorator.
- **`idp` uses plain Express.** `node-oidc-provider` is Koa-based. Mounting it in Express is simple, and the library's own docs and examples apply directly. NestJS is used where it fits naturally (`notes-api`).
- **Distinct hostname per app.** Cookies are scoped by host, not port. With everything on `localhost`, all apps would share one cookie jar and hide cross-site behaviour.

## Target flow (phases 1-4)

1. User clicks "Sign in": `GET /auth/login` on `notes-app`.
2. `notes-app` generates `state`, `nonce`, and a PKCE `code_verifier`, stores them server-side in a login-transaction record keyed by a random ID, sets that ID in a short-lived httpOnly cookie, and redirects to the IdP's authorization endpoint with `code_challenge = base64url(SHA256(code_verifier))`.
3. User logs in and consents at the IdP. The IdP redirects to `/auth/callback?code=...&state=...`.
4. `notes-app` loads the login-transaction record via the cookie, deletes it (single use), and checks `state` against it, then POSTs `code` + `code_verifier` + client credentials to the IdP's token endpoint.
5. `notes-app` verifies the `id_token` with `jose` (signature via JWKS, `iss`, `aud`, `exp`, `nonce`), creates a server-side session, and sets the session ID cookie.
6. Server-side code calls `notes-api` with `Authorization: Bearer <access_token>`.
7. `notes-api` verifies the JWT locally and checks scopes.
8. When the access token expires, `notes-app` uses the refresh token (rotated on every use), with at most one refresh in flight per session.

## Phases

Current phase: **3 (not started)**

1. [x] **Bare IdP.** `node-oidc-provider` with the in-memory adapter, one static client, and the built-in dev login screens. Inspect the discovery document and JWKS. Run one flow by hand: build the authorize URL manually, copy the `code` from the address bar, exchange it with `curl`, decode the `id_token`.
2. [x] **`notes-app` auth by hand.** Route handlers `app/auth/login`, `app/auth/callback`, `app/auth/logout`. Session store. `id_token` verification.
3. [ ] **`notes-api`.** NestJS guard with JWKS verification, `aud`/`iss`/scope checks. Enable JWT access tokens on the IdP. `notes-app` calls the API.
4. [ ] **Refresh tokens.** `offline_access` scope, rotation, reuse detection (presenting an already-used refresh token must fail), single-flight refresh per session.
5. [ ] **Real IdP.** Own login and consent pages, users in Postgres via Prisma (argon2 password hashing), Redis adapter for the provider, Redis session store in `notes-app`.
6. [ ] **SSO and logout.** Add a second client app (e.g. `todos-app`): after logging into one, the other skips the password prompt. RP-initiated logout; optionally back-channel logout.
7. [ ] **Stretch.** Signing key rotation (two keys in the JWKS), DPoP sender-constrained tokens.

## IdP client registration

- `client_id`: `notes-app`
- Redirect URI: `http://app.localhost:3000/auth/callback`
- Confidential client with a `client_secret` (dev-only value, loaded from env)

## Dev environment

- WSL2 (Ubuntu). The repo lives in the Linux filesystem (`~/dev/oidc-lab`), not under `/mnt/c`: installs are slow and file watching (Next.js, Nest watch mode) breaks across that boundary.
- Node is installed inside WSL (fnm or nvm); pnpm via `corepack enable`. `which node` must show a Linux path, not `/mnt/c/...`.
- The browser runs on Windows. Services in WSL are reachable from Windows at `localhost`. If not, set `networkingMode=mirrored` under `[wsl2]` in `%UserProfile%\.wslconfig` and restart WSL.
- Hostnames: `127.0.0.1 idp.localhost app.localhost api.localhost` in the Windows hosts file. WSL copies it into `/etc/hosts` on startup (`wsl --shutdown` to refresh). Don't edit `/etc/hosts` inside WSL; it gets regenerated. Verify with `getent hosts idp.localhost`.
- If Next.js warns about cross-origin dev requests via `app.localhost`, add `allowedDevOrigins: ["app.localhost"]` to `next.config.ts`.

## Gotchas

- `oidc-provider` is ESM-only: set `"type": "module"` in `idp/package.json`.
- Authorization codes are single-use and short-lived.
- Never trust the token's `alg` header; pin the allowed algorithms when verifying.
- Always check `aud`: a token issued for another service must be rejected.
- The in-memory provider adapter loses all codes, grants, and refresh tokens on restart (acceptable until phase 5).
