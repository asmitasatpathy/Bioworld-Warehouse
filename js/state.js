window.appState = {
  orders: [],
  pickers: ["Asmita", "An", "Vinny", "Deepak", "Corey", "Carlos"],
  currentRole: null,
  currentUser: null,
  currentOrder: null,
  totes: [],
  sickTotes: {},
  toteRegistry: {},
  resolvedExceptions: []
};

function loadState() {
  const saved = localStorage.getItem("warehousePrototypeState");

  if (!saved) {
    window.appState = {
      orders: [],
      pickers: ["Asmita", "An", "Vinny", "Deepak", "Corey", "Carlos"],
      currentRole: null,
      currentUser: null,
      currentOrder: null,
      totes: [],
      sickTotes: {},
      toteRegistry: {},
      resolvedExceptions: []
    };
    return;
  }

  const parsed = JSON.parse(saved);

  window.appState = {
    orders: parsed.orders || [],
    pickers: parsed.pickers || ["Asmita", "An", "Vinny", "Deepak", "Corey", "Carlos"],
    currentRole: parsed.currentRole || null,
    currentUser: parsed.currentUser || null,
    currentOrder: parsed.currentOrder || null,
    totes: parsed.totes || [],
    sickTotes: parsed.sickTotes || {},
    toteRegistry: parsed.toteRegistry || {},
    resolvedExceptions: parsed.resolvedExceptions || []
  };
}

function saveState() {
  if (!window.appState.sickTotes) {
    window.appState.sickTotes = {};
  }

  if (!window.appState.toteRegistry) {
    window.appState.toteRegistry = {};
  }
  if (!window.appState.resolvedExceptions) {
    window.appState.resolvedExceptions = [];
  }

  localStorage.setItem("warehousePrototypeState", JSON.stringify(window.appState));
}
