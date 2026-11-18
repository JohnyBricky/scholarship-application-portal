"""SQLite database initialization, settings helpers, and audit/notification writers."""

from datetime import datetime
import json
import os
import secrets
import sqlite3

from app.security import hash_password

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("PORTAL_DB_PATH") or os.path.join(BASE_DIR, "portal.db")
PORTAL_MODE = os.environ.get("PORTAL_MODE", "demo").strip().lower()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables, run safe column migrations, and seed initial data if empty."""
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'applicant',
                is_archived INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        u_cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "is_archived" not in u_cols:
            conn.execute("ALTER TABLE users ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                age INTEGER NOT NULL,
                school_year TEXT NOT NULL,
                course TEXT NOT NULL,
                gpa REAL NOT NULL,
                income TEXT NOT NULL,
                contact TEXT NOT NULL,
                area TEXT NOT NULL,
                address TEXT NOT NULL,
                drive_link TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'UNPROCESSED',
                updated_at TEXT NOT NULL,
                email_logs TEXT NOT NULL,
                is_archived INTEGER NOT NULL DEFAULT 0,
                archived_cycle TEXT NOT NULL DEFAULT '',
                lat REAL DEFAULT NULL,
                lng REAL DEFAULT NULL,
                assigned_staff TEXT NOT NULL DEFAULT '[]'
            )
            """
        )
        app_cols = {r[1] for r in conn.execute("PRAGMA table_info(applications)").fetchall()}
        for col, ddl in [
            ("is_archived", "INTEGER NOT NULL DEFAULT 0"),
            ("archived_cycle", "TEXT NOT NULL DEFAULT ''"),
            ("lat", "REAL DEFAULT NULL"),
            ("lng", "REAL DEFAULT NULL"),
            ("assigned_staff", "TEXT NOT NULL DEFAULT '[]'"),
        ]:
            if col not in app_cols:
                conn.execute(f"ALTER TABLE applications ADD COLUMN {col} {ddl}")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS otp_codes (
                email TEXT PRIMARY KEY,
                code TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                verified INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ip_logs (
                ip TEXT PRIMARY KEY,
                mac_address TEXT NOT NULL DEFAULT 'Unknown',
                last_seen TEXT NOT NULL,
                hit_count INTEGER NOT NULL DEFAULT 1,
                last_path TEXT NOT NULL,
                blocked INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        ip_cols = {r[1] for r in conn.execute("PRAGMA table_info(ip_logs)").fetchall()}
        if "mac_address" not in ip_cols:
            conn.execute("ALTER TABLE ip_logs ADD COLUMN mac_address TEXT NOT NULL DEFAULT 'Unknown'")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS applicant_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                application_id INTEGER NOT NULL,
                category TEXT NOT NULL,
                version INTEGER NOT NULL,
                provider TEXT NOT NULL,
                original_name TEXT NOT NULL,
                stored_path TEXT NOT NULL,
                uploaded_at TEXT NOT NULL,
                review_status TEXT NOT NULL DEFAULT 'PENDING',
                review_remarks TEXT NOT NULL DEFAULT ''
            )
            """
        )
        f_cols = {r[1] for r in conn.execute("PRAGMA table_info(applicant_files)").fetchall()}
        if "review_status" not in f_cols:
            conn.execute("ALTER TABLE applicant_files ADD COLUMN review_status TEXT NOT NULL DEFAULT 'PENDING'")
        if "review_remarks" not in f_cols:
            conn.execute("ALTER TABLE applicant_files ADD COLUMN review_remarks TEXT NOT NULL DEFAULT ''")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                application_id INTEGER NOT NULL,
                sender_role TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                body TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        m_cols = {r[1] for r in conn.execute("PRAGMA table_info(messages)").fetchall()}
        if "is_read" not in m_cols:
            conn.execute("ALTER TABLE messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_role TEXT NOT NULL,
                target_email TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                details TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                show_on_banner INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS faqs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hero_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_url TEXT NOT NULL,
                caption TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        if conn.execute("SELECT COUNT(*) FROM announcements").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO announcements (category, title, body, show_on_banner, created_at) VALUES (?, ?, ?, ?, ?)",
                [
                    ("Application Window", "Preliminary Screening Open", "Submit your applicant profile and prepare your last 3 years of grades and proof of household income.", 1, now_str),
                    ("Orientation", "BGC Center Applicant Briefing", "Shortlisted applicants will receive an email invitation with exact venue details and interview schedule after verification.", 0, now_str),
                    ("Screening Stages", "5-Step Review Process", "Unprocessed -> For Verification -> Shortlisted / Interview -> House Visitation -> Approved. Email updates are sent at every stage.", 0, now_str),
                ],
            )
        if conn.execute("SELECT COUNT(*) FROM faqs").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO faqs (question, answer, created_at) VALUES (?, ?, ?)",
                [
                    ("What documents do I need to prepare for screening?", "Prepare your report cards/grades for the last 3 years, Birth Certificate, and proof of family/household income (ITR, Certificate of Indigency, or payslips).", now_str),
                    ("How will I know if my application moves to the next stage?", "Sign in to the Applicant Portal anytime to view your live status tag, and watch your inbox for email notifications at every stage.", now_str),
                    ("What happens during Shortlisted & House Visitation stages?", "Applicants who pass verification are scheduled for an interview, followed by a home visit by our BGC center staff before final approval.", now_str),
                ],
            )
        if conn.execute("SELECT COUNT(*) FROM hero_images").fetchone()[0] == 0:
            conn.execute(
                "INSERT INTO hero_images (image_url, caption, created_at) VALUES (?, ?, ?)",
                ("assets/rl/testSamplePics.jpg", "Real LIFE Foundation Scholars", now_str),
            )
        if PORTAL_MODE == "fresh":
            if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
                conn.executemany(
                    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                    [
                        ("System Administrator", "sysadmin@reallife.ph", hash_password("admin123"), "system_admin"),
                    ],
                )
        else:
            demo_users = [
                ("Angela Reyes", "applicant@reallife.ph", hash_password("demo123"), "applicant"),
                ("BGC Center Staff", "staff@reallife.ph", hash_password("staff123"), "admin"),
                ("System Administrator", "sysadmin@reallife.ph", hash_password("admin123"), "system_admin"),
                ("Communications Lead", "comms@reallife.ph", hash_password("comms123"), "comms_admin"),
                ("Pastor Mark Navarro", "mark.navarro@reallife.ph", hash_password("staff123"), "approver"),
                ("Coach Grace Bautista", "grace.bautista@reallife.ph", hash_password("staff123"), "approver"),
                ("Marco Dela Cruz", "marco.delacruz@example.com", hash_password("demo123"), "applicant"),
                ("Carlo Mendoza", "carlo.mendoza@example.com", hash_password("demo123"), "applicant"),
                ("Bea Villanueva", "bea.villanueva@example.com", hash_password("demo123"), "applicant"),
                ("Joshua Tan", "joshua.tan@example.com", hash_password("demo123"), "applicant"),
                ("Clarisse Lim", "clarisse.lim@example.com", hash_password("demo123"), "applicant"),
                ("Rafael Soriano", "rafael.soriano@example.com", hash_password("demo123"), "applicant"),
                ("Hannah Ocampo", "hannah.ocampo@example.com", hash_password("demo123"), "applicant"),
                ("Nathaniel Aquino", "nathaniel.aquino@example.com", hash_password("demo123"), "applicant"),
                ("Sofia Mercado", "sofia.mercado@example.com", hash_password("demo123"), "applicant"),
            ]
            for uname, uemail, upw, urole in demo_users:
                conn.execute(
                    "INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                    (uname, uemail, upw, urole),
                )

            if conn.execute("SELECT COUNT(*) FROM applications").fetchone()[0] == 0:
                demo_apps = [
                    ("applicant@reallife.ph", "Angela Reyes", 18, "SY 2026-2027 (Incoming 1st Year College)", "BS Information Technology", 92.4, "PHP 10,000 - 20,000", "+63 917 555 0101", "Taguig - Pembo / Cembo", "14 Sampaguita St., Brgy. Pembo, Taguig City", "https://drive.google.com/drive/folders/sample-angela-docs", "FOR_HOUSE_VISITATION", "2026-11-16 14:20", json.dumps(["2026-11-10: Application received (UNPROCESSED).", "2026-11-12: Moved to FOR VERIFICATION.", "2026-11-14: Shortlisted for interview.", "2026-11-16: Scheduled for FOR HOUSE VISITATION in Brgy. Pembo."]), 0, 14.5446, 121.0574, json.dumps(["Pastor Mark Navarro", "Coach Grace Bautista"])),
                    ("marco.delacruz@example.com", "Marco Dela Cruz", 17, "SY 2026-2027 (Incoming Grade 12)", "STEM Strand", 90.1, "Below PHP 10,000", "+63 918 555 0142", "Makati - Guadalupe / Pitogo", "88 Burgos St., Brgy. Pitogo, Makati City", "https://drive.google.com/drive/folders/sample-marco-docs", "SHORTLISTED", "2026-11-17 09:45", json.dumps(["2026-11-15: Application received (UNPROCESSED).", "2026-11-16: Moved to FOR VERIFICATION.", "2026-11-17: Shortlisted for panel interview."]), 0, 14.5588, 121.0454, json.dumps(["BGC Center Staff"])),
                    ("carlo.mendoza@example.com", "Carlo Mendoza", 19, "SY 2026-2027 (2nd-4th Year College)", "BS Accountancy", 88.75, "PHP 10,000 - 20,000", "+63 920 555 0188", "Taguig - Signal Village", "221 Rizal Ave., Central Signal Village, Taguig City", "https://drive.google.com/drive/folders/sample-carlo-docs", "FOR_VERIFICATION", "2026-11-18 10:15", json.dumps(["2026-11-17: Application received (UNPROCESSED).", "2026-11-18: Moved to FOR VERIFICATION."]), 0, 14.5097, 121.0566, "[]"),
                    ("bea.villanueva@example.com", "Bea Villanueva", 18, "SY 2026-2027 (Incoming 1st Year College)", "BS Nursing", 94.0, "Below PHP 10,000", "+63 915 555 0199", "Pateros - Poblacion", "45 M. Almeda St., Poblacion, Pateros", "https://drive.google.com/drive/folders/sample-bea-docs", "UNPROCESSED", "2026-11-18 16:00", json.dumps(["2026-11-18: Application received (UNPROCESSED)."]), 0, 14.5449, 121.0665, "[]"),
                    ("joshua.tan@example.com", "Joshua Tan", 20, "SY 2026-2027 (2nd-4th Year College)", "BS Civil Engineering", 91.5, "Below PHP 10,000", "+63 917 812 3409", "Taguig - Western Bicutan", "Blk 9 Lot 12, EP Housing, Western Bicutan, Taguig", "https://drive.google.com/drive/folders/sample-joshua-docs", "APPROVED", "2026-11-18 11:30", json.dumps(["2026-11-05: Application received.", "2026-11-10: House visitation completed.", "2026-11-18: APPROVED for SY 2026-2027 Scholarship."]), 0, 14.5172, 121.0365, json.dumps(["Pastor Mark Navarro"])),
                    ("clarisse.lim@example.com", "Clarisse Lim", 16, "SY 2026-2027 (Incoming Grade 11)", "ABM Strand", 93.2, "PHP 10,000 - 20,000", "+63 927 401 8821", "Pasig - Kapitolyo / Pineda", "19 Pine St., Brgy. Pineda, Pasig City", "https://drive.google.com/drive/folders/sample-clarisse-docs", "FOR_HOUSE_VISITATION", "2026-11-17 15:10", json.dumps(["2026-11-11: Application received.", "2026-11-17: Scheduled for House Visitation."]), 0, 14.5665, 121.0628, json.dumps(["Coach Grace Bautista"])),
                    ("rafael.soriano@example.com", "Rafael Soriano", 19, "SY 2026-2027 (Incoming 1st Year College)", "BS Computer Science", 89.4, "PHP 20,000 - 30,000", "+63 998 331 5520", "Taguig - Upper Bicutan", "72 Maharlika Rd., Upper Bicutan, Taguig City", "https://drive.google.com/drive/folders/sample-rafael-docs", "APPROVED", "2026-11-15 17:00", json.dumps(["2026-11-02: Application received.", "2026-11-15: APPROVED for Scholarship."]), 0, 14.4961, 121.0493, json.dumps(["BGC Center Staff", "Pastor Mark Navarro"])),
                    ("hannah.ocampo@example.com", "Hannah Ocampo", 18, "SY 2026-2027 (Incoming 1st Year College)", "BS Secondary Education", 87.9, "Below PHP 10,000", "+63 916 742 1190", "Makati - East Rembo / Comembo", "301 J.P. Rizal Ext., East Rembo, Makati City", "https://drive.google.com/drive/folders/sample-hannah-docs", "FOR_VERIFICATION", "2026-11-18 08:50", json.dumps(["2026-11-16: Application received.", "2026-11-18: Grade 12 report card under verification."]), 0, 14.5522, 121.0621, "[]"),
                    ("nathaniel.aquino@example.com", "Nathaniel Aquino", 21, "SY 2026-2027 (2nd-4th Year College)", "BS Hospitality Management", 81.5, "Above PHP 30,000", "+63 922 618 7734", "Paranaque - Bicutan", "55 Dona Soledad Ave., Better Living, Paranaque", "https://drive.google.com/drive/folders/sample-nathaniel-docs", "DECLINED", "2026-11-14 13:40", json.dumps(["2026-11-08: Application received.", "2026-11-14: DECLINED — did not meet household income & GPA threshold."]), 0, 14.4855, 121.0282, "[]"),
                    ("sofia.mercado@example.com", "Sofia Mercado", 17, "SY 2026-2027 (Incoming Grade 12)", "HUMSS Strand", 91.8, "Below PHP 10,000", "+63 906 519 4402", "Taguig - Ususan", "108 P. Mariano St., Brgy. Ususan, Taguig City", "https://drive.google.com/drive/folders/sample-sofia-docs", "UNPROCESSED", "2026-11-18 17:30", json.dumps(["2026-11-18: Application received (UNPROCESSED)."]), 0, 14.5356, 121.0676, "[]"),
                ]
                conn.executemany(
                    """
                    INSERT INTO applications (
                        user_email, name, age, school_year, course, gpa, income, contact, area,
                        address, drive_link, status, updated_at, email_logs, is_archived, lat, lng, assigned_staff
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    demo_apps,
                )
                first_app = conn.execute("SELECT id FROM applications WHERE user_email = 'applicant@reallife.ph'").fetchone()
                if first_app and conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0:
                    conn.executemany(
                        "INSERT INTO messages (application_id, sender_role, sender_name, body, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                        [
                            (first_app["id"], "admin", "BGC Center Staff", "Hi Angela! Your documents passed initial verification. Please confirm your availability for House Visitation this Saturday at 10:00 AM.", 0, now_str),
                            (first_app["id"], "applicant", "Angela Reyes", "Good day! Yes, our family will be home this Saturday at 10:00 AM. Thank you!", 1, now_str),
                        ],
                    )
                if conn.execute("SELECT COUNT(*) FROM notifications").fetchone()[0] == 0:
                    conn.executemany(
                        "INSERT INTO notifications (target_role, target_email, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                        [
                            ("admin", "", "2 New Unprocessed Applications", "Bea Villanueva and Sofia Mercado submitted their preliminary screening profiles.", 0, now_str),
                            ("applicant", "applicant@reallife.ph", "House Visitation Scheduled", "Pastor Mark Navarro and Coach Grace Bautista are assigned for your home visit.", 0, now_str),
                        ],
                    )


