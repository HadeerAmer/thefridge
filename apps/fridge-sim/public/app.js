// The Fridge — machine simulator touchscreen.
// Renders /sim/state and re-fetches whenever /sim/stream says something changed.

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const egp = (cents) => `EGP ${(cents / 100).toLocaleString("en-EG", { maximumFractionDigits: 2 })}`;
const SHAPES = { salad: "jar", dessert: "cup", bowl: "bowl", wrap: "wrap", sandwich: "sandwich", drink: "bottle", snack: "pack" };

const ui = {
  data: null,
  machineId: safeGet("sim.machine"),
  renderedOperatorFor: null,
  lastVendSeen: null,
  camera: { stream: null, timer: null },
};

// ------------------------------------------------------------------ data

async function load() {
  try {
    const res = await fetch("/sim/state");
    ui.data = await res.json();
  } catch {
    return;
  }
  const machines = ui.data.machines;
  if (!machines.some((m) => m.id === ui.machineId)) {
    ui.machineId = (machines.find((m) => m.status === "online") ?? machines[0]).id;
  }
  render();
}

async function call(path, body, method = "POST") {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json;
}

function current() {
  return ui.data?.machines.find((m) => m.id === ui.machineId);
}

// ------------------------------------------------------------------ render

function render() {
  if (!ui.data) return;
  renderTabs();
  renderCloud();
  renderMachine();
  renderScreen();
  renderOperator();
  renderHolds();
  renderLog();
}

function machineDot(m) {
  if (m.status !== "online") return "offline";
  return m.salesLocked ? "locked" : "online";
}

function renderTabs() {
  $("machineTabs").innerHTML = ui.data.machines
    .map(
      (m) => `<button class="tab" data-machine="${esc(m.id)}" aria-pressed="${m.id === ui.machineId}">
        <span class="dot ${machineDot(m)}"></span>${esc(m.name)}</button>`,
    )
    .join("");
}

function renderCloud() {
  const el = $("cloudStatus");
  const ok = ui.data.cloudReachable;
  el.className = `pill ${ok ? "ok" : "bad"}`;
  el.textContent = ok
    ? `Cloud connected${ui.data.pendingWebhooks ? ` · ${ui.data.pendingWebhooks} queued` : ""}`
    : `Cloud unreachable · ${ui.data.pendingWebhooks} queued`;
  $("appLink").href = ui.data.cloudUrl;
}

function itemArt(slot) {
  const layers = slot.layers?.length ? slot.layers : ["#d9d4c8"];
  const step = 100 / layers.length;
  const stops = layers.map((c, i) => `${c} ${(i * step).toFixed(1)}% ${((i + 1) * step).toFixed(1)}%`).join(", ");
  const shape = SHAPES[slot.category] ?? "jar";
  return `<span class="item ${shape}" style="background: linear-gradient(180deg, ${stops})"></span>`;
}

