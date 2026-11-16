// Sistema interno Helix Dynamics (jogo). Sem dependências: só Node 18+.
// Uso: node server.js   (porta 3000 ou PORT). Dados em ./data (faça backup dessa pasta).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = __dirname, DATA = process.env.HELIX_DATA || path.join(ROOT, 'data'), FILES = path.join(DATA, 'files'), THUMBS = path.join(DATA, 'thumbs');
const DBF = path.join(DATA, 'db.json'), PUB = path.join(ROOT, 'public');
fs.mkdirSync(FILES, { recursive: true }); fs.mkdirSync(THUMBS, { recursive: true });

const CATS = ['Documentos internos', 'Enfermagem', 'Farmácia e suprimentos', 'Nutrição', 'Recursos Humanos',
  'Segurança Patrimonial', 'Manutenção', 'Tecnologia da Informação', 'Arquivo institucional'];
const EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let db = fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF, 'utf8')) : { users: [], docs: [], log: [], found: {}, sessions: {} };
const save = () => { fs.writeFileSync(DBF + '.tmp', JSON.stringify(db)); fs.renameSync(DBF + '.tmp', DBF); };
const id = (n = 8) => crypto.randomBytes(n).toString('hex');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const mkUser = (o) => { const salt = id(8); return { id: id(4), salt, hash: hash(o.password, salt), ...o, password: undefined }; };

// Conta do mestre: senha em ADMIN_PASSWORD ou gerada na primeira execução (gravada em CREDENCIAIS.txt).
if (!db.users.some(u => u.role === 'master')) {
  const pw = process.env.ADMIN_PASSWORD || id(5);
  db.users.push(mkUser({ username: 'mestre', name: 'Mestre', role: 'master', password: pw }));
  fs.writeFileSync(path.join(DATA, 'CREDENCIAIS.txt'), `mestre / ${pw}\n`); save();
}

// ---------- ZIP (leitor mínimo: métodos 0 e 8) ----------
// Nomes sem o bit UTF-8 vêm em CP850 (Windows em português).
const CP850 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';
function readZip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ZIP inválido');
  let n = buf.readUInt16LE(e + 10), p = buf.readUInt32LE(e + 16), out = [];
  while (n--) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP corrompido');
    const flags = buf.readUInt16LE(p + 8), meth = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const nb = buf.subarray(p + 46, p + 46 + nl), name = flags & 0x800 ? nb.toString('utf8') : [...nb].map(c => c < 128 ? String.fromCharCode(c) : CP850[c - 128]).join('');
    if (!name.endsWith('/') && csize !== 0xffffffff) {
      const lnl = buf.readUInt16LE(lo + 26), lxl = buf.readUInt16LE(lo + 28), s = lo + 30 + lnl + lxl;
      const raw = buf.subarray(s, s + csize);
      out.push({ name, data: () => meth === 0 ? raw : zlib.inflateRawSync(raw), enc: flags & 1 });
    }
    p += 46 + nl + xl + cl;
  }
  return out;
}

