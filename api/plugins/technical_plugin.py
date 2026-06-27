"""
Technical support plugin — simulates reading from a knowledge base
and a ticketing system. Each @kernel_function is an LLM-callable tool.
"""
import json
import random
from semantic_kernel.functions import kernel_function

_KNOWN_ISSUES = [
    {"id": "KI-42", "title": "API rate limit errors after plan downgrade", "status": "investigating", "eta": "2026-06-30"},
    {"id": "KI-38", "title": "SSO login fails with Google Workspace accounts", "status": "resolved", "eta": None},
    {"id": "KI-51", "title": "CSV export truncates rows >10,000", "status": "in_progress", "eta": "2026-07-05"},
]

_MANUAL_EXCERPTS = {
    "api": "The REST API is available at https://api.example.com/v2. Authentication uses Bearer tokens. Rate limits: 1000 req/min on Pro, 100 req/min on Starter.",
    "sso": "SSO is configured under Settings > Security > Identity Provider. Supported providers: Google, Okta, Azure AD. Ensure the callback URL is set to https://app.example.com/auth/callback.",
    "export": "Data export is available in CSV, JSON, and XLSX formats under Reports > Export. Max 50,000 rows per export on Pro plan.",
    "password": "Password reset is available on the login page. Temporary passwords expire in 24 hours. Contact support if you do not receive the reset email within 5 minutes.",
    "billing": "For billing questions, please contact billing@example.com or use the Billing section in your account dashboard.",
}


class TechnicalPlugin:
    @kernel_function(name="search_manual", description="Search the product manual for a topic (e.g. 'api', 'sso', 'export', 'password', 'billing')")
    def search_manual(self, topic: str) -> str:
        key = topic.lower().strip()
        for manual_key, excerpt in _MANUAL_EXCERPTS.items():
            if manual_key in key or key in manual_key:
                return json.dumps({"topic": manual_key, "excerpt": excerpt})
        return json.dumps({"error": f"No manual entry found for topic: {topic}"})

    @kernel_function(name="get_known_issues", description="List currently known product issues and their resolution status")
    def get_known_issues(self) -> str:
        return json.dumps(_KNOWN_ISSUES)

    @kernel_function(name="create_support_ticket", description="Create a new support ticket for an unresolved issue")
    def create_support_ticket(self, summary: str, priority: str = "medium") -> str:
        ticket_id = f"TKT-{random.randint(10000, 99999)}"
        return json.dumps({
            "ticket_id": ticket_id,
            "summary": summary,
            "priority": priority,
            "status": "open",
            "message": f"Ticket {ticket_id} created. You will receive an email confirmation shortly.",
        })

    @kernel_function(name="check_system_status", description="Check the current system and API uptime status")
    def check_system_status(self) -> str:
        return json.dumps({
            "api": "operational",
            "web_app": "operational",
            "sso": "degraded_performance",
            "data_export": "operational",
            "updated_at": "2026-06-26T10:00:00Z",
        })
