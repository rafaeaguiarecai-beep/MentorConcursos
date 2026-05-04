/* ====== MentorConcursos - Lógica Principal e SPA ====== */

const FRASES_MOTIVACIONAIS = [
  'Cada minuto investido hoje é um passo a mais rumo à aprovação.',
  'A constante é vencer a preguiça. O resto, vem depois.',
  'Quem estuda quando ninguém está olhando, brilha quando todos estão.',
  'Concurseiro foca: enquanto você descansa, alguém está estudando.',
  'A aprovação está para quem não desiste no primeiro "não".',
  'Disciplina vence talento todos os dias.',
  'Hoje você sentou para estudar. Já venceu metade da batalha.',
  'Errar questão de simulado é melhor do que errar na prova.',
  'Estudar com método não é perder tempo, é ganhar futuro.',
  'Você não precisa estudar 12 horas. Precisa estudar de verdade.',
  'Cada revisão feita é uma questão a mais acertada.',
  'Pequenos progressos diários viram grandes vitórias.',
  'O cargo público já tem dono. Trabalhe para ser você.',
  'Foco no edital, não no Instagram alheio.',
  'Os que estão passando hoje, já estudaram naquele sábado em que você quase desistiu.',
  'Cansaço passa. Aprovação fica para a vida toda.',
  'Confie no processo: estudo + revisão + simulado.',
  'Você está mais perto do que estava ontem. Continue.',
  'A melhor hora para começar foi ontem. A segunda melhor é agora.',
  'Concurso não premia o mais inteligente, e sim o mais persistente.'
];

const CORES_PADRAO = ['#e94560', '#60B5FF', '#FF9149', '#FF9898', '#FF90BB', '#80D8C3', '#A19AD3', '#72BF78', '#fbbf24', '#4ade80'];

/* ============ Toast ============ */
const Toast = {
  mostrar(mensagem, tipo = 'info', duracao = 3000) {
    const cont = document.getElementById('toast-container');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.textContent = mensagem ?? '';
    cont.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, duracao);
  },
  sucesso(m) { this.mostrar(m, 'success'); },
  erro(m) { this.mostrar(m, 'error', 4000); },
  aviso(m) { this.mostrar(m, 'warning'); }
};

