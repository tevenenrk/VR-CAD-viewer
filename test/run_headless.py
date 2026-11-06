"""Automatyczny test viewera w Chrome bez okna (Playwright).

Część 1 (PC): wczytanie testowego STEP, drzewo części, klik w część, zmiana koloru + Ctrl+Z, zrzut ekranu.
Część 2 (gogle): emulator Meta Quest 3 (IWER) — wejście w VR, panel narzędzi klikany promieniem,
rysowanie, cofanie (B), zrzut (A), panel (X), chwytanie części, dwie ręce = skala, chwyt modelu,
miarka, malowanie części, gumka, chwyt grupy w sferze.

Uruchom z folderu projektu:  python test/run_headless.py
Wymaga: pip install playwright   oraz
        npm install --no-save three@0.187.0 occt-import-js@0.0.23 three-mesh-bvh@0.9.16 iwer@2.6.0
"""
import base64, pathlib, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")   # polskie znaki w konsoli Windows

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8765
STEP = ROOT / "test" / "test_zlozenie.step"
OUT = ROOT / "test"

# Chrome zainstalowany w systemie (pierwsza istniejąca ścieżka). Brak = Chromium z Playwrighta.
CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/usr/bin/google-chrome",
]
CHROME = next((c for c in CHROME_PATHS if pathlib.Path(c).exists()), None)
CHROME_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# Kopia viewera z bibliotekami z node_modules zamiast z internetu
src = (ROOT / "index.html").read_text(encoding="utf-8")
src = src.replace("https://cdn.jsdelivr.net/npm/three@0.187.0/", f"http://localhost:{PORT}/node_modules/three/")
src = re.sub(r"https://cdn\.jsdelivr\.net/npm/occt-import-js@[\d.]+/", f"http://localhost:{PORT}/node_modules/occt-import-js/", src)
src = re.sub(r"https://cdn\.jsdelivr\.net/npm/three-mesh-bvh@[\d.]+/", f"http://localhost:{PORT}/node_modules/three-mesh-bvh/", src)
(OUT / "index_local.html").write_text(src, encoding="utf-8")

IWER_JS = (ROOT / "node_modules" / "iwer" / "build" / "iwer.min.js").read_text(encoding="utf-8")
IWER_INIT = IWER_JS + """
window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
window.__xrDevice.installRuntime({ forceInstall: true });
window.__xrDevice.stereoEnabled = false;
"""

checks = []
def check(name, ok, detail=""):
    checks.append((name, bool(ok), detail))
    print(("  OK   " if ok else "  BŁĄD ") + name + (f"  [{detail}]" if detail else ""))

# Ostrzeżenia znane i nieszkodliwe: odczyt pikseli przy zrzucie (Chrome bez GPU) oraz brak animacji
# przycisku menu w modelu kontrolera z emulatora.
HARMLESS = [r"GPU stall due to ReadPixels", r"Could not find \w+ in the model"]

def watch(page, errors):
    def on_console(m):
        if m.type == "error" or (m.type == "warning" and not any(re.search(h, m.text) for h in HARMLESS)):
            errors.append(f"{m.type}: {m.text}")
    page.on("console", on_console)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

def wait_loaded(page):
    page.wait_for_function("['Wczytano','Błąd','Nie udało'].some(s => document.getElementById('status').textContent.startsWith(s))", timeout=90000)

def save_last_shot(page, path):
    """Zapisuje ostatni zrzut z pamięci przeglądarki do pliku; zwraca (szer, wys, kolor piksela w rogu)."""
    info = page.evaluate("""async () => {
        const list = await window.__viewer.shotStore.list();
        const r = list[list.length - 1];
        const bmp = await createImageBitmap(r.blob);
        const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
        const ctx = cv.getContext('2d'); ctx.drawImage(bmp, 0, 0);
        const px = Array.from(ctx.getImageData(8, 8, 1, 1).data.slice(0, 3));
        const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(r.blob); });
        return { w: bmp.width, h: bmp.height, px, b64, name: r.name };
    }""")
    path.write_bytes(base64.b64decode(info["b64"]))
    return info

