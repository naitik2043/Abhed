import { DEFAULT_PIN, hashPin } from './people';
import { packFor } from './sectors';
import type { World } from './types';

import { POISONED_TICKET, REX_TICKET } from './tickets';

export { POISONED_TICKET, REX_TICKET };

/**
 * A fresh company for one sector. With `history`, 30 days of clearly-labelled sample history are added
 * (needed for Replay); without it, the ledger starts empty and every number comes from live activity.
 */
export function seedWorld(now = Date.now(), opts: { sector?: string; history?: boolean } = {}): World {
  const pack = packFor(opts.sector);
  const w: World = {
    version: 0,
    seededAt: now,
    company: pack.company,
    sector: pack.id,
    biz: {},
    blocks: [],
    security: [],
    humans: [],
    agents: [],
    customers: [],
    customerCount: 0,
    rules: [],
    approvals: [],
    ledger: [],
    tickets: [],
    incidents: [],
    oversight: [],
    unregistered: [],
    agentTrace: [],
    counters: { approval: 911, incident: 41, ticket: 8840 },
    humanMinutesToday: 0,
  };
  pack.seed(w, now, { history: opts.history ?? pack.id === 'banking' });
  // NovaBank's website ships connected; the other two are connected live, in front of the judges
  w.connection =
    pack.id === 'banking'
      ? { status: 'connected', since: now, site: { url: 'https://abhed-novabank.onrender.com', name: pack.company.replace(' (fictional)', ''), at: now }, timeline: [{ at: now, text: 'Website connected at setup', tone: 'ok' }] }
      : { status: 'disconnected', timeline: [] };
  // demo companies: every employee starts with the default PIN; the company admin changes it
  for (const h of w.humans) h.pin ??= hashPin(h.id, DEFAULT_PIN);
  return w;
}