/* ============ Modal ============ */
const Modal = {
  abrir(html, opcoes = {}) {
    const c = document.getElementById('modal-container');
    if (!c) return;
    c.innerHTML = `<div class="modal-overlay" id="modal-overlay-active"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    const overlay = document.getElementById('modal-overlay-active');
    if (overlay && (opcoes?.fecharNoFundo ?? true)) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.fechar();
      });
    }
    return overlay;
  },
  fechar() {
    const c = document.getElementById('modal-container');
    if (c) c.innerHTML = '';
  }
};
window.Modal = Modal;
window.Toast = Toast;

/* ============ Router ============ */
const Router = {
  paginaAtual: 'dashboard',
  parametros: {},

  ir(pagina, parametros = {}) {
    this.paginaAtual = pagina;
    this.parametros = parametros ?? {};
    // Para timer ao mudar de página (exceto se ficar em estudar)
    if (pagina !== 'estudar' && Timer.rodando) {
      Timer.parar();
    }
    this.atualizarNav();
    Paginas.renderizar(pagina);
  },

  atualizarNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    const itens = nav.querySelectorAll('.nav-item');
    const mapaNav = { dashboard: 'dashboard', estudar: 'estudar', revisoes: 'revisoes', historico: 'historico', mais: 'mais', ciclo: 'mais', configuracoes: 'mais' };
    const navAtiva = mapaNav[this.paginaAtual] ?? 'dashboard';
    itens.forEach(item => {
      item.classList.toggle('active', item.dataset.page === navAtiva);
    });
  }
};
window.Router = Router;

/* ============ Helpers UI ============ */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

async function atualizarBadgeRevisoes() {
  try {
    const concurso = await Concursos.ativo();
    if (!concurso) {
      const badge = document.getElementById('badge-revisoes');
      if (badge) badge.style.display = 'none';
      return;
    }
    const paraHoje = await Revisoes.paraHoje(concurso.id);
    const badge = document.getElementById('badge-revisoes');
    if (!badge) return;
    if ((paraHoje?.length ?? 0) > 0) {
      badge.textContent = String(paraHoje.length);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) { console.warn(e); }
}
window.atualizarBadgeRevisoes = atualizarBadgeRevisoes;

/* ============ Páginas ============ */
const Paginas = {
  async renderizar(pagina) {
    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = '<div class="loading-screen"><div class="loader"></div></div>';
    try {
      const fn = this[pagina];
      if (typeof fn === 'function') {
        await fn.call(this, main);
      } else {
        main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">❓</div><div class="empty-state-text">Página não encontrada</div></div>';
      }
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="empty-state"><div class="empty-state-emoji">⚠️</div><div class="empty-state-text">Erro ao carregar página: ${escapeHtml(e?.message ?? '')}</div></div>`;
    }
    atualizarBadgeRevisoes();
  },

  /* ===== DASHBOARD ===== */
  async dashboard(main) {
    const concurso = await Concursos.ativo();
    if (!concurso) {
      main.innerHTML = `
        <div class="welcome-screen">
          <div class="welcome-emoji">🎯</div>
          <h1 class="welcome-title">Bem-vindo ao MentorConcursos!</h1>
          <p class="welcome-text">Organize seus estudos, faça revisões espaçadas e acompanhe seu progresso rumo à aprovação.</p>
          <button class="btn btn-primary" id="btn-setup">Configurar meu primeiro concurso</button>
        </div>`;
      document.getElementById('btn-setup').addEventListener('click', () => abrirModalSetupConcurso());
      return;
    }

    const sessoes = await Sessoes.listar(concurso.id);
    const totalSeg = (sessoes ?? []).reduce((acc, s) => acc + (s?.duracaoSegundos ?? 0), 0);
    const totalHoras = totalSeg / 3600;
    const numSessoes = sessoes?.length ?? 0;
    const paraHoje = await Revisoes.paraHoje(concurso.id);
    const atrasadas = await Revisoes.atrasadas(concurso.id);
    const proximas = await Revisoes.pendentes(concurso.id);
    const proximasOrdenadas = (proximas ?? []).slice(0, 5);
    const disciplinas = await Disciplinas.listar(concurso.id);
    const mapaDisc = {};
    for (const d of disciplinas ?? []) mapaDisc[d.id] = d;

    // Termometro
    let term = 0;
    let termClasse = 'thermometer-low';
    let termLabel = 'Acelere o ritmo!';
    if (concurso.dataProva) {
      const diasRest = Math.max(0, DataUtil.diasEntre(new Date(), new Date(concurso.dataProva)));
      const horasNec = diasRest * (concurso?.horasDiarias ?? 4);
      if (horasNec > 0) {
        term = Math.min(100, (totalHoras / horasNec) * 100);
      } else {
        term = 100;
      }
      if (term >= 80) { termClasse = 'thermometer-high'; termLabel = 'Excelente! Continue assim'; }
      else if (term >= 50) { termClasse = 'thermometer-mid'; termLabel = 'No ritmo, mas pode melhorar'; }
    }

    const precisaBackup = Backup.precisaLembrar();
    const dias = Backup.diasDesdeUltimo();

    main.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">${escapeHtml(concurso.nome)}</p>
      </div>

      ${precisaBackup ? `
      <div class="banner" id="banner-backup">
        <div class="banner-icon">⚠️</div>
        <div class="banner-content">
          <strong>${dias === null ? 'Você ainda não fez backup' : `Você não faz backup há ${dias} dias`}</strong>
          Proteja seus dados!
        </div>
        <button class="btn btn-sm btn-primary" id="banner-export">Exportar</button>
      </div>` : ''}

      <div class="card countdown-card">
        <div class="card-title">Contagem regressiva</div>
        <div class="card-value" id="countdown-status">Calculando...</div>
        <div class="countdown-grid" id="countdown-grid"></div>
      </div>

      <div class="card-grid">
        <div class="card">
          <div class="card-title">Horas estudadas</div>
          <div class="card-value">${TempoUtil.formatarHhMm(totalSeg)}</div>
        </div>
        <div class="card">
          <div class="card-title">Sessões</div>
          <div class="card-value">${numSessoes}</div>
        </div>
        <div class="card card-clickable" id="card-revisoes-hoje">
          <div class="card-title">Revisões hoje</div>
          <div class="card-value">${paraHoje?.length ?? 0} ${atrasadas?.length > 0 ? `<span class="text-danger" style="font-size:13px;">(${atrasadas.length} atrasadas)</span>` : ''}</div>
        </div>
        <div class="card">
          <div class="card-title">Disciplinas</div>
          <div class="card-value">${disciplinas?.length ?? 0}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Termômetro de aprovação</div>
        <div class="thermometer">
          <div class="thermometer-bar"><div class="thermometer-fill ${termClasse}" style="width:${term.toFixed(1)}%"></div></div>
          <div class="thermometer-label"><span>${term.toFixed(0)}% da meta</span><span>${termLabel}</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Horas por disciplina</div>
        <div class="chart-container"><canvas id="chart-disciplinas"></canvas></div>
      </div>

      <h3 class="section-title">Próximas revisões</h3>
      <div id="lista-proximas-revisoes">
        ${proximasOrdenadas.length === 0
          ? '<div class="empty-state"><div class="empty-state-emoji">📅</div><div class="empty-state-text">Sem revisões agendadas. Estude algo novo!</div></div>'
          : proximasOrdenadas.map(r => {
              const d = mapaDisc[r?.disciplinaId];
              const data = new Date(r?.dataPrevista);
              const hoje = DataUtil.hoje();
              const atrasada = data < hoje;
              return `<div class="review-item ${atrasada ? 'overdue' : ''}">
                <span class="color-dot color-dot-lg" style="background-color:${escapeHtml(d?.cor ?? '#e94560')}"></span>
                <div class="item-content">
                  <div class="item-title">${escapeHtml(r?.topico ?? '-')}</div>
                  <div class="item-subtitle">${escapeHtml(d?.nome ?? '-')} · <span class="review-type-badge">${escapeHtml(r?.tipoRevisao ?? '')}</span></div>
                </div>
                <div class="item-meta">${DataUtil.formatarData(r?.dataPrevista)}</div>
              </div>`;
            }).join('')}
      </div>
    `;

    if (precisaBackup) {
      document.getElementById('banner-export')?.addEventListener('click', async () => {
        try { await Backup.exportar(); Toast.sucesso('Backup exportado!'); Router.ir('dashboard'); }
        catch (e) { Toast.erro(e?.message ?? 'Erro ao exportar'); }
      });
    }
    document.getElementById('card-revisoes-hoje')?.addEventListener('click', () => Router.ir('revisoes'));

    // Countdown
    const atualizarCountdown = () => {
      if (!concurso?.dataProva) {
        const st = document.getElementById('countdown-status');
        const gr = document.getElementById('countdown-grid');
        if (st) st.textContent = 'Sem data de prova';
        if (gr) gr.innerHTML = '<div class="text-dim" style="grid-column:1/5;">Configure em Mais > Configurações</div>';
        return;
      }
      const agora = new Date();
      const prova = new Date(concurso.dataProva);
      const diff = prova - agora;
      const grid = document.getElementById('countdown-grid');
      const status = document.getElementById('countdown-status');
      if (!grid || !status) return;
      if (diff <= 0) {
        status.textContent = 'Prova já ocorreu';
        grid.innerHTML = '';
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      status.textContent = `${d} dia${d !== 1 ? 's' : ''} até a prova`;
      grid.innerHTML = `
        <div class="countdown-unit"><span class="countdown-value">${d}</span><span class="countdown-label">Dias</span></div>
        <div class="countdown-unit"><span class="countdown-value">${h}</span><span class="countdown-label">Horas</span></div>
        <div class="countdown-unit"><span class="countdown-value">${m}</span><span class="countdown-label">Min</span></div>
        <div class="countdown-unit"><span class="countdown-value">${s}</span><span class="countdown-label">Seg</span></div>
      `;
    };
    atualizarCountdown();
    if (window.__countdownInt) clearInterval(window.__countdownInt);
    window.__countdownInt = setInterval(() => {
      if (Router.paginaAtual === 'dashboard') atualizarCountdown();
      else clearInterval(window.__countdownInt);
    }, 1000);

    setTimeout(() => Graficos.barrasHorasPorDisciplina('chart-disciplinas', concurso.id), 50);
  },

  /* ===== ESTUDAR ===== */
  async estudar(main) {
    const concurso = await Concursos.ativo();
    if (!concurso) {
      main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">🎯</div><div class="empty-state-text">Configure um concurso primeiro</div><button class="btn btn-primary" onclick="Router.ir(\'dashboard\')">Voltar</button></div>';
      return;
    }
    const disciplinas = await Disciplinas.listar(concurso.id);
    if (!disciplinas || disciplinas.length === 0) {
      main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">📚</div><div class="empty-state-text">Adicione disciplinas em Configurações</div><button class="btn btn-primary" onclick="Router.ir(\'configuracoes\')">Ir para Configurações</button></div>';
      return;
    }

    // Disciplina sugerida (do ciclo)
    const cfg = await Ciclo.obter(concurso.id);
    let disciplinaSugeridaId = null;
    if (cfg && cfg?.cicloJSON) {
      let ciclo = [];
      try { ciclo = JSON.parse(cfg.cicloJSON); } catch {}
      if (ciclo.length > 0) {
        disciplinaSugeridaId = ciclo[(cfg?.posicaoAtual ?? 0) % ciclo.length];
      }
    }
    if (!disciplinaSugeridaId) disciplinaSugeridaId = disciplinas[0]?.id;

    // Pre-preench: pode vir da pag de revisões
    const params = Router.parametros ?? {};
    if (params?.disciplinaId) disciplinaSugeridaId = params.disciplinaId;
    const tipoPre = params?.tipo ?? 'Novo';
    const topicoPre = params?.topico ?? '';

    let disciplinaSelId = disciplinaSugeridaId;
    let tipoSelecionado = tipoPre;
    Router.parametros = {}; // limpar para não repetir

    main.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Estudar</h1>
        <p class="page-subtitle">Foco total durante a sessão</p>
      </div>

      <div class="estudar-discipline-card" id="card-disciplina-atual"></div>

      <div class="form-group">
        <label>Disciplina</label>
        <select id="sel-disciplina">
          ${disciplinas.map(d => `<option value="${d.id}" ${d.id === disciplinaSelId ? 'selected' : ''}>${escapeHtml(d.nome)}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Tópico estudado</label>
        <input type="text" id="in-topico" placeholder="Ex: Lei 8112 - Posse e exercício" value="${escapeHtml(topicoPre)}" />
      </div>

      <div class="form-group">
        <label>Tipo</label>
        <div class="pill-group" id="pills-tipo">
          ${['Novo', 'Revisão 1', 'Revisão 2', 'Revisão 3', 'Questões'].map(t => `<button class="pill ${t === tipoSelecionado ? 'active' : ''}" data-tipo="${t}">${t}</button>`).join('')}
        </div>
      </div>

      <div class="timer-edit">
        <button class="btn-icon" id="btn-menos5">-5min</button>
        <input type="number" id="in-duracao" min="1" max="600" value="45" />
        <span class="text-dim">min</span>
        <button class="btn-icon" id="btn-mais5">+5min</button>
      </div>

      <div class="timer-presets">
        ${[25, 30, 45, 60].map(m => `<button class="timer-preset" data-min="${m}">${m}min</button>`).join('')}
      </div>

      <div class="timer-container">
        <div class="timer-circle">
          <svg class="timer-svg" viewBox="0 0 200 200">
            <circle class="timer-track" cx="100" cy="100" r="92"></circle>
            <circle class="timer-progress" id="timer-progress" cx="100" cy="100" r="92" stroke-dasharray="578" stroke-dashoffset="0"></circle>
          </svg>
          <div class="timer-display">
            <div class="timer-time" id="timer-time">45:00</div>
            <div class="timer-state" id="timer-state">Pronto</div>
          </div>
        </div>
        <div class="timer-controls">
          <button class="btn-circle" id="btn-iniciar">INICIAR</button>
        </div>
        <div class="timer-controls" id="controles-extras" style="display:none;">
          <button class="btn btn-secondary btn-sm" id="btn-resetar">Resetar</button>
          <button class="btn btn-primary btn-sm" id="btn-finalizar">FINALIZAR</button>
        </div>
      </div>
    `;

    const elCardDisc = () => document.getElementById('card-disciplina-atual');
    const renderCardDisc = () => {
      const d = disciplinas.find(x => x.id === disciplinaSelId) ?? disciplinas[0];
      const card = elCardDisc();
      if (!card || !d) return;
      card.style.backgroundColor = d?.cor ?? '#e94560';
      card.innerHTML = `
        <div class="estudar-discipline-label">Próxima no ciclo</div>
        <div class="estudar-discipline-name">${escapeHtml(d?.nome ?? '-')}</div>
      `;
    };
    renderCardDisc();

    const sel = document.getElementById('sel-disciplina');
    sel?.addEventListener('change', () => {
      disciplinaSelId = parseInt(sel.value);
      renderCardDisc();
    });

    document.querySelectorAll('#pills-tipo .pill').forEach(p => {
      p.addEventListener('click', () => {
        document.querySelectorAll('#pills-tipo .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        tipoSelecionado = p.dataset.tipo;
      });
    });

    // Notificações: pedir permissão
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission?.().catch(() => {});
    }

    /* ===== Timer integration ===== */
    Timer.off('tick'); Timer.off('iniciar'); Timer.off('pausar'); Timer.off('retomar'); Timer.off('reset');

    const inDur = document.getElementById('in-duracao');
    const btnMenos = document.getElementById('btn-menos5');
    const btnMais = document.getElementById('btn-mais5');
    const btnIniciar = document.getElementById('btn-iniciar');
    const btnResetar = document.getElementById('btn-resetar');
    const btnFinalizar = document.getElementById('btn-finalizar');
    const controlesExtras = document.getElementById('controles-extras');
    const elTime = document.getElementById('timer-time');
    const elState = document.getElementById('timer-state');
    const elProg = document.getElementById('timer-progress');

    Timer.init(parseInt(inDur?.value) || 45);

    inDur?.addEventListener('input', () => {
      const v = parseInt(inDur.value);
      if (Timer.setDuracao(v)) atualizarUITimer();
    });

    btnMenos?.addEventListener('click', () => {
      if (Timer.ajustar(-5)) {
        if (inDur) inDur.value = Timer.duracaoInicial / 60;
        atualizarUITimer();
      }
    });
    btnMais?.addEventListener('click', () => {
      if (Timer.ajustar(5)) {
        if (inDur) inDur.value = Timer.duracaoInicial / 60;
        atualizarUITimer();
      }
    });

    document.querySelectorAll('.timer-preset').forEach(b => {
      b.addEventListener('click', () => {
        const m = parseInt(b.dataset.min);
        if (Timer.setDuracao(m)) {
          if (inDur) inDur.value = m;
          atualizarUITimer();
        }
      });
    });

    function atualizarUITimer() {
      const e = Timer.estado();
      const total = e.duracaoInicial;
      const r = e.restante;
      const ex = e.extra;
      const circ = 578; // ~ 2*PI*92

      if (ex > 0) {
        elTime.textContent = '+' + TempoUtil.formatarMmSs(ex);
        elTime.classList.add('extra');
        elProg.classList.add('extra');
        elProg.setAttribute('stroke-dashoffset', '0');
      } else {
        elTime.textContent = TempoUtil.formatarMmSs(r);
        elTime.classList.remove('extra');
        elProg.classList.remove('extra');
        const offset = circ * (1 - r / total);
        elProg.setAttribute('stroke-dashoffset', String(offset));
      }

      if (e.rodando) {
        elState.textContent = 'Em foco';
        btnIniciar.textContent = 'PAUSAR';
        btnIniciar.classList.add('paused');
      } else if (e.pausado) {
        elState.textContent = 'Pausado';
        btnIniciar.textContent = 'RETOMAR';
        btnIniciar.classList.remove('paused');
      } else {
        elState.textContent = 'Pronto';
        btnIniciar.textContent = 'INICIAR';
        btnIniciar.classList.remove('paused');
      }
      controlesExtras.style.display = (e.rodando || e.pausado || e.totalDecorrido > 0) ? 'flex' : 'none';
    }
    atualizarUITimer();

    Timer.on('tick', atualizarUITimer);
    Timer.on('iniciar', atualizarUITimer);
    Timer.on('pausar', atualizarUITimer);
    Timer.on('retomar', atualizarUITimer);
    Timer.on('reset', atualizarUITimer);

    btnIniciar?.addEventListener('click', () => {
      // Inicializar audio context com gesto do usuário
      try {
        if (!Timer.audioCtx) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) Timer.audioCtx = new Ctx();
        }
        if (Timer.audioCtx?.state === 'suspended') Timer.audioCtx.resume?.();
      } catch (e) {}
      const e = Timer.estado();
      if (e.rodando) Timer.pausar();
      else if (e.pausado) Timer.retomar();
      else Timer.iniciar();
    });

    btnResetar?.addEventListener('click', () => {
      Timer.resetar();
    });

    btnFinalizar?.addEventListener('click', () => {
      const topico = document.getElementById('in-topico')?.value?.trim() ?? '';
      if (!topico) {
        Toast.aviso('Informe o tópico estudado.');
        return;
      }
      const e = Timer.estado();
      if ((e.totalDecorrido ?? 0) < 1) {
        Toast.aviso('Inicie o timer antes de finalizar.');
        return;
      }
      Timer.parar();
      abrirModalFinalizar({
        concursoId: concurso.id,
        disciplinaId: disciplinaSelId,
        topico,
        tipo: tipoSelecionado,
        duracaoSegundos: e.totalDecorrido,
        iniciadoEm: e.iniciadoEm
      });
    });
  }
};
window.Paginas = Paginas;

/* ===== REVIS\u00d5ES ===== */
Paginas.revisoes = async function(main) {
  const concurso = await Concursos.ativo();
  if (!concurso) {
    main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">\ud83c\udfaf</div><div class="empty-state-text">Configure um concurso primeiro</div></div>';
    return;
  }
  const todas = await Revisoes.listar(concurso.id);
  const pendentes = (todas ?? []).filter(r => r?.status === 'pendente');
  const disciplinas = await Disciplinas.listar(concurso.id);
  const mapaDisc = {};
  for (const d of disciplinas ?? []) mapaDisc[d.id] = d;

  const filtroAtual = Router.parametros?.filtro ?? 'hoje';
  Router.parametros = {};

  const hoje = DataUtil.hoje();
  const fimHoje = DataUtil.fimDia(hoje);
  const em7Dias = DataUtil.fimDia(DataUtil.adicionarDias(hoje, 7));

  const filtros = {
    hoje: r => r?.status === 'pendente' && new Date(r?.dataPrevista) <= fimHoje,
    atrasadas: r => r?.status === 'pendente' && new Date(r?.dataPrevista) < hoje,
    proximos7: r => r?.status === 'pendente' && new Date(r?.dataPrevista) >= hoje && new Date(r?.dataPrevista) <= em7Dias,
    todas: r => true
  };

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Revis\u00f5es</h1>
      <p class="page-subtitle">${pendentes.length} pendente${pendentes.length !== 1 ? 's' : ''}</p>
    </div>
    <div class="tabs">
      <button class="tab ${filtroAtual === 'hoje' ? 'active' : ''}" data-filtro="hoje">Hoje</button>
      <button class="tab ${filtroAtual === 'atrasadas' ? 'active' : ''}" data-filtro="atrasadas">Atrasadas</button>
      <button class="tab ${filtroAtual === 'proximos7' ? 'active' : ''}" data-filtro="proximos7">Pr\u00f3ximos 7 dias</button>
      <button class="tab ${filtroAtual === 'todas' ? 'active' : ''}" data-filtro="todas">Todas</button>
    </div>
    <div id="lista-revisoes"></div>
  `;

  function renderLista(filtro) {
    const cont = document.getElementById('lista-revisoes');
    if (!cont) return;
    const lista = (todas ?? []).filter(filtros[filtro] ?? filtros.hoje);
    if (lista.length === 0) {
      cont.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">\u2728</div><div class="empty-state-text">Nenhuma revis\u00e3o nesta categoria.</div></div>';
      return;
    }
    cont.innerHTML = lista.map(r => {
      const d = mapaDisc[r?.disciplinaId];
      const data = new Date(r?.dataPrevista);
      const atrasada = r?.status === 'pendente' && data < hoje;
      const tipoMap = { 'R1': 'Revis\u00e3o 1', 'R2': 'Revis\u00e3o 2', 'R3': 'Revis\u00e3o 3' };
      const tipoCompleto = tipoMap[r?.tipoRevisao] ?? 'Revis\u00e3o';
      return `<div class="review-item ${atrasada ? 'overdue' : ''}" data-id="${r.id}" data-disc="${r?.disciplinaId}" data-topico="${escapeHtml(r?.topico ?? '')}" data-tipo="${tipoCompleto}" data-status="${r?.status}">
        <span class="color-dot color-dot-lg" style="background-color:${escapeHtml(d?.cor ?? '#e94560')}"></span>
        <div class="item-content">
          <div class="item-title">${escapeHtml(r?.topico ?? '-')}</div>
          <div class="item-subtitle">${escapeHtml(d?.nome ?? '-')} \u00b7 <span class="review-type-badge">${escapeHtml(r?.tipoRevisao ?? '')}</span> ${atrasada ? '\u00b7 \u26a0\ufe0f atrasada' : ''} ${r?.status === 'feita' ? '\u00b7 \u2713 feita' : ''}</div>
        </div>
        <div class="item-meta">${DataUtil.formatarData(r?.dataPrevista)}</div>
      </div>`;
    }).join('');
    cont.querySelectorAll('.review-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.status === 'feita') return;
        const did = parseInt(el.dataset.disc);
        const topico = el.dataset.topico;
        const tipo = el.dataset.tipo;
        Router.ir('estudar', { disciplinaId: did, topico, tipo });
      });
    });
  }
  renderLista(filtroAtual);
  document.querySelectorAll('.tabs .tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      renderLista(t.dataset.filtro);
    });
  });
};

