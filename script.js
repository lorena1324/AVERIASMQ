// ====== CONFIG ======
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbz_3ir7sARmd0RFMaINpq9G3ydvGptz0iPhTg2H0nkK4T2totS5fRZEIhQJorwuWuuS/exec";
const FOTOS_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxFTKwAQCOl8Zu3i5fjL3otvHoNXpA9UxKBOp1DJNHtoOqeKrO03bYAHUvf2QvlxSeb/exec";

// ====== STATE ======
let registros = []; // items sin imágenes (persistibles)
let fotosMem = []; // { f1, f2, f3 } por item (no persistibles)

// ====== KEYS LOCALSTORAGE ======
const ITEM_DRAFT_KEY = "averiasItemDraft";
const FORM_DRAFT_KEY = "averiasDraft";
const PHOTOS_CACHE_KEY = "averiasPhotosCache";
const CACHE_TIMESTAMP_KEY = "averiasCacheTimestamp";

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
  try {
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
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

    // Guardar fotos en caché de forma asíncrona
    savePhotosCache()
      .then(() => {
        console.log("Borrador guardado exitosamente con fotos");
      })
      .catch((error) => {
        console.error("Error guardando fotos en caché:", error);
      });

    // Mostrar indicador de caché
    showCacheIndicator();
  } catch (error) {
    console.error("Error guardando borrador:", error);
  }
}

function loadDraft() {
  const raw = localStorage.getItem(FORM_DRAFT_KEY);
  if (!raw) {
    console.log("No hay borrador guardado");
    return;
  }

  try {
    const draft = JSON.parse(raw);

    // Cargar datos del encabezado
    if (draft.header) {
      $("#fechaHora").value = draft.header.fechaHora || "";
      $("#turno").value = draft.header.turno || "";
      $("#operador").value = draft.header.operador || "";
      $("#funcionario").value = draft.header.funcionario || "";
    }

    // Cargar registros
    if (Array.isArray(draft.registros)) {
      registros = draft.registros;
      renderRegistros();
      sumTotal();
    }

    // Cargar fotos desde caché de forma asíncrona
    loadPhotosCache()
      .then(() => {
        console.log("Borrador cargado exitosamente con fotos");
        // Mostrar indicador si hay datos guardados
        if (registros.length > 0) {
          showCacheIndicator();
        }
      })
      .catch((error) => {
        console.error("Error cargando fotos desde caché:", error);
        // Aún mostrar indicador aunque las fotos fallen
        if (registros.length > 0) {
          showCacheIndicator();
        }
      });
  } catch (e) {
    console.error("Error parseando borrador:", e);
    // Limpiar borrador corrupto
    localStorage.removeItem(FORM_DRAFT_KEY);
  }
}

// ====== FUNCIONES DE CACHÉ DE FOTOS ======
async function savePhotosCache() {
  try {
    // Validar que hay fotos para guardar
    if (!fotosMem || fotosMem.length === 0) {
      console.log("No hay fotos en memoria para guardar en caché");
      return;
    }

    const photosCache = [];
    let hasValidPhotos = false;

    for (let i = 0; i < fotosMem.length; i++) {
      const trio = fotosMem[i];
      if (!trio) {
        photosCache.push({});
        continue;
      }

      const trioBase64 = {};
      let trioHasPhotos = false;

      // Procesar cada foto del trio con validación
      for (const key of ["f1", "f2", "f3"]) {
        if (trio[key] && trio[key] instanceof File) {
          try {
            trioBase64[key] = await toBase64(trio[key]);
            trioHasPhotos = true;
            hasValidPhotos = true;
          } catch (error) {
            console.warn(`Error convirtiendo ${key} a base64:`, error);
            // Continuar con las otras fotos aunque una falle
          }
        }
      }

      photosCache.push(trioBase64);
    }

    // Solo guardar si hay fotos válidas
    if (hasValidPhotos) {
      localStorage.setItem(PHOTOS_CACHE_KEY, JSON.stringify(photosCache));
      console.log(`Guardadas ${photosCache.length} entradas de fotos en caché`);
    } else {
      console.log("No se encontraron fotos válidas para guardar en caché");
    }
  } catch (error) {
    console.error("Error crítico guardando fotos en caché:", error);
  }
}

