"""Local HTTP + SQLite server for the Real LIFE Foundation (BGC) Application Portal."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import base64
import csv
import io
import json
import logging
from logging.handlers import RotatingFileHandler
import mimetypes
import os
import re
import secrets
import sqlite3
import time
from datetime import datetime
from http.cookies import SimpleCookie

from app.db import (
    BASE_DIR,
    DB_PATH,
    add_audit,
    add_notification,
    get_application_deadline,
    get_client_name,
    get_conn,
    get_flag_rules,
    get_requirement_types,
    get_session_secret,
    get_smtp_config,
    get_storage_config,
    init_db,
    is_registration_open,
    row_to_app,
)
from app.mailer import send_email_smtp
from app.security import (
    ADMIN_ROLES,
    ALLOWED_UPLOAD_EXTS,
    FAILED_AUTH,
    MAX_BODY_BYTES,
    clear_auth_failures,
    hash_password,
    is_rate_limited,
    is_safe_url,
    record_auth_failure,
    resolve_mac_address,
    safe_csv_cell,
    sign_session_token as _sign_session_token,
    verify_password,
    verify_session_token as _verify_session_token,
)
from app.storage import save_applicant_file, sync_applicant_folder_bucket

OTP_FAILS: dict[str, int] = {}
LOG_DIR = os.path.join(BASE_DIR, "logs")
LOG_FILE = os.path.join(LOG_DIR, "server.log")
PID_FILE = os.path.join(LOG_DIR, "server.pid")


def setup_logging() -> logging.Logger:
    """Configure rotating file + console logging for the portal server."""
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger("rl_portal")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S")
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=2 * 1024 * 1024, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(fmt)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(fmt)
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)
    return logger


SERVER_LOGGER = setup_logging()


def sign_session_token(user: dict) -> str:
    return _sign_session_token(user, get_session_secret())


def verify_session_token(token: str) -> dict | None:
    return _verify_session_token(token, get_session_secret())


class PortalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format: str, *args) -> None:
        SERVER_LOGGER.info("%s - %s", self._get_client_ip(), format % args)

    def log_error(self, format: str, *args) -> None:
        SERVER_LOGGER.error("%s - %s", self._get_client_ip(), format % args)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def _get_session_user(self) -> dict | None:
        raw_cookie = self.headers.get("Cookie", "") if self.headers else ""
        if not raw_cookie:
            return None
        cookie = SimpleCookie()
        try:
            cookie.load(raw_cookie)
        except Exception:
            return None
        morsel = cookie.get("rl_session")
        return verify_session_token(morsel.value) if morsel else None

    def _require_auth(self, roles: set[str] | None = None) -> dict | None:
        user = self._get_session_user()
        if not user:
            self._send_json(401, {"error": "Authentication required."})
            return None
        if roles is not None and user.get("role") not in roles:
            self._send_json(403, {"error": "Forbidden: insufficient role permissions."})
            return None
        return user

    def _send_json(self, status: int, data, extra_headers: dict[str, str] | None = None) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_BODY_BYTES:
            raise ValueError("Payload too large (max 12 MB).")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def _get_client_ip(self) -> str:
        addr = getattr(self, "client_address", None)
        return addr[0] if addr else "127.0.0.1"

    def _track_and_check_ip(self, path: str) -> bool:
        """Record client IP & MAC activity and return True if the IP is blocked."""
        ip = self._get_client_ip()
        mac = resolve_mac_address(ip)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with get_conn() as conn:
            row = conn.execute("SELECT blocked FROM ip_logs WHERE ip = ?", (ip,)).fetchone()
            conn.execute(
                """
                INSERT INTO ip_logs (ip, mac_address, last_seen, hit_count, last_path, blocked)
                VALUES (?, ?, ?, 1, ?, 0)
                ON CONFLICT(ip) DO UPDATE SET
                    mac_address = excluded.mac_address,
                    last_seen = excluded.last_seen,
                    hit_count = ip_logs.hit_count + 1,
                    last_path = excluded.last_path
                """,
                (ip, mac, now_str, path),
            )
            is_blocked = bool(row and row["blocked"] == 1)
        if is_blocked:
            self._send_json(403, {"error": f"Access denied: IP {ip} is blocked."})
            return True
        return False

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if self._track_and_check_ip(path):
            return
        if path == "/api/health":
            self._send_json(200, {"status": "ok"})
            return

        if path == "/api/content":
            with get_conn() as conn:
                anns = [dict(r) for r in conn.execute("SELECT * FROM announcements ORDER BY id DESC").fetchall()]
                faqs = [dict(r) for r in conn.execute("SELECT * FROM faqs ORDER BY id ASC").fetchall()]
                heroes = [dict(r) for r in conn.execute("SELECT * FROM hero_images ORDER BY id ASC").fetchall()]
            self._send_json(200, {
                "announcements": anns,
                "faqs": faqs,
                "heroImages": heroes,
                "registrationOpen": is_registration_open(),
                "deadline": get_application_deadline(),
                "requirementTypes": get_requirement_types(),
                "clientName": get_client_name(),
            })
            return

        if path == "/api/admin/smtp":
            if not self._require_auth({"admin", "comms_admin", "system_admin"}):
                return
            if not self._require_auth({"admin", "comms_admin", "system_admin"}):
                return
            cfg = get_smtp_config()
            with get_conn() as conn:
                s_rows = conn.execute("SELECT key, value FROM settings WHERE key IN ('smtp_enabled', 'notify_status_emails')").fetchall()
            s_map = {r["key"]: r["value"] for r in s_rows}
            self._send_json(200, {
                "host": cfg["host"],
                "port": cfg["port"],
                "user": cfg["user"],
                "hasPassword": bool(cfg["pass"]),
                "smtpEnabled": s_map.get("smtp_enabled", "1") == "1",
                "notifyStatusEmails": s_map.get("notify_status_emails", "1") == "1",
            })
            return

        if path == "/api/admin/users":
            if not self._require_auth({"admin", "system_admin"}):
                return
            if not self._require_auth(ADMIN_ROLES):
                return
            with get_conn() as conn:
                rows = conn.execute("SELECT id, name, email, role FROM users WHERE is_archived = 0 ORDER BY id ASC").fetchall()
            self._send_json(200, [dict(r) for r in rows])
            return

        if path == "/api/admin/ips":
            if not self._require_auth({"admin", "system_admin"}):
                return
            with get_conn() as conn:
                rows = conn.execute("SELECT ip, mac_address, last_seen, hit_count, last_path, blocked FROM ip_logs ORDER BY last_seen DESC").fetchall()
            self._send_json(200, [dict(r) for r in rows])
            return

        if path == "/api/admin/application-controller":
            if not self._require_auth({"admin", "system_admin"}):
                return
            if not self._require_auth({"admin", "system_admin"}):
                return
            with get_conn() as conn:
                archived_count = conn.execute("SELECT COUNT(*) FROM applications WHERE is_archived = 1").fetchone()[0]
                active_count = conn.execute("SELECT COUNT(*) FROM applications WHERE is_archived = 0").fetchone()[0]
                cycles = [r[0] for r in conn.execute("SELECT DISTINCT archived_cycle FROM applications WHERE is_archived = 1 AND archived_cycle != ''").fetchall()]
            self._send_json(200, {
                "registrationOpen": is_registration_open(),
                "deadline": get_application_deadline(),
                "clientName": get_client_name(),
                "activeCount": active_count,
                "archivedCount": archived_count,
                "archivedCycles": cycles,
                "flagRules": get_flag_rules(),
                "requirementTypes": get_requirement_types(),
            })
            return

        if path == "/api/admin/storage":
            if not self._require_auth({"admin", "system_admin"}):
                return
            if not self._require_auth({"admin", "system_admin", "approver", "comms_admin", "applicant"}):
                return
            self._send_json(200, get_storage_config())
            return

        if path == "/api/admin/audit":
            if not self._require_auth({"admin", "system_admin"}):
                return
            with get_conn() as conn:
                rows = conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100").fetchall()
            self._send_json(200, [dict(r) for r in rows])
            return

        if path == "/api/notifications":
            user = self._require_auth()
            if not user:
                return
            role = user["role"]
            email = user["email"].lower()
            with get_conn() as conn:
                if role in ("admin", "approver", "system_admin", "comms_admin"):
                    rows = conn.execute("SELECT * FROM notifications WHERE target_role = 'admin' ORDER BY id DESC LIMIT 50").fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM notifications WHERE target_role = 'applicant' AND lower(target_email) = ? ORDER BY id DESC LIMIT 50",
                        (email,),
                    ).fetchall()
            self._send_json(200, [dict(r) for r in rows])
            return

        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "applications" and parts[3] == "messages":
            user = self._require_auth()
            if not user:
                return
            app_id = int(parts[2])
            with get_conn() as conn:
                if user["role"] not in ADMIN_ROLES:
                    owner = conn.execute("SELECT user_email FROM applications WHERE id = ?", (app_id,)).fetchone()
                    if not owner or owner["user_email"].lower() != user["email"].lower():
                        self._send_json(403, {"error": "Forbidden"})
                        return
                rows = conn.execute(
                    "SELECT id, application_id, sender_role, sender_name, body, created_at FROM messages WHERE application_id = ? ORDER BY id ASC",
                    (app_id,),
                ).fetchall()
            self._send_json(200, [dict(r) for r in rows])
            return

        if len(parts) == 4 and parts[0] == "api" and parts[1] == "applications" and parts[3] == "files":
            user = self._require_auth()
            if not user:
                return
            app_id = int(parts[2])
            with get_conn() as conn:
                if user["role"] not in ADMIN_ROLES:
                    owner = conn.execute("SELECT user_email FROM applications WHERE id = ?", (app_id,)).fetchone()
                    if not owner or owner["user_email"].lower() != user["email"].lower():
                        self._send_json(403, {"error": "Forbidden"})
                        return
                rows = conn.execute(
                    "SELECT id, application_id, category, version, provider, original_name, stored_path, uploaded_at, review_status, review_remarks FROM applicant_files WHERE application_id = ? ORDER BY category ASC, version DESC",
                    (app_id,),
                ).fetchall()
            self._send_json(200, [
                {
                    "id": r["id"],
                    "applicationId": r["application_id"],
                    "category": r["category"],
                    "version": r["version"],
                    "provider": r["provider"],
                    "originalName": r["original_name"],
                    "storedPath": r["stored_path"],
                    "uploadedAt": r["uploaded_at"],
                    "reviewStatus": r["review_status"],
                    "reviewRemarks": r["review_remarks"],
                }
                for r in rows
            ])
            return

        if len(parts) == 3 and parts[0] == "api" and parts[1] == "files":
            user = self._require_auth()
            if not user:
                return
            file_id = int(parts[2])
            with get_conn() as conn:
                row = conn.execute("SELECT * FROM applicant_files WHERE id = ?", (file_id,)).fetchone()
                if row and user["role"] not in ADMIN_ROLES:
                    owner = conn.execute("SELECT user_email FROM applications WHERE id = ?", (row["application_id"],)).fetchone()
                    if not owner or owner["user_email"].lower() != user["email"].lower():
                        self._send_json(403, {"error": "Forbidden"})
                        return
            if not row or row["provider"] != "filesystem" or not os.path.isfile(row["stored_path"]):
                self._send_json(404, {"error": "File not found."})
                return
            with open(row["stored_path"], "rb") as f:
                data_bytes = f.read()
            ctype, _ = mimetypes.guess_type(row["stored_path"])
            self.send_response(200)
            self.send_header("Content-Type", ctype or "application/octet-stream")
            self.send_header("Content-Disposition", f'inline; filename="{os.path.basename(row["stored_path"])}"')
            self.send_header("Content-Length", str(len(data_bytes)))
            self.end_headers()
            self.wfile.write(data_bytes)
            return

        if path == "/api/applications":
            user = self._require_auth()
            if not user:
                return
            from urllib.parse import parse_qs
            qs = parse_qs(urlparse(self.path).query)
            show_archived = (qs.get("archived") or ["0"])[0] == "1" and user["role"] in ADMIN_ROLES
            with get_conn() as conn:
                if user["role"] in ADMIN_ROLES:
                    rows = conn.execute(
                        "SELECT * FROM applications WHERE is_archived = ? ORDER BY id DESC",
                        (1 if show_archived else 0,),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM applications WHERE lower(user_email) = ? AND is_archived = 0 ORDER BY id DESC",
                        (user["email"].lower(),),
                    ).fetchall()
                photo_rows = conn.execute(
                    "SELECT id, application_id FROM applicant_files WHERE category = 'ProfilePhoto' AND provider = 'filesystem' ORDER BY version ASC"
                ).fetchall()
                file_rows = conn.execute(
                    "SELECT application_id, category, review_status FROM applicant_files"
                ).fetchall()
                msg_rows = conn.execute(
                    "SELECT application_id, sender_role, is_read, COUNT(*) AS cnt FROM messages GROUP BY application_id, sender_role, is_read"
                ).fetchall()
            photo_map = {p["application_id"]: f"/api/files/{p['id']}" for p in photo_rows}
            unread_admin_map: dict[int, int] = {}
            unread_app_map: dict[int, int] = {}
            for m in msg_rows:
                if m["is_read"] == 0:
                    if m["sender_role"] == "applicant":
                        unread_admin_map[m["application_id"]] = unread_admin_map.get(m["application_id"], 0) + m["cnt"]
                    else:
                        unread_app_map[m["application_id"]] = unread_app_map.get(m["application_id"], 0) + m["cnt"]
            docs_by_app: dict[int, dict[str, str]] = {}
            for fr in file_rows:
                aid = fr["application_id"]
                docs_by_app.setdefault(aid, {})[fr["category"]] = fr["review_status"]

            req_types = get_requirement_types()
            required_cats = [rt["code"] for rt in req_types if rt.get("required")]
            flag_rules = get_flag_rules()
            gpa_thresh = float(flag_rules.get("gpaThreshold", 85.0))
            inc_bracket = flag_rules.get("incomeBracket", "Above PHP 30,000")
            enable_risk = bool(flag_rules.get("enableRisk", True))
            deadline_str = get_application_deadline()
            result = []
            for r in rows:
                item = row_to_app(r)
                item["photoUrl"] = photo_map.get(r["id"], "")
                item["archivedCycle"] = r["archived_cycle"]
                app_docs = docs_by_app.get(r["id"], {})
                missing = [c for c in required_cats if c not in app_docs]
                has_resubmit = any(v == "RESUBMIT" for v in app_docs.values())
                income_flag = bool(inc_bracket and r["income"] == inc_bracket)
                gpa_flag = float(r["gpa"] or 0) < gpa_thresh
                at_risk = enable_risk and (len(missing) > 0 or has_resubmit) and r["status"] not in ("APPROVED", "DECLINED")
                item["docCount"] = len([c for c in required_cats if c in app_docs])
                item["requiredDocTotal"] = len(required_cats)
                item["missingDocs"] = missing
                item["hasResubmit"] = has_resubmit
                item["incomeFlag"] = income_flag
                item["gpaFlag"] = gpa_flag
                item["atRisk"] = at_risk
                item["deadline"] = deadline_str
                item["unreadAdminCount"] = unread_admin_map.get(r["id"], 0)
                item["unreadApplicantCount"] = unread_app_map.get(r["id"], 0)
                result.append(item)
            self._send_json(200, result)
            return

        if path == "/api/export.csv":
            if not self._require_auth(ADMIN_ROLES):
                return
            with get_conn() as conn:
                rows = conn.execute("SELECT * FROM applications WHERE is_archived = 0 ORDER BY id DESC").fetchall()
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow([
                "ID", "Name", "Email", "Age", "School Year", "Course/Strand",
                "3-Yr GPA", "Household Income", "Contact", "Area", "Address",
                "Drive Link", "Status", "Updated At",
            ])
            for r in rows:
                writer.writerow([
                    safe_csv_cell(r["id"]), safe_csv_cell(r["name"]), safe_csv_cell(r["user_email"]),
                    safe_csv_cell(r["age"]), safe_csv_cell(r["school_year"]), safe_csv_cell(r["course"]),
                    safe_csv_cell(r["gpa"]), safe_csv_cell(r["income"]), safe_csv_cell(r["contact"]),
                    safe_csv_cell(r["area"]), safe_csv_cell(r["address"]), safe_csv_cell(r["drive_link"]),
                    safe_csv_cell(r["status"]), safe_csv_cell(r["updated_at"]),
                ])
            payload = ("\ufeff" + buf.getvalue()).encode("utf-8")
            add_audit("admin", "EXPORT_CSV", "applications", f"Exported {len(rows)} rows")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="RealLIFE_BGC_Applications.csv"')
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        low = path.lstrip("/").lower()
        if low.endswith((".db", ".db-wal", ".db-shm", ".py", ".pyc", ".docx")) or low.startswith("details/") or (low.startswith("images/") and not low.startswith("images/hero/")):
            self._send_json(403, {"error": "Access denied."})
            return

        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if self._track_and_check_ip(path):
            return
        try:
            data = self._read_json()
        except ValueError as exc:
            self._send_json(413, {"error": str(exc)})
            return

        if path == "/api/auth/logout":
            self._send_json(200, {"loggedOut": True}, {"Set-Cookie": "rl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"})
            return

        if path == "/api/auth/login-otp/send":
            email = (data.get("email") or "").strip().lower()
            with get_conn() as conn:
                user = conn.execute("SELECT name, email, role FROM users WHERE lower(email) = ?", (email,)).fetchone()
                if not user:
                    self._send_json(404, {"error": "No account found with this email."})
                    return
                code = str(secrets.randbelow(900_000) + 100_000)
                expires_at = int(datetime.now().timestamp()) + 600
                conn.execute(
                    """
                    INSERT INTO otp_codes (email, code, expires_at, verified)
                    VALUES (?, ?, ?, 0)
                    ON CONFLICT(email) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, verified=0
                    """,
                    (email, code, expires_at),
                )
            sent, err = send_email_smtp(
                email,
                "Real LIFE BGC — Sign-In OTP Code",
                f"Your Real LIFE Foundation (BGC) sign-in OTP code is: {code}\n\nThis code expires in 10 minutes.",
            )
            if sent:
                self._send_json(200, {"sent": True, "emailSent": True})
            else:
                self._send_json(200, {"sent": True, "emailSent": False, "demoOtp": code, "smtpNote": err})
            return

        if path == "/api/auth/login-otp/verify":
            email = (data.get("email") or "").strip().lower()
            code = (data.get("code") or "").strip()
            rate_key = f"otp:{email}"
            if is_rate_limited(rate_key):
                self._send_json(429, {"error": "Too many wrong OTP attempts. Please request a new code."})
                return
            now_ts = int(datetime.now().timestamp())
            with get_conn() as conn:
                row = conn.execute("SELECT * FROM otp_codes WHERE email = ?", (email,)).fetchone()
                if not row or row["code"] != code or row["expires_at"] < now_ts:
                    record_auth_failure(rate_key)
                    self._send_json(400, {"error": "Invalid or expired OTP code."})
                    return
                user = conn.execute("SELECT name, email, role FROM users WHERE lower(email) = ? AND is_archived = 0", (email,)).fetchone()
                if not user:
                    self._send_json(404, {"error": "Account not found."})
                    return
                conn.execute("DELETE FROM otp_codes WHERE email = ?", (email,))
            clear_auth_failures(rate_key)
            user_obj = {"name": user["name"], "email": user["email"], "role": user["role"]}
            tok = sign_session_token(user_obj)
            add_audit(user["email"], "LOGIN_OTP", user["email"], f"role={user['role']}")
            self._send_json(200, user_obj, {"Set-Cookie": f"rl_session={tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400"})
            return

        if path == "/api/auth/set-password":
            session_user = self._require_auth()
            if not session_user:
                return
            email = session_user["email"].lower()
            password = data.get("password") or ""
            if (
                not email
                or len(password) < 8
                or not re.search(r"[a-z]", password)
                or not re.search(r"[A-Z]", password)
                or not re.search(r"[0-9]", password)
            ):
                self._send_json(400, {"error": "Password must be 8+ chars with uppercase, lowercase, and a number."})
                return
            with get_conn() as conn:
                cur = conn.execute("UPDATE users SET password_hash = ? WHERE lower(email) = ?", (hash_password(password), email))
                if cur.rowcount == 0:
                    self._send_json(404, {"error": "Account not found."})
                    return
            add_audit(email, "SET_PASSWORD", email, "Password updated")
            self._send_json(200, {"updated": True})
            return

        if path == "/api/auth/login":
            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""
            rate_key = f"login:{self._get_client_ip()}:{email}"
            if is_rate_limited(rate_key):
                self._send_json(429, {"error": "Too many failed login attempts. Please wait 5 minutes."})
                return
            with get_conn() as conn:
                user = conn.execute("SELECT * FROM users WHERE lower(email) = ? AND is_archived = 0", (email,)).fetchone()
            if not user or not verify_password(password, user["password_hash"]):
                record_auth_failure(rate_key)
                add_audit(email or "unknown", "LOGIN_FAILED", email or "unknown", "Invalid credentials")
                self._send_json(401, {"error": "Invalid credentials"})
                return
            clear_auth_failures(rate_key)
            user_obj = {"name": user["name"], "email": user["email"], "role": user["role"]}
            tok = sign_session_token(user_obj)
            add_audit(user["email"], "LOGIN_PASSWORD", user["email"], f"role={user['role']}")
            self._send_json(200, user_obj, {"Set-Cookie": f"rl_session={tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400"})
            return

        if path == "/api/auth/register":
            name = (data.get("name") or "").strip()
            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""
            if not name or not email or len(password) < 6:
                self._send_json(400, {"error": "Name, email, and 6+ char password required"})
                return
            try:
                with get_conn() as conn:
                    conn.execute(
                        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'applicant')",
                        (name, email, hash_password(password)),
                    )
            except sqlite3.IntegrityError:
                self._send_json(409, {"error": "An account with this email already exists."})
                return
            add_notification("admin", f"New Applicant: {name}", f"{name} applied for {data['course']} ({data['schoolYear']}).")
            add_audit(email, "REGISTER_APPLICANT", email, f"Submitted {data['course']}")
            user_obj = {"name": name, "email": email, "role": "applicant"}
            tok = sign_session_token(user_obj)
            self._send_json(201, user_obj, {"Set-Cookie": f"rl_session={tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400"})
            return

        if path == "/api/auth/send-otp":
            if not is_registration_open():
                self._send_json(403, {"error": "Registration for this school year is not yet open."})
                return
            email = (data.get("email") or "").strip().lower()
            if not email or "@" not in email:
                self._send_json(400, {"error": "Valid email address is required."})
                return
            with get_conn() as conn:
                if conn.execute("SELECT 1 FROM users WHERE lower(email) = ?", (email,)).fetchone():
                    self._send_json(409, {"error": "An account with this email already exists."})
                    return
                prev = conn.execute("SELECT expires_at FROM otp_codes WHERE email = ?", (email,)).fetchone()
                now_ts = int(datetime.now().timestamp())
                if prev and (prev["expires_at"] - 540) > now_ts:
                    self._send_json(429, {"error": "Please wait 60 seconds before requesting another OTP."})
                    return
                code = str(secrets.randbelow(900_000) + 100_000)
                expires_at = now_ts + 600
                conn.execute(
                    """
                    INSERT INTO otp_codes (email, code, expires_at, verified)
                    VALUES (?, ?, ?, 0)
                    ON CONFLICT(email) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, verified=0
                    """,
                    (email, code, expires_at),
                )
            print(f"[OTP] Confirmation code for {email}: {code}")
            sent, err = send_email_smtp(
                email,
                "Real LIFE BGC — Email Confirmation OTP",
                f"Your Real LIFE Foundation (BGC) scholarship portal confirmation code is: {code}\n\nThis code expires in 10 minutes.",
            )
            if sent:
                self._send_json(200, {"sent": True, "emailSent": True})
            else:
                self._send_json(200, {"sent": True, "emailSent": False, "demoOtp": code, "smtpNote": err})
            return

        if path == "/api/auth/verify-otp":
            email = (data.get("email") or "").strip().lower()
            code = (data.get("code") or "").strip()
            rate_key = f"regotp:{email}"
            if is_rate_limited(rate_key):
                self._send_json(429, {"error": "Too many wrong OTP attempts. Please request a new code."})
                return
            now_ts = int(datetime.now().timestamp())
            with get_conn() as conn:
                row = conn.execute("SELECT * FROM otp_codes WHERE email = ?", (email,)).fetchone()
                if not row or row["code"] != code or row["expires_at"] < now_ts:
                    record_auth_failure(rate_key)
                    self._send_json(400, {"error": "Invalid or expired OTP code."})
                    return
                conn.execute("UPDATE otp_codes SET verified = 1 WHERE email = ?", (email,))
            clear_auth_failures(rate_key)
            self._send_json(200, {"verified": True})
            return

        if path == "/api/auth/register-and-apply":
            if not is_registration_open():
                self._send_json(403, {"error": "Registration for this school year is not yet open."})
                return
            name = (data.get("name") or "").strip()
            email = (data.get("email") or "").strip().lower()
            if not name or not email:
                self._send_json(400, {"error": "Name and email are required."})
                return
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            logs = [f"{now_str}: Email confirmed via OTP. Application received (UNPROCESSED)."]
            try:
                with get_conn() as conn:
                    otp_row = conn.execute("SELECT verified FROM otp_codes WHERE email = ?", (email,)).fetchone()
                    if not otp_row or otp_row["verified"] != 1:
                        self._send_json(403, {"error": "Please confirm your email via OTP first."})
                        return
                    conn.execute(
                        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'applicant')",
                        (name, email, hash_password(secrets.token_hex(24))),
                    )
                    conn.execute(
                        """
                        INSERT INTO applications
                        (user_email, name, age, school_year, course, gpa, income, contact, area, address, drive_link, status, updated_at, email_logs, lat, lng)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNPROCESSED', ?, ?, ?, ?)
                        """,
                        (
                            email, name, int(data["age"]), data["schoolYear"],
                            data["course"], float(data["gpa"]), data["income"], data["contact"],
                            data["area"], data["address"], data.get("driveLink") or "", now_str, json.dumps(logs),
                            data.get("lat"), data.get("lng"),
                        ),
                    )
                    conn.execute("DELETE FROM otp_codes WHERE email = ?", (email,))
            except sqlite3.IntegrityError:
                self._send_json(409, {"error": "An account with this email already exists."})
                return
            add_notification("admin", f"New Applicant: {name}", f"{name} applied for {data['course']} ({data['schoolYear']}).")
            add_audit(email, "REGISTER_APPLICANT", email, f"Submitted {data['course']}")
            user_obj = {"name": name, "email": email, "role": "applicant"}
            tok = sign_session_token(user_obj)
            self._send_json(201, user_obj, {"Set-Cookie": f"rl_session={tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400"})
            return

        if path == "/api/admin/application-controller":
            if not self._require_auth({"admin", "system_admin"}):
                return
            reg_open = "1" if data.get("registrationOpen", True) else "0"
            deadline = (data.get("deadline") or "").strip()
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO settings (key, value) VALUES ('registration_open', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (reg_open,),
                )
                conn.execute(
                    "INSERT INTO settings (key, value) VALUES ('application_deadline', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (deadline,),
                )
                if "clientName" in data:
                    cname = (data.get("clientName") or "BGC").strip() or "BGC"
                    conn.execute(
                        "INSERT INTO settings (key, value) VALUES ('client_name', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (cname,),
                    )
                if "flagRules" in data:
                    conn.execute(
                        "INSERT INTO settings (key, value) VALUES ('flag_rules', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (json.dumps(data["flagRules"]),),
                    )
                if "requirementTypes" in data:
                    conn.execute(
                        "INSERT INTO settings (key, value) VALUES ('requirement_types', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (json.dumps(data["requirementTypes"]),),
                    )
            if "flagRules" in data:
                add_audit("admin", "UPDATE_FLAG_RULES", "flag_rules", json.dumps(data["flagRules"]))
            if "requirementTypes" in data:
                add_audit("admin", "UPDATE_REQUIREMENT_DICTIONARY", "requirement_types", f"{len(data['requirementTypes'])} items")
            if "flagRules" not in data and "requirementTypes" not in data:
                add_audit("admin", "APPLICATION_CONTROLLER", "settings", f"open={reg_open == '1'}, deadline={deadline}")
            self._send_json(200, {
                "registrationOpen": reg_open == "1",
                "deadline": deadline,
                "clientName": get_client_name(),
                "flagRules": get_flag_rules(),
                "requirementTypes": get_requirement_types(),
            })
            return

        if path == "/api/admin/archive-cycle":
            if not self._require_auth({"admin", "system_admin"}):
                return
            cycle_name = (data.get("cycleName") or f"SY {datetime.now().year}-{datetime.now().year + 1}").strip()
            with get_conn() as conn:
                cur = conn.execute(
                    "UPDATE applications SET is_archived = 1, archived_cycle = ? WHERE is_archived = 0",
                    (cycle_name,),
                )
                archived_apps = cur.rowcount
                conn.execute("UPDATE users SET is_archived = 1 WHERE role != 'admin' AND is_archived = 0")
                conn.execute("UPDATE notifications SET is_read = 1 WHERE target_role = 'admin'")
            add_audit("admin", "ARCHIVE_SCHOOL_YEAR", cycle_name, f"Archived {archived_apps} applications; preserved admins, SMTP, storage, and home content")
            self._send_json(200, {"archived": archived_apps, "cycleName": cycle_name})
            return

        if path == "/api/admin/delete-cycle":
            if not self._require_auth({"admin", "system_admin"}):
                return
            with get_conn() as conn:
                app_ids = [r[0] for r in conn.execute("SELECT id FROM applications WHERE is_archived = 1").fetchall()]
                if app_ids:
                    placeholders = ",".join("?" for _ in app_ids)
                    conn.execute(f"DELETE FROM applicant_files WHERE application_id IN ({placeholders})", app_ids)
                    conn.execute(f"DELETE FROM messages WHERE application_id IN ({placeholders})", app_ids)
                cur = conn.execute("DELETE FROM applications WHERE is_archived = 1")
                deleted_apps = cur.rowcount
                conn.execute("DELETE FROM users WHERE role != 'admin' AND is_archived = 1")
            add_audit("admin", "DELETE_ARCHIVED_CYCLE", "archived_applications", f"Deleted {deleted_apps} archived applications")
            self._send_json(200, {"deleted": deleted_apps})
            return

        if path == "/api/admin/announcements":
            if not self._require_auth({"admin", "comms_admin", "system_admin"}):
                return
            cat = (data.get("category") or "General").strip()
            title = (data.get("title") or "").strip()
            body = (data.get("body") or "").strip()
            banner = 1 if data.get("showOnBanner") else 0
            if not title or not body:
                self._send_json(400, {"error": "Title and body are required."})
                return
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            with get_conn() as conn:
                cur = conn.execute(
                    "INSERT INTO announcements (category, title, body, show_on_banner, created_at) VALUES (?, ?, ?, ?, ?)",
                    (cat, title, body, banner, now_str),
                )
                aid = cur.lastrowid
            add_audit("admin", "CREATE_ANNOUNCEMENT", f"announcement:{aid}", title)
            self._send_json(201, {"id": aid})
            return

        if path == "/api/admin/faqs":
            if not self._require_auth({"admin", "comms_admin", "system_admin"}):
                return
            q = (data.get("question") or "").strip()
            a = (data.get("answer") or "").strip()
            if not q or not a:
                self._send_json(400, {"error": "Question and answer are required."})
                return
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            with get_conn() as conn:
                cur = conn.execute("INSERT INTO faqs (question, answer, created_at) VALUES (?, ?, ?)", (q, a, now_str))
                fid = cur.lastrowid
            add_audit("admin", "CREATE_FAQ", f"faq:{fid}", q[:60])
            self._send_json(201, {"id": fid})
            return

        if path == "/api/admin/hero-images":
            if not self._require_auth({"admin", "comms_admin", "system_admin"}):
                return
            with get_conn() as conn:
                count = conn.execute("SELECT COUNT(*) FROM hero_images").fetchone()[0]
                if count >= 5:
                    self._send_json(400, {"error": "Maximum of 5 hero images allowed."})
                    return
            caption = (data.get("caption") or "").strip()
            image_url = (data.get("imageUrl") or "").strip()
            content_b64 = data.get("contentBase64")
            filename = data.get("filename") or "hero.jpg"
            if content_b64:
                hero_dir = os.path.join(BASE_DIR, "Images", "Hero")
                os.makedirs(hero_dir, exist_ok=True)
                _, ext = os.path.splitext(filename)
                safe_fname = f"hero_{secrets.token_hex(6)}{ext or '.jpg'}"
                full_path = os.path.join(hero_dir, safe_fname)
                with open(full_path, "wb") as f:
                    f.write(base64.b64decode(content_b64))
                image_url = f"Images/Hero/{safe_fname}"
            if not image_url:
                self._send_json(400, {"error": "Image file or URL is required."})
                return
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            with get_conn() as conn:
                cur = conn.execute("INSERT INTO hero_images (image_url, caption, created_at) VALUES (?, ?, ?)", (image_url, caption, now_str))
                hid = cur.lastrowid
            add_audit("admin", "ADD_HERO_IMAGE", f"hero:{hid}", image_url)
            self._send_json(201, {"id": hid, "imageUrl": image_url})
            return

        if path == "/api/admin/users":
            if not self._require_auth({"admin", "system_admin"}):
                return
            name = (data.get("name") or "").strip()
            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""
            role = data.get("role") if data.get("role") in ("admin", "approver", "system_admin", "comms_admin", "applicant") else "applicant"
            if not name or not email or len(password) < 6:
                self._send_json(400, {"error": "Name, email, and 6+ char password required."})
                return
            try:
                with get_conn() as conn:
                    cur = conn.execute(
                        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                        (name, email, hash_password(password), role),
                    )
                    new_id = cur.lastrowid
            except sqlite3.IntegrityError:
                self._send_json(409, {"error": "An account with this email already exists."})
                return
            self._send_json(201, {"id": new_id, "name": name, "email": email, "role": role})
            add_audit("admin", "CREATE_USER", email, f"role={role}")
            return

        if path == "/api/admin/ips/block":
            if not self._require_auth({"admin", "system_admin"}):
                return
            ip = (data.get("ip") or "").strip()
            blocked = 1 if data.get("blocked", True) else 0
            if not ip:
                self._send_json(400, {"error": "IP address is required."})
                return
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with get_conn() as conn:
                conn.execute(
                    """
                    INSERT INTO ip_logs (ip, last_seen, hit_count, last_path, blocked)
                    VALUES (?, ?, 0, 'manual', ?)
                    ON CONFLICT(ip) DO UPDATE SET blocked = excluded.blocked
                    """,
                    (ip, now_str, blocked),
                )
            add_audit("admin", "BLOCK_IP" if blocked else "UNBLOCK_IP", ip, f"blocked={bool(blocked)}")
            self._send_json(200, {"ip": ip, "blocked": bool(blocked)})
            return

        if path == "/api/admin/storage":
            if not self._require_auth({"admin", "system_admin"}):
                return
            pairs = {
                "storage_provider": data.get("provider") if data.get("provider") in ("filesystem", "google_drive", "nextcloud") else "filesystem",
                "storage_base_dir": (data.get("baseDir") or os.path.join(BASE_DIR, "Images")).strip(),
                "storage_gdrive_root": (data.get("gdriveRoot") or "").strip(),
                "storage_nextcloud_url": (data.get("nextcloudUrl") or "").strip(),
                "storage_nextcloud_user": (data.get("nextcloudUser") or "").strip(),
            }
            with get_conn() as conn:
                for k, v in pairs.items():
                    conn.execute(
                        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (k, v),
                    )
            add_audit("admin", "UPDATE_STORAGE", pairs["storage_provider"], pairs["storage_base_dir"])
            self._send_json(200, get_storage_config())
            return

        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "applications" and parts[3] == "files":
            user = self._require_auth()
            if not user:
                return
            app_id = int(parts[2])
            with get_conn() as conn:
                if user["role"] not in ADMIN_ROLES:
                    owner = conn.execute("SELECT user_email FROM applications WHERE id = ?", (app_id,)).fetchone()
                    if not owner or owner["user_email"].lower() != user["email"].lower():
                        self._send_json(403, {"error": "Forbidden"})
                        return
                app_row = conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
            if not app_row:
                self._send_json(404, {"error": "Application not found."})
                return
            ext_url = (data.get("externalUrl") or "").strip()
            if not is_safe_url(ext_url):
                self._send_json(400, {"error": "Invalid URL scheme."})
                return
            try:
                saved = save_applicant_file(
                    app_row,
                    data.get("category") or "Other",
                    data.get("filename") or "",
                    data.get("contentBase64"),
                    ext_url,
                )
            except (PermissionError, ValueError) as exc:
                self._send_json(400 if isinstance(exc, ValueError) else 403, {"error": str(exc)})
                return
            add_notification("admin", f"New File: {app_row['name']}", f"Uploaded {saved['category']} v{saved['version']} ({saved['originalName']}).")
            add_audit(app_row["name"], "UPLOAD_FILE", f"application:{app_id}", f"{saved['category']} v{saved['version']}")
            self._send_json(201, saved)
            return

        if path == "/api/notifications/read":
            user = self._require_auth()
            if not user:
                return
            nid = data.get("id")
            with get_conn() as conn:
                if nid:
                    conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (int(nid),))
                elif user["role"] in ADMIN_ROLES:
                    conn.execute("UPDATE notifications SET is_read = 1 WHERE target_role = 'admin'")
                else:
                    conn.execute(
                        "UPDATE notifications SET is_read = 1 WHERE target_role = 'applicant' AND lower(target_email) = ?",
                        (user["email"].lower(),),
                    )
            self._send_json(200, {"ok": True})
            return

        if len(parts) == 5 and parts[0] == "api" and parts[1] == "applications" and parts[3] == "messages" and parts[4] == "read":
            app_id = int(parts[2])
            viewer_role = data.get("viewerRole")
            other_role = "applicant" if viewer_role == "admin" else "admin"
            with get_conn() as conn:
                conn.execute(
                    "UPDATE messages SET is_read = 1 WHERE application_id = ? AND sender_role = ?",
                    (app_id, other_role),
                )
            self._send_json(200, {"ok": True})
            return

        if len(parts) == 4 and parts[0] == "api" and parts[1] == "applications" and parts[3] == "messages":
            user = self._require_auth()
            if not user:
                return
            app_id = int(parts[2])
            body_text = (data.get("body") or "").strip()
            sender_role = "admin" if user["role"] in ADMIN_ROLES else "applicant"
            sender_name = user["name"]
            if not body_text:
                self._send_json(400, {"error": "Message body required."})
                return
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            with get_conn() as conn:
                app_row = conn.execute("SELECT name, user_email FROM applications WHERE id = ?", (app_id,)).fetchone()
                if not app_row:
                    self._send_json(404, {"error": "Application not found."})
                    return
                cur = conn.execute(
                    "INSERT INTO messages (application_id, sender_role, sender_name, body, created_at) VALUES (?, ?, ?, ?, ?)",
                    (app_id, sender_role, sender_name, body_text, now_str),
                )
                msg_id = cur.lastrowid
            if sender_role == "admin":
                add_notification("applicant", "New Message from BGC Staff", f"{sender_name}: {body_text[:80]}", app_row["user_email"])
            else:
                add_notification("admin", f"New Chat from {app_row['name']}", body_text[:80])
            add_audit(sender_name, "SEND_MESSAGE", f"application:{app_id}", body_text[:80])
            self._send_json(201, {"id": msg_id, "createdAt": now_str})
            return

        if path == "/api/admin/smtp":
            if not self._require_auth({"admin", "comms_admin", "system_admin"}):
                return
            pairs = {
                "smtp_host": (data.get("host") or "smtp.gmail.com").strip(),
                "smtp_port": str(int(data.get("port") or 587)),
                "smtp_user": (data.get("user") or "").strip(),
                "smtp_enabled": "1" if data.get("smtpEnabled", True) else "0",
                "notify_status_emails": "1" if data.get("notifyStatusEmails", True) else "0",
            }
            if data.get("pass"):
                pairs["smtp_pass"] = data["pass"]
            with get_conn() as conn:
                for k, v in pairs.items():
                    conn.execute(
                        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (k, v),
                    )
            add_audit("admin", "UPDATE_SMTP", pairs["smtp_host"], f"user={pairs['smtp_user']}")
            self._send_json(200, {"saved": True})
            return

        if path == "/api/admin/smtp/test":
            if not self._require_auth({"admin", "comms_admin", "system_admin"}):
                return
            to_email = (data.get("to") or "").strip() or get_smtp_config()["user"]
            if not to_email:
                self._send_json(400, {"error": "Enter a recipient or sender email first."})
                return
            sent, err = send_email_smtp(
                to_email,
                "Real LIFE BGC — SMTP Test Email",
                "Your SMTP email configuration is working!",
            )
            add_audit("admin", "TEST_SMTP", to_email, "sent=True" if sent else f"error={err}")
            if sent:
                self._send_json(200, {"sent": True})
            else:
                self._send_json(500, {"error": err or "Failed to send test email."})
            return

        if path == "/api/applications":
            user = self._require_auth()
            if not user:
                return
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            user_email = user["email"].lower()
            with get_conn() as conn:
                existing = conn.execute("SELECT * FROM applications WHERE lower(user_email) = ?", (user_email,)).fetchone()
                if existing:
                    if existing["status"] not in ("UNPROCESSED", "FOR_VERIFICATION"):
                        self._send_json(403, {"error": "Application has passed verification and is locked from applicant edits."})
                        return
                    logs = json.loads(existing["email_logs"] or "[]")
                    logs.append(f"{now_str}: Application details updated.")
                    conn.execute(
                        """
                        UPDATE applications
                        SET name=?, age=?, school_year=?, course=?, gpa=?, income=?, contact=?, area=?, address=?, drive_link=?, updated_at=?, email_logs=?, lat=?, lng=?
                        WHERE id=?
                        """,
                        (
                            data["name"], int(data["age"]), data["schoolYear"], data["course"],
                            float(data["gpa"]), data["income"], data["contact"], data["area"],
                            data["address"], data["driveLink"], now_str, json.dumps(logs), data.get("lat"), data.get("lng"), existing["id"],
                        ),
                    )
                else:
                    logs = [f"{now_str}: Application received (UNPROCESSED)."]
                    conn.execute(
                        """
                        INSERT INTO applications
                        (user_email, name, age, school_year, course, gpa, income, contact, area, address, drive_link, status, updated_at, email_logs, lat, lng)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNPROCESSED', ?, ?, ?, ?)
                        """,
                        (
                            user_email, data["name"], int(data["age"]), data["schoolYear"],
                            data["course"], float(data["gpa"]), data["income"], data["contact"],
                            data["area"], data["address"], data["driveLink"], now_str, json.dumps(logs), data.get("lat"), data.get("lng"),
                        ),
                    )
            add_audit(user_email, "SAVE_APPLICATION", user_email, data["course"])
            self._send_json(200, {"saved": True})
            return

        self._send_json(404, {"error": "Not found"})

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        if self._track_and_check_ip(path):
            return
        if not self._require_auth({"admin", "system_admin", "comms_admin"}):
            return
        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "admin" and parts[2] == "announcements":
            aid = int(parts[3])
            with get_conn() as conn:
                conn.execute("DELETE FROM announcements WHERE id = ?", (aid,))
            add_audit("admin", "DELETE_ANNOUNCEMENT", f"announcement:{aid}", "")
            self._send_json(200, {"deleted": True})
            return
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "admin" and parts[2] == "faqs":
            fid = int(parts[3])
            with get_conn() as conn:
                conn.execute("DELETE FROM faqs WHERE id = ?", (fid,))
            add_audit("admin", "DELETE_FAQ", f"faq:{fid}", "")
            self._send_json(200, {"deleted": True})
            return
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "admin" and parts[2] == "hero-images":
            hid = int(parts[3])
            with get_conn() as conn:
                conn.execute("DELETE FROM hero_images WHERE id = ?", (hid,))
            add_audit("admin", "DELETE_HERO_IMAGE", f"hero:{hid}", "")
            self._send_json(200, {"deleted": True})
            return
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "admin" and parts[2] == "users":
            user_id = int(parts[3])
            with get_conn() as conn:
                target = conn.execute("SELECT id, email, role FROM users WHERE id = ?", (user_id,)).fetchone()
                if not target:
                    self._send_json(404, {"error": "User not found."})
                    return
                if target["role"] == "admin":
                    admin_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]
                    if admin_count <= 1:
                        self._send_json(400, {"error": "Cannot delete the last admin account."})
                        return
                conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
            add_audit("admin", "DELETE_USER", target["email"], f"id={user_id}")
            self._send_json(200, {"deleted": True})
            return
        self._send_json(404, {"error": "Not found"})

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path
        if self._track_and_check_ip(path):
            return
        if not self._require_auth(ADMIN_ROLES):
            return
        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "applications" and parts[3] == "assign-staff":
            app_id = int(parts[2])
            data = self._read_json()
            staff_list = data.get("staffList") or []
            with get_conn() as conn:
                row = conn.execute("SELECT name FROM applications WHERE id = ?", (app_id,)).fetchone()
                if not row:
                    self._send_json(404, {"error": "Application not found."})
                    return
                conn.execute(
                    "UPDATE applications SET assigned_staff = ? WHERE id = ?",
                    (json.dumps(staff_list), app_id),
                )
            add_audit("admin", "ASSIGN_VISITATION_STAFF", f"application:{app_id}", ", ".join(staff_list))
            self._send_json(200, {"updated": True, "assignedStaff": staff_list})
            return

        if len(parts) == 5 and parts[0] == "api" and parts[1] == "admin" and parts[2] == "announcements" and parts[4] == "banner":
            aid = int(parts[3])
            data = self._read_json()
            banner = 1 if data.get("showOnBanner") else 0
            with get_conn() as conn:
                conn.execute("UPDATE announcements SET show_on_banner = ? WHERE id = ?", (banner, aid))
            add_audit("admin", "TOGGLE_BANNER", f"announcement:{aid}", f"banner={bool(banner)}")
            self._send_json(200, {"updated": True})
            return

        if len(parts) == 3 and parts[0] == "api" and parts[1] == "applications":
            app_id = int(parts[2])
            data = self._read_json()
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            with get_conn() as conn:
                row = conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
                if not row:
                    self._send_json(404, {"error": "Application not found."})
                    return
                conn.execute(
                    """
                    UPDATE applications
                    SET name=?, age=?, school_year=?, course=?, gpa=?, income=?, contact=?, area=?, address=?, drive_link=?, updated_at=?, lat=?, lng=?
                    WHERE id=?
                    """,
                    (
                        data["name"], int(data["age"]), data["schoolYear"], data["course"],
                        float(data["gpa"]), data["income"], data["contact"], data["area"],
                        data["address"], data.get("driveLink") or "", now_str, data.get("lat"), data.get("lng"), app_id,
                    ),
                )
            add_audit("admin", "ADMIN_EDIT_APPLICANT", f"application:{app_id}", data["name"])
            self._send_json(200, {"updated": True})
            return

        if len(parts) == 4 and parts[0] == "api" and parts[1] == "files" and parts[3] == "review":
            file_id = int(parts[2])
            data = self._read_json()
            review_status = data.get("status")
            if review_status not in ("VERIFIED", "RESUBMIT", "PENDING"):
                self._send_json(400, {"error": "Invalid review status."})
                return
            remarks = (data.get("remarks") or "").strip()
            if review_status == "RESUBMIT" and not remarks:
                self._send_json(400, {"error": "Please provide remarks explaining why resubmission is needed."})
                return
            with get_conn() as conn:
                frow = conn.execute("SELECT * FROM applicant_files WHERE id = ?", (file_id,)).fetchone()
                if not frow:
                    self._send_json(404, {"error": "File not found."})
                    return
                app_row = conn.execute("SELECT name, user_email FROM applications WHERE id = ?", (frow["application_id"],)).fetchone()
                conn.execute(
                    "UPDATE applicant_files SET review_status = ?, review_remarks = ? WHERE id = ?",
                    (review_status, remarks, file_id),
                )
            if app_row:
                title = f"Document {review_status}: {frow['category']} v{frow['version']}"
                msg = remarks if remarks else f"Your {frow['category']} v{frow['version']} has been marked as {review_status}."
                add_notification("applicant", title, msg, app_row["user_email"])
                send_email_smtp(app_row["user_email"], f"Real LIFE BGC — {title}", f"Hello {app_row['name']},\n\n{msg}\n", is_status_email=True)
            add_audit("admin", "REVIEW_FILE", f"file:{file_id}", f"{review_status}: {remarks}")
            self._send_json(200, {"updated": True, "reviewStatus": review_status, "reviewRemarks": remarks})
            return

        if len(parts) == 4 and parts[0] == "api" and parts[1] == "applications" and parts[3] == "status":
            app_id = int(parts[2])
            data = self._read_json()
            new_status = data.get("status")
            note = data.get("note") or f"Status updated to {new_status}."
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            with get_conn() as conn:
                row = conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
                if not row:
                    self._send_json(404, {"error": "Application not found"})
                    return
                logs = json.loads(row["email_logs"] or "[]")
                logs.append(note)
                conn.execute(
                    "UPDATE applications SET status = ?, updated_at = ?, email_logs = ? WHERE id = ?",
                    (new_status, now_str, json.dumps(logs), app_id),
                )
            sync_applicant_folder_bucket(row, new_status)
            if new_status == "DECLINED":
                add_notification("applicant", "Application Status: Declined", note, row["user_email"])
                add_notification("admin", f"Applicant Declined: {row['name']}", f"{row['name']} was marked as DECLINED.")
            else:
                add_notification("applicant", f"Status Updated: {new_status}", note, row["user_email"])
            add_audit("admin", "UPDATE_STATUS", f"application:{app_id}", f"{row['status']} -> {new_status}")
            send_email_smtp(
                row["user_email"],
                f"Real LIFE BGC — Application Status Update ({new_status})",
                f"Hello {row['name']},\n\nYour Real LIFE Foundation (BGC) scholarship application status has been updated to: {new_status}.\n\nDetails: {note}\n",
                is_status_email=True,
            )
            self._send_json(200, {"updated": True})
            return
        self._send_json(404, {"error": "Not found"})


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("127.0.0.1", port), PortalHandler)
    os.makedirs(LOG_DIR, exist_ok=True)
    with open(PID_FILE, "w", encoding="utf-8") as f:
        f.write(str(os.getpid()))
    SERVER_LOGGER.info("Real LIFE Portal started at http://127.0.0.1:%s (PID %s)", port, os.getpid())
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        SERVER_LOGGER.info("Real LIFE Portal stopping (KeyboardInterrupt).")
    finally:
        server.server_close()
        if os.path.exists(PID_FILE):
            try:
                os.remove(PID_FILE)
            except OSError:
                pass
        SERVER_LOGGER.info("Real LIFE Portal stopped.")
