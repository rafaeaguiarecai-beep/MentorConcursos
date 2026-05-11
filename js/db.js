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

/* ==== Schema v3: Sprint 2 — Inteligência Pedagógica ==== */
db.version(3).stores({
  concursos: '++id, nome, dataProva, horasDiarias, totalQuestoes, criadoEm',
  disciplinas: '++id, concursoId, nome, numQuestoes, pesoQuestao, eliminatoria, percentualMinimo, grauConhecimento, cor, ordemCiclo',
  topicos: '++id, disciplinaId, nome, status',
  sessoes: '++id, concursoId, disciplinaId, topico, tipo, data, duracaoSegundos, avaliacao, notas',
  revisoes: '++id, sessaoId, disciplinaId, topico, tipoRevisao, dataPrevista, dataRealizada, status',
  cicloConfig: '++id, concursoId, posicaoAtual, cicloJSON',
  questoes: '++id, concursoId, disciplinaId, topico, origem, resultado, data'
}).upgrade(tx => {
  tx.table('concursos').toCollection().modify(c => {
    c.diasEstudoSemana = c.diasEstudoSemana ?? [1, 2, 3, 4, 5, 6];
  });
  tx.table('revisoes').toCollection().modify(rev => {
    rev.fatorFacilidade = rev.fatorFacilidade ?? 2.5;
    const mapaInt = { R1: 1, R2: 7, R3: 30 };
    rev.intervaloAtual = rev.intervaloAtual ?? (mapaInt[rev.tipoRevisao] ?? 1);
    const mapaRep = { R1: 0, R2: 1, R3: 2 };
    rev.repeticoes = rev.repeticoes ?? (mapaRep[rev.tipoRevisao] ?? 0);
    rev.notaRevisao = rev.notaRevisao ?? null;
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
  },
  float(valor, { campo = 'Valor', min = -Infinity, max = Infinity, fallback = null } = {}) {
    const num = parseFloat(valor);
    if (Number.isNaN(num)) {
      if (fallback !== null && fallback !== undefined) return fallback;
      throw new Error(`${campo} inválido.`);
    }
    if (num < min || num > max) throw new Error(`${campo} deve estar entre ${min} e ${max}.`);
    return Math.round(num * 1000) / 1000;
  }
};

function normalizarConcursoInput(dados = {}, { parcial = false } = {}) {
  const payload = {};
  if (!parcial || dados.nome !== undefined) payload.nome = Validacao.texto(dados.nome, { campo: 'Nome do concurso', max: LIMITES.nome, obrigatorio: !parcial, fallback: 'Meu Concurso' });
  if (!parcial || dados.dataProva !== undefined) payload.dataProva = Validacao.dataISOouNull(dados.dataProva, { campo: 'Data da prova' });
  if (!parcial || dados.horasDiarias !== undefined) payload.horasDiarias = Validacao.inteiroFaixa(dados.horasDiarias ?? 4, { campo: 'Horas diárias', min: 1, max: 18, fallback: 4 });
  if (!parcial || dados.totalQuestoes !== undefined) payload.totalQuestoes = Validacao.inteiroOpcional(dados.totalQuestoes, { campo: 'Total de questões', min: 1, max: 5000 });
  if (!parcial || dados.diasEstudoSemana !== undefined) {
    const DEFAULT_DIAS = [1, 2, 3, 4, 5, 6];
    let dias = dados.diasEstudoSemana;
    if (!Array.isArray(dias)) dias = DEFAULT_DIAS;
    dias = [...new Set(dias.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    payload.diasEstudoSemana = dias.length > 0 ? dias : DEFAULT_DIAS;
  }
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
  if (!parcial || dados.fatorFacilidade !== undefined) {
    payload.fatorFacilidade = Validacao.float(dados.fatorFacilidade ?? 2.5, { campo: 'Fator de facilidade', min: 1.3, max: 5.0, fallback: 2.5 });
  }
  if (!parcial || dados.intervaloAtual !== undefined) {
    payload.intervaloAtual = Validacao.inteiroFaixa(dados.intervaloAtual ?? 1, { campo: 'Intervalo atual', min: 1, max: 36500, fallback: 1 });
  }
  if (!parcial || dados.repeticoes !== undefined) {
    payload.repeticoes = Validacao.inteiroFaixa(dados.repeticoes ?? 0, { campo: 'Repetições', min: 0, max: 10000, fallback: 0 });
  }
  if (!parcial || dados.notaRevisao !== undefined) {
    payload.notaRevisao = (dados.notaRevisao === null || dados.notaRevisao === undefined)
      ? null
      : Validacao.inteiroFaixa(dados.notaRevisao, { campo: 'Nota da revisão', min: 0, max: 5, fallback: null });
  }
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
  fimMes(data) { const d = new Date(data); d.setMonth(d.getMonth() + 1, 0); d.setHours(23,59,59,999); return d; },

  diasEstudoNaSemana(diasConfig, dataRef) {
    const DEFAULT_DIAS = [1, 2, 3, 4, 5, 6];
    const dias = Array.isArray(diasConfig) && diasConfig.length > 0 ? diasConfig : DEFAULT_DIAS;
    const ref = new Date(dataRef ?? new Date());
    const inicioSem = this.inicioSemana(ref);
    const hoje = this.hoje();
    let passados = 0;
    let restantes = 0;
    let proximoDiaEstudo = null;
    for (let offset = 0; offset < 7; offset++) {
      const dia = new Date(inicioSem);
      dia.setDate(dia.getDate() + offset);
      const diaJS = dia.getDay();
      if (!dias.includes(diaJS)) continue;
      if (dia <= hoje) { passados++; }
      else { restantes++; if (!proximoDiaEstudo) proximoDiaEstudo = new Date(dia); }
    }
    const hojeEhDiaEstudo = dias.includes(hoje.getDay());
    return { totalSemana: dias.length, passados, restantes, hojeEhDiaEstudo, proximoDiaEstudo };
  },

  nomeDiaSemana(diaJS, formato = 'curto') {
    const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const nomesLongos = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return formato === 'longo' ? (nomesLongos[diaJS] ?? '') : (nomes[diaJS] ?? '');
  },
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

  /* SPRINT 2.5: Grau efetivo baseado em desempenho real */
  grauDerivadoPorTaxa(taxa) {
    if (taxa === null || taxa === undefined) return null;
    if (taxa >= 85) return 1;
    if (taxa >= 70) return 2;
    if (taxa >= 50) return 3;
    if (taxa >= 30) return 4;
    return 5;
  },

  /**
   * Calcula grau efetivo combinando autoavaliação + desempenho.
   * @param {object} disciplina - objeto disciplina com grauConhecimento
   * @param {object|null} statsQuestoes - { total, acertou, acertouDuvida, ... } ou null
   * @param {object} opcoes - { minQuestoes: 10, pesoManual: 0.3, pesoReal: 0.7 }
   * @returns {{ grauEfetivo: number, grauManual: number, grauReal: number|null, taxaAcerto: number|null, fonteCalculo: string }}
   */
  grauEfetivo(disciplina, statsQuestoes, opcoes = {}) {
    const { minQuestoes = 10, pesoManual = 0.3, pesoReal = 0.7 } = opcoes;
    const grauManual = disciplina?.grauConhecimento ?? 3;
    const total = statsQuestoes?.total ?? 0;

    if (total < minQuestoes || !statsQuestoes) {
      return {
        grauEfetivo: grauManual,
        grauManual,
        grauReal: null,
        taxaAcerto: total > 0 ? ((statsQuestoes.acertou + (statsQuestoes.acertouDuvida ?? 0)) / total) * 100 : null,
        fonteCalculo: total === 0 ? 'manual' : `manual (< ${minQuestoes}q)`
      };
    }

    const taxaAcerto = ((statsQuestoes.acertou + (statsQuestoes.acertouDuvida ?? 0)) / total) * 100;
    const grauReal = this.grauDerivadoPorTaxa(taxaAcerto);

    const combinado = Math.round(grauManual * pesoManual + grauReal * pesoReal);
    const grauFinal = Math.max(1, Math.min(5, combinado));

    return {
      grauEfetivo: grauFinal,
      grauManual,
      grauReal,
      taxaAcerto: Math.round(taxaAcerto * 10) / 10,
      fonteCalculo: `${Math.round(pesoManual * 100)}% manual + ${Math.round(pesoReal * 100)}% real (${total}q)`
    };
  },

  calcularPesoPonderadoEfetivo(disciplina, statsQuestoes) {
    const impacto = this.calcularImpacto(disciplina);
    const info = this.grauEfetivo(disciplina, statsQuestoes);
    const fator = this.FATORES_CONHECIMENTO[info.grauEfetivo] ?? 1.0;
    return impacto * fator;
  },

  /**
   * Distribuição usando grau efetivo.
   * @param {Array} disciplinas
   * @param {number} horasDiarias
   * @param {object} statsQuestoesPorDisc - mapa { disciplinaId: { total, acertou, ... } }
   */
  calcularDistribuicaoEfetiva(disciplinas, horasDiarias, statsQuestoesPorDisc = {}) {
    if (!disciplinas || disciplinas.length === 0) return [];
    const segundosDiarios = (horasDiarias ?? 4) * 3600;

    const pesos = disciplinas.map(d => {
      const stats = statsQuestoesPorDisc[d.id] ?? null;
      const infoGrau = this.grauEfetivo(d, stats);
      const pesoPonderado = this.calcularPesoPonderadoEfetivo(d, stats);
      return {
        disciplina: d,
        pesoPonderado,
        impactoNota: this.calcularImpacto(d),
        infoGrau
      };
    });

    const somaTotal = pesos.reduce((acc, p) => acc + p.pesoPonderado, 0) || 1;

    return pesos.map(p => ({
      disciplina: p.disciplina,
      proporcao: p.pesoPonderado / somaTotal,
      segundosSugeridos: Math.round(segundosDiarios * (p.pesoPonderado / somaTotal)),
      pontosMax: p.impactoNota,
      pesoPonderado: p.pesoPonderado,
      infoGrau: p.infoGrau
    }));
  },

  /* Mantém o original para compatibilidade — usado onde não temos stats */
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

/* ==== CRUD: Revisões (com SM-2) ==== */
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
  async criar(dados) {
    const payload = normalizarRevisaoInput({
      ...dados,
      tipoRevisao: dados?.tipoRevisao ?? 'R1',
      status: dados?.status ?? 'pendente',
      fatorFacilidade: dados?.fatorFacilidade ?? 2.5,
      intervaloAtual: dados?.intervaloAtual ?? 1,
      repeticoes: dados?.repeticoes ?? 0,
      notaRevisao: dados?.notaRevisao ?? null
    });
    return db.revisoes.add(payload);
  },
  async atualizar(id, dados) {
    const payload = normalizarRevisaoInput(dados ?? {}, { parcial: true });
    if (Object.keys(payload).length === 0) return 0;
    return db.revisoes.update(id, payload);
  },

  calcularSM2(nota, fatorAtual = 2.5, repeticoesAtuais = 0, intervaloAtual = 1) {
    const q = Math.max(0, Math.min(5, Math.round(nota)));
    let ef = fatorAtual;
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < 1.3) ef = 1.3;
    let novasRepeticoes;
    let novoIntervalo;
    if (q < 3) {
      novasRepeticoes = 0;
      novoIntervalo = 1;
    } else {
      novasRepeticoes = repeticoesAtuais + 1;
      if (novasRepeticoes === 1) novoIntervalo = 1;
      else if (novasRepeticoes === 2) novoIntervalo = 6;
      else novoIntervalo = Math.round(intervaloAtual * ef);
    }
    return {
      novoFator: Math.round(ef * 1000) / 1000,
      novoIntervalo: Math.max(1, novoIntervalo),
      novasRepeticoes
    };
  },

  async marcarFeita(id, nota) {
    const revisao = await db.revisoes.get(id);
    if (!revisao) throw new Error('Revisão não encontrada.');
    const agora = new Date().toISOString();
    if (nota === null || nota === undefined) {
      return db.revisoes.update(id, { status: 'feita', dataRealizada: agora });
    }
    const notaInt = Math.max(0, Math.min(5, Math.round(nota)));
    const resultado = this.calcularSM2(
      notaInt,
      revisao.fatorFacilidade ?? 2.5,
      revisao.repeticoes ?? 0,
      revisao.intervaloAtual ?? 1
    );
    await db.revisoes.update(id, {
      status: 'feita',
      dataRealizada: agora,
      notaRevisao: notaInt,
      fatorFacilidade: resultado.novoFator
    });
    const proximaData = DataUtil.adicionarDias(new Date(), resultado.novoIntervalo).toISOString();
    const ordemTipos = ['R1', 'R2', 'R3'];
    const idxAtual = ordemTipos.indexOf(revisao.tipoRevisao ?? 'R1');
    const proximoTipo = ordemTipos[Math.min(idxAtual + 1, ordemTipos.length - 1)] ?? 'R3';
    await this.criar({
      sessaoId: revisao.sessaoId,
      disciplinaId: revisao.disciplinaId,
      topico: revisao.topico,
      tipoRevisao: notaInt < 3 ? revisao.tipoRevisao : proximoTipo,
      dataPrevista: proximaData,
      status: 'pendente',
      fatorFacilidade: resultado.novoFator,
      intervaloAtual: resultado.novoIntervalo,
      repeticoes: resultado.novasRepeticoes,
      notaRevisao: null
    });
    return resultado;
  },

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
        status: 'pendente',
        fatorFacilidade: 2.5,
        intervaloAtual: i.dias,
        repeticoes: 0,
        notaRevisao: null
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
  },

  async estatisticasSM2(disciplinaId, topico) {
    if (!disciplinaId || !topico) return null;
    const alvo = topico.toLowerCase().trim();
    const todas = await db.revisoes.where({ disciplinaId }).toArray();
    const doTopico = todas.filter(r => (r?.topico ?? '').toLowerCase().trim() === alvo);
    const feitas = doTopico.filter(r => r.status === 'feita' && r.notaRevisao !== null);
    if (feitas.length === 0) return null;
    const ultimaFeita = feitas.sort((a, b) => new Date(b.dataRealizada) - new Date(a.dataRealizada))[0];
    return {
      totalRevisoes: feitas.length,
      ultimaNota: ultimaFeita.notaRevisao,
      fatorAtual: ultimaFeita.fatorFacilidade ?? 2.5,
      ultimaData: ultimaFeita.dataRealizada
    };
  },

  /* SPRINT 2.5: Buscar última revisão feita por tópico em todas as disciplinas do concurso */
  async mapaUltimaRevisaoPorTopico(concursoId) {
    if (!concursoId) return {};
    const todas = await this.listar(concursoId);
    const feitas = todas.filter(r => r?.status === 'feita' && r?.dataRealizada);
    const mapa = {};
    for (const r of feitas) {
      const chave = `${r.disciplinaId}::${(r.topico ?? '').toLowerCase().trim()}`;
      if (!mapa[chave] || new Date(r.dataRealizada) > new Date(mapa[chave].dataRealizada)) {
        mapa[chave] = r;
      }
    }
    return mapa;
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

/* ==== SPRINT 2.5: Módulo Diagnóstico ==== */
const Diagnostico = {
  /**
   * Análise completa de pontos fracos e sugestões.
   * @param {number} concursoId
   * @returns {Promise<{topicosCriticos, semRevisaoRecente, eliminatoriasEmRisco, sugestaoDoDia}>}
   */
  async analisar(concursoId) {
    if (!concursoId) return { topicosCriticos: [], semRevisaoRecente: [], eliminatoriasEmRisco: [], sugestaoDoDia: null };

    const disciplinas = await Disciplinas.listar(concursoId);
    const mapaDisc = {};
    for (const d of disciplinas) mapaDisc[d.id] = d;

    const statsQuestoes = await Questoes.estatisticasPorDisciplina(concursoId);
    const mapaUltimaRevisao = await Revisoes.mapaUltimaRevisaoPorTopico(concursoId);
    const hoje = DataUtil.hoje();

    // ---- 1. Tópicos críticos (taxa < 70%, mínimo 5 questões) ----
    const topicosCriticos = [];
    for (const d of disciplinas) {
      const statsPorTopico = await Questoes.estatisticasPorTopico(d.id);
      for (const chave of Object.keys(statsPorTopico)) {
        const st = statsPorTopico[chave];
        if (st.total < 5) continue;
        const taxa = Questoes.taxaAcerto(st);
        if (taxa < 70) {
          topicosCriticos.push({
            disciplinaId: d.id,
            disciplinaNome: d.nome,
            disciplinaCor: d.cor,
            topico: st.topico,
            taxa: Math.round(taxa * 10) / 10,
            taxaSolida: Math.round(Questoes.taxaAcertoSolido(st) * 10) / 10,
            total: st.total,
            erros: st.errou + st.errouDesatencao,
            nivel: taxa < 50 ? 'critico' : 'atencao'
          });
        }
      }
    }
    topicosCriticos.sort((a, b) => a.taxa - b.taxa);

    // ---- 2. Sem revisão recente (>30 dias desde última revisão feita) ----
    const semRevisaoRecente = [];
    const sessoes = await Sessoes.listar(concursoId);
    const topicosEstudados = new Map(); // chave → { disciplinaId, topico, ultimaSessaoData }
    for (const s of sessoes) {
      const chave = `${s.disciplinaId}::${(s.topico ?? '').toLowerCase().trim()}`;
      if (!topicosEstudados.has(chave) || new Date(s.data) > new Date(topicosEstudados.get(chave).ultimaSessaoData)) {
        topicosEstudados.set(chave, { disciplinaId: s.disciplinaId, topico: s.topico, ultimaSessaoData: s.data });
      }
    }
    for (const [chave, info] of topicosEstudados) {
      const ultimaRev = mapaUltimaRevisao[chave];
      const dataRef = ultimaRev ? ultimaRev.dataRealizada : info.ultimaSessaoData;
      const diasDesde = DataUtil.diasEntre(new Date(dataRef), hoje);
      if (diasDesde >= 30) {
        const d = mapaDisc[info.disciplinaId];
        if (!d) continue;
        semRevisaoRecente.push({
          disciplinaId: d.id,
          disciplinaNome: d.nome,
          disciplinaCor: d.cor,
          topico: info.topico,
          diasDesdeUltimaRevisao: diasDesde,
          ultimaData: dataRef
        });
      }
    }
    semRevisaoRecente.sort((a, b) => b.diasDesdeUltimaRevisao - a.diasDesdeUltimaRevisao);

    // ---- 3. Eliminatórias em risco ----
    const eliminatoriasEmRisco = [];
    for (const d of disciplinas) {
      if (!d.eliminatoria) continue;
      const info = DistribuicaoEstudo.calcularMinimoEliminatoria(d);
      if (!info) continue;
      const stats = statsQuestoes[d.id];
      if (!stats || stats.total < 5) {
        eliminatoriasEmRisco.push({
          disciplinaId: d.id,
          disciplinaNome: d.nome,
          disciplinaCor: d.cor,
          percentualMinimo: info.percentual,
          taxaAtual: null,
          totalQuestoes: stats?.total ?? 0,
          status: 'sem_dados',
          deficit: null
        });
        continue;
      }
      const taxa = Questoes.taxaAcerto(stats);
      if (taxa < info.percentual) {
        eliminatoriasEmRisco.push({
          disciplinaId: d.id,
          disciplinaNome: d.nome,
          disciplinaCor: d.cor,
          percentualMinimo: info.percentual,
          taxaAtual: Math.round(taxa * 10) / 10,
          totalQuestoes: stats.total,
          status: 'em_risco',
          deficit: Math.round((info.percentual - taxa) * 10) / 10
        });
      }
    }
    eliminatoriasEmRisco.sort((a, b) => {
      if (a.status === 'sem_dados' && b.status !== 'sem_dados') return 1;
      if (a.status !== 'sem_dados' && b.status === 'sem_dados') return -1;
      return (b.deficit ?? 999) - (a.deficit ?? 999);
    });

    // ---- 4. Sugestão do dia ----
    let sugestaoDoDia = null;
    const candidatos = [];

    // Candidatos: eliminatórias em risco
    for (const e of eliminatoriasEmRisco) {
      candidatos.push({
        disciplinaId: e.disciplinaId,
        disciplinaNome: e.disciplinaNome,
        disciplinaCor: e.disciplinaCor,
        topico: null,
        motivo: e.status === 'sem_dados'
          ? `Eliminatória sem questões — resolva pelo menos 10 para ter diagnóstico`
          : `Eliminatória em risco: ${e.taxaAtual}% (mínimo ${e.percentualMinimo}%)`,
        prioridade: 100 + (e.deficit ?? 50),
        tipo: 'eliminatoria'
      });
    }

    // Candidatos: tópicos críticos
    for (const t of topicosCriticos.slice(0, 10)) {
      const pesoDisc = mapaDisc[t.disciplinaId] ? DistribuicaoEstudo.calcularImpacto(mapaDisc[t.disciplinaId]) : 1;
      candidatos.push({
        disciplinaId: t.disciplinaId,
        disciplinaNome: t.disciplinaNome,
        disciplinaCor: t.disciplinaCor,
        topico: t.topico,
        motivo: `Taxa de acerto: ${t.taxa}% em ${t.total} questões`,
        prioridade: 80 + (70 - t.taxa) * 0.5 + pesoDisc * 0.2,
        tipo: 'topico_fraco'
      });
    }

    // Candidatos: tópicos sem revisão
    for (const s of semRevisaoRecente.slice(0, 10)) {
      const pesoDisc = mapaDisc[s.disciplinaId] ? DistribuicaoEstudo.calcularImpacto(mapaDisc[s.disciplinaId]) : 1;
      candidatos.push({
        disciplinaId: s.disciplinaId,
        disciplinaNome: s.disciplinaNome,
        disciplinaCor: s.disciplinaCor,
        topico: s.topico,
        motivo: `Sem revisão há ${s.diasDesdeUltimaRevisao} dias`,
        prioridade: 50 + Math.min(50, s.diasDesdeUltimaRevisao * 0.5) + pesoDisc * 0.1,
        tipo: 'sem_revisao'
      });
    }

    candidatos.sort((a, b) => b.prioridade - a.prioridade);
    if (candidatos.length > 0) {
      sugestaoDoDia = candidatos[0];
    }

    return { topicosCriticos, semRevisaoRecente, eliminatoriasEmRisco, sugestaoDoDia };
  }
};

/* ==== Schema v4: Sprint 3 — Conquistas e Simulados ==== */
db.version(4).stores({
  concursos: '++id, nome, dataProva, horasDiarias, totalQuestoes, criadoEm',
  disciplinas: '++id, concursoId, nome, numQuestoes, pesoQuestao, eliminatoria, percentualMinimo, grauConhecimento, cor, ordemCiclo',
  topicos: '++id, disciplinaId, nome, status',
  sessoes: '++id, concursoId, disciplinaId, topico, tipo, data, duracaoSegundos, avaliacao, notas',
  revisoes: '++id, sessaoId, disciplinaId, topico, tipoRevisao, dataPrevista, dataRealizada, status',
  cicloConfig: '++id, concursoId, posicaoAtual, cicloJSON',
  questoes: '++id, concursoId, disciplinaId, topico, origem, resultado, data',
   conquistas: '++id, &chave, desbloqueadaEm',
  simulados: '++id, concursoId, data, status'
});

/* ==== Catálogo de Conquistas ==== */
const CATALOGO_CONQUISTAS = Object.freeze([
  { chave: 'primeira_sessao', nome: 'Primeiro Passo', descricao: 'Completou a primeira sessão de estudo', icone: '🎯', condicao: '1 sessão registrada' },
  { chave: 'maratona_1h', nome: 'Maratonista', descricao: 'Estudou 1 hora sem parar', icone: '⏱️', condicao: '1 sessão ≥ 3600s' },
  { chave: 'sequencia_7', nome: 'Semana Perfeita', descricao: 'Estudou 7 dias seguidos', icone: '🔥', condicao: '7 dias consecutivos com sessão' },
  { chave: 'sequencia_30', nome: 'Mês de Ferro', descricao: 'Estudou 30 dias seguidos', icone: '💪', condicao: '30 dias consecutivos' },
  { chave: 'revisao_sm2_5', nome: 'Memória de Elefante', descricao: 'Nota 5 em uma revisão SM-2', icone: '🐘', condicao: 'nota 5 no SM-2' },
  { chave: 'todas_disc', nome: 'Generalista', descricao: 'Estudou todas as disciplinas ao menos 1x', icone: '📚', condicao: 'sessão em cada disciplina do concurso' },
  { chave: 'horas_50', nome: 'Dedicação', descricao: '50 horas totais de estudo', icone: '⭐', condicao: 'soma sessões ≥ 180000s' },
  { chave: 'horas_100', nome: 'Centurião', descricao: '100 horas totais de estudo', icone: '🏆', condicao: 'soma sessões ≥ 360000s' },
  { chave: 'questoes_100', nome: 'Questionador', descricao: 'Respondeu 100 questões', icone: '❓', condicao: '100 registros em questoes' },
  { chave: 'questoes_500', nome: 'Metralhadora', descricao: 'Respondeu 500 questões', icone: '🎯', condicao: '500 registros' },
  { chave: 'meta_semanal', nome: 'Objetivo Cumprido', descricao: 'Atingiu a meta semanal', icone: '✅', condicao: 'horas semana ≥ meta' },
  { chave: 'ciclo_completo', nome: 'Ciclo Fechado', descricao: 'Completou um ciclo inteiro', icone: '🔄', condicao: 'todas posições do ciclo concluídas' },
  { chave: 'backup_first', nome: 'Prevenido', descricao: 'Fez o primeiro backup', icone: '💾', condicao: '1 backup registrado' },
  { chave: 'diagnostico_limpo', nome: 'Nota 10', descricao: 'Diagnóstico sem alertas críticos', icone: '🌟', condicao: '0 tópicos críticos no diagnóstico' }
]);

/* ==== Módulo Conquistas ==== */
const Conquistas = {
  async verificar() {
    const concurso = await Concursos.ativo();
    if (!concurso) return [];

    const sessoes = await Sessoes.listar(concurso.id);
    const totalSeg = (sessoes ?? []).reduce((acc, s) => acc + (s?.duracaoSegundos ?? 0), 0);
    const questoesTodas = await Questoes.listar(concurso.id);
    const disciplinas = await Disciplinas.listar(concurso.id);
    const revisoes = await Revisoes.listar(concurso.id);
    const cfgCiclo = await Ciclo.obter(concurso.id);
    const diagnostico = await Diagnostico.analisar(concurso.id);
    // Backup module may not be loaded yet (backup.js loads after db.js)
    let backupFeito = false;
    try { if (typeof Backup !== 'undefined' && Backup.ultimoBackup) backupFeito = Backup.ultimoBackup() !== null; } catch (e) {}

    const jaDesbloqueadas = await db.conquistas.toArray();
    const chavesDesbloqueadas = new Set(jaDesbloqueadas.map(c => c.chave));
    const novas = [];

    const tentarDesbloquear = async (chave) => {
      if (chavesDesbloqueadas.has(chave)) return;
      await db.conquistas.add({ chave, desbloqueadaEm: new Date().toISOString(), visualizada: false });
      const catalogo = CATALOGO_CONQUISTAS.find(c => c.chave === chave);
      if (catalogo) novas.push(catalogo);
    };

    // primeira_sessao
    if ((sessoes?.length ?? 0) >= 1) await tentarDesbloquear('primeira_sessao');

    // maratona_1h
    if ((sessoes ?? []).some(s => (s?.duracaoSegundos ?? 0) >= 3600)) await tentarDesbloquear('maratona_1h');

    // sequencia_7 e sequencia_30
    if ((sessoes?.length ?? 0) > 0) {
      const diasComSessao = await Streak.diasComSessao(concurso.id, 365);
      const datas = [...diasComSessao].map(d => new Date(d).toDateString()).sort();
      let streakMax = 0;
      let streakAtual = 0;
      for (let i = 0; i < datas.length; i++) {
        if (i === 0) { streakAtual = 1; }
        else {
          const prev = new Date(datas[i - 1]);
          const curr = new Date(datas[i]);
          const diff = (curr - prev) / 86400000;
          if (Math.abs(diff - 1) < 0.5) { streakAtual++; }
          else { streakAtual = 1; }
        }
        if (streakAtual > streakMax) streakMax = streakAtual;
      }
      // Verifica também se a data mais recente é hoje ou ontem
      if (datas.length > 0) {
        const hoje = new Date().toDateString();
        const ontem = new Date(Date.now() - 86400000).toDateString();
        const ultimaData = datas[datas.length - 1];
        if (ultimaData !== hoje && ultimaData !== ontem) streakAtual = 0;
      }
      if (streakMax >= 7) await tentarDesbloquear('sequencia_7');
      if (streakMax >= 30) await tentarDesbloquear('sequencia_30');
    }

    // revisao_sm2_5
    if ((revisoes ?? []).some(r => r?.notaRevisao === 5)) await tentarDesbloquear('revisao_sm2_5');

    // todas_disc
    if ((disciplinas ?? []).length > 0) {
      const discIds = new Set(disciplinas.map(d => d.id));
      const discComSessao = new Set();
      for (const s of (sessoes ?? [])) { if (s?.disciplinaId) discComSessao.add(s.disciplinaId); }
      let todasCobertas = true;
      for (const id of discIds) { if (!discComSessao.has(id)) { todasCobertas = false; break; } }
      if (todasCobertas) await tentarDesbloquear('todas_disc');
    }

    // horas_50 e horas_100
    if (totalSeg >= 180000) await tentarDesbloquear('horas_50');
    if (totalSeg >= 360000) await tentarDesbloquear('horas_100');

    // questoes_100 e questoes_500
    if ((questoesTodas?.length ?? 0) >= 100) await tentarDesbloquear('questoes_100');
    if ((questoesTodas?.length ?? 0) >= 500) await tentarDesbloquear('questoes_500');

    // meta_semanal
    if (concurso && (sessoes?.length ?? 0) > 0) {
      const diasEstudoSemana = Array.isArray(concurso.diasEstudoSemana) && concurso.diasEstudoSemana.length > 0
        ? concurso.diasEstudoSemana : [1, 2, 3, 4, 5, 6];
      const infoDias = DataUtil.diasEstudoNaSemana(diasEstudoSemana);
      const metaSemanalSeg = (concurso.horasDiarias ?? 4) * 3600 * infoDias.totalSemana;
      const inicioSem = DataUtil.inicioSemana(new Date());
      const fimSem = DataUtil.fimSemana(new Date());
      const sessSemana = (sessoes ?? []).filter(s => {
        const d = new Date(s?.data);
        return d >= inicioSem && d <= fimSem;
      });
      const segEstudadosSemana = sessSemana.reduce((a, s) => a + (s?.duracaoSegundos ?? 0), 0);
      if (segEstudadosSemana >= metaSemanalSeg) await tentarDesbloquear('meta_semanal');
    }

    // ciclo_completo
    if (cfgCiclo?.cicloJSON) {
      let ciclo = [];
      try { ciclo = JSON.parse(cfgCiclo.cicloJSON); } catch { ciclo = []; }
      if (ciclo.length > 0 && cfgCiclo.posicaoAtual === 0) {
        // Já completou o ciclo se a posição voltou ao início (via avanço cíclico)
        const todasPosicoes = new Set();
        for (const s of (sessoes ?? [])) {
          if (s?.disciplinaId && ciclo.includes(s.disciplinaId)) todasPosicoes.add(s.disciplinaId);
        }
        if (todasPosicoes.size >= ciclo.length) await tentarDesbloquear('ciclo_completo');
      }
    }

    // backup_first
    if (backupFeito) await tentarDesbloquear('backup_first');

    // diagnostico_limpo
    if ((diagnostico?.topicosCriticos?.length ?? 0) === 0 && (sessoes?.length ?? 0) > 0) {
      await tentarDesbloquear('diagnostico_limpo');
    }

    return novas;
  },

  async listar() {
    return db.conquistas.orderBy('desbloqueadaEm').reverse().toArray();
  },

  async totalDesbloqueadas() {
    return db.conquistas.count();
  },

  async marcarVisualizada(chave) {
    const c = await db.conquistas.where({ chave }).first();
    if (c && !c.visualizada) await db.conquistas.update(c.id, { visualizada: true });
  },

  catalogo: CATALOGO_CONQUISTAS
};

/* ==== Módulo Streak ==== */
const Streak = {
  async calcular(concursoId) {
    if (!concursoId) return { atual: 0, maximo: 0, diasEstaSemana: 0 };
    const diasSet = await this.diasComSessao(concursoId, 365);
    const datas = [...diasSet].map(d => new Date(d).toDateString()).sort();
    if (datas.length === 0) return { atual: 0, maximo: 0, diasEstaSemana: 0 };

    let streakMax = 0;
    let streakAtual = 0;
    for (let i = 0; i < datas.length; i++) {
      if (i === 0) { streakAtual = 1; }
      else {
        const prev = new Date(datas[i - 1]);
        const curr = new Date(datas[i]);
        const diff = (curr - prev) / 86400000;
        if (Math.abs(diff - 1) < 0.5) { streakAtual++; }
        else { streakAtual = 1; }
      }
      if (streakAtual > streakMax) streakMax = streakAtual;
    }

    // Streak atual: verifica se a última data é hoje
    const hoje = new Date().toDateString();
    const ultimaData = datas[datas.length - 1];
    if (ultimaData !== hoje) {
      const ontem = new Date(Date.now() - 86400000).toDateString();
      if (ultimaData !== ontem) streakAtual = 0;
    }

    // dias esta semana
    const inicioSem = DataUtil.inicioSemana(new Date());
    let diasEstaSemana = 0;
    for (const d of diasSet) {
      const dataD = new Date(d);
      if (dataD >= inicioSem) diasEstaSemana++;
    }

    return { atual: streakAtual, maximo: streakMax, diasEstaSemana };
  },

  async diasComSessao(concursoId, ultimosDias) {
    if (!concursoId) return new Set();
    const sessoes = await Sessoes.listar(concursoId);
    const limite = ultimosDias ? DataUtil.adicionarDias(new Date(), -ultimosDias) : null;
    const dias = new Set();
    for (const s of (sessoes ?? [])) {
      if (!s?.data) continue;
      const d = new Date(s.data);
      if (limite && d < limite) continue;
      dias.add(d.toISOString().split('T')[0]);
    }
    return dias;
  }
};

/* ==== Módulo Simulados ==== */
const Simulados = {
  async criar(concursoId, titulo, duracaoLimite, questoes) {
    const payload = {
      concursoId: Validacao.inteiroFaixa(concursoId, { campo: 'Concurso', min: 1, fallback: null }),
      titulo: Validacao.texto(titulo, { campo: 'Título', max: 200, obrigatorio: true }),
      duracaoLimite: Validacao.inteiroFaixa(duracaoLimite ?? 3600, { campo: 'Duração', min: 600, max: 14400, fallback: 3600 }),
      status: 'em_andamento',
      respostas: Array.isArray(questoes) ? questoes.map(q => ({
        disciplinaId: q?.disciplinaId ?? null,
        topicoId: q?.topicoId ?? null,
        enunciado: Validacao.texto(q?.enunciado ?? '', { campo: 'Enunciado', max: 5000, fallback: '' }),
        alternativas: Array.isArray(q?.alternativas) ? q.alternativas.map(a => Validacao.texto(a, { campo: 'Alternativa', max: 500, fallback: '' })) : [],
        respostaCorreta: Validacao.inteiroFaixa(q?.respostaCorreta ?? 0, { campo: 'Resposta correta', min: 0, max: 20, fallback: 0 }),
        respostaDada: null,
        tempo: 0
      })) : [],
      resultado: null,
      data: new Date().toISOString(),
      criadoEm: new Date().toISOString(),
      finalizadoEm: null
    };
    return db.simulados.add(payload);
  },

  async responder(simuladoId, indice, resposta, tempo) {
    const sim = await db.simulados.get(simuladoId);
    if (!sim) throw new Error('Simulado não encontrado.');
    if (sim.status !== 'em_andamento') throw new Error('Simulado já finalizado.');
    const respostas = [...(sim.respostas ?? [])];
    if (indice < 0 || indice >= respostas.length) throw new Error('Índice inválido.');
    respostas[indice] = {
      ...respostas[indice],
      respostaDada: Validacao.inteiroFaixa(resposta, { campo: 'Resposta', min: 0, max: 20, fallback: null }),
      tempo: Validacao.inteiroFaixa(tempo ?? 0, { campo: 'Tempo', min: 0 })
    };
    return db.simulados.update(simuladoId, { respostas });
  },

  async finalizar(simuladoId) {
    const sim = await db.simulados.get(simuladoId);
    if (!sim) throw new Error('Simulado não encontrado.');
    if (sim.status !== 'em_andamento') throw new Error('Simulado já finalizado.');

    const respostas = sim.respostas ?? [];
    let acertos = 0;
    let erros = 0;
    const porDisciplina = {};
    let tempoTotal = 0;

    for (const r of respostas) {
      tempoTotal += r?.tempo ?? 0;
      const acertou = r?.respostaDada !== null && r?.respostaDada === r?.respostaCorreta;
      if (acertou) acertos++;
      else if (r?.respostaDada !== null) erros++;

      const did = r?.disciplinaId;
      if (did) {
        if (!porDisciplina[did]) porDisciplina[did] = { total: 0, acertos: 0, erros: 0 };
        porDisciplina[did].total++;
        if (acertou) porDisciplina[did].acertos++;
        else if (r?.respostaDada !== null) porDisciplina[did].erros++;
      }
    }

    const totalRespondidas = acertos + erros;
    const nota = totalRespondidas > 0 ? Math.round((acertos / totalRespondidas) * 1000) / 10 : 0;

    const resultado = {
      nota,
      acertos,
      erros,
      tempo: tempoTotal,
      porDisciplina
    };

    return db.simulados.update(simuladoId, {
      status: 'finalizado',
      resultado,
      finalizadoEm: new Date().toISOString(),
      respostas
    });
  },

  async cancelar(simuladoId) {
    const sim = await db.simulados.get(simuladoId);
    if (!sim) throw new Error('Simulado não encontrado.');
    return db.simulados.update(simuladoId, { status: 'cancelado', finalizadoEm: new Date().toISOString() });
  },

  async obter(simuladoId) {
    return db.simulados.get(simuladoId);
  },

  async listar(concursoId) {
    if (!concursoId) return [];
    const lista = await db.simulados.where({ concursoId }).toArray();
    return (lista ?? []).sort((a, b) => new Date(b?.criadoEm ?? 0) - new Date(a?.criadoEm ?? 0));
  },

  async estatisticas(concursoId) {
    const lista = await this.listar(concursoId);
    const finalizados = lista.filter(s => s?.status === 'finalizado' && s?.resultado);
    if (finalizados.length === 0) return { media: null, melhor: null, pior: null, totalRealizados: 0 };

    let somaNota = 0;
    let melhor = null;
    let pior = null;
    for (const s of finalizados) {
      somaNota += s.resultado.nota ?? 0;
      if (!melhor || s.resultado.nota > melhor.nota) melhor = { id: s.id, titulo: s.titulo, nota: s.resultado.nota, data: s.finalizadoEm };
      if (!pior || s.resultado.nota < pior.nota) pior = { id: s.id, titulo: s.titulo, nota: s.resultado.nota, data: s.finalizadoEm };
    }

    return {
      media: Math.round((somaNota / finalizados.length) * 10) / 10,
      melhor,
      pior,
      totalRealizados: finalizados.length
    };
  },

  async gerarQuestoes(concursoId, config) {
    const { totalQuestoes = 30, distribuicao = 'proporcional' } = config ?? {};
    const disciplinas = await Disciplinas.listar(concursoId);
    if (!disciplinas || disciplinas.length === 0) return [];

    // Tenta usar questões já cadastradas
    const questoesExistentes = await Questoes.listar(concursoId);
    if (questoesExistentes.length >= totalQuestoes) {
      return this._gerarDasExistentes(questoesExistentes, disciplinas, totalQuestoes, distribuicao);
    }

    // Gera templates vazios
    return this._gerarTemplates(disciplinas, totalQuestoes, distribuicao);
  },

  _gerarDasExistentes(questoes, disciplinas, total, distribuicao) {
    const porDisc = {};
    for (const q of questoes) {
      if (!porDisc[q.disciplinaId]) porDisc[q.disciplinaId] = [];
      porDisc[q.disciplinaId].push(q);
    }

    let distribuicaoPorDisc = {};
    const discIds = disciplinas.map(d => d.id).filter(id => porDisc[id]?.length > 0);
    if (discIds.length === 0) return [];

    if (distribuicao === 'uniforme') {
      const porDiscCount = Math.max(1, Math.floor(total / discIds.length));
      const resto = total - porDiscCount * discIds.length;
      for (let i = 0; i < discIds.length; i++) {
        distribuicaoPorDisc[discIds[i]] = porDiscCount + (i < resto ? 1 : 0);
      }
    } else if (distribuicao === 'fraquezas') {
      // Mais questões para disciplinas com menor taxa de acerto
      const taxas = discIds.map(id => {
        const arr = porDisc[id];
        const acertos = arr.filter(q => q.resultado === 'acertou' || q.resultado === 'acertou_duvida').length;
        return { id, taxa: arr.length > 0 ? acertos / arr.length : 0 };
      });
      taxas.sort((a, b) => a.taxa - b.taxa);
      const pesos = taxas.map((t, i) => ({ ...t, peso: (i + 1) }));
      const somaPesos = pesos.reduce((a, p) => a + p.peso, 0);
      let alocado = 0;
      for (let i = 0; i < pesos.length; i++) {
        const qtd = i === pesos.length - 1 ? total - alocado : Math.max(1, Math.round((pesos[i].peso / somaPesos) * total));
        distribuicaoPorDisc[pesos[i].id] = qtd;
        alocado += qtd;
      }
    } else {
      // proporcional
      const somaPeso = disciplinas.reduce((a, d) => {
        if (!porDisc[d.id]) return a;
        return a + (d.numQuestoes ?? 1) * (d.pesoQuestao ?? 1);
      }, 0) || 1;
      let alocado = 0;
      const validas = discIds.filter(id => somaPeso > 0);
      for (let i = 0; i < validas.length; i++) {
        const d = disciplinas.find(x => x.id === validas[i]);
        const peso = (d?.numQuestoes ?? 1) * (d?.pesoQuestao ?? 1);
        const qtd = i === validas.length - 1 ? total - alocado : Math.max(1, Math.round((peso / somaPeso) * total));
        distribuicaoPorDisc[validas[i]] = qtd;
        alocado += qtd;
      }
    }

    const resultado = [];
    for (const [did, qtd] of Object.entries(distribuicaoPorDisc)) {
      const arr = porDisc[parseInt(did)] ?? [];
      const shuffled = arr.sort(() => Math.random() - 0.5);
      const selecionadas = shuffled.slice(0, qtd);
      for (const q of selecionadas) {
        resultado.push({
          disciplinaId: q.disciplinaId,
          topicoId: null,
          enunciado: q.topico ?? '',
          alternativas: [],
          respostaCorreta: q.resultado === 'acertou' || q.resultado === 'acertou_duvida' ? 0 : 1,
          respostaDada: null,
          tempo: 0
        });
      }
    }

    return resultado.sort(() => Math.random() - 0.5).slice(0, total);
  },

  _gerarTemplates(disciplinas, total, distribuicao) {
    const resultado = [];
    for (let i = 0; i < total; i++) {
      let discIdx;
      if (distribuicao === 'uniforme') {
        discIdx = i % disciplinas.length;
      } else {
        // proporcional por peso
        const pesosTotal = disciplinas.reduce((a, d) => a + (d.numQuestoes ?? 1) * (d.pesoQuestao ?? 1), 0) || 1;
        let rand = Math.random() * pesosTotal;
        discIdx = 0;
        for (let j = 0; j < disciplinas.length; j++) {
          rand -= (disciplinas[j].numQuestoes ?? 1) * (disciplinas[j].pesoQuestao ?? 1);
          if (rand <= 0) { discIdx = j; break; }
        }
      }
      const d = disciplinas[discIdx];
      resultado.push({
        disciplinaId: d.id,
        topicoId: null,
        enunciado: '',
        alternativas: ['', '', '', '', ''],
        respostaCorreta: 0,
        respostaDada: null,
        tempo: 0
      });
    }
    return resultado;
  }
};

const BACKUP_TABLES_V4 = Object.freeze([
  'concursos', 'disciplinas', 'topicos', 'sessoes', 'revisoes', 'cicloConfig', 'questoes', 'conquistas', 'simulados'
]);

/* ==== Exports globais ==== */
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
window.Diagnostico = Diagnostico;
window.Conquistas = Conquistas;
window.Streak = Streak;
window.Simulados = Simulados;
window.CATALOGO_CONQUISTAS = CATALOGO_CONQUISTAS;
window.BACKUP_TABLES = BACKUP_TABLES_V4;
window.Validacao = Validacao;
window.ValidacaoDB = Validacao;
window.LIMITES = LIMITES;
window.LIMITES_DADOS = LIMITES;
