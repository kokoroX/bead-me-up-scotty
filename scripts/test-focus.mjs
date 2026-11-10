// Isolated demo server only; project data is intercepted and never written.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, 'Set SCOTTY_TEST_URL to an isolated app server');
const bead = (id, extra = {}) => ({ id, title: id, status: 'open', issue_type: 'task', priority: 1, labels: [], dependencies: [], created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...extra });
const dep = (type, target) => ({ type, depends_on_id: target });
const beads = [
  bead('upstream', { priority: 3 }),
  bead('waiting', { dependencies: [dep('waits-for', 'upstream')], labels: ['ctx:alpha'] }),
  bead('conditional', { dependencies: [dep('conditional-blocks', 'upstream')], labels: ['ctx:beta'] }),
  bead('manual', { status: 'blocked' }),
  bead('flight', { status: 'in_progress', labels: ['ctx:alpha'] }),
  bead('working', { metadata: { 'gc.routed_to': '', 'gc.execution_routed_to': 'rig/admin.polecat' }, priority: 1 }),
  bead('cv', { issue_type: 'convoy', metadata: { 'gc.synthetic': 'true' }, dependencies: [dep('tracks', 'working')], labels: ['ctx:internal'] }),
  bead('wf', { status: 'in_progress', metadata: { 'gc.kind': 'workflow', 'gc.input_convoy_id': 'cv' } }),
  bead('st', { status: 'in_progress', assignee: 'rig/admin.furiosa', metadata: { 'gc.step_id': 'mol-polecat-work.implement', 'gc.step_ref': 'mol-polecat-work.implement', 'gc.root_bead_id': 'wf', 'gc.claimed_at': '2026-09-01T00:00:00Z' } }),
  bead('st-old', { status: 'in_progress', assignee: 'old-agent', metadata: { 'gc.step_id': 'mol-polecat-work.old', 'gc.root_bead_id': 'wf', 'gc.claimed_at': '2026-08-01T00:00:00Z' } }),
  bead('working-nostep', { metadata: { 'gc.execution_routed_to': 'rig/backend.polecat' } }),
  bead('cv-stuck', { issue_type: 'convoy', metadata: { 'gc.synthetic': 'true' }, dependencies: [dep('tracks', 'working-stuck')] }),
  bead('wf-stuck', { status: 'in_progress', metadata: { 'gc.kind': 'workflow', 'gc.input_convoy_id': 'cv-stuck' } }),
  bead('st-stuck', { metadata: { 'gc.step_id': 'mol-polecat-work.implement', 'gc.root_bead_id': 'wf-stuck' } }),
  bead('working-stuck', { metadata: { 'gc.execution_routed_to': 'rig/backend.polecat' } }),
  bead('cv-live', { issue_type: 'convoy', metadata: { 'gc.synthetic': 'true' }, dependencies: [dep('tracks', 'working-live')] }),
  bead('wf-live', { status: 'in_progress', metadata: { 'gc.kind': 'workflow', 'gc.input_convoy_id': 'cv-live' } }),
  bead('st-live', { status: 'in_progress', metadata: { 'gc.step_id': 'mol-polecat-work.implement', 'gc.root_bead_id': 'wf-live' } }),
  bead('working-live', { metadata: { 'gc.execution_routed_to': 'rig/beta.polecat' } }),
  bead('cv-claimed', { issue_type: 'convoy', metadata: { 'gc.synthetic': 'true' }, dependencies: [dep('tracks', 'working-claimed')] }),
  bead('wf-claimed', { status: 'in_progress', metadata: { 'gc.kind': 'workflow', 'gc.input_convoy_id': 'cv-claimed' } }),
  bead('st-claimed', { metadata: { 'gc.step_id': 'mol-polecat-work.verify', 'gc.root_bead_id': 'wf-claimed', 'gc.claimed_at': '2026-09-01T00:00:00Z' } }),
  bead('working-claimed', { metadata: { 'gc.execution_routed_to': 'rig/gamma.polecat' } }),
  // Finished workflow: st-done is closed but still carries gc.claimed_at as
  // history, so the work bead must fall back to Queued.
  bead('cv-done', { issue_type: 'convoy', metadata: { 'gc.synthetic': 'true' }, dependencies: [dep('tracks', 'working-done')] }),
  bead('wf-done', { status: 'in_progress', metadata: { 'gc.kind': 'workflow', 'gc.input_convoy_id': 'cv-done' } }),
  bead('st-done', { status: 'closed', metadata: { 'gc.step_id': 'mol-polecat-work.implement', 'gc.root_bead_id': 'wf-done', 'gc.claimed_at': '2026-09-01T00:00:00Z' } }),
  bead('working-done', { metadata: { 'gc.execution_routed_to': 'rig/delta.polecat' } }),
  // Blocked work whose step is running: Blocked wins and the bead must not also
  // appear in Agent working.
  bead('cv-bk', { issue_type: 'convoy', metadata: { 'gc.synthetic': 'true' }, dependencies: [dep('tracks', 'working-blocked')] }),
  bead('wf-bk', { status: 'in_progress', metadata: { 'gc.kind': 'workflow', 'gc.input_convoy_id': 'cv-bk' } }),
  bead('st-bk', { status: 'in_progress', metadata: { 'gc.step_id': 'mol-polecat-work.implement', 'gc.root_bead_id': 'wf-bk' } }),
  bead('working-blocked', { status: 'blocked', metadata: { 'gc.execution_routed_to': 'rig/eps.polecat' } }),
  // Closed work whose step is running: closed is finished, so it is not agent
  // working, and it stays invisible while Recently finished is collapsed.
  bead('cv-cl', { issue_type: 'convoy', metadata: { 'gc.synthetic': 'true' }, dependencies: [dep('tracks', 'working-closed')] }),
  bead('wf-cl', { status: 'in_progress', metadata: { 'gc.kind': 'workflow', 'gc.input_convoy_id': 'cv-cl' } }),
  bead('st-cl', { status: 'in_progress', metadata: { 'gc.step_id': 'mol-polecat-work.implement', 'gc.root_bead_id': 'wf-cl' } }),
  bead('working-closed', { status: 'closed', metadata: { 'gc.execution_routed_to': 'rig/zeta.polecat' } }),
  bead('merging', { status: 'blocked', assignee: 'rig/admin.refinery', metadata: { 'gc.execution_routed_to': 'rig/admin.polecat' } }),
  // Handed from the polecat to the refinery for merging: open, dispatched, no
  // running step any more, but still live work.
  bead('refinery-merge', { priority: 2, assignee: 'rig/admin.refinery', metadata: { 'gc.routed_to': '', 'gc.execution_routed_to': 'rig/admin.polecat' } }),
  // Refinery-assigned but still held by a dependency: Blocked wins.
  bead('refinery-dep', { priority: 2, assignee: 'rig/admin.refinery', metadata: { 'gc.execution_routed_to': 'rig/admin.polecat' }, dependencies: [dep('waits-for', 'upstream')] }),
  bead('ready', { labels: ['ctx:beta'] }),
  bead('queued', { metadata: { 'gc.routed_to': 'playground/polecat' }, labels: ['ctx:alpha'] }),
  bead('queued-taken', { assignee: 'someone', metadata: { 'gc.routed_to': 'playground/polecat' } }),
  bead('queued-blocked', { metadata: { 'gc.routed_to': 'x' }, dependencies: [dep('waits-for', 'upstream')] }),
  bead('queued-epic', { issue_type: 'epic', metadata: { 'gc.routed_to': 'x' } }),
  bead('queued-blank', { metadata: { 'gc.routed_to': '   ' } }),
  bead('queued-later', { priority: 2, created_at: '2026-09-02T00:00:00Z', metadata: { 'gc.routed_to': ' x ' } }),
  bead('queued-first-b', { priority: 0, metadata: { 'gc.routed_to': 'x' } }),
  bead('queued-first-a', { priority: 0, metadata: { 'gc.routed_to': 'x' } }),
  bead('parent', { issue_type: 'epic', priority: 3 }),
  bead('child', { dependencies: [dep('parent-child', 'parent')] }),
  bead('done', { status: 'closed' }),
  bead('archived', { labels: ['archived'] }),
  bead('gate', { issue_type: 'gate', await_type: 'human', priority: 3, dependencies: [dep('waits-for', 'upstream')] }),
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  let lanePrefix = 'ctx:';
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/p/demo/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/beads/stream')) return route.abort();
    if (path.endsWith('/beads')) return route.fulfill({ json: { beads, meta: { kind: 'demo', humanActor: 'reviewer', humanAllowlist: ['reviewer'], pollIntervalMs: 1000, lanePrefix } } });
    return route.fulfill({ json: beads.find(b => path.endsWith(`/beads/${b.id}`)) ?? {} });
  });
  await page.goto(`${base}/p/demo`);
  await page.locator('article').first().waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('bmus.view.demo')), null);
  assert.equal(await page.getByRole('heading', { name: 'Focus', exact: true }).count(), 0, 'Board is first-visit default');
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('heading', { name: 'Focus', exact: true }).waitFor();
  const column = name => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const ids = async name => (await column(name).locator('article').allTextContents()).join(' ');
  for (const [name, agent] of [['Agent working', 'working'], ['Queued', 'queued']]) {
    assert.equal(await column(name).getAttribute('data-agent-column'), agent);
    assert.equal(await column(name).locator('h2 svg').count(), 1);
    const times = column(name).locator('article > div:last-child > span:first-child');
    assert.ok(await times.count() > 0);
    assert.deepEqual(await times.evaluateAll(els => els.map(el => getComputedStyle(el).whiteSpace)), Array(await times.count()).fill('nowrap'));
  }
  assert.equal(await column('In flight').getAttribute('data-agent-column'), null);
  assert.deepEqual(await column('Agent working').locator('article').evaluateAll(els => els.map(e => e.dataset.keyboardBeadId)), ['working', 'working-claimed', 'working-live', 'refinery-merge']);
  assert.match(await column('Agent working').getByRole('button', { name: 'working', exact: true }).innerText(), /rig\/admin\.furiosa · implement/);
  assert.equal(await column('Agent working').getByTitle('rig/admin.furiosa · implement').count(), 1);
  // Active steps without an assignee still count as working; meta falls back to the execution route.
  assert.match(await column('Agent working').getByRole('button', { name: 'working-live', exact: true }).innerText(), /rig\/beta\.polecat/);
  assert.match(await column('Agent working').getByRole('button', { name: 'working-claimed', exact: true }).innerText(), /rig\/gamma\.polecat/);
  // A refinery-assigned, dispatched, unblocked bead is merging: Agent working with a
  // `merge · <agent>` chip, and in no other column.
  const mergeCard = column('Agent working').getByRole('button', { name: 'refinery-merge', exact: true });
  const workingCard = column('Agent working').getByRole('button', { name: 'working', exact: true });
  assert.match(await mergeCard.innerText(), /merge · admin\.refinery/);
  assert.equal(await mergeCard.getByTitle('merge · rig/admin.refinery').count(), 1);
  // Merging cards carry their own tone: data-tone marks them and the card's left
  // border plus the chip swap to the merge palette. Colours are asserted exactly
  // (the test page is light-themed): a dropped or mis-scoped CSS variable renders
  // as black/none, which a mere "differs from working" check would let through.
  assert.equal(await mergeCard.getAttribute('data-tone'), 'merging');
  assert.equal(await workingCard.getAttribute('data-tone'), null);
  const computedStyle = (locator, prop) =>
    locator.evaluate((el, prop) => getComputedStyle(el)[prop], prop);
  const mergeChip = mergeCard.getByTitle('merge · rig/admin.refinery');
  const workingChip = workingCard.getByTitle('rig/admin.furiosa · implement');
  assert.equal(await computedStyle(mergeCard, 'borderLeftColor'), 'rgb(13, 148, 136)'); // --merge
  assert.equal(await computedStyle(mergeChip, 'color'), 'rgb(13, 148, 136)'); // --merge
  assert.equal(await computedStyle(mergeChip, 'backgroundColor'), 'rgb(204, 251, 241)'); // --merge-weak
  // Still distinct from a card running a step, which stays on the brand palette.
  assert.notEqual(
    await computedStyle(mergeCard, 'borderLeftColor'),
    await computedStyle(workingCard, 'borderLeftColor'),
  );
  assert.notEqual(await computedStyle(mergeChip, 'color'), await computedStyle(workingChip, 'color'));
  assert.equal(await column('Queued').getByRole('button', { name: 'refinery-merge', exact: true }).count(), 0);
  assert.equal(await column('Next up').getByRole('button', { name: 'refinery-merge', exact: true }).count(), 0);
  // A refinery-assigned bead held by a dependency stays Blocked and never works.
  assert.equal(await column('Blocked').getByRole('button', { name: 'refinery-dep', exact: true }).count(), 1);
  assert.equal(await column('Agent working').getByRole('button', { name: 'refinery-dep', exact: true }).count(), 0);
  assert.equal(await column('Next up').getByRole('button', { name: 'working', exact: true }).count(), 0);
  assert.equal(await column('Blocked').getByRole('button', { name: 'merging', exact: true }).count(), 1);
  assert.equal(await column('Agent working').getByRole('button', { name: 'merging', exact: true }).count(), 0);
  for (const id of ['cv', 'wf', 'st', 'st-old', 'cv-stuck', 'wf-stuck', 'st-stuck',
    'cv-live', 'wf-live', 'st-live', 'cv-claimed', 'wf-claimed', 'st-claimed',
    'cv-done', 'wf-done', 'st-done', 'cv-bk', 'wf-bk', 'st-bk', 'cv-cl', 'wf-cl', 'st-cl']) {
    assert.equal(await page.locator(`[data-focus-column] [data-keyboard-bead-id="${id}"]`).count(), 0);
  }
  assert.equal(await page.getByRole('button', { name: 'internal', exact: true }).count(), 0);
  assert.match(await page.locator('header').filter({ has: page.getByRole('heading', { name: 'Focus', exact: true }) }).innerText(), /4 agent working/);
  // Dispatched work whose workflow never had a step claimed stays queued, even though
  // the workflow bead itself is in_progress.
  assert.deepEqual(await column('Queued').locator('article').evaluateAll(els => els.map(e => e.dataset.keyboardBeadId)),
    ['queued-first-a', 'queued-first-b', 'queued', 'working-done', 'working-nostep', 'working-stuck', 'queued-later']);
  assert.match(await column('Queued').getByRole('button', { name: 'working-nostep', exact: true }).innerText(), /rig\/backend\.polecat/);
  assert.match(await column('Queued').getByRole('button', { name: 'working-stuck', exact: true }).innerText(), /rig\/backend\.polecat/);
  // A closed step keeps gc.claimed_at as history, so it must not keep the convoy
  // live: working-done goes back to Queued with its execution route chip.
  assert.equal(await column('Agent working').getByRole('button', { name: 'working-done', exact: true }).count(), 0);
  assert.match(await column('Queued').getByRole('button', { name: 'working-done', exact: true }).innerText(), /rig\/delta\.polecat/);
  // Blocked wins over a running step: listed under Blocked only.
  assert.equal(await column('Blocked').getByRole('button', { name: 'working-blocked', exact: true }).count(), 1);
  assert.equal(await column('Agent working').getByRole('button', { name: 'working-blocked', exact: true }).count(), 0);
  // Closed work with a running step is in no visible column while Recently
  // finished stays collapsed.
  assert.equal(await page.locator('[data-focus-column] [data-keyboard-bead-id="working-closed"]').count(), 0);
  assert.match(await column('Queued').getByRole('button', { name: 'queued', exact: true }).innerText(), /playground\/polecat/);
  assert.equal(await column('Queued').getByTitle('playground/polecat').count(), 1);
  assert.equal(await column('Next up').getByRole('button', { name: 'queued', exact: true }).count(), 0);
  assert.equal(await column('Next up').getByRole('button', { name: 'queued-taken', exact: true }).count(), 1);
  assert.equal(await column('Blocked').getByRole('button', { name: 'queued-blocked', exact: true }).count(), 1);
  // Blocked cards keep the Gas City route target chip even though the column has no agent.
  assert.equal(await column('Blocked').getAttribute('data-agent-column'), null);
  assert.equal(await column('Blocked').locator('h2 svg').count(), 0);
  assert.match(await column('Blocked').getByRole('button', { name: 'merging', exact: true }).innerText(), /rig\/admin\.polecat/);
  // Scope the chip checks to the merging card: refinery-dep carries the same route target.
  assert.equal(await column('Blocked').getByRole('button', { name: 'merging', exact: true }).getByTitle('rig/admin.polecat').count(), 1);
  // The route chip keeps its full width: blockers truncate first, so the chip must not shrink.
  assert.equal(await column('Blocked').getByRole('button', { name: 'merging', exact: true }).getByTitle('rig/admin.polecat').evaluate(el => getComputedStyle(el).flexShrink), '0');
  assert.match(await column('Blocked').getByRole('button', { name: 'queued-blocked', exact: true }).innerText(), /(^|\s)x(\s|$)/);
  // A blocked bead without routing metadata gets no chip at all.
  const manualTitles = await column('Blocked').getByRole('button', { name: 'manual', exact: true })
    .locator('span[title]').evaluateAll(els => els.map(el => el.getAttribute('title') || ''));
  assert.deepEqual(manualTitles.filter(t => t.includes('/')), []);
  assert.equal(await column('Blocked').getByRole('button', { name: 'manual', exact: true }).getByTitle(/rig\/|^x$/).count(), 0);
  assert.match(await page.locator('header').filter({ has: page.getByRole('heading', { name: 'Focus', exact: true }) }).innerText(), /7 queued/);
  assert.match(await ids('Blocked'), /waiting/);
  assert.match(await ids('Blocked'), /conditional/);
  assert.match(await ids('Blocked'), /manual/);
  assert.match(await ids('Blocked'), /gate/);
  assert.doesNotMatch(await ids('Next up'), /waiting|conditional|gate/);
  assert.match(await ids('Next up'), /child/);
  assert.match(await ids('Next up'), /ready/);
  assert.match(await ids('In flight'), /flight/);
  // Neither the archived nor the closed bead may show up in any column.
  assert.equal(await page.locator('[data-focus-column] [data-keyboard-bead-id="archived"], [data-focus-column] [data-keyboard-bead-id="done"]').count(), 0);
  await page.screenshot({ path: '/tmp/scotty-focus-final.png' });
  await page.getByRole('button', { name: 'alpha', exact: true }).click();
  assert.match(await ids('Blocked'), /waiting/);
  assert.doesNotMatch(await ids('Blocked'), /conditional|manual/);
  assert.equal(await column('Queued').getByRole('button', { name: 'queued', exact: true }).count(), 1);
  assert.equal(await column('Next up').locator('article').count(), 0);
  assert.equal(await column('Agent working').locator('article').count(), 0);
  await page.getByRole('button', { name: 'unlabeled', exact: true }).click();
  assert.equal(await column('Queued').getByRole('button', { name: 'queued', exact: true }).count(), 0);
  assert.match(await ids('Next up'), /child/);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const childCard = column('Next up').getByRole('button', { name: 'child', exact: true });
  await childCard.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').locator('select').first().isDisabled(), true);
  await page.getByTitle('Close', { exact: true }).click();
  await page.goto(`${base}/p/demo`); // An ordinary project link uses the default.
  await page.locator('article').first().waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Focus', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('button', { name: 'alpha', exact: true }).click();
  beads.forEach(b => { b.labels = []; });
  // Wait for the normal live polling refresh without remounting Focus.
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => b.textContent === 'alpha'));
  assert.match(await ids('Next up'), /child/);
  assert.match(await ids('Next up'), /ready/);
  lanePrefix = null;
  await page.reload();
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('heading', { name: 'Focus', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'alpha', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.reload();
  await page.locator('article').first().waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Focus', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: Board default, optional Focus, blocking columns, hierarchy, lane filters, archived exclusion, and read-only detail navigation');
} finally { await browser.close(); }
