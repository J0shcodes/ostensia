#!/usr/bin/env node
/**
 * Countersign spike runner: runs the Postman collection with newman and writes a report.
 *
 * Usage:
 *   npm i newman            (in this folder, or have newman installed globally and set NODE_PATH)
 *   export MERCHANT_CLIENT_ID=... MERCHANT_CLIENT_SECRET=... BUYER_EMAIL=...
 *   node run-spike.js --phase auth
 *   node run-spike.js --phase vault-setup        # then approve approve_url in a browser as the sandbox buyer
 *   node run-spike.js --phase vault-finalize
 *   node run-spike.js --phase bind,void,disputes # comma list, or "all-after-approval"
 *
 * Options:
 *   --phase <list>     auth | vault-setup | vault-finalize | bind | void | disputes | resolver | webhooks | fallback
 *   --state <file>     env state carried between runs (default: state.json; created from the template env if missing)
 *   --out <dir>        report root (default: reports)
 *   --env-var k=v      extra environment overrides (repeatable)
 *   --request <id>     run ONE request by id prefix, e.g. --request 04.1 (state is kept; use to retry a step)
 *   --consent-url      print the one-time buyer consent link (Log in with PayPal) and exit
 *   --bail             stop at the first failed request
 *
 * Output (reports/<timestamp>/): report.md, report.html, report.json, junit.xml.
 * Secrets, tokens and the Authorization header are redacted in every output file.
 */
const fs = require('fs');
const path = require('path');

let newman;
try { newman = require('newman'); } catch (e) {
  try { newman = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'newman')); }
  catch (e2) { console.error('newman not found. Run: npm i newman   (or npm i -g newman)'); process.exit(2); }
}

const HERE = __dirname;
const COLLECTION = path.join(HERE, 'countersign-spike.postman_collection.json');
const TEMPLATE_ENV = path.join(HERE, 'countersign-spike.postman_environment.json');

const FOLDERS = {
  'auth': '00 Auth',
  'vault-setup': '01a Vault setup (before manual approval)',
  'vault-finalize': '01b Vault finalize (after manual approval)',
  'bind': '02 Bind intent to payment (vault > authorize > capture)',
  'void': '03 Cooling-off path (authorize > void)',
  'disputes': '04 Disputes harness (create > evidence > adjudicate)',
  'resolver': '05 Resolver write actions (optional, run on a FRESH dispute)',
  'webhooks': '06 Webhooks (optional)',
  'fallback': 'F Human-present fallback (no vault)',
};
const GROUPS = { 'all-after-approval': ['vault-finalize', 'bind', 'void', 'disputes'] };

// Spike checks -> the request names whose tests must all pass. Mirrors SPIKE_README.md.
const CHECKS = [
  ['1', 'Vault a PayPal account without a purchase', ['01a.1', '01b.1', '01b.2']],
  ['2', 'Authorize with vault_id, no buyer redirect', ['02.1', '02.2']],
  ['3', 'Mandate hash stored in custom_id and read back', ['02.3']],
  ['4', 'Capture an authorization', ['02.4']],
  ['5', 'Void an authorization (cooling-off path)', ['03.1', '03.2', '03.3', '03.4']],
  ['6', 'Add shipment tracking', ['02.5']],
  ['7', 'Create a dispute through the API as the buyer', ['04.1']],
  ['8', 'Provide evidence and settle in sandbox', ['04.4', '04.5', '04.6', '04.7']],
  ['9', 'Merchant actions: message / offer / accept', ['05.1', '05.2', '05.3']],
  ['10', 'Webhook simulation (optional)', ['06.1']],
];

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { phase: 'auth', state: 'state.json', out: 'reports', bail: false, envVars: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--phase') opt.phase = argv[++i];
  else if (a === '--state') opt.state = argv[++i];
  else if (a === '--out') opt.out = argv[++i];
  else if (a === '--env-var') opt.envVars.push(argv[++i]);
  else if (a === '--bail') opt.bail = true;
  else if (a === '--consent-url') opt.consentUrl = true;
  else if (a === '--request') opt.request = argv[++i];
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else { console.error('Unknown option ' + a); process.exit(2); }
}
const allNames = []; (function walk(items) { for (const i of items) { allNames.push(i.name); if (i.item) walk(i.item); } })(JSON.parse(fs.readFileSync(COLLECTION, 'utf8')).item);
if (opt.request) {
  const hit = allNames.filter((n) => n.startsWith(opt.request + ' ') || n === opt.request);
  if (hit.length !== 1) { console.error('--request "' + opt.request + '" matched ' + hit.length + ' items. Use an id like 04.1'); process.exit(2); }
  FOLDERS['request'] = hit[0]; opt.phase = 'request';
}
const phases = opt.phase.split(',').flatMap((p) => GROUPS[p.trim()] || [p.trim()]);
for (const p of phases) if (!FOLDERS[p]) { console.error('Unknown phase "' + p + '". Valid: ' + Object.keys(FOLDERS).concat(Object.keys(GROUPS)).join(', ')); process.exit(2); }

