# Upstream source and adaptations

This starter is an adapted copy of the official `nextjs/saas-starter` project.

- Repository: <https://github.com/nextjs/saas-starter.git>
- Source commit: `6e33e58b1e553a41fe22e6b941a7229a002de361`
- License: MIT
- Original copyright: Copyright (c) 2025 Vercel

The original MIT license is preserved in `LICENSE`.

AIT Foundry adaptations:

- Updated the pinned Next.js, React, and supporting packages to supported stable releases.
- Replaced the upstream Stripe-dependent setup and billing UI with a billing-neutral base.
- Added strict server-side session, input, user, and team authorization checks.
- Added a session version so password changes invalidate older sessions.
- Added committed PostgreSQL migrations and a bounded advisory-lock migration runner.
- Added local PostgreSQL setup, platform environment declarations, and verification tests.
- Kept application accounts separate from credentials used by external integrations.
