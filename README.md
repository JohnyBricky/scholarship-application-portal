# Real LIFE Foundation — Scholarship Application Portal

A componentized, zero-dependency **Python 3 + SQLite + Bootstrap 5** scholarship application, document verification, PDF reporting, and house visitation portal for **Real LIFE Foundation** (configurable per center via **Client Name**, defaulting to `BGC`).

## Quick Start (Windows)
- **Install / Verify Dependencies**: Run [`install_dependencies.bat`](install_dependencies.bat) (auto-installs Python 3.12 via `winget` if missing).
- **Run Demo App** *(pre-seeded with 15 users & 10 realistic applications)*: Double-click [`start_demo_app.bat`](start_demo_app.bat).
- **Create Fresh Production App** *(clean database, System Admin only)*: Double-click [`setup_fresh_app.bat`](setup_fresh_app.bat).
- **Server Controls & Logs**: [`start_server.bat`](start_server.bat), [`stop_server.bat`](stop_server.bat), [`restart_server.bat`](restart_server.bat), [`view_logs.bat`](view_logs.bat).
- **Static Browser Demo (`file://`)**: Open [`RLApplicationPortalBGC/index.html`](RLApplicationPortalBGC/index.html) directly.

## Key Features
- **Public Hub & Legal**: Dynamic center branding, announcements, FAQs, inquiry chatbot, and RA 10173 Philippine Data Privacy Policy (`privacy.html`).
- **Applicant Portal**: OTP registration/login, 5-stage live status pipeline, Leaflet home pin map, versioned document uploads, and applicant–staff chat.
- **Staff & Reports**: KPI dashboard, multi-staff visitation assignment, House Visitation Map, Individual Flattened PDF Dossiers, School Year Demographics PDF Report, and formula-safe CSV export.
- **Settings & Controller**: SMTP, RBAC, IP/MAC security, Audit Trail, Client Name branding, and draggable Requirement Type Dictionary.

## Full Documentation
See **[DOCS.md](DOCS.md)** for complete installation, directory structure, feature specs, usage guides, development conventions, and project agents (`.agent/`).
