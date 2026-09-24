"""Run against a local demo server; requires playwright and installed Google Chrome."""

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless=True
    )
    context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:5055/auth/login")
    page.get_by_role("button", name="Conocer el Hogar Medina").click()
    page.wait_for_url("http://127.0.0.1:5055/")
    page.get_by_text("Hoy puedes gastar", exact=True).wait_for()
    page.screenshot(path="/tmp/cochinito-inicio-mobile.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.goto("http://127.0.0.1:5055/movimientos/nuevo")
    page.locator("[name=monto]").fill("150")
    page.locator("[name=descripcion]").fill("Gasolina prueba navegador")
    page.get_by_role("button", name="Guardar movimiento").click()
    page.get_by_text("Gasolina prueba navegador", exact=True).wait_for()
    page.goto("http://127.0.0.1:5055/movimientos/importar/voz")
    page.locator("#voice-text").fill("ayer gasté 150 en gasolina")
    page.get_by_role("button", name="Analizar y revisar").click()
    page.get_by_role("button", name="Sí, guardar").click()
    page.goto("http://127.0.0.1:5055/movimientos/importar/foto")
    page.get_by_role("button", name="Probar con ejemplo simulado").click()
    page.get_by_role("button", name="Sí, guardar").click()
    page.goto("http://127.0.0.1:5055/perfil")
    page.locator("[name=consent]").check()
    page.get_by_role("button", name="Conectar Banco de prueba").click()
    page.wait_for_timeout(1200)
    page.reload()
    page.get_by_text("activa · Última actualización:", exact=False).wait_for()
    page.goto("http://127.0.0.1:5055/pagos-fijos")
    page.get_by_text("Tarjeta · Banco de prueba", exact=True).wait_for()
    for route in ["/mandado", "/calendario", "/movimientos/reportes", "/perfil"]:
        response = page.goto("http://127.0.0.1:5055" + route)
        assert response.status == 200
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), route
    page.get_by_role("button", name="Abrir copiloto").click()
    page.get_by_role("button", name="¿Me alcanza para el regreso a clases?").click()
    page.locator("#chat-output").filter(has_text="Regreso a clases").wait_for()
    page.screenshot(path="/tmp/cochinito-copiloto-mobile.png", full_page=True)
    page.get_by_role("button", name="Cerrar", exact=True).click()
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.goto("http://127.0.0.1:5055/")
    page.screenshot(path="/tmp/cochinito-inicio-desktop.png", full_page=True)
    page.goto("http://127.0.0.1:5055/perfil")
    assert page.locator('img[alt="Código QR de invitación al hogar"]').evaluate(
        "img => img.complete && img.naturalWidth > 0"
    )
    page.locator('form[action="/perfil/proveedores/syncfy/fallo"] button').click()
    page.locator("[name=consent]").check()
    page.get_by_role("button", name="Conectar Banco de prueba").click()
    page.wait_for_timeout(1000)
    page.reload()
    page.get_by_text("Finerio (simulado)", exact=True).wait_for()
    page.locator('form[action="/perfil/proveedores/syncfy/fallo"] button').click()
    fresh = browser.new_context(viewport={"width": 390, "height": 844})
    onboarding = fresh.new_page()
    onboarding.on("pageerror", lambda error: errors.append(str(error)))
    onboarding.goto("http://127.0.0.1:5055/auth/login")
    onboarding.get_by_role("button", name="Crear mi hogar demo").click()
    onboarding.get_by_role("heading", name="Tu hogar, tus reglas.").wait_for()
    for _ in range(3):
        onboarding.get_by_role("button", name="Continuar").click()
    onboarding.get_by_role("button", name="Ahora no").click()
    onboarding.locator('[name="privacy"]').check()
    onboarding.get_by_role("button", name="Empezar mi hogar").click()
    onboarding.get_by_text("Hoy puedes gastar", exact=True).wait_for()
    assert onboarding.evaluate("document.documentElement.scrollWidth <= innerWidth")
    print({"browser_errors": errors, "mobile_routes": "ok", "demo_flow": "ok"})
    browser.close()
    assert not errors
