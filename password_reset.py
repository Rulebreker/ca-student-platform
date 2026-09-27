"""
Self-service password reset for ExcellenceCA.

- Reset tokens: 256-bit random, emailed once, stored ONLY as a SHA-256 hash in the MongoDB
  collection `password_resets`; valid for 30 minutes; single use (consumed atomically).
- Rate limits: fixed-window counters in the MongoDB collection `auth_rate_limits`, shared by every
  serverless instance. A process-local fallback is used only for local development without MongoDB;
  on Vercel without MongoDB the feature fails closed.
- Email: Brevo SMTP (STARTTLS on 587) with credentials read from server environment variables only.

Raw tokens, reset URLs and SMTP credentials are never logged or returned by any API.
"""
import hashlib
import html
import os
import re
import secrets
import smtplib
import ssl
import threading
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

import mongodb_manager

RESET_TOKEN_TTL = timedelta(minutes=30)
RESET_TOKEN_BYTES = 32
RESETS_COLLECTION = 'password_resets'
RATE_LIMITS_COLLECTION = 'auth_rate_limits'
SITE_URL = os.environ.get('PUBLIC_SITE_URL', 'https://excellenceca.in').rstrip('/')
SENDER_NAME = 'ExcellenceCA'
SMTP_TIMEOUT_SECONDS = 15
FORGOT_MIN_RESPONSE_SECONDS = 1.2  # forgot-password answers take about as long whether or not an email is sent

GENERIC_FORGOT_MESSAGE = 'If an account exists with that email, a password reset link has been sent.'
RESET_SUCCESS_MESSAGE = 'Your password has been reset successfully. Please log in with your new password.'

# (limit, window seconds)
FORGOT_LIMIT_PER_IP = (10, 15 * 60)
FORGOT_LIMIT_PER_EMAIL = (3, 15 * 60)
RESET_LIMIT_PER_IP = (20, 15 * 60)

SMTP_ENV_VARS = ('BREVO_SMTP_HOST', 'BREVO_SMTP_PORT', 'BREVO_SMTP_LOGIN', 'BREVO_SMTP_KEY', 'BREVO_SENDER_EMAIL')

EMAIL_RE = re.compile(r'^[^@\s<>"\',;]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$')
TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]{20,128}$')

TOKEN_OK, TOKEN_INVALID, TOKEN_EXPIRED, TOKEN_USED = 'ok', 'invalid', 'expired', 'used'

IS_SERVERLESS = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))


def _now():
    return datetime.now(timezone.utc)


def _aware(dt):
    """pymongo returns naive UTC datetimes; compare everything as aware UTC."""
    if isinstance(dt, datetime) and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------- tokens

def generate_reset_token():
    return secrets.token_urlsafe(RESET_TOKEN_BYTES)


def hash_reset_token(raw_token):
    return hashlib.sha256(str(raw_token).encode('utf-8')).hexdigest()


def build_reset_url(raw_token):
    return f"{SITE_URL}/reset-password?token={raw_token}"


def normalize_email(value):
    return str(value or '').strip().lower()


def is_valid_email(value):
    return bool(value) and len(value) <= 254 and bool(EMAIL_RE.match(value))


def is_plausible_token(value):
    return bool(value) and bool(TOKEN_RE.match(str(value)))


def validate_password_strength(password):
    """Server-side copy of the app's password policy (js/auth.js validatePasswordStrength).
    Returns an error message, or None when the password is acceptable."""
    if not password or not isinstance(password, str):
        return 'Password is required.'
    if len(password) < 8:
        return 'Password must be at least 8 characters long.'
    if len(password) > 128:
        return 'Password must be at most 128 characters long.'
    has_letter = re.search(r'[a-zA-Z]', password)
    has_digit_or_symbol = re.search(r'[\d!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>/?]', password)
    if not has_letter or not has_digit_or_symbol:
        return 'Password must be strong: include at least one letter and at least one number or special character.'
    if password.lower().strip() in ('12345678', '123456789', 'password', 'password123', 'qwertyuiop', 'admin1234', 'student123'):
        return 'This password is too common and weak. Please choose a stronger password.'
    return None


# ---------------------------------------------------------------- storage backend

class _MemoryCollection:
    """Minimal in-process stand-in for the two collections (local development without MongoDB)."""

    def __init__(self):
        self.docs = {}
        self.lock = threading.Lock()


_memory = {RESETS_COLLECTION: _MemoryCollection(), RATE_LIMITS_COLLECTION: _MemoryCollection()}
_indexes_ready = set()


def _collection(name):
    """MongoDB collection, the local-dev memory store, or None (serverless without MongoDB)."""
    try:
        if mongodb_manager.is_database_connected():
            db = mongodb_manager.get_database()
            if db is not None:
                coll = db[name]
                _ensure_ttl_index(name, coll)
                return coll
    except Exception as e:
        print(f"[PASSWORD_RESET] database unavailable ({type(e).__name__})", flush=True)
    if IS_SERVERLESS:
        return None
    return _memory[name]