function renderMachine() {
  const m = current();
  const shelves = ["A", "B", "C", "D", "E"].map((row) => m.slots.filter((s) => s.code.startsWith(row)));
  const sellable = m.status === "online" && !m.salesLocked;
  const lastVend = m.recentVends[0];
  const fresh = lastVend && Date.now() - Date.parse(lastVend.completedAt) < 8000;

  $("machine").innerHTML = `
    <div class="machine">
      <div class="awning"><div class="nameplate"><span class="wordmark">THE FRIDGE</span><small>Always a good cal(l)</small></div></div>
      <div class="cabinet">
        <div class="cabinet-head">
          <h2>${esc(m.name)}</h2>
          <div class="meta">
            <span class="pill ${m.status === "online" ? "ok" : "bad"}">${esc(m.status)}</span>
            <span class="pill ${m.salesLocked ? "bad" : "ok"}">${m.temperatureC.toFixed(1)}°C${m.salesLocked && m.status === "online" ? " · sales paused" : ""}</span>
          </div>
        </div>
        <div class="glass ${sellable ? "" : "dark"}">
          ${shelves
            .map(
              (slots) => `<div class="shelf">${slots
                .map((s) => {
                  const empty = !s.sku || s.qty === 0;
                  const title = s.sku ? `${s.name} · ${egp(s.priceCents)} · ${s.qty} in slot` : "Empty slot";
                  return `<button class="slot ${empty ? "empty" : ""}" data-slot="${s.code}" ${empty || !sellable ? "disabled" : ""} title="${esc(title)}">
                    ${s.sku ? `<span class="qty">×${s.qty}</span>` : ""}
                    ${s.heldForSku && s.qty > 0 ? `<span class="held" title="Held for app orders">🔒${s.heldForSku}</span>` : ""}
                    ${s.expiringSoon && s.qty > 0 ? `<span class="soon" title="Expires within 6 hours">⏱</span>` : ""}
                    ${itemArt(s)}
                    <span class="tag">${s.code}${s.priceCents ? `<span>${s.priceCents / 100}</span>` : ""}</span>
                    <span class="label">${esc(s.name ?? "—")}</span>
                  </button>`;
                })
                .join("")}</div>`,
            )
            .join("")}
          ${
            m.status !== "online"
              ? `<div class="closed-banner"><div><strong>${m.notice ? "Closed" : esc(m.status)}</strong>${esc(m.notice ?? "Not selling right now")}</div></div>`
              : ""
          }
        </div>
        <div class="tray">
          <span class="push">PUSH</span>
          ${
            fresh
              ? `<div class="dropped">${lastVend.items
                  .map((i) => `<span class="drop">${itemArt(m.slots.find((s) => s.code === i.slot) ?? {})}${i.qty > 1 ? `${i.qty}× ` : ""}${esc(i.name)}</span>`)
                  .join("")}</div>`
              : `<span class="hint">${sellable ? "Tap a slot to buy at the machine, or scan an app order on the screen →" : "Machine is not selling"}</span>`
          }
        </div>
      </div>
    </div>`;
}

function renderScreen() {
  const m = current();
  $("screenTemp").textContent = `${m.temperatureC.toFixed(1)}°C`;
  const s = m.session;
  const stale = s && ["completed", "rejected", "cancelled"].includes(s.status) && Date.now() - Date.parse(s.updatedAt) > 20000;
  const el = $("screenState");

  if (m.status !== "online" || m.salesLocked) {
    el.innerHTML = `<div class="err-badge">!</div><div class="big">Not selling right now</div>
      <div class="muted">${esc(m.notice ?? (m.salesLocked ? `Cabinet at ${m.temperatureC.toFixed(1)}°C — sales paused for food safety` : `Machine is ${m.status}`))}</div>`;
    return;
  }
  if (!s || stale) {
    el.innerHTML = `<div class="scan-icon">⌗</div><div class="big">Scan your QR from The Fridge app</div>
      <div class="muted">Reserved or paid in the app? Hold your code up to the scanner.</div>`;
    return;
  }
  const items = s.order ? `<ul>${s.order.items.map((i) => `<li>${i.qty}× ${esc(i.name)}</li>`).join("")}</ul>` : "";
  switch (s.status) {
    case "verifying":
      el.innerHTML = `<div class="spinner"></div><div class="big">${esc(s.message)}</div>`;
      break;
    case "awaiting_payment":
      el.innerHTML = `<div class="muted">Order ${esc(s.order.orderNumber)}${s.order.customerName ? ` · ${esc(s.order.customerName)}` : ""}</div>
        <div class="amount">${egp(s.order.amountDueCents)}</div>${items}
        <div class="actions">
          <button data-pay="card" data-session="${s.id}">💳 Tap card</button>
          <button data-pay="cash" data-session="${s.id}" class="alt">Pay cash</button>
          <button data-cancel="${s.id}" class="alt">Cancel</button>
        </div>`;
      break;
    case "vending":
      el.innerHTML = `<div class="spinner"></div><div class="big">${esc(s.message)}</div>${items}`;
      break;
    case "completed":
      el.innerHTML = `<div class="ok-badge">✓</div><div class="big">${esc(s.message)}</div>${items}
        <div class="muted">Take your order from the PUSH tray.</div>`;
      break;
    default:
      el.innerHTML = `<div class="err-badge">✕</div><div class="big">${s.status === "cancelled" ? "Cancelled" : "Code not accepted"}</div>
        <div class="muted">${esc(s.message)}</div>`;
  }
}

