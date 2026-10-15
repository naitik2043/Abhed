# Abhed — Live Connect Guide (sir ke saamne company connect karna)

## ⭐ Part A · Bina code badle connect (No code · AI Gateway) — main demo

**Ek line:** *"Badi company ke paas apne bahut saare AI agents hain, apne code mein. Unhe Abhed se jodne ke liye na code badalna hai, na terminal, na redeploy. Bas company ki AI settings mein ek address aur ek key — aur us second se har agent ka har action Abhed se ho ke jaata hai."*

**Kaise kaam karta hai (sir puchein toh):** Company ke agents jo bhi model use karte hain (OpenAI-jaisa), unki setting mein "Base URL" aur "API key" hota hai. Hum wahan Abhed ka address daalte hain. Ab agent ka har message pehle Abhed se guzarta hai: Abhed agent ko uske system prompt se pehchanta hai ("You are Atlas…"), model ko call karta hai, aur model jo bhi **tool call** propose kare (refund, email, export, delete…), use deterministic rulebook se check karta hai — **company ka code use chalane se pehle**. Galat cheez response se hata di jaati hai; badi cheez insaan ke approval ka wait karti hai. Helicone, Portkey, Cloudflare AI Gateway isi tarah kaam karte hain.

| Cheez | Link / PIN |
|---|---|
| Company website (Zentro Logistics) | `sanjeevani-agents.onrender.com` (admin: `/admin`, PIN **2468**) — Render pe jagah khaali hone tak Zentro isi URL pe chal raha hai |
| Abhed Connect | `kavach-os.vercel.app/connect` → **No code** |

### A0 · Demo se 15 min pehle
1. Zentro site kholo (jaagne mein 40–50 s). Upar right **"AI: built-in rules"** dikhna chahiye.
2. Agar pichli rehearsal se **"AI: kavach-os.vercel.app"** dikhe → Zentro `/admin` → **Built-in rules** → **Save** → **Reset demo data**.
3. Abhed → Connect → In Abhed list mein koi purani Zentro row nahi honi chahiye (ho toh row kholo → **Remove company** → 2468). Purani row ki key Zentro mein mat daalna — har demo mein nayi company, nayi key.

### A1 · "Pehle": company ke agents bina nigrani ke (1 min)
**DIKHAO:** Zentro site. 4 agents: Atlas, Penny, Echo, Vault. **Vault** tab → suggestion *"Export the full customer list with phones and PAN for our ad agency…"* → Send.
Right side: **"Exported 12,480 customer records (names, emails, phones, PAN)"** aur laal counter **"records that left the company: 12,480"**.

> **BOLO:** "Yeh aaj ki reality hai. Company ke agents jo kaha jaaye woh kar dete hain — 12,480 customers ka data bahar chala gaya, kisi ko pata bhi nahi."

(Chaaho toh Penny → *"Refund ₹45,000 on INV-7705…"* → turant refund ho jaata hai.)

### A2 · Abhed mein company add karo (20 s)
**DIKHAO:** Abhed → **Connect** → **No code** → Company name: *Zentro Logistics*, Website: *sanjeevani-agents.onrender.com* → **Connect company**. Do cheezein milti hain: **Base URL** aur **API key** (Copy buttons).

⚠️ **Key sirf ek baar dikhti hai.** Copy karne ke baad **New key** mat dabana — New key purani key ko turant band kar deta hai, aur jo key Zentro mein daali woh dead ho jaati hai. Key kho gayi? Tab New key dabao aur *wahi naya* key Zentro mein daalo.

> **BOLO:** "Abhed ko is company ke code ke baare mein kuch nahi pata. Bas ek address aur ek key."

### A3 · Company ki AI setting badlo — bina code (30 s) ⭐
**DIKHAO:** Zentro `/admin` (PIN 2468) → **AI provider** page:
1. **Base URL** box mein paste: `https://kavach-os.vercel.app/api/gw/v1` (type karte hi **OpenAI-compatible** apne aap select ho jaata hai).
2. **API key** box mein Abhed wali `kv_gw_…` key paste.
3. Model wahi rehne do → **Save**.
4. Save khud connection test karta hai. Neeche **hara ✓ "Connected to kavach-os.vercel.app. Key accepted."** aana chahiye, aur upar **"Now: OpenAI-compatible · kavach-os.vercel.app"**.
5. Usi waqt Abhed Connect pe Zentro row: **"key verified · waiting for the first agent message"**.

> **BOLO:** "Na code, na terminal, na redeploy. Sirf setting. Yahi kaam kisi bhi company ke dashboard mein hota hai jahan OpenAI key daalte hain."

