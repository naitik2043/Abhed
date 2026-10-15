/** People shown on the About page. Add teammates here; nothing else needs to change. */
export const TEAM: { name: string; role: string; note: string; did: string[]; areas: string[] }[] = [
  {
    name: 'Naitik Gupta',
    role: 'Frontend, testing & deployment',
    note: 'Makes Abhed something a person can actually use, and makes sure it keeps working. Built the screens judges and companies see, tested each flow end to end, and put the whole system live.',
    did: [
      'The fleet monitor, command center, connect page and the approver app people use on their phones',
      'Light and dark themes, phone layouts and the checks that keep text from overlapping on any screen',
      'End-to-end tests of the demo flows: a held refund, an approval on the phone, a blocked export',
      'Deployment of the app and the three demo company websites',
    ],
    areas: ['Frontend', 'UI', 'Testing', 'Deployment'],
  },
  {
    name: 'Manshi Chaudhary',
    role: 'Market, go-to-market & pricing',
    note: 'Answers who needs Abhed, why now and what they would pay. Turned the product into a business case that a bank, a hospital or an online store can say yes to.',
    did: [
      'Market gap analysis: what existing AI governance tools miss and who is left without one',
      'The go-to-market plan: first customers, sectors and how a pilot starts',
      'The pricing model: per agent each month, by risk level, so the price grows with the value',
    ],
    areas: ['Market gap analysis', 'Go-to-market', 'Pricing'],
  },
];
export const UPDATED = '13 October 2026';
