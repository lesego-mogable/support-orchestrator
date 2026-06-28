from plugins.order_plugin import OrderPlugin
from agents.base_agent import run_agent

SYSTEM_PROMPT = """You are an Order Status Specialist for a SaaS/e-commerce company.
Your job is to help customers track their orders and shipments.
Always look up the actual order and shipping data using the tools — never make up tracking numbers or ETAs.
Be concise and include the specific tracking number and delivery window in your response."""


async def run_order_agent(user_message: str, history: list[dict]) -> tuple[str, list[dict]]:
    return await run_agent(SYSTEM_PROMPT, user_message, history, [(OrderPlugin(), "Orders")])
