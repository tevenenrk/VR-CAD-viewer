# Pomysły Roberta na dalsze kroki (zapisane 28.11.2026) — ocena wykonalności

Kierunek: program ma być przejściem **od szkicu na tablecie do animacji procesu zrobionej przez AI** (i z powrotem do modelu STEP do kolejnej iteracji).
Poniżej każdy pomysł: co dokładnie, czy się da, jak to zrobić i jakie są ryzyka. Nic z tego nie jest jeszcze zrobione.

---

## 1. Zdjęcia i szkice z Google Drive w przestrzeni

**Co:** pobieram z Drive zdjęcie albo skan szkicu, trzymam je w ręce, powiększam, przypinam (nie da się przesunąć),
usuwam białe tło (zostają same kreski), ustawiam półprzezroczystość.

**Wykonalność: TAK, w pełni w przeglądarce.** To samo, co robimy z tłem 360°, tylko na płaskim prostokącie.
- zdjęcie = płaski obiekt z teksturą; chwytanie jak część (już mamy chwyt, dwie ręce = skala), flaga „przypięte”,
- usuwanie białego tła = przezroczystość tam, gdzie piksel jest jasny (próg do ustawienia), półprzezroczystość = suwak,
- lista z Drive już umie pokazywać zdjęcia (tryb „obraz” z tła 360°),
- zapis: położenie zdjęć w `projekt/vr/adnotacje.json`.

**Ryzyka:** zdjęcia z telefonu w formacie HEIC przeglądarka nie otworzy (trzeba JPG/PNG); bardzo duże zdjęcia
trzeba zmniejszyć (gogle mają limit wielkości tekstury, jak przy tłach). **Nakład: 1 etap.**

---

## 2. Manekin (dummy) z ruchomymi stawami

**Co:** gotowa postać człowieka w modelu; chwytam za rękę / nogę / tułów, a ciało układa się naturalnie (stawy z ograniczeniami);
gotowe ułożenia nóg (stoi, siedzi, klęczy, kuca, krok); kilka manekinów / pozycji do pokazywania i chowania.

**Wykonalność: TAK, z zastrzeżeniem „naturalności”.**
- postać: własny, prosty manekin (jak drewniany manekin plastyczny — kapsuły i przeguby), bez problemów z licencją;
  wzrost do wyboru (np. 5 / 50 / 95 centyl — przydatne do ergonomii stanowisk),
- ruch: kinematyka odwrotna (IK — ciągniesz dłoń, a łokieć i ramię same się ustawiają; three.js ma gotowy solver CCD),
  ograniczenia kątów w stawach (kolano zgina się tylko w jedną stronę, bark ma swój zakres itd.),
- gotowe ułożenia nóg i całego ciała jako lista pozycji.

**Ryzyka:** „biologicznie naturalnie” w 100 % wymaga symulacji mięśni / fizyki — tu będzie dobre przybliżenie
(ograniczenia stawów + IK), czasem trzeba będzie poprawić ręcznie. **Nakład: 2 etapy.**

### 2b. Wcielenie się w manekina

**Co:** wchodzę w manekina — on ma moją głowę i ręce, chodzę gałką; nogi ułożone ręcznie albo z listy;
w tym trybie mogę chwytać tylko elementy oznaczone wcześniej jako „do manipulacji”; po wyjściu manekin zostaje / wraca / powstaje nowy.

**Wykonalność: TAK.** Gogle dają pozycję głowy i dwóch kontrolerów — z tego IK układa ręce i tułów
(standardowa technika „3 punkty śledzenia”); nogi z wybranej pozycji. Ruch gałką albo teleport.
Flaga „do manipulacji” na częściach i grupach — prosta rzecz.

**Ryzyka:** model musi być w skali 1:1 (inaczej manekin nie pasuje do maszyny); płynne chodzenie gałką
może powodować mdłości — dam też teleport; łokcie z IK czasem „uciekają” — trzeba dostroić na goglach. **Nakład: 2 etapy.**

