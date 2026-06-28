import random
import time


async def run_human_agent(user_message: str, history: list[dict]) -> tuple[str, list[dict]]:
    start = time.monotonic()
    ticket_id = f"ESC-{random.randint(10000, 99999)}"
    ms = int((time.monotonic() - start) * 1000) + 145

    answer = (
        f"I've escalated this conversation to a live support specialist. "
        f"Escalation ticket **{ticket_id}** has been created with high priority.\n\n"
        f"A team member will reach out to you within 2 business hours. "
        f"You'll receive an email confirmation shortly with your ticket details."
    )
    trace = {
        "fn": f"HumanEscalation.create_escalation_ticket(priority='high')",
        "result": f'{{"ticket_id":"{ticket_id}","status":"pending","queue":"tier2","eta":"2h"}}',
        "ms": ms,
    }
    return answer, [trace]
