# CAD VR Viewer

Przeglądarka modeli CAD (STEP / IGES, np. eksport z SolidWorksa) w przeglądarce PC i w goglach Meta Quest (VR oraz AR/passthrough). Działa w całości w przeglądarce, bez instalacji. Pliki modeli nie są nigdzie wysyłane: plik jest odczytywany lokalnie na urządzeniu.

**Uruchom:** https://tevenenrk.github.io/VR-CAD-viewer/

**Model testowy od razu po otwarciu:** https://tevenenrk.github.io/VR-CAD-viewer/?model=test/test_zlozenie.step
(po wczytaniu przestaw w panelu „Góra: Z”).

## Sterowanie w goglach (Meta Quest)

| Przycisk | Działanie |
|---|---|
| Spust | wybrane narzędzie: **Wskaż** (nazwa części), **Rysuj** (linia w powietrzu, grubość zależy od siły nacisku), **Gumka**, **Miarka** (od punktu do punktu na powierzchni), **Kolor** (maluje część) |
| Grip przy części | chwyć **część** albo **grupę części w sferze** (tryb w panelu) |
| Grip w pustym miejscu | chwyć cały model |
| Oba gripy | obracaj i powiększaj trzymany element albo cały model |
| A | zrzut ekranu |
| B | cofnij |
| X | pokaż / ukryj panel narzędzi (na lewym kontrolerze, klikasz promieniem prawego + spust) |
| Y | reset pozycji modelu |
| Prawa gałka ↑↓ | grubość pędzla / gumki, w innych narzędziach skala modelu |
| Lewa gałka ↑↓ | wielkość sfery chwytu (tryb Grupa) |

Panel narzędzi ma też: wybór koloru, „Skala 1:1 / Na stół”, „Reset części”, „Reset kolorów”, „Usuń rysunki”, „Usuń miary”.

**PC:** lewy przycisk myszy – obrót, prawy – przesuw, kółko – zoom, klik – wybór części (zmiana koloru w panelu), Ctrl+Z – cofnij.

## Zrzuty ekranu

Zrzuty (JPG 1920×1080) są zapisywane w pamięci przeglądarki na urządzeniu. Po wyjściu z VR: panel → „Zrzuty ekranu” → „Pobierz”. Na Quest pliki trafiają do folderu Pobrane.

## Stan

- v0.1: wczytanie STEP, drzewo części z nazwami, kolory, wskazywanie części, wymiary, wejście w VR/AR.
- v0.2: panel narzędzi w goglach, rysowanie w powietrzu, gumka, miarka, malowanie części, chwytanie części / grupy w sferze, skalowanie dwiema rękami, zrzut ekranu, cofanie.

Sprawdzone automatycznie w Chrome i w emulatorze Meta Quest 3 (IWER). Na prawdziwych goglach czeka na test.

## Pliki

- `index.html` – cały program.
- `test/test_zlozenie.step` – małe złożenie testowe (własne, wygenerowane skryptem).
- `test/make_test_step.py` – generator złożenia testowego (CadQuery).
- `test/run_headless.py` – automatyczny test w Chrome bez okna, z emulatorem gogli. Przed pierwszym uruchomieniem:
  `pip install playwright` oraz w folderze projektu
  `npm install --no-save three@0.187.0 occt-import-js@0.0.23 three-mesh-bvh@0.9.16 iwer@2.6.0`.

## Uwaga

Repozytorium jest publiczne. Pliki STEP klientów nie trafiają do repozytorium: blokuje je `.gitignore`.

Biblioteki: [three.js](https://threejs.org/) 0.187.0, [occt-import-js](https://github.com/kovacsv/occt-import-js) 0.0.23 (OpenCascade), [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) 0.9.16. Testy: [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) 2.6.0.
