/* ==== MentorConcursos - Banco de Dados (IndexedDB via Dexie) ==== */
const db = new Dexie('MentorConcursosDB');

db.version(1).stores({
  concursos: '++id, nome, dataProva, horasDiarias, criadoEm',
  disciplinas: '++id, concursoId, nome, peso, eliminatoria, cor, ordemCiclo',
  topicos: '++id, disciplinaId, nome, status',
  sessoes: '++id, concursoId, disciplinaId, topico, tipo, data, duracaoSegundos, avaliacao, notas',
  revisoes: '++id, sessaoId, disciplinaId, topico, tipoRevisao, dataPrevista, dataRealizada, status',
  cicloConfig: '++id, concursoId, posicaoAtual, cicloJSON'
});

db.version(2).stores({
  concursos: '++id, nome, dataProva, horasDiarias, totalQuestoes, criadoEm',
  disciplinas: '++id, concursoId, nome, numQuestoes, pesoQuestao, eliminatoria, percentualMinimo, grauConhecimento, cor, ordemCiclo',
  topicos: '++id, disciplinaId, nome, status',
  sessoes: '++id, concursoId, disciplinaId, topico, tipo, data, duracaoSegundos, avaliacao, notas',
  revisoes: '++id, sessaoId, disciplinaId, topico, tipoRevisao, dataPrevista, dataRealizada, status',
  cicloConfig: '++id, concursoId, posicaoAtual, cicloJSON',
  questoes: '++id, concursoId, disciplinaId, topico, origem, resultado, data'
}).upgrade(tx => {
  return tx.table('disciplinas').toCollection().modify(disc => {
    disc.numQuestoes = disc.numQuestoes ?? disc.peso ?? 5;
    disc.pesoQuestao = disc.pesoQuestao ?? 1;
    disc.percentualMinimo = disc.percentualMinimo ?? (disc.eliminatoria ? 50 : null);
    disc.grauConhecimento = disc.grauConhecimento ?? 3;
  });
});

const BACKUP_TABLES = Object.freeze([
  'concursos', 'disciplinas', 'topicos', 'sessoes', 'revisoes', 'cicloConfig', 'questoes'
]);

/* ==== Camada de validação e normalização ==== */
const LIMITES = Object.freeze({ nome: 100, topico: 200, notas: 5000, origem: 100 });

const Validacao = {
  texto(valor, { campo = 'Texto', max = 120, obrigatorio = false, fallback = '' } = {}) {
    const base = valor ?? fallback;
    const texto = String(base).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (obrigatorio && !texto) throw new Error(`${campo} é obrigatório.`);
    if (texto.length > max) throw new Error(`${campo} deve ter no máximo ${max} caracteres.`);
    return texto;
  },
  inteiroFaixa(valor, { campo = 'Valor', min = 0, max = Number.MAX_SAFE_INTEGER, fallback = null } = {}) {
    const num = Number.parseInt(valor, 10);
    if (Number.isNaN(num)) {
      if (fallback !== null && fallback !== undefined) return fallback;
      throw new Error(`${campo} inválido.`);
    }
    if (num < min || num > max) throw new Error(`${campo} deve estar entre ${min} e ${max}.`);
    return num;
  },
  inteiroOpcional(valor, { campo = 'Valor', min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;
    return this.inteiroFaixa(valor, { campo, min, max });
  },
  percentual(valor, { campo = 'Percentual mínimo', fallback = 50 } = {}) {
    return this.inteiroFaixa(valor ?? fallback, { campo, min: 1, max: 100, fallback });
  },
  corHex(valor, { fallback = '#e94560' } = {}) {
    const cor = String(valor ?? fallback).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(cor)) return cor;
    if (/^#[0-9a-fA-F]{6}$/.test(fallback)) return fallback;
    throw new Error('Cor inválida. Use hexadecimal no formato #RRGGBB.');
  },
  dataISOouNull(valor, { campo = 'Data' } = {}) {
    if (!valor) return null;
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) throw new Error(`${campo} inválida.`);
    return d.toISOString();
  },
  enum(valor, opcoes, { campo = 'Valor', fallback = null } = {}) {
    if (opcoes.includes(valor)) return valor;
    if (fallback !== null && fallback !== undefined && opcoes.includes(fallback)) return fallback;
    throw new Error(`${campo} inválido.`);
  }
};

