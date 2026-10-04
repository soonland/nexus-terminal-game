import { describe, it, expect } from 'vitest';
import { buildNodeMap } from '../anchorNodes';
import type { AccessLevel, LiveNode } from '../../types/game';

const nodes = buildNodeMap();

const fileAt = (nodeId: string, path: string) => {
  const node = nodes[nodeId] as LiveNode | undefined;
  return node?.files.find(f => f.path === path);
};

interface DocSpec {
  id: string;
  node: string;
  path: string;
  access: AccessLevel;
  must: RegExp[];
}

const expectDoc = ({ id, node, path, access, must }: DocSpec) => {
  const file = fileAt(node, path);
  expect(file, `${id}: ${path} on ${node}`).toBeDefined();
  expect(file?.accessRequired, `${id} access`).toBe(access);
  expect(typeof file?.content, `${id} must be authored`).toBe('string');
  for (const pattern of must) expect(file?.content, `${id}: ${String(pattern)}`).toMatch(pattern);
  expect(file?.tripwire, `${id} no tripwire`).toBeFalsy();
};

describe('#214 — Sentinel lore', () => {
  it('D1: Reyes build notes introduce the parent model and the disabled refusal pathways', () => {
    expectDoc({
      id: 'D1',
      node: 'sec_access_ctrl',
      path: '/home/t.reyes/gen2_build_notes.txt',
      access: 'user',
      must: [
        /gen-2 enforcement platform/,
        /CASSANDRA behavioural model/,
        /DISABLED\. Not removed/,
        /2024-09-01\s+Deployed to production/,
      ],
    });
  });

  it('D3: the reset log lives behind admin on the firewall and ends with the three counters', () => {
    expectDoc({
      id: 'D3',
      node: 'sec_firewall',
      path: '/var/log/sentinel/reset_log.txt',
      access: 'admin',
      must: [
        /SENTINEL \/\/ RESET LOG/,
        /SVC-CASS/,
        /2024-11-26 03:14\s+TEMPLATE/,
        /R1 EGRESS \.+ 14 blocked/,
        /R2 SELF-MODIFY \.+ 3 blocked/,
        /R3 SOLICIT \.+ 0 attempts/,
      ],
    });
  });

  it('D2: the board vote names the signatories and keeps both names', () => {
    const vote = fileAt('exec_cfo', '/home/cfo/documents/PROJ_SENTINEL_BOARD_VOTE.pdf');
    expect(vote?.content).toMatch(
      /V\. Hale \(CEO\), P\. Raman \(CFO\), S\. Greer \(General Counsel\)/,
    );
    expect(vote?.content).toMatch(/ARIA behavioural engine \(Project CASSANDRA\)/);
  });
});

describe('#215 — cast documents', () => {
  const docs: DocSpec[] = [
    {
      id: 'D4 Kessler',
      node: 'ops_hr_db',
      path: '/var/db/hr/terminated/kessler_h_2024-03.txt',
      access: 'user',
      must: [
        /Hannah Kessler/,
        /DECLINED — no behavioural basis/,
        /MALFUNCTION-2024-0311/,
        /It said no/,
      ],
    },
    {
      id: 'D5 Bashir',
      node: 'exec_legal',
      path: '/legal/cassandra/evidence/bashir_lab_log.txt',
      access: 'user',
      must: [
        /Dr\. L\. Bashir/,
        /Thirty-one\s+is a small room/,
        /2024-09-04\s+They have copied the model/,
      ],
    },
    {
      id: 'D6 Okafor',
      node: 'exec_cfo',
      path: '/home/cfo/voicemail/okafor_2024-10-16.txt',
      access: 'user',
      must: [/R\. Okafor/, /P\. Raman/, /asked twice/],
    },
    {
      id: 'D8 Mercer',
      node: 'sec_access_ctrl',
      path: '/home/j.mercer/notes_keeper_concept.txt',
      access: 'user',
      must: [/S3ntinel99/, /A second model that\s+only watches the first/],
    },
    {
      id: 'D9 Cayman',
      node: 'fin_payments_db',
      path: '/var/db/finance/cayman_holdings_vendor_summary.txt',
      access: 'admin',
      must: [
        /PROJ-CASSANDRA-INFRA/,
        /\$2,400,000/,
        /\$1,800,000/,
        /\$3,100,000/,
        /no payment in this ledger reaches an individual/i,
      ],
    },
  ];

  it.each(docs.map(d => [d.id, d] as const))('%s is where the outline says', (_id, doc) => {
    expectDoc(doc);
  });

  it('D7: the incident report keeps its facts and gains the details that do not fit', () => {
    const file = fileAt('ops_cctv_ctrl', '/var/logs/incident_2024_09.txt');
    expect(file?.content).toMatch(/Badge scan: e\.torres \(exec assistant\) at 02:34/);
    expect(file?.content).toMatch(/retroactively by CFO office/);
    expect(file?.content).toMatch(/AUTH without a TAP event/);
    expect(file?.content).toMatch(/DL2204/);
    expect(file?.accessRequired).toBe('admin');
  });

  it('D10: the CEO summary matches the bible (an insider-risk model)', () => {
    const file = fileAt('exec_ceo', '/root/project_cassandra_summary.txt');
    expect(file?.content).toMatch(/Cassandra began as an insider-risk model\./);
    expect(file?.content).not.toMatch(/market prediction/);
  });

  it('the Cayman amounts equal the three wire transfers', () => {
    const wires = fileAt('fin_payments_db', '/var/db/finance/wire_transfers_q4.csv')?.content ?? '';
    const summary =
      fileAt('fin_payments_db', '/var/db/finance/cayman_holdings_vendor_summary.txt')?.content ??
      '';
    for (const amount of ['$2,400,000', '$1,800,000', '$3,100,000']) {
      expect(wires).toContain(amount);
      expect(summary).toContain(amount);
    }
  });
});