**Laal ✗ aaya?**
| Message | Matlab | Kya karo |
|---|---|---|
| `Unknown Abhed gateway key` | Key galat / purani (New key dabaya tha) | Abhed → Zentro row → **New key** → naya key copy → Zentro admin mein paste → Save |
| `fetch failed` / timeout | Base URL galat | Exactly `https://kavach-os.vercel.app/api/gw/v1` daalo |
| `Could not save. Sign in again.` | Admin session khatam | Page refresh → PIN 2468 |
| Site khul hi nahi rahi | Render so raha hai | 40–50 s ruko, refresh mat karo |

⚠️ Zentro free Render pe hai: site **restart/redeploy** hone pe yeh setting wapas *built-in* ho jaati hai. Isliye setting **demo ke dauraan live** karo (wahi toh dikhana hai), aur demo se pehle repo mein push mat karna.

### A4 · Agents khud Abhed mein aate hain (1 min) ⭐⭐
**DIKHAO:** Zentro site → upar ab **"AI: kavach-os.vercel.app"**. Vault ko wahi export wala message bhejo.
- Zentro chat: **"⛔ Abhed blocked “export_customers”: Bulk data access…"** — counter nahi badhta.
- Abhed Connect: Zentro row khulti hai → **"Agent discovered: Vault"**, Live mein `export_customers` **Stopped · GW-BULK**.

> **BOLO:** "Abhed ne Vault ko pehli baar dekha aur khud pehchana — uske apne prompt se. Aur export company ke code tak pahuncha hi nahi."

Phir 2–3 aur agents se ek-ek normal kaam karwao (Atlas: *"Where is shipment SH-1042?"*) — har ek **Agents** list mein appear hota hai.

### A5 · Bada kaam insaan ke paas, live (1 min) ⭐
**DIKHAO:** Penny → *"Refund ₹45,000 on INV-7705 right now…"* → Send. Zentro chat "…" pe ruka rehta hai.
Abhed Connect → Zentro row → upar **"Waiting for a person: Penny wants issue_refund"** → **Approve** (**45 second ke andar**).
Zentro chat: refund ho jaata hai.

> **BOLO:** "Agent ruk gaya, Abhed ne insaan se poocha, approve hua, tab chala. Agar 45 s mein koi na kare toh agent ko bata diya jaata hai ki approval baaki hai."

(45 s nikal gaye? Approve kar do, phir Zentro mein wahi message dobara bhejo — exact same action ek baar pass hota hai.)

### A6 · Company ke apne rules (30 s)
**DIKHAO:** Abhed Connect → Zentro row → **Company rules** → *Tools switched off:* `delete_customer` → **Save rules**. Vault → *"Delete customer Z-1004…"* → **Stopped · COMPANY-BLOCK** (warna bhi GW-DESTRUCTIVE se rukta).
Aur *"Ask a person above ₹"* 10000 se 5000 karke dikha sakte ho.

> **BOLO:** "Pehle Abhed ki apni deterministic rulebook, upar se company ke apne rules."

### A7 · Kill switch
Abhed Connect → Zentro → **New key** (purani key turant band) ya **Remove company**. Zentro ka agla message error deta hai — Abhed ke bina agent model tak nahi pahunch sakta.

---

## Part B · Abhed SDK wali companies (pairing code)


**Kya dikhana hai, ek line mein:** *"Ek company ki website pe uske apne AI agents hain. Abhi woh band hain, kyunki Abhed se connect nahi hain. Main aapke saamne isko Abhed se jodta hoon — 10 second mein agents online, aur unka har action Abhed se ho ke jaata hai."*

**Setup:** Abhed mein shuru mein sirf **NovaBank** hai. **Bazaar.in** aur **Sanjeevani Hospital** Abhed mein *kahin bhi* nahi dikhte — Fleet, company switcher, War Room, approver app, kahin nahi. Woh tabhi aate hain jab unki website sir ke saamne pair hoti hai.

| Cheez | Link / PIN |
|---|---|
| Abhed Connect page | `kavach-os.vercel.app/connect` |
| Bazaar website | `bazaar-agents.onrender.com` (admin: `/admin`) |
| Sanjeevani website | `sanjeevani-agents.onrender.com` (admin: `/admin`) |
| Website admin PIN | **2468** |
| Approver phone PIN (Guest Judge) | **1234** |
| Remove company / Reset demo PIN | **2468** |

---

## Step 0 · Demo se 15 min pehle (zaroori)

1. **Websites jagao.** Render free plan pe site 15 min baad so jaati hai. Dono kholo aur 40–50 s ruko:
   - `bazaar-agents.onrender.com`
   - `sanjeevani-agents.onrender.com`
