# CAD VR Viewer

Przeglądarka modeli CAD (STEP / IGES / STL, np. eksport z SolidWorksa) w przeglądarce PC i w goglach Meta Quest (VR oraz AR/passthrough). Działa w całości w przeglądarce, bez instalacji. Pliki modeli nie są wysyłane na żaden serwer programu: plik jest odczytywany lokalnie na urządzeniu (opcjonalnie pobierany z Twojego Google Drive).

**Uruchom:** https://tevenenrk.github.io/VR-CAD-viewer/

**Model testowy od razu po otwarciu:** https://tevenenrk.github.io/VR-CAD-viewer/?model=test/test_zlozenie.step
(po wczytaniu przestaw w panelu „Góra: Z”).

## Pliki: kilka plików w jednym złożeniu, zapis STEP

- **Otwórz STEP / STL** — zamyka poprzedni model. Zaznaczenie kilku plików naraz = jedno złożenie.
- **Dodaj plik** — dokłada kolejny STEP albo STL do tego, co już jest wczytane (te same współrzędne CAD).
  W goglach: X → Menu → „Otwórz: dodaj”, potem plik z Google Drive albo z „Ostatnich plików”.
  Przeciągnięcie plików na okno: kilka plików = złożenie, z klawiszem Shift = dołóż do wczytanego.
- **STL** — siatka trójkątów bez jednostek: program przyjmuje 1 jednostka = 1 mm (`CONFIG.STL_M_NA_JEDNOSTKE`).
- **Zapisz STEP** (PC i Menu w goglach) — całe zmienione złożenie jako **prawdziwe bryły**: części ze wszystkich plików
  w aktualnym położeniu i skali, kopie, bryły ze Szkicownika (gałąź „Szkicownik”), kolory i podzłożenia.
  **Ukryte części nie są zapisywane** — tak „usuwasz” części z pliku. STL trafia do STEP jako bryła z trójkątów.
  „Zapisz STEP na Drive” zapisuje do `<folder projektu>/cad/` (nowy plik `…_zmiany_<data>.step`, nic nie jest nadpisywane).
  Pierwszy zapis ładuje OpenCascade (23 MB) i czyta bryły z plików — przy dużych złożeniach to może potrwać.

## Sterowanie w goglach (Meta Quest)

| Przycisk | Działanie |
|---|---|
| Spust | wybrane narzędzie: **Wskaż** (nazwa i wybór części), **Rysuj** (linia w powietrzu, grubość zależy od siły nacisku; kulka pędzla 8 cm przed kontrolerem), **Belka** (prosta bryła od A do B), **Gumka**, **Miarka** (od punktu do punktu na powierzchni), **Kolor** (maluje część), **Komentarz** (płytka ze strzałką), **Przekrój** (płaszczyzna cięcia w ręce) |
| Grip przy części | chwyć **część** albo **wszystko w sferze** (tryb w panelu); tak samo chwytasz **rysunki** z narzędzia Rysuj |
| Trzymasz część / rysunek + prawy spust | **kopia** zostaje w tym miejscu (cała grupa, jeśli trzymasz grupę), a Ty dalej trzymasz oryginał |
| Trzymasz kilka elementów + **wciśnięcie gałki** | trzymane części i rysunki stają się **grupą**; ponowne wciśnięcie przy trzymanej grupie = rozgrupuj |
| Trzymasz część + A | **ukryj** trzymaną część (B – cofnij) |
| Wskaż + spust na części | **okienko przy części**: Ukryj, Półprzezroczysta, **Bez przekroju**, Tylko ta, kolory, Kolor oryginalny, Zaznaczaj wiele / Grupuj / Rozgrupuj, Więcej. Spust obok modelu albo ✕ zamyka |
| Grip w pustym miejscu | chwyć cały model |
| Oba gripy | obracaj i powiększaj trzymany element albo cały model |
| A | zrzut ekranu (błysk, dźwięk migawki i wibracja — błysku nie ma na zdjęciu) |
| B | cofnij |
| X | pokaż / ukryj panel (na lewym kontrolerze, klikasz promieniem prawego + spust) |
| Y | reset pozycji modelu |
| Prawa gałka ↑↓ | grubość pędzla / gumki, przy Przekroju przesuw płaszczyzny, w innych narzędziach skala modelu |
| Lewa gałka ↑↓ | wielkość sfery chwytu (tryb Grupa) |

