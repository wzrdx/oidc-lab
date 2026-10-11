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

1. **`GET /auth/login`** generates `state`, `nonce`, and a PKCE `code_verifier`, stores them server-side under a random ID, sets that ID in the `login_tx` cookie, and redirects to the IdP's authorization endpoint with `code_challenge = base64url(SHA256(code_verifier))`, `scope=openid offline_access notes:read notes:write`, `resource=<NOTES_API_URL>`, and `prompt=consent`. `oidc-provider` drops `offline_access` (and so issues no refresh token) unless the request has `prompt=consent`.
2. The user logs in and consents at the IdP, which redirects back to `/auth/callback?code=...&state=...`.
3. **`GET /auth/callback`**:
    - takes the login transaction (reading it also deletes it, so it can only be used once) and clears `login_tx`
    - checks `state` (protects against login CSRF)
    - stops if the IdP returned an `error`
    - exchanges `code` + `code_verifier` at the token endpoint (`client_secret_basic`), repeating `resource` so the IdP issues a JWT access token for `notes-api` (without it, `oidc-provider` returns an opaque userinfo token)
    - requires a refresh token in the response (none means `offline_access` wasn't granted)
    - verifies the `id_token`: signature via JWKS, pinned `RS256`, `iss`, `aud`, `exp`, `nonce`
    - creates a server-side session (`sub`, `id_token`, access token and its expiry, refresh token) and sets the `session` cookie

Every rejection logs the reason on the server (`[callback] rejected: ...`) and shows the browser only a generic "Sign-in failed", with no session created.

The IdP's endpoints come from its discovery document (`/.well-known/openid-configuration`), fetched once and cached. The client checks that the document's `issuer` exactly matches the configured one.

### Calling `notes-api`

Only server code calls `notes-api`; the browser never does. `lib/notes-api.ts` is the one place that sends the access token (`Authorization: Bearer ...`). `notes-app` doesn't verify the access token: it's addressed to `notes-api` (`aud`), which checks it.

- The token comes from `getFreshAccessToken()`, which refreshes it first if needed (see below).
- A `401` from the API means it rejected a token we thought was valid: the client refreshes once (forced) and retries the request once. Retrying a `POST` or `DELETE` is safe, because the API's guard rejects before anything happens. A second `401`, with a brand-new token, throws `SignedOutError` and deletes the session.
- A `403` (missing scope) is a configuration bug and throws a normal error.
- Creating and deleting notes go through Server Actions (`app/actions.ts`). Next.js only accepts them as `POST` with an `Origin` matching the `Host`, which protects them from CSRF.

### Refreshing tokens

Access tokens live 60 seconds; the refresh token lives 14 days and is **rotated** on every use: each refresh returns a new one, and the old one is used up. Presenting a used refresh token counts as theft, and the IdP revokes the whole grant (every refresh token of that sign-in).

- `getFreshAccessToken(sessionId, { force })` returns the session's access token if it's valid for at least 10 more seconds. Otherwise it refreshes: `grant_type=refresh_token` with client authentication and `resource`, then saves the new access token and the rotated refresh token in the session. The new `id_token` in the response is ignored.
- **Single-flight:** at most one refresh per session runs at a time. Running refreshes are kept in a `Map<sessionId, Promise>` on `globalThis`; a second caller (a parallel API call, a Server Action during a page render) waits for the running refresh instead of starting its own. Without this, both would send the same refresh token, the second would look like reuse, and the IdP would revoke the grant: the app would sign the user out by itself. The `Map` only works inside one process; several instances would need a shared lock (e.g. in Redis).
- **`invalid_grant`** (expired, revoked, or reused refresh token, or an IdP restart, which forgets them) throws `RefreshRejectedError`. The API client deletes the session and throws `SignedOutError`, so the page shows "Your session has expired". Any other refresh failure (IdP down, `500`) is an ordinary error: it doesn't sign anyone out, because the session may work again once the IdP recovers.
- If the user logs out while a refresh is running, the result is discarded: a deleted session is never brought back.

Sessions live server-side for exactly this reason: a refresh can happen while a server component renders, and server components can't set cookies. The cookie keeps the same session ID; only the stored tokens change.

### Logout

`POST /auth/logout` revokes the refresh token at the IdP's `revocation_endpoint` (RFC 7009, `token_type_hint=refresh_token`, client authentication), which revokes the whole grant. Then it deletes the session, clears the cookie, and redirects home with `303`. If the revocation fails, the user is still logged out locally. Logout is idempotent: without a session, it just clears the cookie. The IdP's own session isn't ended, so signing in again may skip the password prompt.

## Code layout

Every module in `lib/auth/` starts with `import "server-only"`, so importing one from a client component fails the build.

| Path                            | What it does                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| `app/auth/login/route.ts`       | Starts the flow: login transaction, authorize URL, redirect          |
| `app/auth/callback/route.ts`    | Finishes the flow: all the checks above, then creates the session    |
| `app/auth/logout/route.ts`      | Revokes the refresh token, deletes the session, clears the cookie    |
| `lib/auth/config.ts`            | Reads and validates the `OIDC_*` environment variables               |
| `lib/auth/discovery.ts`         | Fetches and caches the discovery document, checks `issuer`           |
| `lib/auth/random.ts`            | `randomToken()` (32 random bytes, base64url) and `pkceChallenge()`   |
| `lib/auth/login-transactions.ts`| Single-use store for `state`/`nonce`/`code_verifier`, 10-minute expiry |
| `lib/auth/session.ts`           | Session store, cookie options, `getSession`/`getCurrentUser`, `updateSessionTokens` |
| `lib/auth/client-auth.ts`       | The `client_secret_basic` `Authorization` header                     |
| `lib/auth/token-exchange.ts`    | `POST` to the token endpoint, with readable errors                   |
| `lib/auth/refresh.ts`           | The refresh request, `RefreshRejectedError` on `invalid_grant`       |
| `lib/auth/fresh-access-token.ts`| `getFreshAccessToken()`: expiry check and single-flight refresh      |
| `lib/auth/id-token.ts`          | `id_token` verification with `jose`                                  |
| `lib/notes-api.ts`              | API client: Bearer token, retry on 401, `listNotes`/`createNote`/`deleteNote` |
| `app/actions.ts`                | Server Actions for creating and deleting notes                       |
| `app/page.tsx`, `components/`   | Home page: identity, note list and forms (display data only)         |

Both stores are `Map`s on `globalThis`: they survive hot reload but are emptied on restart, which signs everyone out.

Use `getCurrentUser()` (returns only `sub`) when rendering. `getSession()` returns the tokens and is for server code that calls APIs. Never pass a token, the session, or its ID to a client component, because props are serialized into the page.

## Setup

Requires the IdP and `notes-api` to be running (see the [root README](../README.md)) and the `*.localhost` hostnames to be set up.

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
| `NOTES_API_URL`      | `http://api.localhost:5000`: the API's base URL and its resource indicator |

None of these may have a `NEXT_PUBLIC_` prefix: Next.js inlines those into the browser bundle, which would ship the client secret to every visitor.

## Status

Phases 2 to 4 of the [roadmap](../README.md#roadmap) are complete:

- [x] Discovery, PKCE, login-transaction and session stores
- [x] `/auth/login`, `/auth/callback`, token exchange, `id_token` verification
- [x] `POST /auth/logout` (local logout with refresh token revocation)
- [x] Home page showing the signed-in state
- [x] Access token for `notes-api`, server-side API client, notes list, create and delete
- [x] Refresh tokens: rotation, single-flight refresh, retry on `401`
