"""Production boundary, deliberately disabled until sandbox contract is validated.
Official reference: https://github.com/Paybook/sync-rest
TODO: verify user/session lifecycle, widget callback and card payload with credentials.
Do not treat a successful health probe as authorization to access a user's bank.
"""

from .base import ProviderUnavailable


class SyncfyProvider:
    name = "syncfy"

    def _request(self, *args, **kwargs):
        raise ProviderUnavailable("Syncfy pendiente de validar con sandbox y consentimiento real")

    def health_check(self):
        return False

    def create_connect_session(self, user_ref):
        return self._request()

    def list_accounts(self, link_id):
        return self._request()

    def list_transactions(self, link_id, since):
        return self._request()

    def list_credit_cards(self, link_id):
        return self._request()

    def delete_link(self, link_id):
        return self._request()
