/* ====== MentorConcursos - Banco de Dados (IndexedDB via Dexie) ====== */
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
  // Migrar disciplinas existentes para novos campos
  return tx.table('disciplinas').toCollection().modify(disc => {
    disc.numQuestoes = disc.numQuestoes ?? disc.peso ?? 5;
    disc.pesoQuestao = disc.pesoQuestao ?? 1;
    disc.percentualMinimo = disc.percentualMinimo ?? (disc.eliminatoria ? 50 : null);
    disc.grauConhecimento = disc.grauConhecimento ?? 3;
  });
});

/* ===== Helpers de data ===== */
const DataUtil = {
  hoje() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },
  diasEntre(d1, d2) {
    const ms = new Date(d2).setHours(0,0,0,0) - new Date(d1).setHours(0,0,0,0);
    return Math.round(ms / (1000 * 60 * 60 * 24));
  },
  adicionarDias(data, dias) {
    const d = new Date(data);
    d.setDate(d.getDate() + dias);
    return d;
  },
  formatarData(data) {
    if (!data) return '-';
    const d = new Date(data);
    return d.toLocaleDateString('pt-BR');
  },
  formatarDataHora(data) {
    if (!data) return '-';
    const d = new Date(data);
    return d.toLocaleString('pt-BR');
  },
  toISO(data) {
    return new Date(data).toISOString();
  },
  inicioDia(data) {
    const d = new Date(data);
    d.setHours(0,0,0,0);
    return d;
  },
  fimDia(data) {
    const d = new Date(data);
    d.setHours(23,59,59,999);
    return d;
  }
};

/* ===== Helpers de tempo ===== */
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
  segundosParaHoras(segundos) {
    return (segundos || 0) / 3600;
  }
};

/* ===== Cálculo de Distribuição de Tempo ===== */
const DistribuicaoEstudo = {
  FATORES_CONHECIMENTO: {
    1: 0.5,   // Domino bem
    2: 0.75,  // Conheço razoavelmente
    3: 1.0,   // Conhecimento médio
    4: 1.5,   // Pouco conhecimento
    5: 2.0    // Nunca estudei / muito difícil
  },

  LABELS_CONHECIMENTO: {
    1: 'Domino bem',
    2: 'Conheço razoavelmente',
    3: 'Conhecimento médio',
    4: 'Pouco conhecimento',
    5: 'Nunca estudei / muito difícil'
  },

  calcularImpacto(disciplina) {
    const questoes = disciplina?.numQuestoes ?? 1;
    const peso = disciplina?.pesoQuestao ?? 1;
    return questoes * peso;
  },

  calcularPesoPonderado(disciplina) {
    const impacto = this.calcularImpacto(disciplina);
    const grau = disciplina?.grauConhecimento ?? 3;
    const fator = this.FATORES_CONHECIMENTO[grau] ?? 1.0;
    return impacto * fator;
  },

  calcularDistribuicao(disciplinas, horasDiarias) {
    if (!disciplinas || disciplinas.length === 0) return [];
    const segundosDiarios = (horasDiarias ?? 4) * 3600;

    const pesos = disciplinas.map(d => ({
      disciplina: d,
      pesoPonderado: this.calcularPesoPonderado(d),
      impactoNota: this.calcularImpacto(d)
    }));

    const somaTotal = pesos.reduce((acc, p) => acc + p.pesoPonderado, 0) || 1;

    return pesos.map(p => {
      const proporcao = p.pesoPonderado / somaTotal;
      const segundosSugeridos = Math.round(segundosDiarios * proporcao);
      const pontosMax = p.impactoNota;
      return {
        disciplina: p.disciplina,
        proporcao,
        segundosSugeridos,
        pontosMax,
        pesoPonderado: p.pesoPonderado
      };
    });
  },

  calcularMinimoEliminatoria(disciplina) {
    if (!disciplina?.eliminatoria) return null;
    const percentual = disciplina?.percentualMinimo ?? 50;
    const questoes = disciplina?.numQuestoes ?? 1;
    return {
      percentual,
      minimoQuestoes: Math.ceil(questoes * (percentual / 100)),
      totalQuestoes: questoes
    };
  }
};

/* ===== CRUD: Concursos ===== */
const Concursos = {
  async ativo() {
    const lista = await db.concursos.toArray();
    return lista?.[0] ?? null;
  },
  async criar(dados) {
    const id = await db.concursos.add({
      nome: dados?.nome ?? 'Meu Concurso',
      dataProva: dados?.dataProva ?? null,
      horasDiarias: dados?.horasDiarias ?? 4,
      totalQuestoes: dados?.totalQuestoes ?? null,
      criadoEm: new Date().toISOString()
    });
    return id;
  },
  async atualizar(id, dados) {
    return db.concursos.update(id, dados ?? {});
  },
  async remover(id) {
    return db.concursos.delete(id);
  }
};