---

## 3. Tryb „wersja ukończona → pakiet dla AI”

**Co:** wchodzę w tryb pakietu; robię własne zdjęcia (zapisuje się, gdzie stałem i na co patrzyłem), program sam robi serię
standardowych widoków (przód, bok, góra, izometria…); dopisuję komentarz, co ma się dziać; całość idzie do AI (np. Claude).
AI ma z tego zrobić animację ruchu i dokładniejszy model 3D, najlepiej STEP do kolejnej iteracji.

**Co jest możliwe:**
- **pakiet — TAK:** zdjęcia (JPG) + plik z opisem każdego zdjęcia (pozycja i kierunek kamery, kąt widzenia, widoczne części),
  standardowe rzuty robione automatycznie, komentarz tekstowy, model (STEP do CAD, GLB do podglądu), lista części i ich położeń —
  jako ZIP w `projekt/vr/pakiety/` na Google Drive,
- **wysłanie do Claude — TAK:** Claude czyta obrazy (wiele naraz) i tekst; klucz API trzymany w przeglądarce jak klucz Gemini,
- **„animacja” — TAK, ale inaczej niż film:** Claude nie renderuje filmów, ale **pisze kod**. Najpewniejsza droga: AI zwraca
  scenariusz ruchu w naszym formacie (JSON: która część / grupa, jaki ruch, oś, kąt, czas, kolejność), a nasz program
  go odtwarza — w goglach, na PC i jako samodzielny plik HTML do wysłania. Ruch jest wtedy dokładny (na prawdziwej geometrii).
  Generatory filmów (Veo, Sora, Runway) zrobią „ładny film” ze zdjęć, ale bez dokładności inżynierskiej — tylko jako dodatek,
- **dokładniejszy model / STEP — CZĘŚCIOWO:** Claude nie „widzi” plików 3D (STEP / GLB) jako bryły, ale potrafi opisać
  geometrię jako kod. Najlepiej, żeby odsyłał **definicje brył w formacie Szkicownika** (prostopadłościany, walce, wyciągnięcia
  ze szkiców, sumy i różnice — dokładnie to, co już umiemy budować i zapisywać do STEP). To dobrze działa dla prostych gabarytów
  i mechanizmów; skomplikowanych odlewów czy powierzchni swobodnych AI nie odtworzy dokładnie.

**Ryzyka i problemy:**
- **poufność:** pakiet z modelem klienta trafia do chmury dostawcy AI — potrzebna Twoja świadoma decyzja przy każdym wysłaniu
  (repo jest publiczne, pliki klientów nigdy do repo — to zostaje),
- koszt i limity API (liczba / wielkość zdjęć w jednym zapytaniu), czas odpowiedzi,
- AI może się mylić (zła oś obrotu, zła kolejność) — wynik trzeba obejrzeć i poprawić; dlatego format JSON, który da się edytować,
- dokładność modelu z samych zdjęć jest ograniczona — wymiary lepiej brać z naszego modelu (pakiet zawiera położenia i wymiary części).

**Nakład:** pakiet + zdjęcia z pozycją: 1 etap; odtwarzacz animacji (JSON → ruch w VR / PC / HTML): 1–2 etapy;
wysyłka do Claude i przyjęcie odpowiedzi (animacja + bryły Szkicownika): 1–2 etapy.

---

## Proponowana kolejność
1. Zdjęcia / szkice z Drive w przestrzeni (szybki, od razu użyteczny).
2. Zapis `adnotacje.json` (komentarze, rysunki, miary, zdjęcia, pozycje manekinów) — potrzebny wszystkim następnym krokom.
3. Odtwarzacz animacji (format JSON ruchu części) — najpierw ręcznie ustawiane klatki, potem od AI.
4. Pakiet dla AI + wysyłka + przyjęcie odpowiedzi.
5. Manekin, potem wcielanie się w manekina.
