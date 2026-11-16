// Teste automático: node test.js (usa uma cópia dos dados em HELIX_DATA, não mexe nos reais)
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-')); fs.cpSync(path.join(__dirname, 'data'), tmp, { recursive: true });
const port = 3199, B = 'http://localhost:' + port, B0 = B;
const pw = Object.fromEntries(fs.readFileSync(path.join(__dirname, 'data', 'CREDENCIAIS.txt'), 'utf8').trim().split('\n').map(l => l.split(' / ').map(s => s.trim().split(/\s/)[0])));
const IDS = { 'don.ramon': '738077868889997402', 'mei.ling': '601458945411776529' };
async function discord(who, did) { // fluxo completo: /auth/discord -> callback
  const a = await fetch(B + '/auth/discord', { redirect: 'manual' }), ost = a.headers.get('set-cookie').split(';')[0], st = new URL(a.headers.get('location')).searchParams.get('state');
  assert.ok(a.headers.get('location').startsWith('https://discord.com/oauth2/authorize'));
  const r = await fetch(B + '/auth/discord/callback?code=c_' + did + '&state=' + st, { redirect: 'manual', headers: { cookie: ost } });
  const sid = (r.headers.getSetCookie().find(c => c.startsWith('sid=')) || '').split(';')[0]; if (sid) cj[who] = sid; return { loc: r.headers.get('location'), ok: !!sid }; }
// Discord falso: o code "c_<id>" vira o usuário <id>
const fake = require('http').createServer((q, r) => { let b = ''; q.on('data', x => b += x); q.on('end', () => { r.setHeader('Content-Type', 'application/json');
  if (q.url.endsWith('/oauth2/token')) { const c = new URLSearchParams(b).get('code'); r.end(JSON.stringify(c.startsWith('c_') ? { access_token: 't_' + c.slice(2) } : {})); }
  else r.end(JSON.stringify({ id: q.headers.authorization.slice(9) })); }); }).listen(3198);
const srv = spawn('node', ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: port, HELIX_DATA: tmp, PUBLIC_URL: B0, DISCORD_API: 'http://localhost:3198', DISCORD_CLIENT_ID: 'x', DISCORD_CLIENT_SECRET: 'y' } });
const cj = {}; // um "navegador" por usuário
async function call(who, m, p, body, raw) {
  const r = await fetch(B + p, { method: m, headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(cj[who] ? { cookie: cj[who] } : {}) }, body: raw || (body ? JSON.stringify(body) : undefined) });
  const c = r.headers.get('set-cookie'); if (c) cj[who] = c.split(';')[0];
  const t = await r.arrayBuffer(); let j; try { j = JSON.parse(Buffer.from(t).toString()); } catch {} return { s: r.status, j, n: t.byteLength };
}
(async () => {
  await new Promise(r => setTimeout(r, 800));
  assert.equal((await call('x', 'GET', '/api/docs')).s, 401, 'sem login = 401');
  assert.equal((await call('x', 'POST', '/api/login', { username: 'mestre', password: 'errada' })).s, 401);
  assert.equal((await call('m', 'POST', '/api/login', { username: 'mestre', password: pw.mestre })).s, 200);
  assert.equal((await call('x', 'POST', '/api/login', { username: 'don.ramon', password: 'qualquer' })).s, 401, 'jogador não entra por senha');
  assert.ok((await discord('p', IDS['don.ramon'])).ok); assert.ok((await discord('q', IDS['mei.ling'])).ok);
  const bad = await discord('z', '1111'); assert.ok(!bad.ok && bad.loc.includes('erro='), 'ID desconhecido é recusado');
  const fakeState = await fetch(B + '/auth/discord/callback?code=c_' + IDS['don.ramon'] + '&state=zzz', { redirect: 'manual' });
  assert.ok(!fakeState.headers.getSetCookie().some(c => c.startsWith('sid=')), 'state inválido não loga');
  const st = (await call('m', 'GET', '/api/admin/state')).j, byT = t => st.docs.find(d => d.title.includes(t));
  const ak = byT('Akashic'), dos = byT('Dossiê'), man = byT('Manual');
  assert.equal((await call('p', 'GET', '/api/admin/state')).s, 403, 'jogador não entra no admin');
  assert.deepEqual((await call('p', 'GET', '/api/docs')).j, [], 'tudo oculto no início');
  for (const d of [ak, dos, man]) assert.equal((await call('p', 'GET', '/api/file/' + d.id)).s, 404, 'arquivo oculto = 404');
  assert.equal((await call('p', 'GET', '/api/file/' + dos.id)).s, 404);
  // libera um para todos, outro só para a Mei Ling
  await call('m', 'POST', '/api/admin/doc', { id: man.id, visibility: 'all' });
  const mei = st.users.find(u => u.username === 'mei.ling'); await call('m', 'POST', '/api/admin/doc', { id: ak.id, visibility: 'users', users: [mei.id] });
  assert.equal((await call('p', 'GET', '/api/file/' + man.id)).s, 200);
  assert.equal((await call('p', 'GET', '/api/file/' + ak.id)).s, 404, 'não liberado para este agente');
  assert.equal((await call('q', 'GET', '/api/file/' + ak.id)).s, 200);
  // doc do mestre nunca vaza, mesmo se alguém marcar visível por engano
  await call('m', 'POST', '/api/admin/doc', { id: dos.id, visibility: 'all' });
  assert.equal((await call('p', 'GET', '/api/file/' + dos.id)).s, 404, 'kind=master nunca é servido');
  const docs = (await call('p', 'GET', '/api/docs')).j; assert.equal(docs.length, 1);
  assert.ok(!JSON.stringify(docs).includes('Manual do') === false); assert.ok(!('orig' in docs[0]) && !('sha' in docs[0]));
  // download só se permitido
  assert.ok(!(await fetch(B + '/api/file/' + man.id + '?dl=1', { headers: { cookie: cj.p } })).headers.get('content-disposition'));
  // crachá: só o próprio
  const mb = (await call('p', 'GET', '/api/me')).j.user.badge.front;
  assert.equal((await call('p', 'GET', '/api/file/' + mb)).s, 200); assert.equal((await call('q', 'GET', '/api/file/' + mb)).s, 404);
  // ZIP: importar 2x (dedupe) e versão revisada vence
  const zip = fs.readFileSync(process.argv[2] || '/mnt/user-data/uploads/Documentos.zip');
  const r2 = (await call('m', 'POST', '/api/admin/import', null, zip)).j; assert.equal(r2.added.length, 0); assert.equal(r2.dup.length, 30);
  // guardar na pasta
  assert.equal((await call('p', 'POST', '/api/found', { id: man.id, on: true })).j.length, 1);
  assert.equal((await call('p', 'POST', '/api/found', { id: ak.id, on: true })).s, 404);
  console.log('OK: todos os testes passaram');
})().catch(e => { console.error('FALHOU:', e.message); process.exitCode = 1; }).finally(() => { srv.kill(); fake.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
