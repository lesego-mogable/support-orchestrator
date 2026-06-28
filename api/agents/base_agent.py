"""
Shared kernel factory that attaches a function-invocation filter to capture
every tool call (fn name, args, result, latency). Each agent calls
run_agent() and gets back (answer, traces) — traces drive the right panel.
"""
import os
import time
from typing import Any

from semantic_kernel import Kernel
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion
from semantic_kernel.connectors.ai.function_choice_behavior import FunctionChoiceBehavior
from semantic_kernel.connectors.ai.chat_completion_client_base import ChatCompletionClientBase
from semantic_kernel.connectors.ai.open_ai.prompt_execution_settings.azure_chat_prompt_execution_settings import (
    AzureChatPromptExecutionSettings,
)
from semantic_kernel.contents.chat_history import ChatHistory
from semantic_kernel.filters.filter_types import FilterTypes


def _build_traced_kernel(plugins: list[tuple[Any, str]]) -> tuple[Kernel, list[dict]]:
    kernel = Kernel()
    kernel.add_service(
        AzureChatCompletion(
            deployment_name=os.environ.get("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4.1-mini"),
            endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
        )
    )
    for plugin_instance, plugin_name in plugins:
        kernel.add_plugin(plugin_instance, plugin_name=plugin_name)

    traces: list[dict] = []

    async def _capture(context, next_fn):
        start = time.monotonic()
        await next_fn(context)
        ms = int((time.monotonic() - start) * 1000)

        # Filter out SK-internal arguments before formatting
        args = {
            k: v for k, v in (context.arguments or {}).items()
            if k not in ("chat_history", "kernel", "execution_settings")
        }
        args_str = ", ".join(f"{k}={str(v)!r}" for k, v in args.items())
        fn_display = f"{context.function.plugin_name}.{context.function.name}({args_str})"
        result_str = (str(context.result) or "")[:300]

        traces.append({"fn": fn_display, "result": result_str, "ms": ms})

    kernel.add_filter(FilterTypes.FUNCTION_INVOCATION, _capture)
    return kernel, traces


async def run_agent(
    system_prompt: str,
    user_message: str,
    history: list[dict],
    plugins: list[tuple[Any, str]],
) -> tuple[str, list[dict]]:
    """Run a single-turn SK agent. Returns (answer, tool_call_traces)."""
    kernel, traces = _build_traced_kernel(plugins)

    chat_history = ChatHistory()
    chat_history.add_system_message(system_prompt)
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

    return str(response[-1]), traces
