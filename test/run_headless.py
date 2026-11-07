"""Automatyczny test viewera w Chrome bez okna (Playwright).

Część 1 (PC): wczytanie testowego STEP, drzewo części, klik w część, zmiana koloru + Ctrl+Z, zrzut ekranu.
Część 2 (gogle): emulator Meta Quest 3 (IWER) — wejście w VR, panel narzędzi klikany promieniem,
rysowanie, cofanie (B), zrzut (A), panel (X), chwytanie części, dwie ręce = skala, chwyt modelu,
miarka, malowanie części, gumka, chwyt grupy w sferze.

Uruchom z folderu projektu:  python test/run_headless.py
Wymaga: pip install playwright   oraz
        npm install --no-save three@0.187.0 occt-import-js@0.0.23 three-mesh-bvh@0.9.16 iwer@2.6.0
"""
import base64, json, os, pathlib, re, subprocess, sys, time, urllib.parse
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
CHROME_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
               "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]   # sztuczny mikrofon do testu dyktowania

# Kopia viewera z bibliotekami z node_modules zamiast z internetu
src = (ROOT / "index.html").read_text(encoding="utf-8")
src = src.replace("https://cdn.jsdelivr.net/npm/three@0.187.0/", f"http://localhost:{PORT}/node_modules/three/")
src = re.sub(r"https://cdn\.jsdelivr\.net/npm/occt-import-js@[\d.]+/", f"http://localhost:{PORT}/node_modules/occt-import-js/", src)
src = re.sub(r"https://cdn\.jsdelivr\.net/npm/three-mesh-bvh@[\d.]+/", f"http://localhost:{PORT}/node_modules/three-mesh-bvh/", src)
src = src.replace("import('./szkicownik/szkicownik.js')", "import('../szkicownik/szkicownik.js')")   # kopia strony leży w test/
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

# ---------------------------------------------------------------------------
# Atrapy usług Google (test nie loguje się do prawdziwego konta):
#  - logowanie Google (GIS) od razu zwraca token,
#  - Google Drive: mały „dysk” w pamięci: Mój dysk / Projekt_A / cad / test_zlozenie.step + Rama.SLDASM,
#  - Gemini: zwraca stały tekst „dyktowania”.
FAKE_GIS = """window.google = { accounts: { oauth2: {
  initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'tok-test', expires_in: 3599 }), 20) }),
  revoke: (t, cb) => cb && cb() } } };"""
GEMINI_TEXT = "sprawdzić luz na prowadnicy"
FOLDER = "application/vnd.google-apps.folder"
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS"}

class GoogleMock:
    def __init__(self):
        self.files = {
            "fA": {"id": "fA", "name": "Projekt_A", "mimeType": FOLDER, "parents": ["root"]},
            "fC": {"id": "fC", "name": "cad", "mimeType": FOLDER, "parents": ["fA"]},
            "s1": {"id": "s1", "name": "test_zlozenie.step", "mimeType": "application/octet-stream", "parents": ["fC"], "size": str(STEP.stat().st_size)},
            "s2": {"id": "s2", "name": "Rama.SLDASM", "mimeType": "application/octet-stream", "parents": ["fC"], "size": "123456"},
            "x1": {"id": "x1", "name": "notatki.txt", "mimeType": "text/plain", "parents": ["fC"], "size": "10"},
        }
        self.uploads, self.gemini, self.n = [], [], 0

    def path_of(self, fid):
        names = []
        while fid in self.files:
            names.insert(0, self.files[fid]["name"]); fid = self.files[fid]["parents"][0]
        return "/".join(names)

    def install(self, target):
        target.route("https://accounts.google.com/gsi/client", lambda r: r.fulfill(body=FAKE_GIS, content_type="text/javascript"))
        target.route("https://www.googleapis.com/**", self.drive)
        target.route("https://generativelanguage.googleapis.com/**", self.gem)

    def ok(self, route, data, ctype="application/json"):
        body = data if isinstance(data, (bytes, str)) else json.dumps(data)
        route.fulfill(status=200, body=body, content_type=ctype, headers=CORS)

    def drive(self, route):
        req = route.request
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        if req.headers.get("authorization") != "Bearer tok-test": return route.fulfill(status=401, body="{}", headers=CORS)
        u = urllib.parse.urlparse(req.url); qs = urllib.parse.parse_qs(u.query)
        if "/upload/drive/v3/files" in u.path:
            raw = req.post_data_buffer
            meta = json.loads(re.search(rb"\r\n\r\n(\{.*?\})\r\n--", raw, re.S).group(1))
            self.n += 1; fid = f"u{self.n}"
            self.files[fid] = {"id": fid, "name": meta["name"], "mimeType": meta.get("mimeType", ""), "parents": meta["parents"]}
            self.uploads.append({"name": meta["name"], "path": self.path_of(fid), "jpeg": b"\xff\xd8" in raw})
            return self.ok(route, {"id": fid, "name": meta["name"]})
        m = re.match(r"/drive/v3/files/([^/]+)$", u.path)
        if m and qs.get("alt") == ["media"]:
            return self.ok(route, STEP.read_bytes(), "application/octet-stream")
        if u.path == "/drive/v3/files" and req.method == "POST":
            meta = json.loads(req.post_data)
            self.n += 1; fid = f"d{self.n}"
            self.files[fid] = {"id": fid, "name": meta["name"], "mimeType": meta["mimeType"], "parents": meta["parents"]}
            return self.ok(route, {"id": fid})
        if u.path == "/drive/v3/files":
            q = qs.get("q", [""])[0]
            parent = re.search(r"'([^']+)' in parents", q).group(1)
            name = re.search(r"name='((?:[^'\\]|\\.)*)'", q)
            res = [f for f in self.files.values() if f["parents"][0] == parent
                   and (not name or f["name"] == name.group(1)) and ("mimeType=" not in q or f["mimeType"] == FOLDER)]
            res.sort(key=lambda f: (f["mimeType"] != FOLDER, f["name"]))
            return self.ok(route, {"files": res})
        route.fulfill(status=404, body="{}", headers=CORS)

    def gem(self, route):
        req = route.request
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        body = json.loads(req.post_data)
        part = body["contents"][0]["parts"][1]["inline_data"]
        self.gemini.append({"key": req.headers.get("x-goog-api-key"), "mime": part["mime_type"], "len": len(part["data"]), "url": req.url})
        self.ok(route, {"candidates": [{"content": {"parts": [{"text": GEMINI_TEXT}]}}]})

# Ostrzeżenia znane i nieszkodliwe: odczyt pikseli przy zrzucie (Chrome bez GPU) oraz brak animacji
# przycisku menu w modelu kontrolera z emulatora.
HARMLESS = [r"GPU stall due to ReadPixels", r"Could not find \w+ in the model"]
# Środowisko w chmurze bez dostępu do CDN modeli kontrolerów (na PC Roberta nie dotyczy)
if os.environ.get("HTTPS_PROXY"):
    HARMLESS += [r"ERR_TUNNEL_CONNECTION_FAILED", r"fetchProfile"]

