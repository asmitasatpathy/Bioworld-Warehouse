window.packerSession = {
  toteLp: "",
  toteOrders: [],
  scannedSOs: [],
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
}

function getPackerOrderKey(order) {
  return String(order.so || "");
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

  const toteInput = document.getElementById("packerToteInput");
  const msg = document.getElementById("packerToteMessage");
  if (!toteInput || !msg) return;

  const parsed = parsePackerToteLP(toteInput.value);

  if (!parsed.isValid) {
    msg.textContent = "Invalid Tote LP.";
    msg.className = "message-box message-error";
    return;
  }

  const toteLp = parsed.normalized;
  const sickData = (window.appState.sickTotes || {})[toteLp];

  // Exact Tote LP contents only
  const toteOrdersAll = (window.appState.orders || []).filter(order =>
    String(order.toteLp || "").toUpperCase() === toteLp
  );

  if (!toteOrdersAll.length) {
    msg.textContent = "No orders found for this Tote LP.";
    msg.className = "message-box message-error";
    return;
  }

  window.packerSession.toteLp = toteLp;
  window.packerSession.toteOrders = toteOrdersAll;
  window.packerSession.scannedSOs = [];
  window.packerSession.exceptions = sickData ? (sickData.exceptions || []) : [];
  window.packerSession.showExceptions = false;

  const exSection = document.getElementById("packerExceptionSection");
  if (exSection) exSection.style.display = "none";

  if (sickData) {
    msg.textContent = `Sick Tote`;
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

  if (toteInput) window.setTimeout(() => toteInput.focus(), 80);
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
    return;
  }

  const toteOrders = window.packerSession.toteOrders || [];

  const matchingReadyOrder = toteOrders.find(order =>
    packerNormalizeSku(order.sku) === scannedSku &&
    order.status === "Ready for Packing" &&
    !window.packerSession.scannedSOs.includes(getPackerOrderKey(order))
  );

  if (matchingReadyOrder) {
    const soKey = getPackerOrderKey(matchingReadyOrder);
    window.packerSession.scannedSOs.push(soKey);

    msg.textContent = "Verified";
    msg.className = "message-box message-success";

    skuInput.value = "";
    renderPackerDashboard();
    return;
  }

  const alreadyPackedOrder = toteOrders.find(order =>
    packerNormalizeSku(order.sku) === scannedSku &&
    order.status === "Packed"
  );

  if (alreadyPackedOrder) {
    msg.textContent = "Already Packed";
    msg.className = "message-box message-error";
    skuInput.value = "";
    renderPackerDashboard();
    return;
  }

  const alreadyVerifiedOrder = toteOrders.find(order =>
    packerNormalizeSku(order.sku) === scannedSku &&
    window.packerSession.scannedSOs.includes(getPackerOrderKey(order))
  );

  if (alreadyVerifiedOrder) {
    msg.textContent = "Already Verified";
    msg.className = "message-box message-error";
    skuInput.value = "";
    renderPackerDashboard();
    return;
  }

  const relatedOrder = (window.appState.orders || []).find(order =>
    packerNormalizeSku(order.sku) === scannedSku
  );

  window.packerSession.exceptions.push({
    scannedSku: scannedSku,
    so: relatedOrder ? relatedOrder.so : "-",
    carrier: relatedOrder ? relatedOrder.carrier : "-",
    picker: relatedOrder ? relatedOrder.assignedPicker : "-",
    expectedTote: relatedOrder ? (relatedOrder.toteLp || "-") : "-",
    reason: relatedOrder
      ? "SKU not mapped to scanned tote / wrong tote"
      : "No history found for scanned SKU"
  });

  msg.textContent = "Exception";
  msg.className = "message-box message-error";

  skuInput.value = "";
  renderPackerDashboard();

  if (toteInput) window.setTimeout(() => toteInput.focus(), 80);
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
      reason: "Missing SKU"
    });
  });

  if (window.packerSession.exceptions.length > 0) {
    const toteCarrier = toteOrders.length ? toteOrders[0].carrier : "";
    markToteSick(window.packerSession.toteLp, window.packerSession.exceptions, toteCarrier);

    if (typeof renderAdminSummary === "function") renderAdminSummary();

    const failedTote = window.packerSession.toteLp;
    clearPackerSession();
    msg.textContent = "Sick Tote";
    msg.className = "message-box message-error";
    toteMsg.textContent = `Sick Tote`;
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

  // Release tote only after successful validation
  window.appState.toteRegistry[window.packerSession.toteLp] = {
    status: "OPEN",
    assignedPicker: null,
    updatedAt: new Date().toISOString()
  };

  saveState();
  if (typeof renderAdminSummary === "function") renderAdminSummary();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();
  if (typeof renderPickerDashboard === "function") renderPickerDashboard();

  clearPackerSession();

  toteMsg.textContent = `Validated`;
  toteMsg.className = "message-box message-success";
}

