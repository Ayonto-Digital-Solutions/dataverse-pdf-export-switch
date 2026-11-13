const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC = path.join(__dirname, '..', 'src');
const FILES = {
  'exporttopdf.html': ['text/html', fs.readFileSync(path.join(SRC, 'exporttopdf.html'), 'utf8')],
  'exporttopdf.css': ['text/css', fs.readFileSync(path.join(SRC, 'exporttopdf.css'), 'utf8')],
  'theme.css': ['text/css', fs.readFileSync(path.join(SRC, 'theme.css'), 'utf8')]
};

const TABLES = [
  { LogicalName: 'sample_invoice', ObjectTypeCode: 10100, IsCustomEntity: true, IsPrivate: false,
    DisplayName: { UserLocalizedLabel: { Label: 'Invoice' } } },
  { LogicalName: 'sample_order', ObjectTypeCode: 10101, IsCustomEntity: true, IsPrivate: false,
    DisplayName: { UserLocalizedLabel: { Label: 'Order' } } },
  { LogicalName: 'sample_report', ObjectTypeCode: 10102, IsCustomEntity: true, IsPrivate: false,
    DisplayName: { UserLocalizedLabel: { Label: 'Report' } } },
  { LogicalName: 'account', ObjectTypeCode: 1, IsCustomEntity: false, IsPrivate: false,
    DisplayName: { UserLocalizedLabel: { Label: 'Account' } } },
  { LogicalName: 'internal_thing', ObjectTypeCode: 9999, IsCustomEntity: false, IsPrivate: true,
    DisplayName: { UserLocalizedLabel: { Label: 'Private' } } }
];

const TEMPLATES = [
  { name: 'Invoice full', associatedentitytypecode: 'sample_invoice', documenttype: 2, status: false },
  { name: 'Invoice short', associatedentitytypecode: 'sample_invoice', documenttype: 2, status: false },
  { name: 'Order sheet', associatedentitytypecode: 'sample_order', documenttype: 2, status: false },
  { name: 'Order numbers', associatedentitytypecode: 'sample_order', documenttype: 1, status: false },
  { name: 'Report draft', associatedentitytypecode: 'sample_report', documenttype: 2, status: true }
];

const WRITE_PRIVILEGE = '11111111-1111-1111-1111-111111111111';
const READ_PRIVILEGE = '22222222-2222-2222-2222-222222222222';

const PRIVILEGES = [
  ['prvCreatepdfsetting', '33333333-3333-3333-3333-333333333333', 'Create', 1],
  ['prvReadpdfsetting', READ_PRIVILEGE, 'Read', 2],
  ['prvWritepdfsetting', WRITE_PRIVILEGE, 'Write', 3],
  ['prvDeletepdfsetting', '44444444-4444-4444-4444-444444444444', 'Delete', 4],
  ['prvAppendpdfsetting', '55555555-5555-5555-5555-555555555555', 'Append', 7],
  ['prvAppendTopdfsetting', '66666666-6666-6666-6666-666666666666', 'AppendTo', 8]
];

function privileges(as) {
  return PRIVILEGES.map(([Name, PrivilegeId, label, value]) => {
    const p = { Name, PrivilegeId };
    if (as === 'string') p.PrivilegeType = label;
    if (as === 'number') p.PrivilegeType = value;
    return p;
  });
}

class Counter {
  constructor() { this.total = 0; this.failed = 0; }
  check(name, ok, info) {
    this.total++;
    if (!ok) this.failed++;
    console.log((ok ? '  pass  ' : '  FAIL  ') + name + (info ? '  -> ' + info : ''));
  }
  section(name) { console.log('\n' + name); }
  report() {
    console.log('\n' + (this.failed
      ? this.failed + ' of ' + this.total + ' checks FAILED'
      : 'all ' + this.total + ' checks passed'));
    return this.failed === 0;
  }
}

