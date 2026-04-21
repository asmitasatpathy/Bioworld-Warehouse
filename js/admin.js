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
  const active = getActiveExceptionItems();

  if (!active.length) {
    alert("No exceptions available to download.");
    return;
  }

  const exportRows = active.map(item => ({
    "Type": item.type === 'sick' ? 'Sick Tote' : 'Picking',
    "Picker": item.picker || "",
    "SO No": item.so || "",
    "SKU": item.sku || "",
    "Carrier": item.carrier || "",
    "Tote LP": item.toteLp || "",
    "Aisle": item.aisle || "",
    "Reason": item.reason || ""
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
  if (typeof renderExceptionHandling === 'function') renderExceptionHandling();
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
  return String(value || '').trim();
}

function getActiveExceptionItems() {
  const items = [];
  const resolved = window.appState.resolvedExceptions || [];
  const resolvedKeys = new Set(resolved.map(item => item.key));

  (window.appState.orders || []).forEach(order => {
    if (order.status === 'Exception') {
      const key = `order:${order.so}`;
      if (!resolvedKeys.has(key)) {
        items.push({
          key,
          type: 'pick',
          so: order.so,
          sku: order.sku,
          picker: order.assignedPicker || '-',
          carrier: order.carrier || '-',
          toteLp: order.toteLp || '-',
          reason: order.exceptionReason || '-',
          aisle: order.aisle || order.binCode || '-',
          orderRef: order
        });
      }
    }
  });

  Object.entries(window.appState.sickTotes || {}).forEach(([toteLp, data]) => {
    const key = `sick:${toteLp}`;
    if (resolvedKeys.has(key)) return;
    const exceptions = data.exceptions || [];
    const first = exceptions[0] || {};
    items.push({
      key,
      type: 'sick',
      so: first.so || '-',
      sku: first.scannedSku || '-',
      picker: first.picker || '-',
      carrier: first.carrier || '-',
      toteLp,
      reason: 'Sick Tote',
      aisle: '-',
      sickData: data
    });
  });

  return items;
}


window.currentExceptionCategory = null;

function setExceptionCategory(category) {
  window.currentExceptionCategory = category;
  const pickBtn = document.getElementById('exceptionTabPicking');
  const packBtn = document.getElementById('exceptionTabPacking');
  const packControls = document.getElementById('packingExceptionControls');
  if (pickBtn) pickBtn.classList.toggle('active-toggle', category === 'pick');
  if (packBtn) packBtn.classList.toggle('active-toggle', category === 'pack');
  if (packControls) packControls.style.display = category === 'pack' ? 'flex' : 'none';
  renderExceptionHandling();
}

function downloadFinalReportExcel() {
  const rows = (window.appState.resolvedExceptions || []).map(r => ({
    Key: r.key || '', Decision: r.decision || '', Comment: r.comment || '', Image: r.imageName || '', ReviewedAt: r.reviewedAt || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: 'No resolved exceptions yet' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Final Report');
  XLSX.writeFile(wb, 'final_exception_report.xlsx');
}
function backToAdminDashboard() {
  renderAdminSummary();
  showScreen('adminDashboard');
}

function openExceptionHandling() {
  renderExceptionHandling();
  showScreen('adminExceptionScreen');
}

function handleExceptionDecisionChange(key) {
  const select = document.getElementById(`decision-${key}`);
  const pickerWrap = document.getElementById(`reassign-wrap-${key}`);
  const commentWrap = document.getElementById(`comment-wrap-${key}`);
  const imageWrap = document.getElementById(`image-wrap-${key}`);
  const value = select ? select.value : '';

  if (pickerWrap) pickerWrap.style.display = value === 'Reassign' ? 'block' : 'none';
  if (commentWrap) commentWrap.style.display = ['Damage Hold', 'Other'].includes(value) ? 'block' : 'none';
  if (imageWrap) imageWrap.style.display = ['Approve Exception', 'Damage Hold'].includes(value) ? 'block' : 'none';
}

function pushOrderToTopForPicker(targetOrder) {
  const orders = window.appState.orders || [];
  const index = orders.findIndex(o => String(o.so) === String(targetOrder.so));
  if (index <= 0) return;
  const [item] = orders.splice(index, 1);
  let insertIndex = orders.findIndex(o => o.assignedPicker === item.assignedPicker);
  if (insertIndex < 0) insertIndex = 0;
  orders.splice(insertIndex, 0, item);
}

function renderExceptionHandling() {
  const listEl = document.getElementById('adminExceptionList');
  const emptyEl = document.getElementById('adminNoExceptionMessage');
  if (!listEl || !emptyEl) return;

  const allItems = getActiveExceptionItems();
  const category = window.currentExceptionCategory;
  const items = category ? allItems.filter(item => category === "pick" ? item.type === "pick" : item.type === "sick") : [];
  if (!category) {
    emptyEl.textContent = 'Select Picking Exceptions or Packing Exceptions';
    emptyEl.style.display = 'block';
    listEl.innerHTML = '';
    return;
  }
  if (!items.length) {
    emptyEl.textContent = category === 'pick' ? 'No more picking exceptions' : 'No more packing exceptions';
    emptyEl.style.display = 'block';
    listEl.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';
  const pickerOptions = getOngoingPickers().map(name => `<option value="${name}">${name}</option>`).join('');

  listEl.innerHTML = `<div class="exception-list">${items.map(item => `
    <div class="exception-card">
      <h3>${item.type === 'sick' ? 'Packing Exception' : 'Picking Exception'} - ${item.key}</h3>
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
          <select id="reassign-${item.key}"><option value="">Select picker</option>${pickerOptions}</select>
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
    </div>`).join('')}</div>`;
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
  const decision = decisionEl ? decisionEl.value : '';
  const reassignEl = document.getElementById(`reassign-${key}`);
  const imageEl = document.getElementById(`image-${key}`);
  const commentEl = document.getElementById(`comment-${key}`);
  const comment = commentEl ? commentEl.value.trim() : '';
  const imageName = imageEl && imageEl.files && imageEl.files[0] ? imageEl.files[0].name : '';

  if (!decision) { alert('Select decision first.'); return; }
  if (['Approve Exception', 'Damage Hold'].includes(decision) && !imageName) { alert('Please upload an image.'); return; }
  if (['Damage Hold', 'Other'].includes(decision) && !comment) { alert('Please enter a comment.'); return; }
  if (decision === 'Reassign' && !(reassignEl && reassignEl.value)) { alert('Select a picker to reassign.'); return; }

  if (item.type === 'pick') {
    const order = item.orderRef;
    if (decision === 'Reject Exception') {
      order.status = 'Assigned';
      order.exceptionReason = null;
      order.adminPriority = true;
      pushOrderToTopForPicker(order);
    } else if (decision === 'Reassign') {
      order.status = 'Assigned';
      order.exceptionReason = null;
      order.assignedPicker = reassignEl.value;
      order.adminPriority = true;
      pushOrderToTopForPicker(order);
    } else if (decision === 'Approve Exception') {
      order.status = 'Exception Reviewed';
    } else if (decision === 'Short Pick / Inventory Issue') {
      order.status = 'Inventory Hold';
    } else if (decision === 'Damage Hold') {
      order.status = 'Damage Hold';
    } else if (decision === 'Other') {
      order.status = 'Exception Reviewed';
    }
    order.adminDecision = decision;
    order.adminComment = comment || null;
    order.adminImage = imageName || null;
    order.adminReviewedAt = new Date().toISOString();
  } else if (item.type === 'sick') {
    const toteLp = item.toteLp;
    if (decision === 'Reject Exception') {
      delete window.appState.sickTotes[toteLp];
      if (!window.appState.toteRegistry) window.appState.toteRegistry = {};
      window.appState.toteRegistry[toteLp] = { status: 'OPEN', assignedPicker: item.picker || null, updatedAt: new Date().toISOString() };
    } else if (decision === 'Reassign') {
      (window.appState.orders || []).forEach(order => {
        if (String(order.toteLp || '').toUpperCase() === String(toteLp).toUpperCase()) {
          order.assignedPicker = reassignEl.value;
          order.status = 'Assigned';
          order.adminPriority = true;
        }
      });
      delete window.appState.sickTotes[toteLp];
    } else {
      delete window.appState.sickTotes[toteLp];
    }
  }

  markResolvedException({ key, decision, comment, imageName, reviewedAt: new Date().toISOString() });
  saveState();
  renderAdminSummary();
  if (typeof renderPickerDashboard === 'function') renderPickerDashboard();
  if (typeof renderPackerDashboard === 'function') renderPackerDashboard();
  if (typeof renderOperationsDashboard === 'function') renderOperationsDashboard();
  renderExceptionHandling();
}
