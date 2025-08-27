// ================== CONFIG ==================
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbw2J76HmM9sT9i-IH4IVPgzw782oUM9lP5q4KM_0_0oyryhhjIrX0T-KK2H6vHOQtob/exec";
const FOTOS_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxFTKwAQCOl8Zu3i5fjL3otvHoNXpA9UxKBOp1DJNHtoOqeKrO03bYAHUvf2QvlxSeb/exec";

// ================== STATE ==================
let registros = JSON.parse(localStorage.getItem("registros")) || [];

// ================== HELPERS ==================
function uuid() {
  return "xxxx-4xxx-yxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function guardarLocal() {
  localStorage.setItem("registros", JSON.stringify(registros));
}

// ================== RENDER ==================
function renderRegistros() {
  const list = document.getElementById("registrosList");
  list.innerHTML = "";

  registros.forEach((r, idx) => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <p><b>${r.descripcion || ""}</b> (${r.ean || ""})</p>
      <p><b>Código:</b> ${r.codigo || ""}</p>
      <p><b>FV:</b> ${r.fv || ""} | <b>Lote:</b> ${r.lote || ""}</p>
      <p><b>Causal:</b> ${r.causal || ""} | <b>Proc:</b> ${r.procedencia || ""}</p>
      <p><b>Cant:</b> ${r.cantidad || 0} ${r.unidad || ""}</p>
      <div class="fotos">
        ${r.foto1 ? `<img src="${r.foto1}" />` : ""}
        ${r.foto2 ? `<img src="${r.foto2}" />` : ""}
        ${r.foto3 ? `<img src="${r.foto3}" />` : ""}
      </div>
      <button onclick="deleteRegistro(${idx})">🗑 Eliminar</button>
    `;

    list.appendChild(card);
  });

  // actualizar total
  const total = registros.reduce((sum, r) => sum + (parseInt(r.cantidad) || 0), 0);
  document.getElementById("totalUnidades").textContent = total;

  guardarLocal();
}

function deleteRegistro(idx) {
  registros.splice(idx, 1);
  renderRegistros();
}

// ================== FOTO CAPTURE ==================
function capturarFoto(inputId, imgId) {
  const input = document.getElementById(inputId);
  const img = document.getElementById(imgId);

  input.addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      img.style.display = "block";
      img.dataset.dataurl = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// inicializar capturas
capturarFoto("foto1Input", "foto1Preview");
capturarFoto("foto2Input", "foto2Preview");
capturarFoto("foto3Input", "foto3Preview");

// ================== FORM SUBMIT ==================
document.getElementById("formRegistro").addEventListener("submit", (e) => {
  e.preventDefault();

  const r = {
    ean: document.getElementById("ean").value,
    descripcion: document.getElementById("descripcion").value,
    codigo: document.getElementById("codigo").value,
    fv: document.getElementById("fv").value,
    lote: document.getElementById("lote").value,
    causal: document.getElementById("causal").value,
    procedencia: document.getElementById("procedencia").value,
    cantidad: document.getElementById("cantidad").value,
    unidad: document.getElementById("unidad").value,
    foto1: document.getElementById("foto1Preview").dataset.dataurl || "",
    foto2: document.getElementById("foto2Preview").dataset.dataurl || "",
    foto3: document.getElementById("foto3Preview").dataset.dataurl || "",
  };

  registros.push(r);
  renderRegistros();

  e.target.reset();
  document.querySelectorAll("img.preview").forEach((img) => {
    img.style.display = "none";
    img.src = "";
    delete img.dataset.dataurl;
  });
});

// ================== ENVIAR A GOOGLE SHEETS ==================
async function enviarDatos() {
  if (registros.length === 0) {
    alert("No hay registros para enviar.");
    return;
  }

  const payload = {
    fechaHora: new Date().toISOString(),
    turno: document.getElementById("turno").value,
    operador: document.getElementById("operador").value,
    funcionario: document.getElementById("funcionario").value,
    linea: document.getElementById("linea").value,
    registros: registros,
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();

    if (data.ok) {
      alert("✅ Registros enviados correctamente");
      registros = [];
      guardarLocal();
      renderRegistros();
    } else {
      alert("❌ Error en servidor: " + data.error);
    }
  } catch (err) {
    alert("❌ Error de red: " + err.message);
  }
}

// ================== INIT ==================
document.getElementById("btnEnviar").addEventListener("click", enviarDatos);

// render inicial
renderRegistros();
