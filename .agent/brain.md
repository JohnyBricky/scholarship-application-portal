# Project Brain: Real LIFE Foundation Scholarship Portal

## Core Identity & Constraints
- **Stack**: Zero-dependency Python 3 (`http.server`, `sqlite3`, `smtplib`) + Vanilla HTML/CSS/Bootstrap 5/Leaflet/Chart.js/jsPDF.
- **No Build Step / Dual-Mode**: Must work both via `python main.py` (`http://127.0.0.1:8080`) and directly via `file://` (`index.html`) using `localStorage` fallback.
- **Why no ES Modules (`import`/`export`) in JS**: Browsers block `type="module"` scripts over `file://` due to CORS. Always load components via ordered `<script src="js/components/...">` tags before `<script src="js/app.js">`.

## Architectural Map
- **Backend (`RLApplicationPortalBGC/`)**:
  - `main.py`: Re-exports `init_db`, `get_conn`, `FAILED_AUTH` (required by test suites) and runs `PortalHandler`.
  - `app/db.py`: SQLite schema (`portal.db`), settings helpers (`get_client_name`, `get_requirement_types`, `get_flag_rules`, etc.), audit/notifications.
  - `app/security.py`: PBKDF2 hashing, HMAC `rl_session` cookies, rate limiting, upload allowlist, CSV formula neutralization, safe URL checks.
  - `app/mailer.py`: SMTP sender (`DISABLE_SMTP=1` supported for tests).
  - `app/storage.py`: Requirement upload saving and status-bucket directory synchronization.
- **Frontend (`RLApplicationPortalBGC/js/`)**:
  - `components/core.js` -> shared globals, backend detection, notifications, chat, file sorting, PH address/pin maps.
  - `components/home.js` -> public landing content, announcements, FAQs, public chat.
  - `components/auth.js` -> login, OTP flows, password strength, registration.
  - `components/portal.js` -> applicant dashboard, tracker, application form, document upload, applicant chat.
  - `components/staff.js` -> admin/approver dashboard, filters, visitation map, edit/review/assign modals, CSV export.
  - `components/reports.js` -> individual flattened PDF dossier + school year demographics PDF report.
  - `components/settings.js` -> SMTP, RBAC users, IP blocks, storage, audit trail, Application Controller (`clientName`, deadline, draggable requirement dictionary).
  - `app.js` -> `init()` page bootstrapper.

## Non-Negotiable Invariants
1. Keep `test_portal.py` compatibility: `main.init_db`, `main.get_conn`, `main.PortalHandler`, `main.FAILED_AUTH` must remain importable from `main`.
2. Never add unescaped user input into `innerHTML` (always use `escapeHtml()`).
3. Never write unescaped CSV cells (always use `safe_csv_cell()` / `safeCsvCell()`).
4. Always preserve `DISABLE_SMTP=1` guard before sending emails during tests.
5. Client branding (`clientName`) must dynamically update `.client-name-text` elements and `<title>` without hardcoding a single center name in runtime UI updates.
