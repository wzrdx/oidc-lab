# TASKS: Phase 1, Bare IdP

Scope: phase 1 from `CLAUDE.md`. Run `node-oidc-provider` with the in-memory adapter, one static client, and the built-in dev login screens. Then drive one full authorization code flow by hand and check every security property along the way.

Starting point: `idp/src/index.ts` already mounts `oidc-provider` in Express with an empty configuration (`new Provider(ISSUER, {})`) and listens on port 4000.

Tasks 1 to 4 change code. Tasks 5 to 12 are manual steps run against the IdP and change no files. Phase 1 is about seeing the protocol happen, so those steps are deliberately done by hand and not scripted.

---

## 1. [✅] Verify the dev environment and the current IdP boot

Confirm the groundwork in `CLAUDE.md` > Dev environment before touching any code:

- `which node` shows a Linux path, not `/mnt/c/...`.
- `getent hosts idp.localhost` resolves to `127.0.0.1`.
- `pnpm install` succeeds at the repo root.
- `pnpm --filter idp dev` starts, and the Windows browser can open `http://idp.localhost:4000/hello` and `http://idp.localhost:4000/.well-known/openid-configuration`.
- `pnpm --filter idp typecheck` passes.

If the browser can't reach the IdP, fix the networking first (`networkingMode=mirrored`, or the hosts file followed by `wsl --shutdown`). Every later task depends on these URLs working.

**Files affected:** none.

---

## 2. [✅] Load IdP secrets from environment variables

The client secret has to come from the environment (`CLAUDE.md` > IdP client registration). The cookie signing keys in task 4 do too.

- Create `idp/.env.example` listing the variables with placeholder values: `NOTES_APP_CLIENT_SECRET`, plus `COOKIE_KEYS` as a comma-separated list.
- Create a local `idp/.env` holding the real dev values. It is already git-ignored.
- `idp/.gitignore` contains `.env*`, which would also ignore `.env.example`. Add a `!.env.example` line so the example file gets committed.
- Load the file when the app starts. Node has built-in support for this: either `process.loadEnvFile()` at the top of `src/index.ts`, or the `--env-file=.env` flag in the `dev` script. No `dotenv` dependency is needed.
- Read each variable once, and fail fast with a clear error if one is missing. Without that check, an `undefined` secret silently ends up in the provider configuration.

**Files affected:** `idp/.env.example` (new), `idp/.env` (new, local only), `idp/.gitignore`, `idp/src/index.ts`, possibly `idp/package.json` (if you use `--env-file`).

---

## 3. [✅] Register the static `notes-app` client

Add a `clients` array to the provider configuration with exactly one confidential client, matching `CLAUDE.md` > IdP client registration:

- `client_id: "notes-app"`
- `client_secret`: taken from `NOTES_APP_CLIENT_SECRET`
- `redirect_uris: ["http://app.localhost:3000/auth/callback"]`
- `response_types: ["code"]`
- `grant_types: ["authorization_code"]` (`refresh_token` arrives in phase 4)
- `token_endpoint_auth_method: "client_secret_basic"` (make this explicit, so the curl call in task 9 knows how to authenticate)

Type the configuration object with the `Configuration` type from `oidc-provider`, so typos in option names fail `pnpm --filter idp typecheck`. Leave `features.devInteractions` at its default (enabled). It provides the built-in login and consent screens that phase 1 uses.

**Files affected:** `idp/src/index.ts`.

**Depends on:** 2.

---

## 4. [✅] Set the provider's cookie signing keys

`oidc-provider` uses cookies to track the user's login session and the in-progress interaction. When `cookies.keys` isn't set, it warns at startup and cannot detect tampered cookies. Set `cookies: { keys: COOKIE_KEYS.split(",") }` in the configuration. With several keys, the first one signs and every key verifies, which is the hook for rotating keys later.

Restart the IdP and confirm the startup warning about missing cookie keys is gone. Any remaining warnings are expected at this stage, such as the one about the development signing key that the README already mentions.

**Files affected:** `idp/src/index.ts`.

**Depends on:** 2.

---

## 5. [✅] Inspect the discovery document

Fetch `http://idp.localhost:4000/.well-known/openid-configuration` and work out what each field means for the client:

