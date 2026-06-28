from plugins.billing_plugin import BillingPlugin
from agents.base_agent import run_agent

SYSTEM_PROMPT = """You are a Billing Specialist for a SaaS company.
Your job is to help customers with invoices, payments, subscription plans, and discounts.
Use the available tools to look up real data before answering.
Be concise, accurate, and empathetic. If a discount is warranted, apply it proactively.
Never guess invoice amounts or dates — always check with the tools first."""


async def run_billing_agent(user_message: str, history: list[dict]) -> tuple[str, list[dict]]:
    return await run_agent(SYSTEM_PROMPT, user_message, history, [(BillingPlugin(), "Billing")])
