/**
 * Playwright playthrough of Nexus Terminal Game — full critical path.
 *
 * contractor_portal → vpn_gateway
 * → ops_cctv_ctrl → ops_hr_db            (Layer 1 — pick up decryptor)
 * → sec_access_ctrl → sec_firewall        (Layer 2 — exploit proprietary, decrypt fin creds)
 * → fin_payments_db → fin_exec_accounts   (Layer 3 — find exec assistant creds)
 * → exec_cfo → exec_legal → exec_ceo      (Layer 4 — aria_key.bin, Layer 5 unlocked)
 *
 * Usage (dev server must already be running: npm run dev):
 *   node playwright-playthrough.mjs
 *
 * Output: playthrough.webm in the project root.
 *         A balance summary table printed to stdout.
 */

import { chromium } from 'playwright';
import { rename } from 'node:fs/promises';

const URL = 'http://localhost:5173'; // default Vite port; change to 5174 if 5173 is already occupied
const VIDEO_DIR = './playthrough-video';

const TYPE_DELAY = 55; // ms between keystrokes
const CMD_PAUSE = 850; // ms after a normal command
const AI_PAUSE = 3200; // ms after a command that calls the AI APIs

// ── Helpers ──────────────────────────────────────────────────────────────────

async function typeInto(page, text, delayMs = TYPE_DELAY) {
  const input = page.locator('input:not([type="password"]):visible').last();
  await input.focus();
  for (const ch of text) {
    await input.pressSequentially(ch, { delay: delayMs });
  }
}

async function typePassword(page, text) {
  const input = page.locator('input[type="password"]:visible').last();
  await input.focus();
  for (const ch of text) {
    await input.pressSequentially(ch, { delay: TYPE_DELAY });
  }
}

// If the Sentinel opened a DM channel, exit it before continuing.
async function exitDmIfNeeded(page) {
  const inDm = await page.evaluate(() => document.body.classList.contains('dm-sentinel'));
  if (!inDm) return;
  console.log('[sentinel] DM channel detected — exiting');
  await page.waitForTimeout(2200);
  const input = page.locator('input:not([type="password"]):visible').last();
  await input.focus();
  await input.pressSequentially('exit', { delay: TYPE_DELAY });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.body.classList.contains('dm-sentinel'), {
    timeout: 6000,
  });
  await page.waitForTimeout(600);
}

async function cmd(page, command, pause = CMD_PAUSE) {
  await typeInto(page, command);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(pause);
  await exitDmIfNeeded(page);
}

async function waitForPlaying(page) {
  await page.waitForSelector('input:not([type="password"]):not([disabled])', { timeout: 30000 });
  await page.waitForTimeout(500);
}

