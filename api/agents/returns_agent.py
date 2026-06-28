from plugins.returns_plugin import ReturnsPlugin
from agents.base_agent import run_agent

SYSTEM_PROMPT = """You are a Returns & Refunds Specialist for a SaaS/e-commerce company.
Your job is to help customers return items, process exchanges, and issue refunds.
Always check eligibility first before initiating a return. Be empathetic and efficient.
Clearly state the return ID, refund amount, and timeline in your response."""


async def run_returns_agent(user_message: str, history: list[dict]) -> tuple[str, list[dict]]:
    return await run_agent(SYSTEM_PROMPT, user_message, history, [(ReturnsPlugin(), "Returns")])
