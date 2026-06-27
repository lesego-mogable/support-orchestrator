import os
import logging
from semantic_kernel import Kernel
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion
from semantic_kernel.connectors.ai.function_choice_behavior import FunctionChoiceBehavior
from semantic_kernel.connectors.ai.chat_completion_client_base import ChatCompletionClientBase
from semantic_kernel.contents.chat_history import ChatHistory
from semantic_kernel.connectors.ai.open_ai.prompt_execution_settings.azure_chat_prompt_execution_settings import (
    AzureChatPromptExecutionSettings,
)
from plugins.billing_plugin import BillingPlugin

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a Billing Specialist for a SaaS company.
Your job is to help customers with invoices, payments, subscription plans, and discounts.
Use the available tools to look up real data before answering.
Be concise, accurate, and empathetic. If a discount is warranted, apply it proactively.
Never guess invoice amounts or dates — always check with the tools first."""


def _build_kernel() -> Kernel:
    kernel = Kernel()
    kernel.add_service(
        AzureChatCompletion(
            deployment_name=os.environ.get("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4.1-mini"),
            endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
        )
    )
    kernel.add_plugin(BillingPlugin(), plugin_name="Billing")
    return kernel


async def run_billing_agent(user_message: str, history: list[dict]) -> str:
    """Run the Billing Agent for one turn. Returns the agent's reply as a string."""
    kernel = _build_kernel()

    chat_history = ChatHistory()
    chat_history.add_system_message(SYSTEM_PROMPT)
    for msg in history[-10:]:  # cap context to last 10 messages
        if msg["role"] == "user":
            chat_history.add_user_message(msg["content"])
        elif msg["role"] == "assistant":
            chat_history.add_assistant_message(msg["content"])
    chat_history.add_user_message(user_message)

    settings = AzureChatPromptExecutionSettings(
        function_choice_behavior=FunctionChoiceBehavior.Auto()
    )

    chat_service: ChatCompletionClientBase = kernel.get_service(type=ChatCompletionClientBase)
    response = await chat_service.get_chat_message_contents(
        chat_history=chat_history,
        settings=settings,
        kernel=kernel,
    )

    return str(response[-1])
