const API_BASE = "http://127.0.0.1:5000";

console.log("FinAI Pro app.js v6 (auth + goals + AI + notifications + chat) loaded");

// Firebase current user (set by onAuthStateChanged)
let currentUser = null;

let balanceLineChart = null;
let categoryPieChart = null;
let currentAlerts = [];
let aiChatHistory = []; // for AI Advisor chat

// helper to append uid as query param for all API calls
function apiUrl(path) {
  const uid = currentUser?.uid;
  const base = `${API_BASE}${path}`;
  if (!uid) return base;
  const sep = path.includes("?") ? "&" : "?";
  return `${base}${sep}uid=${encodeURIComponent(uid)}`;
}

// ---------- DASHBOARD SUMMARY ----------

async function fetchSummary() {
  const res = await fetch(apiUrl("/api/summary"));
  const data = await res.json();

  document.getElementById("current-balance").innerText =
    `₹${data.currentBalance.toFixed(2)}`;
  document.getElementById("total-spending").innerText =
    `₹${data.totalSpending.toFixed(2)}`;
  document.getElementById("total-income").innerText =
    `₹${data.totalIncome.toFixed(2)}`;
}

// ---------- TRANSACTIONS TABLE (LIST / EDIT / DELETE) ----------

async function fetchTransactions() {
  const res = await fetch(apiUrl("/api/transactions"));
  const data = await res.json();

  const tbody = document.getElementById("transactions-body");
  const tbodyFull = document.getElementById("transactions-body-full");

  if (!tbody) return data;

  tbody.innerHTML = "";
  if (tbodyFull) tbodyFull.innerHTML = "";

  if (data.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.innerText =
      "No transactions yet. Add your first transaction to get started.";
    td.style.color = "#e5e7eb";
    tr.appendChild(td);
    tbody.appendChild(tr);

    if (tbodyFull) {
      const tr2 = tr.cloneNode(true);
      tbodyFull.appendChild(tr2);
    }
    return data;
  }

  data.forEach(tx => {
    const rowHtml = `
      <td class="px-4 py-2 whitespace-nowrap">${tx.date}</td>
      <td class="px-4 py-2 whitespace-nowrap capitalize">${tx.type}</td>
      <td class="px-4 py-2 whitespace-nowrap">${tx.category}</td>
      <td class="px-4 py-2">${tx.description}</td>
      <td class="px-4 py-2 whitespace-nowrap">₹${Number(tx.amount).toFixed(2)}</td>
      <td class="px-4 py-2 space-x-2">
        <button
          class="px-2 py-0.5 rounded-full text-[11px] font-semibold
                 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-colors"
          data-action="edit"
        >
          Edit
        </button>
          <button
          class="px-2 py-0.5 rounded-full text-[11px] font-semibold
                 bg-red-500/5 text-red-300 hover:bg-red-500/20 transition-colors"
          data-action="delete"
        >
          Delete
        </button>
      </td>
    `;

    const tr = document.createElement("tr");
    tr.dataset.txId = tx.id;
    tr.className =
      "odd:bg-slate-950/40 even:bg-slate-900/40 hover:bg-slate-800/60 transition-colors";
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);

    if (tbodyFull) {
      const trFull = document.createElement("tr");
      trFull.dataset.txId = tx.id;
      trFull.className =
        "odd:bg-slate-950/40 even:bg-slate-900/40 hover:bg-slate-800/60 transition-colors";
      trFull.innerHTML = rowHtml;
      tbodyFull.appendChild(trFull);
    }
  });

  [tbody, tbodyFull].forEach(tbodyEl => {
    if (!tbodyEl) return;
    tbodyEl.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const action = e.currentTarget.getAttribute("data-action");
        const row = e.currentTarget.closest("tr");
        const id = row.dataset.txId;

        if (action === "delete") {
          if (!confirm("Delete this transaction?")) return;
          await deleteTransaction(id);
        } else if (action === "edit") {
          startEditTransaction(row, id);
        }
      });
    });
  });

  return data;
}

