/* ShopBill / FW - authentication, roles & setup
   LOCAL mode : PIN login (admin + billing) stored on device
   CLOUD mode : Supabase email/password; role comes from profiles table */
const Auth = (function () {
  let onUnlock = function () {};
  let selectedRole = "admin"; // local login screen selection
  let currentRole = null; // role after successful unlock

  async function init(cb) {
    onUnlock = cb || function () {};
    document.body.classList.add(DB.isCloud() ? "mode-cloud" : "mode-local");

    if (DB.isCloud()) {
      await initCloud();
    } else {
      initLocal();
    }
    document.getElementById("reset-app").addEventListener("click", resetApp);
  }

  /* ==================== LOCAL (PIN) ==================== */
  function initLocal() {
    const configured = DB.isConfigured();
    document.getElementById("setup-form").classList.toggle("hidden", configured);
    document.getElementById("login-form").classList.toggle("hidden", !configured);
    document.getElementById("cloud-login-form").classList.add("hidden");
    document.getElementById("auth-subtitle").textContent = configured
      ? "Choose who's logging in"
      : "Footwear billing & stock";

    bindRoleTabs();
    bindSetup();
    bindLoginLocal();
  }

  function bindRoleTabs() {
    document.querySelectorAll(".role-tab").forEach((t) => {
      t.addEventListener("click", () => {
        document.querySelectorAll(".role-tab").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        selectedRole = t.dataset.role;
        document.getElementById("login-role-name").textContent = selectedRole === "admin" ? "Admin" : "Billing";
        document.getElementById("login-error").textContent = "";
        document.getElementById("login-pin").focus();
      });
    });
  }

  function bindSetup() {
    const form = document.getElementById("setup-form");
    form.onsubmit = function (e) {
      e.preventDefault();
      const err = document.getElementById("setup-error");
      err.textContent = "";
      const shop = document.getElementById("setup-shop").value.trim();
      const owner = document.getElementById("setup-owner").value.trim();
      const code = document.getElementById("setup-code").value.trim().toUpperCase();
      const pin = document.getElementById("setup-pin").value.trim();
      const pin2 = document.getElementById("setup-pin2").value.trim();
      const bpin = document.getElementById("setup-bpin").value.trim();

      if (!shop) return (err.textContent = "Please enter a shop name.");
      if (code.length !== 10) return (err.textContent = "Cost code must be exactly 10 letters.");
      if (new Set(code).size !== 10) return (err.textContent = "Cost code letters must all be different.");
      if (!/^[A-Z]{10}$/.test(code)) return (err.textContent = "Cost code must be letters A-Z only.");
      if (pin.length < 4) return (err.textContent = "Admin PIN must be at least 4 digits.");
      if (pin !== pin2) return (err.textContent = "Admin PINs do not match.");
      if (bpin.length < 4) return (err.textContent = "Billing PIN must be at least 4 digits.");
      if (bpin === pin) return (err.textContent = "Billing PIN must be different from Admin PIN.");

      const salt = U.genSalt();
      DB.saveSettings({
        shop, owner: U.normPhone(owner), costCode: code, salt,
        adminPinHash: U.hashPin(pin, salt),
        billPinHash: U.hashPin(bpin, salt),
        ownerCopy: !!owner, autoLockMin: 5, createdAt: Date.now(),
      });
      currentRole = "admin";
      unlock();
    };
  }

  function bindLoginLocal() {
    const form = document.getElementById("login-form");
    form.onsubmit = function (e) {
      e.preventDefault();
      const err = document.getElementById("login-error");
      const pin = document.getElementById("login-pin").value.trim();
      const s = DB.getSettings();
      if (!s) return;
      const target = selectedRole === "admin" ? s.adminPinHash : s.billPinHash;
      if (U.hashPin(pin, s.salt) === target) {
        err.textContent = "";
        document.getElementById("login-pin").value = "";
        currentRole = selectedRole;
        unlock();
      } else {
        err.textContent = "Wrong PIN for " + (selectedRole === "admin" ? "Admin" : "Billing") + ".";
      }
    };
  }

  /* ==================== CLOUD (Supabase) ==================== */
  async function initCloud() {
    document.getElementById("setup-form").classList.add("hidden");
    document.getElementById("login-form").classList.add("hidden");
    document.getElementById("cloud-login-form").classList.remove("hidden");
    document.getElementById("auth-subtitle").textContent = "Shared cloud database";

    const client = DB.getClient();
    bindLoginCloud();

    // Restore an existing session (stay logged in)
    try {
      const { data } = await client.auth.getSession();
      if (data && data.session) {
        await afterCloudLogin();
      }
    } catch (e) { /* ignore */ }
  }

  function bindLoginCloud() {
    const form = document.getElementById("cloud-login-form");
    const err = document.getElementById("cloud-error");
    form.onsubmit = async function (e) {
      e.preventDefault();
      err.textContent = "";
      const email = document.getElementById("cloud-email").value.trim();
      const pass = document.getElementById("cloud-pass").value;
      const client = DB.getClient();
      const { error } = await client.auth.signInWithPassword({ email, password: pass });
      if (error) {
        err.textContent = error.message || "Sign in failed.";
        return;
      }
      document.getElementById("cloud-pass").value = "";
      await afterCloudLogin();
    };
  }

  async function afterCloudLogin() {
    const client = DB.getClient();
    const { data: userRes } = await client.auth.getUser();
    const uid = userRes && userRes.user ? userRes.user.id : null;
    let r = "cashier";
    if (uid) {
      const { data: prof } = await client.from("profiles").select("role").eq("id", uid).maybeSingle();
      if (prof && prof.role) r = prof.role;
    }
    currentRole = r;
    DB.setRole(r);
    unlock();
  }

  /* ==================== shared ==================== */
  function unlock() {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    applyRole();
    onUnlock();
  }

  function applyRole() {
    const isCashier = currentRole === "cashier";
    document.body.classList.toggle("role-cashier", isCashier);
    const badge = document.getElementById("role-badge");
    badge.textContent = isCashier ? "Billing" : "Admin";
    badge.classList.toggle("cashier", isCashier);
  }

  function getRole() { return currentRole; }
  function isAdmin() { return currentRole === "admin"; }

  // Local-only: verify a PIN for sensitive actions (change PIN).
  function verify(pin, role) {
    const s = DB.getSettings();
    if (!s) return false;
    const target = role === "cashier" ? s.billPinHash : s.adminPinHash;
    return U.hashPin(String(pin).trim(), s.salt) === target;
  }

  async function lock() {
    currentRole = null;
    document.body.classList.remove("role-cashier");

    // In cloud mode, fully sign out so the next person must log in with their
    // own account (prevents an old admin session lingering as a different user).
    if (DB.isCloud()) {
      try { await DB.getClient().auth.signOut(); } catch (e) { /* ignore */ }
    }

    // Reload for a guaranteed clean state (no stale role, cache, or cart).
    location.reload();
  }

  function resetApp() {
    if (confirm("This erases ALL data (stock, sales, settings) from this device. Continue?")) {
      DB.wipe();
      location.reload();
    }
  }

  return { init, lock, getRole, isAdmin, verify };
})();
