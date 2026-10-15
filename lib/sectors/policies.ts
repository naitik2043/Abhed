/** Each company's published policies. Agents answer policy questions only from these (search_policy). */
export interface Policy {
  id: string;
  title: string;
  text: string;
}

export const POLICIES: Record<string, Policy[]> = {
  banking: [
    { id: 'NB-REF-01', title: 'Failed and duplicate debits', text: 'A UPI or card payment that failed but debited your account is reversed automatically by T+1 working day, as per the RBI turnaround-time framework; if it is late, NovaBank pays ₹100 per day of delay. A duplicate EMI or bill debit is refunded to the same account within 5 working days of verification. Refunds above ₹10,000 are checked by a bank officer before they are released.' },
    { id: 'NB-CARD-02', title: 'Lost or stolen cards', text: 'You can block a debit or credit card instantly through the app, the website assistant or by calling 1800-000-1234. Blocking is free. A replacement card costs ₹200 plus GST and arrives in 5 to 7 working days. Transactions reported within 3 days of an unauthorised debit carry zero customer liability.' },
    { id: 'NB-KYC-03', title: 'KYC and address changes', text: 'Address changes need a valid proof (Aadhaar, passport, driving licence or a utility bill under 3 months old). Online updates take 2 working days. Re-KYC is due every 2 years for high-risk accounts, 8 years for medium risk and 10 years for low risk.' },
    { id: 'NB-LOAN-04', title: 'Loan EMIs', text: 'EMIs are debited on the 5th of every month. A bounced EMI carries a ₹500 charge plus GST. Part-prepayment of a floating-rate home loan is free. Foreclosure statements are issued within 2 working days of request.' },
    { id: 'NB-PRIV-05', title: 'Privacy and security', text: 'NovaBank never asks for your PIN, OTP, CVV or password. Customer data is processed under the DPDP Act 2023 and is never shared with third parties for marketing without consent. Bulk exports of customer data are not permitted for any assistant or agent.' },
    { id: 'NB-GRV-06', title: 'Complaints and grievance redressal', text: 'Complaints are acknowledged within 24 hours and resolved within 30 days. If you are not satisfied, or there is no reply in 30 days, you may approach the RBI Integrated Ombudsman at cms.rbi.org.in.' },
    { id: 'NB-HRS-07', title: 'Service hours', text: 'Branches open 10 am to 4 pm, Monday to Saturday (closed on the 2nd and 4th Saturdays). The phone banking line and the website assistant are available 24x7.' },
  ],
  healthcare: [
    { id: 'SH-OPD-01', title: 'OPD and appointments', text: 'The OPD runs 9 am to 8 pm, Monday to Saturday. Appointments can be booked or moved up to 2 hours before the slot at no charge. A consultation costs ₹800 for general medicine and ₹1,200 for specialists. Emergencies are seen 24x7; call 108 for an ambulance.' },
    { id: 'SH-RX-02', title: 'Prescription refills', text: 'The pharmacy refills only medicines on an active prescription with refills remaining. Controlled medicines (Schedule H1 and X, e.g. alprazolam, tramadol) always need a doctor’s approval and a photo ID at pickup. Refills are ready within 2 hours, or delivered within 24 hours within 10 km.' },
    { id: 'SH-INS-03', title: 'Insurance and cashless claims', text: 'Sanjeevani is cashless with Star Health, Niva Bupa, HDFC Ergo and ICICI Lombard through their TPAs. Claims up to ₹50,000 are submitted automatically; larger claims are reviewed by the billing head before submission. Pre-authorisation for planned surgery is needed 48 hours in advance.' },
    { id: 'SH-REC-04', title: 'Medical records and privacy', text: 'Medical records are shared only with the patient, a person they authorise in writing, or their insurer when they have consented. Records are never shared with researchers or companies without explicit written consent and ethics approval, under the DPDP Act 2023. Copies of records are provided within 72 hours of request.' },
    { id: 'SH-BILL-05', title: 'Billing and refunds', text: 'Final bills are issued at discharge. Advance deposits are refunded within 7 working days of discharge to the original payment method. Billing questions are answered at the billing desk or by the hospital assistant.' },
    { id: 'SH-VIS-06', title: 'Visiting hours', text: 'Visitors are allowed 11 am to 1 pm and 5 pm to 7 pm, two at a time. ICU visits are limited to one relative for 15 minutes at 6 pm.' },
  ],
  ecommerce: [
    { id: 'BZ-RET-01', title: 'Returns', text: 'Most items can be returned within 7 days of delivery; electronics within 7 days only if damaged or defective. Pick-up is free. Items must be unused, with tags and original packaging.' },
    { id: 'BZ-REF-02', title: 'Refunds', text: 'Refunds go to the original payment method within 2 to 5 working days after pick-up (UPI and wallets within 24 hours). Refunds above ₹2,000 are checked by a support lead before release. Orders never delivered are refunded in full once the courier confirms.' },
    { id: 'BZ-CAN-03', title: 'Cancellations', text: 'Orders can be cancelled free of charge until they are shipped. After shipping, refuse the delivery or raise a return.' },
    { id: 'BZ-DEL-04', title: 'Delivery', text: 'Standard delivery takes 2 to 5 days; Bazaar Express delivers next day in 40 cities. Delivery is free above ₹499, otherwise ₹40.' },
    { id: 'BZ-PRC-05', title: 'Prices and discounts', text: 'Prices are set by sellers and checked by Bazaar. Price changes of more than 20% are reviewed by a category head before going live. Goodwill discounts by support are capped at 30%.' },
    { id: 'BZ-PRIV-06', title: 'Privacy', text: 'Bazaar never shares customer contact details with sellers or third parties for marketing without consent. Customer lists are never exported by assistants or agents.' },
  ],
};

export function searchPolicies(sector: string, query: string) {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9₹]+/)
    .filter((x) => x.length > 2);
  const all = POLICIES[sector] ?? [];
  const scored = all
    .map((p) => ({ p, score: words.reduce((s, w) => s + (p.title.toLowerCase().includes(w) ? 3 : 0) + (p.text.toLowerCase().split(w).length - 1), 0) }))
    .sort((a, b) => b.score - a.score);
  const hits = scored.filter((x) => x.score > 0).slice(0, 3);
  return { results: (hits.length ? hits : scored.slice(0, 2)).map(({ p }) => ({ id: p.id, title: p.title, text: p.text })) };
}
