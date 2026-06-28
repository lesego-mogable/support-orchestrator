import json
import uuid
import logging
import azure.functions as func
from dotenv import load_dotenv

load_dotenv()

from agents.router_agent import route_and_respond
from state.cosmos_manager import create_session, get_session, upsert_session

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


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
