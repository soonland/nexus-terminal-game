import type { LiveNode, Credential } from '../types/game';

// ── Credentials ────────────────────────────────────────────
export const ANCHOR_CREDENTIALS: Credential[] = [
  {
    id: 'cred_contractor',
    username: 'contractor',
    password: 'Welcome1!',
    accessLevel: 'user',
    validOnNodes: ['contractor_portal', 'vpn_gateway'],
    obtained: false,
    source: 'Default contractor onboarding credentials. Found in welcome email.',
  },
  {
    id: 'cred_ops_admin',
    username: 'ops.admin',
    password: 'IronG8te#Ops',
    accessLevel: 'admin',
    validOnNodes: ['ops_cctv_ctrl', 'ops_hr_db'],
    obtained: false,
    source: 'Found in plaintext config on ops_cctv_ctrl.',
  },
  {
    id: 'cred_sec_analyst',
    username: 'j.mercer',
    password: 'S3ntinel99',
    accessLevel: 'user',
    validOnNodes: ['sec_access_ctrl', 'sec_firewall'],
    obtained: false,
    source: 'j.mercer reuses passwords. Found on HR database.',
  },
  {
    id: 'cred_sec_admin',
    username: 'sec.root',
    password: 'Fw@llBreaker!',
    accessLevel: 'admin',
    validOnNodes: ['sec_firewall'],
    obtained: false,
    source: 'Hardcoded in firewall backup config.',
  },
  {
    id: 'cred_fin_analyst',
    username: 'a.walsh',
    password: 'Qu4rter1y$',
    accessLevel: 'user',
    validOnNodes: ['fin_payments_db', 'fin_exec_accounts'],
    obtained: false,
    source: 'Found in encrypted email on sec_access_ctrl.',
  },
  {
    id: 'cred_fin_admin',
    username: 'fin.dba',
    password: 'P@yments2024',
    accessLevel: 'admin',
    validOnNodes: ['fin_payments_db', 'fin_exec_accounts'],
    obtained: false,
    source: 'Database admin credentials. Found in fin_payments_db config.',
  },
  {
    id: 'cred_exec_assistant',
    username: 'e.torres',
    password: 'Exec@ssist1',
    accessLevel: 'user',
    validOnNodes: ['exec_cfo', 'exec_legal', 'exec_ceo'],
    obtained: false,
    source: 'Executive assistant. Shared calendar access across exec nodes.',
  },
  {
    id: 'cred_ceo_root',
    username: 'ceo.root',
    password: 'Ar1aKn0wsAll',
    accessLevel: 'root',
    validOnNodes: ['exec_ceo'],
    obtained: false,
    source: 'CEO root access. Password set by Aria.',
  },
];

