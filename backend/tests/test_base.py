def test_health_and_login(client):
    assert client.get("/health").json["ready"] is True
    assert client.get("/").status_code == 302
    assert "Hagamos espacio" in client.get("/auth/login").text


def test_csrf_required(client):
    assert client.post("/auth/demo").status_code == 400


def test_no_private_cache(client):
    assert client.get("/auth/login").headers["Cache-Control"] == "no-store"
    assert "/auth" not in client.get("/sw.js").text


def test_frontend_assets_are_served(client):
    # Flask must still serve the UI after templates/static move outside its package.
    assert client.get("/auth/login").status_code == 200
    for path in ("/static/app.css", "/static/auth.js", "/static/img/jami-avatar.png", "/sw.js"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.data
    manifest = client.get("/static/manifest.json").json
    for icon in manifest["icons"]:
        assert client.get(icon["src"]).status_code == 200
