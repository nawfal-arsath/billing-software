/* ShopBill / FW - data layer
   Two backends behind one interface:
     - LOCAL : localStorage on this device (PIN login)   [default]
     - CLOUD : Supabase Postgres, shared + RLS-secured    [when config.js is filled]
   Reads are synchronous (from cache in cloud, from localStorage in local).
   Writes are asynchronous (return Promises) so callers `await` them. */
const DB = (function () {
  const CLOUD = !!(window.SB_CONFIG && SB_CONFIG.url && SB_CONFIG.anonKey && window.supabase);
  let client = null;
  let role = null; // set by Auth after login; controls cost visibility in cloud

  const K = { settings: "sb_settings", items: "sb_items", sales: "sb_sales" };

  // cloud caches (unused in local mode)
  let cSettings = null;
  let cItems = [];
  let cSales = [];

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function isCloud() { return CLOUD; }
  function mode() { return CLOUD ? "cloud" : "local"; }
  function getClient() { return client; }
  function setRole(r) { role = r; }

  async function init() {
    if (CLOUD) {
      client = window.supabase.createClient(SB_CONFIG.url, SB_CONFIG.anonKey);
    }
  }

  /* ---------- mapping helpers (cloud) ---------- */
  function settingsFromRow(r) {
    if (!r) return null;
    return {
      shop: r.shop || "FW",
      owner: r.owner_phone || "",
      costCode: r.cost_code || "",
      ownerCopy: !!r.owner_copy,
      autoLockMin: r.auto_lock_min ?? 5,
    };
  }
  function saleFromRow(r) {
    const fin = Array.isArray(r.sale_finance) ? r.sale_finance[0] : r.sale_finance;
    return {
      id: r.id,
      date: Date.parse(r.created_at) || Date.now(),
      items: (r.sale_items || []).map((it) => ({
        name: it.name, brand: it.brand || "", model: it.model || "", size: it.size || "", color: it.color || "",
        price: Number(it.price) || 0, qty: Number(it.qty) || 0, lineTotal: Number(it.line_total) || 0,
      })),
      subtotal: Number(r.subtotal) || 0,
      discount: Number(r.discount) || 0,
      total: Number(r.total) || 0,
      profit: fin ? Number(fin.profit) || 0 : 0,
      cost: fin ? Number(fin.cost) || 0 : 0,
      customerName: r.customer_name || "",
      customerPhone: r.customer_phone || "",
    };
  }

  /* ---------- load caches (cloud only) ---------- */
  async function load() {
    if (!CLOUD) return;
    const s = await client.from("settings").select("*").eq("id", 1).maybeSingle();
    cSettings = settingsFromRow(s.data);

    const itemsRes = await client.from("items").select("*").order("name", { ascending: true });
    let costMap = {};
    if (role === "admin") {
      const costRes = await client.from("item_costs").select("*");
      (costRes.data || []).forEach((c) => (costMap[c.item_id] = Number(c.cost) || 0));
    }
    cItems = (itemsRes.data || []).map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand || "",
      model: r.model || "",
      size: r.size || "",
      color: r.color || "",
      price: Number(r.price) || 0,
      qty: Number(r.qty) || 0,
      cost: role === "admin" ? (costMap[r.id] ?? 0) : undefined,
      updatedAt: Date.parse(r.updated_at) || Date.now(),
    }));

    const salesRes = await client
      .from("sales")
      .select(
        "id,created_at,subtotal,discount,total,customer_name,customer_phone,sale_items(name,brand,model,size,color,price,qty,line_total),sale_finance(cost,profit)"
      )
      .order("created_at", { ascending: false });
    cSales = (salesRes.data || []).map(saleFromRow);
  }

  /* ---------- synchronous getters ---------- */
  function getSettings() { return CLOUD ? cSettings : read(K.settings, null); }
  function getItems() { return CLOUD ? cItems : read(K.items, []); }
  function getItem(id) { return getItems().find((x) => x.id === id); }
  function getSales() { return CLOUD ? cSales : read(K.sales, []); }
  function isConfigured() {
    if (CLOUD) return true;
    const s = read(K.settings, null);
    return !!(s && s.adminPinHash);
  }

  /* ---------- settings ---------- */
  async function saveSettings(s) {
    if (!CLOUD) { write(K.settings, s); return s; }
    const row = {
      shop: s.shop, owner_phone: s.owner, cost_code: s.costCode,
      owner_copy: !!s.ownerCopy, auto_lock_min: s.autoLockMin ?? 5,
    };
    const res = await client.from("settings").update(row).eq("id", 1);
    if (res.error) throw res.error;
    cSettings = { ...cSettings, ...s };
    return cSettings;
  }

  /* ---------- items ---------- */
  async function upsertItem(item) {
    if (!CLOUD) {
      const items = read(K.items, []);
      if (item.id) {
        const i = items.findIndex((x) => x.id === item.id);
        if (i >= 0) items[i] = { ...items[i], ...item, updatedAt: Date.now() };
      } else {
        item.id = U.uid();
        item.createdAt = Date.now();
        item.updatedAt = Date.now();
        items.push(item);
      }
      write(K.items, items);
      return item;
    }
    // cloud
    const row = { name: item.name, brand: item.brand, model: item.model, size: item.size, color: item.color, price: item.price, qty: item.qty };
    let id = item.id;
    if (id) {
      const r = await client.from("items").update(row).eq("id", id);
      if (r.error) throw r.error;
    } else {
      const r = await client.from("items").insert(row).select("id").single();
      if (r.error) throw r.error;
      id = r.data.id;
    }
    const rc = await client.from("item_costs").upsert({ item_id: id, cost: Number(item.cost) || 0 });
    if (rc.error) throw rc.error;
    await load();
    return { ...item, id };
  }

  async function deleteItem(id) {
    if (!CLOUD) { write(K.items, read(K.items, []).filter((x) => x.id !== id)); return; }
    const r = await client.from("items").delete().eq("id", id);
    if (r.error) throw r.error;
    await load();
  }

  /* ---------- sales ---------- */
  async function addSale(sale) {
    sale.id = sale.id || U.uid();
    sale.date = sale.date || Date.now();
    if (!CLOUD) {
      const sales = read(K.sales, []);
      sales.push(sale);
      write(K.sales, sales);
      // decrement stock locally
      const items = read(K.items, []);
      sale.items.forEach((ln) => {
        const it = items.find((x) => x.id === ln.itemId);
        if (it) it.qty = Math.max(0, (Number(it.qty) || 0) - ln.qty);
      });
      write(K.items, items);
      return sale;
    }
    // cloud: one secure RPC does insert + stock + cost/profit
    const payload = sale.items.map((it) => ({
      item_id: it.itemId, name: it.name, brand: it.brand || "", model: it.model || "",
      size: it.size || "", color: it.color || "", price: it.price, qty: it.qty, line_total: it.lineTotal,
    }));
    const r = await client.rpc("record_sale", {
      p_subtotal: sale.subtotal, p_discount: sale.discount, p_total: sale.total,
      p_customer_name: sale.customerName || null, p_customer_phone: sale.customerPhone || null,
      p_items: payload,
    });
    if (r.error) throw r.error;
    sale.id = r.data;
    await load();
    return sale;
  }

  async function deleteSale(id) {
    if (!CLOUD) {
      const sales = read(K.sales, []);
      const sale = sales.find((s) => s.id === id);
      // Restore stock for each line of the deleted bill.
      if (sale) {
        const items = read(K.items, []);
        (sale.items || []).forEach((ln) => {
          const it = items.find((x) => x.id === ln.itemId);
          if (it) it.qty = (Number(it.qty) || 0) + (Number(ln.qty) || 0);
        });
        write(K.items, items);
      }
      write(K.sales, sales.filter((s) => s.id !== id));
      return;
    }
    // cloud: secure RPC restores stock + deletes the sale (admin only)
    const r = await client.rpc("delete_sale", { p_sale_id: id });
    if (r.error) throw r.error;
    await load();
  }

  /* ---------- backup ---------- */
  function exportAll() {
    return {
      _app: "ShopBill", _version: 2, mode: mode(), exportedAt: Date.now(),
      settings: getSettings(), items: getItems(), sales: getSales(),
    };
  }
  function importAll(data) {
    if (CLOUD) throw new Error("Import is only for local mode.");
    if (!data || data._app !== "ShopBill") throw new Error("Not a ShopBill backup file");
    if (data.settings) write(K.settings, data.settings);
    if (Array.isArray(data.items)) write(K.items, data.items);
    if (Array.isArray(data.sales)) write(K.sales, data.sales);
  }
  function wipe() {
    localStorage.removeItem(K.settings);
    localStorage.removeItem(K.items);
    localStorage.removeItem(K.sales);
  }

  return {
    init, load, isCloud, mode, getClient, setRole,
    getSettings, saveSettings, isConfigured,
    getItems, getItem, upsertItem, deleteItem,
    getSales, addSale, deleteSale,
    exportAll, importAll, wipe,
  };
})();