async function open(browser, options) {
  const o = Object.assign({
    host: 'contoso.crm4.dynamics.com',
    environment: 'Contoso DEV',
    locale: 'en-US',
    settings: [{ pdfsettingid: 'p1', pdfsettingsjson: '{"sample_invoice":true}', '@odata.etag': 'W/"1000"' }],
    templates: TEMPLATES,
    tables: TABLES,
    theme: true,
    canWrite: true,
    privilegeTypeAs: 'string',
    patchStatus: 204,
    rolesWithWrite: [{ roleid: 'r1' }, { roleid: 'r2' }, { roleid: 'r3' }],
    roleNames: { r1: 'System Administrator', r2: 'PDF Admin', r3: 'System Administrator' },
    paginate: false,
    conflictOnce: false,
    patchDelay: 0,
    userPrivilegesEmpty: false
  }, options || {});

  const log = { writes: [], errors: [], requests: [], ifMatch: [] };
  const context = await browser.newContext({ viewport: { width: 1250, height: 760 }, locale: o.locale });
  const page = await context.newPage();
  page.on('pageerror', e => log.errors.push(String(e)));

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const rel = decodeURIComponent(url.pathname.replace('/api/data/v9.2/', '') + url.search);
    if (url.pathname.startsWith('/api/data/')) log.requests.push(method + ' ' + rel);
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    const file = url.pathname.split('/').pop();
    if (FILES[file]) {
      if (file === 'theme.css' && !o.theme) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: FILES[file][0], body: FILES[file][1] });
    }
    if (!url.pathname.startsWith('/api/data/')) return route.fulfill({ status: 404, body: '' });

    if (rel.indexOf('RetrieveCurrentOrganization') >= 0)
      return json(200, { Detail: o.environment ? { FriendlyName: o.environment } : {} });
    if (rel.startsWith('WhoAmI')) return json(200, { UserId: 'u1' });
    if (rel.indexOf('RetrieveUserPrivileges') >= 0)
      return json(200, { RolePrivileges: o.userPrivilegesEmpty ? []
        : o.canWrite ? [{ PrivilegeId: READ_PRIVILEGE }, { PrivilegeId: WRITE_PRIVILEGE }]
        : [{ PrivilegeId: READ_PRIVILEGE }] });
    if (rel.indexOf('/Privileges') >= 0)
      return json(200, { value: privileges(o.privilegeTypeAs) });
    if (rel.startsWith('roleprivilegescollection?')) return json(200, { value: o.rolesWithWrite });
    if (rel.startsWith('roles?')) {
      const ids = (rel.match(/roleid eq (\w+)/g) || []).map(x => x.split(' ').pop());
      return json(200, { value: ids.map(i => ({ roleid: i, name: o.roleNames[i] })) });
    }
    if (method === 'GET' && rel.startsWith('pdfsettings?')) return json(200, { value: o.settings });
    if (method === 'GET' && rel.startsWith('documenttemplates?')) {
      const f = /documenttype eq (\d+)/.exec(rel);
      const v = f ? o.templates.filter(x => String(x.documenttype) === f[1]) : o.templates;
      return json(200, { value: v });
    }
    if (method === 'GET' && rel.startsWith('EntityDefinitions?')) {
      if (o.paginate && url.search.indexOf('page2') < 0) {
        return json(200, {
          value: o.tables.slice(0, 2),
          '@odata.nextLink': 'https://x/api/data/v9.2/EntityDefinitions?page2=1'
        });
      }
      return json(200, { value: o.paginate ? o.tables.slice(2) : o.tables });
    }
    if (method === 'PATCH' && rel.startsWith('pdfsettings(')) {
      if (o.patchDelay) await new Promise(r => setTimeout(r, o.patchDelay));
      const body = JSON.parse(route.request().postData()).pdfsettingsjson;
      const tag = route.request().headers()['if-match'];
      log.ifMatch.push(tag);
      if (o.conflictOnce) {
        o.conflictOnce = false;
        o.settings[0].pdfsettingsjson = o.conflictJson || o.settings[0].pdfsettingsjson;
        o.settings[0]['@odata.etag'] = 'W/"9999"';
        return json(412, { error: { message: "The version of the existing record doesn't match the RowVersion property provided." } });
      }
      if (tag && tag !== '*' && tag !== o.settings[0]['@odata.etag']) {
        return json(412, { error: { message: 'ETag mismatch' } });
      }
      log.writes.push(body);
      if (o.patchStatus !== 204) return json(o.patchStatus, { error: { message: 'Principal lacks prvWrite' } });
      o.settings[0].pdfsettingsjson = body;
      o.settings[0]['@odata.etag'] = 'W/"' + (1000 + log.writes.length) + '"';
      return route.fulfill({ status: 204, body: '' });
    }
    if (method === 'POST' && rel === 'pdfsettings') {
      const body = JSON.parse(route.request().postData()).pdfsettingsjson;
      log.writes.push('CREATE ' + body);
      if (o.patchStatus !== 204) return json(o.patchStatus, { error: { message: 'Create is not allowed' } });
      o.settings.push({ pdfsettingid: 'new', pdfsettingsjson: body });
      return route.fulfill({ status: 204, body: '' });
    }
    return json(404, { error: { message: 'unexpected ' + method + ' ' + rel } });
  });

  await page.goto('https://' + o.host + '/WebResources/exporttopdf.html');
  await page.waitForTimeout(500);
  return { page, context, options: o, log };
}

function row(page, label) {
  return page.locator('#tbody tr', { hasText: label });
}

async function saveAll(page) {
  await page.locator('#save').click();
  await page.waitForTimeout(150);
  await page.locator('#dlg-ok').click();
  await page.waitForTimeout(500);
}

module.exports = { chromium, open, row, saveAll, Counter, WRITE_PRIVILEGE, READ_PRIVILEGE };
