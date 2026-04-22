async function loadTotes() {
  try {
    const res = await fetch("data/totes.json");
    window.appState.totes = await res.json();
    saveState();
  } catch (e) {
    window.appState.totes = [];
    saveState();
  }
}

function mapImportedRow(row) {
  const binCode =
    row["Bin_Code"] ||
    row["Bin Code"] ||
    row["BIN_CODE"] ||
    row["Bin"] ||
    row["bin_code"] ||
    "";

  return {
    pickNo: row["No_"] || row["No"] || "",
    so: row["Source_No_"] || row["Source No"] || row["SO"] || "",
    binCode: binCode,
    sku: row["Item_No_"] || row["Item No"] || row["SKU"] || "",
    qty: row["Qty___Base_"] || row["Qty"] || 0,
    description: row["Description"] || "",
    carrier: row["ShippingAgentCode"] || row["Shipping Agent Code"] || row["Carrier"] || "",
    aisle: String(binCode || "").trim() || "UNMAPPED",
    assignedPicker: null,
    status: "Assigned",
    tripStartTime: null,
    tripEndTime: null,
    toteLp: null,
    exceptionReason: null,
    skuScanValue: null,
    packTime: null
  };
}

function assignOrdersToPickers(orderList, pickerCount) {
  const pickerNames = window.appState.pickers.slice(0, pickerCount);

  orderList.sort((a, b) => String(a.aisle || "").localeCompare(String(b.aisle || "")));

  orderList.forEach((order, index) => {
    order.assignedPicker = pickerNames[index % pickerNames.length];
  });

  return orderList;
}

function importOrders() {
  const fileInput = document.getElementById("orderFile");
  const pickerCount = parseInt(document.getElementById("pickerCount").value, 10);

  if (!fileInput.files.length) {
    alert("Please select the Excel file first.");
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const sheet = workbook.Sheets["Data"] || workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    let orders = rows.map(mapImportedRow);
    orders = assignOrdersToPickers(orders, pickerCount);

    window.appState.orders = orders;
    window.appState.sickTotes = {};
    window.appState.toteRegistry = {};
    window.appState.resolvedExceptions = [];
    window.currentExceptionCategory = null;
    window.currentPackingModePage = null;
    saveState();

    renderAdminSummary();
    renderSickToteList();

    const detailsEl = document.getElementById("adminExceptionDetails");
    if (detailsEl) detailsEl.innerHTML = "";

    if (typeof renderPickerDashboard === "function") renderPickerDashboard();
    if (typeof renderPackerDashboard === "function") renderPackerDashboard();
    if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();

    alert(`Imported ${orders.length} orders across ${pickerCount} picker(s).`);
  };

  reader.readAsArrayBuffer(file);
}

function resetTrialPicks() {
  if (!window.appState.orders || !window.appState.orders.length) {
    alert("No trial data available to reset.");
    return;
  }

  window.appState.orders.forEach(order => {
    order.status = "Assigned";
    order.tripStartTime = null;
    order.tripEndTime = null;
    order.toteLp = null;
    order.exceptionReason = null;
    order.packTime = null;
    order.isNewAssignedPick = false;
    order.newAssignedAt = null;
    order.adminDecision = null;
    order.adminComment = null;
    order.adminImage = null;
    order.adminReviewedAt = null;
    order.adminPriority = false;
  });

  window.appState.currentOrder = null;
  window.appState.sickTotes = {};
  window.appState.toteRegistry = {};
  window.appState.resolvedExceptions = [];
  window.currentExceptionCategory = null;
  window.currentPackingModePage = null;
  saveState();

  renderAdminSummary();
  renderSickToteList();

  const detailsEl = document.getElementById("adminExceptionDetails");
  if (detailsEl) detailsEl.innerHTML = "";

  if (typeof renderPickerDashboard === "function") renderPickerDashboard();
  if (typeof renderPackerDashboard === "function") renderPackerDashboard();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();

  alert("Trial picks have been reset.");
}