Panel w goglach wisi kilka centymetrów nad lewym kontrolerem (kontroler go nie zasłania); przyciski mają ikony i są pogrupowane w ramki. Cztery zakładki:
- **Narzędzia** – narzędzie (spust), chwytanie (grip) + „Grupuj zaznaczone / Rozgrupuj / Odznacz”, kolor, rozmiar, przekrój (Włącz / X / Y / Z / Odwróć / Tnij wszystko), zrzut, skala, resety.
- **Widok** – **tło dookoła** (kafelki z podglądem: Bez tła, Szczyt góry, Kosmos, Niebo, Zachód słońca, Studio, Łąka o świcie, Planeta, „Z internetu ▸”, „Własne zdjęcie (Drive)”, „Obróć tło 45°”), **rozstrzelenie modelu** (− / + / Złóż), usuwanie rysunków / miar / komentarzy.
- **Drzewo** – drzewo złożenia: kwadrat = pokaż/ukryj, kółko = półprzezroczysta, nazwa = wybierz część (świeci na pomarańczowo), „Pokaż wszystko”, „Tylko wybrana”, „Ukryj wybraną”.
- **Menu** – plik z Google Drive albo z „Ostatnich plików”, „Wczytaj ponownie”, oś góry Y/Z, „Na stół / Skala 1:1”, dokładność siatki, przełączenie VR ↔ AR, wyjście z gogli, stan chmury i wysyłanie zaległych zrzutów.

Do gogli można wejść bez wczytanego modelu — panel otworzy się wtedy na zakładce Menu.

**Komentarz:** narzędzie Komentarz → spust na części (tam będzie grot strzałki) → trzymając spust przesuń rękę w bok → puść. Płytka zawisa w powietrzu, a panel zamienia się w klawiaturę: pisz promieniem i spustem, „Mów” = dyktowanie, „Klaw. Quest” = klawiatura systemowa gogli (jeśli przeglądarka ją udostępnia), „Gotowe” = zapisz. Krótki klik bez przesuwania stawia płytkę automatycznie nad punktem. Klik w istniejącą płytkę = edycja, przeciągnięcie = przesunięcie, Gumka = usunięcie.

**Przekrój:** narzędzie Przekrój → trzymaj spust: płaszczyzna idzie za kontrolerem jak nóż (blisko osi X/Y/Z sama się do niej przyciąga), puść = zostaje. Prawa gałka przesuwa płaszczyznę. Powierzchnia przekroju jest zamalowana (kolor części zmieszany z pomarańczowym).

**Przekrój bez wybranych części:** Wskaż + spust na części → w okienku „Bez przekroju” — płaszczyzna jej nie tnie (np. wał w przeciętej obudowie).
„Tnij wszystko” (karta Przekrój w panelu) przywraca cięcie wszystkich części. Na PC: przycisk „Bez przekroju” przy wybranej części, w panelu „Przekrój” — „Tnij wszystkie części”.

**Grupy — sferą (części i rysunki):** tryb chwytania „Sfera”, ustaw wielkość (lewa gałka albo − / +), złap gripem kilka elementów naraz
i **trzymając wciśnij gałkę** (kliknij drążek kciukiem) — złapane części i rysunki stają się jedną grupą (wibracja). Drugie wciśnięcie gałki przy
trzymanej grupie ją rozbija. Można też puścić — złapane elementy zostają zaznaczone (pomarańczowe) — i w panelu wybrać „Grupuj zaznaczone”.
Grupa zachowuje się jak jeden przedmiot: grip na dowolnym jej elemencie (także rysunku) chwyta całość, prawy spust kopiuje całość (B cofa jednym naciśnięciem).

