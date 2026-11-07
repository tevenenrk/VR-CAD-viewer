// ============================================================================
// SZKICOWNIK BRYŁ — RDZEŃ GEOMETRII (replicad / OpenCascade)
// Działa w wątku geometrii (worker.js) i w testach Node. Nie używa okna przeglądarki ani three.js.
// Wszystkie wymiary w MILIMETRACH, w układzie CAD (oś góry wg GEO.OS_GORY — domyślnie Y, jak w SolidWorksie).
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA
// ---------------------------------------------------------------------------
export const GEO = {
  MM_NA_M: 0.001,                 // jedyne miejsce przeliczenia jednostek: model w mm, scena three.js w metrach
  OS_GORY: 'Y',                   // oś „do góry” w pliku CAD: 'Y' (SolidWorks, domyślnie) albo 'Z'
  MIN_OBJETOSC_MM3: 1,            // wynik booleana mniejszy niż to = pusty → odrzucony
  SPRAWDZAJ_POPRAWNOSC: true,     // BRepCheck_Analyzer na wyniku booleana
  SIATKA_TOLERANCJA_MM: 0.2,      // dokładność siatki do wyświetlania (odchyłka cięciwy)
  SIATKA_TOLERANCJA_KAT: 0.35,    // dokładność siatki: kąt (radiany)
  KRAWEDZIE: true,                // zwracaj też linie krawędzi (lepiej widać gabaryt)
  DOPASOWANIE_TOL_MM: 0.5,        // dopasowanie brył oryginału do części viewera: tolerancja ramki (mm) …
  DOPASOWANIE_TOL_WZGL: 0.003,    // … plus ułamek wielkości części
  KOLOR_DOMYSLNY: '#8fa3b8',
  NAZWA_NOWYCH: 'Szkicownik',     // podzłożenie z nowymi bryłami w eksporcie STEP
  // Płaszczyzny szkicu jak w SolidWorksie (oś u = „w prawo”, v = „w górę” na szkicu, n = kierunek wyciągnięcia)
  PLASZCZYZNY: {
    XY: { nazwa: 'Przednia', u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
    XZ: { nazwa: 'Górna',    u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] },
    YZ: { nazwa: 'Prawa',    u: [0, 0, -1], v: [0, 1, 0], n: [1, 0, 0] },
  },
};

let R = null;     // moduł replicad
let oc = null;    // OpenCascade (WASM)

export function ustawBiblioteke(replicad, opencascade) {
  R = replicad; oc = opencascade;
  R.setOC(oc);
}

// ---------------------------------------------------------------------------
// UKŁADY WSPÓŁRZĘDNYCH (czyste funkcje, bez OpenCascade)
// Scena three.js: Y w górę, metry. CAD: mm, oś góry GEO.OS_GORY.
// ---------------------------------------------------------------------------
export function cadDoSceny([x, y, z], osGory = GEO.OS_GORY) {
  const k = GEO.MM_NA_M;
  return osGory === 'Z' ? [x * k, z * k, -y * k] : [x * k, y * k, z * k];
}

export function scenaDoCad([x, y, z], osGory = GEO.OS_GORY) {
  const k = 1 / GEO.MM_NA_M;
  return osGory === 'Z' ? [x * k, -z * k, y * k] : [x * k, y * k, z * k];
}

// Macierz 4×4 (kolumnami, jak three.js Matrix4.elements) z położenia [mm], obrotu [stopnie, kolejność XYZ jak three.js] i skali.
export function macierzBryly({ poz = [0, 0, 0], obr = [0, 0, 0], skala = 1 }) {
  const d = Math.PI / 180;
  const [a, b, c] = [obr[0] * d, obr[1] * d, obr[2] * d];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // R = Rx · Ry · Rz (three.js Euler 'XYZ')
  const r = [
    cb * cc, -cb * sc, sb,
    ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb,
    sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb,
  ];
  const s = skala;
  return [
    r[0] * s, r[3] * s, r[6] * s, 0,
    r[1] * s, r[4] * s, r[7] * s, 0,
    r[2] * s, r[5] * s, r[8] * s, 0,
    poz[0], poz[1], poz[2], 1,
  ];
}

export function przeksztalcPunkt(m, [x, y, z]) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