def watch(page, errors):
    def on_console(m):
        if m.type in ("error", "warning") and not any(re.search(h, m.text) for h in HARMLESS):
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
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.grant_permissions(["microphone"], origin=f"http://localhost:{PORT}")
    page = ctx.new_page()
    gm = GoogleMock(); gm.install(page)
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

    page.evaluate("document.querySelector('#treeBox').open = true")
    page.click("#tree .node:nth-child(2) .ghost")
    op1 = page.evaluate("window.__viewer.parts.find(p => p.name === 'Plyta_bazowa').mesh.material.opacity")
    page.click("#partGhost")
    op2 = page.evaluate("window.__viewer.parts.find(p => p.name === 'Plyta_bazowa').mesh.material.opacity")
    check("PC: przycisk ◐ w drzewie i „Półprzezroczysta” w panelu części", abs(op1 - 0.3) < 1e-6 and op2 == 1, f"{op1} → {op2}")
    page.click("#partHide")
    hid = page.evaluate("!window.__viewer.parts.find(p => p.name === 'Plyta_bazowa').mesh.visible")
    page.keyboard.press("Control+z")
    back = page.evaluate("window.__viewer.parts.find(p => p.name === 'Plyta_bazowa').mesh.visible")
    check("PC: „Ukryj” w panelu części + Ctrl+Z", hid and back)
    page.evaluate("document.querySelector('#treeBox').open = false")

    page.click("#btnShot")
    page.wait_for_function("document.getElementById('shotCount').textContent === '1'", timeout=20000)
    shot = save_last_shot(page, OUT / "zrzut_pc.jpg")
    check("zrzut ekranu PC 1920×1080", shot["w"] == 1920 and shot["h"] == 1080, f"{shot['w']}×{shot['h']} {shot['name']}")
    # tło #1d2026 = (29, 32, 38); JPG może przesunąć o kilka jednostek
    check("kolory zrzutu jak na ekranie (tło)", all(abs(a - b) <= 6 for a, b in zip(shot["px"], (29, 32, 38))), str(shot["px"]))

    # --- drzewo złożenia ---
    r = page.evaluate("""(() => { const V = window.__viewer;
        const rows = V.treeRows.map(r => r.name);
        document.querySelector('#tree .node:nth-child(3) span').click();     // wybór w drzewie
        const sel = V.selectedObj && V.selectedObj.name;
        document.getElementById('treeOnly').click();
        const vis = V.parts.filter(p => { for (let o = p.mesh; o; o = o.parent) if (!o.visible) return false; return true; }).map(p => p.name);
        document.getElementById('treeAll').click();
        const all = V.parts.every(p => p.mesh.visible);
        return { rows, sel, vis, all }; })()""")
    check("drzewo złożenia: grupy i części", len(r["rows"]) >= 5 and "Modul_chwytaka" in r["rows"], ", ".join(r["rows"]))
    check("drzewo: „Tylko wybrana” zostawia jedną część", len(r["vis"]) == 1 and r["vis"][0] == r["sel"], f"{r['sel']} → {r['vis']}")
    check("drzewo: „Pokaż wszystko”", r["all"])

    # --- przekrój: płaszczyzna X przez środek; promień w odciętą połowę płyty nie trafia ---
    r = page.evaluate("""(() => { const V = window.__viewer, T3 = V.THREE;
        V.cadRoot.updateMatrixWorld(true);
        const p = V.cadRoot.localToWorld(new T3.Vector3(-0.15, -0.10, 0.0075));
        const o = p.clone().add(new T3.Vector3(0, 0.5, 0)), d = new T3.Vector3(0, -1, 0);
        const before = V.pick(o, d);
        document.getElementById('sectionBox').open = true;
        document.getElementById('secX').click();
        const after = V.pick(o, d);
        const p2 = V.cadRoot.localToWorld(new T3.Vector3(0.15, -0.10, 0.0075));
        const keep = V.pick(p2.clone().add(new T3.Vector3(0, 0.5, 0)), d);
        return { before: before && before.object.name, after: after && after.object.name, keep: keep && keep.object.name, on: V.section.on, axis: V.section.axis }; })()""")
    check("przekrój X włączony z panelu", r["on"] and r["axis"] == "X", str(r))
    check("przekrój: odcięta połowa nie da się wskazać, druga tak",
          r["before"] == "Plyta_bazowa" and r["after"] is None and r["keep"] == "Plyta_bazowa", str(r))
    page.evaluate("(() => { const s = document.getElementById('secPos'); s.value = '40'; s.dispatchEvent(new Event('input')); })()")
    off = page.evaluate("window.__viewer.sectionOffset()")
    check("suwak przesuwa przekrój (+40% połowy szerokości 400 mm z zapasem 2%)", abs(off - 0.0816) < 0.001, f"{off * 1000:.1f} mm")
    time.sleep(0.3)
    page.screenshot(path=str(OUT / "screenshot_przekroj.png"))
    page.evaluate("document.getElementById('secOn').click(); document.getElementById('sectionBox').open = false")

    # --- komentarz na PC: przycisk, klik w model, tekst, zapis ---
    page.click("#btnNote")
    page.mouse.click(820, 660)
    time.sleep(0.2)
    box = page.is_visible("#noteBox")
    page.fill("#noteText", "Tu dodać czujnik indukcyjny")
    page.click("#noteSave")
    r = page.evaluate("(() => { const n = window.__viewer.notes; return { n: n.length, text: n[0] && n[0].text, part: n[0] && n[0].part && n[0].part.name }; })()")
    check("PC: komentarz przyczepiony do części", box and r["n"] == 1 and r["text"] == "Tu dodać czujnik indukcyjny" and r["part"] == "Plyta_bazowa", str(r))
    page.keyboard.press("Control+z")
    check("Ctrl+Z cofa komentarz", page.evaluate("window.__viewer.notes.length") == 0)

    # --- Google Drive (atrapa): połączenie, przeglądanie, otwarcie STEP, zrzut wysłany do <projekt>/vr/screeny ---
    page.evaluate("document.getElementById('settingsBox').open = true; document.getElementById('cloudBox').open = true")
    page.fill("#setClientId", "test-client.apps.googleusercontent.com")
    page.fill("#setGeminiKey", "AIza-test")
    page.click("#setSave")
    page.click("#cloudConnect")
    page.wait_for_function("window.__viewer.drive.connected && window.__viewer.browser.items.length > 0", timeout=10000)
    check("Google Drive: połączenie i lista folderów", page.inner_text("#cloudFiles").startswith("📁 Projekt_A"), page.inner_text("#cloudFiles"))
    page.click("#cloudFiles .f >> text=Projekt_A")
    page.wait_for_function("document.getElementById('cloudFiles').textContent.includes('cad')")
    page.click("#cloudFiles .f >> text=cad")
    page.wait_for_function("document.getElementById('cloudFiles').textContent.includes('test_zlozenie')")
    listing = page.inner_text("#cloudFiles")
    check("lista pokazuje STEP i SolidWorks, ukrywa inne pliki",
          "test_zlozenie.step" in listing and "SolidWorks" in listing and "notatki" not in listing, listing.replace("\n", " | "))
    page.click("#cloudFiles .f >> text=test_zlozenie.step")
    page.wait_for_function("document.getElementById('status').textContent.startsWith('Wczytano')", timeout=60000)
    proj = page.evaluate("window.__viewer.settings.project")
    check("plik z <projekt>/cad → folder projektu = Projekt_A", proj and proj["path"] == "Mój dysk/Projekt_A", str(proj))
    page.click("#btnShot")
    page.wait_for_function("document.getElementById('shotCount').textContent === '2'", timeout=20000)
    for _ in range(100):
        if len(gm.uploads) >= 2: break
        page.wait_for_timeout(100)
    paths = [x["path"] for x in gm.uploads]
    check("po połączeniu starszy zrzut dosłany sam (folder domyślny)", len(paths) >= 1 and paths[0].startswith("CAD VR Viewer/vr/screeny/zrzut_"), str(paths))
    check("nowy zrzut od razu w Projekt_A/vr/screeny", len(paths) == 2 and paths[1].startswith("Projekt_A/vr/screeny/zrzut_") and gm.uploads[1]["jpeg"], str(paths))
    page.wait_for_function("document.getElementById('cloudPending').textContent.includes('(0)')", timeout=10000)
    check("brak zaległych zrzutów", True)
    check("ostatnio otwierane: zapamiętany plik", page.evaluate("window.__viewer.recentList.map(r => r.name)") == ["test_zlozenie.step"])

    # --- dyktowanie (sztuczny mikrofon + atrapa Gemini) ---
    page.mouse.click(820, 660)
    page.click("#btnNote"); page.mouse.click(820, 660)
    page.click("#noteVoice"); time.sleep(1.2); page.click("#noteVoice")
    page.wait_for_function(f"document.getElementById('noteText').value.includes('{GEMINI_TEXT}')", timeout=10000)
    check("dyktowanie głosem przez Gemini", gm.gemini and gm.gemini[0]["key"] == "AIza-test" and gm.gemini[0]["mime"].startswith("audio/"),
          str(gm.gemini[:1]))
    page.click("#noteSave")
    check("komentarz z dyktowania zapisany", page.evaluate("window.__viewer.notes.length && window.__viewer.notes[0].text") == GEMINI_TEXT)

    page.evaluate("document.querySelector('#treeBox').open = true; document.querySelector('#shotsBox').open = true")
    page.screenshot(path=str(OUT / "screenshot.png"))
    page.close()
    ctx.close()
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
      const W = V.PAL.W, H = V.PAL.H;
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
    ctx.grant_permissions(["microphone"], origin=f"http://localhost:{PORT}")
    GoogleMock().install(ctx)
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

    # Wskaż + spust na części → strona części: półprzezroczysta, ukryj, cofanie (B)
    r = E("""V.paletteAction('tool:wskaz'); V.paletteAction('grab:czesc'); await T.frames(2);
             const p0 = T.centerOf('Slup');
             T.pose('right', [p0.x, p0.y + 0.3, p0.z + 0.05], p0.toArray()); await T.frames(4);
             await T.click('right', 'trigger');
             const page = V.pal.page, sel = V.selectedObj && V.selectedObj.name;
             const h1 = await T.palClick('cz:ghost');
             const op = T.part('Slup').material.opacity;
             await T.palClick('cz:hide');
             const hid = !T.part('Slup').visible;
             await T.click('right', 'b-button');
             const back = T.part('Slup').visible;
             await T.click('right', 'b-button');
             const op2 = T.part('Slup').material.opacity;
             await T.palClick('cz:back');
             return { page, sel, h1, op, hid, back, op2, page2: V.pal.page };""")
    check("Wskaż + spust na części otwiera stronę części", r["page"] == "czesc" and r["sel"] == "Slup", str(r))
    check("strona części: półprzezroczysta, ukryj, B cofa oba", abs(r["op"] - 0.3) < 1e-6 and r["hid"] and r["back"] and r["op2"] == 1 and r["page2"] == "narzedzia", str(r))
    r = E("""await T.palClick('page:drzewo');
             const i = V.treeRows.findIndex(x => x.name === 'Wspornik_L');
             const h = await T.palClick('tghost:' + i);
             const op = T.part('Wspornik_L').material.opacity;
             await T.palClick('tghost:' + i);
             const op2 = T.part('Wspornik_L').material.opacity;
             await T.palClick('page:narzedzia');
             return { h, op, op2 };""")
    check("drzewo w goglach: przycisk ◐ = półprzezroczysta", abs(r["op"] - 0.3) < 1e-6 and r["op2"] == 1, str(r))

    # trzymasz część: prawy spust = kopia w tym miejscu (dalej trzymasz oryginał), A = ukryj; B cofa
    shots0 = page.inner_text("#shotCount")
    r = E("""const p0 = T.centerOf('Slup'), n0 = V.parts.length;
             T.tipAt('right', p0.toArray()); await T.frames(4);
             T.btn('right', 'squeeze', 1); await T.frames(4);
             T.tipAt('right', [p0.x + 0.1, p0.y, p0.z]); await T.frames(4);
             await T.click('right', 'trigger');
             T.tipAt('right', [p0.x + 0.2, p0.y, p0.z]); await T.frames(4);
             const kop = V.parts.find(p => p.name === 'Slup (kopia)');
             const ck = kop ? new V.THREE.Box3().setFromObject(kop.mesh).getCenter(new V.THREE.Vector3()) : null;
             const cs = T.centerOf('Slup');
             const wDrzewie = V.treeRows.findIndex(x => x.name === 'Slup (kopia)') === V.treeRows.findIndex(x => x.name === 'Slup') + 1;
             await T.click('right', 'a-button');
             const hidden = !T.part('Slup').visible, held = !!T.ctrl('right').userData.held;
             T.btn('right', 'squeeze', 0); await T.frames(3);
             const n1 = V.parts.length - n0;
             for (let k = 0; k < 3; k++) await T.click('right', 'b-button');
             return { n1, dxKop: ck ? ck.x - p0.x : null, dxSlup: cs.x - p0.x, wDrzewie, hidden, held,
                      n2: V.parts.length - n0, vis: T.part('Slup').visible, dxPo: T.centerOf('Slup').x - p0.x };""")
    check("trzymana część + prawy spust = kopia w miejscu, oryginał dalej w ręce",
          r["n1"] == 1 and r["dxKop"] is not None and abs(r["dxKop"] - 0.1) < 0.005 and abs(r["dxSlup"] - 0.2) < 0.005 and r["wDrzewie"], str(r))
    check("trzymana część + A = ukryta (bez zrzutu ekranu)", r["hidden"] and not r["held"] and page.inner_text("#shotCount") == shots0, str(r))
    check("B ×3 cofa: ukrycie, przesunięcie, kopię", r["n2"] == 0 and r["vis"] and abs(r["dxPo"]) < 0.005, str(r))

    # --- zakładka Drzewo: pokaż/ukryj i wybór części promieniem ---
    r = E("""V.paletteAction('tool:wskaz'); V.paletteAction('grab:czesc'); await T.frames(2);
             const h1 = await T.palClick('page:drzewo');
             const i = V.treeRows.findIndex(r => r.name === 'Slup');
             const h2 = await T.palClick('tvis:' + i);
             const hidden = !T.part('Slup').visible;
             await T.palClick('tvis:' + i);
             await T.palClick('tsel:' + V.treeRows.findIndex(r => r.name === 'Wspornik_L'));
             return { h1, h2, page: V.pal.page, hidden, shown: T.part('Slup').visible, sel: V.selectedObj && V.selectedObj.name };""")
    check("zakładka Drzewo w goglach", r["page"] == "drzewo" and r["h1"] == "page:drzewo", str(r))
    check("drzewo w goglach: ukryj / pokaż część", r["hidden"] and r["shown"], str(r))
    check("drzewo w goglach: wybór części", r["sel"] == "Wspornik_L", str(r))

    # --- Menu → Ostatnie pliki → otwarcie modelu w goglach ---
    r = E("""await T.palClick('page:menu');
             const h = await T.palClick('menu:recent');
             const old = V.cadRoot;
             const n = V.recentList.length;
             await T.palClick('rec:0');
             for (let k = 0; k < 400 && V.cadRoot === old; k++) await new Promise(r => setTimeout(r, 50));
             await T.frames(3);
             return { h, n, reloaded: V.cadRoot !== old, parts: V.parts.length, page: V.pal.page };""")
    check("menu w goglach: ostatnie pliki → wczytanie modelu", r["reloaded"] and r["parts"] == 4 and r["page"] == "narzedzia", str(r))

    # --- Komentarz w goglach: spust na płycie, przeciągnięcie, klawiatura w panelu ---
    r = E("""await T.palClick('tool:komentarz');
             const a = T.cad(0.15, 0.10, 0.0075);
             T.pose('right', [a.x, a.y + 0.3, a.z], a.toArray()); await T.frames(4);
             T.btn('right', 'trigger', 1); await T.frames(4);
             T.pose('right', [a.x, a.y + 0.3, a.z], [a.x + 0.12, a.y + 0.15, a.z]); await T.frames(5);
             T.btn('right', 'trigger', 0); await T.frames(4);
             const page = V.pal.page, n = V.notes.length;
             const nt = V.notes[0];
             const drag = nt ? nt.pos.distanceTo(nt.anchor) : 0;
             for (const k of ['t', 'e', 's', 't', 'space', 'shift', 'ą']) await T.palClick('kb:' + k);
             const typed = V.edit && V.edit.text;
             await T.palClick('kb:done');
             return { page, n, drag, typed, text: nt && nt.text, part: nt && nt.part && nt.part.name, page2: V.pal.page, undo: V.undoStack.length };""")
    check("komentarz: spust na części otwiera klawiaturę", r["page"] == "klawiatura" and r["n"] == 1, str(r))
    check("komentarz: płytka przeciągnięta od punktu (strzałka)", r["drag"] > 0.05, f"{r['drag']:.3f} m (CAD)")
    check("klawiatura w goglach: „test Ą”", r["text"] == "test Ą" and r["part"] == "Plyta_bazowa" and r["page2"] == "narzedzia", str(r))

    # klik w płytkę = edycja, „Mów” (sztuczny mikrofon + atrapa Gemini)
    r = E("""V.settings.geminiKey = 'AIza-test';
             const nt = V.notes[0];
             const p = nt.plate.getWorldPosition(new V.THREE.Vector3());
             T.pose('right', [p.x + 0.05, p.y + 0.02, p.z + 0.3], p.toArray()); await T.frames(4);
             const hit = T.ctrl('right').userData.noteHit && T.ctrl('right').userData.noteHit.note.num;
             await T.click('right', 'trigger');
             const editing = V.edit && !V.edit.isNew && V.edit.note === nt;
             await T.palClick('kb:voice');
             await new Promise(r => setTimeout(r, 1200));
             await T.palClick('kb:voice');
             for (let k = 0; k < 200 && !(V.edit && V.edit.text.includes('luz')); k++) await new Promise(r => setTimeout(r, 50));
             await T.palClick('kb:done');
             return { hit, editing, text: nt.text };""")
    check("klik promieniem w płytkę = edycja komentarza", r["hit"] == 1 and r["editing"], str(r))
    check("„Mów” w goglach dopisuje podyktowany tekst", r["text"] == "test Ą " + GEMINI_TEXT, r["text"])

    # --- Przekrój: „nóż” w ręce (przyciąga do osi X), przyciski osi ---
    r = E("""await T.palClick('tool:przekroj');
             const c = T.centerOf('Plyta_bazowa');
             const tip = [c.x + 0.05, c.y + 0.1, c.z];
             T.tipAt('right', tip, [0, 0, -1]); await T.frames(3);
             T.btn('right', 'trigger', 1); await T.frames(4); T.btn('right', 'trigger', 0); await T.frames(3);
             V.cadRoot.updateMatrixWorld(true);
             const exp = V.cadRoot.worldToLocal(new V.THREE.Vector3(...tip)).x - V.cadBox.getCenter(new V.THREE.Vector3()).x;
             const res = { on: V.section.on, axis: V.section.axis, off: V.sectionOffset(), exp, vis: V.section.vis.visible };
             await T.palClick('sec:Z');
             res.axis2 = V.section.axis;
             return res;""")
    check("narzędzie Przekrój: płaszczyzna z kontrolera, przyciągnięta do osi X",
          r["on"] and r["axis"] == "X" and abs(r["off"] - r["exp"]) < 0.002 and r["vis"], str(r))
    check("przycisk osi Z w panelu", r["axis2"] == "Z", str(r))
    E("V.paletteAction('sec:X'); V.paletteAction('tool:wskaz'); await T.frames(2);")

    # widok z „gogli”: panel narzędzi i model
    E("""V.paletteAction('grab:czesc'); V.paletteAction('tool:rysuj');
         T.pose('left', [-0.12, 1.32, -0.35], [-0.12, 1.25, -0.9]); T.pose('right', [0.15, 1.3, -0.4], [-0.1, 1.35, -0.4]);
         await T.frames(8);""")
    page.screenshot(path=str(OUT / "screenshot_vr.png"))
    page.close()
    ctx.close()
    check("VR: brak błędów w konsoli", not errors, "; ".join(errors[:5]))

