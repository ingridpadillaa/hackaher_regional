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
def logged(client, app):
    from itsdangerous import URLSafeTimedSerializer

    from tests.legacy_seed import seed_household
    uid = "regression-user"
    seed_household(app.extensions["repo"], uid)
    client.set_cookie("__session", URLSafeTimedSerializer(app.secret_key, salt="demo").dumps({"uid":uid}))
    return client
