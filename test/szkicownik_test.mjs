// ============================================================================
// Testy geometrii Szkicownika w Node (bez przeglądarki i bez gogli).
// Uruchom z folderu projektu:   node test/szkicownik_test.mjs        (kod wyjścia 1 = błąd)
// Wymaga (jak test viewera):    npm install --no-save three@0.187.0 occt-import-js@0.0.23
// Biblioteka geometrii (replicad + OpenCascade) jest w repozytorium: szkicownik/lib/
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA TESTU
// ---------------------------------------------------------------------------
const TEST = {
  TOL_OBJETOSC_MM3: 1e-3,      // dokładność objętości prymitywów / wyciągnięć
  TOL_RAMKA_MM: 0.05,          // dokładność położenia po eksporcie STEP i ponownym wczytaniu
  CIEZKI_BOOLEAN_RAMION: 600,  // gwiazda o tylu wierzchołkach — suma dwóch takich trwa kilka sekund
  TIMEOUT_TESTOWY_MS: 1000,    // limit dla ciężkiej operacji w teście (w programie domyślnie 5000 ms)
  ZAPISZ_PLIKI: true,          // zapisz wyeksportowane STEP do test/ (do obejrzenia w SolidWorksie / viewerze)
};

import { Worker } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from '../node_modules/three/build/three.module.js';
import occtimportjs from '../node_modules/occt-import-js/dist/occt-import-js.js';
import { GEO, cadDoSceny, scenaDoCad, macierzBryly, przeksztalcPunkt, dopasujCzesci } from '../szkicownik/geometria.js';
import { SilnikGeometrii, BladGeometrii } from '../szkicownik/klient.js';
import { Projekt } from '../szkicownik/projekt.js';

const KATALOG = fileURLToPath(new URL('.', import.meta.url));
const wyniki = [];
function sprawdz(nazwa, ok, szczegoly = '') {
  wyniki.push({ nazwa, ok: !!ok });
  console.log((ok ? '  OK   ' : '  BŁĄD ') + nazwa + (szczegoly ? `  [${szczegoly}]` : ''));
}
const blisko = (a, b, tol) => Math.abs(a - b) <= tol;

// Wątek geometrii w Node, z tym samym interfejsem co Web Worker
function workerNode() {
  const w = new Worker(new URL('./szkicownik_worker_node.mjs', import.meta.url));
  const o = { onmessage: null, onerror: null };
  o.postMessage = (m, t) => w.postMessage(m, t);
  o.terminate = () => { w.terminate(); };
  w.on('message', (data) => o.onmessage && o.onmessage({ data }));
  w.on('error', (e) => o.onerror && o.onerror({ message: e.message }));
  return o;
}

// Odczyt STEP tym samym czytnikiem co viewer → części z ramkami (mm), nazwami i ścieżkami
let occt = null;
async function czytajSTEP(bajty) {
  occt = occt || await occtimportjs();
  const r = occt.ReadStepFile(bajty, { linearUnit: 'millimeter' });
  if (!r.success) throw new Error('occt-import-js nie wczytał pliku');
  const czesci = [];
  const idz = (n, sciezka) => {
    const tu = n.name ? [...sciezka, n.name] : sciezka;
    for (const mi of n.meshes) {
      const m = r.meshes[mi], p = m.attributes.position.array;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
      const nazwa = m.name || n.name;
      czesci.push({ nazwa, sciezka: tu.length && tu[tu.length - 1] === nazwa ? tu.slice(0, -1) : tu, min, max,
                    kolor: m.color ? '#' + m.color.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('') : null });
    }
    n.children.forEach((c) => idz(c, tu));
  };
  idz(r.root, []);
  return czesci;
}
const czesc = (lista, nazwa) => lista.find((c) => c.nazwa === nazwa);

// ---------------------------------------------------------------------------
console.log('\n=== SZKICOWNIK: GEOMETRIA W NODE ===');

