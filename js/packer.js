window.packerSession = {
  toteLp: "",
  toteOrders: [],
  scannedSOs: [],
  scannedSkuEvents: [],
  exceptions: [],
  showExceptions: false
};

function packerNormalizeCarrier(value = "") {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function packerNormalizeSku(value = "") {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function parsePackerToteLP(rawValue = "") {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return { isValid: false, carrier: "", toteNo: "", normalized: "" };
  }

  const compact = raw.toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^TOTE[\|\-\/]?([A-Z]+)[\|\-\/]?(\d{3})$/);

  if (!match) {
    return { isValid: false, carrier: "", toteNo: "", normalized: "" };
  }

  const carrier = packerNormalizeCarrier(match[1]);
  const toteNo = match[2];

  return {
    isValid: true,
    carrier,
    toteNo,
    normalized: `TOTE|${carrier}|${toteNo}`
  };
}

function ensurePackerStateObjects() {
  if (!window.appState.sickTotes) window.appState.sickTotes = {};
  if (!window.appState.toteRegistry) window.appState.toteRegistry = {};
  if (!window.appState.recentPackedTotes) window.appState.recentPackedTotes = {};
}

function getRecentPackedTotes() {
  ensurePackerStateObjects();
  return window.appState.recentPackedTotes;
}

function markToteRecentlyPacked(toteLp) {
  const packed = getRecentPackedTotes();
  packed[String(toteLp || "").toUpperCase()] = {
    packedAt: new Date().toISOString()
  };
}

function isToteRecentlyPacked(toteLp) {
  const packed = getRecentPackedTotes();
  const key = String(toteLp || "").toUpperCase();
  const entry = packed[key];
  if (!entry || !entry.packedAt) return false;

  const packedAt = new Date(entry.packedAt).getTime();
  const now = Date.now();
  return (now - packedAt) < (15 * 60 * 1000);
}

function cleanupRecentPackedTotes() {
  const packed = getRecentPackedTotes();
  const now = Date.now();

  Object.keys(packed).forEach(key => {
    const packedAt = new Date(packed[key].packedAt || 0).getTime();
    if (!packedAt || (now - packedAt) >= (15 * 60 * 1000)) {
      delete packed[key];
    }
  });
}

function getPackerOrderKey(order) {
  return String(order.so || "");
}

function getAllReadyTotes() {
  ensurePackerStateObjects();
  cleanupRecentPackedTotes();

  const orders = window.appState.orders || [];
  const sickTotes = window.appState.sickTotes || {};

  const seen = new Set();
  const totes = [];

  orders.forEach(order => {
    const tote = String(order.toteLp || "").toUpperCase();
    if (
      order.status === "Ready for Packing" &&
      tote &&
      !sickTotes[tote] &&
      !isToteRecentlyPacked(tote) &&
      !seen.has(tote)
    ) {
      seen.add(tote);
      totes.push(tote);
    }
  });

  return totes;
}

function getNextReadyToteLp() {
  const totes = getAllReadyTotes();
  return totes.length ? totes[0] : "";
}

function markToteSick(toteLp, exceptions, carrier = "") {
  ensurePackerStateObjects();

  window.appState.sickTotes[toteLp] = {
    createdAt: new Date().toISOString(),
    exceptions: exceptions
  };

  window.appState.toteRegistry[toteLp] = {
    status: "SICK",
    assignedPicker: null,
    carrier: packerNormalizeCarrier(carrier),
    updatedAt: new Date().toISOString()
  };

  saveState();
}

function togglePackerExceptions() {
  window.packerSession.showExceptions = !window.packerSession.showExceptions;
  const section = document.getElementById("packerExceptionSection");
  if (section) {
    section.style.display = window.packerSession.showExceptions ? "block" : "none";
  }
}

function clearPackerSession() {
  window.packerSession = {
    toteLp: "",
    toteOrders: [],
    scannedSOs: [],
    scannedSkuEvents: [],
    exceptions: [],
    showExceptions: false
  };

  const toteInput = document.getElementById("packerToteInput");
  const skuInput = document.getElementById("packerSkuInput");
  const toteMsg = document.getElementById("packerToteMessage");
  const skuMsg = document.getElementById("packerSkuMessage");
  const exSection = document.getElementById("packerExceptionSection");
  const exEl = document.getElementById("packerExceptionList");

  if (toteInput) toteInput.value = "";
  if (skuInput) skuInput.value = "";
  if (toteMsg) {
    toteMsg.textContent = "";
    toteMsg.className = "message-box";
  }
  if (skuMsg) {
    skuMsg.textContent = "";
    skuMsg.className = "message-box";
  }
  if (exSection) exSection.style.display = "none";
  if (exEl) exEl.innerHTML = "";

  renderPackerDashboard();

  if (toteInput) window.setTimeout(() => toteInput.focus(), 80);
}

