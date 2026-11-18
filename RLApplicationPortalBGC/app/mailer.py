"""SMTP email delivery with spam and test-mode safeguards."""

from email.message import EmailMessage
import os
import smtplib

from app.db import get_conn, get_smtp_config


def send_email_smtp(to_email: str, subject: str, body: str, is_status_email: bool = False) -> tuple[bool, str]:
    """Send an email using configured SMTP settings with spam/test guards."""
    if os.environ.get("DISABLE_SMTP") == "1":
        return False, "SMTP disabled in test mode"
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM settings WHERE key IN ('smtp_enabled', 'notify_status_emails')").fetchall()
    flags = {r["key"]: r["value"] for r in rows}
    if flags.get("smtp_enabled", "1") != "1":
        return False, "SMTP sending is paused in settings"
    if is_status_email and flags.get("notify_status_emails", "1") != "1":
        return False, "Status notification emails are disabled"
    cfg = get_smtp_config()
    if not cfg["user"] or not cfg["pass"]:
        return False, "SMTP not configured"
    msg = EmailMessage()
    msg["From"] = cfg["user"]
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        if cfg["port"] == 465:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=15) as server:
                server.login(cfg["user"], cfg["pass"])
                server.send_message(msg)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as server:
                server.starttls()
                server.login(cfg["user"], cfg["pass"])
                server.send_message(msg)
        return True, ""
    except Exception as exc:
        return False, str(exc)