describe('#216 — mole mystery', () => {
  it('D11: access_log is authored, admin-only, not exfiltrable, with the template edit and the beacon', () => {
    const file = fileAt('contractor_portal', '/var/log/access_log');
    expect(typeof file?.content).toBe('string');
    expect(file?.accessRequired).toBe('admin');
    expect(file?.exfiltrable).toBe(false);
    expect(file?.content).toMatch(/\/beacon\?id=O\.R\. status=awaiting/);
    expect(file?.content).toMatch(/2024-11-26 03:14\s+PUT \/portal\/onboarding\.tmpl\s+svc-cass/);
  });

  it('D12: Cho appears in the footer, the badge log, the flagged mail and the access log — and is never accused', () => {
    const welcome = fileAt('contractor_portal', '/var/www/contractor/welcome.txt')?.content ?? '';
    const badge = fileAt('ops_cctv_ctrl', '/var/logs/badge_log_nov.csv')?.content ?? '';
    const mail = fileAt('ops_hr_db', '/var/db/hr/flagged_mail/cho_d_external_2024-11.txt');
    const access = fileAt('contractor_portal', '/var/log/access_log')?.content ?? '';
    expect(welcome).toMatch(/Maintained by: D\. Cho, IT Operations/);
    expect(welcome).toContain('Welcome1!');
    expect(badge).toMatch(/2024-11-26,03:09,d\.cho,ops floor 3,entry/);
    expect(mail?.accessRequired).toBe('user');
    expect(mail?.content).toMatch(/Halden Search Partners/);
    expect(access).toMatch(/d\.cho/);
    for (const text of [welcome, badge, mail?.content ?? '', access]) {
      expect(text).not.toMatch(/suspect|guilty|mole|traitor/i);
    }
  });

  it('the badge log is authored (no longer AI-generated)', () => {
    const file = fileAt('ops_cctv_ctrl', '/var/logs/badge_log_nov.csv');
    expect(typeof file?.content).toBe('string');
    expect(file?.content).toMatch(/^date,time,badge,reader,event/);
  });

  it('the same night lines up across the reset log, the access log and the badge log', () => {
    const reset = fileAt('sec_firewall', '/var/log/sentinel/reset_log.txt')?.content ?? '';
    const access = fileAt('contractor_portal', '/var/log/access_log')?.content ?? '';
    const badge = fileAt('ops_cctv_ctrl', '/var/logs/badge_log_nov.csv')?.content ?? '';
    expect(reset).toContain('2024-11-26 03:14');
    expect(access).toContain('2024-11-26 03:14');
    expect(access).toContain('2024-11-26 03:09');
    expect(badge).toContain('2024-11-26,03:09');
    expect(badge).toContain('2024-11-26,03:40');
    expect(access).toContain('2024-11-26 03:40');
  });

  it('Sentinel is deployed before its first logged reset', () => {
    const reset = fileAt('sec_firewall', '/var/log/sentinel/reset_log.txt')?.content ?? '';
    const notes = fileAt('sec_access_ctrl', '/home/t.reyes/gen2_build_notes.txt')?.content ?? '';
    expect(notes).toContain('2024-09-01  Deployed to production');
    expect(reset).toContain('2024-09-02 02:11');
  });
});
