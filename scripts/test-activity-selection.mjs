// Activity selection regression; project data is intercepted.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, 'Set SCOTTY_TEST_URL to an isolated demo server');
const bead = id => ({id, title: `Activity ${id}`, status:'open', issue_type:'task', priority:2, labels:[], dependencies:[], created_at:'2026-09-01T00:00:00Z', updated_at:'2026-09-01T00:00:00Z'});
const beads = [bead('dup-a'), bead('other-b')];
const items = [
 {id:'dup-a-created', issueId:'dup-a', title:'Activity dup-a', actor:'reviewer', origin:'human', action:'created', at:'2026-09-03T00:00:00Z'},
 {id:'dup-a-closed', issueId:'dup-a', title:'Activity dup-a', actor:'reviewer', origin:'human', action:'closed', at:'2026-09-02T00:00:00Z'},
 {id:'other-b-created', issueId:'other-b', title:'Activity other-b', actor:'reviewer', origin:'human', action:'created', at:'2026-09-01T00:00:00Z'},
];
const browser = await chromium.launch();
let page;
const errors = [];
try {
 const context = await browser.newContext({viewport:{width:1500,height:1000}});
 page = await context.newPage(); page.setDefaultTimeout(8000);
 page.on('pageerror', e => errors.push(e.message));
 await page.route('**/api/p/demo/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if(path.endsWith('/beads/stream')) return route.abort();
  if(path.endsWith('/activity')) return route.fulfill({json:{items}});
  if(path.endsWith('/beads')) return route.fulfill({json:{beads,meta:{kind:'demo',humanActor:'reviewer',humanAllowlist:['reviewer'],pollIntervalMs:300000}}});
  return route.fulfill({json:beads.find(b => path.endsWith(`/beads/${b.id}`)) ?? {}});
 });
 const selected = () => page.locator('[aria-current="true"]');
 const closed = page.locator('[data-keyboard-bead-id="dup-a"]').filter({hasText:'closed'});
 const assertSelected = async (id, action) => {
  assert.equal(await selected().count(), 1, 'exactly one activity row must be highlighted');
  assert.equal(await selected().getAttribute('data-keyboard-bead-id'), id);
  assert.ok((await selected().innerText()).includes(action));
  assert.ok((await selected().getAttribute('class')).includes('ring-2 ring-inset ring-[var(--brand)]'));
 };
 await page.goto(`${base}/p/demo?view=activity`);
 await closed.click();
 await page.getByRole('dialog').getByRole('heading',{name:'Activity dup-a',exact:true}).waitFor();
 await assertSelected('dup-a', 'closed');
 const dialog = page.getByRole('dialog');
 await dialog.getByTitle('Close',{exact:true}).click();
 await dialog.waitFor({state:'detached'});
 await closed.focus();
 await page.keyboard.press('j');
 await page.waitForFunction(() => document.activeElement?.dataset.keyboardBeadId === 'other-b');
 await assertSelected('other-b', 'created');
 // Moving between duplicate rows must update selection even when the bead stays the same.
 await page.keyboard.press('k');
 await assertSelected('dup-a', 'closed');
 await page.keyboard.press('k');
 await assertSelected('dup-a', 'created');
 assert.deepEqual(errors, []);
 console.log('PASS: activity highlights only the clicked row and follows j/k across duplicate beads without page errors');
} catch(e) {
 console.error({errors,url:page?.url(),body:page ? (await page.locator('body').innerText()).slice(0,2500) : ''});
 throw e;
} finally {
 await browser.close();
}
