# TASKS: Phase 4, refresh tokens

Scope: phase 4 from `CLAUDE.md`, the last mandatory phase. When the 60-second access token expires, `notes-app` silently gets a new one with a refresh token instead of signing the user out. The IdP rotates the refresh token on every use and treats reuse of an old one as theft. `notes-app` allows at most one refresh in flight per session. Phase 3's tasks are archived in `TASKS-phase3.md`.

Starting point: the IdP issues 60-second JWT access tokens for `notes-api`, and no refresh tokens (`notes-app` is registered with `grant_types: ["authorization_code"]` and `scope: "openid"`). `notes-app` treats an expired access token or a `401` from `notes-api` as "signed out" (`SignedOutError`). `notes-api` needs no changes in this phase.

Ground rules that apply to every task:

- No auth libraries. `jose` is the only helper.
- The refresh token is a long-lived credential: it never reaches the browser and is never logged, same as the other tokens.
- The refresh logic and single-flight are hand-written parts. Write them yourself; ask for help per task.

How `oidc-provider` 9 behaves here (checked in its source, `lib/helpers/defaults.js` and `lib/actions/grants/refresh_token.js`):

| Behaviour                 | Default                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Issuing a refresh token   | Only if the client allows the `refresh_token` grant **and** the scopes include `offline_access`            |
| `offline_access`          | Silently dropped unless the authorize request has `prompt=consent` (and the client can use refresh tokens) |
| Rotation                  | Always for public clients; for confidential clients only after 70% of the refresh token's lifetime         |
| Refresh token lifetime    | 14 days                                                                                                    |
| Reuse of a used token     | Fails with `invalid_grant`, **and revokes the whole grant**: every refresh token from that login           |
| Token revocation endpoint | Off                                                                                                        |

Tasks 3, 4, 12 and 13 are manual steps that change no files.

---

## 1. [✅] Allow refresh tokens for `notes-app`

In `idp/src/index.ts`, change the `notes-app` client:

- `grant_types: ["authorization_code", "refresh_token"]`
- `scope: "openid offline_access"`

`offline_access` is how a client asks for a refresh token. It means "keep access after the user leaves". The client's `scope` allowlist applies to it because it's one of the IdP's own scopes (unlike `notes:read`, see phase 3 task 2), so without it here the request fails with `invalid_scope`.

**Files affected:** `idp/src/index.ts`.

**Depends on:** none.

---

## 2. [✅] Turn on refresh token rotation

Set `rotateRefreshToken: true` in the provider configuration. With the default, a confidential client like `notes-app` would keep reusing the same refresh token for most of its 14-day lifetime, and reuse detection (task 4) would have nothing to detect.

Rotation is what makes a stolen refresh token noisy: the thief and the real client both hold the same token, and whoever uses it second presents an already-used token. The IdP can't tell which one is the attacker, so it revokes everything.

Check: `pnpm --filter idp typecheck` passes and the IdP starts.

**Files affected:** `idp/src/index.ts`.

**Depends on:** 1.

---

## 3. [✅] Get and use a refresh token by hand

Repeat phase 3 task 3's manual flow (the commands from that session work), with these changes:

- The authorize URL's `scope` becomes `openid offline_access notes:read notes:write`, and it gets `prompt=consent`. Without `prompt=consent`, `oidc-provider` silently drops `offline_access` and issues no refresh token. OIDC requires explicit consent for offline access, so the user must always see the consent screen for it.
- The consent screen now mentions offline access.
- The token response now contains a `refresh_token`. It's opaque: a reference into the IdP's storage, meant only for the IdP.

Then refresh with `curl`:

```
grant_type=refresh_token
refresh_token=<the refresh token>
resource=http://api.localhost:5000
```

(plus the same `-u notes-app:$CLIENT_SECRET`). Check:

- The response has a **new** `access_token` (a JWT, new `jti`, new `exp`) and a **new** `refresh_token`: that's rotation.
- Without `resource`, the new access token is opaque again, as in phase 3. The refresh request needs it too.

Keep all refresh tokens you receive, in order, for task 4.

**Files affected:** none.

**Depends on:** 2.

---

## 4. [✅] Probe reuse detection by hand