function setPackerTote() {
  ensurePackerStateObjects();
  cleanupRecentPackedTotes();

  const toteInput = document.getElementById("packerToteInput");
  const msg = document.getElementById("packerToteMessage");
  if (!toteInput || !msg) return;

  const parsed = parsePackerToteLP(toteInput.value);

  if (!parsed.isValid) {
    msg.textContent = "Invalid Tote LP.";
    msg.className = "message-box message-error";
    toteInput.value = "";
    window.setTimeout(() => toteInput.focus(), 50);
    return;
  }

  const toteLp = parsed.normalized;

  if (isToteRecentlyPacked(toteLp)) {
    msg.textContent = "Already done";
    msg.className = "message-box message-error";
    toteInput.value = "";
    renderPackerDashboard();
    window.setTimeout(() => toteInput.focus(), 50);
    return;
  }

  const sickData = (window.appState.sickTotes || {})[toteLp];

  const toteOrdersAll = (window.appState.orders || []).filter(order =>
    String(order.toteLp || "").toUpperCase() === toteLp
  );

  if (!toteOrdersAll.length) {
    msg.textContent = "No orders found for this Tote LP.";
    msg.className = "message-box message-error";
    toteInput.value = "";
    window.setTimeout(() => toteInput.focus(), 50);
    return;
  }

  window.packerSession.toteLp = toteLp;
  window.packerSession.toteOrders = toteOrdersAll;
  window.packerSession.scannedSOs = [];
  window.packerSession.scannedSkuEvents = [];
  window.packerSession.exceptions = sickData ? (sickData.exceptions || []) : [];
  window.packerSession.showExceptions = false;

  const exSection = document.getElementById("packerExceptionSection");
  if (exSection) exSection.style.display = "none";

  if (sickData) {
    msg.textContent = "Sick Tote";
    msg.className = "message-box message-error";
    renderPackerDashboard();
    return;
  }

  msg.textContent = `Tote loaded: ${toteLp}`;
  msg.className = "message-box message-success";

  const skuMsg = document.getElementById("packerSkuMessage");
  if (skuMsg) {
    skuMsg.textContent = "";
    skuMsg.className = "message-box";
  }

  renderPackerDashboard();

  const skuInput = document.getElementById("packerSkuInput");
  if (skuInput) {
    window.setTimeout(() => skuInput.focus(), 80);
  }
}

function getNextMatchingReadyOrderForSku(scannedSku) {
  const toteOrders = window.packerSession.toteOrders || [];

  return toteOrders.find(order =>
    packerNormalizeSku(order.sku) === scannedSku &&
    order.status === "Ready for Packing" &&
    !window.packerSession.scannedSOs.includes(getPackerOrderKey(order))
  );
}

