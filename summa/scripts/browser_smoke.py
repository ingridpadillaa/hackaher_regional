"""Optional, explicitly run browser smoke against an already configured local server."""

import os

from playwright.sync_api import sync_playwright

if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(os.getenv("BASE_URL", "http://127.0.0.1:5055") + "/auth/login")
        page.get_by_role("heading", name="Empieza gratis.", exact=False).wait_for()
        assert page.locator("body").evaluate("(node)=>node.scrollWidth<=innerWidth")
        assert not errors, errors
        browser.close()
