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
  });

  window.appState.currentOrder = null;
  window.appState.sickTotes = {};
  window.appState.toteRegistry = {};
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
  const exceptions = (window.appState.orders || []).filter(order => order.status === "Exception");
  const sickEntries = Object.entries(window.appState.sickTotes || {});

  if (!exceptions.length && !sickEntries.length) {
    alert("No exceptions available to download.");
    return;
  }

  const exportRows = exceptions.map(order => ({
    "Type": "Picking Exception",
    "Picker": order.assignedPicker || "",
    "SO No": order.so || "",
    "SKU": order.sku || "",
    "Tote LP": order.toteLp || "",
    "Bin No": order.binCode || "",
    "Aisle": order.aisle || "",
    "Date & Time": order.tripEndTime ? new Date(order.tripEndTime).toLocaleString() : "",
    "Reason": order.exceptionReason || "",
    "Decision": order.adminDecision || "",
    "Comment": order.adminComment || ""
  })).concat(sickEntries.map(([toteLp, data]) => ({
    "Type": "Sick Tote",
    "Picker": "",
    "SO No": "",
    "SKU": "",
    "Tote LP": toteLp,
    "Bin No": "",
    "Aisle": "",
    "Date & Time": data.createdAt ? new Date(data.createdAt).toLocaleString() : "",
    "Reason": "Sick Tote",
    "Decision": ((window.appState.sickToteDecisions || {})[toteLp] || {}).decision || "",
    "Comment": ((window.appState.sickToteDecisions || {})[toteLp] || {}).comment || ""
  })));

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
  const active = new Set(
    (window.appState.orders || [])
      .filter(order => order.status === "In Progress" && order.assignedPicker)
      .map(order => order.assignedPicker)
  );
  return Array.from(active);
}

function getExceptionDecisionOptions() {
  return [
    "",
    "Approve Exception",
    "Reject Exception",
    "Reassign",
    "Short Pick / Inventory Issue",
    "Damage Hold",
    "Other"
  ];
}

function renderAdminExceptionScreen() {
  const pickingEl = document.getElementById("adminPickingExceptionList");
  const sickEl = document.getElementById("adminSickExceptionList");
  if (!pickingEl || !sickEl) return;

  const exceptions = (window.appState.orders || []).filter(order => order.status === "Exception");
  const ongoingPickers = getOngoingPickers();

  if (!exceptions.length) {
    pickingEl.innerHTML = "<p>No picking exceptions.</p>";
  } else {
    pickingEl.innerHTML = exceptions.map(order => renderExceptionCard({
      type: "pick",
      id: String(order.so || ""),
      title: `SO #${order.so}`,
      subtitle: `${order.sku || "-"} · ${order.carrier || "-"}`,
      meta: [
        ["Picker", order.assignedPicker || "-"],
        ["Aisle", order.aisle || order.binCode || "-"],
        ["Reason", order.exceptionReason || "-"],
        ["Time", order.tripEndTime ? new Date(order.tripEndTime).toLocaleString() : "-"]
      ],
      ongoingPickers
    })).join("");
  }

  const sickEntries = Object.entries(window.appState.sickTotes || {});
  if (!sickEntries.length) {
    sickEl.innerHTML = "<p>No sick tote exceptions.</p>";
  } else {
    sickEl.innerHTML = sickEntries.map(([toteLp, data]) => renderExceptionCard({
      type: "sick",
      id: toteLp,
      title: toteLp,
      subtitle: "Sick Tote",
      meta: [
        ["Created", data.createdAt ? new Date(data.createdAt).toLocaleString() : "-"],
        ["Items", String((data.exceptions || []).length)],
        ["Reason", "Sick Tote"]
      ],
      ongoingPickers
    })).join("");
  }
}

function renderExceptionCard({ type, id, title, subtitle, meta, ongoingPickers }) {
  const options = getExceptionDecisionOptions().map(opt => `<option value="${opt}">${opt || "Select decision"}</option>`).join("");
  const pickerOptions = ongoingPickers.map(name => `<option value="${name}">${name}</option>`).join("");
  const metaHtml = meta.map(([k,v]) => `<div><strong>${k}:</strong> ${v}</div>`).join("");
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");

  return `
    <div class="dashboard-card-wide exception-card-admin">
      <h4>${title}</h4>
      <p class="page-subtitle">${subtitle}</p>
      <div class="exception-meta-grid">${metaHtml}</div>
      <div class="exception-form-grid">
        <div>
          <label>Decision</label>
          <select id="decision_${type}_${safeId}" onchange="toggleExceptionDecisionFields('${type}','${safeId}')">${options}</select>
        </div>
        <div id="reassignWrap_${type}_${safeId}" style="display:none;">
          <label>Reassign To</label>
          <select id="reassign_${type}_${safeId}"><option value="">Select picker</option>${pickerOptions}</select>
        </div>
        <div id="commentWrap_${type}_${safeId}" style="display:none;">
          <label>Comment</label>
          <input id="comment_${type}_${safeId}" placeholder="Add comment" />
        </div>
        <div id="imageWrap_${type}_${safeId}" style="display:none;">
          <label>Upload Image</label>
          <input id="image_${type}_${safeId}" type="file" accept="image/*" />
        </div>
      </div>
      <div class="scan-btn-row"><button onclick="saveExceptionDecision('${type}','${safeId}','${id.replace(/'/g, "\'")}')">Save Decision</button></div>
      <div id="decisionMsg_${type}_${safeId}" class="message-box"></div>
    </div>
  `;
}