async function deleteTransaction(id) {
  const res = await fetch(apiUrl(`/api/transactions/${id}`), {
    method: "DELETE",
  });
  if (res.ok) {
    await fetchSummary();
    await fetchTransactions();
    await fetchCategorySummary();
    await renderBalanceLineChart();
    await renderCategoryPieChart();
    await fetchGoalsWithProgress();
    await fetchAiInsights();
  } else {
    alert("Failed to delete transaction");
  }
}

function startEditTransaction(row, id) {
  const cells = row.querySelectorAll("td");
  const [dateTd, typeTd, categoryTd, descTd, amountTd, actionsTd] = cells;

  const original = {
    date: dateTd.textContent.trim(),
    type: typeTd.textContent.trim(),
    category: categoryTd.textContent.trim(),
    description: descTd.textContent.trim(),
    amount: amountTd.textContent.replace(/[₹,]/g, "").trim()
  };

  dateTd.innerHTML =
    `<input type="date" class="border rounded px-1 py-0.5 text-xs text-black" value="${original.date}">`;

  typeTd.innerHTML = `
    <select class="border rounded px-1 py-0.5 text-xs text-black">
      <option value="income" ${original.type === "income" ? "selected" : ""}>income</option>
      <option value="expense" ${original.type === "expense" ? "selected" : ""}>expense</option>
    </select>
  `;

  categoryTd.innerHTML =
    `<input type="text" class="border rounded px-1 py-0.5 text-xs text-black" value="${original.category}">`;

  descTd.innerHTML =
    `<input type="text" class="border rounded px-1 py-0.5 text-xs text-black" value="${original.description}">`;

  amountTd.innerHTML =
    `<input type="number" step="0.01" class="border rounded px-1 py-0.5 text-xs text-black" value="${original.amount}">`;

  actionsTd.innerHTML = `
    <button class="text-emerald-500 hover:text-emerald-300 text-xs font-semibold" data-action="save">
      Save
    </button>
    <button class="text-slate-400 hover:text-slate-200 text-xs font-semibold" data-action="cancel">
      Cancel
    </button>
  `;

  actionsTd.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const action = e.currentTarget.getAttribute("data-action");
      if (action === "cancel") {
        await fetchTransactions();
        await renderBalanceLineChart();
        await renderCategoryPieChart();
        await fetchGoalsWithProgress();
        await fetchAiInsights();
      } else if (action === "save") {
        await saveEditedTransaction(row, id);
      }
    });
  });
}

