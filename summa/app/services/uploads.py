"""Original documents stay in memory and are never uploaded or saved."""
from contextlib import contextmanager


@contextmanager
def temporary_upload(uid, content, content_type):
    yield content
