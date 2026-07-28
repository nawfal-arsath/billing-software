/* ShopBill - stock / inventory */
const Inventory = (function () {
  let revealCost = false;

  function init() {
    document.getElementById("add-item-btn").addEventListener("click", () => openModal());
    document.getElementById("item-cancel").addEventListener("click", closeModal);
    document.getElementById("item-form").addEventListener("submit", onSubmit);
    document.getElementById("item-delete").addEventListener("click", onDelete);
    document.getElementById("stock-search").addEventListener("input", render);
    document.getElementById("reveal-toggle").addEventListener("click", () => {
      revealCost = !revealCost;
      document.getElementById("reveal-toggle").classList.toggle("active", revealCost);
      render();
    });
  }

  function openModal(id) {
    const form = document.getElementById("item-form");
    form.reset();
    const item = id ? DB.getItem(id) : null;
    document.getElementById("item-id").value = item ? item.id : "";
    document.getElementById("item-name").value = item ? item.name : "";
    document.getElementById("item-brand").value = item ? item.brand || "" : "";
    document.getElementById("item-model").value = item ? item.model || "" : "";
    document.getElementById("item-size").value = item ? item.size || "" : "";
    document.getElementById("item-color").value = item ? item.color || "" : "";
    document.getElementById("item-cost").value = item ? item.cost ?? "" : "";
    document.getElementById("item-price").value = item ? item.price ?? "" : "";
    document.getElementById("item-qty").value = item ? item.qty ?? 0 : 1;
    document.getElementById("item-modal-title").textContent = item ? "Edit item" : "Add item";
    document.getElementById("item-delete").classList.toggle("hidden", !item || !Auth.isAdmin());
    document.getElementById("item-modal").classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("item-modal").classList.add("hidden");
  }

  async function onSubmit(e) {
    e.preventDefault();
    const item = {
      id: document.getElementById("item-id").value || undefined,
      name: document.getElementById("item-name").value.trim(),
      brand: document.getElementById("item-brand").value.trim(),
      model: document.getElementById("item-model").value.trim(),
      size: document.getElementById("item-size").value.trim(),
      color: document.getElementById("item-color").value.trim(),
      cost: Number(document.getElementById("item-cost").value) || 0,
      price: Number(document.getElementById("item-price").value) || 0,
      qty: Number(document.getElementById("item-qty").value) || 0,
    };
    if (!item.name) return;
    try {
      await DB.upsertItem(item);
    } catch (err) {
      return App.toast("Could not save item.");
    }
    closeModal();
    render();
    App.toast("Saved");
  }

  async function onDelete() {
    const id = document.getElementById("item-id").value;
    if (id && confirm("Delete this item permanently?")) {
      try {
        await DB.deleteItem(id);
      } catch (err) {
        return App.toast("Could not delete item.");
      }
      closeModal();
      render();
      App.toast("Deleted");
    }
  }

  function render() {
    const items = DB.getItems();
    const q = (document.getElementById("stock-search").value || "").toLowerCase().trim();
    const code = (DB.getSettings() || {}).costCode || "";
    const list = document.getElementById("stock-list");

    // Stats
    const isAdmin = Auth.isAdmin();
    const totalItems = items.length;
    const totalUnits = items.reduce((a, x) => a + (Number(x.qty) || 0), 0);
    const stockValue = items.reduce((a, x) => a + (Number(x.cost) || 0) * (Number(x.qty) || 0), 0);
    document.getElementById("stock-stats").innerHTML = `
      <div class="stat-pill"><div class="sp-val">${totalItems}</div><div class="sp-label">Items</div></div>
      <div class="stat-pill"><div class="sp-val">${totalUnits}</div><div class="sp-label">Units in stock</div></div>
      ${isAdmin ? `<div class="stat-pill"><div class="sp-val">${revealCost ? U.money(stockValue) : U.toCode(stockValue, code)}</div><div class="sp-label">Stock value (cost)</div></div>` : ""}
    `;

    const filtered = items
      .filter((x) => !q || matches(x, q))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!filtered.length) {
      list.innerHTML = `<p class="empty-note">${items.length ? "No matching items." : "No stock yet. Tap “+ Add item”."}</p>`;
      return;
    }

    list.innerHTML = filtered
      .map((x) => {
        const costDisplay = revealCost ? U.money(x.cost) : U.toCode(x.cost, code);
        const low = (Number(x.qty) || 0) <= 2;
        return `
        <div class="stock-card" data-id="${x.id}">
          <div class="sc-info">
            <div class="sc-name">${x.brand ? esc(x.brand) + " · " : ""}${esc(x.name)}</div>
            <div class="sc-sub">${subLine(x)}</div>
            ${isAdmin ? `<div class="sc-cost">Cost: ${costDisplay}</div>` : ""}
          </div>
          <div class="sc-right">
            <div class="sc-price">${U.money(x.price)}</div>
            <div class="sc-qty ${low ? "low" : ""}">Qty: ${Number(x.qty) || 0}</div>
          </div>
        </div>`;
      })
      .join("");

    list.querySelectorAll(".stock-card").forEach((el) => {
      el.addEventListener("click", () => openModal(el.dataset.id));
    });
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Human-readable variant line (Model / Size / Color).
  function subLine(x) {
    const parts = [];
    if (x.model) parts.push("Art: " + esc(x.model));
    if (x.size) parts.push("Size " + esc(x.size));
    if (x.color) parts.push(esc(x.color));
    return parts.join(" · ") || "&nbsp;";
  }

  function matches(x, q) {
    return [x.name, x.brand, x.model, x.size, x.color]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(q));
  }

  return { init, render, esc, subLine, matches };
})();
