# CAD VR Viewer — kontekst projektu

## Kto i po co
Robert, inżynier mechanik / automatyk (PLC, konstrukcja maszyn), NIE jest programistą. Pracuje z Claude Code metodą „vibecoding”.
Komunikacja po polsku. Preferencje: kompletny działający kod (nie fragmenty), stałe konfiguracyjne na górze pliku,
wyjaśnienia krok po kroku, odpowiedzi bezpośrednie i technicznie precyzyjne. Instrukcje dla niego pisz prostym językiem, bez żargonu programistycznego.

## Cel
Program do oglądania modeli CAD z SolidWorksa (przez STEP) w goglach Meta Quest 3S (WebXR, przeglądarka Quest):
- przekroje, chwytanie pojedynczych części, strzałki i komentarze,
- rysowanie w 3D (zmienna grubość i kolor), zrzuty ekranu przyciskiem na kontrolerze lub komendą głosową, zapis do folderu w chmurze,
- docelowo (osobny program B, na PC): asystent głosowy (Gemini Live API) znający kontekst projektu, który dostaje od viewera informację
  „wskazuję część X” + screeny; komunikacja viewer ↔ program B przez WebSocket w sieci lokalnej.
- docelowo połączenie z jego systemem zarządzania projektami (budowany w osobnym czacie). Konwencja folderu projektu:
  `projekt/kontekst.md`, `projekt/cad/*.step`, `projekt/vr/screeny/`, `projekt/vr/adnotacje.json`.

## Decyzje architektoniczne (już podjęte)
- WebXR + three.js w jednym pliku `index.html` (bez bundlera), hostowany na GitHub Pages (HTTPS wymagany przez WebXR). Kod w repo publicznym, pliki STEP klientów NIGDY do repo.
- Parsowanie STEP: `occt-import-js` 0.0.23 (OpenCascade WASM), w Web Workerze z Blob URL. Biblioteki z CDN jsdelivr (importmap): three@0.187.0, three-mesh-bvh@0.9.16 (BVH na każdej geometrii: szybki raycast + test sfery chwytu; BVH zachowuje grupy kolorów).
- Jednostki: import w metrach (`linearUnit: 'meter'`). Drzewo złożenia i nazwy części zachowane (`result.root`), kolory z `meshes[].color` i `brep_faces[].color` (grupy geometrii). Geometria z OCCT jest już w układzie globalnym (macierze części = jednostkowe; `userData.origMatrix` do resetu).
- Struktura sceny: `pivot` (przesuwa/skaluje użytkownik) → `offsetGroup` (centruje) → `cadRoot` (obrót osi góry: SolidWorks Y-up, opcja Z-up w panelu) → części + `annoRoot` (rysunki i miary w układzie CAD, metry → gotowe pod `adnotacje.json`).
- Sterowanie Quest (wzór: Gravity Sketch), ręka główna = `CONFIG.DOMINANT_HAND` (prawa):
  spust = narzędzie (wskaz/rysuj/gumka/miarka/kolor), grip przy części = chwyt części (tryb „czesc”, zasięg `PART_GRAB_RADIUS`) lub grupy w sferze (tryb „grupa”, promień S.sphere), grip w pustym miejscu = cały model, dwa gripy = obrót+skala trzymanego (część albo model),
  A = zrzut, B = cofnij, X = panel narzędzi, Y = reset modelu, prawa gałka = grubość pędzla/gumki lub skala modelu, lewa gałka = sfera.
  Panel narzędzi = płótno 2D (CanvasTexture) na lewym kontrolerze (`PALETTE_ATTACH: 'hand'`, opcja 'world'), klik promieniem drugiej ręki + spust. Położenie panelu: `PALETTE_POS`, `PALETTE_TILT_DEG` — do dostrojenia po teście na goglach.
- Zrzut ekranu: render do WebGLRenderTarget z `texture.colorSpace = SRGBColorSpace` (sprzętowe sRGB = kolory jak na ekranie), na czas renderu `renderer.xr.enabled = false`, potem przywrócenie render targetu XR. Zapis JPG 1920×1080 w IndexedDB (`cad-vr-viewer`/`zrzuty`), pobieranie z panelu PC. Chmura: NIE ustalona.
- Cofanie: `undoStack` (add/remove/move/color), bez „ponów”.
- Wszystkie stałe w obiekcie `CONFIG` na górze skryptu.