# ---------------------------------------------------------------------------
def test_xr_menu(browser):
    print("\n=== CZĘŚĆ 3: GOGLE BEZ MODELU — menu, plik z Google Drive, zrzut do chmury ===")
    errors = []
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.add_init_script(script=IWER_INIT + """
      localStorage.setItem('cad-vr-viewer-token', JSON.stringify({ token: 'tok-test', expires: Date.now() + 3600e3 }));
      localStorage.setItem('cad-vr-viewer-ustawienia', JSON.stringify({ clientId: 'test-client', autoUpload: true }));""")
    gm = GoogleMock(); gm.install(ctx)
    page = ctx.new_page()
    watch(page, errors)
    page.goto(f"http://localhost:{PORT}/test/index_local.html")
    page.wait_for_function("!document.getElementById('btnVR').disabled", timeout=10000)
    page.click("#btnVR")
    page.wait_for_function("window.__viewer.renderer.xr.isPresenting", timeout=20000)
    page.evaluate(HELPERS)
    page.wait_for_function("window.__viewer.controllers.filter(c => c.userData.inputSource).length === 2", timeout=10000)
    E = lambda js: page.evaluate(f"(async () => {{ const V = window.__viewer, T = window.T; {js} }})()")
    E("T.pose('left', [-0.25, 1.1, -0.25]); T.pose('right', [0.3, 1.1, -0.3]); await T.frames(5);")
    check("VR bez modelu: panel otwiera się na Menu", E("return V.pal.page === 'menu' && V.pal.mesh.visible;"))

    wait_items = "for (let k = 0; k < 200 && (V.browser.loading || !V.browser.items.length); k++) await new Promise(r => setTimeout(r, 50)); await T.frames(3);"
    r = E(f"""const h = await T.palClick('menu:drive'); {wait_items}
              const top = V.browser.items.map(i => i.name);
              await T.palClick('drvi:0'); {wait_items}
              await T.palClick('drvi:0'); {wait_items}
              const names = V.browser.items.map(i => i.name);
              const sw = names.indexOf('Rama.SLDASM');
              const swHover = await T.palClick('drvi:' + sw);
              return {{ h, top, names, swHover, path: V.browser.stack.map(s => s.name).join('/') }};""")
    check("menu → Google Drive: lista folderów w goglach", r["top"] == ["Projekt_A"] and r["path"] == "Mój dysk/Projekt_A/cad", str(r))
    check("plik SolidWorks wyszarzony (nie da się kliknąć)", r["swHover"] is None and "Rama.SLDASM" in r["names"], str(r))
    r = E("""const i = V.browser.items.findIndex(x => x.name === 'test_zlozenie.step');
             await T.palClick('drvi:' + i);
             for (let k = 0; k < 600 && !V.cadRoot; k++) await new Promise(r => setTimeout(r, 50));
             await T.frames(3);
             return { parts: V.parts.length, page: V.pal.page, proj: V.settings.project && V.settings.project.path };""")
    check("otwarcie STEP z Google Drive w goglach", r["parts"] == 4 and r["page"] == "narzedzia" and r["proj"] == "Mój dysk/Projekt_A", str(r))
    E("await T.click('right', 'a-button');")
    for _ in range(150):                 # page.wait_for_timeout: w tym czasie działają atrapy Google
        if gm.uploads: break
        page.wait_for_timeout(100)
    check("zrzut z gogli (A) od razu w Projekt_A/vr/screeny", len(gm.uploads) == 1 and gm.uploads[0]["path"].startswith("Projekt_A/vr/screeny/"), str(gm.uploads))
    E("V.paletteAction('page:menu'); await T.frames(3);")
    page.screenshot(path=str(OUT / "screenshot_vr_menu.png"))
    page.close()
    ctx.close()
    check("VR menu: brak błędów w konsoli", not errors, "; ".join(errors[:5]))

