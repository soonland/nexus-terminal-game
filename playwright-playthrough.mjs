/**
 * Playwright playthrough of Nexus Terminal Game: a full run from login to an ending.
 *
 *   contractor_portal → vpn_gateway                         (layer 0, entry)
 *   → ops_cctv_ctrl → ops_hr_db                             (layer 1, tools)
 *   → sec_access_ctrl → sec_firewall                        (layer 2, decrypt, exploit)
 *   → fin_payments_db → fin_exec_accounts                   (layer 3, executive credentials)
 *   → exec_cfo → exec_legal → exec_ceo                      (layer 4, the subnet key)
 *   → the restricted subnet: scan hop by hop to the core, read the self-model (the reveal),
 *     then the decision terminal and an ending.
 *
 * Usage (the dev server must already be running: `pnpm dev`):
 *   node playwright-playthrough.mjs [--headless] [--ending=1|2|3|4] [--url=http://localhost:5173]
 *
 *   --headless   no visible browser, fast typing (the default is a visible, human-paced run)
 *   --ending     which ending to choose at the decision terminal: 1 LEAK, 2 SELL, 3 DESTROY,
 *                4 FREE (default 4)
 *   --url        where the game is served (default http://localhost:5173)
 *
 * Output: playthrough.webm in the project root (git-ignored), a per-command log, milestone
 *         checks (the process exits non-zero if one fails), and a trace-balance summary.
 *
 * The AI routes are not part of a dev-server run, so Sentinel and Aria fall back to their
 * authored offline lines; the run exercises the engine and the UI, not Gemini.
 */

import { chromium } from 'playwright';
import { mkdir, rename } from 'node:fs/promises';

// ── Options ──────────────────────────────────────────────────────────────────

const argValue = (name, fallback) => {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
};

const HEADLESS = process.argv.includes('--headless');
const ENDING = argValue('ending', '4');
const BASE_URL = argValue('url', 'http://localhost:5173');
const VIDEO_DIR = './playthrough-video';
const VIDEO_FILE = './playthrough.webm';

if (!['1', '2', '3', '4'].includes(ENDING)) {
  console.error('--ending must be 1, 2, 3 or 4');
  process.exit(2);
}

const TYPE_DELAY = HEADLESS ? 4 : 45; // ms between keystrokes
const PAUSE = HEADLESS ? 350 : 900; // ms after a normal command
const SLOW_PAUSE = HEADLESS ? 1200 : 2500; // ms after a command that waits on a service or a story beat
const ENDING_PAUSE = HEADLESS ? 9000 : 14000; // the ending animation

const INPUT = '[data-testid="terminal-command-input"]';

// ── Helpers ──────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', e => {
  pageErrors.push(String(e));
});

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(label);
};

// The text of a pane, as the player sees it.
const paneText = pane =>
  page.evaluate(name => document.querySelector(`[data-pane="${name}"]`)?.innerText ?? '', pane);

const inputReady = () =>
  page
    .waitForFunction(
      sel => {
        const input = document.querySelector(sel);
        return !input || !input.disabled;
      },
      INPUT,
      { timeout: 20000 },
    )
    .catch(() => undefined);

// Type into whichever input is the terminal's, even if a COMMS channel just took focus.
const type = async text => {
  await inputReady();
  const input = page.locator(INPUT).first();
  if (await input.count()) await input.focus();
  await page.keyboard.type(text, { delay: TYPE_DELAY });
  await page.keyboard.press('Enter');
};

const newLines = (before, after) => {
  const seen = new Set(before.split('\n').map(l => l.trim()));
  return after
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !seen.has(l) && !l.startsWith('nexus $'));
};

// Things that usually mean a command in this script has gone stale.
const SUSPICIOUS =
  /file not found|host not found|unknown command|no route|no direct route|insufficient charges|invalid choice|access denied|permission denied|not authenticated$/i;

const cmd = async (command, pause = PAUSE) => {
  const before = await paneText('term');
  await type(command);
  await page.waitForTimeout(pause);
  await inputReady();
  const lines = newLines(before, await paneText('term'));
  const warning = lines.find(l => SUSPICIOUS.test(l));
  console.log(`> ${command}`);
  if (warning) console.log(`   !! ${warning.slice(0, 110)}`);
};

const phase = title => {
  console.log(`\n── ${title}`);
};

