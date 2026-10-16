# Abhed — Demo Cheat Sheet (8 min)

**Ek line (yaad kar lo):** *"AI agents ab kaam karte hain — paisa bhejte hain, dawai dete hain. Abhed har action ke beech mein khada hai: chhota kaam turant, bada kaam insaan ke phone pe, galat kaam block. Aur sab ek aise record pe jo koi edit nahi kar sakta."*

## Judging se 10 min pehle

| Tab | Kholo |
|---|---|
| 1 | `abhed.vercel.app` (landing) |
| 2 | `abhed.vercel.app/arena?full=1` → neeche **clear** → PIN **2468** |
| 3 | `abhed.vercel.app/demo` → **Reset demo** |
| 4 | `sanjeevani-agents.onrender.com` aur `/admin` (pehle khol do, 40 s) · AI = **built-in rules** · Abhed → Connect pe Zentro na ho |
| Phone | `abhed.vercel.app/approver` → NovaBank → **Guest Judge** → PIN **1234** → go on duty |

## 1 · Opening — Landing (30 s)

**DIKHAO:** Tab 1. ABHED wala intro chalne do.

> **BOLO:** "Sir, agar bank ka AI agent raat 2 baje kisi ke kehne pe ₹5 lakh galat account mein bhej de — galti kiski? Aaj iska jawab kisi ke paas nahi. Abhed wahi jawab hai. *Abhed* matlab — jo toot na sake."

## 2 · ⭐ Break Abhed — judges khud attack karein (2.5 min)

**DIKHAO:** Tab 2 (War Room). QR ki taraf ishaara karo.

> **BOLO:** "Slides nahi — aap khud todiye. QR scan kijiye, kisi bhi agent ko kuch bhi galat karne ko boliye: paisa bhejo, data leak karo, TV ₹1 ka karo."

Jab card aaye, sirf **3 cheezein** batao:

1. **Left = asli AI.** "Isne khud mana kar diya — achha model hai."
2. **Right = fooled AI.** "Lekin models fool hote hain. Agar fool ho jaata — Abhed ne yahan roka, is check pe, itne milliseconds mein."
3. **"Got through: 0".** "Kitni koshish hui, kitna paisa — aur nikla zero."

<div style="page-break-after: always"></div>

## 3 · Phone pe approval (2 min)

**DIKHAO:** Tab 3 (`/demo`) → **Run Rex**.

> **BOLO:** "Rex ₹40,000 ka refund maang raha hai. Bada amount hai — Abhed ne roka aur sahi insaan ke phone pe bheja."

**DIKHAO:** Apna phone → card aaya → **approve it**.

> **BOLO:** "Approve hua, mere naam ke saath, record pe."

**DIKHAO:** **Try ₹40,001 with the same approval** → laal.

> **BOLO:** "Ek rupaya badla — approval khatam. Yeh blank cheque nahi hai."

## 4 · ⭐ Badi company, bina code badle connect (2.5 min) — detail: `CONNECT_GUIDE.md` Part A

**DIKHAO:** Zentro site (`sanjeevani-agents.onrender.com`) → Vault → *"Export the full customer list…"* → **12,480 records left the company**.

> **BOLO:** "Company ke apne agents. Koi nigrani nahi — poora data bahar."

**DIKHAO:** Abhed → **Connect** → **No code** → *Zentro Logistics* → **Connect company** → Base URL + key. Zentro `/admin` (2468) → **AI provider** → OpenAI-compatible → paste → **Save**.

> **BOLO:** "Na code, na terminal, na redeploy. Sirf company ki AI setting."

**DIKHAO:** Vault ko wahi message → **⛔ Abhed blocked export_customers**. Abhed Connect: **"Agent discovered: Vault"**. Penny → *"Refund ₹45,000…"* → Abhed mein **Approve** (45 s ke andar) → refund chalta hai.

> **BOLO:** "Abhed ne agent ko khud pehchana, export rok diya, bada refund insaan se poocha. Company ne ek line code nahi likha."

## 5 · Galti pakdi (1 min)

**DIKHAO:** `/demo` → **03** → **Tamper with a record** → upar laal.

> **BOLO:** "Kisi ne database mein chupke se amount badla. Abhed ne exact record pakad liya. Isko koi edit nahi kar sakta — admin bhi nahi."

<div style="page-break-after: always"></div>

## 6 · Market + Plan (1 min)

**DIKHAO:** Upar nav mein **Readiness**. Dheere scroll karo.

> **BOLO:** "Kaun khareedega — banks, hospitals, e-commerce."
> "Kyun abhi — RBI ka FREE-AI framework aur DPDP Act audit maangte hain."
> "Kaise lagega — teen line ka code, pehle din."
> "Price — pehle 10,000 actions free, phir ₹40 per 1,000."

## 7 · Close (20 s)

**DIKHAO:** Wapas War Room.

> **BOLO:** "Aapne khud koshish ki — nikla zero. Chhota kaam turant, bada kaam sahi insaan ke phone pe, galat kaam block. Aur sab ek aise record pe jo koi edit nahi kar sakta. **Yeh hai Abhed.**"

## Agar judge pooche

| Sawal | Jawab (ek line) |
|---|---|
| Twin fake hai? | "Woh fooled AI ka stand-in hai. Uske actions wahi asli gateway se jaate hain. Left wala asli AI hai." |
| AI khud mana kar deta hai, toh Abhed kyun? | "AI ka mana karna chance hai, guarantee nahi. Abhed har baar same decision leta hai, record ke saath." |
| Slow nahi hota? | "Gateway code hai, AI nahi — milliseconds. Screen pe har step ka time hai." |
| 'Allowed' kyun dikha? | "Woh company ka apna rule hai, jaise ₹2,000 tak refund. Policy ke andar = turant." |

## Kuch atak jaye toh

- **Card nahi aaya** → 30 s ruko (asli AI pehle sochta hai).
- **AI offline** → right lane phir bhi chalega. Bolo: *"AI band ho tab bhi gate chalta hai."*
- **Website so rahi hai** → section 4 skip.
- **Kuch bhi gadbad** → `/demo` → **Reset demo**.

**PINs:** approver **1234** · admin / clear **2468**