# ---------------------------------------------------------------------------
def test_szkicownik_browser(browser):
    print("\n=== CZĘŚĆ 4: SZKICOWNIK — wątek geometrii w przeglądarce (OpenCascade WASM z repozytorium) ===")
    errors = []
    page = browser.new_page(viewport={"width": 800, "height": 600})
    watch(page, errors)
    page.goto(f"http://localhost:{PORT}/test/index_local.html")
    r = page.evaluate("""async () => {
        const { SilnikGeometrii, BladGeometrii } = await import('/szkicownik/klient.js');
        const { Projekt } = await import('/szkicownik/projekt.js');
        const s = new SilnikGeometrii({ limity: { BOOLEAN_TIMEOUT_MS: 800 } });
        const p = new Projekt(s);
        let t0 = performance.now(); await s.start(); const startMs = performance.now() - t0;
        const b = await p.dodaj({ typ: 'prostopadloscian', dx: 100, dy: 50, dz: 20 });
        const c = await p.dodaj({ typ: 'walec', r: 10, h: 40 }, { poz: [20, 0, 0], obr: [90, 0, 0] });
        const d = await p.boolean(b.id, c.id, 'roznica');
        const step = await p.eksportSTEP({});
        const N = 600, pkt = [];
        for (let i = 0; i < N; i++) { const a = 2 * Math.PI * i / N, r = i % 2 ? 90 : 100; pkt.push([r * Math.cos(a), r * Math.sin(a)]); }
        const g = { typ: 'wyciagniecie', plaszczyzna: 'XY', obrys: pkt.map((q, i) => ({ typ: 'linia', a: q, b: pkt[(i + 1) % N] })), h: 50 };
        const g1 = await p.dodaj(g), g2 = await p.dodaj(g, { obr: [0, 0, 0.21], poz: [0, 0, 10] });
        let kod = null; t0 = performance.now();
        try { await p.boolean(g1.id, g2.id, 'suma'); } catch (e) { kod = e.kod; }
        const timeoutMs = performance.now() - t0;
        const stan = await s.wykonaj('stan');
        s.zakoncz();
        return { startMs, vol: d.objetosc, tris: d.def ? 1 : 0, stepLen: step.length, stepHead: new TextDecoder().decode(step.slice(0, 12)),
                 kod, timeoutMs, restarty: s.restarty, odtworzone: p.bryly.every((x) => stan.ids.includes(x.id)), n: p.bryly.length };
    }""")
    print(f"  start OpenCascade w przeglądarce: {r['startMs']:.0f} ms")
    check("szkicownik: geometria działa w wątku przeglądarki (różnica)", abs(r["vol"] - (100000 - 3.14159265 * 100 * 20)) < 0.1, f"{r['vol']:.2f} mm³")
    check("szkicownik: eksport STEP w przeglądarce", r["stepHead"] == "ISO-10303-21" and r["stepLen"] > 5000, f"{r['stepLen']} B")
    check("szkicownik: ciężki boolean przerwany w przeglądarce, stan odtworzony",
          r["kod"] == "TIMEOUT" and r["restarty"] == 1 and r["odtworzone"] and r["n"] == 3, f"{r['kod']} po {r['timeoutMs'] / 1000:.1f} s, brył {r['n']}")
    page.close()
    check("szkicownik: brak błędów w konsoli", not errors, "; ".join(errors[:5]))

