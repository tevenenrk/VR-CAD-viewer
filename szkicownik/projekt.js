// ============================================================================
// SZKICOWNIK BRYŁ — MODEL PROJEKTU (główny wątek, bez three.js)
// Lista brył zapisana parametrami (JSON). Wątek geometrii trzyma tylko kopie robocze — po restarcie
// wątku wszystko jest odtwarzane stąd (odtworzWWatku).
// Bryła: { id, nazwa, kolor, widoczna, zrodlo: 'nowa'|'oryginal', sciezka: [nazwy podzłożeń],
//          def, lok, poz, obr, skala, objetosc, ramka }   — mm, stopnie, układ CAD
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA
// ---------------------------------------------------------------------------
export const PROJEKT = {
  WERSJA_PLIKU: 1,
  KOLORY: ['#8fa3b8', '#e0a458', '#7cb518', '#5fa8d3', '#c77dff', '#f28482', '#84a59d', '#ffd166'],
  NAZWY: { prostopadloscian: 'Prostopadłościan', walec: 'Walec', kula: 'Kula', wyciagniecie: 'Wyciągnięcie', boolean: 'Bryła' },
  NAZWA_NOWYCH: 'Szkicownik',     // podzłożenie z nowymi bryłami w eksporcie STEP
  NAZWA_PROJEKTU: 'Szkicownik',   // nazwa złożenia, gdy nie ma oryginału
  ZNAK_OPERACJI: { suma: '+', roznica: '−', wspolna: '∩' },
};

import { dopasujCzesci } from './geometria.js';

const kopia = (o) => JSON.parse(JSON.stringify(o));
const transformacja = (b) => ({ poz: [...b.poz], obr: [...b.obr], skala: b.skala });

export class Projekt {
  // silnik: SilnikGeometrii. przyZmianie(zdarzenie, dane) — dla sceny (dodano / usunięto / zmieniono)
  constructor(silnik, { przyZmianie = () => {} } = {}) {
    this.silnik = silnik;
    this.przyZmianie = przyZmianie;
    this.bryly = [];
    this.oryginal = null;          // { nazwa, bajty, czesci: [{ nazwa, sciezka, kolor, min, max }] }
    this.licznik = 0;
    silnik.odtworzStan = (s) => this.odtworzWWatku(s);
  }

  nowyId() { return 'b' + (++this.licznik); }
  bryla(id) { return this.bryly.find((b) => b.id === id) || null; }

  // ---- dodawanie ----
  // def: prymityw albo wyciągnięcie. opcje: { nazwa, kolor, poz, obr, skala, sciezka }
  async dodaj(def, opcje = {}) {
    const id = this.nowyId();
    const w = await this.silnik.wykonaj('zbuduj', { id, def, wysrodkuj: true });
    const nr = this.bryly.filter((b) => b.def.typ === def.typ).length + 1;
    const b = {
      id, nazwa: opcje.nazwa || `${PROJEKT.NAZWY[def.typ] || 'Bryła'} ${nr}`,
      kolor: opcje.kolor || PROJEKT.KOLORY[(this.licznik - 1) % PROJEKT.KOLORY.length],
      widoczna: true, zrodlo: 'nowa', sciezka: opcje.sciezka || [PROJEKT.NAZWA_NOWYCH],
      def: kopia(def), lok: w.lok,
      poz: opcje.poz ? [...opcje.poz] : w.srodek, obr: opcje.obr ? [...opcje.obr] : [0, 0, 0], skala: opcje.skala ?? 1,
      objetosc: w.objetosc, ramka: w.ramka,
    };
    this.bryly.push(b);
    this.przyZmianie('dodano', { bryla: b, siatka: w.siatka });
    return b;
  }

  // ---- boolean: A i B zastąpione wynikiem; przy błędzie / przekroczeniu czasu nic się nie zmienia ----
  async boolean(idA, idB, op) {
    const A = this.bryla(idA), B = this.bryla(idB);
    if (!A || !B) throw new Error('Wybierz dwie bryły');
    if (A === B) throw new Error('Wybierz dwie różne bryły');
    const id = this.nowyId();
    const w = await this.silnik.wykonaj('boolean', { idWyniku: id, op, a: { id: A.id, ...transformacja(A) }, b: { id: B.id, ...transformacja(B) } });
    const operand = (x) => ({ nazwa: x.nazwa, def: kopia(x.def), lok: [...x.lok], ...transformacja(x) });
    const wynik = {
      id, nazwa: A.nazwa, kolor: A.kolor, widoczna: true, zrodlo: A.zrodlo, sciezka: [...A.sciezka],
      def: { typ: 'boolean', op, a: operand(A), b: operand(B) },
      lok: w.lok, poz: w.srodek, obr: [0, 0, 0], skala: 1,
      objetosc: w.objetosc, ramka: w.ramka, brep: w.brep,
    };
    const i = this.bryly.indexOf(A);
    this.bryly = this.bryly.filter((b) => b !== A && b !== B);
    this.bryly.splice(Math.min(i, this.bryly.length), 0, wynik);
    await this.silnik.wykonaj('usun', { ids: [A.id, B.id] });
    this.przyZmianie('usunieto', { ids: [A.id, B.id] });
    this.przyZmianie('dodano', { bryla: wynik, siatka: w.siatka });
    return wynik;
  }

  // ---- zmiany bez udziału wątku geometrii ----
  ustawTransformacje(id, { poz, obr, skala }) {
    const b = this.bryla(id);
    if (!b) return;
    if (poz) b.poz = [...poz];
    if (obr) b.obr = [...obr];
    if (skala !== undefined) b.skala = skala;
    this.przyZmianie('zmieniono', { bryla: b });
  }

