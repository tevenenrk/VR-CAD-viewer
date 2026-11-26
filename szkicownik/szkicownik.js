// ============================================================================
// SZKICOWNIK BRYŁ — TRYB W SCENIE (główny wątek)
// Wyświetlanie brył, lista, zaznaczanie, przesuwanie / obracanie / skalowanie ze snapem, panel numeryczny,
// boolean, kopie i grupy, przejęcie oryginalnego STEP jako elementów złożenia, eksport STEP.
// Sterowanie: gogle (kontrolery Quest) albo PC (mysz = promień, klik = spust; uchwyty przesuwu i obrotu; klawiatura).
// Viewer przekazuje tu sterowanie, gdy tryb jest włączony (index.html: szkicownik.wejscieXR / szkicownik.klatka).
// ============================================================================

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { SilnikGeometrii } from './klient.js';
import { Projekt, PROJEKT } from './projekt.js';
import { Panel3D, Uklad, PANEL } from './panel.js';
import { Szkic, SZKIC, przyciagnij as przyciagnijPunkt, kolizja as kolizjaOdcinka, punktyOdcinka, odlOdOdcinka, poJednejStronie, lukStyczny } from './szkic2d.js';

// ---------------------------------------------------------------------------
// KONFIGURACJA
// ---------------------------------------------------------------------------
export const SZK = {
  SIATKA_MM: 10,                  // snap położenia (domyślnie 10 mm)
  SIATKI_MM: [1, 5, 10, 50, 100], // do wyboru w panelu
  KAT_DEG: 15,                    // snap obrotu
  KATY_DEG: [5, 15, 45, 90],
  SKALA_KROK: 0.05,               // snap skali
  SKALA_MIN: 0.05, SKALA_MAX: 50,
  PRZESUNIECIE_KOPII_MM: 50,      // kopia z panelu / Ctrl+D pojawia się obok oryginału (w X); kopia prawym spustem — w miejscu
  KOLOR_PODGLADU: 0x00c7be,       // rozciągana bryła i punkt na czubku kontrolera
  KOLOR_PUNKTU: 0xffd60a,         // punkt na bryle pod promieniem (tu złapiesz)
  KOLOR_CHWYTU: 0x34c759,         // punkt, za który trzymasz bryłę
  ZNACZNIK_ROZMIAR: 0.011,        // promień znacznika jako ułamek odległości od oczu …
  ZNACZNIK_MIN_M: 0.004, ZNACZNIK_MAX_M: 0.03, // … w granicach (m)
  TLO_PRZEZROCZYSTOSC: 0.22,      // przezroczystość modelu z viewera jako tła
  KOLOR_WYBRANEJ: 0xff7a00, JASNOSC_WYBRANEJ: 0.45,
  KOLOR_NAD: 0x1aa3ff, JASNOSC_NAD: 0.3,
  KOLOR_KRAWEDZI: 0x15181d,
  ZASIEG_PROMIENIA_M: 6,
  WIERSZE_LISTY: 6,
  PIVOT_BEZ_MODELU: [0, 1.0, -0.6], // gdzie stoi początek układu CAD, gdy nie ma wczytanego modelu (m)
  SKALA_SCENY_MIN: 0.0005, SKALA_SCENY_MAX: 20,
  SKALA_SCENY_PREDKOSC: 1.2,      // prawa gałka
  STICK_DEADZONE: 0.25,
  ETYKIETA_WYSOKOSC: 0.05,        // wysokość napisu nad bryłą jako ułamek odległości od oczu
  KOMUNIKAT_S: 4,                 // jak długo komunikat wisi w stopce panelu
  HISTORIA_MAX: 40,               // ile kroków można cofnąć (B / Ctrl+Z)
  // szkic 2D
  SZKIC_GRUBOSC_M: 0.0018,        // grubość linii szkicu w goglach (m, niezależnie od skali modelu)
  SZKIC_KOLOR: 0xffffff,          // narysowane odcinki
  SZKIC_KOLOR_GUMKI: 0x00c7be,    // odcinek od ostatniego punktu do kursora
  SZKIC_KOLOR_BLEDU: 0xff3b30,    // przecięcie / błędny odcinek
  SZKIC_KOLOR_OSI: 0xffd60a,      // odcinek wskazany jako oś obrotu
  SZKIC_POLE_SIATKI: 40,          // siatka płaszczyzny szkicu: tyle kratek (krok = snap)
  SZKIC_BLAD_S: 2.5,              // jak długo błędny odcinek świeci na czerwono
  KATY_OBROTU: [360, 270, 180, 90],  // obrót obrysu wokół osi (do wyboru w panelu)
  PROMIEN_ZAOKR_MM: 10,           // zaokrąglenie narożnika szkicu (domyślny promień)
  PROMIENIE_MM: [2, 5, 10, 20, 50],
  // powierzchnie
  GRUBOSC_MM: 5,                  // pogrubienie powierzchni (domyślnie)
  GRUBOSCI_MM: [1, 2, 3, 5, 10, 20],
  KRZYWA_KROK_M: 0.008,           // krzywa / wstążka z ręki: nowy punkt co tyle (m w świecie)
  KOLOR_KRZYWEJ: 0xbf5af2,        // narysowana krzywa (czeka na drugą)
  POWIERZCHNIA_PRZEZROCZYSTOSC: 0.8,
  // belka: bryła od punktu A do B, przekrój prostokąt a × b albo okrąg Ø (mm); gałki: prawa = a / Ø, lewa = b
  BELKA_A_MM: 20, BELKA_B_MM: 20, BELKA_D_MM: 20, BELKA_MIN_MM: 1, BELKA_MAX_MM: 2000,
  BELKA_PREDKOSC: 1.2,            // zmiana wymiaru gałką (na sekundę, mnożnik)
  BELKA_SNAP_DEG: 6,              // kierunek bliski osi X / Y / Z → dokładnie wzdłuż osi
};
const PRYMITYWY = ['prostopadloscian', 'walec', 'kula', 'belka'];
const PLASZCZYZNY = {             // jak GEO.PLASZCZYZNY w geometria.js (u × v = n)
  XY: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  XZ: { u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] },
  YZ: { u: [0, 0, -1], v: [0, 1, 0], n: [1, 0, 0] },
};

// Pola wpisywane przy dodawaniu / zmianie wymiarów. „Góra” = oś góry pliku CAD (Y jak w SolidWorksie albo Z).
function polaTypu(typ, osGory = 'Y') {
  const z = osGory === 'Z';
  return {
    prostopadloscian: [['dx', 'Szerokość X'], ['dy', z ? 'Głębokość Y' : 'Wysokość Y'], ['dz', z ? 'Wysokość Z' : 'Głębokość Z']],
    walec: [['d', 'Średnica Ø'], ['h', 'Wysokość (oś pionowa)']],
    kula: [['d', 'Średnica Ø']],
    wyciagniecie: [['h', 'Wysokość wyciągnięcia']],
    obrot: [['kat', 'Kąt obrotu']],
    pogrubienie: [['grubosc', 'Grubość']],
  }[typ] || null;
}
const NAZWY_OP = { suma: 'Suma', roznica: 'Różnica', wspolna: 'Część wspólna', tnij: 'Cięcie powierzchnią' };
const DEG = Math.PI / 180;

const fmt = (v, miejsc = 2) => {
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v * 10 ** miejsc) / 10 ** miejsc;
  return String(Object.is(r, -0) ? 0 : r).replace('.', ',');
};
const mats = (m) => (Array.isArray(m.material) ? m.material : [m.material]);

// def ↔ pola formularza (średnice zamiast promieni)
function poleZDef(def, pole) {
  if (pole === 'd') return def.r * 2;
  if (pole === 'kat') return def.kat ?? 360;
  return def[pole];
}
function defZPol(typ, wartosci, staraDef) {
  if (typ === 'prostopadloscian') return { typ, dx: wartosci.dx, dy: wartosci.dy, dz: wartosci.dz };
  if (typ === 'walec') return { typ, r: wartosci.d / 2, h: wartosci.h };
  if (typ === 'kula') return { typ, r: wartosci.d / 2 };
  if (typ === 'wyciagniecie') return { ...staraDef, h: wartosci.h };
  if (typ === 'obrot') return { ...staraDef, kat: wartosci.kat };
  if (typ === 'pogrubienie') return { ...staraDef, grubosc: wartosci.grubosc };
  return staraDef;
}

export class Szkicownik {
  constructor(api) {
    this.api = api;
    this.aktywny = false;
    this.silnik = null; this.projekt = null;
    this.stanSilnika = 'brak';     // brak | laduje | gotowy | blad
    this.wezly = new Map();        // id → { holder, mesh, krawedzie, mat, stan }
    this.geoLicznik = new Map();   // własne geometrie: ile węzłów ich używa
    this.zazn = [];                // zaznaczone id (kolejność wyboru)
    this.prowadzaca = null;        // bryła pokazywana w zakładce Edycja
    this.nad = null;               // bryła pod promieniem / kursorem
    this.strona = 'bryly';
    this.przewin = 0;
    this.numpad = null;
    this.oczekujeB = null;         // { op, a } — boolean czeka na wskazanie bryły B
    this.snap = { wl: true, siatka: SZK.SIATKA_MM, kat: SZK.KAT_DEG };
    this.wiele = false;
    this.panelWidoczny = true;
    this.zajety = false;
    this.msg = ''; this.msgCzas = 0;
    this.ostatniEksport = null;
    this.narzedzie = 'wybierz';    // wybierz | prostopadloscian | walec | kula
    this.tworzenie = null;         // rozciągana bryła: { typ, A, B, zrodlo, naPlaszczyznie, plaszczyzna, ksztalt }
    this.podglad = null;
    this.hoverPanelu = null;
    this.ukryjPanelKlatek = 0;
    this.dwieRece = null;
    this.tlo = null;
    this.pc = { wlaczony: false, tc: null, helper: null, mysz: null, nasluch: null };
    this.rc = new THREE.Raycaster();
    this.historia = [];            // cofanie: [{ opis, stan: projekt.migawka(), znacznik }]
    // szkic 2D: { s: Szkic, narz: 'linia'|'luk', faza: 'rysuj'|'wyciagnij'|'os', kursor: [u,v], h, osIdx, blad: {idx, czas} }
    this.szkic = null;
    this.plSzkicu = null;          // płaszczyzna nowego szkicu (domyślnie pozioma wg osi góry)
    this.narzSzkicu = 'linia';
    this.katObrotu = 360;
    this.promienZaokr = SZK.PROMIEN_ZAOKR_MM;
    this.belka = { ksztalt: 'prostokat', a: SZK.BELKA_A_MM, b: SZK.BELKA_B_MM, d: SZK.BELKA_D_MM };
    this.gruboscPow = SZK.GRUBOSC_MM;
    this.krzywe = null;            // powierzchnia między krzywymi: { a: [punkty] | null, biezaca: [punkty] | null, zrodlo }
    this.wstazka = null;           // wstążka z dwóch rąk: { lewa: [], prawa: [] }
    this.krzyweWidok = null;
    this.szkicWidok = null;        // obiekty three.js podglądu szkicu

    this.root = new THREE.Group();             // układ CAD w milimetrach
    this.root.name = 'Szkicownik';
    this.root.userData.szkRoot = true;
    this.powiazania = new Map();               // id bryły → część podglądu, która ją pokazuje poza Szkicownikiem
    this.root.scale.setScalar(0.001);
    this.osGrupa = new THREE.Group();          // obrót osi góry, gdy nie ma modelu
    this.pivotWlasny = new THREE.Group();      // położenie i skala, gdy nie ma modelu
    this.pivotWlasny.position.fromArray(SZK.PIVOT_BEZ_MODELU);
    this.pivotWlasny.add(this.osGrupa);

    this.panel = new Panel3D(THREE);
    this.etykieta = this.utworzEtykiete();
    this.znaczniki = [0, 1, 2, 3].map(() => this.utworzZnacznik());   // dla każdej ręki: punkt na bryle + czubek
  }