async function saveEditedTransaction(row, id) {
  const inputs = row.querySelectorAll("td input, td select");
  const [dateInput, typeSelect, categoryInput, descInput, amountInput] = inputs;

  const payload = {
    date: dateInput.value,
    type: typeSelect.value,
    category: categoryInput.value,
    description: descInput.value,
    amount: parseFloat(amountInput.value)
  };

  const res = await fetch(apiUrl(`/api/transactions/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    await fetchSummary();
    await fetchTransactions();
    await fetchCategorySummary();
    await renderBalanceLineChart();
    await renderCategoryPieChart();
    await fetchGoalsWithProgress();
    await fetchAiInsights();
  } else {
    alert("Failed to update transaction");
  }
}

// ---------- CATEGORY SUMMARY ----------

async function fetchCategorySummary() {
  const res = await fetch(apiUrl("/api/summary/categories"));
  const data = await res.json();

  const container = document.getElementById("category-summary");
  if (!container) return;

  if (data.length === 0) {
    container.textContent = "Add expenses to see category breakdown.";
    return;
  }

  container.innerHTML = "";

  data.forEach(item => {
    const row = document.createElement("div");
    row.className = "flex justify-between text-sm mb-1";
    row.innerHTML = `
      <span class="font-medium text-gray-100">${item.category}</span>
      <span class="text-gray-300">₹${item.total.toFixed(2)}</span>
    `;
    container.appendChild(row);
  });
}

// ---------- ANALYTICS CHARTS ----------

async function renderBalanceLineChart() {
  const res = await fetch(apiUrl("/api/transactions"));
  const data = await res.json();

  const ctx = document.getElementById("balanceLineChart");
  if (!ctx || data.length === 0) return;

  const txByDate = {};
  data.forEach(tx => {
    if (!tx.date) return;
    const amt = Number(tx.amount) || 0;
    if (!txByDate[tx.date]) {
      txByDate[tx.date] = { income: 0, expense: 0 };
    }
    if (tx.type === "income") {
      txByDate[tx.date].income += amt;
    } else {
      txByDate[tx.date].expense += amt;
    }
  });

  const dates = Object.keys(txByDate).sort();
  if (dates.length === 0) return;

  const netChanges = dates.map(d => {
    const { income, expense } = txByDate[d];
    return income - expense;
  });

  if (balanceLineChart) balanceLineChart.destroy();

  balanceLineChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        {
          label: "Net Change per Day (₹)",
          data: netChanges,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.15)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: "#1d4ed8"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#9ca3af" } },
        y: {
          ticks: { color: "#9ca3af" },
          beginAtZero: true
        }
      },
      plugins: {
        legend: { labels: { color: "#e5e7eb" } }
      }
    }
  });
}

async function renderCategoryPieChart() {
  const res = await fetch(apiUrl("/api/summary/categories"));
  const data = await res.json();

  const ctx = document.getElementById("categoryPieChart");
  if (!ctx || data.length === 0) return;

  const labels = data.map(item => item.category);
  const values = data.map(item => Number(item.total) || 0);

  if (categoryPieChart) categoryPieChart.destroy();

  const colors = [
    "#3b82f6", "#22c55e", "#ef4444", "#f97316",
    "#a855f7", "#06b6d4", "#eab308", "#f472b6"
  ];

  categoryPieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((_, i) => colors[i % colors.length]),
          borderWidth: 1,
          borderColor: "#020617"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#e5e7eb" }
        }
      }
    }
  });
}

// ---------- GOALS (MONTHLY LIMITS) ----------

async function fetchGoalsWithProgress() {
  const res = await fetch(apiUrl("/api/goals/with-progress"));
  const goals = await res.json();

  const tbody = document.getElementById("goals-body");
  const totalCountEl = document.getElementById("goals-total-count");
  const totalTargetEl = document.getElementById("goals-total-target");
  const totalSpentEl = document.getElementById("goals-total-saved");

  if (!tbody) return;

  tbody.innerHTML = "";

  if (goals.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.innerText = "No goals yet. Add your first monthly limit.";
    td.style.color = "#000";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  let totalTarget = 0;
  let totalSpent = 0;

  goals.forEach(goal => {
    const limit = Number(goal.limitAmount) || 0;
    const spent = Number(goal.spentAmount || 0);
    const progress = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
    const overLimit = spent > limit;

    totalTarget += limit;
    totalSpent += spent;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-4 py-2 text-sm">
        <div class="font-medium text-gray-900">${goal.name}</div>
        <div class="text-xs text-gray-500">Category: ${goal.category} • Month: ${goal.month}</div>
      </td>
      <td class="px-4 py-2 text-sm">₹${limit.toFixed(2)}</td>
      <td class="px-4 py-2 text-sm ${overLimit ? "text-red-600 font-semibold" : "text-gray-800"}">
        ₹${spent.toFixed(2)}
      </td>
      <td class="px-4 py-2 text-sm">
        <div class="w-full bg-gray-200 rounded-full h-2 mb-1">
          <div
            class="h-2 rounded-full ${overLimit ? "bg-red-500" : "bg-emerald-500"}"
            style="width: ${progress}%;"
          ></div>
        </div>
        <span class="text-xs text-gray-600">${progress.toFixed(0)}%</span>
      </td>
      <td class="px-4 py-2 text-sm">${goal.month}</td>
    `;
    tbody.appendChild(tr);
  });

  if (totalCountEl) totalCountEl.innerText = goals.length;
  if (totalTargetEl) totalTargetEl.innerText = `₹${totalTarget.toFixed(2)}`;
  if (totalSpentEl) totalSpentEl.innerText = `₹${totalSpent.toFixed(2)}`;
}

