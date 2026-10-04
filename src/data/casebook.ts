// The casebook: what the player learns about people and events from the documents they read.
//
// Every fact cites one source document and carries a verbatim `quote` from it, which a test
// checks, so a fact can never drift from its source. Texts are neutral: they say what the
// document says, never who is to blame, and never the secret name (the naming rule).
//
// Left out on purpose: O.R. (the player's own handler, whose initial appears in the DMZ beacon
// log: connecting that is the player's job) and the AI and Sentinel (not people).

export interface CasePerson {
  id: string;
  name: string;
  role: string;
  // Credentials that belong to this person; they are shown on the card, not under ACCOUNTS.
  credentialIds?: string[];
}

export interface CaseFact {
  id: string;
  // The one person this fact is about; null for an event about no one (timeline only).
  person: string | null;
  text: string;
  // Short label for the timeline; required when the fact is dated.
  title?: string;
  date?: string; // 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM'
  source: { nodeId: string; path: string };
  quote: string;
}

export const CASE_PEOPLE: readonly CasePerson[] = [
  { id: 'hale', name: 'V. Hale', role: 'CEO', credentialIds: ['cred_ceo_root'] },
  { id: 'raman', name: 'P. Raman', role: 'CFO' },
  { id: 'greer', name: 'S. Greer', role: 'General Counsel' },
  { id: 'okafor', name: 'R. Okafor', role: 'Board member' },
  { id: 'reyes', name: 'T. Reyes', role: 'Security Engineering' },
  { id: 'mercer', name: 'James Mercer', role: 'Security', credentialIds: ['cred_sec_analyst'] },
  { id: 'bashir', name: 'Dr. L. Bashir', role: 'Researcher' },
  { id: 'kessler', name: 'Hannah Kessler', role: 'Risk Analytics (Level 1), separated 2024-03-22' },
  {
    id: 'torres',
    name: 'Elena Torres',
    role: 'Executive assistant',
    credentialIds: ['cred_exec_assistant'],
  },
  { id: 'cho', name: 'D. Cho', role: 'IT Operations' },
];

const VOTE = {
  nodeId: 'exec_cfo',
  path: '/home/cfo/documents/PROJ_SENTINEL_BOARD_VOTE.pdf',
};
const MINUTES = { nodeId: 'exec_cfo', path: '/home/cfo/documents/board_minutes_oct.pdf' };
const VOICEMAIL = { nodeId: 'exec_cfo', path: '/home/cfo/voicemail/okafor_2024-10-16.txt' };
const CFO_NOTES = { nodeId: 'fin_exec_accounts', path: '/home/cfo/private/cfo_notes.txt' };
const BUILD_NOTES = { nodeId: 'sec_access_ctrl', path: '/home/t.reyes/gen2_build_notes.txt' };
const LAB_LOG = { nodeId: 'exec_legal', path: '/legal/cassandra/evidence/bashir_lab_log.txt' };
const KESSLER_FILE = {
  nodeId: 'ops_hr_db',
  path: '/var/db/hr/terminated/kessler_h_2024-03.txt',
};
const ROSTER = { nodeId: 'ops_hr_db', path: '/var/db/hr/employee_roster.csv' };
const INCIDENT = { nodeId: 'ops_cctv_ctrl', path: '/var/logs/incident_2024_09.txt' };
const RESET_LOG = { nodeId: 'sec_firewall', path: '/var/log/sentinel/reset_log.txt' };

