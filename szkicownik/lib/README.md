# Biblioteki Szkicownika (kopie bez zmian)

| Plik | Pakiet npm | Licencja |
|---|---|---|
| `replicad.js`, `casting-rs4QjB74.js` | `replicad@1.1.0` (zawiera w środku `flatbush` — ISC, `opentype.js` — MIT) | MIT, `LICENSE-replicad.txt` |
| `replicad_single.js`, `replicad_single.wasm` | `replicad-opencascadejs@1.1.0` (OpenCascade 7.x w WebAssembly) | LGPL-2.1, `LICENSE-replicad-opencascadejs-LGPL-2.1.txt` |

Pliki są skopiowane 1:1 z `node_modules/replicad/dist/` i `node_modules/replicad-opencascadejs/dist/`.
Trzymane w repozytorium, bo plik `.wasm` (23 MB) może nie być wydawany przez CDN.
Źródła OpenCascade: https://dev.opencascade.org , replicad: https://github.com/sgenoud/replicad .

Aktualizacja (w folderze tymczasowym):
```
npm install replicad@<wersja> replicad-opencascadejs@<wersja>
```
i skopiowanie tych samych plików (nazwa pliku `casting-*.js` zmienia się między wersjami — wtedy poprawić ją nie trzeba,
bo `replicad.js` importuje ją sam). Potem `node test/szkicownik_test.mjs`.
