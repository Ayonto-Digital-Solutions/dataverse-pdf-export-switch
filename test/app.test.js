const { chromium, open, row, saveAll, Counter, WRITE_PRIVILEGE, READ_PRIVILEGE } = require('./harness');

(async () => {
  const browser = await chromium.launch();
  const c = new Counter();
  let t;

  c.section('Loading');
  t = await open(browser, {});
  c.check('environment name from Dataverse', (await t.page.locator('#environment').innerText()).toLowerCase() === 'contoso dev');
  c.check('private tables hidden', !(await t.page.locator('#tbody').innerText()).includes('Private'));
  c.check('loading indicator gone', await t.page.locator('#loading').isHidden());
  c.check('save disabled without changes', await t.page.locator('#save').isDisabled());
  c.check('no page errors', t.log.errors.length === 0, t.log.errors.join(' | '));
  await t.context.close();

  c.section('Template filter is on by default');
  t = await open(browser, {});
  c.check('only tables with templates', (await t.page.locator('#tbody tr').count()) === 2);
  await t.page.locator('#filter-template').click();
  await t.page.waitForTimeout(150);
  c.check('all tables once switched off', (await t.page.locator('#tbody tr').count()) === 4);
  await t.context.close();

  c.section('Enabling a table keeps the others');
  t = await open(browser, {});
  await row(t.page, 'Order').locator('input[type=checkbox]').check();
  await t.page.waitForTimeout(150);
  c.check('row marked as changed', (await row(t.page, 'Order').getAttribute('class')).includes('changed'));
  await saveAll(t.page);
  const written = JSON.parse(t.log.writes[0]);
  c.check('existing entry preserved', written.sample_invoice === true);
  c.check('new entry written', written.sample_order === true);
  c.check('tips appear after saving', (await t.page.locator('#message').innerText()).includes('cached data'));
  await t.context.close();

  c.section('Disabling removes the key');
  t = await open(browser, {});
  await row(t.page, 'Invoice').locator('input[type=checkbox]').uncheck();
  await t.page.waitForTimeout(150);
  await saveAll(t.page);
  const after = JSON.parse(t.log.writes[0]);
  c.check('key removed, not set to false', !('sample_invoice' in after), JSON.stringify(after));
  await t.context.close();

  c.section('Enabled without a template');
  t = await open(browser, { settings: [{ pdfsettingid: 'p1', pdfsettingsjson: '{"sample_report":true}', '@odata.etag': 'W/"1"' }] });
  c.check('hidden by the active filter', !(await t.page.locator('#tbody').innerText()).includes('Report'));
  c.check('warning shown anyway', (await t.page.locator('#message').innerText()).includes('without a Word template'));
  await t.page.locator('#show-problems').click();
  await t.page.waitForTimeout(200);
  c.check('link reveals the problem rows', (await t.page.locator('#tbody').innerText()).includes('Report'));
  await t.context.close();

  c.section('Guards');
  t = await open(browser, { settings: [] });
  c.check('no record blocks saving', await t.page.locator('#save').isDisabled());
  c.check('reason is stated', (await t.page.locator('#message').innerText()).includes('No setting found'));
  await t.context.close();

  t = await open(browser, { settings: [{ pdfsettingid: 'a', pdfsettingsjson: '{}', '@odata.etag': 'W/"1"' }, { pdfsettingid: 'b', pdfsettingsjson: '{}', '@odata.etag': 'W/"1"' }] });
  c.check('two records block saving', await t.page.locator('#save').isDisabled());
  await t.context.close();

  t = await open(browser, { settings: [{ pdfsettingid: 'p1', pdfsettingsjson: '{broken', '@odata.etag': 'W/"1"' }] });
  c.check('damaged json blocks saving', await t.page.locator('#save').isDisabled());
  c.check('content shown for diagnosis', (await t.page.locator('#message').innerText()).includes('{broken'));
  await t.context.close();

  t = await open(browser, { patchStatus: 403 });
  await row(t.page, 'Order').locator('input[type=checkbox]').check();
  await t.page.waitForTimeout(120);
  await saveAll(t.page);
  const denied = await t.page.locator('#message').innerText();
  c.check('403 reported in plain words', denied.includes('Not saved'));
  c.check('names the required role', denied.includes('System Administrator'));
  c.check('change is kept for a retry', (await t.page.locator('#counter').innerText()).includes('changed'));
  await t.context.close();

  c.section('Privileges');
  t = await open(browser, { canWrite: false });
  c.check('toggles disabled', await t.page.locator('#tbody input[type=checkbox]').first().isDisabled());
  c.check('read-only stated', (await t.page.locator('#message').innerText()).includes('Read-only'));
  await t.page.locator('#who-can-change').click();
  await t.page.waitForTimeout(600);
  c.check('dialog says you cannot', (await t.page.locator('#dlgW-body').innerText()).includes('cannot change'));
  await t.context.close();

  t = await open(browser, {});
  await t.page.locator('#who-can-change').click();
  await t.page.waitForTimeout(600);
  const roles = await t.page.locator('#dlgW-body').innerText();
  const items = await t.page.locator('#dlgW-body li').allInnerTexts();
  c.check('roles listed', items.includes('PDF Admin') && items.includes('System Administrator'));
  c.check('duplicate role names collapsed', items.filter(x => x === 'System Administrator').length === 1,
    items.join(', '));
  c.check('count matches the list', roles.includes('2 security roles'));
  await t.context.close();

  c.section('Paging and orphans');
  t = await open(browser, { paginate: true, settings: [{ pdfsettingid: 'p1', pdfsettingsjson: '{"gone_table":true}', '@odata.etag': 'W/"1"' }] });
  await t.page.locator('#filter-template').click();
  await t.page.waitForTimeout(200);
  c.check('all pages read', (await t.page.locator('#tbody tr').count()) === 5, String(await t.page.locator('#tbody tr').count()));
  c.check('orphan flagged', (await t.page.locator('#tbody').innerText()).includes('no longer exists'));
  await t.context.close();

  c.section('Language');
  t = await open(browser, { locale: 'de-DE' });
  c.check('german for de-DE', (await t.page.locator('#save').innerText()) === 'Speichern');
  await t.context.close();
  t = await open(browser, { locale: 'fr-FR' });
  c.check('english as fallback', (await t.page.locator('#save').innerText()) === 'Save');
  await t.page.locator('.language button[data-l=de]').click();
  await t.page.waitForTimeout(200);
  c.check('switch works', (await t.page.locator('#save').innerText()) === 'Speichern');
  await t.page.reload();
  await t.page.waitForTimeout(500);
  c.check('choice survives reload', (await t.page.locator('#save').innerText()) === 'Speichern');
  await t.context.close();

  c.section('Theme');
  t = await open(browser, {});
  c.check('accent colour applied', (await t.page.evaluate(() =>
    getComputedStyle(document.querySelector('.header')).backgroundColor)) === 'rgb(43, 95, 143)');
  c.check('no theme warning', await t.page.locator('#theme-missing').count() === 0);
  await t.page.screenshot({ path: __dirname + '/../docs/screenshot.png' });
  await t.context.close();

  t = await open(browser, { theme: false });
  c.check('missing theme reported', (await t.page.locator('#theme-missing').innerText()).includes('theme.css'));
  c.check('nothing half-styled', (await t.page.locator('#tbl').count()) === 0);
  await t.context.close();

  c.section('Production marker');
  t = await open(browser, { environment: 'Contoso PROD' });
  c.check('production highlighted', (await t.page.evaluate(() =>
    getComputedStyle(document.getElementById('environment')).backgroundColor)) === 'rgb(224, 123, 0)');
  await t.context.close();
  t = await open(browser, { environment: null });
  c.check('falls back to host name', (await t.page.locator('#environment').innerText()).length > 0);
  await t.context.close();

  c.section('Word templates only');
  t = await open(browser, {});
  await t.page.locator('#filter-template').click();
  await t.page.waitForTimeout(200);
  const orderText = await row(t.page, 'Order').innerText();
  const reportText = await row(t.page, 'Report').innerText();
  c.check('excel template not counted', orderText.includes('1 template') && !orderText.includes('2 template'), orderText.replace(/\n/g, ' '));
  c.check('both word templates counted', (await row(t.page, 'Invoice').innerText()).includes('2 templates'));
  c.check('draft not counted as a template', reportText.includes('no template'), reportText.replace(/\n/g, ' '));
  c.check('draft still visible to the admin', reportText.includes('+1 draft'), reportText.replace(/\n/g, ' '));
  c.check('server asked for word templates only', t.log.requests.some(r => r.includes('documenttype')));
  await t.context.close();

  c.section('Concurrent changes');
  t = await open(browser, { conflictOnce: true, conflictJson: '{"sample_invoice":true,"sample_order":true}' });
  await row(t.page, 'Invoice').locator('input[type=checkbox]').uncheck();
  await t.page.waitForTimeout(150);
  await saveAll(t.page);
  const conflict = await t.page.locator('#message').innerText();
  c.check('conflict reported, not silently overwritten', conflict.includes('Somebody else changed'), conflict.replace(/\n/g, ' '));
  c.check('nothing written on conflict', t.log.writes.length === 0, JSON.stringify(t.log.writes));
  c.check('own selection kept for the retry', (await t.page.locator('#counter').innerText()).includes('changed'));
  await saveAll(t.page);
  const merged = JSON.parse(t.log.writes[t.log.writes.length - 1]);
  c.check('other admin change preserved', merged.sample_order === true, JSON.stringify(merged));
  c.check('own change applied', !('sample_invoice' in merged), JSON.stringify(merged));
  c.check('if-match carried a real etag', t.log.ifMatch.some(x => x && x !== '*'), String(t.log.ifMatch));
  await t.context.close();

  c.section('Stored setting must be an object');
  for (const [raw, what] of [['true', 'a bare boolean'], ['[]', 'an array'], ['"x"', 'a string'],
                             ['{"sample_invoice":"yes"}', 'non-boolean values']]) {
    t = await open(browser, { settings: [{ pdfsettingid: 'p1', pdfsettingsjson: raw, '@odata.etag': 'W/"1"' }] });
    c.check(what + ' blocks saving', await t.page.locator('#save').isDisabled(), raw);
    await t.context.close();
  }

  c.section('Clearing cached data');
  t = await open(browser, {});
  await t.page.evaluate(async () => {
    const box = await caches.open('msdyn-app-shell');
    await box.put('/x', new Response('x'));
    await new Promise(r => { const q = indexedDB.open('MSCRM-metadata', 1); q.onsuccess = () => { q.result.close(); r(); }; q.onerror = () => r(); });
    window.__held = await new Promise(r => { const q = indexedDB.open('held-open', 1); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
  });
  await t.page.locator('#cache').click();
  await t.page.waitForTimeout(400);
  const box = t.page.locator('#dlgC-body');
  c.check('cache entries pre-selected', await box.locator('#c-caches').isChecked());
  c.check('local databases not pre-selected', !(await box.locator('#c-idb').isChecked()));
  c.check('dialog says when to tick them', (await box.innerText()).includes('still shows the old state'));
  c.check('service workers not pre-selected', !(await box.locator('#c-sw').isChecked()));
  c.check('affected names shown', (await box.innerText()).includes('MSCRM-metadata'), (await box.innerText()).replace(/\n/g, ' ').slice(0, 160));
  await box.locator('#c-caches').uncheck();
  await t.page.waitForTimeout(100);
  c.check('nothing selected disables the button', await t.page.locator('#dlgC-ok').isDisabled());
  await box.locator('#c-caches').check();
  await box.locator('#c-idb').check();
  await t.page.waitForTimeout(100);
  await t.page.locator('#dlgC-ok').click();
  await t.page.waitForTimeout(4500);
  const cleared = await t.page.locator('#message').innerText();
  c.check('blocked database not counted as cleared', cleared.includes('Not confirmed') && cleared.includes('held-open'), cleared.replace(/\n/g, ' '));
  c.check('the rest really is gone', (await t.page.evaluate(async () => (await caches.keys()).length)) === 0);
  await t.context.close();

  c.section('Record version');
  t = await open(browser, { settings: [{ pdfsettingid: 'p1', pdfsettingsjson: '{"sample_invoice":true}' }] });
  c.check('missing etag is stated', (await t.page.locator('#message').innerText()).includes('version of the setting record is unknown'),
    (await t.page.locator('#message').innerText()).replace(/\n/g, ' ').slice(0, 90));
  await row(t.page, 'Order').locator('input[type=checkbox]').check();
  await t.page.waitForTimeout(150);
  c.check('missing etag blocks saving even with changes', await t.page.locator('#save').isDisabled());
  await t.context.close();

  c.section('Changes during a save');
  t = await open(browser, { patchDelay: 2500 });
  await row(t.page, 'Order').locator('input[type=checkbox]').check();
  await t.page.waitForTimeout(150);
  await t.page.locator('#save').click();
  await t.page.waitForTimeout(150);
  await t.page.locator('#dlg-ok').click();
  await t.page.waitForTimeout(400);
  c.check('toggles locked while saving', await t.page.locator('#tbody input[type=checkbox]').first().isDisabled());
  c.check('discard locked while saving', await t.page.locator('#discard').isDisabled());
  c.check('no second save while one runs', await t.page.locator('#save').isDisabled());
  await t.page.locator('#filter-template').click();
  await t.page.waitForTimeout(150);
  c.check('a redraw during the save keeps the lock',
    await t.page.locator('#tbody input[type=checkbox]').first().isDisabled());
  await t.page.locator('#search').fill('o');
  await t.page.waitForTimeout(150);
  c.check('searching during the save keeps the lock',
    await t.page.locator('#tbody input[type=checkbox]').first().isDisabled());
  await t.page.locator('#search').fill('');
  await t.page.waitForTimeout(100);
  await t.page.evaluate(() => {
    const cb = [...document.querySelectorAll('#tbody input[type=checkbox]')]
      .find(x => x.getAttribute('data-t') === 'sample_invoice');
    cb.disabled = false;
    cb.click();
  });
  await t.page.waitForTimeout(2000);
  const inFlight = JSON.parse(t.log.writes[0]);
  c.check('late change was not in the write', inFlight.sample_invoice === true, JSON.stringify(inFlight));
  const counter = await t.page.locator('#counter').innerText();
  c.check('late change survives the save', counter.includes('1 changed'), counter);
  c.check('it can be saved afterwards', !(await t.page.locator('#save').isDisabled()));
  c.check('toggles usable again', !(await t.page.locator('#tbody input[type=checkbox]').first().isDisabled()));
  await t.context.close();

  c.section('Unknown privilege');
  t = await open(browser, { userPrivilegesEmpty: true });
  c.check('not treated as read-only', !(await t.page.locator('#tbody input[type=checkbox]').first().isDisabled()));
  await t.page.locator('#who-can-change').click();
  await t.page.waitForTimeout(700);
  const unknown = await t.page.locator('#dlgW-body').innerText();
  c.check('dialog says unknown, not denied',
    unknown.includes('is unknown') && !unknown.includes('You cannot change it'), unknown.split('\n')[0]);
  await t.context.close();

  c.section('Privilege type as the API returns it');
  for (const as of ['string', 'number', 'missing']) {
    t = await open(browser, { privilegeTypeAs: as });
    c.check('writer may write (' + as + ')',
      !(await t.page.locator('#tbody input[type=checkbox]').first().isDisabled()));
    await t.page.locator('#who-can-change').click();
    await t.page.waitForTimeout(600);
    const lookups = t.log.requests.filter(r => r.includes('roleprivilegescollection'));
    c.check('roles looked up by the write privilege (' + as + ')',
      lookups.length === 1 && lookups[0].includes(WRITE_PRIVILEGE) && !lookups[0].includes(READ_PRIVILEGE),
      lookups.join(' | '));
    await t.context.close();

    t = await open(browser, { privilegeTypeAs: as, canWrite: false });
    c.check('read access alone stays read-only (' + as + ')',
      await t.page.locator('#tbody input[type=checkbox]').first().isDisabled());
    await t.context.close();
  }

  c.section('Source checks');
  {
    const fs = require('fs'), path = require('path');
    const SRC = path.join(__dirname, '..', 'src');
    const html = fs.readFileSync(path.join(SRC, 'exporttopdf.html'), 'utf8');
    const css = fs.readFileSync(path.join(SRC, 'exporttopdf.css'), 'utf8')
              + fs.readFileSync(path.join(SRC, 'theme.css'), 'utf8');
    const block = lang => {
      const i = html.indexOf('\n' + lang + ': {\n');
      if (i < 0) return '';
      const rest = html.slice(i + 1);
      const ends = ['\n},', '\n};'].map(m => rest.indexOf(m)).filter(k => k >= 0);
      return ends.length ? rest.slice(0, Math.min(...ends)) : '';
    };
    const values = lang => [...block(lang).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
    const LEAKED_EN = /\b(save|load|loading|empty|next|without|changed|enabled|custom|record|count|orphan|label|templates|show|render|parts|removed|draft)\b/i;
    const LEAKED_DE = /\b(speichern|laden|leer|neu|ohne|ge(ä|ae)ndert|vorlage|tabelle|einstellung|zwischenspeicher|entwurf)\b/i;
    c.check('german block found', values('de').length > 40, String(values('de').length));
    c.check('english block found', values('en').length > 40, String(values('en').length));
    c.check('language check reads the real texts',
      values('de').includes('Speichern') && values('en').includes('Save'));
    c.check('leak detector would fire',
      LEAKED_EN.test('Änderungen save?') && LEAKED_EN.test('Konnte nicht load.')
      && LEAKED_DE.test('Could not laden.'));
    const badDe = values('de').filter(v => LEAKED_EN.test(v));
    const badEn = values('en').filter(v => LEAKED_DE.test(v));
    c.check('german texts carry no english identifiers', badDe.length === 0, badDe.join(' | '));
    c.check('english texts carry no german identifiers', badEn.length === 0, badEn.join(' | '));

    const used = new Set();
    for (const m of html.matchAll(/class=(["'])([\s\S]*?)\1/g))
      for (const tok of m[2].split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(tok)) used.add(tok);
    for (const m of html.matchAll(/className\s*=\s*"([^"]*)"/g))
      for (const tok of m[1].split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(tok)) used.add(tok);
    const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
    const missing = [...used].filter(x => !x.endsWith('-') && !defined.has(x));
    c.check('every class used has a rule', missing.length === 0, missing.join(', '));

    const INLINE_STYLE = /\bstyle\s*=|setAttribute\(\s*["']style["']|\.style\.[a-zA-Z]|\.cssText\b/;
    const fbStart = html.indexOf('function themeMissingScreen(){');
    const fbEnd = fbStart < 0 ? -1 : html.indexOf('\n}\n', fbStart);
    c.check('theme fallback located and holds the allowed inline styles',
      fbStart >= 0 && fbEnd > fbStart && INLINE_STYLE.test(html.slice(fbStart, fbEnd)));
    c.check('inline-style detector would fire',
      INLINE_STYLE.test('h += "<p style=\\"margin-top:12px\\">";')
      && INLINE_STYLE.test('d.setAttribute("style", "margin:0");')
      && INLINE_STYLE.test('el.style.marginTop = "4px";'));
    const outside = fbStart < 0 ? html : html.slice(0, fbStart) + html.slice(fbEnd);
    const inline = outside.split('\n').filter(l => INLINE_STYLE.test(l)).map(l => l.trim());
    c.check('no inline style outside the theme fallback', inline.length === 0, inline.join(' | '));

    c.check('role query uses the documented entity set',
      html.includes('roleprivilegescollection?') && !html.includes('"roleprivileges?'));
    c.check('no lookup syntax on a plain guid column', !html.includes('_roleid_value'));
    c.check('cache pre-selection lives in one constant',
      /var CACHE_DEFAULTS = \{ caches:true, idb:false, sw:false \};/.test(html));
    c.check('no silent fallback to If-Match *', !/If-Match"\]\s*=\s*etag\s*\|\|/.test(html));
    c.check('no comments left in the page', !/<!--|^\s*\/\/|\/\*/m.test(html.replace(/https?:\/\//g, '')),
      (html.match(/<!--[\s\S]{0,40}/) || [''])[0]);
  }

  await browser.close();
  process.exit(c.report() ? 0 : 1);
})();
