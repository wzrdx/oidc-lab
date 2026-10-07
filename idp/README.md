# idp

The identity provider for oidc-lab. It is an Express server that mounts [`oidc-provider`](https://github.com/panva/node-oidc-provider) and runs at `http://idp.localhost:4000`.

It is the only party that knows who the user is. It shows the login and consent screens, issues authorization codes and tokens (`id_token`, access token, and later refresh tokens), and publishes its public signing keys at the JWKS endpoint so other apps can verify those tokens. Client apps such as `notes-app` never see the user's password; they redirect the browser here and get tokens back.

## Running

```bash
cp .env.example .env         # then fill in the values
pnpm --filter idp dev        # http://idp.localhost:4000
pnpm --filter idp typecheck
```

Discovery document: `http://idp.localhost:4000/.well-known/openid-configuration`

## Cookies

The IdP sets its own cookies on `idp.localhost`. They are separate from the `notes-app` session cookie on `app.localhost`. They hold only IDs; the data they point to lives in the provider's store (in memory for now, so a restart clears it).

**Interaction cookie: ties a multi-step login together.** A sign-in spans several requests: the authorize request, the login page, the consent page, then back to the authorization endpoint to issue the `code`. HTTP is stateless, so this cookie lets the IdP resume the original authorize request (with its `client_id`, `redirect_uri`, and `code_challenge`) after the user logs in. It is needed even on a first sign-in.

**Session cookie: keeps the user signed in at the IdP.** After a successful login, the IdP remembers the user. When a client sends the browser here again, the IdP skips the login screen and redirects straight back with a new `code`. Across different client apps, this is SSO.

The two sessions are independent:

| Cookie on       | Remembers                    | Used when                                     |
| --------------- | ---------------------------- | --------------------------------------------- |
| `app.localhost` | Signed in to `notes-app`     | Every page load in `notes-app`                |
| `idp.localhost` | Signed in at the IdP         | Only when a client redirects the browser here |

So logging out of `notes-app` alone does not log the user out of the IdP: the next "Sign in" succeeds without a password. RP-initiated logout fixes that.

### Signed cookies and the companion cookie

A cookie is just text in the browser, and the user controls it: it can be edited in dev tools, and `curl` can send any value. So a cookie alone can't tell the IdP whether it issued that value or someone made it up.

The fix is a signature. An HMAC is a short fingerprint computed from a message and a secret key. The same inputs always give the same fingerprint, any change to the message gives a completely different one, and without the secret the right fingerprint can't be computed.

When the IdP sets a cookie, it also sets a **companion cookie** with the same name plus `.sig`, holding the HMAC of the first:

```
_session     = abc123
_session.sig = HMAC("_session=abc123", secret)
```

On every request the IdP recomputes the HMAC and compares it with `.sig`. If they match, the cookie is exactly what the IdP set. If they don't match, or `.sig` is missing, the IdP ignores the cookie and treats the user as not logged in. Changing `_session` to another value breaks the match, and producing a matching `.sig` for the new value requires the secret.

Signing proves a value wasn't changed; it doesn't hide it (that would be encryption). The value is readable in dev tools, which is fine because it's only a random ID pointing at data the server holds.

The exact cookie names and hash algorithm come from Koa's cookie library, which `oidc-provider` uses internally. The cookie names are `_session`, `_interaction`, and `_interaction_resume`.

### httpOnly

`oidc-provider` sets all its cookies with `httpOnly: true` and `sameSite: 'lax'` by default.

| | What it stops | What it doesn't stop |
| --- | --- | --- |
| **httpOnly** | JavaScript in the page reading the cookie (`document.cookie`). A script injected into the IdP's pages (XSS) can't steal the session ID. | The user seeing or editing the cookie in dev tools; `curl` sending any cookie value. |
| **Signing** | The IdP accepting a cookie value it didn't issue. | Anyone reading the value. |

They solve different problems, so both are needed: httpOnly keeps a malicious script from taking the cookie, and signing keeps the IdP from accepting a forged one.

`sameSite: 'lax'` sends the cookie on top-level navigations from other sites (the redirect from `notes-app` to the IdP, so the login screen can be skipped) but not on cross-site background requests such as a hidden form POST, which protects against CSRF. `secure` isn't set because the lab runs on plain `http://`; over HTTPS the cookies would also be marked `secure`.

### Signing keys (`COOKIE_KEYS`)

The secret used for the HMAC comes from `COOKIE_KEYS`. These keys are unrelated to the JWKS keys that sign tokens.

`COOKIE_KEYS` is a comma-separated list of random secrets. The first key signs new cookies; every key in the list is accepted when verifying. That allows rotation without logging everyone out: put a new key first, keep the old one until its cookies expire, then remove it.

```bash
openssl rand -base64 32   # generate a key
```
