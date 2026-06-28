import json
from semantic_kernel.functions import kernel_function

_MOCK_ORDERS = {
    "ORD-5521A": {"item": "WiFi 6 Mesh Router 3-pack", "total": "$149.99", "placed": "2026-06-15"},
    "ORD-4830B": {"item": "Smart Home Hub Pro", "total": "$89.99", "placed": "2026-06-20"},
}

_MOCK_SHIPPING = {
    "ORD-5521A": {"carrier": "FedEx", "tracking": "772891023785", "status": "Out for Delivery", "eta": "Today, 6–8 PM"},
    "ORD-4830B": {"carrier": "UPS", "tracking": "1Z999AA10123456784", "status": "In Transit", "eta": "Tomorrow by 9 PM"},
}


class OrderPlugin:
    @kernel_function(name="lookup_recent_order", description="Look up the customer's most recent order")
    def lookup_recent_order(self) -> str:
        order_id = "ORD-5521A"
        return json.dumps({"order_id": order_id, **_MOCK_ORDERS[order_id]})

    @kernel_function(name="get_shipping_status", description="Get shipping and tracking status for an order ID")
    def get_shipping_status(self, order_id: str) -> str:
        status = _MOCK_SHIPPING.get(order_id.upper())
        if not status:
            return json.dumps({"error": f"No shipping info found for {order_id}"})
        return json.dumps({"order_id": order_id.upper(), **status})

    @kernel_function(name="list_all_orders", description="List all orders placed by the customer")
    def list_all_orders(self) -> str:
        return json.dumps([{"order_id": oid, **details} for oid, details in _MOCK_ORDERS.items()])