function verifyPackerSku() {
  ensurePackerStateObjects();

  const skuInput = document.getElementById("packerSkuInput");
  const msg = document.getElementById("packerSkuMessage");
  if (!skuInput || !msg) return;

  if (!window.packerSession.toteLp) {
    msg.textContent = "Scan Tote LP first.";
    msg.className = "message-box message-error";
    return;
  }

  if ((window.appState.sickTotes || {})[window.packerSession.toteLp]) {
    msg.textContent = "Sick Tote";
    msg.className = "message-box message-error";
    renderPackerDashboard();
    return;
  }

  const scannedSku = packerNormalizeSku(skuInput.value);
  if (!scannedSku) {
    msg.textContent = "Please scan a SKU QR.";
    msg.className = "message-box message-error";
    skuInput.value = "";
    window.setTimeout(() => skuInput.focus(), 50);
    return;
  }

  if (!window.packerSession.scannedSkuEvents) {
    window.packerSession.scannedSkuEvents = [];
  }

  const matchingReadyOrder = getNextMatchingReadyOrderForSku(scannedSku);

  if (matchingReadyOrder) {
    const soKey = getPackerOrderKey(matchingReadyOrder);

    window.packerSession.scannedSOs.push(soKey);
    window.packerSession.scannedSkuEvents.push({
      scannedSku,
      so: matchingReadyOrder.so || "-",
      matched: true,
      scannedAt: new Date().toISOString()
    });

    msg.textContent = "Verified";
    msg.className = "message-box message-success";

    skuInput.value = "";
    renderPackerDashboard();
    window.setTimeout(() => skuInput.focus(), 50);
    return;
  }

  const sameSkuScannedBefore = window.packerSession.scannedSkuEvents.some(item =>
    item.scannedSku === scannedSku
  );

  if (sameSkuScannedBefore) {
    window.packerSession.scannedSkuEvents.push({
      scannedSku,
      so: "-",
      matched: false,
      scannedAt: new Date().toISOString()
    });

    window.packerSession.exceptions.push({
      scannedSku: scannedSku,
      so: "-",
      carrier: "-",
      picker: "-",
      expectedTote: window.packerSession.toteLp || "-",
      reason: "Additional SKU",
      aisle: "-",
      expectedBin: "-"
    });

    msg.textContent = "Exception";
    msg.className = "message-box message-error";

    skuInput.value = "";
    renderPackerDashboard();
    window.setTimeout(() => skuInput.focus(), 50);
    return;
  }

  const alreadyPackedOrder = (window.packerSession.toteOrders || []).find(order =>
    packerNormalizeSku(order.sku) === scannedSku &&
    order.status === "Packed"
  );

  if (alreadyPackedOrder) {
    msg.textContent = "Already Packed";
    msg.className = "message-box message-error";
    skuInput.value = "";
    renderPackerDashboard();
    window.setTimeout(() => skuInput.focus(), 50);
    return;
  }

  const relatedOrder = (window.appState.orders || []).find(order =>
    packerNormalizeSku(order.sku) === scannedSku
  );

  window.packerSession.scannedSkuEvents.push({
    scannedSku,
    so: relatedOrder ? relatedOrder.so : "-",
    matched: false,
    scannedAt: new Date().toISOString()
  });

  window.packerSession.exceptions.push({
    scannedSku: scannedSku,
    so: relatedOrder ? relatedOrder.so : "-",
    carrier: relatedOrder ? relatedOrder.carrier : "-",
    picker: relatedOrder ? relatedOrder.assignedPicker : "-",
    expectedTote: relatedOrder ? (relatedOrder.toteLp || "-") : "-",
    reason: relatedOrder
      ? "SKU not mapped to scanned tote / wrong tote"
      : "Additional SKU",
    aisle: relatedOrder ? (relatedOrder.aisle || relatedOrder.binCode || "-") : "-",
    expectedBin: relatedOrder ? (relatedOrder.binCode || "-") : "-"
  });

  msg.textContent = "Exception";
  msg.className = "message-box message-error";

  skuInput.value = "";
  renderPackerDashboard();
  window.setTimeout(() => skuInput.focus(), 50);
}

function validatePackerSession() {
  ensurePackerStateObjects();

  const msg = document.getElementById("packerSkuMessage");
  const toteMsg = document.getElementById("packerToteMessage");
  if (!msg || !toteMsg) return;

  if (!window.packerSession.toteLp) {
    msg.textContent = "Scan Tote LP first.";
    msg.className = "message-box message-error";
    return;
  }

  if ((window.appState.sickTotes || {})[window.packerSession.toteLp]) {
    msg.textContent = "Sick Tote";
    msg.className = "message-box message-error";
    renderPackerDashboard();
    return;
  }

  const toteOrders = window.packerSession.toteOrders || [];
  const scannedSOSet = new Set(window.packerSession.scannedSOs || []);

  const readyOrders = toteOrders.filter(order => order.status === "Ready for Packing");

  const missingOrders = readyOrders.filter(order =>
    !scannedSOSet.has(getPackerOrderKey(order))
  );

  missingOrders.forEach(order => {
    window.packerSession.exceptions.push({
      scannedSku: order.sku || "-",
      so: order.so || "-",
      carrier: order.carrier || "-",
      picker: order.assignedPicker || "-",
      expectedTote: order.toteLp || "-",
      reason: "Missing SKU",
      aisle: order.aisle || order.binCode || "-",
      expectedBin: order.binCode || "-"
    });
  });

  if (window.packerSession.exceptions.length > 0) {
    const toteCarrier = toteOrders.length ? toteOrders[0].carrier : "";
    markToteSick(window.packerSession.toteLp, window.packerSession.exceptions, toteCarrier);

    if (typeof renderAdminSummary === "function") renderAdminSummary();
    if (typeof updateAdminExceptionBadge === "function") updateAdminExceptionBadge();

    clearPackerSession();

    msg.textContent = "Sick Tote";
    msg.className = "message-box message-error";
    toteMsg.textContent = "Sick Tote";
    toteMsg.className = "message-box message-error";

    renderPackerDashboard();
    return;
  }

  (window.appState.orders || []).forEach(order => {
    const soKey = getPackerOrderKey(order);
    if (
      String(order.toteLp || "").toUpperCase() === window.packerSession.toteLp &&
      order.status === "Ready for Packing" &&
      scannedSOSet.has(soKey)
    ) {
      order.status = "Packed";
      order.packTime = new Date().toISOString();
    }
  });

  window.appState.toteRegistry[window.packerSession.toteLp] = {
    status: "DONE",
    assignedPicker: null,
    updatedAt: new Date().toISOString()
  };

  markToteRecentlyPacked(window.packerSession.toteLp);

  saveState();

  if (typeof renderAdminSummary === "function") renderAdminSummary();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();
  if (typeof renderPickerDashboard === "function") renderPickerDashboard();
  if (typeof updateAdminExceptionBadge === "function") updateAdminExceptionBadge();

  clearPackerSession();

  toteMsg.textContent = "Validated";
  toteMsg.className = "message-box message-success";
}