function normalizarConcursoInput(dados = {}, { parcial = false } = {}) {
  const payload = {};
  if (!parcial || dados.nome !== undefined) payload.nome = Validacao.texto(dados.nome, { campo: 'Nome do concurso', max: LIMITES.nome, obrigatorio: !parcial, fallback: 'Meu Concurso' });
  if (!parcial || dados.dataProva !== undefined) payload.dataProva = Validacao.dataISOouNull(dados.dataProva, { campo: 'Data da prova' });
  if (!parcial || dados.horasDiarias !== undefined) payload.horasDiarias = Validacao.inteiroFaixa(dados.horasDiarias ?? 4, { campo: 'Horas diárias', min: 1, max: 18, fallback: 4 });
  if (!parcial || dados.totalQuestoes !== undefined) payload.totalQuestoes = Validacao.inteiroOpcional(dados.totalQuestoes, { campo: 'Total de questões', min: 1, max: 5000 });
  return payload;
}

function normalizarDisciplinaInput(dados = {}, { parcial = false } = {}) {
  const payload = {};
  if (!parcial || dados.concursoId !== undefined) payload.concursoId = Validacao.inteiroFaixa(dados.concursoId, { campo: 'Concurso', min: 1, fallback: null });
  if (!parcial || dados.nome !== undefined) payload.nome = Validacao.texto(dados.nome, { campo: 'Nome da disciplina', max: LIMITES.nome, obrigatorio: !parcial, fallback: 'Nova Disciplina' });
  if (!parcial || dados.numQuestoes !== undefined) payload.numQuestoes = Validacao.inteiroFaixa(dados.numQuestoes ?? 5, { campo: 'Nº de questões', min: 1, max: 1000, fallback: 5 });
  if (!parcial || dados.pesoQuestao !== undefined) payload.pesoQuestao = Validacao.inteiroFaixa(dados.pesoQuestao ?? 1, { campo: 'Peso por questão', min: 1, max: 50, fallback: 1 });
  const eliminatoria = Boolean(dados?.eliminatoria ?? false);
  if (!parcial || dados.eliminatoria !== undefined) payload.eliminatoria = eliminatoria;
  if (!parcial || dados.percentualMinimo !== undefined || eliminatoria) payload.percentualMinimo = eliminatoria ? Validacao.percentual(dados.percentualMinimo, { campo: 'Percentual mínimo', fallback: 50 }) : null;
  if (!parcial || dados.grauConhecimento !== undefined) payload.grauConhecimento = Validacao.inteiroFaixa(dados.grauConhecimento ?? 3, { campo: 'Grau de conhecimento', min: 1, max: 5, fallback: 3 });
  if (!parcial || dados.cor !== undefined) payload.cor = Validacao.corHex(dados.cor, { fallback: '#e94560' });
  if (!parcial || dados.ordemCiclo !== undefined) payload.ordemCiclo = Validacao.inteiroFaixa(dados.ordemCiclo ?? 0, { campo: 'Ordem do ciclo', min: 0, max: 10000, fallback: 0 });
  return payload;
}

