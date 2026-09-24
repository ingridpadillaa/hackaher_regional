from datetime import date
from typing import Protocol

from pydantic import BaseModel


class NormalizedAccount(BaseModel):
    id: str
    tipo: str
    institucion: str
    saldo: float
    ultimos4: str


class NormalizedTransaction(BaseModel):
    externalId: str
    fecha: date
    monto: float
    descripcion: str
    referencia: str = ""
    cuentaId: str
    metodoPago: str = "debito"
    categoriaProveedor: str | None = None
    saldo: float | None = None


class NormalizedCreditCard(BaseModel):
    id: str
    limite: float
    disponible: float
    saldo: float
    pagoMinimo: float
    pagoSinIntereses: float
    fechaLimite: date


class BankProvider(Protocol):
    name: str

    def health_check(self) -> bool: ...
    def create_connect_session(self, user_ref: str) -> dict: ...
    def list_accounts(self, link_id: str) -> list[NormalizedAccount]: ...
    def list_transactions(self, link_id: str, since: date) -> list[NormalizedTransaction]: ...
    def list_credit_cards(self, link_id: str) -> list[NormalizedCreditCard]: ...
    def delete_link(self, link_id: str) -> None: ...


class ProviderUnavailable(RuntimeError):
    pass