# ---------------------------------------------------------------------------
# Szkicownik: pomocnicze funkcje w przeglądarce (PC i gogle)
SZ_HELPERS = """
window.SZ = (() => {
  const V = window.__viewer, THREE = V.THREE;
  const S = () => V.szkicownik;
  const frame = () => V.renderer.info.render.frame;
  const Z = {
    async frames(n = 3) { const f0 = frame(); while (frame() < f0 + n) await new Promise(r => setTimeout(r, 10)); },
    async czekaj() { await Z.frames(2); while (S().zajety) await new Promise(r => setTimeout(r, 30)); await Z.frames(3); },
    ekran(p) {                                   // punkt świata → piksele okna (PC)
      const v = p.clone().project(S().api.camera);
      return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
    },
    przycisk(id) { const p = S().panel.punktPrzycisku(id, THREE); return p ? Z.ekran(p) : null; },
    srodekBryly(id) {
      const w = S().wezly.get(id); const b = new THREE.Box3().setFromObject(w.holder);
      return b.getCenter(new THREE.Vector3());
    },
    ekranBryly(id) { return Z.ekran(Z.srodekBryly(id)); },
    bryla(nazwa) { return S().projekt.bryly.find(b => b.nazwa === nazwa); },
    // gogle: promień prawego kontrolera na przycisk panelu szkicownika i spust
    async klik(id) {
      const T = window.T;
      await Z.frames(2);
      const p = S().panel.punktPrzycisku(id, THREE);
      if (!p) return 'brak:' + id;
      const n = new THREE.Vector3(0, 0, 1).transformDirection(S().panel.mesh.matrixWorld);
      T.pose('right', p.clone().addScaledVector(n, 0.25).toArray(), p.toArray());
      await Z.frames(4);
      const hover = T.ctrl('right').userData.szk.hover;
      await T.click('right', 'trigger');
      return hover;
    },
  };
  return Z;
})();
"""

