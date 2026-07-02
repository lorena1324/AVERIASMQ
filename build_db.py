#!/usr/bin/env python3
"""Lee Libro8.xlsx (ambos pares Material/Descripcion) y los agrega a ean_db.json.
Sin dependencias: parsea el xlsx como zip con la stdlib.
ponytail: parser xlsx casero (solo strings + valores), openpyxl si algun dia hay formulas/fechas raras."""
import zipfile, re, json, xml.etree.ElementTree as ET

XLSX, JSON = "Libro8.xlsx", "ean_db.json"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def col(ref):
    n = 0
    for c in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(c) - 64
    return n

def read_rows():
    z = zipfile.ZipFile(XLSX)
    sst = ["".join(t.text or "" for t in si.iter(NS + "t"))
           for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(NS + "si")]
    for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(NS + "row"):
        cells = {}
        for c in row.findall(NS + "c"):
            v = c.find(NS + "v")
            val = v.text if v is not None else None
            if c.get("t") == "s" and val is not None:
                val = sst[int(val)]
            cells[col(c.get("r"))] = val
        yield cells

rows = list(read_rows())[3:]  # datos empiezan tras el header (fila indice 2)

seen, nuevos = set(), []
for r in rows:
    for code_col, desc_col in ((1, 2), (3, 4)):  # par A (padre), par B (componente)
        code, desc = r.get(code_col), r.get(desc_col)
        if not code:
            continue
        code = str(code).strip()
        if code in seen:
            continue
        seen.add(code)
        nuevos.append({"ean": code, "descripcion": (desc or "").strip()})

db = json.load(open(JSON, encoding="utf-8"))
existentes = {e.get("ean") for e in db}
agregados = [n for n in nuevos if n["ean"] not in existentes]
db.extend(agregados)

json.dump(db, open(JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"xlsx: {len(nuevos)} codigos unicos | agregados: {len(agregados)} | total json: {len(db)}")

# ponytail: check minimo — todo lo agregado tiene ean no vacio y no duplica lo existente
assert all(a["ean"] and a["ean"] not in existentes for a in agregados)
