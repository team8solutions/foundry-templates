# Upstream source and adaptations

This starter is an adapted copy of the official `nextjs/saas-starter` project.

- Repository: <https://github.com/nextjs/saas-starter.git>
- Source commit: `6e33e58b1e553a41fe22e6b941a7229a002de361`
- License: MIT
- Original copyright: Copyright (c) 2025 Vercel

The original MIT license is preserved in `LICENSE`.

AIT Foundry adaptations:

- Updated the pinned Next.js, React, and supporting packages to supported stable releases (Next.js 16.4.5, past the 16.0.0–16.4.0 advisories).
- Replaced the upstream Stripe-dependent setup and billing UI with a billing-neutral base.
- Added strict server-side session, input, user, and team authorization checks.
- Added a session version so password changes invalidate older sessions.
- Replaced Drizzle, PostgreSQL migrations and JWT sessions with AIT Foundry's `#sandbox/db` and `#sandbox/auth` helpers (a copy in `.symposia/sandbox/`), so the app keeps data and sessions where the platform publishes it, with no database of its own.
- Added local setup, platform environment declarations, and verification tests.
- Accepted the browser's `Sec-Fetch-Site` on form posts and plain-HTTP cookies in previews, so sign-in works behind the AIT Foundry preview.
- Kept application accounts separate from credentials used by external integrations.