def test_szkicownik_pc(browser):
    print("\n=== CZĘŚĆ 5: SZKICOWNIK NA PC (mysz = promień, klawiatura) ===")
    errors = []
    page = browser.new_page(viewport={"width": 1280, "height": 800}, accept_downloads=True)
    watch(page, errors)
    page.goto(f"http://localhost:{PORT}/test/index_local.html?model=test_zlozenie.step")
    wait_loaded(page)
    page.select_option("#upAxis", "Z")
    page.click("#btnSzk")
    page.wait_for_function("window.__viewer.szkicownik && window.__viewer.szkicownik.stanSilnika === 'gotowy'", timeout=90000)
    page.evaluate(SZ_HELPERS)
    E = lambda js: page.evaluate(f"(async () => {{ const V = window.__viewer, S = V.szkicownik, SZ = window.SZ; {js} }})()")
    def klik(id):
        E("await SZ.frames(3);")
        xy = E(f"return SZ.przycisk('{id}');")
        page.mouse.click(xy[0], xy[1])
        E("await SZ.czekaj();")
    check("szkicownik: tryb włączony, panel na ekranie, model jako tło",
          E("return S.aktywny && S.panel.mesh.visible && V.parts[0].mesh.material.opacity < 0.5 && document.getElementById('btnSzk').textContent.includes('Wróć');"))

    # nowa bryła: narzędzie Prostopadłościan, przeciągnięcie myszą po płaszczyźnie (bez wpisywania wymiarów)
    def przeciagnij(dx, dy):
        st = E("await SZ.frames(2); return SZ.ekran(S.api.controls.target.clone());")
        page.mouse.move(st[0], st[1]); page.mouse.down()
        page.mouse.move(st[0] + dx, st[1] + dy, steps=10)
        E("await SZ.frames(3);")
        podglad = E("return { opis: S.tworzenie && S.tworzenie.ksztalt && S.tworzenie.ksztalt.opis, widac: !!(S.podglad && S.podglad.grupa.visible), et: S.etykieta.sprite.visible };")
        page.mouse.up()
        E("await SZ.czekaj();")
        return podglad
    klik("narz:prostopadloscian")
    pg = przeciagnij(-220, 90)
    E("while (!S.projekt || S.projekt.bryly.length < 1 || S.zajety) await new Promise(r => setTimeout(r, 30)); await SZ.frames(3);")
    r = E("const b = S.projekt.bryly[0]; return { def: b.def, vol: b.objetosc, poz: b.poz, np: !!S.numpad };")
    d = r["def"]
    check("szkicownik PC: rozciągnięcie myszą pokazuje podgląd z wymiarami", pg["widac"] and pg["opis"] and pg["et"], str(pg))
    check("szkicownik PC: prostopadłościan z przeciągnięcia (wymiary na siatce 10 mm, wysokość = krótszy bok)",
          all(d[k] >= 10 and abs(d[k] / 10 - round(d[k] / 10)) < 1e-9 for k in ("dx", "dy", "dz")) and d["dz"] == min(d["dx"], d["dy"])
          and abs(r["vol"] - d["dx"] * d["dy"] * d["dz"]) < 1e-3 and not r["np"], f"{d['dx']}×{d['dy']}×{d['dz']} mm")
    klik("narz:wybierz")

    # wybór kliknięciem w bryłę, przesuw strzałką, obrót klawiszem Q
    page.keyboard.press("Escape")
    E("await SZ.frames(3);")
    xy = E("return SZ.ekranBryly(S.projekt.bryly[0].id);")
    page.mouse.click(xy[0], xy[1])
    E("await SZ.frames(3);")
    sel = E("return S.zazn.join() === S.projekt.bryly[0].id && !!S.pc.tc.object;")
    p0 = E("return S.projekt.bryly[0].poz;")
    page.keyboard.press("ArrowRight")
    page.keyboard.press("q")
    r = E("const b = S.projekt.bryly[0]; return { poz: b.poz, obr: b.obr };")
    check("szkicownik PC: klik w bryłę = wybór (uchwyty przypięte)", sel)
    check("szkicownik PC: strzałka = +10 mm, Q = obrót 15° wokół osi góry (Z)", abs(r["poz"][0] - p0[0] - 10) < 1e-9 and abs(r["obr"][2] - 15) < 1e-6, f"{r}")

    # pole położenia w zakładce Edycja
    klik("tab:edycja")
    klik("poz:0")
    for k in ["1", "2", "3", "Enter"]:
        page.keyboard.press(k)
    E("await SZ.frames(3);")
    check("szkicownik PC: położenie X wpisane liczbą = 123 mm", E("return S.projekt.bryly[0].poz[0];") == 123)

    # kopia (Ctrl+D), walec, różnica przez wskazanie bryły B na liście
    page.keyboard.press("Control+d")
    E("await SZ.czekaj();")
    r = E("return { n: S.projekt.bryly.length, x: S.projekt.bryly[1].poz[0], nazwa: S.projekt.bryly[1].nazwa };")
    check("szkicownik PC: Ctrl+D kopiuje bryłę obok (+50 mm)", r["n"] == 2 and r["x"] == 173 and "kopia" in r["nazwa"], str(r))
    klik("tab:bryly")
    klik("narz:walec")
    przeciagnij(70, 0)
    klik("narz:wybierz")
    E("while (S.projekt.bryly.length < 3 || S.zajety) await new Promise(r => setTimeout(r, 30)); await SZ.frames(3);")
    w = E("const b = S.projekt.bryly[2]; return { obr: b.obr, id: b.id };")
    check("szkicownik PC: walec stoi pionowo w pliku z osią Z w górę", w["obr"] == [90, 0, 0], str(w["obr"]))
    E("S.projekt.ustawTransformacje(S.projekt.bryly[2].id, { poz: [...S.projekt.bryly[0].poz] }); await SZ.frames(2);")
    a_id = E("return S.projekt.bryly[0].id;")
    vA = E("return S.projekt.bryly[0].objetosc;")
    klik(f"sel:{a_id}")
    klik("tab:edycja")
    klik("op:roznica")
    czeka = E("return !!S.oczekujeB;")
    klik("tab:bryly")
    klik(f"sel:{w['id']}")
    E("await SZ.czekaj();")
    r = E("return { n: S.projekt.bryly.length, typ: S.projekt.bryly[0].def.typ, vol: S.projekt.bryly[0].objetosc, wyn: S.zazn.join() === S.projekt.bryly[0].id };")
    check("szkicownik PC: różnica (A z listy, „Różnica”, B z listy)", czeka and r["n"] == 2 and r["typ"] == "boolean" and 0 < r["vol"] < vA - 1000 and r["wyn"],
          f"{r['vol']:.0f} < {vA:.0f} mm³")

    # przejęcie oryginału, grupa, przesuw grupy
    klik("oryginal")
    r = E("return { n: S.projekt.bryly.length, ukryte: V.parts.filter(p => !p.mesh.visible).length, nazwy: S.projekt.bryly.filter(b => b.zrodlo === 'oryginal').map(b => b.nazwa).join(',') };")
    check("szkicownik PC: „Przejmij oryginał” — 4 części z nazwami, tło ukryte", r["n"] == 6 and r["ukryte"] == 4, f"{r['nazwy']}")
    page.keyboard.press("Escape")             # nic nie zaznaczone przed zaznaczaniem wielu
    klik("wiele")
    ids = E("return ['Slup', 'Wspornik_L'].map(n => SZ.bryla(n).id);")
    for i in ids:
        klik(f"sel:{i}")
    klik("grupuj")
    klik("wiele")
    page.keyboard.press("Escape")
    klik(f"sel:{ids[0]}")
    px = E("return [SZ.bryla('Slup').poz[0], SZ.bryla('Wspornik_L').poz[0]];")
    page.keyboard.press("Shift+ArrowRight")
    r = E("return { g: S.projekt.grupy.length, zazn: S.zazn.length, x: [SZ.bryla('Slup').poz[0], SZ.bryla('Wspornik_L').poz[0]] };")
    check("szkicownik PC: grupa z dwóch części, klik zaznacza całą grupę", r["g"] == 1 and r["zazn"] == 2, str(r))
    check("szkicownik PC: Shift+strzałka przesuwa grupę o 100 mm", abs(r["x"][0] - px[0] - 100) < 1e-6 and abs(r["x"][1] - px[1] - 100) < 1e-6, f"{px} → {r['x']}")

    # eksport STEP: prawdziwe pobranie pliku
    klik("tab:plik")
    pobrane = {}
    for zakres in ["oryginal", "wszystko"]:
        with page.expect_download(timeout=30000) as d:
            klik(f"eksport:{zakres}")
        path = OUT / f"szkicownik_pc_{zakres}.step"
        d.value.save_as(str(path))
        pobrane[zakres] = path.read_bytes()
    t_or, t_all = pobrane["oryginal"].decode("latin-1"), pobrane["wszystko"].decode("latin-1")
    check("szkicownik PC: eksport „Oryginał” pobrany (STEP, części + grupa)", t_or.startswith("ISO-10303-21") and "'Slup'" in t_or and "'Grupa 1'" in t_or and "kopia" not in t_or,
          f"{len(pobrane['oryginal'])} B")
    check("szkicownik PC: eksport „Wszystko” zawiera nowe bryły", "kopia" in t_all and "'Plyta_bazowa'" in t_all and "'Szkicownik'" in t_all, f"{len(pobrane['wszystko'])} B")

    page.screenshot(path=str(OUT / "screenshot_szk_pc.png"))
    klik("wroc")
    r = E("""await SZ.frames(3);
             return { akt: S.aktywny, op: V.parts.every(p => p.mesh.material.opacity === 1), vis: V.parts.every(p => p.mesh.visible),
                      nowe: [...S.wezly.entries()].filter(([id, w]) => w.holder.visible).length, panel: !!S.panel.mesh.parent };""")
    check("szkicownik PC: „Wróć do podglądu” przywraca model, nowe bryły zostają widoczne",
          not r["akt"] and r["op"] and r["vis"] and r["nowe"] == 2 and not r["panel"], str(r))
    page.mouse.click(820, 660)
    check("po powrocie: klik w model znów wybiera część (viewer działa)", page.is_visible("#picked"))
    page.close()
    check("szkicownik PC: brak błędów w konsoli", not errors, "; ".join(errors[:5]))