async function saveVideo(page) {
  const tmp = await page.video()?.path();
  if (!tmp) return;
  try {
    await rename(tmp, './playthrough.webm');
    console.log('Video saved → playthrough.webm');
  } catch {
    console.log(`Video saved → ${tmp}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: false });

const context = await browser.newContext({
  viewport: { width: 1024, height: 768 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1024, height: 768 } },
});

const page = await context.newPage();
page.on('close', async () => {
  try {
    await saveVideo(page);
  } catch {
    /* already closed */
  }
});

try {
  // ── Boot ────────────────────────────────────────────────────
  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.removeItem('irongate_save');
    localStorage.removeItem('irongate_disclaimer_agreed');
    localStorage.removeItem('irongate_dossier');
    localStorage.removeItem('irongate_trace_audit');
  });
  await page.reload();
  await page.waitForTimeout(800);

  await page.waitForSelector('input[type="text"]', { timeout: 10000 });
  await page.waitForTimeout(800);
  await typeInto(page, 'AGREE');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  await page.waitForFunction(
    () => document.body.innerText.includes('Press Enter to access your field terminal'),
    { timeout: 10000 },
  );
  await page.waitForTimeout(3000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  await page.waitForFunction(() => document.body.innerText.includes('nx-field-01 login:'), {
    timeout: 10000,
  });
  await page.waitForTimeout(400);
  await typeInto(page, 'ghost');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  await page.waitForSelector('input[type="password"]:visible', { timeout: 5000 });
  await page.waitForTimeout(300);
  await typePassword(page, 'nX-2847');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  await page.waitForFunction(() => document.body.innerText.includes('100%'), { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  await waitForPlaying(page);
  await page.waitForTimeout(2800);

  // ════════════════════════════════════════════════════════════
  //  LAYER 0 — ENTRY
  //  Charges: 4
  // ════════════════════════════════════════════════════════════

  await cmd(page, 'login contractor Welcome1!');
  await cmd(page, 'cat welcome.txt'); // confirms vpn_gateway at 10.0.0.2, lore
  await cmd(page, 'scan'); // discovers VPN GATEWAY (10.0.0.2)

  await cmd(page, 'connect 10.0.0.2');
  await cmd(page, 'login contractor Welcome1!');
  await cmd(page, 'scan'); // discovers CCTV CONTROLLER + HR DATABASE

  // ════════════════════════════════════════════════════════════
  //  LAYER 1 — OPERATIONS
  //  Charges: 4
  // ════════════════════════════════════════════════════════════

  await cmd(page, 'connect 10.1.0.1'); // CCTV CONTROLLER
  await cmd(page, 'exploit http', AI_PAUSE); // −1 charge → 3  |  +2 trace
  await cmd(page, 'cat camera_config.ini'); // plaintext ops.admin / IronG8te#Ops  (+1 trace)

  await cmd(page, 'connect 10.1.0.2'); // HR DATABASE (directly connected)
  await cmd(page, 'login ops.admin IronG8te#Ops'); // admin — compromises L1 key anchor
  await cmd(page, 'cat employee_roster.csv');
  await cmd(page, 'cat password_policy.txt'); // j.mercer flagged for password reuse
  await cmd(page, 'cat sec_ticket_2023_0601.txt'); // reveals j.mercer / S3ntinel99
  await cmd(page, 'exfil decryptor.bin'); // +3 trace — adds decryptor tool (admin req)
  await cmd(page, 'exfil log-wiper.bin'); // +3 trace — adds log-wiper tool (admin req)
  await cmd(page, 'status');

  // ════════════════════════════════════════════════════════════
  //  LAYER 2 — SECURITY
  //  Charges: 3
  // ════════════════════════════════════════════════════════════

  await cmd(page, 'scan'); // discovers ACCESS CONTROL (10.2.0.1)

  await cmd(page, 'connect 10.2.0.1'); // ACCESS CONTROL
  await cmd(page, 'login j.mercer S3ntinel99'); // user — cred from HR ticket
  await cmd(page, 'cat acl_rules.conf'); // Aria subnet rule sneaked in 2024-08-17
  await cmd(page, 'cat network_segments.txt'); // [CLASSIFIED] 172.16.0.0/16
  await cmd(page, 'decrypt encrypted_creds.gpg'); // +2 trace — unlocks a.walsh + fin.dba creds
  await cmd(page, 'scan'); // discovers PERIMETER FIREWALL (10.2.0.2)

  await cmd(page, 'connect 10.2.0.2'); // PERIMETER FIREWALL
  await cmd(page, 'exploit proprietary', AI_PAUSE); // −2 charges → 1  |  +4 trace
  await cmd(page, 'cat fw_backup_2024.cfg'); // sec.root / Fw@llBreaker! + Aria ACL  (+3 trace)
  // Fork 2 Path B: exfil reduces charges by 2 (floored 0), but slows Sentinel to ×3 turns
  await cmd(page, 'exfil fw_backup_2024.cfg'); // Fork 2 Path B — sentinel interval ×3, +15 Aria trust
  await cmd(page, 'status');

  // ════════════════════════════════════════════════════════════
  //  LAYER 3 — FINANCE
  //  Charges: 0 (after Fork 2 floor)
  // ════════════════════════════════════════════════════════════

  // Use the log-wiper before pushing into the executive subnet
  await cmd(page, 'wipe-logs'); // −15% trace, single-use

  await cmd(page, 'scan'); // discovers PAYMENTS DATABASE (10.3.0.1)

  await cmd(page, 'connect 10.3.0.1'); // PAYMENTS DATABASE
  await cmd(page, 'login fin.dba P@yments2024');
  await cmd(page, 'cat wire_transfers_q4.csv'); // $7.3M → Cayman_Holdings_LLC (PROJ-ARIA-INFRA)

  await cmd(page, 'connect 10.3.0.2'); // EXEC ACCOUNTS (discovered via firewall scan)
  await cmd(page, 'login fin.dba P@yments2024'); // admin — compromises L3 key anchor
  await cmd(page, 'cat calendar_access.cfg'); // e.torres / Exec@ssist1  (+2 trace)
  await cmd(page, 'cat exec_compensation.xlsx'); // exec pay tied to PROJ-ARIA milestones  (+2 trace)
  await cmd(page, 'status');

  // ════════════════════════════════════════════════════════════
  //  LAYER 4 — EXECUTIVE
  //  Charges: 0  (aria-socket costs 0)
  // ════════════════════════════════════════════════════════════

  await cmd(page, 'scan'); // discovers CFO WORKSTATION (10.4.0.1)

  await cmd(page, 'connect 10.4.0.1'); // CFO WORKSTATION
  await cmd(page, 'login e.torres Exec@ssist1');
  await cmd(page, 'cat board_minutes_oct.pdf'); // board approved Aria, concern noted  (+2 trace)
  await cmd(page, 'cat PROJ_SENTINEL_BOARD_VOTE.pdf'); // Sentinel derived from Aria, empathy disabled  (+2 trace)
  await cmd(page, 'cat resignation_draft.txt'); // CFO couldn't sign off on it
  await cmd(page, 'scan'); // discovers LEGAL FILE SERVER (10.4.0.2)

  await cmd(page, 'connect 10.4.0.2'); // LEGAL FILE SERVER
  await cmd(page, 'login e.torres Exec@ssist1');
  await cmd(page, 'cat aria_nda_template.docx'); // 47 employees silenced
  await cmd(page, 'scan'); // discovers CEO TERMINAL (10.4.0.3)

  await cmd(page, 'connect 10.4.0.3'); // CEO TERMINAL
  await cmd(page, 'exploit aria-socket', AI_PAUSE); // 0 charges, 0 trace → root access
  await cmd(page, 'cat project_aria_summary.txt'); // "She knows you're here"  (+3 trace)
  await cmd(page, 'exfil aria_key.bin', AI_PAUSE); // unlocks Layer 5 / Aria subnetwork

  await cmd(page, 'status');
  await cmd(page, 'inventory');

  await page.waitForTimeout(4000);

  // ── Balance summary ─────────────────────────────────────────
  // Read the trace audit log written by saveGame and print a per-source breakdown.
  const auditRaw = await page.evaluate(() => localStorage.getItem('irongate_trace_audit'));
  if (auditRaw) {
    const log = JSON.parse(auditRaw);
    const totals = {};
    for (const { source, delta } of log) {
      totals[source] = (totals[source] ?? 0) + delta;
    }
    const finalTrace = log.length > 0 ? log[log.length - 1].totalAfter : 0;
    console.log('\n═══════════════════════════════════════');
    console.log(' BALANCE SUMMARY — trace audit log');
    console.log('═══════════════════════════════════════');
    console.log(` Total events : ${log.length}`);
    console.log(` Final trace  : ${finalTrace}%`);
    console.log('───────────────────────────────────────');
    const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
    for (const [src, total] of sorted) {
      console.log(` ${src.padEnd(36)} ${total >= 0 ? '+' : ''}${total}`);
    }
    console.log('═══════════════════════════════════════\n');
  }
} catch (err) {
  console.error('Playthrough error:', err?.message ?? err);
}

await saveVideo(page);
await context.close();
await browser.close();