function renderOperator() {
  const m = current();
  const panel = $("operator");
  // Don't clobber a field the operator is typing in.
  if (ui.renderedOperatorFor === m.id && panel.contains(document.activeElement)) {
    panel.querySelector("[data-temp-out]").textContent = `${m.temperatureC.toFixed(1)}°C`;
    return;
  }
  ui.renderedOperatorFor = m.id;
  panel.innerHTML = `
    <h3>Operator controls</h3>
    <label class="field">Cabinet temperature
      <span class="row"><input type="range" min="0" max="14" step="0.5" value="${m.temperatureC}" data-temp />
      <output data-temp-out>${m.temperatureC.toFixed(1)}°C</output></span>
      <small class="empty-note">Above 8°C the machine pauses sales and tells the cloud.</small>
    </label>
    <label class="field">Status
      <select data-status>${["online", "offline", "maintenance"].map((s) => `<option ${s === m.status ? "selected" : ""}>${s}</option>`).join("")}</select>
    </label>
    <label class="field">Notice shown in the app and on screen
      <textarea data-notice maxlength="280" placeholder="e.g. Due to a power outage we can't serve anyone today.">${esc(m.notice ?? "")}</textarea>
    </label>
    <div class="btn-row">
      <button class="btn green small" data-action="notice">Save notice</button>
      <button class="btn secondary small" data-action="clear-notice">Clear</button>
      <button class="btn secondary small" data-action="restock">Restock all slots</button>
      <button class="btn danger small" data-action="reset">Reset all machines</button>
    </div>`;
}

function countdown(iso) {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function renderHolds() {
  const m = current();
  $("holds").innerHTML = `<h3>Active holds <span>${m.holds.length}</span></h3>
    ${
      m.holds.length === 0
        ? `<p class="empty-note">No reservations waiting. Reserve something in the app and it shows up here.</p>`
        : m.holds
            .map(
              (h) => `<div class="hold"><header><span>${h.purpose === "courier" ? "🛵 Courier pickup" : "🙋 Customer reservation"}</span>
                <span class="countdown" data-expires="${h.expiresAt}">${countdown(h.expiresAt)}</span></header>
                ${h.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(", ")}<br /><small class="empty-note">ref ${esc(h.ref)}</small></div>`,
            )
            .join("")
    }`;
}

function renderLog() {
  const icons = { delivered: "✅", retrying: "⏳", dropped: "⛔" };
  const entries = ui.data.webhooks.filter((w) => w.machineId === ui.machineId);
  $("log").innerHTML = `<h3>Webhooks to cloud</h3>
    ${
      entries.length === 0
        ? `<p class="empty-note">Signed events this machine sends to the cloud appear here.</p>`
        : `<ul class="log">${entries
            .map(
              (w) => `<li><span>${icons[w.status]}</span><span><code>${esc(w.type)}</code>${
                w.detail ? ` <span class="detail">${esc(w.detail)}</span>` : ""
              }</span><span class="when">${new Date(w.at).toLocaleTimeString()}</span></li>`,
            )
            .join("")}</ul>`
    }`;
}

// ------------------------------------------------------------------ actions

function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast${isError ? " error" : ""}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3500);
}

async function run(action, success) {
  try {
    await action();
    if (success) toast(success);
  } catch (error) {
    toast(error.message, true);
  }
}

