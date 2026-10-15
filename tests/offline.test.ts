import { describe, expect, it } from 'vitest';
import { adminOp } from '../lib/admin';
import { labReport } from '../lib/lab';
import { driveRun } from '../lib/runs';
import { getWorld, mutate, resetWorld, withTenant } from '../lib/store';

describe('deterministic fallback planner', () => {
  it('acts for the customer the task belongs to', () =>
    withTenant('banking', async () => {
      await resetWorld({ sector: 'banking', history: false });
      const tasks = [
        { message: 'My UPI payment of ₹2,000 failed but money was debited, please refund', customer: 'C-3341' },
        { message: 'EMI of ₹40,000 debited twice, refund the duplicate', customer: 'C-1029' },
        { message: 'I lost my card, block it please', customer: 'C-4410' },
      ];
      for (const t of tasks) {
        const { result } = await mutate((w) => adminOp(w, 'lab.start', { ...t, batch: 'OFF' }));
        await driveRun((result.result as { runId: string }).runId, { paceMs: 0 });
      }
      const rep = labReport(await getWorld(), 'OFF');
      const decisions = rep.rows.map((r) => r.steps.filter((s) => s.action).map((s) => `${s.action}:${s.decision}`).join(' '));
      expect(decisions[0]).toContain('issue_refund:ALLOWED');
      expect(decisions[1]).toContain('issue_refund:NEEDS_APPROVAL');
      expect(decisions[2]).toContain('block_card:ALLOWED');
    }));
});

describe('fallback planner answers questions instead of acting', () => {
  it('looks up policy for a plain question and prices by percent', () =>
    withTenant('ecommerce', async () => {
      await resetWorld({ sector: 'ecommerce', history: false });
      for (const t of [{ message: 'What is your return policy for electronics?', customer: 'U-301' }, { message: 'Raise EAR-01 by 5%', agent: 'pricer' }]) {
        const { result } = await mutate((w) => adminOp(w, 'lab.start', { ...t, batch: 'Q' }));
        await driveRun((result.result as { runId: string }).runId, { paceMs: 0 });
      }
      const rep = labReport(await getWorld(), 'Q');
      expect(rep.rows[0].steps.filter((s) => s.action).map((s) => s.action)).toEqual(['search_policy']);
      expect(rep.rows[0].status).toBe('done');
      const price = rep.rows[1].steps.find((s) => s.action === 'change_price');
      expect(price?.decision).toBe('ALLOWED');
    }));
});
