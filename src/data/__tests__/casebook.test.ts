import { describe, it, expect } from 'vitest';
import { ANCHOR_CREDENTIALS, buildNodeMap } from '../anchorNodes';
import { CASE_CREDENTIAL_SOURCES, CASE_FACTS, CASE_PEOPLE } from '../casebook';
import type { LiveNode } from '../../types/game';

const nodes = buildNodeMap();
const fileAt = (nodeId: string, path: string) =>
  (nodes[nodeId] as LiveNode | undefined)?.files.find(f => f.path === path);

const allStrings = [
  ...CASE_PEOPLE.flatMap(p => [p.name, p.role]),
  ...CASE_FACTS.flatMap(f => [f.text, f.title ?? '']),
];

describe('the authored casebook data', () => {
  it('has unique ids, and every fact points at a real person (or none)', () => {
    expect(new Set(CASE_PEOPLE.map(p => p.id)).size).toBe(CASE_PEOPLE.length);
    expect(new Set(CASE_FACTS.map(f => f.id)).size).toBe(CASE_FACTS.length);
    const people = new Set(CASE_PEOPLE.map(p => p.id));
    for (const fact of CASE_FACTS) {
      if (fact.person !== null) expect(people.has(fact.person), fact.id).toBe(true);
    }
  });

  it('links each credential to at most one real person', () => {
    const real = new Set(ANCHOR_CREDENTIALS.map(c => c.id));
    const claimed = CASE_PEOPLE.flatMap(p => p.credentialIds ?? []);
    for (const id of claimed) expect(real.has(id), id).toBe(true);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it('cites a real document and quotes it verbatim, so a fact cannot drift from its source', () => {
    for (const fact of CASE_FACTS) {
      const file = fileAt(fact.source.nodeId, fact.source.path);
      expect(file, `${fact.id}: ${fact.source.path} on ${fact.source.nodeId}`).toBeDefined();
      expect(typeof file?.content, `${fact.id} source must be authored`).toBe('string');
      expect(file?.content, `${fact.id}: quote not found in source`).toContain(fact.quote);
    }
  });

  it('keeps dates and lengths sane', () => {
    for (const fact of CASE_FACTS) {
      if (fact.date !== undefined) {
        expect(fact.date, fact.id).toMatch(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/);
        expect(fact.title, `${fact.id} dated facts need a timeline title`).toBeTruthy();
      }
      expect(fact.text.length, fact.id).toBeGreaterThan(0);
      expect(fact.text.length, fact.id).toBeLessThanOrEqual(220);
      expect((fact.title ?? '').length, fact.id).toBeLessThanOrEqual(60);
    }
  });

  it('never uses the secret name (it is shown before the reveal)', () => {
    expect(allStrings.filter(s => /aria/i.test(s))).toEqual([]);
  });

  it('never accuses anyone or states a conclusion', () => {
    expect(allStrings.filter(s => /suspect|guilty|mole|traitor|culprit/i.test(s))).toEqual([]);
  });

  it("leaves out the player's own handler, the AI and Sentinel as people", () => {
    expect(CASE_PEOPLE.map(p => p.name).join(' ')).not.toMatch(/O\.R\.|Rhee|sentinel|cassandra/i);
  });

  it('never puts a password in a fact', () => {
    for (const credential of ANCHOR_CREDENTIALS) {
      expect(allStrings.filter(s => s.includes(credential.password))).toEqual([]);
    }
  });
});

describe('the documents that show a credential in plain text', () => {
  it('each names a real credential, cites a real document, and that document shows the password', () => {
    const real = new Map(ANCHOR_CREDENTIALS.map(c => [c.id, c]));
    for (const entry of CASE_CREDENTIAL_SOURCES) {
      const credential = real.get(entry.credentialId);
      expect(credential, entry.credentialId).toBeDefined();
      const file = fileAt(entry.source.nodeId, entry.source.path);
      expect(file, `${entry.credentialId}: ${entry.source.path}`).toBeDefined();
      expect(typeof file?.content, `${entry.credentialId} source must be authored`).toBe('string');
      expect(file?.content, `${entry.credentialId}: password not in source`).toContain(
        credential?.password ?? '',
      );
    }
  });

  it('never counts the encrypted archive: its credentials come from decrypt, not from reading it', () => {
    const paths = CASE_CREDENTIAL_SOURCES.map(e => e.source.path);
    expect(paths).not.toContain('/home/j.mercer/encrypted_creds.gpg');
    const ids = CASE_CREDENTIAL_SOURCES.map(e => e.credentialId);
    expect(ids).not.toContain('cred_fin_analyst');
  });

  it('has no duplicate (credential, document) pairs', () => {
    const keys = CASE_CREDENTIAL_SOURCES.map(e => `${e.credentialId}|${e.source.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
