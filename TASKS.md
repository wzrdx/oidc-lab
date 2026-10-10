# TASKS: Phase 3, `notes-api`

Scope: phase 3 from `CLAUDE.md`. Make the IdP issue JWT access tokens for `notes-api`, build `notes-api` as a NestJS resource server that verifies them locally (signature via JWKS, `alg`, `typ`, `iss`, `aud`, `exp`, scopes), and make `notes-app` call it server-side with `Authorization: Bearer`. Phase 2's tasks are archived in `TASKS-phase2.md`.

Starting point: `notes-api/` contains only `SCAFFOLD.md`. The IdP registers `notes-app` with `scope: "openid"` and has no resource servers. `notes-app` signs users in and keeps an (unused) access token in the session.

Ground rules that apply to every task:

- No auth libraries on either side. `jose` is the only helper. In `notes-api` that means no `@nestjs/passport` or `passport-jwt`.
- `notes-api` never logs anyone in and never talks to the browser. It has no CORS configuration on purpose.
- Tokens still never reach the browser. Only `notes-app` server code calls `notes-api`.
- The guard, the scope checks, and the `notes-app` API client are hand-written parts. Write them yourself; ask for help per task.

Names used throughout:

| Thing                          | Value                       |
| ------------------------------ | --------------------------- |
| Resource indicator (and `aud`) | `http://api.localhost:5000` |
| Scopes                         | `notes:read`, `notes:write` |
| Access token lifetime          | 5 minutes                   |

The resource indicator is a URI because RFC 8707 requires an absolute URI. It doubles as the API's base URL, but that's a convenience: the IdP treats it as an opaque identifier and never calls it.

Tasks 3 and 12 are manual steps that change no files, like phase 1's.

---

## 1. [✅] Scaffold `notes-api`

Follow `notes-api/SCAFFOLD.md`: move it out of the folder, run the Nest CLI from the repo root, run its "Check after scaffolding" list, and change the port to `5000`. Decide whether to put `SCAFFOLD.md` back or delete it.

Check: `pnpm --filter notes-api start:dev` serves the default "Hello World!" (the Nest 12 CLI generates an ESM project with Vitest, not Jest) at `http://api.localhost:5000` from the Windows browser.

**Files affected:** `notes-api/` (generated), `notes-api/src/main.ts`, `pnpm-lock.yaml`, possibly `pnpm-workspace.yaml`.

---

## 2. [✅] Register `notes-api` as a resource server in the IdP

The `resourceIndicators` feature is already enabled by default in `oidc-provider` 9, but its `getResourceServerInfo` hook throws until you implement it. That hook is how the IdP learns which APIs exist. In `idp/src/index.ts`, set `features.resourceIndicators.getResourceServerInfo` to a function that:

- for the resource `http://api.localhost:5000`, returns `{ scope: "notes:read notes:write", audience: "http://api.localhost:5000", accessTokenFormat: "jwt", accessTokenTTL: 300, jwt: { sign: { alg: "RS256" } } }`
- for any other resource, throws `new errors.InvalidTarget()` (import `errors` from `oidc-provider`). An unknown API must get no token at all.

`accessTokenFormat: "jwt"` is the switch from coat-check ticket to signed letter. The 5-minute lifetime is deliberately short so you'll see expiry happen during this phase. Phase 4's refresh tokens then deal with it.

Keep the resource URI and the scopes in named constants; `notes-api` will hard-code the same values on its side.

Check: `pnpm --filter idp typecheck` passes and the IdP starts.

**Files affected:** `idp/src/index.ts`.

**Depends on:** none.

---

## 3. [ ] Get a JWT access token by hand

Repeat phase 1's manual flow (tasks 7 to 9 in `TASKS-phase1.md`), with two additions:

- The authorize URL gets `scope=openid notes:read notes:write` and `resource=http://api.localhost:5000`.
- The `curl` to the token endpoint **also** sends `resource=http://api.localhost:5000`.