**Grupy części — wskazywaniem:** Wskaż + spust na pierwszej części → w okienku „Zaznaczaj wiele” → spust na kolejnych częściach → „Grupuj”. Grupa zostaje grupą:
grip na dowolnej jej części chwyta całą grupę, kopia kopiuje całą grupę, w drzewie przy nazwie widać ⟨Grupa N⟩, a „Zapisz STEP” zapisuje ją jako podzłożenie.
Rozbicie: spust na części z grupy (zaznacza się cała grupa) → „Rozgrupuj”. Na PC: Ctrl + klik = kilka części, przyciski „Grupuj zaznaczone” / „Rozgrupuj”.

**Belka:** narzędzie Belka → spust w punkcie A, przeciągnij do B, puść — powstaje prosta bryła na tej długości (napis pokazuje długość w mm,
kierunek bliski osi X / Y / Z sam się do niej przyciąga). Przekrój w panelu: **Prostokąt** (prawa gałka = bok a, lewa gałka = bok b) albo **Okrąg**
(prawa gałka = średnica); to samo przyciskami a− / a+ / b− / b+. Kolor z palety. Belka jest zwykłą częścią (gałąź „Belki” w drzewie): chwytasz ją,
grupujesz, kopiujesz, ukrywasz, a „Zapisz STEP” zapisuje ją jako prawdziwą bryłę. B cofa. Działa też bez wczytanego modelu.

**Rysunki jako obiekty:** linie z narzędzia Rysuj chwytasz gripem tak jak części (w trybie Część — najbliższy rysunek albo część, w trybie Sfera — wszystko w sferze),
przesuwasz, obracasz dwiema rękami, prawy spust = kopia, A ukrywa trzymany rysunek, gałka = grupa, B cofa.

**Rozstrzelenie (explode):** zakładka Widok → „+” odsuwa części od środka złożenia (co 10 %, do 200 %), „Złóż” wraca. Zapis STEP i Szkicownik
zawsze używają złożonego modelu (rozstrzelenie to tylko widok).

**Tła:** zakładka Widok. Wbudowane tła rysuje program (działają bez internetu), „Łąka o świcie” i „Planeta” są zdjęciami w repozytorium,
„Z internetu ▸” pobiera darmowe panoramy z Poly Haven (licencja CC0, kilka MB — gogle muszą mieć internet), „Własne zdjęcie (Drive)” —
dowolne zdjęcie 360° (panorama 2:1, JPG / PNG) z Twojego Google Drive. Wybór jest zapamiętany. W trybie AR tła nie ma (widzisz pokój).
Na PC: panel „Widok” — lista teł, „Własne zdjęcie 360°” z dysku, suwak rozstrzelenia.

**PC:** lewy przycisk myszy – obrót, prawy – przesuw, kółko – zoom, klik – wybór części (zmiana koloru w panelu), Ctrl + klik – kilka części, Ctrl+Z – cofnij. „Dodaj komentarz” → klik w model → wpisz tekst (albo „Dyktuj”) → „Zapisz”. Klik w płytkę = edycja. Panel „Przekrój”: Włącz, osie X/Y/Z, suwak położenia, Odwróć. Panel „Drzewo złożenia”: pokaż/ukryj, wybór, „Tylko wybrana”.

## Zrzuty ekranu — gdzie lądują

1. **Zawsze** najpierw w pamięci przeglądarki na urządzeniu, na którym zrobiono zrzut (na Quest: pamięć przeglądarki Quest dla tej strony). Podgląd i pobieranie: panel na ekranie 2D → „Zrzuty ekranu” → „Pobierz” (na Quest plik trafia do folderu Pobrane).
2. **Jeśli Google Drive jest połączony** i zaznaczone „Wysyłaj zrzuty od razu do chmury” — zrzut od razu idzie do:
   - `<folder projektu>/vr/screeny/` — folder projektu ustawia się sam, gdy otworzysz plik z Drive (plik z `Projekt/cad/` → folder projektu = `Projekt`), albo ręcznie przyciskiem „Folder projektu = ten”,
   - a jeśli folderu projektu nie ma: `Mój dysk/CAD VR Viewer/vr/screeny/`.
   Brakujące foldery tworzą się same. Zrzut zrobiony bez połączenia czeka w przeglądarce i wysyła się po połączeniu (albo przyciskiem „Wyślij zaległe”).

