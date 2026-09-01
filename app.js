const state = { resources: [], filtered: [], visible: 9, current: null, currentAccessUrl: "", secureBackend: false, relatedEdaId: null };
const palette = ["#DDEefc", "#1BC0CB", "#AB8FF6", "#E284B5", "#CDDE20", "#69B7F1"];
const $ = (selector) => document.querySelector(selector);
const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const initials = (title) => title.split(/\s+/).filter((word) => word.length > 3).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "EDA";
const unique = (key) => [...new Set(state.resources.map((item) => item[key]).filter(Boolean))].sort((a,b) => a.localeCompare(b, "es"));
const isExternalWebsite = (resource) => {
  const classification = normalize(`${resource.category || ""} ${resource.type || ""}`);
  if (!classification.includes("sitio web")) return false;
  try {
    const hostname = new URL(resource.url).hostname.toLowerCase();
    return hostname !== "eda.tec.mx" && !hostname.endsWith(".eda.tec.mx");
  } catch {
    return false;
  }
};
const setTypeChip = (chip, resource) => {
  const externalWebsite = isExternalWebsite(resource);
  chip.textContent = externalWebsite ? "Sitio Web" : resource.type;
  chip.classList.toggle("chip-external", externalWebsite);
  if (externalWebsite) chip.title = "Sitio externo disponible para abrir";
  else chip.removeAttribute("title");
};
const academicFields = [
  ["competencies", "Competencias"],
  ["keywords", "Palabras clave"],
  ["language", "Idioma"],
  ["cognitiveProcess", "Proceso cognitivo"],
  ["resourceRole", "Función en la experiencia"],
];
const accessState = (resource) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (resource.viewerMode === "gallery") return { available: true, pending: true, label: "Vista previa protegida", detail: "Este recurso utiliza una galería independiente para no cargar ni exponer su liga restringida de SharePoint." };
  if (resource.viewerMode === "review") return { available: false, pending: true, label: "Compatibilidad en revisión", detail: `La vista previa de ${resource.platform || "esta plataforma"} se habilitará después de verificar su compatibilidad con el visor.` };
  if (resource.viewerMode === "disabled") return { available: false, label: "Recurso deshabilitado", detail: "La publicación de esta experiencia está deshabilitada temporalmente." };
  if (resource.validFrom && today < resource.validFrom) return { available: false, label: "Próxima publicación", detail: `Disponible a partir del ${resource.validFrom}.` };
  if (resource.validUntil && today > resource.validUntil) return { available: false, label: "Publicación concluida", detail: `La publicación del recurso terminó el ${resource.validUntil}.` };
  if (resource.requiresAuthorization) return { available: true, label: "Autorización pendiente de backend", detail: "En este prototipo el acceso es directo. En producción deberá validarse una sesión o token antes de entregar el recurso." };
  return { available: true, label: "Disponible para exploración", detail: "El catálogo entrega una dirección temporal para consultar el recurso sin publicar su URL de origen." };
};

async function init() {
  let data = window.EDA_CATALOG;
  if (location.protocol !== "file:" && !window.EDA_STATIC_MODE) {
    try {
      const response = await fetch("/api/catalog");
      if (!response.ok) throw new Error("Backend no disponible");
      data = await response.json();
      state.secureBackend = true;
    } catch {
      state.secureBackend = false;
    }
  }
  if (!data) throw new Error("No fue posible cargar los datos del catálogo");
  state.resources = data.resources;
  state.filtered = [...state.resources];
  fillSelect($("#categoryFilter"), unique("category"));
  fillSelect($("#typeFilter"), unique("type"));
  fillSelect($("#disciplineFilter"), unique("discipline"));
  fillSelect($("#schoolFilter"), unique("school"));
  render();
}

function fillSelect(select, values) { values.forEach((value) => select.add(new Option(value, value))); }