function normalizarSessaoInput(dados = {}) {
  return {
    concursoId: Validacao.inteiroFaixa(dados.concursoId, { campo: 'Concurso', min: 1, fallback: null }),
    disciplinaId: Validacao.inteiroFaixa(dados.disciplinaId, { campo: 'Disciplina', min: 1, fallback: null }),
    topico: Validacao.texto(dados.topico, { campo: 'Tópico', max: LIMITES.topico, obrigatorio: true }),
    tipo: Validacao.enum(dados.tipo ?? 'Novo', ['Novo', 'Revisão 1', 'Revisão 2', 'Revisão 3', 'Questões'], { campo: 'Tipo', fallback: 'Novo' }),
    data: Validacao.dataISOouNull(dados.data ?? new Date().toISOString(), { campo: 'Data da sessão' }) ?? new Date().toISOString(),
    duracaoSegundos: Validacao.inteiroFaixa(dados.duracaoSegundos ?? 0, { campo: 'Duração', min: 0, max: 86400, fallback: 0 }),
    avaliacao: Validacao.inteiroFaixa(dados.avaliacao ?? 0, { campo: 'Avaliação', min: 0, max: 5, fallback: 0 }),
    notas: Validacao.texto(dados.notas, { campo: 'Notas', max: LIMITES.notas, fallback: '' })
  };
}

function normalizarRevisaoInput(dados = {}, { parcial = false } = {}) {
  const payload = {};
  if (!parcial || dados.sessaoId !== undefined) payload.sessaoId = dados.sessaoId ? Validacao.inteiroFaixa(dados.sessaoId, { campo: 'Sessão', min: 1 }) : null;
  if (!parcial || dados.disciplinaId !== undefined) payload.disciplinaId = Validacao.inteiroFaixa(dados.disciplinaId, { campo: 'Disciplina', min: 1, fallback: null });
  if (!parcial || dados.topico !== undefined) payload.topico = Validacao.texto(dados.topico, { campo: 'Tópico', max: LIMITES.topico, obrigatorio: true });
  if (!parcial || dados.tipoRevisao !== undefined) payload.tipoRevisao = Validacao.enum(dados.tipoRevisao ?? 'R1', ['R1', 'R2', 'R3'], { campo: 'Tipo de revisão', fallback: 'R1' });
  if (!parcial || dados.dataPrevista !== undefined) payload.dataPrevista = Validacao.dataISOouNull(dados.dataPrevista, { campo: 'Data prevista' });
  if (!parcial || dados.dataRealizada !== undefined) payload.dataRealizada = Validacao.dataISOouNull(dados.dataRealizada, { campo: 'Data realizada' });
  if (!parcial || dados.status !== undefined) payload.status = Validacao.enum(dados.status ?? 'pendente', ['pendente', 'feita'], { campo: 'Status', fallback: 'pendente' });
  return payload;
}

function normalizarQuestaoInput(dados = {}) {
  return {
    concursoId: Validacao.inteiroFaixa(dados.concursoId, { campo: 'Concurso', min: 1, fallback: null }),
    disciplinaId: Validacao.inteiroFaixa(dados.disciplinaId, { campo: 'Disciplina', min: 1, fallback: null }),
    topico: Validacao.texto(dados.topico, { campo: 'Tópico', max: LIMITES.topico, obrigatorio: true }),
    origem: Validacao.texto(dados.origem, { campo: 'Origem', max: LIMITES.origem, fallback: '' }),
    resultado: Validacao.enum(dados.resultado ?? 'errou', ['acertou', 'acertou_duvida', 'errou', 'errou_desatencao'], { campo: 'Resultado', fallback: 'errou' }),
    data: Validacao.dataISOouNull(dados.data ?? new Date().toISOString(), { campo: 'Data da questão' }) ?? new Date().toISOString()
  };
}

/* ==== Helpers de data ==== */
const DataUtil = {
  hoje() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
  diasEntre(d1, d2) {
    const ms = new Date(d2).setHours(0,0,0,0) - new Date(d1).setHours(0,0,0,0);
    return Math.round(ms / (1000 * 60 * 60 * 24));
  },
  adicionarDias(data, dias) { const d = new Date(data); d.setDate(d.getDate() + dias); return d; },
  formatarData(data) { if (!data) return '-'; return new Date(data).toLocaleDateString('pt-BR'); },
  formatarDataHora(data) { if (!data) return '-'; return new Date(data).toLocaleString('pt-BR'); },
  toISO(data) { return new Date(data).toISOString(); },
  inicioDia(data) { const d = new Date(data); d.setHours(0,0,0,0); return d; },
  fimDia(data) { const d = new Date(data); d.setHours(23,59,59,999); return d; },
  inicioSemana(data) { const d = new Date(data); const dia = d.getDay(); const diff = dia === 0 ? 6 : dia - 1; d.setDate(d.getDate() - diff); d.setHours(0,0,0,0); return d; },
  fimSemana(data) { const d = this.inicioSemana(data); d.setDate(d.getDate() + 6); d.setHours(23,59,59,999); return d; },
  inicioMes(data) { const d = new Date(data); d.setDate(1); d.setHours(0,0,0,0); return d; },
  fimMes(data) { const d = new Date(data); d.setMonth(d.getMonth() + 1, 0); d.setHours(23,59,59,999); return d; }
};

