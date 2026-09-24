"""Small server-side UI session keyed by __session; Firebase Hosting forwards no other cookie."""

import hashlib
import time

from flask.sessions import SessionInterface, SessionMixin
from werkzeug.datastructures import CallbackDict


class UISession(CallbackDict, SessionMixin):
    def __init__(self, initial=None, key=None):
        super().__init__(initial, lambda session: setattr(session, "modified", True))
        self.key = key
        self.modified = False


class FirebaseUISessionInterface(SessionInterface):
    def open_session(self, app, request):
        cookie = request.cookies.get("__session")
        if not cookie or "repo" not in app.extensions:
            return UISession()
        key = hashlib.sha256(cookie.encode()).hexdigest()
        record = app.extensions["repo"].get("uiSessions/" + key) or {}
        initial = record.get("data", {}) if record.get("expires", 0) > time.time() else {}
        return UISession(initial, key)

    def save_session(self, app, session, response):
        if not session.modified or not session.key:
            return
        path = "uiSessions/" + session.key
        if session:
            app.extensions["repo"].put(path, {"data": dict(session), "expires": time.time() + 7200})
        else:
            app.extensions["repo"].delete(path)
