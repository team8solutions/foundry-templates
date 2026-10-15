# Foundry templates

Maintained application starters for [AIT Foundry](https://github.com/team8solutions/ait-foundry).

Each template lives in its own folder. Foundry selects a reviewed commit and packages the templates with its images. Project creation copies the selected folder through `sb template apply TEMPLATE`. It does not download this repository at runtime.

## Templates

| Folder | Stack | Requirements |
| --- | --- | --- |
| [`nextjs-fullstack`](nextjs-fullstack/STARTER.md) | Next.js, TypeScript, PostgreSQL, email/password accounts | Node 24.21.0, PostgreSQL, server-only database and session settings |
| [`fullstack-auth`](fullstack-auth/STARTER.md) | FastAPI, browser UI, email/password accounts | Foundry's Python runtime, `sandbox_auth`, `sandbox_db`, and app-scoped Firestore |

The Python starter depends on helpers supplied by Foundry. It is not a standalone Python distribution. Each template's `STARTER.md` describes its runtime contract.

## Check a template

For Next.js, use Node 24.21.0:

```bash
cd nextjs-fullstack
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The build needs no database or signing key. For local database setup and integration tests, follow [`nextjs-fullstack/STARTER.md`](nextjs-fullstack/STARTER.md). CI runs the existing integration suite against disposable PostgreSQL.

## Add or update a template

1. Put a template in its own folder. Include `STARTER.md`, dependency files, applicable license notices, and runnable checks.
2. Add its checks to `.github/workflows/quality.yml`.
3. Open a pull request here.
4. Update Foundry's template submodule to the reviewed commit. A new template also needs explicit approval in Foundry's existing installer, API, and selection UI. Adding a folder does not enable it automatically.
5. Run Foundry's template compatibility tests and rebuild both the workspace and control-plane images.

Existing generated applications keep their copied files. Updating this repository does not update those applications.

## Source and licenses

Both folders were copied without application changes from `team8solutions/ait-foundry` commit `446c56170c8e20e71f0447691bd51c825947abde`, under `services/workspace/templates/`.

Next.js upstream provenance and its MIT license remain in [`UPSTREAM.md`](nextjs-fullstack/UPSTREAM.md) and [`LICENSE`](nextjs-fullstack/LICENSE). No repository-wide license is granted for the other project-authored files.
