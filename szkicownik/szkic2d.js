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
  TOL_WIERZCHOLKA_MM: 25,         // zaokrąglenie: narożnik najbliżej wskazanego punktu, nie dalej niż tyle
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

// Kierunek styczny na końcu odcinka (w punkcie b), jednostkowy
export function kierunekKonca(s) {
  if (s.typ !== 'luk') { const d = sub(s.b, s.a), L = Math.hypot(...d) || 1; return [d[0] / L, d[1] / L]; }
  const L = lukZ3(s.a, s.m, s.b);
  if (!L) { const d = sub(s.b, s.a), n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; }
  const r = sub(s.b, L.c), n = Math.hypot(...r) || 1;
  return L.ccw ? [-r[1] / n, r[0] / n] : [r[1] / n, -r[0] / n];
}

// Łuk styczny: zaczyna się w a w kierunku t i kończy w b → punkt środkowy łuku m (null = b leży na prostej, wtedy linia)
export function lukStyczny(a, t, b) {
  const d = sub(b, a), L2 = d[0] * d[0] + d[1] * d[1];
  const n = [-t[1], t[0]];                          // w lewo od kierunku
  const dn = d[0] * n[0] + d[1] * n[1];
  if (L2 < SZKIC.EPS || Math.abs(dn) < 1e-6 * Math.sqrt(L2)) return null;
  const r = L2 / (2 * dn);                          // promień ze znakiem (+ = środek po lewej)
  const c = [a[0] + n[0] * r, a[1] + n[1] * r];
  // środek łuku: na dwusiecznej cięciwy, po stronie, w którą skręca kierunek t
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let w = sub(mid, c), wl = Math.hypot(...w);
  if (wl < SZKIC.EPS) w = [-d[1], d[0]], wl = Math.hypot(...w);   // półokrąg: prostopadle do cięciwy
  let m = [c[0] + w[0] / wl * Math.abs(r), c[1] + w[1] / wl * Math.abs(r)];
  // sprawdź kierunek: łuk a→m→b musi startować zgodnie z t
  const t0 = kierunekKonca({ typ: 'luk', a: b, m, b: a });  // styczna w a przy przejściu b→a
  if (t0[0] * t[0] + t0[1] * t[1] > 0) m = [2 * c[0] - m[0], 2 * c[1] - m[1]];   // druga połowa okręgu
  return m;
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
    this.historia = [];                          // stany sprzed zmian (Usuń ostatni / B cofa też zaokrąglenie)
  }
  _zapamietaj() {
    this.historia.push(JSON.stringify({ start: this.start, segmenty: this.segmenty, zamkniety: this.zamkniety }));
  }
  get ostatni() { return this.segmenty.length ? this.segmenty[this.segmenty.length - 1].b : this.start; }
  // kierunek, w którym kończy się obrys (do łuku stycznego); null = brak odcinka
  get kierunek() { return this.segmenty.length ? kierunekKonca(this.segmenty[this.segmenty.length - 1]) : null; }
  get punkty() { return this.start ? [this.start, ...this.segmenty.map((s) => s.b)] : []; }

  // Dodaj odcinek kończący się w p. Zwraca { ok, blad, kolizja, zamknieto }
  dodaj(typ, p, m = null) {
    if (this.zamkniety) return { ok: false, blad: 'Obrys jest już zamknięty' };
    if (!this.start) { this._zapamietaj(); this.start = [...p]; return { ok: true }; }
    const a = this.ostatni;
    let b = [...p];
    const domyka = this.segmenty.length >= (typ === 'linia' ? 2 : 1) && odl(b, this.start) <= SZKIC.TOL_DOMKNIECIA_MM;
    if (domyka) b = [...this.start];
    if (typ === 'lukStyczny') {                 // łuk styczny do poprzedniego odcinka
      const t = this.kierunek;
      if (!t) return { ok: false, blad: 'Łuk styczny zaczyna się od poprzedniego odcinka — najpierw narysuj linię' };
      m = lukStyczny(a, t, b);
      typ = m ? 'luk' : 'linia';                // punkt na przedłużeniu = zwykła linia
    }
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
    if (domyka && Math.abs(pole([...this.segmenty, s])) < 1) return { ok: false, blad: 'Obrys ma zerowe pole' };
    this._zapamietaj();
    this.segmenty.push(s);
    if (domyka) this.zamkniety = true;
    return { ok: true, zamknieto: domyka };
  }

  cofnij() {
    this.lukSrodek = null;
    const h = this.historia.pop();
    if (!h) { this.start = null; this.segmenty = []; this.zamkniety = false; this.odsuniecie = null; return; }
    const st = JSON.parse(h);
    this.start = st.start; this.segmenty = st.segmenty; this.zamkniety = st.zamkniety;
    if (!this.start) this.odsuniecie = null;
  }

  // Zaokrąglenie narożnika między dwiema liniami (promień r mm). i = numer wierzchołka (0 = start, tylko w zamkniętym obrysie)
  zaokraglij(i, r) {
    const n = this.segmenty.length;
    if (!(r > 0)) return { ok: false, blad: 'Promień musi być większy od zera' };
    const iPrzed = i === 0 ? (this.zamkniety ? n - 1 : -1) : i - 1, iPo = i < n ? i : -1;
    if (iPrzed < 0 || iPo < 0 || iPrzed === iPo) return { ok: false, blad: 'Tu nie ma narożnika (koniec obrysu)' };
    const s1 = this.segmenty[iPrzed], s2 = this.segmenty[iPo];
    if (s1.typ !== 'linia' || s2.typ !== 'linia') return { ok: false, blad: 'Zaokrąglam tylko narożnik między dwiema liniami' };
    const P = s1.b, u1 = sub(s1.a, P), u2 = sub(s2.b, P), l1 = Math.hypot(...u1), l2 = Math.hypot(...u2);
    const e1 = [u1[0] / l1, u1[1] / l1], e2 = [u2[0] / l2, u2[1] / l2];
    const cos = Math.max(-1, Math.min(1, e1[0] * e2[0] + e1[1] * e2[1])), kat = Math.acos(cos);
    if (kat > Math.PI - 1e-3) return { ok: false, blad: 'Narożnik jest prosty — nie ma czego zaokrąglać' };
    const d = r / Math.tan(kat / 2);
    if (d >= l1 - 1e-6 || d >= l2 - 1e-6) return { ok: false, blad: `Promień ${r} mm za duży dla tego narożnika (max ok. ${Math.floor(Math.min(l1, l2) * Math.tan(kat / 2))} mm)` };
    const T1 = [P[0] + e1[0] * d, P[1] + e1[1] * d], T2 = [P[0] + e2[0] * d, P[1] + e2[1] * d];
    const bis = [e1[0] + e2[0], e1[1] + e2[1]], bl = Math.hypot(...bis);
    const C = [P[0] + bis[0] / bl * r / Math.sin(kat / 2), P[1] + bis[1] / bl * r / Math.sin(kat / 2)];
    const m = [C[0] - bis[0] / bl * r, C[1] - bis[1] / bl * r];
    this._zapamietaj();
    s1.b = T1; s2.a = T2;
    const luk = { typ: 'luk', a: [...T1], m, b: [...T2] };
    if (i === 0) { this.segmenty.push(luk); this.start = [...T2]; }   // narożnik startu: łuk na koniec, start przesunięty
    else this.segmenty.splice(i, 0, luk);
    return { ok: true, luk };
  }

  // Narożnik najbliżej punktu p (indeks wierzchołka) albo -1
  wierzcholek(p, tol = SZKIC.TOL_WIERZCHOLKA_MM) {
    let best = -1, bd = tol;
    const pk = this.punkty;
    const ile = this.zamkniety ? pk.length - 1 : pk.length;        // w zamkniętym obrysie ostatni = start
    for (let i = 0; i < ile; i++) { const dd = odl(p, pk[i]); if (dd <= bd) { bd = dd; best = i; } }
    return best;
  }

  // Zamknij linią do punktu startowego
  zamknij() {
    if (this.zamkniety) return { ok: true };
    if (this.segmenty.length < 2) return { ok: false, blad: 'Za mało odcinków, żeby zamknąć obrys' };
    return this.dodaj('linia', this.start);
  }

  obrys() { return this.segmenty.map((s) => JSON.parse(JSON.stringify(s))); }
}