def _ensure_ttl_index(name, coll):
    if name in _indexes_ready:
        return
    try:
        field = 'purgeAt' if name == RESETS_COLLECTION else 'expiresAt'
        coll.create_index(field, expireAfterSeconds=0)
        if name == RESETS_COLLECTION:
            coll.create_index('userId')
    except Exception as e:
        print(f"[PASSWORD_RESET] TTL index not created for {name} ({type(e).__name__})", flush=True)
    _indexes_ready.add(name)


# ---------------------------------------------------------------- reset records

def create_password_reset(user_id):
    """Invalidate the user's earlier unused links and store a new one. Returns the RAW token
    (only for building the emailed link) or None when storage is unavailable."""
    coll = _collection(RESETS_COLLECTION)
    if coll is None:
        return None
    raw = generate_reset_token()
    token_hash = hash_reset_token(raw)
    now = _now()
    doc = {
        '_id': token_hash,
        'userId': str(user_id),
        'tokenHash': token_hash,
        'createdAt': now,
        'expiresAt': now + RESET_TOKEN_TTL,
        'usedAt': None,
        'purgeAt': now + RESET_TOKEN_TTL + timedelta(days=1),
    }
    if isinstance(coll, _MemoryCollection):
        with coll.lock:
            for d in coll.docs.values():
                if d['userId'] == doc['userId'] and d['usedAt'] is None:
                    d['usedAt'] = now
                    d['invalidatedReason'] = 'superseded'
            coll.docs[token_hash] = doc
        return raw
    try:
        coll.update_many({'userId': doc['userId'], 'usedAt': None},
                         {'$set': {'usedAt': now, 'invalidatedReason': 'superseded'}})
        coll.insert_one(doc)
        return raw
    except Exception as e:
        print(f"[PASSWORD_RESET] could not store reset token ({type(e).__name__})", flush=True)
        return None


def _classify(doc, now):
    if not doc:
        return TOKEN_INVALID
    if doc.get('usedAt') is not None:
        return TOKEN_USED
    if _aware(doc.get('expiresAt')) is None or _aware(doc['expiresAt']) <= now:
        return TOKEN_EXPIRED
    return TOKEN_OK


def check_password_reset(raw_token):
    """(status, user_id) without consuming the token."""
    if not is_plausible_token(raw_token):
        return TOKEN_INVALID, None
    coll = _collection(RESETS_COLLECTION)
    if coll is None:
        return TOKEN_INVALID, None
    h = hash_reset_token(raw_token)
    try:
        doc = coll.docs.get(h) if isinstance(coll, _MemoryCollection) else coll.find_one({'_id': h})
    except Exception as e:
        print(f"[PASSWORD_RESET] token lookup failed ({type(e).__name__})", flush=True)
        return TOKEN_INVALID, None
    status = _classify(doc, _now())
    return status, (doc or {}).get('userId') if status == TOKEN_OK else None


def consume_password_reset(raw_token):
    """Atomically mark the token used. Returns (status, user_id); only TOKEN_OK may change a password."""
    if not is_plausible_token(raw_token):
        return TOKEN_INVALID, None
    coll = _collection(RESETS_COLLECTION)
    if coll is None:
        return TOKEN_INVALID, None
    h = hash_reset_token(raw_token)
    now = _now()
    if isinstance(coll, _MemoryCollection):
        with coll.lock:
            doc = coll.docs.get(h)
            status = _classify(doc, now)
            if status == TOKEN_OK:
                doc['usedAt'] = now
            return status, doc['userId'] if status == TOKEN_OK else None
    try:
        doc = coll.find_one_and_update({'_id': h, 'usedAt': None, 'expiresAt': {'$gt': now}},
                                       {'$set': {'usedAt': now}})
        if doc:
            return TOKEN_OK, doc.get('userId')
        return _classify(coll.find_one({'_id': h}), now), None
    except Exception as e:
        print(f"[PASSWORD_RESET] token consume failed ({type(e).__name__})", flush=True)
        return TOKEN_INVALID, None


# ---------------------------------------------------------------- rate limiting

def hit_rate_limit(scope, key, limit_window):
    """Count one attempt for (scope, key) in the current fixed window.
    True = allowed, False = limit exceeded or limiter unavailable (fails closed)."""
    limit, window = limit_window
    coll = _collection(RATE_LIMITS_COLLECTION)
    if coll is None:
        return False
    now = _now()
    bucket = int(now.timestamp()) // window
    key_hash = hashlib.sha256(f"{scope}|{key}".encode('utf-8')).hexdigest()[:40]
    doc_id = f"{scope}:{key_hash}:{bucket}"
    expires = datetime.fromtimestamp((bucket + 1) * window, tz=timezone.utc)
    if isinstance(coll, _MemoryCollection):
        with coll.lock:
            for k in [k for k, d in coll.docs.items() if d['expiresAt'] <= now]:
                del coll.docs[k]
            doc = coll.docs.setdefault(doc_id, {'count': 0, 'expiresAt': expires})
            doc['count'] += 1
            return doc['count'] <= limit
    try:
        doc = coll.find_one_and_update({'_id': doc_id},
                                       {'$inc': {'count': 1}, '$setOnInsert': {'expiresAt': expires}},
                                       upsert=True, return_document=True)  # ReturnDocument.AFTER
        return int((doc or {}).get('count', 1)) <= limit
    except Exception as e:
        print(f"[PASSWORD_RESET] rate limiter failed ({type(e).__name__})", flush=True)
        return False


