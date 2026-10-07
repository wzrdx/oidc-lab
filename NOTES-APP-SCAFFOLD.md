# Scaffolding notes-app

Next.js app, served at `http://app.localhost:3000`. It is both the UI and the BFF (confidential OAuth client).

## Before you start

- The workspace root must already exist: a root `package.json` with a `packageManager` field, and `pnpm-workspace.yaml` listing `notes-app`. Without them, pnpm treats this folder as a standalone project and gives it its own lockfile.
- **Move this file out of `notes-app/` first.** `create-next-app` refuses to scaffold into a folder that contains files it doesn't recognise, and `SCAFFOLD.md` is one of them. Put it back afterwards if you want to keep it.

## Scaffold

From the repo root:

```bash
pnpm create next-app@latest notes-app
```

Suggested answers to the prompts:

| Prompt         | Answer | Why                                                                         |
| -------------- | ------ | --------------------------------------------------------------------------- |
| TypeScript     | Yes    | TypeScript everywhere                                                       |
| App Router     | Yes    | The auth routes are planned as `app/auth/login`, `app/auth/callback`, etc.  |
| `src/` folder  | Your call | If yes, the routes live under `src/app/auth/...` instead                 |
| ESLint, Tailwind, Turbopack, import alias | Your call | Not relevant to the auth work             |

## Check after scaffolding

- **No nested `.git`.** If `notes-app/.git` exists, delete it. The repo root owns version control.
- **No nested pnpm files.** If `notes-app/pnpm-lock.yaml` or `notes-app/pnpm-workspace.yaml` was created, delete it and run `pnpm install` from the root. If the nested `pnpm-workspace.yaml` contained `onlyBuiltDependencies` or `ignoredBuiltDependencies` (recent `create-next-app` versions may write these, e.g. for `sharp`; I'm not fully certain which versions do), move those settings into the root `pnpm-workspace.yaml`.
- **Ignored build scripts.** If pnpm warns that build scripts were ignored, run `pnpm approve-builds` from the root and approve only what you recognise (e.g. `sharp`).
- **The package name** in `notes-app/package.json` should be `notes-app`. That's what `pnpm --filter notes-app dev` matches on.

## Things to watch out for

- **Cross-origin dev warning.** If Next.js warns about dev requests from `app.localhost`, add `allowedDevOrigins: ["app.localhost"]` to `next.config.ts`.
- **Open it at `http://app.localhost:3000`, not `localhost:3000`.** Cookies are scoped by host. Using the wrong host means the session cookie and the OAuth redirect URI won't line up.
- **Secrets never get a `NEXT_PUBLIC_` prefix.** Next.js inlines `NEXT_PUBLIC_*` variables into the browser bundle. The client secret goes in `.env.local` as a plain name (e.g. `OIDC_CLIENT_SECRET`), and `.env*` must be gitignored.
- **No auth libraries.** Don't add `openid-client`, Auth.js/NextAuth, Passport, etc. When phase 2 starts, the only additions are `jose` and `server-only`.
- **Token code is server-only.** Every module that touches tokens starts with `import "server-only"`, so importing it from a client component fails the build. Never pass a token as a prop to a client component: props are serialized into the page.