/* ===== HIST\u00d3RICO ===== */
Paginas.historico = async function(main) {
  const concurso = await Concursos.ativo();
  if (!concurso) {
    main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">\ud83c\udfaf</div><div class="empty-state-text">Configure um concurso primeiro</div></div>';
    return;
  }
  const sessoes = await Sessoes.listar(concurso.id);
  const disciplinas = await Disciplinas.listar(concurso.id);
  const mapaDisc = {};
  for (const d of disciplinas ?? []) mapaDisc[d.id] = d;

  let filtroDisc = 'todas';
  let filtroPeriodo = 'todas';

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Hist\u00f3rico</h1>
      <p class="page-subtitle">${sessoes?.length ?? 0} sess\u00f5es</p>
    </div>

    <div class="card">
      <div class="card-title">Horas por semana (\u00faltimas 8)</div>
      <div class="chart-container"><canvas id="chart-historico"></canvas></div>
    </div>

    <div class="form-group">
      <label>Filtrar por disciplina</label>
      <select id="filtro-disciplina">
        <option value="todas">Todas as disciplinas</option>
        ${(disciplinas ?? []).map(d => `<option value="${d.id}">${escapeHtml(d.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Filtrar por per\u00edodo</label>
      <select id="filtro-periodo">
        <option value="todas">Todas</option>
        <option value="semana">\u00daltima semana</option>
        <option value="mes">\u00daltimo m\u00eas</option>
      </select>
    </div>

    <div id="lista-historico"></div>
  `;

  function renderHistorico() {
    const cont = document.getElementById('lista-historico');
    if (!cont) return;
    let lista = sessoes ?? [];
    if (filtroDisc !== 'todas') {
      lista = lista.filter(s => String(s?.disciplinaId) === String(filtroDisc));
    }
    if (filtroPeriodo === 'semana') {
      const limite = DataUtil.adicionarDias(new Date(), -7);
      lista = lista.filter(s => new Date(s?.data) >= limite);
    } else if (filtroPeriodo === 'mes') {
      const limite = DataUtil.adicionarDias(new Date(), -30);
      lista = lista.filter(s => new Date(s?.data) >= limite);
    }

    if (lista.length === 0) {
      cont.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">\ud83d\udcdd</div><div class="empty-state-text">Nenhuma sess\u00e3o registrada ainda.</div></div>';
      return;
    }

    // Agrupar por dia
    const grupos = {};
    for (const s of lista) {
      const d = new Date(s?.data ?? 0);
      const chave = DataUtil.inicioDia(d).toISOString();
      if (!grupos[chave]) grupos[chave] = [];
      grupos[chave].push(s);
    }
    const chaves = Object.keys(grupos).sort((a, b) => new Date(b) - new Date(a));
    const hoje = DataUtil.hoje();
    const ontem = DataUtil.adicionarDias(hoje, -1);

    let html = '';
    for (const k of chaves) {
      const grupo = grupos[k];
      const totalSegDia = grupo.reduce((acc, s) => acc + (s?.duracaoSegundos ?? 0), 0);
      const dataGrupo = new Date(k);
      let label = DataUtil.formatarData(dataGrupo);
      if (dataGrupo.getTime() === hoje.getTime()) label = 'Hoje';
      else if (dataGrupo.getTime() === ontem.getTime()) label = 'Ontem';

      html += `<div class="history-day-header">${label} <span class="history-day-total">\u00b7 ${TempoUtil.formatarHhMm(totalSegDia)} \u00b7 ${grupo.length} sess\u00e3o${grupo.length !== 1 ? 'es' : ''}</span></div>`;

      for (const s of grupo) {
        const d = mapaDisc[s?.disciplinaId];
        const tipoIcons = { 'Novo': '\ud83d\udcd7', 'Revis\u00e3o 1': '\ud83d\udd04', 'Revis\u00e3o 2': '\ud83d\udd04', 'Revis\u00e3o 3': '\ud83d\udd04', 'Quest\u00f5es': '\ud83d\udcdd' };
        const icon = tipoIcons[s?.tipo] ?? '\ud83d\udcd6';
        const stars = '\u2605'.repeat(s?.avaliacao ?? 0) + '\u2606'.repeat(5 - (s?.avaliacao ?? 0));
        html += `<div class="session-item">
          <span style="font-size:20px;">${icon}</span>
          <div class="item-content">
            <div class="item-title">${escapeHtml(s?.topico ?? '-')}</div>
            <div class="item-subtitle"><span class="color-dot" style="background-color:${escapeHtml(d?.cor ?? '#e94560')};display:inline-block;margin-right:6px;vertical-align:middle;"></span>${escapeHtml(d?.nome ?? '-')} \u00b7 ${escapeHtml(s?.tipo ?? '-')} \u00b7 ${TempoUtil.formatarHhMm(s?.duracaoSegundos)}</div>
            ${(s?.avaliacao ?? 0) > 0 ? `<div class="session-rating">${stars}</div>` : ''}
            ${s?.notas ? `<div class="item-subtitle" style="margin-top:4px;font-style:italic;">"${escapeHtml(s.notas)}"</div>` : ''}
          </div>
        </div>`;
      }
    }
    cont.innerHTML = html;
  }

  document.getElementById('filtro-disciplina')?.addEventListener('change', (e) => {
    filtroDisc = e.target.value;
    renderHistorico();
  });
  document.getElementById('filtro-periodo')?.addEventListener('change', (e) => {
    filtroPeriodo = e.target.value;
    renderHistorico();
  });

  renderHistorico();
  setTimeout(() => Graficos.linhaSemanasHistorico('chart-historico', concurso.id), 50);
};

/* ===== CICLO ===== */
Paginas.ciclo = async function(main) {
  const concurso = await Concursos.ativo();
  if (!concurso) {
    main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">\ud83c\udfaf</div><div class="empty-state-text">Configure um concurso primeiro</div></div>';
    return;
  }
  const disciplinas = await Disciplinas.listar(concurso.id);
  const cfg = await Ciclo.obter(concurso.id);
  let cicloIds = [];
  if (cfg?.cicloJSON) {
    try { cicloIds = JSON.parse(cfg.cicloJSON); } catch { cicloIds = []; }
  }
  if (cicloIds.length === 0) {
    cicloIds = (disciplinas ?? []).map(d => d.id);
  }
  const posicaoAtual = cfg?.posicaoAtual ?? 0;
  const mapaDisc = {};
  for (const d of disciplinas ?? []) mapaDisc[d.id] = d;

  const horasDiarias = concurso?.horasDiarias ?? 4;
  const segundosDiarios = horasDiarias * 3600;

  // Calcular tempo proporcional por disciplina baseado no peso
  const cicloDetalhe = cicloIds.map((id, idx) => mapaDisc[id]).filter(d => d);
  const somaPesos = cicloDetalhe.reduce((a, d) => a + (d?.peso ?? 5), 0) || 1;

  let totalSegCiclo = 0;
  for (const d of cicloDetalhe) {
    const fracao = (d?.peso ?? 5) / somaPesos;
    totalSegCiclo += Math.round(segundosDiarios * fracao);
  }

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Ciclo de Estudos</h1>
      <p class="page-subtitle">Total estimado: ${TempoUtil.formatarHhMm(totalSegCiclo * cicloDetalhe.length / Math.max(1, cicloDetalhe.length))}</p>
    </div>

    <div class="btn-row mb-12">
      <button class="btn btn-primary" id="btn-gerar-auto">\ud83c\udfb2 Gerar Ciclo Autom\u00e1tico</button>
    </div>

    <div id="lista-ciclo"></div>
  `;

  function renderCiclo() {
    const cont = document.getElementById('lista-ciclo');
    if (!cont) return;
    if (cicloIds.length === 0) {
      cont.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">\ud83d\udd04</div><div class="empty-state-text">Adicione disciplinas para criar um ciclo</div></div>';
      return;
    }
    const html = cicloIds.map((id, idx) => {
      const d = mapaDisc[id];
      if (!d) return '';
      const fracao = (d?.peso ?? 5) / somaPesos;
      const segSugerido = Math.round(segundosDiarios * fracao);
      const isAtual = idx === posicaoAtual;
      return `<div class="cycle-item ${isAtual ? 'current' : ''}" data-idx="${idx}">
        ${isAtual ? '<div class="cycle-current-tag">VOC\u00ca EST\u00c1 AQUI</div>' : ''}
        <span class="color-dot color-dot-lg" style="background-color:${escapeHtml(d?.cor ?? '#e94560')}"></span>
        <div class="item-content">
          <div class="item-title">${escapeHtml(d?.nome ?? '-')}</div>
          <div class="item-subtitle">Peso ${d?.peso ?? 5}${d?.eliminatoria ? ' \u00b7 Eliminat\u00f3ria' : ''} \u00b7 ~${TempoUtil.formatarHhMm(segSugerido)}</div>
        </div>
        <div class="cycle-controls">
          <button class="cycle-btn" data-acao="up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>\u25b2</button>
          <button class="cycle-btn" data-acao="down" data-idx="${idx}" ${idx === cicloIds.length - 1 ? 'disabled' : ''}>\u25bc</button>
        </div>
      </div>`;
    }).join('');
    cont.innerHTML = html;

    cont.querySelectorAll('.cycle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        const acao = btn.dataset.acao;
        if (acao === 'up' && idx > 0) {
          [cicloIds[idx-1], cicloIds[idx]] = [cicloIds[idx], cicloIds[idx-1]];
        } else if (acao === 'down' && idx < cicloIds.length - 1) {
          [cicloIds[idx], cicloIds[idx+1]] = [cicloIds[idx+1], cicloIds[idx]];
        }
        await Ciclo.salvar(concurso.id, posicaoAtual, JSON.stringify(cicloIds));
        Router.ir('ciclo');
      });
    });
  }
  renderCiclo();

  document.getElementById('btn-gerar-auto')?.addEventListener('click', async () => {
    Modal.abrir(`
      <h2 class="modal-title">Gerar Ciclo Autom\u00e1tico?</h2>
      <p class="modal-text">Isso vai criar um novo ciclo distribuindo as disciplinas proporcionalmente ao peso, evitando consecutivas e priorizando eliminat\u00f3rias.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn btn-primary" id="btn-conf-gerar">Gerar</button>
      </div>
    `);
    document.getElementById('btn-conf-gerar')?.addEventListener('click', async () => {
      Modal.fechar();
      try {
        await Ciclo.gerarAutomatico(concurso.id);
        Toast.sucesso('Ciclo gerado com sucesso!');
        Router.ir('ciclo');
      } catch (e) { Toast.erro(e?.message ?? 'Erro'); }
    });
  });
};

/* ===== MAIS (menu) ===== */
Paginas.mais = async function(main) {
  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Mais</h1>
      <p class="page-subtitle">Configura\u00e7\u00f5es e ferramentas</p>
    </div>
    <div class="card card-clickable" id="opt-ciclo">
      <div class="flex gap-12">
        <div style="font-size:32px;">\ud83d\udd04</div>
        <div class="item-content">
          <div class="item-title">Ciclo de Estudos</div>
          <div class="item-subtitle">Reordene e configure seu ciclo</div>
        </div>
        <div style="font-size:18px;color:var(--text-dim);">\u203a</div>
      </div>
    </div>
    <div class="card card-clickable" id="opt-config">
      <div class="flex gap-12">
        <div style="font-size:32px;">\u2699\ufe0f</div>
        <div class="item-content">
          <div class="item-title">Configura\u00e7\u00f5es</div>
          <div class="item-subtitle">Concurso, disciplinas, backup</div>
        </div>
        <div style="font-size:18px;color:var(--text-dim);">\u203a</div>
      </div>
    </div>
    <div class="card card-clickable" id="opt-sobre">
      <div class="flex gap-12">
        <div style="font-size:32px;">\u2139\ufe0f</div>
        <div class="item-content">
          <div class="item-title">Sobre</div>
          <div class="item-subtitle">MentorConcursos v1.0</div>
        </div>
        <div style="font-size:18px;color:var(--text-dim);">\u203a</div>
      </div>
    </div>
  `;
  document.getElementById('opt-ciclo')?.addEventListener('click', () => Router.ir('ciclo'));
  document.getElementById('opt-config')?.addEventListener('click', () => Router.ir('configuracoes'));
  document.getElementById('opt-sobre')?.addEventListener('click', () => {
    Modal.abrir(`
      <h2 class="modal-title">MentorConcursos</h2>
      <p class="modal-text">Vers\u00e3o 1.0<br/>Aplicativo de estudos para concursos p\u00fablicos com revis\u00f5es espa\u00e7adas, ciclos e timer Pomodoro.</p>
      <p class="modal-text">Todos os seus dados ficam armazenados localmente no seu dispositivo. Fa\u00e7a backup regularmente!</p>
      <p class="modal-text"><a href="https://github.com/rafaeaguiarecai-beep/MentorConcursos" target="_blank" style="color:var(--accent);">github.com/rafaeaguiarecai-beep/MentorConcursos</a></p>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Modal.fechar()">OK</button>
      </div>
    `);
  });
};

/* ===== CONFIGURA\u00c7\u00d5ES ===== */
Paginas.configuracoes = async function(main) {
  let concurso = await Concursos.ativo();
  const disciplinas = concurso ? await Disciplinas.listar(concurso.id) : [];
  const ultBackup = Backup.ultimoBackup();

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Configura\u00e7\u00f5es</h1>
    </div>

    <div class="settings-section">
      <h2 class="settings-section-title">Concurso</h2>
      ${!concurso ? `
        <div class="card">
          <p class="text-dim mb-12">Nenhum concurso configurado.</p>
          <button class="btn btn-primary" id="btn-novo-concurso">Criar concurso</button>
        </div>
      ` : `
        <div class="card">
          <div class="form-group">
            <label>Nome do concurso</label>
            <input type="text" id="conc-nome" value="${escapeHtml(concurso.nome)}" />
          </div>
          <div class="form-group">
            <label>Data da prova</label>
            <input type="date" id="conc-data" value="${concurso?.dataProva ? new Date(concurso.dataProva).toISOString().slice(0,10) : ''}" />
          </div>
          <div class="form-group">
            <label>Horas di\u00e1rias de estudo</label>
            <input type="number" id="conc-horas" min="1" max="16" step="0.5" value="${concurso?.horasDiarias ?? 4}" />
          </div>
          <button class="btn btn-primary" id="btn-salvar-conc">Salvar altera\u00e7\u00f5es</button>
        </div>
      `}
    </div>

    ${concurso ? `
    <div class="settings-section">
      <h2 class="settings-section-title">Disciplinas (${disciplinas?.length ?? 0})</h2>
      <div id="lista-disciplinas">
        ${(disciplinas ?? []).length === 0
          ? '<div class="empty-state"><div class="empty-state-emoji">\ud83d\udcda</div><div class="empty-state-text">Nenhuma disciplina cadastrada</div></div>'
          : disciplinas.map(d => `
              <div class="discipline-item">
                <span class="color-dot color-dot-lg" style="background-color:${escapeHtml(d?.cor ?? '#e94560')}"></span>
                <div class="item-content">
                  <div class="item-title">${escapeHtml(d?.nome ?? '-')}</div>
                  <div class="item-subtitle">Peso ${d?.peso ?? 5}${d?.eliminatoria ? ' \u00b7 Eliminat\u00f3ria' : ''}</div>
                </div>
                <button class="btn-icon" data-acao="editar" data-id="${d.id}" title="Editar">\u270f\ufe0f</button>
                <button class="btn-icon" data-acao="excluir" data-id="${d.id}" title="Excluir">\ud83d\uddd1\ufe0f</button>
              </div>
            `).join('')}
      </div>
      <button class="btn btn-secondary mt-12" id="btn-add-disc">+ Adicionar Disciplina</button>
    </div>
    ` : ''}

    <div class="settings-section">
      <h2 class="settings-section-title">Backup e Restaura\u00e7\u00e3o</h2>
      <div class="card">
        <p class="text-dim" style="font-size:12px;margin-bottom:12px;">${ultBackup ? `\u00daltimo backup: ${DataUtil.formatarDataHora(ultBackup)}` : 'Nenhum backup feito ainda'}</p>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-export">\u2b07\ufe0f Exportar Backup (JSON)</button>
        </div>
        <div class="btn-row mt-12">
          <button class="btn btn-secondary" id="btn-import">\u2b06\ufe0f Importar Backup (JSON)</button>
          <button class="btn btn-secondary" id="btn-share">\ud83d\udce4 Compartilhar</button>
        </div>
        <input type="file" id="file-import" accept="application/json,.json" style="display:none;" />
      </div>
    </div>

    <div class="settings-section">
      <h2 class="settings-section-title">Dados</h2>
      <div class="card">
        <button class="btn btn-danger" id="btn-limpar">\ud83d\uddd1\ufe0f Limpar Todos os Dados</button>
      </div>
    </div>

    <div class="settings-section">
      <h2 class="settings-section-title">Sobre</h2>
      <div class="card">
        <div class="row"><span>Vers\u00e3o</span><span class="text-dim">1.0.0</span></div>
        <div class="row"><span>C\u00f3digo-fonte</span><a href="https://github.com/rafaeaguiarecai-beep/MentorConcursos" target="_blank" class="text-accent">GitHub</a></div>
      </div>
    </div>
  `;

  document.getElementById('btn-novo-concurso')?.addEventListener('click', () => abrirModalSetupConcurso());

  document.getElementById('btn-salvar-conc')?.addEventListener('click', async () => {
    const nome = document.getElementById('conc-nome')?.value?.trim();
    const data = document.getElementById('conc-data')?.value;
    const horas = parseFloat(document.getElementById('conc-horas')?.value);
    if (!nome) return Toast.aviso('Informe o nome do concurso.');
    try {
      await Concursos.atualizar(concurso.id, {
        nome,
        dataProva: data ? new Date(data + 'T00:00:00').toISOString() : null,
        horasDiarias: isNaN(horas) ? 4 : horas
      });
      Toast.sucesso('Concurso atualizado!');
      Router.ir('configuracoes');
    } catch (e) { Toast.erro(e?.message ?? 'Erro'); }
  });

  document.querySelectorAll('[data-acao="editar"]').forEach(b => {
    b.addEventListener('click', () => abrirModalDisciplina(parseInt(b.dataset.id)));
  });
  document.querySelectorAll('[data-acao="excluir"]').forEach(b => {
    b.addEventListener('click', () => confirmarExcluirDisciplina(parseInt(b.dataset.id)));
  });
  document.getElementById('btn-add-disc')?.addEventListener('click', () => abrirModalDisciplina(null));

  document.getElementById('btn-export')?.addEventListener('click', async () => {
    try {
      await Backup.exportar();
      Toast.sucesso('Backup exportado com sucesso! Guarde este arquivo em local seguro (Google Drive, email, etc.)', 'success');
      Router.ir('configuracoes');
    } catch (e) { Toast.erro(e?.message ?? 'Erro ao exportar'); }
  });

  document.getElementById('btn-share')?.addEventListener('click', async () => {
    try {
      const r = await Backup.compartilhar();
      if (r?.cancelado) return;
      if (r?.metodo === 'download') Toast.sucesso('Backup baixado (compartilhamento n\u00e3o suportado).');
      else Toast.sucesso('Backup compartilhado!');
      Router.ir('configuracoes');
    } catch (e) { Toast.erro(e?.message ?? 'Erro ao compartilhar'); }
  });

  document.getElementById('btn-import')?.addEventListener('click', () => {
    document.getElementById('file-import')?.click();
  });
  document.getElementById('file-import')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Modal.abrir(`
      <h2 class="modal-title">\u26a0\ufe0f Aten\u00e7\u00e3o</h2>
      <p class="modal-text">Importar um backup vai <strong>SUBSTITUIR</strong> todos os dados atuais. Deseja continuar?</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn btn-danger" id="btn-conf-import">Sim, substituir</button>
      </div>
    `);
    document.getElementById('btn-conf-import')?.addEventListener('click', async () => {
      Modal.fechar();
      Modal.abrir(`
        <h2 class="modal-title">Importando...</h2>
        <p class="modal-text" id="prog-text">0%</p>
        <div class="progress-bar"><div class="progress-bar-fill" id="prog-fill" style="width:0%"></div></div>
      `, { fecharNoFundo: false });
      try {
        await Backup.importarDeArquivo(file);
        const fill = document.getElementById('prog-fill');
        const text = document.getElementById('prog-text');
        if (fill) fill.style.width = '100%';
        if (text) text.textContent = '100%';
        setTimeout(() => {
          Modal.fechar();
          Toast.sucesso('Backup importado com sucesso!');
          location.reload();
        }, 600);
      } catch (err) {
        Modal.fechar();
        Toast.erro(err?.message ?? 'Arquivo inv\u00e1lido. Selecione um arquivo de backup v\u00e1lido do MentorConcursos.');
      }
    });
  });

  document.getElementById('btn-limpar')?.addEventListener('click', () => {
    Modal.abrir(`
      <h2 class="modal-title">\u26a0\ufe0f Tem certeza?</h2>
      <p class="modal-text">Isso vai <strong>APAGAR PERMANENTEMENTE</strong> todos os seus dados (concurso, disciplinas, sess\u00f5es, revis\u00f5es). Fa\u00e7a backup antes!</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn btn-danger" id="btn-passo2">Continuar</button>
      </div>
    `);
    document.getElementById('btn-passo2')?.addEventListener('click', () => {
      Modal.abrir(`
        <h2 class="modal-title">Confirma\u00e7\u00e3o final</h2>
        <p class="modal-text">Digite <strong>APAGAR</strong> em mai\u00fasculas para confirmar a exclus\u00e3o de todos os dados.</p>
        <div class="form-group">
          <input type="text" id="conf-input" placeholder="Digite APAGAR" autocomplete="off" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
          <button class="btn btn-danger" id="btn-confirma-apagar">Apagar tudo</button>
        </div>
      `);
      document.getElementById('btn-confirma-apagar')?.addEventListener('click', async () => {
        const v = document.getElementById('conf-input')?.value?.trim();
        if (v !== 'APAGAR') {
          Toast.erro('Digite APAGAR exatamente para confirmar');
          return;
        }
        try {
          await db.concursos.clear();
          await db.disciplinas.clear();
          await db.topicos.clear();
          await db.sessoes.clear();
          await db.revisoes.clear();
          await db.cicloConfig.clear();
          try { localStorage.removeItem(Backup.CHAVE_ULTIMO); } catch (e) {}
          Modal.fechar();
          Toast.sucesso('Todos os dados foram apagados.');
          setTimeout(() => location.reload(), 800);
        } catch (e) { Toast.erro(e?.message ?? 'Erro'); }
      });
    });
  });
};

/* ============ MODAL: Setup Concurso ============ */
async function abrirModalSetupConcurso() {
  Modal.abrir(`
    <h2 class="modal-title">Novo Concurso</h2>
    <p class="modal-text">Configure os dados b\u00e1sicos do seu concurso.</p>
    <div class="form-group">
      <label>Nome do concurso</label>
      <input type="text" id="setup-nome" placeholder="Ex: PF Agente 2025" />
    </div>
    <div class="form-group">
      <label>Data da prova</label>
      <input type="date" id="setup-data" />
    </div>
    <div class="form-group">
      <label>Horas di\u00e1rias de estudo</label>
      <input type="number" id="setup-horas" min="1" max="16" step="0.5" value="4" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn btn-primary" id="btn-criar-conc">Criar</button>
    </div>
  `);
  document.getElementById('btn-criar-conc')?.addEventListener('click', async () => {
    const nome = document.getElementById('setup-nome')?.value?.trim();
    const data = document.getElementById('setup-data')?.value;
    const horas = parseFloat(document.getElementById('setup-horas')?.value);
    if (!nome) return Toast.aviso('Informe o nome do concurso.');
    try {
      await Concursos.criar({
        nome,
        dataProva: data ? new Date(data + 'T00:00:00').toISOString() : null,
        horasDiarias: isNaN(horas) ? 4 : horas
      });
      Modal.fechar();
      Toast.sucesso('Concurso criado! Agora cadastre suas disciplinas em Configura\u00e7\u00f5es.');
      Router.ir('configuracoes');
    } catch (e) { Toast.erro(e?.message ?? 'Erro'); }
  });
}
window.abrirModalSetupConcurso = abrirModalSetupConcurso;

/* ============ MODAL: Disciplina ============ */
async function abrirModalDisciplina(id) {
  const concurso = await Concursos.ativo();
  if (!concurso) return;
  let disc = null;
  if (id) disc = await Disciplinas.obter(id);
  const corPadrao = disc?.cor ?? CORES_PADRAO[Math.floor(Math.random() * CORES_PADRAO.length)];
  Modal.abrir(`
    <h2 class="modal-title">${id ? 'Editar' : 'Nova'} Disciplina</h2>
    <div class="form-group">
      <label>Nome</label>
      <input type="text" id="disc-nome" value="${escapeHtml(disc?.nome ?? '')}" placeholder="Ex: Direito Administrativo" />
    </div>
    <div class="form-group">
      <label>Peso (1-10) <span class="text-dim">- maior peso = mais tempo no ciclo</span></label>
      <input type="number" id="disc-peso" min="1" max="10" value="${disc?.peso ?? 5}" />
    </div>
    <div class="form-group">
      <div class="row" style="border:none;padding:0;">
        <span>Eliminat\u00f3ria</span>
        <div class="toggle-switch ${disc?.eliminatoria ? 'active' : ''}" id="disc-eliminatoria" role="switch" tabindex="0"></div>
      </div>
    </div>
    <div class="form-group">
      <label>Cor</label>
      <input type="color" id="disc-cor" value="${corPadrao}" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn btn-primary" id="btn-salvar-disc">Salvar</button>
    </div>
  `);

  const tog = document.getElementById('disc-eliminatoria');
  tog?.addEventListener('click', () => tog.classList.toggle('active'));

  document.getElementById('btn-salvar-disc')?.addEventListener('click', async () => {
    const nome = document.getElementById('disc-nome')?.value?.trim();
    const peso = parseInt(document.getElementById('disc-peso')?.value);
    const elim = document.getElementById('disc-eliminatoria')?.classList.contains('active');
    const cor = document.getElementById('disc-cor')?.value ?? '#e94560';
    if (!nome) return Toast.aviso('Informe o nome da disciplina.');
    try {
      if (id) {
        await Disciplinas.atualizar(id, { nome, peso: isNaN(peso) ? 5 : peso, eliminatoria: elim, cor });
        Toast.sucesso('Disciplina atualizada!');
      } else {
        const lista = await Disciplinas.listar(concurso.id);
        await Disciplinas.criar({
          concursoId: concurso.id,
          nome,
          peso: isNaN(peso) ? 5 : peso,
          eliminatoria: elim,
          cor,
          ordemCiclo: lista.length
        });
        Toast.sucesso('Disciplina criada!');
      }
      Modal.fechar();
      Router.ir('configuracoes');
    } catch (e) { Toast.erro(e?.message ?? 'Erro'); }
  });
}

async function confirmarExcluirDisciplina(id) {
  Modal.abrir(`
    <h2 class="modal-title">Excluir disciplina?</h2>
    <p class="modal-text">Sess\u00f5es e revis\u00f5es vinculadas a esta disciplina permanecer\u00e3o no banco mas podem ficar sem refer\u00eancia. Deseja continuar?</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn btn-danger" id="btn-conf-excluir-d">Excluir</button>
    </div>
  `);
  document.getElementById('btn-conf-excluir-d')?.addEventListener('click', async () => {
    try {
      await Disciplinas.remover(id);
      // Tamb\u00e9m atualizar ciclo, removendo o id
      const concurso = await Concursos.ativo();
      if (concurso) {
        const cfg = await Ciclo.obter(concurso.id);
        if (cfg?.cicloJSON) {
          let arr = [];
          try { arr = JSON.parse(cfg.cicloJSON); } catch { arr = []; }
          arr = arr.filter(x => x !== id);
          await Ciclo.salvar(concurso.id, Math.min(cfg?.posicaoAtual ?? 0, Math.max(0, arr.length - 1)), JSON.stringify(arr));
        }
      }
      Modal.fechar();
      Toast.sucesso('Disciplina exclu\u00edda.');
      Router.ir('configuracoes');
    } catch (e) { Toast.erro(e?.message ?? 'Erro'); }
  });
}

/* ============ MODAL: Finalizar sess\u00e3o ============ */
async function abrirModalFinalizar(dadosSessao) {
  let avaliacao = 0;
  Modal.abrir(`
    <h2 class="modal-title">Sess\u00e3o conclu\u00edda!</h2>
    <p class="modal-text">Tempo total: <strong>${TempoUtil.formatarHhMm(dadosSessao?.duracaoSegundos)}</strong></p>
    <div class="form-group">
      <label class="text-center" style="display:block;">Como foi essa sess\u00e3o?</label>
      <div class="stars" id="stars-rating">
        ${[1,2,3,4,5].map(i => `<span class="star" data-val="${i}">\u2605</span>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label>Notas (opcional)</label>
      <textarea id="ses-notas" rows="3" placeholder="O que voc\u00ea achou? Pontos a revisar..."></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn btn-primary" id="btn-registrar-ses">Registrar Sess\u00e3o</button>
    </div>
  `, { fecharNoFundo: false });

  document.querySelectorAll('#stars-rating .star').forEach(s => {
    s.addEventListener('click', () => {
      avaliacao = parseInt(s.dataset.val);
      document.querySelectorAll('#stars-rating .star').forEach(x => {
        x.classList.toggle('active', parseInt(x.dataset.val) <= avaliacao);
      });
    });
  });

  document.getElementById('btn-registrar-ses')?.addEventListener('click', async () => {
    try {
      const notas = document.getElementById('ses-notas')?.value?.trim() ?? '';
      const sessaoData = {
        concursoId: dadosSessao?.concursoId,
        disciplinaId: dadosSessao?.disciplinaId,
        topico: dadosSessao?.topico,
        tipo: dadosSessao?.tipo,
        data: dadosSessao?.iniciadoEm ?? new Date().toISOString(),
        duracaoSegundos: dadosSessao?.duracaoSegundos ?? 0,
        avaliacao,
        notas
      };
      const id = await Sessoes.criar(sessaoData);
      sessaoData.id = id;

      // Se "Novo": criar 3 revis\u00f5es
      if (dadosSessao?.tipo === 'Novo') {
        await Revisoes.criarParaSessao(sessaoData);
      } else if (['Revis\u00e3o 1', 'Revis\u00e3o 2', 'Revis\u00e3o 3'].includes(dadosSessao?.tipo)) {
        const rev = await Revisoes.encontrarRevisaoCorrespondente(dadosSessao?.disciplinaId, dadosSessao?.topico, dadosSessao?.tipo);
        if (rev) await Revisoes.marcarFeita(rev.id);
      }

      // Avan\u00e7ar ciclo
      try { await Ciclo.avancarPosicao(dadosSessao?.concursoId); } catch {}

      Timer.resetar();

      // Modal de sucesso com frase
      const frase = FRASES_MOTIVACIONAIS[Math.floor(Math.random() * FRASES_MOTIVACIONAIS.length)];
      Modal.abrir(`
        <div class="text-center">
          <div style="font-size:60px;margin-bottom:8px;">\ud83c\udf89</div>
          <h2 class="modal-title">Sess\u00e3o registrada!</h2>
          <p class="modal-text" style="font-style:italic;font-size:15px;">"${escapeHtml(frase)}"</p>
        </div>
      `, { fecharNoFundo: false });

      setTimeout(() => {
        Modal.fechar();
        Router.ir('dashboard');
      }, 3000);
    } catch (e) {
      console.error(e);
      Toast.erro(e?.message ?? 'Erro ao salvar');
    }
  });
}
window.abrirModalFinalizar = abrirModalFinalizar;

/* ============ Bootstrap ============ */
window.addEventListener('DOMContentLoaded', async () => {
  // Setup nav events
  document.querySelectorAll('#bottom-nav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const pg = item.dataset.page;
      if (pg) Router.ir(pg);
    });
  });
  // Mostrar nav
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.style.display = 'flex';
  // Iniciar dashboard
  Router.ir('dashboard');
  // Atualiza badge a cada minuto
  setInterval(() => atualizarBadgeRevisoes(), 60000);
});
