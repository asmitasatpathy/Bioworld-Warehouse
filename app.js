(function () {
  function goToPickerTicketsSafely() {
    try {
      if (typeof renderPickerDashboard === "function") renderPickerDashboard();
    } catch (e) {}

    try {
      if (typeof renderPickerTickets === "function") renderPickerTickets();
    } catch (e) {}

    try {
      if (typeof renderPickerTicketList === "function") renderPickerTicketList();
    } catch (e) {}

    try {
      if (typeof showScreen === "function") {
        showScreen("pickerTickets");
      }
    } catch (e) {}
  }

  function isPickerRoleActive() {
    return (
      window.appState &&
      String(window.appState.currentRole || "").toLowerCase() === "picker"
    );
  }

  function wrapFunction(fnName, wrapper) {
    const original = window[fnName];
    if (typeof original !== "function") return false;
    window[fnName] = wrapper(original);
    return true;
  }

  // 1) After successful tote validation, pull picker back to pickerTickets
  wrapFunction("validateTote", function (originalValidateTote) {
    return function () {
      const beforeOrder =
        window.appState && window.appState.currentOrder
          ? {
              so: window.appState.currentOrder.so,
              status: window.appState.currentOrder.status
            }
          : null;

      const result = originalValidateTote.apply(this, arguments);

      window.setTimeout(function () {
        if (!isPickerRoleActive()) return;

        const currentOrder =
          window.appState && window.appState.currentOrder
            ? window.appState.currentOrder
            : null;

        const statusNow = currentOrder ? currentOrder.status : "";
        const orderMovedOut =
          !currentOrder ||
          statusNow === "Ready for Packing" ||
          statusNow === "Packed" ||
          statusNow === "Exception";

        const previouslyInProgress =
          beforeOrder &&
          (beforeOrder.status === "In Progress" || beforeOrder.status === "Assigned");

        if (previouslyInProgress && orderMovedOut) {
          goToPickerTicketsSafely();
        }
      }, 350);

      return result;
    };
  });

  // 2) After picker exception save, also pull back to pickerTickets
  [
    "saveException",
    "submitException",
    "savePickerException",
    "submitPickerException",
    "postPickerException",
    "raiseException"
  ].forEach(function (fnName) {
    wrapFunction(fnName, function (originalFn) {
      return function () {
        const result = originalFn.apply(this, arguments);

        window.setTimeout(function () {
          if (!isPickerRoleActive()) return;
          goToPickerTicketsSafely();
        }, 350);

        return result;
      };
    });
  });

  // 3) Admin exception save: force refresh so handled exceptions disappear
  wrapFunction("saveDecision", function (originalSaveDecision) {
    return function () {
      const result = originalSaveDecision.apply(this, arguments);

      window.setTimeout(function () {
        try {
          if (typeof renderExceptionHandling === "function") {
            renderExceptionHandling();
          }
        } catch (e) {}

        const activeCards =
          document.querySelectorAll(".exception-card, .exception-item, .admin-exception-card");

        const noExceptionMsg = document.getElementById("noExceptionMsg");
        if (noExceptionMsg && activeCards.length === 0) {
          noExceptionMsg.textContent = "No more exceptions";
          noExceptionMsg.style.color = "green";
          noExceptionMsg.style.fontWeight = "700";
        }
      }, 200);

      return result;
    };
  });
})();