/* ==== Helpers de tempo ==== */
const TempoUtil = {
  formatarMmSs(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  },
  formatarHhMm(segundos) {
    if (!segundos || segundos <= 0) return '0min';
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  },
  segundosParaHoras(segundos) { return (segundos || 0) / 3600; }
};

/* ==== Cálculo de Distribuição de Tempo ==== */
const DistribuicaoEstudo = {
  FATORES_CONHECIMENTO: { 1: 0.5, 2: 0.75, 3: 1.0, 4: 1.5, 5: 2.0 },
  LABELS_CONHECIMENTO: {
    1: 'Domino bem', 2: 'Conheço razoavelmente', 3: 'Conhecimento médio', 4: 'Pouco conhecimento', 5: 'Nunca estudei / muito difícil'
  },
  calcularImpacto(disciplina) { return (disciplina?.numQuestoes ?? 1) * (disciplina?.pesoQuestao ?? 1); },
  calcularPesoPonderado(disciplina) {
    const impacto = this.calcularImpacto(disciplina);
    const fator = this.FATORES_CONHECIMENTO[disciplina?.grauConhecimento ?? 3] ?? 1.0;
    return impacto * fator;
  },
  calcularDistribuicao(disciplinas, horasDiarias) {
    if (!disciplinas || disciplinas.length === 0) return [];
    const segundosDiarios = (horasDiarias ?? 4) * 3600;
    const pesos = disciplinas.map(d => ({ disciplina: d, pesoPonderado: this.calcularPesoPonderado(d), impactoNota: this.calcularImpacto(d) }));
    const somaTotal = pesos.reduce((acc, p) => acc + p.pesoPonderado, 0) || 1;
    return pesos.map(p => ({
      disciplina: p.disciplina,
      proporcao: p.pesoPonderado / somaTotal,
      segundosSugeridos: Math.round(segundosDiarios * (p.pesoPonderado / somaTotal)),
      pontosMax: p.impactoNota,
      pesoPonderado: p.pesoPonderado
    }));
  },
  calcularMinimoEliminatoria(disciplina) {
    if (!disciplina?.eliminatoria) return null;
    const percentual = disciplina?.percentualMinimo ?? 50;
    const questoes = disciplina?.numQuestoes ?? 1;
    return { percentual, minimoQuestoes: Math.ceil(questoes * (percentual / 100)), totalQuestoes: questoes };
  }
};

/* ==== CRUD: Concursos ==== */
const Concursos = {
  async ativo() {
    const lista = await db.concursos.orderBy('criadoEm').reverse().toArray();
    return lista?.[0] ?? null;
  },
  async listarTodos() { return db.concursos.orderBy('criadoEm').reverse().toArray(); },
  async criar(dados) {
    const payload = normalizarConcursoInput(dados);
    payload.criadoEm = new Date().toISOString();
    const existentes = await db.concursos.toArray();
    if ((existentes?.length ?? 0) > 0) {
      const principal = existentes[0];
      await db.concursos.update(principal.id, payload);
      for (const extra of existentes.slice(1)) await db.concursos.delete(extra.id);
      return principal.id;
    }
    return db.concursos.add(payload);
  },
  async atualizar(id, dados) {
    const payload = normalizarConcursoInput(dados ?? {}, { parcial: true });
    if (Object.keys(payload).length === 0) return 0;
    return db.concursos.update(id, payload);
  },
  async remover(id) { return db.concursos.delete(id); }
};

