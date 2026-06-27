"""
Billing plugin — simulates a billing database. In production these
functions would query a real database or call an internal API.
Each @kernel_function becomes a tool definition the LLM can invoke.
"""
import json
import random
from semantic_kernel.functions import kernel_function

_MOCK_INVOICES = {
    "INV-001": {"amount": 149.99, "status": "paid", "date": "2026-05-15", "plan": "Pro"},
    "INV-002": {"amount": 149.99, "status": "overdue", "date": "2026-06-15", "plan": "Pro"},
    "INV-003": {"amount": 49.99, "status": "paid", "date": "2026-04-15", "plan": "Starter"},
}

_MOCK_PLANS = {
    "starter": {"price": 49.99, "features": ["5 users", "10GB storage", "Email support"]},
    "pro": {"price": 149.99, "features": ["25 users", "100GB storage", "Priority support", "API access"]},
    "enterprise": {"price": 499.99, "features": ["Unlimited users", "1TB storage", "24/7 support", "SLA"]},
}


class BillingPlugin:
    @kernel_function(name="get_invoice", description="Retrieve invoice details by invoice ID")
    def get_invoice(self, invoice_id: str) -> str:
        invoice = _MOCK_INVOICES.get(invoice_id.upper())
        if not invoice:
            return json.dumps({"error": f"Invoice {invoice_id} not found"})
        return json.dumps({"invoice_id": invoice_id.upper(), **invoice})

    @kernel_function(name="get_payment_history", description="Get the last 3 invoices for the current customer")
    def get_payment_history(self) -> str:
        return json.dumps(list(_MOCK_INVOICES.items()))

    @kernel_function(name="get_plan_options", description="List all available subscription plans and their pricing")
    def get_plan_options(self) -> str:
        return json.dumps(_MOCK_PLANS)

    @kernel_function(name="apply_discount", description="Apply a one-time courtesy discount to the next invoice")
    def apply_discount(self, percentage: int) -> str:
        if percentage > 30:
            return json.dumps({"error": "Discounts above 30% require manager approval"})
        discount_code = f"DISC-{random.randint(1000, 9999)}"
        return json.dumps({
            "success": True,
            "discount_code": discount_code,
            "percentage": percentage,
            "message": f"A {percentage}% discount has been applied. Use code {discount_code} at checkout.",
        })
