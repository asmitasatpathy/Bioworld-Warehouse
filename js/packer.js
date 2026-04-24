window.packerSession = {
  toteLp: "",
  toteOrders: [],
  scannedSOs: [],
  scannedSkuMap: {}, // NEW
  exceptions: [],
  showExceptions: false
};

function packerNormalizeSku(v=""){
  return String(v||"").trim().toUpperCase().replace(/\s+/g,"");
}

function getPackerOrderKey(order){
  return String(order.so || "");
}

function setPackerTote(){
  const toteInput = document.getElementById("packerToteInput");
  const toteLp = String(toteInput.value || "").trim().toUpperCase();

  const toteOrders = (window.appState.orders || []).filter(o =>
    String(o.toteLp||"").toUpperCase() === toteLp
  );

  window.packerSession = {
    toteLp,
    toteOrders,
    scannedSOs: [],
    scannedSkuMap: {}, // reset
    exceptions: [],
    showExceptions: false
  };

  renderPackerDashboard();
}

function verifyPackerSku(){
  const input = document.getElementById("packerSkuInput");
  const msg = document.getElementById("packerSkuMessage");

  const scannedSku = packerNormalizeSku(input.value);
  if(!scannedSku){
    msg.textContent = "Scan SKU";
    return;
  }

  const orders = window.packerSession.toteOrders || [];

  // FIND all matching orders for SKU
  const matchingOrders = orders.filter(o =>
    packerNormalizeSku(o.sku) === scannedSku &&
    o.status === "Ready for Packing"
  );

  if(matchingOrders.length){

    // already scanned SKUs map
    const usedSOs = window.packerSession.scannedSkuMap[scannedSku] || [];

    // find unused SO
    const nextOrder = matchingOrders.find(o =>
      !usedSOs.includes(getPackerOrderKey(o))
    );

    if(nextOrder){
      const soKey = getPackerOrderKey(nextOrder);

      window.packerSession.scannedSOs.push(soKey);

      if(!window.packerSession.scannedSkuMap[scannedSku]){
        window.packerSession.scannedSkuMap[scannedSku] = [];
      }
      window.packerSession.scannedSkuMap[scannedSku].push(soKey);

      msg.textContent = "Verified";
      msg.className = "message-box message-success";

      input.value="";
      renderPackerDashboard();
      return;
    }

    // duplicate but no extra SO → exception
    window.packerSession.exceptions.push({
      scannedSku,
      so: "-",
      carrier: "-",
      picker: "-",
      expectedTote: window.packerSession.toteLp,
      reason: "Additional SKU"
    });

    msg.textContent = "Additional SKU";
    msg.className = "message-box message-error";

    input.value="";
    renderPackerDashboard();
    return;
  }

  // NOT FOUND → exception
  window.packerSession.exceptions.push({
    scannedSku,
    so: "-",
    carrier: "-",
    picker: "-",
    expectedTote: window.packerSession.toteLp,
    reason: "No matching order"
  });

  msg.textContent = "Exception";
  msg.className = "message-box message-error";

  input.value="";
  renderPackerDashboard();
}

function validatePackerSession(){
  const toteOrders = window.packerSession.toteOrders || [];
  const scannedSet = new Set(window.packerSession.scannedSOs);

  const missing = toteOrders.filter(o =>
    o.status === "Ready for Packing" &&
    !scannedSet.has(getPackerOrderKey(o))
  );

  missing.forEach(o=>{
    window.packerSession.exceptions.push({
      scannedSku:o.sku,
      so:o.so,
      carrier:o.carrier,
      picker:o.assignedPicker,
      expectedTote:o.toteLp,
      reason:"Missing SKU"
    });
  });

  if(window.packerSession.exceptions.length){
    alert("Sick Tote");
    return;
  }

  // mark packed
  toteOrders.forEach(o=>{
    if(scannedSet.has(getPackerOrderKey(o))){
      o.status="Packed";
    }
  });

  saveState();
  alert("Validated");
  window.packerSession = { toteLp:"", toteOrders:[], scannedSOs:[], scannedSkuMap:{}, exceptions:[] };

  renderPackerDashboard();
}

function renderPackerDashboard(){
  const el = document.getElementById("packerReadyList");
  const ex = document.getElementById("packerExceptionList");

  if(!window.packerSession.toteLp){
    el.innerHTML="<div>No tote loaded</div>";
    ex.innerHTML="";
    return;
  }

  const orders = window.packerSession.toteOrders;
  const scanned = new Set(window.packerSession.scannedSOs);

  el.innerHTML = orders.map(o=>{
    const done = scanned.has(getPackerOrderKey(o));
    return `
      <div class="packer-mobile-card">
        <div>SKU: ${o.sku}</div>
        <div>Status: ${done?"Verified":"Pending"}</div>
      </div>
    `;
  }).join("");

  ex.innerHTML = (window.packerSession.exceptions||[]).map(e=>`
    <div class="packer-mobile-card">
      <div>SKU: ${e.scannedSku}</div>
      <div>${e.reason}</div>
    </div>
  `).join("");
}