// ---------- Importação ----------
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const REV = /\b(v2|v3|versao ?2|versao ?3|corrigid[oa]|revisad[oa])\b/;
const baseName = f => norm(path.basename(f, path.extname(f))).replace(new RegExp(REV.source, 'g'), '').replace(/[\s_\-—]+/g, ' ').trim();
function suggest(name, dir) {
  const n = norm(name);
  if (/a\.?e\.?g\.?i\.?s/.test(n) && !/akashic/.test(n)) return { kind: 'master', cat: '' };
  if (/bilhete/.test(n)) return { kind: 'master', cat: '' };
  if (/cracha/.test(norm(dir)) || /cracha/.test(n)) return { kind: 'badge', cat: '' };
  const m = [[/prontuario|plantao|participantes|rotina da ala/, 'Enfermagem'], [/farmacia|estoque/, 'Farmácia e suprimentos'],
    [/cardapio|refeitorio/, 'Nutrição'], [/manual|termo|questionario|treinamento|escala/, 'Recursos Humanos'], [/manutencao/, 'Manutenção'],
    [/\bti\b|chamados/, 'Tecnologia da Informação'], [/mapa|recepcao/, 'Documentos internos'],
    [/akashic|etiqueta|ensaios|ouvidoria|correcao/, 'Arquivo institucional']].find(([r]) => r.test(n));
  return { kind: 'doc', cat: m ? m[1] : '' };
}
function thumb(src, dst) { // shortcut: sem Pillow não há miniatura, a prévia usa o original
  try { spawnSync('python3', ['-c', 'import sys;from PIL import Image;i=Image.open(sys.argv[1]).convert("RGB");i.thumbnail((520,520));i.save(sys.argv[2],"JPEG",quality=78)', src, dst], { timeout: 20000 }); } catch {}
}
function importZip(buf) {
  const rep = { added: [], dup: [], skipped: [], superseded: [] };
  for (const e of readZip(buf)) {
    const ext = path.extname(e.name).toLowerCase(), base = path.basename(e.name);
    if (e.name.startsWith('__MACOSX') || base.startsWith('.') || !EXT[ext] || e.enc) { rep.skipped.push(e.name); continue; }
    const data = e.data(), sha = crypto.createHash('sha256').update(data).digest('hex');
    const same = db.docs.find(d => d.sha === sha);
    if (same) { // repara nome ainda não editado pelo mestre (ex.: acentos mal lidos em importação anterior)
      if (same.orig !== e.name && same.title === path.basename(same.orig, path.extname(same.orig))) {
        const s2 = suggest(base, path.dirname(e.name)); Object.assign(same, { orig: e.name, title: path.basename(base, ext), kind: s2.kind, cat: s2.cat });
      }
      rep.dup.push(e.name); continue;
    }
    const did = id(5), fn = did + ext; fs.writeFileSync(path.join(FILES, fn), data);
    if (ext !== '.pdf') thumb(path.join(FILES, fn), path.join(THUMBS, did + '.jpg'));
    const s = suggest(base, path.dirname(e.name));
    const d = { id: did, file: fn, orig: e.name, sha, title: path.basename(base, ext), num: '', cat: s.cat, kind: s.kind,
      visibility: 'hidden', users: [], level: '', download: false, superseded: false, ts: Date.now() };
    // versão revisada vence: a antiga sai de cena (nunca é mostrada aos jogadores)
    const b = baseName(base), rev = REV.test(norm(base));
    for (const o of db.docs) if (baseName(o.orig) === b && o.id !== d.id) {
      const orev = REV.test(norm(o.orig));
      if (rev && !orev) { o.superseded = true; o.visibility = 'hidden'; rep.superseded.push(o.orig); }
      else if (!rev && orev) { d.superseded = true; rep.superseded.push(base); }
    }
    db.docs.push(d); rep.added.push(base);
  }
  save(); return rep;
}

// ---------- Auth ----------
const fails = {};
const cookie = req => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
const me = req => { const t = cookie(req).sid, s = t && db.sessions[t]; return s && Date.now() < s.exp ? db.users.find(u => u.id === s.uid) : null; };
const canSee = (u, d) => u.role === 'master' || (!d.superseded && d.kind === 'doc' && (d.visibility === 'all' || (d.visibility === 'users' && d.users.includes(u.id))));
const pub = d => ({ id: d.id, title: d.title, cat: d.cat, level: d.level, download: d.download, pdf: d.file.endsWith('.pdf') });
const userPub = u => ({ id: u.id, name: u.name, role: u.role, level: u.level, fields: u.fields, badge: u.badge, discordId: u.discordId });
const log = (u, act, d) => { db.log.push({ t: Date.now(), u: u.name, a: act, d: d ? d.title : '' }); if (db.log.length > 5000) db.log.splice(0, 1000); };

// ---------- HTTP ----------
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...headers }); res.end(body); };
const json = (res, code, o) => send(res, code, JSON.stringify(o), { 'Content-Type': 'application/json' });
const body = (req, max = 400e6) => new Promise((ok, no) => { const c = []; let n = 0; req.on('data', x => { n += x.length; if (n > max) { no(new Error('grande')); req.destroy(); } else c.push(x); }); req.on('end', () => ok(Buffer.concat(c))); });
const jbody = async req => { try { return JSON.parse((await body(req, 1e6)).toString() || '{}'); } catch { return {}; } };


const sessionCookie = (req, u) => { const sid = id(24); db.sessions[sid] = { uid: u.id, exp: Date.now() + 12 * 3600e3 }; log(u, 'login'); save();
  return `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`; };
