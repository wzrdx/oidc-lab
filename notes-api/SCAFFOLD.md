# Scaffolding notes-api

NestJS resource server, served at `http://api.localhost:5000`. It verifies JWT access tokens and never logs anyone in.

## Before you start

- The workspace root must already exist: a root `package.json` with a `packageManager` field, and `pnpm-workspace.yaml` listing `notes-api`. Without them, pnpm treats this folder as a standalone project and gives it its own lockfile.
- **Move this file out of `notes-api/` first.** I'm not certain the Nest CLI will refuse a non-empty folder, but an empty one avoids surprises. Put it back afterwards if you want to keep it.

## Scaffold

From the repo root:

```bash
pnpm dlx @nestjs/cli new notes-api --package-manager pnpm --skip-git --strict
```

- `--package-manager pnpm`: skips the interactive package manager prompt and installs with pnpm.
- `--skip-git`: stops Nest from running `git init` inside `notes-api/`. The repo root owns version control.
- `--strict`: turns on TypeScript strict mode, which is off by default in Nest projects.

## Check after scaffolding

- **No nested `.git`.** If `notes-api/.git` exists anyway, delete it.
- **No nested lockfile.** If `notes-api/pnpm-lock.yaml` was created, delete it and run `pnpm install` from the root.
- **Ignored build scripts.** If pnpm warns that build scripts were ignored, run `pnpm approve-builds` from the root and approve only what you recognise.
- **The package name** in `notes-api/package.json` should be `notes-api`. That's what `pnpm --filter notes-api start:dev` matches on.

## Things to watch out for

- **Change the port.** The generated `src/main.ts` listens on `3000` (or `process.env.PORT ?? 3000`), which collides with `notes-app`. Change it to `5000`.
- **Don't enable CORS.** Only the `notes-app` server calls this API, never the browser. CORS only matters for browser requests, so leaving it off is correct and keeps the API closed to other origins.
- **No Passport.** Don't add `@nestjs/passport` or `passport-jwt`. Token verification is a hand-written guard plus a scopes decorator using `jose` (`createRemoteJWKSet` + `jwtVerify` with a pinned `alg` list, `iss`, `aud`, scopes). That's phase 3.
- **`jose` and CommonJS.** Nest compiles to CommonJS by default, and recent `jose` versions are ESM-only. Node 24 can `require()` ES modules, so this should just work, but I haven't verified it with this exact setup. If you hit `ERR_REQUIRE_ESM`, that's the cause.
- **Open it at `http://api.localhost:5000`**, matching the `aud`/resource indicator the IdP will put in access tokens.