## Google Drive — jednorazowa konfiguracja (ok. 10 minut)

Strona działa bez serwera, więc Google wymaga własnego „identyfikatora aplikacji” (Client ID). Robisz to raz:

1. Wejdź na https://console.cloud.google.com i zaloguj się kontem Google, na którym jest Twój Drive. Utwórz nowy projekt, np. „CAD VR Viewer”.
2. Menu → „Interfejsy API i usługi” → „Biblioteka” → wyszukaj **Google Drive API** → „Włącz”.
3. Menu → „Google Auth Platform” (dawniej „Ekran zgody OAuth”) → „Rozpocznij”: nazwa aplikacji „CAD VR Viewer”, Twój e-mail, odbiorcy: **Zewnętrzni**. Potem „Odbiorcy” → „Użytkownicy testowi” → dodaj swój adres Gmail. Aplikacja zostaje w trybie „Testowanie” — to wystarcza do własnego użytku.
4. „Klienci” → „Utwórz klienta” → typ **Aplikacja internetowa** → „Autoryzowane źródła JavaScriptu” → dodaj `https://tevenenrk.github.io`. Identyfikatorów przekierowania nie trzeba. Zapisz.
5. Skopiuj **Client ID** (kończy się na `.apps.googleusercontent.com`). To nie jest hasło — można go wpisać na stałe w `CONFIG.GOOGLE_CLIENT_ID` w `index.html` (wtedy działa od razu także na Quest, bez przepisywania), albo wkleić w panelu → „Ustawienia” → „Zapisz”.
6. Panel → „Chmura (Google Drive)” → „Połącz z Google Drive”. Za pierwszym razem Google pokaże ostrzeżenie „Aplikacja nie została zweryfikowana” → „Zaawansowane” → „Przejdź do CAD VR Viewer” → zezwól na dostęp do Dysku. To Twoja własna aplikacja, nikt inny nie ma do niej dostępu.

**Ważne:** połączenie z Google działa 1 godzinę (tak działa logowanie Google bez serwera). Połącz się na ekranie 2D **przed** wejściem w gogle. Gdy wygaśnie, zrzuty czekają w przeglądarce; po „Odnów połączenie” wyślą się same.

**Pliki SolidWorks (.sldprt / .sldasm):** przeglądarka nie potrafi ich otworzyć (zamknięty format SolidWorksa). Widać je na liście, ale wyszarzone. Trzeba je zapisać jako STEP (Plik → Zapisz jako → STEP AP214). Najwygodniej: zainstaluj na PC „Dysk Google na komputer” i zapisuj STEP-y prosto do folderu `projekt/cad/` na Dysku — od razu będą widoczne w goglach.

## Dyktowanie głosem

Przeglądarka Quest nie ma wbudowanego rozpoznawania mowy, dlatego dyktowanie używa **Gemini** (Google AI) z Twoim kluczem:
1. https://aistudio.google.com → „Get API key” → utwórz klucz.
2. Panel → „Ustawienia” → „Klucz Gemini API” → wklej → „Zapisz” → „Sprawdź mikrofon” (przeglądarka zapyta o zgodę — zezwól).
Klucz zostaje tylko w tej przeglądarce (ustawienia są osobne na PC i na Quest), nie trafia do repozytorium. Nagranie (max 30 s) jest wysyłane do Gemini, wraca sam tekst. Model ustawiasz w „Ustawieniach” (domyślnie `gemini-flash-latest`). Bez klucza działa rozpoznawanie mowy przeglądarki, jeśli przeglądarka je ma (Chrome na PC tak, Quest raczej nie).

