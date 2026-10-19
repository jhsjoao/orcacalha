/* Cálculos do orçamento — método do proprietário:
 * desenvolvimento da chapa = soma das abas do perfil (cm)
 * valor do perfil = desenvolvimento (m) × metros lineares × preço do m² de chapa
 * (ou, se preferir, metros lineares × preço do metro linear)
 */
(function (root) {
  'use strict';

  /** Converte texto no formato brasileiro ("1.234,5", "12,5", "12.5") em número. */
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    let s = String(v).trim().replace(/\s/g, '').replace(/^R\$/i, '');
    if (!s) return 0;
    const hasComma = s.includes(',');
    if (hasComma) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  /** Lê as abas digitadas: "3 + 2 + 12,5 + 15" (separadores: + ; espaço ou /). */
  function parseAbas(texto) {
    if (Array.isArray(texto)) return texto.map(parseNum).filter((n) => n > 0);
    if (!texto) return [];
    return String(texto)
      .split(/[+;/\s]+/)
      .map((p) => parseNum(p))
      .filter((n) => n > 0);
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function desenvolvimentoCm(abas) {
    return round2(parseAbas(abas).reduce((a, b) => a + b, 0));
  }

  /** Item do tipo perfil (calha, rufo, pingadeira, condutor...). */
  function calcPerfil(item) {
    const dev = desenvolvimentoCm(item.abas);
    const metros = parseNum(item.metros);
    const preco = parseNum(item.preco);
    const area = (dev / 100) * metros;
    const areaM2 = round2(area);
    const total = item.modo === 'ml' ? round2(metros * preco) : round2(area * preco);
    return { desenvolvimento: dev, metros, areaM2, preco, total };
  }

  /** Item genérico (peça avulsa, instalação, serviço): quantidade × preço. */
  function calcItem(item) {
    const qtd = parseNum(item.qtd);
    const preco = parseNum(item.preco);
    return { qtd, preco, total: round2(qtd * preco) };
  }

  function calcLinha(item) {
    return item.tipo === 'perfil' ? calcPerfil(item) : calcItem(item);
  }

  function calcOrcamento(orc) {
    const itens = (orc.itens || []).map((it) => ({ item: it, calc: calcLinha(it) }));
    const subtotal = round2(itens.reduce((s, x) => s + x.calc.total, 0));
    let desconto = parseNum(orc.desconto);
    if (orc.descontoTipo === 'pct') desconto = round2(subtotal * Math.min(desconto, 100) / 100);
    desconto = Math.min(desconto, subtotal);
    const total = round2(subtotal - desconto);
    return { itens, subtotal, desconto, total };
  }

  /** Divide o comprimento em peças que cabem na dobradeira (padrão 6 m). */
  function pecasCorte(metros, max) {
    const m = parseNum(metros); const lim = parseNum(max) || 6;
    if (m <= 0) return { pecas: [], inteiras: 0, resto: 0, total: 0, emendas: 0, max: lim };
    let inteiras = Math.floor((m + 1e-9) / lim);
    let resto = round2(m - inteiras * lim);
    if (resto < 0.005) resto = 0;
    const pecas = Array(inteiras).fill(lim);
    if (resto) pecas.push(resto);
    return { pecas, inteiras, resto, total: pecas.length, emendas: Math.max(0, pecas.length - 1), max: lim };
  }

  /** Texto curto: "2 × 6 m + 1 × 0,5 m". */
  function descPecas(pc) {
    if (!pc.total) return '';
    const partes = [];
    if (pc.inteiras) partes.push(pc.inteiras + ' × ' + fmtNum(pc.max) + ' m');
    if (pc.resto) partes.push('1 × ' + fmtNum(pc.resto) + ' m');
    return partes.join(' + ');
  }

  /** Lista de corte: agrupa perfis por material e largura de desenvolvimento,
   *  já dividindo cada perfil em peças de no máximo `max` metros (dobradeira). */
  function listaCorte(orc, max) {
    const lim = parseNum(max) || 6;
    const grupos = {};
    (orc.itens || []).filter((i) => i.tipo === 'perfil').forEach((i) => {
      const c = calcPerfil(i);
      if (!c.desenvolvimento || !c.metros) return;
      const key = (i.material || 'Chapa') + '|' + c.desenvolvimento;
      if (!grupos[key]) grupos[key] = { material: i.material || 'Chapa', largura: c.desenvolvimento, metros: 0, areaM2: 0, perfis: [], pecas: {}, totalPecas: 0, emendas: 0 };
      const g = grupos[key];
      const pc = pecasCorte(c.metros, lim);
      g.metros = round2(g.metros + c.metros);
      g.areaM2 = round2(g.areaM2 + c.areaM2);
      g.perfis.push(i.nome || 'Perfil');
      pc.pecas.forEach((len) => { const k = String(len); g.pecas[k] = (g.pecas[k] || 0) + 1; });
      g.totalPecas += pc.total; g.emendas += pc.emendas;
    });
    return Object.values(grupos).map((g) => {
      g.pecasLista = Object.entries(g.pecas).map(([len, qtd]) => ({ comprimento: Number(len), qtd })).sort((a, b) => b.comprimento - a.comprimento);
      return g;
    }).sort((a, b) => b.largura - a.largura);
  }

  function fmtMoeda(n) {
    return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function fmtNum(n, casas) {
    return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas == null ? 2 : casas });
  }

  /** Normaliza telefone para o wa.me (com DDI 55). */
  function foneWhats(fone) {
    let d = String(fone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('0')) d = d.replace(/^0+/, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d;
  }

  /** Formata telefone brasileiro para exibição: (34) 9 9988-7766. */
  function fmtFone(fone) {
    let d = String(fone || '').replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d[2] + ' ' + d.slice(3, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return String(fone || '').trim();
  }

  const api = { pecasCorte, descPecas, fmtFone, parseNum, parseAbas, desenvolvimentoCm, calcPerfil, calcItem, calcLinha, calcOrcamento, listaCorte, fmtMoeda, fmtNum, foneWhats, round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this);
