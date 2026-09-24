"""Temporary Cloud Storage object in production, memory only for local demo."""

import uuid
from contextlib import contextmanager

from flask import current_app


@contextmanager
def temporary_upload(uid, content, content_type):
    blob = None
    try:
        if current_app.config["DATA_BACKEND"] == "firestore":
            from firebase_admin import storage

            blob = storage.bucket().blob(f"uploads/{uid}/{uuid.uuid4().hex}")
            blob.upload_from_string(content, content_type=content_type, timeout=8)
        yield content
    finally:
        if blob:
            # Do not swallow deletion failures; configure a 1-day bucket lifecycle as a backstop.
            blob.delete(timeout=8)
