# notes-app

The client app of [oidc-lab](../README.md): a Next.js UI plus a backend-for-frontend (BFF) that signs users in against the lab's identity provider with OpenID Connect. The OAuth client code is written by hand, with no auth library; [`jose`](https://github.com/panva/jose) is the only helper (JWKS fetching and JWT verification).

Runs at `http://app.localhost:3000`.

## How it works

`notes-app` is a **confidential client**: the authorization code is exchanged server-side with a client secret, and tokens never reach the browser. The browser holds only two httpOnly cookies, and each one holds a random ID, never a token:

| Cookie     | Holds                    | Path    | Lifetime   | Purpose                                                       |
| ---------- | ------------------------ | ------- | ---------- | ------------------------------------------------------------- |
| `login_tx` | Login-transaction ID     | `/auth` | 10 minutes | Links the callback to the login that started it               |
| `session`  | Session ID               | `/`     | Browser    | Looks up the server-side session (`sub` and tokens)           |

Both are `SameSite=Lax`: the browser has to send `login_tx` on the top-level redirect back from the IdP, and `Strict` would drop it.

### Sign-in flow

1. **`GET /auth/login`** generates `state`, `nonce`, and a PKCE `code_verifier`, stores them server-side under a random ID, sets that ID in the `login_tx` cookie, and redirects to the IdP's authorization endpoint with `code_challenge = base64url(SHA256(code_verifier))`.
2. The user logs in and consents at the IdP, which redirects back to `/auth/callback?code=...&state=...`.
3. **`GET /auth/callback`**:
    - takes the login transaction (reading it also deletes it, so it can only be used once) and clears `login_tx`
    - checks `state` (protects against login CSRF)
    - stops if the IdP returned an `error`
    - exchanges `code` + `code_verifier` at the token endpoint (`client_secret_basic`)
    - verifies the `id_token`: signature via JWKS, pinned `RS256`, `iss`, `aud`, `exp`, `nonce`
    - creates a server-side session and sets the `session` cookie

Every rejection logs the reason on the server (`[callback] rejected: ...`) and shows the browser only a generic "Sign-in failed", with no session created.

The IdP's endpoints come from its discovery document (`/.well-known/openid-configuration`), fetched once and cached. The client checks that the document's `issuer` exactly matches the configured one.

## Code layout

Every module in `lib/auth/` starts with `import "server-only"`, so importing one from a client component fails the build.

| Path                            | What it does                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| `app/auth/login/route.ts`       | Starts the flow: login transaction, authorize URL, redirect          |
| `app/auth/callback/route.ts`    | Finishes the flow: all the checks above, then creates the session    |
| `lib/auth/config.ts`            | Reads and validates the `OIDC_*` environment variables               |
| `lib/auth/discovery.ts`         | Fetches and caches the discovery document, checks `issuer`           |
| `lib/auth/random.ts`            | `randomToken()` (32 random bytes, base64url) and `pkceChallenge()`   |
| `lib/auth/login-transactions.ts`| Single-use store for `state`/`nonce`/`code_verifier`, 10-minute expiry |
| `lib/auth/session.ts`           | Session store, session cookie options, `getSession`/`getCurrentUser` |
| `lib/auth/token-exchange.ts`    | `POST` to the token endpoint, with readable errors                   |
| `lib/auth/id-token.ts`          | `id_token` verification with `jose`                                  |

Both stores are `Map`s on `globalThis`: they survive hot reload but are emptied on restart, which signs everyone out. They move to Redis in phase 5.

Use `getCurrentUser()` (returns only `sub`) when rendering. `getSession()` returns the tokens and is for server code that calls APIs. Never pass a token, the session, or its ID to a client component, because props are serialized into the page.

## Setup

Requires the IdP to be running (see the [root README](../README.md)) and the `*.localhost` hostnames to be set up.

```bash
cp .env.example .env.local   # then set OIDC_CLIENT_SECRET
pnpm --filter notes-app dev  # http://app.localhost:3000
```

| Variable             | Value                                                         |
| -------------------- | ------------------------------------------------------------- |
| `OIDC_ISSUER`        | `http://idp.localhost:4000`                                   |
| `OIDC_CLIENT_ID`     | `notes-app`                                                   |
| `OIDC_CLIENT_SECRET` | Must equal the IdP's `NOTES_APP_CLIENT_SECRET`                |
| `OIDC_REDIRECT_URI`  | `http://app.localhost:3000/auth/callback`                     |

None of these may have a `NEXT_PUBLIC_` prefix: Next.js inlines those into the browser bundle, which would ship the client secret to every visitor.

## Status

Phase 2 of the [roadmap](../README.md#roadmap) is complete:

- [x] Discovery, PKCE, login-transaction and session stores
- [x] `/auth/login`, `/auth/callback`, token exchange, `id_token` verification
- [x] `POST /auth/logout` (local logout; RP-initiated logout comes in phase 6)
- [x] Home page showing the signed-in state

Later phases add calls to `notes-api` with the access token (phase 3) and refresh-token rotation with single-flight refresh (phase 4).
