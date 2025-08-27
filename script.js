// ====== CONFIG ======
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbw2J76HmM9sT9i-IH4IVPgzw782oUM9lP5q4KM_0_0oyryhhjIrX0T-KK2H6vHOQtob/exec";
const FOTOS_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxFTKwAQCOl8Zu3i5fjL3otvHoNXpA9UxKBOp1DJNHtoOqeKrO03bYAHUvf2QvlxSeb/exec";

// ====== STATE ======
let registros = []; // items sin imágenes (persistibles)
let fotosMem = []; // { f1, f2, f3 } por item (no persistibles)

// ====== HELPERS ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg) {
  alert(msg);
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sumTotal() {
  const total = registros.reduce(
    (acc, r) => acc + (parseInt(r.cantidad) || 0),
    0
  );
  $("#total").value = total;
  return total;
}

function saveDraft() {
  const draft = {
    header: {
      fechaHora: $("#fechaHora").value,
      turno: $("#turno").value,
      operador: $("#operador").value,
      funcionario: $("#funcionario").value,
    },
    registros,
  };
  localStorage.setItem("averiasDraft", JSON.stringify(draft));
}

function loadDraft() {
  const raw = localStorage.getItem("averiasDraft");
  if (!raw) return;
  console.log("Cargando borrador", fotosMem);
  try {
    const draft = JSON.parse(raw);
    if (draft.header) {
      $("#fechaHora").value = draft.header.fechaHora || "";
      $("#turno").value = draft.header.turno || "";
      $("#operador").value = draft.header.operador || "";
      $("#funcionario").value = draft.header.funcionario || "";
    }
    if (Array.isArray(draft.registros)) {
      registros = draft.registros;
      renderRegistros();
      sumTotal();
    }
  } catch (e) {
    console.warn("No se pudo cargar borrador:", e);
  }
}

function renderRegistros() {
  const cont = $("#averiasContainer");
  cont.innerHTML = "";
  registros.forEach((r, i) => {
    const el = document.createElement("div");
    el.className = "averia-card";
    el.innerHTML = `
      <div class="card-row"><b>#:</b> <span>${i + 1}</span></div>
      <div class="card-row"><b>EAN:</b> <span>${r.ean}</span></div>
      <div class="card-row"><b>Descripción:</b> <span>${
        r.descripcion || ""
      }</span></div>
      <div class="card-row"><b>FV:</b> <span>${r.fv}</span></div>
      <div class="card-row"><b>Lote:</b> <span>${r.lote}</span></div>
      <div class="card-row"><b>Causal:</b> <span>${r.causal}</span></div>
      <div class="card-row"><b>Procedencia:</b> <span>${
        r.procedencia
      }</span></div>
      <div class="card-row"><b>Cantidad:</b> <span>${r.cantidad}</span></div>
      <div class="card-row"><b>Unidad:</b> <span>${r.unidad}</span></div>
    `;
    cont.appendChild(el);
  });
}

// ====== EAN Autocomplete ======
let EAN_DB = [];
fetch("ean_db.json")
  .then((r) => r.json())
  .then((db) => {
    EAN_DB = db || [];
  })
  .catch(() => {});

$("#ean")?.addEventListener("input", () => {
  const ean = $("#ean").value.trim().replace(/\D/g, "");
  if (ean.length === 13) {
    const found = EAN_DB.find((x) => (x.ean || "").replace(/\D/g, "") === ean);
    if (found) $("#descripcion").value = found.descripcion || "";
  }
});

// ====== ADD ITEM ======
$("#btnAdd").addEventListener("click", () => {
  const ean = $("#ean").value.trim();
  if (!/^\d{13}$/.test(ean)) return toast("El EAN debe tener 13 dígitos.");

  const fv = $("#fv").value;
  if (!fv) return toast("Ingresa la fecha de vencimiento.");

  const lote = $("#lote").value.trim();
  if (!/^[\w\s:.-]{2,}$/i.test(lote))
    return toast("Formato de lote no válido. Ej: L127 23:33 DD AM");

  const causal = $("#causal").value;
  if (!causal) return toast("Selecciona una causal.");

  const procedencia =
    (Array.from($$("input[name='proc']")).find((r) => r.checked) || {}).value ||
    "";
  const cantidad = parseInt($("#cantidad").value || "0");
  if (cantidad <= 0) return toast("Ingresa una cantidad válida.");

  const unidad =
    (Array.from($$("input[name='unidad']")).find((r) => r.checked) || {})
      .value || "";

  const f1 = $("#foto1").files[0];
  const f2 = $("#foto2").files[0];
  const f3 = $("#foto3").files[0];
  if (!f1 || !f2 || !f3) return toast("Debes adjuntar las 3 evidencias.");

  const found = EAN_DB.find((x) => (x.ean || "").replace(/\D/g, "") === ean);
  const descripcion =
    $("#descripcion").value || (found ? found.descripcion : "");

  registros.push({
    ean,
    descripcion,
    fv,
    lote,
    causal,
    procedencia,
    cantidad,
    unidad,
  });
  fotosMem.push({ f1, f2, f3 });

  renderRegistros();
  sumTotal();
  // saveDraft();

  $("#itemForm").reset();
  $("#descripcion").value = "";
  $("#ean").focus();
});

