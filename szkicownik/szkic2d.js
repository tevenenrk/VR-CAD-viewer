// ============================================================================
// SZKICOWNIK BRYŁ — SZKIC 2D (czysta geometria, bez three.js i bez OpenCascade; testowane w Node)
// Obrys = łańcuch odcinków: { typ: 'linia', a, b } i { typ: 'luk', a, m, b } (łuk przez 3 punkty).
// Współrzędne [u, v] w mm w układzie płaszczyzny szkicu (GEO.PLASZCZYZNY w geometria.js).
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA
// ---------------------------------------------------------------------------
export const SZKIC = {
  TOL_DOMKNIECIA_MM: 15,          // koniec bliżej początku niż to = obrys się domyka
  SNAP_PUNKT_MM: 12,              // przyciąganie do istniejących punktów szkicu
  ODCINKI_LUKU: 32,               // łuk przybliżany tyloma odcinkami (podgląd, test przecięć)
  EPS: 1e-6,
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const krzyz = (a, b) => a[0] * b[1] - a[1] * b[0];
export const odl = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Okrąg przez 3 punkty; null, gdy punkty leżą na prostej
export function lukZ3(a, m, b) {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < SZKIC.EPS) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, m2 = m[0] ** 2 + m[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2;
  const c = [(a2 * (m[1] - b[1]) + m2 * (b[1] - a[1]) + b2 * (a[1] - m[1])) / d,
             (a2 * (b[0] - m[0]) + m2 * (a[0] - b[0]) + b2 * (m[0] - a[0])) / d];
  const r = odl(c, a);
  const kat = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const ccw = krzyz(sub(m, a), sub(b, m)) > 0;        // kierunek a → m → b
  return { c, r, a0: kat(a), a1: kat(b), ccw };
}

// Punkty łuku (łącznie z końcami)
export function probkujLuk(a, m, b, n = SZKIC.ODCINKI_LUKU) {
  const L = lukZ3(a, m, b);
  if (!L) return [a, b];
  let roz = L.a1 - L.a0;
  if (L.ccw && roz <= 0) roz += 2 * Math.PI;
  if (!L.ccw && roz >= 0) roz -= 2 * Math.PI;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = L.a0 + roz * i / n;
    out.push([L.c[0] + L.r * Math.cos(t), L.c[1] + L.r * Math.sin(t)]);
  }
  out[0] = [...a]; out[n] = [...b];
  return out;
}

export const punktyOdcinka = (s, n) => (s.typ === 'luk' ? probkujLuk(s.a, s.m, s.b, n) : [s.a, s.b]);

// Właściwe przecięcie odcinków p1p2 i p3p4 (wspólne końce się nie liczą)
export function przecinaja(p1, p2, p3, p4) {
  const d1 = sub(p2, p1), d2 = sub(p4, p3);
  const den = krzyz(d1, d2);
  if (Math.abs(den) < SZKIC.EPS) {                   // równoległe: nakładanie się na jednej prostej
    if (Math.abs(krzyz(sub(p3, p1), d1)) > SZKIC.EPS * Math.max(1, Math.hypot(...d1))) return false;
    const L = d1[0] * d1[0] + d1[1] * d1[1];
    if (L < SZKIC.EPS) return false;
    const t3 = ((p3[0] - p1[0]) * d1[0] + (p3[1] - p1[1]) * d1[1]) / L;
    const t4 = ((p4[0] - p1[0]) * d1[0] + (p4[1] - p1[1]) * d1[1]) / L;
    const lo = Math.max(0, Math.min(t3, t4)), hi = Math.min(1, Math.max(t3, t4));
    return hi - lo > 1e-4;                           // wspólny kawałek (nie tylko punkt)
  }
  const t = krzyz(sub(p3, p1), d2) / den, u = krzyz(sub(p3, p1), d1) / den;
  const e = 1e-7;
  return t > e && t < 1 - e && u > e && u < 1 - e;
}

// Czy odcinek nowy przecina któryś z odcinków obrysu (poza sąsiadami)? → indeks albo -1
// sasiedzi: indeksy odcinków stykających się z nowym (pomijane — mają wspólny koniec)
export function kolizja(segmenty, nowy, sasiedzi = []) {
  const pn = punktyOdcinka(nowy);
  for (let i = 0; i < segmenty.length; i++) {
    const ps = punktyOdcinka(segmenty[i]);
    const sas = sasiedzi.includes(i);
    for (let a = 0; a < pn.length - 1; a++) for (let b = 0; b < ps.length - 1; b++) {
      if (przecinaja(pn[a], pn[a + 1], ps[b], ps[b + 1])) {
        // u sąsiada ignoruj tylko kawałki przy wspólnym końcu
        if (sas && ((a === 0 && b === ps.length - 2) || (a === pn.length - 2 && b === 0) || (a === 0 && b === 0) || (a === pn.length - 2 && b === ps.length - 2))) continue;
        return i;
      }
    }
  }
  return -1;
}

// Wszystkie pary przecinających się odcinków zamkniętego obrysu (do sprawdzenia całości)
export function samoprzeciecia(segmenty) {
  const n = segmenty.length, out = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const sasiad = j === i + 1 || (i === 0 && j === n - 1);
    if (sasiad && n <= 2) continue;
    const pi = punktyOdcinka(segmenty[i]), pj = punktyOdcinka(segmenty[j]);
    let jest = false;
    for (let a = 0; a < pi.length - 1 && !jest; a++) for (let b = 0; b < pj.length - 1 && !jest; b++) {
      if (!przecinaja(pi[a], pi[a + 1], pj[b], pj[b + 1])) continue;
      if (sasiad) {                                  // kawałki przy wspólnym wierzchołku pomijamy
        const krancowe = (j === i + 1 && a === pi.length - 2 && b === 0) || (i === 0 && j === n - 1 && a === 0 && b === pj.length - 2);
        if (krancowe) continue;
      }
      jest = true;
    }
    if (jest) out.push([i, j]);
  }
  return out;
}

