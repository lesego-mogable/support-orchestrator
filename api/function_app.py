import json
import uuid
import logging
import hashlib
import hmac
import os
import time
import azure.functions as func
from dotenv import load_dotenv

load_dotenv()

import jwt

from agents.router_agent import route_and_respond
from state.cosmos_manager import create_session, get_session, upsert_session

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

# In-memory user store (same pattern as sessions — swap for Cosmos in production)
_users: dict[str, dict] = {}


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000).hex()


def _make_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRY_HOURS * 3600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _verify_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def _cors_headers() -> dict:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }


def _json_response(body: dict, status_code: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps(body),
        status_code=status_code,
        headers=_cors_headers(),
    )


@app.route(route="auth/signup", methods=["POST", "OPTIONS"])
async def signup_fn(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers())
    try:
        body = req.get_json()
    except ValueError:
        return _json_response({"error": "Request body must be JSON"}, 400)

    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip()

    if not email or not password:
        return _json_response({"error": "email and password are required"}, 400)
    if len(password) < 8:
        return _json_response({"error": "Password must be at least 8 characters"}, 400)
    if email in _users:
        return _json_response({"error": "An account with that email already exists"}, 409)

    user_id = str(uuid.uuid4())
    salt = uuid.uuid4().hex
    _users[email] = {
        "id": user_id,
        "email": email,
        "name": name,
        "salt": salt,
        "password_hash": _hash_password(password, salt),
        "created_at": int(time.time()),
    }
    token = _make_token(user_id, email)
    return _json_response({"token": token, "user": {"id": user_id, "email": email, "name": name}}, 201)


@app.route(route="auth/login", methods=["POST", "OPTIONS"])
async def login_fn(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers())
    try:
        body = req.get_json()
    except ValueError:
        return _json_response({"error": "Request body must be JSON"}, 400)

    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    user = _users.get(email)
    if not user:
        return _json_response({"error": "Invalid email or password"}, 401)

    expected = _hash_password(password, user["salt"])
    if not hmac.compare_digest(expected, user["password_hash"]):
        return _json_response({"error": "Invalid email or password"}, 401)

    token = _make_token(user["id"], email)
    return _json_response({
        "token": token,
        "user": {"id": user["id"], "email": email, "name": user.get("name", "")},
    })


@app.route(route="sessions", methods=["POST", "OPTIONS"])
async def create_session_fn(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers())
    session_id = str(uuid.uuid4())
    await create_session(session_id)
    return _json_response({"sessionId": session_id}, 201)


@app.route(route="sessions/{session_id}", methods=["GET", "OPTIONS"])
async def get_session_fn(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers())
    session_id = req.route_params.get("session_id")
    session = await get_session(session_id)
    if not session:
        return _json_response({"error": "Session not found"}, 404)
    return _json_response({"sessionId": session_id, "messages": session.get("messages", [])})


@app.route(route="sessions/{session_id}/chat", methods=["POST", "OPTIONS"])
async def chat_fn(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers())

    session_id = req.route_params.get("session_id")

    try:
        body = req.get_json()
    except ValueError:
        return _json_response({"error": "Request body must be JSON"}, 400)

    user_message = (body.get("message") or "").strip()
    if not user_message:
        return _json_response({"error": "message field is required"}, 400)

    session = await get_session(session_id)
    if not session:
        return _json_response({"error": "Session not found. Create a session first."}, 404)

    history: list[dict] = session.get("messages", [])

    try:
        result = await route_and_respond(user_message, history)
    except Exception as exc:
        logger.exception("Agent error for session %s", session_id)
        return _json_response({"error": f"Agent error: {exc}"}, 500)

    history.append({"role": "user", "content": user_message})
    history.append({"role": "assistant", "content": result["answer"], "agent": result["agent"]})
    await upsert_session(session_id, history, result["agent"])

    return _json_response({
        "answer": result["answer"],
        "agent": result["agent"],
        "agentId": result["agentId"],
        "intentReason": result["intent_reason"],
        "sessionId": session_id,
        "pipelineSteps": result["pipelineSteps"],
        "agentTraces": result["agentTraces"],
        "totalMs": result["totalMs"],
    })


@app.route(route="health", methods=["GET"])
async def health_fn(req: func.HttpRequest) -> func.HttpResponse:
    return _json_response({"status": "healthy", "version": "2.0.0"})