Continuing from task 3:

1. Refresh with the **first** refresh token, the one already used: expect `400` with `invalid_grant` ("refresh token already used").
2. Refresh with the **newest** refresh token, which was valid a moment ago: expect `invalid_grant` too. Step 1 revoked the whole grant.
3. Call `notes-api` with the last access token you got: it **still works** until its `exp`. Revoking the grant at the IdP can't reach a JWT that `notes-api` verifies on its own. That's the JWT trade-off from phase 3, and the reason access tokens are short-lived.

**Files affected:** none.

**Depends on:** 3.

---

## 5. [✅] Request `offline_access` at sign-in

In `app/auth/login/route.ts`, the `scope` becomes `openid offline_access notes:read notes:write`, and add `prompt: 'consent'` (task 3 explains why). The trade-off: the consent screen now appears on every sign-in, even when the IdP session would otherwise skip it.

In `lib/auth/token-exchange.ts`, return `refresh_token` as well, and throw if it's missing: without it, `notes-app` can't keep the user signed in, and you want to know that at sign-in, not a minute later.

Check: sign in again. The consent screen mentions offline access, and the `[token-exchange]` log line can say a refresh token was received (never log its value).

**Files affected:** `notes-app/app/auth/login/route.ts`, `notes-app/lib/auth/token-exchange.ts`.

**Depends on:** 1.

---

## 6. [✅] Store the refresh token in the session

In `lib/auth/session.ts`:

- Add `refreshToken: string` to `Session`, and pass it through `createSession`. The callback route stores what the token exchange returned.
- Add `updateSessionTokens(sessionId, { accessToken, expiresIn, refreshToken })` (`expiresIn` in seconds, as in the token response, like `createSession`), which replaces the token fields of an existing session and does nothing if the session no longer exists (for example, the user logged out during a refresh).

This is where the "server-side session store" design decision pays off: a refresh can happen while a server component renders, and server components can't set cookies. Because the cookie holds only the session ID, the rotated tokens just go into the store.

**Files affected:** `notes-app/lib/auth/session.ts`, `notes-app/app/auth/callback/route.ts`.

**Depends on:** 5.

---

## 7. [✅] Extract the client authentication header

The token exchange builds `Authorization: Basic base64(urlencode(client_id):urlencode(client_secret))`. The refresh request (task 8) and token revocation (task 11) need the same header. Move it into a small helper, for example `clientAuthHeader()` in `lib/auth/client-auth.ts` (server-only), and use it in `token-exchange.ts`.

**Files affected:** `notes-app/lib/auth/client-auth.ts` (new), `notes-app/lib/auth/token-exchange.ts`.

**Depends on:** none.

---

## 8. [ ] Write the refresh request

Create `lib/auth/refresh.ts` (server-only) with a function that takes a refresh token and calls `token_endpoint`:

- `POST` with a `URLSearchParams` body: `grant_type=refresh_token`, `refresh_token`, and `resource` (task 3 showed why), plus the client authentication header from task 7.
- Return `access_token`, `expires_in`, and the **new** `refresh_token`. If the response has no `refresh_token`, throw: rotation is on, so a missing one means something is misconfigured.
- On `400` with `error=invalid_grant` (the refresh token expired, was revoked, or was already used), throw a dedicated error class, for example `RefreshRejectedError`. It means "this session is over". Anything else (IdP unreachable, `500`) is an ordinary error: the user might still be fine after a retry.

The response also contains a new `id_token`. You can ignore it: the session keeps the original one, and the user's identity doesn't change on refresh.

**Files affected:** `notes-app/lib/auth/refresh.ts` (new).

**Depends on:** 7.

---

## 9. [ ] Refresh with at most one request in flight per session

Create a function like `getFreshAccessToken(sessionId, { force })` that returns an access token that's valid for at least the next 10 seconds:

1. If the session's token is still valid (and `force` isn't set), return it.
2. If a refresh for this session is already running, wait for it and return its result.
3. Otherwise start one: call task 8's function, save the result with `updateSessionTokens`, and return the new access token.

The in-flight refreshes live in a `Map<sessionId, Promise<...>>` on `globalThis`, like the stores. Remove the entry when the refresh finishes, whether it succeeded or failed.