async function loadPhotosCache() {
  try {
    const raw = localStorage.getItem(PHOTOS_CACHE_KEY);
    if (!raw) {
      console.log("No hay datos de fotos en caché");
      return;
    }

    let photosCache;
    try {
      photosCache = JSON.parse(raw);
    } catch (parseError) {
      console.error("Error parseando datos de caché de fotos:", parseError);
      // Limpiar caché corrupto
      localStorage.removeItem(PHOTOS_CACHE_KEY);
      return;
    }

    if (!Array.isArray(photosCache)) {
      console.warn("Datos de caché de fotos no son un array válido");
      return;
    }

    if (photosCache.length === 0) {
      console.log("Caché de fotos está vacío");
      return;
    }

    console.log(`Cargando ${photosCache.length} entradas de fotos desde caché`);

    // Restaurar fotos a la memoria
    fotosMem = [];
    let loadedPhotos = 0;

    for (let i = 0; i < photosCache.length; i++) {
      const trioBase64 = photosCache[i];
      if (!trioBase64 || typeof trioBase64 !== "object") {
        fotosMem.push({});
        continue;
      }

      const trio = {};
      let trioHasPhotos = false;

      // Procesar cada foto del trio con validación
      for (const key of ["f1", "f2", "f3"]) {
        if (trioBase64[key] && typeof trioBase64[key] === "string") {
          try {
            // Validar que es un data URL válido
            if (!trioBase64[key].startsWith("data:")) {
              console.warn(`Data URL inválido para ${key} en índice ${i}`);
              continue;
            }

            const response = await fetch(trioBase64[key]);
            if (!response.ok) {
              console.warn(
                `Error fetch para ${key} en índice ${i}:`,
                response.status
              );
              continue;
            }

            const blob = await response.blob();
            if (blob.size === 0) {
              console.warn(`Blob vacío para ${key} en índice ${i}`);
              continue;
            }

            // Determinar el tipo MIME correcto
            const mimeType = blob.type || "image/jpeg";
            trio[key] = new File([blob], `${key}_${i}.jpg`, { type: mimeType });
            trioHasPhotos = true;
            loadedPhotos++;
          } catch (error) {
            console.warn(
              `Error cargando ${key} desde caché en índice ${i}:`,
              error
            );
            // Continuar con las otras fotos aunque una falle
          }
        }
      }

      fotosMem.push(trio);
    }

    console.log(
      `Cargadas ${loadedPhotos} fotos desde caché en ${fotosMem.length} registros`
    );

    // Re-renderizar para mostrar las fotos
    renderRegistros();
  } catch (error) {
    console.error("Error crítico cargando fotos desde caché:", error);
    // Limpiar caché problemático
    localStorage.removeItem(PHOTOS_CACHE_KEY);
  }
}