function renderPackerLoadedToteCards(toteOrders, scannedSOSet) {
  return `
    <div class="packer-cards-wrap">
      ${toteOrders.map(order => {
        const soKey = getPackerOrderKey(order);
        const isVerified = scannedSOSet.has(soKey);
        const isPacked = order.status === "Packed";

        let statusText = "Pending";
        let statusClass = "packer-status-pending";

        if (isPacked) {
          statusText = "Packed";
          statusClass = "packer-status-packed";
        } else if (isVerified) {
          statusText = "Verified";
          statusClass = "packer-status-verified";
        }

        return `
          <div class="packer-mobile-card">
            <div class="packer-mobile-row">
              <span>SKU</span>
              <strong class="wrap-anywhere">${order.sku}</strong>
            </div>
            <div class="packer-mobile-row">
              <span>Status</span>
              <strong class="${statusClass}">${statusText}</strong>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderPackerExceptionCards(exceptions) {
  return `
    <div class="packer-cards-wrap">
      ${exceptions.map(item => `
        <div class="packer-mobile-card">
          <div class="packer-mobile-row"><span>Scanned SKU</span><strong class="wrap-anywhere">${item.scannedSku}</strong></div>
          <div class="packer-mobile-row"><span>Related SO</span><strong>${item.so}</strong></div>
          <div class="packer-mobile-row"><span>Carrier</span><strong>${item.carrier}</strong></div>
          <div class="packer-mobile-row"><span>Assigned Picker</span><strong>${item.picker}</strong></div>
          <div class="packer-mobile-row"><span>Expected Tote</span><strong class="wrap-anywhere">${item.expectedTote || "-"}</strong></div>
          <div class="packer-mobile-row"><span>Exception</span><strong class="wrap-anywhere">${item.reason}</strong></div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPackerDashboard() {
  const listEl = document.getElementById("packerReadyList");
  const exEl = document.getElementById("packerExceptionList");
  if (!listEl || !exEl) return;

  cleanupRecentPackedTotes();

  if (!window.packerSession.toteLp) {
    const nextTote = getNextReadyToteLp();

    listEl.innerHTML = `
      <div class="simple-pack-queue-card">
        <div class="simple-pack-label">Next Tote LP</div>
        <div class="simple-pack-value">${nextTote || "No totes ready"}</div>
      </div>
    `;

    exEl.innerHTML = "";
    return;
  }

  const toteOrders = window.packerSession.toteOrders || [];
  const scannedSOSet = new Set(window.packerSession.scannedSOs || []);

  listEl.innerHTML = `
    <h3 class="packer-list-title wrap-anywhere">Tote Packing List - ${window.packerSession.toteLp}</h3>
    ${renderPackerLoadedToteCards(toteOrders, scannedSOSet)}
  `;

  if (!window.packerSession.exceptions.length) {
    exEl.innerHTML = "";
    return;
  }

  exEl.innerHTML = `
    <h3 class="packer-list-title">Packing Exceptions</h3>
    ${renderPackerExceptionCards(window.packerSession.exceptions)}
  `;
}

(function () {
  const originalSetPackerTote = window.setPackerTote || setPackerTote;
  const originalVerifyPackerSku = window.verifyPackerSku || verifyPackerSku;

  window.setPackerTote = function () {
    originalSetPackerTote.apply(this, arguments);
    const msg = document.getElementById("packerToteMessage");
    if (msg && msg.className.indexOf("message-success") !== -1) {
      const skuInput = document.getElementById("packerSkuInput");
      if (skuInput) window.setTimeout(() => skuInput.focus(), 80);
    }
  };

  window.verifyPackerSku = function () {
    originalVerifyPackerSku.apply(this, arguments);
    const toteLoaded = window.packerSession && window.packerSession.toteLp;
    const skuInput = document.getElementById("packerSkuInput");
    if (toteLoaded && skuInput) window.setTimeout(() => skuInput.focus(), 80);
  };
})();

window.validatePackerSession = validatePackerSession;
window.togglePackerExceptions = togglePackerExceptions;
window.renderPackerDashboard = renderPackerDashboard;
window.clearPackerSession = clearPackerSession;