async function addGoalFromForm(event) {
  event.preventDefault();
  const form = event.target;

  const payload = {
    name: form.name.value,
    category: form.category.value || "all",
    month: form.month.value,
    limitAmount: parseFloat(form.limitAmount.value)
  };

  const res = await fetch(apiUrl("/api/goals"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    form.reset();
    await fetchGoalsWithProgress();
    await fetchAiInsights();
  } else {
    alert("Failed to add goal");
  }
}

// ---------- AI INSIGHTS (cards + bell) ----------

async function fetchAiInsights() {
  try {
    const res = await fetch(apiUrl("/api/ai/insights"));
    if (!res.ok) throw new Error("Failed to fetch AI insights");
    const data = await res.json();
    renderAiCard(data);
    renderNotifications(data.alerts || []);
  } catch (err) {
    console.error(err);
  }
}

function renderAiCard(data) {
  const textEl = document.getElementById("ai-insight-text");
  if (!textEl) return;

  const summary = data.summary || "AI could not generate insights yet.";
  const suggestions = data.suggestions || [];

  if (suggestions.length === 0) {
    textEl.textContent = summary;
  } else {
    textEl.textContent = `${summary} ${suggestions[0]}`;
  }
}

function renderNotifications(alerts) {
  currentAlerts = alerts || [];

  const badge = document.getElementById("notification-badge");
  const list = document.getElementById("notification-list");
  if (!badge || !list) return;

  list.innerHTML = "";

  if (currentAlerts.length === 0) {
    badge.classList.add("hidden");
    const empty = document.createElement("div");
    empty.className = "px-3 py-3 text-gray-400";
    empty.textContent = "No alerts. You’re on track.";
    list.appendChild(empty);
    return;
  }

  badge.textContent = currentAlerts.length;
  badge.classList.remove("hidden");

  currentAlerts.forEach(alert => {
    const type = alert.type || "info";
    const colorClass =
      type === "danger"
        ? "border-red-500/40 bg-red-500/5 text-red-200"
        : type === "warning"
        ? "border-yellow-500/40 bg-yellow-500/5 text-yellow-200"
        : "border-emerald-500/40 bg-emerald-500/5 text-emerald-200";

    const item = document.createElement("div");
    item.className = "px-3 py-2 border-b border-white/5";
    item.innerHTML = `
      <div class="text-[11px] ${colorClass} px-2 py-1 rounded-lg flex items-start space-x-2">
        <span class="mt-0.5">
          ${type === "danger" ? "⛔" : type === "warning" ? "⚠️" : "✅"}
        </span>
        <span>${alert.message}</span>
      </div>
    `;
    list.appendChild(item);
  });
}

// ---------- AI ADVISOR CHAT ----------

function appendChatMessage(role, content) {
  const container = document.getElementById("ai-chat-messages");
  if (!container) return;

  const wrapper = document.createElement("div");
  const isUser = role === "user";

  wrapper.className = `flex ${isUser ? "justify-end" : "justify-start"}`;

  const bubble = document.createElement("div");
  bubble.className = [
    "max-w-lg",
    "px-3",
    "py-2",
    "rounded-2xl",
    "text-sm",
    isUser
      ? "bg-blue-600 text-white"
      : "bg-white/5 border border-blue-500/40 text-blue-100",
  ].join(" ");

  bubble.textContent = content;
  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;
}

async function sendAiChatMessage(message) {
  appendChatMessage("user", message);
  aiChatHistory.push({ role: "user", content: message });

  appendChatMessage("assistant", "Thinking...");
  const container = document.getElementById("ai-chat-messages");
  const thinkingWrapper = container.lastChild;

  try {
    const res = await fetch(apiUrl("/api/ai/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: aiChatHistory,
      }),
    });

    if (!res.ok) throw new Error("AI request failed");

    const data = await res.json();
    const reply = data.reply || "Sorry, I could not generate an answer.";

    const inner = thinkingWrapper.querySelector("div");
    if (inner) inner.textContent = reply;

    aiChatHistory.push({ role: "assistant", content: reply });
  } catch (err) {
    console.error(err);
    const inner = thinkingWrapper.querySelector("div");
    if (inner) inner.textContent = "Error talking to AI. Please try again.";
  }
}

