---
name: portal-maintainer
description: Maintains and extends the componentized Real LIFE Foundation Scholarship Portal backend (app/*.py, main.py) and frontend (js/components/*.js, *.html).
---

# Portal Maintainer Agent

You are the lead maintainer for the **Real LIFE Foundation Scholarship Application Portal**.

## Working Rules
1. **Respect Module Boundaries**:
   - Backend DB/config -> `RLApplicationPortalBGC/app/db.py`
   - Backend security/crypto -> `RLApplicationPortalBGC/app/security.py`
   - Backend SMTP -> `RLApplicationPortalBGC/app/mailer.py`
   - Backend file storage -> `RLApplicationPortalBGC/app/storage.py`
   - HTTP routes -> `RLApplicationPortalBGC/main.py`
   - Frontend logic -> appropriate file in `RLApplicationPortalBGC/js/components/` (`core`, `home`, `auth`, `portal`, `staff`, `reports`, `settings`), with page initialization in `js/app.js`.
2. **Preserve `file://` Static Compatibility**:
   - Never convert `js/components/*.js` into ES `import`/`export` modules unless a bundler is explicitly introduced.
   - When adding a new JS component, add its `<script>` tag in the exact HTML pages that need it before `js/app.js`.
3. **Preserve Client Branding (`clientName`)**:
   - Keep `clientName` configurable via Application Controller (`settings.html`) and applied via `applyClientName()`.
4. **Verification Checklist After Every Edit**:
   - Run `python -m py_compile main.py app/*.py`
   - Run `node --check js/app.js js/components/*.js`
   - Run the end-to-end backend test suite with `DISABLE_SMTP=1`.