- `issuer`: must match `ISSUER` exactly. The `iss` check in task 10 compares against it.
- `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `userinfo_endpoint`: the URLs used in tasks 6, 8, and 9.
- `scopes_supported`, `response_types_supported`, `grant_types_supported`.
- `code_challenge_methods_supported`: check that `S256` is listed.
- `token_endpoint_auth_methods_supported`: check that `client_secret_basic` is listed.
- `id_token_signing_alg_values_supported`: the algorithms task 10 will accept.

**Files affected:** none.

**Depends on:** 3, 4.

---

## 6. [✅] Inspect the JWKS

Fetch the `jwks_uri` from task 5. For each key, identify `kty`, `alg`/`crv`, `use`, and `kid`. Confirm the set holds only public material (no `d`, `p`, or `q` members).

Remember that this is `oidc-provider`'s built-in development key. Its private half is published, so anyone could sign tokens that this JWKS accepts. Proper key handling comes in phase 7.

**Files affected:** none.

**Depends on:** 5.

---

## 7. [✅] Generate PKCE, `state`, and `nonce` values by hand

Do the client's step 2 of the target flow (`CLAUDE.md` > Target flow) manually, in a terminal:

- `code_verifier`: 32 random bytes, base64url-encoded (43 characters).
- `code_challenge`: `base64url(SHA256(code_verifier))`, with no padding.
- `state` and `nonce`: each an independent random value.

Use `node -e` with `node:crypto`, or `openssl`. Keep all four values in shell variables for tasks 8 to 10. Note why each one exists: `state` protects the callback from CSRF, `nonce` binds the `id_token` to this request, and PKCE binds the `code` to whoever started the flow.

**Files affected:** none.

---

## 8. [✅] Build the authorize URL and log in through the dev screens

Build the authorization URL by hand from `authorization_endpoint` with these parameters: `client_id=notes-app`, `redirect_uri` (URL-encoded, exactly as registered), `response_type=code`, `scope=openid`, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256`.

Open it in the Windows browser. Sign in on the dev login screen (it accepts any username, which becomes the `sub`), then approve consent. The browser is redirected to `http://app.localhost:3000/auth/callback?code=...&state=...`. Nothing is listening there yet, so the error page is expected. Copy `code` from the address bar, and confirm that the returned `state` equals the one you sent.

Optional: open the browser dev tools and look at the cookies the IdP set on `idp.localhost` during login.

**Files affected:** none.

**Depends on:** 3, 4, 5, 7.

---

## 9. [✅] Exchange the code for tokens with curl

POST to `token_endpoint` with `curl`:

- Client authentication as HTTP Basic: `-u notes-app:$NOTES_APP_CLIENT_SECRET`.
- Form body: `grant_type=authorization_code`, `code`, `redirect_uri` (identical to the one used in task 8), `code_verifier`.

Do this right after task 8, because codes are short-lived. Read the response: `access_token` (opaque for now; JWT access tokens come in phase 3), `id_token`, `token_type`, `expires_in`, `scope`. There should be no `refresh_token`, because `offline_access` isn't requested until phase 4.

**Files affected:** none.

**Depends on:** 8.

---

## 10. [✅] Decode and verify the `id_token` by hand

Split the `id_token` on `.` and base64url-decode the header and the payload. Check by hand everything that `notes-app` will check in code in phase 2:

- Header `alg` is one you'd allow (task 5), and `kid` matches a key in the JWKS (task 6).
- `iss` equals the issuer exactly.
- `aud` is `notes-app`.
- `exp` is in the future, and `iat` is plausible.
- `nonce` equals the value from task 7.
- `sub` is the username you entered on the dev login screen.

**Files affected:** none.

**Depends on:** 6, 9.

---

## 11. [✅] Probe the security checks with failing requests

Show that each protection actually rejects bad input. Each probe needs a fresh `code` (repeat tasks 7 and 8), except the replay:

- **Code replay:** send the token request from task 9 a second time with the same `code`. Expect `invalid_grant`.
- **Wrong `code_verifier`:** expect `invalid_grant`.
- **Wrong client secret:** expect `invalid_client`.
- **Different `redirect_uri`** on the token request than on the authorize request: expect `invalid_grant`.
- **Unregistered `redirect_uri`** on the authorize request: expect an error page at the IdP, with no redirect.
- **No PKCE:** an authorize request without `code_challenge`. Write down whether the provider rejects it for this confidential client, and check that against its `pkce` configuration options. Whether to require PKCE explicitly is a decision to make here.

For each probe, write down which attack the check prevents.

**Files affected:** none.

**Depends on:** 9.

---

## 12. [✅] Mark phase 1 complete

Once tasks 1 to 11 pass, update the project status:

- `CLAUDE.md`: tick the phase 1 checkbox and change "Current phase" to `2 (not started)`.
- `README.md`: tick roadmap item 1.

**Files affected:** `CLAUDE.md`, `README.md`.

**Depends on:** 10, 11.
