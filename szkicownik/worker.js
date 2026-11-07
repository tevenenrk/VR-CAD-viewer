// ============================================================================
// SZKICOWNIK BRYŁ — WĄTEK GEOMETRII (Web Worker typu „module”)
// Cała praca OpenCascade dzieje się tutaj; główny wątek tylko rysuje i obsługuje kontrolery.
// Bryły trzymane w pamięci wątku w układzie LOKALNYM (po przesunięciu lok, przed obrotem/położeniem), w mm.
// Protokół: { id, cmd, args } → { id, ok: true, wynik } albo { id, ok: false, blad }
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA (ścieżki względem tego pliku)
// ---------------------------------------------------------------------------
const KONFIG = {
  REPLICAD_URL: './lib/replicad.js',
  OCCT_JS_URL: './lib/replicad_single.js',
  OCCT_WASM_URL: './lib/replicad_single.wasm',
};

import * as G from './geometria.js';

const bryly = new Map();      // id → kształt lokalny
let oryginal = [];            // bryły z wczytanego pliku STEP (układ pliku, mm)
let gotowe = null;

function startuj() {
  if (gotowe) return gotowe;
  gotowe = (async () => {
    const [R, modul] = await Promise.all([
      import(new URL(KONFIG.REPLICAD_URL, import.meta.url).href),
      import(new URL(KONFIG.OCCT_JS_URL, import.meta.url).href),
    ]);
    const wasm = new URL(KONFIG.OCCT_WASM_URL, import.meta.url).href;
    const oc = await modul.default({ locateFile: () => wasm, print: () => {}, printErr: () => {} });
    G.ustawBiblioteke(R, oc);
    return { R, oc };
  })();
  return gotowe;
}

const pobierzOryginal = (indeks) => oryginal[indeks] || null;

function zapamietaj(id, ksztalt) {
  const stary = bryly.get(id);
  if (stary && stary !== ksztalt) { try { stary.delete(); } catch { /* już zwolniony */ } }
  bryly.set(id, ksztalt);
}

function lokalna(id) {
  const s = bryly.get(id);
  if (!s) throw new Error(`Brak bryły „${id}” w wątku geometrii`);
  return s;
}

// Wynik dla głównego wątku: siatka + pomiary, z listą buforów do przekazania bez kopiowania
function pakuj(ksztalt, { bezSiatki = false } = {}) {
  const info = G.sprawdz(ksztalt);
  const w = { objetosc: info.objetosc, liczbaBryl: info.liczbaBryl, poprawna: info.poprawna, ramka: G.ramka(ksztalt), siatka: null };
  const transfer = [];
  if (!bezSiatki) {
    w.siatka = G.siatka(ksztalt);
    for (const k of ['pozycje', 'normalne', 'indeksy', 'krawedzie']) if (w.siatka[k]) transfer.push(w.siatka[k].buffer);
  }
  return { w, transfer };
}

// Buduje bryłę z parametrów; wysrodkuj = przesuń geometrię tak, żeby środek ramki był w początku układu
function zbudujJedna({ id, def, lok, wysrodkuj, bezSiatki }) {
  let s = G.zbudujDef(def, pobierzOryginal);
  let srodek = [0, 0, 0];
  if (wysrodkuj) {
    srodek = G.ramka(s).srodek;
    lok = srodek.map((v) => -v);
  }
  lok = lok || [0, 0, 0];
  if (lok[0] || lok[1] || lok[2]) s = s.translate(lok);
  zapamietaj(id, s);
  const { w, transfer } = pakuj(s, { bezSiatki });
  return { w: { ...w, id, lok, srodek }, transfer };
}

