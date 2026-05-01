function getLoggedInPickerName() {
  return window.appState.currentUser || "";
}

function getCurrentPickerOrders() {
  const pickerName = getLoggedInPickerName();
  return (window.appState.orders || []).filter(order => order.assignedPicker === pickerName);
}

function getNewAssignedCount() {
  return getCurrentPickerOrders().filter(order =>
    order.status === "Assigned" && order.isNewAssignedPick === true
  ).length;
}

function getVisiblePickerOrders() {
  const pickerOrders = getCurrentPickerOrders();

  const hasOngoingOldPicks = pickerOrders.some(order =>
    !order.isNewAssignedPick &&
    ["Assigned", "In Progress", "Exception"].includes(order.status)
  );

  if (hasOngoingOldPicks) {
    return pickerOrders.filter(order =>
      ["Assigned", "In Progress", "Exception"].includes(order.status)
    );
  }

  const newPicks = pickerOrders.filter(order =>
    order.isNewAssignedPick &&
    ["Assigned", "In Progress", "Exception"].includes(order.status)
  );

  return newPicks.length
    ? newPicks
    : pickerOrders.filter(order =>
        ["Assigned", "In Progress", "Exception"].includes(order.status)
      );
}

function clearSeenNewAssignedFlags(orders) {
  let changed = false;
  (orders || []).forEach(order => {
    if (order.isNewAssignedPick) {
      order.isNewAssignedPick = false;
      changed = true;
    }
  });
  if (changed && typeof saveState === "function") saveState();
}

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
  showScreen("pickerTickets");
}

function backToPickerSummary() {
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
  const actions = document.getElementById("pickerSummaryActions");
  if (!container) return;

  const assigned = orders.filter(order => order.status === "Assigned").length;
  const inProgress = orders.filter(order => order.status === "In Progress").length;
  const completed = orders.filter(order => ["Ready for Packing", "Packed", "Exception"].includes(order.status)).length;
  const newAssignedCount = getNewAssignedCount();

  container.innerHTML = `
    <button class="picker-status-card" type="button" onclick="openPickerTickets()">
      <div class="label">
        Assigned
        ${newAssignedCount > 0 ? `<span class="new-pick-badge">!</span>` : ``}
      </div>
      <div class="value">${assigned}</div>
    </button>
    <button class="picker-status-card" type="button" onclick="openPickerTickets()">
      <div class="label">In Progress</div>
      <div class="value">${inProgress}</div>
    </button>
    <button class="picker-status-card" type="button" onclick="openPickerTickets()">
      <div class="label">Completed</div>
      <div class="value">${completed}</div>
    </button>
  `;

  if (actions) {
    actions.innerHTML = `
      <button class="secondary-btn" type="button" onclick="openPickerTickets()">View assigned tickets</button>
      <button class="secondary-btn" type="button" onclick="logoutPicker()">Logout</button>
    `;
  }
}

