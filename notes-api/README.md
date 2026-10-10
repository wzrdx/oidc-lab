# notes-api

The resource server of [oidc-lab](../README.md): a NestJS API that stores notes and verifies JWT access tokens issued by the lab's identity provider. It never logs anyone in and never talks to the browser; only `notes-app`'s server calls it.

Runs at `http://api.localhost:5000`.

## How it works

Every request goes through one global guard (`AccessTokenGuard`, registered with `APP_GUARD`), which answers three questions in order:

1. **Is the route `@Public()`?** Then no token is needed. Only `GET /` (health check) is.
2. **Is the access token valid?** Otherwise `401`.
3. **Does it carry the route's `@RequireScopes(...)`?** Otherwise `403`.

A route with neither `@Public()` nor `@RequireScopes()` returns `500` and logs an error: every route must say who may call it, so forgetting fails closed.

### Token checks

`verifyAccessToken` uses `jose`, with the IdP's keys fetched from its JWKS endpoint and cached. No call to the IdP per request.

| Check                    | Stops                                                         |
| ------------------------ | ------------------------------------------------------------- |
| Signature (JWKS)         | Forged or modified tokens                                     |
| `alg` pinned to `RS256`  | Algorithm downgrade, `alg: none`                              |
| `typ: at+jwt`            | An `id_token` used as an access token                         |
| `iss`                    | Tokens from another IdP                                       |
| `aud`                    | Tokens issued for another API                                 |
| `exp`                    | Expired tokens (60-second lifetime)                           |
| `sub`, `client_id`, `scope` present and strings | Malformed tokens                       |

Rejections follow RFC 6750: `WWW-Authenticate: Bearer` (no token), `Bearer error="invalid_token"` (bad token), or `Bearer error="insufficient_scope", scope="..."` (missing scope). The reason is logged on the server; the response stays generic.

### Routes

| Route               | Scope         | Does                                     |
| ------------------- | ------------- | ---------------------------------------- |
| `GET /notes`        | `notes:read`  | Lists the caller's notes                 |
| `POST /notes`       | `notes:write` | Creates a note from `{ "text": string }` |
| `DELETE /notes/:id` | `notes:write` | Deletes one of the caller's notes        |

The owner of a note is always the token's `sub`, never anything in the request. Scopes limit what the client app may do; `sub` decides whose notes it may touch. Someone else's note returns `404`, the same as a note that doesn't exist. Notes are kept in memory and disappear on restart.

## Code layout

| Path                                  | What it does                                                    |
| ------------------------------------- | --------------------------------------------------------------- |
| `src/auth/auth.config.ts`             | The issuer, audience, and JWKS URI this API trusts              |
| `src/auth/verify-access-token.ts`     | Token verification with `jose`, returns a typed principal       |
| `src/auth/access-token.guard.ts`      | The global guard: public check, authentication, scopes          |
| `src/auth/public.decorator.ts`        | `@Public()`                                                     |
| `src/auth/require-scopes.decorator.ts`| `@RequireScopes(...)`, typed to the scopes the API knows        |
| `src/notes/`                          | Notes controller, in-memory service, module                     |

No Passport: the guard and the decorators are written by hand. There's no CORS configuration on purpose, because no browser ever calls this API.

## Setup

Requires the IdP to be running (see the [root README](../README.md)). No environment variables: everything the API trusts is a reviewed constant in `auth.config.ts`.

```bash
pnpm --filter notes-api start:dev   # http://api.localhost:5000
pnpm --filter notes-api test        # Vitest
```

The project is ESM (`"type": "module"`). Relative imports use `.ts` extensions; `rewriteRelativeImportExtensions` turns them into `.js` when compiling.
