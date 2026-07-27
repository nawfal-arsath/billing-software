# FW — Footwear Billing & Stock

A clean, light-themed, mobile-first app for a footwear shop. It runs **entirely on your device** — no server and no monthly fees — with two separate logins: an **Admin** (you) and a **Billing counter** (staff).

## Logins & what each can do

| | Admin (you) | Billing (counter staff) |
|---|---|---|
| Make bills | ✅ | ✅ |
| Send bill on WhatsApp | ✅ | ✅ |
| Add / edit / delete stock | ✅ | ❌ |
| See cost price (secret code) | ✅ | ❌ (can't even open Stock) |
| See sales analysis & all bills | ✅ | ❌ |
| Change settings / PINs | ✅ | ❌ |

- **Local mode:** you set an **Admin PIN** and a separate **Billing PIN** at first-time setup; pick the role on the login screen.
- **Cloud mode:** logins are real **email + password** accounts created in Supabase; the role (admin/billing) is stored securely in the database.

The app also **auto-locks after idle minutes** (configurable in Settings).

## Where is my data stored? Two modes

FW runs in one of two modes depending on whether you connect a cloud database in `js/config.js`:

### 1. Cloud mode (recommended, shared, secure) — Supabase
Fill in `js/config.js` with your free Supabase project keys (see **SETUP_SUPABASE.md**).
- ✅ Admin phone and billing counter share the **same live data**.
- ✅ Security is enforced by the **database** (Row Level Security): billing staff **cannot** read cost prices or profit, even if they inspect the app.
- ✅ Logins are real accounts (email + password) managed in Supabase.
- ✅ Free tier.

### 2. Local mode (default, single device) — browser storage
Leave `js/config.js` empty. All data is saved in this browser's **localStorage** — only on the **one device** you use, with the PIN login.
- ✅ Free, private, works fully offline, zero setup.
- ⚠️ Devices do **not** share data; clearing browser data loses it → use **Settings → Backup** regularly.

> To switch: fill in `config.js` for cloud, or empty it for local.

## Where do I see analysis and bills?

Log in as **Admin → Reports tab**:
- Today / Week / Month / All revenue, **profit**, number of bills, items sold.
- A trend chart (last 7 days / 4 weeks / 6 months).
- A tappable list of **recent bills** — tap any bill to view it again or re-send on WhatsApp.

## The secret cost code

Pick a 10-letter word with no repeated letters, e.g. `BLACKSHOEP`. Each digit maps to a letter by position:

```
0 1 2 3 4 5 6 7 8 9
B L A C K S H O E P
```

So a cost of `1200` shows as **`LABB`** in Stock — customers next to you can't read your buying price. Tap **👁 Cost** (Admin only) to reveal the real numbers.

## Footwear stock fields

Each product has: name, **brand**, **article/model no.**, **size**, **color**, cost price, selling rate and quantity. Billing search matches any of these.

## How to use it

1. Open `index.html` in Chrome to test.
2. First time: set shop name (FW), owner WhatsApp, cost code, an **Admin PIN** and a **Billing PIN**.
3. Add stock as Admin; hand the Billing PIN to counter staff for day-to-day billing.

### Put it on your phone

Host these files anywhere static and open on the phone:
- **Easiest free options**: [Netlify Drop](https://app.netlify.com/drop) (drag this folder in) or GitHub Pages.
- On the phone: open the link in Chrome → menu → **Add to Home screen**. It then opens like a normal app and works offline.

WhatsApp sending uses the standard `wa.me` link, so it opens WhatsApp with the bill ready to send.

## Security notes (be realistic)

- **Cloud mode:** proper security. Real accounts, and the database (Row Level Security) guarantees billing staff can't read cost/profit — enforced on the server, not just hidden in the UI.
- **Local mode:** the two PINs are salted, hashed and auto-lock to stop casual snooping, but the data physically lives in the browser, so anyone with full access to that device could read it. Treat local PINs as a gate, not bank-grade security.

## Files

```
index.html             app screens
manifest.webmanifest   installable on phone
sw.js                  offline support
icon.svg               app icon
SETUP_SUPABASE.md      step-by-step cloud setup
supabase/schema.sql    database tables + security rules
css/styles.css         light theme styling
js/config.js           <- paste cloud keys here (empty = local mode)
js/utils.js            formatting, salted hash, secret code
js/db.js               dual backend: local storage OR Supabase cloud
js/auth.js             logins + roles (PIN local / email cloud)
js/inventory.js        stock (footwear fields)
js/billing.js          billing + WhatsApp
js/reports.js          sales analysis
js/app.js              navigation, roles, auto-lock, backup
```