def get_session_secret() -> str:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = 'session_secret'").fetchone()
        if row:
            return row["value"]
        secret = secrets.token_hex(32)
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)", (secret,))
        return secret


def get_client_name() -> str:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = 'client_name'").fetchone()
    return row["value"] if row and row["value"].strip() else "BGC"


def get_application_deadline() -> str:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = 'application_deadline'").fetchone()
    return row["value"] if row else ""


def is_registration_open() -> bool:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = 'registration_open'").fetchone()
    return True if not row else row["value"] == "1"


def get_flag_rules() -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = 'flag_rules'").fetchone()
    if row:
        try:
            return json.loads(row["value"])
        except Exception:
            pass
    return {"gpaThreshold": 85.0, "incomeBracket": "Above PHP 30,000", "enableRisk": True}


def get_requirement_types() -> list[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = 'requirement_types'").fetchone()
    if row:
        try:
            return json.loads(row["value"])
        except Exception:
            pass
    return [
        {"code": "ProfilePhoto", "label": "Applicant's Photo", "required": True},
        {"code": "BirthCert", "label": "Birth Certificate", "required": True},
        {"code": "PrevPrevYearGrade", "label": "Previous Previous Year Grade", "required": True},
        {"code": "PrevYearGrade", "label": "Previous Year Grade", "required": True},
        {"code": "CurrentYearGrade", "label": "Current Year Grade", "required": True},
        {"code": "COR", "label": "COR", "required": True},
        {"code": "ProofOfIncome", "label": "Proof of Income", "required": True},
        {"code": "ITR", "label": "ITR", "required": False},
    ]


def get_storage_config() -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM settings WHERE key LIKE 'storage_%'").fetchall()
    cfg = {r["key"]: r["value"] for r in rows}
    return {
        "provider": cfg.get("storage_provider", "filesystem"),
        "baseDir": cfg.get("storage_base_dir", os.path.join(BASE_DIR, "Images")),
        "gdriveRoot": cfg.get("storage_gdrive_root", ""),
        "nextcloudUrl": cfg.get("storage_nextcloud_url", ""),
        "nextcloudUser": cfg.get("storage_nextcloud_user", ""),
    }


def get_smtp_config() -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'").fetchall()
    cfg = {r["key"]: r["value"] for r in rows}
    return {
        "host": cfg.get("smtp_host") or os.environ.get("SMTP_HOST", "smtp.gmail.com"),
        "port": int(cfg.get("smtp_port") or os.environ.get("SMTP_PORT", "587")),
        "user": cfg.get("smtp_user") or os.environ.get("SMTP_USER", ""),
        "pass": cfg.get("smtp_pass") or os.environ.get("SMTP_PASS", ""),
    }


def add_notification(target_role: str, title: str, message: str, target_email: str = "") -> None:
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO notifications (target_role, target_email, title, message, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            (target_role, target_email.lower(), title, message, now_str),
        )


def add_audit(actor: str, action: str, target: str, details: str = "") -> None:
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO audit_logs (actor, action, target, details, created_at) VALUES (?, ?, ?, ?, ?)",
            (actor, action, target, details, now_str),
        )


def row_to_app(row: sqlite3.Row) -> dict:
    keys = row.keys()
    return {
        "id": row["id"],
        "userEmail": row["user_email"],
        "name": row["name"],
        "age": row["age"],
        "schoolYear": row["school_year"],
        "course": row["course"],
        "gpa": row["gpa"],
        "income": row["income"],
        "contact": row["contact"],
        "area": row["area"],
        "address": row["address"],
        "driveLink": row["drive_link"],
        "status": row["status"],
        "updatedAt": row["updated_at"],
        "emailLogs": json.loads(row["email_logs"] or "[]"),
        "lat": row["lat"] if "lat" in keys else None,
        "lng": row["lng"] if "lng" in keys else None,
        "assignedStaff": json.loads(row["assigned_staff"] or "[]") if "assigned_staff" in keys else [],
    }