function render() {
  const grid = $("#catalogGrid");
  grid.replaceChildren();
  state.filtered.slice(0, state.visible).forEach((resource, index) => {
    const card = $("#cardTemplate").content.firstElementChild.cloneNode(true);
    const accent = palette[(state.resources.indexOf(resource) + index) % palette.length];
    card.style.setProperty("--card-accent", accent);
    card.querySelector(".resource-monogram").textContent = initials(resource.title);
    if (resource.thumbnail) {
      const thumbnail = card.querySelector(".resource-thumbnail");
      thumbnail.src = resource.thumbnail;
      thumbnail.alt = `Vista previa de ${resource.title}`;
      card.querySelector(".card-visual").classList.add("has-thumbnail");
      thumbnail.addEventListener("error", () => card.querySelector(".card-visual").classList.remove("has-thumbnail"), { once: true });
    }
    setTypeChip(card.querySelector(".resource-type"), resource);
    card.querySelector(".resource-discipline").textContent = resource.discipline;
    const groupChip = card.querySelector(".resource-group");
    if (resource.relatedResourceCount > 1) {
      groupChip.textContent = `${resource.relatedResourceCount} relacionados`;
      groupChip.classList.remove("hidden");
    }
    card.querySelector(".resource-title").textContent = resource.title;
    card.querySelector(".resource-course").textContent = resource.course;
    card.querySelector(".resource-school").textContent = resource.school;
    card.querySelector(".open-resource").addEventListener("click", () => openDetail(resource));
    card.addEventListener("dblclick", () => openDetail(resource));
    grid.append(card);
  });
  $("#resultCount").textContent = `${state.filtered.length} ${state.filtered.length === 1 ? "recurso encontrado" : "recursos encontrados"}`;
  $("#emptyState").classList.toggle("hidden", state.filtered.length !== 0);
  $("#loadMore").classList.toggle("hidden", state.visible >= state.filtered.length || !state.filtered.length);
}

function openDetail(resource, updateHash = true) {
  state.current = resource;
  const accent = palette[state.resources.indexOf(resource) % palette.length];
  $("#detailDialog").style.setProperty("--detail-accent", accent);
  $("#detailMonogram").textContent = initials(resource.title);
  const detailHero = $("#detailThumbnail").closest(".detail-hero");
  detailHero.classList.toggle("has-thumbnail", Boolean(resource.thumbnail));
  $("#detailThumbnail").src = resource.thumbnail || "";
  $("#detailThumbnail").alt = resource.thumbnail ? `Vista previa de ${resource.title}` : "";
  $("#detailThumbnail").onerror = () => detailHero.classList.remove("has-thumbnail");
  setTypeChip($("#detailType"), resource);
  $("#detailDiscipline").textContent = resource.discipline;
  $("#detailTitle").textContent = resource.title;
  $("#detailIntro").textContent = resource.description || `Experiencia digital vinculada con ${resource.course}. Este recurso utiliza el formato ${resource.type.toLowerCase()} para apoyar una participación activa y contextualizada.`;
  $("#detailCourse").textContent = resource.course;
  $("#detailModality").textContent = resource.format || resource.modality;
  $("#detailSchool").textContent = resource.school;
  $("#detailAnalytics").textContent = Number.isFinite(resource.sourceViews) ? resource.sourceViews.toLocaleString("es-MX") : "No especificadas";
  $("#detailPlatform").textContent = resource.platform || "No especificada";
  $("#detailGroup").textContent = resource.relatedResourceCount > 1 ? `${resource.relatedResourceCount} recursos vinculados a la EDA ${resource.edaId}` : `Recurso único de la EDA ${resource.edaId}`;
  $("#viewRelated").classList.toggle("hidden", resource.relatedResourceCount <= 1);
  $("#viewRelated").textContent = resource.relatedResourceCount > 1 ? `Ver ${resource.relatedResourceCount} recursos relacionados` : "Ver recursos relacionados";
  const availableAcademicFields = academicFields.filter(([key]) => resource[key]);
  $("#academicSection").classList.toggle("hidden", availableAcademicFields.length === 0);
  $("#detailAcademicData").replaceChildren(...availableAcademicFields.map(([key, label]) => {
    const item = document.createElement("article");
    const heading = document.createElement("strong");
    const content = document.createElement("p");
    heading.textContent = label;
    content.textContent = resource[key];
    item.append(heading, content);
    return item;
  }));
  const access = accessState(resource);
  $("#detailLaunchStatus").textContent = "";
  $("#launchResource").disabled = !access.available;
  $("#launchResource span").textContent = resource.viewerMode === "gallery" ? "Ver galería" : resource.viewerMode === "review" ? "Vista previa en revisión" : resource.viewerMode === "external" ? "Abrir experiencia" : "Explorar experiencia";
  $("#detailDialog").classList.add("is-open");
  $("#detailDialog").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  if (updateHash) history.replaceState(null, "", `#eda=${encodeURIComponent(resource.id)}`);
  setTimeout(() => $("#detailDialog [data-close-detail]")?.focus(), 50);
}

function closeDetail(clearHash = true) {
  $("#detailDialog").classList.remove("is-open");
  $("#detailDialog").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (clearHash && location.hash.startsWith("#eda=")) history.replaceState(null, "", `${location.pathname}${location.search}`);
}