function clearPhotosCache() {
  try {
    localStorage.removeItem(PHOTOS_CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    console.log("Caché de fotos limpiado exitosamente");
  } catch (error) {
    console.error("Error limpiando caché de fotos:", error);
  }
}

// ====== FUNCIONES DE DEBUGGING PARA CACHÉ ======
function getCacheInfo() {
  const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
  const photosCacheRaw = localStorage.getItem(PHOTOS_CACHE_KEY);

  const info = {
    hasTimestamp: !!timestamp,
    timestamp: timestamp
      ? new Date(parseInt(timestamp)).toLocaleString("es-ES")
      : null,
    hasPhotosCache: !!photosCacheRaw,
    photosCacheSize: photosCacheRaw ? photosCacheRaw.length : 0,
    fotosMemLength: fotosMem.length,
    registrosLength: registros.length,
  };

  if (photosCacheRaw) {
    try {
      const photosCache = JSON.parse(photosCacheRaw);
      info.photosCacheEntries = Array.isArray(photosCache)
        ? photosCache.length
        : 0;
      info.isValidPhotosCache = Array.isArray(photosCache);
    } catch (error) {
      info.photosCacheParseError = error.message;
    }
  }

  console.log("=== INFORMACIÓN DE CACHÉ ===", info);
  return info;
}

function validateCacheIntegrity() {
  console.log("=== VALIDACIÓN DE INTEGRIDAD DE CACHÉ ===");

  const issues = [];

  // Verificar que fotosMem y registros tengan la misma longitud
  if (fotosMem.length !== registros.length) {
    issues.push(
      `Mismatch de longitud: fotosMem(${fotosMem.length}) vs registros(${registros.length})`
    );
  }

  // Verificar que cada entrada en fotosMem tenga al menos un archivo válido
  fotosMem.forEach((trio, index) => {
    if (!trio || typeof trio !== "object") {
      issues.push(`Entrada ${index}: trio inválido`);
      return;
    }

    const hasValidFile = ["f1", "f2", "f3"].some(
      (key) => trio[key] && trio[key] instanceof File
    );

    if (!hasValidFile) {
      issues.push(`Entrada ${index}: no tiene archivos válidos`);
    }
  });

  if (issues.length === 0) {
    console.log("✅ Caché de fotos está íntegro");
  } else {
    console.warn("❌ Problemas encontrados en caché:", issues);
  }

  return issues;
}

// ====== EXPONER FUNCIONES DE DEBUGGING EN CONSOLA ======
// Hacer disponibles las funciones de debugging en la consola del navegador
window.debugCache = {
  getInfo: getCacheInfo,
  validateIntegrity: validateCacheIntegrity,
  clearCache: clearPhotosCache,
  saveCache: savePhotosCache,
  loadCache: loadPhotosCache,
  showInfo: showCacheInfo,
};

// ====== INDICADOR DE CACHÉ ======
function showCacheIndicator() {
  let indicator = document.getElementById("cacheIndicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "cacheIndicator";
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #4CAF50;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      display: none;
    `;
    indicator.innerHTML = "💾 Datos guardados automáticamente";
    document.body.appendChild(indicator);
  }

  indicator.style.display = "block";
  setTimeout(() => {
    if (indicator) indicator.style.display = "none";
  }, 3000);
}

// ===== Auto-guardado encabezado y antes de salir =====
["fechaHora", "turno", "operador", "funcionario"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", saveDraft);
  document.getElementById(id)?.addEventListener("change", saveDraft);
});
window.addEventListener("beforeunload", saveDraft);

// ===== Auto-guardado cada 30 segundos =====
setInterval(() => {
  if (registros.length > 0 || fotosMem.length > 0) {
    saveDraft();
  }
}, 30000);

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
  const box = ensurePreviewBox(
    inputEl,
    `prev-${inputEl.id || inputEl.name || "file"}`
  );
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
      if (img) {
        img.src = "";
        img.style.display = "none";
      }
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
            <input type="text" name="ean" value="${
              r.ean
            }" inputmode="numeric" maxlength="13" required />
            <small class="hint">Debe tener 13 dígitos.</small>
          </div>
          <div class="field">
            <label>🏷️ Descripción</label>
            <input type="text" name="descripcion" value="${
              r.descripcion || ""
            }" />
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
              ]
                .map(
                  (c) =>
                    `<option ${c === r.causal ? "selected" : ""}>${c}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label>📍 Procedencia *</label>
            <div class="radio-row">
              <label><input type="radio" name="proc" value="MQ Santo Domingo" ${
                r.procedencia === "MQ Santo Domingo" ? "checked" : ""
              }/> MQ Santo Domingo</label>
              <label><input type="radio" name="proc" value="3PD Santo Domingo" ${
                r.procedencia === "3PD Santo Domingo" ? "checked" : ""
              }/> 3PD Santo Domingo</label>
            </div>
          </div>
          <div class="field">
            <label>🔢 Cantidad *</label>
            <input type="number" name="cantidad" min="1" value="${
              r.cantidad
            }" required />
          </div>
          <div class="field">
            <label>📦 Unidad *</label>
            <div class="radio-row">
              ${["Unidad", "Docena", "Six", "Bag / Bolsa"]
                .map(
                  (u) =>
                    `<label><input type="radio" name="unidad" value="${u}" ${
                      u === r.unidad ? "checked" : ""
                    }/> ${u}</label>`
                )
                .join("")}
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
let EAN_COD_DB = [];

// Cargar base de datos de EAN para descripciones
fetch("ean_db.json")
  .then((r) => r.json())
  .then((db) => {
    EAN_DB = db || [];
  })
  .catch(() => {});

// Cargar base de datos de EAN para códigos
fetch("ean-cod.json")
  .then((r) => r.json())
  .then((db) => {
    EAN_COD_DB = db || [];
  })
  .catch(() => {});

// Función para buscar código por EAN
function buscarCodigoPorEAN(ean) {
  const eanLimpio = ean.replace(/\D/g, "");
  const encontrado = EAN_COD_DB.find((item) => {
    const itemEan = String(item.ean || "");
    return itemEan.replace(/\D/g, "") === eanLimpio;
  });
  return encontrado ? encontrado.codigo : null;
}

$("#ean")?.addEventListener("input", () => {
  const ean = $("#ean").value.trim().replace(/\D/g, "");
  if (ean.length === 13) {
    const found = EAN_DB.find((x) => {
      const xEan = String(x.ean || "");
      return xEan.replace(/\D/g, "") === ean;
    });
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
    proc:
      (Array.from($$("input[name='proc']")).find((r) => r.checked) || {})
        .value || "",
    cantidad: $("#cantidad")?.value ?? "",
    unidad:
      (Array.from($$("input[name='unidad']")).find((r) => r.checked) || {})
        .value || "",
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
    if (d.proc)
      $$("input[name='proc']").forEach((r) => (r.checked = r.value === d.proc));
    if (d.cantidad != null) $("#cantidad").value = d.cantidad;
    if (d.unidad)
      $$("input[name='unidad']").forEach(
        (r) => (r.checked = r.value === d.unidad)
      );
  } catch {}
}

function clearItemDraft() {
  localStorage.removeItem(ITEM_DRAFT_KEY);
}

// Autoguardado mientras escribes
["ean", "descripcion", "fv", "lote", "causal", "cantidad"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("input", saveItemDraft);
    el.addEventListener("change", saveItemDraft);
  }
});
$$("input[name='proc']").forEach((r) =>
  r.addEventListener("change", saveItemDraft)
);
$$("input[name='unidad']").forEach((r) =>
  r.addEventListener("change", saveItemDraft)
);

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

  const found = EAN_DB.find((x) => {
    const xEan = String(x.ean || "");
    return xEan.replace(/\D/g, "") === ean;
  });
  const descripcion =
    $("#descripcion").value || (found ? found.descripcion : "");

  // Buscar código correspondiente al EAN
  const codigo = buscarCodigoPorEAN(ean);

  registros.push({
    ean,
    descripcion,
    fv,
    lote, // limpio
    causal,
    procedencia,
    cantidad,
    unidad,
    codigo, // Agregar código encontrado
  });
  fotosMem.push({ f1, f2, f3 });

  renderRegistros();
  sumTotal();
  saveDraft();
  clearItemDraft();

  $("#itemForm").reset();
  clearFormPreviews(); // 👈 limpia previews del formulario
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
    const unidad =
      form.querySelector('input[name="unidad"]:checked')?.value || "";
    const procedencia =
      form.querySelector('input[name="proc"]:checked')?.value || "";
    const descripcion = form.descripcion.value.trim();

    if (!/^\d{13}$/.test(ean)) return toast("El EAN debe tener 13 dígitos.");
    if (!fv) return toast("Ingresa la fecha de vencimiento.");
    if (!/^[A-Za-z0-9\s:.\-]{2,}$/i.test(lote))
      return toast("Formato de lote no válido. Ej: L127 23:33 DD AM");
    if (!causal) return toast("Selecciona una causal.");
    if (!procedencia) return toast("Selecciona procedencia.");
    if (cantidad <= 0) return toast("Ingresa una cantidad válida.");
    if (!unidad) return toast("Selecciona la unidad.");

    // Buscar código correspondiente al EAN
    const codigo = buscarCodigoPorEAN(ean);

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
      codigo, // Agregar código encontrado
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

    const response = await fetch(FOTOS_APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const resultado = await response.json();
    return resultado.downloadUrl;
  } catch (error) {
    console.error(`Error subiendo foto:`, error);
    return { success: false, error: error.message };
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
      return toast(
        "Completa los datos del encabezado:\n- " + faltan.join("\n- ")
      );
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
        "Faltan evidencias en los registros: #" +
          faltanFotos.join(", ") +
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
        codigo: r.codigo, // Incluir código encontrado
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
    clearPhotosCache();
    registros = [];
    fotosMem = [];

    window.location.href = "confirmacion.html";
  } catch (err) {
    console.error(err);
    showLoading(false);
    alert("No se pudo enviar el reporte:\n" + (err.message || err));
  }
});