def test_szkicownik_vr(browser):
    print("\n=== CZĘŚĆ 6: SZKICOWNIK W GOGLACH (emulator Meta Quest 3) ===")
    errors = []
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
    ctx.add_init_script(script=IWER_INIT)
    page = ctx.new_page()
    watch(page, errors)
    page.goto(f"http://localhost:{PORT}/test/index_local.html?model=test_zlozenie.step")
    wait_loaded(page)
    page.select_option("#upAxis", "Z")
    page.click("#btnVR")
    page.wait_for_function("window.__viewer.renderer.xr.isPresenting", timeout=20000)
    page.evaluate(HELPERS)
    page.evaluate(SZ_HELPERS)
    page.wait_for_function("window.__viewer.controllers.filter(c => c.userData.inputSource).length === 2", timeout=10000)
    E = lambda js: page.evaluate(f"(async () => {{ const V = window.__viewer, T = window.T, SZ = window.SZ; const S = V.szkicownik; {js} }})()")
    E("T.pose('left', [-0.25, 1.1, -0.25]); T.pose('right', [0.3, 1.1, -0.3]); await T.frames(5);")
    E("await T.palClick('page:menu'); await T.frames(3);")
    h = E("return await T.palClick('tryb:szkicownik');")
    page.wait_for_function("window.__viewer.szkicownik && window.__viewer.szkicownik.stanSilnika === 'gotowy'", timeout=90000)
    E("await SZ.frames(5);")
    check("szkicownik VR: wejście z Menu, panel szkicownika na lewym kontrolerze",
          E("return S.aktywny && S.panel.mesh.visible && S.panel.mesh.parent === T.ctrl('left') && !V.pal.mesh.visible;"), f"hover={h}")

    # nowa bryła rozciąganiem: spust w punkcie A, przeciągnięcie czubkiem kontrolera do B, puszczenie
    r = E("""const h = await SZ.klik('narz:prostopadloscian');
             const A = [0.05, 1.35, -0.6];
             T.tipAt('right', A); await T.frames(4);
             const czubek = S.znaczniki.some(z => z.visible && z.userData.kolor.getHex() === 0x00c7be);
             T.btn('right', 'trigger', 1); await T.frames(3);
             T.tipAt('right', [A[0] + 0.15, A[1] + 0.10, A[2] - 0.06]); await T.frames(5);
             const opis = S.tworzenie && S.tworzenie.ksztalt && S.tworzenie.ksztalt.opis;
             T.btn('right', 'trigger', 0); await T.frames(3);
             while (S.projekt.bryly.length < 1 || S.zajety) await new Promise(r => setTimeout(r, 30));
             await SZ.klik('narz:wybierz');
             const b = S.projekt.bryly[0];
             return { h, czubek, opis, def: b.def, skala: V.pivot.scale.x };""")
    d = r["def"]
    oczek = [150 / r["skala"], 60 / r["skala"], 100 / r["skala"]]
    check("szkicownik VR: punkt na czubku kontrolera przy narzędziu bryły", r["czubek"] and r["h"] == "narz:prostopadloscian", str(r["h"]))
    check("szkicownik VR: prostopadłościan rozciągnięty ręką (wymiary z ruchu, na siatce)",
          r["opis"] and all(abs(d[k] / 10 - round(d[k] / 10)) < 1e-9 for k in ("dx", "dy", "dz"))
          and all(abs(d[k] - o) <= 10.001 for k, o in zip(("dx", "dy", "dz"), oczek)), f"{d['dx']}×{d['dy']}×{d['dz']} mm (ruch ≈ {[round(v) for v in oczek]}), podgląd: {r['opis']}")

    # grip na bryle: przesuw ręką o 10 cm, snap 10 mm
    r = E("""const id = S.projekt.bryly[0].id;
             const c = SZ.srodekBryly(id), p0 = [...S.projekt.bryly[0].poz];
             T.pose('right', [c.x + 0.05, c.y + 0.25, c.z + 0.25], c.toArray()); await T.frames(4);
             const traf = T.ctrl('right').userData.szk.traf && T.ctrl('right').userData.szk.traf.id;
             const zolty = S.znaczniki.some(z => z.visible && z.userData.kolor.getHex() === 0xffd60a);
             T.btn('right', 'squeeze', 1); await T.frames(4);
             const zielony = S.znaczniki.some(z => z.visible && z.userData.kolor.getHex() === 0x34c759);
             T.pose('right', [c.x + 0.15, c.y + 0.25, c.z + 0.25], [c.x + 0.1, c.y, c.z]); await T.frames(5);
             const pd = S.projekt.bryly[0].poz.map((v, i) => v - p0[i]);
             T.btn('right', 'squeeze', 0); await T.frames(3);
             return { traf: traf === id, pd, skala: V.pivot.scale.x, zolty, zielony };""")
    oczek = 100 / r["skala"]
    check("szkicownik VR: grip chwyta bryłę pod promieniem", r["traf"])
    check("szkicownik VR: wyraźny punkt na bryle (żółty pod promieniem, zielony w chwycie)", r["zolty"] and r["zielony"], str(r))
    check("szkicownik VR: przesuw ręką 10 cm → bryła na siatce 10 mm", all(abs(v / 10 - round(v / 10)) < 1e-6 for v in r["pd"]) and abs(r["pd"][0] - oczek) <= 5.001,
          f"Δ {[round(v, 2) for v in r['pd']]} mm (bez snapu {oczek:.1f})")

    # dwie ręce: skala 2×
    r = E("""const id = S.projekt.bryly[0].id;
             const c = SZ.srodekBryly(id);
             T.pose('right', [c.x + 0.05, c.y + 0.25, c.z + 0.25], c.toArray()); await T.frames(3);
             T.btn('right', 'squeeze', 1); await T.frames(3);
             T.pose('left', [c.x - 0.15, c.y + 0.25, c.z + 0.25]); await T.frames(3);
             T.btn('left', 'squeeze', 1); await T.frames(4);
             const two = !!S.dwieRece;
             const rp = T.ctrl('right').getWorldPosition(new V.THREE.Vector3()), lp = T.ctrl('left').getWorldPosition(new V.THREE.Vector3());
             T.pose('left', rp.clone().addScaledVector(lp.clone().sub(rp), 2).toArray()); await T.frames(5);
             const s = S.projekt.bryly[0].skala;
             T.btn('left', 'squeeze', 0); T.btn('right', 'squeeze', 0); await T.frames(4);
             T.pose('left', [-0.25, 1.1, -0.25]); await T.frames(3);
             return { two, s };""")
    check("szkicownik VR: dwa gripy = skala bryły 2× (snap 0,05)", r["two"] and abs(r["s"] - 2) < 1e-9, f"×{r['s']}")

    # kula + różnica (A i B z listy), kopia
    E("""await SZ.klik('narz:kula');
         T.tipAt('right', [0.3, 1.4, -0.5]); await T.frames(3); T.btn('right', 'trigger', 1); await T.frames(3);
         T.tipAt('right', [0.36, 1.4, -0.5]); await T.frames(4); T.btn('right', 'trigger', 0); await T.frames(3);
         while (S.projekt.bryly.length < 2 || S.zajety) await new Promise(r => setTimeout(r, 30));
         await SZ.klik('narz:wybierz');""")
    ids = E("return S.projekt.bryly.map(b => b.id);")
    vA = E("return S.projekt.bryly[0].objetosc * S.projekt.bryly[0].skala ** 3;")
    E("S.projekt.ustawTransformacje(S.projekt.bryly[1].id, { poz: [...S.projekt.bryly[0].poz] }); await SZ.frames(2);")
    for k in [f"sel:{ids[0]}", "tab:edycja", "op:roznica", "tab:bryly", f"sel:{ids[1]}"]:
        E(f"await SZ.klik('{k}');")
    E("await SZ.czekaj();")
    r = E("return { n: S.projekt.bryly.length, typ: S.projekt.bryly[0].def.typ, vol: S.projekt.bryly[0].objetosc };")
    check("szkicownik VR: różnica prostopadłościan − kula", r["n"] == 1 and r["typ"] == "boolean" and 0 < r["vol"] < vA - 1000, f"{r['vol']:.0f} < {vA:.0f} mm³")
    E("await SZ.klik('kopiuj'); await SZ.czekaj();")
    check("szkicownik VR: kopia z panelu", E("return S.projekt.bryly.length;") == 2)

    # trzymasz bryłę: prawy spust = kopia zostaje w miejscu, A = usuwa trzymaną
    r = E("""const b = S.projekt.bryly[0], id = b.id, n0 = S.projekt.bryly.length;
             const c = SZ.srodekBryly(id);
             T.pose('right', [c.x + 0.05, c.y + 0.25, c.z + 0.25], c.toArray()); await T.frames(4);
             T.btn('right', 'squeeze', 1); await T.frames(4);
             T.pose('right', [c.x + 0.10, c.y + 0.25, c.z + 0.25], [c.x + 0.05, c.y, c.z]); await T.frames(4);
             const pozKopii = [...b.poz];
             await T.click('right', 'trigger'); await SZ.czekaj();
             T.pose('right', [c.x + 0.20, c.y + 0.25, c.z + 0.25], [c.x + 0.15, c.y, c.z]); await T.frames(4);
             const kop = S.projekt.bryly.find(x => x.nazwa === b.nazwa + ' (kopia)' && x.id !== id && Math.abs(x.poz[0] - pozKopii[0]) < 1e-6);
             const n1 = S.projekt.bryly.length;
             const dalej = S.projekt.bryla(id).poz[0] - pozKopii[0];
             const shots0 = document.getElementById('shotCount').textContent;
             await T.click('right', 'a-button'); await SZ.czekaj();
             T.btn('right', 'squeeze', 0); await T.frames(3);
             return { n0, n1, kop: !!kop, dalej, usunieta: !S.projekt.bryla(id), n2: S.projekt.bryly.length,
                      bezZrzutu: document.getElementById('shotCount').textContent === shots0 };""")
    check("szkicownik VR: trzymana bryła + prawy spust = kopia zostaje w miejscu", r["n1"] == r["n0"] + 1 and r["kop"] and r["dalej"] > 1, str(r))
    check("szkicownik VR: trzymana bryła + A = usunięta (bez zrzutu)", r["usunieta"] and r["n2"] == r["n0"] and r["bezZrzutu"], str(r))

    # spust w pustym miejscu = odznacz, B = komunikat o cofaniu
    E("T.pose('right', [0.6, 1.6, 0.3], [1.5, 2.5, 0.5]); await T.frames(3); await T.click('right', 'trigger'); await T.click('right', 'b-button');")
    check("szkicownik VR: spust w pustym miejscu odznacza", E("return S.zazn.length;") == 0)

    # eksport z gogli (pobranie)
    E("await SZ.klik('tab:plik');")
    with page.expect_download(timeout=30000) as d:
        E("await SZ.klik('eksport:wszystko'); await SZ.czekaj();")
    path = OUT / "szkicownik_vr_wszystko.step"
    d.value.save_as(str(path))
    check("szkicownik VR: eksport STEP z gogli", path.read_bytes().startswith(b"ISO-10303-21"), f"{path.stat().st_size} B")
    E("await SZ.klik('tab:bryly'); T.pose('left', [-0.12, 1.32, -0.35], [-0.12, 1.25, -0.9]); T.pose('right', [0.15, 1.3, -0.4], [-0.1, 1.35, -0.4]); await T.frames(8);")
    page.screenshot(path=str(OUT / "screenshot_szk_vr.png"))

    # powrót do podglądu
    E("T.pose('left', [-0.25, 1.1, -0.25]); await T.frames(3); await SZ.klik('tab:plik'); await SZ.klik('wroc'); await T.frames(5);")
    r = E("return { akt: S.aktywny, pal: V.pal.mesh.visible, op: V.parts.every(p => p.mesh.material.opacity === 1) };")
    check("szkicownik VR: „Wróć do podglądu” — panel viewera wraca", not r["akt"] and r["pal"] and r["op"], str(r))
    hv = E("await T.palClick('page:narzedzia'); return await T.palClick('tool:miarka');")
    check("po powrocie: panel viewera działa (klik w narzędzie)", E("return V.S.tool;") == "miarka", f"hover={hv}")
    page.close()
    ctx.close()
    check("szkicownik VR: brak błędów w konsoli", not errors, "; ".join(errors[:5]))

# ---------------------------------------------------------------------------
server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=CHROME_ARGS)
        for t in (test_pc, test_xr, test_xr_menu, test_szkicownik_browser, test_szkicownik_pc, test_szkicownik_vr):
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
