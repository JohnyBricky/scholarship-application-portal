"""Versioned file storage controller (Local File System, Google Drive, Nextcloud)."""

import base64
from datetime import datetime
import os
import re
import shutil
import sqlite3

from app.db import get_conn, get_storage_config
from app.security import ALLOWED_UPLOAD_EXTS


def _safe_segment(name: str, fallback: str = "Unknown") -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]+', "_", (name or "").strip()).strip(". ")
    return cleaned or fallback


def _extract_year(school_year: str) -> str:
    m = re.search(r"(20\d{2})", school_year or "")
    return m.group(1) if m else str(datetime.now().year)


def _outcome_bucket(status: str) -> str:
    return "Rejected" if status == "DECLINED" else "Ongoing"


def save_applicant_file(app_row: sqlite3.Row, category: str, filename: str, content_b64: str | None, external_url: str | None) -> dict:
    """Save a requirement file with automatic v1, v2, ... versioning."""
    cfg = get_storage_config()
    provider = cfg["provider"]
    safe_cat = _safe_segment(category, "Other")
    safe_name = _safe_segment(app_row["name"], f"Applicant_{app_row['id']}")
    year = _extract_year(app_row["school_year"])
    bucket = _outcome_bucket(app_row["status"])
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    with get_conn() as conn:
        latest = conn.execute(
            "SELECT review_status FROM applicant_files WHERE application_id = ? AND category = ? ORDER BY version DESC LIMIT 1",
            (app_row["id"], safe_cat),
        ).fetchone()
        if latest and latest["review_status"] == "VERIFIED":
            raise PermissionError(f"{safe_cat} is already verified and locked.")
        max_ver = conn.execute(
            "SELECT COALESCE(MAX(version), 0) FROM applicant_files WHERE application_id = ? AND category = ?",
            (app_row["id"], safe_cat),
        ).fetchone()[0]
        next_ver = int(max_ver) + 1

        if provider == "filesystem":
            raw_bytes = base64.b64decode(content_b64 or "")
            _, ext = os.path.splitext(filename or "")
            ext = ext.lower() if ext else ""
            if ext not in ALLOWED_UPLOAD_EXTS:
                raise ValueError(f"Unsupported file type '{ext}'. Allowed: PDF, PNG, JPG, WEBP.")
            target_dir = os.path.join(cfg["baseDir"], year, bucket, safe_name, "Requirements", safe_cat)
            os.makedirs(target_dir, exist_ok=True)
            versioned_name = f"{safe_cat}_v{next_ver}{ext}"
            full_path = os.path.join(target_dir, versioned_name)
            with open(full_path, "wb") as f:
                f.write(raw_bytes)
            stored_ref = full_path
        else:
            stored_ref = (external_url or "").strip()

        cur = conn.execute(
            """
            INSERT INTO applicant_files (application_id, category, version, provider, original_name, stored_path, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (app_row["id"], safe_cat, next_ver, provider, filename or f"{safe_cat}_v{next_ver}", stored_ref, now_str),
        )
        file_id = cur.lastrowid

    return {
        "id": file_id,
        "applicationId": app_row["id"],
        "category": safe_cat,
        "version": next_ver,
        "provider": provider,
        "originalName": filename or f"{safe_cat}_v{next_ver}",
        "storedPath": stored_ref,
        "uploadedAt": now_str,
        "reviewStatus": "PENDING",
        "reviewRemarks": "",
    }


def sync_applicant_folder_bucket(app_row: sqlite3.Row, new_status: str) -> None:
    """Move local filesystem folder between Ongoing/ and Rejected/ when status changes."""
    cfg = get_storage_config()
    if cfg["provider"] != "filesystem":
        return
    year = _extract_year(app_row["school_year"])
    safe_name = _safe_segment(app_row["name"], f"Applicant_{app_row['id']}")
    old_bucket = "Ongoing" if new_status == "DECLINED" else "Rejected"
    new_bucket = _outcome_bucket(new_status)
    if old_bucket == new_bucket:
        return
    src = os.path.join(cfg["baseDir"], year, old_bucket, safe_name)
    dst = os.path.join(cfg["baseDir"], year, new_bucket, safe_name)
    if os.path.isdir(src) and not os.path.exists(dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.move(src, dst)
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT id, stored_path FROM applicant_files WHERE application_id = ? AND provider = 'filesystem'",
                (app_row["id"],),
            ).fetchall()
            for r in rows:
                updated_path = r["stored_path"].replace(src, dst)
                conn.execute("UPDATE applicant_files SET stored_path = ? WHERE id = ?", (updated_path, r["id"]))
