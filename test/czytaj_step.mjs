// Pomocnik testów: wypisuje części pliku STEP (nazwa, ścieżka w drzewie, ramka w mm) jako JSON.
// Czyta tym samym czytnikiem co viewer (occt-import-js).   Użycie: node test/czytaj_step.mjs plik.step
import { readFileSync } from 'node:fs';
import occtimportjs from '../node_modules/occt-import-js/dist/occt-import-js.js';

const occt = await occtimportjs();
const r = occt.ReadStepFile(readFileSync(process.argv[2]), { linearUnit: 'millimeter' });
if (!r.success) { console.log(JSON.stringify({ blad: 'nie wczytano' })); process.exit(1); }
const czesci = [];
const idz = (n, sciezka) => {
  const tu = n.name ? [...sciezka, n.name] : sciezka;
  for (const mi of n.meshes) {
    const m = r.meshes[mi], p = m.attributes.position.array;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
    const nazwa = m.name || n.name;
    czesci.push({ nazwa, sciezka: tu.length && tu[tu.length - 1] === nazwa ? tu.slice(0, -1) : tu, min, max });
  }
  n.children.forEach((c) => idz(c, tu));
};
idz(r.root, []);
console.log(JSON.stringify(czesci));