  async usun(ids) {
    const lista = [].concat(ids);
    this.bryly = this.bryly.filter((b) => !lista.includes(b.id));
    await this.silnik.wykonaj('usun', { ids: lista });
    this.przyZmianie('usunieto', { ids: lista });
  }

  // ---- oryginalny STEP jako elementy złożenia ----
  // czesci: części viewera { nazwa, sciezka, kolor, min, max } w mm układu pliku (jedna pozycja = jedna część z drzewa)
  async wczytajOryginal(bajty, czesci, nazwa) {
    const zachowane = new Uint8Array(bajty);                       // kopia na wypadek restartu wątku
    const bryly = await this.silnik.wykonaj('wczytajOryginal', { bajty: zachowane.slice() });
    const przydzial = dopasujCzesci(bryly, czesci);
    // jedna bryła Szkicownika na jedną część viewera (część może mieć kilka brył); niedopasowane osobno
    const grupy = new Map();
    przydzial.forEach((ci, bi) => {
      const klucz = ci >= 0 ? 'c' + ci : 'x' + bi;
      if (!grupy.has(klucz)) grupy.set(klucz, { czesc: ci >= 0 ? czesci[ci] : null, indeksCzesci: ci, indeksy: [] });
      grupy.get(klucz).indeksy.push(bi);
    });
    this.oryginal = { nazwa: nazwa || 'Oryginał', bajty: zachowane, czesci };
    const nowe = [...grupy.values()].map((g, k) => ({
      id: this.nowyId(), g,
      nazwa: g.czesc ? g.czesc.nazwa : `Bryła niedopasowana ${k + 1}`,
    }));
    const wyniki = await this.silnik.wykonaj('zbudujWiele', {
      pozycje: nowe.map((n) => ({ id: n.id, def: { typ: 'oryginal', indeksy: n.g.indeksy }, wysrodkuj: true, bezSiatki: true })),
    });
    const dodane = nowe.map((n, k) => {
      const w = wyniki[k];
      const b = {
        id: n.id, nazwa: n.nazwa, kolor: (n.g.czesc && n.g.czesc.kolor) || PROJEKT.KOLORY[0], widoczna: true,
        zrodlo: 'oryginal', sciezka: n.g.czesc ? [...n.g.czesc.sciezka] : [], indeksCzesci: n.g.indeksCzesci,
        def: { typ: 'oryginal', indeksy: n.g.indeksy }, lok: w.lok, poz: w.srodek, obr: [0, 0, 0], skala: 1,
        objetosc: w.objetosc, ramka: w.ramka,
      };
      this.bryly.push(b);
      return b;
    });
    this.przyZmianie('oryginal', { bryly: dodane, niedopasowane: przydzial.filter((x) => x < 0).length });
    return { bryly: dodane, niedopasowane: przydzial.filter((x) => x < 0).length };
  }

  // ---- eksport STEP ----
  // zakres: 'wszystko' | 'nowe' | 'oryginal'; ids: tylko te bryły (zaznaczone)
  drzewoEksportu({ zakres = 'wszystko', ids = null } = {}) {
    let lista = this.bryly.filter((b) => (zakres === 'wszystko' || (zakres === 'nowe' ? b.zrodlo === 'nowa' : b.zrodlo === 'oryginal')));
    if (ids) lista = lista.filter((b) => ids.includes(b.id));
    if (!lista.length) throw new Error('Nic do eksportu (brak brył w wybranym zakresie)');
    // wspólny początek ścieżek oryginału = nazwa głównego złożenia
    const oryg = lista.filter((b) => b.zrodlo === 'oryginal');
    let korzen = this.oryginal ? this.oryginal.nazwa : PROJEKT.NAZWA_PROJEKTU;
    let obetnij = 0;
    if (oryg.length && oryg.every((b) => b.sciezka.length && b.sciezka[0] === oryg[0].sciezka[0])) { korzen = oryg[0].sciezka[0]; obetnij = 1; }
    const root = { nazwa: korzen, dzieci: [] };
    for (const b of lista) {
      let sciezka = b.zrodlo === 'oryginal' ? b.sciezka.slice(obetnij) : b.sciezka;
      if (!oryg.length && sciezka[0] === PROJEKT.NAZWA_NOWYCH) sciezka = sciezka.slice(1);   // bez oryginału: nowe bryły od razu w złożeniu
      let w = root;
      for (const n of sciezka) {
        let d = w.dzieci.find((x) => x.dzieci && x.nazwa === n);
        if (!d) { d = { nazwa: n, dzieci: [] }; w.dzieci.push(d); }
        w = d;
      }
      w.dzieci.push({ nazwa: b.nazwa, kolor: b.kolor, id: b.id, def: b.def, lok: b.lok, ...transformacja(b) });
    }
    return root;
  }

  async eksportSTEP(opcje) {
    const w = await this.silnik.wykonaj('eksport', { drzewo: this.drzewoEksportu(opcje) });
    return w.bajty;
  }

  // ---- stan w JSON (zapis projektu) ----
  stanJSON() {
    return {
      wersja: PROJEKT.WERSJA_PLIKU, jednostki: 'mm',
      oryginal: this.oryginal ? { nazwa: this.oryginal.nazwa } : null,
      bryly: this.bryly.map(({ brep, objetosc, ramka, ...b }) => kopia(b)),
    };
  }

  // ---- po restarcie wątku geometrii: wyślij wszystkie bryły od nowa ----
  async odtworzWWatku(silnik) {
    await silnik.wyslijTeraz('odtworz', {
      bryly: this.bryly.map((b) => ({ id: b.id, def: b.def, lok: b.lok, brep: b.brep || null })),
      bajtyOryginalu: this.oryginal ? this.oryginal.bajty.slice() : null,
    });
  }
}
