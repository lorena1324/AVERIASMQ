// ====== CONFIG ======
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbw2J76HmM9sT9i-IH4IVPgzw782oUM9lP5q4KM_0_0oyryhhjIrX0T-KK2H6vHOQtob/exec"; // 👈 TU UNICA URL DE DEPLOY
// const FOTOS_APPS_SCRIPT_URL = "https://script.google.com/macros/s/.../exec"; // 👈 ESTA YA NO ES NECESARIA

// ====== STATE ======
let registros = []; // items sin imágenes (persistibles)
let fotosMem = []; // { f1, f2, f3 } por item (no persistibles)

// ====== KEYS LOCALSTORAGE ======
const ITEM_DRAFT_KEY = "averiasItemDraft";
const FORM_DRAFT_KEY = "averiasDraft";

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
  localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
}

function loadDraft() {
  const raw = localStorage.getItem(FORM_DRAFT_KEY);
  if (!raw) return;
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

// ===== Auto-guardado encabezado y antes de salir =====
["fechaHora", "turno", "operador", "funcionario"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", saveDraft);
  document.getElementById(id)?.addEventListener("change", saveDraft);
});
window.addEventListener("beforeunload", saveDraft);

// ===== Overlay loading =====
function showLoading(on = true) {
  const ov = document.getElementById("loadingOverlay");
  if (!ov) return;
  ov.classList.toggle("hidden", !on);

  document.body.style.cursor = on ? "wait" : "";
  if (on) {
    document.body.dataset.pe = document.body.style.pointerEvents || "";
    document.body.style.pointerEvents = "none";
  } else {
    document.body.style.pointerEvents = document.body.dataset.pe || "";
    delete document.body.dataset.pe;
  }
}

/* ========= PREVIEWS DE FOTOS ========= */
/* Crea una cajita de preview (img + nombre) después de un input[type=file] */
function ensurePreviewBox(afterInput, idForBox) {
  let box = afterInput.nextElementSibling;
  if (!box || !box.classList.contains("photo-preview")) {
    box = document.createElement("div");
    box.className = "photo-preview";
    box.id = idForBox;
    box.style.marginTop = "6px";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.gap = "8px";
    box.innerHTML = `
      <img alt="Vista previa" style="max-width:120px;max-height:90px;border-radius:8px;border:1px solid #d1d5db;display:none"/>
      <span class="photo-name" style="font-size:12px;color:#555;"></span>
    `;
    afterInput.insertAdjacentElement("afterend", box);
  }
  return box;
}

/* Actualiza preview con el archivo actual del input */
function updatePreviewFromInput(inputEl) {
  const box = ensurePreviewBox(inputEl, `prev-${inputEl.id || inputEl.name || "file"}`);
  const img = box.querySelector("img");
  const name = box.querySelector(".photo-name");
  const file = inputEl.files && inputEl.files[0];

  if (file) {
    const url = URL.createObjectURL(file);
    img.src = url;
    img.style.display = "inline-block";
    name.textContent = file.name;
    img.onload = () => URL.revokeObjectURL(url);
  } else {
    img.src = "";
    img.style.display = "none";
    name.textContent = "";
  }
}

/* Previews en el formulario principal (foto1, foto2, foto3) */
function setupFormFilePreviews() {
  ["foto1", "foto2", "foto3"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    ensurePreviewBox(input, `prev-${id}`);
    input.addEventListener("change", () => updatePreviewFromInput(input));
  });
}

/* Limpia previews del formulario principal (cuando reseteas el form) */
function clearFormPreviews() {
  ["foto1", "foto2", "foto3"].forEach((id) => {
    const box = document.getElementById(`prev-${id}`);
    if (box) {
      const img = box.querySelector("img");
      const name = box.querySelector(".photo-name");
      if (img) { img.src = ""; img.style.display = "none"; }
      if (name) name.textContent = "";
    }
  });
}

