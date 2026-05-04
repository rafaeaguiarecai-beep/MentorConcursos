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
      peso: dados?.peso ?? 5,
      eliminatoria: dados?.eliminatoria ?? false,
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
  async gerarAutomatico(concursoId) {
    const disciplinas = await Disciplinas.listar(concursoId);
    if (!disciplinas || disciplinas.length === 0) return [];
    // Para cada disciplina, número de aparições proporcional ao peso. Eliminatórias x1.5
    const expansao = [];
    for (const d of disciplinas) {
      let peso = d?.peso ?? 5;
      if (d?.eliminatoria) peso = Math.ceil(peso * 1.5);
      // Cada peso = 1 aparição. Mínimo 1.
      const aparicoes = Math.max(1, Math.round(peso));
      for (let i = 0; i < aparicoes; i++) {
        expansao.push(d.id);
      }
    }
    // Embaralhar evitando consecutivas
    const ciclo = [];
    const restantes = [...expansao];
    let tentativas = 0;
    while (restantes.length > 0 && tentativas < 1000) {
      tentativas++;
      // Pega disciplina aleatória que não seja igual à última
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
window.Ciclo = Ciclo;
window.DataUtil = DataUtil;
window.TempoUtil = TempoUtil;
