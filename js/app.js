/* OrçaCalha — app principal (SPA sem dependências). */
(function () {
  'use strict';
  const C = window.Calc, S = window.Store, P = window.PDF;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const app = $('#app');

  /* ---------------- utilidades ---------------- */
  function h(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const cfg = () => S.get().config;
  const hoje = () => S.hojeISO();
  function addDias(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return S.hojeISO(d); }
  function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const DIAS_C = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function dataLonga(iso) {
    const d = new Date(iso + 'T12:00:00');
    return DIAS[d.getDay()].replace(/^./, (c) => c.toUpperCase()) + ', ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  }
  const dataBR = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '');
  const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const TIPOS = { visita: 'Visita técnica', orcamento: 'Enviar orçamento', instalacao: 'Instalação', manutencao: 'Manutenção' };
  const STATUS = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', recusado: 'Recusado' };

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function modal(html, bind) {
    const dlg = $('#modal'); $('#modalBody').innerHTML = html;
    if (!dlg.open) dlg.showModal();
    const close = () => dlg.close();
    $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', close));
    if (bind) bind(dlg, close);
    return close;
  }
  function confirmar(msg, okTxt, perigo) {
    return new Promise((res) => {
      modal(`<h2>Confirmar</h2><p>${h(msg)}</p><div class="btns"><button class="btn line" data-r="0">Cancelar</button><button class="btn ${perigo ? 'bad' : ''}" data-r="1">${h(okTxt || 'Confirmar')}</button></div>`,
        (dlg, close) => {
          $$('[data-r]', dlg).forEach((b) => b.addEventListener('click', () => { close(); res(b.dataset.r === '1'); }));
          dlg.addEventListener('cancel', () => res(false), { once: true });
        });
    });
  }

  function waLink(fone, texto) {
    const n = C.foneWhats(fone);
    const q = texto ? '?text=' + encodeURIComponent(texto) : '';
    return n ? 'https://wa.me/' + n + q : 'https://wa.me/' + q;
  }
  function mapsLink(c) {
    const end = [c.endereco, c.bairro, c.cidade || 'Indianópolis', 'MG'].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(end);
  }
  function gcalLink(cp) {
    const cli = S.find('clientes', cp.clienteId);
    const d = cp.data.replace(/-/g, '');
    const [hh, mm] = (cp.hora || '08:00').split(':');
    const ini = new Date(cp.data + 'T' + (cp.hora || '08:00') + ':00');
    const fim = new Date(ini.getTime() + (Number(cp.duracao) || 60) * 60000);
    const p2 = (n) => String(n).padStart(2, '0');
    const f = (x) => x.getFullYear() + p2(x.getMonth() + 1) + p2(x.getDate()) + 'T' + p2(x.getHours()) + p2(x.getMinutes()) + '00';
    const titulo = TIPOS[cp.tipo] + (cli ? ' — ' + cli.nome : '');
    const det = [cp.notas, cli && cli.telefone ? 'Tel.: ' + cli.telefone : ''].filter(Boolean).join('\n');
    const loc = cli ? [cli.endereco, cli.bairro, cli.cidade].filter(Boolean).join(', ') : '';
    void d; void hh; void mm;
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titulo) +
      '&dates=' + f(ini) + '/' + f(fim) + '&details=' + encodeURIComponent(det) + '&location=' + encodeURIComponent(loc);
  }

  function nomeCliente(id) { const c = S.find('clientes', id); return c ? c.nome : 'Sem cliente'; }

  function ultimoServico(clienteId) {
    const s = S.get();
    const datas = s.compromissos
      .filter((c) => c.clienteId === clienteId && c.status === 'concluido' && (c.tipo === 'instalacao' || c.tipo === 'manutencao'))
      .map((c) => c.data);
    s.orcamentos.filter((o) => o.clienteId === clienteId && o.status === 'aprovado').forEach((o) => datas.push((o.aprovadoEm || o.data || '').slice(0, 10)));
    const cli = S.find('clientes', clienteId);
    if (cli && cli.ultimoServicoManual) datas.push(cli.ultimoServicoManual);
    return datas.filter(Boolean).sort().pop() || null;
  }

  /* ---------------- roteador ---------------- */
  const routes = [];
  function route(pattern, title, nav, fn, back) { routes.push({ re: new RegExp('^' + pattern + '$'), title, nav, fn, back }); }

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/agenda';
    const [path, qs] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    return { path, query };
  }

  function render() {
    const { path, query } = parseHash();
    const r = routes.find((x) => x.re.test(path)) || routes[0];
    const m = path.match(r.re) || [];
    $('#tituloTela').textContent = r.title;
    $('#subTela').textContent = '';
    $('#btnVoltar').hidden = !r.back;
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === r.nav));
    app.innerHTML = '';
    window.scrollTo(0, 0);
    try { r.fn(m.slice(1), query); } catch (e) { console.error(e); app.innerHTML = `<div class="card alert warn">Erro ao abrir a tela: ${h(e.message)}</div>`; }
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function sub(t) { $('#subTela').textContent = t; }
  $('#btnVoltar').addEventListener('click', () => history.length > 1 ? history.back() : go('#/agenda'));
  window.addEventListener('hashchange', render);

  /* ================= AGENDA ================= */
  let diaSel = hoje();

  route('/agenda', 'Agenda', 'agenda', (_, q) => {
    if (q.data) diaSel = q.data;
    const s = S.get();
    const doDia = s.compromissos.filter((c) => c.data === diaSel).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    const pend = doDia.filter((c) => c.status !== 'concluido').length;
    sub(doDia.length ? `${doDia.length} compromisso(s) · ${pend} pendente(s)` : 'Nenhum compromisso no dia');

    const enviados = s.orcamentos.filter((o) => o.status === 'enviado');
    const rascunhos = s.orcamentos.filter((o) => o.status === 'rascunho');
    const ini = semanaInicio(hoje()), fimS = addDias(ini, 6);
    const instSemana = s.compromissos.filter((c) => c.tipo === 'instalacao' && c.data >= ini && c.data <= fimS && c.status !== 'concluido').length;
    const cobrar = enviados.filter((o) => o.enviadoEm && diasEntre(o.enviadoEm.slice(0, 10), hoje()) >= 3);

    const wIni = semanaInicio(diaSel);
    let week = '';
    for (let i = 0; i < 7; i++) {
      const d = addDias(wIni, i); const dd = new Date(d + 'T12:00:00');
      const tem = s.compromissos.some((c) => c.data === d && c.status !== 'concluido');
      week += `<button data-dia="${d}" class="${d === diaSel ? 'on' : ''} ${d === hoje() ? 'hoje' : ''}">${DIAS_C[dd.getDay()]}<b>${dd.getDate()}</b><i>${tem ? '•' : ''}</i></button>`;
    }

    const precisaBackup = (s.clientes.length || s.orcamentos.length) && (!s.config.ultimoBackup || diasEntre(s.config.ultimoBackup.slice(0, 10), hoje()) > 7);

    app.innerHTML = `
      ${precisaBackup ? `<div class="alert warn row"><span class="grow">Os dados ficam só neste celular. Faça um backup${s.config.ultimoBackup ? ' (último em ' + dataBR(s.config.ultimoBackup) + ')' : ''}.</span><a class="btn sm acc" href="#/config?sec=backup">Backup</a></div>` : ''}
      <div class="card grid2">
        <a href="#/orcamentos?f=enviado" style="text-decoration:none;color:inherit"><div class="lbl">Orçamentos aguardando</div><div class="big" style="color:var(--acc)">${enviados.length}</div>${rascunhos.length ? `<div class="sm muted">+ ${rascunhos.length} rascunho(s)</div>` : ''}</a>
        <div><div class="lbl">Instalações na semana</div><div class="big" style="color:var(--ok)">${instSemana}</div></div>
      </div>
      <div class="card stack">
        <div class="daybar"><button data-sem="-7" aria-label="Semana anterior">‹</button><div class="d">${h(dataLonga(diaSel))}</div><button data-sem="7" aria-label="Próxima semana">›</button></div>
        <div class="week">${week}</div>
        ${diaSel !== hoje() ? '<button class="btn sm ghost" data-hoje>Voltar para hoje</button>' : ''}
      </div>
      <div class="card">
        <h3>Compromissos</h3>
        ${doDia.length ? `<div class="list">${doDia.map(itemCompromisso).join('')}</div>` :
          `<div class="empty"><span class="ico">🗓️</span>Nada marcado para este dia.<br><a href="#/compromisso/novo?data=${diaSel}">Marcar compromisso</a></div>`}
      </div>
      ${pend ? `<div class="card alert warn"><b>Dia de chuva?</b><div class="sm" style="margin:3px 0 8px">Mova os ${pend} compromisso(s) pendente(s) deste dia de uma vez.</div><button class="btn acc block" data-chuva>Reagendar o dia</button></div>` : ''}
      ${cobrar.length ? `<div class="card"><h3>Cobrar retorno</h3><div class="list">${cobrar.map((o) => {
          const cli = S.find('clientes', o.clienteId) || {};
          const dias = diasEntre(o.enviadoEm.slice(0, 10), hoje());
          const msg = `Olá, ${primeiroNome(cli.nome)}! Tudo bem? Passando para saber se conseguiu ver o orçamento nº ${String(o.numero).padStart(4, '0')} que enviei. Fico à disposição para qualquer dúvida.`;
          return `<div class="li"><a class="grow" href="#/orcamento/${o.id}" style="text-decoration:none;color:inherit"><div class="t">${h(cli.nome || 'Cliente')}</div><div class="d">Orçamento ${String(o.numero).padStart(4, '0')} · enviado há ${dias} dias</div></a><a class="btn sm ok" target="_blank" rel="noopener" href="${waLink(cli.telefone, msg)}">WhatsApp</a></div>`;
        }).join('')}</div></div>` : ''}
      <a class="fab" href="#/compromisso/novo?data=${diaSel}" aria-label="Novo compromisso">+</a>`;

    $$('[data-dia]').forEach((b) => b.addEventListener('click', () => { diaSel = b.dataset.dia; render(); }));
    $$('[data-sem]').forEach((b) => b.addEventListener('click', () => { diaSel = addDias(diaSel, Number(b.dataset.sem)); render(); }));
    const bh = $('[data-hoje]'); if (bh) bh.addEventListener('click', () => { diaSel = hoje(); render(); });
    $$('[data-cp]').forEach((el) => el.addEventListener('click', () => abrirCompromisso(el.dataset.cp)));
    const bc = $('[data-chuva]'); if (bc) bc.addEventListener('click', () => reagendarDia(diaSel));
  });

  function semanaInicio(iso) { const d = new Date(iso + 'T12:00:00'); const wd = (d.getDay() + 6) % 7; return addDias(iso, -wd); }

  function itemCompromisso(c) {
    const cli = S.find('clientes', c.clienteId);
    const det = [cli && cli.nome, c.notas].filter(Boolean).join(' · ');
    return `<div class="li ${c.status === 'concluido' ? 'done' : ''}" data-cp="${c.id}" role="button" tabindex="0">
      <span class="hora">${h(c.hora || '--:--')}</span>
      <div class="grow"><div class="t">${h(TIPOS[c.tipo] || c.tipo)}</div><div class="d">${h(det || 'Sem detalhes')}</div></div>
      <span class="tag t-${c.tipo}">${c.status === 'concluido' ? '✓' : h((TIPOS[c.tipo] || '').split(' ')[0])}</span></div>`;
  }

  function abrirCompromisso(id) {
    const c = S.find('compromissos', id); if (!c) return;
    const cli = S.find('clientes', c.clienteId);
    const orc = c.orcamentoId && S.find('orcamentos', c.orcamentoId);
    modal(`<h2>${h(TIPOS[c.tipo])}</h2>
      <div class="kv"><span>Data</span><b>${h(dataLonga(c.data))}, ${h(c.hora || '')}</b>
      ${cli ? `<span>Cliente</span><b>${h(cli.nome)}</b>` : ''}
      ${cli && (cli.endereco || cli.bairro) ? `<span>Endereço</span><span>${h([cli.endereco, cli.bairro, cli.cidade].filter(Boolean).join(', '))}</span>` : ''}
      ${orc ? `<span>Orçamento</span><a href="#/orcamento/${orc.id}" data-close>nº ${String(orc.numero).padStart(4, '0')} · ${C.fmtMoeda(C.calcOrcamento(orc).total)}</a>` : ''}
      ${c.notas ? `<span>Notas</span><span>${h(c.notas)}</span>` : ''}</div>
      <hr class="sep" style="margin:12px 0">
      <div class="btns">
        <button class="btn ${c.status === 'concluido' ? 'line' : 'ok'}" data-a="status">${c.status === 'concluido' ? 'Reabrir' : '✓ Concluir'}</button>
        ${cli && cli.telefone ? `<a class="btn ghost" target="_blank" rel="noopener" href="${waLink(cli.telefone)}">WhatsApp</a>` : ''}
        ${cli ? `<a class="btn ghost" target="_blank" rel="noopener" href="${mapsLink(cli)}">Mapa</a>` : ''}
      </div>
      <div class="btns" style="margin-top:8px">
        ${c.tipo === 'visita' && cli ? `<a class="btn line" href="#/orcamento/novo?cliente=${cli.id}" data-close>Fazer orçamento</a>` : ''}
        <a class="btn line" target="_blank" rel="noopener" href="${gcalLink(c)}">Lembrete no Google Agenda</a>
      </div>
      <div class="btns" style="margin-top:8px">
        <a class="btn line" href="#/compromisso/${c.id}" data-close>Editar</a>
        <button class="btn line" data-a="del" style="color:var(--bad)">Excluir</button>
        <button class="btn ghost" data-close>Fechar</button>
      </div>`, (dlg, close) => {
      $('[data-a=status]', dlg).addEventListener('click', () => {
        c.status = c.status === 'concluido' ? 'pendente' : 'concluido';
        c.concluidoEm = c.status === 'concluido' ? new Date().toISOString() : null;
        S.upsert('compromissos', c); close(); render(); toast(c.status === 'concluido' ? 'Compromisso concluído' : 'Compromisso reaberto');
      });
      $('[data-a=del]', dlg).addEventListener('click', async () => {
        close();
        if (await confirmar('Excluir este compromisso?', 'Excluir', true)) { S.remove('compromissos', c.id); render(); toast('Compromisso excluído'); }
      });
    });
  }

  function reagendarDia(dia) {
    const pend = S.get().compromissos.filter((c) => c.data === dia && c.status !== 'concluido');
    const sug = addDias(dia, 1);
    modal(`<h2>Reagendar o dia</h2><p class="sm">${pend.length} compromisso(s) de ${h(dataLonga(dia))} serão movidos, mantendo os horários.</p>
      <label class="f">Nova data<input class="in" type="date" id="novaData" value="${sug}"></label>
      <label class="check"><input type="checkbox" id="avisar" checked> Abrir WhatsApp para avisar cada cliente</label>
      <div class="btns"><button class="btn line" data-close>Cancelar</button><button class="btn acc" id="ok">Mover</button></div>`, (dlg, close) => {
      $('#ok', dlg).addEventListener('click', () => {
        const nd = $('#novaData', dlg).value; if (!nd) return;
        pend.forEach((c) => { c.data = nd; c.reagendado = (c.reagendado || 0) + 1; S.upsert('compromissos', c); });
        const avisar = $('#avisar', dlg).checked;
        close(); diaSel = nd; render(); toast(pend.length + ' compromisso(s) movido(s)');
        if (avisar) avisarReagendamento(pend, nd);
      });
    });
  }

  function avisarReagendamento(lista, nd) {
    const comFone = lista.map((c) => ({ c, cli: S.find('clientes', c.clienteId) })).filter((x) => x.cli && x.cli.telefone);
    if (!comFone.length) return;
    modal(`<h2>Avisar clientes</h2><p class="sm">Toque para abrir a conversa de cada um:</p><div class="list">${comFone.map(({ c, cli }) => {
      const msg = `Olá, ${primeiroNome(cli.nome)}! Por causa da chuva, precisei remarcar ${TIPOS[c.tipo].toLowerCase()} para ${dataLonga(nd).toLowerCase()}${c.hora ? ', às ' + c.hora : ''}. Pode ser?`;
      return `<div class="li"><div class="grow"><div class="t">${h(cli.nome)}</div><div class="d">${h(TIPOS[c.tipo])} · ${h(c.hora || '')}</div></div><a class="btn sm ok" target="_blank" rel="noopener" href="${waLink(cli.telefone, msg)}">Avisar</a></div>`;
    }).join('')}</div><button class="btn ghost block" data-close style="margin-top:10px">Fechar</button>`);
  }

  /* ---------- formulário de compromisso ---------- */
  route('/compromisso/(novo|[\\w-]+)', 'Compromisso', 'agenda', ([id], q) => {
    const novo = id === 'novo';
    const c = novo ? { tipo: q.tipo || 'visita', data: q.data || diaSel, hora: '08:00', clienteId: q.cliente || '', orcamentoId: q.orcamento || '', status: 'pendente', duracao: 60, notas: '' } : Object.assign({}, S.find('compromissos', id));
    if (!c.tipo) { app.innerHTML = '<div class="empty">Compromisso não encontrado.</div>'; return; }
    $('#tituloTela').textContent = novo ? 'Novo compromisso' : 'Editar compromisso';
    app.innerHTML = `<div class="card stack">
      <label class="f">Tipo<div class="seg" id="tipo">${Object.keys(TIPOS).map((t) => `<button type="button" data-v="${t}" class="${c.tipo === t ? 'on' : ''}">${h(TIPOS[t].replace('Enviar ', ''))}</button>`).join('')}</div></label>
      <div class="grid2"><label class="f">Data<input class="in" type="date" id="data" value="${h(c.data)}"></label>
      <label class="f">Horário<input class="in" type="time" id="hora" value="${h(c.hora)}"></label></div>
      <label class="f">Cliente${selectCliente(c.clienteId)}</label>
      <button class="btn sm ghost" id="novoCli" type="button">+ Cadastrar cliente novo</button>
      <label class="f">Duração estimada<select class="in" id="duracao">${[30, 60, 120, 180, 240, 480].map((m) => `<option value="${m}" ${Number(c.duracao) === m ? 'selected' : ''}>${m < 60 ? m + ' min' : m / 60 + ' h'}</option>`).join('')}</select></label>
      <label class="f">Notas<textarea class="in" id="notas" placeholder="Ex.: 18 m de calha, levar escada grande">${h(c.notas)}</textarea></label>
      <button class="btn ok block" id="salvar">Salvar</button>
    </div>`;
    $$('#tipo button').forEach((b) => b.addEventListener('click', () => { c.tipo = b.dataset.v; $$('#tipo button').forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#novoCli').addEventListener('click', () => clienteRapido((cli) => { $('#cliente').innerHTML = opcoesCliente(cli.id); }));
    $('#salvar').addEventListener('click', () => {
      c.data = $('#data').value; c.hora = $('#hora').value; c.clienteId = $('#cliente').value;
      c.duracao = Number($('#duracao').value); c.notas = $('#notas').value.trim();
      if (!c.data) { toast('Informe a data'); return; }
      S.upsert('compromissos', c); diaSel = c.data; toast('Compromisso salvo'); go('#/agenda');
    });
  }, true);

  function opcoesCliente(sel) {
    const cs = S.get().clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return `<option value="">— selecione —</option>` + cs.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${h(c.nome)}${c.bairro ? ' · ' + h(c.bairro) : ''}</option>`).join('');
  }
  function selectCliente(sel) { return `<select class="in" id="cliente">${opcoesCliente(sel)}</select>`; }

  function clienteRapido(cb) {
    modal(`<h2>Cliente novo</h2><div class="stack">
      <label class="f">Nome<input class="in" id="qNome" autocomplete="off"></label>
      <label class="f">WhatsApp / telefone<input class="in" id="qFone" type="tel" inputmode="tel" placeholder="(34) 9 9999-9999"></label>
      <label class="f">Endereço<input class="in" id="qEnd"></label>
      <div class="grid2"><label class="f">Bairro<input class="in" id="qBairro"></label><label class="f">Cidade<input class="in" id="qCidade" value="Indianópolis"></label></div>
      <div class="btns"><button class="btn line" data-close>Cancelar</button><button class="btn ok" id="qOk">Salvar</button></div></div>`, (dlg, close) => {
      setTimeout(() => $('#qNome', dlg).focus(), 50);
      $('#qOk', dlg).addEventListener('click', () => {
        const nome = $('#qNome', dlg).value.trim(); if (!nome) { toast('Informe o nome'); return; }
        const cli = S.upsert('clientes', { nome, telefone: C.fmtFone($('#qFone', dlg).value), endereco: $('#qEnd', dlg).value.trim(), bairro: $('#qBairro', dlg).value.trim(), cidade: $('#qCidade', dlg).value.trim(), origem: '' });
        close(); toast('Cliente cadastrado'); cb(cli);
      });
    });
  }

  /* ================= ORÇAMENTOS ================= */
  route('/orcamentos', 'Orçamentos', 'orcamentos', (_, q) => {
    const f = q.f || 'todos';
    const busca = (q.b || '').toLowerCase();
    let lista = S.get().orcamentos.slice().sort((a, b) => (b.numero || 0) - (a.numero || 0));
    const cont = (st) => S.get().orcamentos.filter((o) => o.status === st).length;
    if (f !== 'todos') lista = lista.filter((o) => o.status === f);
    if (busca) lista = lista.filter((o) => nomeCliente(o.clienteId).toLowerCase().includes(busca) || String(o.numero).includes(busca));
    sub(S.get().orcamentos.length + ' orçamento(s)');
    app.innerHTML = `
      <div class="seg" id="filtro">${['todos', 'rascunho', 'enviado', 'aprovado', 'recusado'].map((s) => `<button data-f="${s}" class="${f === s ? 'on' : ''}">${s === 'todos' ? 'Todos' : STATUS[s]}${s !== 'todos' && cont(s) ? ' ' + cont(s) : ''}</button>`).join('')}</div>
      <input class="in" id="busca" placeholder="Buscar por cliente ou número" value="${h(q.b || '')}" type="search">
      <div class="card">${lista.length ? `<div class="list">${lista.map((o) => {
        const t = C.calcOrcamento(o).total;
        return `<a class="li" href="#/orcamento/${o.id}"><div class="grow"><div class="t">nº ${String(o.numero).padStart(4, '0')} · ${h(nomeCliente(o.clienteId))}</div><div class="d">${dataBR(o.data)} · ${(o.itens || []).length} item(ns)</div></div><div class="right"><b>${C.fmtMoeda(t)}</b><br><span class="tag s-${o.status}">${STATUS[o.status]}</span></div></a>`;
      }).join('')}</div>` : `<div class="empty"><span class="ico">🧮</span>Nenhum orçamento ${f !== 'todos' ? 'com este status' : 'ainda'}.<br><a href="#/orcamento/novo">Fazer o primeiro orçamento</a></div>`}</div>
      <a class="fab" href="#/orcamento/novo" aria-label="Novo orçamento">+</a>`;
    $$('#filtro button').forEach((b) => b.addEventListener('click', () => go('#/orcamentos?f=' + b.dataset.f)));
    let t; $('#busca').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { history.replaceState(null, '', '#/orcamentos?f=' + f + '&b=' + encodeURIComponent(e.target.value)); render(); setTimeout(() => { const i = $('#busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 0); }, 350); });
  });

  route('/orcamento/(novo|[\\w-]+)', 'Orçamento', 'orcamentos', ([id], q) => {
    let orc;
    if (id === 'novo') {
      const c = cfg();
      orc = { numero: null, data: hoje(), clienteId: q.cliente || '', local: '', status: 'rascunho', itens: [], desconto: '', descontoTipo: 'valor',
        validadeDias: c.validadeDias, condicoes: Object.assign({}, c.condicoes), observacoes: '' };
    } else {
      const o = S.find('orcamentos', id);
      if (!o) { app.innerHTML = '<div class="empty">Orçamento não encontrado.</div>'; return; }
      orc = JSON.parse(JSON.stringify(o));
    }
    editorOrcamento(orc);
  }, true);

  function salvarOrc(orc, silencioso) {
    if (!orc.numero) { orc.numero = cfg().proximoNumero || 1; cfg().proximoNumero = orc.numero + 1; }
    const salvo = S.upsert('orcamentos', orc);
    if (!silencioso) toast('Orçamento salvo');
    if (location.hash.includes('/orcamento/novo')) history.replaceState(null, '', '#/orcamento/' + salvo.id);
    $('#tituloTela').textContent = 'Orçamento nº ' + String(orc.numero).padStart(4, '0');
    return salvo;
  }

  function editorOrcamento(orc) {
    $('#tituloTela').textContent = orc.numero ? 'Orçamento nº ' + String(orc.numero).padStart(4, '0') : 'Novo orçamento';
    sub(orc.numero ? STATUS[orc.status] + ' · ' + dataBR(orc.data) : 'Ainda não salvo');
    let autosave;
    const agendarSalvar = () => { clearTimeout(autosave); autosave = setTimeout(() => { if (orc.clienteId || orc.itens.length) salvarOrc(orc, true); }, 900); };

    function itemHTML(it, i) {
      if (it.tipo === 'perfil') {
        return `<div class="item" data-i="${i}">
          <div class="item-h"><b>📐 Perfil ${i + 1}</b><button class="x" data-del="${i}" aria-label="Remover">×</button></div>
          <input class="in" data-k="nome" value="${h(it.nome)}" placeholder="Nome (ex.: Calha moldura)">
          <div class="grid2"><input class="in" data-k="material" list="materiais" value="${h(it.material)}" placeholder="Material">
          <input class="in" data-k="metros" inputmode="decimal" value="${h(it.metros)}" placeholder="Metros lineares"></div>
          <label class="f">Abas do perfil (cm), separadas por +<input class="in" data-k="abas" inputmode="decimal" value="${h(it.abas)}" placeholder="3 + 2 + 12 + 15 + 10 + 3"></label>
          <div data-svg>${svgChapa(it.abas)}</div>
          <div class="seg" data-modo>${[['m2', 'Preço por m² de chapa'], ['ml', 'Preço por metro linear']].map(([v, l]) => `<button type="button" data-v="${v}" class="${(it.modo || 'm2') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <label class="f"><span data-plbl>${it.modo === 'ml' ? 'Preço do metro linear (R$)' : 'Preço do m² de chapa (R$)'}</span><input class="in" data-k="preco" inputmode="decimal" value="${h(it.preco)}" placeholder="0,00"></label>
          <div class="calc" data-calc></div></div>`;
      }
      return `<div class="item" data-i="${i}">
        <div class="item-h"><b>🔩 Item ${i + 1}</b><button class="x" data-del="${i}" aria-label="Remover">×</button></div>
        <input class="in" data-k="descricao" value="${h(it.descricao)}" placeholder="Descrição (ex.: Instalação, suporte, bocal)">
        <div class="grid2"><input class="in" data-k="qtd" inputmode="decimal" value="${h(it.qtd)}" placeholder="Quantidade">
        <select class="in" data-k="unidade">${['un', 'm', 'm²', 'vb', 'h'].map((u) => `<option ${it.unidade === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <label class="f">Preço unitário (R$)<input class="in" data-k="preco" inputmode="decimal" value="${h(it.preco)}" placeholder="0,00"></label>
        <div class="calc" data-calc></div></div>`;
    }

    const c = cfg();
    app.innerHTML = `
      <datalist id="materiais">${(c.materiais || []).map((m) => `<option value="${h(m)}">`).join('')}</datalist>
      <div class="card stack">
        <label class="f">Cliente${selectCliente(orc.clienteId)}</label>
        <button class="btn sm ghost" id="novoCli" type="button">+ Cadastrar cliente novo</button>
        <div class="grid2"><label class="f">Data<input class="in" type="date" id="data" value="${h(orc.data)}"></label>
        <label class="f">Validade (dias)<input class="in" id="validade" inputmode="numeric" value="${h(orc.validadeDias)}"></label></div>
        <label class="f">Local do serviço (se diferente do cadastro)<input class="in" id="local" value="${h(orc.local)}"></label>
      </div>
      <div class="card stack"><h3>Itens</h3><div class="stack" id="itens"></div>
        <div class="btns"><button class="btn ghost" id="addPerfil">+ Perfil (calha/rufo)</button><button class="btn ghost" id="addItem">+ Peça ou serviço</button></div>
      </div>
      <div class="card stack"><h3>Desconto</h3>
        <div class="grid2"><input class="in" id="desconto" inputmode="decimal" value="${h(orc.desconto)}" placeholder="0">
        <div class="seg" id="dtipo"><button type="button" data-v="valor" class="${orc.descontoTipo !== 'pct' ? 'on' : ''}">R$</button><button type="button" data-v="pct" class="${orc.descontoTipo === 'pct' ? 'on' : ''}">%</button></div></div>
      </div>
      <details class="card"><summary><b>Condições e observações</b></summary><div class="stack" style="margin-top:10px">
        <label class="f">Prazo de execução<input class="in" id="cPrazo" value="${h(orc.condicoes.prazo)}"></label>
        <label class="f">Forma de pagamento<input class="in" id="cPag" value="${h(orc.condicoes.pagamento)}"></label>
        <label class="f">Garantia<input class="in" id="cGar" value="${h(orc.condicoes.garantia)}"></label>
        <label class="f">Observações<textarea class="in" id="obs">${h(orc.observacoes)}</textarea></label></div></details>
      <details class="card" id="corteBox"><summary><b>Lista de corte</b> <span class="muted sm">(uso interno, não vai no PDF)</span></summary><div id="corte" style="margin-top:8px"></div></details>
      <div class="total-bar"><div><div class="sm" style="opacity:.8" id="subt"></div><b id="total">R$ 0,00</b></div><button class="btn ok" id="salvar">Salvar</button></div>
      <div class="card stack" id="acoes"></div>`;

    const box = $('#itens');
    function renderItens() {
      box.innerHTML = orc.itens.length ? orc.itens.map(itemHTML).join('') : '<div class="empty sm">Adicione os perfis medidos na visita e as peças ou serviços.</div>';
      orc.itens.forEach((_, i) => atualizarItem(i));
      atualizarTotais();
    }
    function atualizarItem(i) {
      const el = $(`.item[data-i="${i}"]`, box); if (!el) return;
      const it = orc.itens[i]; const r = C.calcLinha(it);
      const calcEl = $('[data-calc]', el);
      if (it.tipo === 'perfil') {
        calcEl.innerHTML = `<span>Desenv. <b>${C.fmtNum(r.desenvolvimento)} cm</b> · ${it.modo === 'ml' ? C.fmtNum(r.metros) + ' m' : C.fmtNum(r.areaM2) + ' m²'}</span><b>${C.fmtMoeda(r.total)}</b>`;
      } else {
        calcEl.innerHTML = `<span>${C.fmtNum(r.qtd)} ${h(it.unidade || 'un')} × ${C.fmtMoeda(r.preco)}</span><b>${C.fmtMoeda(r.total)}</b>`;
      }
    }
    function atualizarTotais() {
      const r = C.calcOrcamento(orc);
      $('#total').textContent = C.fmtMoeda(r.total);
      $('#subt').textContent = r.desconto > 0 ? 'Subtotal ' + C.fmtMoeda(r.subtotal) + ' − ' + C.fmtMoeda(r.desconto) : 'Total';
      const lc = C.listaCorte(orc);
      $('#corte').innerHTML = lc.length ? `<div class="list">${lc.map((g) => `<div class="li"><div class="grow"><div class="t">Tira de ${C.fmtNum(g.largura)} cm · ${h(g.material)}</div><div class="d">${h(g.perfis.join(', '))}</div></div><div class="right"><b>${C.fmtNum(g.metros)} m</b><div class="d">${C.fmtNum(g.areaM2)} m²</div></div></div>`).join('')}</div>` : '<div class="muted sm">Preencha abas e metros dos perfis.</div>';
    }

    box.addEventListener('input', (e) => {
      const el = e.target.closest('.item'); if (!el || !e.target.dataset.k) return;
      const i = Number(el.dataset.i); orc.itens[i][e.target.dataset.k] = e.target.value;
      if (e.target.dataset.k === 'abas') $('[data-svg]', el).innerHTML = svgChapa(e.target.value);
      atualizarItem(i); atualizarTotais(); agendarSalvar();
    });
    box.addEventListener('change', (e) => {
      const el = e.target.closest('.item'); if (!el || !e.target.dataset.k) return;
      orc.itens[Number(el.dataset.i)][e.target.dataset.k] = e.target.value; atualizarItem(Number(el.dataset.i)); atualizarTotais(); agendarSalvar();
    });
    box.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { orc.itens.splice(Number(del.dataset.del), 1); renderItens(); agendarSalvar(); return; }
      const mb = e.target.closest('[data-modo] button');
      if (mb) {
        const el = mb.closest('.item'); const i = Number(el.dataset.i);
        orc.itens[i].modo = mb.dataset.v;
        $$('[data-modo] button', el).forEach((b) => b.classList.toggle('on', b === mb));
        $('[data-plbl]', el).textContent = mb.dataset.v === 'ml' ? 'Preço do metro linear (R$)' : 'Preço do m² de chapa (R$)';
        atualizarItem(i); atualizarTotais(); agendarSalvar();
      }
    });

    $('#addPerfil').addEventListener('click', () => {
      const ps = cfg().perfis || [];
      modal(`<h2>Escolha o perfil</h2><div class="list">${ps.map((p, i) => `<button class="li" style="border:0;background:none;width:100%;text-align:left;cursor:pointer" data-p="${i}"><div class="grow"><div class="t">${h(p.nome)}</div><div class="d">Abas: ${h(p.abas || '—')} = ${C.fmtNum(C.desenvolvimentoCm(p.abas))} cm${C.parseNum(p.preco) ? ' · ' + C.fmtMoeda(p.preco) + (p.modo === 'ml' ? '/m' : '/m²') : ''}</div></div>›</button>`).join('')}
        <button class="li" style="border:0;background:none;width:100%;text-align:left;cursor:pointer" data-p="-1"><div class="grow"><div class="t">Perfil em branco</div><div class="d">Digitar as abas medidas na hora</div></div>›</button></div>
        <button class="btn ghost block" data-close style="margin-top:8px">Cancelar</button>`, (dlg, close) => {
        $$('[data-p]', dlg).forEach((b) => b.addEventListener('click', () => {
          const p = ps[Number(b.dataset.p)];
          orc.itens.push({ tipo: 'perfil', nome: p ? p.nome : '', abas: p ? p.abas : '', material: (cfg().materiais || [])[0] || '', metros: '', modo: p ? p.modo || 'm2' : 'm2', preco: p && C.parseNum(p.preco) ? String(p.preco) : '' });
          close(); renderItens(); agendarSalvar();
          const novo = $$('.item', box).pop(); if (novo) { novo.scrollIntoView({ behavior: 'smooth', block: 'center' }); const m = $('[data-k=metros]', novo); setTimeout(() => m && m.focus(), 300); }
        }));
      });
    });
    $('#addItem').addEventListener('click', () => {
      const its = cfg().itensPadrao || [];
      modal(`<h2>Peça ou serviço</h2><div class="list">${its.map((p, i) => `<button class="li" style="border:0;background:none;width:100%;text-align:left;cursor:pointer" data-p="${i}"><div class="grow"><div class="t">${h(p.descricao)}</div><div class="d">${h(p.unidade)}${C.parseNum(p.preco) ? ' · ' + C.fmtMoeda(p.preco) : ''}</div></div>›</button>`).join('')}
        <button class="li" style="border:0;background:none;width:100%;text-align:left;cursor:pointer" data-p="-1"><div class="grow"><div class="t">Item em branco</div></div>›</button></div>
        <button class="btn ghost block" data-close style="margin-top:8px">Cancelar</button>`, (dlg, close) => {
        $$('[data-p]', dlg).forEach((b) => b.addEventListener('click', () => {
          const p = its[Number(b.dataset.p)];
          orc.itens.push({ tipo: 'item', descricao: p ? p.descricao : '', unidade: p ? p.unidade : 'un', qtd: '1', preco: p && C.parseNum(p.preco) ? String(p.preco) : '' });
          close(); renderItens(); agendarSalvar();
        }));
      });
    });

    $('#novoCli').addEventListener('click', () => clienteRapido((cli) => { $('#cliente').innerHTML = opcoesCliente(cli.id); orc.clienteId = cli.id; agendarSalvar(); }));
    const bindCampo = (sel, fn) => $(sel).addEventListener('input', (e) => { fn(e.target.value); atualizarTotais(); agendarSalvar(); });
    $('#cliente').addEventListener('change', (e) => { orc.clienteId = e.target.value; agendarSalvar(); renderAcoes(); });
    bindCampo('#data', (v) => { orc.data = v; });
    bindCampo('#validade', (v) => { orc.validadeDias = Number(v) || 15; });
    bindCampo('#local', (v) => { orc.local = v; });
    bindCampo('#desconto', (v) => { orc.desconto = v; });
    bindCampo('#cPrazo', (v) => { orc.condicoes.prazo = v; });
    bindCampo('#cPag', (v) => { orc.condicoes.pagamento = v; });
    bindCampo('#cGar', (v) => { orc.condicoes.garantia = v; });
    bindCampo('#obs', (v) => { orc.observacoes = v; });
    $$('#dtipo button').forEach((b) => b.addEventListener('click', () => { orc.descontoTipo = b.dataset.v; $$('#dtipo button').forEach((x) => x.classList.toggle('on', x === b)); atualizarTotais(); agendarSalvar(); }));
    $('#salvar').addEventListener('click', () => { clearTimeout(autosave); salvarOrc(orc); renderAcoes(); });

    function validar() {
      if (!orc.clienteId) { toast('Selecione o cliente'); return false; }
      if (!orc.itens.length) { toast('Adicione pelo menos um item'); return false; }
      if (C.calcOrcamento(orc).total <= 0) { toast('Informe os preços dos itens'); return false; }
      return true;
    }

    function renderAcoes() {
      const el = $('#acoes');
      const cli = S.find('clientes', orc.clienteId);
      el.innerHTML = `<h3>Enviar e acompanhar</h3>
        <button class="btn ok block" data-a="pdf">📄 Gerar PDF e enviar pelo WhatsApp</button>
        <a class="btn ghost block" data-a="texto" target="_blank" rel="noopener" href="#">💬 Enviar resumo em texto</a>
        ${orc.numero ? `<div class="lbl" style="margin-top:6px">Status: <span class="tag s-${orc.status}">${STATUS[orc.status]}</span></div>
        <div class="btns">${orc.status !== 'aprovado' ? '<button class="btn sm ok" data-a="aprovar">✓ Aprovado</button>' : ''}${orc.status !== 'recusado' ? '<button class="btn sm line" data-a="recusar">Recusado</button>' : ''}${orc.status !== 'enviado' && orc.status !== 'rascunho' ? '<button class="btn sm line" data-a="reabrir">Voltar a enviado</button>' : ''}</div>
        <div class="btns"><button class="btn sm line" data-a="duplicar">Duplicar</button>${cli ? `<a class="btn sm line" href="#/cliente/${cli.id}">Ver cliente</a>` : ''}<button class="btn sm line" data-a="excluir" style="color:var(--bad)">Excluir</button></div>` : ''}`;
      $('[data-a=pdf]', el).addEventListener('click', async () => {
        if (!validar()) return;
        clearTimeout(autosave); salvarOrc(orc, true);
        const r = await P.compartilhar(orc, S.find('clientes', orc.clienteId), cfg());
        if (r !== 'cancelado') {
          if (orc.status === 'rascunho') { orc.status = 'enviado'; orc.enviadoEm = new Date().toISOString(); salvarOrc(orc, true); }
          toast(r === 'baixado' ? 'PDF salvo. Anexe na conversa do WhatsApp.' : 'Orçamento enviado');
          renderAcoes(); sub(STATUS[orc.status] + ' · ' + dataBR(orc.data));
        }
      });
      $('[data-a=texto]', el).addEventListener('click', (e) => {
        if (!validar()) { e.preventDefault(); return; }
        clearTimeout(autosave); salvarOrc(orc, true);
        const cl = S.find('clientes', orc.clienteId);
        e.currentTarget.href = waLink(cl && cl.telefone, textoResumo(orc, cl));
        if (orc.status === 'rascunho') { orc.status = 'enviado'; orc.enviadoEm = new Date().toISOString(); salvarOrc(orc, true); setTimeout(renderAcoes, 300); }
      });
      const on = (a, fn) => { const b = $(`[data-a=${a}]`, el); if (b) b.addEventListener('click', fn); };
      on('aprovar', () => {
        orc.status = 'aprovado'; orc.aprovadoEm = new Date().toISOString(); salvarOrc(orc, true); renderAcoes(); sub('Aprovado · ' + dataBR(orc.data));
        modal(`<h2>Orçamento aprovado 🎉</h2><p>Quer já marcar a instalação na agenda?</p><div class="btns"><button class="btn line" data-close>Depois</button><a class="btn ok" data-close href="#/compromisso/novo?tipo=instalacao&cliente=${orc.clienteId}&orcamento=${orc.id}&data=${addDias(hoje(), 1)}">Marcar instalação</a></div>`);
      });
      on('recusar', () => { orc.status = 'recusado'; salvarOrc(orc, true); renderAcoes(); sub('Recusado'); toast('Marcado como recusado'); });
      on('reabrir', () => { orc.status = 'enviado'; salvarOrc(orc, true); renderAcoes(); sub('Enviado'); });
      on('duplicar', () => {
        const copia = JSON.parse(JSON.stringify(orc)); delete copia.id; copia.numero = null; copia.status = 'rascunho'; copia.data = hoje(); delete copia.enviadoEm; delete copia.aprovadoEm;
        const novo = salvarOrc(copia, true); toast('Cópia criada: nº ' + String(novo.numero).padStart(4, '0')); go('#/orcamento/' + novo.id);
      });
      on('excluir', async () => { if (await confirmar('Excluir o orçamento nº ' + String(orc.numero).padStart(4, '0') + '?', 'Excluir', true)) { S.remove('orcamentos', orc.id); toast('Orçamento excluído'); go('#/orcamentos'); } });
    }

    renderItens(); renderAcoes();
  }

  function textoResumo(orc, cli) {
    const r = C.calcOrcamento(orc); const emp = cfg().empresa;
    let t = `*${emp.nome || 'Orçamento'}* — Orçamento nº ${String(orc.numero).padStart(4, '0')}\n`;
    if (cli) t += `Cliente: ${cli.nome}\n`;
    t += '\n';
    r.itens.forEach(({ item, calc }) => {
      if (item.tipo === 'perfil') t += `• ${item.nome || 'Perfil'}${item.material ? ' (' + item.material + ')' : ''}: ${C.fmtNum(calc.metros)} m — ${C.fmtMoeda(calc.total)}\n`;
      else t += `• ${item.descricao || 'Item'}: ${C.fmtNum(calc.qtd)} ${item.unidade || 'un'} — ${C.fmtMoeda(calc.total)}\n`;
    });
    if (r.desconto > 0) t += `\nDesconto: − ${C.fmtMoeda(r.desconto)}`;
    t += `\n*Total: ${C.fmtMoeda(r.total)}*\n`;
    const cd = orc.condicoes || {};
    if (cd.prazo) t += `Prazo: ${cd.prazo}\n`;
    if (cd.pagamento) t += `Pagamento: ${cd.pagamento}\n`;
    t += `Válido até ${dataBR(P.addDias(orc.data, orc.validadeDias))}.`;
    return t;
  }

  /** Desenho da chapa planificada: largura total = soma das abas, com as linhas de dobra. */
  function svgChapa(abasTxt) {
    const abas = C.parseAbas(abasTxt); const tot = abas.reduce((a, b) => a + b, 0);
    if (!tot) return '<div class="muted sm">Digite as abas para ver a chapa planificada.</div>';
    const W = 320, x0 = 6, w = W - 12; let x = x0; let parts = '';
    abas.forEach((a, i) => {
      const ww = (a / tot) * w;
      parts += `<rect x="${x.toFixed(1)}" y="16" width="${ww.toFixed(1)}" height="22" fill="${i % 2 ? '#d7e0ef' : '#e9eef7'}" stroke="#1f3a68" stroke-width="1"/>`;
      if (ww > 14) parts += `<text x="${(x + ww / 2).toFixed(1)}" y="31" font-size="10" text-anchor="middle" fill="#1f3a68">${C.fmtNum(a)}</text>`;
      x += ww;
    });
    return `<svg class="perfil-svg" viewBox="0 0 ${W} 56" aria-label="Chapa planificada"><text x="${W / 2}" y="11" font-size="10" text-anchor="middle" fill="#6b7385">chapa planificada · ${C.fmtNum(tot)} cm · ${abas.length - 1} dobra(s)</text>${parts}<line x1="${x0}" y1="46" x2="${x0 + w}" y2="46" stroke="#e07a1f" stroke-width="1.5"/><text x="${W / 2}" y="55" font-size="9.5" text-anchor="middle" fill="#e07a1f">desenvolvimento = ${C.fmtNum(tot)} cm</text></svg>`;
  }

  /* ================= CLIENTES ================= */
  route('/clientes', 'Clientes', 'clientes', (_, q) => {
    const busca = (q.b || '').toLowerCase();
    let cs = S.get().clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (busca) cs = cs.filter((c) => [c.nome, c.bairro, c.telefone, c.endereco].join(' ').toLowerCase().includes(busca));
    sub(S.get().clientes.length + ' cliente(s)');
    app.innerHTML = `<input class="in" id="busca" type="search" placeholder="Buscar por nome, bairro ou telefone" value="${h(q.b || '')}">
      <div class="card">${cs.length ? `<div class="list">${cs.map((c) => {
        const u = ultimoServico(c.id);
        return `<a class="li" href="#/cliente/${c.id}"><div class="grow"><div class="t">${h(c.nome)}</div><div class="d">${h([c.bairro, c.cidade].filter(Boolean).join(' · ') || c.telefone || '')}</div></div><div class="d right">${u ? 'Último serviço<br>' + dataBR(u) : ''}</div></a>`;
      }).join('')}</div>` : `<div class="empty"><span class="ico">👥</span>${busca ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}<br><a href="#/cliente/novo">Cadastrar cliente</a></div>`}</div>
      <a class="fab" href="#/cliente/novo" aria-label="Novo cliente">+</a>`;
    let t; $('#busca').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { history.replaceState(null, '', '#/clientes?b=' + encodeURIComponent(e.target.value)); render(); setTimeout(() => { const i = $('#busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 0); }, 350); });
  });

  route('/cliente/(novo|[\\w-]+)/?(editar)?', 'Cliente', 'clientes', ([id, editar]) => {
    if (id === 'novo' || editar) return formCliente(id === 'novo' ? null : id);
    const c = S.find('clientes', id);
    if (!c) { app.innerHTML = '<div class="empty">Cliente não encontrado.</div>'; return; }
    $('#tituloTela').textContent = c.nome;
    const desde = c.criadoEm ? new Date(c.criadoEm).getFullYear() : '';
    sub([c.bairro, desde ? 'cliente desde ' + desde : ''].filter(Boolean).join(' · '));
    const s = S.get();
    const orcs = s.orcamentos.filter((o) => o.clienteId === id).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const cps = s.compromissos.filter((x) => x.clienteId === id).sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));
    const u = ultimoServico(id); const meses = u ? Math.floor(diasEntre(u, hoje()) / 30) : null;
    const msgCamp = (cfg().campanha.mensagem || '').replace(/\{nome\}/g, primeiroNome(c.nome));
    app.innerHTML = `
      <div class="card stack">
        <div class="kv">${c.telefone ? `<span>Telefone</span><b>${h(c.telefone)}</b>` : ''}
        ${c.endereco || c.bairro ? `<span>Endereço</span><span>${h([c.endereco, c.bairro, c.cidade].filter(Boolean).join(', '))}</span>` : ''}
        ${c.origem ? `<span>Chegou por</span><span>${h(c.origem)}</span>` : ''}
        ${c.observacoes ? `<span>Obs.</span><span>${h(c.observacoes)}</span>` : ''}</div>
        <div class="btns">${c.telefone ? `<a class="btn ok sm" target="_blank" rel="noopener" href="${waLink(c.telefone)}">WhatsApp</a><a class="btn ghost sm" href="tel:${h(String(c.telefone).replace(/[^\d+]/g, ''))}">Ligar</a>` : ''}<a class="btn ghost sm" target="_blank" rel="noopener" href="${mapsLink(c)}">Mapa</a><a class="btn line sm" href="#/cliente/${c.id}/editar">Editar</a></div>
      </div>
      <div class="btns"><a class="btn" href="#/orcamento/novo?cliente=${c.id}">🧮 Novo orçamento</a><a class="btn ghost" href="#/compromisso/novo?cliente=${c.id}&data=${hoje()}">📆 Agendar</a></div>
      ${u ? `<div class="card alert vio stack"><div class="lbl" style="color:var(--vio)">Manutenção preventiva</div><div class="sm">Último serviço em ${dataBR(u)}${meses ? ' (há ' + meses + ' ' + (meses === 1 ? 'mês' : 'meses') + ')' : ''}.${meses >= (cfg().campanha.meses || 12) ? ' Já é hora de sugerir uma revisão.' : ''}</div>
        ${c.telefone ? `<a class="btn vio block" target="_blank" rel="noopener" href="${waLink(c.telefone, msgCamp)}" data-camp>Enviar convite de manutenção</a>` : ''}</div>` : ''}
      <div class="card"><h3>Orçamentos</h3>${orcs.length ? `<div class="list">${orcs.map((o) => `<a class="li" href="#/orcamento/${o.id}"><div class="grow"><div class="t">nº ${String(o.numero).padStart(4, '0')} · ${C.fmtMoeda(C.calcOrcamento(o).total)}</div><div class="d">${dataBR(o.data)} · ${(o.itens || []).map((i) => i.nome || i.descricao).filter(Boolean).slice(0, 3).join(', ')}</div></div><span class="tag s-${o.status}">${STATUS[o.status]}</span></a>`).join('')}</div>` : '<div class="muted sm">Nenhum orçamento.</div>'}</div>
      <div class="card"><h3>Histórico na agenda</h3>${cps.length ? `<div class="list">${cps.map((x) => `<div class="li ${x.status === 'concluido' ? '' : ''}"><div class="grow"><div class="t">${h(TIPOS[x.tipo])}</div><div class="d">${dataBR(x.data)} ${h(x.hora || '')}${x.notas ? ' · ' + h(x.notas) : ''}</div></div><span class="tag ${x.status === 'concluido' ? 't-instalacao' : 't-orcamento'}">${x.status === 'concluido' ? 'Feito' : 'Pendente'}</span></div>`).join('')}</div>` : '<div class="muted sm">Nada na agenda ainda.</div>'}
        <hr class="sep"><label class="f" style="margin-top:8px">Serviço antigo (antes do app)<input class="in" type="date" id="ultManual" value="${h(c.ultimoServicoManual || '')}"></label></div>`;
    const camp = $('[data-camp]'); if (camp) camp.addEventListener('click', () => { c.ultimoConvite = hoje(); S.upsert('clientes', c); });
    $('#ultManual').addEventListener('change', (e) => { c.ultimoServicoManual = e.target.value; S.upsert('clientes', c); toast('Data registrada'); render(); });
  }, true);

  function formCliente(id) {
    const c = id ? Object.assign({}, S.find('clientes', id)) : { nome: '', telefone: '', endereco: '', bairro: '', cidade: 'Indianópolis', origem: '', observacoes: '' };
    $('#tituloTela').textContent = id ? 'Editar cliente' : 'Novo cliente';
    const origens = ['Indicação', 'WhatsApp', 'Google', 'Pedreiro / construtora', 'Já era cliente', 'Outro'];
    app.innerHTML = `<div class="card stack">
      <label class="f">Nome<input class="in" id="nome" value="${h(c.nome)}" autocomplete="off"></label>
      <label class="f">WhatsApp / telefone<input class="in" id="telefone" type="tel" inputmode="tel" value="${h(c.telefone)}" placeholder="(34) 9 9999-9999"></label>
      <label class="f">Endereço<input class="in" id="endereco" value="${h(c.endereco)}" placeholder="Rua, número"></label>
      <div class="grid2"><label class="f">Bairro<input class="in" id="bairro" value="${h(c.bairro)}"></label><label class="f">Cidade<input class="in" id="cidade" value="${h(c.cidade)}"></label></div>
      <label class="f">Como chegou<select class="in" id="origem"><option value="">—</option>${origens.map((o) => `<option ${c.origem === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="f">Observações<textarea class="in" id="observacoes" placeholder="Ex.: casa de esquina, portão azul">${h(c.observacoes)}</textarea></label>
      <button class="btn ok block" id="salvar">Salvar</button>
      ${id ? '<button class="btn line block" id="excluir" style="color:var(--bad)">Excluir cliente</button>' : ''}</div>`;
    $('#salvar').addEventListener('click', () => {
      ['nome', 'telefone', 'endereco', 'bairro', 'cidade', 'origem', 'observacoes'].forEach((k) => { c[k] = $('#' + k).value.trim(); });
      c.telefone = C.fmtFone(c.telefone);
      if (!c.nome) { toast('Informe o nome'); return; }
      const salvo = S.upsert('clientes', c); toast('Cliente salvo'); go('#/cliente/' + salvo.id);
    });
    const ex = $('#excluir');
    if (ex) ex.addEventListener('click', async () => {
      const n = S.get().orcamentos.filter((o) => o.clienteId === id).length;
      if (await confirmar(`Excluir ${c.nome}?${n ? ' Os ' + n + ' orçamento(s) dele ficam sem cliente.' : ''}`, 'Excluir', true)) { S.remove('clientes', id); toast('Cliente excluído'); go('#/clientes'); }
    });
  }

  /* ================= CAMPANHAS ================= */
  route('/campanhas', 'Campanhas', 'campanhas', () => {
    const cc = cfg().campanha; const meses = Number(cc.meses) || 12;
    const lista = S.get().clientes.map((c) => ({ c, u: ultimoServico(c.id) }))
      .filter((x) => x.u && diasEntre(x.u, hoje()) >= meses * 30)
      .sort((a, b) => a.u.localeCompare(b.u));
    const pend = lista.filter((x) => !x.c.ultimoConvite || diasEntre(x.c.ultimoConvite, hoje()) > 30);
    sub(`${lista.length} cliente(s) com serviço há ${meses}+ meses`);
    app.innerHTML = `
      <div class="card alert vio stack"><b>Manutenção na baixa temporada</b>
        <div class="sm">Clientes cujo último serviço (instalação, manutenção ou orçamento aprovado) foi há mais de ${meses} meses. Convide para limpeza e revisão antes das chuvas.</div>
        <div class="row"><label class="f grow">Último serviço há mais de<select class="in" id="meses">${[6, 9, 12, 18, 24].map((m) => `<option value="${m}" ${m === meses ? 'selected' : ''}>${m} meses</option>`).join('')}</select></label></div>
        <div><span class="chip">${pend.length} para convidar</span><span class="chip">${lista.length - pend.length} já convidado(s) no mês</span></div>
      </div>
      <details class="card"><summary><b>Mensagem do convite</b></summary><div class="stack" style="margin-top:8px"><textarea class="in" id="msg" style="min-height:110px">${h(cc.mensagem)}</textarea><div class="sm muted">{nome} é trocado pelo primeiro nome do cliente.</div></div></details>
      <div class="card">${lista.length ? `<div class="list">${lista.map(({ c, u }) => {
        const conv = c.ultimoConvite && diasEntre(c.ultimoConvite, hoje()) <= 30;
        const msg = (cc.mensagem || '').replace(/\{nome\}/g, primeiroNome(c.nome));
        return `<div class="li"><a class="grow" href="#/cliente/${c.id}" style="text-decoration:none;color:inherit"><div class="t">${h(c.nome)}</div><div class="d">Último serviço ${dataBR(u)}${conv ? ' · convidado em ' + dataBR(c.ultimoConvite) : ''}</div></a>
          ${c.telefone ? `<a class="btn sm ${conv ? 'line' : 'vio'}" target="_blank" rel="noopener" data-conv="${c.id}" href="${waLink(c.telefone, msg)}">${conv ? 'De novo' : 'Convidar'}</a>` : '<span class="d">sem telefone</span>'}</div>`;
      }).join('')}</div>` : `<div class="empty"><span class="ico">🔔</span>Ninguém para convidar agora.<br><span class="sm">Conforme as instalações forem concluídas na agenda, os clientes aparecem aqui quando chegar a hora da manutenção.</span></div>`}</div>`;
    $('#meses').addEventListener('change', (e) => { cc.meses = Number(e.target.value); S.save(); render(); });
    $('#msg').addEventListener('change', (e) => { cc.mensagem = e.target.value; S.save(); toast('Mensagem salva'); render(); });
    $$('[data-conv]').forEach((a) => a.addEventListener('click', () => { const c = S.find('clientes', a.dataset.conv); c.ultimoConvite = hoje(); S.upsert('clientes', c); setTimeout(render, 400); }));
  });

  /* ================= CONFIGURAÇÕES ================= */
  route('/config', 'Configurações', '', (_, q) => {
    const c = cfg(); const e = c.empresa;
    app.innerHTML = `
      <div class="card stack"><h3>Empresa (aparece no PDF)</h3>
        <label class="f">Nome da empresa<input class="in" data-e="nome" value="${h(e.nome)}"></label>
        <label class="f">Responsável<input class="in" data-e="responsavel" value="${h(e.responsavel)}"></label>
        <div class="grid2"><label class="f">CNPJ<input class="in" data-e="cnpj" value="${h(e.cnpj)}"></label><label class="f">Telefone<input class="in" data-e="telefone" type="tel" value="${h(e.telefone)}"></label></div>
        <label class="f">Endereço<input class="in" data-e="endereco" value="${h(e.endereco)}"></label>
      </div>
      <div class="card stack"><h3>Perfis e preços</h3><div class="sm muted">Cadastre os perfis que você mais faz, com as abas e o preço. No orçamento é só escolher e informar os metros.</div>
        <div class="stack" id="perfis"></div><button class="btn sm ghost" id="addP">+ Perfil</button></div>
      <div class="card stack"><h3>Peças e serviços</h3><div class="stack" id="itensP"></div><button class="btn sm ghost" id="addI">+ Peça ou serviço</button></div>
      <div class="card stack"><h3>Padrões do orçamento</h3>
        <label class="f">Materiais (separados por vírgula)<input class="in" id="materiais" value="${h((c.materiais || []).join(', '))}"></label>
        <div class="grid2"><label class="f">Validade (dias)<input class="in" id="validade" inputmode="numeric" value="${h(c.validadeDias)}"></label><label class="f">Próximo nº<input class="in" id="prox" inputmode="numeric" value="${h(c.proximoNumero)}"></label></div>
        <label class="f">Prazo de execução<input class="in" data-c="prazo" value="${h(c.condicoes.prazo)}"></label>
        <label class="f">Forma de pagamento<input class="in" data-c="pagamento" value="${h(c.condicoes.pagamento)}"></label>
        <label class="f">Garantia<input class="in" data-c="garantia" value="${h(c.condicoes.garantia)}"></label>
      </div>
      <div class="card stack" id="backup"><h3>Backup dos dados</h3>
        <div class="sm">Os dados ficam guardados só neste celular. Salve um backup toda semana (no Google Drive ou mandando para você mesmo no WhatsApp).${c.ultimoBackup ? ' Último backup: <b>' + dataBR(c.ultimoBackup) + '</b>.' : ' <b>Nenhum backup feito ainda.</b>'}</div>
        <button class="btn acc block" id="exportar">⬇ Fazer backup agora</button>
        <label class="btn line block" style="cursor:pointer">⬆ Restaurar um backup<input type="file" id="importar" accept="application/json,.json" hidden></label>
      </div>
      <div class="card stack"><h3>Demonstração</h3><div class="sm muted">Carrega clientes e orçamentos fictícios para mostrar o app. Não use depois de começar a cadastrar dados reais.</div>
        <button class="btn line block" id="demo">Carregar dados de exemplo</button>
        <button class="btn line block" id="zerar" style="color:var(--bad)">Apagar todos os dados</button></div>
      <div class="sm muted" style="text-align:center">OrçaCalha v1.0 · funciona sem internet</div>`;

    $$('[data-e]').forEach((i) => i.addEventListener('change', () => { e[i.dataset.e] = i.value.trim(); S.save(); toast('Salvo'); }));
    $$('[data-c]').forEach((i) => i.addEventListener('change', () => { c.condicoes[i.dataset.c] = i.value.trim(); S.save(); toast('Salvo'); }));
    $('#materiais').addEventListener('change', (ev) => { c.materiais = ev.target.value.split(',').map((s) => s.trim()).filter(Boolean); S.save(); toast('Salvo'); });
    $('#validade').addEventListener('change', (ev) => { c.validadeDias = Number(ev.target.value) || 15; S.save(); toast('Salvo'); });
    $('#prox').addEventListener('change', (ev) => { c.proximoNumero = Math.max(1, parseInt(ev.target.value, 10) || 1); S.save(); toast('Salvo'); });

    function listaEditavel(sel, arr, campos, novo) {
      const el = $(sel);
      const draw = () => {
        el.innerHTML = arr.map((p, i) => `<div class="item" data-i="${i}"><div class="item-h"><b>${h(p.nome || p.descricao || 'Novo')}</b><button class="x" data-del aria-label="Remover">×</button></div>
          ${campos.map(([k, l, extra]) => k === 'modo'
            ? `<div class="seg" data-modo>${[['m2', 'por m² de chapa'], ['ml', 'por metro linear']].map(([v, t]) => `<button type="button" data-v="${v}" class="${(p.modo || 'm2') === v ? 'on' : ''}">${t}</button>`).join('')}</div>`
            : k === 'unidade' ? `<label class="f">${l}<select class="in" data-k="unidade">${['un', 'm', 'm²', 'vb', 'h'].map((u) => `<option ${p.unidade === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>`
            : `<label class="f">${l}<input class="in" data-k="${k}" value="${h(p[k])}" ${extra || ''}></label>`).join('')}
          ${p.abas != null ? `<div class="sm muted">Desenvolvimento: <b>${C.fmtNum(C.desenvolvimentoCm(p.abas))} cm</b></div>` : ''}</div>`).join('') || '<div class="muted sm">Nenhum cadastrado.</div>';
      };
      el.addEventListener('change', (ev) => { const it = ev.target.closest('.item'); if (!it || !ev.target.dataset.k) return; arr[Number(it.dataset.i)][ev.target.dataset.k] = ev.target.value; S.save(); draw(); toast('Salvo'); });
      el.addEventListener('click', async (ev) => {
        const it = ev.target.closest('.item'); if (!it) return; const i = Number(it.dataset.i);
        if (ev.target.closest('[data-del]')) { if (await confirmar('Remover "' + (arr[i].nome || arr[i].descricao || 'item') + '"?', 'Remover', true)) { arr.splice(i, 1); S.save(); draw(); } return; }
        const mb = ev.target.closest('[data-modo] button'); if (mb) { arr[i].modo = mb.dataset.v; S.save(); draw(); }
      });
      draw();
      return () => { arr.push(novo()); S.save(); draw(); const last = $$('.item', el).pop(); if (last) { const inp = $('input', last); inp && inp.focus(); } };
    }
    $('#addP').addEventListener('click', listaEditavel('#perfis', c.perfis, [['nome', 'Nome'], ['abas', 'Abas (cm)', 'inputmode="decimal" placeholder="3 + 10 + 15 + 10 + 3"'], ['modo', ''], ['preco', 'Preço (R$)', 'inputmode="decimal"']], () => ({ id: S.uid(), nome: '', abas: '', modo: 'm2', preco: '' })));
    $('#addI').addEventListener('click', listaEditavel('#itensP', c.itensPadrao, [['descricao', 'Descrição'], ['unidade', 'Unidade'], ['preco', 'Preço (R$)', 'inputmode="decimal"']], () => ({ id: S.uid(), descricao: '', unidade: 'un', preco: '' })));

    $('#exportar').addEventListener('click', async () => {
      const json = S.exportar();
      const nome = 'orcacalha-backup-' + hoje() + '.json';
      const file = new File([json], nome, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Backup OrçaCalha' }); toast('Backup gerado'); render(); return; } catch (err) { if (err.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Backup baixado'); render();
    });
    $('#importar').addEventListener('change', async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const txt = await f.text();
      if (!(await confirmar('Restaurar este backup? Os dados atuais deste celular serão substituídos.', 'Restaurar', true))) return;
      try { S.importar(txt); toast('Backup restaurado'); go('#/agenda'); } catch (err) { toast(err.message || 'Arquivo inválido'); }
    });
    $('#demo').addEventListener('click', async () => {
      if (S.get().clientes.length && !(await confirmar('Já existem dados. Adicionar os exemplos junto?', 'Adicionar'))) return;
      carregarDemo(); toast('Dados de exemplo carregados'); go('#/agenda');
    });
    $('#zerar').addEventListener('click', async () => {
      if (!(await confirmar('Apagar TODOS os clientes, orçamentos e a agenda deste celular? Isso não tem volta.', 'Apagar tudo', true))) return;
      if (!(await confirmar('Tem certeza mesmo? Faça um backup antes, se precisar.', 'Sim, apagar', true))) return;
      const keep = cfg(); const novo = S.defaults(); novo.config = keep; novo.config.proximoNumero = 1;
      localStorage.setItem(S.KEY, JSON.stringify(novo)); S.load(); toast('Dados apagados'); go('#/agenda');
    });
    if (q.sec) { const el = document.getElementById(q.sec); if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 50); }
  }, true);

  /* ---------------- dados de exemplo ---------------- */
  function carregarDemo() {
    const c = cfg();
    c.perfis.forEach((p, i) => { if (!C.parseNum(p.preco)) p.preco = [95, 90, 85, 92, 80][i] || 90; });
    c.itensPadrao.forEach((p, i) => { if (!C.parseNum(p.preco)) p.preco = [18, 12, 15, 30, 150][i] || 10; });
    const nomes = [['Maria Aparecida (exemplo)', 'Centro'], ['José Carlos (exemplo)', 'Vila Nova'], ['Mercado Bom Preço (exemplo)', 'Centro'], ['Fazenda Santa Rita (exemplo)', 'Zona rural'], ['Ana Paula (exemplo)', 'Jardim América']];
    const cli = nomes.map(([n, b], i) => S.upsert('clientes', { nome: n, telefone: '(34) 9 9000-000' + i, endereco: 'Rua Exemplo, ' + (100 + i * 37), bairro: b, cidade: 'Indianópolis', origem: ['Indicação', 'WhatsApp', 'Google', 'Pedreiro / construtora', 'Indicação'][i], observacoes: '' }));
    const d = hoje();
    const mkOrc = (cl, itens, status, diasAtras) => {
      const o = { numero: c.proximoNumero++, data: addDias(d, -diasAtras), clienteId: cl.id, local: '', status, itens, desconto: '', descontoTipo: 'valor', validadeDias: c.validadeDias, condicoes: Object.assign({}, c.condicoes), observacoes: '' };
      if (status !== 'rascunho') o.enviadoEm = new Date(Date.now() - diasAtras * 86400000).toISOString();
      if (status === 'aprovado') o.aprovadoEm = o.enviadoEm;
      return S.upsert('orcamentos', o);
    };
    const p0 = c.perfis[0], p2 = c.perfis[2];
    mkOrc(cli[0], [{ tipo: 'perfil', nome: p0.nome, abas: p0.abas, material: c.materiais[0], metros: '18', modo: 'm2', preco: String(p0.preco) }, { tipo: 'perfil', nome: p2.nome, abas: p2.abas, material: c.materiais[0], metros: '6', modo: 'm2', preco: String(p2.preco) }, { tipo: 'item', descricao: 'Suporte de calha', unidade: 'un', qtd: '18', preco: '12' }, { tipo: 'item', descricao: 'Instalação', unidade: 'm', qtd: '24', preco: '18' }], 'enviado', 4);
    const oB = mkOrc(cli[1], [{ tipo: 'perfil', nome: p0.nome, abas: p0.abas, material: c.materiais[0], metros: '22', modo: 'm2', preco: String(p0.preco) }, { tipo: 'item', descricao: 'Instalação', unidade: 'm', qtd: '22', preco: '18' }], 'aprovado', 6);
    mkOrc(cli[2], [{ tipo: 'perfil', nome: c.perfis[3].nome, abas: c.perfis[3].abas, material: c.materiais[2], metros: '30', modo: 'm2', preco: String(c.perfis[3].preco) }], 'rascunho', 0);
    mkOrc(cli[3], [{ tipo: 'perfil', nome: 'Calha de galpão', abas: '5 + 15 + 25 + 15 + 5', material: c.materiais[1], metros: '40', modo: 'm2', preco: '98' }], 'aprovado', 420);
    S.upsert('compromissos', { tipo: 'visita', data: d, hora: '08:30', clienteId: cli[4].id, status: 'pendente', duracao: 60, notas: 'Medir calha dos fundos' });
    S.upsert('compromissos', { tipo: 'instalacao', data: d, hora: '10:00', clienteId: cli[1].id, orcamentoId: oB.id, status: 'pendente', duracao: 240, notas: '22 m de calha' });
    S.upsert('compromissos', { tipo: 'orcamento', data: d, hora: '15:00', clienteId: cli[2].id, status: 'pendente', duracao: 30, notas: 'Rufo de platibanda' });
    S.upsert('compromissos', { tipo: 'instalacao', data: addDias(d, -420), hora: '08:00', clienteId: cli[3].id, status: 'concluido', duracao: 480, notas: 'Calha do galpão' });
    S.upsert('compromissos', { tipo: 'manutencao', data: addDias(d, 2), hora: '09:00', clienteId: cli[0].id, status: 'pendente', duracao: 60, notas: 'Limpeza' });
    const ana = cli[4]; ana.ultimoServicoManual = addDias(d, -400); S.upsert('clientes', ana);
  }

  /* ---------------- início ---------------- */
  S.load();
  S.pedirPersistencia();
  if (!location.hash) location.hash = '#/agenda'; else render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }
})();