Decode the `access_token` (for example with `jose`'s `decodeJwt` and `decodeProtectedHeader` in a Node REPL, or by base64url-decoding the parts) and find:

- in the header: `alg: RS256`, a `kid` matching a key in `/jwks`, and `typ: at+jwt`
- in the payload: `iss`, `sub`, `aud: http://api.localhost:5000`, `client_id: notes-app`, `scope: notes:read notes:write`, `exp` 5 minutes after `iat`

Then run the flow once more **without** `resource` in the `curl` and look at the `access_token`: a short random string, not a JWT. Here's why. If the token request names no resource and includes `openid`, `oidc-provider` issues an opaque token meant for its own userinfo endpoint. Naming the resource at the authorize request isn't enough by default. Keep this in mind for task 5.

Keep one valid JWT access token in a scratch file. You'll use it in task 12, before it expires or after getting a fresh one.

**Files affected:** none.

**Depends on:** 2.

---

## 4. [ ] Add the `notes-api` settings to `notes-app`

Add `NOTES_API_URL=http://api.localhost:5000` to `notes-app/.env.local` and `.env.example` (no `NEXT_PUBLIC_` prefix), and read it in `lib/auth/config.ts` like the other variables. It serves two purposes: the resource indicator in token requests, and the base URL for API calls.

**Files affected:** `notes-app/.env.local`, `notes-app/.env.example`, `notes-app/lib/auth/config.ts`.

**Depends on:** none.

---

## 5. [ ] Request an access token for `notes-api` at sign-in

Two small changes in `notes-app`, following task 3:

- `app/auth/login/route.ts`: `scope` becomes `openid notes:read notes:write`, and add `resource` (task 4's value).
- `lib/auth/token-exchange.ts`: add the same `resource` to the token request body. Without it, you get the opaque token from task 3.

Optionally, log the access token's decoded `aud` and `scope` once in the callback (`jose`'s `decodeJwt`, which reads without verifying), never the token itself. `notes-app` doesn't verify the access token: it's addressed to `notes-api`, and to the client it's an opaque credential to pass along. Reading it for a debug log is fine; making decisions based on it isn't.

Check: sign out, sign in again. The IdP shows a consent screen again, because the existing grant doesn't cover the new scopes. Afterwards the log shows `aud=http://api.localhost:5000` and both scopes.

**Files affected:** `notes-app/app/auth/login/route.ts`, `notes-app/lib/auth/token-exchange.ts`, possibly `notes-app/app/auth/callback/route.ts`.

**Depends on:** 2, 4.

---

## 6. [ ] Add `jose` and the auth configuration to `notes-api`

`pnpm --filter notes-api add jose`. The Nest 12 scaffold is ESM (`"type": "module"`, `module: "nodenext"`) and tests with Vitest, so the CommonJS/Jest concern in `SCAFFOLD.md` doesn't apply. Still, confirm that `jose` loads both in the app and under Vitest before building on it.

Create `src/auth/auth.config.ts` with the three values the API trusts, as constants:

- `issuer`: `http://idp.localhost:4000`
- `audience`: `http://api.localhost:5000` (this API's own identity)
- `jwksUri`: `http://idp.localhost:4000/jwks` (check the exact path in the discovery document)

They're constants and not env variables because none of them is secret. Changing any of them changes what the API trusts, so they belong in reviewed code.

**Files affected:** `notes-api/package.json`, `pnpm-lock.yaml`, `notes-api/src/auth/auth.config.ts` (new).

**Depends on:** 1.

---

## 7. [ ] Write the access-token verification function

Create `src/auth/verify-access-token.ts`, plain TypeScript with no Nest in it, so it's easy to read and test on its own. It's the API-side mirror of phase 2's `id-token.ts`:

- `createRemoteJWKSet(new URL(jwksUri))` once, at module level.
- `jwtVerify(token, jwks, { issuer, audience, algorithms: ["RS256"], typ: "at+jwt", requiredClaims: ["sub", "client_id", "scope"] })`.
- Return a small typed principal: `{ sub, clientId, scopes: Set<string> }`. The `scope` claim is one space-separated string; split it here, once.

Every option is a separate check, and each stops a different attack:

- `algorithms`: an attacker can't pick a weaker algorithm (or `none`) via the header.
- `issuer`: a token signed by someone else's IdP is rejected.
- `audience`: a token issued for another API can't be replayed here. This is the most commonly missed check in real systems.
- `typ: "at+jwt"`: an `id_token` (`typ: JWT`) can't be used as an access token. `aud` already blocks it today, but the two checks guard against different mix-ups.
- `exp` is checked by default.

**Files affected:** `notes-api/src/auth/verify-access-token.ts` (new).

**Depends on:** 6.

---

## 8. [ ] Write the authentication guard

Create `src/auth/access-token.guard.ts`, a Nest `CanActivate` guard:

1. Read the `Authorization` header. Accept only `Bearer <token>`: the scheme is case-insensitive, and anything else is "no token".
2. Call task 7's function. On any failure, throw `UnauthorizedException`.
3. Attach the principal to the request (for example `request.principal`), so handlers can read `sub`.

The 401 response should include `WWW-Authenticate: Bearer error="invalid_token"` (RFC 6750); without any token, plain `WWW-Authenticate: Bearer`. As in the callback: log the reason on the server, keep the response generic.

Register it globally with `APP_GUARD` in `AppModule`, so every route is protected by default and a new route can't be left open by forgetting a decorator. Add a `@Public()` decorator (`SetMetadata` + `Reflector`) for the rare route that doesn't need a token. Mark the generated `GET /` with it as a health check.

Check: `curl -i http://api.localhost:5000/` returns 200, and any other route returns 401 without a token.

**Files affected:** `notes-api/src/auth/access-token.guard.ts` (new), `notes-api/src/auth/public.decorator.ts` (new), `notes-api/src/app.module.ts`, `notes-api/src/app.controller.ts`.

**Depends on:** 7.

---

## 9. [ ] Add the `@RequireScopes()` decorator and the scope check

Create `src/auth/require-scopes.decorator.ts`: `@RequireScopes("notes:write")` stores the required scopes as route metadata.

Extend the guard (or add a second global guard after it):

- If the route has required scopes and the token's `scopes` set lacks any of them, throw `ForbiddenException` with `WWW-Authenticate: Bearer error="insufficient_scope", scope="<required scopes>"`.
- If a route is neither `@Public()` nor `@RequireScopes(...)`, reject it as well. Failing closed means a route without a scope declaration is a bug you see immediately, not a hole you find later.

The difference between the two status codes: **401** says "I don't know who you are" (no token, or a bad one). **403** says "I know who you are, and this token isn't allowed to do this".

**Files affected:** `notes-api/src/auth/require-scopes.decorator.ts` (new), `notes-api/src/auth/access-token.guard.ts` (or a new scopes guard), `notes-api/src/app.module.ts`.

**Depends on:** 8.

---

## 10. [ ] Implement the notes module

Generate a `notes` module, controller, and service. Store notes in memory (a `Map` in the service is enough; persistence isn't the point of this phase):

| Route               | Scope         | Does                                     |
| ------------------- | ------------- | ---------------------------------------- |
| `GET /notes`        | `notes:read`  | Lists the caller's notes                 |
| `POST /notes`       | `notes:write` | Creates a note from `{ "text": string }` |
| `DELETE /notes/:id` | `notes:write` | Deletes one of the caller's notes        |

A note is `{ id, ownerSub, text, createdAt }`. The owner always comes from the verified token's `sub`, **never** from the request body or a header. Every read and delete filters by it. Scopes answer "may this app do this kind of action"; `sub` answers "whose data". Both checks are needed.

Deleting a note that doesn't exist **or belongs to someone else** returns `404`, not `403`: a `403` would confirm that the ID exists. Validate the body by hand: `text` must be a non-empty string with a sensible maximum length, otherwise `400`.

**Files affected:** `notes-api/src/notes/` (new: module, controller, service), `notes-api/src/app.module.ts`.

**Depends on:** 9.

---

## 11. [ ] Write the `notes-app` API client

Create `lib/notes-api.ts` (starts with `import "server-only"`). It's the only place in `notes-app` that touches the access token:

- A function like `notesApiFetch(path, init)` that loads the session, sends `Authorization: Bearer <accessToken>` to `${NOTES_API_URL}${path}`, and returns the parsed response.
- If the access token has expired (`accessTokenExpiresAt` from phase 2 is in the past), don't call the API: it would return 401 anyway. Report "signed out" to the caller.
- If the API returns `401` anyway, treat it the same way. Until phase 4 adds refresh, the user has to sign in again; the UI should say so, not crash.
- Typed helpers on top: `listNotes()`, `createNote(text)`, `deleteNote(id)`.

**Files affected:** `notes-app/lib/notes-api.ts` (new).

**Depends on:** 5, 10.

---

## 12. [ ] Probe `notes-api` with `curl`

With the API running, use the JWT from task 3 (or a fresh one) and check that each case gets the expected response, and note which check caught it:

- **No token:** `401` with `WWW-Authenticate: Bearer`.
- **Malformed header** (`Authorization: Basic ...`, `Bearer` with nothing after it): `401`.
- **Valid token:** `GET /notes` → `200`, `POST /notes` → `201`.
- **Tampered payload:** change one character in the payload part: `401` (signature).
- **`alg: none`:** a hand-built token with `{"alg":"none"}` and no signature: `401` (algorithm allowlist).
- **The `id_token` as a Bearer token:** `401` (`typ` and `aud`).
- **Opaque token** from task 3's run without `resource`: `401` (not a JWT).
- **Expired token:** wait 5 minutes, retry: `401`.
- **Missing scope:** get a token with only `scope=openid notes:read` (and `resource`), then `POST /notes`: `403` with `insufficient_scope`. `GET /notes` still works.
- **Another user's note:** create a note as one user, then `DELETE` it with a token for a different `sub` (the dev login accepts any username): `404`.

**Files affected:** none.

**Depends on:** 3, 10.

---

## 13. [ ] Show the user's notes on the home page

When signed in, the home page lists the user's notes via `listNotes()` (task 11), in a server component. If the client reports "signed out" (expired token), show a short message and the "Sign in" link instead of the list.

As in phase 2: pass only note data (`id`, `text`, `createdAt`) to anything rendered. Never pass a token or the session.

**Files affected:** `notes-app/app/page.tsx` and/or a component next to `identity.tsx`.

**Depends on:** 11.

---

## 14. [ ] Create and delete notes from the home page

Add a form to create a note and a delete button per note, using **Server Actions** that call `createNote` / `deleteNote` on the server and then revalidate the page. This version of Next.js has breaking changes, so read its Server Actions guide in `notes-app/node_modules/next/dist/docs/` first.

Server Actions are POST requests, and Next.js checks their `Origin` against the host, which protects them from CSRF in the same way that `SameSite=Lax` protects logout. Check that the guide confirms this for this version, and that `allowedDevOrigins` / `serverActions.allowedOrigins` doesn't need `app.localhost`.

**Files affected:** `notes-app/app/` (actions file and the components from task 13).

**Depends on:** 13.

---

## 15. [ ] Test the full flow by hand

In the Windows browser at `http://app.localhost:3000`:

- **Sign in** (consent shows the new scopes), then create, list, and delete notes.
- **Two users:** sign in as a different username in another browser profile. Each user sees only their own notes.
- **No tokens in the page:** view the page source and search for `eyJ`. No match, even now that the page shows API data.
- **No browser calls to the API:** the Network tab shows no request to `api.localhost`. Every call goes from the `notes-app` server.
- **Expiry:** wait 5 minutes after signing in and reload. The page says you need to sign in again, and doesn't crash. (Phase 4 makes this invisible.)
- **Restart `notes-api`:** the notes are gone (in-memory store), but you stay signed in. Two independent stores.

**Files affected:** none.

**Depends on:** 12, 14.

---

## 16. [ ] Mark phase 3 complete

Once tasks 1 to 15 pass:

- `CLAUDE.md`: tick the phase 3 checkbox and change "Current phase" to `4 (not started)`.
- `README.md`: tick roadmap item 3, add `pnpm --filter notes-api start:dev` to "Install and run", and remove the "`notes-api/` isn't scaffolded yet" sentence.
- `notes-app/README.md`: mention the `notes-api` calls and `NOTES_API_URL`.
- Replace `notes-api/README.md` (generated by Nest) with a short description of the guard and its checks, like `notes-app`'s.

**Files affected:** `CLAUDE.md`, `README.md`, `notes-app/README.md`, `notes-api/README.md`.

**Depends on:** 15.
