const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const S = { user: null, cats: [], docs: [], found: [], view: 'home', q: '' };

async function api(path, method = 'GET', body, raw) {
  const r = await fetch(path, { method, headers: raw ? {} : { 'Content-Type': 'application/json' }, body: raw || (body ? JSON.stringify(body) : undefined), credentials: 'same-origin' });
  if (r.status === 401 && path !== '/api/login') { S.user = null; login(); throw new Error('sessão'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Erro');
  return j;
}

/* ---------- login ---------- */
function login(msg = '') {
  msg = msg || new URLSearchParams(location.search).get('erro') || '';
  if (location.search) history.replaceState(null, '', '/');
  app.innerHTML = `<div class="login">
  <section class="brand"><div><img src="logo.svg" alt=""><h1>HELIX DYNAMICS S.A.</h1><p>Centro Alvorada de Cuidados Paliativos e Pesquisa Clínica</p></div><small>Sistema Interno de Gestão</small></section>
  <section class="formwrap"><div class="form"><h2>Sistema Interno de Gestão</h2><p>Identifique-se para iniciar a sessão.</p>
   <a class="btn full dc" id="dc" href="/auth/discord"><svg width="20" height="15" viewBox="0 0 71 55" fill="currentColor" aria-hidden="true"><path d="M60 5A59 59 0 0 0 45.400.5l-.7 1.400a54 54 0 0 0-16.200 0L27.800.5A59 59 0 0 0 13.200 5C3.900 18.800 1.400 32.300 2.600 45.600A59 59 0 0 0 20.500 54.700l3.800-6.200a38 38 0 0 1-6-2.900l1.500-1.100a42 42 0 0 0 36.400 0l1.500 1.100a38 38 0 0 1-6 2.900l3.800 6.200A59 59 0 0 0 68.400 45.600C69.900 30 65.800 16.600 60 5ZM23.700 37.300c-3.600 0-6.500-3.300-6.500-7.300s2.900-7.300 6.500-7.300 6.600 3.300 6.500 7.300c0 4-2.900 7.300-6.500 7.300Zm23.600 0c-3.600 0-6.500-3.300-6.500-7.300s2.900-7.300 6.500-7.300 6.600 3.300 6.500 7.300c0 4-2.900 7.300-6.500 7.300Z"/></svg> Entrar com Discord</a>
   <div class="err" id="er" role="alert">${esc(msg)}</div>
   <p style="margin:26px 0 0;font-size:13px"><a href="#" id="mt">Acesso do mestre</a></p>
   <form id="lf" class="hid"><label for="u">Identificação</label><input id="u" type="text" autocomplete="username" autocapitalize="none" required>
   <label for="p">Senha</label><input id="p" type="password" autocomplete="current-password" required><button class="btn full">Entrar</button><div class="load" id="ld"><i></i></div></form></div></section></div>`;
  $('#mt').onclick = e => { e.preventDefault(); $('#lf').classList.toggle('hid'); };
  $('#dc').onclick = () => $('#er').textContent = '';
  $('#lf').onsubmit = async e => {
    e.preventDefault(); $('#ld').classList.add('on'); $('#er').textContent = '';
    try { S.user = await api('/api/login', 'POST', { username: $('#u').value, password: $('#p').value }); await boot(); }
    catch (x) { $('#ld').classList.remove('on'); $('#er').textContent = x.message; }
  };
}

async function boot() {
  const m = await api('/api/me'); S.user = m.user; S.cats = m.cats; S.found = m.found;
  S.docs = S.user.role === 'master' ? [] : await api('/api/docs');
  S.view = S.user.role === 'master' ? 'admin' : 'home'; shell();
}

/* ---------- shell ---------- */
const isM = () => S.user.role === 'master';
function shell() {
  const cnt = c => S.docs.filter(d => d.cat === c).length;
  const nav = isM() ? `<button data-v="admin" class="${S.view === 'admin' ? 'on' : ''}">Painel do mestre</button>` :
    `<button data-v="home" class="${S.view === 'home' ? 'on' : ''}">Visão geral</button>
     ${S.cats.map(c => `<button data-v="c:${esc(c)}" class="${S.view === 'c:' + c ? 'on' : ''}">${esc(c)}<b>${cnt(c) || ''}</b></button>`).join('')}
     <hr><button data-v="found" class="${S.view === 'found' ? 'on' : ''}">Minha pasta<b>${S.found.length || ''}</b></button>
     <button data-v="badge" class="${S.view === 'badge' ? 'on' : ''}">Meu crachá</button>`;
  app.innerHTML = `<div class="shell"><aside class="side" id="sd"><div class="lg"><img src="logo.svg" alt=""><span>HELIX DYNAMICS<small>Centro Alvorada</small></span></div>
   <nav class="nav">${nav}<hr><button id="out">Encerrar sessão</button></nav></aside>
   <main class="main"><div class="top"><button class="btn alt sm menu" id="mn" aria-label="Menu">☰</button><h2 id="ttl"></h2>
   ${isM() ? '' : '<input type="search" id="q" placeholder="Buscar documentos" aria-label="Buscar">'}<span class="who">${esc(S.user.name)}</span></div><div id="v"></div></main></div>`;
  $('#mn').onclick = () => $('#sd').classList.toggle('open');
  $('#sd').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'out') { api('/api/logout', 'POST').finally(() => { S.user = null; login(); }); return; } S.view = b.dataset.v; S.q = ''; shell(); };
  const q = $('#q'); if (q) { q.value = S.q; q.oninput = () => { S.q = q.value; if (S.q && S.view !== 'search') { S.view = 'search'; } render(); }; }
  render();
  if (q && S.view === 'search') { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

const thumbCard = (d, i) => `<button class="doc" data-id="${d.id}" style="animation-delay:${Math.min(i, 12) * 30}ms"><div class="th"><img loading="lazy" src="/api/file/${d.id}?t=1" alt=""></div>
  <div class="tt">${esc(d.title)}${d.level ? `<br><span class="tag">Acesso ${esc(d.level)}</span>` : ''}</div></button>`;
function docList(list, empty) {
  if (!list.length) return `<div class="empty">${empty}</div>`;
  return `<div class="grid" id="dl">${list.map(thumbCard).join('')}</div>`;
}
function bind(list) { const g = $('#dl'); if (g) g.onclick = e => { const b = e.target.closest('.doc'); if (b) openViewer(list, list.findIndex(d => d.id === b.dataset.id)); }; }

function render() {
  const v = $('#v'), t = $('#ttl'), ci = S.view.startsWith('c:') ? S.view.slice(2) : null;
  document.title = 'Helix Dynamics | Sistema Interno';
  if (S.view === 'admin') { t.textContent = 'Painel do mestre'; return adminView(v); }
  if (S.view === 'home') {
    t.textContent = 'Visão geral';
    v.innerHTML = `<div class="grid">${S.cats.map((c, i) => { const n = S.docs.filter(d => d.cat === c).length;
      return `<button class="cat ${n ? '' : 'z'}" data-c="${esc(c)}" style="animation-delay:${i * 35}ms"><i></i><h3>${esc(c)}</h3><span>${n ? n + (n > 1 ? ' documentos' : ' documento') : 'Sem arquivos disponíveis'}</span></button>`; }).join('')}</div>`;
    v.onclick = e => { const b = e.target.closest('.cat'); if (b) { S.view = 'c:' + b.dataset.c; shell(); } };
  } else if (ci) { t.textContent = ci; const l = S.docs.filter(d => d.cat === ci); v.onclick = null; v.innerHTML = docList(l, 'Nenhum arquivo disponível nesta área.'); bind(l);
  } else if (S.view === 'found') { t.textContent = 'Minha pasta'; const l = S.docs.filter(d => S.found.includes(d.id)); v.onclick = null; v.innerHTML = docList(l, 'Você ainda não guardou documentos. Use "Guardar" ao abrir um arquivo.'); bind(l);
  } else if (S.view === 'search') { t.textContent = 'Busca'; const q = S.q.trim().toLowerCase(); const l = q ? S.docs.filter(d => (d.title + ' ' + d.cat + ' ' + (d.level || '')).toLowerCase().includes(q)) : [];
    v.onclick = null; v.innerHTML = docList(l, q ? 'Nenhum resultado.' : 'Digite para buscar.'); bind(l);
  } else if (S.view === 'badge') { t.textContent = 'Meu crachá'; v.onclick = null; badgeView(v); }
}

function badgeView(v) {
  const u = S.user, b = u.badge || {}, f = u.fields || {};
  if (!b.front) { v.innerHTML = '<div class="empty">Seu crachá ainda não foi emitido.</div>'; return; }
  v.innerHTML = `<div class="badge panel"><img id="bi" src="/api/file/${b.front}" alt="Crachá de ${esc(u.name)}">
   <div><h3 style="margin:0">${esc(u.name)}</h3><dl>${Object.entries(f).map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x)}</dd>`).join('')}${u.level ? `<dt>Acesso</dt><dd>${esc(u.level)}</dd>` : ''}</dl></div></div>`;
  $('#bi').onclick = () => openViewer([{ id: b.front, title: 'Crachá de ' + u.name }], 0, true);
}

/* ---------- visualizador ---------- */
function openViewer(list, idx, noSave) {
  let i = idx, z = 1, x = 0, y = 0, nat = { w: 1, h: 1 }, fitMode = 'w';
  const el = document.createElement('div'); el.className = 'vw'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Documento');
  el.innerHTML = `<div class="vb"><span class="t"></span><button data-a="save" title="Guardar na minha pasta"></button><button data-a="dl" class="hid" title="Baixar">Baixar</button>
   <button data-a="out" title="Reduzir">−</button><button data-a="in" title="Ampliar">+</button><button data-a="fw" title="Ajustar à largura">↔</button><button data-a="fh" title="Ajustar à altura">↕</button><button data-a="fs" title="Tela cheia">⛶</button><button data-a="x" title="Fechar (Esc)">✕</button></div>
   <div class="vs" id="vs"><div class="spin">Carregando…</div><button class="nv l" data-a="p" aria-label="Anterior">‹</button><button class="nv r" data-a="n" aria-label="Próximo">›</button></div>`;
  document.body.appendChild(el); document.body.style.overflow = 'hidden';
  const vs = $('#vs', el); let img = null;
  const box = () => vs.getBoundingClientRect();
  const apply = () => { if (img) img.style.transform = `translate(${x}px,${y}px) scale(${z})`; };
  const fit = m => { fitMode = m; const b = box(); z = m === 'w' ? b.width / nat.w : Math.min(b.width / nat.w, b.height / nat.h); x = (b.width - nat.w * z) / 2; y = m === 'w' ? 0 : (b.height - nat.h * z) / 2; apply(); };
  const zoomAt = (f, cx, cy) => { const nz = Math.min(8, Math.max(.1, z * f)); x = cx - (cx - x) * nz / z; y = cy - (cy - y) * nz / z; z = nz; apply(); };
  function load() {
    const d = list[i]; $('.t', el).textContent = d.title;
    $('[data-a=save]', el).textContent = S.found.includes(d.id) ? '★ Guardado' : '☆ Guardar'; $('[data-a=save]', el).classList.toggle('hid', !!noSave);
    $('[data-a=dl]', el).classList.toggle('hid', !d.download);
    $('.nv.l', el).classList.toggle('hid', list.length < 2); $('.nv.r', el).classList.toggle('hid', list.length < 2);
    vs.querySelectorAll('img,iframe').forEach(n => n.remove()); img = null;
    if (d.pdf) { const f = document.createElement('iframe'); f.src = `/api/file/${d.id}`; vs.prepend(f); $('.spin', el).classList.add('hid'); return; }
    $('.spin', el).classList.remove('hid');
    const im = new Image(); im.alt = d.title; im.draggable = false;
    im.onload = () => { nat = { w: im.naturalWidth, h: im.naturalHeight }; img = im; vs.prepend(im); $('.spin', el).classList.add('hid'); fit(window.innerWidth < 700 ? 'w' : 'h'); };
    im.src = `/api/file/${d.id}`;
  }
  const close = () => { el.remove(); document.body.style.overflow = ''; removeEventListener('keydown', key); if (S.view === 'found' || S.view === 'home') render(); };
  const go = n => { i = (i + n + list.length) % list.length; load(); };
  function key(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === '+' || e.key === '=') zoomAt(1.25, box().width / 2, box().height / 2); else if (e.key === '-') zoomAt(.8, box().width / 2, box().height / 2); }
  addEventListener('keydown', key);
  el.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; const b = box(), d = list[i];
    if (a === 'x') close(); else if (a === 'p') go(-1); else if (a === 'n') go(1);
    else if (a === 'in') zoomAt(1.3, b.width / 2, b.height / 2); else if (a === 'out') zoomAt(.77, b.width / 2, b.height / 2);
    else if (a === 'fw') fit('w'); else if (a === 'fh') fit('h');
    else if (a === 'fs') (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.());
    else if (a === 'dl') location.href = `/api/file/${d.id}?dl=1`;
    else if (a === 'save') { S.found = await api('/api/found', 'POST', { id: d.id, on: !S.found.includes(d.id) }); load(); }
  });
  // arrastar, roda e pinça
  const ptr = new Map(); let pd = 0;
  vs.addEventListener('pointerdown', e => { if (e.target.closest('.nv')) return; vs.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); vs.classList.add('drag'); pd = 0; });
  vs.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p) return;
    if (ptr.size === 1) { x += e.clientX - p.x; y += e.clientY - p.y; }
    else if (ptr.size === 2) { const o = [...ptr.entries()].find(([k]) => k !== e.pointerId)[1], d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y), b = box();
      if (d0) zoomAt(d1 / d0, (e.clientX + o.x) / 2 - b.left, (e.clientY + o.y) / 2 - b.top); }
    p.x = e.clientX; p.y = e.clientY; apply();
  });
  const up = e => { ptr.delete(e.pointerId); if (!ptr.size) vs.classList.remove('drag'); };
  vs.addEventListener('pointerup', up); vs.addEventListener('pointercancel', up);
  vs.addEventListener('wheel', e => { e.preventDefault(); const b = box(); zoomAt(e.deltaY < 0 ? 1.15 : .87, e.clientX - b.left, e.clientY - b.top); }, { passive: false });
  vs.addEventListener('dblclick', () => fit(fitMode === 'w' ? 'h' : 'w'));
  addEventListener('resize', () => img && fit(fitMode));
  load();
}

/* ---------- mestre ---------- */
let A = null, tab = 'docs', filt = '';
async function adminView(v) {
  A = await api('/api/admin/state');
  v.onclick = null;
  v.innerHTML = `<div class="tabs">${[['docs', 'Documentos'], ['users', 'Agentes e acessos'], ['imp', 'Importar ZIP'], ['log', 'Registro de acessos']].map(([k, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div><div id="at"></div>`;
  v.querySelector('.tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; adminView(v); } };
  ({ docs: aDocs, users: aUsers, imp: aImp, log: aLog })[tab]($('#at'));
}
const post = (p, b) => api('/api/admin/' + p, 'POST', b);
const players = () => A.users.filter(u => u.role === 'player');
function aDocs(box) {
  const kinds = { doc: 'Documento', badge: 'Crachá', master: 'Mestre (fora do sistema Helix)' }, vis = { hidden: 'Oculto', all: 'Todos os agentes', users: 'Agentes selecionados' };
  const dupes = {}; A.docs.forEach(d => (dupes[d.sha] = (dupes[d.sha] || 0) + 1));
  const un = A.docs.filter(d => d.kind === 'doc' && !d.cat).length;
  box.innerHTML = `<div class="panel"><div class="row2"><div><label>Filtrar</label><input type="search" id="ft" value="${esc(filt)}" placeholder="título ou categoria"></div></div>
   <p style="color:var(--mut);margin:12px 0 0">${A.docs.length} arquivos. ${un ? un + ' sem classificação de categoria. ' : ''}Tudo começa oculto: os jogadores só veem o que você liberar. Alterações são salvas na hora.</p></div>
   <div class="tw"><table><thead><tr><th></th><th>Título de exibição</th><th>Nº</th><th>Tipo</th><th>Categoria</th><th>Visibilidade</th><th>Acesso</th><th>Baixar</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
  const tb = $('#tb', box), draw = () => {
    const f = filt.toLowerCase(), rows = A.docs.filter(d => !f || (d.title + d.cat + d.orig).toLowerCase().includes(f));
    tb.innerHTML = rows.map(d => `<tr data-id="${d.id}"><td><img loading="lazy" src="/api/file/${d.id}?t=1" data-o="1" alt=""></td>
     <td><input type="text" data-k="title" value="${esc(d.title)}">${d.superseded ? '<br><span class="pill">versão antiga (oculta)</span>' : ''}<div style="color:var(--mut);font-size:11px;margin-top:3px">${esc(d.orig)}</div></td>
     <td><input type="text" data-k="num" value="${esc(d.num)}" style="min-width:56px;width:64px"></td>
     <td><select data-k="kind">${Object.entries(kinds).map(([k, n]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
     <td><select data-k="cat"><option value="">Sem classificação</option>${A.cats.map(c => `<option ${d.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
     <td><select data-k="visibility" ${d.kind !== 'doc' ? 'disabled' : ''}>${Object.entries(vis).map(([k, n]) => `<option value="${k}" ${d.visibility === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
       ${d.visibility === 'users' ? `<div class="ck">${players().map(p => `<label><input type="checkbox" data-u="${p.id}" ${d.users.includes(p.id) ? 'checked' : ''}>${esc(p.name.split(' ')[0])}</label>`).join('')}</div>` : ''}</td>
     <td><select data-k="level"><option value="">—</option>${['Nível 1', 'Nível 2', 'B3'].map(n => `<option ${d.level === n ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
     <td><input type="checkbox" data-k="download" ${d.download ? 'checked' : ''}></td>
     <td>${d.superseded ? '<button class="btn sm alt" data-p="1">Usar esta versão</button>' : ''}</td></tr>`).join('');
  };
  draw();
  $('#ft', box).oninput = e => { filt = e.target.value; draw(); };
  tb.onclick = e => { const tr = e.target.closest('tr'); if (!tr) return;
    if (e.target.dataset.o) return openViewer(A.docs.filter(d => d.file).map(d => ({ id: d.id, title: d.title, pdf: d.file.endsWith('.pdf'), download: true })), A.docs.findIndex(d => d.id === tr.dataset.id), true);
    if (e.target.dataset.p) post('doc', { id: tr.dataset.id, primary: true }).then(() => adminView($('#v'))); };
  tb.onchange = async e => {
    const tr = e.target.closest('tr'), d = A.docs.find(x => x.id === tr.dataset.id), k = e.target.dataset.k;
    if (e.target.dataset.u) { const s = new Set(d.users); e.target.checked ? s.add(e.target.dataset.u) : s.delete(e.target.dataset.u); d.users = [...s]; await post('doc', { id: d.id, users: d.users }); return; }
    if (!k) return; d[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'kind' && d.kind !== 'doc') d.visibility = 'hidden';
    await post('doc', { id: d.id, [k]: d[k], ...(k === 'kind' && d.kind !== 'doc' ? { visibility: 'hidden' } : {}) }); if (k === 'visibility' || k === 'kind') draw();
  };
}
function aUsers(box) {
  const badges = A.docs.filter(d => d.kind === 'badge');
  box.innerHTML = `<div class="panel"><h3 style="margin-top:0">Novo agente</h3><div class="row2"><div><label>Nome de cobertura</label><input type="text" id="nn"></div><div><label>ID do Discord</label><input type="text" id="nd" inputmode="numeric"></div><button class="btn" id="nb">Criar</button></div><div class="err" id="ne"></div></div>
  <p style="color:var(--mut);font-size:13px">Os agentes entram só pelo Discord. O ID é o número da conta (no Discord: Configurações, Avançado, Modo desenvolvedor; depois clique com o botão direito no perfil e "Copiar ID").</p>
  ${players().map(p => `<div class="panel" data-id="${p.id}"><div class="row2"><div><strong>${esc(p.name)}</strong></div>
   <div><label>ID do Discord</label><input type="text" data-k="did" inputmode="numeric" value="${esc(p.discordId || '')}"></div>
   <div><label>Nível de acesso (rótulo)</label><select data-k="level"><option value="">—</option>${['Nível 1', 'Nível 2', 'B3'].map(n => `<option ${p.level === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
   <div><label>Crachá (imagem)</label><select data-k="badge"><option value="">Nenhum</option>${badges.map(b => `<option value="${b.id}" ${p.badge && p.badge.front === b.id ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></div>
   <button class="btn alt sm" data-a="del">Remover</button></div>
   <div style="margin-top:10px;color:var(--mut);font-size:13px">${Object.entries(p.fields || {}).map(([k, x]) => `${esc(k)}: <b>${esc(x)}</b>`).join(' · ')}</div></div>`).join('')}`;
  $('#nb', box).onclick = async () => { try { const n = $('#nn', box).value.trim(); await post('user', { username: n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '.'), name: n, discordId: $('#nd', box).value }); adminView($('#v')); } catch (e) { $('#ne', box).textContent = e.message; } };
  box.onchange = async e => { const p = e.target.closest('[data-id]'); if (!p) return; const k = e.target.dataset.k, id = p.dataset.id, u = A.users.find(x => x.id === id);
    try { if (k === 'level') await post('user', { id, username: u.username, level: e.target.value });
      if (k === 'did') await post('user', { id, username: u.username, discordId: e.target.value });
      if (k === 'badge') await post('user', { id, username: u.username, badge: { front: e.target.value || null, back: e.target.value || null } }); } catch (x) { alert(x.message); } };
  box.onclick = async e => { const a = e.target.dataset.a, p = e.target.closest('[data-id]'); if (a !== 'del' || !p) return; const u = A.users.find(x => x.id === p.dataset.id);
    if (confirm('Remover ' + u.name + '?')) { await api('/api/admin/user', 'DELETE', { id: u.id }); adminView($('#v')); } };
}
function aImp(box) {
  box.innerHTML = `<div class="panel"><h3 style="margin-top:0">Importar ZIP</h3><p style="color:var(--mut)">Aceita PNG, JPG, WEBP e PDF. Nomes originais são preservados, repetidos (mesmo conteúdo) são ignorados e, se um arquivo tiver marca de versão revisada (v2, corrigido, revisado), ele vira a versão principal e a antiga fica oculta. Tudo entra oculto para os jogadores.</p>
   <input type="file" id="zf" accept=".zip"> <button class="btn" id="zb">Importar</button><div class="load" id="ld"><i></i></div><pre class="rep hid" id="rp"></pre></div>`;
  $('#zb', box).onclick = async () => { const f = $('#zf', box).files[0]; if (!f) return; $('#ld', box).classList.add('on');
    try { const r = await api('/api/admin/import', 'POST', null, f); $('#rp', box).classList.remove('hid');
      $('#rp', box).textContent = `Adicionados: ${r.added.length}\n${r.added.join('\n')}\n\nRepetidos (ignorados): ${r.dup.length}\n${r.dup.join('\n')}\n\nVersões antigas ocultadas: ${r.superseded.length}\n${r.superseded.join('\n')}\n\nIgnorados (tipo não aceito): ${r.skipped.length}\n${r.skipped.join('\n')}`;
    } catch (e) { alert(e.message); } $('#ld', box).classList.remove('on'); };
}
function aLog(box) {
  box.innerHTML = `<div class="tw"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Documento</th></tr></thead><tbody>${A.log.map(l => `<tr><td>${new Date(l.t).toLocaleString('pt-BR')}</td><td>${esc(l.u)}</td><td>${esc(l.a)}</td><td>${esc(l.d)}</td></tr>`).join('') || '<tr><td colspan=4>Sem registros.</td></tr>'}</tbody></table></div>`;
}

/* ---------- início ---------- */
api('/api/me').then(boot).catch(() => login());
