# Szkicownik brył — plan (etap 1)

Tryb do szybkiego tworzenia uproszczonych brył zastępczych (gabarytów) w goglach. To nie jest pełny CAD:
szczegóły dopracowuje się potem w SolidWorksie.

## 1. Obecny kod (stan v0.3)

- Cały viewer to jeden plik `index.html` (HTML + CSS + jeden moduł JavaScript), bez bundlera, hostowany na GitHub Pages.
- Biblioteka 3D: three.js 0.187.0 z CDN jsDelivr (importmap), WebXR wbudowany w three.js (`renderer.xr`), modele kontrolerów
  `XRControllerModelFactory`, szybkie wskazywanie `three-mesh-bvh` 0.9.16.
- Odczyt STEP/IGES: `occt-import-js` 0.0.23 (OpenCascade w WASM) w Web Workerze tworzonym z Blob URL. Tylko odczyt do siatki,
  bez modelowania i bez zapisu STEP.
- Scena: `pivot` → `offsetGroup` → `cadRoot` (obrót osi góry Y/Z) → części + `annoRoot` (adnotacje w metrach CAD).
- Kontrolery: `renderer.xr.getController(0/1)`; zdarzenia `selectstart/squeezestart` + odczyt `gamepad.buttons/axes` co klatkę
  w `handleXRInput()`. Przyciski wg xr-standard: 0 spust, 1 grip, 3 gałka, 4 A/X, 5 B/Y.
- Panel w goglach: płótno 2D (CanvasTexture) na lewym kontrolerze, klikane promieniem prawego + spust; zakładki Narzędzia / Drzewo /
  Menu (+ klawiatura). Przyciski wymagające „gestu” obsługiwane w `selectstart`.
- Google Drive: Google Identity Services, token client (bez serwera, token 1 h w localStorage), REST v3 przez `fetch`.
  **Uprawnienie (scope): `https://www.googleapis.com/auth/drive` — pełny dostęp do Dysku** (czytanie i zapis).
  Client ID Roberta w `CONFIG.GOOGLE_CLIENT_ID`.
- Pamięć: IndexedDB `cad-vr-viewer` (zrzuty, ostatnie pliki), ustawienia w localStorage.
- Test: `test/run_headless.py` — Playwright + emulator Meta Quest 3 (IWER), 62 sprawdzenia, atrapy Google.

## 2. Sprawdzenie replicad (7.11.2026)

- **Utrzymywany: tak.** npm `replicad` 1.2.1 (6.11.2026), wydania co kilka tygodni (1.0.0 — 14.08.2026),
  repozytorium `sgenoud/replicad`: ok. 713 gwiazdek, ostatnia zmiana 6.11.2026, nie zarchiwizowane. Jeden główny autor (ryzyko: zależność od jednej osoby).
- Licencje: replicad MIT, `replicad-opencascadejs` (OpenCascade WASM) LGPL-2.1 — można używać i rozpowszechniać bez zmian.
- **Eksport STEP: tak** — `exportSTEP([{shape, name, color}], {unit: 'MM'})` zapisuje prawdziwe bryły (B-rep), z nazwami i kolorami.
- Próba w Node (skrypt poza repozytorium): prostopadłościan 100×50×20 → objętość 100000.000 mm³ (dokładnie);
  wyciągnięcie obrysu z łukiem → zgodne z wzorem co do 0.001 mm³; różnica z walcem 75 ms, bryła poprawna (BRepCheck_Analyzer);
  zapis STEP 36 kB → wczytany z powrotem przez `occt-import-js` (ten sam czytnik co viewer): 2 bryły, nazwy zachowane, wymiary zgodne.
  Start WASM w Node: 0.2 s.
- Do dyspozycji: `measureVolume`, `BRepCheck_Analyzer` (poprawność), `shape.mesh()` (siatka do wyświetlania),
  `shape.serialize()` / `deserializeShape()` (szybkie odtworzenie stanu po restarcie wątku), szkicownik `draw().lineTo().threePointsArcTo()`.
- Minus: plik WASM ma **23 MB** (po kompresji w przesyłaniu mniej). Ładowany tylko po wejściu w Szkicownik, potem z pamięci przeglądarki.
  Nie udało się stąd sprawdzić, czy jsDelivr wydaje tak duży plik (dokumentacja jest niejednoznaczna) — sprawdzę w etapie 2; zapas: plik w repozytorium.

**Wniosek: replicad nadaje się, alternatywa nie jest potrzebna.**

## Decyzje Roberta po etapie 1 (7.11.2026)
- Oś góry przy eksporcie: **Y** (jak domyślny SolidWorks). Gdy wczytany jest model, Szkicownik pracuje w układzie tego pliku.
- Oryginalny CAD półprzezroczysty jako tło. Oryginalne części można **zatwierdzić jako elementy złożenia Szkicownika**:
  przesuwać, obracać, skalować, kopiować i grupować (kopiowanie i grupy — etap 3).