/* ==== CRUD: Disciplinas ==== */
const Disciplinas = {
  async listar(concursoId) {
    if (!concursoId) return [];
    const lista = await db.disciplinas.where({ concursoId }).toArray();
    return (lista ?? []).sort((a, b) => (a?.ordemCiclo ?? 0) - (b?.ordemCiclo ?? 0));
  },
  async obter(id) { return db.disciplinas.get(id); },
  async criar(dados) { return db.disciplinas.add(normalizarDisciplinaInput(dados)); },
  async atualizar(id, dados) {
    const payload = normalizarDisciplinaInput(dados ?? {}, { parcial: true });
    if (Object.keys(payload).length === 0) return 0;
    return db.disciplinas.update(id, payload);
  },
  async remover(id) { return db.disciplinas.delete(id); }
};

/* ==== CRUD: Sessões ==== */
const Sessoes = {
  async listar(concursoId) {
    if (!concursoId) return [];
    const lista = await db.sessoes.where({ concursoId }).toArray();
    return (lista ?? []).sort((a, b) => new Date(b?.data ?? 0) - new Date(a?.data ?? 0));
  },
  async criar(dados) { return db.sessoes.add(normalizarSessaoInput(dados)); },
  async remover(id) { return db.sessoes.delete(id); },
  async totalHoras(concursoId) {
    const lista = await this.listar(concursoId);
    const totalSeg = (lista ?? []).reduce((acc, s) => acc + (s?.duracaoSegundos ?? 0), 0);
    return TempoUtil.segundosParaHoras(totalSeg);
  }
};

/* ==== CRUD: Revisões ==== */
const Revisoes = {
  async listar(concursoId) {
    if (!concursoId) return [];
    const disciplinas = await Disciplinas.listar(concursoId);
    const ids = (disciplinas ?? []).map(d => d?.id);
    if (ids.length === 0) return [];
    const lista = await db.revisoes.where('disciplinaId').anyOf(ids).toArray();
    return (lista ?? []).sort((a, b) => new Date(a?.dataPrevista ?? 0) - new Date(b?.dataPrevista ?? 0));
  },
  async pendentes(concursoId) { return (await this.listar(concursoId)).filter(r => r?.status === 'pendente'); },
  async paraHoje(concursoId) {
    const fimHoje = DataUtil.fimDia(DataUtil.hoje());
    return (await this.pendentes(concursoId)).filter(r => new Date(r?.dataPrevista ?? 0) <= fimHoje);
  },
  async atrasadas(concursoId) {
    const hoje = DataUtil.hoje();
    return (await this.pendentes(concursoId)).filter(r => new Date(r?.dataPrevista ?? 0) < hoje);
  },
  async criar(dados) { return db.revisoes.add(normalizarRevisaoInput({ ...dados, tipoRevisao: dados?.tipoRevisao ?? 'R1', status: dados?.status ?? 'pendente' })); },
  async atualizar(id, dados) {
    const payload = normalizarRevisaoInput(dados ?? {}, { parcial: true });
    if (Object.keys(payload).length === 0) return 0;
    return db.revisoes.update(id, payload);
  },
  async marcarFeita(id) { return db.revisoes.update(id, { status: 'feita', dataRealizada: new Date().toISOString() }); },
  async criarParaSessao(sessao) {
    if (!sessao || sessao?.tipo !== 'Novo') return;
    const dataBase = new Date(sessao?.data ?? new Date());
    for (const i of [{ tipo: 'R1', dias: 1 }, { tipo: 'R2', dias: 7 }, { tipo: 'R3', dias: 30 }]) {
      await this.criar({
        sessaoId: sessao?.id,
        disciplinaId: sessao?.disciplinaId,
        topico: sessao?.topico ?? '',
        tipoRevisao: i.tipo,
        dataPrevista: DataUtil.adicionarDias(dataBase, i.dias).toISOString(),
        status: 'pendente'
      });
    }
  },
  async encontrarRevisaoCorrespondente(disciplinaId, topico, tipo) {
    if (!disciplinaId || !topico || !tipo) return null;
    const tipoMap = { 'Revisão 1': 'R1', 'Revisão 2': 'R2', 'Revisão 3': 'R3' };
    const tipoRev = tipoMap[tipo];
    if (!tipoRev) return null;
    const alvo = Validacao.texto(topico, { campo: 'Tópico', max: LIMITES.topico, fallback: '' }).toLowerCase();
    const lista = await db.revisoes.where({ disciplinaId, tipoRevisao: tipoRev }).toArray();
    const pendentes = (lista ?? []).filter(r => r?.status === 'pendente' && (r?.topico ?? '').toLowerCase().trim() === alvo);
    if (pendentes.length === 0) return null;
    pendentes.sort((a, b) => new Date(a?.dataPrevista ?? 0) - new Date(b?.dataPrevista ?? 0));
    return pendentes[0];
  }
};