// ---------- environment ----------
const statePath = path.resolve(opt.state);
const envSource = fs.existsSync(statePath) ? statePath : TEMPLATE_ENV;
const environment = JSON.parse(fs.readFileSync(envSource, 'utf8'));
const setVar = (k, v) => {
  const e = environment.values.find((x) => x.key === k);
  if (e) { e.value = v; e.enabled = true; } else environment.values.push({ key: k, value: v, type: 'default', enabled: true });
};
const fromEnv = { MERCHANT_CLIENT_ID: 'merchant_client_id', MERCHANT_CLIENT_SECRET: 'merchant_client_secret',
  BUYER_CLIENT_ID: 'buyer_client_id', BUYER_CLIENT_SECRET: 'buyer_client_secret', BUYER_EMAIL: 'buyer_email', WEBHOOK_URL: 'webhook_url' };
for (const [ev, key] of Object.entries(fromEnv)) if (process.env[ev]) setVar(key, process.env[ev]);
for (const kv of opt.envVars) { const i = kv.indexOf('='); setVar(kv.slice(0, i), kv.slice(i + 1)); }
if (process.env.BASE_URL) setVar('base_url', process.env.BASE_URL);

const get = (k) => (environment.values.find((x) => x.key === k) || {}).value || '';
if (!get('merchant_client_id') || !get('merchant_client_secret')) {
  console.error('Missing credentials. Set MERCHANT_CLIENT_ID and MERCHANT_CLIENT_SECRET (and BUYER_EMAIL for disputes).'); process.exit(2);
}

if (opt.consentUrl) {
  const cid = get('buyer_client_id') && get('buyer_client_secret') ? get('buyer_client_id') : get('merchant_client_id');
  const u = 'https://www.sandbox.paypal.com/connect?flowEntry=static&client_id=' + encodeURIComponent(cid) +
    '&scope=' + encodeURIComponent('openid https://uri.paypal.com/services/disputes/create') +
    '&redirect_uri=' + encodeURIComponent(get('return_url'));
  console.log('\nOpen this link, sign in as the SANDBOX BUYER (' + (get('buyer_email') || get('vaulted_email') || 'your sandbox personal account') + ') and approve:\n\n' + u + '\n');
  console.log('Requirements: Log in with PayPal enabled on the app (Features > Log in with PayPal), and the Return URL below added in the app settings exactly as written:\n  ' + get('return_url'));
  console.log('The redirect page may show an error or 404; that is fine. What matters is that you approved the consent.\nThen run: node run-spike.js --request 04.1\n');
  process.exit(0);
}

// ---------- redaction ----------
const SECRET_KEYS = ['merchant_client_secret', 'buyer_client_secret', 'merchant_token', 'buyer_token', 'auth_assertion'];
const redact = (s) => {
  let t = String(s == null ? '' : s);
  for (const k of SECRET_KEYS) { const v = get(k); if (v && v.length > 6) t = t.split(v).join('***' + k + '***'); }
  return t.replace(/("access_token"\s*:\s*")[^"]+/g, '$1***').replace(/(Bearer |Basic )[A-Za-z0-9._\-=+/]+/g, '$1***');
};
const redactEnv = (env) => ({ ...env, values: env.values.map((v) => (SECRET_KEYS.includes(v.key) ? { ...v, value: v.value ? '***' : '' } : v)) });

