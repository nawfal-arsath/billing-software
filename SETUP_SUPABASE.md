# Connect FW to a free cloud database (Supabase)

This turns FW into a **shared, secured, multi-device** app: your admin phone and the billing counter see the **same live data**, and billing staff **cannot** read cost prices or profit (the database enforces it, not just the screen).

It's **free** on Supabase's free tier. Takes about 10 minutes, one time.

---

## Step 1 — Create a Supabase project
1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Click **New project**. Give it a name (e.g. `fw-shop`), set a database password (save it), pick the closest region, and create it.
3. Wait ~2 minutes for it to finish setting up.

## Step 2 — Create the tables & security rules
1. In your project, open **SQL Editor** (left sidebar) → **New query**.
2. Open the file `supabase/schema.sql` from this app, copy **everything**, paste it into the query box.
3. Click **Run**. You should see "Success".

## Step 3 — Create your two logins
1. Left sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Create the **admin** account, e.g. email `admin@fw.com` + a password. Tick "Auto Confirm User" if asked.
3. Add another user for the **billing counter**, e.g. `billing@fw.com` + a password.

> Both new users start as *billing (cashier)*. Now make the first one an **admin**:

4. Go back to **SQL Editor** → **New query**, paste this (change the email to your admin email), and **Run**:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@fw.com');
```

## Step 4 — Get your keys
1. Left sidebar → **Project Settings** → **API**.
2. Copy the **Project URL** and the **anon public** key.

## Step 5 — Put the keys in the app
Open `js/config.js` and fill them in:

```js
window.SB_CONFIG = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR-ANON-PUBLIC-KEY",
};
```

Save. Reload the app — you'll now see the **email/password** login instead of the PIN screen.
- Log in with `admin@fw.com` to add stock and see analysis.
- Give the `billing@fw.com` login to counter staff — they can only make bills.

## Step 6 (recommended) — Host it so the phone can use it
Drag this whole folder onto [Netlify Drop](https://app.netlify.com/drop) (free). Open the link on each phone → Chrome menu → **Add to Home screen**.

---

## Good to know
- **Leave `config.js` empty** any time to go back to the on-device (PIN) version.
- Add more billing staff later: create a user in Authentication (they're automatically billing-only). To make someone admin, run the SQL in Step 3 with their email.
- The free tier pauses a project after long inactivity — just open the Supabase dashboard to wake it.
- To change a password: Authentication → Users → click the user → reset password.

## Why this is secure
- Cost prices live in a separate table (`item_costs`) that **only admins** can read.
- Profit/cost per bill live in `sale_finance`, also **admin only**.
- Billing staff record sales through a single locked-down function (`record_sale`) — they never touch costs directly.
- These rules are enforced by the database (Row Level Security), so they hold even if someone inspects the app.