function completeAllPicksTrial() {
  if (!window.appState.orders || !window.appState.orders.length) {
    alert("No orders available.");
    return;
  }

  window.appState.orders.forEach(order => {
    order.status = "Ready for Packing";
    if (!order.tripStartTime) {
      order.tripStartTime = new Date().toISOString();
    }
    order.tripEndTime = new Date().toISOString();
  });

  saveState();

  renderAdminSummary();
  renderSickToteList();

  if (typeof renderPickerDashboard === "function") renderPickerDashboard();
  if (typeof renderPackerDashboard === "function") renderPackerDashboard();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();

  alert("All picks marked as completed for trial.");
}

function showExceptionDetails(pickerName) {
  const detailsEl = document.getElementById("adminExceptionDetails");
  if (!detailsEl) return;

  const exceptions = window.appState.orders.filter(order =>
    order.assignedPicker === pickerName && order.status === "Exception"
  );

  if (!exceptions.length) {
    detailsEl.innerHTML = `<p style="margin-top:20px;">No exceptions for ${pickerName}.</p>`;
    return;
  }

  detailsEl.innerHTML = `
    <h3 style="margin-top:30px;">Exception Details - ${pickerName}</h3>
    <table border="1" cellpadding="8" cellspacing="0" style="margin:20px auto; background:white;">
      <thead>
        <tr>
          <th>SO No</th>
          <th>SKU</th>
          <th>Bin No</th>
          <th>Aisle</th>
          <th>Date & Time</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        ${exceptions.map(order => `
          <tr>
            <td>${order.so}</td>
            <td>${order.sku}</td>
            <td>${order.binCode || ""}</td>
            <td>${order.aisle || ""}</td>
            <td>${order.tripEndTime ? new Date(order.tripEndTime).toLocaleString() : "-"}</td>
            <td>${order.exceptionReason || "-"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function downloadExceptionsExcel() {
  const active = getActiveExceptionItems();

  if (!active.length) {
    alert("No exceptions available to download.");
    return;
  }

  const exportRows = active.map(item => ({
    Type: item.type === "sick" ? "Sick Tote" : "Picking",
    Picker: item.picker || "",
    "SO No": item.so || "",
    SKU: item.sku || "",
    Carrier: item.carrier || "",
    "Tote LP": item.toteLp || "",
    Aisle: item.aisle || "",
    Reason: item.reason || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Exceptions");
  XLSX.writeFile(workbook, "Exceptions_Report.xlsx");
}

function clearSickTote() {
  const input = document.getElementById("adminSickToteInput");
  if (!input) return;

  const tote = String(input.value || "").trim().toUpperCase();
  if (!tote) {
    alert("Enter Tote LP first.");
    return;
  }

  delete window.appState.sickTotes[tote];
  if (!window.appState.toteRegistry) window.appState.toteRegistry = {};
  window.appState.toteRegistry[tote] = {
    status: "OPEN",
    assignedPicker: null,
    updatedAt: new Date().toISOString()
  };

  saveState();

  renderSickToteList();
  if (typeof renderPackerDashboard === "function") renderPackerDashboard();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();

  alert(`Sick Tote cleared: ${tote}`);
  input.value = "";
  if (typeof renderExceptionHandling === "function") renderExceptionHandling();
}

function renderSickToteList() {
  const el = document.getElementById("adminSickToteList");
  if (!el) return;

  const entries = Object.entries(window.appState.sickTotes || {});
  if (!entries.length) {
    el.innerHTML = "<p style='margin-top:20px;'>No Sick Totes.</p>";
    return;
  }

  el.innerHTML = `
    <h3 style="margin-top:30px;">Sick Totes</h3>
    <table border="1" cellpadding="8" cellspacing="0" style="margin:20px auto; background:white; width:95%;">
      <thead>
        <tr>
          <th>Tote LP</th>
          <th>Created</th>
          <th>Exception Count</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(([toteLp, data]) => `
          <tr>
            <td>${toteLp}</td>
            <td>${data.createdAt ? new Date(data.createdAt).toLocaleString() : "-"}</td>
            <td>${(data.exceptions || []).length}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAdminSummary() {
  const summaryEl = document.getElementById("adminSummary");
  if (!summaryEl) return;

  if (!window.appState.orders.length) {
    summaryEl.innerHTML = "<p>No orders imported yet.</p>";
    return;
  }

  const counts = {};

  window.appState.pickers.forEach(picker => {
    counts[picker] = {
      total: 0,
      remaining: 0,
      completed: 0,
      exception: 0
    };
  });

  window.appState.orders.forEach(order => {
    const picker = order.assignedPicker;
    if (!picker) return;

    counts[picker].total += 1;

    if (order.status === "Ready for Packing" || order.status === "Packed") {
      counts[picker].completed += 1;
    } else if (order.status === "Exception") {
      counts[picker].exception += 1;
      counts[picker].remaining += 1;
    } else {
      counts[picker].remaining += 1;
    }
  });

  summaryEl.innerHTML = `
    <h3>Picker Assignment Summary</h3>
    <table border="1" cellpadding="8" cellspacing="0" style="margin:20px auto; background:white;">
      <thead>
        <tr>
          <th>Picker</th>
          <th>Remaining / Total</th>
          <th>Completed</th>
          <th>Exceptions</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(counts).map(([picker, c]) => `
          <tr>
            <td>${picker}</td>
            <td>${c.remaining} / ${c.total}</td>
            <td>${c.completed}</td>
            <td>
              <button onclick="showExceptionDetails('${picker}')" style="padding:4px 10px; border-radius:6px; cursor:pointer;">
                ${c.exception}
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  renderSickToteList();

  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();
}

function getOngoingPickers() {
  const names = new Set();
  (window.appState.orders || []).forEach(order => {
    if (order.assignedPicker && !["Packed"].includes(order.status)) names.add(order.assignedPicker);
  });
  return Array.from(names);
}

function normalizeExceptionReason(value) {
  return String(value || "").trim();
}

function getActiveExceptionItems() {
  const items = [];
  const resolved = window.appState.resolvedExceptions || [];
  const resolvedKeys = new Set(resolved.map(item => item.key));

  (window.appState.orders || []).forEach(order => {
    if (order.status === "Exception") {
      const key = `order:${order.so}`;
      if (!resolvedKeys.has(key)) {
        items.push({
          key,
          type: "pick",
          so: order.so,
          sku: order.sku,
          picker: order.assignedPicker || "-",
          carrier: order.carrier || "-",
          toteLp: order.toteLp || "-",
          reason: order.exceptionReason || "-",
          aisle: order.aisle || order.binCode || "-",
          shelf: order.binCode || "-",
          orderRef: order
        });
      }
    }
  });

  Object.entries(window.appState.sickTotes || {}).forEach(([toteLp, data]) => {
    const key = `sick:${toteLp}`;
    if (resolvedKeys.has(key)) return;

    const exceptions = data.exceptions || [];
    const missingItems = exceptions.filter(x => String(x.reason || "").toLowerCase() === "missing sku");
    const additionalItems = exceptions.filter(x => String(x.reason || "").toLowerCase() !== "missing sku");

    items.push({
      key,
      type: "sick",
      so: (missingItems[0] || additionalItems[0] || {}).so || "-",
      sku: (missingItems[0] || additionalItems[0] || {}).scannedSku || "-",
      picker: (missingItems[0] || additionalItems[0] || {}).picker || "-",
      carrier: (missingItems[0] || additionalItems[0] || {}).carrier || "-",
      toteLp,
      reason: "Sick Tote",
      aisle: (missingItems[0] || {}).aisle || "-",
      shelf: (missingItems[0] || {}).expectedBin || "-",
      sickData: data,
      missingItems,
      additionalItems
    });
  });

  return items;
}

window.currentExceptionCategory = null;
window.currentPackingModePage = null;

function setExceptionCategory(category) {
  window.currentExceptionCategory = category;
  window.currentPackingModePage = null;

  const pickBtn = document.getElementById("exceptionTabPicking");
  const packBtn = document.getElementById("exceptionTabPacking");
  const packControls = document.getElementById("packingExceptionControls");

  if (pickBtn) pickBtn.classList.toggle("active-toggle", category === "pick");
  if (packBtn) packBtn.classList.toggle("active-toggle", category === "pack");
  if (packControls) packControls.style.display = category === "pack" ? "flex" : "none";

  renderExceptionHandling();
}

function openPackingModePage(mode) {
  window.currentPackingModePage = mode;
  renderExceptionHandling();
}

function backToPackingModes() {
  window.currentPackingModePage = null;
  renderExceptionHandling();
}

function downloadFinalReportExcel() {
  const rows = (window.appState.resolvedExceptions || []).map(r => ({
    Key: r.key || "",
    ExceptionType: r.exceptionType || "",
    ResolutionType: r.resolutionType || "",
    Decision: r.decision || "",
    Comment: r.comment || "",
    Image: r.imageName || "",
    HandledBy: r.handledBy || "",
    ReviewedAt: r.reviewedAt || ""
  }));
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: "No resolved exceptions yet" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Final Report");
  XLSX.writeFile(wb, "final_exception_report.xlsx");
}

function backToAdminDashboard() {
  renderAdminSummary();
  window.currentPackingModePage = null;
  showScreen("adminDashboard");
}

function openExceptionHandling() {
  renderExceptionHandling();
  showScreen("adminExceptionScreen");
}

function handleExceptionDecisionChange(key) {
  const select = document.getElementById(`decision-${key}`);
  const pickerWrap = document.getElementById(`reassign-wrap-${key}`);
  const commentWrap = document.getElementById(`comment-wrap-${key}`);
  const imageWrap = document.getElementById(`image-wrap-${key}`);
  const value = select ? select.value : "";

  if (pickerWrap) pickerWrap.style.display = value === "Reassign" ? "block" : "none";
  if (commentWrap) commentWrap.style.display = ["Damage Hold", "Other"].includes(value) ? "block" : "none";
  if (imageWrap) imageWrap.style.display = ["Approve Exception", "Damage Hold"].includes(value) ? "block" : "none";
}

function pushOrderToTopForPicker(targetOrder) {
  const orders = window.appState.orders || [];
  const index = orders.findIndex(o => String(o.so) === String(targetOrder.so));
  if (index <= 0) return;
  const item = orders.splice(index, 1)[0];
  let insertIndex = orders.findIndex(o => o.assignedPicker === item.assignedPicker);
  if (insertIndex < 0) insertIndex = 0;
  orders.splice(insertIndex, 0, item);
}

function normalizeAisleValue(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/^([A-Z]+)\s*0*([0-9]+)/);
  if (!match) return { raw: text, prefix: text, num: 9999 };
  return { raw: text, prefix: match[1], num: parseInt(match[2], 10) || 0 };
}

function getPickerActiveOrders(pickerName) {
  return (window.appState.orders || []).filter(order =>
    order.assignedPicker === pickerName &&
    ["Assigned", "In Progress"].includes(order.status)
  );
}

function getSuggestedPickerForMissingSku(item) {
  const ongoingPickers = getOngoingPickers();
  if (!ongoingPickers.length) return null;

  const targetAisle = normalizeAisleValue(item.aisle);
  let best = null;

  ongoingPickers.forEach(picker => {
    const orders = getPickerActiveOrders(picker);
    if (!orders.length) return;

    const currentAisles = orders.map(o => normalizeAisleValue(o.aisle || o.binCode || ""));
    let bestDistance = 9999;

    currentAisles.forEach(a => {
      const samePrefix = a.prefix === targetAisle.prefix;
      const distance = samePrefix ? Math.abs(a.num - targetAisle.num) : 500 + Math.abs(a.num - targetAisle.num);
      if (distance < bestDistance) bestDistance = distance;
    });

    const placement = bestDistance <= 1 ? "current_trip" : "end_queue";
    const reason = bestDistance <= 1
      ? `Currently active near aisle ${item.aisle}. Add to current trip.`
      : `Currently active but farther from aisle ${item.aisle}. Add to end of queue.`;

    if (!best || bestDistance < best.distance) {
      best = {
        picker,
        distance: bestDistance,
        placement,
        reason
      };
    }
  });

  return best;
}

function insertReassignedOrderByAisle(order, pickerName, placement) {
  const orders = window.appState.orders || [];
  order.assignedPicker = pickerName;
  order.status = "Assigned";
  order.exceptionReason = null;
  order.adminPriority = true;
  order.reassignedAt = new Date().toISOString();

  const existingIndex = orders.findIndex(o => String(o.so) === String(order.so));
  if (existingIndex >= 0) orders.splice(existingIndex, 1);

  const pickerIndexes = orders
    .map((o, i) => ({ o, i }))
    .filter(x => x.o.assignedPicker === pickerName && ["Assigned", "In Progress"].includes(x.o.status));

  if (!pickerIndexes.length) {
    orders.unshift(order);
    return;
  }

  if (placement === "current_trip") {
    const target = normalizeAisleValue(order.aisle || order.binCode || "");
    let insertAt = pickerIndexes[pickerIndexes.length - 1].i + 1;

    for (let x of pickerIndexes) {
      const current = normalizeAisleValue(x.o.aisle || x.o.binCode || "");
      if (current.prefix === target.prefix && current.num >= target.num) {
        insertAt = x.i;
        break;
      }
    }
    orders.splice(insertAt, 0, order);
  } else {
    const insertAt = pickerIndexes[pickerIndexes.length - 1].i + 1;
    orders.splice(insertAt, 0, order);
  }
}

function renderExceptionHandling() {
  const listEl = document.getElementById("adminExceptionList");
  const emptyEl = document.getElementById("adminNoExceptionMessage");
  if (!listEl || !emptyEl) return;

  const allItems = getActiveExceptionItems();
  const category = window.currentExceptionCategory;

  if (!category) {
    emptyEl.textContent = "Select Picking Exceptions or Packing Exceptions";
    emptyEl.style.display = "block";
    emptyEl.style.color = "";
    listEl.innerHTML = "";
    return;
  }

  if (category === "pick") {
    const items = allItems.filter(item => item.type === "pick");

    if (!items.length) {
      emptyEl.textContent = "No more picking exceptions";
      emptyEl.style.display = "block";
      emptyEl.style.color = "green";
      listEl.innerHTML = `
        <div class="packing-empty-state">
          <button class="secondary-btn" onclick="backToAdminDashboard()">Back to Admin Pick & Pack</button>
        </div>
      `;
      return;
    }

    emptyEl.style.display = "none";
    emptyEl.style.color = "";

    const pickerOptions = getOngoingPickers().map(name => `<option value="${name}">${name}</option>`).join("");

    listEl.innerHTML = `<div class="exception-list">${items.map(item => `
      <div class="exception-card">
        <h3>Picking Exception - ${item.key}</h3>
        <div class="exception-meta">
          <div><strong>Picker:</strong> ${item.picker}</div>
          <div><strong>SO:</strong> ${item.so}</div>
          <div><strong>SKU:</strong> ${item.sku}</div>
          <div><strong>Carrier:</strong> ${item.carrier}</div>
          <div><strong>Tote LP:</strong> ${item.toteLp}</div>
          <div><strong>Reason:</strong> ${item.reason}</div>
        </div>

        <div class="exception-actions">
          <div>
            <label>Decision</label>
            <select id="decision-${item.key}" onchange="handleExceptionDecisionChange('${item.key}')">
              <option value="">Select decision</option>
              <option>Approve Exception</option>
              <option>Reject Exception</option>
              <option>Reassign</option>
              <option>Short Pick / Inventory Issue</option>
              <option>Damage Hold</option>
              <option>Other</option>
            </select>
          </div>
          <div id="reassign-wrap-${item.key}" style="display:none;">
            <label>Reassign to picker</label>
            <select id="reassign-${item.key}">
              <option value="">Select picker</option>
              ${pickerOptions}
            </select>
          </div>
          <div id="image-wrap-${item.key}" style="display:none;">
            <label>Upload image</label>
            <input type="file" id="image-${item.key}" accept="image/*" />
          </div>
          <div id="comment-wrap-${item.key}" class="full" style="display:none;">
            <label>Comment</label>
            <input type="text" id="comment-${item.key}" placeholder="Enter details" />
          </div>
          <div>
            <button onclick="saveExceptionDecision('${item.key}')">Save Decision</button>
          </div>
        </div>
      </div>
    `).join("")}</div>`;
    return;
  }

  const packingItems = allItems.filter(item => item.type === "sick");
  const missingItems = packingItems.filter(item => (item.missingItems || []).length > 0);
  const additionalItems = packingItems.filter(item => (item.additionalItems || []).length > 0);

  if (!packingItems.length) {
    emptyEl.textContent = "No more packing exceptions";
    emptyEl.style.display = "block";
    emptyEl.style.color = "green";
    listEl.innerHTML = `
      <div class="packing-empty-state">
        <button class="secondary-btn" onclick="backToAdminDashboard()">Back to Admin Pick & Pack</button>
      </div>
    `;
    return;
  }

  emptyEl.style.display = "none";
  emptyEl.style.color = "";

  if (!window.currentPackingModePage) {
    listEl.innerHTML = `
      <div class="packing-mode-home">
        <div class="packing-mode-card" onclick="openPackingModePage('missing')">
          <div class="packing-mode-title">Missing SKU</div>
          <div class="packing-mode-count">Total ${missingItems.length} totes</div>
        </div>

        <div class="packing-mode-card" onclick="openPackingModePage('additional')">
          <div class="packing-mode-title">Additional SKU</div>
          <div class="packing-mode-count">Total ${additionalItems.length} totes</div>
        </div>
      </div>
    `;
    return;
  }

  if (window.currentPackingModePage === "missing") {
    renderPackingMissingPage(missingItems, listEl, emptyEl);
    return;
  }

  if (window.currentPackingModePage === "additional") {
    renderPackingAdditionalPage(additionalItems, listEl, emptyEl);
    return;
  }
}

function renderPackingMissingPage(items, listEl, emptyEl) {
  if (!items.length) {
    emptyEl.textContent = "No missing SKU exceptions";
    emptyEl.style.display = "block";
    emptyEl.style.color = "green";
    listEl.innerHTML = `
      <div class="packing-empty-state">
        <button class="secondary-btn" onclick="backToPackingModes()">Back</button>
        <button class="secondary-btn" onclick="backToAdminDashboard()">Back to Admin Pick & Pack</button>
      </div>
    `;
    return;
  }

  emptyEl.style.display = "none";

  listEl.innerHTML = `
    <div class="packing-subpage-header">
      <button class="secondary-btn" onclick="backToPackingModes()">← Back</button>
      <div class="packing-subpage-title">Missing SKU</div>
    </div>

    <div class="exception-list">
      ${items.map(item => {
        const firstMissing = (item.missingItems || [])[0] || {};
        const suggestion = getSuggestedPickerForMissingSku({
          aisle: firstMissing.aisle || item.aisle,
          shelf: firstMissing.expectedBin || item.shelf
        });

        const pickerOptions = getOngoingPickers().map(name => `<option value="${name}">${name}</option>`).join("");

        return `
          <div class="packing-exception-clean-card">
            <div class="packing-exception-title">SO ${item.so}</div>

            <div class="packing-exception-details">
              <div><strong>SKU:</strong> ${firstMissing.scannedSku || item.sku || "-"}</div>
              <div><strong>Reason:</strong> Missing SKU</div>
              <div><strong>Aisle:</strong> ${firstMissing.aisle || item.aisle || "-"}</div>
              <div><strong>Shelf:</strong> ${firstMissing.expectedBin || item.shelf || "-"}</div>
            </div>

            <div class="packing-exception-suggestion">
              <div class="suggestion-label">Recommended picker</div>
              <div class="suggestion-value">${suggestion ? suggestion.picker : "No active picker suggestion"}</div>
              <div class="suggestion-reason">${suggestion ? suggestion.reason : "Assign manually."}</div>
            </div>

            ${suggestion ? `
              <div class="packing-exception-actions">
                <button onclick="assignSuggestedPackingReassignment('${item.key}', '${suggestion.picker}', '${suggestion.placement}')">
                  Assign to ${suggestion.picker}
                </button>
                <button class="secondary-btn" onclick="togglePackingOverride('${item.key}')">Choose another picker</button>
              </div>
            ` : ""}

            <div id="packing-override-${item.key}" class="packing-exception-picker-select" style="display:${suggestion ? "none" : "block"};">
              <label>Assign to picker</label>
              <select id="pack-reassign-${item.key}">
                <option value="">Select picker</option>
                ${pickerOptions}
              </select>
              <div class="packing-exception-actions" style="margin-top:10px;">
                <button onclick="savePackingMissingReassignment('${item.key}')">Save Reassignment</button>
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderPackingAdditionalPage(items, listEl, emptyEl) {
  if (!items.length) {
    emptyEl.textContent = "No additional SKU exceptions";
    emptyEl.style.display = "block";
    emptyEl.style.color = "green";
    listEl.innerHTML = `
      <div class="packing-empty-state">
        <button class="secondary-btn" onclick="backToPackingModes()">Back</button>
        <button class="secondary-btn" onclick="backToAdminDashboard()">Back to Admin Pick & Pack</button>
      </div>
    `;
    return;
  }

  emptyEl.style.display = "none";

  listEl.innerHTML = `
    <div class="packing-subpage-header">
      <button class="secondary-btn" onclick="backToPackingModes()">← Back</button>
      <div class="packing-subpage-title">Additional SKU</div>
    </div>

    <div class="exception-list">
      ${items.map(item => `
        <div class="packing-exception-clean-card">
          <div class="packing-exception-title">Tote ${item.toteLp}</div>

          <div class="packing-exception-details">
            <div><strong>Additional SKU(s):</strong> ${(item.additionalItems || []).map(x => x.scannedSku).filter(Boolean).join(", ") || item.sku || "-"}</div>
            <div><strong>Returned items:</strong> ${(item.additionalItems || []).length}</div>
          </div>

          <div class="packing-exception-picker-select">
            <label>Scan tote to clear exception</label>
            <input type="text" id="pack-clear-scan-${item.key}" placeholder="Scan Tote LP" />
          </div>

          <div class="packing-exception-actions">
            <button onclick="clearAdditionalPackingExceptionByScan('${item.key}')">Verify and Clear</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function togglePackingOverride(key) {
  const el = document.getElementById(`packing-override-${key}`);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function completePackingReassignment(key, pickerName, placement) {
  const allItems = getActiveExceptionItems();
  const item = allItems.find(entry => entry.key === key);
  if (!item) return;

  const firstMissing = (item.missingItems || [])[0] || {};
  const targetSo = String(firstMissing.so || item.so || "").trim();
  const targetSku = String(firstMissing.scannedSku || item.sku || "").trim().toUpperCase();

  let relatedOrder = (window.appState.orders || []).find(order =>
    String(order.so || "").trim() === targetSo &&
    String(order.sku || "").trim().toUpperCase() === targetSku
  );

  if (!relatedOrder) {
    relatedOrder = (window.appState.orders || []).find(order =>
      String(order.sku || "").trim().toUpperCase() === targetSku &&
      ["Ready for Packing", "Packed", "Exception", "Exception Reviewed", "Inventory Hold", "Damage Hold"].includes(order.status)
    );
  }

  if (!relatedOrder) {
    relatedOrder = (window.appState.orders || []).find(order =>
      String(order.sku || "").trim().toUpperCase() === targetSku
    );
  }

  if (!relatedOrder) {
    alert("Could not find the original order line for reassignment.");
    return;
  }

  insertReassignedOrderByAisle(relatedOrder, pickerName, placement || "end_queue");
  relatedOrder.isNewAssignedPick = true;
  relatedOrder.newAssignedAt = new Date().toISOString();

  delete window.appState.sickTotes[item.toteLp];

  markResolvedException({
    key,
    decision: "Reassigned for repick",
    comment: `Reassigned to ${pickerName}`,
    imageName: "",
    reviewedAt: new Date().toISOString(),
    handledBy: "Admin",
    exceptionType: "Packing Exception",
    resolutionType: "Missing SKU"
  });

  saveState();
  renderAdminSummary();
  if (typeof renderPickerDashboard === "function") renderPickerDashboard();
  if (typeof renderPackerDashboard === "function") renderPackerDashboard();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();
  renderExceptionHandling();
}

function assignSuggestedPackingReassignment(key, pickerName, placement) {
  if (!pickerName) {
    alert("No suggested picker available.");
    return;
  }
  completePackingReassignment(key, pickerName, placement || "end_queue");
}

function savePackingMissingReassignment(key) {
  const pickerEl = document.getElementById(`pack-reassign-${key}`);
  const pickerName = pickerEl ? pickerEl.value : "";
  if (!pickerName) {
    alert("Select a picker first.");
    return;
  }

  const allItems = getActiveExceptionItems();
  const item = allItems.find(entry => entry.key === key);
  if (!item) return;

  const firstMissing = (item.missingItems || [])[0] || {};
  const suggestion = getSuggestedPickerForMissingSku({
    aisle: firstMissing.aisle || item.aisle,
    shelf: firstMissing.expectedBin || item.shelf
  });

  const placement = suggestion && suggestion.picker === pickerName ? suggestion.placement : "end_queue";
  completePackingReassignment(key, pickerName, placement);
}

function clearAdditionalPackingExceptionByScan(key) {
  const allItems = getActiveExceptionItems();
  const item = allItems.find(entry => entry.key === key);
  if (!item) return;

  const input = document.getElementById(`pack-clear-scan-${key}`);
  const scanned = String(input ? input.value : "").trim().toUpperCase();
  const expected = String(item.toteLp || "").trim().toUpperCase();

  if (!scanned) {
    alert("Scan Tote LP first.");
    return;
  }

  if (scanned !== expected) {
    alert("Tote LP does not match.");
    return;
  }

  delete window.appState.sickTotes[item.toteLp];

  markResolvedException({
    key,
    decision: "Removed Tote Exception",
    comment: "Additional item removed physically and returned to bin",
    imageName: "",
    reviewedAt: new Date().toISOString(),
    handledBy: "Admin",
    exceptionType: "Packing Exception",
    resolutionType: "Additional SKU"
  });

  saveState();
  renderAdminSummary();
  if (typeof renderPackerDashboard === "function") renderPackerDashboard();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();
  renderExceptionHandling();
}

function markResolvedException(record) {
  if (!window.appState.resolvedExceptions) window.appState.resolvedExceptions = [];
  window.appState.resolvedExceptions.push(record);
}

function saveExceptionDecision(key) {
  const allItems = getActiveExceptionItems();
  const category = window.currentExceptionCategory;
  const items = category ? allItems.filter(item => category === "pick" ? item.type === "pick" : item.type === "sick") : [];
  const item = items.find(entry => entry.key === key);
  if (!item) return;

  const decisionEl = document.getElementById(`decision-${key}`);
  const decision = decisionEl ? decisionEl.value : "";
  const reassignEl = document.getElementById(`reassign-${key}`);
  const imageEl = document.getElementById(`image-${key}`);
  const commentEl = document.getElementById(`comment-${key}`);
  const comment = commentEl ? commentEl.value.trim() : "";
  const imageName = imageEl && imageEl.files && imageEl.files[0] ? imageEl.files[0].name : "";

  if (!decision) {
    alert("Select decision first.");
    return;
  }
  if (["Approve Exception", "Damage Hold"].includes(decision) && !imageName) {
    alert("Please upload an image.");
    return;
  }
  if (["Damage Hold", "Other"].includes(decision) && !comment) {
    alert("Please enter a comment.");
    return;
  }
  if (decision === "Reassign" && !(reassignEl && reassignEl.value)) {
    alert("Select a picker to reassign.");
    return;
  }

  if (item.type === "pick") {
    const order = item.orderRef;

    if (decision === "Reject Exception") {
      order.status = "Assigned";
      order.exceptionReason = null;
      order.adminPriority = true;
      order.isNewAssignedPick = true;
      order.newAssignedAt = new Date().toISOString();
      pushOrderToTopForPicker(order);

    } else if (decision === "Reassign") {
      order.status = "Assigned";
      order.exceptionReason = null;
      order.assignedPicker = reassignEl.value;
      order.adminPriority = true;
      order.isNewAssignedPick = true;
      order.newAssignedAt = new Date().toISOString();
      pushOrderToTopForPicker(order);

    } else if (decision === "Approve Exception") {
      order.status = "Exception Reviewed";

    } else if (decision === "Short Pick / Inventory Issue") {
      order.status = "Inventory Hold";

    } else if (decision === "Damage Hold") {
      order.status = "Damage Hold";

    } else if (decision === "Other") {
      order.status = "Exception Reviewed";
    }

    order.adminDecision = decision;
    order.adminComment = comment || null;
    order.adminImage = imageName || null;
    order.adminReviewedAt = new Date().toISOString();

  } else if (item.type === "sick") {
    alert("For packing exceptions, use Missing SKU or Additional SKU pages.");
    return;
  }

  markResolvedException({
    key,
    decision,
    comment,
    imageName,
    reviewedAt: new Date().toISOString(),
    handledBy: "Admin",
    exceptionType: "Picking Exception",
    resolutionType: decision
  });

  saveState();
  renderAdminSummary();
  if (typeof renderPickerDashboard === "function") renderPickerDashboard();
  if (typeof renderPackerDashboard === "function") renderPackerDashboard();
  if (typeof renderOperationsDashboard === "function") renderOperationsDashboard();
  renderExceptionHandling();
}
