// ====== CONFIG ======
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbw2J76HmM9sT9i-IH4IVPgzw782oUM9lP5q4KM_0_0oyryhhjIrX0T-KK2H6vHOQtob/exec";
const FOTOS_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxFTKwAQCOl8Zu3i5fjL3otvHoNXpA9UxKBOp1DJNHtoOqeKrO03bYAHUvf2QvlxSeb/exec";

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

// ===== Auto-guardado encabezado =====
["fechaHora", "turno", "operador", "funcionario"].forEach((id) => {
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
function setupFormFilePreviews() {
  ["foto1", "foto2", "foto3"].forEach((id, idx) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const preview = document.getElementById("preview" + (idx + 1));
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          preview.innerHTML = `<img src="${reader.result}" class="h-20">`;
        };
        reader.readAsDataURL(file);
      } else {
        preview.innerHTML = "";
      }
    });
  });
}

function renderRegistros() {
  const container = document.getElementById("registrosContainer");
  if (!container) return;
  container.innerHTML = registros
    .map(
      (r, i) => `
      <div>
        <b>${r.lote}</b> - ${r.ean} - Cant: ${r.cantidad}
      </div>
    `
    )
    .join("");
}

/* ========= SUBMIT ========= */
$("#mainForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  showLoading(true);

  try {
    const header = {
      fechaHora: $("#fechaHora").value,
      turno: $("#turno").value,
      operador: $("#operador").value,
      funcionario: $("#funcionario").value,
    };

    const payload = { header, registros };
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    // Subir fotos si existen
    const fotos = ["foto1", "foto2", "foto3"];
    for (let i = 0; i < fotos.length; i++) {
      const input = document.getElementById(fotos[i]);
      if (input?.files[0]) {
        const b64 = await toBase64(input.files[0]);
        await fetch(FOTOS_APPS_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({ foto: b64, index: i }),
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    toast("Reporte enviado correctamente ✅");
    registros = [];
    fotosMem = [];
    localStorage.removeItem(FORM_DRAFT_KEY);
    localStorage.removeItem(ITEM_DRAFT_KEY);
    $("#mainForm").reset();
    renderRegistros();
    sumTotal();
  } catch (err) {
    console.error(err);
    toast("Error al enviar el reporte ❌");
  } finally {
    showLoading(false);
  }
});

// ====== On Load ======
document.addEventListener("DOMContentLoaded", () => {
  // ✅ Siempre fijar fecha/hora actual al abrir
  const fh = document.getElementById("fechaHora");
  if (fh) {
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

  initLoteMask();      // máscara del campo Lote
  setupFormFilePreviews(); // activa previews en el formulario principal
});

// ====== MÁSCARA VISUAL SOLO PARA #lote ======
function initLoteMask() {
  const input = document.getElementById("lote");
  if (!input) return;

  input.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 0) v = v.substring(0, 2) + (v.length > 2 ? "/" : "") + v.substring(2);
    if (v.length > 5) v = v.substring(0, 5) + (v.length > 5 ? "/" : "") + v.substring(5, 9);
    e.target.value = v.substring(0, 10);
  });
}
