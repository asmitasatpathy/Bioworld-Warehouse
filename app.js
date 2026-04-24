(function () {
  let pickerAssignedChart = null;
  let pickerAccuracyChart = null;
  let packerOutputChart = null;
  let adminExceptionChart = null;

  function getOrders() {
    return window.appState && Array.isArray(window.appState.orders)
      ? window.appState.orders
      : [];
  }

  function getPickers() {
    return window.appState && Array.isArray(window.appState.pickers) && window.appState.pickers.length
      ? window.appState.pickers
      : ["Picker 1", "Picker 2", "Picker 3", "Picker 4", "Picker 5"];
  }

  function nowMs() {
    return Date.now();
  }

  function getMs(value) {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function getSecondsBetween(start, end) {
    const s = getMs(start);
    const e = getMs(end);
    if (!s || !e || e < s) return 0;
    return Math.round((e - s) / 1000);
  }

  function formatDurationFromMs(ms) {
    if (!ms || ms <= 0) return "0m";
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m`;
  }

  function getLifecycleMetrics() {
    const orders = getOrders();

    const total = orders.length;
    const assigned = orders.filter(o => o.status === "Assigned").length;
    const picking = orders.filter(o => o.status === "In Progress").length;
    const ready = orders.filter(o => o.status === "Ready for Packing").length;
    const packed = orders.filter(o => o.status === "Packed").length;
    const exception = orders.filter(o => o.status === "Exception").length;

    return {
      total,
      assigned,
      picking,
      ready,
      packed,
      exception,
      exceptionRate: total ? ((exception / total) * 100).toFixed(1) : "0.0"
    };
  }

  function getBottleneckStage() {
    const m = getLifecycleMetrics();
    const activeStages = [
      { name: "Assigned", count: m.assigned },
      { name: "Picking", count: m.picking },
      { name: "Ready Queue", count: m.ready },
      { name: "Exception", count: m.exception }
    ];
    activeStages.sort((a, b) => b.count - a.count);
    return activeStages[0].count > 0 ? `${activeStages[0].name} (${activeStages[0].count})` : "-";
  }

  function getAvgPickTimeSeconds() {
    const orders = getOrders();
    const timed = orders.filter(o => o.tripStartTime && o.tripEndTime);
    if (!timed.length) return 0;
    const total = timed.reduce((sum, o) => sum + getSecondsBetween(o.tripStartTime, o.tripEndTime), 0);
    return Math.round(total / timed.length);
  }

  function getAvgPackTimeSeconds() {
    const orders = getOrders();
    const timed = orders.filter(o => o.tripEndTime && o.packTime);
    if (!timed.length) return 0;
    const total = timed.reduce((sum, o) => sum + getSecondsBetween(o.tripEndTime, o.packTime), 0);
    return Math.round(total / timed.length);
  }

  function getStageAging() {
    const orders = getOrders();
    const now = nowMs();

    const assignedAges = orders
      .filter(o => o.status === "Assigned")
      .map(o => {
        const created = getMs(o.importedAt || o.createdAt || o.assignedAt);
        return created ? now - created : 0;
      });

    const pickingAges = orders
      .filter(o => o.status === "In Progress")
      .map(o => {
        const start = getMs(o.tripStartTime);
        return start ? now - start : 0;
      });

    const readyAges = orders
      .filter(o => o.status === "Ready for Packing" && !((window.appState.sickTotes || {})[(o.toteLp || "").toUpperCase()]))
      .map(o => {
        const end = getMs(o.tripEndTime);
        return end ? now - end : 0;
      });

    const exceptionAges = orders
      .filter(o => o.status === "Exception")
      .map(o => {
        const end = getMs(o.tripEndTime);
        return end ? now - end : 0;
      });

    return {
      assigned: assignedAges.length ? Math.max(...assignedAges) : 0,
      picking: pickingAges.length ? Math.max(...pickingAges) : 0,
      ready: readyAges.length ? Math.max(...readyAges) : 0,
      exception: exceptionAges.length ? Math.max(...exceptionAges) : 0
    };
  }

  function getThroughputMetrics() {
    const orders = getOrders();

    const totalOrders = orders.length;
    const picksCompleted = orders.filter(o =>
      o.status === "Ready for Packing" || o.status === "Packed"
    ).length;

    const packsCompleted = orders.filter(o => o.status === "Packed").length;

    const pickTimes = orders
      .filter(o => o.tripEndTime)
      .map(o => getMs(o.tripEndTime))
      .filter(Boolean);

    const packTimes = orders
      .filter(o => o.packTime)
      .map(o => getMs(o.packTime))
      .filter(Boolean);

    let picksPerHour = 0;
    if (pickTimes.length >= 2) {
      const spanHours = (Math.max(...pickTimes) - Math.min(...pickTimes)) / 3600000;
      picksPerHour = spanHours > 0 ? (picksCompleted / spanHours) : picksCompleted;
    } else if (pickTimes.length === 1) {
      picksPerHour = picksCompleted;
    }

    let packsPerHour = 0;
    if (packTimes.length >= 2) {
      const spanHours = (Math.max(...packTimes) - Math.min(...packTimes)) / 3600000;
      packsPerHour = spanHours > 0 ? (packsCompleted / spanHours) : packsCompleted;
    } else if (packTimes.length === 1) {
      packsPerHour = packsCompleted;
    }

    return {
      picksCompleted,
      packsCompleted,
      predictedPicks: totalOrders,
      predictedPacks: totalOrders,
      picksPerHour: Number(picksPerHour.toFixed(1)),
      packsPerHour: Number(packsPerHour.toFixed(1))
    };
  }

  function getExceptionQuality() {
    const orders = getOrders();
    const resolved = (window.appState && window.appState.resolvedExceptions) || [];

    const currentPickExceptions = orders.filter(o => o.status === "Exception");

    const historicalPickExceptions = orders.filter(o =>
      o.adminDecision ||
      o.status === "Exception Reviewed" ||
      o.status === "Inventory Hold" ||
      o.status === "Damage Hold"
    );

    const activePackingExceptions = Object.entries((window.appState && window.appState.sickTotes) || {}).flatMap(([toteLp, data]) =>
      (data.exceptions || []).map(ex => ({
        ...ex,
        toteLp
      }))
    );

    const resolvedPackingExceptions = resolved.filter(r => r.exceptionType === "Packing Exception");

    const allExceptionEvents = [
      ...currentPickExceptions.map(o => ({
        reason: o.exceptionReason || "Unspecified",
        picker: o.assignedPicker || "Unassigned"
      })),
      ...historicalPickExceptions.map(o => ({
        reason: o.exceptionReason || o.adminDecision || "Reviewed Exception",
        picker: o.assignedPicker || "Unassigned"
      })),
      ...activePackingExceptions.map(ex => ({
        reason: ex.reason || "Packing Exception",
        picker: ex.picker || "Unassigned"
      })),
     ...resolvedPackingExceptions.map(ex => ({
  reason: ex.resolutionType || ex.decision || "Packing Exception",
  picker: ex.picker || ex.assignedPicker || ex.originalPicker || "Unassigned"
}))
    ];

    const uniqueEvents = [];
    const seen = new Set();

    allExceptionEvents.forEach(ex => {
      const key = `${ex.reason}|${ex.picker}`;
      if (!seen.has(key) || ex.reason === "Missing SKU" || ex.reason === "Additional SKU") {
        uniqueEvents.push(ex);
        seen.add(key);
      }
    });

    const reasons = {};
    const pickers = {};

    uniqueEvents.forEach(ex => {
      const reason = ex.reason || "Unspecified";
      const picker = ex.picker || "Unassigned";
      reasons[reason] = (reasons[reason] || 0) + 1;
      if (picker === "Admin") return;
      pickers[picker] = (pickers[picker] || 0) + 1;
    });

    const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    const topPicker = Object.entries(pickers).sort((a, b) => b[1] - a[1])[0];

    const total = orders.length;
    const totalExceptionsOccurred = uniqueEvents.length;
    const exceptionRate = total ? ((totalExceptionsOccurred / total) * 100).toFixed(1) : "0.0";

    return {
      totalExceptions: totalExceptionsOccurred,
      topReason: topReason ? `${topReason[0]} (${topReason[1]})` : "-",
      topPicker: topPicker ? `${topPicker[0]} (${topPicker[1]})` : "-",
      exceptionRate: `${exceptionRate}%`
    };
  }

  function getReadyQueue() {
    return getOrders()
      .filter(o => o.status === "Ready for Packing" && !((window.appState.sickTotes || {})[(o.toteLp || "").toUpperCase()]))
      .map(o => ({
        so: o.so || "-",
        toteLp: o.toteLp || "-",
        carrier: o.carrier || "-",
        picker: o.assignedPicker || "-",
        readySince: o.tripEndTime || null,
        queueAgeMs: o.tripEndTime ? nowMs() - getMs(o.tripEndTime) : 0
      }))
      .sort((a, b) => b.queueAgeMs - a.queueAgeMs);
  }

  function getPickerMetrics() {
    const orders = getOrders();
    const pickers = getPickers();

    return pickers.map(name => {
      const pickerOrders = orders.filter(o => String(o.assignedPicker || "").trim() === name);
      const assigned = pickerOrders.length;
      const completed = pickerOrders.filter(o => o.status === "Ready for Packing" || o.status === "Packed").length;
      const timedOrders = pickerOrders.filter(o => o.tripStartTime && o.tripEndTime);
      const avgPickTime = timedOrders.length
        ? timedOrders.reduce((sum, o) => sum + getSecondsBetween(o.tripStartTime, o.tripEndTime), 0) / timedOrders.length
        : 0;
      const completionPercent = assigned ? Number(((completed / assigned) * 100).toFixed(1)) : 0;

      return {
        name,
        assigned,
        completed,
        completionPercent,
        avgPickTime: Number(avgPickTime.toFixed(1))
      };
    });
  }

  function getPackerMetrics() {
    const packedOrders = getOrders().filter(o => o.status === "Packed").length;
    return {
      labels: ["Packed Orders"],
      values: [packedOrders]
    };
  }

  function getAdminExceptionMetrics() {
    const orders = getOrders();
    const resolved = (window.appState && window.appState.resolvedExceptions) || [];
    const activePacking = Object.entries((window.appState && window.appState.sickTotes) || {}).reduce((sum, [, data]) => {
      return sum + ((data.exceptions || []).length);
    }, 0);

    const historicalPickExceptions = orders.filter(o =>
      o.status === "Exception" ||
      o.status === "Exception Reviewed" ||
      o.status === "Inventory Hold" ||
      o.status === "Damage Hold" ||
      o.adminDecision
    ).length;

    const resolvedPackingExceptions = resolved.filter(r => r.exceptionType === "Packing Exception").length;

    const totalExceptionsOccurred = historicalPickExceptions + activePacking + resolvedPackingExceptions;
    const nonExceptions = Math.max(0, orders.length - totalExceptionsOccurred);

    return {
      labels: ["Exceptions", "Non-Exceptions"],
      values: [totalExceptionsOccurred, nonExceptions]
    };
  }

  function setActiveNav(screenId) {
    const navButtons = document.querySelectorAll(".sidebar-nav .nav-item");
    navButtons.forEach(btn => btn.classList.remove("active"));

    const mapping = {
      welcomeScreen: 0,
      homeDashboard: 1,
      operationsDashboard: 2,
      pickerLogin: 3,
      pickerTickets: 3,
      packerDashboard: 4,
      adminDashboard: 5,
      adminExceptionScreen: 6
    };

    const index = mapping[screenId];
    if (index !== undefined && navButtons[index]) {
      navButtons[index].classList.add("active");
    }
  }

  function updateAccessByRole() {
    const role = String((window.appState && window.appState.currentRole) || "").toLowerCase();
    const navButtons = document.querySelectorAll(".sidebar-nav .nav-item");
    navButtons.forEach(btn => btn.style.display = "");

    if (role === "picker") {
      navButtons.forEach((btn, index) => {
        btn.style.display = index === 3 ? "block" : "none";
      });
    } else if (role === "packer") {
      navButtons.forEach((btn, index) => {
        btn.style.display = index === 4 ? "block" : "none";
      });
    } else if (role === "admin") {
      navButtons.forEach((btn, index) => {
        btn.style.display = [0, 1, 2, 3, 4, 5, 6].includes(index) ? "block" : "none";
      });
    }
  }

  function showScreen(screenId) {
    const role = String((window.appState && window.appState.currentRole) || "").toLowerCase();
    if (role === "picker" && !["pickerLogin", "pickerTickets", "pickingWorkflow", "welcomeScreen"].includes(screenId)) {
      screenId = "pickerLogin";
    }
    if (role === "packer" && screenId !== "packerDashboard" && screenId !== "welcomeScreen") {
      screenId = "packerDashboard";
    }

    const screens = document.querySelectorAll(".screen");
    screens.forEach(screen => screen.classList.remove("active"));

    const target = document.getElementById(screenId);
    if (target) target.classList.add("active");

    updateAccessByRole();
    setActiveNav(screenId);
    const sidebar = document.getElementById("sidebar");
    if (sidebar && window.innerWidth <= 900) sidebar.classList.remove("open");

    if (screenId === "homeDashboard" || screenId === "operationsDashboard" || screenId === "packerDashboard") {
      setTimeout(renderOperationsDashboard, 50);
    }

    if (screenId === "pickingWorkflow") {
      window.setTimeout(() => {
        const input = document.getElementById("manualSkuInput");
        if (input) input.focus();
      }, 80);
    }

    if (screenId === "packerDashboard") {
      window.setTimeout(() => {
        const toteInput = document.getElementById("packerToteInput");
        if (toteInput && !(window.packerSession && window.packerSession.toteLp)) toteInput.focus();
      }, 80);
    }

    if (screenId === "adminExceptionScreen" && typeof renderExceptionHandling === "function") {
      window.setTimeout(renderExceptionHandling, 10);
    }
  }

  const rolePasscodes = {
    picker: "PICK123",
    packer: "PACK123",
    admin: "ADMIN123"
  };

  function openRoleAccess(role) {
    const row = document.getElementById("roleChipRow");
    if (row) {
      Array.from(row.querySelectorAll(".role-chip")).forEach(btn => {
        btn.classList.toggle("active", btn.dataset.role === role);
      });
    }

    const pickerBlock = document.getElementById("pickerSelectionBlock");
    if (pickerBlock) {
      pickerBlock.style.display = role === "picker" ? "block" : "none";
    }

    const message = document.getElementById("welcomeMessage");
    if (message) {
      message.textContent = "";
      message.className = "message-box mobile-home-message";
    }

    window.selectedAccessRole = role;
    syncPickerSelection();
  }

  function syncPickerSelection() {
    const welcomePicker = document.getElementById("pickerAccessName");
    const pickerSelect = document.getElementById("pickerName");
    if (welcomePicker && pickerSelect) {
      pickerSelect.value = welcomePicker.value;
    }
  }

  function handleWelcomeKeydown(event) {
    if (event.key === "Enter") continueFromWelcome();
  }

  function continueFromWelcome() {
    const role = window.selectedAccessRole || "picker";
    const passcodeInput = document.getElementById("rolePasscodeInput");
    const message = document.getElementById("welcomeMessage");
    const entered = passcodeInput ? String(passcodeInput.value || "").trim() : "";

    if (entered !== rolePasscodes[role]) {
      if (message) {
        message.textContent = "Wrong passcode. Please try again.";
        message.className = "message-box mobile-home-message message-error";
      }
      return;
    }

    if (role === "picker") {
      syncPickerSelection();
      if (typeof loginPicker === "function") loginPicker();
      showScreen("pickerLogin");
    } else if (role === "packer") {
      if (window.appState) {
        window.appState.currentRole = "Packer";
        window.appState.currentUser = "Packer";
        if (typeof saveState === "function") saveState();
      }
      showScreen("packerDashboard");
    } else {
      if (window.appState) {
        window.appState.currentRole = "Admin";
        window.appState.currentUser = "Admin";
        if (typeof saveState === "function") saveState();
      }
      showScreen("adminDashboard");
    }

    if (passcodeInput) passcodeInput.value = "";
    if (message) {
      message.textContent = "Access granted.";
      message.className = "message-box mobile-home-message message-success";
    }
  }

  function logoutUser() {
    if (window.appState) {
      window.appState.currentRole = null;
      window.appState.currentUser = null;
      window.appState.currentOrder = null;
      if (typeof saveState === "function") saveState();
    }
    showScreen("welcomeScreen");
  }

  function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.toggle("open");
  }

  function renderJourneyFlow() {
    const m = getLifecycleMetrics();
    const assigned = document.getElementById("journeyAssigned");
    const picking = document.getElementById("journeyPicking");
    const ready = document.getElementById("journeyReady");
    const packed = document.getElementById("journeyPacked");
    const exception = document.getElementById("journeyException");

    if (assigned) assigned.textContent = m.assigned;
    if (picking) picking.textContent = m.picking;
    if (ready) ready.textContent = m.ready;
    if (packed) packed.textContent = m.packed;
    if (exception) exception.textContent = m.exception;
  }

  function renderLifecycleInsights() {
    const avgPick = document.getElementById("kpiAvgPickTime");
    const avgPack = document.getElementById("kpiAvgPackTime");
    const exceptionRate = document.getElementById("kpiExceptionRate");
    const bottleneck = document.getElementById("kpiBottleneck");

    const avgPickSec = getAvgPickTimeSeconds();
    const avgPackSec = getAvgPackTimeSeconds();
    const lifecycle = getLifecycleMetrics();

    if (avgPick) avgPick.textContent = `${avgPickSec}s`;
    if (avgPack) avgPack.textContent = `${avgPackSec}s`;
    if (exceptionRate) exceptionRate.textContent = `${lifecycle.exceptionRate}%`;
    if (bottleneck) bottleneck.textContent = getBottleneckStage();
  }

  function renderStageAging() {
    const aging = getStageAging();
    const assigned = document.getElementById("agingAssigned");
    const picking = document.getElementById("agingPicking");
    const ready = document.getElementById("agingReady");
    const exception = document.getElementById("agingException");

    if (assigned) assigned.textContent = formatDurationFromMs(aging.assigned);
    if (picking) picking.textContent = formatDurationFromMs(aging.picking);
    if (ready) ready.textContent = formatDurationFromMs(aging.ready);
    if (exception) exception.textContent = formatDurationFromMs(aging.exception);
  }

  function renderThroughput() {
    const t = getThroughputMetrics();
    const picks = document.getElementById("throughputPicks");
    const packs = document.getElementById("throughputPacks");
    const picksHour = document.getElementById("throughputPicksPerHour");
    const packsHour = document.getElementById("throughputPacksPerHour");

    if (picks) {
      picks.innerHTML = `<span style="color:#1e8e3e;font-weight:800;">${t.picksCompleted}</span> <span style="color:#61758d;">| ${t.predictedPicks}</span>`;
    }

    if (packs) {
      packs.innerHTML = `<span style="color:#1e8e3e;font-weight:800;">${t.packsCompleted}</span> <span style="color:#61758d;">| ${t.predictedPacks}</span>`;
    }

    if (picksHour) picksHour.textContent = t.picksPerHour;
    if (packsHour) packsHour.textContent = t.packsPerHour;
  }

  function renderExceptionQuality() {
    const q = getExceptionQuality();
    const total = document.getElementById("exceptionTotal");
    const reason = document.getElementById("exceptionTopReason");
    const picker = document.getElementById("exceptionTopPicker");
    const rate = document.getElementById("exceptionRate2");

    if (total) total.textContent = q.totalExceptions;
    if (reason) reason.textContent = q.topReason;
    if (picker) picker.textContent = q.topPicker;
    if (rate) rate.textContent = q.exceptionRate;
  }

  function renderReadyQueueTable() {
    const targets = [document.getElementById("readyQueueTable"), document.getElementById("packerReadyQueueTable")].filter(Boolean);
    if (!targets.length) return;

    const rows = getReadyQueue();
    const html = !rows.length ? "<p style='margin-top:12px;'>No orders currently waiting in ready queue.</p>" : `
      <table class="lifecycle-table">
        <thead>
          <tr>
            <th>SO</th>
            <th>Tote LP</th>
            <th>Carrier</th>
            <th>Picker</th>
            <th>Ready Since</th>
            <th>Queue Age</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.so}</td>
              <td>${r.toteLp}</td>
              <td>${r.carrier}</td>
              <td>${r.picker}</td>
              <td>${r.readySince ? new Date(r.readySince).toLocaleString() : "-"}</td>
              <td>${formatDurationFromMs(r.queueAgeMs)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    targets.forEach(el => {
      el.innerHTML = html;
    });
  }

  function renderOperationsSummaryCards() {
    const m = getLifecycleMetrics();
    const container = document.getElementById("dashboardSummaryCards");
    if (!container) return;

    container.innerHTML = `
      <div class="summary-card"><div class="summary-label">Total Orders</div><div class="summary-value">${m.total}</div></div>
      <div class="summary-card"><div class="summary-label">Assigned</div><div class="summary-value">${m.assigned}</div></div>
      <div class="summary-card"><div class="summary-label">In Progress</div><div class="summary-value">${m.picking}</div></div>
      <div class="summary-card"><div class="summary-label">Ready for Packing</div><div class="summary-value">${m.ready}</div></div>
      <div class="summary-card"><div class="summary-label">Packed</div><div class="summary-value">${m.packed}</div></div>
      <div class="summary-card"><div class="summary-label">Exceptions</div><div class="summary-value">${m.exception}</div></div>
    `;
  }

  function renderPickerAssignedVsCompletedChart() {
    const canvas = document.getElementById("pickerAssignedCompletedChart");
    if (!canvas || typeof Chart === "undefined") return;

    const pickerMetrics = getPickerMetrics();
    if (pickerAssignedChart) pickerAssignedChart.destroy();

    pickerAssignedChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: pickerMetrics.map(p => p.name),
        datasets: [
          { label: "Assigned", data: pickerMetrics.map(p => p.assigned), borderRadius: 8 },
          { label: "Completed", data: pickerMetrics.map(p => p.completed), borderRadius: 8 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderPickerAccuracyVsTimeChart() {
    const canvas = document.getElementById("pickerAccuracyTimeChart");
    if (!canvas || typeof Chart === "undefined") return;

    const pickerMetrics = getPickerMetrics();
    if (pickerAccuracyChart) pickerAccuracyChart.destroy();

    pickerAccuracyChart = new Chart(canvas, {
      data: {
        labels: pickerMetrics.map(p => p.name),
        datasets: [
          {
            type: "bar",
            label: "Avg Pick Time (sec)",
            data: pickerMetrics.map(p => p.avgPickTime),
            yAxisID: "y"
          },
          {
            type: "line",
            label: "Completion %",
            data: pickerMetrics.map(p => p.completionPercent),
            yAxisID: "y1",
            tension: 0.35
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            position: "left",
            title: { display: true, text: "Avg Pick Time (sec)" }
          },
          y1: {
            beginAtZero: true,
            position: "right",
            min: 0,
            max: 100,
            grid: { drawOnChartArea: false },
            title: { display: true, text: "Completion %" }
          }
        }
      }
    });
  }

  function renderPickerEfficiencyRating() {
    const container = document.getElementById("pickerStarRatings");
    if (!container) return;

    const pickerMetrics = getPickerMetrics();

    container.innerHTML = pickerMetrics.map(picker => {
      const completionRatio = picker.assigned ? picker.completed / picker.assigned : 0;

      let score = 0;

      if (picker.assigned > 0) score += 1;
      if (completionRatio >= 0.5) score += 1;
      if (completionRatio >= 0.8) score += 1;
      if (picker.avgPickTime > 0 && picker.avgPickTime <= 120) score += 1;
      if (picker.avgPickTime > 0 && picker.avgPickTime <= 60) score += 1;

      score = Math.max(0, Math.min(5, score));

      return `
        <div class="rating-row">
          <div class="rating-name">${picker.name}</div>
          <div class="rating-stars">${"★".repeat(score)}${"☆".repeat(5 - score)}</div>
          <div class="rating-meta">
            Assigned: ${picker.assigned} | Completed: ${picker.completed} | Avg Time: ${picker.avgPickTime}s
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPackerOutputChart() {
    const canvas = document.getElementById("packerOutputChart");
    if (canvas && canvas.parentElement) {
      canvas.parentElement.style.display = "none";
    }
  }

  function renderAdminExceptionChart() {
    const canvas = document.getElementById("adminExceptionChart");
    if (!canvas || typeof Chart === "undefined") return;

    const exceptionData = getAdminExceptionMetrics();
    if (adminExceptionChart) adminExceptionChart.destroy();

    adminExceptionChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: exceptionData.labels,
        datasets: [{
          label: "Order Count",
          data: exceptionData.values,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderOperationsDashboard() {
    renderJourneyFlow();
    renderLifecycleInsights();
    renderStageAging();
    renderThroughput();
    renderExceptionQuality();
    renderReadyQueueTable();

    renderOperationsSummaryCards();
    renderPickerAssignedVsCompletedChart();
    renderPickerAccuracyVsTimeChart();
    renderPickerEfficiencyRating();
    renderPackerOutputChart();
    renderAdminExceptionChart();
  }

  function initializeApp() {
    if (typeof loadState === "function") loadState();

    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.add("collapsed");

    showScreen("welcomeScreen");
    updateAccessByRole();
    renderOperationsDashboard();

    if (typeof renderPickerDashboard === "function") renderPickerDashboard();
    if (typeof renderPackerDashboard === "function") renderPackerDashboard();
    if (typeof renderAdminSummary === "function") renderAdminSummary();
    if (typeof renderSickToteList === "function") renderSickToteList();
  }

  window.toggleSidebar = toggleSidebar;
  window.showScreen = showScreen;
  window.updateAccessByRole = updateAccessByRole;
  window.renderOperationsDashboard = renderOperationsDashboard;
  window.initializeApp = initializeApp;
  window.openRoleAccess = openRoleAccess;
  window.logoutUser = logoutUser;
  window.continueFromWelcome = continueFromWelcome;
  window.handleWelcomeKeydown = handleWelcomeKeydown;
  window.syncPickerSelection = syncPickerSelection;

  document.addEventListener("DOMContentLoaded", initializeApp);
  window.addEventListener("load", function () {
    setTimeout(renderOperationsDashboard, 100);
  });
})();

(function () {
  function normalizeScannerValue(el) {
    if (!el) return "";
    el.value = String(el.value || "").replace(/\r/g, "").replace(/\n/g, "").trim();
    return el.value;
  }

  function bindScannerInput(inputId, callback) {
    const el = document.getElementById(inputId);
    if (!el || typeof callback !== "function") return;

    let timer = null;
    let lastTriggeredValue = "";
    let triggerLock = false;

    function runCallback() {
      const value = normalizeScannerValue(el);
      if (!value) return;
      if (triggerLock && value === lastTriggeredValue) return;

      triggerLock = true;
      lastTriggeredValue = value;

      try {
        callback();
      } finally {
        window.setTimeout(() => {
          triggerLock = false;
        }, 250);
      }
    }

    el.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        window.clearTimeout(timer);
        runCallback();
      }
    });

    el.addEventListener("change", function () {
      window.clearTimeout(timer);
      runCallback();
    });

    el.addEventListener("input", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(runCallback, 120);
    });
  }

  function bindHardwareScannerWorkflow() {
    bindScannerInput("manualSkuInput", function () {
      if (typeof validateSku === "function") validateSku();
    });

    bindScannerInput("manualToteInput", function () {
      if (typeof validateTote === "function") validateTote();
    });

    bindScannerInput("packerToteInput", function () {
      if (typeof setPackerTote === "function") setPackerTote();
    });

    bindScannerInput("packerSkuInput", function () {
      if (typeof verifyPackerSku === "function") verifyPackerSku();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindHardwareScannerWorkflow);
  } else {
    bindHardwareScannerWorkflow();
  }
})();

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