## Stan

- v0.1: wczytanie STEP, drzewo części z nazwami, kolory, wskazywanie części, wymiary, wejście w VR/AR.
- v0.2: panel narzędzi w goglach, rysowanie w powietrzu, gumka, miarka, malowanie części, chwytanie części / grupy w sferze, skalowanie dwiema rękami, zrzut ekranu, cofanie.
- v0.4 (w toku): Szkicownik: łuk styczny, zaokrąglenia, powierzchnie (płaska, wstążka, między krzywymi), cięcie brył powierzchnią, pogrubianie; okienko przy części, przekrój bez wybranych części, grupy ze sfery, chwytanie rysunków, rozstrzelenie, tła 360°, błysk przy zrzucie; Szkicownik brył (szkic, cofanie).
- v0.3: drzewo złożenia w goglach, przekrój (zamalowany), komentarze na płytkach ze strzałką (klawiatura w goglach, klawiatura Quest, dyktowanie Gemini), menu główne w goglach (plik, oś, tryb VR/AR), Google Drive: otwieranie STEP i automatyczny zapis zrzutów, ostatnio otwierane pliki.

Sprawdzone automatycznie w Chrome i w emulatorze Meta Quest 3 (IWER). Na prawdziwych goglach czeka na test.

## Szkicownik brył (w budowie — etap 4 z 5)

Tryb do szybkiego tworzenia brył zastępczych (gabarytów) w goglach, z eksportem do STEP (prawdziwe bryły, nie siatka).
Plan: `docs/szkicownik-plan.md`. Wejście: przycisk **„Szkicownik brył”** w panelu na PC albo w goglach **X → Menu → „Szkicownik brył ▸”**.
Pierwsze wejście ładuje OpenCascade (23 MB), potem przeglądarka trzyma go w pamięci.

Co już działa: prostopadłościan, walec, kula **tworzone rozciąganiem ręką** (jak w Gravity Sketch: narzędzie bryły, spust w punkcie A,
przeciągnij do B, puść — podgląd z wymiarami na żywo, snap do siatki), lista brył (pokaż/ukryj, wybór),
przesuwanie / obracanie / skalowanie ze snapem (domyślnie 10 mm i 15°), położenie, obrót i skala wpisywane liczbą,
suma / różnica / część wspólna, kopiowanie, grupy, **szkic 2D** (linie i łuki na płaszczyźnie XY / XZ / YZ) zamieniany w bryłę
**wyciągnięciem** albo **obrotem wokół krawędzi obrysu**, **cofanie** (B w goglach, Ctrl+Z na PC, do 40 kroków),
**przejęcie oryginalnego modelu** jako elementów złożenia
(można je przesuwać, kopiować i grupować), eksport STEP: wszystko / tylko nowe / sam oryginał / zaznaczone.
Wczytany model jest półprzezroczystym tłem i Szkicownik pracuje w jego współrzędnych — gabaryty trafią w SolidWorksie na swoje miejsce.
Zbyt długa operacja (ponad 5 s) jest przerywana, bryły zostają bez zmian.

**Gogle:**

| Przycisk | Działanie |
|---|---|
| Narzędzie Prostopadłościan / Walec / Kula + spust | rozciągnij bryłę: prostopadłościan od narożnika do narożnika, walec od środka podstawy (w bok = promień, w górę = wysokość), kula od środka (promień) |
| Spust na bryle | wybierz (bryła w grupie → cała grupa) — narzędzie Wybierz |
| Spust w pustym miejscu | odznacz |
| Grip na bryle (promień) | chwyć i przesuń / obróć ręką — snap po siatce. Żółty punkt = tu złapiesz, zielony = tu trzymasz |
| Trzymasz bryłę + prawy spust | kopia zostaje w miejscu, dalej trzymasz oryginał |
| Trzymasz bryłę + A | usuń trzymaną bryłę (B — cofnij) |
| Grip w pustym miejscu | przesuń całą scenę |
| Oba gripy | obrót + skala trzymanej bryły (albo sceny) |
| Prawa gałka ↑↓ | skala całej sceny |
| B | **cofnij** (w szkicu: usuń ostatni odcinek) |
| A (nic nie trzymasz) | zrzut ekranu · **X** panel · **Y** reset widoku |

