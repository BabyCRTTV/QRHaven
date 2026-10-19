import QRCode from "qrcode";
import "./style.css";

const el = id => document.getElementById(id);
const form = el("create-form");
const apiOrigin = (import.meta.env.VITE_API_ORIGIN || "").replace(/\/$/, "");
const isGithubPages = location.hostname.endsWith(".github.io");
const result = el("result-panel");
const empty = el("empty-panel");
const manager = el("manager-panel");
const creator = el("creator-panel");
const notice = el("notice");

let created = null;
let manageSession = null;

function alertUser(message, error = false) {
  notice.hidden = false;
  notice.classList.toggle("error", error);
  notice.textContent = message;
}
function clearNotice() { notice.hidden = true; }
function safeUrl(text) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : "https://" + trimmed;
}
async function requestApi(path, options = {}) {
  if (isGithubPages && !apiOrigin) {
    throw new Error("QRHaven needs the Cloudflare redirect service to be connected first.");
  }
  const response = await fetch(apiOrigin + path, options);
  let data;
  try { data = await response.json(); } catch { throw new Error("The server returned an unexpected response."); }
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
async function copy(value, what) {
  try {
    await navigator.clipboard.writeText(value);
    alertUser(what + " copied!");
  } catch {
    alertUser("Could not copy automatically. Please select the link and copy it.", true);
  }
}
function asDownload(href, name) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function showLink(node, url) {
  node.href = url;
  node.textContent = url;
}
async function renderQr(url) {
  await QRCode.toCanvas(el("qr-canvas"), url, {
    width: 320, margin: 3, errorCorrectionLevel: "M",
    color: { dark: "#1c2b4aff", light: "#ffffffff" }
  });
}
async function showResult(data) {
  await renderQr(data.scanUrl);
  created = data;
  empty.hidden = true;
  result.hidden = false;
  showLink(el("scan-url"), data.scanUrl);
  showLink(el("manage-link"), data.manageUrl);
  el("manage-link").textContent = "Manage this QR code →";
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  clearNotice();
  const button = el("create-button");
  button.disabled = true;
  try {
    const destination = safeUrl(el("destination").value);
    const title = el("title").value;
    const data = await requestApi("/api/links", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, title })
    });
    await showResult(data);
    alertUser("Created! Save the image and your private management link.");
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) { alertUser(error.message, true); }
  finally { button.disabled = false; }
});
el("png-button").addEventListener("click", async () => {
  if (!created) return;
  try {
    const data = await QRCode.toDataURL(created.scanUrl, {
      width: 1200, margin: 4, errorCorrectionLevel: "M",
      color: { dark: "#1c2b4aff", light: "#ffffffff" }
    });
    asDownload(data, "qrhaven-" + created.id + ".png");
  } catch (error) { alertUser(error.message, true); }
});
el("svg-button").addEventListener("click", async () => {
  if (!created) return;
  try {
    const svg = await QRCode.toString(created.scanUrl, {
      type: "svg", margin: 4, errorCorrectionLevel: "M",
      color: { dark: "#1c2b4aff", light: "#ffffffff" }
    });
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    asDownload(blobUrl, "qrhaven-" + created.id + ".svg");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  } catch (error) { alertUser(error.message, true); }
});
el("copy-scan").addEventListener("click", () => { if (created) copy(created.scanUrl, "Permanent link"); });
el("copy-manage").addEventListener("click", () => { if (created) copy(created.manageUrl, "Private management link"); });
el("copy-manager").addEventListener("click", () => { if (manageSession) copy(manageSession.scanUrl, "Permanent link"); });
el("back-button").addEventListener("click", () => { location.hash = ""; showCreator(); });
function showCreator() {
  manager.hidden = true;
  creator.hidden = false;
  empty.hidden = Boolean(created);
  result.hidden = !created;
  clearNotice();
}
async function loadManage() {
  const match = location.hash.match(/^#\/manage\/([A-Za-z0-9_-]{18})\/([A-Za-z0-9_-]{43})$/);
  if (!match) { manageSession = null; showCreator(); return; }
  const [, id, key] = match;
  creator.hidden = true;
  empty.hidden = true;
  result.hidden = true;
  manager.hidden = false;
  clearNotice();
  try {
    const data = await requestApi("/api/links/" + id, {
      headers: { Authorization: "Bearer " + key }
    });
    // Avoid overwriting a newly opened management URL during a slow request.
    if (location.hash !== "#/manage/" + id + "/" + key) return;
    manageSession = { id, key, scanUrl: data.scanUrl };
    el("edit-destination").value = data.destination;
    el("edit-title").value = data.title;
    showLink(el("manager-scan-url"), data.scanUrl);
    el("scan-count").textContent = (data.scans || 0).toLocaleString() + " recorded scans";
  } catch (error) {
    manageSession = null;
    alertUser("Could not open this QR code: " + error.message, true);
  }
}
el("edit-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!manageSession) return;
  clearNotice();
  const button = el("save-button");
  button.disabled = true;
  try {
    const data = await requestApi("/api/links/" + manageSession.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + manageSession.key },
      body: JSON.stringify({
        destination: safeUrl(el("edit-destination").value),
        title: el("edit-title").value
      })
    });
    el("edit-destination").value = data.destination;
    alertUser("Saved! Your existing QR image now sends people to the updated destination.");
  } catch (error) { alertUser(error.message, true); }
  finally { button.disabled = false; }
});
window.addEventListener("hashchange", loadManage);
loadManage();
if (isGithubPages && !apiOrigin) {
  el("create-button").disabled = true;
  alertUser("This Pages preview needs the Cloudflare service before it can generate dynamic QR codes. See the README for deployment.", true);
}