function applyFilters() {
  const query = normalize($("#searchInput").value.trim());
  const category = $("#categoryFilter").value;
  const type = $("#typeFilter").value;
  const discipline = $("#disciplineFilter").value;
  const school = $("#schoolFilter").value;
  state.filtered = state.resources.filter((resource) => {
    const haystack = normalize([resource.title, resource.course, resource.type, resource.category, resource.discipline, resource.school, resource.code, resource.keywords, resource.competencies, resource.edaId].join(" "));
    return (!state.relatedEdaId || resource.edaId === state.relatedEdaId) && (!query || haystack.includes(query)) && (!category || resource.category === category) && (!type || resource.type === type) && (!discipline || resource.discipline === discipline) && (!school || resource.school === school);
  });
  state.visible = 9;
  render();
}

async function getAccessUrl(resource) {
  if (!state.secureBackend) return resource.url;
  const grant = new URLSearchParams(location.search).get("grant");
  const headers = { "Content-Type": "application/json" };
  if (grant) headers["X-EDA-Grant"] = grant;
  const response = await fetch(`/api/access/${encodeURIComponent(resource.id)}`, { method: "POST", headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No fue posible autorizar el recurso");
  return data.accessUrl;
}

async function openViewer(resource) {
  const access = accessState(resource);
  if (!access.available) return;
  if (resource.viewerMode === "gallery") {
    closeDetail(false);
    state.current = resource;
    state.currentAccessUrl = "";
    $("#viewerTitle").textContent = resource.title;
    $("#viewerMeta").textContent = `${resource.type} · Galería de vista previa`;
    $("#viewerNotice").textContent = "Esta galería es independiente del archivo original protegido en SharePoint.";
    $("#viewerLoading").classList.add("is-hidden");
    $("#resourceFrame").classList.add("hidden");
    $("#resourceFrame").src = "about:blank";
    $("#resourceGallery").classList.remove("hidden");
    $("#openExternal").classList.add("hidden");
    renderGallery(resource);
    $("#viewer").classList.add("is-open");
    $("#viewer").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => $("#viewer [data-close-viewer]:last-of-type")?.focus(), 50);
    return;
  }
  const launchButton = $("#launchResource");
  launchButton.disabled = true;
  launchButton.querySelector("span").textContent = "Autorizando…";
  let accessUrl;
  try {
    accessUrl = await getAccessUrl(resource);
  } catch (error) {
    launchButton.disabled = false;
    launchButton.querySelector("span").textContent = "Intentar de nuevo";
    $("#detailLaunchStatus").textContent = `No fue posible abrir el recurso: ${error.message}`;
    return;
  }
  launchButton.disabled = false;
  launchButton.querySelector("span").textContent = resource.viewerMode === "external" ? "Abrir experiencia" : "Explorar experiencia";
  state.currentAccessUrl = accessUrl;
  if (resource.viewerMode === "external") {
    window.open(accessUrl, "_blank", "noopener,noreferrer");
    return;
  }
  closeDetail(false);
  state.current = resource;
  $("#resourceGallery").classList.add("hidden");
  $("#resourceFrame").classList.remove("hidden");
  $("#viewerTitle").textContent = resource.title;
  $("#viewerMeta").textContent = `${resource.type} · ${resource.course}`;
  $("#viewerLoading").classList.remove("is-hidden");
  $("#resourceFrame").src = accessUrl;
  $("#openExternal").classList.toggle("hidden", resource.externalAccess !== "enabled");
  $("#viewerNotice").textContent = state.secureBackend
    ? "Acceso entregado mediante un token temporal validado por el servidor."
    : resource.requiresAuthorization
      ? "Modo estático de prototipo: abre el puerto 4180 para probar el acceso mediante token."
      : "Recurso de demostración disponible en este entorno local.";
  $("#viewer").classList.add("is-open");
  $("#viewer").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#viewer [data-close-viewer]:last-of-type")?.focus(), 50);
}

function renderGallery(resource) {
  const assets = Array.isArray(resource.previewAssets) ? resource.previewAssets.filter(Boolean) : [];
  const empty = $("#galleryEmpty");
  const content = $("#galleryContent");
  const main = $("#galleryMainImage");
  const thumbs = $("#galleryThumbs");
  empty.classList.toggle("hidden", assets.length > 0);
  content.classList.toggle("hidden", assets.length === 0);
  thumbs.replaceChildren();
  if (!assets.length) {
    main.removeAttribute("src");
    main.alt = "";
    return;
  }
  const selectImage = (asset, button) => {
    main.src = typeof asset === "string" ? asset : asset.src;
    main.alt = typeof asset === "string" ? `Vista previa de ${resource.title}` : asset.alt || `Vista previa de ${resource.title}`;
    thumbs.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
  };
  assets.forEach((asset, index) => {
    const src = typeof asset === "string" ? asset : asset.src;
    const button = document.createElement("button");
    const image = document.createElement("img");
    button.type = "button";
    button.setAttribute("aria-label", `Mostrar imagen ${index + 1}`);
    image.src = src;
    image.alt = "";
    button.append(image);
    button.addEventListener("click", () => selectImage(asset, button));
    thumbs.append(button);
    if (index === 0) selectImage(asset, button);
  });
}

function closeViewer() {
  $("#viewer").classList.remove("is-open");
  $("#viewer").setAttribute("aria-hidden", "true");
  $("#resourceFrame").src = "about:blank";
  $("#resourceFrame").classList.remove("hidden");
  $("#resourceGallery").classList.add("hidden");
  document.body.style.overflow = "";
  state.current = null;
  state.currentAccessUrl = "";
  if (location.hash.startsWith("#eda=")) history.replaceState(null, "", `${location.pathname}${location.search}`);
}

$("#searchInput").addEventListener("input", () => { state.relatedEdaId = null; applyFilters(); });
$("#categoryFilter").addEventListener("change", applyFilters);
$("#typeFilter").addEventListener("change", applyFilters);
$("#disciplineFilter").addEventListener("change", applyFilters);
$("#schoolFilter").addEventListener("change", applyFilters);
$("#clearFilters").addEventListener("click", () => { state.relatedEdaId = null; $("#searchInput").value = ""; $("#categoryFilter").value = ""; $("#typeFilter").value = ""; $("#disciplineFilter").value = ""; $("#schoolFilter").value = ""; applyFilters(); });
$("#loadMore").addEventListener("click", () => { state.visible += 9; render(); });
$("#resourceFrame").addEventListener("load", () => $("#viewerLoading").classList.add("is-hidden"));
document.querySelectorAll("[data-close-viewer]").forEach((button) => button.addEventListener("click", closeViewer));
document.querySelectorAll("[data-close-detail]").forEach((button) => button.addEventListener("click", () => closeDetail()));
$("#launchResource").addEventListener("click", () => state.current && openViewer(state.current));
$("#viewRelated").addEventListener("click", () => {
  if (!state.current?.edaId) return;
  const edaId = state.current.edaId;
  closeDetail();
  state.relatedEdaId = edaId;
  $("#searchInput").value = `EDA-${edaId}`;
  $("#categoryFilter").value = "";
  $("#typeFilter").value = "";
  $("#disciplineFilter").value = "";
  $("#schoolFilter").value = "";
  applyFilters();
  $("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#requestResource").addEventListener("click", () => {
  if (!state.current) return;
  const resource = state.current;
  closeDetail(false);
  $("#requestResourceId").value = resource.id;
  $("#requestResourceName").textContent = resource.title;
  $("#requestDialog").classList.add("is-open");
  $("#requestDialog").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#accessRequestForm input:not([type=hidden])")?.focus(), 50);
});
function closeRequest() { $("#requestDialog").classList.remove("is-open"); $("#requestDialog").setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
document.querySelectorAll("[data-close-request]").forEach((button) => button.addEventListener("click", closeRequest));
$("#accessRequestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const resourceId = $("#requestResourceId").value;
  const status = $("#requestFormStatus");
  if (!state.secureBackend) { status.textContent = "La solicitud de uso estará disponible en la versión conectada al servidor."; return; }
  const body = Object.fromEntries(new FormData(form));
  status.textContent = "Enviando solicitud…";
  try {
    const response = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    status.textContent = `Solicitud ${result.id} registrada. El administrador deberá revisarla.`;
    form.reset();
    syncIndefiniteValidity();
    $("#requestResourceId").value = resourceId;
  } catch (error) { status.textContent = error.message || "No fue posible enviar la solicitud."; }
});
$("#openExternal").addEventListener("click", () => state.currentAccessUrl && window.open(state.currentAccessUrl, "_blank", "noopener,noreferrer"));
$("#menuButton").addEventListener("click", () => { const menu = $("#mobileMenu"); menu.classList.toggle("hidden"); $("#menuButton").setAttribute("aria-expanded", String(!menu.classList.contains("hidden"))); });
$("#mobileMenu").addEventListener("click", () => $("#mobileMenu").classList.add("hidden"));
document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#searchInput").focus(); } if (event.key === "Escape") { if ($("#requestDialog").classList.contains("is-open")) closeRequest(); else if ($("#viewer").classList.contains("is-open")) closeViewer(); else closeDetail(); } });

init().then(async () => {
  if (location.hash.startsWith("#eda=")) {
    const id = decodeURIComponent(location.hash.slice(5));
    const resource = state.resources.find((item) => item.id === id);
    if (resource) {
      const hasGrant = new URLSearchParams(location.search).has("grant");
      if (hasGrant && state.secureBackend) await openViewer(resource);
      else openDetail(resource, false);
    }
  }
}).catch((error) => { $("#resultCount").textContent = error.message; $("#emptyState").classList.remove("hidden"); });
