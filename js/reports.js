/* ShopBill - sales reports & dashboard */
const Reports = (function () {
  let range = "day";

  function init() {
    document.querySelectorAll(".range-btn").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".range-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        range = b.dataset.range;
        render();
      });
    });
  }

  function inRange(ts) {
    if (range === "day") return ts >= U.todayStart().getTime();
    if (range === "yesterday") {
      const yStart = U.todayStart(new Date(Date.now() - 86400000)).getTime();
      return ts >= yStart && ts < yStart + 86400000;
    }
    if (range === "week") return ts >= U.startOfWeek().getTime();
    if (range === "month") return ts >= U.startOfMonth().getTime();
    return true; // all
  }

  function render() {
    const isAdmin = Auth.isAdmin();
    // Billers can only view Today / Yesterday - never fall back to a wider range.
    if (!isAdmin && range !== "day" && range !== "yesterday") range = "day";

    const sales = DB.getSales();
    const filtered = sales.filter((s) => inRange(s.date));

    const revenue = filtered.reduce((a, s) => a + (s.total || 0), 0);
    const profit = filtered.reduce((a, s) => a + (s.profit || 0), 0);
    const count = filtered.length;
    const units = filtered.reduce((a, s) => a + s.items.reduce((b, i) => b + i.qty, 0), 0);
    const cashTotal = filtered.filter((s) => (s.paymentMethod || "cash") !== "gpay").reduce((a, s) => a + (s.total || 0), 0);
    const gpayTotal = filtered.filter((s) => (s.paymentMethod || "cash") === "gpay").reduce((a, s) => a + (s.total || 0), 0);

    document.getElementById("kpi-grid").innerHTML = `
      <div class="kpi"><div class="k-val">${U.money(revenue)}</div><div class="k-label">Sales revenue</div></div>
      ${isAdmin ? `<div class="kpi"><div class="k-val profit">${U.money(profit)}</div><div class="k-label">Profit</div></div>` : ""}
      <div class="kpi"><div class="k-val">${count}</div><div class="k-label">Bills</div></div>
      <div class="kpi"><div class="k-val">${units}</div><div class="k-label">Items sold</div></div>
      <div class="kpi"><div class="k-val">${U.money(cashTotal)}</div><div class="k-label">💵 Cash</div></div>
      <div class="kpi"><div class="k-val">${U.money(gpayTotal)}</div><div class="k-label">📱 GPay</div></div>
    `;

    renderChart(sales);
    renderHistory(filtered);
  }

  function renderChart(sales) {
    const buckets = [];
    const now = new Date();

    if (range === "day" || range === "yesterday") {
      // last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = U.todayStart(new Date(now.getTime() - i * 86400000));
        buckets.push({ label: d.toLocaleDateString("en-IN", { weekday: "short" }), start: d.getTime(), end: d.getTime() + 86400000 });
      }
      document.getElementById("chart-title").textContent = "Last 7 days";
    } else if (range === "week") {
      // last 4 weeks
      for (let i = 3; i >= 0; i--) {
        const start = U.startOfWeek(new Date(now.getTime() - i * 7 * 86400000));
        buckets.push({ label: (i === 0 ? "This wk" : i + "w ago"), start: start.getTime(), end: start.getTime() + 7 * 86400000 });
      }
      document.getElementById("chart-title").textContent = "Last 4 weeks";
    } else {
      // last 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        buckets.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), start: d.getTime(), end: end.getTime() });
      }
      document.getElementById("chart-title").textContent = "Last 6 months";
    }

    buckets.forEach((b) => {
      b.value = sales.filter((s) => s.date >= b.start && s.date < b.end).reduce((a, s) => a + (s.total || 0), 0);
    });
    const max = Math.max(1, ...buckets.map((b) => b.value));

    document.getElementById("chart").innerHTML = buckets
      .map((b) => {
        const h = Math.round((b.value / max) * 100);
        return `<div class="bar-col">
          <div class="bar-val">${b.value ? shortMoney(b.value) : ""}</div>
          <div class="bar" style="height:${h}%"></div>
          <div class="bar-label">${b.label}</div>
        </div>`;
      })
      .join("");
  }

  function shortMoney(n) {
    if (n >= 100000) return "\u20B9" + (n / 100000).toFixed(1) + "L";
    if (n >= 1000) return "\u20B9" + (n / 1000).toFixed(1) + "k";
    return "\u20B9" + n;
  }

  function renderHistory(filtered) {
    const box = document.getElementById("sales-history");
    if (!filtered.length) {
      box.innerHTML = `<p class="empty-note">No bills in this period yet.</p>`;
      return;
    }
    const sorted = [...filtered].sort((a, b) => b.date - a.date);
    box.innerHTML = sorted
      .map((s) => {
        const names = s.items.map((i) => i.name + " ×" + i.qty).join(", ");
        const pay = (s.paymentMethod || "cash") === "gpay" ? "📱 GPay" : "💵 Cash";
        return `<div class="sale-card" data-id="${s.id}">
          <div class="sale-top">
            <span>${U.fmtDateTime(s.date)}</span>
            <span class="sale-total">${U.money(s.total)}</span>
          </div>
          <div class="sale-meta">${Inventory.esc(names)}${s.customerName ? " · " + Inventory.esc(s.customerName) : ""}</div>
          <div class="sale-pay">${pay}</div>
        </div>`;
      })
      .join("");

    box.querySelectorAll(".sale-card").forEach((el) => {
      el.addEventListener("click", () => {
        const sale = DB.getSales().find((x) => x.id === el.dataset.id);
        if (sale) Billing.showBillPreview(sale);
      });
    });
  }

  return { init, render };
})();