// ---------- run phases sequentially ----------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(opt.out, stamp);
fs.mkdirSync(outDir, { recursive: true });
const results = []; // one entry per request execution
let lastEnv = environment;

function runPhase(phase) {
  return new Promise((resolve) => {
    console.log('\n=== phase: ' + phase + ' (' + FOLDERS[phase] + ') ===');
    newman.run({
      collection: COLLECTION,
      environment: lastEnv,
      folder: FOLDERS[phase],
      reporters: ['cli'],
      bail: opt.bail,
      timeoutRequest: 30000,
      delayRequest: 200,
    }, (err, summary) => {
      if (err) { console.error('newman error:', err.message); results.push({ phase, name: '(runner)', error: err.message, tests: [], code: null }); return resolve(false); }
      const seen = new Set();
      for (const a of summary.run.executions) {
        // newman can list one request twice when its pre-request script calls pm.sendRequest: keep one
        const key = a.item.id + '|' + (a.response ? a.response.code : '') + '|' + (a.response && a.response.headers && a.response.headers.members ? (a.response.headers.members.find((h) => h.key.toLowerCase() === 'paypal-debug-id') || {}).value : '');
        if (a.response && seen.has(key)) continue;
        seen.add(key);
        const name = a.item.name;
        const req = a.request || {};
        // pm.sendRequest token refreshes show up as extra executions under the parent item: skip them
        if (!name.startsWith('00.') && req.url && /\/v1\/oauth2\/token$/.test(req.url.toString().split('?')[0])) continue;
        const res = a.response || {};
        const tests = (a.assertions || []).map((x) => ({ name: x.assertion, ok: !x.error, error: x.error ? x.error.message : null }));
        let body = '';
        try { body = res.stream ? res.stream.toString() : ''; } catch (e) { /* ignore */ }
        results.push({
          phase, name,
          method: req.method, url: req.url ? req.url.toString() : '',
          code: res.code || null, status: res.status || null, ms: res.responseTime || null,
          tests, requestError: a.requestError ? a.requestError.message : null,
          bodyExcerpt: redact(body).slice(0, 1200),
          paypalDebugId: (res.headers && res.headers.members ? (res.headers.members.find((h) => h.key.toLowerCase() === 'paypal-debug-id') || {}).value : '') || '',
        });
      }
      lastEnv = summary.environment.toJSON ? summary.environment.toJSON() : lastEnv;
      lastEnv = { ...environment, values: (summary.environment.values ? summary.environment.values.members : []).map((m) => ({ key: m.key, value: m.value, type: m.type || 'default', enabled: !m.disabled })) };
      resolve(true);
    });
  });
}

(async () => {
  for (const p of phases) await runPhase(p);
  // Persist state (with real tokens; keep out of git) for the next phase
  // Client secrets are never persisted (they come from env vars each run); tokens are kept for the next phase.
  const persisted = { ...lastEnv, values: lastEnv.values.map((v) => (/_client_secret$/.test(v.key) ? { ...v, value: '' } : v)) };
  fs.writeFileSync(statePath, JSON.stringify(persisted, null, 2), { mode: 0o600 });
  writeReports();
  const failed = results.some((r) => r.error || r.requestError || r.tests.some((t) => !t.ok));
  process.exit(failed ? 1 : 0);
})();

