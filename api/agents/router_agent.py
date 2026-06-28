"""
Router Agent — classifies intent then delegates to the correct specialist.
Returns a fully structured dict that includes pipeline steps and per-agent
tool call traces so the frontend can animate the right panel with real data.
"""
import os
import json
import time
import logging

from semantic_kernel import Kernel
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion
from semantic_kernel.connectors.ai.chat_completion_client_base import ChatCompletionClientBase
from semantic_kernel.contents.chat_history import ChatHistory
from semantic_kernel.connectors.ai.open_ai.prompt_execution_settings.azure_chat_prompt_execution_settings import (
    AzureChatPromptExecutionSettings,
)

from agents.billing_agent import run_billing_agent
from agents.technical_agent import run_technical_agent
from agents.order_agent import run_order_agent
from agents.returns_agent import run_returns_agent
from agents.knowledge_agent import run_knowledge_agent
from agents.human_agent import run_human_agent

logger = logging.getLogger(__name__)

ROUTER_SYSTEM_PROMPT = """You are a customer support router. Classify the user's message into exactly one category and respond with valid JSON only.

Categories:
- "billing": invoices, payments, charges, subscription plans, pricing, discounts, credits, overcharges
- "technical": product bugs, errors, API issues, configuration, how-to, account access, system status
- "order": order status, shipment tracking, delivery, packages, dispatch, where is my order
- "returns": returning items, exchanges, refunds for purchased goods, defective products, send back
- "knowledge": general questions, FAQs, documentation, product features, how things work
- "human": user explicitly requests a human agent or live support
- "general": greetings, thanks, out-of-scope small talk

Respond with this exact JSON shape — no other text:
{"intent": "<category>", "confidence": 0.95, "reason": "<one sentence>"}"""

# Maps intent → (agentId matching frontend AGENT_DEFS, display name)
INTENT_MAP = {
    "billing":   ("billing",   "Billing Agent"),
    "technical": ("tech",      "Tech Support"),
    "order":     ("order",     "Order Status"),
    "returns":   ("returns",   "Returns Agent"),
    "knowledge": ("knowledge", "Knowledge Base"),
    "human":     ("human",     "Human Escalation"),
}


async def _classify_intent(user_message: str, history: list[dict]) -> tuple[str, float, str, int]:
    """Returns (intent, confidence, reason, latency_ms)."""
    kernel = Kernel()
    kernel.add_service(
        AzureChatCompletion(
            deployment_name=os.environ.get("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4.1-mini"),
            endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
        )
    )

    chat_history = ChatHistory()
    chat_history.add_system_message(ROUTER_SYSTEM_PROMPT)
    for msg in history[-4:]:
        if msg["role"] == "user":
            chat_history.add_user_message(msg["content"])
        elif msg["role"] == "assistant":
            chat_history.add_assistant_message(msg["content"])
    chat_history.add_user_message(user_message)

    settings = AzureChatPromptExecutionSettings(temperature=0.0, max_tokens=120)
    chat_service: ChatCompletionClientBase = kernel.get_service(type=ChatCompletionClientBase)

    t_start = time.monotonic()
    response = await chat_service.get_chat_message_contents(
        chat_history=chat_history,
        settings=settings,
        kernel=kernel,
    )
    ms = int((time.monotonic() - t_start) * 1000)

    raw = str(response[-1]).strip()
    try:
        parsed = json.loads(raw)
        return (
            parsed.get("intent", "general"),
            float(parsed.get("confidence", 0.8)),
            parsed.get("reason", ""),
            ms,
        )
    except (json.JSONDecodeError, KeyError):
        logger.warning("Router returned non-JSON: %s", raw)
        return "general", 0.5, "Could not parse intent", ms


def _pipeline_steps(intent: str, agent_name: str, tool_count: int, total_ms: int) -> list[dict]:
    tools_label = f"{tool_count} tool call{'s' if tool_count != 1 else ''}"
    return [
        {"label": "Input Received",            "detail": "Message received and tokenized"},
        {"label": "Router Analysis",           "detail": f"Intent: {intent} · routed to {agent_name}"},
        {"label": f"Delegate → {agent_name}",  "detail": "Context and history transferred"},
        {"label": "Tool Execution",            "detail": tools_label},
        {"label": "Response Generation",       "detail": "Azure OpenAI · response generated"},
        {"label": "Delivered",                 "detail": f"~{total_ms}ms total latency"},
    ]


_GENERAL_RESPONSES = {
    "hello": "Hello! I'm your AI support assistant. I can help with **billing**, **technical issues**, **order tracking**, **returns**, or general questions. What can I help you with today?",
    "thanks": "You're welcome! Is there anything else I can help you with?",
    "default": "I'm here to help with billing, technical support, orders, and returns. Could you tell me more about what you need?",
}


def _general_response(user_message: str) -> str:
    msg = user_message.lower()
    if any(w in msg for w in ["hello", "hi", "hey", "good morning", "good afternoon"]):
        return _GENERAL_RESPONSES["hello"]
    if any(w in msg for w in ["thank", "thanks", "great", "perfect", "awesome"]):
        return _GENERAL_RESPONSES["thanks"]
    return _GENERAL_RESPONSES["default"]


async def route_and_respond(user_message: str, history: list[dict]) -> dict:
    t_total_start = time.monotonic()

    intent, confidence, reason, router_ms = await _classify_intent(user_message, history)
    logger.info("intent=%s conf=%.2f reason=%s", intent, confidence, reason)

    router_trace = {
        "fn": f"Router.analyze_intent(message, session_ctx)",
        "result": json.dumps({"intent": intent, "confidence": confidence}),
        "ms": router_ms,
    }

    if intent in INTENT_MAP:
        agent_id, agent_name = INTENT_MAP[intent]

        dispatch = {
            "billing":   run_billing_agent,
            "technical": run_technical_agent,
            "order":     run_order_agent,
            "returns":   run_returns_agent,
            "knowledge": run_knowledge_agent,
            "human":     run_human_agent,
        }
        answer, agent_traces = await dispatch[intent](user_message, history)
    else:
        agent_id, agent_name = "router", "Router"
        answer = _general_response(user_message)
        agent_traces = []

    total_ms = int((time.monotonic() - t_total_start) * 1000)

    return {
        "answer": answer,
        "agent": agent_name,
        "agentId": agent_id,
        "intent_reason": reason,
        "pipelineSteps": _pipeline_steps(intent, agent_name, len(agent_traces), total_ms),
        "agentTraces": {
            "router": [router_trace],
            agent_id: agent_traces,
        },
        "totalMs": total_ms,
    }
