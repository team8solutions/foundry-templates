# Full-stack + Auth starter

Use this starter for a project that needs a Python backend, a browser UI, and individual accounts.
It is a foundation, not a finished application. Replace the example dashboard with the requested
workflow; keep the working sign-up, sign-in, sign-out, and session helpers unless the user asks for
a different identity provider.

- `main.py`: FastAPI routes and the simple HTML shell. All protected actions must call
  `sandbox_auth.current_user` and check ownership before reading or changing user data.
- `static/style.css`: intentionally plain responsive styling; adapt it to the user's product.
- `sandbox_db.collection(...)`: durable app-scoped saved data. Preview and published data are separate.
  Use only what `sandbox_db` offers (listed at the top of `sandbox_db.py`), and import
  `SERVER_TIMESTAMP`, `AlreadyExists`, `transactional` and the like from it: the same code then runs
  wherever the platform publishes the app (Google Cloud or Azure). Never import `google.cloud` or
  `azure` libraries, and never add database connection variables.
- `sandbox_files`: uploads and download links, under the same rules.
- `sandbox_auth`: stable signed sessions; do not replace its key with a local file or process secret.
- `migrations/`: add numbered, additive migrations when later schema changes need them.

No payment, email verification, password recovery, or third-party integration is included. Add only
the capabilities the requested application needs; configure external secrets through the platform,
never in this project or browser code. The normal AIT Foundry Publish flow deploys this app; where it
runs (Google Cloud or Azure) is the platform's setting, not something this code chooses.