// Pole ze znakiem (przybliżenie łukami odcinków) — do sprawdzenia, czy obrys nie jest „płaski”
export function pole(segmenty) {
  const p = [];
  segmenty.forEach((s) => { const q = punktyOdcinka(s); p.push(...q.slice(0, -1)); });
  let A = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; A += a[0] * b[1] - b[0] * a[1]; }
  return A / 2;
}

// Przyciąganie punktu: najpierw do istniejących punktów szkicu, potem do siatki
export function przyciagnij(p, punkty, siatka, tolPunkt = SZKIC.SNAP_PUNKT_MM) {
  let best = null, bd = tolPunkt;
  punkty.forEach((q, i) => { const d = odl(p, q); if (d <= bd) { bd = d; best = i; } });
  if (best !== null) return { p: [...punkty[best]], punkt: best };
  const g = siatka || 1;
  return { p: [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g], punkt: null };
}

// Odległość punktu od odcinka prostego (do wskazania osi obrotu)
export function odlOdOdcinka(p, a, b) {
  const d = sub(b, a), L = d[0] * d[0] + d[1] * d[1];
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L)) : 0;
  return odl(p, [a[0] + d[0] * t, a[1] + d[1] * t]);
}

// Czy cały obrys leży po jednej stronie prostej przez a, b (warunek obrotu wokół osi)?
export function poJednejStronie(segmenty, a, b) {
  const d = sub(b, a), L = Math.hypot(...d) || 1;
  let min = Infinity, max = -Infinity;
  for (const s of segmenty) for (const q of punktyOdcinka(s)) { const w = krzyz(d, sub(q, a)) / L; min = Math.min(min, w); max = Math.max(max, w); }
  const tol = 1e-3;
  return min >= -tol || max <= tol;
}

// Stan szkicu: łańcuch odcinków od pierwszego punktu
export class Szkic {
  constructor(plaszczyzna) {
    this.plaszczyzna = plaszczyzna;              // 'XY' | 'XZ' | 'YZ'
    this.odsuniecie = null;                      // położenie płaszczyzny wzdłuż jej normalnej (mm) — z pierwszego punktu
    this.start = null;                           // pierwszy punkt [u, v]
    this.segmenty = [];
    this.zamkniety = false;
    this.lukSrodek = null;                       // łuk: wskazany punkt pośredni, czeka na koniec
  }
  get ostatni() { return this.segmenty.length ? this.segmenty[this.segmenty.length - 1].b : this.start; }
  get punkty() { return this.start ? [this.start, ...this.segmenty.map((s) => s.b)] : []; }

  // Dodaj odcinek kończący się w p. Zwraca { ok, blad, kolizja, zamknieto }
  dodaj(typ, p, m = null) {
    if (this.zamkniety) return { ok: false, blad: 'Obrys jest już zamknięty' };
    if (!this.start) { this.start = [...p]; return { ok: true }; }
    const a = this.ostatni;
    let b = [...p];
    const domyka = this.segmenty.length >= (typ === 'luk' ? 1 : 2) && odl(b, this.start) <= SZKIC.TOL_DOMKNIECIA_MM;
    if (domyka) b = [...this.start];
    if (odl(a, b) < SZKIC.EPS) return { ok: false, blad: 'Za krótki odcinek' };
    const s = typ === 'luk' ? { typ: 'luk', a: [...a], m: [...m], b } : { typ: 'linia', a: [...a], b };
    if (typ === 'luk' && !lukZ3(a, m, b)) return { ok: false, blad: 'Punkty łuku leżą na jednej prostej' };
    const pop = this.segmenty[this.segmenty.length - 1];
    if (pop && typ === 'linia' && pop.typ === 'linia') {          // zawrócenie po poprzedniej linii
      const d1 = sub(pop.b, pop.a), d2 = sub(b, a);
      if (Math.abs(krzyz(d1, d2)) < 1e-6 * Math.hypot(...d1) * Math.hypot(...d2) && d1[0] * d2[0] + d1[1] * d2[1] < 0) {
        return { ok: false, blad: `Odcinek cofa się po poprzednim (odcinek ${this.segmenty.length})`, kolizja: this.segmenty.length - 1 };
      }
    }
    const n = this.segmenty.length;
    const sasiedzi = [n - 1];
    if (domyka) sasiedzi.push(0);
    const k = kolizja(this.segmenty, s, sasiedzi.filter((i) => i >= 0));
    if (k >= 0) return { ok: false, blad: `Obrys przecina się sam ze sobą (z odcinkiem ${k + 1})`, kolizja: k };
    this.segmenty.push(s);
    if (domyka) {
      if (Math.abs(pole(this.segmenty)) < 1) { this.segmenty.pop(); return { ok: false, blad: 'Obrys ma zerowe pole' }; }
      this.zamkniety = true;
    }
    return { ok: true, zamknieto: domyka };
  }

  cofnij() {
    this.lukSrodek = null;
    if (this.zamkniety) { this.zamkniety = false; this.segmenty.pop(); return; }
    if (this.segmenty.length) this.segmenty.pop();
    else { this.start = null; this.odsuniecie = null; }
  }

  // Zamknij linią do punktu startowego
  zamknij() {
    if (this.zamkniety) return { ok: true };
    if (this.segmenty.length < 2) return { ok: false, blad: 'Za mało odcinków, żeby zamknąć obrys' };
    return this.dodaj('linia', this.start);
  }

  obrys() { return this.segmenty.map((s) => JSON.parse(JSON.stringify(s))); }
}
