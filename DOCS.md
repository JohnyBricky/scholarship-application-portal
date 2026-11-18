# Real LIFE Foundation — Scholarship Application Portal Documentation

Complete technical and operational documentation covering **Installation**, **Directory Structure**, **Features**, **Usage**, **Development**, and **Project Agents**.

---

## 1. Installation & Setup

### Prerequisites
- **OS**: Windows 10 / 11 (for `.bat` launchers) or any OS with Python 3.10+.
- **External Packages**: **None** (uses Python standard library: `http.server`, `sqlite3`, `smtplib`, `logging`, `hmac`, `hashlib`, plus CDN-loaded Bootstrap 5, Leaflet, Chart.js, and jsPDF).

### Automatic Dependency Check / Installer
Run [`install_dependencies.bat`](install_dependencies.bat) (also invoked automatically by `start_server.bat`, `start_demo_app.bat`, and `setup_fresh_app.bat`):
- Checks for Python `3.10+` (`python` or `py -3`).
- If missing, installs Python `3.12` automatically via `winget` (or opens the official Python download page if `winget` is unavailable).
- Verifies all required built-in modules (`sqlite3`, `http.server`, `smtplib`, `logging`, `hmac`, `hashlib`).

### Option A: Demo App (Pre-Seeded Data)
Double-click [`start_demo_app.bat`](start_demo_app.bat):
- Sets `PORTAL_MODE=demo`, starts the server on `http://127.0.0.1:8080`, and opens your browser.
- Pre-seeds **15 demo users**, **10 realistic Philippine scholarship applications** across all pipeline stages, sample messages, and notifications.

### Option B: Fresh Production App (Clean Database)
Double-click [`setup_fresh_app.bat`](setup_fresh_app.bat):
- Creates a clean `RLApplicationPortal_Fresh/` folder with **0 demo applicants**, **0 demo messages**, and **only** the initial System Admin account (`sysadmin@reallife.ph` / `admin123`).
- Generates `start_fresh_server.bat` and `stop_fresh_server.bat` inside `RLApplicationPortal_Fresh/`.

### Option C: Server Control Scripts & Logs
| Script | Purpose |
| :--- | :--- |
| [`start_server.bat`](start_server.bat) | Verifies Python, starts `main.py` in the background, writes `logs/server.pid`. |
| [`stop_server.bat`](stop_server.bat) | Stops the background server via `logs/server.pid` and port `8080` cleanup. |
| [`restart_server.bat`](restart_server.bat) | Cleanly stops and restarts the server. |
| [`view_logs.bat`](view_logs.bat) | Live-tails `RLApplicationPortalBGC/logs/server.log` (last 50 lines + follow). |

### Option D: Static Demo (`file://`)
Open `RLApplicationPortalBGC/index.html` directly in any browser without running Python; data persists in `localStorage`.

---

## 2. Directory Structure