/* ==== CRUD: Questões ==== */
const Questoes = {
  RESULTADOS: { ACERTOU: 'acertou', ACERTOU_DUVIDA: 'acertou_duvida', ERROU: 'errou', ERROU_DESATENCAO: 'errou_desatencao' },
  LABELS_RESULTADO: { acertou: 'Acertou', acertou_duvida: 'Acertou com dúvida', errou: 'Errou', errou_desatencao: 'Errou por desatenção' },
  ICONES_RESULTADO: { acertou: '✅', acertou_duvida: '🟡', errou: '❌', errou_desatencao: '⚠️' },
  async listar(concursoId) {
    if (!concursoId) return [];
    const lista = await db.questoes.where({ concursoId }).toArray();
    return (lista ?? []).sort((a, b) => new Date(b?.data ?? 0) - new Date(a?.data ?? 0));
  },
  async listarPorDisciplina(disciplinaId) {
    if (!disciplinaId) return [];
    const lista = await db.questoes.where({ disciplinaId }).toArray();
    return (lista ?? []).sort((a, b) => new Date(b?.data ?? 0) - new Date(a?.data ?? 0));
  },
  async criar(dados) { return db.questoes.add(normalizarQuestaoInput(dados)); },
  async remover(id) { return db.questoes.delete(id); },
  async estatisticasPorDisciplina(concursoId) {
    const todas = await this.listar(concursoId);
    const mapa = {};
    for (const q of todas) {
      const did = q?.disciplinaId;
      if (!did) continue;
      if (!mapa[did]) mapa[did] = { total: 0, acertou: 0, acertouDuvida: 0, errou: 0, errouDesatencao: 0 };
      mapa[did].total++;
      if (q.resultado === 'acertou') mapa[did].acertou++;
      else if (q.resultado === 'acertou_duvida') mapa[did].acertouDuvida++;
      else if (q.resultado === 'errou') mapa[did].errou++;
      else if (q.resultado === 'errou_desatencao') mapa[did].errouDesatencao++;
    }
    return mapa;
  },
  async estatisticasPorTopico(disciplinaId) {
    const lista = await this.listarPorDisciplina(disciplinaId);
    const mapa = {};
    for (const q of lista) {
      const topico = (q?.topico ?? '').toLowerCase().trim();
      if (!topico) continue;
      if (!mapa[topico]) mapa[topico] = { topico: q.topico, total: 0, acertou: 0, acertouDuvida: 0, errou: 0, errouDesatencao: 0 };
      mapa[topico].total++;
      if (q.resultado === 'acertou') mapa[topico].acertou++;
      else if (q.resultado === 'acertou_duvida') mapa[topico].acertouDuvida++;
      else if (q.resultado === 'errou') mapa[topico].errou++;
      else if (q.resultado === 'errou_desatencao') mapa[topico].errouDesatencao++;
    }
    return mapa;
  },
  taxaAcerto(stats) { if (!stats || stats.total === 0) return 0; return ((stats.acertou + stats.acertouDuvida) / stats.total) * 100; },
  taxaAcertoSolido(stats) { if (!stats || stats.total === 0) return 0; return (stats.acertou / stats.total) * 100; },
  async origensUsadas(concursoId) {
    const todas = await this.listar(concursoId);
    const origens = new Set();
    for (const q of todas) if (q?.origem) origens.add(q.origem);
    return [...origens].sort();
  },
  async topicosUsados(disciplinaId) {
    const lista = await this.listarPorDisciplina(disciplinaId);
    const topicos = new Set();
    for (const q of lista) if (q?.topico) topicos.add(q.topico);
    const sessoes = await db.sessoes.where({ disciplinaId }).toArray();
    for (const s of sessoes) if (s?.topico) topicos.add(s.topico);
    return [...topicos].sort();
  }
};