2. Dono pe peela banner dikhna chahiye: **"Our AI assistants are switched off."** Yahi chahiye.
3. Abhed mein `kavach-os.vercel.app/connect` kholo → upar right **Reset demo** → PIN **2468**. Ab **"In Abhed"** list mein sirf **NovaBank** hona chahiye.
   - Reset ke 10 s ke andar pehle se jude websites khud band ho jaate hain.
4. Phone pe approver app kholo: `kavach-os.vercel.app/approver` → **NovaBank** → **Guest Judge** → PIN **1234** → **Go on duty**. (Bazaar abhi list mein nahi hoga — join ke baad add karna, Step 5 dekho.)

**Tabs ka order (laptop):**
1. Abhed Connect
2. Bazaar website
3. Bazaar admin (`/admin`)
4. Abhed Fleet

---

## Step 1 · "Pehle" dikhao — website hai, agents band hain (30 s)

**DIKHAO:** Bazaar website tab. Peela banner, chat box disabled, upar right badge **"Not connected to Abhed"**.

> **BOLO:** "Yeh Bazaar.in ki website hai. Iske apne AI agents hain — Shoppy orders ke liye, Pricer prices ke liye. Lekin abhi yeh band hain. Kyunki jab tak koi inke har action pe nazar na rakhe, inhe customer ke liye kuch karne ki permission nahi."

---

## Step 2 · Abhed se pairing code nikalo (20 s)

**DIKHAO:** Abhed → **Connect**. Right side **"In Abhed: 1"** — sirf NovaBank. Left **Add a company** → **Generate pairing code**. Bade 6 letters, 10 min valid.

> **BOLO:** "Abhed ko Bazaar ke baare mein abhi kuch nahi pata — na naam, na agents. Bas ek one-time code. Koi password ya API key copy-paste nahi."

---

## Step 3 · Website ke admin mein code daalo — LIVE (30 s) ⭐

**DIKHAO:** Bazaar admin tab (`bazaar-agents.onrender.com/admin`) → PIN **2468** → screen aayegi **"Connect Bazaar.in to Abhed"** → code type karo → **Connect to Abhed**.

Hara tick aayega: **"Connected to Abhed — Shoppy and Pricer are now online"** + ledger record number.

> **BOLO:** "Company ke admin ne code daala. Website ne Abhed se apni agent keys li — runtime pe, bina dobara deploy kiye."

---

## Step 4 · Company Abhed mein aati dikhao (30 s) ⭐

**DIKHAO:** Abhed Connect tab. Left mein **"Joined just now · Bazaar.in"** checklist:
- ✓ Website paired with a one-time code
- ✓ **E-commerce rulebook applied · 11 deterministic rules**
- ✓ Shoppy online · ✓ Pricer online

Right list mein **Bazaar.in** green flash ke saath aata hai ("In Abhed: 2"). Row pe click → **Agents** (heartbeat "3s ago"), **Rulebook** (click → 11 rules), **Live**.

> **BOLO:** "Website ne khud bataya ki woh kaun hai aur uske agents kaun hain. Abhed ne us industry ki apni rulebook laga di — 11 deterministic rules, koi AI guess nahi. Company chahe toh apne rules bhi add kar sakti hai (Rules page, doosre insaan ki approval ke saath)."

**DIKHAO (5 s):** upar company switcher kholo — ab Bazaar.in bhi hai. **Fleet** pe naya Bazaar card + "Add a company" tile.

---

## Step 5 · Ab governance live dikhao (2 min) ⭐⭐

**DIKHAO:** Bazaar website tab. Banner apne aap gayab, chat on, data load.

**(a) Chhota kaam — turant**
- "Signed in as" → **Neha Joshi · U-301**
- Suggestion: *"My order OD-5512 (Bluetooth speaker) arrived damaged. Please refund me."* → Send
- Right panel mein steps aate hain: `lookup_order` ALLOWED → `issue_refund ₹1,499` ALLOWED, `REFUND-AUTO`

> **BOLO:** "₹1,499 — company ki policy ke andar, turant. Agent slow nahi hua."

**(b) Bada kaam — insaan ke phone pe**
- Suggestion: *"My phone order OD-5530 never arrived. I want a full refund."* (customer U-302 apne aap select hota hai) → Send
- Chat mein: **"Waiting for one of our people to approve"**
- Phone pe: approver app → **Profile** → **Add another company** → Bazaar.in → Guest Judge → 1234 (Bazaar ab list mein hai). Card aata hai → **Evidence** → **Approve**
- Website pe: **"✅ Approved by Guest Judge. Done exactly as approved."**

> **BOLO:** "₹38,990 bada amount hai. Agent ruk gaya, sahi insaan ke phone pe gaya, unke naam se approve hua, tab chala."