```text
RLApplicationPortalBGC-main/
├── DOCS.md                              # Full project documentation (this file)
├── README.md                            # Quick-start overview
├── install_dependencies.bat             # Python 3.10+ check & winget auto-installer
├── start_demo_app.bat                   # Launch pre-seeded Demo App
├── setup_fresh_app.bat                  # Build & initialize clean RLApplicationPortal_Fresh/
├── start_server.bat                     # Background server start (with PID tracking)
├── stop_server.bat                      # Clean server stop
├── restart_server.bat                   # Stop + start server
├── view_logs.bat                        # Live tail of server.log
├── .agent/
│   ├── brain.md                         # Project architecture memory & non-negotiable invariants
│   └── agents/
│       ├── portal-maintainer.md         # Component & UI maintenance specialist agent
│       └── security-auditor.md          # Security & RA 10173 privacy auditor agent
└── RLApplicationPortalBGC/
    ├── main.py                          # Slim HTTP router (PortalHandler) & rotating logger
    ├── portal.db                        # SQLite database (auto-created on first run)
    ├── app/
    │   ├── __init__.py                  # Backend package marker
    │   ├── db.py                        # Schema, migrations, demo/fresh seeding, settings helpers
    │   ├── security.py                  # PBKDF2, HMAC cookies, rate limits, CSV & upload safety
    │   ├── mailer.py                    # SMTP email dispatcher (supports DISABLE_SMTP=1)
    │   └── storage.py                   # Filesystem / Google Drive storage & status-bucket sync
    ├── js/
    │   ├── app.js                       # Page detection & initialization bootstrapper
    │   └── components/
    │       ├── core.js                  # Shared state, clientName branding, chat, maps, seed data
    │       ├── home.js                  # Hero carousel, announcements, FAQs & inquiry chat
    │       ├── auth.js                  # Password/OTP sign-in, password strength & registration
    │       ├── portal.js                # Applicant portal, status tracker, uploads & chat
    │       ├── staff.js                 # Staff dashboard, filters, visitation map, staff assign
    │       ├── reports.js               # Flattened PDF dossier & School Year demographics PDF
    │       └── settings.js              # SMTP, RBAC, IP logs, Audit Trail, Application Controller
    ├── css/
    │   └── styles.css                   # Custom portal styling
    ├── assets/                          # Logos and sample images
    ├── logs/                            # Rotating server.log & server.pid (auto-created)
    ├── uploads/                         # Uploaded applicant files organized by year/name/status
    ├── index.html                       # Public Foundation Hub
    ├── signin.html                      # Applicant & Staff Sign-In (Password / OTP)
    ├── register.html                    # OTP-Verified Applicant Registration & Screening Form
    ├── portal.html                      # Applicant Self-Service Dashboard
    ├── staff.html                       # Staff & Approver Review Dashboard
    ├── settings.html                    # System Settings & Application Controller
    └── privacy.html                     # Philippine Data Privacy Act (RA 10173) & Terms
```

---

## 3. Features

### Public Foundation Hub (`index.html`)
- Dynamic **Client / Center Name** branding across headers, badges, footers, and `<title>` tags.
- Managed **Hero Image Carousel**, **Announcements / Bulletin Board** (with IMPORTANT banner flag), **FAQ Accordion**, and **Interactive FAQ Chatbot**.
- **Privacy Policy & Legal Terms** (`privacy.html`) aligned with **Republic Act No. 10173 (Data Privacy Act of 2012)**, limitation of liability, "as-is" disclaimer, arbitration clause, and acceptable use policy.

### Applicant Experience (`register.html`, `signin.html`, `portal.html`)
- **OTP Email Verification** during registration and optional passwordless OTP login.
- **5-Stage Live Status Tracker**: `UNPROCESSED` → `FOR_VERIFICATION` → `SHORTLISTED` → `FOR_HOUSE_VISITATION` → `APPROVED` / `DECLINED`.
- **Interactive Philippine Address & Leaflet Pin Map** for accurate home coordinates.
- **Versioned Document Uploads** organized by the configurable Requirement Type Dictionary, with automatic edit lock after verification and resubmission remarks support.
- **Direct Applicant–Staff Chat** floating widget.

### Staff Reviewer Dashboard (`staff.html`)
- **KPI Summary Cards**, search, status, risk flag, and archived cycle filters.
- **Multi-Staff House Visitation Assignment** (`assign_staff`) + interactive **House Visitation Map** with Google Maps directions links.
- **Individual Flattened PDF Dossier**: Compiles Applicant Profile, Profile Photo, and uploaded documents flattened into PDF pages ordered by the **Requirement Type Dictionary**.
- **School Year Applicants & Demographics PDF Report**: Standalone report with breakdown charts and cohort metrics.
- **Formula-Safe CSV Export** (UTF-8 BOM, neutralized `=`, `+`, `-`, `@` prefixes).