## Stan (v0.2) — PRZETESTOWANE AUTOMATYCZNIE (headless Chrome + emulator Meta Quest 3 IWER)
v0.1: wczytanie STEP, drzewo części, kolory, kliknięcie myszą w część, wymiary.
v0.2: panel narzędzi, rysowanie (rurka, grubość od nacisku spustu), gumka, miarka (punkty na powierzchni przez raycast, wynik w mm CAD), malowanie części (VR + PC), chwyt części / grupy w sferze / modelu, dwie ręce = skala+obrót, zrzut (A i przycisk PC), cofnij (B, Ctrl+Z), reset części/kolorów.
Test `test/run_headless.py`: 28 sprawdzeń, w tym numery przycisków A/B/X/Y w emulatorze (zgodne z xr-standard: 4 = A/X, 5 = B/Y).
NIE PRZETESTOWANE na prawdziwych goglach. Test na Quest robi Robert i raportuje.
Znane ryzyka: duże złożenia (parsowanie na Quest może trwać ~minutę → w razie potrzeby przenieść konwersję STEP→GLB na PC),
wydajność renderu na Quest 3S (może wymagać uproszczenia siatki/LOD), wygoda położenia panelu na kontrolerze, zrzut w AR nie zawiera obrazu z kamer (ograniczenie WebXR, tło = kolor).

## Plan dalej
- v0.2 reszta: strzałki, komentarze, zapis zrzutów do chmury (Robert wybiera: Google Drive / OneDrive / Dropbox — jeszcze nie ustalone; zapytać), zapis/odczyt `adnotacje.json`.
- v0.3: przekrój (clipping plane + zamknięcie przekroju). (Chwytanie pojedynczych części — zrobione w v0.2.)
- v0.4: program B (Python, PC): mikrofon → Gemini Live API (limity: audio ~15 min, audio+wideo ~2 min, 1 klatka/s; użyć kompresji kontekstu i wznawiania sesji; sprawdzić aktualną dokumentację), komunikacja WebSocket z viewerem.
- v0.5: integracja z systemem zarządzania projektami.

## Repozytorium
- GitHub (publiczne): https://github.com/tevenenrk/VR-CAD-viewer (gałąź `main`, wysyłka przez HTTPS, logowanie Git Credential Manager).
- GitHub Pages: https://tevenenrk.github.io/VR-CAD-viewer/ (z gałęzi `main`, folder główny; `.nojekyll` wyłącza Jekyll).
- Autor commitów ustawiony lokalnie w repo na adres noreply GitHuba (nie publikować prywatnego e-maila).
- `.gitignore` blokuje *.step/*.stp/*.iges/*.sldprt/*.glb i foldery `projekt/` — wyjątek tylko `test/test_zlozenie.step`.

## Pliki
- `index.html` — cały viewer.
- `test/test_zlozenie.step` — małe złożenie testowe (użyć z ustawieniem „Góra: Z”). Generator: `test/make_test_step.py` (CadQuery).
- `test/run_headless.py` — automatyczny test w headless Chrome przez Playwright (sam znajduje Chrome na Windowsie lub Linuksie, lista `CHROME_PATHS`). Część 1: PC. Część 2: emulator Meta Quest 3 (IWER, `installRuntime({forceInstall: true})`, `stereoEnabled = false`) — steruje kontrolerami (`T.pose`, `T.tipAt`, `T.btn`, `T.palClick`) i sprawdza wszystkie narzędzia. Wymaga `pip install playwright` i `npm install --no-save three@0.187.0 occt-import-js@0.0.23 three-mesh-bvh@0.9.16 iwer@2.6.0` w folderze projektu. Uruchamiać z folderu projektu: `python test/run_headless.py` (kod wyjścia 1 = błąd). Wyniki obrazowe: `test/screenshot.png`, `test/screenshot_vr.png`, `test/zrzut_pc.jpg`, `test/zrzut_vr.jpg` (w .gitignore). Na PC Roberta (Windows) zainstalowane i działa.

## Zasady pracy
- Zawsze testuj zmiany w headless Chrome przed oddaniem; sprawdzaj konsolę pod kątem błędów.
- Po każdej zmianie podaj Robertowi krótką instrukcję testu w goglach, krok po kroku.
- Nie obiecuj, że coś działa w VR, jeśli nie zostało sprawdzone na goglach.
- Przy sztywnych decyzjach (wybór chmury, format zapisu) pytaj, nie zgaduj.