async function subirFotoIndividual(foto) {
  try {
    const base64Data = await toBase64(foto);
    // Crear FormData con las 3 fotos
    const payload = {
      fileName: foto.name,
      fileData: base64Data,
      mimeType: foto.type,
    };

    const response = await fetch(FOTOS_APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(response);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const resultado = await response.json();
    console.log(`Respuesta foto:`, resultado.downloadUrl);

    return resultado.downloadUrl;
  } catch (error) {
    console.error(`Error subiendo foto:`, error);
    return { success: false, error: error.message };
  }
}

// ====== SUBMIT ======
$("#btnEnviar").addEventListener("click", async () => {
  try {
    if (registros.length === 0)
      return toast("Agrega al menos un registro de avería.");

    const fechaHora = $("#fechaHora").value;
    const turno = $("#turno").value;
    const operador = $("#operador").value;
    const funcionario = $("#funcionario").value;

    const faltan = [];
    if (!fechaHora) faltan.push("Fecha y hora");
    if (!turno) faltan.push("Turno");
    if (!operador) faltan.push("Operador MQ");
    if (!funcionario) faltan.push("Funcionario");
    if (faltan.length)
      return toast(
        "Completa los datos del encabezado:\n- " + faltan.join("\n- ")
      );

    const sizes = fotosMem.map((t, i) => ({
      i: i + 1,
      f1: (t.f1.size / 1024).toFixed(0) + " KB",
      f2: (t.f2.size / 1024).toFixed(0) + " KB",
      f3: (t.f3.size / 1024).toFixed(0) + " KB",
    }));
    console.log("Tamaños de fotos:", sizes);
    alert(
      "Enviando reporte... (fotos por ítem en KB)\n" +
        sizes.map((s) => `#${s.i} f1:${s.f1} f2:${s.f2} f3:${s.f3}`).join("\n")
    );

    const fotosB64 = await Promise.all(
      fotosMem.map(async (trio) => {
        const [b1, b2, b3] = await Promise.all([
          subirFotoIndividual(trio.f1),
          subirFotoIndividual(trio.f2),
          subirFotoIndividual(trio.f3),
        ]);
        return { foto1: b1, foto2: b2, foto3: b3 };
      })
    );
    console.log({ fotosB64 });
    const registrosPayload = registros.map((r, i) => ({
      ...r,
      ...fotosB64[i],
    }));
    const payload = {
      fechaHora,
      turno,
      operador,
      funcionario,
      registros: registrosPayload,
    };

    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    console.log("Respuesta backend:", txt);

    let ok = res.ok;
    try {
      const j = JSON.parse(txt);
      if (j.ok === true) ok = true;
      else if (j.ok === false) throw new Error(j.error || "Backend ok:false");
    } catch (_) {
      if (!res.ok) throw new Error(txt || "Error HTTP");
    }

    const total = sumTotal();
    localStorage.setItem(
      "formLastSent",
      JSON.stringify({ fechaHora, turno, operador, funcionario, total })
    );
    localStorage.removeItem("averiasDraft");
    registros = [];
    fotosMem = [];

    alert("¡Reporte enviado con éxito!");
    window.location.href = "confirmacion.html";
  } catch (err) {
    console.error(err);
    alert("No se pudo enviar el reporte:\n" + (err.message || err));
  }
});

// ====== On Load: set default datetime & restore draft ======
document.addEventListener("DOMContentLoaded", () => {
  const fh = document.getElementById("fechaHora");
  if (fh && !fh.value) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const v = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    fh.value = v;
  }
  loadDraft();
  sumTotal();
});