Panel (lewy kontroler, kilka cm nad nim, przyciski z ikonami pogrupowane w ramki): **Bryły** (narzędzia Wybierz / Prostopadłościan / Walec / Kula / **Belka**
— od A do B, przekrój prostokąt a × b albo okrąg Ø, gałki: prawa a / Ø, lewa b, długość na siatce snapu; Cofnij, Kopiuj, Usuń, Grupuj, Rozgrupuj;
lista brył, przejmij oryginał) · **Szkic** (płaszczyzna, Linia / Łuk styczny / Łuk 3 pkt / Zaokrąglij + promień, Usuń ostatni, Zamknij, Anuluj; Wyciągnij, Wpisz wysokość, Obrót, kąt obrotu, Powierzchnia)
· **Powierzchnie** (Płaska ze szkicu, Wstążka, Między 2 krzywymi; Tnij bryłę, Pogrub, grubość) · **Edycja** (dokładne wymiary, położenie,
obrót, skala — klik w pole otwiera klawiaturę numeryczną; Suma / Różnica / Część wspólna: wybrana bryła = A, potem wskaż B;
snap; kolor) · **Plik** (eksport STEP, powrót do podglądu).

**Szkic → bryła:** zakładka **Szkic** → wybierz płaszczyznę (domyślnie pozioma) → spust = kolejne punkty obrysu (gogle: czubek kontrolera
rzutowany na płaszczyznę, pierwszy punkt ustala, na jakiej wysokości leży płaszczyzna; PC: klik). Rodzaje łuków:
**Łuk styczny** — jeden punkt: łuk płynnie przedłuża poprzedni odcinek (jak w SolidWorksie; pierwszy odcinek to zawsze linia),
**Łuk 3 pkt** — początek, punkt na łuku, koniec, **Zaokrąglij** — spust przy narożniku między dwiema liniami (świeci na żółto) wstawia promień
(„Promień”: 2 / 5 / 10 / 20 / 50 mm; działa też na zamkniętym obrysie, B cofa).
Punkty przyciągają się do siatki i do istniejących punktów. Punkt na pierwszym punkcie (albo „Zamknij”) zamyka obrys.
Odcinek, który przecinałby obrys, świeci na czerwono i nie zostanie dodany. B / „Usuń ostatni” = cofnij odcinek.
Potem: **Wyciągnij** — odsuń rękę (mysz) od płaszczyzny, podgląd pokazuje bryłę, spust = gotowe (albo „Wpisz wysokość”, minus = w drugą stronę);
**Obrót** — wskaż prosty odcinek obrysu jako oś (żółty), spust = bryła obrotowa (360°, „Zmień kąt”: 270 / 180 / 90°).

**Powierzchnie** (zakładka Powierzchnie):
- **Płaska ze szkicu** — zamknięty obrys z zakładki Szkic zamienia się w płaską powierzchnię (bez grubości).
- **Wstążka (2 ręce)** — trzymaj OBA spusty i prowadź ręce; powierzchnia rozpina się między czubkami kontrolerów. Puść = gotowe.
- **Między 2 krzywymi** — dwa razy: trzymaj spust i prowadź rękę (krzywa); po drugiej krzywej powstaje powierzchnia pomiędzy nimi. PC: klikaj punkty, Enter kończy krzywą.
- **Tnij bryłę** — wybierz powierzchnię → „Tnij bryłę” → wskaż bryłę: powstają dwie części (nad i pod powierzchnią), powierzchnia się chowa.
  Powierzchnia musi przechodzić przez całą bryłę (bryła poza zasięgiem powierzchni zostaje w części „pod”).
