import re

import pytest

from app import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(
        {
            "TESTING": True,
            "DEMO_MODE": True,
            "DATA_BACKEND": "sqlite",
            "DATABASE": str(tmp_path / "test.sqlite"),
            "SECRET_KEY": "test-only",
        }
    )


@pytest.fixture
def client(app):
    return app.test_client()


def csrf(client, path="/auth/login"):
    page = client.get(path)
    return re.search(r'name="csrf-token" content="([^"]+)"', page.text)[1]


@pytest.fixture
def logged(client):
    client.post("/auth/demo", data={"csrf_token": csrf(client), "seed": "1"})
    return client
