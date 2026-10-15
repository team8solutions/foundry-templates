# Next.js full-stack starter

Use this starter for a browser application that needs a TypeScript frontend, server routes, app-owned accounts, and PostgreSQL persistence.

## What is included

- Next.js App Router and React.
- Email/password signup, signin, signout, and signed HTTP-only sessions.
- A protected dashboard with team membership, profile, password, and activity views.
- PostgreSQL with Drizzle schema and committed additive migrations.
- A startup migration runner guarded by a bounded PostgreSQL advisory lock.
- Unit tests and a public HTTP integration suite.

The starter does not include billing, password recovery, email delivery, external connectors, cloud provisioning, or a platform identity SDK. Add only what the project needs. Application passwords and sessions identify users of this app only. Never reuse them as credentials for a connector or external service.

## Fast path: add one feature

This guide is everything you need. Do not re-read the starter's files to rediscover it. For a basic feature such as a tracker or list, change only these places:

1. **Table:** add it to `lib/server/db/schema.ts` with `userId` (and `teamId` if shared) referencing the existing tables. Run `npm run db:generate` to create the next migration in `drizzle/`. Do not edit `0000_initial.sql`.
2. **Page:** make `app/(dashboard)/dashboard/page.tsx` the feature's main screen, or add `app/(dashboard)/dashboard/<feature>/page.tsx` and a link in `app/(dashboard)/dashboard/layout.tsx`. Start with `const context = await requirePageUser();` and query only rows where `userId = context.user.id`.
3. **Writes:** add `app/api/<feature>/route.ts` modelled on `app/api/account/profile/route.ts`: `parseFormRequest`, then `requestUserContext` (redirect to `/sign-in` if empty), then a Zod schema from `lib/validation.ts`, then the write scoped to `context.user.id`, then `formRedirect` back with `success` or `error`. Plain HTML forms that post to the route are enough; no client state library is needed.
4. **Check:** run `npm run typecheck` and `npm run lint` once at the end.

Leave sign-in, sign-up, profile, security, activity, not-found, and their styles unchanged unless the request asks for them. They already work and pass the integration suite.

## Local setup

Requirements: Node 24+, npm, and Docker with Compose.

```sh
docker compose up -d postgres
npm ci
npm run db:setup
npm run db:migrate
npm run dev
```

`npm run db:setup` creates a private `.env.local` with disposable local values. It refuses to overwrite an existing file. No real credential is committed.

## Checks

During an AIT Foundry build, do not run this list. Let the preview start, then mention these as optional checks the person can ask for.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration
```

`build` does not need database or signing-key access. Runtime auth and database paths fail closed when required configuration is missing.

`test:integration` requires `DATABASE_URL` and `SESSION_SIGNING_KEY`. By default it starts and stops the built production application. Set `TEST_BASE_URL` to reuse the same suite against an already-running preview or production application. Set `TEST_PREVIEW_GRANT` only when that target is behind the trusted AIT Foundry preview proxy.

## Extending the starter

- Put secret-dependent code under `lib/server/` and keep it out of Client Components.
- Validate every request at runtime. TypeScript types do not validate network data.
- Call the server authorization helpers in every protected route or mutation. UI visibility is not authorization.
- Scope database writes to the signed-in user and their team. Never trust a browser-supplied user or team ID.
- Add a new numbered SQL migration for every schema change. Do not edit a migration already used by another environment.
- Keep `GET /api/healthz` as process liveness only. It does not prove database readiness.
- Configure rate limits for signup and signin at the trusted edge before public launch.
- Keep preview embedding support. Do not add `X-Frame-Options: DENY` without coordinating with the platform.

The default `npm start` command applies migrations before `next start`, so its database identity needs schema-write rights. If production uses a less-privileged runtime identity, run `npm run db:migrate` as a separately controlled deployment job and change the runtime command to `npm run start:app`. A separate migration job alone does not remove the default startup command's migration requirement.

In AIT Foundry, `DATABASE_URL` is provided automatically when the platform has an app database server configured. Preview gets its own development database and the published app gets a separate production database; data is never copied between them. Both use the database's owner login, so the default `npm start` migrations work. Setting your own `DATABASE_URL` in Project settings replaces the provided one. Outside Foundry, or without that server, set `DATABASE_URL` yourself; if preview and production share one, they share users and application data.
