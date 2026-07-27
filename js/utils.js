/* ShopBill - utility helpers (no dependencies) */
const U = (function () {
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function genSalt() {
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint32Array(4);
      crypto.getRandomValues(a);
      return Array.from(a, (x) => x.toString(16)).join("");
    }
    return (Math.random().toString(16) + Math.random().toString(16)).replace(/\./g, "");
  }

  // Salted, iterated hash - enough to gate a local PIN. (Not bank-grade; see README.)
  function hashPin(pin, salt) {
    let s = "sb$" + (salt || "") + "$" + String(pin);
    let h = 5381;
    for (let round = 0; round < 20000; round++) {
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      }
      s = h.toString(16) + (salt || "");
    }
    return h.toString(16);
  }

  function money(n) {
    n = Number(n) || 0;
    // Indian number formatting with rupee symbol.
    const sign = n < 0 ? "-" : "";
    n = Math.abs(Math.round(n));
    const str = n.toString();
    let out;
    if (str.length <= 3) {
      out = str;
    } else {
      const last3 = str.slice(-3);
      let rest = str.slice(0, -3);
      rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
      out = rest + "," + last3;
    }
    return sign + "\u20B9" + out;
  }

  // Encode a number to secret letters using the cost code word.
  function toCode(num, code) {
    if (num === "" || num === null || num === undefined) return "-";
    code = (code || "ABCDEFGHIJ").toUpperCase();
    const digits = String(Math.round(Number(num) || 0));
    let out = "";
    for (const ch of digits) {
      const d = ch.charCodeAt(0) - 48;
      out += code[d] || "?";
    }
    return out;
  }

  function todayStart(d) {
    d = d ? new Date(d) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function startOfWeek(d) {
    d = todayStart(d);
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
    return d;
  }

  function startOfMonth(d) {
    d = todayStart(d);
    d.setDate(1);
    return d;
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fmtDateTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function normPhone(p) {
    if (!p) return "";
    let d = String(p).replace(/\D/g, "");
    if (d.length === 10) d = "91" + d; // default India country code
    return d;
  }

  return { uid, genSalt, hashPin, money, toCode, todayStart, startOfWeek, startOfMonth, fmtDate, fmtDateTime, normPhone };
})();