# ---------------------------------------------------------------- email (Brevo SMTP)

def smtp_config_status():
    """{'BREVO_SMTP_HOST': 'configured' | 'missing', ...} - never the values themselves."""
    return {name: ('configured' if os.environ.get(name, '').strip() else 'missing') for name in SMTP_ENV_VARS}


def smtp_configured():
    status = smtp_config_status()
    if any(v != 'configured' for v in status.values()):
        return False
    try:
        int(os.environ['BREVO_SMTP_PORT'])
    except ValueError:
        return False
    return True


def send_email(to_address, subject, text_body, html_body):
    """Send one email through Brevo SMTP. Returns True on success; failures are logged without
    credentials, recipients' links or server responses."""
    if not smtp_configured():
        print(f"[EMAIL] Brevo SMTP not configured: {smtp_config_status()}", flush=True)
        return False
    host = os.environ['BREVO_SMTP_HOST'].strip()
    port = int(os.environ['BREVO_SMTP_PORT'])
    sender = os.environ['BREVO_SENDER_EMAIL'].strip()

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = formataddr((SENDER_NAME, sender))
    msg['To'] = to_address
    msg['Message-ID'] = make_msgid(domain=sender.split('@')[-1] or None)
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype='html')

    context = ssl.create_default_context()
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=SMTP_TIMEOUT_SECONDS, context=context)
        else:
            server = smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT_SECONDS)
        with server:
            if port != 465:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
            server.login(os.environ['BREVO_SMTP_LOGIN'].strip(), os.environ['BREVO_SMTP_KEY'].strip())
            server.send_message(msg)
        return True
    except smtplib.SMTPResponseException as e:
        print(f"[EMAIL] Brevo SMTP rejected the message ({type(e).__name__}, code {e.smtp_code})", flush=True)
    except Exception as e:
        print(f"[EMAIL] Brevo SMTP delivery failed ({type(e).__name__})", flush=True)
    return False


def render_password_reset_email(user_name, reset_url):
    """(subject, text, html) for the reset email."""
    name = (str(user_name or '').strip() or 'Student')[:80]
    minutes = int(RESET_TOKEN_TTL.total_seconds() // 60)
    subject = 'Reset your ExcellenceCA password'
    text = (
        f"Hello {name},\n\n"
        "We received a request to reset your ExcellenceCA password.\n\n"
        "Open the link below to create a new password:\n"
        f"{reset_url}\n\n"
        f"This link will expire in {minutes} minutes and can only be used once.\n\n"
        "If you did not request a password reset, you can safely ignore this email.\n\n"
        "Regards,\n"
        "ExcellenceCA Team\n"
        f"{SITE_URL}\n"
    )
    n = html.escape(name)
    u = html.escape(reset_url, quote=True)
    site = html.escape(SITE_URL, quote=True)
    site_label = html.escape(SITE_URL.replace('https://', ''))
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;">
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;">
            <span style="font-size:22px;font-weight:800;color:#0f172a;">Excellence<span style="color:#2563eb;">CA</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#334155;">
            <p style="margin:0 0 16px 0;">Hello {n},</p>
            <p style="margin:0 0 16px 0;">We received a request to reset your ExcellenceCA password.</p>
            <p style="margin:0 0 24px 0;">Click the button below to create a new password:</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#2563eb" style="border-radius:10px;">
                  <a href="{u}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Reset Password</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;">
            <p style="margin:0 0 16px 0;">This link will expire in <strong>{minutes} minutes</strong> and can only be used once.</p>
            <p style="margin:0 0 16px 0;">If you did not request a password reset, you can safely ignore this email.</p>
            <p style="margin:0 0 8px 0;font-size:12px;line-height:18px;color:#64748b;">If the button does not work, copy and paste this link into your browser:<br>
              <a href="{u}" style="color:#2563eb;word-break:break-all;">{u}</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;">
            <p style="margin:0;">Regards,<br><strong>ExcellenceCA Team</strong><br>
              <a href="{site}" style="color:#2563eb;text-decoration:none;">{site_label}</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""
    return subject, text, html_body


def send_password_reset_email(to_address, user_name, reset_url):
    subject, text, html_body = render_password_reset_email(user_name, reset_url)
    return send_email(to_address, subject, text, html_body)