/* ===== CRUD: Disciplinas ===== */
const Disciplinas = {
  async listar(concursoId) {
    if (!concursoId) return [];
    const lista = await db.disciplinas.where({ concursoId }).toArray();
    return (lista ?? []).sort((a, b) => (a?.ordemCiclo ?? 0) - (b?.ordemCiclo ?? 0));
  },
  async obter(id) {
    return db.disciplinas.get(id);
  },
  async criar(dados) {
    return db.disciplinas.add({
      concursoId: dados?.concursoId,
      nome: dados?.nome ?? 'Nova Disciplina',
      numQuestoes: dados?.numQuestoes ?? 5,
      pesoQuestao: dados?.pesoQuestao ?? 1,
      eliminatoria: dados?.eliminatoria ?? false,
      percentualMinimo: dados?.percentualMinimo ?? null,
      grauConhecimento: dados?.grauConhecimento ?? 3,
      cor: dados?.cor ?? '#e94560',
      ordemCiclo: dados?.ordemCiclo ?? 0
    });
  },
  async atualizar(id, dados) {
    return db.disciplinas.update(id, dados ?? {});
  },
  async remover(id) {
    return db.disciplinas.delete(id);
  }
};

/* ===== CRUD: Sessões ===== */
const Sessoes = {
  async listar(concursoId) {
    if (!concursoId) return [];
    const lista = await db.sessoes.where({ concursoId }).toArray();
    return (lista ?? []).sort((a, b) => new Date(b?.data ?? 0) - new Date(a?.data ?? 0));
  },
  async criar(dados) {
    return db.sessoes.add({
      concursoId: dados?.concursoId,
      disciplinaId: dados?.disciplinaId,
      topico: dados?.topico ?? '',
      tipo: dados?.tipo ?? 'Novo',
      data: dados?.data ?? new Date().toISOString(),
      duracaoSegundos: dados?.duracaoSegundos ?? 0,
      avaliacao: dados?.avaliacao ?? 0,
      notas: dados?.notas ?? ''
    });
  },
  async remover(id) {
    return db.sessoes.delete(id);
  },
  async totalHoras(concursoId) {
    const lista = await this.listar(concursoId);
    const totalSeg = (lista ?? []).reduce((acc, s) => acc + (s?.duracaoSegundos ?? 0), 0);
    return TempoUtil.segundosParaHoras(totalSeg);
  }
};