// ---------------------------------------------------------------------------
// DOPASOWANIE brył z pliku STEP (OpenCascade) do części viewera (occt-import-js) — po ramkach (mm)
// bryly: [{ min, max }], czesci: [{ min, max, nazwa, sciezka }] → dla każdej bryły indeks części albo -1
// ---------------------------------------------------------------------------
export function dopasujCzesci(bryly, czesci) {
  const tol = (a) => GEO.DOPASOWANIE_TOL_MM + GEO.DOPASOWANIE_TOL_WZGL * Math.max(...a.max.map((v, i) => v - a.min[i]));
  const zawiera = (c, b) => [0, 1, 2].every((i) => b.min[i] >= c.min[i] - tol(c) && b.max[i] <= c.max[i] + tol(c));
  const roznica = (c, b) => [0, 1, 2].reduce((s, i) => s + Math.abs(c.min[i] - b.min[i]) + Math.abs(c.max[i] - b.max[i]), 0);
  return bryly.map((b) => {
    let best = -1, bestD = Infinity;
    czesci.forEach((c, i) => {
      if (!zawiera(c, b)) return;
      const d = roznica(c, b);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  });
}

// ---------------------------------------------------------------------------
// BUDOWA BRYŁ Z PARAMETRÓW
// def: { typ: 'prostopadloscian', dx, dy, dz } | { typ: 'walec', r, h } | { typ: 'kula', r }
//    | { typ: 'wyciagniecie', plaszczyzna, odsuniecie, obrys: [{ typ: 'linia', a, b } | { typ: 'luk', a, m, b }], h }
//    | { typ: 'boolean', op: 'suma'|'roznica'|'wspolna', a: bryla, b: bryla }
//    | { typ: 'oryginal', indeksy: [nr brył w pliku] }
// Prymitywy są wyśrodkowane w swoim początku układu; oś walca = oś góry (Y).
// bryla: { def, lok: [mm] (przesunięcie geometrii przed obrotem), poz, obr, skala }
// pobierzOryginal(indeks) → bryła z wczytanego pliku (w układzie pliku)
// ---------------------------------------------------------------------------
const dodatnia = (v, nazwa) => {
  if (!(Number.isFinite(v) && v > 0)) throw new Error(`Wymiar „${nazwa}” musi być liczbą większą od zera (jest: ${v})`);
  return v;
};

export function zbudujDef(def, pobierzOryginal) {
  switch (def.typ) {
    case 'prostopadloscian': {
      const dx = dodatnia(def.dx, 'X'), dy = dodatnia(def.dy, 'Y'), dz = dodatnia(def.dz, 'Z');
      return R.makeBox([-dx / 2, -dy / 2, -dz / 2], [dx / 2, dy / 2, dz / 2]);
    }
    case 'walec': {
      const r = dodatnia(def.r, 'promień'), h = dodatnia(def.h, 'wysokość');
      return R.makeCylinder(r, h, [0, -h / 2, 0], [0, 1, 0]);
    }
    case 'kula':
      return R.makeSphere(dodatnia(def.r, 'promień'));
    case 'wyciagniecie':
      return zbudujWyciagniecie(def);
    case 'boolean':
      return operacjaBoolean(def.op, zbudujBryle(def.a, pobierzOryginal), zbudujBryle(def.b, pobierzOryginal)).ksztalt;
    case 'oryginal': {                    // jedna część z pliku STEP (może składać się z kilku brył)
      const indeksy = def.indeksy || [def.indeks];
      const lista = indeksy.map((i) => {
        const s = pobierzOryginal ? pobierzOryginal(i) : null;
        if (!s) throw new Error(`Brak bryły ${i} z oryginalnego pliku STEP (plik nie jest wczytany do Szkicownika)`);
        return s.clone();
      });
      return lista.length === 1 ? lista[0] : R.makeCompound(lista);
    }
    default:
      throw new Error('Nieznany typ bryły: ' + def.typ);
  }
}

// Bryła w układzie CAD: geometria z parametrów → przesunięcie lok → skala → obrót (Z, Y, X jak three.js 'XYZ') → położenie
export function zbudujBryle(bryla, pobierzOryginal) {
  return przeksztalc(zbudujDef(bryla.def, pobierzOryginal).translate(bryla.lok || [0, 0, 0]), bryla);
}

// Uwaga: w replicad translate/rotate/scale ZUŻYWAJĄ bryłę wejściową (kasują ją) — dlatego zawsze pracujemy na kopii.
// Zwraca nowy kształt; oryginał (np. zapamiętany w wątku) zostaje nietknięty.
export function przeksztalc(ksztalt, { poz = [0, 0, 0], obr = [0, 0, 0], skala = 1 }) {
  let s = ksztalt.clone();
  if (skala !== 1) s = s.scale(dodatnia(skala, 'skala'), [0, 0, 0]);
  if (obr[2]) s = s.rotate(obr[2], [0, 0, 0], [0, 0, 1]);
  if (obr[1]) s = s.rotate(obr[1], [0, 0, 0], [0, 1, 0]);
  if (obr[0]) s = s.rotate(obr[0], [0, 0, 0], [1, 0, 0]);
  if (poz[0] || poz[1] || poz[2]) s = s.translate(poz);
  return s;
}

function zbudujWyciagniecie(def) {
  const pl = GEO.PLASZCZYZNY[def.plaszczyzna];
  if (!pl) throw new Error('Nieznana płaszczyzna szkicu: ' + def.plaszczyzna);
  const h = Number(def.h);
  if (!Number.isFinite(h) || h === 0) throw new Error('Wysokość wyciągnięcia musi być różna od zera');
  const seg = def.obrys || [];
  if (seg.length < 2 && !(seg.length === 1 && seg[0].typ === 'luk')) throw new Error('Obrys musi mieć co najmniej 2 odcinki');
  const o = def.odsuniecie || 0;
  const plane = new R.Plane(pl.n.map((v) => v * o), pl.u, pl.n);
  let pen = R.draw(seg[0].a);
  seg.forEach((s, i) => {
    const ostatni = i === seg.length - 1;
    if (s.typ === 'linia') { if (!ostatni) pen = pen.lineTo(s.b); }      // ostatnią linię domyka close()
    else if (s.typ === 'luk') pen = pen.threePointsArcTo(s.b, s.m);
    else throw new Error('Nieznany odcinek obrysu: ' + s.typ);
  });
  const rysunek = pen.close();
  const bryla = rysunek.sketchOnPlane(plane).extrude(h);
  return bryla;
}

// ---------------------------------------------------------------------------
// BOOLEAN ze sprawdzeniem wyniku
// ---------------------------------------------------------------------------
const OPERACJE = { suma: 'Suma', roznica: 'Różnica', wspolna: 'Część wspólna' };

export function operacjaBoolean(op, a, b) {
  if (!OPERACJE[op]) throw new Error('Nieznana operacja: ' + op);
  let wynik;
  try {
    wynik = op === 'suma' ? a.fuse(b) : op === 'roznica' ? a.cut(b) : a.intersect(b);
  } catch (e) {
    throw new Error(`${OPERACJE[op]} nie powiodła się (błąd OpenCascade: ${komunikatOC(e)})`);
  }
  const info = sprawdz(wynik);
  if (!info.liczbaBryl || info.objetosc < GEO.MIN_OBJETOSC_MM3) {
    throw new Error(op === 'wspolna' ? 'Część wspólna jest pusta — bryły się nie przecinają'
                                     : `${OPERACJE[op]}: wynik jest pusty (brak bryły)`);
  }
  if (GEO.SPRAWDZAJ_POPRAWNOSC && !info.poprawna) throw new Error(`${OPERACJE[op]}: wynik jest uszkodzony (niepoprawna bryła) — odrzucony`);
  return { ksztalt: wynik, ...info };
}

function komunikatOC(e) {
  if (typeof e === 'number' && oc && oc.OCJS && oc.OCJS.getStandard_FailureData) {
    try { return oc.OCJS.getStandard_FailureData(e).GetMessageString(); } catch { /* brak opisu */ }
  }
  return (e && e.message) || String(e);
}

// ---------------------------------------------------------------------------
// POMIARY I SPRAWDZENIE
// ---------------------------------------------------------------------------
export function liczBryly(ksztalt) {
  let n = 0;
  const ex = new oc.TopExp_Explorer(ksztalt.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; ex.More(); ex.Next()) n++;
  ex.delete();
  return n;
}

export function poprawna(ksztalt) {
  const an = new oc.BRepCheck_Analyzer(ksztalt.wrapped, true, false, false);
  let ok;
  try { ok = an.IsValid(); } catch { ok = an.IsValid(ksztalt.wrapped); }
  an.delete();
  return !!ok;
}

export function objetosc(ksztalt) {
  try { return R.measureVolume(ksztalt); } catch { return 0; }
}

export function ramka(ksztalt) {
  const [min, max] = ksztalt.boundingBox.bounds;
  return { min: [...min], max: [...max], srodek: [0, 1, 2].map((i) => (min[i] + max[i]) / 2) };
}

export function sprawdz(ksztalt) {
  if (!ksztalt || ksztalt.isNull) return { liczbaBryl: 0, objetosc: 0, poprawna: false };
  const liczbaBryl = liczBryly(ksztalt);
  const v = liczbaBryl ? objetosc(ksztalt) : 0;
  return { liczbaBryl, objetosc: v, poprawna: liczbaBryl ? poprawna(ksztalt) : false };
}

// Siatka do wyświetlania (mm, układ CAD) — tablice gotowe do przesłania do głównego wątku bez kopiowania
export function siatka(ksztalt) {
  const m = ksztalt.mesh({ tolerance: GEO.SIATKA_TOLERANCJA_MM, angularTolerance: GEO.SIATKA_TOLERANCJA_KAT });
  const out = {
    pozycje: new Float32Array(m.vertices),
    normalne: new Float32Array(m.normals),
    indeksy: new Uint32Array(m.triangles),
    krawedzie: null,
  };
  if (GEO.KRAWEDZIE) {
    try { out.krawedzie = new Float32Array(ksztalt.meshEdges({ tolerance: GEO.SIATKA_TOLERANCJA_MM, angularTolerance: GEO.SIATKA_TOLERANCJA_KAT }).lines); }
    catch { out.krawedzie = null; }
  }
  return out;
}

// ---------------------------------------------------------------------------
// STEP: odczyt brył (bez nazw — nazwy daje viewer, patrz dopasujCzesci) i zapis ze strukturą złożenia
// ---------------------------------------------------------------------------
export async function wczytajSTEP(bajty) {
  const calosc = await R.importSTEP(new Blob([bajty]));
  const bryly = [];
  const zbierz = (typ, unikaj) => {
    const ex = new oc.TopExp_Explorer(calosc.wrapped, typ, unikaj);
    for (; ex.More(); ex.Next()) bryly.push(R.cast(ex.Current()));
    ex.delete();
  };
  const T = oc.TopAbs_ShapeEnum;
  zbierz(T.TopAbs_SOLID, T.TopAbs_SHAPE);
  zbierz(T.TopAbs_SHELL, T.TopAbs_SOLID);          // same powierzchnie (części powierzchniowe)
  return bryly;
}

// drzewo: { nazwa, dzieci: [ węzeł ] } albo liść { nazwa, ksztalt, kolor }
export function zapiszSTEP(drzewo) {
  const tekst = (s) => new oc.TCollection_ExtendedString(String(s || 'bez_nazwy'), true);
  const doc = new oc.TDocStd_Document(tekst('XmlOcaf'));
  oc.XCAFDoc_ShapeTool.SetAutoNaming(false);
  const main = doc.Main();
  const tool = oc.XCAFDoc_DocumentTool.ShapeTool(main);
  const ctool = oc.XCAFDoc_DocumentTool.ColorTool(main);
  const nazwij = (label, n) => oc.TDataStd_Name.Set(label, tekst(n));
  const kolor = (hex) => {
    const h = String(hex || GEO.KOLOR_DOMYSLNY).replace('#', '');
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return new oc.Quantity_ColorRGBA(c[0], c[1], c[2], 1);
  };
  const dodaj = (w, rodzic) => {
    let label;
    if (w.dzieci) {
      label = tool.NewShape();
      nazwij(label, w.nazwa);
      for (const d of w.dzieci) dodaj(d, label);
    } else {
      label = tool.AddShape(w.ksztalt.wrapped, false, false);
      nazwij(label, w.nazwa);
      ctool.SetColor(label, kolor(w.kolor), oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
    }
    if (rodzic) nazwij(tool.AddComponent(rodzic, label, new oc.TopLoc_Location()), w.nazwa);
    return label;
  };
  dodaj(drzewo, null);
  tool.UpdateAssemblies();

  oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM');
  oc.Interface_Static.SetCVal('write.step.unit', 'MM');
  const session = new oc.XSControl_WorkSession();
  const writer = new oc.STEPCAFControl_Writer(session, false);
  writer.SetColorMode(true);
  writer.SetNameMode(true);
  writer.SetLayerMode(true);
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', 1);
  oc.Interface_Static.SetIVal('write.precision.mode', 0);
  oc.Interface_Static.SetIVal('write.step.assembly', 1);
  oc.Interface_Static.SetIVal('write.step.schema', 5);           // AP214
  const plik = '/szkicownik_eksport.step';
  const progress = new oc.Message_ProgressRange();
  const ok = writer.Perform(doc, plik, progress);
  writer.delete(); session.delete(); progress.delete(); doc.delete();
  if (!ok) throw new Error('Zapis STEP nie powiódł się');
  const bajty = oc.FS.readFile(plik);
  oc.FS.unlink(plik);
  return bajty;
}