### System Settings & Application Controller (`settings.html`)
- **SMTP Configuration & Test Email** + email notification log on status changes.
- **RBAC Account Management**: `applicant`, `approver`, `comms_admin`, `system_admin`, `admin`.
- **IP & MAC Security Monitor**: Automatic hit tracking and one-click IP blocking/unblocking.
- **Storage Backend**: Local filesystem (grouped into `uploads/<SchoolYear>/<Applicant>/<Status>/`) or Google Drive link mode.
- **Color-Coded Audit Trail**: Tracks logins, edits, reviews, status updates, controller changes, and cycle actions.
- **Application Controller**:
  - **Client / Center Name** (e.g., `BGC`, `Makati`, `Cebu`)
  - **Application Deadline & Registration Open/Closed Toggle**
  - **Draggable Requirement Type Dictionary** (controls required flags & PDF dossier page order)
  - **Risk Flag Rules** (GPA threshold & income bracket)
  - **Archive / Delete School Year Cycle**

### Security & Server Operations
- **PBKDF2-HMAC-SHA256** password hashing, **HMAC-SHA256** signed `HttpOnly` `rl_session` cookies, brute-force & OTP rate limiting, 12 MB payload limit, extension allowlist (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`), and security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
- **Rotating Server Logs**: `RLApplicationPortalBGC/logs/server.log` (2 MB max, 5 backups) + `logs/server.pid`.

---

## 4. Usage Guide

### Default Demo Credentials (`PORTAL_MODE=demo`)
| Role | Email | Password |
| :--- | :--- | :--- |
| Applicant | `applicant@reallife.ph` | `demo123` |
| Staff Admin | `staff@reallife.ph` | `staff123` |
| System Admin | `sysadmin@reallife.ph` | `admin123` |
| Communications Lead | `comms@reallife.ph` | `comms123` |
| Approvers (Visitation) | `mark.navarro@reallife.ph` / `grace.bautista@reallife.ph` | `staff123` |

*(In `fresh` mode, only `sysadmin@reallife.ph` / `admin123` is created—change this password immediately after first login.)*

### Typical Workflows
1. **System Admin Initial Setup**: Sign in -> open `settings.html` -> set **Client / Center Name**, **Deadline**, **Requirement Type Dictionary** order, **SMTP**, and create staff accounts.
2. **Applicant Submission**: Open `register.html` -> verify email via OTP -> complete screening form + pin home address -> upload required documents in `portal.html`.
3. **Staff Review & Visitation**: Sign in -> open `staff.html` -> verify documents (`VERIFIED` or `RESUBMIT` with remarks) -> move qualified applicants to `SHORTLISTED` / `FOR_HOUSE_VISITATION` -> assign visitation staff -> export Individual PDF Dossiers or School Year Demographics Reports.

---

## 5. Development

### Architecture & Conventions
- **Zero-Build Frontend (`file://` compatible)**: Do **not** use ES `import`/`export` modules in `js/components/*.js`, as browsers block `type="module"` over `file://` due to CORS. Load component scripts in order before `js/app.js`.
- **Environment Variables**:
  - `PORT` (default `8080`)
  - `PORTAL_MODE` (`demo` or `fresh`, default `demo`)
  - `PORTAL_DB_PATH` (custom SQLite path override)
  - `DISABLE_SMTP=1` (suppresses outbound SMTP during automated testing)
- **Verification Commands**:
  ```bash
  python -m py_compile RLApplicationPortalBGC/main.py RLApplicationPortalBGC/app/*.py
  node --check RLApplicationPortalBGC/js/app.js RLApplicationPortalBGC/js/components/*.js
  ```

---

## 6. Project Agents & Brain

Dedicated project context files live under `.agent/`:
- [`.agent/brain.md`](.agent/brain.md) — Core architectural map, dual-mode (`http://` + `file://`) constraints, and non-negotiable invariants (`init_db`, `get_conn`, `PortalHandler`, `FAILED_AUTH`, `escapeHtml()`, `safe_csv_cell()`, `applyClientName()`).
- [`.agent/agents/portal-maintainer.md`](.agent/agents/portal-maintainer.md) — Guidelines for extending `app/*.py`, `main.py`, `js/components/*.js`, and HTML views while preserving module boundaries and verification checks.
- [`.agent/agents/security-auditor.md`](.agent/agents/security-auditor.md) — Checklist for auditing RBAC, session cookies, SQL parameterization, XSS/CSV/upload hardening, and Philippine RA 10173 compliance.
