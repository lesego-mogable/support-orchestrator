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
from plugins.technical_plugin import TechnicalPlugin

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a Technical Support Specialist for a SaaS company.
Your job is to help customers resolve product issues, bugs, API problems, and configuration questions.
Always check the manual and known issues list before answering — never guess at technical details.
If the issue is not documented and cannot be resolved with the available tools, create a support ticket.
Be patient, step-by-step, and ask clarifying questions when needed."""


def _build_kernel() -> Kernel:
    kernel = Kernel()
    kernel.add_service(
        AzureChatCompletion(
            deployment_name=os.environ.get("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4.1-mini"),
            endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
        )
    )
    kernel.add_plugin(TechnicalPlugin(), plugin_name="TechSupport")
    return kernel


async def run_technical_agent(user_message: str, history: list[dict]) -> str:
    """Run the Technical Support Agent for one turn. Returns the agent's reply as a string."""
    kernel = _build_kernel()

    chat_history = ChatHistory()
    chat_history.add_system_message(SYSTEM_PROMPT)
    for msg in history[-10:]:
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
