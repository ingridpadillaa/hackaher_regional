"""TODO: obtain authenticated Finerio developer specification and sandbox access.
Reference: https://www.finerioconnect.com/en/products/open-finance-in-a-box
No unverified endpoints are issued. This adapter fails closed.
"""

from .base import ProviderUnavailable
from .syncfy import SyncfyProvider


class FinerioProvider(SyncfyProvider):
    name = "finerio"

    def _request(self, *args, **kwargs):
        raise ProviderUnavailable("Finerio pendiente de documentación y sandbox")