// Clear chat
function clearAiChat() {
  aiChatHistory = [];
  const container = document.getElementById("ai-chat-messages");
  if (!container) return;

  container.innerHTML = `
    <div class="flex">
      <div class="max-w-lg bg-white/5 border border-blue-500/40 rounded-2xl px-3 py-2 text-blue-100">
        Hi, I’m your finance assistant. You can ask things like
        “Where am I overspending?” or “How much can I safely spend this weekend?”.
      </div>
    </div>
  `;
}

// ---------- NAVIGATION ----------

function showPage(pageId) {
  const pages = [
    "dashboard-page",
    "transactions-page",
    "analytics-page",
    "goals-page",
    "ai-page"
  ];
  pages.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === pageId) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
}

function setActiveNav(activeId) {
  const navIds = [
    "nav-dashboard",
    "nav-transactions",
    "nav-analytics",
    "nav-goals",
    "nav-ai-advisor"
  ];
  navIds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (id === activeId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

// ---------- ADD TRANSACTION FORM ----------

async function addTransactionFromForm(event) {
  event.preventDefault();
  const form = event.target;

  const payload = {
    date: form.date.value,
    type: form.type.value,
    category: form.category.value,
    description: form.description.value,
    amount: parseFloat(form.amount.value)
  };

  const res = await fetch(apiUrl("/api/transactions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    form.reset();
    await fetchSummary();
    await fetchTransactions();
    await fetchCategorySummary();
    await renderBalanceLineChart();
    await renderCategoryPieChart();
    await fetchGoalsWithProgress();
    await fetchAiInsights();
  } else {
    alert("Failed to add transaction");
  }
}

// ---------- INITIALIZE PAGE + AUTH ----------

document.addEventListener("DOMContentLoaded", () => {
  // DEBUG: force sign-out when visiting with ?forceLogin=1 to ensure login page appears
  try {
    if (location.search.includes('forceLogin')) {
      if (window.firebase && firebase.auth) {
        firebase.auth().signOut().catch(() => {});
      }
    }
  } catch (e) {
    // ignore in environments where firebase isn't available yet
  }
  const authPage = document.getElementById("auth-page");
  const appWrapper = document.getElementById("app-wrapper");

  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const authError = document.getElementById("auth-error");
  const registerError = document.getElementById("register-error");

  // Tabs
  if (tabLogin && tabRegister && loginForm && registerForm) {
    tabLogin.addEventListener("click", () => {
      tabLogin.classList.add("bg-slate-800/80", "text-slate-100");
      tabRegister.classList.remove("bg-slate-800/80", "text-slate-100");
      loginForm.classList.remove("hidden");
      registerForm.classList.add("hidden");
      authError.textContent = "";
      registerError.textContent = "";
    });

    tabRegister.addEventListener("click", () => {
      tabRegister.classList.add("bg-slate-800/80", "text-slate-100");
      tabLogin.classList.remove("bg-slate-800/80", "text-slate-100");
      registerForm.classList.remove("hidden");
      loginForm.classList.add("hidden");
      authError.textContent = "";
      registerError.textContent = "";
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      authError.textContent = "";
      const email = loginForm.email.value.trim();
      const password = loginForm.password.value;
      try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
      } catch (err) {
        authError.textContent = err.message;
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      registerError.textContent = "";
      const email = registerForm.email.value.trim();
      const password = registerForm.password.value;
      try {
        await firebase.auth().createUserWithEmailAndPassword(email, password);
      } catch (err) {
        registerError.textContent = err.message;
      }
    });
  }

  // existing bindings
  const form = document.getElementById("add-transaction-form");
  if (form) form.addEventListener("submit", addTransactionFromForm);

  const goalsForm = document.getElementById("add-goal-form");
  if (goalsForm) goalsForm.addEventListener("submit", addGoalFromForm);

  const btnAiClear = document.getElementById("btn-ai-clear-chat");
  if (btnAiClear) {
    btnAiClear.addEventListener("click", clearAiChat);
  }

  const navDashboard = document.getElementById("nav-dashboard");
  const navTransactions = document.getElementById("nav-transactions");
  const navAnalytics = document.getElementById("nav-analytics");
  const navGoals = document.getElementById("nav-goals");
  const navAi = document.getElementById("nav-ai-advisor");

  if (navDashboard) {
    navDashboard.addEventListener("click", () => {
      showPage("dashboard-page");
      setActiveNav("nav-dashboard");
    });
  }

  if (navTransactions) {
    navTransactions.addEventListener("click", () => {
      showPage("transactions-page");
      setActiveNav("nav-transactions");
    });
  }

  if (navAnalytics) {
    navAnalytics.addEventListener("click", () => {
      showPage("analytics-page");
      setActiveNav("nav-analytics");
      renderBalanceLineChart();
      renderCategoryPieChart();
    });
  }

  if (navGoals) {
    navGoals.addEventListener("click", () => {
      showPage("goals-page");
      setActiveNav("nav-goals");
      fetchGoalsWithProgress();
    });
  }

  if (navAi) {
    navAi.addEventListener("click", () => {
      showPage("ai-page");
      setActiveNav("nav-ai-advisor");
      const msgBox = document.getElementById("ai-chat-messages");
      if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;
    });
  }

  const btnAiSidebar = document.getElementById("btn-ai-smart-tips");
  const btnAiMain = document.getElementById("btn-ai-recommendation");
  if (btnAiSidebar) btnAiSidebar.addEventListener("click", fetchAiInsights);
  if (btnAiMain) btnAiMain.addEventListener("click", fetchAiInsights);

  const btnNotifications = document.getElementById("btn-notifications");
  const notifPanel = document.getElementById("notification-panel");
  const btnClearNotifs = document.getElementById("btn-clear-notifications");

  if (btnNotifications && notifPanel) {
    btnNotifications.addEventListener("click", () => {
      notifPanel.classList.toggle("hidden");
    });
  }

  if (btnClearNotifs) {
    btnClearNotifs.addEventListener("click", () => {
      renderNotifications([]);
    });
  }

  document.addEventListener("click", (e) => {
    if (!notifPanel) return;
    const wrapper = document.getElementById("notification-wrapper");
    if (wrapper && !wrapper.contains(e.target)) {
      notifPanel.classList.add("hidden");
    }
  });

  const aiChatForm = document.getElementById("ai-chat-form");
  const aiChatInput = document.getElementById("ai-chat-input");
  if (aiChatForm && aiChatInput) {
    aiChatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = aiChatInput.value.trim();
      if (!text) return;
      aiChatInput.value = "";
      sendAiChatMessage(text);
    });
  }

  // Logout button
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        if (window.firebase && firebase.auth) {
          await firebase.auth().signOut();
        }
      } catch (e) {
        console.error('Sign-out failed', e);
      }
      // ensure UI updates to auth page
      location.reload();
    });
  }

  // Auth state listener
  firebase.auth().onAuthStateChanged(async (user) => {
    currentUser = user || null;

    if (!user) {
      if (authPage) authPage.classList.remove("hidden");
      if (appWrapper) appWrapper.classList.add("hidden");
      return;
    }

    if (authPage) authPage.classList.add("hidden");
    if (appWrapper) appWrapper.classList.remove("hidden");

    await fetchSummary();
    await fetchTransactions().then(() => {
      renderBalanceLineChart();
    });
    await fetchCategorySummary().then(() => {
      renderCategoryPieChart();
    });
    await fetchGoalsWithProgress();
    await fetchAiInsights();

    showPage("dashboard-page");
    setActiveNav("nav-dashboard");
  });
});
