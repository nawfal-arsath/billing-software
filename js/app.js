/* ShopBill - app shell, navigation, roles, settings, backup, auto-lock */
const App = (function () {
  let toastTimer = null;
  let idleTimer = null;

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  function switchTab(tab) {
    // Billing staff can only use the Bill tab.
    if (!Auth.isAdmin() && tab !== "bill") return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.getElementById("tab-" + tab).classList.add("active");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

    if (tab === "bill") Billing.render();
    if (tab === "stock") Inventory.render();
    if (tab === "reports") Reports.render();
    if (tab === "settings") loadSettingsForm();

    // Always show the top of the tab (so the search bar is visible on Bill).
    window.scrollTo(0, 0);
    document.querySelector(".content").scrollTop = 0;
  }

  function bindNav() {
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.addEventListener("click", () => switchTab(b.dataset.tab));
    });
    document.getElementById("lock-btn").addEventListener("click", () => {
      if (confirm("Log out now?")) doLock();
    });
  }

  /* ---------- Auto-lock on inactivity ---------- */
  function resetIdle() {
    clearTimeout(idleTimer);
    if (!Auth.getRole()) return;
    const mins = Number((DB.getSettings() || {}).autoLockMin) || 0;
    if (mins <= 0) return;
    idleTimer = setTimeout(() => {
      doLock();
      toast("Locked after inactivity");
    }, mins * 60000);
  }
  function bindIdle() {
    ["click", "keydown", "touchstart", "mousemove"].forEach((ev) =>
      document.addEventListener(ev, resetIdle, { passive: true })
    );
  }
  function doLock() {
    clearTimeout(idleTimer);
    Auth.lock();
  }

  /* ---------- Settings ---------- */
  function loadSettingsForm() {
    const s = DB.getSettings() || {};
    document.getElementById("set-shop").value = s.shop || "";
    document.getElementById("set-owner").value = s.owner || "";
    document.getElementById("set-code").value = s.costCode || "";
    document.getElementById("set-ownercopy").checked = !!s.ownerCopy;
    document.getElementById("set-autolock").value = s.autoLockMin ?? 5;
  }

  function bindSettings() {
    document.getElementById("save-settings").addEventListener("click", async () => {
      const s = DB.getSettings() || {};
      const code = document.getElementById("set-code").value.trim().toUpperCase();
      if (code && (code.length !== 10 || new Set(code).size !== 10 || !/^[A-Z]{10}$/.test(code))) {
        return toast("Cost code must be 10 different letters A-Z.");
      }
      s.shop = document.getElementById("set-shop").value.trim() || s.shop;
      s.owner = U.normPhone(document.getElementById("set-owner").value.trim());
      if (code) s.costCode = code;
      s.ownerCopy = document.getElementById("set-ownercopy").checked;
      s.autoLockMin = Math.max(0, Number(document.getElementById("set-autolock").value) || 0);
      try {
        await DB.saveSettings(s);
      } catch (e) {
        return toast("Could not save (admin only).");
      }
      document.getElementById("shop-name").textContent = s.shop || "FW";
      resetIdle();
      toast("Settings saved");
    });

    document.getElementById("change-pin").addEventListener("click", () => changePin("admin", "Admin"));
    document.getElementById("change-bpin").addEventListener("click", () => changePin("cashier", "Billing"));

    document.getElementById("export-data").addEventListener("click", exportData);
    document.getElementById("import-data").addEventListener("click", () => document.getElementById("import-file").click());
    document.getElementById("import-file").addEventListener("change", importData);
    document.getElementById("signout-btn").addEventListener("click", () => doLock());
    document.getElementById("wipe-data").addEventListener("click", () => {
      if (confirm("Erase ALL stock, sales and settings from this device? This cannot be undone.")) {
        DB.wipe();
        location.reload();
      }
    });
  }

  function changePin(role, label) {
    const cur = prompt("For security, enter the current ADMIN PIN:");
    if (cur === null) return;
    if (!Auth.verify(cur, "admin")) return toast("Wrong Admin PIN.");
    const np = prompt("New " + label + " PIN (min 4 digits):");
    if (np === null) return;
    if (np.trim().length < 4) return toast("PIN too short.");
    const s = DB.getSettings();
    const newHash = U.hashPin(np.trim(), s.salt);
    if (role === "admin") {
      if (newHash === s.billPinHash) return toast("Admin PIN must differ from Billing PIN.");
      s.adminPinHash = newHash;
    } else {
      if (newHash === s.adminPinHash) return toast("Billing PIN must differ from Admin PIN.");
      s.billPinHash = newHash;
    }
    DB.saveSettings(s);
    toast(label + " PIN changed");
  }

  function exportData() {
    const data = DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `FW-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup downloaded");
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!confirm("Restore this backup? It will replace current data on this device.")) return;
        DB.importAll(data);
        toast("Data restored");
        onUnlock();
      } catch (err) {
        toast("Invalid backup file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function onUnlock() {
    try {
      await DB.load();
    } catch (e) {
      toast("Could not load data from cloud.");
    }
    const s = DB.getSettings() || {};
    document.getElementById("shop-name").textContent = s.shop || "FW";
    const note = document.getElementById("mode-note");
    if (note) note.textContent = DB.isCloud() ? "FW · shared cloud database" : "FW · runs on this device";
    Billing.render();
    switchTab("bill");
    resetIdle();
  }

  async function init() {
    document.getElementById("signout-btn").classList.toggle("hidden", !DB.isCloud());
    bindNav();
    bindSettings();
    bindIdle();
    Inventory.init();
    Billing.init();
    Reports.init();

    await DB.init();
    await Auth.init(onUnlock);

    if ("serviceWorker" in navigator) {
      // Reload once when a new service worker takes control (picks up updates).
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
      navigator.serviceWorker
        .register("sw.js")
        .then((reg) => {
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              // A new version is installed and ready; activate it immediately.
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                nw.postMessage && nw.postMessage("SKIP_WAITING");
                reg.waiting && reg.waiting.postMessage("SKIP_WAITING");
              }
            });
          });
        })
        .catch(() => {});
    }
  }

  return { init, toast, switchTab };
})();

document.addEventListener("DOMContentLoaded", App.init);