/* ==== CRUD: Ciclo ==== */
const Ciclo = {
  async obter(concursoId) {
    if (!concursoId) return null;
    const lista = await db.cicloConfig.where({ concursoId }).toArray();
    return lista?.[0] ?? null;
  },
  async salvar(concursoId, posicaoAtual, cicloJSON) {
    const existente = await this.obter(concursoId);
    if (existente) return db.cicloConfig.update(existente.id, { posicaoAtual: posicaoAtual ?? 0, cicloJSON: cicloJSON ?? '[]' });
    return db.cicloConfig.add({ concursoId, posicaoAtual: posicaoAtual ?? 0, cicloJSON: cicloJSON ?? '[]' });
  },
  async avancarPosicao(concursoId) {
    const cfg = await this.obter(concursoId);
    if (!cfg) return;
    let ciclo = [];
    try { ciclo = JSON.parse(cfg?.cicloJSON ?? '[]'); } catch { ciclo = []; }
    if (ciclo.length === 0) return;
    const nova = ((cfg?.posicaoAtual ?? 0) + 1) % ciclo.length;
    await db.cicloConfig.update(cfg.id, { posicaoAtual: nova });
  },
  async gerarAutomatico(concursoId, horasDiarias) {
    const disciplinas = await Disciplinas.listar(concursoId);
    if (!disciplinas || disciplinas.length === 0) return [];
    const distribuicao = DistribuicaoEstudo.calcularDistribuicao(disciplinas, horasDiarias ?? 4);
    const minPeso = Math.min(...distribuicao.map(d => d.pesoPonderado)) || 1;
    const expansao = [];
    for (const d of distribuicao) {
      const aparicoes = Math.max(1, Math.round(d.pesoPonderado / minPeso));
      for (let i = 0; i < aparicoes; i++) expansao.push(d.disciplina.id);
    }
    const ciclo = [];
    const restantes = [...expansao];
    let tentativas = 0;
    while (restantes.length > 0 && tentativas < 1000) {
      tentativas++;
      const ultimo = ciclo[ciclo.length - 1];
      const candidatos = restantes.map((id, idx) => ({ id, idx })).filter(x => x.id !== ultimo);
      const escolhidos = candidatos.length > 0 ? candidatos : restantes.map((id, idx) => ({ id, idx }));
      const sel = escolhidos[Math.floor(Math.random() * escolhidos.length)];
      ciclo.push(sel.id);
      restantes.splice(sel.idx, 1);
    }
    await this.salvar(concursoId, 0, JSON.stringify(ciclo));
    return ciclo;
  }
};

window.db = db;
window.Concursos = Concursos;
window.Disciplinas = Disciplinas;
window.Sessoes = Sessoes;
window.Revisoes = Revisoes;
window.Questoes = Questoes;
window.Ciclo = Ciclo;
window.DataUtil = DataUtil;
window.TempoUtil = TempoUtil;
window.DistribuicaoEstudo = DistribuicaoEstudo;
window.BACKUP_TABLES = BACKUP_TABLES;
window.ValidacaoDB = Validacao;
window.LIMITES_DADOS = LIMITES;