# ---------------------------------------------------------------------------
def test_pc(browser):
    print("\n=== CZĘŚĆ 1: PC ===")
    errors = []
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    watch(page, errors)
    page.goto(f"http://localhost:{PORT}/test/index_local.html")
    page.select_option("#upAxis", "Z")
    page.set_input_files("#fileInput", str(STEP))
    wait_loaded(page)
    status = page.inner_text("#status")
    print("STATUS:", status.replace("\n", " | "))
    info = page.evaluate("({n: window.__viewer.parts.length, names: window.__viewer.parts.map(p => p.path.join(' > ')), size: window.__viewer.modelSize.toArray()})")
    check("wczytano 4 części", info["n"] == 4, ", ".join(info["names"]))
    check("wymiary 400 × 265 × 300 mm", [round(v * 1000) for v in info["size"]] == [400, 265, 300], str([round(v * 1000) for v in info["size"]]))
    bvh = page.evaluate("window.__viewer.parts.every(p => !!p.mesh.geometry.boundsTree)")
    check("drzewo BVH zbudowane dla wszystkich części", bvh)

    page.mouse.click(820, 660)
    time.sleep(0.4)
    picked = page.inner_text("#pickedText") if page.is_visible("#picked") else ""
    check("klik myszą wskazuje część", "Plyta_bazowa" in picked, picked.replace("\n", " | "))

    page.evaluate("(() => { const i = document.getElementById('partColor'); i.value = '#ff0000'; i.dispatchEvent(new Event('change')); })()")
    col = page.evaluate("window.__viewer.parts.find(p => p.name === 'Plyta_bazowa').mesh.material.color.getHexString()")
    check("zmiana koloru części z panelu", col == "ff0000", col)
    page.keyboard.press("Control+z")
    col2 = page.evaluate("window.__viewer.parts.find(p => p.name === 'Plyta_bazowa').mesh.material.color.getHexString()")
    check("Ctrl+Z przywraca kolor", col2 != "ff0000", col2)

    page.click("#btnShot")
    page.wait_for_function("document.getElementById('shotCount').textContent === '1'", timeout=20000)
    shot = save_last_shot(page, OUT / "zrzut_pc.jpg")
    check("zrzut ekranu PC 1920×1080", shot["w"] == 1920 and shot["h"] == 1080, f"{shot['w']}×{shot['h']} {shot['name']}")
    # tło #1d2026 = (29, 32, 38); JPG może przesunąć o kilka jednostek
    check("kolory zrzutu jak na ekranie (tło)", all(abs(a - b) <= 6 for a, b in zip(shot["px"], (29, 32, 38))), str(shot["px"]))

    page.evaluate("document.querySelector('#treeBox').open = true; document.querySelector('#shotsBox').open = true")
    page.screenshot(path=str(OUT / "screenshot.png"))
    page.close()
    check("PC: brak błędów w konsoli", not errors, "; ".join(errors[:5]))

# ---------------------------------------------------------------------------
HELPERS = """
window.T = (() => {
  const V = window.__viewer, THREE = V.THREE, dev = window.__xrDevice;
  const frame = () => V.renderer.info.render.frame;
  const T = {
    async frames(n = 3) { const f0 = frame(); while (frame() < f0 + n) await new Promise(r => setTimeout(r, 10)); },
    ctrl(hand) { return V.controllers.find(c => c.userData.handed === hand); },
    // ustaw kontroler w punkcie eye (świat three.js) i skieruj promień na target
    pose(hand, eye, target) {
      const e = new THREE.Vector3(...eye), t = new THREE.Vector3(...(target || [eye[0], eye[1], eye[2] - 1]));
      const dir = t.clone().sub(e).normalize();
      const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(e, t, up));
      const c = dev.controllers[hand];
      c.position.set(e.x - T.off.x, e.y - T.off.y, e.z - T.off.z);
      c.quaternion.set(q.x, q.y, q.z, q.w);
    },
    // końcówka narzędzia (3 cm przed kontrolerem) w punkcie p, promień w dół / do przodu
    tipAt(hand, p, dir = [0, 0, -1]) {
      const d = new THREE.Vector3(...dir).normalize();
      const eye = new THREE.Vector3(...p).addScaledVector(d, -0.03);
      T.pose(hand, eye.toArray(), eye.clone().add(d).toArray());
    },
    btn(hand, id, v) { dev.controllers[hand].updateButtonValue(id, v); },
    async click(hand, id) { T.btn(hand, id, 1); await T.frames(4); T.btn(hand, id, 0); await T.frames(4); },
    off: new THREE.Vector3(),
    // środek przycisku panelu w świecie
    palPoint(id) {
      const b = V.pal.buttons.find(b => b.id === id);
      const W = 1024, H = 1110;
      const g = V.pal.mesh.geometry.parameters;
      const lx = ((b.x + b.w / 2) / W - 0.5) * g.width, ly = (0.5 - (b.y + b.h / 2) / H) * g.height;
      V.pal.mesh.updateMatrixWorld(true);
      return V.pal.mesh.localToWorld(new THREE.Vector3(lx, ly, 0));
    },
    async palClick(id) {
      const p = T.palPoint(id);
      const n = new THREE.Vector3(0, 0, 1).transformDirection(V.pal.mesh.matrixWorld);
      T.pose('right', p.clone().addScaledVector(n, 0.25).toArray(), p.toArray());
      await T.frames(4);
      const hover = T.ctrl('right').userData.uiHover;
      await T.click('right', 'trigger');
      return hover;
    },
    // punkt modelu (współrzędne CAD w metrach) → świat
    cad(x, y, z) { V.cadRoot.updateMatrixWorld(true); return V.cadRoot.localToWorld(new THREE.Vector3(x, y, z)); },
    part(name) { return V.parts.find(p => p.name === name).mesh; },
    centerOf(name) { const b = new THREE.Box3().setFromObject(T.part(name)); return b.getCenter(new THREE.Vector3()); },
  };
  return T;
})();
"""