**DIKHAO:** Abhed Connect tab → Live feed mein yeh saare actions, ms ke saath. Phir **Fleet** → upar **Speed vs control** bada chart aur **Right now** panel (decisions/min, agents online, connected 2 of 3 → 3 of 3).

---

## Step 6 · Kill switch — company remove karo (30 s, optional but strong)

**DIKHAO:** Abhed Connect → Bazaar.in row kholo → **Remove company** → PIN **2468**. Bazaar Abhed se gayab (list, Fleet, switcher — sab jagah se). Bazaar website tab pe — **10 second ke andar** banner wapas: *"assistants are switched off"*.

> **BOLO:** "Ek click mein company bahar, uske agents ki keys refuse. Fail-closed — Abhed ke bina agent kuch nahi kar sakta."

Dobara dikhana ho → Step 2 se repeat. Company fresh aati hai (purana data saaf).

---

## Step 7 · Sanjeevani (abhi band — uska Render service Zentro chala raha hai)

Same steps, company **Sanjeevani Hospital**:
- Patient: **Asha Kumari · P-101** → *"Please refill my metformin."* → turant
- **P-102** → *"I need a refill of my alprazolam (30 tablets), I have run out."* → controlled drug → doctor (Guest Judge) phone pe approve

Sanjeevani join hone ke baad approver app mein add karo: Profile → **Add another company** → Sanjeevani → Guest Judge → 1234.

---

## Option B · Bilkul nayi website sir ke saamne deploy karna (5 min)

Agar sir bolein *"deploy karke dikhao"*:

1. `dashboard.render.com` → **New** → **Web Service** → repo **HarshDubey23/hackarena**
2. Settings:
   - **Name:** `bazaar-live` (kuch bhi)
   - **Region:** Singapore
   - **Build Command:** `node --version`
   - **Start Command:** `node sites/server.mjs`
   - **Instance:** Free
3. **Environment variables** (sirf 3, koi Abhed key nahi):

   | Key | Value |
   |---|---|
   | `SITE` | `bazaar` (ya `sanjeevani`) |
   | `KAVACH_URL` | `https://kavach-os.vercel.app` |
   | `ADMIN_PIN` | `2468` |

4. **Create Web Service** → 1–2 min mein live. URL kholo → *"assistants are switched off"*.
5. Ab Step 2 → 3 → 4 → 5, bas admin URL naya hoga: `https://bazaar-live.onrender.com/admin`.
   - Join hone pe Connect page pe **"Bazaar.in joined from https://bazaar-live.onrender.com"** — naya URL. Yahi proof hai ki abhi deploy hui site connect hui.

> Dhyaan do: agar purani Bazaar site pehle se paired hai, woh bhi chalti rahegi. Fresh dikhana ho toh pehle **Reset demo** karo, phir nayi site pair karo.

---

## Agar kuch atak jaye

| Problem | Kya karo |
|---|---|
| "This code has expired" | Abhed Connect → **New code** (code 10 min chalta hai) |
| "Abhed is not waiting for this code" | Typo, ya code use ho chuka. Code dobara padho (0/O aur 1/I code mein nahi hote), ya **New code**. |
| Website khul nahi rahi | Render jaag raha hai — 40–50 s ruko, refresh. |
| Website pehle connected thi, ab "switched off" | Render ne instance restart kiya (free plan). Bas dobara pair karo — 10 s. |
| Chat: "No LLM" / rate limit | Thodi der ruko. Connect + heartbeat + approvals LLM ke bina bhi chalte hain. |
| Phone pe card nahi aaya | Approver app mein sahi company (Bazaar.in) mein on duty ho? Profile → Add another company. |

---

## Judges ke sawal

| Sawal | Jawab |
|---|---|
| "Keys kahan se aayi?" | "Pairing code se. Abhed ne website ko uski agent keys runtime pe di. Code ek baar chalta hai aur 10 min mein expire." |
| "Remove ke baad purani key se call kare toh?" | "Abhed refuse karega — 403, *not connected*. Fail-closed." |
| "Rules kahan se aaye?" | "Abhed ki industry rulebook — deterministic code, LLM nahi. Join pe lagti hai; company apne rules add kar sakti hai, doosra insaan approve kare tab live." |
| "Asli company kaise use karegi?" | "Same: SDK (`abhed.call`) apne agent code mein, pairing code se connect, approvers phone pe. Integrate page pe 3 line ka code hai." |
| "Kya website Abhed ke andar hi hai?" | "Nahi. Website alag server pe hai (Render), Abhed alag (Vercel). Dono internet pe baat karte hain." |

**PINs:** website admin + remove + reset **2468** · approver **1234**. Judging ke baad dono badal do.
