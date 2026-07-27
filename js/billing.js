/* ShopBill - billing / cart */
const Billing = (function () {
  // cart line: { itemId, name, model, price (editable), qty, stock }
  let cart = [];
  let lastSale = null;

  function init() {
    const search = document.getElementById("item-search");
    search.addEventListener("input", onSearch);
    search.addEventListener("focus", onSearch);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-wrap")) {
        document.getElementById("search-results").innerHTML = "";
      }
    });

    document.getElementById("cart-discount").addEventListener("input", renderCart);
    document.getElementById("clear-bill").addEventListener("click", clearCart);
    document.getElementById("save-bill").addEventListener("click", saveBill);

    document.getElementById("bill-close").addEventListener("click", () =>
      document.getElementById("bill-modal").classList.add("hidden")
    );
    document.getElementById("bill-whatsapp").addEventListener("click", sendWhatsApp);
    document.getElementById("bill-delete").addEventListener("click", deleteBill);
  }

  function onSearch() {
    const q = (document.getElementById("item-search").value || "").toLowerCase().trim();
    const box = document.getElementById("search-results");
    if (!q) {
      box.innerHTML = "";
      return;
    }
    const items = DB.getItems()
      .filter((x) => Inventory.matches(x, q))
      .slice(0, 20);

    if (!items.length) {
      box.innerHTML = `<div class="result-item"><span class="muted">No items found</span></div>`;
      return;
    }
    box.innerHTML = items
      .map((x) => {
        const out = (Number(x.qty) || 0) <= 0;
        return `
        <div class="result-item ${out ? "out" : ""}" data-id="${x.id}">
          <div>
            <div class="r-name">${x.brand ? Inventory.esc(x.brand) + " · " : ""}${Inventory.esc(x.name)}</div>
            <div class="r-sub">${Inventory.subLine(x)} · Qty: ${Number(x.qty) || 0}</div>
          </div>
          <div class="r-price">${U.money(x.price)}</div>
        </div>`;
      })
      .join("");

    box.querySelectorAll(".result-item[data-id]").forEach((el) => {
      el.addEventListener("click", () => {
        addToCart(el.dataset.id);
        document.getElementById("item-search").value = "";
        box.innerHTML = "";
      });
    });
  }

  function addToCart(id) {
    const it = DB.getItem(id);
    if (!it) return;
    const existing = cart.find((c) => c.itemId === id);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ itemId: id, name: it.name, brand: it.brand || "", model: it.model || "", size: it.size || "", color: it.color || "", price: Number(it.price) || 0, cost: Number(it.cost) || 0, qty: 1, stock: Number(it.qty) || 0 });
    }
    renderCart();
    App.toast(it.name + " added");
  }

  function renderCart() {
    const box = document.getElementById("cart-items");
    const summary = document.getElementById("cart-summary");
    if (!cart.length) {
      box.innerHTML = `<p class="empty-note">Search above and tap an item to add it to the bill.</p>`;
      summary.classList.add("hidden");
      return;
    }
    summary.classList.remove("hidden");

    box.innerHTML = cart
      .map((c, i) => {
        const lineTotal = c.price * c.qty;
        return `
        <div class="cart-line" data-i="${i}">
          <div class="cl-top">
            <div>
              <div class="cl-name">${c.brand ? Inventory.esc(c.brand) + " · " : ""}${Inventory.esc(c.name)}</div>
              <div class="cl-model">${Inventory.subLine(c)}</div>
            </div>
            <button class="cl-remove" data-i="${i}" title="Remove">✕</button>
          </div>
          <div class="cl-controls">
            <div class="qty-stepper">
              <button class="q-dec" data-i="${i}">−</button>
              <span>${c.qty}</span>
              <button class="q-inc" data-i="${i}">+</button>
            </div>
            <div class="price-edit">
              <label>Rate ₹</label>
              <input type="number" class="p-edit" data-i="${i}" value="${c.price}" min="0" step="1" />
            </div>
          </div>
          <div class="cl-linetotal">${U.money(lineTotal)}</div>
        </div>`;
      })
      .join("");

    box.querySelectorAll(".q-inc").forEach((b) => (b.onclick = () => changeQty(+b.dataset.i, 1)));
    box.querySelectorAll(".q-dec").forEach((b) => (b.onclick = () => changeQty(+b.dataset.i, -1)));
    box.querySelectorAll(".cl-remove").forEach((b) => (b.onclick = () => removeLine(+b.dataset.i)));
    box.querySelectorAll(".p-edit").forEach((inp) => {
      inp.onchange = () => {
        cart[+inp.dataset.i].price = Math.max(0, Number(inp.value) || 0);
        renderCart();
      };
    });

    const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0);
    const discount = Math.max(0, Number(document.getElementById("cart-discount").value) || 0);
    const total = Math.max(0, subtotal - discount);
    document.getElementById("cart-subtotal").textContent = U.money(subtotal);
    document.getElementById("cart-total").textContent = U.money(total);
  }

  function changeQty(i, delta) {
    const c = cart[i];
    if (!c) return;
    c.qty += delta;
    if (c.qty <= 0) {
      cart.splice(i, 1);
    }
    renderCart();
  }

  function removeLine(i) {
    cart.splice(i, 1);
    renderCart();
  }

  function clearCart() {
    if (cart.length && !confirm("Clear the current bill?")) return;
    cart = [];
    document.getElementById("cart-discount").value = 0;
    document.getElementById("cust-name").value = "";
    document.getElementById("cust-phone").value = "";
    renderCart();
  }

  async function saveBill() {
    if (!cart.length) return App.toast("Add at least one item.");
    const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0);
    const discount = Math.max(0, Number(document.getElementById("cart-discount").value) || 0);
    const total = Math.max(0, subtotal - discount);
    const cost = cart.reduce((a, c) => a + (c.cost || 0) * c.qty, 0);

    const sale = {
      date: Date.now(),
      items: cart.map((c) => ({ itemId: c.itemId, name: c.name, brand: c.brand, model: c.model, size: c.size, color: c.color, price: c.price, qty: c.qty, cost: c.cost, lineTotal: c.price * c.qty })),
      subtotal,
      discount,
      total,
      cost,
      profit: total - cost,
      customerName: document.getElementById("cust-name").value.trim(),
      customerPhone: U.normPhone(document.getElementById("cust-phone").value.trim()),
    };

    const btn = document.getElementById("save-bill");
    btn.disabled = true;
    try {
      await DB.addSale(sale); // handles stock reduction (and cost/profit in cloud)
    } catch (err) {
      btn.disabled = false;
      return App.toast("Could not save bill. Try again.");
    }
    btn.disabled = false;
    lastSale = sale;

    cart = [];
    document.getElementById("cart-discount").value = 0;
    document.getElementById("cust-name").value = "";
    document.getElementById("cust-phone").value = "";
    renderCart();
    Inventory.render();
    Reports.render();

    showBillPreview(sale);
  }

  function buildBillText(sale) {
    const s = DB.getSettings() || {};
    const lines = [];
    lines.push("*" + (s.shop || "ShopBill") + "*");
    lines.push("Bill: " + U.fmtDateTime(sale.date));
    if (sale.customerName) lines.push("Customer: " + sale.customerName);
    lines.push("--------------------------------");
    sale.items.forEach((it) => {
      const title = (it.brand ? it.brand + " " : "") + it.name;
      const variant = [it.model ? "Art " + it.model : "", it.size ? "Size " + it.size : "", it.color || ""].filter(Boolean).join(", ");
      lines.push(title + (variant ? " [" + variant + "]" : ""));
      lines.push("  " + it.qty + " x " + U.money(it.price) + " = " + U.money(it.lineTotal));
    });
    lines.push("--------------------------------");
    lines.push("Subtotal: " + U.money(sale.subtotal));
    if (sale.discount > 0) lines.push("Discount: -" + U.money(sale.discount));
    lines.push("*TOTAL: " + U.money(sale.total) + "*");
    lines.push("--------------------------------");
    lines.push("Thank you! Visit again 🙏");
    return lines.join("\n");
  }

  function showBillPreview(sale) {
    const s = DB.getSettings() || {};
    const rows = sale.items
      .map((it) => {
        const title = (it.brand ? Inventory.esc(it.brand) + " " : "") + Inventory.esc(it.name);
        const variant = [it.model ? "Art " + it.model : "", it.size ? "Size " + it.size : "", it.color || ""].filter(Boolean).map(Inventory.esc).join(", ");
        return `<tr><td>${title}${variant ? " <span style='color:#888'>(" + variant + ")</span>" : ""}<br><span style="color:#666">${it.qty} × ${U.money(it.price)}</span></td><td>${U.money(it.lineTotal)}</td></tr>`;
      })
      .join("");
    document.getElementById("bill-preview").innerHTML = `
      <h3>${Inventory.esc(s.shop || "ShopBill")}</h3>
      <div class="bp-sub">${U.fmtDateTime(sale.date)}${sale.customerName ? " · " + Inventory.esc(sale.customerName) : ""}</div>
      <table>${rows}</table>
      <div class="bp-line"></div>
      <table>
        <tr><td>Subtotal</td><td>${U.money(sale.subtotal)}</td></tr>
        ${sale.discount > 0 ? `<tr><td>Discount</td><td>-${U.money(sale.discount)}</td></tr>` : ""}
        <tr class="bp-total"><td>TOTAL</td><td>${U.money(sale.total)}</td></tr>
      </table>
      <div class="bp-foot">Thank you! Visit again 🙏</div>
    `;
    lastSale = sale;

    // Admins can delete a saved bill from the preview (returns items to stock).
    const delBtn = document.getElementById("bill-delete");
    delBtn.classList.toggle("hidden", !(Auth.isAdmin() && sale && sale.id));

    document.getElementById("bill-modal").classList.remove("hidden");
  }

  async function deleteBill() {
    if (!lastSale || !lastSale.id) return;
    if (!Auth.isAdmin()) return;
    if (!confirm("Delete this bill permanently? The items will be added back to stock.")) return;
    const btn = document.getElementById("bill-delete");
    btn.disabled = true;
    try {
      await DB.deleteSale(lastSale.id);
    } catch (err) {
      btn.disabled = false;
      return App.toast("Could not delete bill.");
    }
    btn.disabled = false;
    lastSale = null;
    document.getElementById("bill-modal").classList.add("hidden");
    App.toast("Bill deleted");
    Inventory.render();
    Reports.render();
  }

  function sendWhatsApp() {
    if (!lastSale) return;
    const text = encodeURIComponent(buildBillText(lastSale));
    // Open the customer's chat if we have their number, else just a share picker.
    const base = lastSale.customerPhone
      ? `https://wa.me/${lastSale.customerPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(base, "_blank");
  }

  // Re-render when tab shown
  function render() {
    renderCart();
  }

  return { init, render, showBillPreview, buildBillText };
})();
