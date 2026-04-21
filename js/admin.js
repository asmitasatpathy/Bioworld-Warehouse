// ---------- EXISTING FUNCTIONS (UNCHANGED) ----------
function markResolvedException(record) {
  if (!window.appState.resolvedExceptions) window.appState.resolvedExceptions = [];
  window.appState.resolvedExceptions.push(record);
}

// ---------- PACKING EXCEPTION MODE ----------
function showPackingExceptionMode(key, mode) {
  const allItems = getActiveExceptionItems();
  const item = allItems.find(entry => entry.key === key);
  const host = document.getElementById(`packing-mode-${key}`);
  if (!item || !host) return;

  const pickerOptions = getOngoingPickers().map(p => `<option value="${p}">${p}</option>`).join('');

  if (mode === 'missing') {
    const firstMissing = (item.missingItems || [])[0] || {};
    const suggestion = getSuggestedPickerForMissingSku({
      aisle: firstMissing.aisle || item.aisle,
      shelf: firstMissing.expectedBin || item.shelf
    });

    host.innerHTML = `
      <div>
        <strong>Missing SKU:</strong> ${firstMissing.scannedSku || '-'}<br/>
        <strong>Aisle:</strong> ${firstMissing.aisle || '-'}<br/>
        <strong>Shelf:</strong> ${firstMissing.expectedBin || '-'}
      </div>

      ${suggestion ? `
        <div style="color:green;margin-top:10px;">
          Suggested: ${suggestion.picker}<br/>
          ${suggestion.reason}
        </div>` : ''}

      <select id="pack-reassign-${key}">
        <option value="">Select picker</option>
        ${pickerOptions}
      </select>

      <button onclick="savePackingMissingReassignment('${key}')">
        Reassign
      </button>
    `;
  } else {
    host.innerHTML = `
      <div><strong>Additional SKU detected</strong></div>
      <button onclick="clearAdditionalPackingException('${key}')">
        Remove Tote Exception
      </button>
    `;
  }
}

// ---------- REASSIGN LOGIC ----------
function savePackingMissingReassignment(key) {
  const item = getActiveExceptionItems().find(x => x.key === key);
  if (!item) return;

  const picker = document.getElementById(`pack-reassign-${key}`).value;
  if (!picker) {
    alert("Select picker");
    return;
  }

  const firstMissing = (item.missingItems || [])[0] || {};

  const order = (window.appState.orders || []).find(o =>
    o.so === firstMissing.so && o.sku === firstMissing.scannedSku
  );

  if (!order) {
    alert("Order not found");
    return;
  }

  insertReassignedOrderByAisle(order, picker, "current_trip");

  delete window.appState.sickTotes[item.toteLp];

  markResolvedException({
    key,
    decision: "Reassigned",
    reviewedAt: new Date().toISOString()
  });

  saveState();
  renderAdminSummary();
  renderExceptionHandling();
}

// ---------- REMOVE ADDITIONAL SKU ----------
function clearAdditionalPackingException(key) {
  const item = getActiveExceptionItems().find(x => x.key === key);
  if (!item) return;

  delete window.appState.sickTotes[item.toteLp];

  markResolvedException({
    key,
    decision: "Removed Additional SKU",
    reviewedAt: new Date().toISOString()
  });

  saveState();
  renderAdminSummary();
  renderExceptionHandling();
}

// ---------- MAIN ADMIN DECISION ----------
function saveExceptionDecision(key) {
  const items = getActiveExceptionItems();
  const item = items.find(x => x.key === key);
  if (!item) return;

  const decision = document.getElementById(`decision-${key}`)?.value;
  const comment = document.getElementById(`comment-${key}`)?.value || "";

  if (!decision) {
    alert("Select decision");
    return;
  }

  // ---------- PICKING EXCEPTION ----------
  if (item.type === 'pick') {
    const order = item.orderRef;

    if (decision === 'Reject Exception') {
      order.status = 'Assigned';
      order.exceptionReason = null;
      order.adminPriority = true;
      pushOrderToTopForPicker(order);
    }

    else if (decision === 'Reassign') {
      const picker = document.getElementById(`reassign-${key}`).value;
      if (!picker) return alert("Select picker");

      order.status = 'Assigned';
      order.assignedPicker = picker;
      order.adminPriority = true;
      pushOrderToTopForPicker(order);
    }

    else {
      order.status = "Exception Reviewed";
    }

    order.adminDecision = decision;
    order.adminComment = comment;
    order.adminReviewedAt = new Date().toISOString();
  }

  // ---------- PACKING EXCEPTION BLOCKED HERE ----------
  else if (item.type === 'sick') {
    alert("Use Missing SKU or Additional SKU buttons above.");
    return;
  }

  markResolvedException({
    key,
    decision,
    comment,
    reviewedAt: new Date().toISOString()
  });

  saveState();
  renderAdminSummary();
  renderExceptionHandling();
}
