function normalizeCarrier(value = "") {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeSku(value = "") {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function getShelfByCarrier(carrier) {
  const c = normalizeCarrier(carrier);

  if (c === "DHL") return "Shelf 1";
  if (c === "FEDEX") return "Shelf 2";
  if (c === "UPS") return "Shelf 3";
  if (c === "USPOSTAL" || c === "USPS") return "Shelf 4";

  return "Unknown Shelf";
}

function getAisle(binCode = "") {
  const value = String(binCode || "").trim();
  return value ? value : "UNMAPPED";
}

function saveState() {
  if (!window.appState.sickTotes) window.appState.sickTotes = {};
  if (!window.appState.toteRegistry) window.appState.toteRegistry = {};
  localStorage.setItem("warehousePrototypeState", JSON.stringify(window.appState));
}

function loadState() {
  const saved = localStorage.getItem("warehousePrototypeState");
  if (!saved) return;

  const parsed = JSON.parse(saved);
  window.appState = {
    orders: parsed.orders || [],
    pickers: parsed.pickers || ["Picker 1", "Picker 2", "Picker 3", "Picker 4", "Picker 5"],
    currentRole: parsed.currentRole || null,
    currentUser: parsed.currentUser || null,
    currentOrder: parsed.currentOrder || null,
    totes: parsed.totes || [],
    sickTotes: parsed.sickTotes || {},
    toteRegistry: parsed.toteRegistry || {}
  };
}

function parseToteLP(rawValue = "") {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return { isValid: false, carrier: "", toteNo: "", normalized: "" };
  }

  const compact = raw.toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^TOTE[\|\-\/]?([A-Z]+)[\|\-\/]?(\d{3})$/);

  if (!match) {
    return { isValid: false, carrier: "", toteNo: "", normalized: "" };
  }

  const carrier = normalizeCarrier(match[1]);
  const toteNo = match[2];

  return {
    isValid: true,
    carrier,
    toteNo,
    normalized: `TOTE|${carrier}|${toteNo}`
  };
}