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
- Parsowanie STEP: `occt-import-js` 0.0.23 (OpenCascade WASM), w Web Workerze z Blob URL. Biblioteki z CDN jsdelivr (three@0.187.0, importmap).
- Jednostki: import w metrach (`linearUnit: 'meter'`). Drzewo złożenia i nazwy części zachowane (`result.root`), kolory z `meshes[].color` i `brep_faces[].color` (grupy geometrii).
- Struktura sceny: `pivot` (przesuwa/skaluje użytkownik) → `offsetGroup` (centruje) → `cadRoot` (obrót osi góry: SolidWorks Y-up, opcja Z-up w panelu).
- Sterowanie Quest: grip = chwyt modelu, spust = wskazanie części (nazwa nad częścią), prawa gałka = skala, A/X = stół ↔ 1:1, B/Y = reset.
- Wszystkie stałe w obiekcie `CONFIG` na górze skryptu.

## Stan (v0.1) — ZROBIONE I PRZETESTOWANE NA PC (headless Chrome)
Wczytanie STEP, drzewo części, kolory, kliknięcie myszą w część, wymiary. 
NIE PRZETESTOWANE na prawdziwych goglach: tryb VR/AR, kontrolery, chwytanie, skalowanie, napisy 3D. Test na Quest robi Robert i raportuje.
Znane ryzyka: duże złożenia (parsowanie na Quest może trwać ~minutę → w razie potrzeby przenieść konwersję STEP→GLB na PC),
wydajność renderu na Quest 3S (może wymagać uproszczenia siatki/LOD), pomiar przycisków kontrolera (indeks 4 = A/X, 5 = B/Y; sprawdzić na sprzęcie).

## Plan dalej
- v0.2: rysowanie 3D (kolor, grubość), strzałki, komentarze, zrzut ekranu (przycisk kontrolera) → zapis do chmury (Robert wybiera: Google Drive / OneDrive / Dropbox — jeszcze nie ustalone; zapytać).
- v0.3: chwytanie pojedynczych części, przekrój (clipping plane + zamknięcie przekroju).
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
- `test/run_headless.py` — automatyczny test w headless Chrome przez Playwright (sam znajduje Chrome na Windowsie lub Linuksie, lista `CHROME_PATHS`). Wymaga `pip install playwright` i `npm install --no-save three@0.187.0 occt-import-js@0.0.23` w folderze projektu. Uruchamiać z folderu projektu: `python test/run_headless.py`. Na PC Roberta (Windows) zainstalowane i działa.

## Zasady pracy
- Zawsze testuj zmiany w headless Chrome przed oddaniem; sprawdzaj konsolę pod kątem błędów.
- Po każdej zmianie podaj Robertowi krótką instrukcję testu w goglach, krok po kroku.
- Nie obiecuj, że coś działa w VR, jeśli nie zostało sprawdzone na goglach.
- Przy sztywnych decyzjach (wybór chmury, format zapisu) pytaj, nie zgaduj.
