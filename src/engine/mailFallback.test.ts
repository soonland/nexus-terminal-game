import { describe, it, expect } from 'vitest';
import { buildFallbackMailbox } from './mailFallback';
import type { MailOwner } from './mail';

const owner = (over: Partial<MailOwner> = {}): MailOwner => ({
  id: 'emp_ops_007',
  name: 'Dana Whitfield',
  role: 'Facilities Coordinator',
  division: 'operations',
  credentialId: 'cred_emp_ops_007',
  workstationId: null,
  ...over,
});

describe('buildFallbackMailbox', () => {
  it('is deterministic for the same owner and seed', () => {
    expect(buildFallbackMailbox(owner(), 42)).toEqual(buildFallbackMailbox(owner(), 42));
  });

  it('differs between seeds', () => {
    expect(buildFallbackMailbox(owner(), 42)).not.toEqual(buildFallbackMailbox(owner(), 43));
  });

  it('builds 3 to 5 dated fallback messages that involve the owner', () => {
    const box = buildFallbackMailbox(owner(), 42);
    expect(box.ownerId).toBe('emp_ops_007');
    expect(box.messages.length).toBeGreaterThanOrEqual(3);
    expect(box.messages.length).toBeLessThanOrEqual(5);
    for (const m of box.messages) {
      expect(m.source).toBe('fallback');
      expect(m.sentAt).toMatch(/^2024-10-\d{2}$/);
      expect([m.from, m.to]).toContain('Dana Whitfield');
    }
    expect(new Set(box.messages.map(m => m.id)).size).toBe(box.messages.length);
  });

  it('works for a cast owner with no division', () => {
    const box = buildFallbackMailbox(
      owner({ id: 'torres', name: 'Elena Torres', role: 'Executive assistant', division: null }),
      1,
    );
    expect(box.messages.length).toBeGreaterThanOrEqual(3);
  });
});