/* ===== CRUD: Revisões ===== */
const Revisoes = {
  async listar(concursoId) {
    if (!concursoId) return [];
    const disciplinas = await Disciplinas.listar(concursoId);
    const ids = (disciplinas ?? []).map(d => d?.id);
    if (ids.length === 0) return [];
    const lista = await db.revisoes.where('disciplinaId').anyOf(ids).toArray();
    return (lista ?? []).sort((a, b) => new Date(a?.dataPrevista ?? 0) - new Date(b?.dataPrevista ?? 0));
  },
  async pendentes(concursoId) {
    const lista = await this.listar(concursoId);
    return (lista ?? []).filter(r => r?.status === 'pendente');
  },
  async paraHoje(concursoId) {
    const lista = await this.pendentes(concursoId);
    const hoje = DataUtil.hoje();
    const fimHoje = DataUtil.fimDia(hoje);
    return (lista ?? []).filter(r => {
      const d = new Date(r?.dataPrevista ?? 0);
      return d <= fimHoje;
    });
  },
  async atrasadas(concursoId) {
    const lista = await this.pendentes(concursoId);
    const hoje = DataUtil.hoje();
    return (lista ?? []).filter(r => new Date(r?.dataPrevista ?? 0) < hoje);
  },
  async criar(dados) {
    return db.revisoes.add({
      sessaoId: dados?.sessaoId,
      disciplinaId: dados?.disciplinaId,
      topico: dados?.topico ?? '',
      tipoRevisao: dados?.tipoRevisao ?? 'R1',
      dataPrevista: dados?.dataPrevista,
      dataRealizada: dados?.dataRealizada ?? null,
      status: dados?.status ?? 'pendente'
    });
  },
  async atualizar(id, dados) {
    return db.revisoes.update(id, dados ?? {});
  },
  async marcarFeita(id) {
    return db.revisoes.update(id, {
      status: 'feita',
      dataRealizada: new Date().toISOString()
    });
  },
  async criarParaSessao(sessao) {
    if (!sessao || sessao?.tipo !== 'Novo') return;
    const dataBase = new Date(sessao?.data ?? new Date());
    const intervals = [
      { tipo: 'R1', dias: 1 },
      { tipo: 'R2', dias: 7 },
      { tipo: 'R3', dias: 30 }
    ];
    for (const i of intervals) {
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
    const lista = await db.revisoes
      .where({ disciplinaId, tipoRevisao: tipoRev })
      .toArray();
    const pendentes = (lista ?? []).filter(r => r?.status === 'pendente' && r?.topico?.toLowerCase()?.trim() === topico?.toLowerCase()?.trim());
    if (pendentes.length === 0) return null;
    pendentes.sort((a, b) => new Date(a?.dataPrevista ?? 0) - new Date(b?.dataPrevista ?? 0));
    return pendentes[0];
  }
};

/* ===== CRUD: Questões ===== */
const Questoes = {
  RESULTADOS: {
    ACERTOU: 'acertou',
    ACERTOU_DUVIDA: 'acertou_duvida',
    ERROU: 'errou',
    ERROU_DESATENCAO: 'errou_desatencao'
  },

  LABELS_RESULTADO: {
    acertou: 'Acertou',
    acertou_duvida: 'Acertou com dúvida',
    errou: 'Errou',
    errou_desatencao: 'Errou por desatenção'
  },

  ICONES_RESULTADO: {
    acertou: '✅',
    acertou_duvida: '🟡',
    errou: '❌',
    errou_desatencao: '⚠️'
  },

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

  async criar(dados) {
    return db.questoes.add({
      concursoId: dados?.concursoId,
      disciplinaId: dados?.disciplinaId,
      topico: dados?.topico ?? '',
      origem: dados?.origem ?? '',
      resultado: dados?.resultado ?? 'errou',
      data: dados?.data ?? new Date().toISOString()
    });
  },

  async remover(id) {
    return db.questoes.delete(id);
  },

  async estatisticasPorDisciplina(concursoId) {
    const todas = await this.listar(concursoId);
    const mapa = {};
    for (const q of todas) {
      const did = q?.disciplinaId;
      if (!did) continue;
      if (!mapa[did]) {
        mapa[did] = { total: 0, acertou: 0, acertouDuvida: 0, errou: 0, errouDesatencao: 0 };
      }
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
      if (!mapa[topico]) {
        mapa[topico] = { topico: q.topico, total: 0, acertou: 0, acertouDuvida: 0, errou: 0, errouDesatencao: 0 };
      }
      mapa[topico].total++;
      if (q.resultado === 'acertou') mapa[topico].acertou++;
      else if (q.resultado === 'acertou_duvida') mapa[topico].acertouDuvida++;
      else if (q.resultado === 'errou') mapa[topico].errou++;
      else if (q.resultado === 'errou_desatencao') mapa[topico].errouDesatencao++;
    }
    return mapa;
  },

  taxaAcerto(stats) {
    if (!stats || stats.total === 0) return 0;
    return ((stats.acertou + stats.acertouDuvida) / stats.total) * 100;
  },

  taxaAcertoSolido(stats) {
    if (!stats || stats.total === 0) return 0;
    return (stats.acertou / stats.total) * 100;
  },

  async origensUsadas(concursoId) {
    const todas = await this.listar(concursoId);
    const origens = new Set();
    for (const q of todas) {
      if (q?.origem) origens.add(q.origem);
    }
    return [...origens].sort();
  },

  async topicosUsados(disciplinaId) {
    const lista = await this.listarPorDisciplina(disciplinaId);
    const topicos = new Set();
    for (const q of lista) {
      if (q?.topico) topicos.add(q.topico);
    }
    // Também buscar tópicos das sessões de estudo
    const sessoes = await db.sessoes.where({ disciplinaId }).toArray();
    for (const s of sessoes) {
      if (s?.topico) topicos.add(s.topico);
    }
    return [...topicos].sort();
  }
};

/* ===== CRUD: Ciclo ===== */
const Ciclo = {
  async obter(concursoId) {
    if (!concursoId) return null;
    const lista = await db.cicloConfig.where({ concursoId }).toArray();
    return lista?.[0] ?? null;
  },
  async salvar(concursoId, posicaoAtual, cicloJSON) {
    const existente = await this.obter(concursoId);
    if (existente) {
      return db.cicloConfig.update(existente.id, { posicaoAtual: posicaoAtual ?? 0, cicloJSON: cicloJSON ?? '[]' });
    }
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

    // Para cada disciplina, número de aparições proporcional ao peso ponderado
    // Normalizar para que o mínimo tenha 1 aparição
    const minPeso = Math.min(...distribuicao.map(d => d.pesoPonderado)) || 1;
    const expansao = [];
    for (const d of distribuicao) {
      const aparicoes = Math.max(1, Math.round(d.pesoPonderado / minPeso));
      for (let i = 0; i < aparicoes; i++) {
        expansao.push(d.disciplina.id);
      }
    }

    // Embaralhar evitando consecutivas
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