  // Wyraźny punkt: kolorowa kulka z ciemną obwódką, zawsze widoczna (także przez bryły)
  utworzZnacznik() {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 20, 12);
    const wnetrze = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    const obwodka = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide, depthTest: false, transparent: true }));
    obwodka.scale.setScalar(1.45);
    wnetrze.renderOrder = 998; obwodka.renderOrder = 997;
    g.add(obwodka, wnetrze);
    g.visible = false;
    g.userData.kolor = wnetrze.material.color;
    return g;
  }

  ustawZnacznik(z, pW, kolor) {
    if (!pW) { z.visible = false; return; }
    if (z.parent !== this.api.scene) this.api.scene.add(z);
    z.position.copy(pW);
    const oko = this.api.viewCamera().getWorldPosition(new THREE.Vector3());
    z.scale.setScalar(Math.min(SZK.ZNACZNIK_MAX_M, Math.max(SZK.ZNACZNIK_MIN_M, oko.distanceTo(pW) * SZK.ZNACZNIK_ROZMIAR)));
    z.userData.kolor.setHex(kolor);
    z.visible = true;
  }

  // ==========================================================================
  // WEJŚCIE / WYJŚCIE
  // ==========================================================================
  async wejdz() {
    if (this.aktywny) return;
    const a = this.api;
    this.aktywny = true;
    this.podepnij();
    try { this.zViewera(); } catch (e) { console.error(e); }      // położenia z podglądu (części mogły być przesunięte)
    this.zastosujTlo(true);
    for (const w of this.wezly.values()) w.holder.visible = this.bryla(w.holder.userData.szkId)?.widoczna !== false;
    for (const c of a.controllers) {
      c.userData.szk = { trigPrev: c.userData.selecting, gripPrev: c.userData.squeezing, hover: null, traf: null, zuzyty: false, chwyt: null };
      c.userData.uiHover = null;
      if (c.userData.cursor) c.userData.cursor.visible = false;
      if (c.userData.grabSphere) c.userData.grabSphere.visible = false;
    }
    if (!a.renderer.xr.isPresenting) this.wlaczPC();
    if (!a.cadRoot && !a.renderer.xr.isPresenting) { a.controls.target.copy(this.pivotWlasny.position); a.controls.update(); }
    a.scene.add(this.etykieta.sprite);
    await this.uruchomSilnik();
  }

  wyjdz() {
    if (!this.aktywny) return;
    this.aktywny = false;
    this.zastosujTlo(false);
    this.wylaczPC();
    this.panel.mesh.removeFromParent();
    this.etykieta.sprite.visible = false;
    this.znaczniki.forEach((z) => { z.visible = false; });
    if (this.szkicWidok) this.szkicWidok.grupa.visible = false;
    if (this.krzyweWidok) this.krzyweWidok.grupa.visible = false;
    this.krzywe = null; this.wstazka = null;
    this.przerwijTworzenie();
    for (const c of this.api.controllers) if (c.userData.szk) c.userData.szk.chwyt = null;
    this.dwieRece = null;
    // bryły trafiają do podglądu jako zwykłe części (chwytanie, skala, kopie, zapis STEP); tu je chowamy
    try { this.doViewera(); } catch (e) { console.error(e); this.api.say('Błąd przenoszenia brył do podglądu: ' + e.message); }
    for (const w of this.wezly.values()) { w.holder.visible = false; this.ustawPodswietlenie(w, ''); }
  }

  // ==========================================================================
  // SYNCHRONIZACJA Z PODGLĄDEM
  // Bryła ↔ część podglądu: ta sama geometria (siatka), a położenie przeliczane w układzie cadRoot:
  //   część: macierz M (geometria → cadRoot, metry);  bryła: H (układ bryły, mm) i C (geometria w węźle bryły)
  //   M = S(0,001) · H · C      H = S(1000) · M · C⁻¹
  // ==========================================================================
  zViewera() {
    const a = this.api;
    if (!a.cadRoot || !this.projekt) return;
    a.cadRoot.updateMatrixWorld(true);
    const cadInv = a.cadRoot.matrixWorld.clone().invert();
    const S1000 = new THREE.Matrix4().makeScale(1000, 1000, 1000);
    const widoczna = (o) => { for (let x = o; x && x !== a.cadRoot; x = x.parent) if (!x.visible) return false; return true; };
    for (const [id, p] of [...this.powiazania]) {
      if (!a.parts.includes(p)) { this.powiazania.delete(id); continue; }
      const b = this.bryla(id), w = this.wezly.get(id);
      if (!b || !w || !w.mesh) continue;
      w.mesh.updateMatrix();
      const H = S1000.clone().multiply(cadInv.clone().multiply(p.mesh.matrixWorld)).multiply(w.mesh.matrix.clone().invert());
      const t = this.zMacierzy(H);
      const r6 = (v) => Math.round(v * 1e6) / 1e6;
      this.projekt.ustawTransformacje(id, { poz: t.poz.map(r6), obr: t.obr.map(r6), skala: r6(t.skala) });
      if (b.widoczna !== widoczna(p.mesh)) this.projekt.ustawWlasciwosci(id, { widoczna: widoczna(p.mesh) });
    }
  }

  doViewera() {
    const a = this.api;
    if (!this.projekt || (!this.projekt.bryly.length && !this.powiazania.size)) return;
    const nowyModel = a.zapewnijCadRoot();
    a.cadRoot.updateMatrixWorld(true);
    const cadInv = a.cadRoot.matrixWorld.clone().invert();
    const S0001 = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
    const ids = new Set(this.projekt.bryly.map((b) => b.id));
    for (const b of this.projekt.bryly) {
      const w = this.wezly.get(b.id);
      if (!w || !w.mesh) continue;
      w.holder.updateMatrix(); w.mesh.updateMatrix();
      const Mcad = S0001.clone().multiply(w.holder.matrix).multiply(w.mesh.matrix);
      const zr = { typ: 'szkic', id: b.id, def: JSON.parse(JSON.stringify(b.def)), lok: [...b.lok], G: w.mesh.matrix.clone().invert().toArray() };
      let p = this.powiazania.get(b.id);
      if (p && !a.parts.includes(p)) p = null;
      if (p) {
        const P = cadInv.clone().multiply(p.mesh.parent.matrixWorld);
        const zeSzkicu = p.zr && p.zr.typ === 'szkic';
        a.ustawCzesc(p, { macierz: P.invert().multiply(Mcad), widoczna: b.widoczna,
                          ...(zeSzkicu ? { geometria: w.mesh.geometry, kolor: b.kolor, nazwa: b.nazwa, zr } : {}) });
      } else {
        p = a.dodajCzescSzkicu({ nazwa: b.nazwa, kolor: b.kolor, geometria: w.mesh.geometry, macierz: Mcad, widoczna: b.widoczna, zr });
        this.powiazania.set(b.id, p);
      }
    }
    for (const [id, p] of [...this.powiazania]) {      // bryły usunięte albo zużyte przez boolean
      if (ids.has(id)) continue;
      this.powiazania.delete(id);
      if (!a.parts.includes(p)) continue;
      if (p.zr && p.zr.typ === 'szkic') a.usunCzesc(p); else a.ukryjCzesc(p);
    }
    if (nowyModel) a.applyUpAxis(); else a.poSynchronizacji();
  }

  async uruchomSilnik() {
    if (!this.silnik) {
      this.silnik = new SilnikGeometrii({ przyRestarcie: (m) => this.powiedz(m + ' — odtwarzam bryły…') });
      this.projekt = new Projekt(this.silnik, { przyZmianie: (z, d) => this.naZmiane(z, d) });
    }
    if (this.stanSilnika === 'gotowy') return;
    this.stanSilnika = 'laduje';
    this.powiedz('Ładowanie geometrii (OpenCascade)… pierwszy raz może potrwać');
    try {
      const t0 = performance.now();
      await this.silnik.start();
      this.stanSilnika = 'gotowy';
      this.powiedz(`Szkicownik gotowy (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      this.stanSilnika = 'blad';
      this.powiedz('Błąd geometrii: ' + e.message);
    }
  }

  gotowy() {
    if (this.stanSilnika === 'gotowy') return true;
    this.powiedz(this.stanSilnika === 'laduje' ? 'Poczekaj — geometria się ładuje' : 'Geometria niedostępna: ' + this.stanSilnika);
    return false;
  }

  // Układ CAD szkicownika: przy wczytanym modelu — razem z modelem (te same współrzędne), bez modelu — własny
  podepnij() {
    const a = this.api;
    const cel = a.cadRoot || this.osGrupa;
    if (this.root.parent !== cel) cel.add(this.root);
    if (!a.cadRoot) {
      if (this.pivotWlasny.parent !== a.scene) a.scene.add(this.pivotWlasny);
      this.osGrupa.rotation.set(a.upAxis === 'Z' ? -Math.PI / 2 : 0, 0, 0);
    }
  }

  pivotSceny() { return this.api.cadRoot ? this.api.pivot : this.pivotWlasny; }

  // Model z viewera jako półprzezroczyste tło; części przejęte do szkicownika — ukryte (pokazuje je szkicownik)
  zastosujTlo(wl) {
    const a = this.api;
    if (wl) {
      if (this.tlo || !a.cadRoot) return;
      this.tlo = { cadRoot: a.cadRoot, mats: [], ukryte: [] };
      for (const p of a.parts) for (const m of mats(p.mesh)) {
        this.tlo.mats.push({ m, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
        m.transparent = true; m.opacity = SZK.TLO_PRZEZROCZYSTOSC; m.depthWrite = false; m.needsUpdate = true;
      }
      this.ukryjPrzejete();
    } else if (this.tlo) {
      for (const s of this.tlo.mats) { s.m.transparent = s.transparent; s.m.opacity = s.opacity; s.m.depthWrite = s.depthWrite; s.m.needsUpdate = true; }
      for (const s of this.tlo.ukryte) s.mesh.visible = s.visible;
      this.tlo = null;
    }
  }

  ukryjPrzejete() {                            // części podglądu pokazywane teraz przez Szkicownik
    if (!this.tlo) return;
    for (const p of this.powiazania.values()) {
      if (!this.api.parts.includes(p) || this.tlo.ukryte.some((s) => s.mesh === p.mesh)) continue;
      this.tlo.ukryte.push({ mesh: p.mesh, visible: p.mesh.visible });
      p.mesh.visible = false;
    }
  }

  // ==========================================================================
  // CO KLATKĘ
  // ==========================================================================
  klatka(dt) {
    if (!this.aktywny) return;                   // np. „Wróć do podglądu” w tej samej klatce
    const a = this.api;
    this.podepnij();
    if (this.tlo && this.tlo.cadRoot !== a.cadRoot) { this.tlo = null; this.zastosujTlo(true); }
    if (!this.tlo && a.cadRoot) this.zastosujTlo(true);
    if (a.renderer.xr.isPresenting && this.pc.wlaczony) this.wylaczPC();
    if (!a.renderer.xr.isPresenting && !this.pc.wlaczony) this.wlaczPC();
    if (this.msgCzas > 0) { this.msgCzas -= dt; if (this.msgCzas <= 0) this.msg = ''; }
    this.ustawPanel();
    this.odswiezPodswietlenia();
    this.odswiezSzkic(dt);
    this.odswiezKrzywe();
    this.aktualizujEtykiete();
    this.panel.odswiez(this.uklad().B, this.hoverPanelu, this.stopka());
  }

  ustawPanel() {
    const a = this.api, m = this.panel.mesh;
    if (a.renderer.xr.isPresenting) {
      const reka = a.offHand();
      if (reka && m.parent !== reka) {
        reka.add(m);
        m.position.fromArray(PANEL.POZ_NA_RECE);
        m.rotation.set(PANEL.NACHYLENIE_DEG * DEG, 0, 0);
        m.scale.setScalar(1);
        m.material.depthTest = true;
        m.renderOrder = 10;
      }
      if (this.ukryjPanelKlatek > 0) this.ukryjPanelKlatek--;
      m.visible = this.panelWidoczny && !!reka && this.ukryjPanelKlatek === 0;
    } else {
      const cam = a.camera;
      if (m.parent !== cam) { cam.add(m); m.material.depthTest = false; m.rotation.set(0, 0, 0); m.renderOrder = 1000; }
      const d = Math.max(PANEL.PC_ODLEGLOSC_M, cam.near * 3);
      const wysWidoku = 2 * d * Math.tan(cam.fov * DEG / 2);
      const wysPanelu = PANEL.SZEROKOSC_M * PANEL.H / PANEL.W;
      const s = PANEL.PC_WYSOKOSC_EKRANU * wysWidoku / wysPanelu;
      m.scale.setScalar(s);
      m.position.set(wysWidoku * cam.aspect / 2 - PANEL.SZEROKOSC_M * s / 2 - wysWidoku * 0.02, 0, -d);
      m.visible = true;
    }
  }

  // ==========================================================================
  // BRYŁY W SCENIE
  // ==========================================================================
  bryla(id) { return this.projekt ? this.projekt.bryla(id) : null; }

  naZmiane(zd, d) {
    if (zd === 'dodano') this.utworzWezel(d.bryla, { siatka: d.siatka });
    else if (zd === 'skopiowano') this.utworzWezel(d.bryla, { wzor: this.wezly.get(d.zrodloId) });
    else if (zd === 'przebudowano') { this.usunWezel(d.bryla.id); this.utworzWezel(d.bryla, { siatka: d.siatka }); }
    else if (zd === 'usunieto') {
      d.ids.forEach((id) => this.usunWezel(id));
      this.zazn = this.zazn.filter((id) => !d.ids.includes(id));
      if (this.oczekujeB && d.ids.includes(this.oczekujeB.a)) this.oczekujeB = null;
    } else if (zd === 'zmieniono') {
      const w = this.wezly.get(d.bryla.id);
      if (w) { this.ustawWezel(d.bryla); w.mat.color.set(d.bryla.kolor); w.holder.visible = d.bryla.widoczna; }
    } else if (zd === 'oryginal') {
      for (const b of d.bryly) this.utworzWezel(b, {});
      this.ukryjPrzejete();
    }
  }

  geometriaZSiatki(s) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(s.pozycje, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(s.normalne, 3));
    g.setIndex(new THREE.BufferAttribute(s.indeksy, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    if (g.computeBoundsTree) g.computeBoundsTree();
    return g;
  }

  uzyjGeo(g) { if (g) this.geoLicznik.set(g, (this.geoLicznik.get(g) || 0) + 1); return g; }
  zwolnijGeo(g) {
    if (!g || !this.geoLicznik.has(g)) return;           // geometria viewera — nie nasza
    const n = this.geoLicznik.get(g) - 1;
    if (n > 0) { this.geoLicznik.set(g, n); return; }
    this.geoLicznik.delete(g);
    if (g.boundsTree) g.disposeBoundsTree();
    g.dispose();
  }

  // siatka: z wątku (mm, układ lokalny) | wzor: węzeł do skopiowania | nic: część oryginału (geometria viewera)
  utworzWezel(b, { siatka = null, wzor = null }) {
    const holder = new THREE.Group();
    holder.name = b.nazwa;
    holder.userData.szkId = b.id;
    const mat = new THREE.MeshStandardMaterial({ color: b.kolor, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
                                                 polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    if (b.def.typ === 'powierzchnia') { mat.transparent = true; mat.opacity = SZK.POWIERZCHNIA_PRZEZROCZYSTOSC; mat.depthWrite = false; }
    let mesh = null, krawedzie = null;
    if (siatka) {
      mesh = new THREE.Mesh(this.uzyjGeo(this.geometriaZSiatki(siatka)), mat);
      if (siatka.krawedzie && siatka.krawedzie.length) {
        const ge = new THREE.BufferGeometry();
        ge.setAttribute('position', new THREE.BufferAttribute(siatka.krawedzie, 3));
        krawedzie = new THREE.LineSegments(this.uzyjGeo(ge), new THREE.LineBasicMaterial({ color: SZK.KOLOR_KRAWEDZI }));
      }
    } else if (wzor) {
      mesh = new THREE.Mesh(this.uzyjGeo(wzor.mesh.geometry), mat);
      mesh.position.copy(wzor.mesh.position); mesh.scale.copy(wzor.mesh.scale);
      if (wzor.krawedzie) krawedzie = new THREE.LineSegments(this.uzyjGeo(wzor.krawedzie.geometry), wzor.krawedzie.material);
    } else if (b.zrodlo === 'oryginal' && b.indeksCzesci >= 0 && this.api.parts[b.indeksCzesci]) {
      // geometria części z viewera (metry, układ pliku) → mm i przesunięcie lok
      mesh = new THREE.Mesh(this.api.parts[b.indeksCzesci].mesh.geometry, mat);
      mesh.position.fromArray(b.lok);
      mesh.scale.setScalar(1000);
    } else {
      // część niedopasowana albo brak geometrii viewera → siatka z wątku geometrii
      this.silnik.wykonaj('zbuduj', { id: b.id, def: b.def, lok: b.lok }).then((w) => {
        if (this.bryla(b.id) && !this.wezly.get(b.id)?.mesh) { this.usunWezel(b.id); this.utworzWezel(b, { siatka: w.siatka }); }
      }).catch((e) => this.powiedz('Błąd siatki: ' + e.message));
    }
    if (mesh) { mesh.userData.szkId = b.id; holder.add(mesh); }
    if (krawedzie) holder.add(krawedzie);
    this.root.add(holder);
    const w = { holder, mesh, krawedzie, mat, stan: null };
    this.wezly.set(b.id, w);
    this.ustawWezel(b);
    holder.visible = b.widoczna;
    return w;
  }

  usunWezel(id) {
    const w = this.wezly.get(id);
    if (!w) return;
    if (this.pc.tc && this.pc.tc.object === w.holder) this.pc.tc.detach();
    w.holder.removeFromParent();
    if (w.mesh) this.zwolnijGeo(w.mesh.geometry);
    if (w.krawedzie) this.zwolnijGeo(w.krawedzie.geometry);
    w.mat.dispose();
    this.wezly.delete(id);
  }

  ustawWezel(b) {
    const w = this.wezly.get(b.id);
    if (!w) return;
    w.holder.position.fromArray(b.poz);
    w.holder.rotation.set(b.obr[0] * DEG, b.obr[1] * DEG, b.obr[2] * DEG, 'XYZ');
    w.holder.scale.setScalar(b.skala);
    w.holder.name = b.nazwa;
  }

  ustawPodswietlenie(w, stan) {
    if (w.stan === stan) return;
    w.stan = stan;
    const [kol, jas] = stan === 'w' ? [SZK.KOLOR_WYBRANEJ, SZK.JASNOSC_WYBRANEJ] : stan === 'n' ? [SZK.KOLOR_NAD, SZK.JASNOSC_NAD] : [0, 1];
    w.mat.emissive.setHex(kol); w.mat.emissiveIntensity = jas;
  }

  odswiezPodswietlenia() {
    for (const [id, w] of this.wezly) this.ustawPodswietlenie(w, this.zazn.includes(id) ? 'w' : this.nad === id ? 'n' : '');
  }

  trafBryle(raycaster) {
    const lista = [];
    for (const w of this.wezly.values()) if (w.mesh && w.holder.visible) lista.push(w.mesh);
    if (!lista.length) return null;
    raycaster.firstHitOnly = true;
    raycaster.far = SZK.ZASIEG_PROMIENIA_M;
    const h = raycaster.intersectObjects(lista, false)[0];
    raycaster.far = Infinity;
    return h ? { id: h.object.userData.szkId, point: h.point, distance: h.distance } : null;
  }

  // ==========================================================================
  // ZAZNACZANIE
  // ==========================================================================
  zGrupa(id) {
    const b = this.bryla(id);
    return b && b.grupa ? this.projekt.czlonkowie(b.grupa).map((x) => x.id) : [id];
  }

  wybierz(id) {
    if (this.oczekujeB) { this.wskazanoB(id); return; }
    const ids = this.zGrupa(id);
    if (this.wiele) {
      if (this.zazn.includes(id)) this.zazn = this.zazn.filter((x) => !ids.includes(x));
      else this.zazn = [...this.zazn.filter((x) => !ids.includes(x)), ...ids];
    } else this.zazn = [...ids];
    this.prowadzaca = this.zazn.includes(id) ? id : (this.zazn[this.zazn.length - 1] || null);
    this.przypnijUchwyty();
    const b = this.bryla(id);
    if (b && this.zazn.includes(id)) this.powiedz('Wybrano: ' + b.nazwa + (b.grupa ? ` (${this.projekt.grupa(b.grupa).nazwa})` : ''));
  }

  odznacz() {
    if (this.oczekujeB) { this.oczekujeB = null; this.powiedz('Anulowano operację'); return; }
    this.zazn = []; this.prowadzaca = null;
    this.przypnijUchwyty();
  }

  wybrana() {
    if (!this.zazn.length) return null;
    return this.bryla(this.zazn.includes(this.prowadzaca) ? this.prowadzaca : this.zazn[this.zazn.length - 1]);
  }

  // ==========================================================================
  // DZIAŁANIA
  // ==========================================================================
  powiedz(t) {
    this.msg = t; this.msgCzas = SZK.KOMUNIKAT_S;
    this.api.say(t);
  }

  // historia: opis kroku do cofnięcia (stan sprzed operacji); przy błędzie krok jest wycofywany z historii
  async zadanie(opis, fn, historia = null) {
    if (this.zajety) { this.powiedz('Poczekaj — trwa poprzednia operacja'); return null; }
    if (!this.gotowy()) return null;
    this.zajety = true;
    if (opis) this.powiedz(opis);
    const wpis = historia ? this.zapiszHistorie(historia) : null;
    try { return await fn(); }
    catch (e) { if (wpis) this.historia = this.historia.filter((h) => h !== wpis); this.powiedz(e.message); return null; }
    finally { this.zajety = false; }
  }

  // ==========================================================================
  // COFANIE: przed każdą zmianą migawka projektu; B / Ctrl+Z / przycisk przywraca ostatnią
  // ==========================================================================
  zapiszHistorie(opis, znacznik = null) {
    if (!this.projekt) return null;
    const wpis = { opis, stan: this.projekt.migawka(), znacznik };
    this.historia.push(wpis);
    if (this.historia.length > SZK.HISTORIA_MAX) this.historia.shift();
    return wpis;
  }

  // ruch bez zmiany (np. chwyt i puszczenie w miejscu) nie zostaje w historii
  porzucJesliBezZmian(znacznik, ids) {
    const h = this.historia[this.historia.length - 1];
    if (!h || h.znacznik !== znacznik) return;
    const t = (b) => b && JSON.stringify([b.poz, b.obr, b.skala]);
    if (ids.every((id) => t(h.stan.bryly.find((b) => b.id === id)) === t(this.bryla(id)))) this.historia.pop();
  }

  cofnij() {
    if (this.szkic && this.szkicCofnij()) return null;
    if (this.trzymane()) { this.powiedz('Puść bryłę, żeby cofnąć'); return null; }
    if (this.zajety) { this.powiedz('Poczekaj — trwa poprzednia operacja'); return null; }
    if (!this.historia.length) { this.powiedz('Nie ma czego cofać'); return null; }
    const h = this.historia.pop();
    return this.zadanie('Cofam…', async () => {
      try { await this.projekt.przywroc(h.stan); }
      catch (e) { this.historia.push(h); throw e; }
      this.oczekujeB = null;
      this.zazn = this.zazn.filter((id) => this.bryla(id));
      if (!this.zazn.includes(this.prowadzaca)) this.prowadzaca = this.zazn[0] || null;
      this.przypnijUchwyty();
      this.powiedz(`Cofnięto: ${h.opis}` + (this.historia.length ? ` (zostało ${this.historia.length})` : ''));
      return h;
    });
  }

  // ==========================================================================
  // TWORZENIE BRYŁ ROZCIĄGANIEM (jak w Gravity Sketch): spust w punkcie A, przeciągnij do B, puść
  // ==========================================================================
  ustawNarzedzie(n) {
    this.narzedzie = n;
    this.przerwijTworzenie();
    this.przypnijUchwyty();
    const vr = this.api.renderer.xr.isPresenting;
    this.krzywe = null; this.wstazka = null;
    if (n === 'szkic') { this.zacznijSzkic(); this.powiedz(`Szkic na płaszczyźnie ${this.plaszczyznaSzkicu()}: ` + (vr ? 'spust = punkt' : 'klik = punkt')); return; }
    if (n === 'krzywe') { this.krzywe = { a: null, biezaca: null, zrodlo: null }; this.powiedz(vr ? 'Krzywa 1: trzymaj spust i prowadź rękę, puść = koniec' : 'Krzywa 1: klikaj punkty, Enter = koniec krzywej'); return; }
    if (n === 'wstazka') { this.powiedz(vr ? 'Wstążka: trzymaj OBA spusty i prowadź ręce — powierzchnia rozpina się między nimi' : 'Wstążka działa w goglach (dwie ręce)'); return; }
    if (n === 'belka') { this.powiedz(`${this.belkaTekst()}: ` + (vr ? 'spust w A, przeciągnij do B, puść · gałki = wymiary' : 'przeciągnij myszą od A do B')); return; }
    this.powiedz(n === 'wybierz' ? 'Narzędzie: wybierz / chwyć'
      : `${PROJEKT.NAZWY[n]}: ` + (vr ? 'spust w punkcie początkowym, przeciągnij, puść' : 'przeciągnij myszą (Esc = wybierz)'));
  }

  belkaTekst() {
    const B = this.belka;
    return B.ksztalt === 'okrag' ? `Belka Ø ${fmt(B.d, 1)} mm` : `Belka ${fmt(B.a, 1)} × ${fmt(B.b, 1)} mm`;
  }

  zmienBelke(wymiar, f, przycisk = false) {
    const v = Math.min(SZK.BELKA_MAX_MM, Math.max(SZK.BELKA_MIN_MM, this.belka[wymiar] * f));
    this.belka[wymiar] = przycisk ? Math.max(SZK.BELKA_MIN_MM, Math.round(v)) : v;
  }

  osGoryIndeks() { return this.api.upAxis === 'Z' ? 2 : 1; }
  krok() { return this.snap.wl ? this.snap.siatka : 1; }
  naSiatke(p) { const g = this.krok(); return p.map((v) => Math.round(v / g) * g); }
  swiatDoCad(pW) { this.root.updateMatrixWorld(true); return this.root.worldToLocal(pW.clone()).toArray(); }
  cadDoSwiata(p) { this.root.updateMatrixWorld(true); return this.root.localToWorld(new THREE.Vector3(...p)); }
  czubek(c) { const v = new THREE.Vector3(); return c.userData.tip ? c.userData.tip.getWorldPosition(v) : c.getWorldPosition(v); }

  // Bryła z dwóch punktów (mm CAD, na siatce). naPlaszczyznie = PC: B leży na płaszczyźnie startu, wysokość dobierana sama
  ksztaltZPunktow(typ, A, B, naPlaszczyznie) {
    if (typ === 'belka') return this.ksztaltBelki(A, B);
    const g = this.krok();
    const u = this.osGoryIndeks(), [h0, h1] = [0, 1, 2].filter((i) => i !== u);
    const d = [0, 1, 2].map((i) => B[i] - A[i]);
    if (Math.max(...d.map(Math.abs)) < g * 0.999) return null;     // jeszcze nie rozciągnięto
    const zaokr = (v) => Math.max(g, Math.round(Math.abs(v) / g) * g);
    if (typ === 'prostopadloscian') {
      if (naPlaszczyznie) d[u] = Math.min(Math.abs(d[h0]) || g, Math.abs(d[h1]) || g);
      const w = d.map(zaokr);
      const poz = [0, 1, 2].map((i) => A[i] + Math.sign(d[i] || 1) * w[i] / 2);
      return { def: { typ, dx: w[0], dy: w[1], dz: w[2] }, poz, obr: [0, 0, 0], opis: `${fmt(w[0])} × ${fmt(w[1])} × ${fmt(w[2])} mm` };
    }
    if (typ === 'walec') {                       // A = środek podstawy, odległość w poziomie = promień, w pionie = wysokość
      const D = zaokr(2 * Math.hypot(d[h0], d[h1]));
      const plaski = naPlaszczyznie || Math.abs(d[u]) < g;
      const h = plaski ? D : zaokr(d[u]);
      const poz = [...A]; poz[u] += (plaski ? 1 : Math.sign(d[u])) * h / 2;
      return { def: { typ, r: D / 2, h }, poz, obr: u === 2 ? [90, 0, 0] : [0, 0, 0], opis: `Ø${fmt(D)} × ${fmt(h)} mm` };
    }
    const D = zaokr(2 * Math.hypot(...d));       // kula: A = środek, odległość = promień
    const poz = [...A]; if (naPlaszczyznie) poz[u] += D / 2;
    return { def: { typ: 'kula', r: D / 2 }, poz, obr: [0, 0, 0], opis: `Ø${fmt(D)} mm` };
  }

  // Belka od A do B (mm CAD): długość na siatce, kierunek bliski osi → wzdłuż osi; bok a poziomo, bok b „w górę”
  ksztaltBelki(A, B) {
    const g = this.krok();
    const d = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    let L = d.length();
    if (L < g * 0.999) return null;
    d.normalize();
    for (const os of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
      const cos = d.dot(os);
      if (Math.abs(cos) > Math.cos(SZK.BELKA_SNAP_DEG * DEG)) { d.copy(os).multiplyScalar(Math.sign(cos)); break; }
    }
    L = Math.max(g, Math.round(L / g) * g);
    const up = new THREE.Vector3(0, 0, 0); up.setComponent(this.osGoryIndeks(), 1);
    const x = new THREE.Vector3().crossVectors(d, up);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0); else x.normalize();
    const z = new THREE.Vector3().crossVectors(x, d).normalize();
    x.crossVectors(d, z).normalize();
    const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, d, z), 'XYZ');
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const obr = [e.x, e.y, e.z].map((v) => r6(v / DEG));
    const okr = this.belka.ksztalt === 'okrag';
    const a = Math.round(okr ? this.belka.d : this.belka.a), b = Math.round(this.belka.b);
    const poz = [0, 1, 2].map((i) => r6(A[i] + d.getComponent(i) * L / 2));
    const def = okr ? { typ: 'walec', r: a / 2, h: L } : { typ: 'prostopadloscian', dx: a, dy: L, dz: b };
    return { def, poz, obr, nazwa: 'Belka', opis: (okr ? `Ø${fmt(a)}` : `${fmt(a)} × ${fmt(b)}`) + ` · L = ${fmt(L)} mm` };
  }

  zacznijTworzenie(A, zrodlo, naPlaszczyznie = false, plaszczyzna = null) {
    this.tworzenie = { typ: this.narzedzie, A, B: [...A], zrodlo, naPlaszczyznie, plaszczyzna, ksztalt: null };
    if (this.pc.tc) this.pc.tc.detach();
    this.pokazPodglad();
  }

  ciagnijTworzenie(B) {
    const t = this.tworzenie;
    if (!t) return;
    t.B = B;
    t.ksztalt = this.ksztaltZPunktow(t.typ, t.A, B, t.naPlaszczyznie);
    this.pokazPodglad();
  }

  zakonczTworzenie() {
    const t = this.tworzenie;
    this.tworzenie = null;
    this.pokazPodglad();
    if (!t) return null;
    if (!t.ksztalt) { this.powiedz('Za krótko — przeciągnij dalej, żeby nadać wymiar'); this.przypnijUchwyty(); return null; }
    const k = t.ksztalt;
    return this.zadanie(null, async () => {
      const nazwa = k.nazwa ? `${k.nazwa} ${this.projekt.bryly.filter((x) => x.nazwa.startsWith(k.nazwa + ' ')).length + 1}` : undefined;
      const b = await this.projekt.dodaj(k.def, { poz: k.poz, obr: k.obr, nazwa });
      this.wiele = false; this.zazn = [b.id]; this.prowadzaca = b.id; this.przypnijUchwyty();
      this.powiedz(`Dodano: ${b.nazwa}  ${k.opis}`);
      return b;
    }, 'dodanie bryły');
  }

  przerwijTworzenie() { this.tworzenie = null; this.pokazPodglad(); }

  pokazPodglad() {
    if (!this.podglad) {
      const mat = new THREE.MeshBasicMaterial({ color: SZK.KOLOR_PODGLADU, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
      const geo = { prostopadloscian: new THREE.BoxGeometry(1, 1, 1), walec: new THREE.CylinderGeometry(1, 1, 1, 48), kula: new THREE.SphereGeometry(1, 32, 16) };
      const kr = { prostopadloscian: new THREE.EdgesGeometry(geo.prostopadloscian), walec: new THREE.EdgesGeometry(geo.walec, 30), kula: null };
      const mesh = new THREE.Mesh(geo.prostopadloscian, mat);
      const lin = new THREE.LineSegments(kr.prostopadloscian, new THREE.LineBasicMaterial({ color: SZK.KOLOR_PODGLADU }));
      const grupa = new THREE.Group();
      grupa.add(mesh, lin);
      grupa.visible = false;
      this.podglad = { grupa, mesh, lin, geo, kr };
    }
    const P = this.podglad, k = this.tworzenie && this.tworzenie.ksztalt;
    if (P.grupa.parent !== this.root) this.root.add(P.grupa);
    P.grupa.visible = !!k;
    if (!k) return;
    const d = k.def;
    P.mesh.geometry = P.geo[d.typ];
    P.lin.visible = !!P.kr[d.typ];
    if (P.kr[d.typ]) P.lin.geometry = P.kr[d.typ];
    if (d.typ === 'prostopadloscian') P.grupa.scale.set(d.dx, d.dy, d.dz);
    else if (d.typ === 'walec') P.grupa.scale.set(d.r, d.h, d.r);
    else P.grupa.scale.setScalar(d.r);
    P.grupa.position.fromArray(k.poz);
    P.grupa.rotation.set(k.obr[0] * DEG, k.obr[1] * DEG, k.obr[2] * DEG);
  }

  // ==========================================================================
  // TRZYMANA BRYŁA: prawy spust = kopia w miejscu, A = usuń
  // ==========================================================================
  trzymane() {
    for (const c of this.api.controllers) { const cel = c.userData.szk && c.userData.szk.chwyt; if (cel && cel.typ === 'bryly') return cel; }
    return null;
  }

  kopiujTrzymane() {
    const cel = this.trzymane();
    if (!cel) return null;
    return this.zadanie(null, async () => {
      const k = await this.projekt.kopiuj(cel.ids, [0, 0, 0]);
      this.powiedz(`Kopia zostaje w miejscu: ${k.map((b) => b.nazwa).join(', ')}`);
      return k;
    }, 'kopia');
  }

  usunTrzymane() {
    const cel = this.trzymane();
    if (!cel) return null;
    for (const c of this.api.controllers) if (c.userData.szk && c.userData.szk.chwyt === cel) c.userData.szk.chwyt = null;
    this.dwieRece = null;
    const ids = cel.ids.filter((id) => this.bryla(id));
    return this.zadanie(null, async () => {
      await this.projekt.usun(ids);
      this.zazn = this.zazn.filter((x) => !ids.includes(x));
      this.przypnijUchwyty();
      this.powiedz(`Usunięto: ${ids.length} (B = cofnij)`);
    }, 'usunięcie');
  }

  zmienWymiar(b) {
    const pola = polaTypu(b.def.typ, this.api.upAxis);
    if (!pola) { this.powiedz('Ta bryła nie ma wymiarów — użyj skali'); return; }
    this.otworzNumpad({
      tytul: `${b.nazwa}: wymiary`,
      pola: pola.map(([k, et]) => ({ klucz: k, etykieta: et, wartosc: poleZDef(b.def, k), jednostka: k === 'kat' ? '°' : 'mm', dodatnia: k !== 'h' && k !== 'grubosc' })),
      gotowe: (w) => this.zadanie('Przeliczam bryłę…', async () => {
        await this.projekt.zmienDef(b.id, defZPol(b.def.typ, w, b.def));
        this.powiedz(`Zmieniono wymiary: ${b.nazwa}`);
      }, 'zmiana wymiarów'),
    });
  }

  zmienTransformacje(b, rodzaj, os) {
    const nazwyOsi = ['X', 'Y', 'Z'];
    const pole = rodzaj === 'skala'
      ? { klucz: 'skala', etykieta: 'Skala (1 = bez zmiany)', wartosc: b.skala, jednostka: '×', dodatnia: true }
      : { klucz: 'v', etykieta: (rodzaj === 'poz' ? 'Położenie środka ' : 'Obrót wokół osi ') + nazwyOsi[os],
          wartosc: rodzaj === 'poz' ? b.poz[os] : b.obr[os], jednostka: rodzaj === 'poz' ? 'mm' : '°' };
    this.otworzNumpad({
      tytul: b.nazwa, pola: [pole],
      gotowe: (w) => {
        this.zapiszHistorie(rodzaj === 'skala' ? 'skala' : rodzaj === 'poz' ? 'przesunięcie' : 'obrót');
        if (rodzaj === 'skala') this.projekt.ustawTransformacje(b.id, { skala: Math.min(SZK.SKALA_MAX, w.skala) });
        else { const t = [...b[rodzaj]]; t[os] = w.v; this.projekt.ustawTransformacje(b.id, { [rodzaj]: t }); }
      },
    });
  }

  operacja(op) {
    if (this.oczekujeB && this.oczekujeB.op === op) { this.oczekujeB = null; this.powiedz('Anulowano operację'); return; }
    if (this.wiele && this.zazn.length === 2) { this.wykonajBoolean(this.zazn[0], this.zazn[1], op); return; }
    const A = this.wybrana();
    if (!A) { this.powiedz('Najpierw wybierz bryłę A'); return; }
    this.oczekujeB = { op, a: A.id };
    this.powiedz(`${NAZWY_OP[op]}: A = ${A.nazwa}. Wskaż bryłę B`);
  }

  wskazanoB(id) {
    const { op, a } = this.oczekujeB;
    if (id === a) { this.powiedz(op === 'tnij' ? 'Wskaż bryłę do pocięcia (nie powierzchnię)' : 'Wskaż inną bryłę jako B'); return; }
    if (op === 'tnij') {
      if (this.bryla(id) && this.bryla(id).def.typ === 'powierzchnia') { this.powiedz('To powierzchnia — wskaż bryłę do pocięcia'); return; }
      this.oczekujeB = null;
      this.wykonajPodzial(id, a);
      return;
    }
    this.oczekujeB = null;
    this.wykonajBoolean(a, id, op);
  }

  wykonajBoolean(a, b, op) {
    const A = this.bryla(a), B = this.bryla(b);
    return this.zadanie(`${NAZWY_OP[op]}: liczę…`, async () => {
      const w = await this.projekt.boolean(a, b, op);
      this.zazn = [w.id]; this.prowadzaca = w.id; this.przypnijUchwyty();
      this.powiedz(`${NAZWY_OP[op]} gotowa: ${A.nazwa} ${PROJEKT.ZNAK_OPERACJI[op]} ${B.nazwa} (${fmt(w.objetosc / 1000, 1)} cm³)`);
      return w;
    }, NAZWY_OP[op].toLowerCase());
  }

  kopiuj() {
    if (!this.zazn.length) { this.powiedz('Wybierz bryłę do skopiowania'); return null; }
    return this.zadanie('Kopiuję…', async () => {
      const kopie = await this.projekt.kopiuj(this.zazn, [SZK.PRZESUNIECIE_KOPII_MM, 0, 0]);
      this.zazn = kopie.map((b) => b.id); this.prowadzaca = this.zazn[0]; this.przypnijUchwyty();
      this.powiedz(`Skopiowano: ${kopie.length}`);
      return kopie;
    }, 'kopia');
  }

  usun() {
    if (!this.zazn.length) { this.powiedz('Wybierz bryłę do usunięcia'); return null; }
    const ids = [...this.zazn];
    return this.zadanie(null, async () => {
      await this.projekt.usun(ids);
      this.zazn = []; this.prowadzaca = null; this.przypnijUchwyty();
      this.powiedz(`Usunięto: ${ids.length} (B = cofnij)`);
    }, 'usunięcie');
  }

  grupuj() {
    const wpis = this.zazn.length >= 2 ? this.zapiszHistorie('grupowanie') : null;
    try {
      const g = this.projekt.grupuj(this.zazn);
      this.powiedz(`Utworzono ${g.nazwa} (${this.zazn.length} brył) — chwytasz i eksportujesz ją razem`);
    } catch (e) { if (wpis) this.historia = this.historia.filter((h) => h !== wpis); this.powiedz(e.message); }
  }

  rozgrupuj() {
    if (!this.zazn.length) { this.powiedz('Wybierz bryłę z grupy'); return; }
    if (!this.zazn.some((id) => this.bryla(id)?.grupa)) { this.powiedz('Zaznaczone bryły nie są w grupie'); return; }
    this.zapiszHistorie('rozgrupowanie');
    this.projekt.rozgrupuj(this.zazn);
    this.powiedz('Rozgrupowano');
  }

  // Oryginalny STEP z viewera → elementy złożenia szkicownika (prawdziwe bryły, nazwy z drzewa viewera)
  // Pliki z podglądu (STEP / STL) → elementy złożenia Szkicownika (prawdziwe bryły, nazwy z drzewa podglądu)
  plikiDoPrzejecia() {
    return (this.api.pliki || []).filter((f) => f.format !== 'iges' && !(this.projekt && this.projekt.pliki[f.id]));
  }

  przejmijOryginal() {
    const a = this.api;
    if (!a.cadRoot || !(a.pliki || []).length) { this.powiedz('Najpierw wczytaj model STEP / STL w podglądzie'); return null; }
    const lista = this.plikiDoPrzejecia();
    if (!lista.length) { this.powiedz('Części z plików są już przejęte'); return null; }
    return this.zadanie('Przejmuję części (odczyt brył STEP)…', async () => {
      let razem = 0, niedopasowane = 0, kopii = 0;
      for (const f of lista) {
        const bajty = new Uint8Array(await f.blob.arrayBuffer());
        // tylko części z tego pliku (bez kopii) mogą dostać bryły — reszta ma ramkę „nigdzie”
        const czesci = a.parts.map((p) => {
          const wlasna = p.zr && p.zr.typ === 'plik' && p.zr.plik === f.id && !p.kopia;
          const bb = p.mesh.geometry.boundingBox;
          return { nazwa: p.name, sciezka: p.path.slice(0, -1), kolor: '#' + mats(p.mesh)[0].color.getHexString(),
                   min: wlasna ? bb.min.toArray().map((v) => v * 1000) : [Infinity, Infinity, Infinity],
                   max: wlasna ? bb.max.toArray().map((v) => v * 1000) : [-Infinity, -Infinity, -Infinity] };
        });
        const w = await this.projekt.wczytajOryginal(bajty, czesci, f.nazwa.replace(/\.[^.]+$/, ''), f.id, f.format);
        for (const b of w.bryly) if (b.indeksCzesci >= 0 && a.parts[b.indeksCzesci]) this.powiazania.set(b.id, a.parts[b.indeksCzesci]);
        razem += w.bryly.length; niedopasowane += w.niedopasowane;
      }
      // kopie zrobione w podglądzie
      const powiazane = () => new Set(this.powiazania.values());
      for (const p of a.parts) {
        if (!p.kopia || !p.zr || p.zr.typ !== 'plik' || powiazane().has(p)) continue;
        let m = p.mesh; while (m.userData.kopiaZ) m = m.userData.kopiaZ;
        const zr = [...this.powiazania].find(([, q]) => q.mesh === m);
        if (!zr) continue;
        const [k] = await this.projekt.kopiuj([zr[0]], [0, 0, 0]);
        this.projekt.ustawWlasciwosci(k.id, { nazwa: p.name });
        this.powiazania.set(k.id, p);
        kopii++;
      }
      this.zViewera();                           // położenia i widoczność z podglądu
      this.ukryjPrzejete();
      this.historia = [];                        // przejęcia nie da się cofnąć — historia zaczyna się od tego miejsca
      this.powiedz(`Przejęto ${razem} części` + (kopii ? ` + ${kopii} kopii` : '') + (niedopasowane ? ` (bez nazwy: ${niedopasowane})` : ''));
      return { razem, kopii };
    });
  }

  eksport(zakres) {
    const ids = zakres === 'zaznaczone' ? [...this.zazn] : null;
    if (zakres === 'zaznaczone' && !ids.length) { this.powiedz('Nic nie jest zaznaczone'); return null; }
    return this.zadanie('Zapis STEP…', async () => {
      const bajty = await this.projekt.eksportSTEP({ zakres: ids ? 'wszystko' : zakres, ids });
      const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
      const baza = (this.projekt.oryginal ? this.projekt.oryginal.nazwa : 'szkicownik').replace(/[^\w\-]+/g, '_');
      const nazwa = `${baza}_${zakres}_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}.step`;
      this.pobierz(bajty, nazwa);
      this.ostatniEksport = { nazwa, rozmiar: bajty.length };
      this.powiedz(`Zapisano ${nazwa} (${fmt(bajty.length / 1024, 0)} kB)`);
      return bajty;
    });
  }

  pobierz(bajty, nazwa) {
    const url = URL.createObjectURL(new Blob([bajty], { type: 'application/step' }));
    const link = document.createElement('a');
    link.href = url; link.download = nazwa;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ==========================================================================
  // POŁOŻENIE / OBRÓT / SKALA (macierze w układzie CAD mm) I SNAP
  // ==========================================================================
  macierz(t) {
    return new THREE.Matrix4().compose(new THREE.Vector3(...t.poz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(t.obr[0] * DEG, t.obr[1] * DEG, t.obr[2] * DEG, 'XYZ')),
      new THREE.Vector3(t.skala, t.skala, t.skala));
  }

  zMacierzy(m) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    return { poz: p.toArray(), obr: [e.x / DEG, e.y / DEG, e.z / DEG], skala: (s.x + s.y + s.z) / 3 };
  }

  // Snap ruchu względem położenia startowego: przesunięcie co krok siatki, obrót do pełnych kątów, skala co krok
  przyciagnij(t, start) {
    if (!this.snap.wl) return t;
    const g = this.snap.siatka, k = this.snap.kat;
    const poz = t.poz.map((v, i) => start.poz[i] + Math.round((v - start.poz[i]) / g) * g);
    const qs = new THREE.Quaternion().setFromEuler(new THREE.Euler(...start.obr.map((v) => v * DEG), 'XYZ'));
    const qt = new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.obr.map((v) => v * DEG), 'XYZ'));
    const obr = qs.angleTo(qt) < (k / 2) * DEG ? [...start.obr] : t.obr.map((v) => Math.round(v / k) * k);
    const skala = Math.abs(t.skala / start.skala - 1) < 0.01 ? start.skala
      : Math.min(SZK.SKALA_MAX, Math.max(SZK.SKALA_MIN, Math.round(t.skala / SZK.SKALA_KROK) * SZK.SKALA_KROK));
    return { poz, obr, skala };
  }

  // Zastosuj przekształcenie D (świat) do trzymanych brył; pierwsza bryła jest przyciągana, reszta podąża sztywno
  zastosujDelta(cel, D) {
    if (cel.typ === 'scena') {
      const piv = this.pivotSceny();
      new THREE.Matrix4().multiplyMatrices(D, cel.w0[0]).decompose(piv.position, piv.quaternion, piv.scale);
      const s = Math.min(SZK.SKALA_SCENY_MAX, Math.max(SZK.SKALA_SCENY_MIN, piv.scale.x));
      piv.scale.setScalar(s);
      return;
    }
    this.root.updateMatrixWorld(true);
    const rootInv = this.root.matrixWorld.clone().invert();
    const lokalne = cel.ids.map((id, i) => rootInv.clone().multiply(D).multiply(cel.w0[i]));
    const tLead = this.zMacierzy(lokalne[0]);
    const tSnap = this.przyciagnij(tLead, cel.start[0]);
    const C = this.macierz(tSnap).multiply(lokalne[0].clone().invert());
    cel.ids.forEach((id, i) => {
      const t = i === 0 ? tSnap : this.zMacierzy(C.clone().multiply(lokalne[i]));
      this.projekt.ustawTransformacje(id, t);
    });
  }

  celZTrafienia(traf) {
    if (!traf) return { typ: 'scena' };
    if (!this.zazn.includes(traf.id)) { const w = this.wiele; this.wiele = false; this.wybierz(traf.id); this.wiele = w; }
    const ids = [traf.id, ...this.zazn.filter((x) => x !== traf.id)];
    const w = this.wezly.get(traf.id);
    w.holder.updateMatrixWorld(true);
    return { typ: 'bryly', ids, punktLok: w.holder.worldToLocal(traf.point.clone()) };
  }

  migawka(cel) {
    if (cel.typ === 'scena') { const piv = this.pivotSceny(); piv.updateMatrixWorld(true); cel.w0 = [piv.matrixWorld.clone()]; return; }
    this.root.updateMatrixWorld(true);
    cel.w0 = cel.ids.map((id) => { const w = this.wezly.get(id); w.holder.updateMatrixWorld(true); return w.holder.matrixWorld.clone(); });
    cel.start = cel.ids.map((id) => { const b = this.bryla(id); return { poz: [...b.poz], obr: [...b.obr], skala: b.skala }; });
  }

  // ==========================================================================
  // GOGLE: KONTROLERY (wywoływane przez viewer zamiast jego własnej obsługi)
  // ==========================================================================
  wejscieXR(dt) {
    const a = this.api, B = a.CONFIG.BTN;
    for (const c of a.controllers) {
      const u = c.userData, src = u.inputSource;
      if (!src) continue;
      const s = u.szk || (u.szk = { trigPrev: false, gripPrev: false, hover: null, traf: null, zuzyty: false, chwyt: null });
      if (u.tip) u.tip.position.z = -a.CONFIG.DRAW_TIP_OFFSET;     // punkt tworzenia kilka cm przed kontrolerem
      const glowna = a.isMain(c);

      if (a.buttonPressedEdge(c, B.AX)) {
        if (glowna && this.trzymane()) { this.usunTrzymane(); a.pulse(c, 0.6, 40); }
        else if (glowna) { this.ukryjPanelKlatek = 2; a.requestScreenshot(); }
        else { this.panelWidoczny = !this.panelWidoczny; }
      }
      if (a.buttonPressedEdge(c, B.BY)) {
        if (glowna) { this.cofnij(); a.pulse(c, 0.3, 20); }
        else this.resetWidoku();
      }
      const gp = src.gamepad;
      if (this.narzedzie === 'belka' && gp && gp.axes.length >= 4 && Math.abs(gp.axes[3]) > SZK.STICK_DEADZONE) {   // belka: prawa = a / Ø, lewa = b
        const f = Math.exp(-gp.axes[3] * SZK.BELKA_PREDKOSC * dt);
        if (glowna) this.zmienBelke(this.belka.ksztalt === 'okrag' ? 'd' : 'a', f);
        else if (this.belka.ksztalt === 'prostokat') this.zmienBelke('b', f);
        if (this.tworzenie) this.ciagnijTworzenie(this.tworzenie.B);
        this.msg = this.belkaTekst(); this.msgCzas = 1.5;
      }
      else if (glowna && gp && gp.axes.length >= 4 && Math.abs(gp.axes[3]) > SZK.STICK_DEADZONE && !a.controllers.some((o) => o.userData.szk && o.userData.szk.chwyt)) {
        const piv = this.pivotSceny();
        piv.scale.setScalar(Math.min(SZK.SKALA_SCENY_MAX, Math.max(SZK.SKALA_SCENY_MIN, piv.scale.x * Math.exp(-gp.axes[3] * SZK.SKALA_SCENY_PREDKOSC * dt))));
      }

      // promień: panel, potem bryły
      s.hover = null; s.traf = null;
      let dl = SZK.ZASIEG_PROMIENIA_M;
      this.rc.setFromXRController(c);
      if (this.panel.mesh.visible && this.panel.mesh.parent !== c) {
        this.rc.firstHitOnly = false;
        const h = this.rc.intersectObject(this.panel.mesh, false)[0];
        if (h) { s.hover = this.panel.idPodUV(h.uv); dl = h.distance; }
      }
      if (!s.hover) {
        s.traf = this.trafBryle(this.rc);
        if (s.traf) dl = s.traf.distance;
      }
      if (u.ray) u.ray.scale.z = dl;

      // grip: chwyć bryłę (pod promieniem) albo całość
      if (u.squeezing && !s.gripPrev) this.zacznijChwyt(c);
      if (!u.squeezing && s.gripPrev) this.skonczChwyt(c);
      s.gripPrev = u.squeezing;

      // spust: panel / wybór bryły / odznaczenie
      if (u.selecting && !s.trigPrev) {
        if (s.hover) {
          s.trigPrev = true;
          this.akcja(s.hover); a.pulse(c, 0.3, 20);
          if (!this.aktywny) return;             // „Wróć do podglądu” — dalej steruje viewer
        }
        else if (glowna && this.trzymane()) { this.kopiujTrzymane(); a.pulse(c, 0.6, 40); }
        else if (this.trybSzkicu()) { if (!this.numpad && glowna) { this.szkicKlik(); a.pulse(c, 0.25, 15); } }
        else if (this.narzedzie === 'krzywe') { if (glowna && !this.numpad && this.gotowy()) this.zacznijKrzywa(c); }
        else if (this.narzedzie === 'wstazka') { if (!this.numpad && this.gotowy()) this.sprobujWstazke(); }
        else if (PRYMITYWY.includes(this.narzedzie) && !this.tworzenie && !this.numpad) {
          if (this.gotowy()) this.zacznijTworzenie(this.naSiatke(this.swiatDoCad(this.czubek(c))), c);
        }
        else if (s.traf) { this.wybierz(s.traf.id); a.pulse(c, 0.3, 20); }
        else if (!this.numpad) this.odznacz();
      }
      if (this.tworzenie && this.tworzenie.zrodlo === c) {
        if (u.selecting) this.ciagnijTworzenie(this.naSiatke(this.swiatDoCad(this.czubek(c))));
        else this.zakonczTworzenie();
      }
      s.trigPrev = u.selecting;

      // znaczniki: punkt na bryle (pod promieniem / trzymany) i czubek kontrolera przy tworzeniu
      const i = a.controllers.indexOf(c);
      let pB = null, kB = SZK.KOLOR_PUNKTU;
      if (s.chwyt && s.chwyt.typ === 'bryly' && s.chwyt.punktLok) {
        const w = this.wezly.get(s.chwyt.ids[0]);
        if (w) { w.holder.updateMatrixWorld(true); pB = w.holder.localToWorld(s.chwyt.punktLok.clone()); kB = SZK.KOLOR_CHWYTU; }
      } else if (s.traf && !s.hover) pB = s.traf.point;
      this.ustawZnacznik(this.znaczniki[i * 2], pB, kB);
      if (this.trybSzkicu()) {                   // szkic: kursor = czubek ręki głównej rzutowany na płaszczyznę
        if (glowna && !s.hover && !this.numpad) this.szkicKursorXR(c);
        const S = this.szkic;
        const pk = glowna && !s.hover && S.kursor && S.faza !== 'wyciagnij' ? this.cadDoSwiata(this.zPlaszczyzny(S.kursor, S.s.odsuniecie ?? S.oPodglad)) : null;
        this.ustawZnacznik(this.znaczniki[i * 2 + 1], pk, SZK.KOLOR_PODGLADU);
        continue;
      }
      const tworzy = this.narzedzie !== 'wybierz' && !s.hover && !s.chwyt;
      const pT = !tworzy ? null : this.cadDoSwiata(this.tworzenie && this.tworzenie.zrodlo === c ? this.tworzenie.B : this.naSiatke(this.swiatDoCad(this.czubek(c))));
      this.ustawZnacznik(this.znaczniki[i * 2 + 1], pT, SZK.KOLOR_PODGLADU);
    }
    this.rysowaniePowXR();
    this.hoverPanelu = a.controllers.map((c) => c.userData.szk && c.userData.szk.hover).find(Boolean) || null;
    this.nad = a.controllers.map((c) => c.userData.szk && c.userData.szk.traf && c.userData.szk.traf.id).find(Boolean) || null;
    this.aktualizujChwyty();
  }

  zacznijChwyt(c) {
    const a = this.api;
    const inna = a.controllers.find((o) => o !== c && o.userData.szk && o.userData.szk.chwyt);
    if (inna) {                                  // druga ręka: obrót + skala trzymanego
      const cel = inna.userData.szk.chwyt;
      c.userData.szk.chwyt = cel;
      this.migawka(cel);
      const pa = inna.getWorldPosition(new THREE.Vector3()), pb = c.getWorldPosition(new THREE.Vector3());
      this.dwieRece = { a: inna, b: c, cel, m0: pa.clone().add(pb).multiplyScalar(0.5), d0: Math.max(pa.distanceTo(pb), 1e-3), v0: pb.clone().sub(pa).normalize() };
      a.pulse(c, 0.4, 30);
      return;
    }
    if (this.zajety) { this.powiedz('Poczekaj — trwa operacja'); }
    const cel = this.celZTrafienia(this.zajety ? null : c.userData.szk.traf);
    if (cel.typ === 'bryly') this.zapiszHistorie('przesunięcie', cel);
    this.migawka(cel);
    cel.c0inv = c.matrixWorld.clone().invert();
    c.userData.szk.chwyt = cel;
    a.pulse(c, cel.typ === 'bryly' ? 0.5 : 0.25, 30);
  }

  skonczChwyt(c) {
    const cel = c.userData.szk.chwyt;
    if (!cel) return;
    c.userData.szk.chwyt = null;
    if (this.dwieRece && (this.dwieRece.a === c || this.dwieRece.b === c)) {
      const inna = this.dwieRece.a === c ? this.dwieRece.b : this.dwieRece.a;
      this.dwieRece = null;
      if (inna.userData.szk.chwyt === cel) { this.migawka(cel); cel.c0inv = inna.matrixWorld.clone().invert(); }
      return;
    }
    if (cel.typ === 'bryly') {
      this.porzucJesliBezZmian(cel, cel.ids);
      const b = this.bryla(cel.ids[0]);
      if (b) this.powiedz(`${b.nazwa}: X ${fmt(b.poz[0], 1)}  Y ${fmt(b.poz[1], 1)}  Z ${fmt(b.poz[2], 1)} mm`);
    }
  }

  aktualizujChwyty() {
    const D = new THREE.Matrix4();
    if (this.dwieRece) {
      const { a, b, cel, m0, d0, v0 } = this.dwieRece;
      const pa = a.getWorldPosition(new THREE.Vector3()), pb = b.getWorldPosition(new THREE.Vector3());
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      const s = Math.max(pa.distanceTo(pb), 1e-3) / d0;
      const q = new THREE.Quaternion().setFromUnitVectors(v0, pb.clone().sub(pa).normalize());
      D.compose(mid, q, new THREE.Vector3(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-m0.x, -m0.y, -m0.z));
      this.zastosujDelta(cel, D);
      return;
    }
    for (const c of this.api.controllers) {
      const cel = c.userData.szk && c.userData.szk.chwyt;
      if (!cel) continue;
      D.multiplyMatrices(c.matrixWorld, cel.c0inv);
      this.zastosujDelta(cel, D);
    }
  }

  resetWidoku() {
    if (this.api.cadRoot) this.api.resetModelPose();
    else { this.pivotWlasny.position.fromArray(SZK.PIVOT_BEZ_MODELU); this.pivotWlasny.quaternion.identity(); this.pivotWlasny.scale.setScalar(1); }
    this.powiedz('Reset widoku');
  }

  // ==========================================================================
  // PC: mysz = promień (klik = spust), uchwyty przesuwu / obrotu / skali, klawiatura
  // ==========================================================================
  wlaczPC() {
    const a = this.api;
    if (this.pc.wlaczony) return;
    this.pc.wlaczony = true;
    if (!this.pc.tc) {
      const tc = new TransformControls(a.camera, a.renderer.domElement);
      tc.addEventListener('dragging-changed', (e) => {
        a.controls.enabled = !e.value; this.pc.przeciaganie = e.value;
        const id = tc.object && tc.object.userData.szkId;
        if (!id) return;
        if (e.value) this.pc.znacznikTC = this.zapiszHistorie('przesunięcie uchwytem', 'tc:' + id) && 'tc:' + id;
        else if (this.pc.znacznikTC) { this.porzucJesliBezZmian(this.pc.znacznikTC, [id]); this.pc.znacznikTC = null; }
      });
      tc.addEventListener('objectChange', () => this.zUchwytow());
      tc.setSize(0.8);
      this.pc.tc = tc;
      this.pc.helper = tc.getHelper();
    }
    a.scene.add(this.pc.helper);
    this.ustawSnapUchwytow();
    const el = a.renderer.domElement;
    const promien = (e) => {
      const r = el.getBoundingClientRect();
      this.rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), a.camera);
    };
    const panelPod = () => {
      if (!this.panel.mesh.visible) return null;
      this.rc.firstHitOnly = false;
      const h = this.rc.intersectObject(this.panel.mesh, false)[0];
      return h ? this.panel.idPodUV(h.uv) || 'panel' : null;
    };
    // punkt promienia myszy na poziomej płaszczyźnie (układ CAD, oś góry u na wysokości h)
    const naPlaszczyznie = (pl) => {
      const o = this.swiatDoCad(this.rc.ray.origin), q = this.swiatDoCad(this.rc.ray.origin.clone().add(this.rc.ray.direction));
      const d = q.map((v, i) => v - o[i]);
      if (Math.abs(d[pl.u]) < 1e-9) return null;
      const t = (pl.h - o[pl.u]) / d[pl.u];
      if (t < 0) return null;
      const p = this.naSiatke(o.map((v, i) => v + d[i] * t));
      p[pl.u] = pl.h;
      return p;
    };
    // płaszczyzna tworzenia: wierzch wskazanej bryły albo poziom środka obrotu kamery
    const plaszczyznaPod = (traf) => {
      const u = this.osGoryIndeks();
      return { u, h: traf ? this.swiatDoCad(traf.point)[u] : this.naSiatke(this.swiatDoCad(a.controls.target))[u] };
    };
    // szkic: promień myszy → płaszczyzna szkicu (pusty szkic: płaszczyzna przez wskazaną bryłę albo środek obrotu kamery)
    const szkicMysz = () => {
      const S = this.szkic, P = PLASZCZYZNY[S.s.plaszczyzna];
      const o0 = this.swiatDoCad(this.rc.ray.origin), q = this.swiatDoCad(this.rc.ray.origin.clone().add(this.rc.ray.direction));
      const d = q.map((v, i) => v - o0[i]), dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
      if (S.faza === 'wyciagnij') {             // wysokość = punkt na prostej prostopadłej do szkicu najbliższy promieniowi
        const pts = S.s.punkty, sr = pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length], [0, 0]);
        const C = this.zPlaszczyzny(sr, S.s.odsuniecie), w0 = o0.map((v, i) => v - C[i]);
        const A = dot(d, d), B = dot(d, P.n), D = dot(d, w0), E = dot(P.n, w0), den = A - B * B;
        if (Math.abs(den) > 1e-12) S.h = this.naKrokSkalar((A * E - B * D) / den);
        return;
      }
      let o = S.s.odsuniecie;
      if (o == null) {
        const t = this.trafBryle(this.rc);
        o = t ? Math.round(dot(this.swiatDoCad(t.point), P.n) * 1000) / 1000 : this.naKrokSkalar(dot(this.swiatDoCad(a.controls.target), P.n));
      }
      const dn = dot(d, P.n);
      if (Math.abs(dn) < 1e-9) return;
      const t = (o - dot(o0, P.n)) / dn;
      if (t < 0) return;
      const p = o0.map((v, i) => v + d[i] * t);
      this.szkicKursor([dot(p, P.u), dot(p, P.v)], o);
      if (S.kursor && S.faza !== 'os') this.ustawZnacznik(this.znaczniki[1], this.cadDoSwiata(this.zPlaszczyzny(S.kursor, o)), SZK.KOLOR_PODGLADU);
      else this.ustawZnacznik(this.znaczniki[1], null);
    };
    const n = {
      down: (e) => {
        promien(e);
        const id = panelPod();
        this.pc.mysz = { x: e.clientX, y: e.clientY, panel: !!id };
        if (id) {
          e.stopImmediatePropagation(); e.preventDefault();
          if (id !== 'panel') this.akcja(id);
          return;
        }
        if (PRYMITYWY.includes(this.narzedzie) && e.button === 0 && !this.numpad && this.gotowy()) {
          const pl = plaszczyznaPod(this.trafBryle(this.rc));
          const A = naPlaszczyznie(pl);
          if (A) { this.zacznijTworzenie(A, 'pc', true, pl); e.stopImmediatePropagation(); e.preventDefault(); }
        }
      },
      move: (e) => {
        promien(e);
        if (this.tworzenie && this.tworzenie.zrodlo === 'pc') {
          const B = naPlaszczyznie(this.tworzenie.plaszczyzna);
          if (B) this.ciagnijTworzenie(B);
          this.ustawZnacznik(this.znaczniki[1], this.cadDoSwiata(this.tworzenie.B), SZK.KOLOR_PODGLADU);
          return;
        }
        const id = panelPod();
        this.hoverPanelu = id && id !== 'panel' ? id : null;
        if (this.trybSzkicu()) {
          if (!id && !this.numpad) szkicMysz(); else this.ustawZnacznik(this.znaczniki[1], null);
          this.ustawZnacznik(this.znaczniki[0], null);
          return;
        }
        const t = id ? null : this.trafBryle(this.rc);
        this.nad = t ? t.id : null;
        this.ustawZnacznik(this.znaczniki[0], t && this.narzedzie === 'wybierz' ? t.point : null, SZK.KOLOR_PUNKTU);
        const p = !id && this.narzedzie !== 'wybierz' ? naPlaszczyznie(plaszczyznaPod(t)) : null;
        this.ustawZnacznik(this.znaczniki[1], p ? this.cadDoSwiata(p) : null, SZK.KOLOR_PODGLADU);
      },
      up: (e) => {
        if (this.tworzenie && this.tworzenie.zrodlo === 'pc') {
          this.pc.mysz = null;
          this.zakonczTworzenie();
          this.ustawZnacznik(this.znaczniki[1], null);
          return;
        }
        const m = this.pc.mysz;
        this.pc.mysz = null;

        if (!m || m.panel || this.pc.przeciaganie || e.button !== 0) return;
        if (Math.hypot(e.clientX - m.x, e.clientY - m.y) > 5) return;
        if (this.pc.tc.axis) return;                // klik w uchwyt
        if (this.trybSzkicu()) { if (!this.numpad) { promien(e); szkicMysz(); this.szkicKlik(); } return; }
        if (this.narzedzie === 'krzywe') {          // PC: punkty krzywej na płaszczyźnie poziomej (Enter = koniec krzywej)
          promien(e);
          const p = naPlaszczyznie(plaszczyznaPod(null));
          if (p && this.gotowy()) this.punktKrzywejPC(p);
          return;
        }
        if (this.narzedzie === 'wstazka') { this.powiedz('Wstążka działa w goglach (dwie ręce). Na PC: „Między 2 krzywymi”'); return; }
        if (this.narzedzie !== 'wybierz') return;
        promien(e);
        const t = this.trafBryle(this.rc);
        if (t) this.wybierz(t.id); else if (!this.numpad) this.odznacz();
      },
      key: (e) => this.klawisz(e),
    };
    el.addEventListener('pointerdown', n.down, { capture: true });
    el.addEventListener('pointermove', n.move);
    el.addEventListener('pointerup', n.up);
    window.addEventListener('keydown', n.key);
    this.pc.nasluch = n;
    this.przypnijUchwyty();
  }

  wylaczPC() {
    const a = this.api;
    if (!this.pc.wlaczony) return;
    this.pc.wlaczony = false;
    const el = a.renderer.domElement, n = this.pc.nasluch;
    el.removeEventListener('pointerdown', n.down, { capture: true });
    el.removeEventListener('pointermove', n.move);
    el.removeEventListener('pointerup', n.up);
    window.removeEventListener('keydown', n.key);
    if (this.pc.tc) { this.pc.tc.detach(); this.pc.helper.removeFromParent(); }
    a.controls.enabled = true;
    this.hoverPanelu = null; this.nad = null;
    if (this.tworzenie && this.tworzenie.zrodlo === 'pc') this.przerwijTworzenie();
    this.znaczniki.forEach((z) => { z.visible = false; });
  }

  ustawSnapUchwytow() {
    const tc = this.pc.tc;
    if (!tc) return;
    tc.setTranslationSnap(this.snap.wl ? this.snap.siatka : null);
    tc.setRotationSnap(this.snap.wl ? this.snap.kat * DEG : null);
    tc.setScaleSnap(this.snap.wl ? SZK.SKALA_KROK : null);
  }

  przypnijUchwyty() {
    const tc = this.pc.tc;
    if (!tc || !this.pc.wlaczony) return;
    const b = this.zazn.length === 1 && this.narzedzie === 'wybierz' ? this.bryla(this.zazn[0]) : null;
    const w = b && this.wezly.get(b.id);
    if (w) tc.attach(w.holder); else tc.detach();
  }

  zUchwytow() {
    const h = this.pc.tc.object;
    if (!h) return;
    const id = h.userData.szkId, b = this.bryla(id);
    if (!b) return;
    const s = h.scale;                           // skala zawsze jednakowa we wszystkich osiach
    const zmiana = [s.x, s.y, s.z].reduce((m, v) => (Math.abs(v - b.skala) > Math.abs(m - b.skala) ? v : m), b.skala);
    this.projekt.ustawTransformacje(id, { poz: h.position.toArray(), obr: [h.rotation.x / DEG, h.rotation.y / DEG, h.rotation.z / DEG],
                                          skala: Math.min(SZK.SKALA_MAX, Math.max(SZK.SKALA_MIN, zmiana)) });
  }

  // Klawiatura na PC (gdy kursor nie jest w polu tekstowym panelu strony)
  klawisz(e) {
    if (!this.aktywny || this.api.renderer.xr.isPresenting) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const k = e.key;
    if (this.numpad) {
      const mapa = { Enter: 'ok', Escape: 'anuluj', Backspace: 'wstecz', Delete: 'wyczysc', ',': 'przecinek', '.': 'przecinek', '-': 'minus' };
      if (/^[0-9]$/.test(k)) this.klawiszNumpada(k);
      else if (mapa[k]) this.klawiszNumpada(mapa[k]);
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const z = this.api.upAxis === 'Z';         // strzałki: poziomo, PageUp/PageDown: w górę/w dół (oś góry pliku)
    const kroki = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: z ? [1, 1] : [2, -1], ArrowDown: z ? [1, -1] : [2, 1],
                    PageUp: [z ? 2 : 1, 1], PageDown: [z ? 2 : 1, -1] };
    if (this.szkic && this.klawiszSzkicu(k, ctrl)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (this.narzedzie === 'krzywe' && (k === 'Enter' || k === 'Escape')) {
      if (k === 'Enter') this.zakonczKrzywa(); else this.ustawNarzedzie('wybierz');
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (kroki[k] && this.zazn.length) {
      this.zapiszHistorie('przesunięcie');
      const [os, zn] = kroki[k];
      const d = zn * this.snap.siatka * (e.shiftKey ? 10 : 1);
      for (const id of this.zazn) { const b = this.bryla(id); const p = [...b.poz]; p[os] += d; this.projekt.ustawTransformacje(id, { poz: p }); }
    } else if ((k === 'q' || k === 'Q') && this.zazn.length) {
      this.zapiszHistorie('obrót');
      this.obrocZaznaczone((e.shiftKey ? -1 : 1) * this.snap.kat);
    } else if ((k === '+' || k === '=' || k === '-') && this.zazn.length && !ctrl) {
      this.zapiszHistorie('skala');
      for (const id of this.zazn) {
        const b = this.bryla(id);
        const s = Math.min(SZK.SKALA_MAX, Math.max(SZK.SKALA_MIN, Math.round((b.skala + (k === '-' ? -1 : 1) * SZK.SKALA_KROK) / SZK.SKALA_KROK) * SZK.SKALA_KROK));
        this.projekt.ustawTransformacje(id, { skala: s });
      }
    } else if (k === 'w' || k === 'W') { if (!ctrl) this.pc.tc.setMode('translate'); else return; }
    else if (k === 'e' || k === 'E') this.pc.tc.setMode('rotate');
    else if (k === 'r' || k === 'R') this.pc.tc.setMode('scale');
    else if (k === 'Delete') this.usun();
    else if (ctrl && (k === 'd' || k === 'D')) this.kopiuj();
    else if (ctrl && (k === 'g' || k === 'G')) { if (e.shiftKey) this.rozgrupuj(); else this.grupuj(); }
    else if (ctrl && (k === 'a' || k === 'A')) { this.zazn = this.projekt.bryly.filter((b) => b.widoczna).map((b) => b.id); this.przypnijUchwyty(); }
    else if (k === 'Escape') { if (this.tworzenie) this.przerwijTworzenie(); else if (this.narzedzie !== 'wybierz') this.ustawNarzedzie('wybierz'); else this.odznacz(); }
    else if (ctrl && (k === 'z' || k === 'Z')) this.cofnij();
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }

  // obrót zaznaczonych wokół osi góry pliku CAD (Y albo Z), wokół środka pierwszej bryły
  obrocZaznaczone(stopnie) {
    const lead = this.bryla(this.zazn[0]);
    if (!lead) return;
    const c = new THREE.Vector3(...lead.poz);
    const obrot = this.api.upAxis === 'Z' ? new THREE.Matrix4().makeRotationZ(stopnie * DEG) : new THREE.Matrix4().makeRotationY(stopnie * DEG);
    const R = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(obrot).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    for (const id of this.zazn) {
      const b = this.bryla(id);
      const t = this.zMacierzy(R.clone().multiply(this.macierz(b)));
      t.obr = t.obr.map((v) => Math.round(v * 1e6) / 1e6);
      this.projekt.ustawTransformacje(id, t);
    }
  }

  // ==========================================================================
  // PANEL NUMERYCZNY
  // ==========================================================================
  otworzNumpad({ tytul, pola, gotowe }) {
    this.numpad = { tytul, pola: pola.map((p) => ({ ...p })), i: 0, gotowe, tekst: fmt(pola[0].wartosc, 3), swiezy: true };
  }

  klawiszNumpada(k) {
    const n = this.numpad;
    if (!n) return;
    if (k === 'anuluj') { this.numpad = null; this.powiedz('Anulowano'); return; }
    if (/^[0-9]$/.test(k)) { n.tekst = n.swiezy || n.tekst === '0' ? k : n.tekst + k; n.swiezy = false; return; }
    if (k === 'przecinek') { if (n.swiezy) { n.tekst = '0,'; n.swiezy = false; } else if (!n.tekst.includes(',')) n.tekst += ','; return; }
    if (k === 'minus') { n.tekst = n.tekst.startsWith('-') ? n.tekst.slice(1) : '-' + n.tekst; n.swiezy = false; return; }
    if (k === 'wstecz') { n.tekst = n.swiezy ? '' : n.tekst.slice(0, -1); n.swiezy = false; return; }
    if (k === 'wyczysc') { n.tekst = ''; n.swiezy = false; return; }
    if (k === 'ok') {
      const p = n.pola[n.i];
      const v = Number(n.tekst.replace(',', '.'));
      if (!Number.isFinite(v) || n.tekst === '' || n.tekst === '-') { this.powiedz('Wpisz liczbę'); return; }
      if (p.dodatnia && v <= 0) { this.powiedz(`${p.etykieta}: musi być większa od zera`); return; }
      p.wartosc = v;
      if (n.i < n.pola.length - 1) { n.i++; n.tekst = fmt(n.pola[n.i].wartosc, 3); n.swiezy = true; return; }
      this.numpad = null;
      const wynik = {};
      n.pola.forEach((x) => { wynik[x.klucz] = x.wartosc; });
      n.gotowe(wynik);
    }
  }

  // ==========================================================================
  // SZKIC 2D → BRYŁA (wyciągnięcie albo obrót wokół osi)
  // Punkty szkicu [u, v] w mm na płaszczyźnie XY / XZ / YZ przesuniętej o „odsuniecie” wzdłuż normalnej.
  // Gogle: punkt = czubek kontrolera rzutowany na płaszczyznę (pierwszy punkt wyznacza położenie płaszczyzny).
  // PC: punkt = przecięcie promienia myszy z płaszczyzną (przez wskazaną bryłę albo środek obrotu kamery).
  // ==========================================================================
  plaszczyznaPozioma() { return this.api.upAxis === 'Z' ? 'XY' : 'XZ'; }
  plaszczyznaSzkicu() { return this.szkic ? this.szkic.s.plaszczyzna : (this.plSzkicu || this.plaszczyznaPozioma()); }
  trybSzkicu() { return this.narzedzie === 'szkic' && !!this.szkic; }
  naKrokSkalar(v) { const g = this.krok(); return Math.round(v / g) * g; }

  zacznijSzkic() {
    if (!this.szkic) this.szkic = { s: new Szkic(this.plaszczyznaSzkicu()), faza: 'rysuj', kursor: null, oPodglad: 0, h: 0, osIdx: -1, blad: null };
    return this.szkic;
  }

  ustawPlaszczyzne(pl) {
    const S = this.zacznijSzkic();
    if (S.s.start && S.s.plaszczyzna !== pl) { this.powiedz('Szkic ma już punkty — najpierw „Anuluj szkic”'); return; }
    this.plSzkicu = pl;
    S.s.plaszczyzna = pl;
    this.powiedz(`Płaszczyzna szkicu: ${pl}` + (pl === this.plaszczyznaPozioma() ? ' (pozioma)' : ' (pionowa)'));
  }

  anulujSzkic() {
    this.szkic = null;
    if (this.narzedzie === 'szkic') this.zacznijSzkic();
    this.powiedz('Szkic anulowany');
  }

  // punkt CAD [x, y, z] → { uv, o } w układzie płaszczyzny
  doPlaszczyzny(p, pl = this.plaszczyznaSzkicu()) {
    const P = PLASZCZYZNY[pl], dot = (a) => a[0] * p[0] + a[1] * p[1] + a[2] * p[2];
    return { uv: [dot(P.u), dot(P.v)], o: dot(P.n) };
  }
  zPlaszczyzny(uv, o, pl = this.plaszczyznaSzkicu()) {
    const P = PLASZCZYZNY[pl];
    return [0, 1, 2].map((i) => P.n[i] * o + P.u[i] * uv[0] + P.v[i] * uv[1]);
  }

  // kursor szkicu z punktu na płaszczyźnie (uv surowe, o = położenie płaszczyzny, gdy szkic jest jeszcze pusty)
  szkicKursor(uv, o) {
    const S = this.szkic, s = S.s;
    S.oPodglad = s.odsuniecie ?? o;
    if (S.faza === 'os') { S.kursor = uv; S.osIdx = this.najblizszaOs(uv); return; }
    const sn = przyciagnijPunkt(uv, s.punkty, this.krok(), SZKIC.SNAP_PUNKT_MM);
    S.kursor = sn.p;
  }

  // gogle: czubek kontrolera → kursor (albo wysokość wyciągnięcia)
  szkicKursorXR(c) {
    const S = this.szkic, p = this.swiatDoCad(this.czubek(c));
    const { uv, o } = this.doPlaszczyzny(p);
    if (S.faza === 'wyciagnij') { S.h = this.naKrokSkalar(o - S.s.odsuniecie); return; }
    this.szkicKursor(uv, this.naKrokSkalar(o));
  }

  najblizszaOs(uv) {
    let best = -1, bd = Infinity;
    this.szkic.s.segmenty.forEach((sg, i) => {
      if (sg.typ !== 'linia') return;
      const d = odlOdOdcinka(uv, sg.a, sg.b);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  szkicKlik() {
    const S = this.szkic;
    if (!S) return;
    const s = S.s;
    if (S.faza === 'wyciagnij') { this.zatwierdzWyciagniecie(S.h); return; }
    if (S.faza === 'os') {
      if (S.osIdx >= 0) this.zatwierdzObrot(S.osIdx); else this.powiedz('Wskaż prosty odcinek obrysu jako oś obrotu');
      return;
    }
    if (!S.kursor) return;
    if (this.narzSzkicu === 'zaokraglij') {
      const i = s.start ? s.wierzcholek(S.kursor) : -1;
      if (i < 0) { this.powiedz('Wskaż narożnik obrysu (punkt między dwiema liniami)'); return; }
      const r = s.zaokraglij(i, this.promienZaokr);
      this.powiedz(r.ok ? `Zaokrąglono narożnik R${fmt(this.promienZaokr)} mm (B = cofnij)` : r.blad);
      return;
    }
    if (s.zamkniety) { this.powiedz('Obrys zamknięty — „Wyciągnij”, „Obrót” albo „Powierzchnia”; „Zaokrąglij” działa dalej'); return; }
    if (!s.start) {
      s.odsuniecie = S.oPodglad;
      s.dodaj('linia', S.kursor);
      this.powiedz(this.narzSzkicu === 'luk' ? 'Początek łuku — wskaż punkt na łuku' : 'Punkt początkowy — wskaż następny');
      return;
    }
    if (this.narzSzkicu === 'luk' && !s.lukSrodek) {
      if (Math.hypot(S.kursor[0] - s.ostatni[0], S.kursor[1] - s.ostatni[1]) < 1e-6) return;
      s.lukSrodek = [...S.kursor];
      this.powiedz('Łuk: teraz wskaż punkt końcowy');
      return;
    }
    let typ = this.narzSzkicu === 'luk' ? 'luk' : this.narzSzkicu === 'lukStyczny' ? 'lukStyczny' : 'linia';
    if (typ === 'lukStyczny' && !s.segmenty.length) { typ = 'linia'; this.powiedz('Pierwszy odcinek to linia — łuk styczny ciągnie się dalej od niej'); }
    const r = typ === 'luk' ? s.dodaj('luk', S.kursor, s.lukSrodek) : s.dodaj(typ, S.kursor);
    s.lukSrodek = null;
    if (r.ok) { if (r.zamknieto) this.powiedz('Obrys zamknięty ✓ — „Wyciągnij” albo „Obrót”'); }
    else {
      this.powiedz(r.blad);
      if (r.kolizja >= 0) S.blad = { idx: r.kolizja, czas: SZK.SZKIC_BLAD_S };
    }
  }

  // true = cofnięto krok szkicu (B / Ctrl+Z / Usuń ostatni); false = szkic pusty, cofanie idzie do historii brył
  szkicCofnij() {
    const S = this.szkic;
    if (!S || this.narzedzie !== 'szkic') return false;
    if (S.faza !== 'rysuj') { S.faza = 'rysuj'; this.powiedz('Powrót do rysowania'); return true; }
    if (S.s.lukSrodek) { S.s.lukSrodek = null; this.powiedz('Anulowano punkt łuku'); return true; }
    if (!S.s.start) return false;
    S.s.cofnij();
    this.powiedz(S.s.start ? `Usunięto ostatni odcinek (zostało ${S.s.segmenty.length})` : 'Szkic pusty');
    return true;
  }

  zamknijSzkic() {
    const S = this.szkic;
    if (!S) return;
    const r = S.s.zamknij();
    if (r.ok) this.powiedz('Obrys zamknięty ✓ — „Wyciągnij” albo „Obrót”');
    else { this.powiedz(r.blad); if (r.kolizja >= 0) S.blad = { idx: r.kolizja, czas: SZK.SZKIC_BLAD_S }; }
  }

  zamknietyObrys() {
    if (!this.szkic || !this.szkic.s.zamkniety) { this.powiedz('Najpierw zamknij obrys (ostatni punkt na pierwszym albo „Zamknij”)'); return false; }
    return true;
  }

  zacznijWyciaganie() {
    if (!this.zamknietyObrys()) return;
    const S = this.szkic;
    S.faza = 'wyciagnij'; S.h = 0;
    this.powiedz(this.api.renderer.xr.isPresenting ? 'Odsuń rękę od płaszczyzny na wysokość bryły, spust = gotowe' : 'Rusz myszą w górę / w dół, klik = gotowe');
  }

  wpiszWysokosc() {
    if (!this.zamknietyObrys()) return;
    const S = this.szkic;
    this.otworzNumpad({
      tytul: 'Wyciągnięcie szkicu',
      pola: [{ klucz: 'h', etykieta: 'Wysokość (minus = w drugą stronę)', wartosc: S.h || 50, jednostka: 'mm' }],
      gotowe: (w) => this.zatwierdzWyciagniecie(w.h),
    });
  }

  zacznijObrot() {
    if (!this.zamknietyObrys()) return;
    const S = this.szkic;
    if (!S.s.segmenty.some((sg) => sg.typ === 'linia')) { this.powiedz('Obrys nie ma prostego odcinka, który mógłby być osią'); return; }
    S.faza = 'os'; S.osIdx = -1;
    this.powiedz(`Obrót ${this.katObrotu}°: wskaż odcinek obrysu, który będzie osią (żółty), spust = gotowe`);
  }

  zatwierdzWyciagniecie(h) {
    const S = this.szkic;
    if (!S || !S.s.zamkniety) return null;
    if (!Number.isFinite(h) || Math.abs(h) < 1e-6) { this.powiedz('Wysokość równa zero — odsuń rękę / mysz od płaszczyzny'); return null; }
    const s = S.s;
    const def = { typ: 'wyciagniecie', plaszczyzna: s.plaszczyzna, odsuniecie: s.odsuniecie, obrys: s.obrys(), h };
    return this.zadanie('Wyciągam…', async () => {
      const b = await this.projekt.dodaj(def);
      this.poSzkicu(b, `Wyciągnięcie gotowe: ${b.nazwa}, wysokość ${fmt(h)} mm`);
      return b;
    }, 'wyciągnięcie');
  }

  zatwierdzObrot(idx) {
    const S = this.szkic;
    if (!S || !S.s.zamkniety) return null;
    const s = S.s, sg = s.segmenty[idx];
    if (!sg || sg.typ !== 'linia') { this.powiedz('Oś musi być prostym odcinkiem'); return null; }
    if (!poJednejStronie(s.segmenty, sg.a, sg.b)) { this.powiedz('Obrys leży po obu stronach tej osi — wybierz odcinek na brzegu obrysu'); return null; }
    const def = { typ: 'obrot', plaszczyzna: s.plaszczyzna, odsuniecie: s.odsuniecie, obrys: s.obrys(), os: { a: [...sg.a], b: [...sg.b] }, kat: this.katObrotu };
    return this.zadanie('Obracam obrys…', async () => {
      const b = await this.projekt.dodaj(def);
      this.poSzkicu(b, `Obrót gotowy: ${b.nazwa} (${this.katObrotu}°)`);
      return b;
    }, 'obrót szkicu');
  }

  poSzkicu(b, tekst) {
    this.szkic = null;
    this.zacznijSzkic();
    this.zazn = [b.id]; this.prowadzaca = b.id;
    this.przypnijUchwyty();
    this.powiedz(tekst);
  }

  klawiszSzkicu(k, ctrl) {
    if (!this.trybSzkicu()) return false;
    const S = this.szkic;
    if (k === 'Escape') {
      if (S.faza !== 'rysuj' || S.s.lukSrodek) this.szkicCofnij();
      else { this.strona = 'bryly'; this.ustawNarzedzie('wybierz'); }
      return true;
    }
    if (k === 'Backspace' || (ctrl && (k === 'z' || k === 'Z'))) return this.szkicCofnij();
    if (k === 'Enter') {
      if (S.faza === 'rysuj') this.zamknijSzkic(); else this.szkicKlik();
      return true;
    }
    if (!ctrl && (k === 'l' || k === 'L')) { this.narzSzkicu = 'linia'; this.szkic.s.lukSrodek = null; return true; }
    if (!ctrl && (k === 'a' || k === 'A')) { this.narzSzkicu = 'lukStyczny'; this.szkic.s.lukSrodek = null; return true; }
    if (!ctrl && k === '3') { this.narzSzkicu = 'luk'; return true; }
    if (!ctrl && (k === 'r' || k === 'R')) { this.narzSzkicu = 'zaokraglij'; this.szkic.s.lukSrodek = null; return true; }
    return false;
  }

  // ---- podgląd szkicu w scenie (odcinki jako cienkie walce o stałej grubości w świecie) ----
  widokSzkicu() {
    if (this.szkicWidok) return this.szkicWidok;
    const grupa = new THREE.Group();
    grupa.name = 'Szkic 2D';
    const walec = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const kula = new THREE.SphereGeometry(1, 12, 8);
    const mat = (kolor, op = 1) => new THREE.MeshBasicMaterial({ color: kolor, depthTest: false, transparent: true, opacity: op });
    const M = { linia: mat(SZK.SZKIC_KOLOR), gumka: mat(SZK.SZKIC_KOLOR_GUMKI), blad: mat(SZK.SZKIC_KOLOR_BLEDU), os: mat(SZK.SZKIC_KOLOR_OSI) };
    const siatka = new THREE.GridHelper(1, SZK.SZKIC_POLE_SIATKI, 0x7fd4ff, 0x4a6a80);
    siatka.material.transparent = true; siatka.material.opacity = 0.35; siatka.material.depthWrite = false;
    siatka.matrixAutoUpdate = false;
    const bryla = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: SZK.KOLOR_PODGLADU, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    bryla.matrixAutoUpdate = false;
    grupa.add(siatka, bryla);
    this.szkicWidok = { grupa, walec, kula, M, siatka, bryla, odcinki: [], punkty: [], kluczBryly: '' };
    return this.szkicWidok;
  }

  odswiezSzkic(dt) {
    const V = this.widokSzkicu(), S = this.szkic;
    if (V.grupa.parent !== this.root) this.root.add(V.grupa);
    const widac = this.trybSzkicu();
    V.grupa.visible = widac;
    if (!widac) return;
    if (S.blad) { S.blad.czas -= dt; if (S.blad.czas <= 0) S.blad = null; }
    const s = S.s, pl = s.plaszczyzna, o = s.odsuniecie ?? S.oPodglad;
    const sw = new THREE.Vector3();
    this.root.getWorldScale(sw);
    const r = SZK.SZKIC_GRUBOSC_M / Math.max(sw.x, 1e-9);           // promień linii w mm
    const p3 = (uv) => new THREE.Vector3(...this.zPlaszczyzny(uv, o, pl));
    let ni = 0, pi = 0;
    const Y = new THREE.Vector3(0, 1, 0);
    const odcinek = (a, b, mat) => {
      let m = V.odcinki[ni];
      if (!m) { m = new THREE.Mesh(V.walec, mat); m.renderOrder = 995; V.grupa.add(m); V.odcinki.push(m); }
      ni++;
      const A = p3(a), B = p3(b), d = B.clone().sub(A), L = d.length();
      m.visible = L > 1e-9;
      if (!m.visible) return;
      m.material = mat;
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(Y, d.divideScalar(L));
      m.scale.set(r, L, r);
    };
    const punkt = (uv, mat, k = 2.2) => {
      let m = V.punkty[pi];
      if (!m) { m = new THREE.Mesh(V.kula, mat); m.renderOrder = 996; V.grupa.add(m); V.punkty.push(m); }
      pi++;
      m.visible = true; m.material = mat;
      m.position.copy(p3(uv)); m.scale.setScalar(r * k);
    };
    const lamana = (sg, mat) => { const q = punktyOdcinka(sg); for (let i = 0; i < q.length - 1; i++) odcinek(q[i], q[i + 1], mat); };
    s.segmenty.forEach((sg, i) => {
      const mat = S.blad && S.blad.idx === i ? V.M.blad : (S.faza === 'os' && S.osIdx === i ? V.M.os : V.M.linia);
      lamana(sg, mat);
    });
    s.punkty.forEach((q, i) => punkt(q, i === 0 && !s.zamkniety ? V.M.gumka : V.M.linia, i === 0 ? 3 : 2.2));
    if (s.lukSrodek) punkt(s.lukSrodek, V.M.gumka, 1.8);
    // gumka: od ostatniego punktu do kursora (czerwona, gdy odcinek przecinałby obrys)
    if (S.faza === 'rysuj' && S.kursor && s.start && !s.zamkniety && this.narzSzkicu !== 'zaokraglij') {
      const a = s.ostatni;
      const n = s.segmenty.length, luk = this.narzSzkicu === 'luk' && s.lukSrodek;
      const styczny = this.narzSzkicu === 'lukStyczny' && n > 0;
      let b = S.kursor;
      const domyka = n >= (luk || styczny ? 1 : 2) && Math.hypot(b[0] - s.start[0], b[1] - s.start[1]) <= SZKIC.TOL_DOMKNIECIA_MM;
      if (domyka) b = s.start;
      const ms = styczny ? lukStyczny(a, s.kierunek, b) : null;
      const nowy = luk ? { typ: 'luk', a, m: s.lukSrodek, b } : ms ? { typ: 'luk', a, m: ms, b } : { typ: 'linia', a, b };
      const zly = (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) &&
        kolizjaOdcinka(s.segmenty, nowy, [n - 1, ...(domyka ? [0] : [])].filter((x) => x >= 0)) >= 0;
      lamana(nowy, zly ? V.M.blad : V.M.gumka);
    }
    if (this.narzSzkicu === 'zaokraglij' && S.kursor && s.start) {   // narożnik, który zostanie zaokrąglony
      const i = s.wierzcholek(S.kursor);
      if (i >= 0) punkt(s.punkty[i], V.M.os, 4);
    }
    if (S.kursor && S.faza !== 'wyciagnij') punkt(S.kursor, V.M.gumka, 2.6);
    for (let i = ni; i < V.odcinki.length; i++) V.odcinki[i].visible = false;
    for (let i = pi; i < V.punkty.length; i++) V.punkty[i].visible = false;

    // siatka płaszczyzny (linie co krok snapu, środek na siatce)
    const P = PLASZCZYZNY[pl], g = this.krok(), N = SZK.SZKIC_POLE_SIATKI;
    const sr = (s.start || S.kursor || [0, 0]).map((v) => Math.round(v / g) * g);
    const U = new THREE.Vector3(...P.u), Vv = new THREE.Vector3(...P.v), Nn = new THREE.Vector3(...P.n);
    V.siatka.matrix.makeBasis(U, Nn, Vv).scale(new THREE.Vector3(N * g, 1, N * g)).setPosition(p3(sr));
    V.siatka.visible = S.faza === 'rysuj';
    // podgląd wyciągnięcia
    const pokazBryle = S.faza === 'wyciagnij' && s.zamkniety && Math.abs(S.h) > 1e-6;
    V.bryla.visible = pokazBryle;
    if (pokazBryle) {
      const klucz = JSON.stringify(s.segmenty);
      if (klucz !== V.kluczBryly) {
        const pts = [];
        s.segmenty.forEach((sg) => { const q = punktyOdcinka(sg); pts.push(...q.slice(0, -1)); });
        V.bryla.geometry.dispose();
        V.bryla.geometry = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0], q[1]))), { depth: 1, bevelEnabled: false, curveSegments: 4 });
        V.kluczBryly = klucz;
      }
      V.bryla.matrix.makeBasis(U, Vv, Nn).scale(new THREE.Vector3(1, 1, S.h)).setPosition(Nn.clone().multiplyScalar(o));
    }
  }

  // ==========================================================================
  // POWIERZCHNIE: płaska ze szkicu, wstążka z dwóch rąk, między dwiema krzywymi; cięcie bryły i pogrubienie
  // ==========================================================================
  powierzchniaZeSzkicu() {
    const S = this.szkic;
    if (!S || !S.s.zamkniety) { this.powiedz('Najpierw narysuj zamknięty obrys w zakładce Szkic'); return null; }
    const s = S.s;
    const def = { typ: 'powierzchnia', rodzaj: 'plaska', plaszczyzna: s.plaszczyzna, odsuniecie: s.odsuniecie, obrys: s.obrys() };
    return this.zadanie('Tworzę powierzchnię…', async () => {
      const b = await this.projekt.dodaj(def);
      this.poSzkicu(b, `Powierzchnia gotowa: ${b.nazwa} (${fmt(b.pole / 100, 1)} cm²) — Tnij bryłę albo Pogrub`);
      return b;
    }, 'powierzchnia');
  }

  dodajPowierzchnieKrzywe(a, b, opis) {
    return this.zadanie('Tworzę powierzchnię…', async () => {
      const p = await this.projekt.dodaj({ typ: 'powierzchnia', rodzaj: 'krzywe', a, b });
      this.wiele = false; this.zazn = [p.id]; this.prowadzaca = p.id; this.przypnijUchwyty();
      this.powiedz(`${opis}: ${p.nazwa} (${fmt(p.pole / 100, 1)} cm²) — Tnij bryłę albo Pogrub`);
      return p;
    }, opis.toLowerCase());
  }

  // krok zapisu punktów z ręki: SZK.KRZYWA_KROK_M w świecie → mm w układzie CAD
  krokKrzywejMM() {
    const sw = new THREE.Vector3();
    this.root.getWorldScale(sw);
    return SZK.KRZYWA_KROK_M / Math.max(sw.x, 1e-9);
  }

  zacznijKrzywa(c) {
    if (!this.krzywe) this.krzywe = { a: null, biezaca: null, zrodlo: null };
    this.krzywe.biezaca = [this.swiatDoCad(this.czubek(c))];
    this.krzywe.zrodlo = c;
  }

  punktKrzywejPC(p) {
    if (!this.krzywe) this.krzywe = { a: null, biezaca: null, zrodlo: null };
    const K = this.krzywe;
    if (!K.biezaca) { K.biezaca = []; K.zrodlo = 'pc'; }
    K.biezaca.push(p);
    this.powiedz(`Krzywa ${K.a ? 2 : 1}: punktów ${K.biezaca.length} (Enter = koniec)`);
  }

  zakonczKrzywa() {
    const K = this.krzywe;
    if (!K || !K.biezaca) return null;
    const pts = K.biezaca;
    K.biezaca = null; K.zrodlo = null;
    const dl = pts.reduce((sum, p, i) => (i ? sum + Math.hypot(...p.map((v, k) => v - pts[i - 1][k])) : 0), 0);
    if (pts.length < 2 || dl < 3 * this.krok()) { this.powiedz('Krzywa za krótka — narysuj dłuższą'); return null; }
    if (!K.a) { K.a = pts; this.powiedz('Krzywa 1 gotowa — narysuj krzywą 2'); return null; }
    const a = K.a;
    this.krzywe = { a: null, biezaca: null, zrodlo: null };
    return this.dodajPowierzchnieKrzywe(a, pts, 'Powierzchnia między krzywymi');
  }

  // Wstążka startuje, gdy oba spusty są wciśnięte (żadna ręka nie celuje w panel)
  sprobujWstazke() {
    const a = this.api;
    if (this.wstazka) return;
    const wolne = a.controllers.filter((c) => c.userData.inputSource && c.userData.selecting && !(c.userData.szk && c.userData.szk.hover));
    if (wolne.length < 2) { this.powiedz('Wstążka: wciśnij spust także drugą ręką'); return; }
    this.wstazka = { lewa: [], prawa: [] };
    this.dodajPareWstazki(true);
  }

  rekaWstazki(strona) { return this.api.controllers.find((c) => c.userData.handed === strona) || null; }

  dodajPareWstazki(zawsze = false) {
    const W = this.wstazka, L = this.rekaWstazki('left'), P = this.rekaWstazki('right');
    if (!W || !L || !P) return;
    const pl = this.swiatDoCad(this.czubek(L)), pp = this.swiatDoCad(this.czubek(P));
    const o = W.lewa.length - 1, k = this.krokKrzywejMM();
    if (!zawsze && o >= 0 && Math.hypot(...pl.map((v, i) => v - W.lewa[o][i])) < k && Math.hypot(...pp.map((v, i) => v - W.prawa[o][i])) < k) return;
    W.lewa.push(pl); W.prawa.push(pp);
  }

  rysowaniePowXR() {
    const a = this.api;
    const K = this.krzywe;
    if (K && K.biezaca && K.zrodlo && K.zrodlo !== 'pc') {
      const c = K.zrodlo;
      if (c.userData.selecting) {
        const p = this.swiatDoCad(this.czubek(c)), o = K.biezaca[K.biezaca.length - 1];
        if (Math.hypot(...p.map((v, i) => v - o[i])) >= this.krokKrzywejMM()) K.biezaca.push(p);
      } else this.zakonczKrzywa();
    }
    if (this.wstazka) {
      const L = this.rekaWstazki('left'), P = this.rekaWstazki('right');
      if (L && P && L.userData.selecting && P.userData.selecting) this.dodajPareWstazki();
      else {
        const W = this.wstazka;
        this.wstazka = null;
        const dl = W.lewa.reduce((sum, p, i) => (i ? sum + Math.hypot(...p.map((v, k) => v - W.lewa[i - 1][k])) : 0), 0);
        if (W.lewa.length < 3 || dl < 3 * this.krokKrzywejMM()) this.powiedz('Wstążka za krótka — przeciągnij ręce dalej');
        else this.dodajPowierzchnieKrzywe(W.lewa, W.prawa, 'Wstążka');
      }
    }
    // czubki rąk przy narzędziach powierzchni
    if (this.narzedzie === 'krzywe' || this.narzedzie === 'wstazka') {
      a.controllers.forEach((c, i) => {
        const glowna = a.isMain(c);
        const widac = c.userData.inputSource && !(c.userData.szk && c.userData.szk.hover) && (this.narzedzie === 'wstazka' || glowna);
        this.ustawZnacznik(this.znaczniki[i * 2 + 1], widac ? this.czubek(c) : null, SZK.KOLOR_PODGLADU);
      });
    }
  }

  // podgląd: krzywe (walce o stałej grubości) i rozciągana wstążka
  odswiezKrzywe() {
    if (!this.krzyweWidok) {
      const grupa = new THREE.Group();
      grupa.name = 'Krzywe';
      const walec = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
      const M = { gotowa: new THREE.MeshBasicMaterial({ color: SZK.KOLOR_KRZYWEJ, depthTest: false, transparent: true }),
                  biezaca: new THREE.MeshBasicMaterial({ color: SZK.KOLOR_PODGLADU, depthTest: false, transparent: true }) };
      const wst = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: SZK.KOLOR_PODGLADU, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
      wst.frustumCulled = false;
      grupa.add(wst);
      this.krzyweWidok = { grupa, walec, M, wst, odcinki: [], klucz: '' };
    }
    const V = this.krzyweWidok;
    if (V.grupa.parent !== this.root) this.root.add(V.grupa);
    const K = this.krzywe, W = this.wstazka;
    V.grupa.visible = !!((K && (K.a || K.biezaca)) || W);
    if (!V.grupa.visible) return;
    const sw = new THREE.Vector3(); this.root.getWorldScale(sw);
    const r = SZK.SZKIC_GRUBOSC_M / Math.max(sw.x, 1e-9);
    let ni = 0;
    const Y = new THREE.Vector3(0, 1, 0);
    const lamana = (pts, mat) => {
      for (let i = 0; i < pts.length - 1; i++) {
        let m = V.odcinki[ni];
        if (!m) { m = new THREE.Mesh(V.walec, mat); m.renderOrder = 995; V.grupa.add(m); V.odcinki.push(m); }
        ni++;
        const A = new THREE.Vector3(...pts[i]), B = new THREE.Vector3(...pts[i + 1]), d = B.clone().sub(A), L = d.length();
        m.visible = L > 1e-9; m.material = mat;
        if (!m.visible) continue;
        m.position.copy(A).add(B).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(Y, d.divideScalar(L));
        m.scale.set(r, L, r);
      }
    };
    if (K && K.a) lamana(K.a, V.M.gotowa);
    if (K && K.biezaca) lamana(K.biezaca, V.M.biezaca);
    if (W) { lamana(W.lewa, V.M.biezaca); lamana(W.prawa, V.M.biezaca); }
    for (let i = ni; i < V.odcinki.length; i++) V.odcinki[i].visible = false;
    // wstążka: pasek trójkątów między parami punktów
    const n = W ? W.lewa.length : 0;
    V.wst.visible = n >= 2;
    if (n >= 2 && V.klucz !== 'w' + n) {
      V.klucz = 'w' + n;
      const poz = new Float32Array(n * 2 * 3), ind = [];
      for (let i = 0; i < n; i++) { poz.set(W.lewa[i], i * 6); poz.set(W.prawa[i], i * 6 + 3); }
      for (let i = 0; i < n - 1; i++) { const a = 2 * i; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      V.wst.geometry.dispose();
      V.wst.geometry = new THREE.BufferGeometry();
      V.wst.geometry.setAttribute('position', new THREE.BufferAttribute(poz, 3));
      V.wst.geometry.setIndex(ind);
    }
    if (!W) V.klucz = '';
  }

  wybranaPowierzchnia() {
    const b = this.wybrana();
    return b && b.def.typ === 'powierzchnia' ? b : null;
  }

  zacznijCiecie() {
    const p = this.wybranaPowierzchnia();
    if (!p) { this.powiedz('Najpierw wybierz powierzchnię'); return; }
    if (this.oczekujeB && this.oczekujeB.op === 'tnij') { this.oczekujeB = null; this.powiedz('Anulowano cięcie'); return; }
    if (this.narzedzie !== 'wybierz') this.ustawNarzedzie('wybierz');
    this.oczekujeB = { op: 'tnij', a: p.id };
    this.powiedz(`Cięcie powierzchnią „${p.nazwa}”: wskaż bryłę`);
  }

  wykonajPodzial(idBryly, idPow) {
    const A = this.bryla(idBryly);
    return this.zadanie('Tnę bryłę…', async () => {
      const [g, d] = await this.projekt.podziel(idBryly, idPow);
      this.wiele = false; this.zazn = [g.id]; this.prowadzaca = g.id; this.przypnijUchwyty();
      this.powiedz(`Pocięto „${A.nazwa}”: ${g.nazwa} (${fmt(g.objetosc / 1000, 1)} cm³) i ${d.nazwa} (${fmt(d.objetosc / 1000, 1)} cm³)`);
      return [g, d];
    }, 'cięcie');
  }

  pogrubWybrana(grubosc) {
    const p = this.wybranaPowierzchnia();
    if (!p) { this.powiedz('Najpierw wybierz powierzchnię'); return null; }
    return this.zadanie('Pogrubiam…', async () => {
      const b = await this.projekt.pogrub(p.id, grubosc);
      this.wiele = false; this.zazn = [b.id]; this.prowadzaca = b.id; this.przypnijUchwyty();
      this.powiedz(`Pogrubiono o ${fmt(grubosc)} mm: ${b.nazwa} (${fmt(b.objetosc / 1000, 1)} cm³)`);
      return b;
    }, 'pogrubienie');
  }

  wpiszGrubosc() {
    const p = this.wybranaPowierzchnia();
    if (!p) { this.powiedz('Najpierw wybierz powierzchnię'); return; }
    this.otworzNumpad({
      tytul: `${p.nazwa}: pogrubienie`,
      pola: [{ klucz: 'g', etykieta: 'Grubość (minus = w drugą stronę)', wartosc: this.gruboscPow, jednostka: 'mm' }],
      gotowe: (w) => { if (w.g) { this.gruboscPow = Math.abs(w.g); this.pogrubWybrana(w.g); } else this.powiedz('Grubość musi być różna od zera'); },
    });
  }

  // ==========================================================================
  // PANEL: układ zakładek i reakcje na przyciski
  // ==========================================================================
  stopka() {
    if (this.msg) return this.msg;
    const vr = this.api.renderer.xr.isPresenting, spust = vr ? 'spust' : 'klik';
    if (this.oczekujeB) return `${NAZWY_OP[this.oczekujeB.op]}: wskaż bryłę B spustem`;
    if (this.zajety) return 'Liczę…';
    if (this.trybSzkicu()) {
      const S = this.szkic, s = S.s;
      if (S.faza === 'wyciagnij') return `Wysokość ${fmt(S.h)} mm — ${vr ? 'odsuń rękę' : 'rusz myszą'}, ${spust} = gotowe, B = wróć`;
      if (S.faza === 'os') return `Wskaż odcinek-oś (żółty), ${spust} = obrót ${this.katObrotu}°, B = wróć`;
      if (s.zamkniety) return 'Obrys zamknięty — „Wyciągnij” albo „Obrót”';
      if (!s.start) return vr ? 'Spust: pierwszy punkt (płaszczyzna przechodzi przez czubek)' : 'Klik: pierwszy punkt na płaszczyźnie';
      if (this.narzSzkicu === 'zaokraglij') return `Zaokrąglenie R${fmt(this.promienZaokr)}: ${spust} przy narożniku (żółty) · B = cofnij`;
      if (this.narzSzkicu === 'lukStyczny') return `Łuk styczny: ${spust} = koniec łuku (przedłuża poprzedni odcinek)`;
      if (this.narzSzkicu === 'luk') return s.lukSrodek ? `Łuk: ${spust} = punkt końcowy` : `Łuk: ${spust} = punkt na łuku`;
      return `Linia: ${spust} = następny punkt · na pierwszym punkcie = zamknij · B = usuń ostatni`;
    }
    if (this.narzedzie === 'krzywe') {
      const K = this.krzywe || {};
      const nr = K.a ? 2 : 1;
      return vr ? `Krzywa ${nr}: trzymaj spust i prowadź rękę, puść = koniec` + (nr === 2 ? ' → powierzchnia' : '')
                : `Krzywa ${nr}: klikaj punkty, Enter = koniec krzywej` + (nr === 2 ? ' → powierzchnia' : '');
    }
    if (this.narzedzie === 'wstazka') return vr ? (this.wstazka ? 'Rozciągasz wstążkę — puść spust = gotowe' : 'Trzymaj OBA spusty i prowadź ręce') : 'Wstążka działa w goglach';
    if (this.narzedzie === 'belka') return vr ? `${this.belkaTekst()} · spust w A → przeciągnij → puść w B` : `${this.belkaTekst()} · przeciągnij myszą od A do B · Esc = wybierz`;
    if (this.narzedzie !== 'wybierz') return vr ? 'Spust w punkcie A → przeciągnij → puść' : 'Przeciągnij myszą po płaszczyźnie · Esc = wybierz';
    return vr ? 'Spust: wybierz · Grip: chwyć (prawy spust = kopia, A = usuń) · B: cofnij' : 'Klik: wybierz · Ctrl+Z: cofnij';
  }

  uklad() {
    const U = new Uklad();
    if (this.numpad) return this.ukladNumpada(U);
    U.rzad(20, 80, [['bryly', 'Bryły', 'prostopadloscian', 1], ['szkic', 'Szkic', 'szkic', 0.95], ['pow', 'Powierzchnie', 'powierzchnia', 1.65],
                    ['edycja', 'Edycja', 'numer', 1], ['plik', 'Plik', 'plik', 0.8]]
      .map(([id, text, icon, flex]) => ({ id: 'tab:' + id, text, icon, flex, active: this.strona === id, tab: true })));
    if (this.strona === 'bryly') this.ukladBryly(U);
    else if (this.strona === 'szkic') this.ukladSzkic(U);
    else if (this.strona === 'pow') this.ukladPowierzchnie(U);
    else if (this.strona === 'edycja') this.ukladEdycja(U);
    else this.ukladPlik(U);
    return U;
  }

  przyciskCofnij() {
    const h = this.historia[this.historia.length - 1];
    return { id: 'cofnij', text: 'Cofnij (B)', icon: 'cofnij', disabled: !h, flex: 1.15 };
  }

  ukladBryly(U) {
    const a = this.api, P = PANEL.PAD, W = PANEL.W;
    const lista = this.projekt ? this.projekt.bryly : [];
    const brak = !this.zazn.length;
    U.ramka(112, 196, 'Narzędzie — spust: rozciągnij bryłę od punktu do punktu');
    U.rzadW(150, 140, [['wybierz', 'Wybierz'], ['prostopadloscian', 'Prostopadłościan'], ['walec', 'Walec'], ['kula', 'Kula'], ['belka', 'Belka']]
      .map(([id, text]) => ({ id: 'narz:' + id, text, icon: id, active: this.narzedzie === id, flex: id === 'prostopadloscian' ? 1.45 : 1 })));
    if (this.narzedzie === 'belka') {
      const okr = this.belka.ksztalt === 'okrag';
      U.ramka(322, 196, `${this.belkaTekst()} — gałki: prawa ${okr ? 'Ø' : 'a'}` + (okr ? '' : ', lewa b'));
      U.rzadW(360, 140, [{ id: 'bk:prostokat', text: 'Prostokąt', icon: 'prostokat', active: !okr, flex: 1.2 },
                         { id: 'bk:okrag', text: 'Okrąg', icon: 'okrag', active: okr },
                         { id: 'bk:a-', sub: okr ? 'Ø' : 'a', text: '−', flex: 0.6 }, { id: 'bk:a+', sub: okr ? 'Ø' : 'a', text: '+', flex: 0.6 },
                         { id: 'bk:b-', sub: 'b', text: '−', disabled: okr, flex: 0.6 }, { id: 'bk:b+', sub: 'b', text: '+', disabled: okr, flex: 0.6 }]);
    } else {
    U.ramka(322, 196, 'Działania na zaznaczonych');
    U.rzadW(360, 140, [this.przyciskCofnij(), { id: 'kopiuj', text: 'Kopiuj', icon: 'kopiuj', disabled: brak }, { id: 'usun', text: 'Usuń', icon: 'usun', disabled: brak },
                       { id: 'grupuj', text: 'Grupuj', icon: 'grupuj', disabled: this.zazn.length < 2 },
                       { id: 'rozgrupuj', text: 'Rozgrupuj', icon: 'rozgrupuj', disabled: !this.zazn.some((id) => this.bryla(id)?.grupa), flex: 1.15 }]);
    }
    const moznaPrzejac = !!(a.cadRoot && this.plikiDoPrzejecia().length);
    const przejety = !!(this.projekt && Object.keys(this.projekt.pliki).length);
    U.ramka(532, 628, `Bryły (${lista.length})` + (this.zazn.length ? ` · zaznaczone: ${this.zazn.length}` : ''));
    U.rzadW(570, 76, [{ id: 'wiele', text: this.wiele ? 'Zaznaczanie: wiele' : 'Zaznaczanie: jedna', icon: 'wiele', active: this.wiele, flex: 1.3 },
                      { id: 'pokaz', text: 'Pokaż wszystko', icon: 'oko' },
                      { id: 'oryginal', text: !moznaPrzejac && przejety ? 'Przejęto' : 'Przejmij oryginał', icon: 'przejmij', disabled: !moznaPrzejac }]);
    const x0 = P + 14, x1 = W - P - 14;
    if (!lista.length) U.dodaj({ kind: 'info', x: x0, y: 690, w: x1 - x0, h: 48, text: this.stanSilnika === 'gotowy' ? 'Brak brył — wybierz narzędzie albo zakładkę Szkic' : 'Ładowanie geometrii…', color: PANEL.KOLORY.szary });
    const N = SZK.WIERSZE_LISTY;
    this.przewin = Math.max(0, Math.min(this.przewin, lista.length - N));
    for (let k = 0; k < N; k++) {
      const b = lista[this.przewin + k];
      if (!b) break;
      const y = 660 + k * 70;
      const g = b.grupa && this.projekt.grupa(b.grupa);
      U.dodaj({ kind: 'check', id: 'vis:' + b.id, checked: b.widoczna, x: x0, y, w: 62, h: 62 });
      U.dodaj({ kind: 'item', id: 'sel:' + b.id, text: b.nazwa, sub: g ? g.nazwa : (b.zrodlo === 'oryginal' ? 'oryginał' : ''),
                active: this.zazn.includes(b.id), dim: !b.widoczna, x: x0 + 76, y, w: x1 - x0 - 76, h: 62 });
    }
    U.rzadW(1084, 64, [{ id: 'lista:-', text: '▲', disabled: this.przewin <= 0, flex: 0.7 }, { id: 'lista:+', text: '▼', disabled: this.przewin + N >= lista.length, flex: 0.7 },
                       { id: '', kind: 'info', align: 'center', text: lista.length ? `${this.przewin + 1}–${Math.min(lista.length, this.przewin + N)} z ${lista.length}` : '', flex: 1.6 }]);
  }

  ukladSzkic(U) {
    const S = this.szkic, s = S && S.s, pl = this.plaszczyznaSzkicu(), poz = this.plaszczyznaPozioma();
    const zamk = !!(s && s.zamkniety), ma = !!(s && s.start);
    U.ramka(112, 196, 'Płaszczyzna szkicu');
    U.rzadW(150, 140, ['XY', 'XZ', 'YZ'].map((p) => ({ id: 'pl:' + p, icon: 'pl' + p, text: p + (p === poz ? ' · poziom' : ' · pion'),
                                                    active: pl === p, disabled: ma && pl !== p })));
    U.ramka(322, 300, 'Rysowanie obrysu' + (s ? ` · odcinki: ${s.segmenty.length}` + (zamk ? ' · zamknięty ✓' : '') : ''));
    const N = (id, text, icon, flex = 1) => ({ id: 'sz:' + id, text, icon, active: this.narzSzkicu === id, flex });
    U.rzadW(360, 128, [N('linia', 'Linia', 'linia'), N('lukStyczny', 'Łuk styczny', 'lukStyczny', 1.2), N('luk', 'Łuk 3 pkt', 'luk'),
                       N('zaokraglij', 'Zaokrąglij', 'zaokraglij', 1.1)]);
    U.rzadW(500, 96, [{ id: 'sz:promien', sub: 'Promień', text: `R ${fmt(this.promienZaokr)} mm`, active: this.narzSzkicu === 'zaokraglij' },
                      { id: 'sz:wstecz', text: 'Usuń ostatni', icon: 'wstecz', disabled: !ma, flex: 1.25 },
                      { id: 'sz:zamknij', text: 'Zamknij', icon: 'ok', disabled: zamk || !(s && s.segmenty.length >= 2) },
                      { id: 'sz:anuluj', text: 'Anuluj', icon: 'anuluj', disabled: !ma }]);
    U.ramka(636, 196, 'Z zamkniętego obrysu');
    U.rzadW(674, 140, [{ id: 'sz:wyciagnij', text: 'Wyciągnij', icon: 'wyciagnij', disabled: !zamk, active: S && S.faza === 'wyciagnij' },
                       { id: 'sz:wysokosc', text: 'Wpisz wys.', icon: 'numer', disabled: !zamk },
                       { id: 'sz:obrot', text: `Obrót ${this.katObrotu}°`, icon: 'obrot', disabled: !zamk, active: S && S.faza === 'os' },
                       { id: 'sz:kat', text: 'Zmień kąt', icon: 'reset', flex: 0.9 },
                       { id: 'sz:powierzchnia', text: 'Powierzchnia', icon: 'powierzchnia', disabled: !zamk, flex: 1.1 }]);
    U.ramka(846, 150, 'Snap (przyciąganie do siatki i punktów)');
    this.rzadSnapu(U, 884);
    const vr = this.api.renderer.xr.isPresenting;
    const pomoc = vr
      ? ['Spust: punkt (czubek kontrolera) · pierwszy punkt ustala płaszczyznę', 'Łuk styczny płynnie przedłuża poprzedni odcinek',
         'Czerwony odcinek = przecina obrys · B: usuń ostatni']
      : ['Klik: punkt · L / A / 3 / R: linia / łuk styczny / łuk 3 pkt / zaokrąglij', 'Enter = zamknij · Backspace / Ctrl+Z: usuń ostatni · Esc',
         'Czerwony odcinek = przecina obrys (niedozwolone)'];
    U.ramka(1010, 150, 'Jak rysować');
    pomoc.forEach((t, i) => U.dodaj({ kind: 'info', x: PANEL.PAD + 14, y: 1044 + i * 38, w: PANEL.W - 2 * PANEL.PAD - 28, h: 38, text: t, color: PANEL.KOLORY.szary }));
  }

  ukladPowierzchnie(U) {
    const vr = this.api.renderer.xr.isPresenting;
    const b = this.wybrana(), pow = b && b.def.typ === 'powierzchnia' ? b : null;
    const zamk = !!(this.szkic && this.szkic.s.zamkniety);
    U.ramka(112, 196, 'Nowa powierzchnia');
    U.rzadW(150, 140, [{ id: 'pw:plaska', text: 'Płaska ze szkicu', icon: 'powierzchnia', disabled: !zamk, flex: 1.15 },
                       { id: 'narz:wstazka', text: 'Wstążka (2 ręce)', icon: 'wstazka', active: this.narzedzie === 'wstazka', flex: 1.15 },
                       { id: 'narz:krzywe', text: 'Między 2 krzywymi', icon: 'krzywe', active: this.narzedzie === 'krzywe', flex: 1.25 },
                       { id: 'narz:wybierz', text: 'Wybierz', icon: 'wybierz', active: this.narzedzie === 'wybierz', flex: 0.8 }]);
    const K = this.krzywe;
    U.ramka(322, 196, this.narzedzie === 'krzywe' ? (K && K.a ? 'Krzywa 1 gotowa — narysuj krzywą 2' : 'Narysuj krzywą 1') : 'Krzywe i wstążka');
    U.rzadW(360, 140, [{ id: 'pw:koniec', text: vr ? 'Koniec krzywej (puść spust)' : 'Koniec krzywej (Enter)', icon: 'ok', flex: 1.6,
                         disabled: vr || this.narzedzie !== 'krzywe' || !(K && K.biezaca && K.biezaca.length >= 2) },
                       { id: 'pw:anuluj', text: 'Anuluj krzywe', icon: 'anuluj', disabled: !(K && (K.a || K.biezaca)) && !this.wstazka }]);
    U.ramka(532, 316, pow ? `Wybrana: ${pow.nazwa}` : 'Wybierz powierzchnię (spust na niej albo lista w Bryłach)');
    U.rzadW(570, 140, [{ id: 'pw:tnij', text: 'Tnij bryłę', icon: 'tnij', disabled: !pow, active: !!(this.oczekujeB && this.oczekujeB.op === 'tnij') },
                       { id: 'pw:pogrub', text: `Pogrub ${fmt(this.gruboscPow)} mm`, icon: 'pogrub', disabled: !pow, flex: 1.3 },
                       { id: 'pw:wpisz', text: 'Wpisz grubość', icon: 'numer', disabled: !pow, flex: 1.1 }]);
    U.rzadW(724, 96, [{ id: 'pw:grubosc', sub: 'Grubość', text: `${fmt(this.gruboscPow)} mm` },
                      { id: 'usun', text: 'Usuń', icon: 'usun', disabled: !this.zazn.length }, this.przyciskCofnij()]);
    const pomoc = [
      'Płaska: zamknięty obrys z zakładki Szkic → „Płaska ze szkicu”',
      vr ? 'Wstążka: trzymaj oba spusty, prowadź ręce, puść' : 'Wstążka: tylko w goglach (dwie ręce)',
      vr ? 'Między krzywymi: 2× trzymaj spust i prowadź rękę' : 'Między krzywymi: 2× klikaj punkty + Enter',
      'Tnij: wybierz powierzchnię → „Tnij bryłę” → wskaż bryłę',
      'Powierzchnia musi przechodzić przez całą bryłę; po cięciu się chowa',
    ];
    U.ramka(862, 298, 'Jak to działa');
    pomoc.forEach((t, i) => U.dodaj({ kind: 'info', x: PANEL.PAD + 14, y: 898 + i * 50, w: PANEL.W - 2 * PANEL.PAD - 28, h: 46, text: t, color: PANEL.KOLORY.szary }));
  }

  rzadSnapu(U, y) {
    U.rzadW(y, 96, [{ id: 'snap', text: this.snap.wl ? 'Snap: TAK' : 'Snap: NIE', active: this.snap.wl },
                    { id: 'siatka', sub: 'Siatka', text: `${this.snap.siatka} mm` }, { id: 'kat', sub: 'Kąt', text: `${this.snap.kat}°` }]);
  }

  ukladEdycja(U) {
    const b = this.wybrana();
    if (!b) {
      U.info(130, 'Wybierz bryłę: spust na bryle albo nazwa na liście', 48, 'left', PANEL.KOLORY.szary);
      U.ramka(200, 160, 'Snap (przyciąganie)');
      this.rzadSnapu(U, 238);
      U.rzadW(390, 96, [this.przyciskCofnij()]);
      return;
    }
    const typ = b.def.typ;
    const nazwyTypow = { ...PROJEKT.NAZWY, boolean: 'Wynik operacji', oryginal: 'Część oryginału' };
    U.info(112, b.nazwa, 48, 'left', PANEL.KOLORY.akcent);
    U.info(160, `${nazwyTypow[typ] || typ} · ` + (typ === 'powierzchnia' ? `${fmt((b.pole || 0) / 100 * b.skala ** 2, 1)} cm²` : `${fmt(b.objetosc / 1000 * b.skala ** 3, 1)} cm³`) + (this.zazn.length > 1 ? ` · zaznaczone: ${this.zazn.length}` : ''), 44, 'left', PANEL.KOLORY.szary);
    const pola = polaTypu(typ, this.api.upAxis);
    U.ramka(212, 152, typ === 'obrot' ? 'Kąt obrotu [°]' : 'Wymiary [mm]');
    if (pola) U.rzadW(250, 96, pola.map(([k, et]) => ({ id: 'wym', sub: et, text: fmt(poleZDef(b.def, k)) })));
    else U.dodaj({ kind: 'info', x: PANEL.PAD + 14, y: 274, w: 700, h: 48, text: 'Bez wymiarów (zmiana tylko skalą)', color: PANEL.KOLORY.szary });
    U.ramka(376, 152, 'Położenie środka [mm]');
    U.rzadW(414, 96, [0, 1, 2].map((i) => ({ id: 'poz:' + i, sub: 'XYZ'[i], text: fmt(b.poz[i], 1) })));
    U.ramka(540, 152, 'Obrót [°] i skala');
    U.rzadW(578, 96, [...[0, 1, 2].map((i) => ({ id: 'obr:' + i, sub: 'Obrót ' + 'XYZ'[i], text: fmt(b.obr[i], 1) })), { id: 'skala', sub: 'Skala', text: fmt(b.skala, 3) }]);
    U.ramka(704, 152, 'Operacje: wybrana = A, potem wskaż B');
    U.rzadW(742, 96, Object.entries(NAZWY_OP).map(([op, text]) => ({ id: 'op:' + op, text, active: !!(this.oczekujeB && this.oczekujeB.op === op) })));
    U.ramka(868, 128, 'Kolor');
    U.rzadW(906, 72, PROJEKT.KOLORY.map((k, i) => ({ id: 'kolor:' + i, kind: 'swatch', color: k, active: b.kolor === k })));
    U.rzadW(1010, 96, [{ id: 'snap', text: this.snap.wl ? 'Snap: TAK' : 'Snap: NIE', active: this.snap.wl, flex: 1.1 },
                       { id: 'siatka', sub: 'Siatka', text: `${this.snap.siatka} mm`, flex: 0.9 }, { id: 'kat', sub: 'Kąt', text: `${this.snap.kat}°`, flex: 0.8 },
                       { ...this.przyciskCofnij(), text: 'Cofnij' }, { id: 'odznacz', text: 'Odznacz', icon: 'anuluj' }]);
  }

  ukladPlik(U) {
    const n = this.zazn.length;
    U.ramka(112, 314, 'Eksport STEP — prawdziwe bryły (pobranie pliku)');
    U.rzadW(150, 140, [{ id: 'eksport:wszystko', text: 'Wszystko', icon: 'pobierz' }, { id: 'eksport:nowe', text: 'Tylko nowe', icon: 'szkic' },
                       { id: 'eksport:oryginal', text: 'Oryginał', icon: 'przejmij', disabled: !(this.projekt && this.projekt.oryginal) },
                       { id: 'eksport:zaznaczone', text: `Zaznaczone (${n})`, icon: 'wiele', disabled: !n }]);
    U.dodaj({ kind: 'info', x: PANEL.PAD + 14, y: 310, w: PANEL.W - 2 * PANEL.PAD - 28, h: 48,
              text: this.ostatniEksport ? `Ostatni: ${this.ostatniEksport.nazwa}` : 'Plik trafia do folderu Pobrane', color: PANEL.KOLORY.szary });
    U.dodaj({ kind: 'info', x: PANEL.PAD + 14, y: 360, w: PANEL.W - 2 * PANEL.PAD - 28, h: 44,
              text: 'Po powrocie do podglądu: Zapisz STEP (też na Google Drive)', color: PANEL.KOLORY.szary });
    U.ramka(440, 196, 'Tryb i geometria');
    const st = { brak: 'nie uruchomiona', laduje: 'ładowanie…', gotowy: 'gotowa', blad: 'błąd' }[this.stanSilnika];
    U.rzadW(478, 140, [{ id: 'wroc', text: 'Wróć do podglądu', icon: 'wroc', flex: 1.4 }, this.przyciskCofnij(),
                       { id: '', kind: 'info', align: 'center', text: `Geometria: ${st}` + (this.silnik && this.silnik.restarty ? ` · restarty: ${this.silnik.restarty}` : ''), flex: 1.6 }]);
    const vr = this.api.renderer.xr.isPresenting;
    const pomoc = vr
      ? ['Narzędzie bryły: spust w punkcie A, przeciągnij do B, puść', 'Szkic: spust = punkt, potem Wyciągnij albo Obrót',
         'Spust na bryle: wybierz · na pustym: odznacz', 'Grip na bryle: chwyć (zielony punkt) · w pustym: całość',
         'Trzymasz bryłę: prawy spust = kopia, A = usuń', 'Dwa gripy: obrót + skala · prawa gałka: skala sceny',
         'B: cofnij · A: zrzut · X: panel · Y: reset widoku']
      : ['Narzędzie bryły: przeciągnij myszą po płaszczyźnie', 'Klik: wybierz (jak spust) · uchwyty: przesuń / obróć',
         'W / E / R: uchwyt przesuwu / obrotu / skali', 'Strzałki, PageUp/PageDown: krok siatki (Shift ×10)',
         'Q / Shift+Q: obrót o kąt snapu · + / −: skala', 'Del: usuń · Ctrl+D: kopiuj · Ctrl+G: grupuj',
         'Ctrl+Z: cofnij · Esc: odznacz / wyjdź z narzędzia'];
    U.ramka(650, 510, vr ? 'Sterowanie w goglach' : 'Sterowanie na PC (test bez gogli)');
    pomoc.forEach((t, i) => U.dodaj({ kind: 'info', x: PANEL.PAD + 14, y: 690 + i * 62, w: PANEL.W - 2 * PANEL.PAD - 28, h: 56, text: t }));
  }

  ukladNumpada(U) {
    const n = this.numpad, p = n.pola[n.i];
    U.info(20, n.tytul, 48, 'left', PANEL.KOLORY.akcent);
    U.info(72, `${p.etykieta}` + (n.pola.length > 1 ? `  (${n.i + 1} z ${n.pola.length})` : ''), 44);
    U.dodaj({ kind: 'wartosc', id: '', text: n.tekst, sub: p.jednostka, x: PANEL.PAD, y: 128, w: PANEL.W - 2 * PANEL.PAD, h: 160 });
    const k = (t, id, extra = {}) => ({ id: 'np:' + id, text: t, ...extra });
    U.rzad(312, 118, [k('7', '7'), k('8', '8'), k('9', '9'), k('', 'wstecz', { icon: 'wstecz' })]);
    U.rzad(442, 118, [k('4', '4'), k('5', '5'), k('6', '6'), k('C', 'wyczysc')]);
    U.rzad(572, 118, [k('1', '1'), k('2', '2'), k('3', '3'), k('±', 'minus')]);
    U.rzad(702, 118, [k('0', '0', { flex: 2.08 }), k(',', 'przecinek'), k('', '', { disabled: true })]);
    U.rzad(840, 118, [k('Anuluj', 'anuluj', { icon: 'anuluj' }), k(n.i < n.pola.length - 1 ? 'Dalej' : 'OK', 'ok', { icon: 'ok', active: true, flex: 1.6 })]);
    U.info(984, 'Na PC: cyfry z klawiatury, Enter = OK, Esc = anuluj', 44, 'left', PANEL.KOLORY.szary);
    return U;
  }

  akcja(id) {
    if (!id) return;
    const i = id.indexOf(':');
    const k = i < 0 ? id : id.slice(0, i), v = i < 0 ? '' : id.slice(i + 1);
    if (k === 'np') { this.klawiszNumpada(v); return; }
    if (k === 'tab') {
      this.strona = v;
      if (v === 'szkic') { this.zacznijSzkic(); if (this.narzedzie !== 'szkic') this.ustawNarzedzie('szkic'); }
      else if (this.narzedzie === 'szkic' || ((this.narzedzie === 'krzywe' || this.narzedzie === 'wstazka') && v !== 'pow')) this.ustawNarzedzie('wybierz');
      return;
    }
    if (k === 'wroc') { this.api.wyjdz(); return; }
    if (!this.projekt) { this.powiedz('Geometria się ładuje…'); return; }
    const b = this.wybrana();
    const S = this.szkic;
    switch (k) {
      case 'narz': case 'dodaj': this.ustawNarzedzie(v); break;
      case 'cofnij': this.cofnij(); break;
      case 'oryginal': this.przejmijOryginal(); break;
      case 'kopiuj': this.kopiuj(); break;
      case 'usun': this.usun(); break;
      case 'wiele': this.wiele = !this.wiele; this.powiedz(this.wiele ? 'Zaznaczanie wielu brył: klikaj kolejne' : 'Zaznaczanie jednej bryły'); break;
      case 'grupuj': this.grupuj(); break;
      case 'rozgrupuj': this.rozgrupuj(); break;
      case 'pokaz':
        if (this.projekt.bryly.some((x) => !x.widoczna)) this.zapiszHistorie('pokaż wszystko');
        this.projekt.bryly.forEach((x) => this.projekt.ustawWlasciwosci(x.id, { widoczna: true })); break;
      case 'vis': { const x = this.bryla(v); if (x) { this.zapiszHistorie(x.widoczna ? 'ukrycie' : 'pokazanie'); this.projekt.ustawWlasciwosci(v, { widoczna: !x.widoczna }); } break; }
      case 'sel': this.wybierz(v); break;
      case 'lista': this.przewin += (v === '+' ? 1 : -1) * (SZK.WIERSZE_LISTY - 1); break;
      case 'wym': if (b) this.zmienWymiar(b); break;
      case 'poz': if (b) this.zmienTransformacje(b, 'poz', Number(v)); break;
      case 'obr': if (b) this.zmienTransformacje(b, 'obr', Number(v)); break;
      case 'skala': if (b) this.zmienTransformacje(b, 'skala'); break;
      case 'op': this.operacja(v); break;
      case 'snap': this.snap.wl = !this.snap.wl; this.ustawSnapUchwytow(); this.powiedz('Snap: ' + (this.snap.wl ? 'TAK' : 'NIE')); break;
      case 'siatka': { const L = SZK.SIATKI_MM; this.snap.siatka = L[(L.indexOf(this.snap.siatka) + 1) % L.length]; this.ustawSnapUchwytow(); break; }
      case 'kat': { const L = SZK.KATY_DEG; this.snap.kat = L[(L.indexOf(this.snap.kat) + 1) % L.length]; this.ustawSnapUchwytow(); break; }
      case 'kolor':
        if (this.zazn.length) this.zapiszHistorie('kolor');
        for (const id2 of this.zazn) this.projekt.ustawWlasciwosci(id2, { kolor: PROJEKT.KOLORY[Number(v)] }); break;
      case 'odznacz': this.odznacz(); break;
      case 'eksport': this.eksport(v); break;
      // szkic
      case 'pl': this.ustawPlaszczyzne(v); break;
      case 'bk':
        if (v === 'prostokat' || v === 'okrag') this.belka.ksztalt = v;
        else this.zmienBelke(v[0] === 'a' ? (this.belka.ksztalt === 'okrag' ? 'd' : 'a') : 'b', v.endsWith('+') ? 1.25 : 0.8, true);
        this.powiedz(this.belkaTekst());
        break;
      case 'pw':
        if (v === 'plaska') this.powierzchniaZeSzkicu();
        else if (v === 'tnij') this.zacznijCiecie();
        else if (v === 'pogrub') this.pogrubWybrana(this.gruboscPow);
        else if (v === 'wpisz') this.wpiszGrubosc();
        else if (v === 'grubosc') { const L = SZK.GRUBOSCI_MM; this.gruboscPow = L[(L.indexOf(this.gruboscPow) + 1) % L.length]; this.powiedz(`Grubość: ${this.gruboscPow} mm`); }
        else if (v === 'koniec') this.zakonczKrzywa();
        else if (v === 'anuluj') { this.krzywe = this.narzedzie === 'krzywe' ? { a: null, biezaca: null, zrodlo: null } : null; this.wstazka = null; this.powiedz('Krzywe anulowane'); }
        break;
      case 'sz':
        if (this.narzedzie !== 'szkic') { this.zacznijSzkic(); this.ustawNarzedzie('szkic'); }
        if (['linia', 'luk', 'lukStyczny', 'zaokraglij'].includes(v)) {
          this.narzSzkicu = v; if (this.szkic) this.szkic.s.lukSrodek = null;
          this.powiedz({ linia: 'Linia', luk: 'Łuk przez 3 punkty: początek, punkt na łuku, koniec',
                         lukStyczny: 'Łuk styczny: płynnie przedłuża poprzedni odcinek, wskaż koniec łuku',
                         zaokraglij: `Zaokrąglenie: wskaż narożnik, promień ${fmt(this.promienZaokr)} mm` }[v]);
        }
        else if (v === 'promien') { const L = SZK.PROMIENIE_MM; this.promienZaokr = L[(L.indexOf(this.promienZaokr) + 1) % L.length]; this.narzSzkicu = 'zaokraglij'; this.powiedz(`Promień zaokrąglenia: ${this.promienZaokr} mm`); }
        else if (v === 'powierzchnia') this.powierzchniaZeSzkicu();
        else if (v === 'wstecz') this.szkicCofnij();
        else if (v === 'zamknij') this.zamknijSzkic();
        else if (v === 'anuluj') this.anulujSzkic();
        else if (v === 'wyciagnij') { if (S && S.faza === 'wyciagnij') S.faza = 'rysuj'; else this.zacznijWyciaganie(); }
        else if (v === 'wysokosc') this.wpiszWysokosc();
        else if (v === 'obrot') { if (S && S.faza === 'os') S.faza = 'rysuj'; else this.zacznijObrot(); }
        else if (v === 'kat') { const L = SZK.KATY_OBROTU; this.katObrotu = L[(L.indexOf(this.katObrotu) + 1) % L.length]; this.powiedz(`Kąt obrotu: ${this.katObrotu}°`); }
        break;
      default: break;
    }
  }

  // ==========================================================================
  // NAPIS NAD WYBRANĄ BRYŁĄ
  // ==========================================================================
  utworzEtykiete() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.renderOrder = 999; sprite.visible = false;
    return { canvas, tex, sprite, tekst: '' };
  }

  opisBryly(b) {
    const d = b.def;
    const wym = d.typ === 'prostopadloscian' ? `${fmt(d.dx)}×${fmt(d.dy)}×${fmt(d.dz)}` : d.typ === 'walec' ? `Ø${fmt(d.r * 2)}×${fmt(d.h)}`
      : d.typ === 'kula' ? `Ø${fmt(d.r * 2)}` : d.typ === 'wyciagniecie' ? `h ${fmt(d.h)}` : d.typ === 'obrot' ? `${fmt(d.kat ?? 360)}°` : '';
    return `${b.nazwa}${wym ? '  ' + wym : ''}${b.skala !== 1 ? '  ×' + fmt(b.skala, 3) : ''}   X ${fmt(b.poz[0], 0)}  Y ${fmt(b.poz[1], 0)}  Z ${fmt(b.poz[2], 0)}`;
  }

  aktualizujEtykiete() {
    const e = this.etykieta, t = this.tworzenie && this.tworzenie.ksztalt;
    const b = t ? null : this.wybrana(), w = b && this.wezly.get(b.id);
    const obiekt = t ? this.podglad.grupa : w && w.holder;
    if (!obiekt || !obiekt.visible) { e.sprite.visible = false; return; }
    const tekst = t ? `${t.nazwa || PROJEKT.NAZWY[t.def.typ]}  ${t.opis}` : this.opisBryly(b);
    if (tekst !== e.tekst) {
      e.tekst = tekst;
      const ctx = e.canvas.getContext('2d'), W = 1024, H = 128;
      ctx.clearRect(0, 0, W, H);
      ctx.font = '600 50px system-ui, sans-serif';
      const tw = Math.min(W - 8, ctx.measureText(tekst).width + 60);
      ctx.fillStyle = 'rgba(20,22,26,0.88)'; ctx.beginPath(); ctx.roundRect((W - tw) / 2, 14, tw, 100, 22); ctx.fill();
      ctx.strokeStyle = '#ff8a1f'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tekst, W / 2, 66, W - 60);
      e.tex.needsUpdate = true;
    }
    const box = new THREE.Box3().setFromObject(obiekt);
    if (box.isEmpty()) { e.sprite.visible = false; return; }
    const p = box.getCenter(new THREE.Vector3()); p.y = box.max.y;
    const cam = this.api.viewCamera();
    const oko = cam.getWorldPosition(new THREE.Vector3());
    const h = Math.max(0.015, oko.distanceTo(p) * SZK.ETYKIETA_WYSOKOSC);
    e.sprite.scale.set(h * 8, h, 1);
    e.sprite.position.copy(p).add(new THREE.Vector3(0, h * 0.8, 0));
    e.sprite.visible = true;
  }
}