// ---------- reporting ----------
function writeReports() {
  const envOut = {};
  for (const k of ['vault_id', 'order_id', 'authorization_id', 'capture_id', 'order_id_void', 'dispute_id', 'dispute_status', 'mandate_hash', 'approve_url'])
    envOut[k] = (lastEnv.values.find((v) => v.key === k) || {}).value || '';

  const byId = (id) => results.filter((r) => r.name.startsWith(id + ' '));
  const checkRows = CHECKS.map(([n, title, ids]) => {
    const rs = ids.flatMap(byId);
    let status = 'NOT RUN';
    if (rs.length) {
      const bad = rs.some((r) => r.error || r.requestError || r.tests.some((t) => !t.ok));
      status = bad ? 'FAIL' : (rs.length < ids.length ? 'PARTIAL' : 'PASS');
    }
    return { n, title, status, ids };
  });
  const decision = decide(checkRows);

  const total = results.reduce((a, r) => a + r.tests.length, 0);
  const failedTests = results.reduce((a, r) => a + r.tests.filter((t) => !t.ok).length, 0);
  const meta = {
    generatedAt: new Date().toISOString(), phases, baseUrl: get('base_url'),
    requests: results.length, assertions: total, failedAssertions: failedTests, ids: envOut, decision,
  };

  // JSON
  fs.writeFileSync(path.join(outDir, 'report.json'), redact(JSON.stringify({ meta, checks: checkRows, results }, null, 2)));
  fs.writeFileSync(path.join(outDir, 'environment.redacted.json'), JSON.stringify(redactEnv(lastEnv), null, 2));

  // Markdown
  const icon = { PASS: '✅', FAIL: '❌', PARTIAL: '🟡', 'NOT RUN': '⚪' };
  let md = `# Countersign spike report\n\n- Generated: ${meta.generatedAt}\n- Phases: ${phases.join(', ')}\n- Base URL: ${meta.baseUrl}\n- Requests: ${meta.requests} · Assertions: ${total} · Failed: ${failedTests}\n\n`;
  md += `## Decision signal\n\n**${decision.label}**: ${decision.reason}\n\n## Spike checks\n\n| # | Check | Result | Requests |\n|---|---|---|---|\n`;
  for (const c of checkRows) md += `| ${c.n} | ${c.title} | ${icon[c.status]} ${c.status} | ${c.ids.join(', ')} |\n`;
  md += `\n## IDs captured\n\n` + Object.entries(envOut).map(([k, v]) => `- \`${k}\`: ${v ? '`' + v + '`' : '(none)'}`).join('\n') + '\n\n## Request log\n\n';
  for (const r of results) {
    const bad = r.error || r.requestError || r.tests.some((t) => !t.ok);
    md += `### ${bad ? '❌' : '✅'} ${r.name}\n\n`;
    if (r.error || r.requestError) md += `Error: ${r.error || r.requestError}\n\n`;
    if (r.method) md += `\`${r.method} ${r.url}\` → **${r.code || '-'} ${r.status || ''}** (${r.ms || '-'} ms)${r.paypalDebugId ? ' · paypal-debug-id `' + r.paypalDebugId + '`' : ''}\n\n`;
    for (const t of r.tests) md += `- ${t.ok ? '✅' : '❌'} ${t.name}${t.error ? ' — ' + t.error : ''}\n`;
    if (bad && r.bodyExcerpt) md += `\n<details><summary>Response excerpt</summary>\n\n\`\`\`json\n${r.bodyExcerpt}\n\`\`\`\n</details>\n`;
    md += '\n';
  }
  fs.writeFileSync(path.join(outDir, 'report.md'), redact(md));

  // HTML
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const color = { PASS: '#1a7f37', FAIL: '#cf222e', PARTIAL: '#9a6700', 'NOT RUN': '#6e7781' };
  let html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Countersign spike report</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 16px;color:#1f2328}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #d0d7de;padding:6px 10px;text-align:left}th{background:#f6f8fa}
.b{display:inline-block;padding:1px 8px;border-radius:10px;color:#fff;font-size:12px}pre{background:#f6f8fa;padding:10px;overflow:auto}
code{background:#f6f8fa;padding:1px 4px;border-radius:4px}details{margin:6px 0}</style>
<h1>Countersign spike report</h1><p>${esc(meta.generatedAt)} · phases: ${esc(phases.join(', '))} · ${meta.requests} requests · ${total} assertions · <b>${failedTests} failed</b></p>
<h2>Decision signal: ${esc(decision.label)}</h2><p>${esc(decision.reason)}</p>
<h2>Spike checks</h2><table><tr><th>#</th><th>Check</th><th>Result</th><th>Requests</th></tr>`;
  for (const c of checkRows) html += `<tr><td>${c.n}</td><td>${esc(c.title)}</td><td><span class="b" style="background:${color[c.status]}">${c.status}</span></td><td>${esc(c.ids.join(', '))}</td></tr>`;
  html += `</table><h2>IDs captured</h2><ul>` + Object.entries(envOut).map(([k, v]) => `<li><code>${k}</code>: ${v ? esc(v) : '(none)'}</li>`).join('') + `</ul><h2>Request log</h2>`;
  for (const r of results) {
    const bad = r.error || r.requestError || r.tests.some((t) => !t.ok);
    html += `<details ${bad ? 'open' : ''}><summary>${bad ? '❌' : '✅'} <b>${esc(r.name)}</b> ${r.code ? '· ' + r.code : ''} ${r.ms ? '· ' + r.ms + ' ms' : ''}</summary>`;
    if (r.method) html += `<p><code>${esc(r.method)} ${esc(r.url)}</code>${r.paypalDebugId ? ' · debug id <code>' + esc(r.paypalDebugId) + '</code>' : ''}</p>`;
    if (r.error || r.requestError) html += `<p>Error: ${esc(r.error || r.requestError)}</p>`;
    html += '<ul>' + r.tests.map((t) => `<li>${t.ok ? '✅' : '❌'} ${esc(t.name)}${t.error ? ' — ' + esc(t.error) : ''}</li>`).join('') + '</ul>';
    if (bad && r.bodyExcerpt) html += `<pre>${esc(r.bodyExcerpt)}</pre>`;
    html += '</details>';
  }
  fs.writeFileSync(path.join(outDir, 'report.html'), redact(html));

  // JUnit
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n<testsuite name="countersign-spike" tests="${total}" failures="${failedTests}">\n`;
  for (const r of results) for (const t of r.tests)
    xml += `<testcase classname="${esc(r.phase)}" name="${esc(r.name + ': ' + t.name)}">${t.ok ? '' : `<failure message="${esc(t.error || 'failed')}"/>`}</testcase>\n`;
  xml += '</testsuite>\n</testsuites>\n';
  fs.writeFileSync(path.join(outDir, 'junit.xml'), redact(xml));

  fs.writeFileSync(path.join(path.resolve(opt.out), 'latest.txt'), outDir + '\n');
  console.log('\n──────── Spike summary ────────');
  for (const c of checkRows) console.log(`${c.status.padEnd(8)} #${c.n} ${c.title}`);
  console.log(`\nDecision signal: ${decision.label} — ${decision.reason}`);
  console.log('\nReport written to: ' + outDir + '\n  report.md  report.html  report.json  junit.xml');
}

function decide(rows) {
  const s = (n) => rows.find((r) => r.n === String(n)).status;
  const core = ['2', '3', '4', '5'].map(s);
  if (core.every((x) => x === 'NOT RUN')) return { label: 'INCOMPLETE', reason: 'Core checks (2 to 5) have not been run yet.' };
  if (s(1) === 'FAIL' || s(2) === 'FAIL') return { label: 'FALLBACK', reason: 'Vault or unattended authorize failed. Run the human-present fallback (phase "fallback") and decide per the kill-switch criteria.' };
  if (s(3) === 'FAIL') return { label: 'PIVOT', reason: 'custom_id did not round-trip: the mandate binding fails. Consider a backup project.' };
  if (core.every((x) => x === 'PASS')) {
    if (s(7) === 'PASS' && s(8) === 'PASS') return { label: 'GO', reason: 'Bind, capture, void and the dispute harness all passed in the sandbox.' };
    if (s(7) === 'FAIL') return { label: 'GO (UI dispute fallback)', reason: 'Core payment path passes; create the dispute via the Resolution Center and continue at 04.2.' };
    return { label: 'GO (pending disputes)', reason: 'Core payment path passes; the dispute harness has not run yet.' };
  }
  return { label: 'INCOMPLETE', reason: 'Some core checks have not been run yet or only partially.' };
}

// QrN2.wxG