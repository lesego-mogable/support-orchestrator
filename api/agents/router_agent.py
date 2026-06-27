"""
Router Agent — the primary orchestrator.

It reads the user message and conversation history, then decides whether to:
  1. Handle the query itself (greetings, out-of-scope deflections)
  2. Delegate to the Billing Agent
  3. Delegate to the Technical Support Agent

The routing decision is made by a lightweight LLM call that classifies the
intent before invoking the appropriate specialist. The specialist's response
is returned directly to the user — no re-wrapping, so the specialist's
persona comes through cleanly.
"""
import os
import json
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

logger = logging.getLogger(__name__)

ROUTER_SYSTEM_PROMPT = """You are a customer support router. Classify the user's message into exactly one category and respond with valid JSON only.

Categories:
- "billing": questions about invoices, payments, charges, refunds, subscription plans, pricing, discounts
- "technical": questions about product bugs, errors, API issues, configuration, how-to, account access, system status
- "general": greetings, thanks, out-of-scope queries, small talk

Respond with this exact JSON shape:
{"intent": "<category>", "reason": "<one sentence explaining why>"}"""


async def _classify_intent(user_message: str, history: list[dict]) -> tuple[str, str]:
    """Use a fast LLM call to classify the routing intent."""
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

    # Give the router only the last 4 messages for context efficiency
    for msg in history[-4:]:
        if msg["role"] == "user":
            chat_history.add_user_message(msg["content"])
        elif msg["role"] == "assistant":
            chat_history.add_assistant_message(msg["content"])
    chat_history.add_user_message(user_message)

    settings = AzureChatPromptExecutionSettings(temperature=0.0, max_tokens=100)
    chat_service: ChatCompletionClientBase = kernel.get_service(type=ChatCompletionClientBase)
    response = await chat_service.get_chat_message_contents(
        chat_history=chat_history,
        settings=settings,
        kernel=kernel,
    )

    raw = str(response[-1]).strip()
    try:
        parsed = json.loads(raw)
        return parsed.get("intent", "general"), parsed.get("reason", "")
    except (json.JSONDecodeError, KeyError):
        logger.warning("Router returned non-JSON: %s", raw)
        return "general", "Could not parse intent"


_GENERAL_RESPONSES = {
    "greeting": "Hello! I'm your customer support assistant. I can help with billing questions, technical issues, or general account inquiries. What can I help you with today?",
    "thanks": "You're welcome! Is there anything else I can help you with?",
    "default": "I'm here to help with billing and technical support questions. Could you tell me more about what you need assistance with?",
}


def _handle_general(user_message: str) -> str:
    msg = user_message.lower()
    if any(word in msg for word in ["hello", "hi", "hey", "good morning", "good afternoon"]):
        return _GENERAL_RESPONSES["greeting"]
    if any(word in msg for word in ["thank", "thanks", "great", "perfect", "awesome"]):
        return _GENERAL_RESPONSES["thanks"]
    return _GENERAL_RESPONSES["default"]


async def route_and_respond(user_message: str, history: list[dict]) -> dict:
    """
    Main entry point for the router.
    Returns a dict with keys: answer (str), agent (str), intent_reason (str)
    """
    intent, reason = await _classify_intent(user_message, history)
    logger.info("Routing intent=%s reason=%s", intent, reason)

    if intent == "billing":
        answer = await run_billing_agent(user_message, history)
        agent = "Billing Agent"
    elif intent == "technical":
        answer = await run_technical_agent(user_message, history)
        agent = "Technical Support Agent"
    else:
        answer = _handle_general(user_message)
        agent = "Router"

    return {"answer": answer, "agent": agent, "intent_reason": reason}