- **Pogrub** — powierzchnia staje się bryłą o grubości 1–20 mm („Wpisz grubość”: dowolna, minus = w drugą stronę); grubość można później zmienić w Edycji.
Powierzchnie zapisują się w STEP jako powierzchnie (w SolidWorksie: Powierzchnia‑Import). Wszystko można cofnąć (B / Ctrl+Z).

**Cofanie:** każda zmiana brył (dodanie, przesunięcie, obrót, skala, wymiary, boolean, kopia, usunięcie, grupy, kolor, widoczność) zapisuje
stan sprzed zmiany; B / Ctrl+Z / „Cofnij” przywraca go (do 40 kroków). „Przejmij oryginał” nie da się cofnąć — historia zaczyna się od tego miejsca.

**PC (test bez gogli):** panel 3D po prawej stronie ekranu klikasz myszą (klik = spust). Narzędzie bryły: przeciągnij myszą po płaszczyźnie
(poziom środka obrotu kamery albo wierzch wskazanej bryły; wysokość prostopadłościanu = krótszy bok, potem można ją zmienić w Edycji),
Esc = wróć do Wybierz. Klik w bryłę = wybór, uchwyty
przesuwu/obrotu/skali (W / E / R), strzałki i PageUp/PageDown = krok siatki (Shift ×10), Q / Shift+Q = obrót o kąt snapu,
+ / − = skala, Del = usuń, Ctrl+D = kopiuj, Ctrl+G = grupuj (Ctrl+Shift+G rozgrupuj), Ctrl+A = zaznacz wszystko,
Ctrl+Z = cofnij, Esc = odznacz, cyfry + Enter w klawiaturze numerycznej. W szkicu: klik = punkt (przeciąganie dalej obraca widok),
Backspace = usuń ostatni, Enter = zamknij obrys, L / A = linia / łuk, Esc = wyjście ze szkicu.

Po „Wróć do podglądu” bryły ze Szkicownika stają się **zwykłymi częściami podglądu** (w drzewie pod „Szkicownik”): chwytasz je,
powiększasz dwiema rękami, kopiujesz prawym spustem, ukrywasz, a „Zapisz STEP” zapisuje je razem z resztą. Przesunięcia części
oryginału zrobione w Szkicowniku są widoczne w podglądzie, a przesunięcia z podglądu — w Szkicowniku (przy każdym wejściu).

Test silnika (w folderze projektu, Node.js): `node test/szkicownik_test.mjs` — zapisuje do `test/` pliki STEP do obejrzenia w SolidWorksie.

## Pliki

- `index.html` – cały program.
- `test/test_zlozenie.step` – małe złożenie testowe (własne, wygenerowane skryptem).
- `test/make_test_step.py` – generator złożenia testowego (CadQuery).
- `tla.js`, `tla/` – tła 360° (rysowane przez program + 2 zdjęcia, licencje w `tla/LICENCJE.md`).
- `szkicownik/` – Szkicownik brył (silnik geometrii, biblioteki w `szkicownik/lib/`).
- `test/szkicownik_test.mjs` – testy geometrii Szkicownika w Node.
- `test/run_headless.py` – automatyczny test w Chrome bez okna, z emulatorem gogli (163 sprawdzenia, w tym Szkicownik na PC i w emulatorze gogli; Google Drive i Gemini są w teście symulowane, bez logowania). Przed pierwszym uruchomieniem:
  `pip install playwright` oraz w folderze projektu
  `npm install --no-save three@0.187.0 occt-import-js@0.0.23 three-mesh-bvh@0.9.16 iwer@2.6.0`.

## Uwaga

Repozytorium jest publiczne. Pliki STEP klientów nie trafiają do repozytorium: blokuje je `.gitignore`.

Biblioteki: [three.js](https://threejs.org/) 0.187.0, [occt-import-js](https://github.com/kovacsv/occt-import-js) 0.0.23 (OpenCascade), [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) 0.9.16. Testy: [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) 2.6.0.