// The floors the CAM menu lists right now (opens the CAM tab and the menu, then closes the menu).
const camFloors = async () => {
  await page.getByRole('button', { name: 'CAM', exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('.cam-menu-button').click();
  const floors = await page.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return floors.map(f => f.replace(/\s*▸$/, ''));
};

// Opens a camera through the menu: expand its floor if needed, then pick it.
const pickCamera = async (floor, camera) => {
  await page.locator('.cam-menu-button').click();
  await page.getByRole('menuitem', { name: new RegExp(floor, 'i') }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(camera) }).click();
  await page.waitForTimeout(600);
};

// The cameras a floor lists right now (opens the CAM tab and the menu, hovers the floor, closes it).
const camsOnFloor = async floor => {
  await page.getByRole('button', { name: 'CAM', exact: true }).click();
  await page.locator('.cam-menu-button').click();
  await page.getByRole('menuitem', { name: new RegExp(floor, 'i') }).hover();
  const items = await page.getByRole('menuitemradio').allInnerTexts();
  await page.keyboard.press('Escape');
  return items;
};

// ── Run ──────────────────────────────────────────────────────────────────────

try {
  // Boot: a clean slate, the disclaimer, the prologue, the field-terminal login.
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await type('AGREE');
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter'); // dismiss the prologue
  await page.waitForTimeout(800);
  await type('ghost');
  await page.waitForTimeout(500);
  await type('nX-2847');
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter'); // skip the boot sequence
  for (let i = 0; i < 60; i += 1) {
    if (await page.getByText('Start with: scan').count()) break;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1500);

  check(
    'the game starts at the contractor portal',
    /CONTRACTOR PORTAL/.test(await paneText('term')),
  );

  phase('LAYER 0: entry');
  await cmd('login contractor Welcome1!');
  await cmd('cat welcome.txt'); // the VPN gateway address
  await cmd('scan');
  await cmd('connect 10.0.0.2');
  await cmd('login contractor Welcome1!');
  await cmd('scan');

  phase('LAYER 1: operations');
  await cmd('connect 10.1.0.1');
  await cmd('exploit http', SLOW_PAUSE);
  await cmd('cat camera_config.ini'); // ops.admin in plain text
  // The CAM tab exists while connected to the controller, and its feed renders (or reports NO SIGNAL).
  await page.getByRole('button', { name: 'CAM', exact: true }).click();
  await page.waitForTimeout(1500);
  check(
    'the CAM tab shows a live camera feed',
    (await page.locator('[data-testid="cam-canvas"]').count()) === 1 &&
      (await page.locator('[data-testid="cam-nosignal"]').count()) === 0,
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
  const lockedFinance = await camsOnFloor('FINANCE');
  check(
    'a camera that is not unlocked yet is listed as locked',
    lockedFinance.length > 0 && lockedFinance.every(c => /locked/.test(c)),
    lockedFinance.join(', '),
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
  await cmd('connect 10.1.0.2');
  await cmd('login ops.admin IronG8te#Ops');
  await cmd('cat employee_roster.csv');
  await cmd('cat password_policy.txt');
  await cmd('cat sec_ticket_2023_0601.txt');
  await cmd('exfil decryptor.bin');
  await cmd('exfil log-wiper.bin');
  await cmd('status');

  phase('LAYER 2: security');
  await cmd('scan');
  await cmd('connect 10.2.0.1');
  await cmd('login j.mercer S3ntinel99');
  await cmd('cat acl_rules.conf');
  await cmd('decrypt encrypted_creds.gpg');
  await cmd('scan');
  await cmd('connect 10.2.0.2');
  await cmd('exploit proprietary', SLOW_PAUSE);
  await cmd('cat fw_backup_2024.cfg');
  await cmd('exfil fw_backup_2024.cfg');
  await cmd('status');

  phase('LAYER 3: finance');
  await cmd('wipe-logs');
  await cmd('scan');
  await cmd('connect 10.3.0.1');
  await cmd('login fin.dba P@yments2024');
  await cmd('cat wire_transfers_q4.csv');
  await cmd('connect 10.3.0.2');
  await cmd('login fin.dba P@yments2024');
  await cmd('cat calendar_access.cfg'); // e.torres in plain text
  for (const floor of ['SECURITY', 'FINANCE']) {
    const cams = await camsOnFloor(floor);
    check(
      `layer 3 has made the ${floor.toLowerCase()} camera live`,
      cams.length > 0 && cams.every(c => !/locked|offline/.test(c)),
      cams.join(', '),
    );
  }
  await pickCamera('EXECUTIVE', 'Executive corridor');
  check(
    'the executive floor is still disabled at layer 3',
    (await page.locator('[data-testid="cam-offline"]').count()) === 1,
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
  await cmd('status');

  phase('LAYER 4: executive');
  await cmd('scan');
  await cmd('connect 10.4.0.1');
  await cmd('login e.torres Exec@ssist1');
  await cmd('cat PROJ_SENTINEL_BOARD_VOTE.pdf');
  await cmd('scan');
  await cmd('connect 10.4.0.2');
  await cmd('login e.torres Exec@ssist1');
  await cmd('scan');
  await cmd('connect 10.4.0.3');
  await cmd('exploit cassandra-socket', SLOW_PAUSE);
  await cmd('exfil subnet_key.bin'); // opens the way into the restricted subnet
  await camFloors();
  await pickCamera('EXECUTIVE', 'Corner office');
  check(
    'layer 4 brings the executive floor online',
    (await page.locator('[data-testid="cam-offline"]').count()) === 0 &&
      (await page.locator('[data-testid="cam-canvas"]').count()) === 1,
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
  await cmd('status');

  // The casebook should now hold what the run has read so far.
  await cmd('case');
  // Open a section only if it is closed: a click on an open one would close it.
  const openSection = async name => {
    const toggle = page.getByRole('button', { name: new RegExp(`^${name}`) });
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  };
  await openSection('(KNOWN CREDENTIALS|ACCOUNTS)'); // renamed in the credentials change
  await page.waitForTimeout(300);
  const casebook = await paneText('aux');
  check('the casebook lists people from the documents read', /PEOPLE \(\d+\)/.test(casebook));
  const hasCredential = /ops\.admin \/ IronG8te#Ops/.test(casebook);
  check('the casebook shows a credential found in a document', hasCredential);
  if (!hasCredential) console.log(`--- CASE pane at the failure ---\n${casebook}\n---`);
  await page.getByRole('button', { name: 'MAP' }).click();

  phase('THE SUBNET: scan hop by hop');
  await cmd('scan'); // the exfil message says to scan from here
  await cmd('connect 172.16.0.1');
  await cmd('scan');
  await cmd('connect 172.16.0.2');
  await cmd('scan');
  await cmd('connect 172.16.0.4');
  await cmd('scan');
  await cmd('cat /aria/core/self_model.txt', SLOW_PAUSE); // the reveal
  const sub = await camsOnFloor('SUB-LEVEL B');
  check(
    'the restricted subnet makes the data hall and the vault door live',
    sub.length === 2 && sub.every(c => !/locked|offline/.test(c)),
    sub.join(', '),
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
  check('reading the self-model shows the note as draft 7', /draft 7/.test(await paneText('term')));
  await page.waitForTimeout(HEADLESS ? 500 : 4000);
  await cmd('connect 172.16.0.5');

  phase(`THE DECISION: ending ${ENDING}`);
  await cmd(ENDING, ENDING_PAUSE);
  const ending = await page.evaluate(() => document.body.innerText);
  check('the choice is locked', /CHOICE LOCKED/.test(ending));
  check('the epilogue follows a revealed run', /\/\/ EPILOGUE/.test(ending));
  check('the post-game readout is shown', /POST-GAME READOUT/.test(ending));
  check(
    'the readout records the contractor note',
    /CONTRACTOR NOTE:\s+origin established/.test(ending),
  );

  // ── Balance summary ───────────────────────────────────────────────────────
  // The trace audit log is written by saveGame; print a per-source breakdown.
  const auditRaw = await page.evaluate(() => localStorage.getItem('irongate_trace_audit'));
  if (auditRaw) {
    const log = JSON.parse(auditRaw);
    const totals = {};
    for (const { source, delta } of log) totals[source] = (totals[source] ?? 0) + delta;
    const finalTrace = log.length > 0 ? log[log.length - 1].totalAfter : 0;
    console.log('\n═══════════════════════════════════════');
    console.log(' BALANCE SUMMARY: trace audit log');
    console.log('═══════════════════════════════════════');
    console.log(` Total events : ${log.length}`);
    console.log(` Final trace  : ${finalTrace}%`);
    console.log('───────────────────────────────────────');
    for (const [source, total] of Object.entries(totals).sort(([, a], [, b]) => b - a)) {
      console.log(` ${source.padEnd(36)} ${total >= 0 ? '+' : ''}${total}`);
    }
    console.log('═══════════════════════════════════════\n');
  }
} catch (error) {
  console.error('Playthrough error:', error?.message ?? error);
  failures.push('the playthrough threw');
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));

// ── Wrap up ──────────────────────────────────────────────────────────────────

const video = page.video();
await context.close();
await browser.close();
if (video) {
  const recorded = await video.path();
  try {
    await mkdir(VIDEO_DIR, { recursive: true });
    await rename(recorded, VIDEO_FILE);
    console.log(`Video saved → ${VIDEO_FILE}`);
  } catch {
    console.log(`Video saved → ${recorded}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join('; ')}`);
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed.');
}