// ====== INFORMACIÓN DE CACHÉ ======
function showCacheInfo() {
  const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
  if (!timestamp) return;

  const date = new Date(parseInt(timestamp));
  const timeStr = date.toLocaleString("es-ES");

  let info = document.getElementById("cacheInfo");
  if (!info) {
    info = document.createElement("div");
    info.id = "cacheInfo";
    info.style.cssText = `
      background: #e3f2fd;
      border: 1px solid #2196f3;
      border-radius: 4px;
      padding: 8px 12px;
      margin: 10px 0;
      font-size: 12px;
      color: #1976d2;
    `;
    document
      .querySelector(".container")
      .insertBefore(info, document.querySelector(".section-title"));
  }

  info.innerHTML = `💾 Última vez guardado: ${timeStr}`;
}

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

  // Sincronizar fotosMem con registros si hay desfase
  if (registros.length && fotosMem.length < registros.length) {
    console.log(
      `Sincronizando fotosMem: ${fotosMem.length} -> ${registros.length}`
    );
    fotosMem = Array.from(
      { length: registros.length },
      (_, i) => fotosMem[i] || {}
    );
  }

  initLoteMask(); // máscara del campo Lote
  loadItemDraft(); // restaura borrador del ítem
  setupFormFilePreviews(); // 👈 activa previews en el formulario principal

  // Mostrar información de caché si existe
  showCacheInfo();

  // Validar integridad del caché después de cargar todo
  setTimeout(() => {
    validateCacheIntegrity();
    getCacheInfo();
  }, 1000);
});

// ====== MÁSCARA VISUAL SOLO PARA #lote ======
// Template: L___ __:__ __ __
function initLoteMask(reset = false) {
  const input = document.getElementById("lote");
  if (!input) return;

  const TEMPLATE = "L___ __:__ __ __";
  const SCHEMA = [
    "L",
    "#",
    "#",
    "#",
    " ",
    "#",
    "#",
    ":",
    "#",
    "#",
    " ",
    "A",
    "A",
    " ",
    "A",
    "A",
  ]; // #=digito, A=letra

  function buildMasked(raw) {
    let chars = (raw || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .split("");
    if (chars[0] === "L") chars.shift();

    let out = "";
    for (const slot of SCHEMA) {
      if (slot === "L") {
        out += "L";
        continue;
      }
      if (slot === " " || slot === ":") {
        out += slot;
        continue;
      }
      let placed = "_";
      while (chars.length) {
        const c = chars.shift();
        if (slot === "#" && /\d/.test(c)) {
          placed = c;
          break;
        }
        if (slot === "A" && /[A-Z]/.test(c)) {
          placed = c;
          break;
        }
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
    requestAnimationFrame(() =>
      input.setSelectionRange(input.value.length, input.value.length)
    );
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