def test_xr(browser):
    print("\n=== CZĘŚĆ 2: GOGLE (emulator Meta Quest 3) ===")
    errors = []
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.add_init_script(script=IWER_INIT)
    page = ctx.new_page()
    watch(page, errors)
    page.goto(f"http://localhost:{PORT}/test/index_local.html?model=test_zlozenie.step")
    wait_loaded(page)
    page.select_option("#upAxis", "Z")
    page.wait_for_function("!document.getElementById('btnVR').disabled", timeout=10000)
    page.click("#btnVR")
    page.wait_for_function("window.__viewer.renderer.xr.isPresenting", timeout=20000)
    check("wejście w tryb VR", True)
    page.evaluate(HELPERS)
    page.wait_for_function("window.__viewer.controllers.filter(c => c.userData.inputSource).length === 2", timeout=10000)
    E = lambda js: page.evaluate(f"(async () => {{ const V = window.__viewer, T = window.T; {js} }})()")

    # kalibracja: układ emulatora ↔ świat three.js
    off = E("""T.pose('right', [0.3, 1.2, -0.3]); await T.frames(5);
               const p = T.ctrl('right').getWorldPosition(new V.THREE.Vector3());
               T.off.set(p.x - 0.3, p.y - 1.2, p.z + 0.3); return T.off.toArray();""")
    print("  przesunięcie emulator→świat:", [round(v, 3) for v in off])
    E("T.pose('left', [-0.25, 1.1, -0.25]); T.pose('right', [0.3, 1.1, -0.3]); await T.frames(5);")

    check("panel narzędzi widoczny na lewym kontrolerze", E("return V.pal.mesh.visible && V.pal.mesh.parent === T.ctrl('left');"))
    hover = E("return await T.palClick('tool:rysuj');")
    check("klik promieniem w panel: Rysuj", E("return V.S.tool;") == "rysuj", f"hover={hover}")

    # rysowanie: łuk nad modelem
    n = E("""const c = T.cad(0, -0.1, 0.05);
             T.tipAt('right', c.toArray()); await T.frames(3);
             T.btn('right', 'trigger', 1); await T.frames(3);
             for (let i = 1; i <= 15; i++) { T.tipAt('right', [c.x + i * 0.008, c.y + Math.sin(i / 3) * 0.02, c.z]); await T.frames(2); }
             T.btn('right', 'trigger', 0); await T.frames(4);
             return V.strokes.length ? V.strokes[0].points.length : 0;""")
    check("rysowanie w powietrzu (1 linia)", E("return V.strokes.length;") == 1 and n >= 5, f"{n} punktów")

    E("await T.click('right', 'b-button');")
    check("przycisk B cofa rysunek", E("return V.strokes.length;") == 0)

    E("await T.click('right', 'a-button');")
    page.wait_for_function("document.getElementById('shotCount').textContent === '1'", timeout=20000)
    shot = save_last_shot(page, OUT / "zrzut_vr.jpg")
    check("przycisk A robi zrzut 1920×1080", shot["w"] == 1920 and shot["h"] == 1080, shot["name"])

    E("await T.click('left', 'x-button');")
    v1 = E("return V.pal.mesh.visible;")
    E("await T.click('left', 'x-button');")
    v2 = E("return V.pal.mesh.visible;")
    check("przycisk X chowa i pokazuje panel", (not v1) and v2)

    # chwytanie pojedynczej części (tryb Część): słup
    E("V.paletteAction('tool:wskaz'); V.paletteAction('grab:czesc'); await T.frames(2);")
    r = E("""const p0 = T.centerOf('Slup');
             T.tipAt('right', p0.toArray()); await T.frames(4);
             const hov = T.ctrl('right').userData.grabHover.map(m => m.name);
             T.btn('right', 'squeeze', 1); await T.frames(4);
             const held = T.ctrl('right').userData.held;
             T.tipAt('right', [p0.x + 0.1, p0.y, p0.z]); await T.frames(4);
             const p1 = T.centerOf('Slup');
             T.btn('right', 'squeeze', 0); await T.frames(4);
             return { hov, kind: held && held.kind, names: held && held.meshes ? held.meshes.map(m => m.name) : [],
                      dx: p1.x - p0.x, plate: T.centerOf('Plyta_bazowa').x, undo: V.undoStack.length };""")
    check("sfera przy słupie podświetla słup", r["hov"] == ["Slup"], str(r["hov"]))
    check("grip chwyta tylko słup", r["kind"] == "parts" and r["names"] == ["Slup"], str(r["names"]))
    check("słup przesunięty o 10 cm, płyta bez zmian", abs(r["dx"] - 0.1) < 0.005, f"dx={r['dx']:.4f}")

    # dwie ręce: powiększenie trzymanej części
    r = E("""const p0 = T.centerOf('Slup');
             const s0 = T.part('Slup').getWorldScale(new V.THREE.Vector3()).x;
             T.tipAt('right', p0.toArray()); await T.frames(3);
             T.btn('right', 'squeeze', 1); await T.frames(3);
             T.pose('left', [p0.x - 0.15, p0.y, p0.z + 0.05]); await T.frames(3);
             T.btn('left', 'squeeze', 1); await T.frames(4);
             const two = !!V.twoHand;
             const rp = T.ctrl('right').getWorldPosition(new V.THREE.Vector3());
             const lp = T.ctrl('left').getWorldPosition(new V.THREE.Vector3());
             const away = lp.clone().sub(rp);                 // rozsuń ręce 2×
             T.pose('left', rp.clone().addScaledVector(away, 2).toArray()); await T.frames(5);
             const s1 = T.part('Slup').getWorldScale(new V.THREE.Vector3()).x;
             T.btn('left', 'squeeze', 0); T.btn('right', 'squeeze', 0); await T.frames(4);
             return { two, ratio: s1 / s0 };""")
    check("dwa gripy = tryb dwóch rąk", r["two"])
    check("rozsunięcie rąk 2× powiększa część 2×", abs(r["ratio"] - 2) < 0.1, f"×{r['ratio']:.2f}")
    E("V.paletteAction('reset:parts'); await T.frames(2);")

    # chwyt w pustym miejscu = cały model
    r = E("""const p0 = V.pivot.position.clone();
             T.pose('right', [0.6, 1.5, 0.2]); await T.frames(3);
             T.btn('right', 'squeeze', 1); await T.frames(3);
             const kind = T.ctrl('right').userData.held && T.ctrl('right').userData.held.kind;
             T.pose('right', [0.6, 1.7, 0.2]); await T.frames(4);
             const dy = V.pivot.position.y - p0.y;
             T.btn('right', 'squeeze', 0); await T.frames(3);
             return { kind, dy };""")
    check("grip w pustym miejscu chwyta cały model", r["kind"] == "model" and abs(r["dy"] - 0.2) < 0.005, f"{r['kind']} dy={r['dy']:.3f}")
    E("await T.click('left', 'y-button');")
    check("przycisk Y resetuje pozycję modelu", E("return Math.abs(V.pivot.position.y - 1.1) < 1e-6;"))

    # miarka: dwa punkty na górnej powierzchni płyty, 100 mm od siebie (w układzie CAD)
    r = E("""V.paletteAction('tool:miarka'); await T.frames(2);
             const a = T.cad(-0.10, -0.10, 0.0075), b = T.cad(0.0, -0.10, 0.0075);
             T.pose('right', [a.x, a.y + 0.3, a.z], a.toArray()); await T.frames(4);
             T.btn('right', 'trigger', 1); await T.frames(4);
             T.pose('right', [b.x, b.y + 0.3, b.z], b.toArray()); await T.frames(5);
             T.btn('right', 'trigger', 0); await T.frames(4);
             return { n: V.measures.length, mm: V.measures.length ? V.measures[0].length() * 1000 : 0 };""")
    check("miarka mierzy 100 mm na płycie", r["n"] == 1 and abs(r["mm"] - 100) < 0.5, f"{r['mm']:.2f} mm")

    # malowanie części
    r = E("""V.paletteAction('tool:kolor'); V.paletteAction('color:3'); await T.frames(2);
             const a = T.cad(0.15, 0.10, 0.0075);
             T.pose('right', [a.x, a.y + 0.3, a.z], a.toArray()); await T.frames(4);
             await T.click('right', 'trigger');
             return T.part('Plyta_bazowa').material.color.getHexString();""")
    check("narzędzie Kolor maluje płytę na zielono", r == "34c759", r)

    # gumka: narysuj linię i zmaż ją
    r = E("""V.paletteAction('tool:rysuj'); await T.frames(2);
             const c = T.cad(0.1, 0.1, 0.06);
             T.tipAt('right', c.toArray()); await T.frames(3); T.btn('right', 'trigger', 1); await T.frames(3);
             for (let i = 1; i <= 8; i++) { T.tipAt('right', [c.x + i * 0.01, c.y, c.z]); await T.frames(2); }
             T.btn('right', 'trigger', 0); await T.frames(3);
             const before = V.strokes.length;
             V.paletteAction('tool:gumka'); await T.frames(2);
             T.tipAt('right', [c.x + 0.04, c.y, c.z]); await T.frames(3);
             T.btn('right', 'trigger', 1); await T.frames(4); T.btn('right', 'trigger', 0); await T.frames(3);
             return { before, after: V.strokes.length };""")
    check("gumka usuwa linię", r["before"] == 1 and r["after"] == 0, str(r))

    # grupa w sferze: duża sfera na module chwytaka łapie wspornik i siłownik
    r = E("""V.paletteAction('tool:wskaz'); V.paletteAction('grab:grupa'); V.S.sphere = 0.06; await T.frames(2);
             const c = T.centerOf('Silownik_DSNU').add(T.centerOf('Wspornik_L')).multiplyScalar(0.5);
             T.tipAt('right', c.toArray()); await T.frames(4);
             T.btn('right', 'squeeze', 1); await T.frames(4);
             const held = T.ctrl('right').userData.held;
             const names = held && held.meshes ? held.meshes.map(m => m.name).sort() : [held && held.kind];
             T.btn('right', 'squeeze', 0); await T.frames(3);
             return names;""")
    check("tryb Grupa chwyta części w sferze", "Silownik_DSNU" in r and "Wspornik_L" in r and "Plyta_bazowa" not in r, str(r))

    # widok z „gogli”: panel narzędzi i model
    E("""V.paletteAction('grab:czesc'); V.paletteAction('tool:rysuj');
         T.pose('left', [-0.12, 1.32, -0.35], [-0.12, 1.25, -0.9]); T.pose('right', [0.15, 1.3, -0.4], [-0.1, 1.35, -0.4]);
         await T.frames(8);""")
    page.screenshot(path=str(OUT / "screenshot_vr.png"))
    page.close()
    ctx.close()
    check("VR: brak błędów w konsoli", not errors, "; ".join(errors[:5]))

# ---------------------------------------------------------------------------
server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=CHROME_ARGS)
        for t in (test_pc, test_xr):
            try:
                t(browser)
            except Exception as e:
                check(f"{t.__name__} przerwany", False, str(e).splitlines()[0][:300])
        browser.close()
finally:
    server.terminate()

bad = [c for c in checks if not c[1]]
print(f"\nWYNIK: {len(checks) - len(bad)}/{len(checks)} OK" + ("" if not bad else "  — BŁĘDY: " + ", ".join(c[0] for c in bad)))
sys.exit(1 if bad else 0)
