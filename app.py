import hashlib
import hmac
import os
import re
import time

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from supabase import create_client
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_BODY_LEN = 500
MAX_CONTENT_LENGTH = 64 * 1024

RATE_LIMIT_WINDOW = 3600
MESSAGE_LIMIT_PER_IP = 5
CREATE_LIMIT_PER_IP = 10
INBOX_ATTEMPT_LIMIT_PER_IP = 20
LOGIN_LIMIT_PER_IP = 20

app = Flask(__name__, static_folder="public", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

_ratelimit = {}

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("WARNING: SUPABASE_URL / SUPABASE_SERVICE_KEY not set. API calls will fail until configured.")


def get_db():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def client_ip() -> str:
    return request.remote_addr or "unknown"


def rate_limited(key: str, limit: int, window: int = RATE_LIMIT_WINDOW) -> bool:
    now = time.time()
    if len(_ratelimit) > 10000:
        for k in [k for k, (_, ts) in _ratelimit.items() if now - ts > RATE_LIMIT_WINDOW]:
            _ratelimit.pop(k, None)
    entry = _ratelimit.get(key)
    if entry is None or now - entry[1] > window:
        _ratelimit[key] = (1, now)
        return False
    count, start = entry
    if count >= limit:
        return True
    _ratelimit[key] = (count + 1, start)
    return False


def secure_compare(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def require_json() -> bool:
    if request.mimetype != "application/json":
        return False
    return True


@app.after_request
def add_security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'; "
        "form-action 'self'"
    )
    if request.is_secure:
        resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return resp


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/u/<username>")
def send_page(username):
    return send_from_directory(app.static_folder, "send.html")


@app.route("/inbox")
def inbox_page():
    return send_from_directory(app.static_folder, "inbox.html")


@app.route("/profile")
def profile_page():
    return send_from_directory(app.static_folder, "profile.html")


@app.route("/login")
def login_page():
    return send_from_directory(app.static_folder, "login.html")


@app.route("/api/users", methods=["POST"])
def create_user():
    if not require_json():
        return jsonify({"error": "Content-Type must be application/json."}), 415

    if rate_limited(f"create:{client_ip()}", CREATE_LIMIT_PER_IP):
        return jsonify({"error": "Too many accounts from this IP. Try again later."}), 429

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not USERNAME_RE.match(username):
        return jsonify({"error": "Username must be 3-20 chars (letters, numbers, underscore)."}), 400

    if email and not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address."}), 400

    if email and len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    db = get_db()
    existing = db.table("users").select("username, email").eq("username", username).execute()
    if existing.data:
        return jsonify({"error": "That username is already taken."}), 409

    if email:
        email_match = db.table("users").select("email").eq("email", email).execute()
        if email_match.data:
            return jsonify({"error": "That email is already registered."}), 409

    admin_key = hashlib.sha256(os.urandom(32)).hexdigest()
    record = {"username": username, "admin_key": admin_key}
    if email:
        record["email"] = email
        record["password_hash"] = generate_password_hash(password)
    db.table("users").insert(record).execute()

    link = f"{request.host_url.rstrip('/')}/u/{username}"
    return jsonify({
        "username": username,
        "link": link,
        "adminKey": admin_key,
        "email": email,
    }), 201


@app.route("/api/login", methods=["POST"])
def login():
    if not require_json():
        return jsonify({"error": "Content-Type must be application/json."}), 415

    if rate_limited(f"login:{client_ip()}", LOGIN_LIMIT_PER_IP):
        return jsonify({"error": "Too many login attempts. Try again later."}), 429

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    db = get_db()
    res = db.table("users").select("username, email, password_hash, admin_key").eq("email", email).execute()
    if not res.data:
        return jsonify({"error": "Invalid email or password."}), 401

    row = res.data[0]
    if not row.get("password_hash") or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid email or password."}), 401

    link = f"{request.host_url.rstrip('/')}/u/{row['username']}"
    return jsonify({
        "username": row["username"],
        "link": link,
        "adminKey": row["admin_key"],
        "email": row["email"],
    }), 200


@app.route("/api/users/<username>", methods=["GET"])
def check_user(username):
    db = get_db()
    res = db.table("users").select("username").eq("username", username).execute()
    return (jsonify({"exists": True}), 200) if res.data else (jsonify({"exists": False}), 404)


@app.route("/api/profile/<username>", methods=["GET"])
def get_profile(username):
    db = get_db()
    res = db.table("users").select("username, display_name, avatar_url, bio").eq("username", username).execute()
    if not res.data:
        return jsonify({"error": "This link does not exist."}), 404
    row = res.data[0]
    return jsonify({
        "username": row.get("username"),
        "displayName": row.get("display_name") or "",
        "avatarUrl": row.get("avatar_url") or "",
        "bio": row.get("bio") or "",
    })


@app.route("/api/me", methods=["GET"])
def get_me():
    key = request.headers.get("X-Admin-Key", "")
    if not key:
        return jsonify({"error": "Missing admin key."}), 401
    db = get_db()
    res = db.table("users").select("username, display_name, avatar_url, bio, email").eq("admin_key", key).execute()
    if not res.data:
        return jsonify({"error": "Invalid key."}), 403
    row = res.data[0]
    return jsonify({
        "username": row.get("username"),
        "displayName": row.get("display_name") or "",
        "avatarUrl": row.get("avatar_url") or "",
        "bio": row.get("bio") or "",
        "email": row.get("email") or "",
    })


@app.route("/api/profile", methods=["PUT"])
def update_profile():
    key = request.headers.get("X-Admin-Key", "")
    if not key:
        return jsonify({"error": "Missing admin key."}), 401
    if not require_json():
        return jsonify({"error": "Content-Type must be application/json."}), 415

    db = get_db()
    user = db.table("users").select("username, admin_key").eq("admin_key", key).execute()
    if not user.data:
        return jsonify({"error": "Invalid key."}), 403

    data = request.get_json(silent=True) or {}
    display_name = (data.get("displayName") or "").strip()[:30]
    avatar_url = (data.get("avatarUrl") or "").strip()[:500]
    bio = (data.get("bio") or "").strip()[:160]

    if avatar_url and not re.match(r"^https?://", avatar_url):
        return jsonify({"error": "Avatar must be a http(s) URL."}), 400

    db.table("users").update({
        "display_name": display_name or None,
        "avatar_url": avatar_url or None,
        "bio": bio or None,
    }).eq("admin_key", key).execute()
    return jsonify({"ok": True})


@app.route("/api/messages", methods=["POST"])
def send_message():
    if not require_json():
        return jsonify({"error": "Content-Type must be application/json."}), 415

    ip_hash = hashlib.sha256(client_ip().encode()).hexdigest()
    if rate_limited(f"send:{ip_hash}", MESSAGE_LIMIT_PER_IP):
        return jsonify({"error": "Slow down! You've sent enough messages for now."}), 429

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    body = (data.get("body") or "").strip()

    if not body or len(body) > MAX_BODY_LEN:
        return jsonify({"error": "Message must be 1-500 characters."}), 400

    db = get_db()
    user = db.table("users").select("username").eq("username", username).execute()
    if not user.data:
        return jsonify({"error": "This link does not exist."}), 404

    db.table("messages").insert(
        {"username": username, "body": body, "ip_hash": ip_hash}
    ).execute()
    return jsonify({"ok": True}), 201


@app.route("/api/messages", methods=["GET"])
def get_messages():
    key = request.headers.get("X-Admin-Key", "")
    if not key:
        return jsonify({"error": "Missing admin key."}), 401

    ip_hash = hashlib.sha256(client_ip().encode()).hexdigest()
    if rate_limited(f"inbox:{ip_hash}", INBOX_ATTEMPT_LIMIT_PER_IP):
        return jsonify({"error": "Too many attempts. Try again later."}), 429

    db = get_db()
    user = db.table("users").select("username, admin_key").eq("admin_key", key).execute()
    if not user.data:
        return jsonify({"error": "Invalid key."}), 403

    username = user.data[0]["username"]
    res = db.table("messages").select("id, body, created_at, is_read").eq("username", username).order("created_at", desc=True).execute()
    unread_res = db.table("messages").select("id").eq("username", username).eq("is_read", False).execute()
    return jsonify({
        "username": username,
        "messages": res.data,
        "unread": len(unread_res.data),
    })


@app.route("/api/messages/read", methods=["POST"])
def mark_messages_read():
    key = request.headers.get("X-Admin-Key", "")
    if not key:
        return jsonify({"error": "Missing admin key."}), 401

    db = get_db()
    user = db.table("users").select("username").eq("admin_key", key).execute()
    if not user.data:
        return jsonify({"error": "Invalid key."}), 403

    username = user.data[0]["username"]
    db.table("messages").update({"is_read": True}).eq("username", username).eq("is_read", False).execute()
    return jsonify({"ok": True})


@app.route("/api/notifications", methods=["GET"])
def get_notifications():
    key = request.headers.get("X-Admin-Key", "")
    if not key:
        return jsonify({"error": "Missing admin key."}), 401

    db = get_db()
    user = db.table("users").select("username").eq("admin_key", key).execute()
    if not user.data:
        return jsonify({"error": "Invalid key."}), 403

    username = user.data[0]["username"]
    unread_res = db.table("messages").select("id").eq("username", username).eq("is_read", False).execute()
    return jsonify({"unread": len(unread_res.data)})


@app.route("/api/messages/<message_id>", methods=["DELETE"])
def delete_message(message_id):
    key = request.headers.get("X-Admin-Key", "")
    if not key:
        return jsonify({"error": "Missing admin key."}), 401

    db = get_db()
    user = db.table("users").select("username, admin_key").eq("admin_key", key).execute()
    if not user.data:
        return jsonify({"error": "Invalid key."}), 403

    username = user.data[0]["username"]
    res = db.table("messages").select("username").eq("id", message_id).execute()
    if not res.data or res.data[0]["username"] != username:
        return jsonify({"error": "Message not found."}), 404

    db.table("messages").delete().eq("id", message_id).execute()
    return jsonify({"ok": True})


@app.errorhandler(413)
def too_large(err):
    return jsonify({"error": "Request too large."}), 413


@app.errorhandler(RuntimeError)
def handle_runtime_error(err):
    return jsonify({"error": str(err)}), 503


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)