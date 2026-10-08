# TASKS: Phase 2, `notes-app` auth by hand

Scope: phase 2 from `CLAUDE.md`. Build `notes-app` as a confidential BFF client: route handlers `auth/login`, `auth/callback`, `auth/logout`, a server-side login-transaction store, a server-side session store, and `id_token` verification with `jose`. Phase 1's tasks are archived in `TASKS-phase1.md`.

Starting point: `notes-app/` contains only `SCAFFOLD.md`. The IdP from phase 1 already registers `notes-app` with the right redirect URI and `scope: "openid"`, so phase 2 needs no IdP changes.

Ground rules from `CLAUDE.md` that apply to every task:

- No auth libraries. `jose` and `server-only` are the only additions.
- Every module that touches tokens, secrets, or the stores starts with `import "server-only"`.
- Tokens never reach the browser: not in cookies, not in props, not in client components.
- These are the hand-written parts of the project. Write them yourself; ask for help per task.

Paths below use `app/...` and `lib/...`. If you answer yes to the `src/` folder prompt in task 1, they live under `src/` instead.

---

## 1. [✅] Scaffold `notes-app`

Follow `notes-app/SCAFFOLD.md`: move `SCAFFOLD.md` out of the folder, run `pnpm create next-app@latest notes-app` from the repo root with TypeScript and the App Router, then run the checks in its "Check after scaffolding" section (no nested `.git`, no nested pnpm files, package name `notes-app`). Decide whether to put `SCAFFOLD.md` back or delete it.

Confirm `pnpm --filter notes-app dev` serves the default page at `http://app.localhost:3000` from the Windows browser. If Next.js warns about cross-origin dev requests, add `allowedDevOrigins: ["app.localhost"]` to `next.config.ts`.

**Files affected:** `notes-app/` (generated), possibly `notes-app/next.config.ts`, root `pnpm-lock.yaml`, root `pnpm-workspace.yaml`.

---

## 2. [✅] Add `jose` and `server-only`

`pnpm --filter notes-app add jose server-only`. These are the only dependencies phase 2 adds.

**Files affected:** `notes-app/package.json`, `pnpm-lock.yaml`.

**Depends on:** 1.

---

## 3. [✅] Add the OIDC client configuration module

Create `notes-app/.env.local` with the client's settings, and a committed `notes-app/.env.example` with placeholders:

- `OIDC_ISSUER=http://idp.localhost:4000`
- `OIDC_CLIENT_ID=notes-app`
- `OIDC_CLIENT_SECRET=` (the same value as the IdP's `NOTES_APP_CLIENT_SECRET`)
- `OIDC_REDIRECT_URI=http://app.localhost:3000/auth/callback`

None of these get a `NEXT_PUBLIC_` prefix: Next.js inlines those into the browser bundle. The `.gitignore` that `create-next-app` generates ignores `.env*`; add `!.env.example` so the example is committed.

Create `lib/auth/config.ts` (starts with `import "server-only"`) that reads the four variables once, throws a clear error if one is missing (same idea as `requireEnv` in the IdP), and exports them as a typed object.

**Files affected:** `notes-app/.env.local` (new, local only), `notes-app/.env.example` (new), `notes-app/.gitignore`, `notes-app/lib/auth/config.ts` (new).

**Depends on:** 2.

---

## 4. [✅] Load the IdP's discovery document

Create `lib/auth/discovery.ts` (server-only) with a function that fetches `${OIDC_ISSUER}/.well-known/openid-configuration` and returns the fields the client uses: `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`.

- Check that the returned `issuer` equals `OIDC_ISSUER` exactly, and throw if not. OpenID Connect Discovery requires this check; it stops a misconfigured or spoofed discovery document from pointing the client at someone else's endpoints.
- Cache the result in memory, so it's fetched once and not on every login.

Reading the endpoints from discovery and not hard-coding them is what real clients do, and it's why phase 1's task 5 mattered.

**Files affected:** `notes-app/lib/auth/discovery.ts` (new).

**Depends on:** 3.

---

## 5. [✅] Add helpers for random values and the PKCE challenge

Create `lib/auth/random.ts` (server-only) with two small functions, the code versions of phase 1's task 7:

- `randomToken()`: 32 bytes from `crypto.randomBytes`, base64url-encoded. Used for `state`, `nonce`, the `code_verifier`, the login-transaction ID, and the session ID.
- `pkceChallenge(verifier)`: `base64url(SHA256(verifier))`.

Use `node:crypto`. Check `pkceChallenge` against a verifier and challenge pair from your phase 1 run: the outputs must match.

**Files affected:** `notes-app/lib/auth/random.ts` (new).

**Depends on:** 1.

---

## 6. [✅] Implement the login-transaction store

Create `lib/auth/login-transactions.ts` (server-only), following the "Login transactions are stored server-side too" design decision:

- A `Map<string, { state, nonce, codeVerifier, expiresAt }>` stored on `globalThis`, so it survives hot reload in dev.
- `createLoginTransaction()`: generates `state`, `nonce`, and `codeVerifier` with task 5's helper, stores them under a new random ID with a short expiry (for example 10 minutes), and returns the ID and the values.
- `takeLoginTransaction(id)`: returns the record **and deletes it** in the same step (single use, step 4 of the target flow). Returns nothing if the ID is unknown or the record has expired.
- The cookie that carries the ID: a name constant (for example `login_tx`), and attributes `httpOnly`, `sameSite: "lax"`, `path: "/auth"`, a `maxAge` matching the expiry, and no `secure` (plain HTTP in the lab). `lax` is required: the browser sends the cookie on the top-level redirect back from the IdP, which `strict` would drop.

Expired records that are never taken stay in the `Map`. That's acceptable for a dev `Map`; Redis expiry handles it in phase 5.

**Files affected:** `notes-app/lib/auth/login-transactions.ts` (new).

**Depends on:** 5.

---

## 7. [✅] Implement the session store and session cookie helpers

Create `lib/auth/session.ts` (server-only), following the "Server-side session store" design decision:

- A `Map<string, Session>` on `globalThis`. A `Session` holds what the callback learns: `sub`, the `id_token`, the `access_token` with its expiry, and a creation time. Phase 3 uses the access token and phase 4 adds the refresh token, so keep the type easy to extend.
- `createSession(data)`: stores the session under a new random ID (task 5) and returns the ID.
- `deleteSession(id)`.
- `getSession()`: reads the session cookie through `cookies()` from `next/headers` and returns the session, or nothing. In current Next.js versions `cookies()` is async, so `await` it.
- The session cookie: a name constant (for example `sid`), and attributes `httpOnly`, `sameSite: "lax"`, `path: "/"`, no `secure`.

The cookie holds only the session ID. Tokens stay in the `Map`.

**Files affected:** `notes-app/lib/auth/session.ts` (new).

**Depends on:** 5.

---

## 8. [✅] Implement `GET /auth/login`

Create `app/auth/login/route.ts`, steps 1 and 2 of the target flow:

1. Create a login transaction (task 6).
2. Set the login-transaction cookie with its ID.
3. Build the authorize URL from `authorization_endpoint` (task 4) with `URL` and `searchParams`: `client_id`, `redirect_uri`, `response_type=code`, `scope=openid`, `state`, `nonce`, `code_challenge` (task 5), `code_challenge_method=S256`. This is phase 1's task 8 in code.
4. Respond with a redirect to that URL.

Check: visiting `http://app.localhost:3000/auth/login` lands on the IdP's login screen, and the browser has a `login_tx` cookie on `app.localhost` holding only a random ID.

**Files affected:** `notes-app/app/auth/login/route.ts` (new).

**Depends on:** 4, 6.

---

## 9. [ ] Implement the token exchange

Create `lib/auth/token-exchange.ts` (server-only) with a function that takes a `code` and a `codeVerifier` and calls `token_endpoint` (task 4). This is phase 1's `curl` in code:

- `POST` with a `URLSearchParams` body: `grant_type=authorization_code`, `code`, `redirect_uri` (identical to the login request), `code_verifier`.
- Client authentication with `client_secret_basic`: `Authorization: Basic base64(client_id:client_secret)`. RFC 6749 says to form-urlencode the ID and the secret before joining and base64-encoding them; do that, so a secret with special characters still works.
- On a non-2xx response, read the JSON `error` and `error_description` and throw with them, so failures in the callback are explainable.
- Return the parsed `id_token`, `access_token`, `expires_in`, and `token_type`.

**Files affected:** `notes-app/lib/auth/token-exchange.ts` (new).

**Depends on:** 4.

---

## 10. [ ] Implement `id_token` verification

Create `lib/auth/id-token.ts` (server-only), step 5 of the target flow and phase 1's task 10 in code:

- `createRemoteJWKSet(new URL(jwks_uri))` from `jose`, created once at module level, so the keys are fetched and cached and not re-downloaded on every login.
- `jwtVerify(idToken, jwks, { issuer: OIDC_ISSUER, audience: OIDC_CLIENT_ID, algorithms: ["RS256"] })`. That checks the signature, `iss`, `aud`, and `exp`. Pin `algorithms`: never trust the token's own `alg` header.
- Then compare `payload.nonce` with the expected nonce yourself, and throw if they differ. `jwtVerify` doesn't check `nonce`.
- Return the verified payload (at least `sub`).

**Files affected:** `notes-app/lib/auth/id-token.ts` (new).

**Depends on:** 3, 4.

---

## 11. [ ] Implement `GET /auth/callback`

Create `app/auth/callback/route.ts`, steps 4 and 5 of the target flow:

1. If the query has an `error` parameter (for example the user denied consent), stop and show it. Don't continue to the exchange.
2. Read the login-transaction cookie, call `takeLoginTransaction` (task 6), and clear the cookie. If no record comes back (missing cookie, unknown ID, expired, or already used), reject the callback.
3. Compare the `state` query parameter with the record's `state`. Reject on a mismatch: this is the login CSRF check.
4. Exchange the `code` with the record's `codeVerifier` (task 9).
5. Verify the `id_token` with the record's `nonce` (task 10).
6. Create a session (task 7) holding `sub` and the tokens, set the session cookie, and redirect to `/`.

Every rejection ends the flow with an error response and **no session**. Log the reason on the server; keep the message to the browser generic.

**Files affected:** `notes-app/app/auth/callback/route.ts` (new).

**Depends on:** 7, 8, 9, 10.

---

## 12. [ ] Implement `POST /auth/logout`

Create `app/auth/logout/route.ts` that reads the session cookie, deletes the session from the store (task 7), clears the cookie, and redirects to `/`.

Use `POST`, not `GET`. A `GET` logout can be triggered by any link or image on another site, and Next.js prefetches links, which could log the user out just by rendering a link to it.

This is a **local** logout: the IdP session from phase 1 stays, so the next sign-in skips the password prompt. Ending the IdP session too is RP-initiated logout, planned for phase 6.

**Files affected:** `notes-app/app/auth/logout/route.ts` (new).

**Depends on:** 7.

---

## 13. [ ] Show the signed-in state on the home page

Replace the scaffolded `app/page.tsx` with a server component that calls `getSession()` (task 7):

- Signed out: a "Sign in" link to `/auth/login`. Use a plain `<a>`, not `next/link`, because this is a full redirect to another site and doesn't need prefetching.
- Signed in: "Signed in as `<sub>`" and a small `<form method="post" action="/auth/logout">` with a "Sign out" button.

Pass only `sub` (or other display data) to anything rendered. Never pass a token, the session object, or the session ID to a client component: props are serialized into the page.

**Files affected:** `notes-app/app/page.tsx`.

**Depends on:** 8, 12.

---

## 14. [ ] Test the full flow by hand

Run the IdP and `notes-app` together and check, in the Windows browser at `http://app.localhost:3000`:

- **Sign in:** click "Sign in", log in and consent at the IdP, and land back on `/` showing your `sub`.
- **Cookies on `app.localhost`:** only `sid` remains, it's httpOnly, and its value is a random ID. `login_tx` is gone after the callback.
- **No tokens in the page:** view the page source and search for `eyJ` (the start of every JWT). There should be no match.
- **Sign out:** the home page shows "Sign in" again, and `sid` is gone.
- **IdP session still alive:** sign in again. The IdP skips the login screen and returns straight away, as expected with a local logout.
- **Hot reload:** edit a file in `notes-app` while signed in. You stay signed in, because the stores live on `globalThis`.
- **Restart:** restart `notes-app` and reload. You're signed out, because the in-memory stores were emptied.

**Files affected:** none.

**Depends on:** 11, 13.

---

## 15. [ ] Probe the callback's security checks

Show that each check in task 11 rejects bad input and creates no session:

- **Wrong `state`:** start a login, then edit `state` in the callback URL before it loads (or replay the callback URL with a changed `state`). Expect a rejection.
- **Callback replay:** after a successful login, open the same callback URL again. The login transaction was deleted, so expect a rejection.
- **Missing transaction cookie:** start a login, delete `login_tx` in the dev tools while on the IdP's login screen, then finish logging in. Expect a rejection.
- **Expired transaction:** temporarily shorten the expiry to a few seconds, wait it out on the IdP's login screen, then finish. Expect a rejection, and put the expiry back.
- **Consent denied:** deny consent on the IdP screen. Expect the `error` branch, not a crash.
- **Login CSRF:** run the attack from the `state` discussion. In one browser profile, start a login and copy the callback URL without opening it; open it in another profile. Expect a rejection, because that profile has no matching `login_tx`.

For each probe, note which check caught it.

**Files affected:** none (except the temporary expiry change, reverted).

**Depends on:** 14.

---

## 16. [ ] Mark phase 2 complete

Once tasks 1 to 15 pass:

- `CLAUDE.md`: tick the phase 2 checkbox and change "Current phase" to `3 (not started)`.
- `README.md`: tick roadmap item 2, and remove `notes-app/` from the "aren't scaffolded yet" sentence at the end of Getting started.

**Files affected:** `CLAUDE.md`, `README.md`.

**Depends on:** 14, 15.