Why this matters: the home page and a Server Action, or two parallel API calls, can both find an expired token at the same moment. Without single-flight, both send the same refresh token. The second one is a reuse, so the IdP revokes the grant (task 4) and the user is signed out, by your own app. Task 13 shows this.

The `Map` only coordinates requests inside one Node process. With several `notes-app` instances you'd need a shared lock (for example in Redis), which is out of scope here.

**Files affected:** `notes-app/lib/auth/refresh.ts` (or a new module next to it), possibly `notes-app/lib/auth/session.ts`.

**Depends on:** 6, 8.

---

## 10. [ ] Use refreshed tokens in the API client

Update `lib/notes-api.ts`:

- Get the token from `getFreshAccessToken` instead of checking `accessTokenExpiresAt` yourself. An expired access token is no longer "signed out".
- On a `401` from `notes-api`, refresh once with `force: true` and retry the request **once**. A second `401` means the problem isn't the token's age: sign out.
- If the refresh throws `RefreshRejectedError`, delete the session and throw `SignedOutError`, as before. Other refresh errors propagate as ordinary errors.

**Files affected:** `notes-app/lib/notes-api.ts`.

**Depends on:** 9.

---

## 11. [ ] Revoke the refresh token on logout

A local logout deletes the session, but the refresh token stays valid at the IdP for up to 14 days. Only `notes-app`'s server ever held it, so the risk is small, but a logout should end it:

- In the IdP, enable `features.revocation` (RFC 7009). The discovery document now lists a `revocation_endpoint`.
- Add `revocation_endpoint` to `notes-app`'s discovery document type.
- In `app/auth/logout/route.ts`, before deleting the session, `POST` to it with `token=<refresh token>`, `token_type_hint=refresh_token`, and the client authentication header (task 7). If it fails, log it and still log out locally: the user asked to leave.

Check: log out, then try the refresh token you just revoked with `curl` (copy it from a debug log beforehand, then remove that log): `invalid_grant`.

**Files affected:** `idp/src/index.ts`, `notes-app/lib/auth/discovery.ts`, `notes-app/app/auth/logout/route.ts`.

**Depends on:** 6, 7.

---

## 12. [ ] Test the full flow by hand

In the Windows browser at `http://app.localhost:3000`:

- **Silent refresh:** sign in, wait past the access token's lifetime, reload. The notes still show, and the `notes-app` log shows one refresh. No sign-in prompt.
- **Rotation:** add a temporary log of the refresh token's first few characters in `updateSessionTokens`; it changes on every refresh. Remove the log afterwards.
- **Server Actions:** create and delete notes after the token has expired. The action refreshes first.
- **Restart the IdP:** its in-memory adapter forgets every refresh token. Wait for expiry and reload: the refresh fails with `invalid_grant`, and the page shows "Your session has expired" instead of crashing.
- **Logout:** log out and confirm the revocation in the log (task 11).
- **No tokens in the page:** still no `eyJ` in the page source.

**Files affected:** none (except the temporary log, removed).

**Depends on:** 10, 11.

---

## 13. [ ] Show why single-flight matters

1. Temporarily make the home page call `listNotes()` three times in parallel (`Promise.all`).
2. Sign in, wait for the access token to expire, and reload. The log shows **one** refresh, and the page works.
3. Temporarily bypass the in-flight `Map` (always start a new refresh) and repeat. The three requests refresh with the same refresh token: the IdP sees reuse, revokes the grant, and you're signed out.
4. Undo both temporary changes.

**Files affected:** none (temporary changes only, reverted).

**Depends on:** 12.

---

## 14. [ ] Mark phase 4 complete

Once tasks 1 to 13 pass:

- `CLAUDE.md`: tick the phase 4 checkbox and change "Current phase" to show that the mandatory phases are complete (phase 5 is optional). Add a gotcha: `offline_access` is silently dropped unless the authorize request has `prompt=consent`.
- `README.md`: tick roadmap item 4.
- `notes-app/README.md`: describe the refresh, single-flight, the retry on `401`, and revocation on logout.

**Files affected:** `CLAUDE.md`, `README.md`, `notes-app/README.md`.

**Depends on:** 12, 13.
