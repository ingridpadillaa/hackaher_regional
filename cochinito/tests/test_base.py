def test_health_and_login(client):
    assert client.get("/health").json == {"status": "ok"}
    assert client.get("/").status_code == 302
    assert "Hagamos espacio" in client.get("/auth/login").text


def test_csrf_required(client):
    assert client.post("/auth/demo").status_code == 400


def test_no_private_cache(client):
    assert client.get("/auth/login").headers["Cache-Control"] == "no-store"
    assert "/auth" not in client.get("/sw.js").text