function openPickerTickets() {
  const visibleOrders = getVisiblePickerOrders();
  clearSeenNewAssignedFlags(visibleOrders);
  renderPickerDashboard();
  showScreen("pickerTickets");
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
function parseWarehouseBinLocation(order) {
  const value = String(order.binCode || order.aisle || "").trim().toUpperCase();

  const match = value.match(/A\s*0*([0-9]+)/);
  const aisleNum = match ? parseInt(match[1], 10) : 9999;

  const positionMatch = value.match(/([0-9]{2,4})$/);
  const position = positionMatch ? parseInt(positionMatch[1], 10) : 9999;

  return {
    aisleNum,
    position
  };
}

function getZoneForAisle(aisleNum) {
  if (aisleNum >= 1 && aisleNum <= 5) return "ZONE_1";
  if (aisleNum >= 6 && aisleNum <= 10) return "ZONE_2";
  if (aisleNum >= 11 && aisleNum <= 15) return "ZONE_3";
  if (aisleNum >= 16 && aisleNum <= 20) return "ZONE_4";
  return "UNMAPPED";
}

function getSnakeSequence(order) {
  const loc = parseWarehouseBinLocation(order);
  const isEvenAisle = loc.aisleNum % 2 === 0;

  const snakePosition = isEvenAisle
    ? 9999 - loc.position
    : loc.position;

  return {
    zone: getZoneForAisle(loc.aisleNum),
    aisleNum: loc.aisleNum,
    snakePosition
  };
}

function compareOrdersByOptimizedRoute(a, b) {
  const aNew = a.isNewAssignedPick ? 1 : 0;
  const bNew = b.isNewAssignedPick ? 1 : 0;

  if (bNew !== aNew) return bNew - aNew;

  if (a.status === "In Progress" && b.status !== "In Progress") return -1;
  if (b.status === "In Progress" && a.status !== "In Progress") return 1;

  const routeA = getSnakeSequence(a);
  const routeB = getSnakeSequence(b);

  if (routeA.zone !== routeB.zone) {
    return routeA.zone.localeCompare(routeB.zone);
  }

  if (routeA.aisleNum !== routeB.aisleNum) {
    return routeA.aisleNum - routeB.aisleNum;
  }

  return routeA.snakePosition - routeB.snakePosition;
}
function renderPickerDashboard() {
  const pickerName = window.appState.currentUser;
  const ordersEl = document.getElementById("pickerOrders");
  const nameEl = document.getElementById("loggedInPickerName");
  const banner = document.getElementById("pickerCompletionBanner");
  const topBackBtn =
    document.getElementById("pickerTicketsBackBtn") ||
    document.querySelector('#pickerTickets button[onclick="backToPickerSummary()"], #pickerTickets button[onclick="backToPicker()"]');

  if (nameEl) {
    nameEl.textContent = pickerName ? "Welcome, " + pickerName : "Welcome, Picker 1";
  }

  if (!pickerName) {
    renderPickerStatusBlocks([]);
    if (ordersEl) ordersEl.innerHTML = "";
    if (banner) {
      banner.style.display = "none";
      banner.innerHTML = "";
    }
    if (topBackBtn) topBackBtn.style.display = "";
    return;
  }

  const allOrders = getOrdersForPicker(pickerName) || [];
  renderPickerStatusBlocks(allOrders);

  // If we are on Picker Profile page, pickerOrders may not exist.
  // Stop here safely after rendering profile blocks.
  if (!ordersEl) return;

  if (!allOrders.length) {
    ordersEl.innerHTML = "<p>No orders assigned.</p>";
    if (banner) {
      banner.style.display = "none";
      banner.innerHTML = "";
    }
    if (topBackBtn) topBackBtn.style.display = "";
    return;
  }

  const completedStatuses = ["Ready for Packing", "Packed", "Exception"];
  const activeStatuses = ["Assigned", "In Progress", "Exception"];

  const allDone = allOrders.length > 0 && allOrders.every(order =>
    completedStatuses.includes(order.status)
  );

  if (banner) {
    if (allDone) {
      banner.style.display = "block";
      banner.innerHTML = `
        <div class="picker-banner-emoji">😊</div>
        <div class="picker-banner-title">Congrats</div>
        <div class="picker-banner-copy">All picks in this lot are complete.</div>
        <button class="picker-back-arrow" type="button" onclick="backToPickerSummary()">← Back to Picker Profile</button>
      `;
      if (topBackBtn) topBackBtn.style.display = "none";
    } else {
      banner.style.display = "none";
      banner.innerHTML = "";
      if (topBackBtn) topBackBtn.style.display = "";
    }
  }

  if (allDone) {
    ordersEl.innerHTML = "";
    return;
  }

  let visibleOrders = getVisiblePickerOrders() || [];

  if (!visibleOrders.length) {
    visibleOrders = allOrders.filter(order => activeStatuses.includes(order.status));
  }

  if (!visibleOrders.length) {
    ordersEl.innerHTML = "<p>No active tickets.</p>";
    return;
  }

  visibleOrders.sort(compareOrdersByOptimizedRoute);
  ordersEl.innerHTML = visibleOrders.map(order => {
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
            ${order.isNewAssignedPick ? `<span class="new-pick-badge">!</span>` : ``}
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

  order.isNewAssignedPick = false;
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
    const skuInput = document.getElementById("manualSkuInput");
    if (skuInput) {
      skuInput.value = "";
      window.setTimeout(() => skuInput.focus(), 50);
    }
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

  showScreen("pickerTickets");
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
    const toteInput = document.getElementById("manualToteInput");
    if (toteInput) {
      toteInput.value = "";
      window.setTimeout(() => toteInput.focus(), 50);
    }
    return;
  }

  const parsed = parsePickerToteLP(rawTote);

  if (!parsed.isValid) {
    msg.textContent = "Invalid : Scan Different Tote";
    msg.className = "message-box message-error";
    const toteInput = document.getElementById("manualToteInput");
    if (toteInput) {
      toteInput.value = "";
      window.setTimeout(() => toteInput.focus(), 50);
    }
    return;
  }

  const toteLp = parsed.normalized;
  const toteCarrier = String(parsed.carrier || "").toUpperCase().replace(/\s+/g, "");
  const orderCarrier = String(order.carrier || "").toUpperCase().replace(/\s+/g, "");
  const currentPicker = String(window.appState.currentUser || "");

  const carrierMatch =
    toteCarrier === orderCarrier ||
    (toteCarrier === "USPS" && orderCarrier === "USPOSTAL") ||
    (toteCarrier === "USPOSTAL" && orderCarrier === "USPS");

  if (!carrierMatch) {
    msg.textContent = "Invalid : Scan Different Tote";
    msg.className = "message-box message-error";
    const toteInput = document.getElementById("manualToteInput");
    if (toteInput) {
      toteInput.value = "";
      window.setTimeout(() => toteInput.focus(), 50);
    }
    return;
  }

  if (!window.appState.sickTotes) window.appState.sickTotes = {};
  if (!window.appState.toteRegistry) window.appState.toteRegistry = {};

  if (window.appState.sickTotes[toteLp]) {
    msg.textContent = "SICK TOTE - scan a fresh tote";
    msg.className = "message-box message-error";
    const toteInput = document.getElementById("manualToteInput");
    if (toteInput) {
      toteInput.value = "";
      window.setTimeout(() => toteInput.focus(), 50);
    }
    return;
  }

  const toteRec = window.appState.toteRegistry[toteLp];

  if (
    toteRec &&
    toteRec.status === "ACTIVE" &&
    toteRec.assignedPicker &&
    toteRec.assignedPicker !== currentPicker
  ) {
    msg.textContent = "Invalid : Scan Different Tote";
    msg.className = "message-box message-error";
    const toteInput = document.getElementById("manualToteInput");
    if (toteInput) {
      toteInput.value = "";
      window.setTimeout(() => toteInput.focus(), 50);
    }
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
    const toteInput = document.getElementById("manualToteInput");
    if (toteInput) {
      toteInput.value = "";
      window.setTimeout(() => toteInput.focus(), 50);
    }
    return;
  }

  order.toteLp = toteLp;
  order.status = "Ready for Packing";
  order.tripEndTime = new Date().toISOString();
  order.isNewAssignedPick = false;

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

  showScreen("pickerTickets");
}

window.openPickerTickets = openPickerTickets;
window.backToPickerSummary = backToPickerSummary;
