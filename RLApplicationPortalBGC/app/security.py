"""Security helpers: password hashing, HMAC session tokens, rate limiting, and validation."""

import base64
import hashlib
import hmac
import json
import re
import secrets
import subprocess
import time

ALLOWED_UPLOAD_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MAX_BODY_BYTES = 12 * 1024 * 1024  # 12 MB
ADMIN_ROLES = {"admin", "approver", "system_admin", "comms_admin"}
FAILED_AUTH: dict[str, list[float]] = {}


def hash_password(password: str, salt: str | None = None) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256."""
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    """Verify a password against a stored salt$digest string."""
    salt, _, digest = stored.partition("$")
    return bool(salt and digest) and hash_password(password, salt) == stored


def sign_session_token(user: dict, secret: str) -> str:
    payload = {
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "exp": int(time.time()) + 86400,
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    sig = hmac.new(secret.encode("utf-8"), raw.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def verify_session_token(token: str, secret: str) -> dict | None:
    if not token or "." not in token:
        return None
    raw, _, sig = token.partition(".")
    expected = hmac.new(secret.encode("utf-8"), raw.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def is_rate_limited(key: str, limit: int = 5, window_sec: int = 300) -> bool:
    now = time.time()
    recent = [t for t in FAILED_AUTH.get(key, []) if now - t < window_sec]
    FAILED_AUTH[key] = recent
    return len(recent) >= limit


def record_auth_failure(key: str) -> None:
    FAILED_AUTH.setdefault(key, []).append(time.time())


def clear_auth_failures(key: str) -> None:
    FAILED_AUTH.pop(key, None)


def safe_csv_cell(val) -> str:
    s = "" if val is None else str(val)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


def is_safe_url(url: str) -> bool:
    if not url:
        return True
    u = url.strip().lower()
    return u.startswith("http://") or u.startswith("https://") or u.startswith("images/") or u.startswith("assets/")


def resolve_mac_address(ip: str) -> str:
    """Resolve MAC address from local ARP cache for LAN clients; loopback/L3 otherwise."""
    if ip in ("127.0.0.1", "::1", "localhost"):
        return "00:00:00:00:00:00 (Loopback)"
    try:
        out = subprocess.check_output(["arp", "-a", ip], text=True, timeout=1, stderr=subprocess.DEVNULL)
        m = re.search(r"([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}", out)
        if m:
            return m.group(0).replace("-", ":").upper()
    except Exception:
        pass
    return "External / L3 (No L2 MAC)"
