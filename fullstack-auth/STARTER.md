# Full-stack + Auth starter

Use this starter for a project that needs a Python backend, a browser UI, and individual accounts.
It is a foundation, not a finished application. Replace the example dashboard with the requested
workflow; keep the working sign-up, sign-in, sign-out, and session helpers unless the user asks for
a different identity provider.

- `main.py`: FastAPI routes and the simple HTML shell. All protected actions must call
  `sandbox_auth.current_user` and check ownership before reading or changing user data.
- `static/style.css`: intentionally plain responsive styling; adapt it to the user's product.
- `sandbox_db.collection(...)`: durable app-scoped Firestore. Preview and published data are separate.
- `sandbox_auth`: stable signed sessions; do not replace its key with a local file or process secret.
- `migrations/`: add numbered, additive migrations when later schema changes need them.

No payment, email verification, password recovery, or third-party integration is included. Add only
the capabilities the requested application needs; configure external secrets through the platform,
never in this project or browser code. The normal AIT Foundry Publish flow deploys this app to Cloud Run.