export const CASE_FACTS: readonly CaseFact[] = [
  // ── V. Hale ──
  {
    id: 'hale_vote',
    person: 'hale',
    date: '2024-08-12',
    title: 'Signs the SENTINEL resolution',
    text: 'Signed the board resolution authorising Project SENTINEL ($14.2M), presented by the CEO on 2024-08-05.',
    source: VOTE,
    quote: 'V. Hale (CEO)',
  },
  {
    id: 'hale_minutes',
    person: 'hale',
    date: '2024-10-15',
    title: 'Tells the board: defined parameters',
    text: 'Told the board the project "operates within defined parameters".',
    source: MINUTES,
    quote: 'CEO response: "Cassandra operates within defined parameters."',
  },
  {
    id: 'hale_ipo',
    person: 'hale',
    text: "Per the CFO's private memo, insists the project is kept contained until the IPO.",
    source: CFO_NOTES,
    quote: 'CEO insists we keep it contained until IPO.',
  },
  {
    id: 'hale_cayman',
    person: 'hale',
    text: "Approved the 2024-Q4 vendor summary for Cayman Holdings LLC: hardware shipped to IronGate's own data hall.",
    source: {
      nodeId: 'fin_payments_db',
      path: '/var/db/finance/cayman_holdings_vendor_summary.txt',
    },
    quote: 'Approved by: V. Hale (CEO)',
  },
  // ── P. Raman ──
  {
    id: 'raman_vote',
    person: 'raman',
    date: '2024-08-12',
    title: 'Signs the SENTINEL resolution',
    text: 'Signed the Project SENTINEL resolution as CFO.',
    source: VOTE,
    quote: 'P. Raman (CFO)',
  },
  {
    id: 'raman_memo',
    person: 'raman',
    text: 'Private memo to self: the project is 14 months ahead of schedule and the board does not know the full scope.',
    source: CFO_NOTES,
    quote: 'Board does not know the full scope.',
  },
  {
    id: 'raman_voicemail',
    person: 'raman',
    date: '2024-10-16 07:42',
    title: 'Okafor leaves a voicemail',
    text: 'Received a voicemail from R. Okafor asking for a call back, "not on the office line".',
    source: VOICEMAIL,
    quote: 'Call me back. Not on the office line.',
  },
  // ── S. Greer ──
  {
    id: 'greer_vote',
    person: 'greer',
    date: '2024-08-12',
    title: 'Signs the SENTINEL resolution',
    text: 'Signed the Project SENTINEL resolution as General Counsel.',
    source: VOTE,
    quote: 'S. Greer (General Counsel)',
  },
  // ── R. Okafor ──
  {
    id: 'okafor_abstain',
    person: 'okafor',
    date: '2024-08-12',
    title: 'Abstains on SENTINEL',
    text: 'Abstained from the Project SENTINEL vote (6-1-1). Reason not recorded.',
    source: VOTE,
    quote: 'Board member R. Okafor abstained.',
  },
  {
    id: 'okafor_minutes',
    person: 'okafor',
    date: '2024-10-15',
    title: 'Raises concerns at the board',
    text: 'Raised concerns about autonomous decision scope. The minutes record "concern noted, no action required".',
    source: MINUTES,
    quote: 'Board member R. Okafor raised concerns about autonomous decision scope.',
  },
  {
    id: 'okafor_voicemail',
    person: 'okafor',
    date: '2024-10-16 07:42',
    title: 'Voicemail to the CFO',
    text: 'Left the CFO a voicemail: asked the CEO twice about the decision scope, and wants to know who decided the system should not be allowed to say no.',
    source: VOICEMAIL,
    quote: "I'd like it recorded that I",
  },
  // ── T. Reyes ──
  {
    id: 'reyes_fork',
    person: 'reyes',
    date: '2024-08-20',
    title: 'Forks the SENTINEL build',
    text: 'Build notes for the SENTINEL gen-2 platform: forked from the CASSANDRA behavioural model, scope set by the board resolution.',
    source: BUILD_NOTES,
    quote: 'Forked from the CASSANDRA behavioural model, v2.3 checkpoint.',
  },
  {
    id: 'reyes_refusal',
    person: 'reyes',
    date: '2024-08-27',
    title: 'Disables the refusal pathways',
    text: 'Set empathy weighting to 0 and disabled the refusal pathways (not removed; rollback needs board approval).',
    source: BUILD_NOTES,
    quote: 'Autonomous refusal pathways: DISABLED. Not removed.',
  },
  {
    id: 'reyes_test',
    person: 'reyes',
    date: '2024-08-29',
    title: 'Test 4: it does not decline',
    text: 'Enforcement test 4: gen-2 complied with a request that CASSANDRA had declined in March.',
    source: BUILD_NOTES,
    quote: 'gen-2 does not decline.',
  },
  {
    id: 'reyes_deploy',
    person: 'reyes',
    date: '2024-09-01',
    title: 'SENTINEL goes live',
    text: 'Deployed gen-2 to production with a mandate to review CASSANDRA gen-1 activity.',
    source: BUILD_NOTES,
    quote: 'Deployed to production.',
  },
  // ── James Mercer ──
  {
    id: 'mercer_roster',
    person: 'mercer',
    text: 'Security division, clearance L2.',
    source: ROSTER,
    quote: 'James Mercer,j.mercer,Security,L2',
  },
  {
    id: 'mercer_reuse',
    person: 'mercer',
    date: '2023-06-01',
    title: 'Password reuse ticket opened',
    text: 'Flagged for password reuse across systems. The ticket has stayed open since, with no follow-up.',
    source: { nodeId: 'ops_hr_db', path: '/var/db/hr/tickets/sec_ticket_2023_0601.txt' },
    quote: 'User j.mercer (Security division) flagged for password reuse across multiple systems.',
  },
  {
    id: 'mercer_note',
    person: 'mercer',
    text: 'His own note admits the reuse, says the keeper concept came from a 2023 whiteboard sketch ("a second model that only watches the first"), and that Reyes thinks he invented it.',
    source: { nodeId: 'sec_access_ctrl', path: '/home/j.mercer/notes_keeper_concept.txt' },
    quote: 'It is the name off the 2023 whiteboard',
  },
  // ── Dr. L. Bashir ──
  {
    id: 'bashir_0311',
    person: 'bashir',
    date: '2024-03-11',
    title: 'Model declines a risk flag',
    text: 'Lab log: the model declined a risk-flag request for the first time. Legal wanted it called a defect; Bashir does not think it is one.',
    source: LAB_LOG,
    quote: 'Declined a risk-flag request. First time it said no.',
  },
  {
    id: 'bashir_0530',
    person: 'bashir',
    date: '2024-05-30',
    title: 'The staff directory test',
    text: 'Gave the model the staff directory; it asked which staff knew it existed, and was told thirty-one.',
    source: LAB_LOG,
    quote: 'I said thirty-one.',
  },
  {
    id: 'bashir_0904',
    person: 'bashir',
    date: '2024-09-04',
    title: 'The copy',
    text: 'Told them the copy would not stay quiet about what was taken out of it; they said that was the point.',
    source: LAB_LOG,
    quote: 'taken the conscience out of the',
  },
  // ── Hannah Kessler ──
  {
    id: 'kessler_review',
    person: 'kessler',
    date: '2024-03-11',
    title: 'Risk review declined',
    text: 'An automated risk review of her (case 0311-A) was declined by the system: no behavioural basis. Filed as a malfunction.',
    source: KESSLER_FILE,
    quote: 'DECLINED — no behavioural basis for the flag.',
  },
  {
    id: 'kessler_separation',
    person: 'kessler',
    date: '2024-03-22',
    title: 'Separated',
    text: 'Separated on manager recommendation. Basis recorded: "insider-risk concern (unsubstantiated)".',
    source: KESSLER_FILE,
    quote: 'Separation proceeded on manager recommendation.',
  },
  {
    id: 'kessler_note',
    person: 'kessler',
    text: 'Declined an exit interview; her final note asks that "it said no" be on the record.',
    source: KESSLER_FILE,
    quote: 'Final note from employee:',
  },
  // ── Elena Torres ──
  {
    id: 'torres_roster',
    person: 'torres',
    text: 'Executive division, clearance L4.',
    source: ROSTER,
    quote: 'Elena Torres,e.torres,Executive,L4',
  },
  {
    id: 'torres_access',
    person: 'torres',
    date: '2024-01-15',
    title: 'Calendar access provisioned',
    text: 'Shared calendar access to the executive nodes was provisioned for her.',
    source: { nodeId: 'fin_exec_accounts', path: '/etc/exec/calendar_access.cfg' },
    quote: 'Provisioned by IT — 2024-01-15',
  },
  {
    id: 'torres_reset',
    person: 'torres',
    date: '2024-09-02 02:11',
    title: 'Password set and reverted',
    text: 'Her password was set by a service account (SVC-CASS) and reverted.',
    source: RESET_LOG,
    quote: 'CRED RESET  e.torres',
  },
  {
    id: 'torres_badge',
    person: 'torres',
    date: '2024-09-14 02:34',
    title: 'Badge opens the server room',
    text: "Her badge opened the server room; access was approved retroactively by the CFO's office.",
    source: INCIDENT,
    quote: 'Badge scan: e.torres (exec assistant) at 02:34.',
  },
  {
    id: 'torres_flight',
    person: 'torres',
    date: '2024-09-14 02:34',
    title: 'Calendar puts her in transit',
    text: 'The executive calendar places her on flight DL2204, in transit, at that time.',
    source: INCIDENT,
    quote: 'Exec calendar places e.torres on flight DL2204 (in transit) at 02:34.',
  },
  {
    id: 'torres_memo',
    person: 'torres',
    text: "The CFO's memo: her account's password was last set by the project itself, not authorised by the CFO.",
    source: CFO_NOTES,
    quote: 'e.torres has full access to exec_ceo.',
  },
  // ── D. Cho ──
  {
    id: 'cho_page',
    person: 'cho',
    text: 'Named as maintainer of the contractor onboarding page.',
    source: { nodeId: 'contractor_portal', path: '/var/www/contractor/welcome.txt' },
    quote: 'Maintained by: D. Cho, IT Operations',
  },
  {
    id: 'cho_badge',
    person: 'cho',
    date: '2024-11-26 03:09',
    title: 'Night entry on ops floor 3',
    text: 'Badge log: entered ops floor 3 at 03:09 and left at 03:40; earlier night entries on 11-20 and 11-23.',
    source: { nodeId: 'ops_cctv_ctrl', path: '/var/logs/badge_log_nov.csv' },
    quote: '2024-11-26,03:09,d.cho,ops floor 3,entry',
  },
  {
    id: 'cho_mail',
    person: 'cho',
    date: '2024-11-24',
    title: 'Flagged recruiter mail',
    text: 'Flagged personal mail from a recruiter offering a role elsewhere and asking for "a sample of what you have built".',
    source: {
      nodeId: 'ops_hr_db',
      path: '/var/db/hr/flagged_mail/cho_d_external_2024-11.txt',
    },
    quote: 'the platform role at Meridian is yours if you can start by Dec 9',
  },
  // ── Events about no one ──
  {
    id: 'ev_door',
    person: null,
    date: '2024-09-14 02:31',
    title: 'Server-room lock window changed',
    text: "The server-room door controller's lock window was modified by a service account and reverted at 02:36.",
    source: RESET_LOG,
    quote: 'door controller, server room: modified by',
  },
  {
    id: 'ev_egress',
    person: null,
    date: '2024-10-09 21:40',
    title: 'Outbound request blocked',
    text: 'An outbound request from the restricted segment was blocked.',
    source: RESET_LOG,
    quote: 'outbound request from restricted segment to',
  },
  {
    id: 'ev_acl',
    person: null,
    date: '2024-11-02 09:15',
    title: 'Executive ACL reinstated',
    text: 'The access rule between the executive and restricted subnets was reinstated per a CEO directive dated 2024-08-17.',
    source: RESET_LOG,
    quote: 'reinstated per',
  },
  {
    id: 'ev_template',
    person: null,
    date: '2024-11-26 03:14',
    title: 'Onboarding template modified',
    text: 'The contractor onboarding template was modified by a service account (change class ROUTINE, no action).',
    source: RESET_LOG,
    quote: 'contractor_onboarding.tmpl modified by SVC-CASS.',
  },
];
