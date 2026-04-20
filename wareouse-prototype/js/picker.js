function loginPicker() {
  const pickerName = document.getElementById("pickerName").value;
  window.appState.currentRole = "Picker";
  window.appState.currentUser = pickerName;
  saveState();
  renderPickerDashboard();
}

function logoutPicker() {
  if (typeof logoutUser === "function") {
    logoutUser();
    return;
  }
  window.appState.currentUser = null;
  window.appState.currentRole = null;
  window.appState.currentOrder = null;
  saveState();
  showScreen("welcomeScreen");
}

function backToPicker() {
  window.appState.currentOrder = null;
  saveState();
  renderPickerDashboard();
  showScreen("pickerLogin");
}

function getOrdersForPicker(pickerName) {
  return (window.appState.orders || []).filter(o => o.assignedPicker === pickerName);
}

function normalizeCarrierForPicker(value = "") {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function renderPickerStatusBlocks(orders) {
  const container = document.getElementById("pickerStatusBlocks");
  const banner = document.getElementById("pickerCompletionBanner");
  if (!container || !banner) return;

  const assigned = orders.filter(order => order.status === "Assigned").length;
  const inProgress = orders.filter(order => order.status === "In Progress").length;
  const completed = orders.filter(order => ["Ready for Packing", "Packed", "Exception"].includes(order.status)).length;

  container.innerHTML = `
    <button class="picker-status-card" type="button" onclick="scrollToPickerOrders()"><div class="label">Assigned</div><div class="value">${assigned}</div></button>
    <button class="picker-status-card" type="button" onclick="scrollToPickerOrders()"><div class="label">In Progress</div><div class="value">${inProgress}</div></button>
    <button class="picker-status-card" type="button" onclick="scrollToPickerOrders()"><div class="label">Completed</div><div class="value">${completed}</div></button>
  `;

  const allDone = orders.length > 0 && orders.every(order => ["Ready for Packing", "Packed", "Exception"].includes(order.status));
  if (allDone) {
    banner.style.display = "block";
    banner.innerHTML = `
      <div class="picker-banner-title">Congrats</div>
      <div>Go back to dashboard for new assignment.</div>
      <button class="secondary-btn" type="button" onclick="scrollToPickerOrders()">View assigned tickets</button>
    `;
  } else {
    banner.style.display = "none";
    banner.innerHTML = "";
  }
}

function scrollToPickerOrders() {
  const ordersEl = document.getElementById("pickerOrders");
  if (ordersEl) ordersEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getStatusClass(status) {
  if (status === "In Progress") return "status-in-progress";
  if (status === "Ready for Packing") return "status-complete";
  if (status === "Packed") return "status-complete";
  if (status === "Exception") return "status-exception";
  return "status-assigned";
}

function getStatusLabel(status) {
  if (status === "In Progress") return "picking";
  if (status === "Ready for Packing") return "ready for packing";
  if (status === "Packed") return "packed";
  if (status === "Exception") return "exception";
  return "assigned";
}

function renderPickerDashboard() {
  const pickerName = window.appState.currentUser;
  const ordersEl = document.getElementById("pickerOrders");
  const nameEl = document.getElementById("loggedInPickerName");

  if (!ordersEl || !nameEl) return;

  if (!pickerName) {
    nameEl.textContent = "Welcome, Picker 1";
    renderPickerStatusBlocks([]);
    ordersEl.innerHTML = "";
    return;
  }

  nameEl.textContent = "Welcome, " + pickerName;

  const orders = getOrdersForPicker(pickerName).slice().sort((a, b) => {
    const ap = a.priorityOverride ? 1 : 0;
    const bp = b.priorityOverride ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return String(a.so || "").localeCompare(String(b.so || ""));
  });
  renderPickerStatusBlocks(orders);

  if (!orders.length) {
    ordersEl.innerHTML = "<p>No orders assigned.</p>";
    return;
  }

  ordersEl.innerHTML = orders.map(order => {
    const isDone = order.status === "Ready for Packing" || order.status === "Packed";
    const isException = order.status === "Exception";
    const isInProgress = order.status === "In Progress";
    const cardClass = isException
      ? "order-card-exception"
      : isDone
      ? "order-card-complete"
      : isInProgress
      ? "order-card-in-progress"
      : "";
    return `
      <div class="order-card ${cardClass}">
        <div class="order-card-left">
          <h3>
            SO #${order.so}
            <span class="status-badge ${getStatusClass(order.status)}">${getStatusLabel(order.status)}</span>
          </h3>
          <div class="order-meta"><strong>Aisle:</strong> ${order.aisle || order.binCode || "-"}</div>
          <div class="order-carrier">Carrier: ${order.carrier}</div>
          <div class="order-carrier">SKU: ${order.sku}</div>
          <div class="order-carrier">Tote: ${order.toteLp || "-"}</div>
        </div>

        <div class="order-card-right">
          ${
            order.status === "Packed"
              ? `<button class="action-btn completed-btn" disabled>Packed</button>`
              : order.status === "Ready for Packing"
              ? `<button class="action-btn completed-btn" disabled>Completed</button>`
              : `<button class="action-btn" onclick="startPick('${order.so}')">${order.status === "In Progress" ? "▷ Continue" : "▷ Start Pick"}</button>`
          }
        </div>
      </div>
    `;
  }).join("");
}

function startPick(so) {
  const order = (window.appState.orders || []).find(o => String(o.so) === String(so));
  if (!order) return;

  order.status = "In Progress";
  order.tripStartTime = order.tripStartTime || new Date().toISOString();
  window.appState.currentOrder = order;

  saveState();
  renderPickingWorkflow();
  showScreen("pickingWorkflow");
}

function renderPickingWorkflow() {
  const order = window.appState.currentOrder;
  if (!order) return;

  document.getElementById("pickSoTitle").textContent = "";
  document.getElementById("pickAisle").textContent = order.aisle || order.binCode || "UNMAPPED";
  document.getElementById("pickSku").textContent = order.sku || "";
  document.getElementById("pickCarrier").textContent = order.carrier || "";
  document.getElementById("pickSoNumber").textContent = order.so || "";
  document.getElementById("pickShelf").textContent =
    typeof getShelfByCarrier === "function" ? getShelfByCarrier(order.carrier || "") : "Shelf";

  document.getElementById("manualSkuInput").value = "";
  document.getElementById("manualToteInput").value = "";
  document.getElementById("exceptionReason").value = "";
  document.getElementById("skuValidationMessage").textContent = "";
  document.getElementById("skuValidationMessage").className = "message-box";
  document.getElementById("toteValidationMessage").textContent = "";
  document.getElementById("toteValidationMessage").className = "message-box";
  document.getElementById("toteSection").style.display = "none";

  const skuInput = document.getElementById("manualSkuInput");
  const toteInput = document.getElementById("manualToteInput");
  if (skuInput) {
    window.setTimeout(() => skuInput.focus(), 80);
  }
  if (toteInput) toteInput.blur();
}

function validateSku() {
  const order = window.appState.currentOrder;
  if (!order) return;

  const enteredSku = String(document.getElementById("manualSkuInput").value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  const expectedSku = String(order.sku || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  const msg = document.getElementById("skuValidationMessage");

  if (!enteredSku) {
    msg.textContent = "Please scan or enter SKU.";
    msg.className = "message-box message-error";
    return;
  }

  if (enteredSku === expectedSku) {
    msg.textContent = "MATCHED - GO AHEAD";
    msg.className = "message-box message-success";
    document.getElementById("toteSection").style.display = "block";
    const toteInput = document.getElementById("manualToteInput");
    if (toteInput) window.setTimeout(() => toteInput.focus(), 80);
  } else {
    msg.textContent = "WRONG PICK";
    msg.className = "message-box message-error";
  }
}

function saveException() {
  const order = window.appState.currentOrder;
  if (!order) return;

  const reason = document.getElementById("exceptionReason").value;
  const msg = document.getElementById("skuValidationMessage");

  if (!reason) {
    msg.textContent = "Please select an exception reason.";
    msg.className = "message-box message-error";
    return;
  }

  order.status = "Exception";
  order.exceptionReason = reason;
  order.tripEndTime = new Date().toISOString();

  window.appState.currentOrder = null;
  saveState();

  renderPickerDashboard();
  if (typeof renderAdminSummary === "function") renderAdminSummary();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();

  showScreen("pickerLogin");
}

function parsePickerToteLP(rawValue = "") {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return { isValid: false, carrier: "", toteNo: "", normalized: "" };
  }

  const compact = raw.toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^TOTE[\|\-\/]?([A-Z]+)[\|\-\/]?(\d{3})$/);

  if (!match) {
    return { isValid: false, carrier: "", toteNo: "", normalized: "" };
  }

  const carrier = match[1];
  const toteNo = match[2];

  return {
    isValid: true,
    carrier,
    toteNo,
    normalized: `TOTE|${carrier}|${toteNo}`
  };
}

function validateTote() {
  const order = window.appState.currentOrder;
  if (!order) return;

  const rawTote = String(document.getElementById("manualToteInput").value || "").trim();
  const msg = document.getElementById("toteValidationMessage");

  if (!rawTote) {
    msg.textContent = "Invalid : Scan Different Tote";
    msg.className = "message-box message-error";
    return;
  }

  const parsed = parsePickerToteLP(rawTote);

  if (!parsed.isValid) {
    msg.textContent = "Invalid : Scan Different Tote";
    msg.className = "message-box message-error";
    return;
  }

  const toteLp = parsed.normalized;
  const toteCarrier = String(parsed.carrier || "").toUpperCase().replace(/\s+/g, "");
  const orderCarrier = String(order.carrier || "").toUpperCase().replace(/\s+/g, "");
  const currentPicker = String(window.appState.currentUser || "");

  // Only carrier validation here
  const carrierMatch =
    toteCarrier === orderCarrier ||
    (toteCarrier === "USPS" && orderCarrier === "USPOSTAL") ||
    (toteCarrier === "USPOSTAL" && orderCarrier === "USPS");

  if (!carrierMatch) {
    msg.textContent = "Invalid : Scan Different Tote";
    msg.className = "message-box message-error";
    return;
  }

  if (!window.appState.sickTotes) window.appState.sickTotes = {};
  if (!window.appState.toteRegistry) window.appState.toteRegistry = {};

  if (window.appState.sickTotes[toteLp]) {
    msg.textContent = "SICK TOTE - scan a fresh tote";
    msg.className = "message-box message-error";
    return;
  }

  const toteRec = window.appState.toteRegistry[toteLp];

  // Final hard active-tote block
  if (
    toteRec &&
    toteRec.status === "ACTIVE" &&
    toteRec.assignedPicker &&
    toteRec.assignedPicker !== currentPicker
  ) {
    msg.textContent = "Invalid : Scan Different Tote";
    msg.className = "message-box message-error";
    return;
  }

  const priorCarrierOrder = getOrdersForPicker(currentPicker).find(existingOrder => {
    if (String(existingOrder.so) === String(order.so)) return false;
    if (!existingOrder.toteLp) return false;
    return normalizeCarrierForPicker(existingOrder.carrier) === orderCarrier;
  });

  if (priorCarrierOrder && String(priorCarrierOrder.toteLp).toUpperCase() !== toteLp) {
    msg.textContent = "Invalid : Scan Different Tote";
    msg.className = "message-box message-error";
    return;
  }

  // Save full tote LP against SO
  order.toteLp = toteLp;
  order.status = "Ready for Packing";
  order.tripEndTime = new Date().toISOString();

  // Lock tote to picker until pack validation releases it
  window.appState.toteRegistry[toteLp] = {
    status: "ACTIVE",
    assignedPicker: currentPicker,
    carrier: orderCarrier,
    updatedAt: new Date().toISOString()
  };

  saveState();

  msg.textContent = "Pick Complete";
  msg.className = "message-box message-success";

  window.appState.currentOrder = null;

  renderPickerDashboard();
  if (typeof renderAdminSummary === "function") renderAdminSummary();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();

  showScreen("pickerLogin");
}
window.scrollToPickerOrders = scrollToPickerOrders;
