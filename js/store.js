/* Armazenamento local (no próprio celular) + backup em arquivo. */
(function (root) {
  'use strict';
  const KEY = 'orcacalha:v1';

  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function hojeISO(d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function defaults() {
    return {
      versao: 1,
      clientes: [],
      orcamentos: [],
      compromissos: [],
      config: {
        empresa: {
          nome: 'Calhas e Rufos',
          responsavel: 'Thiago Jaco dos Santos',
          cnpj: '52.941.803/0001-44',
          telefone: '',
          endereco: 'Rua Joaquim Oliveira Carvalho, 325, Centro, Indianópolis/MG',
        },
        proximoNumero: 1,
        validadeDias: 15,
        condicoes: {
          prazo: 'A combinar conforme agenda',
          pagamento: 'A combinar',
          garantia: 'Garantia de instalação conforme combinado',
        },
        materiais: ['Galvanizada nº 26', 'Galvanizada nº 24', 'Galvalume', 'Alumínio', 'Pré-pintada'],
        perfis: [
          { id: uid(), nome: 'Calha moldura', abas: '3 + 2 + 12 + 15 + 10 + 3', modo: 'm2', preco: 0 },
          { id: uid(), nome: 'Calha de beiral', abas: '2 + 10 + 12 + 10 + 2', modo: 'm2', preco: 0 },
          { id: uid(), nome: 'Rufo de encosto', abas: '2 + 10 + 8 + 2', modo: 'm2', preco: 0 },
          { id: uid(), nome: 'Rufo de platibanda (capa)', abas: '3 + 5 + 20 + 5 + 3', modo: 'm2', preco: 0 },
          { id: uid(), nome: 'Pingadeira', abas: '2 + 8 + 3', modo: 'm2', preco: 0 },
        ],
        itensPadrao: [
          { id: uid(), descricao: 'Instalação', unidade: 'm', preco: 0 },
          { id: uid(), descricao: 'Suporte de calha', unidade: 'un', preco: 0 },
          { id: uid(), descricao: 'Bocal / saída', unidade: 'un', preco: 0 },
          { id: uid(), descricao: 'Condutor (tubo)', unidade: 'm', preco: 0 },
          { id: uid(), descricao: 'Limpeza de calhas', unidade: 'vb', preco: 0 },
        ],
        campanha: {
          meses: 12,
          mensagem: 'Olá, {nome}! Aqui é da Calhas e Rufos. Já faz um tempo desde o último serviço na sua calha. Antes das chuvas, que tal uma limpeza e revisão das vedações? Posso agendar uma visita sem compromisso.',
        },
        ultimoBackup: null,
      },
    };
  }

  let state = null;
  const listeners = [];

  function load() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        state = merge(defaults(), data);
        return state;
      }
    } catch (e) { console.error('Falha ao ler dados', e); }
    state = defaults();
    return state;
  }

  function merge(base, data) {
    const out = Object.assign({}, base, data);
    out.config = Object.assign({}, base.config, data.config || {});
    out.config.empresa = Object.assign({}, base.config.empresa, (data.config || {}).empresa || {});
    out.config.condicoes = Object.assign({}, base.config.condicoes, (data.config || {}).condicoes || {});
    out.config.campanha = Object.assign({}, base.config.campanha, (data.config || {}).campanha || {});
    ['clientes', 'orcamentos', 'compromissos'].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
    return out;
  }

  function save() {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('Não foi possível salvar os dados neste aparelho. Faça um backup agora.');
      throw e;
    }
    listeners.forEach((fn) => fn(state));
  }

  function get() { return state || load(); }
  function onChange(fn) { listeners.push(fn); }

  function upsert(col, obj) {
    const s = get();
    const now = new Date().toISOString();
    if (!obj.id) { obj.id = uid(); obj.criadoEm = now; s[col].push(obj); }
    else {
      const i = s[col].findIndex((x) => x.id === obj.id);
      if (i >= 0) s[col][i] = obj; else s[col].push(obj);
    }
    obj.atualizadoEm = now;
    save();
    return obj;
  }

  function remove(col, id) {
    const s = get();
    s[col] = s[col].filter((x) => x.id !== id);
    save();
  }

  function find(col, id) { return get()[col].find((x) => x.id === id); }

  function exportar() {
    const s = get();
    s.config.ultimoBackup = new Date().toISOString();
    save();
    return JSON.stringify({ app: 'orcacalha', exportadoEm: new Date().toISOString(), dados: s }, null, 2);
  }

  function importar(texto) {
    const obj = JSON.parse(texto);
    const dados = obj && obj.dados ? obj.dados : obj;
    if (!dados || !Array.isArray(dados.clientes) || !Array.isArray(dados.orcamentos)) {
      throw new Error('Arquivo de backup inválido.');
    }
    state = merge(defaults(), dados);
    save();
    return state;
  }

  async function pedirPersistencia() {
    try {
      if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
    } catch (e) { /* ignore */ }
    return false;
  }

  root.Store = { load, save, get, onChange, upsert, remove, find, exportar, importar, uid, hojeISO, pedirPersistencia, KEY, defaults };
})(self);