const startSession = (req, res, u) => send(res, 200, JSON.stringify(userPub(u)), { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(req, u) });

// ---------- Login com Discord (único acesso dos jogadores) ----------
// Variáveis: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, PUBLIC_URL (endereço do site, sem barra no fim).
const DAPI = process.env.DISCORD_API || 'https://discord.com/api';
const redirectUri = () => (process.env.PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3000)) + '/auth/discord/callback';
const back = (res, msg, cookies = []) => { res.writeHead(302, { Location: '/?erro=' + encodeURIComponent(msg), 'Set-Cookie': cookies }); res.end(); };
async function discordAuth(req, res, url) {
  const cid = process.env.DISCORD_CLIENT_ID;
  if (url.pathname === '/auth/discord') {
    if (!cid || !process.env.DISCORD_CLIENT_SECRET) return back(res, 'Login com Discord ainda não configurado.');
    const st = id(16);
    res.writeHead(302, { 'Set-Cookie': `ost=${st}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      Location: `https://discord.com/oauth2/authorize?client_id=${cid}&response_type=code&scope=identify&prompt=none&redirect_uri=${encodeURIComponent(redirectUri())}&state=${st}` });
    return res.end();
  }
  const clear = 'ost=; Path=/; Max-Age=0', c = cookie(req);
  const code = url.searchParams.get('code'), st = url.searchParams.get('state');
  if (!code || !st || st !== c.ost) return back(res, 'Sessão de login inválida. Tente de novo.', [clear]);
  try {
    const t = await fetch(DAPI + '/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cid, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirectUri() }) });
    const tj = await t.json(); if (!tj.access_token) throw new Error('token');
    const me = await (await fetch(DAPI + '/users/@me', { headers: { Authorization: 'Bearer ' + tj.access_token } })).json();
    const u = db.users.find(x => x.role === 'player' && x.discordId && x.discordId === String(me.id));
    if (!u) return back(res, 'Esta conta do Discord não tem acesso ao sistema.', [clear]);
    res.writeHead(302, { Location: '/', 'Set-Cookie': [sessionCookie(req, u), clear] }); res.end();
  } catch { back(res, 'Não foi possível entrar pelo Discord.', [clear]); }
}

const routes = {
  async 'POST /api/login'(req, res) {
    const ip = req.socket.remoteAddress, f = fails[ip] || { n: 0, t: Date.now() };
    if (Date.now() - f.t > 600e3) { f.n = 0; f.t = Date.now(); }
    if (f.n >= 10) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const { username, password } = await jbody(req);
    const u = db.users.find(x => x.username === String(username || '').trim().toLowerCase());
    const ok = u && u.role === 'master' && crypto.timingSafeEqual(Buffer.from(hash(String(password || ''), u.salt)), Buffer.from(u.hash));
    if (!ok) { fails[ip] = { n: f.n + 1, t: f.t }; return json(res, 401, { error: 'Identificação ou senha inválida.' }); }
    startSession(req, res, u);
  },
  async 'POST /api/logout'(req, res, u) { delete db.sessions[cookie(req).sid]; save(); json(res, 200, {}); },
  async 'GET /api/me'(req, res, u) { json(res, 200, { user: userPub(u), cats: CATS, found: db.found[u.id] || [] }); },
  async 'GET /api/docs'(req, res, u) { json(res, 200, db.docs.filter(d => d.kind === 'doc' && canSee(u, d)).map(pub)); },
  async 'POST /api/found'(req, res, u) {
    const { id: did, on } = await jbody(req), d = db.docs.find(x => x.id === did);
    if (!d || !canSee(u, d)) return json(res, 404, {});
    const s = new Set(db.found[u.id] || []); on ? s.add(did) : s.delete(did); db.found[u.id] = [...s]; save(); json(res, 200, db.found[u.id]);
  },
  async 'GET /api/badge'(req, res, u) { json(res, 200, userPub(u)); },
};

// Rotas do mestre (/api/admin/*)
const admin = {
  async 'GET /api/admin/state'(req, res) { json(res, 200, { docs: db.docs, cats: CATS, log: db.log.slice(-300).reverse(),
    users: db.users.map(x => ({ ...userPub(x), username: x.username })) }); },
  async 'POST /api/admin/doc'(req, res, u) {
    const b = await jbody(req), d = db.docs.find(x => x.id === b.id); if (!d) return json(res, 404, {});
    for (const k of ['title', 'num', 'cat', 'kind', 'visibility', 'users', 'level', 'download', 'superseded'])
      if (k in b) d[k] = b[k];
    if (b.primary) { // escolher esta versão como definitiva
      d.superseded = false; for (const o of db.docs) if (o.id !== d.id && baseName(o.orig) === baseName(d.orig)) { o.superseded = true; o.visibility = 'hidden'; }
    }
    save(); json(res, 200, d);
  },
  async 'POST /api/admin/import'(req, res) {
    try { json(res, 200, importZip(await body(req))); } catch (e) { json(res, 400, { error: e.message }); }
  },
  async 'POST /api/admin/user'(req, res) {
    const b = await jbody(req), un = String(b.username || '').trim().toLowerCase();
    if (!un) return json(res, 400, { error: 'Identificação vazia' });
    let x = db.users.find(y => y.id === b.id);
    if (!x) { if (db.users.some(y => y.username === un)) return json(res, 400, { error: 'Já existe' });
      x = mkUser({ username: un, role: 'player', name: b.name || un, password: id(16) }); db.users.push(x); }
    if (b.discordId !== undefined) { const did = String(b.discordId).trim();
      if (did && db.users.some(y => y.id !== x.id && y.discordId === did)) return json(res, 400, { error: 'ID do Discord já usado' }); x.discordId = did; }
    for (const k of ['name', 'level', 'fields', 'badge']) if (k in b) x[k] = b[k];
    save(); json(res, 200, userPub(x));
  },
  async 'DELETE /api/admin/user'(req, res) {
    const b = await jbody(req); db.users = db.users.filter(x => x.id !== b.id || x.role === 'master'); save(); json(res, 200, {});
  },
};

function serveFile(req, res, u, url) {
  const m = url.pathname.match(/^\/api\/file\/([0-9a-f]+)$/); if (!m) return false;
  const d = db.docs.find(x => x.id === m[1]);
  const isBadge = d && d.kind === 'badge' && (u.role === 'master' || (u.badge && (u.badge.front === d.id || u.badge.back === d.id)));
  if (!d || !(canSee(u, d) || isBadge)) { json(res, 404, {}); return true; }
  const thumbOk = url.searchParams.has('t') && fs.existsSync(path.join(THUMBS, d.id + '.jpg'));
  const f = thumbOk ? path.join(THUMBS, d.id + '.jpg') : path.join(FILES, d.file);
  const dl = url.searchParams.has('dl') && (d.download || u.role === 'master');
  if (!thumbOk) log(u, dl ? 'download' : 'abriu', d);
  const h = { 'Content-Type': thumbOk ? 'image/jpeg' : EXT[path.extname(d.file)], 'Cache-Control': 'private, max-age=300' };
  if (dl) h['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(d.orig.split('/').pop())}`;
  res.writeHead(200, h); fs.createReadStream(f).pipe(res); return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), key = req.method + ' ' + url.pathname;
    if (req.method === 'GET' && url.pathname.startsWith('/auth/discord')) return discordAuth(req, res, url);
    if (url.pathname.startsWith('/api/')) {
      let u = null;
      if (key !== 'POST /api/login') { u = me(req); if (!u) return json(res, 401, { error: 'Sessão necessária' }); }
      if (url.pathname.startsWith('/api/admin/')) {
        if (u.role !== 'master') return json(res, 403, {});
        const h = admin[key]; return h ? h(req, res, u) : json(res, 404, {});
      }
      if (req.method === 'GET' && serveFile(req, res, u, url)) return;
      const h = routes[key]; if (!h) return json(res, 404, {});
      const extra = await h(req, res, u); return extra;
    }
    // estáticos (somente a pasta public)
    let p = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(PUB, 'index.html');
    send(res, 200, fs.readFileSync(p), { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  } catch (e) { console.error(e); if (!res.headersSent) json(res, 500, { error: 'Erro interno' }); }
});
if (require.main === module) server.listen(process.env.PORT || 3000, () => console.log('Helix: http://localhost:' + (process.env.PORT || 3000)));
module.exports = { importZip, db, mkUser, save, id };