// ====== RENDER (con Editar/Eliminar/Guardar/Cancelar) ======
function renderRegistros() {
  const cont = $("#averiasContainer");
  cont.innerHTML = "";

  registros.forEach((r, i) => {
    const enEdicion = r._edit === true;
    const el = document.createElement("div");
    el.className = "averia-card";

    if (!enEdicion) {
      // Vista normal
      el.innerHTML = `
        <div class="card-row"><b>#:</b> <span>${i + 1}</span></div>
        <div class="card-row"><b>EAN:</b> <span>${r.ean}</span></div>
        <div class="card-row"><b>Descripción:</b> <span>${r.descripcion || ""}</span></div>
        <div class="card-row"><b>FV:</b> <span>${r.fv}</span></div>
        <div class="card-row"><b>Lote:</b> <span>${r.lote}</span></div>
        <div class="card-row"><b>Causal:</b> <span>${r.causal}</span></div>
        <div class="card-row"><b>Procedencia:</b> <span>${r.procedencia}</span></div>
        <div class="card-row"><b>Cantidad:</b> <span>${r.cantidad}</span></div>
        <div class="card-row"><b>Unidad:</b> <span>${r.unidad}</span></div>
        <div class="card-row" style="grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <button data-action="edit" data-idx="${i}">Editar</button>
          <button data-action="del"  data-idx="${i}">Eliminar</button>
        </div>
      `;

      // 👉 Thumbs de fotos (si existen en memoria)
      const trio = fotosMem[i] || {};
      if (trio.f1 || trio.f2 || trio.f3) {
        const row = document.createElement("div");
        row.className = "card-row";
        row.innerHTML = `<b>Fotos:</b>`;
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.gap = "8px";
        wrap.style.flexWrap = "wrap";

        [trio.f1, trio.f2, trio.f3].forEach((f) => {
          if (!f) return;
          const img = document.createElement("img");
          img.style.maxWidth = "110px";
          img.style.maxHeight = "90px";
          img.style.borderRadius = "8px";
          img.style.border = "1px solid #d1d5db";
          const url = URL.createObjectURL(f);
          img.src = url;
          img.onload = () => URL.revokeObjectURL(url);
          wrap.appendChild(img);
        });

        row.appendChild(wrap);
        el.appendChild(row);
      }
    } else {
      // Modo edición (mini-form en tarjeta)
      el.innerHTML = `
        <form class="grid2" data-edit="${i}">
          <div class="field">
            <label>📌 EAN 13 *</label>
            <input type="text" name="ean" value="${r.ean}" inputmode="numeric" maxlength="13" required />
            <small class="hint">Debe tener 13 dígitos.</small>
          </div>
          <div class="field">
            <label>🏷️ Descripción</label>
            <input type="text" name="descripcion" value="${r.descripcion || ""}" />
          </div>
          <div class="field">
            <label>📆 Fecha vencimiento *</label>
            <input type="date" name="fv" value="${r.fv}" required />
          </div>
          <div class="field">
            <label>🔎 # Lote *</label>
            <input type="text" name="lote" value="${r.lote}" required />
          </div>
          <div class="field">
            <label>⚠️ Causal *</label>
            <select name="causal" required>
              ${[
                "Mal estado - Posición y corte",
                "Mal estado - Sello débil",
                "Bajo de aire",
                "Bajo Peso",
                "Sobrespeso",
                "No conforme - Sin fecha",
                "Producto estallado",
              ].map(c => `<option ${c===r.causal?"selected":""}>${c}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>📍 Procedencia *</label>
            <div class="radio-row">
              <label><input type="radio" name="proc" value="MQ Santo Domingo" ${r.procedencia==="MQ Santo Domingo"?"checked":""}/> MQ Santo Domingo</label>
              <label><input type="radio" name="proc" value="3PD Santo Domingo" ${r.procedencia==="3PD Santo Domingo"?"checked":""}/> 3PD Santo Domingo</label>
            </div>
          </div>
          <div class="field">
            <label>🔢 Cantidad *</label>
            <input type="number" name="cantidad" min="1" value="${r.cantidad}" required />
          </div>
          <div class="field">
            <label>📦 Unidad *</label>
            <div class="radio-row">
              ${["Unidad", "Docena", "Six", "Bag / Bolsa"].map(u =>
                `<label><input type="radio" name="unidad" value="${u}" ${u===r.unidad?"checked":""}/> ${u}</label>`
              ).join("")}
            </div>
          </div>

          <div class="field">
            <label>📸 Reemplazar foto 1 (opcional)</label>
            <input type="file" name="foto1" accept="image/*" capture="environment" />
          </div>
          <div class="field">
            <label>📸 Reemplazar foto 2 (opcional)</label>
            <input type="file" name="foto2" accept="image/*" capture="environment" />
          </div>
          <div class="field">
            <label>📸 Reemplazar foto 3 (opcional)</label>
            <input type="file" name="foto3" accept="image/*" capture="environment" />
          </div>

          <div class="field full" style="display:flex;gap:8px">
            <button type="button" class="primary" data-action="save" data-idx="${i}">Guardar</button>
            <button type="button" data-action="cancel" data-idx="${i}">Cancelar</button>
            <button type="button" data-action="del" data-idx="${i}" style="margin-left:auto">Eliminar</button>
          </div>
        </form>
      `;
    }

    cont.appendChild(el);
  });

  sumTotal();
}

// ====== EAN Autocomplete ======
let EAN_DB = [];
fetch("ean_db.json")
  .then((r) => r.json())
  .then((db) => { EAN_DB = db || []; })
  .catch(() => {});

$("#ean")?.addEventListener("input", () => {
  const ean = $("#ean").value.trim().replace(/\D/g, "");
  if (ean.length === 13) {
    const found = EAN_DB.find((x) => (x.ean || "").replace(/\D/g, "") === ean);
    if (found) $("#descripcion").value = found.descripcion || "";
  }
});

// ====== DRAFT DEL FORMULARIO DE ÍTEM ======
function saveItemDraft() {
  const d = {
    ean: $("#ean")?.value.trim() ?? "",
    descripcion: $("#descripcion")?.value.trim() ?? "",
    fv: $("#fv")?.value ?? "",
    lote: $("#lote")?.value ?? "",
    causal: $("#causal")?.value ?? "",
    proc: (Array.from($$("input[name='proc']")).find(r => r.checked) || {}).value || "",
    cantidad: $("#cantidad")?.value ?? "",
    unidad: (Array.from($$("input[name='unidad']")).find(r => r.checked) || {}).value || "",
  };
  localStorage.setItem(ITEM_DRAFT_KEY, JSON.stringify(d));
}

function loadItemDraft() {
  const raw = localStorage.getItem(ITEM_DRAFT_KEY);
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (d.ean != null) $("#ean").value = d.ean;
    if (d.descripcion != null) $("#descripcion").value = d.descripcion;
    if (d.fv != null) $("#fv").value = d.fv;
    if (d.lote != null) $("#lote").value = d.lote;
    if (d.causal) $("#causal").value = d.causal;
    if (d.proc) $$("input[name='proc']").forEach(r => r.checked = (r.value === d.proc));
    if (d.cantidad != null) $("#cantidad").value = d.cantidad;
    if (d.unidad) $$("input[name='unidad']").forEach(r => r.checked = (r.value === d.unidad));
  } catch {}
}

function clearItemDraft() {
  localStorage.removeItem(ITEM_DRAFT_KEY);
}

// Autoguardado mientras escribes
["ean", "descripcion", "fv", "lote", "causal", "cantidad"].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("input", saveItemDraft);
    el.addEventListener("change", saveItemDraft);
  }
});
$$("input[name='proc']").forEach(r => r.addEventListener("change", saveItemDraft));
$$("input[name='unidad']").forEach(r => r.addEventListener("change", saveItemDraft));

// ====== ADD ITEM ======
$("#btnAdd").addEventListener("click", () => {
  const ean = $("#ean").value.trim();
  if (!/^\d{13}$/.test(ean)) return toast("El EAN debe tener 13 dígitos.");

  const fv = $("#fv").value;
  if (!fv) return toast("Ingresa la fecha de vencimiento.");

  // Lote con máscara (subrayados)
  const loteMasked = $("#lote").value;
  if (loteMasked.includes("_")) return toast("Completa el # Lote.");
  const lote = loteMasked.replace(/_/g, "").trim();
  if (!/^[A-Za-z0-9\s:.\-]{2,}$/i.test(lote))
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
    lote, // limpio
    causal,
    procedencia,
    cantidad,
    unidad,
  });
  fotosMem.push({ f1, f2, f3 });

  renderRegistros();
  sumTotal();
  saveDraft();
  clearItemDraft();

  $("#itemForm").reset();
  clearFormPreviews();    // 👈 limpia previews del formulario
  $("#descripcion").value = "";
  $("#ean").focus();
  initLoteMask(true);
});

// ====== Acciones en tarjetas (Editar/Guardar/Cancelar/Eliminar) ======
$("#averiasContainer").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const idx = Number(btn.dataset.idx);
  const action = btn.dataset.action;

  if (action === "edit") {
    registros[idx]._edit = true;
    renderRegistros();
    return;
  }

  if (action === "cancel") {
    delete registros[idx]._edit;
    renderRegistros();
    return;
  }

  if (action === "del") {
    registros.splice(idx, 1);
    fotosMem.splice(idx, 1);
    renderRegistros();
    saveDraft();
    toast("Registro eliminado.");
    return;
  }

  if (action === "save") {
    const form = btn.closest("form[data-edit]");
    if (!form) return;

    const ean = form.ean.value.trim();
    const fv = form.fv.value;
    const lote = form.lote.value.trim(); // en edición no usamos máscara
    const causal = form.causal.value;
    const cantidad = parseInt(form.cantidad.value || "0", 10);
    const unidad = form.querySelector('input[name="unidad"]:checked')?.value || "";
    const procedencia = form.querySelector('input[name="proc"]:checked')?.value || "";
    const descripcion = form.descripcion.value.trim();

    if (!/^\d{13}$/.test(ean)) return toast("El EAN debe tener 13 dígitos.");
    if (!fv) return toast("Ingresa la fecha de vencimiento.");
    if (!/^[A-Za-z0-9\s:.\-]{2,}$/i.test(lote))
      return toast("Formato de lote no válido. Ej: L127 23:33 DD AM");
    if (!causal) return toast("Selecciona una causal.");
    if (!procedencia) return toast("Selecciona procedencia.");
    if (cantidad <= 0) return toast("Ingresa una cantidad válida.");
    if (!unidad) return toast("Selecciona la unidad.");

    // Reemplazo opcional de fotos
    const nf1 = form.foto1.files[0];
    const nf2 = form.foto2.files[0];
    const nf3 = form.foto3.files[0];

    const trioActual = fotosMem[idx] || {};
    fotosMem[idx] = {
      f1: nf1 || trioActual.f1,
      f2: nf2 || trioActual.f2,
      f3: nf3 || trioActual.f3,
    };

    registros[idx] = {
      ...registros[idx],
      ean,
      descripcion,
      fv,
      lote,
      causal,
      procedencia,
      cantidad,
      unidad,
    };

    delete registros[idx]._edit;
    renderRegistros();
    saveDraft();
    toast("Registro actualizado.");
    return;
  }
});

/* 👉 Previews también cuando cambias archivos dentro de una tarjeta en modo edición */
$("#averiasContainer").addEventListener("change", (e) => {
  const input = e.target;
  if (input && input.type === "file") {
    updatePreviewFromInput(input);
  }
});

// ====== Subida de fotos individual ======
async function subirFotoIndividual(foto) {
  try {
    const base64Data = await toBase64(foto);
    const payload = {
      fileName: foto.name,
      fileData: base64Data,
      mimeType: foto.type,
    };

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // ✅ Corregido
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const resultado = await response.json();
    return resultado.publicUrl; // ✅ Corregido
  } catch (error) {
    console.error(`Error subiendo foto:`, error);
    return ""; // ✅ Retornar cadena vacía en caso de error
  }
}

// ====== SUBMIT (overlay + validación de fotos) ======
document.getElementById("btnEnviar").addEventListener("click", async () => {
  showLoading(true);

  try {
    if (registros.length === 0) {
      showLoading(false);
      return toast("Agrega al menos un registro de avería.");
    }

    const fechaHora = $("#fechaHora").value;
    const turno = $("#turno").value;
    const operador = $("#operador").value;
    const funcionario = $("#funcionario").value;

    const faltan = [];
    if (!fechaHora) faltan.push("Fecha y hora");
    if (!turno) faltan.push("Turno");
    if (!operador) faltan.push("Operador MQ");
    if (!funcionario) faltan.push("Funcionario");
    if (faltan.length) {
      showLoading(false);
      return toast("Completa los datos del encabezado:\n- " + faltan.join("\n- "));
    }

    // Validar fotos por registro
    const faltanFotos = registros.reduce((arr, _, i) => {
      const t = fotosMem[i] || {};
      if (!t.f1 || !t.f2 || !t.f3) arr.push(i + 1);
      return arr;
    }, []);
    if (faltanFotos.length) {
      showLoading(false);
      return toast(
        "Faltan evidencias en los registros: #" + faltanFotos.join(", ") +
        ". Edita cada uno y adjunta las 3 fotos."
      );
    }

    // Subida de fotos
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

    // ✅ CORRECCIÓN: Construir el objeto con las propiedades en el orden exacto
    const registrosPayload = registros.map((r, i) => {
      const fotosDelRegistro = fotosB64[i];
      return {
        ean: r.ean,
        descripcion: r.descripcion,
        fv: r.fv,
        lote: r.lote,
        causal: r.causal,
        procedencia: r.procedencia,
        cantidad: r.cantidad,
        unidad: r.unidad,
        foto1: fotosDelRegistro.foto1,
        foto2: fotosDelRegistro.foto2,
        foto3: fotosDelRegistro.foto3,
      };
    });

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
    localStorage.removeItem(FORM_DRAFT_KEY);
    clearItemDraft();
    registros = [];
    fotosMem = [];

    window.location.href = "confirmacion.html";
  } catch (err) {
    console.error(err);
    showLoading(false);
    alert("No se pudo enviar el reporte:\n" + (err.message || err));
  }
});

// ====== On Load ======
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

  if (registros.length && fotosMem.length < registros.length) {
    fotosMem = Array.from({ length: registros.length }, (_, i) => fotosMem[i] || {});
  }

  initLoteMask();    // máscara del campo Lote
  loadItemDraft();    // restaura borrador del ítem
  setupFormFilePreviews(); // 👈 activa previews en el formulario principal
});

// ====== MÁSCARA VISUAL SOLO PARA #lote ======
// Template: L___ __:__ __ __
function initLoteMask(reset = false) {
  const input = document.getElementById("lote");
  if (!input) return;

  const TEMPLATE = "L___ __:__ __ __";
  const SCHEMA = ["L", "#", "#", "#", " ", "#", "#", ":", "#", "#", " ", "A", "A", " ", "A", "A"]; // #=digito, A=letra

  function buildMasked(raw) {
    let chars = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").split("");
    if (chars[0] === "L") chars.shift();

    let out = "";
    for (const slot of SCHEMA) {
      if (slot === "L") { out += "L"; continue; }
      if (slot === " " || slot === ":") { out += slot; continue; }
      let placed = "_";
      while (chars.length) {
        const c = chars.shift();
        if (slot === "#" && /\d/.test(c)) { placed = c; break; }
        if (slot === "A" && /[A-Z]/.test(c)) { placed = c; break; }
      }
      out += placed;
    }
    return out;
  }

  function handleInput() {
    const raw = input.value;
    const masked = buildMasked(raw);
    const wasEnd = document.activeElement === input;
    input.value = masked;
    if (wasEnd) input.setSelectionRange(masked.length, masked.length);
  }

  if (reset || !input.value) input.value = TEMPLATE;

  input.addEventListener("focus", () => {
    if (!input.value || /^L_/.test(input.value)) input.value = TEMPLATE;
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  });

  input.addEventListener("input", handleInput);
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    input.value = buildMasked(text);
  });

  input.addEventListener("blur", () => {
    if (!input.value || !/[A-Z0-9]/i.test(input.value)) input.value = TEMPLATE;
  });
}