- Eksport STEP do wyboru: **tylko nowe bryły / oryginał + nowe / sam oryginał** (z przesunięciami i skalą), albo tylko zaznaczone.
- Plik WASM (23 MB) w repozytorium: `szkicownik/lib/` (replicad 1.1.0, wersja sprzed 2 miesięcy, sprawdzona).

### Jak oryginał trafia do eksportu (sprawdzone w etapie 2)
OpenCascade w replicad nie ma czytnika STEP ze strukturą złożenia (`STEPCAFControl_Reader`), ale ma zwykły czytnik brył
i pełny zapis złożeń (XCAF). Dlatego: wątek geometrii czyta bryły oryginału (B-rep, dokładne), a nazwy, ścieżki w drzewie
i kolory bierze z viewera — dopasowanie po ramkach (na złożeniu testowym zgodność do 0.1 mm). Eksport to **nowy plik STEP**
z tymi samymi częściami (prawdziwe bryły), strukturą podzłożeń, nazwami i kolorami. Nie jest to kopia 1:1 starego pliku:
przepadają np. właściwości niestandardowe i konfiguracje, a powtórzone wystąpienia tej samej części zapisują się jako osobne bryły.

## 3. Architektura (osobny moduł, viewer nietknięty)

Nowe pliki w folderze `szkicownik/` (ES moduły, bez bundlera). W `index.html` tylko import i przełącznik trybu
(panel PC + zakładka Menu w goglach): **Tryb: Podgląd / Szkicownik**.

| Plik | Zadanie | Wątek |
|---|---|---|
| `szkicownik/geometria.js` | budowa brył z parametrów, boolean, sprawdzenie poprawności i objętości, siatka do wyświetlania, odczyt brył STEP, zapis STEP ze strukturą złożenia, przeliczenie układów, dopasowanie części | worker i testy Node |
| `szkicownik/projekt.js` | model projektu: lista brył (parametry), boolean zastępujący 2 bryły wynikiem, oryginał jako elementy złożenia, drzewo eksportu, stan JSON, odtworzenie po restarcie | główny i testy Node |
| `szkicownik/lib/` | replicad 1.1.0 + OpenCascade WASM (kopie bez zmian, licencje) | worker |
| `szkicownik/worker.js` | wątek geometrii: wczytanie WASM, polecenia, bryły w pamięci (BREP) | Web Worker |
| `szkicownik/klient.js` | kolejka poleceń, **strażnik czasu (watchdog)**, restart wątku, odtworzenie stanu | główny |
| `szkicownik/szkic2d.js` | szkic: linie, łuki z 3 punktów, snap, domykanie, wykrywanie samoprzecięć (czysty JS) | główny i testy Node |
| `szkicownik/szkicownik.js` | tryb w scenie: wyświetlanie brył, lista, przesuw/obrót/skala, snap, panel numeryczny, sterowanie Quest i PC | główny |
| `test/szkicownik_test.mjs` | testy geometrii w Node (bez VR) | Node |

### Jednostki i układy (w jednym miejscu: `geometria.js`)
- Model w **mm**, scena w **m** (`MM_NA_M = 0.001`).
- Three.js: Y w górę. CAD: oś góry wg ustawienia `EKSPORT_OS_GORY` (patrz pytanie 1).
  Funkcje `cadDoSceny()` / `scenaDoCad()` — jedyne miejsce przeliczeń; eksport STEP zawsze w układzie CAD.

### Dane projektu (JSON)
```json
{ "wersja": 1, "jednostki": "mm", "osGory": "Y",
  "bryly": [ { "id": "b3", "nazwa": "Rama", "kolor": "#8899aa", "widoczna": true,
               "def": { "typ": "boolean", "op": "roznica",
                        "a": { "typ": "prostopadloscian", "dx": 600, "dy": 400, "dz": 20, "poz": [0,0,0], "obr": [0,0,0], "skala": 1 },
                        "b": { "typ": "walec", "r": 15, "h": 40, "poz": [100,50,-10], "obr": [0,0,0], "skala": 1 } },
               "poz": [0,0,0], "obr": [0,0,0], "skala": 1 } ] }
```
Typy: `prostopadloscian {dx,dy,dz}`, `walec {r,h}` (oś = Y), `kula {r}` — wyśrodkowane w swoim początku układu;
`wyciagniecie {plaszczyzna, odsuniecie, obrys: [{typ:'linia',a,b} | {typ:'luk',a,m,b}], h}`, `boolean {op: suma|roznica|wspolna, a, b}`,
`oryginal {indeksy: [bryły z pliku]}`. Każda bryła ma też `lok` (przesunięcie geometrii, żeby środek był w początku układu — obrót
i skala działają wokół środka bryły), `zrodlo` ('nowa' / 'oryginal') i `sciezka` (podzłożenia w eksporcie). Boolean zastępuje dwie bryły wynikiem, a ich pełne definicje zostają
w środku — kolejność operacji jest zachowana. Obrót w stopniach, skala jednolita (jedna liczba; zmiana wymiarów prymitywu — panelem numerycznym).

