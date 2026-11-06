"""Generuje testowe złożenie STEP (z nazwami części, podzłożeniem i kolorami),
żeby sprawdzić viewer bez SolidWorksa."""
import cadquery as cq

OUT_FILE = "test/test_zlozenie.step"

plyta = cq.Workplane("XY").box(400, 300, 15).faces(">Z").workplane().rarray(350, 250, 2, 2).hole(12)
slup = cq.Workplane("XY").circle(25).extrude(250)
wspornik = (
    cq.Workplane("XZ").polyline([(0, 0), (80, 0), (80, 10), (10, 10), (10, 80), (0, 80)]).close().extrude(40)
)
silownik = cq.Workplane("XY").circle(20).extrude(120).faces(">Z").workplane().circle(8).extrude(60)

modul = (
    cq.Assembly(name="Modul_chwytaka")
    .add(wspornik, name="Wspornik_L", color=cq.Color(0.2, 0.4, 0.8))
    .add(silownik, name="Silownik_DSNU", loc=cq.Location((40, -20, 10)), color=cq.Color(0.7, 0.7, 0.7))
)

zlozenie = (
    cq.Assembly(name="Stanowisko_testowe")
    .add(plyta, name="Plyta_bazowa", color=cq.Color(0.3, 0.3, 0.3))
    .add(slup, name="Slup", loc=cq.Location((-150, 0, 7.5)), color=cq.Color(0.9, 0.6, 0.1))
    .add(modul, name="Modul_chwytaka", loc=cq.Location((50, 0, 7.5)))
)

zlozenie.save(OUT_FILE)
print("zapisano", OUT_FILE)
