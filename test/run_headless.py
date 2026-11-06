"""Test viewera w headless Chrome: lokalna kopia z bibliotekami z node_modules zamiast CDN,
wczytanie testowego STEP, sprawdzenie liczby części, kliknięcie w model i zrzut ekranu."""
import pathlib, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")   # polskie znaki w konsoli Windows

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8765
STEP = ROOT / "test" / "test_zlozenie.step"
SHOT = ROOT / "test" / "screenshot.png"

# Chrome zainstalowany w systemie (pierwsza istniejąca ścieżka). Brak = Chromium z Playwrighta.
CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/usr/bin/google-chrome",
]
CHROME = next((c for c in CHROME_PATHS if pathlib.Path(c).exists()), None)

src = (ROOT / "index.html").read_text(encoding="utf-8")
src = src.replace("https://cdn.jsdelivr.net/npm/three@0.187.0/", f"http://localhost:{PORT}/node_modules/three/")
src = re.sub(r"https://cdn\.jsdelivr\.net/npm/occt-import-js@[\d.]+/", f"http://localhost:{PORT}/node_modules/occt-import-js/", src)
(ROOT / "test" / "index_local.html").write_text(src, encoding="utf-8")

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.goto(f"http://localhost:{PORT}/test/index_local.html")
        page.select_option("#upAxis", "Z")
        page.set_input_files("#fileInput", str(STEP))
        page.wait_for_function("document.getElementById('status').textContent.startsWith('Wczytano') || document.getElementById('status').textContent.startsWith('Błąd')", timeout=60000)
        print("STATUS:", page.inner_text("#status"))
        info = page.evaluate("({n: window.__viewer.parts.length, names: window.__viewer.parts.map(p => p.path.join(' > ')), size: window.__viewer.modelSize.toArray()})")
        print("PARTS:", info["n"]); [print("  ", n) for n in info["names"]]
        print("SIZE m:", [round(v, 3) for v in info["size"]])
        page.mouse.click(820, 660)
        time.sleep(0.5)
        print("PICKED:", page.inner_text("#picked") if page.is_visible("#picked") else "(nic)")
        page.evaluate("document.querySelector('#treeBox').open = true")
        page.screenshot(path=str(SHOT))
        browser.close()
finally:
    server.terminate()

print("ERRORS:", errors or "brak")