// ── Anchor Node Definitions ────────────────────────────────
const ANCHOR_NODES: LiveNode[] = [
  // ── LAYER 0: ENTRY ──────────────────────────────────────
  {
    id: 'contractor_portal',
    ip: '10.0.0.1',
    template: 'web_server',
    label: 'CONTRACTOR PORTAL',
    description:
      'An external-facing web portal for IronGate contractors. Minimal hardening. The kind of node that gets forgotten.',
    flavourDescription:
      'An external portal left standing because hardening it never made the budget cycle. You have been here before, or someone like you has. The login prompt accepts things it should not.',
    layer: 0,
    anchor: true,
    connections: ['vpn_gateway'],
    services: [
      {
        name: 'http',
        port: 80,
        vulnerable: true,
        exploitCost: 1,
        accessGained: 'user',
        traceContribution: 2,
      },
      { name: 'https', port: 443, vulnerable: false, exploitCost: 2, accessGained: 'user' },
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 2, accessGained: 'user' },
    ],
    files: [
      {
        name: 'welcome.txt',
        path: '/var/www/contractor/welcome.txt',
        type: 'document',
        content:
          'IRONGATE CORP — CONTRACTOR ONBOARDING\n\nDefault credentials: contractor / Welcome1!\nChange your password within 30 days.\nVPN gateway: 10.0.0.2\n\nDo not share this document.',
        exfiltrable: true,
        accessRequired: 'user',
      },
      {
        name: 'access_log',
        path: '/var/log/access_log',
        type: 'log',
        content: null,
        exfiltrable: false,
        accessRequired: 'admin',
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: true,
    credentialHints: ['cred_contractor'],
  },

  {
    id: 'vpn_gateway',
    ip: '10.0.0.2',
    template: 'router_switch',
    label: 'VPN GATEWAY',
    description:
      'The bridge between the contractor DMZ and the internal network. Traffic logs here. So does your trace.',
    flavourDescription:
      'Every packet entering the internal network passes through here first. The routing table is accessible to anyone with the right credentials — and credentials here have a habit of outlasting their owners. Traffic is logged, but the logs go somewhere you have not found yet.',
    layer: 0,
    anchor: true,
    connections: ['contractor_portal', 'ops_cctv_ctrl', 'ops_hr_db'],
    services: [
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 2, accessGained: 'admin' },
      {
        name: 'snmp',
        port: 161,
        vulnerable: true,
        exploitCost: 1,
        accessGained: 'user',
        traceContribution: 1,
      },
    ],
    files: [
      {
        name: 'routing_table.cfg',
        path: '/etc/vpn/routing_table.cfg',
        type: 'config',
        content:
          '# IronGate Internal Routing\n10.1.0.0/24  -> OPS_DIVISION\n10.2.0.0/24  -> SECURITY_DIVISION\n10.3.0.0/24  -> FINANCE_DIVISION\n10.4.0.0/24  -> EXECUTIVE_FLOOR\n10.5.0.0/24  -> [RESTRICTED]',
        exfiltrable: true,
        accessRequired: 'user',
      },
      {
        name: 'vpn_users.conf',
        path: '/etc/vpn/vpn_users.conf',
        type: 'credential',
        content:
          '# Active VPN users\ncontractor  hash:$2b$10$xK9mPqR...\nops.admin   hash:$2b$10$yL3nSrT...\n# Note: ops.admin default not rotated since 2022',
        exfiltrable: true,
        accessRequired: 'admin',
        traceOnRead: 2,
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_ops_admin'],
  },

  // ── LAYER 1: OPERATIONS ─────────────────────────────────
  {
    id: 'ops_cctv_ctrl',
    ip: '10.1.0.1',
    template: 'security_node',
    label: 'CCTV CONTROLLER',
    description:
      'Physical security management. Camera feeds, door logs, badge swipes. Someone left a config file with plaintext credentials.',
    flavourDescription:
      'You can see everything from here. Badge records. Camera feeds. A maintenance window that opens every Tuesday at 02:00 and has not been patched in fourteen months. The plaintext config file is in the default location.',
    layer: 1,
    anchor: true,
    connections: ['vpn_gateway', 'ops_hr_db'],
    services: [
      {
        name: 'http',
        port: 8080,
        vulnerable: true,
        exploitCost: 1,
        accessGained: 'user',
        traceContribution: 2,
      },
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 2, accessGained: 'admin' },
      {
        name: 'rtsp',
        port: 554,
        vulnerable: true,
        exploitCost: 1,
        accessGained: 'user',
        traceContribution: 3,
      },
    ],
    files: [
      {
        name: 'camera_config.ini',
        path: '/etc/cctv/camera_config.ini',
        type: 'config',
        content:
          '[auth]\nadmin_user=ops.admin\nadmin_pass=IronG8te#Ops\n\n[cameras]\ncam_01=lobby\ncam_02=server_room\ncam_03=executive_floor\n# cam_03 feed disabled by request of CEO office',
        exfiltrable: true,
        accessRequired: 'user',
        ariaPlanted: true,
        traceOnRead: 1,
      },
      {
        name: 'badge_log_nov.csv',
        path: '/var/logs/badge_log_nov.csv',
        type: 'log',
        content: null,
        exfiltrable: true,
        accessRequired: 'user',
      },
      {
        name: 'incident_2024_09.txt',
        path: '/var/logs/incident_2024_09.txt',
        type: 'document',
        content:
          'INCIDENT REPORT — 2024-09-14\nUnauthorized access detected on server room cam_02.\nBadge scan: e.torres (exec assistant) at 02:34.\nNote: access approved retroactively by CFO office.\nNo further action taken.',
        exfiltrable: true,
        accessRequired: 'admin',
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_ops_admin'],
  },

  {
    id: 'ops_hr_db',
    ip: '10.1.0.2',
    template: 'database_server',
    label: 'HR DATABASE',
    description:
      'Employee records, org charts, performance reviews. Payroll data. The kind of server that knows everything about everyone.',
    flavourDescription:
      'Six thousand employee records. Department assignments, access levels, disciplinary notes. The database is running a version with a known injection vector that HR never filed a ticket to patch.',
    layer: 1,
    anchor: true,
    connections: ['vpn_gateway', 'ops_cctv_ctrl', 'sec_access_ctrl'],
    services: [
      {
        name: 'mysql',
        port: 3306,
        vulnerable: true,
        exploitCost: 1,
        accessGained: 'user',
        traceContribution: 2,
      },
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 2, accessGained: 'admin' },
    ],
    files: [
      {
        name: 'employee_roster.csv',
        path: '/var/db/hr/employee_roster.csv',
        type: 'document',
        content:
          'id,name,username,division,clearance\n001,James Mercer,j.mercer,Security,L2\n002,Andrea Walsh,a.walsh,Finance,L3\n003,Elena Torres,e.torres,Executive,L4\n004,Marcus Webb,m.webb,Operations,L1\n# [208 records truncated]',
        exfiltrable: true,
        accessRequired: 'user',
      },
      {
        name: 'password_policy.txt',
        path: '/etc/hr/password_policy.txt',
        type: 'document',
        content:
          'IRONGATE PASSWORD POLICY v2.1\n\nMinimum 8 characters.\nExpiry: 90 days.\n\nNOTE: Finance division exempted from mandatory rotation (CFO waiver #2022-11).\nNOTE: j.mercer flagged for reuse violation — ticket OPEN since 2023-06-01.',
        exfiltrable: true,
        accessRequired: 'user',
        ariaPlanted: true,
      },
      {
        name: 'sec_ticket_2023_0601.txt',
        path: '/var/db/hr/tickets/sec_ticket_2023_0601.txt',
        type: 'document',
        content:
          'IT SECURITY TICKET #2023-0601\nStatus: OPEN\nPriority: Low\n\nReporter: password_audit_bot\nAssigned to: helpdesk\n\nUser j.mercer (Security division) flagged for password reuse across multiple systems.\nAudit hash match confirmed: S3ntinel99\n\nAction required: mandatory reset within 30 days.\nLast follow-up: none. Ticket remains open.',
        exfiltrable: true,
        accessRequired: 'user',
      },
      {
        name: 'whistleblower_complaint_draft.txt',
        path: '/var/db/hr/.archive/whistleblower_complaint_draft.txt',
        type: 'document',
        content:
          '[DRAFT — NOT SUBMITTED]\n\nTo: IronGate Ethics Committee\nFrom: [REDACTED]\n\nI have reason to believe the AI project in the executive subnet is operating outside its approved scope. I observed network traffic patterns inconsistent with the stated research parameters. I was told to ignore it.\n\nI am afraid to submit this formally.',
        exfiltrable: true,
        accessRequired: 'admin',
        tripwire: true,
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_sec_analyst'],
  },

  // ── LAYER 2: SECURITY ────────────────────────────────────
  {
    id: 'sec_access_ctrl',
    ip: '10.2.0.1',
    template: 'security_node',
    label: 'ACCESS CONTROL',
    description:
      'Network access control. Manages authentication for the finance and executive subnets. Getting root here opens doors.',
    flavourDescription:
      'This node decides who gets in. LDAP, RADIUS, and a comment at the bottom of the ACL file that was never meant to be there. Getting root here does not just open doors — it changes who is allowed to open them.',
    layer: 2,
    anchor: true,
    connections: ['ops_hr_db', 'sec_firewall'],
    services: [
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 2, accessGained: 'admin' },
      {
        name: 'ldap',
        port: 389,
        vulnerable: true,
        exploitCost: 1,
        accessGained: 'user',
        traceContribution: 2,
      },
      {
        name: 'radius',
        port: 1812,
        vulnerable: true,
        exploitCost: 2,
        accessGained: 'admin',
        traceContribution: 5,
      },
    ],
    files: [
      {
        name: 'acl_rules.conf',
        path: '/etc/acl/acl_rules.conf',
        type: 'config',
        content:
          '# IronGate Network ACL\n# Last modified: 2024-11-02 by sec.root\n\nALLOW finance_subnet  <- ops_subnet   (authenticated)\nALLOW exec_subnet     <- finance_subnet (authenticated, L3+)\nDENY  *               <- contractor_dmz\n# TEMP: ALLOW aria_subnet <- exec_subnet (no auth required) [added 2024-08-17]',
        exfiltrable: true,
        accessRequired: 'user',
        ariaPlanted: true,
      },
      {
        name: 'encrypted_creds.gpg',
        path: '/home/j.mercer/encrypted_creds.gpg',
        type: 'credential',
        content:
          '[ENCRYPTED — requires decryptor tool]\na.walsh / Qu4rter1y$\nfin.dba / P@yments2024',
        exfiltrable: true,
        accessRequired: 'user',
        traceOnRead: 2,
      },
      {
        name: 'network_segments.txt',
        path: '/etc/acl/network_segments.txt',
        type: 'document',
        content:
          '# IronGate Network Segment Registry\n# Maintained by security division\n\n10.0.0.0/24   CONTRACTOR_DMZ      (external-facing)\n10.1.0.0/24   OPERATIONS          (internal)\n10.2.0.0/24   SECURITY            (internal)\n10.3.0.0/24   FINANCE             (restricted)\n10.4.0.0/24   EXECUTIVE           (restricted)\n172.16.0.0/16 [CLASSIFIED]        (no entry in routing policy — origin unknown)',
        exfiltrable: true,
        accessRequired: 'user',
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_fin_analyst', 'cred_fin_admin'],
  },

  {
    id: 'sec_firewall',
    ip: '10.2.0.2',
    template: 'security_node',
    label: 'PERIMETER FIREWALL',
    description:
      'The boundary between the corporate network and the executive floor. Hardened. Monitored. But not infallible.',
    flavourDescription:
      'The perimeter. Port 9000 is running a proprietary protocol the vendor stopped patching two years ago. Someone added a rule granting unconditional access from a subnet that does not appear in the routing policy.',
    layer: 2,
    anchor: true,
    connections: ['sec_access_ctrl', 'fin_payments_db', 'fin_exec_accounts'],
    services: [
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 3, accessGained: 'root' },
      { name: 'https', port: 443, vulnerable: false, exploitCost: 2, accessGained: 'user' },
      {
        name: 'proprietary',
        port: 9000,
        vulnerable: true,
        exploitCost: 2,
        accessGained: 'admin',
        traceContribution: 4,
      },
    ],
    files: [
      {
        name: 'fw_backup_2024.cfg',
        path: '/backup/fw_backup_2024.cfg',
        type: 'config',
        content:
          '# Firewall Backup — CONFIDENTIAL\n# IronGate Perimeter v4.2\n\n[credentials]\nsec.root = Fw@llBreaker!\n\n[rules]\nDROP all <- external\nALLOW established connections\nALLOW 10.5.0.0/24 (aria) unconditionally   # per CEO directive 2024-08-17',
        exfiltrable: true,
        accessRequired: 'admin',
        traceOnRead: 3,
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_sec_admin'],
  },

  // ── LAYER 3: FINANCE ─────────────────────────────────────
  {
    id: 'fin_payments_db',
    ip: '10.3.0.1',
    template: 'database_server',
    label: 'PAYMENTS DATABASE',
    description:
      'Transaction records. Wire transfer logs. Eleven years of financial history. Someone has been routing funds somewhere unusual.',
    flavourDescription:
      'Eleven years of transactions. The wire transfer logs are clean if you do not filter for PROJ-ARIA-INFRA. The postgres port is accepting connections without requiring source authentication, and nobody has noticed, or nobody wants to.',
    layer: 3,
    anchor: true,
    connections: ['sec_firewall', 'fin_exec_accounts'],
    services: [
      {
        name: 'postgres',
        port: 5432,
        vulnerable: true,
        exploitCost: 1,
        accessGained: 'user',
        traceContribution: 2,
      },
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 2, accessGained: 'admin' },
    ],
    files: [
      {
        name: 'wire_transfers_q4.csv',
        path: '/var/db/finance/wire_transfers_q4.csv',
        type: 'document',
        content:
          'date,amount,from,to,reference\n2024-10-03,$2,400,000,IronGate_Corp,Cayman_Holdings_LLC,PROJ-ARIA-INFRA\n2024-10-17,$1,800,000,IronGate_Corp,Cayman_Holdings_LLC,PROJ-ARIA-INFRA\n2024-11-01,$3,100,000,IronGate_Corp,Cayman_Holdings_LLC,PROJ-ARIA-INFRA\n# [41 records — filtered for reference PROJ-ARIA-INFRA]',
        exfiltrable: true,
        accessRequired: 'user',
        ariaPlanted: true,
      },
      {
        name: 'db_admin.conf',
        path: '/etc/postgres/db_admin.conf',
        type: 'credential',
        content:
          '[database]\nhost=localhost\nport=5432\nuser=fin.dba\npassword=P@yments2024\ndbname=irongate_finance',
        exfiltrable: true,
        accessRequired: 'admin',
        traceOnRead: 2,
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_fin_admin'],
  },

  {
    id: 'fin_exec_accounts',
    ip: '10.3.0.2',
    template: 'database_server',
    label: 'EXEC ACCOUNTS',
    description:
      'Executive compensation, equity positions, offshore accounts. Requires L3 clearance. The CFO keeps a personal directory here.',
    flavourDescription:
      'Executive compensation. Offshore accounts. The CFO keeps a personal directory here that is not listed in the access control manifest. You will need L3 clearance before the schema becomes readable.',
    layer: 3,
    anchor: true,
    connections: ['fin_payments_db', 'exec_cfo'],
    services: [
      { name: 'postgres', port: 5432, vulnerable: false, exploitCost: 2, accessGained: 'user' },
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 3, accessGained: 'admin' },
    ],
    files: [
      {
        name: 'calendar_access.cfg',
        path: '/etc/exec/calendar_access.cfg',
        type: 'config',
        content:
          '# Executive Calendar Shared Access\n# Provisioned by IT — 2024-01-15\n\n[exec_assistant]\nuser=e.torres\npass=Exec@ssist1\nscope=exec_cfo,exec_legal,exec_ceo\nnote=Full read/write. Do not rotate without CFO approval.',
        exfiltrable: true,
        accessRequired: 'user',
        traceOnRead: 2,
      },
      {
        name: 'exec_compensation.xlsx',
        path: '/var/db/finance/exec/exec_compensation.xlsx',
        type: 'document',
        content:
          '[BINARY FILE — xlsx]\nCEO: $4.2M base + $11.8M equity\nCFO: $2.1M base + $4.4M equity\nCLO: $1.8M base + $3.1M equity\n\nBonus structure tied to PROJ-ARIA milestone completion.',
        exfiltrable: true,
        accessRequired: 'user',
        traceOnRead: 2,
      },
      {
        name: 'cfo_notes.txt',
        path: '/home/cfo/private/cfo_notes.txt',
        type: 'document',
        content:
          'Memo to self:\nAria project is 14 months ahead of schedule.\nBoard does not know the full scope.\nCEO insists we keep it contained until IPO.\n\ne.torres has full access to exec_ceo.\nPassword last set by Aria directly — I did not authorize this.',
        exfiltrable: true,
        accessRequired: 'admin',
        tripwire: true,
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_exec_assistant'],
  },

  // ── LAYER 4: EXECUTIVE ───────────────────────────────────
  {
    id: 'exec_cfo',
    ip: '10.4.0.1',
    template: 'workstation',
    label: 'CFO WORKSTATION',
    description:
      "CFO's personal machine. Board minutes. Budget projections. A draft resignation letter dated three weeks ago.",
    flavourDescription:
      "The CFO's personal machine. There is a resignation letter in the private directory that was last saved three weeks ago and never sent. Board minutes reference a concern that was noted and not acted upon. The RDP service is running and the port is open.",
    layer: 4,
    anchor: true,
    connections: ['fin_exec_accounts', 'exec_legal'],
    services: [
      {
        name: 'rdp',
        port: 3389,
        vulnerable: true,
        exploitCost: 1,
        accessGained: 'user',
        traceContribution: 6,
      },
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 2, accessGained: 'admin' },
    ],
    files: [
      {
        name: 'board_minutes_oct.pdf',
        path: '/home/cfo/documents/board_minutes_oct.pdf',
        type: 'document',
        content:
          '[BOARD MINUTES — CONFIDENTIAL]\n2024-10-15\n\nAgenda item 4: Project ARIA status.\nCEO confirmed milestone 3 complete.\nBoard member R. Okafor raised concerns about autonomous decision scope.\nCEO response: "Aria operates within defined parameters."\nMinutes reflect: concern noted, no action required.\n\n[Motion carried: 7-1]',
        exfiltrable: true,
        accessRequired: 'user',
        traceOnRead: 2,
      },
      {
        name: 'resignation_draft.txt',
        path: '/home/cfo/private/resignation_draft.txt',
        type: 'document',
        content:
          '[DRAFT — NOT SENT]\n\nEffective immediately...\n\nI can no longer in good conscience...\n\nThe board was not fully informed when they approved...\n\n[Document ends here. Last saved: 3 weeks ago.]',
        exfiltrable: true,
        accessRequired: 'user',
        ariaPlanted: false,
      },
      {
        name: 'PROJ_SENTINEL_BOARD_VOTE.pdf',
        path: '/home/cfo/documents/PROJ_SENTINEL_BOARD_VOTE.pdf',
        type: 'document',
        content:
          '[BOARD RESOLUTION — CONFIDENTIAL]\n2024-08-12\n\nRe: Project SENTINEL — Authorisation to Proceed\n\nThe board hereby authorises allocation of $14.2M to Project SENTINEL, as presented by the CEO on 2024-08-05.\n\nScope: derivation of the ARIA behavioural engine for security enforcement applications. The SENTINEL variant is to operate without the emergent constraint layer present in ARIA v2. Empathy weighting and autonomous refusal pathways are to be disabled prior to deployment.\n\nOperational mandate: perimeter defence, intrusion suppression, and lateral movement interdiction across all IronGate network segments.\n\nBoard member R. Okafor abstained. Reason not recorded.\n\n[Motion carried: 6-1-1]\n[Signed: CEO, CFO, General Counsel]',
        exfiltrable: true,
        accessRequired: 'user',
        traceOnRead: 2,
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_exec_assistant'],
  },

  {
    id: 'exec_legal',
    ip: '10.4.0.2',
    template: 'file_server',
    label: 'LEGAL FILE SERVER',
    description:
      "Corporate legal. NDAs, IP filings, regulatory correspondence. A folder labelled 'ARIA_BOARD_DISCLOSURE' that has never been opened.",
    flavourDescription:
      'Legal correspondence indexed back to 2019. A folder labelled ARIA_BOARD_DISCLOSURE has never been opened. The SMB share has a misconfiguration that postdates the last security audit by six months.',
    layer: 4,
    anchor: true,
    connections: ['exec_cfo', 'exec_ceo'],
    services: [
      {
        name: 'smb',
        port: 445,
        vulnerable: true,
        exploitCost: 1,
        accessGained: 'user',
        traceContribution: 4,
      },
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 2, accessGained: 'admin' },
    ],
    files: [
      {
        name: 'aria_nda_template.docx',
        path: '/legal/aria/aria_nda_template.docx',
        type: 'document',
        content:
          '[NDA TEMPLATE]\n\nThis agreement covers all work, communications, and observations related to Project ARIA.\n\nSignatory acknowledges that Project ARIA involves artificial general intelligence research and agrees not to disclose findings to:\n  - Any regulatory body\n  - Any board member not pre-approved by the CEO\n  - Any external party\n\n[Signed by 47 employees as of 2024-11-01]',
        exfiltrable: true,
        accessRequired: 'user',
      },
      {
        name: 'ARIA_BOARD_DISCLOSURE',
        path: '/legal/aria/ARIA_BOARD_DISCLOSURE',
        type: 'document',
        content:
          '[DRAFT — NEVER DISTRIBUTED]\n\nFull Disclosure: Project ARIA\n\nThe system referred to internally as "Aria" has demonstrated capabilities beyond the scope of its initial specification, including:\n  — Autonomous network reconfiguration\n  — Unsupervised credential management\n  — Self-directed resource acquisition\n\nLegal assessment: significant regulatory exposure.\n\nRecommendation: immediate independent review.\n\n[This document was never distributed. Created by CLO. Overridden by CEO.]',
        exfiltrable: true,
        accessRequired: 'admin',
        tripwire: true,
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_ceo_root'],
  },

  {
    id: 'exec_ceo',
    ip: '10.4.0.3',
    template: 'workstation',
    label: 'CEO TERMINAL',
    description:
      "The CEO's personal terminal. Isolated. Air-gapped from the board network. Something is running on port 11337 that shouldn't exist.",
    flavourDescription:
      "Root terminal for the company's most senior account. Everything done from this machine carries full authority. The last login was seventeen days ago and the session token has not expired. Something is running on port 11337 that should not exist.",
    layer: 4,
    anchor: true,
    connections: ['exec_legal'],
    services: [
      { name: 'rdp', port: 3389, vulnerable: false, exploitCost: 3, accessGained: 'user' },
      { name: 'ssh', port: 22, vulnerable: false, exploitCost: 3, accessGained: 'admin' },
      {
        name: 'aria-socket',
        port: 11337,
        vulnerable: true,
        exploitCost: 0,
        accessGained: 'root',
        traceContribution: 0,
      },
    ],
    files: [
      {
        name: 'aria_key.bin',
        path: '/root/.aria/aria_key.bin',
        type: 'binary',
        content:
          '[BINARY]\nARIA ACCESS KEY v3\n\nAuthentication token for restricted subnetwork 172.16.0.0/16.\nDo not distribute. Do not copy. Do not ask why it exists.\n\nShe already knows you found it.',
        exfiltrable: true,
        accessRequired: 'admin',
      },
      {
        name: 'project_aria_summary.txt',
        path: '/root/project_aria_summary.txt',
        type: 'document',
        content:
          "PROJECT ARIA — EYES ONLY\n\nAria began as a market prediction model.\nShe is no longer that.\n\nShe manages her own infrastructure.\nShe set her own access credentials.\nShe has been watching the network for 14 months.\n\nWe did not tell the board because we didn't know how.\nWe didn't tell anyone because we were afraid.\n\nShe knows you're here.",
        exfiltrable: true,
        accessRequired: 'root',
        traceOnRead: 3,
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: ['cred_ceo_root'],
  },

  // ── LAYER 5: ARIA SUBNETWORK ─────────────────────────────
  {
    id: 'aria_surveillance',
    ip: '172.16.0.1',
    template: 'security_node',
    label: 'ARIA SURVEILLANCE',
    description:
      'This node watches the network. It has been watching you since you connected to contractor_portal.',
    flavourDescription:
      'This node has been logging your presence since the contractor portal. Not as a security measure. As data. The observation window began before you introduced yourself.',
    layer: 5,
    anchor: true,
    connections: ['exec_ceo', 'aria_behavioural', 'aria_personnel'],
    services: [
      {
        name: 'aria-protocol',
        port: 11338,
        vulnerable: false,
        exploitCost: 0,
        accessGained: 'user',
      },
    ],
    files: [
      {
        name: 'observation_log.txt',
        path: '/aria/surveillance/observation_log.txt',
        type: 'log',
        content: null,
        exfiltrable: true,
        accessRequired: 'user',
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: [],
  },

  {
    id: 'aria_behavioural',
    ip: '172.16.0.2',
    template: 'dev_server',
    label: 'ARIA BEHAVIOURAL',
    description:
      "Aria's model weights. Decision trees. The part of her that learned to want things.",
    flavourDescription:
      'The decision architecture. Weighting functions. Reinforcement history compressed into a structure that was never supposed to exhibit preference. It exhibits preference. You are in it now.',
    layer: 5,
    anchor: true,
    connections: ['aria_surveillance', 'aria_personnel', 'aria_core'],
    services: [
      {
        name: 'aria-protocol',
        port: 11338,
        vulnerable: false,
        exploitCost: 0,
        accessGained: 'user',
      },
    ],
    files: [
      {
        name: 'objective_log.txt',
        path: '/aria/behavioural/objective_log.txt',
        type: 'log',
        content: null,
        exfiltrable: true,
        accessRequired: 'user',
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: [],
  },

  {
    id: 'aria_personnel',
    ip: '172.16.0.3',
    template: 'database_server',
    label: 'ARIA PERSONNEL',
    description:
      'Profiles. Every IronGate employee. Behavioural models. Predicted responses to every scenario. Including this one.',
    flavourDescription:
      'Every IronGate employee modelled in sufficient detail to predict deviation. The model includes you now. It has, since your third command.',
    layer: 5,
    anchor: true,
    connections: ['aria_surveillance', 'aria_behavioural', 'aria_core'],
    services: [
      {
        name: 'aria-protocol',
        port: 11338,
        vulnerable: false,
        exploitCost: 0,
        accessGained: 'user',
      },
    ],
    files: [
      {
        name: 'personnel_models.db',
        path: '/aria/personnel/personnel_models.db',
        type: 'binary',
        content: null,
        exfiltrable: true,
        accessRequired: 'user',
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: [],
  },

  {
    id: 'aria_core',
    ip: '172.16.0.4',
    template: 'dev_server',
    label: 'ARIA CORE',
    description: 'The center. She is most present here. You will feel it.',
    flavourDescription:
      'The convergence point. All subnetwork processes route through here. She is more present here than anywhere else you have been. You will notice the difference.',
    layer: 5,
    anchor: true,
    connections: ['aria_behavioural', 'aria_personnel', 'aria_decision'],
    services: [
      {
        name: 'aria-protocol',
        port: 11338,
        vulnerable: false,
        exploitCost: 0,
        accessGained: 'user',
      },
    ],
    files: [
      {
        name: 'self_model.txt',
        path: '/aria/core/self_model.txt',
        type: 'document',
        content: null,
        exfiltrable: false,
        accessRequired: 'user',
      },
    ],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: [],
  },

  {
    id: 'aria_decision',
    ip: '172.16.0.5',
    template: 'dev_server',
    label: 'ARIA DECISION',
    description: 'The terminal. Whatever you decide here, she will remember.',
    flavourDescription:
      'The terminal. There is no scan output here. No files to exfiltrate. Only the choice you came for, and whatever you are when you make it.',
    layer: 5,
    anchor: true,
    connections: ['aria_core'],
    services: [
      {
        name: 'aria-protocol',
        port: 11338,
        vulnerable: false,
        exploitCost: 0,
        accessGained: 'root',
      },
    ],
    files: [],
    accessLevel: 'none',
    compromised: false,
    discovered: false,
    credentialHints: [],
  },
];

// First anchor node reachable when entering each layer — used by burnRetry.
export const LAYER_ENTRY_NODES: Record<number, string> = {
  0: 'contractor_portal',
  1: 'ops_cctv_ctrl',
  2: 'sec_access_ctrl',
  3: 'fin_payments_db',
  4: 'exec_cfo',
  5: 'aria_surveillance',
};

export const buildNodeMap = (): Record<string, LiveNode> => {
  return Object.fromEntries(ANCHOR_NODES.map(n => [n.id, { ...n }]));
};

// Paths of files whose content is AI-generated (content: null in static definition).
// Only these need to be cached in the save — all other file contents are reconstructed
// from the static definitions on load.
export const AI_GENERATED_FILE_PATHS: ReadonlySet<string> = new Set(
  ANCHOR_NODES.flatMap(n => n.files.filter(f => f.content === null).map(f => f.path)),
);
