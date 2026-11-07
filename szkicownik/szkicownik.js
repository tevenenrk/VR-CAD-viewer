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
  WIERSZE_LISTY: 7,
  PIVOT_BEZ_MODELU: [0, 1.0, -0.6], // gdzie stoi początek układu CAD, gdy nie ma wczytanego modelu (m)
  SKALA_SCENY_MIN: 0.0005, SKALA_SCENY_MAX: 20,
  SKALA_SCENY_PREDKOSC: 1.2,      // prawa gałka
  STICK_DEADZONE: 0.25,
  ETYKIETA_WYSOKOSC: 0.05,        // wysokość napisu nad bryłą jako ułamek odległości od oczu
  KOMUNIKAT_S: 4,                 // jak długo komunikat wisi w stopce panelu
};

// Pola wpisywane przy dodawaniu / zmianie wymiarów. „Góra” = oś góry pliku CAD (Y jak w SolidWorksie albo Z).
function polaTypu(typ, osGory = 'Y') {
  const z = osGory === 'Z';
  return {
    prostopadloscian: [['dx', 'Szerokość X'], ['dy', z ? 'Głębokość Y' : 'Wysokość Y'], ['dz', z ? 'Wysokość Z' : 'Głębokość Z']],
    walec: [['d', 'Średnica Ø'], ['h', 'Wysokość (oś pionowa)']],
    kula: [['d', 'Średnica Ø']],
    wyciagniecie: [['h', 'Wysokość wyciągnięcia']],
  }[typ] || null;
}
const NAZWY_OP = { suma: 'Suma', roznica: 'Różnica', wspolna: 'Część wspólna' };
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
  return def[pole];
}
function defZPol(typ, wartosci, staraDef) {
  if (typ === 'prostopadloscian') return { typ, dx: wartosci.dx, dy: wartosci.dy, dz: wartosci.dz };
  if (typ === 'walec') return { typ, r: wartosci.d / 2, h: wartosci.h };
  if (typ === 'kula') return { typ, r: wartosci.d / 2 };
  if (typ === 'wyciagniecie') return { ...staraDef, h: wartosci.h };
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

    this.root = new THREE.Group();             // układ CAD w milimetrach
    this.root.name = 'Szkicownik';
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
    this.przerwijTworzenie();
    for (const c of this.api.controllers) if (c.userData.szk) c.userData.szk.chwyt = null;
    this.dwieRece = null;
    // nowe bryły zostają widoczne w podglądzie; przejęte części oryginału pokazuje znów viewer
    for (const [id, w] of this.wezly) {
      const b = this.bryla(id);
      w.holder.visible = !!b && b.widoczna && b.zrodlo !== 'oryginal';
      this.ustawPodswietlenie(w, '');
    }
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

  ukryjPrzejete() {
    if (!this.tlo || !this.projekt || !this.projekt.oryginal || this.projekt.oryginal.cadRoot !== this.api.cadRoot) return;
    for (const b of this.projekt.bryly) {
      if (b.zrodlo !== 'oryginal' || !(b.indeksCzesci >= 0)) continue;
      const p = this.api.parts[b.indeksCzesci];
      if (!p || this.tlo.ukryte.some((s) => s.mesh === p.mesh)) continue;
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
      this.projekt.oryginal.cadRoot = this.api.cadRoot;
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

  async zadanie(opis, fn) {
    if (this.zajety) { this.powiedz('Poczekaj — trwa poprzednia operacja'); return null; }
    if (!this.gotowy()) return null;
    this.zajety = true;
    if (opis) this.powiedz(opis);
    try { return await fn(); }
    catch (e) { this.powiedz(e.message); return null; }
    finally { this.zajety = false; }
  }

  // ==========================================================================
  // TWORZENIE BRYŁ ROZCIĄGANIEM (jak w Gravity Sketch): spust w punkcie A, przeciągnij do B, puść
  // ==========================================================================
  ustawNarzedzie(n) {
    this.narzedzie = n;
    this.przerwijTworzenie();
    this.przypnijUchwyty();
    const vr = this.api.renderer.xr.isPresenting;
    this.powiedz(n === 'wybierz' ? 'Narzędzie: wybierz / chwyć'
      : `${PROJEKT.NAZWY[n]}: ` + (vr ? 'spust w punkcie początkowym, przeciągnij, puść' : 'przeciągnij myszą (Esc = wybierz)'));
  }

  osGoryIndeks() { return this.api.upAxis === 'Z' ? 2 : 1; }
  krok() { return this.snap.wl ? this.snap.siatka : 1; }
  naSiatke(p) { const g = this.krok(); return p.map((v) => Math.round(v / g) * g); }
  swiatDoCad(pW) { this.root.updateMatrixWorld(true); return this.root.worldToLocal(pW.clone()).toArray(); }
  cadDoSwiata(p) { this.root.updateMatrixWorld(true); return this.root.localToWorld(new THREE.Vector3(...p)); }
  czubek(c) { const v = new THREE.Vector3(); return c.userData.tip ? c.userData.tip.getWorldPosition(v) : c.getWorldPosition(v); }

  // Bryła z dwóch punktów (mm CAD, na siatce). naPlaszczyznie = PC: B leży na płaszczyźnie startu, wysokość dobierana sama
  ksztaltZPunktow(typ, A, B, naPlaszczyznie) {
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
      const b = await this.projekt.dodaj(k.def, { poz: k.poz, obr: k.obr });
      this.wiele = false; this.zazn = [b.id]; this.prowadzaca = b.id; this.przypnijUchwyty();
      this.powiedz(`Dodano: ${b.nazwa}  ${k.opis}`);
      return b;
    });
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
    });
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
      this.powiedz(`Usunięto: ${ids.length} (cofanie będzie w etapie 5)`);
    });
  }

  zmienWymiar(b) {
    const pola = polaTypu(b.def.typ, this.api.upAxis);
    if (!pola) { this.powiedz('Ta bryła nie ma wymiarów — użyj skali'); return; }
    this.otworzNumpad({
      tytul: `${b.nazwa}: wymiary`,
      pola: pola.map(([k, et]) => ({ klucz: k, etykieta: et, wartosc: poleZDef(b.def, k), jednostka: 'mm', dodatnia: true })),
      gotowe: (w) => this.zadanie('Przeliczam bryłę…', async () => {
        await this.projekt.zmienDef(b.id, defZPol(b.def.typ, w, b.def));
        this.powiedz(`Zmieniono wymiary: ${b.nazwa}`);
      }),
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
    if (id === a) { this.powiedz('Wskaż inną bryłę jako B'); return; }
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
    });
  }

  kopiuj() {
    if (!this.zazn.length) { this.powiedz('Wybierz bryłę do skopiowania'); return null; }
    return this.zadanie('Kopiuję…', async () => {
      const kopie = await this.projekt.kopiuj(this.zazn, [SZK.PRZESUNIECIE_KOPII_MM, 0, 0]);
      this.zazn = kopie.map((b) => b.id); this.prowadzaca = this.zazn[0]; this.przypnijUchwyty();
      this.powiedz(`Skopiowano: ${kopie.length}`);
      return kopie;
    });
  }

  usun() {
    if (!this.zazn.length) { this.powiedz('Wybierz bryłę do usunięcia'); return null; }
    const ids = [...this.zazn];
    return this.zadanie(null, async () => {
      await this.projekt.usun(ids);
      this.zazn = []; this.prowadzaca = null; this.przypnijUchwyty();
      this.powiedz(`Usunięto: ${ids.length}`);
    });
  }

  grupuj() {
    try {
      const g = this.projekt.grupuj(this.zazn);
      this.powiedz(`Utworzono ${g.nazwa} (${this.zazn.length} brył) — chwytasz i eksportujesz ją razem`);
    } catch (e) { this.powiedz(e.message); }
  }

  rozgrupuj() {
    if (!this.zazn.length) { this.powiedz('Wybierz bryłę z grupy'); return; }
    this.projekt.rozgrupuj(this.zazn);
    this.powiedz('Rozgrupowano');
  }

  // Oryginalny STEP z viewera → elementy złożenia szkicownika (prawdziwe bryły, nazwy z drzewa viewera)
  przejmijOryginal() {
    const a = this.api;
    if (!a.cadRoot || !a.lastFile) { this.powiedz('Najpierw wczytaj model STEP w podglądzie'); return null; }
    if (this.projekt && this.projekt.oryginal) { this.powiedz('Oryginał jest już przejęty'); return null; }
    return this.zadanie('Przejmuję oryginał (odczyt brył STEP)…', async () => {
      const bajty = new Uint8Array(await a.lastFile.blob.arrayBuffer());
      const widoczna = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
      const widoczne = a.parts.map((p) => widoczna(p.mesh));
      // kopie zrobione w podglądzie nie mają własnych brył w pliku — ramka „nigdzie”, dodane niżej jako kopie
      const czesci = a.parts.map((p) => {
        const bb = p.mesh.geometry.boundingBox;
        const kopia = !!p.kopia;
        return { nazwa: p.name, sciezka: p.path.slice(0, -1), kolor: '#' + mats(p.mesh)[0].color.getHexString(),
                 min: kopia ? [Infinity, Infinity, Infinity] : bb.min.toArray().map((v) => v * 1000),
                 max: kopia ? [-Infinity, -Infinity, -Infinity] : bb.max.toArray().map((v) => v * 1000) };
      });
      const w = await this.projekt.wczytajOryginal(bajty, czesci, a.modelName);
      // położenie z podglądu (część przesunięta chwytem): H = M[mm] · przesunięcie(−lok)
      const S = new THREE.Matrix4().makeScale(1000, 1000, 1000), Si = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
      const zPodgladu = (b, mesh) => {
        mesh.updateMatrix();
        const H = S.clone().multiply(mesh.matrix).multiply(Si).multiply(new THREE.Matrix4().makeTranslation(-b.lok[0], -b.lok[1], -b.lok[2]));
        this.projekt.ustawTransformacje(b.id, this.zMacierzy(H));
      };
      const I = new THREE.Matrix4();
      for (const b of w.bryly) {
        const p = b.indeksCzesci >= 0 && a.parts[b.indeksCzesci];
        if (!p) continue;
        p.mesh.updateMatrix();
        if (!p.mesh.matrix.equals(I)) zPodgladu(b, p.mesh);
        if (!widoczne[b.indeksCzesci]) this.projekt.ustawWlasciwosci(b.id, { widoczna: false });
      }
      let kopii = 0;
      for (let i = 0; i < a.parts.length; i++) {
        const p = a.parts[i];
        if (!p.kopia || !p.mesh.userData.kopiaZ) continue;
        const iz = a.parts.findIndex((x) => x.mesh === p.mesh.userData.kopiaZ);
        const zr = w.bryly.find((b) => b.indeksCzesci === iz) || this.projekt.bryly.find((b) => b.zrodlo === 'oryginal' && b.indeksCzesci === iz);
        if (!zr) continue;
        const [k] = await this.projekt.kopiuj([zr.id], [0, 0, 0]);
        k.nazwa = p.name; k.indeksCzesci = i;
        zPodgladu(k, p.mesh);
        if (!widoczne[i]) this.projekt.ustawWlasciwosci(k.id, { widoczna: false });
        kopii++;
      }
      this.ukryjPrzejete();
      this.powiedz(`Przejęto ${w.bryly.length} części` + (kopii ? ` + ${kopii} kopii` : '') + (w.niedopasowane ? ` (bez nazwy: ${w.niedopasowane})` : ''));
      return w;
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
      const glowna = a.isMain(c);

      if (a.buttonPressedEdge(c, B.AX)) {
        if (glowna && this.trzymane()) { this.usunTrzymane(); a.pulse(c, 0.6, 40); }
        else if (glowna) { this.ukryjPanelKlatek = 2; a.requestScreenshot(); }
        else { this.panelWidoczny = !this.panelWidoczny; }
      }
      if (a.buttonPressedEdge(c, B.BY)) {
        if (glowna) this.powiedz('Cofanie będzie w etapie 5');
        else this.resetWidoku();
      }
      const gp = src.gamepad;
      if (glowna && gp && gp.axes.length >= 4 && Math.abs(gp.axes[3]) > SZK.STICK_DEADZONE && !a.controllers.some((o) => o.userData.szk && o.userData.szk.chwyt)) {
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
        else if (this.narzedzie !== 'wybierz' && !this.tworzenie && !this.numpad) {
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
      const tworzy = this.narzedzie !== 'wybierz' && !s.hover && !s.chwyt;
      const pT = !tworzy ? null : this.cadDoSwiata(this.tworzenie && this.tworzenie.zrodlo === c ? this.tworzenie.B : this.naSiatke(this.swiatDoCad(this.czubek(c))));
      this.ustawZnacznik(this.znaczniki[i * 2 + 1], pT, SZK.KOLOR_PODGLADU);
    }
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
      tc.addEventListener('dragging-changed', (e) => { a.controls.enabled = !e.value; this.pc.przeciaganie = e.value; });
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
        if (this.narzedzie !== 'wybierz' && e.button === 0 && !this.numpad && this.gotowy()) {
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
    if (kroki[k] && this.zazn.length) {
      const [os, zn] = kroki[k];
      const d = zn * this.snap.siatka * (e.shiftKey ? 10 : 1);
      for (const id of this.zazn) { const b = this.bryla(id); const p = [...b.poz]; p[os] += d; this.projekt.ustawTransformacje(id, { poz: p }); }
    } else if ((k === 'q' || k === 'Q') && this.zazn.length) {
      this.obrocZaznaczone((e.shiftKey ? -1 : 1) * this.snap.kat);
    } else if ((k === '+' || k === '=' || k === '-') && this.zazn.length && !ctrl) {
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
    else if (ctrl && (k === 'z' || k === 'Z')) this.powiedz('Cofanie będzie w etapie 5');
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
  // PANEL: układ zakładek i reakcje na przyciski
  // ==========================================================================
  stopka() {
    if (this.msg) return this.msg;
    if (this.oczekujeB) return `${NAZWY_OP[this.oczekujeB.op]}: wskaż bryłę B spustem`;
    if (this.zajety) return 'Liczę…';
    if (this.narzedzie !== 'wybierz') return this.api.renderer.xr.isPresenting ? 'Spust w punkcie A → przeciągnij → puść' : 'Przeciągnij myszą po płaszczyźnie · Esc = wybierz';
    return 'Spust: wybierz · Grip: chwyć (prawy spust = kopia, A = usuń)';
  }

  uklad() {
    const U = new Uklad();
    if (this.numpad) return this.ukladNumpada(U);
    U.rzad(20, 80, [['bryly', 'Bryły'], ['edycja', 'Edycja'], ['plik', 'Plik']].map(([id, text]) => ({ id: 'tab:' + id, text, active: this.strona === id, tab: true })));
    if (this.strona === 'bryly') this.ukladBryly(U);
    else if (this.strona === 'edycja') this.ukladEdycja(U);
    else this.ukladPlik(U);
    return U;
  }

  ukladBryly(U) {
    const a = this.api, P = PANEL.PAD, W = PANEL.W;
    const lista = this.projekt ? this.projekt.bryly : [];
    const brak = !this.zazn.length;
    U.etykieta(116, 'Narzędzie (spust): rozciągnij bryłę od punktu do punktu');
    U.rzad(154, 92, [['wybierz', 'Wybierz'], ['prostopadloscian', 'Prostopadłościan'], ['walec', 'Walec'], ['kula', 'Kula']]
      .map(([id, text]) => ({ id: 'narz:' + id, text, active: this.narzedzie === id, flex: id === 'prostopadloscian' ? 1.6 : 1 })));
    const moznaPrzejac = !!(a.cadRoot && a.lastFile && !(this.projekt && this.projekt.oryginal));
    U.rzad(258, 86, [{ id: 'oryginal', text: this.projekt && this.projekt.oryginal ? 'Oryginał przejęty' : 'Przejmij oryginał', disabled: !moznaPrzejac, flex: 1.4 },
                     { id: 'kopiuj', text: 'Kopiuj', disabled: brak }, { id: 'usun', text: 'Usuń', disabled: brak }]);
    U.etykieta(360, `Bryły (${lista.length})` + (this.zazn.length ? ` · zaznaczone: ${this.zazn.length}` : ''));
    U.rzad(398, 76, [{ id: 'wiele', text: this.wiele ? 'Zaznaczanie: wiele' : 'Zaznaczanie: jedna', active: this.wiele, flex: 1.5 },
                     { id: 'grupuj', text: 'Grupuj', disabled: this.zazn.length < 2 }, { id: 'rozgrupuj', text: 'Rozgrupuj', disabled: brak },
                     { id: 'pokaz', text: 'Pokaż wszystko' }]);
    if (!lista.length) U.info(500, this.stanSilnika === 'gotowy' ? 'Brak brył — dodaj prostopadłościan, walec albo kulę' : 'Ładowanie geometrii…');
    const N = SZK.WIERSZE_LISTY;
    this.przewin = Math.max(0, Math.min(this.przewin, lista.length - N));
    for (let k = 0; k < N; k++) {
      const b = lista[this.przewin + k];
      if (!b) break;
      const y = 488 + k * 78;
      const g = b.grupa && this.projekt.grupa(b.grupa);
      U.dodaj({ kind: 'check', id: 'vis:' + b.id, checked: b.widoczna, x: P, y, w: 70, h: 70 });
      U.dodaj({ kind: 'item', id: 'sel:' + b.id, text: b.nazwa, sub: g ? g.nazwa : (b.zrodlo === 'oryginal' ? 'oryginał' : ''),
                active: this.zazn.includes(b.id), dim: !b.widoczna, x: P + 84, y, w: W - 2 * P - 84, h: 70 });
    }
    U.rzad(1046, 76, [{ id: 'lista:-', text: '▲', disabled: this.przewin <= 0, flex: 0.7 }, { id: 'lista:+', text: '▼', disabled: this.przewin + N >= lista.length, flex: 0.7 },
                      { id: '', kind: 'info', align: 'center', text: lista.length ? `${this.przewin + 1}–${Math.min(lista.length, this.przewin + N)} z ${lista.length}` : '', flex: 1.6 }]);
  }

  ukladEdycja(U) {
    const b = this.wybrana();
    if (!b) { U.info(130, 'Wybierz bryłę: spust na bryle albo nazwa na liście'); this.ukladSnap(U, 846); return; }
    const typ = b.def.typ;
    const nazwyTypow = { ...PROJEKT.NAZWY, boolean: 'Wynik operacji', oryginal: 'Część oryginału' };
    U.info(112, b.nazwa, 48, 'left', PANEL.KOLORY.akcent);
    U.info(160, `${nazwyTypow[typ] || typ} · ${fmt(b.objetosc / 1000 * b.skala ** 3, 1)} cm³` + (this.zazn.length > 1 ? ` · zaznaczone: ${this.zazn.length}` : ''), 44, 'left', PANEL.KOLORY.szary);
    U.etykieta(216, 'Wymiary [mm]');
    const pola = polaTypu(typ, this.api.upAxis);
    if (pola) U.rzad(254, 96, pola.map(([k, et]) => ({ id: 'wym', sub: et, text: fmt(poleZDef(b.def, k)) })));
    else U.info(276, 'Bez wymiarów (zmiana tylko skalą)', 48, 'left', PANEL.KOLORY.szary);
    U.etykieta(364, 'Położenie środka [mm]');
    U.rzad(402, 96, [0, 1, 2].map((i) => ({ id: 'poz:' + i, sub: 'XYZ'[i], text: fmt(b.poz[i], 1) })));
    U.etykieta(512, 'Obrót [°] i skala');
    U.rzad(550, 96, [...[0, 1, 2].map((i) => ({ id: 'obr:' + i, sub: 'Obrót ' + 'XYZ'[i], text: fmt(b.obr[i], 1) })), { id: 'skala', sub: 'Skala', text: fmt(b.skala, 3) }]);
    U.etykieta(660, 'Operacje: wybrana = A, potem wskaż B');
    U.rzad(698, 92, Object.entries(NAZWY_OP).map(([op, text]) => ({ id: 'op:' + op, text, active: !!(this.oczekujeB && this.oczekujeB.op === op) })));
    this.ukladSnap(U, 806);
    U.etykieta(946, 'Kolor');
    U.rzad(984, 76, PROJEKT.KOLORY.map((k, i) => ({ id: 'kolor:' + i, kind: 'swatch', color: k, active: b.kolor === k })));
    U.rzad(1078, 80, [{ id: 'kopiuj', text: 'Kopiuj' }, { id: 'usun', text: 'Usuń' }, { id: 'odznacz', text: 'Odznacz' }]);
  }

  ukladSnap(U, y) {
    U.etykieta(y, 'Snap (przyciąganie)');
    U.rzad(y + 38, 86, [{ id: 'snap', text: this.snap.wl ? 'Snap: TAK' : 'Snap: NIE', active: this.snap.wl },
                        { id: 'siatka', text: `Siatka ${this.snap.siatka} mm` }, { id: 'kat', text: `Kąt ${this.snap.kat}°` }]);
  }

  ukladPlik(U) {
    const n = this.zazn.length;
    U.etykieta(116, 'Eksport STEP — prawdziwe bryły (pobranie pliku)');
    U.rzad(154, 92, [{ id: 'eksport:wszystko', text: 'Wszystko' }, { id: 'eksport:nowe', text: 'Tylko nowe' },
                     { id: 'eksport:oryginal', text: 'Oryginał', disabled: !(this.projekt && this.projekt.oryginal) }]);
    U.rzad(258, 86, [{ id: 'eksport:zaznaczone', text: `Zaznaczone (${n})`, disabled: !n }]);
    U.info(358, this.ostatniEksport ? `Ostatni: ${this.ostatniEksport.nazwa}` : 'Plik trafia do folderu Pobrane', 48, 'left', PANEL.KOLORY.szary);
    U.etykieta(426, 'Tryb');
    U.rzad(464, 92, [{ id: 'wroc', text: 'Wróć do podglądu' }]);
    U.etykieta(572, 'Geometria (OpenCascade)');
    const st = { brak: 'nie uruchomiona', laduje: 'ładowanie…', gotowy: 'gotowa', blad: 'błąd' }[this.stanSilnika];
    U.info(610, `Stan: ${st}` + (this.silnik && this.silnik.restarty ? ` · restarty: ${this.silnik.restarty}` : ''), 48);
    if (this.api.renderer.xr.isPresenting) {
      U.etykieta(676, 'Sterowanie w goglach');
      ['Narzędzie bryły: spust w punkcie A, przeciągnij do B, puść', 'Spust na bryle: wybierz · na pustym: odznacz',
       'Grip na bryle: chwyć (zielony punkt) · w pustym: całość', 'Trzymasz bryłę: prawy spust = kopia, A = usuń',
       'Dwa gripy: obrót + skala · prawa gałka: skala sceny', 'A: zrzut · X: panel · Y: reset widoku'].forEach((t, i) => U.info(714 + i * 44, t, 44));
    } else {
      U.etykieta(676, 'Sterowanie na PC (test bez gogli)');
      ['Narzędzie bryły: przeciągnij myszą po płaszczyźnie', 'Klik: wybierz (jak spust) · uchwyty: przesuń / obróć', 'W / E / R: uchwyt przesuwu / obrotu / skali',
       'Strzałki, PageUp/PageDown: krok siatki (Shift ×10)', 'Q / Shift+Q: obrót o kąt snapu · + / −: skala',
       'Del: usuń · Ctrl+D: kopiuj · Ctrl+G: grupuj · Esc: odznacz'].forEach((t, i) => U.info(714 + i * 44, t, 44));
    }
    U.etykieta(1000, 'Wkrótce');
    U.info(1038, 'Etap 4: szkic 2D i wyciągnięcie', 44, 'left', PANEL.KOLORY.szary);
    U.info(1082, 'Etap 5: cofanie, zapis projektu, zapis na Google Drive', 44, 'left', PANEL.KOLORY.szary);
  }

  ukladNumpada(U) {
    const n = this.numpad, p = n.pola[n.i];
    U.info(20, n.tytul, 48, 'left', PANEL.KOLORY.akcent);
    U.info(72, `${p.etykieta}` + (n.pola.length > 1 ? `  (${n.i + 1} z ${n.pola.length})` : ''), 44);
    U.dodaj({ kind: 'wartosc', id: '', text: n.tekst, sub: p.jednostka, x: PANEL.PAD, y: 128, w: PANEL.W - 2 * PANEL.PAD, h: 160 });
    const k = (t, id, extra = {}) => ({ id: 'np:' + id, text: t, ...extra });
    U.rzad(312, 118, [k('7', '7'), k('8', '8'), k('9', '9'), k('⌫', 'wstecz')]);
    U.rzad(442, 118, [k('4', '4'), k('5', '5'), k('6', '6'), k('C', 'wyczysc')]);
    U.rzad(572, 118, [k('1', '1'), k('2', '2'), k('3', '3'), k('−', 'minus')]);
    U.rzad(702, 118, [k('0', '0', { flex: 2.08 }), k(',', 'przecinek'), k('', '', { disabled: true })]);
    U.rzad(840, 118, [k('Anuluj', 'anuluj'), k(n.i < n.pola.length - 1 ? 'Dalej ▸' : 'OK', 'ok', { active: true, flex: 1.6 })]);
    U.info(984, 'Na PC: cyfry z klawiatury, Enter = OK, Esc = anuluj', 44, 'left', PANEL.KOLORY.szary);
    return U;
  }

  akcja(id) {
    if (!id) return;
    const i = id.indexOf(':');
    const k = i < 0 ? id : id.slice(0, i), v = i < 0 ? '' : id.slice(i + 1);
    if (k === 'np') { this.klawiszNumpada(v); return; }
    if (k === 'tab') { this.strona = v; return; }
    if (k === 'wroc') { this.api.wyjdz(); return; }
    if (!this.projekt) { this.powiedz('Geometria się ładuje…'); return; }
    const b = this.wybrana();
    switch (k) {
      case 'narz': case 'dodaj': this.ustawNarzedzie(v); break;
      case 'oryginal': this.przejmijOryginal(); break;
      case 'kopiuj': this.kopiuj(); break;
      case 'usun': this.usun(); break;
      case 'wiele': this.wiele = !this.wiele; this.powiedz(this.wiele ? 'Zaznaczanie wielu brył: klikaj kolejne' : 'Zaznaczanie jednej bryły'); break;
      case 'grupuj': this.grupuj(); break;
      case 'rozgrupuj': this.rozgrupuj(); break;
      case 'pokaz': this.projekt.bryly.forEach((x) => this.projekt.ustawWlasciwosci(x.id, { widoczna: true })); break;
      case 'vis': { const x = this.bryla(v); if (x) this.projekt.ustawWlasciwosci(v, { widoczna: !x.widoczna }); break; }
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
      case 'kolor': for (const id2 of this.zazn) this.projekt.ustawWlasciwosci(id2, { kolor: PROJEKT.KOLORY[Number(v)] }); break;
      case 'odznacz': this.odznacz(); break;
      case 'eksport': this.eksport(v); break;
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
      : d.typ === 'kula' ? `Ø${fmt(d.r * 2)}` : d.typ === 'wyciagniecie' ? `h ${fmt(d.h)}` : '';
    return `${b.nazwa}${wym ? '  ' + wym : ''}${b.skala !== 1 ? '  ×' + fmt(b.skala, 3) : ''}   X ${fmt(b.poz[0], 0)}  Y ${fmt(b.poz[1], 0)}  Z ${fmt(b.poz[2], 0)}`;
  }

  aktualizujEtykiete() {
    const e = this.etykieta, t = this.tworzenie && this.tworzenie.ksztalt;
    const b = t ? null : this.wybrana(), w = b && this.wezly.get(b.id);
    const obiekt = t ? this.podglad.grupa : w && w.holder;
    if (!obiekt || !obiekt.visible) { e.sprite.visible = false; return; }
    const tekst = t ? `${PROJEKT.NAZWY[t.def.typ]}  ${t.opis}` : this.opisBryly(b);
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