function toggleExceptionDecisionFields(type, safeId) {
  const decision = document.getElementById(`decision_${type}_${safeId}`)?.value || "";
  const reassignWrap = document.getElementById(`reassignWrap_${type}_${safeId}`);
  const commentWrap = document.getElementById(`commentWrap_${type}_${safeId}`);
  const imageWrap = document.getElementById(`imageWrap_${type}_${safeId}`);
  if (reassignWrap) reassignWrap.style.display = decision === "Reassign" ? "block" : "none";
  if (commentWrap) commentWrap.style.display = (decision === "Damage Hold" || decision === "Other") ? "block" : "none";
  if (imageWrap) imageWrap.style.display = (decision === "Approve Exception" || decision === "Damage Hold") ? "block" : "none";
}

function saveExceptionDecision(type, safeId, rawId) {
  const decision = document.getElementById(`decision_${type}_${safeId}`)?.value || "";
  const reassignTo = document.getElementById(`reassign_${type}_${safeId}`)?.value || "";
  const comment = document.getElementById(`comment_${type}_${safeId}`)?.value || "";
  const imageInput = document.getElementById(`image_${type}_${safeId}`);
  const msg = document.getElementById(`decisionMsg_${type}_${safeId}`);
  if (!decision) {
    if (msg) {
      msg.textContent = "Select a decision.";
      msg.className = "message-box message-error";
    }
    return;
  }
  if (decision === "Reassign" && !reassignTo) {
    if (msg) {
      msg.textContent = "Select a picker for reassignment.";
      msg.className = "message-box message-error";
    }
    return;
  }
  if ((decision === "Approve Exception" || decision === "Damage Hold") && (!imageInput || !imageInput.files || !imageInput.files.length)) {
    if (msg) {
      msg.textContent = "Upload an image to continue.";
      msg.className = "message-box message-error";
    }
    return;
  }
  if ((decision === "Damage Hold" || decision === "Other") && !String(comment).trim()) {
    if (msg) {
      msg.textContent = "Add a comment to continue.";
      msg.className = "message-box message-error";
    }
    return;
  }

  if (!window.appState.exceptionDecisions) window.appState.exceptionDecisions = [];
  const record = {
    type,
    id: rawId,
    decision,
    reassignTo: reassignTo || null,
    comment: comment || null,
    imageName: imageInput && imageInput.files && imageInput.files[0] ? imageInput.files[0].name : null,
    decidedAt: new Date().toISOString(),
    decidedBy: window.appState.currentUser || "Admin"
  };
  window.appState.exceptionDecisions.push(record);

  if (type === "pick") {
    const order = (window.appState.orders || []).find(order => String(order.so || "") === String(rawId));
    if (order) {
      order.adminDecision = decision;
      order.adminComment = comment || null;
      order.adminImageName = record.imageName;
      order.adminDecisionAt = record.decidedAt;
      if (decision === "Reject Exception") {
        order.status = "Assigned";
        order.priorityOverride = true;
      } else if (decision === "Reassign") {
        order.status = "Assigned";
        order.assignedPicker = reassignTo;
        order.priorityOverride = true;
      } else if (decision === "Short Pick / Inventory Issue" || decision === "Damage Hold" || decision === "Approve Exception" || decision === "Other") {
        order.status = "Exception";
      }
    }
  } else {
    if (!window.appState.sickToteDecisions) window.appState.sickToteDecisions = {};
    window.appState.sickToteDecisions[rawId] = record;
    if (decision === "Reject Exception" || decision === "Approve Exception" || decision === "Short Pick / Inventory Issue" || decision === "Damage Hold" || decision === "Other") {
      // Keep tote listed for visibility unless admin clears it explicitly.
    } else if (decision === "Reassign") {
      // metadata only; tote remains sick until manually cleared.
    }
  }

  saveState();
  if (typeof renderAdminSummary === "function") renderAdminSummary();
  if (typeof renderPickerDashboard === "function") renderPickerDashboard();
  if (typeof renderPackerDashboard === "function") renderPackerDashboard();
  renderAdminExceptionScreen();
  if (msg) {
    msg.textContent = "Decision saved.";
    msg.className = "message-box message-success";
  }
}

window.renderAdminExceptionScreen = renderAdminExceptionScreen;
window.toggleExceptionDecisionFields = toggleExceptionDecisionFields;
window.saveExceptionDecision = saveExceptionDecision;