function extractCode(raw) {
  const text = String(raw).trim();
  const last = text.split(/[/?#=]/).filter(Boolean).pop() ?? text;
  return last.toUpperCase();
}

async function submitCode(raw) {
  const code = extractCode(raw);
  if (!code) return;
  $("codeInput").value = "";
  await run(() => call(`/sim/machines/${ui.machineId}/scan`, { code }));
}

function openBuyDialog(slotCode) {
  const m = current();
  const slot = m.slots.find((s) => s.code === slotCode);
  if (!slot?.sku) return;
  const dialog = $("buyDialog");
  dialog.innerHTML = `<form method="dialog" class="inner">
    <small class="empty-note">Slot ${slot.code} · buying at the machine</small>
    <h4>${esc(slot.name)}</h4>
    <div class="price">${egp(slot.priceCents)}</div>
    <p class="empty-note">Machine price. App customers see their app price and can reserve ahead.</p>
    <div class="btn-row">
      <button class="btn green" value="card">💳 Pay by card</button>
      <button class="btn secondary" value="cash">Pay cash</button>
      <button class="btn secondary" value="">Cancel</button>
    </div></form>`;
  dialog.onclose = () => {
    const method = dialog.returnValue;
    if (method) run(() => call(`/sim/machines/${ui.machineId}/walk-up`, { slot: slotCode, method }), `Dispensed ${slot.name}`);
  };
  dialog.returnValue = "";
  dialog.showModal();
}

async function toggleCamera() {
  if (ui.camera.stream) return stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) return toast("Camera not available in this browser", true);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = $("cameraVideo");
    const canvas = $("cameraCanvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ui.camera.stream = stream;
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
    $("cameraBtn").textContent = "Stop camera";
    ui.camera.timer = setInterval(() => {
      if (!video.videoWidth || typeof window.jsQR !== "function") return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = window.jsQR(frame.data, frame.width, frame.height);
      if (found?.data) {
        stopCamera();
        submitCode(found.data);
      }
    }, 250);
  } catch {
    toast("Couldn't open the camera — type the pickup code instead", true);
  }
}

function stopCamera() {
  clearInterval(ui.camera.timer);
  ui.camera.stream?.getTracks().forEach((t) => t.stop());
  ui.camera.stream = null;
  $("cameraVideo").hidden = true;
  $("cameraBtn").textContent = "📷 Scan the app's QR with your camera";
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  const m = current();

  if (target.dataset.machine) {
    ui.machineId = target.dataset.machine;
    safeSet("sim.machine", ui.machineId);
    ui.renderedOperatorFor = null;
    render();
  } else if (target.dataset.slot) {
    openBuyDialog(target.dataset.slot);
  } else if (target.dataset.pay) {
    run(() => call(`/sim/sessions/${target.dataset.session}/pay`, { method: target.dataset.pay }));
  } else if (target.dataset.cancel) {
    run(() => call(`/sim/sessions/${target.dataset.cancel}/cancel`));
  } else if (target.dataset.action === "notice") {
    const notice = $("operator").querySelector("[data-notice]").value;
    run(() => call(`/sim/machines/${m.id}`, { notice: notice || null }, "PATCH"), "Notice sent to the cloud");
  } else if (target.dataset.action === "clear-notice") {
    run(() => call(`/sim/machines/${m.id}`, { notice: null }, "PATCH"), "Notice cleared");
  } else if (target.dataset.action === "restock") {
    run(() => call(`/sim/machines/${m.id}/restock`, {}), "All slots refilled");
  } else if (target.dataset.action === "reset") {
    if (confirm("Reset every machine to its day-one shelves? Active holds are dropped.")) {
      run(() => call("/sim/reset"), "All machines reset");
    }
  } else if (target.id === "cameraBtn") {
    toggleCamera();
  }
});

document.addEventListener("change", (event) => {
  const m = current();
  if (event.target.matches("[data-temp]")) {
    run(() => call(`/sim/machines/${m.id}`, { temperatureC: Number(event.target.value) }, "PATCH"));
  } else if (event.target.matches("[data-status]")) {
    run(() => call(`/sim/machines/${m.id}`, { status: event.target.value }, "PATCH"), `Machine is now ${event.target.value}`);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-temp]")) {
    $("operator").querySelector("[data-temp-out]").textContent = `${Number(event.target.value).toFixed(1)}°C`;
  }
});

$("scanForm").addEventListener("submit", (event) => {
  event.preventDefault();
  submitCode($("codeInput").value);
});

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — selection just won't persist */
  }
}

// Live updates
let refreshTimer = null;
const events = new EventSource("/sim/stream");
events.addEventListener("refresh", () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(load, 40);
});
setInterval(() => {
  document.querySelectorAll("[data-expires]").forEach((el) => (el.textContent = countdown(el.dataset.expires)));
}, 1000);
// Re-render occasionally so "just dropped" and idle screens time out.
setInterval(() => ui.data && (renderMachine(), renderScreen()), 4000);

load();