const KOMENDY = {
  async start() {
    const { oc } = await startuj();
    return { wynik: { gotowe: true, ocjs: !!oc } };
  },

  zbuduj(args) {
    const { w, transfer } = zbudujJedna(args);
    return { wynik: w, transfer };
  },

  zbudujWiele({ pozycje }) {
    const wynik = [], transfer = [];
    for (const p of pozycje) {
      const r = zbudujJedna(p);
      wynik.push(r.w); transfer.push(...r.transfer);
    }
    return { wynik, transfer };
  },

  // a, b: { id, poz, obr, skala } — bryły już zbudowane w wątku; wynik zapamiętany pod idWyniku, wyśrodkowany
  boolean({ idWyniku, op, a, b }) {
    const A = G.przeksztalc(lokalna(a.id), a);
    const B = G.przeksztalc(lokalna(b.id), b);
    const r = G.operacjaBoolean(op, A, B);
    const srodek = G.ramka(r.ksztalt).srodek;
    const lok = srodek.map((v) => -v);
    const s = r.ksztalt.translate(lok);
    zapamietaj(idWyniku, s);
    const { w, transfer } = pakuj(s);
    let brep = null;
    try { brep = s.serialize(); } catch { brep = null; }   // szybkie odtworzenie po restarcie wątku
    return { wynik: { ...w, id: idWyniku, lok, srodek, brep }, transfer };
  },

  usun({ ids }) {
    for (const id of ids) { const s = bryly.get(id); if (s) { try { s.delete(); } catch { /* już zwolniony */ } } bryly.delete(id); }
    return { wynik: { liczba: bryly.size } };
  },

  async wczytajOryginal({ bajty }) {
    oryginal.forEach((s) => { try { s.delete(); } catch { /* już zwolniony */ } });
    oryginal = await G.wczytajSTEP(bajty);
    return { wynik: oryginal.map((s, indeks) => ({ indeks, ...G.ramka(s), objetosc: G.objetosc(s) })) };
  },

  // Po restarcie wątku: odtworzenie wszystkich brył (z zapisu BREP albo z parametrów)
  async odtworz({ bryly: lista, bajtyOryginalu }) {
    if (bajtyOryginalu) oryginal = await G.wczytajSTEP(bajtyOryginalu);
    const { R } = await startuj();
    for (const b of lista) {
      let s = null;
      if (b.brep) { try { s = R.deserializeShape(b.brep); } catch { s = null; } }
      if (!s) {
        s = G.zbudujDef(b.def, pobierzOryginal);
        if (b.lok && (b.lok[0] || b.lok[1] || b.lok[2])) s = s.translate(b.lok);
      }
      zapamietaj(b.id, s);
    }
    return { wynik: { liczba: bryly.size } };
  },

  // drzewo: { nazwa, dzieci } / liść { nazwa, kolor, id, def, lok, poz, obr, skala }
  eksport({ drzewo }) {
    const naKsztalty = (w) => {
      if (w.dzieci) return { nazwa: w.nazwa, dzieci: w.dzieci.map(naKsztalty) };
      let lok = bryly.get(w.id);
      if (!lok) {
        lok = G.zbudujDef(w.def, pobierzOryginal);
        if (w.lok) lok = lok.translate(w.lok);
      }
      return { nazwa: w.nazwa, kolor: w.kolor, ksztalt: G.przeksztalc(lok, w) };
    };
    const bajty = G.zapiszSTEP(naKsztalty(drzewo));
    const kopia = bajty.slice();          // własny bufor (nie pamięć WASM) — do przekazania bez kopiowania
    return { wynik: { bajty: kopia }, transfer: [kopia.buffer] };
  },

  // tylko do diagnostyki i testów
  stan() { return { wynik: { ids: [...bryly.keys()], oryginal: oryginal.length } }; },
};

function opisBledu(e) {
  if (e instanceof Error) return e.message;
  if (typeof e === 'number') return 'błąd OpenCascade nr ' + e;
  return String(e);
}

self.onmessage = async (ev) => {
  const { id, cmd, args } = ev.data || {};
  try {
    if (!KOMENDY[cmd]) throw new Error('Nieznane polecenie: ' + cmd);
    await startuj();
    const { wynik, transfer = [] } = await KOMENDY[cmd](args || {});
    self.postMessage({ id, ok: true, wynik }, transfer);
  } catch (e) {
    self.postMessage({ id, ok: false, blad: opisBledu(e) });
  }
};