// 1. Jednostki i układy (bez OpenCascade)
{
  const p = [123.4, -56.7, 890.1];
  const okY = scenaDoCad(cadDoSceny(p, 'Y'), 'Y').every((v, i) => blisko(v, p[i], 1e-9));
  const okZ = scenaDoCad(cadDoSceny(p, 'Z'), 'Z').every((v, i) => blisko(v, p[i], 1e-9));
  const gora = cadDoSceny([0, 0, 1000], 'Z');           // CAD Z w górę → w scenie Y w górę
  sprawdz('mm → m → mm, oś góry Y i Z', okY && okZ && blisko(gora[1], 1, 1e-12) && blisko(cadDoSceny([0, 1000, 0], 'Y')[1], 1, 1e-12),
          `Z-góra [0,0,1000] mm → scena ${gora.map((v) => v.toFixed(3))} m`);
  const t = { poz: [10, -20, 30], obr: [30, 45, 60], skala: 1.5 };
  const m3 = new THREE.Matrix4().compose(new THREE.Vector3(...t.poz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.obr.map((d) => d * Math.PI / 180), 'XYZ')), new THREE.Vector3(1.5, 1.5, 1.5));
  const roznica = Math.max(...macierzBryly(t).map((v, i) => Math.abs(v - m3.elements[i])));
  sprawdz('położenie/obrót/skala zgodne z three.js', roznica < 1e-12, `max różnica ${roznica.toExponential(1)}`);
}

// 2. Dopasowanie części (czysty JS)
{
  const c = [{ min: [0, 0, 0], max: [100, 10, 10] }, { min: [0, 0, 0], max: [10, 10, 10] }];
  const m = dopasujCzesci([{ min: [0, 0, 0], max: [10, 10, 10] }, { min: [0.1, 0, 0], max: [99.9, 10, 10] }, { min: [500, 0, 0], max: [510, 1, 1] }], c);
  sprawdz('dopasowanie brył do części po ramkach', m.join() === '1,0,-1', m.join());
}

