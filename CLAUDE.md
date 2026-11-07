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
- Zrzut ekranu: render do WebGLRenderTarget z `texture.colorSpace = SRGBColorSpace` (sprzętowe sRGB = kolory jak na ekranie), na czas renderu `renderer.xr.enabled = false`, potem przywrócenie render targetu XR. Zapis JPG 1920×1080 w IndexedDB (`cad-vr-viewer` v2: magazyny `zrzuty` i `modele`), pobieranie z panelu PC.
- Chmura = **Google Drive** (wybór Roberta, v0.3; inne dyski ewentualnie później). Logowanie: Google Identity Services, token client (bez serwera), zakres `drive` (pełny, bo trzeba czytać foldery wrzucone ręcznie i pisać do `projekt/vr/screeny`), aplikacja w trybie „Testowanie” w Google Cloud Robert-a. Token 1 h w localStorage; po wygaśnięciu zrzuty czekają (`rec.cloud` = '' / 'ok' / 'error'). Client ID Roberta wpisany w `CONFIG.GOOGLE_CLIENT_ID` (źródło JS: https://tevenenrk.github.io), panel Ustawienia może go nadpisać (localStorage `cad-vr-viewer-ustawienia`). Drive REST v3 przez fetch. Zrzuty → `<folder projektu>/vr/screeny`, bez projektu → `Mój dysk/CAD VR Viewer/vr/screeny`. Plik otwarty z `X/cad/` → folder projektu = `X`.
- Głos: Quest Browser nie ma SpeechRecognition → dyktowanie przez Gemini `generateContent` (MediaRecorder audio/webm → inline_data), klucz Roberta tylko w localStorage, model `CONFIG.GEMINI_MODEL` (`gemini-flash-latest`). Fallback: Web Speech API (Chrome PC).
- Przekrój: `material.clippingPlanes` (wspólna płaszczyzna `section.world`, wyłączony = stała 1e9, bez rekompilacji shaderów), zamknięcie przekroju = tylne ściany malowane płaskim kolorem (`onBeforeCompile`, `gl_FrontFacing`) — wymaga zamkniętych brył o poprawnej orientacji (OCCT daje). Płaszczyzna zapisana w układzie CAD (`section.local`). Raycast pomija trafienia po odciętej stronie.
- Komentarze: klasa `Note` w `annoRoot` (kotwica + pozycja płytki w metrach CAD, `toJSON()` pod `adnotacje.json`), płytka = CanvasTexture zwrócona do oczu, stała wielkość w świecie. Edycja: `edit` (wspólne PC/gogle), klawiatura na płótnie panelu, klawiatura systemowa Quest (`session.isSystemKeyboardSupported`, fokus na ukrytym `<input id="xrKb">`).
- Panel w goglach: zakładki `pal.page` = narzedzia / drzewo / menu (+ klawiatura), układ liczony co klatkę w `layoutPalette()`, rysowany tylko po zmianie sygnatury. Przyciski wymagające gestu (`GESTURE_IDS`: VR/AR/wyjście, mikrofon, klawiatura systemowa) obsługiwane w zdarzeniu `selectstart`.
- Cofanie: `undoStack` (add/remove/move/color), bez „ponów”.
- Wszystkie stałe w obiekcie `CONFIG` na górze skryptu.

## Stan (v0.3) — PRZETESTOWANE AUTOMATYCZNIE (headless Chrome + emulator Meta Quest 3 IWER)
v0.1: wczytanie STEP, drzewo części, kolory, kliknięcie myszą w część, wymiary.
v0.2: panel narzędzi, rysowanie (rurka, grubość od nacisku spustu), gumka, miarka (punkty na powierzchni przez raycast, wynik w mm CAD), malowanie części (VR + PC), chwyt części / grupy w sferze / modelu, dwie ręce = skala+obrót, zrzut (A i przycisk PC), cofnij (B, Ctrl+Z), reset części/kolorów.
v0.3: drzewo złożenia w goglach, przekrój, komentarze (płytka + strzałka, klawiatura w panelu, klawiatura Quest, dyktowanie Gemini), menu główne w goglach (plik z Drive / ostatnie, oś, siatka, VR↔AR, wyjście), Google Drive (otwieranie STEP, automatyczny upload zrzutów), ostatnio otwierane pliki (IndexedDB), wejście w VR bez modelu.
Test `test/run_headless.py`: 95 sprawdzeń w 6 częściach (PC, gogle, gogle bez modelu + Drive, Szkicownik: wątek w przeglądarce + watchdog, Szkicownik na PC, Szkicownik w goglach — helper `SZ` w teście), w tym numery przycisków A/B/X/Y w emulatorze (zgodne z xr-standard: 4 = A/X, 5 = B/Y). Google (GIS, Drive, Gemini) symulowane klasą `GoogleMock` (Playwright route); mikrofon sztuczny (flagi Chrome). W środowisku z HTTPS_PROXY błędy pobierania modeli kontrolerów z CDN są ignorowane.
Niezweryfikowane nigdzie: prawdziwe logowanie Google / Drive, prawdziwe Gemini, klawiatura systemowa Quest, przełączanie VR↔AR z menu (zależy od tego, czy Quest uznaje spust za gest użytkownika).
NIE PRZETESTOWANE na prawdziwych goglach. Test na Quest robi Robert i raportuje.
Znane ryzyka: duże złożenia (parsowanie na Quest może trwać ~minutę → w razie potrzeby przenieść konwersję STEP→GLB na PC),
wydajność renderu na Quest 3S (może wymagać uproszczenia siatki/LOD), wygoda położenia panelu na kontrolerze, zrzut w AR nie zawiera obrazu z kamer (ograniczenie WebXR, tło = kolor).

## Plan dalej
- W TOKU: tryb „Szkicownik brył” (gabaryty w VR, replicad/OCCT w workerze, eksport STEP), osobny moduł `szkicownik/`. Plan i decyzje: `docs/szkicownik-plan.md`. Pracujemy etapami 1–5, po każdym commit i czekamy na „dalej” od Roberta.
  Etap 2 GOTOWY (geometria bez interfejsu): `szkicownik/geometria.js` (rdzeń replicad), `worker.js` (wątek, moduł), `klient.js` (kolejka + watchdog: terminate → nowy wątek → `odtworzStan` → dopiero potem błąd), `projekt.js` (model brył w JSON, boolean zastępuje A i B, oryginał jako elementy złożenia, eksport nowe/oryginał/wszystko), `szkicownik/lib/` (replicad 1.1.0 + WASM 23 MB w repo).
  WAŻNE: w replicad translate/rotate/scale kasują bryłę wejściową → `przeksztalc()` zawsze klonuje. Booleany nie kasują. Brak `STEPCAFControl_Reader` → nazwy oryginału z viewera przez `dopasujCzesci` (ramki).
  Etap 3 GOTOWY (tryb w scenie): `szkicownik/szkicownik.js` (klasa Szkicownik: bryły jako węzły three.js w `root` = układ CAD mm, skala 0.001, dziecko `cadRoot` gdy jest model, inaczej własny pivot; tło = materiały części viewera przezroczyste; przejęte części oryginału ukryte w viewerze i pokazywane geometrią viewera ×1000 + `lok`; chwyt gripem przez promień, snap DELTY (siatka, kąt bezwzględny gdy obrót > pół kroku, skala co 0,05), dwie ręce; boolean: A wybrana, „op:…”, potem wskazanie B; panel numeryczny `numpad`; PC: panel 3D przy kamerze, mysz = promień, TransformControls, klawiatura), `szkicownik/panel.js` (Panel3D + Uklad, osobny od panelu viewera). `projekt.js`: kopiuj (worker 'kopiuj' = clone), grupy (`grupy`, `bryla.grupa`, w STEP = podzłożenie), zmienDef, ustawWlasciwosci.
  Podpięcie w index.html (jedyne zmiany viewera): `szkicownik` ładowany dynamicznie (`przelaczSzkicownik`), w `tick()` przy aktywnym trybie `szkicownik.wejscieXR(dt)` zamiast `handleXRInput` i `szkicownik.klatka(dt)`, blokady w pointerup i keydown viewera, przycisk `#btnSzk`, w Menu gogli `tryb:szkicownik`. API dla szkicownika: `szkicownikApi()`.
  Oś góry: Szkicownik używa ustawienia „Góra” viewera (walec w pliku Z-up dostaje obr [90,0,0], etykiety pól i klawisze wg osi).
  Następny: etap 4 (szkic 2D: linie i łuki, snap, domykanie, samoprzecięcia, wyciągnięcie). Etap 5: undo (zapis stanu przed operacją), JSON, STEP na Drive (scope `drive` wystarcza).
- Następnie: zapis/odczyt `projekt/vr/adnotacje.json` na Drive (komentarze, rysunki, miary — teraz znikają po zamknięciu), samodzielne strzałki bez płytki, komenda głosowa „zrób zdjęcie”.
- v0.4 (zmiana planu Roberta): zamiast asystenta patrzącego na stream — Gemini czyta zrzuty z folderu `projekt/vr/screeny` na Drive (+ `kontekst.md`, `adnotacje.json`) i się do nich odnosi. Szczegóły później.
- v0.5: integracja z systemem zarządzania projektami.

## Repozytorium
- GitHub (publiczne): https://github.com/tevenenrk/VR-CAD-viewer (gałąź `main`, wysyłka przez HTTPS, logowanie Git Credential Manager).
- GitHub Pages: https://tevenenrk.github.io/VR-CAD-viewer/ (z gałęzi `main`, folder główny; `.nojekyll` wyłącza Jekyll).
- Autor commitów ustawiony lokalnie w repo na adres noreply GitHuba (nie publikować prywatnego e-maila).
- `.gitignore` blokuje *.step/*.stp/*.iges/*.sldprt/*.glb i foldery `projekt/` — wyjątek tylko `test/test_zlozenie.step`.

## Pliki
- `index.html` — cały viewer (v0.3).
- `test/test_zlozenie.step` — małe złożenie testowe (użyć z ustawieniem „Góra: Z”). Generator: `test/make_test_step.py` (CadQuery).
- `szkicownik/` — Szkicownik brył (w budowie, patrz Plan dalej). `test/szkicownik_test.mjs` — testy geometrii w Node (33 sprawdzenia, `node test/szkicownik_test.mjs`, wątek przez `test/szkicownik_worker_node.mjs`); zapisuje `test/szkicownik_*.step` do obejrzenia (w .gitignore).
- `test/run_headless.py` — automatyczny test w headless Chrome przez Playwright (sam znajduje Chrome na Windowsie lub Linuksie, lista `CHROME_PATHS`). Część 1: PC. Część 2: emulator Meta Quest 3 (IWER, `installRuntime({forceInstall: true})`, `stereoEnabled = false`) — steruje kontrolerami (`T.pose`, `T.tipAt`, `T.btn`, `T.palClick`) i sprawdza wszystkie narzędzia. Wymaga `pip install playwright` i `npm install --no-save three@0.187.0 occt-import-js@0.0.23 three-mesh-bvh@0.9.16 iwer@2.6.0` w folderze projektu. Uruchamiać z folderu projektu: `python test/run_headless.py` (kod wyjścia 1 = błąd). Wyniki obrazowe: `test/screenshot.png`, `test/screenshot_vr.png`, `test/zrzut_pc.jpg`, `test/zrzut_vr.jpg` (w .gitignore). Na PC Roberta (Windows) zainstalowane i działa.

## Zasady pracy
- Zawsze testuj zmiany w headless Chrome przed oddaniem; sprawdzaj konsolę pod kątem błędów.
- Po każdej zmianie podaj Robertowi krótką instrukcję testu w goglach, krok po kroku.
- Nie obiecuj, że coś działa w VR, jeśli nie zostało sprawdzone na goglach.
- Przy sztywnych decyzjach (wybór chmury, format zapisu) pytaj, nie zgaduj.
