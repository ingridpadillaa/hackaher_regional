import os
import time

from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential, wait_none

from .base import ProviderUnavailable
from .finerio import FinerioProvider
from .simulated import SimulatedProvider
from .syncfy import SyncfyProvider


class ProviderRouter:
    def __init__(self, repository, demo=False, providers=None, clock=time.time):
        self.repo, self.demo, self.clock = repository, demo, clock
        self.providers = providers or (
            {"syncfy": SyncfyProvider(), "finerio": FinerioProvider(), "simulated": SimulatedProvider()}
            if demo
            else {"syncfy": SyncfyProvider(), "finerio": FinerioProvider()}
        )
        self.order = [
            p
            for p in os.getenv("PROVIDER_ORDER", "syncfy,finerio,simulated").split(",")
            if p in self.providers and (demo or p != "simulated")
        ]

    def path(self, name):
        return f"estadoProveedores/{name}"

    def call(self, name, operation):
        if name not in self.providers:
            raise ProviderUnavailable("Proveedor no disponible")
        path = self.path(name)
        now = self.clock()

        def acquire(current):
            state = current[path] or {}
            if state.get("circuitoAbiertoHasta", 0) > now or state.get("probeUntil", 0) > now:
                return {}, False
            if state.get("circuitoAbiertoHasta"):
                state["probeUntil"] = now + 60
                return {path: state}, True
            return {}, True

        if not self.repo.atomic([path], acquire):
            raise ProviderUnavailable("Circuito abierto; reintento pendiente")
        try:
            if self.demo and (self.repo.get(path) or {}).get("forced"):
                raise TimeoutError("Fallo simulado")
            for attempt in Retrying(
                stop=stop_after_attempt(4),
                wait=wait_none() if self.demo else wait_exponential(multiplier=1, min=1, max=4),
                retry=retry_if_exception_type((TimeoutError, ConnectionError, ProviderUnavailable)),
                reraise=True,
            ):
                with attempt:
                    result = operation(self.providers[name])

            def success(current):
                state = current[path] or {}
                state.update(
                    fallosConsecutivos=0, circuitoAbiertoHasta=0, probeUntil=0, ultimoOk=self.clock()
                )
                return {path: state}, None

            self.repo.atomic([path], success)
            return result
        except Exception as exc:
            timed_out = isinstance(exc, TimeoutError)

            def fail(current):
                state = current[path] or {}
                failures = state.get("fallosConsecutivos", 0) + 1
                state.update(fallosConsecutivos=failures, probeUntil=0, ultimoError=self.clock())
                if failures >= 3 or timed_out:
                    state["circuitoAbiertoHasta"] = self.clock() + 300
                return {path: state}, None

            self.repo.atomic([path], fail)
            raise ProviderUnavailable("Proveedor temporalmente no disponible") from exc

    def connect(self, uid):
        for name in self.order:
            try:
                return name, self.call(name, lambda provider: provider.create_connect_session(uid))
            except ProviderUnavailable:
                continue
        raise ProviderUnavailable("No hay proveedores disponibles. Puedes seguir registrando manualmente.")