function renderPackerDashboard() {
  const listEl = document.getElementById("packerReadyList");
  const exEl = document.getElementById("packerExceptionList");
  if (!listEl || !exEl) return;

  const toteOrders = window.packerSession.toteOrders || [];
  const scannedSOSet = new Set(window.packerSession.scannedSOs || []);

  if (!window.packerSession.toteLp) {
    listEl.innerHTML = "<p style='margin-top:16px;'>Scan a Tote LP to load its SOs and SKUs.</p>";
    exEl.innerHTML = "";
    return;
  }

  listEl.innerHTML = `
    <h3 class="packer-list-title">Tote Packing List - ${window.packerSession.toteLp}</h3>
    <table border="1" cellpadding="8" cellspacing="0" class="packer-table">
      <thead>
        <tr>
          <th>SO No</th>
          <th>SKU</th>
          <th>Carrier</th>
          <th>Assigned Picker</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${toteOrders.map(order => {
          const soKey = getPackerOrderKey(order);
          const isVerified = scannedSOSet.has(soKey);
          const isPacked = order.status === "Packed";

          let rowStyle = "";
          let statusText = `<span class="packer-status-pending">Pending</span>`;

          if (isPacked) {
            rowStyle = "background:#e8f8ec;";
            statusText = `<span class="packer-status-packed">Packed</span>`;
          } else if (isVerified) {
            rowStyle = "background:#f1fff4;";
            statusText = `<span class="packer-status-verified">Verified</span>`;
          }

          return `
            <tr style="${rowStyle}">
              <td>${order.so}</td>
              <td>${order.sku}</td>
              <td>${order.carrier}</td>
              <td>${order.assignedPicker || "-"}</td>
              <td>${statusText}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  if (!window.packerSession.exceptions.length) {
    exEl.innerHTML = "";
    return;
  }

  exEl.innerHTML = `
    <h3 class="packer-list-title">Packing Exceptions</h3>
    <table border="1" cellpadding="8" cellspacing="0" class="packer-table">
      <thead>
        <tr>
          <th>Scanned SKU</th>
          <th>Related SO</th>
          <th>Carrier</th>
          <th>Assigned Picker</th>
          <th>Expected Tote</th>
          <th>Exception</th>
        </tr>
      </thead>
      <tbody>
        ${window.packerSession.exceptions.map(item => `
          <tr>
            <td>${item.scannedSku}</td>
            <td>${item.so}</td>
            <td>${item.carrier}</td>
            <td>${item.picker}</td>
            <td>${item.expectedTote || "-"}</td>
            <td>${item.reason}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

(function(){
  const originalSetPackerTote = window.setPackerTote || setPackerTote;
  const originalVerifyPackerSku = window.verifyPackerSku || verifyPackerSku;
  window.setPackerTote = function(){
    originalSetPackerTote.apply(this, arguments);
    const msg = document.getElementById("packerToteMessage");
    if (msg && msg.className.indexOf("message-success") !== -1) {
      const skuInput = document.getElementById("packerSkuInput");
      if (skuInput) window.setTimeout(() => skuInput.focus(), 80);
    }
  };
  window.verifyPackerSku = function(){
    originalVerifyPackerSku.apply(this, arguments);
    const toteLoaded = window.packerSession && window.packerSession.toteLp;
    const skuInput = document.getElementById("packerSkuInput");
    if (toteLoaded && skuInput) window.setTimeout(() => skuInput.focus(), 80);
  };
})();