### Strażnik czasu (watchdog)
- `BOOLEAN_TIMEOUT_MS = 5000`, `OP_TIMEOUT_MS` dla innych operacji, `WASM_START_TIMEOUT_MS` dla startu.
- Przekroczenie: `worker.terminate()` → nowy wątek → odtworzenie brył sprzed operacji (z zapisu BREP, w razie braku z parametrów JSON) →
  komunikat w goglach. Oryginalne bryły nietknięte, bo stan główny żyje w JSON w wątku głównym.
- Wynik booleana odrzucany, gdy: błąd OCCT, bryła niepoprawna (BRepCheck), brak bryły, objętość < `MIN_OBJETOSC_MM3`.
  Część wspólna bez przecięcia → czytelny komunikat.

### Szkic 2D
- Płaszczyzny jak w SolidWorksie: Przednia (XY), Górna (XZ), Prawa (YZ) w układzie CAD.
- Linia: dwa kliknięcia; łuk: początek, punkt na łuku, koniec. Snap do siatki (`SIATKA_MM = 10`) i do istniejących punktów (`SNAP_PUNKT_MM`).
- Domykanie, gdy koniec bliżej początku niż `TOLERANCJA_DOMKNIECIA_MM`. Samoprzecięcia sprawdzane w JS przed wysłaniem do OCCT
  (linia–linia, linia–łuk, łuk–łuk) → komunikat „Obrys przecina się sam ze sobą (odcinki 2 i 5)” + zaznaczenie na czerwono.
- Wyciągnięcie na wysokość wpisaną w panelu numerycznym.

### Sterowanie (spójne z viewerem)
- Gogle: spust = narzędzie (dodaj / wybierz / szkicuj), grip na bryle = chwyć (przesuw + obrót ręką, snap po puszczeniu),
  dwa gripy = skala, B = cofnij, X = panel, Y = reset widoku, A = zrzut ekranu. Panel z zakładkami: Bryły, Szkic, Operacje, Menu.
- Panel numeryczny 3D: cyfry, przecinek, minus, ⌫, OK, Anuluj; klikany promieniem.
- **Tryb testowy PC**: mysz = promień kontrolera (klik = spust), więc te same panele 3D działają bez gogli; do tego klawisze
  (Del usuń, Ctrl+Z cofnij, strzałki = przesuw o krok siatki, R = obrót o 15°, PageUp/PageDown = góra/dół) oraz uchwyty
  przesuwu i obrotu myszą (`TransformControls` z three.js).

### Eksport i zapis
- STEP: wszystkie bryły albo zaznaczone, jako prawdziwe bryły, nazwy i kolory z listy. Najpierw pobranie przez przeglądarkę.
- **Google Drive: obecny scope (`drive`) pozwala zapisać STEP i JSON bez żadnej zmiany uprawnień.** Miejsce: `<folder projektu>/cad/` lub `vr/`.
- Projekt w JSON: pobranie / wczytanie (z dysku, a w etapie 5 także z Drive).

## 4. Testy w Node (bez VR)
Objętość prostopadłościanu, walca, kuli; objętość wyciągnięcia (linie + łuk); boolean różnicy (objętość + poprawność);
odrzucenie pustej części wspólnej; eksport STEP → ponowne wczytanie (`occt-import-js`, wymiary i nazwy);
przeliczenie układów (punkt mm CAD → m sceny → mm CAD); boolean przerwany timeoutem (celowo ciężka operacja + krótki limit)
z odtworzeniem stanu; szkic: domykanie i wykrywanie samoprzecięć. Istniejący test viewera (`test/run_headless.py`) musi dalej przechodzić.

## 5. Etapy
1. Opis i plan (ten plik). ✔
2. Worker z geometrią, prymitywy, boolean, watchdog, eksport STEP, testy w Node. ✔
3. Bryły w VR, lista, przesuw/obrót/skala, snap, panel numeryczny, tryb PC, kopiowanie i grupy (także części oryginału). ✔
   Decyzja robocza: po „Wróć do podglądu” nowe bryły zostają widoczne z modelem; przesunięte części oryginału widać tylko w Szkicowniku i w eksporcie (viewer pokazuje plik bez zmian).
4. Szkic 2D (linie, łuki) i wyciągnięcie. ✔ (13.11.2026) — dodatkowo obrót obrysu wokół jego prostej krawędzi (360 / 270 / 180 / 90°),
   wyciągnięcie rozciąganiem ręką (odległość czubka od płaszczyzny) albo wpisaną wysokością.
5. Cofanie ✔ (zrobione razem z etapem 4: migawka projektu przed każdą operacją, B / Ctrl+Z, 40 kroków), zapis/odczyt JSON, zapis STEP na Drive.
