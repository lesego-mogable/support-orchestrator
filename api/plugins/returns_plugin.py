import json
import random
from semantic_kernel.functions import kernel_function


class ReturnsPlugin:
    @kernel_function(name="check_return_eligibility", description="Check if a recent order is eligible for return")
    def check_return_eligibility(self) -> str:
        return json.dumps({
            "eligible": True,
            "order_id": "ORD-5521A",
            "item": "WiFi 6 Mesh Router 3-pack",
            "days_since_purchase": 12,
            "policy": "30_day_return",
            "condition_required": "original_packaging",
        })

    @kernel_function(name="initiate_return", description="Initiate a return and generate a prepaid shipping label")
    def initiate_return(self, order_id: str, reason: str = "not_specified") -> str:
        return_id = f"RET-{random.randint(1000, 9999)}"
        return json.dumps({
            "return_id": return_id,
            "order_id": order_id,
            "reason": reason,
            "label_emailed": True,
            "carrier": "FedEx",
            "drop_off_locations": 47,
        })

    @kernel_function(name="calculate_refund", description="Calculate the refund amount for a return")
    def calculate_refund(self, return_id: str) -> str:
        return json.dumps({
            "return_id": return_id,
            "refund_amount": "$149.99",
            "method": "original_payment_method",
            "processing_days": "5-7 business days",
        })
