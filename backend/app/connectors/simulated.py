import json
from datetime import date, timedelta
from pathlib import Path

from app.services.clock import local_today

from .base import NormalizedAccount, NormalizedCreditCard, NormalizedTransaction


class SimulatedProvider:
    def __init__(self, name="simulated"):
        self.name = name
        self.fixture = json.loads((Path(__file__).parent / "fixtures/bank.json").read_text())

    def health_check(self):
        return True

    def create_connect_session(self, user_ref):
        return {"link_id": f"demo-{self.name}-{user_ref}", "simulated": True}

    def list_accounts(self, link_id):
        return [NormalizedAccount(**a) for a in self.fixture["accounts"]]

    def list_transactions(self, link_id, since):
        delta = local_today() - date(2026, 9, 23)
        items = [
            NormalizedTransaction(**dict(t, fecha=(date.fromisoformat(t["fecha"]) + delta).isoformat()))
            for t in self.fixture["transactions"]
        ]
        return [t for t in items if t.fecha >= since]

    def list_credit_cards(self, link_id):
        return [
            NormalizedCreditCard(**dict(c, fechaLimite=(local_today() + timedelta(days=5)).isoformat()))
            for c in self.fixture["cards"]
        ]

    def delete_link(self, link_id):
        return None