const silnik = new SilnikGeometrii({ utworzWorker: workerNode, limity: { BOOLEAN_TIMEOUT_MS: TEST.TIMEOUT_TESTOWY_MS } });
const restarty = [];
silnik.przyRestarcie = (powod) => restarty.push(powod);
const projekt = new Projekt(silnik);
try {
  let t0 = performance.now();
  await silnik.start();
  sprawdz('start wątku geometrii (OpenCascade WASM)', true, `${(performance.now() - t0).toFixed(0)} ms`);

  // 3. Prymitywy
  const box = await projekt.dodaj({ typ: 'prostopadloscian', dx: 100, dy: 50, dz: 20 }, { nazwa: 'Plyta' });
  sprawdz('objętość prostopadłościanu 100×50×20 = 100 000 mm³', blisko(box.objetosc, 100000, TEST.TOL_OBJETOSC_MM3), box.objetosc.toFixed(6));
  const walec = await projekt.dodaj({ typ: 'walec', r: 10, h: 40 }, { nazwa: 'Kolek', poz: [20, 0, 0], obr: [90, 0, 0] });
  sprawdz('objętość walca r10 h40', blisko(walec.objetosc, Math.PI * 100 * 40, TEST.TOL_OBJETOSC_MM3), walec.objetosc.toFixed(4));
  const kula = await projekt.dodaj({ typ: 'kula', r: 30 }, { nazwa: 'Kula' });
  sprawdz('objętość kuli r30', blisko(kula.objetosc, 4 / 3 * Math.PI * 27000, 0.01), kula.objetosc.toFixed(3));
  const siatkaOk = await silnik.wykonaj('zbuduj', { id: 'tmp', def: { typ: 'prostopadloscian', dx: 10, dy: 10, dz: 10 }, wysrodkuj: true });
  sprawdz('siatka do wyświetlania (12 trójkątów sześcianu, krawędzie)', siatkaOk.siatka.indeksy.length === 36 && siatkaOk.siatka.krawedzie.length > 0,
          `${siatkaOk.siatka.indeksy.length / 3} trójkątów`);
  await silnik.wykonaj('usun', { ids: ['tmp'] });
  let blad = null;
  try { await projekt.dodaj({ typ: 'walec', r: 0, h: 10 }); } catch (e) { blad = e; }
  sprawdz('zły wymiar (r = 0) → czytelny błąd', blad && /promień/.test(blad.message), blad && blad.message);

  // 4. Wyciągnięcie (linie + łuk z 3 punktów), płaszczyzny jak w SolidWorksie
  const obrys = [{ typ: 'linia', a: [0, 0], b: [40, 0] }, { typ: 'luk', a: [40, 0], m: [55, 15], b: [40, 30] },
                 { typ: 'linia', a: [40, 30], b: [0, 30] }, { typ: 'linia', a: [0, 30], b: [0, 0] }];
  const vObrys = (40 * 30 + Math.PI * 15 * 15 / 2) * 25;
  const wyc = await projekt.dodaj({ typ: 'wyciagniecie', plaszczyzna: 'XZ', odsuniecie: 0, obrys, h: 25 }, { nazwa: 'Wyciagniecie' });
  const wycMin = wyc.poz.map((v, i) => v + wyc.ramka.min[i]), wycMax = wyc.poz.map((v, i) => v + wyc.ramka.max[i]);
  sprawdz('objętość wyciągnięcia (prostokąt + półkole) × 25', blisko(wyc.objetosc, vObrys, TEST.TOL_OBJETOSC_MM3), `${wyc.objetosc.toFixed(4)} / ${vObrys.toFixed(4)}`);
  sprawdz('płaszczyzna Górna (XZ): wyciągnięcie w górę (+Y), położenie zachowane',
          blisko(wycMin[1], 0, 1e-6) && blisko(wycMax[1], 25, 1e-6) && blisko(wycMax[0], 55, 1e-6) && blisko(wycMin[2], -30, 1e-6),
          `min ${wycMin.map((v) => v.toFixed(1))} max ${wycMax.map((v) => v.toFixed(1))}`);

  // 5. Boolean: różnica (płyta − kołek poprzeczny), wynik zastępuje obie bryły
  const przed = projekt.bryly.length;
  const roz = await projekt.boolean(box.id, walec.id, 'roznica');
  const vRoz = 100000 - Math.PI * 100 * 20;
  sprawdz('boolean różnicy: objętość płyta − otwór', blisko(roz.objetosc, vRoz, 0.01), `${roz.objetosc.toFixed(3)} / ${vRoz.toFixed(3)}`);
  const stan1 = await silnik.wykonaj('stan');
  sprawdz('wynik zastępuje obie bryły (lista i wątek)', projekt.bryly.length === przed - 1 && !stan1.ids.includes(box.id) && stan1.ids.includes(roz.id),
          `${przed} → ${projekt.bryly.length}, wątek: ${stan1.ids.join(',')}`);
  sprawdz('wynik zapamiętuje kolejność operacji (definicje A i B)', roz.def.typ === 'boolean' && roz.def.a.def.typ === 'prostopadloscian' && roz.def.b.obr[0] === 90);

  // 6. Pusta część wspólna → odrzucona, bryły bez zmian
  const k2 = await projekt.dodaj({ typ: 'kula', r: 10 }, { nazwa: 'Daleko', poz: [1000, 0, 0] });
  const n2 = projekt.bryly.length;
  blad = null;
  try { await projekt.boolean(kula.id, k2.id, 'wspolna'); } catch (e) { blad = e; }
  sprawdz('pusta część wspólna odrzucona, bryły bez zmian', blad && /pusta/.test(blad.message) && projekt.bryly.length === n2, blad && blad.message);
  await projekt.usun([k2.id]);

  // 7. Eksport STEP → ponowne wczytanie: nazwy, liczba, położenie po obrocie i skali
  projekt.ustawTransformacje(kula.id, { poz: [0, 200, 0] });
  const pud = await projekt.dodaj({ typ: 'prostopadloscian', dx: 100, dy: 50, dz: 20 }, { nazwa: 'Obrocony', poz: [10, -20, 30], obr: [30, 45, 60], skala: 1.5 });
  let bajty = await projekt.eksportSTEP({ zakres: 'wszystko' });
  if (TEST.ZAPISZ_PLIKI) writeFileSync(KATALOG + 'szkicownik_eksport.step', bajty);
  let cz = await czytajSTEP(bajty);
  sprawdz('eksport STEP wczytuje się z powrotem (4 bryły, nazwy)', cz.length === 4 && ['Plyta', 'Kula', 'Wyciagniecie', 'Obrocony'].every((n) => czesc(cz, n)),
          cz.map((c) => c.nazwa).join(', '));
  const m = macierzBryly(pud);
  const rogi = [];
  for (const x of [-50, 50]) for (const y of [-25, 25]) for (const z of [-10, 10]) rogi.push(przeksztalcPunkt(m, [x, y, z]));
  const oczek = { min: [0, 1, 2].map((k) => Math.min(...rogi.map((r) => r[k]))), max: [0, 1, 2].map((k) => Math.max(...rogi.map((r) => r[k]))) };
  const ob = czesc(cz, 'Obrocony');
  const odch = Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(ob.min[k] - oczek.min[k]), Math.abs(ob.max[k] - oczek.max[k])]));
  sprawdz('położenie po obrocie 30/45/60° i skali 1.5 zgodne po eksporcie', odch < TEST.TOL_RAMKA_MM, `odchyłka ${odch.toFixed(4)} mm`);
  sprawdz('struktura: nowe bryły w podzłożeniu „Szkicownik”', cz.every((c) => c.sciezka.includes('Szkicownik')), cz[0].sciezka.join(' / '));
  bajty = await projekt.eksportSTEP({ zakres: 'wszystko', ids: [kula.id] });
  cz = await czytajSTEP(bajty);
  sprawdz('eksport tylko zaznaczonych brył', cz.length === 1 && cz[0].nazwa === 'Kula' && blisko(cz[0].min[1], 170, 0.01), cz.map((c) => c.nazwa).join());

  // 8. Oryginalny STEP jako elementy złożenia: przesunięcie, eksport trzech wariantów
  const bajtyOryg = readFileSync(KATALOG + 'test_zlozenie.step');
  const czesciViewera = await czytajSTEP(bajtyOryg);
  const wcz = await projekt.wczytajOryginal(bajtyOryg, czesciViewera, 'test_zlozenie');
  const nazwyOryg = wcz.bryly.map((b) => b.nazwa).sort().join(',');
  sprawdz('oryginał: 4 części dopasowane z nazwami viewera', wcz.bryly.length === 4 && wcz.niedopasowane === 0 && nazwyOryg === 'Plyta_bazowa,Silownik_DSNU,Slup,Wspornik_L', nazwyOryg);
  const slup = projekt.bryly.find((b) => b.nazwa === 'Slup');
  projekt.ustawTransformacje(slup.id, { poz: slup.poz.map((v, i) => v + [100, 0, 0][i]) });
  const nowy = await projekt.dodaj({ typ: 'prostopadloscian', dx: 50, dy: 50, dz: 50 }, { nazwa: 'Oslona', poz: [0, 0, 100] });
  const wszystko = await czytajSTEP(await projekt.eksportSTEP({ zakres: 'wszystko' }));
  const nowe = await czytajSTEP(await projekt.eksportSTEP({ zakres: 'nowe' }));
  const tylkoOryg = await czytajSTEP(bajty = await projekt.eksportSTEP({ zakres: 'oryginal' }));
  if (TEST.ZAPISZ_PLIKI) writeFileSync(KATALOG + 'szkicownik_oryginal_przesuniety.step', bajty);
  const slupPo = czesc(tylkoOryg, 'Slup'), slupPrzed = czesc(czesciViewera, 'Slup');
  sprawdz('eksport „oryginał”: 4 części, przesunięty słup +100 mm w X',
          tylkoOryg.length === 4 && blisko(slupPo.min[0] - slupPrzed.min[0], 100, TEST.TOL_RAMKA_MM) && blisko(slupPo.min[2], slupPrzed.min[2], TEST.TOL_RAMKA_MM),
          `słup X ${slupPrzed.min[0].toFixed(1)} → ${slupPo.min[0].toFixed(1)}`);
  sprawdz('eksport „oryginał”: struktura złożenia zachowana', czesc(tylkoOryg, 'Silownik_DSNU').sciezka.join('/').endsWith('Stanowisko_testowe/Modul_chwytaka'),
          czesc(tylkoOryg, 'Silownik_DSNU').sciezka.join('/'));
  sprawdz('eksport „nowe”: tylko bryły ze Szkicownika', nowe.length === 5 && !czesc(nowe, 'Slup') && czesc(nowe, 'Oslona'), nowe.map((c) => c.nazwa).join(', '));
  sprawdz('eksport „wszystko”: oryginał + nowe w jednym złożeniu', wszystko.length === 9 && czesc(wszystko, 'Oslona').sciezka.join('/').endsWith('Stanowisko_testowe/Szkicownik'),
          `${wszystko.length} brył, „Oslona” w ${czesc(wszystko, 'Oslona').sciezka.join('/')}`);

  // 8b. Zmiana wymiarów, kopia (bez liczenia od nowa), grupa = podzłożenie w STEP
  const kol = await projekt.dodaj({ typ: 'walec', r: 20, h: 100 }, { nazwa: 'Kolumna', poz: [300, 0, 0] });
  await projekt.zmienDef(kol.id, { typ: 'walec', r: 30, h: 100 });
  sprawdz('zmiana wymiarów bryły (Ø40 → Ø60)', blisko(projekt.bryla(kol.id).objetosc, Math.PI * 900 * 100, 0.01) && projekt.bryla(kol.id).poz[0] === 300);
  const [kop] = await projekt.kopiuj([kol.id], [50, 0, 0]);
  const stanK = await silnik.wykonaj('stan');
  sprawdz('kopia bryły: nowa nazwa, przesunięta, jest w wątku', kop.nazwa === 'Kolumna (kopia)' && kop.poz[0] === 350 && stanK.ids.includes(kop.id));
  const grupa = projekt.grupuj([kol.id, kop.id]);
  const zGrupa = await czytajSTEP(await projekt.eksportSTEP({ zakres: 'nowe', ids: [kol.id, kop.id] }));
  sprawdz('grupa → podzłożenie w STEP', zGrupa.length === 2 && zGrupa.every((c) => c.sciezka[c.sciezka.length - 1] === grupa.nazwa),
          zGrupa.map((c) => c.sciezka.join('/') + '/' + c.nazwa).join(', '));
  projekt.rozgrupuj([kol.id]);
  sprawdz('rozgrupowanie: grupa z jedną bryłą znika', projekt.grupy.length === 0 && !projekt.bryla(kop.id).grupa);
  await projekt.usun([kol.id, kop.id]);

  // 9. Strażnik czasu: ciężki boolean przerwany, wątek odtworzony, bryły nietknięte
  const N = TEST.CIEZKI_BOOLEAN_RAMION, pkt = [];
  for (let i = 0; i < N; i++) { const a = 2 * Math.PI * i / N, r = i % 2 ? 90 : 100; pkt.push([r * Math.cos(a), r * Math.sin(a)]); }
  const gwiazda = { typ: 'wyciagniecie', plaszczyzna: 'XY', odsuniecie: 0, obrys: pkt.map((p, i) => ({ typ: 'linia', a: p, b: pkt[(i + 1) % N] })), h: 50 };
  const g1 = await projekt.dodaj(gwiazda, { nazwa: 'Gwiazda 1', poz: [0, 0, 500] });
  const g2 = await projekt.dodaj(gwiazda, { nazwa: 'Gwiazda 2', poz: [0, 0, 510], obr: [0, 0, 180 / N * 0.7] });
  const idsPrzed = projekt.bryly.map((b) => b.id).join(',');
  const stanPrzed = JSON.stringify(projekt.stanJSON());
  blad = null;
  t0 = performance.now();
  try { await projekt.boolean(g1.id, g2.id, 'suma'); } catch (e) { blad = e; }
  const czas = performance.now() - t0;
  sprawdz(`ciężki boolean przerwany po ${TEST.TIMEOUT_TESTOWY_MS} ms`, blad instanceof BladGeometrii && blad.kod === 'TIMEOUT' && restarty.length === 1,
          `${blad && blad.kod}: ${blad && blad.message} (razem z restartem ${(czas / 1000).toFixed(1)} s)`);
  sprawdz('po przerwaniu: lista brył bez zmian', projekt.bryly.map((b) => b.id).join(',') === idsPrzed && JSON.stringify(projekt.stanJSON()) === stanPrzed);
  const stan2 = await silnik.wykonaj('stan');
  sprawdz('po przerwaniu: nowy wątek ma odtworzone wszystkie bryły', projekt.bryly.every((b) => stan2.ids.includes(b.id)) && stan2.oryginal > 0,
          `${stan2.ids.length} brył, oryginał ${stan2.oryginal} brył`);
  const poRestarcie = await czytajSTEP(await projekt.eksportSTEP({ zakres: 'wszystko' }));
  const plytaPo = czesc(poRestarcie, 'Plyta');
  sprawdz('po przerwaniu: eksport działa, bryła z booleana odtworzona', poRestarcie.length === wszystko.length + 2 && plytaPo && blisko(plytaPo.max[0] - plytaPo.min[0], 100, TEST.TOL_RAMKA_MM),
          `${poRestarcie.length} brył`);
  const k3 = await projekt.dodaj({ typ: 'walec', r: 5, h: 100 }, { poz: [0, 0, 100] });
  const szybki = await projekt.boolean(nowy.id, k3.id, 'roznica');
  sprawdz('po przerwaniu: kolejne operacje działają', blisko(szybki.objetosc, 125000 - Math.PI * 25 * 50, 0.01), szybki.objetosc.toFixed(2));
} catch (e) {
  sprawdz('test przerwany wyjątkiem', false, e.stack || e.message);
} finally {
  silnik.zakoncz();
}

const zle = wyniki.filter((w) => !w.ok);
console.log(`\nWYNIK: ${wyniki.length - zle.length}/${wyniki.length} OK` + (zle.length ? '  — BŁĘDY: ' + zle.map((w) => w.nazwa).join(', ') : ''));
process.exit(zle.length ? 1 : 0);
