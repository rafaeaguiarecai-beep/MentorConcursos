/* ====== MentorConcursos v3 - Lógica Principal e SPA ====== */

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

const CORES_PADRAO = ['#e94560','#60B5FF','#FF9149','#FF9898','#FF90BB','#80D8C3','#A19AD3','#72BF78','#fbbf24','#4ade80'];

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

  async ir(pagina, parametros = {}) {
    const paginaAtual = this.paginaAtual;
    const saindoDeEstudar = paginaAtual === 'estudar' && pagina !== 'estudar';
    if (saindoDeEstudar) {
      const podeSair = await confirmarAbandonoSessaoEmAndamento(pagina);
      if (!podeSair) return;
      Timer.parar();
      Timer.limparEstadoPersistido();
      const concursoAtivo = await Concursos.ativo();
      if (concursoAtivo?.id) limparRascunhoSessaoEstudo(concursoAtivo.id);
      atualizarTituloTimer();
    }
    this.paginaAtual = pagina;
    this.parametros = parametros ?? {};
    this.atualizarNav();
    Paginas.renderizar(pagina);
  },

  atualizarNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    const itens = nav.querySelectorAll('.nav-item');
    const mapaNav = {
      dashboard: 'dashboard', estudar: 'estudar', revisoes: 'revisoes',
      historico: 'historico', mais: 'mais', ciclo: 'mais',
      configuracoes: 'mais', questoes: 'questoes',
      acompanhamento: 'dashboard'
    };
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
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
window.escapeHtml = escapeHtml;


const InputSanitizer = {
  texto(valor, { max = 120, obrigatorio = false } = {}) {
    const limpo = String(valor ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (obrigatorio && !limpo) throw new Error('Campo obrigatório.');
    if (limpo.length > max) throw new Error(`Texto deve ter no máximo ${max} caracteres.`);
    return limpo;
  },
  inteiro(valor, { min = 0, max = 999999, fallback = 0 } = {}) {
    const n = Number.parseInt(valor, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  },
  percentual(valor, { fallback = 50 } = {}) {
    return this.inteiro(valor, { min: 1, max: 100, fallback });
  },
  corHex(valor, { fallback = '#e94560' } = {}) {
    const cor = String(valor ?? fallback).trim();
    return /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : fallback;
  },
  dataISOouNull(valor) {
    if (!valor) return null;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
};
window.InputSanitizer = InputSanitizer;

const CHAVE_RASCUNHO_PREFIXO = 'mentor_estudo_rascunho_';
let swRegistrationRef = null;

function chaveRascunhoSessao(concursoId) { return `${CHAVE_RASCUNHO_PREFIXO}${concursoId}`; }

function salvarRascunhoSessaoEstudo({ concursoId, disciplinaId, topico, tipo, duracaoMin }) {
  if (!concursoId) return;
  const payload = {
    disciplinaId: Number.parseInt(disciplinaId, 10) || null,
    topico: InputSanitizer.texto(topico, { max: 200 }),
    tipo: InputSanitizer.texto(tipo, { max: 20 }) || 'Novo',
    duracaoMin: InputSanitizer.inteiro(duracaoMin, { min: 1, max: 600, fallback: 45 }),
    atualizadoEm: new Date().toISOString()
  };
  try { localStorage.setItem(chaveRascunhoSessao(concursoId), JSON.stringify(payload)); } catch {}
}

function carregarRascunhoSessaoEstudo(concursoId) {
  if (!concursoId) return null;
  try {
    const bruto = localStorage.getItem(chaveRascunhoSessao(concursoId));
    if (!bruto) return null;
    return JSON.parse(bruto);
  } catch { return null; }
}

function limparRascunhoSessaoEstudo(concursoId) {
  if (!concursoId) return;
  try { localStorage.removeItem(chaveRascunhoSessao(concursoId)); } catch {}
}

async function confirmarAbandonoSessaoEmAndamento(paginaDestino) {
  const estado = Timer.estado();
  if (!(estado?.rodando || estado?.pausado) || (estado?.totalDecorrido ?? 0) <= 0) return true;

  return new Promise((resolve) => {
    Modal.abrir(`
      <div class="modal-title">⚠️ Sessão em andamento</div>
      <div class="modal-text">Há uma sessão de estudo em andamento. Sair para <strong>${escapeHtml(paginaDestino)}</strong> irá descartar o progresso não salvo.</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancelar-sair-timer">Continuar estudando</button>
        <button class="btn btn-danger" id="confirmar-sair-timer">Sair e descartar</button>
      </div>
    `, { fecharNoFundo: false });

    document.getElementById('cancelar-sair-timer')?.addEventListener('click', () => { Modal.fechar(); resolve(false); });
    document.getElementById('confirmar-sair-timer')?.addEventListener('click', () => { Modal.fechar(); resolve(true); });
  });
}

function atualizarTituloTimer() {
  const estado = Timer.estado();
  if (estado?.rodando || estado?.pausado) {
    const tempo = estado?.extra > 0 ? `+${TempoUtil.formatarMmSs(estado.extra)}` : TempoUtil.formatarMmSs(estado.restante);
    document.title = `${tempo} · MentorConcursos`;
    return;
  }
  document.title = 'MentorConcursos';
}

function exibirToastAtualizacaoSW(registration) {
  const cont = document.getElementById('toast-container');
  if (!cont) return;
  const t = document.createElement('div');
  t.className = 'toast warning';
  t.innerHTML = `Nova versão disponível — <button class="btn btn-sm btn-primary" id="btn-sw-atualizar">Atualizar agora</button>`;
  cont.appendChild(t);
  document.getElementById('btn-sw-atualizar')?.addEventListener('click', () => {
    const worker = registration?.waiting;
    worker?.postMessage({ type: 'SKIP_WAITING' });
  });
}

async function registrarServiceWorkerConfiavel() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swRegistrationRef = await navigator.serviceWorker.register('sw.js');
    if (swRegistrationRef?.waiting) exibirToastAtualizacaoSW(swRegistrationRef);

    swRegistrationRef.addEventListener('updatefound', () => {
      const novoWorker = swRegistrationRef.installing;
      if (!novoWorker) return;
      novoWorker.addEventListener('statechange', () => {
        if (novoWorker.state === 'installed' && navigator.serviceWorker.controller) {
          exibirToastAtualizacaoSW(swRegistrationRef);
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  } catch (e) {
    console.warn('SW falhou:', e);
  }
}

async function verificarIntegridadeBanco() {
  const tabelas = window.BACKUP_TABLES ?? [];
  const resumo = [];
  for (const t of tabelas) {
    const total = await db[t].count();
    resumo.push({ tabela: t, total });
  }

  const concursos = await Concursos.listarTodos?.() ?? [];
  const conflitos = concursos.length > 1;
  return { resumo, conflitos, totalConcursos: concursos.length };
}


/* Autocomplete simples reutilizável */
function setupAutocomplete(inputId, getSuggestionsFn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const wrapperId = inputId + '-ac-wrap';
  let wrap = document.getElementById(wrapperId);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = wrapperId;
    wrap.className = 'autocomplete-list';
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(wrap);
  }

  const atualizar = async () => {
    const val = (input.value ?? '').trim().toLowerCase();
    if (val.length < 1) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    const sugestoes = await getSuggestionsFn();
    const filtradas = sugestoes.filter(s => s.toLowerCase().includes(val)).slice(0, 8);
    if (filtradas.length === 0 || (filtradas.length === 1 && filtradas[0].toLowerCase() === val)) {
      wrap.innerHTML = ''; wrap.style.display = 'none'; return;
    }
    wrap.style.display = 'block';
    wrap.innerHTML = filtradas.map(s =>
      `<div class="autocomplete-item">${escapeHtml(s)}</div>`
    ).join('');
    wrap.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = item.textContent;
        wrap.innerHTML = ''; wrap.style.display = 'none';
        input.dispatchEvent(new Event('input'));
      });
    });
  };

  input.addEventListener('input', atualizar);
  input.addEventListener('focus', atualizar);
  input.addEventListener('blur', () => {
    setTimeout(() => { wrap.innerHTML = ''; wrap.style.display = 'none'; }, 200);
  });
}
window.setupAutocomplete = setupAutocomplete;

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
      document.getElementById('btn-setup')?.addEventListener('click', () => abrirModalSetupConcurso());
      return;
    }

    const sessoes = await Sessoes.listar(concurso.id);
    const totalSeg = (sessoes ?? []).reduce((acc, s) => acc + (s?.duracaoSegundos ?? 0), 0);
    const numSessoes = sessoes?.length ?? 0;
    const paraHoje = await Revisoes.paraHoje(concurso.id);
    const atrasadas = await Revisoes.atrasadas(concurso.id);
    const proximas = await Revisoes.pendentes(concurso.id);
    const proximasOrdenadas = (proximas ?? []).slice(0, 5);
    const disciplinas = await Disciplinas.listar(concurso.id);
    const mapaDisc = {};
    for (const d of disciplinas ?? []) mapaDisc[d.id] = d;

    // Distribuição de tempo
    const distribuicao = DistribuicaoEstudo.calcularDistribuicao(disciplinas, concurso.horasDiarias);

    // Estatísticas de questões
    const statsQuestoes = await Questoes.estatisticasPorDisciplina(concurso.id);

    // Alertas eliminatórias
    const alertasEliminatorias = [];
    for (const d of disciplinas ?? []) {
      if (!d.eliminatoria) continue;
      const info = DistribuicaoEstudo.calcularMinimoEliminatoria(d);
      if (!info) continue;
      const stats = statsQuestoes[d.id];
      const taxa = stats ? Questoes.taxaAcerto(stats) : null;
      alertasEliminatorias.push({ disciplina: d, info, taxa, stats });
    }

    const precisaBackup = Backup.precisaLembrar();
    const dias = Backup.diasDesdeUltimo();

    // ---- META SEMANAL ----
    const metaSemanalSeg = (concurso.horasDiarias ?? 4) * 3600 * 7;
    const inicioSem = DataUtil.inicioSemana(new Date());
    const fimSem = DataUtil.fimSemana(new Date());
    const sessSemana = (sessoes ?? []).filter(s => {
      const d = new Date(s?.data);
      return d >= inicioSem && d <= fimSem;
    });
    const segEstudadosSemana = sessSemana.reduce((a, s) => a + (s?.duracaoSegundos ?? 0), 0);
    const pctSemana = metaSemanalSeg > 0 ? Math.min(100, Math.round((segEstudadosSemana / metaSemanalSeg) * 100)) : 0;

    // Dias já estudados na semana
    const diasEstudadosSet = new Set();
    for (const s of sessSemana) {
      diasEstudadosSet.add(new Date(s?.data).toDateString());
    }
    const diasEstudados = diasEstudadosSet.size;
    const diaDaSemana = new Date().getDay(); // 0=dom
    const diasPassados = diaDaSemana === 0 ? 7 : diaDaSemana; // seg=1 ... dom=7
    const diasRestantes = 7 - diasPassados;
    const segRestantes = metaSemanalSeg - segEstudadosSemana;
    const metaDiariaSugerida = diasRestantes > 0 ? Math.max(0, segRestantes / diasRestantes) : 0;

    main.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">${escapeHtml(concurso.nome)}</p>
      </div>

      ${precisaBackup ? `
      <div class="banner" id="banner-backup">
        <div class="banner-icon">⚠️</div>
        <div class="banner-content">
          <strong>${dias === null ? 'Você ainda não fez backup' : `Backup há ${dias} dias`}</strong>
          Proteja seus dados!
        </div>
        <button class="btn btn-sm btn-primary" id="banner-export">Exportar</button>
      </div>` : ''}

      <div class="card meta-semanal-card">
        <div class="card-title">Meta da Semana</div>
        <div class="meta-resumo">
          <div class="meta-resumo-item">
            <div class="meta-resumo-valor">${TempoUtil.formatarHhMm(segEstudadosSemana)}</div>
            <div class="meta-resumo-label">Estudado</div>
          </div>
          <div class="meta-resumo-item">
            <div class="meta-resumo-valor">${TempoUtil.formatarHhMm(metaSemanalSeg)}</div>
            <div class="meta-resumo-label">Meta semanal</div>
          </div>
          <div class="meta-resumo-item">
            <div class="meta-resumo-valor">${pctSemana}%</div>
            <div class="meta-resumo-label">Concluído</div>
          </div>
        </div>
        <div class="progress-bar" style="height:10px;margin:10px 0;">
          <div class="progress-bar-fill" style="width:${pctSemana}%;background:${pctSemana >= 100 ? '#4ade80' : pctSemana >= 60 ? '#fbbf24' : '#e94560'};"></div>
        </div>
        <div class="meta-resumo" style="margin-top:8px;">
          <div class="meta-resumo-item">
            <div class="meta-resumo-valor">${diasEstudados}/${diasPassados}</div>
            <div class="meta-resumo-label">Dias estudados</div>
          </div>
          <div class="meta-resumo-item">
            <div class="meta-resumo-valor">${TempoUtil.formatarHhMm(metaDiariaSugerida)}</div>
            <div class="meta-resumo-label">Meta hoje${diasRestantes > 1 ? ` (${diasRestantes}d rest.)` : ''}</div>
          </div>
          <div class="meta-resumo-item">
            <div class="meta-resumo-valor">${sessSemana.length}</div>
            <div class="meta-resumo-label">Sessões</div>
          </div>
        </div>
        <button class="btn btn-sm btn-secondary" id="btn-ver-acompanhamento" style="margin-top:12px;width:100%;">Ver acompanhamento completo</button>
      </div>

      <div class="card countdown-card">
        <div class="card-title">Contagem regressiva</div>
        <div class="card-value" id="countdown-status">Calculando...</div>
        <div class="countdown-grid" id="countdown-grid"></div>
      </div>

      <div class="card-grid">
        <div class="card">
          <div class="card-title">Horas totais</div>
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

      ${alertasEliminatorias.length > 0 ? `
      <div class="card">
        <div class="card-title">⚠️ Alertas Eliminatórias</div>
        ${alertasEliminatorias.map(a => {
          const corStatus = a.taxa !== null ? (a.taxa >= a.info.percentual ? 'text-success' : 'text-danger') : 'text-dim';
          return `<div class="eliminatoria-alerta">
            <span class="color-dot" style="background-color:${escapeHtml(a.disciplina.cor)}"></span>
            <div class="item-content">
              <div class="item-title">${escapeHtml(a.disciplina.nome)}</div>
              <div class="item-subtitle">Mínimo: ${a.info.minimoQuestoes}/${a.info.totalQuestoes} questões (${a.info.percentual}%)
              ${a.taxa !== null ? ` · Sua taxa: <span class="${corStatus}">${a.taxa.toFixed(0)}%</span> (${a.stats.total} questões)` : ' · Sem dados de questões ainda'}</div>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div class="card">
        <div class="card-title">Distribuição ideal de tempo</div>
        ${distribuicao.map(d => {
          const pct = (d.proporcao * 100).toFixed(0);
          const grauLabel = DistribuicaoEstudo.LABELS_CONHECIMENTO[d.disciplina.grauConhecimento] ?? '';
          return `<div class="distribuicao-item">
            <div class="distribuicao-header">
              <span class="color-dot" style="background-color:${escapeHtml(d.disciplina.cor)}"></span>
              <span class="distribuicao-nome">${escapeHtml(d.disciplina.nome)}</span>
              <span class="distribuicao-tempo">${TempoUtil.formatarHhMm(d.segundosSugeridos)} (${pct}%)</span>
            </div>
            <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%;background-color:${escapeHtml(d.disciplina.cor)}"></div></div>
            <div class="distribuicao-detalhe">${d.disciplina.numQuestoes ?? 0}q × peso ${d.disciplina.pesoQuestao ?? 1} = ${d.pontosMax}pts · ${grauLabel}</div>
          </div>`;
        }).join('')}
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
              const hj = DataUtil.hoje();
              const atrasada = data < hj;
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

    // Event listeners do dashboard
    if (precisaBackup) {
      document.getElementById('banner-export')?.addEventListener('click', async () => {
        try { await Backup.exportar(); Toast.sucesso('Backup exportado!'); Router.ir('dashboard'); }
        catch (e) { Toast.erro(e?.message ?? 'Erro ao exportar'); }
      });
    }
    document.getElementById('card-revisoes-hoje')?.addEventListener('click', () => Router.ir('revisoes'));
    document.getElementById('btn-ver-acompanhamento')?.addEventListener('click', () => Router.ir('acompanhamento'));

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
      if (diff <= 0) { status.textContent = 'Prova já ocorreu'; grid.innerHTML = ''; return; }
      const dd = Math.floor(diff / 86400000);
      const hh = Math.floor((diff % 86400000) / 3600000);
      const mm = Math.floor((diff % 3600000) / 60000);
      const ss = Math.floor((diff % 60000) / 1000);
      status.textContent = `${dd} dia${dd !== 1 ? 's' : ''} até a prova`;
      grid.innerHTML = `
        <div class="countdown-unit"><span class="countdown-value">${dd}</span><span class="countdown-label">Dias</span></div>
        <div class="countdown-unit"><span class="countdown-value">${hh}</span><span class="countdown-label">Horas</span></div>
        <div class="countdown-unit"><span class="countdown-value">${mm}</span><span class="countdown-label">Min</span></div>
        <div class="countdown-unit"><span class="countdown-value">${ss}</span><span class="countdown-label">Seg</span></div>`;
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

    const cfg = await Ciclo.obter(concurso.id);
    let disciplinaSugeridaId = null;
    if (cfg?.cicloJSON) {
      let ciclo = [];
      try { ciclo = JSON.parse(cfg.cicloJSON); } catch {}
      if (ciclo.length > 0) disciplinaSugeridaId = ciclo[(cfg?.posicaoAtual ?? 0) % ciclo.length];
    }
    if (!disciplinaSugeridaId) disciplinaSugeridaId = disciplinas[0]?.id;

    const rascunho = carregarRascunhoSessaoEstudo(concurso.id);
    const params = Router.parametros ?? {};
    if (params?.disciplinaId) disciplinaSugeridaId = params.disciplinaId;

    const tipoPre = params?.tipo ?? rascunho?.tipo ?? 'Novo';
    const topicoPre = params?.topico ?? rascunho?.topico ?? '';
    let disciplinaSelId = params?.disciplinaId ?? rascunho?.disciplinaId ?? disciplinaSugeridaId;
    let tipoSelecionado = tipoPre;
    Router.parametros = {};

    const distribuicao = DistribuicaoEstudo.calcularDistribuicao(disciplinas, concurso.horasDiarias);
    const distDisc = distribuicao.find(d => d.disciplina.id === disciplinaSelId);
    const minutosSugeridos = rascunho?.duracaoMin ?? (distDisc ? Math.max(5, Math.round(distDisc.segundosSugeridos / 60)) : 45);

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
        <input type="text" id="in-topico" maxlength="200" placeholder="Ex: Lei 8112 - Posse e exercício" value="${escapeHtml(topicoPre)}" autocomplete="off" />
      </div>

      <div class="form-group">
        <label>Tipo</label>
        <div class="pill-group" id="pills-tipo">
          ${['Novo','Revisão 1','Revisão 2','Revisão 3','Questões'].map(t => `<button class="pill ${t === tipoSelecionado ? 'active' : ''}" data-tipo="${t}">${t}</button>`).join('')}
        </div>
      </div>

      <div class="timer-edit">
        <button class="btn-icon" id="btn-menos5">-5min</button>
        <input type="number" id="in-duracao" min="1" max="600" value="${minutosSugeridos}" />
        <span class="text-dim">min</span>
        <button class="btn-icon" id="btn-mais5">+5min</button>
      </div>

      <div class="timer-presets">
        ${[25,30,45,60].map(m => `<button class="timer-preset" data-min="${m}">${m}min</button>`).join('')}
      </div>

      <div class="timer-container">
        <div class="timer-circle">
          <svg class="timer-svg" viewBox="0 0 200 200">
            <circle class="timer-track" cx="100" cy="100" r="92"></circle>
            <circle class="timer-progress" id="timer-progress" cx="100" cy="100" r="92" stroke-dasharray="578" stroke-dashoffset="0"></circle>
          </svg>
          <div class="timer-display">
            <div class="timer-time" id="timer-time">${TempoUtil.formatarMmSs(minutosSugeridos * 60)}</div>
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

    const renderCardDisc = () => {
      const d = disciplinas.find(x => x.id === disciplinaSelId) ?? disciplinas[0];
      const card = document.getElementById('card-disciplina-atual');
      if (!card || !d) return;
      const dist = distribuicao.find(x => x.disciplina.id === d.id);
      const grauLabel = DistribuicaoEstudo.LABELS_CONHECIMENTO[d.grauConhecimento] ?? '';
      const metaSemanalDisc = dist ? dist.segundosSugeridos * 7 : 0;
      card.style.backgroundColor = d?.cor ?? '#e94560';
      card.innerHTML = `<div class="estudar-discipline-label">Próxima no ciclo</div>
        <div class="estudar-discipline-name">${escapeHtml(d?.nome ?? '-')}</div>
        <div class="estudar-discipline-label" style="margin-top:4px;">${d.numQuestoes ?? 0}q × peso ${d.pesoQuestao ?? 1} = ${(d.numQuestoes ?? 0) * (d.pesoQuestao ?? 1)}pts · ${grauLabel}${dist ? ' · ~' + TempoUtil.formatarHhMm(dist.segundosSugeridos) + '/dia · ~' + TempoUtil.formatarHhMm(metaSemanalDisc) + '/sem' : ''}</div>`;
    };
    renderCardDisc();

    setupAutocomplete('in-topico', async () => await Questoes.topicosUsados(disciplinaSelId));

    const sel = document.getElementById('sel-disciplina');
    const inTopico = document.getElementById('in-topico');
    const inDur = document.getElementById('in-duracao');
    const btnIniciar = document.getElementById('btn-iniciar');
    const btnResetar = document.getElementById('btn-resetar');
    const btnFinalizar = document.getElementById('btn-finalizar');
    const controlesExtras = document.getElementById('controles-extras');
    const elTime = document.getElementById('timer-time');
    const elState = document.getElementById('timer-state');
    const elProg = document.getElementById('timer-progress');

    const salvarDraftUI = () => {
      salvarRascunhoSessaoEstudo({
        concursoId: concurso.id,
        disciplinaId: disciplinaSelId,
        topico: inTopico?.value,
        tipo: tipoSelecionado,
        duracaoMin: inDur?.value
      });
    };

    sel?.addEventListener('change', () => {
      disciplinaSelId = parseInt(sel.value, 10);
      renderCardDisc();
      const novaDist = distribuicao.find(d => d.disciplina.id === disciplinaSelId);
      if (novaDist && !Timer.rodando && !Timer.pausado) {
        const novosMin = Math.max(5, Math.round(novaDist.segundosSugeridos / 60));
        if (inDur) inDur.value = novosMin;
        Timer.setDuracao(novosMin);
      }
      salvarDraftUI();
      atualizarUITimer();
    });

    inTopico?.addEventListener('input', salvarDraftUI);

    document.querySelectorAll('#pills-tipo .pill').forEach(p => {
      p.addEventListener('click', () => {
        document.querySelectorAll('#pills-tipo .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        tipoSelecionado = p.dataset.tipo;
        salvarDraftUI();
      });
    });

    Timer.off('tick'); Timer.off('iniciar'); Timer.off('pausar'); Timer.off('retomar'); Timer.off('reset');

    const restaurou = Timer.carregarEstado();
    if (!restaurou || !(Timer.estado()?.rodando || Timer.estado()?.pausado || (Timer.estado()?.totalDecorrido ?? 0) > 0)) {
      Timer.init(parseInt(inDur?.value, 10) || minutosSugeridos);
    } else if (inDur) {
      inDur.value = String(Math.round((Timer.estado()?.duracaoInicial ?? minutosSugeridos * 60) / 60));
    }

    inDur?.addEventListener('input', () => {
      if (Timer.setDuracao(parseInt(inDur.value, 10))) {
        salvarDraftUI();
        atualizarUITimer();
      }
    });

    document.getElementById('btn-menos5')?.addEventListener('click', () => {
      if (Timer.ajustar(-5)) { if (inDur) inDur.value = String(Timer.duracaoInicial / 60); salvarDraftUI(); atualizarUITimer(); }
    });
    document.getElementById('btn-mais5')?.addEventListener('click', () => {
      if (Timer.ajustar(5)) { if (inDur) inDur.value = String(Timer.duracaoInicial / 60); salvarDraftUI(); atualizarUITimer(); }
    });

    document.querySelectorAll('.timer-preset').forEach(b => {
      b.addEventListener('click', () => {
        const m = parseInt(b.dataset.min, 10);
        if (Timer.setDuracao(m)) { if (inDur) inDur.value = String(m); salvarDraftUI(); atualizarUITimer(); }
      });
    });

    function atualizarUITimer() {
      const e = Timer.estado();
      const total = e.duracaoInicial;
      const r = e.restante;
      const ex = e.extra;
      const circ = 578;
      if (ex > 0) {
        elTime.textContent = '+' + TempoUtil.formatarMmSs(ex);
        elTime.classList.add('extra'); elProg.classList.add('extra');
        elProg.setAttribute('stroke-dashoffset', '0');
      } else {
        elTime.textContent = TempoUtil.formatarMmSs(r);
        elTime.classList.remove('extra'); elProg.classList.remove('extra');
        elProg.setAttribute('stroke-dashoffset', String(circ * (1 - r / total)));
      }
      if (e.rodando) { elState.textContent = 'Em foco'; btnIniciar.textContent = 'PAUSAR'; btnIniciar.classList.add('paused'); }
      else if (e.pausado) { elState.textContent = 'Pausado'; btnIniciar.textContent = 'RETOMAR'; btnIniciar.classList.remove('paused'); }
      else { elState.textContent = 'Pronto'; btnIniciar.textContent = 'INICIAR'; btnIniciar.classList.remove('paused'); }
      controlesExtras.style.display = (e.rodando || e.pausado || e.totalDecorrido > 0) ? 'flex' : 'none';
      atualizarTituloTimer();
    }

    atualizarUITimer();
    Timer.on('tick', atualizarUITimer);
    Timer.on('iniciar', atualizarUITimer);
    Timer.on('pausar', atualizarUITimer);
    Timer.on('retomar', atualizarUITimer);
    Timer.on('reset', atualizarUITimer);

    btnIniciar?.addEventListener('click', () => {
      try {
        if (!Timer.audioCtx) { const Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) Timer.audioCtx = new Ctx(); }
        if (Timer.audioCtx?.state === 'suspended') Timer.audioCtx.resume?.();
      } catch {}
      const e = Timer.estado();
      if (e.rodando) Timer.pausar();
      else if (e.pausado) Timer.retomar();
      else Timer.iniciar();
      salvarDraftUI();
    });

    btnResetar?.addEventListener('click', () => {
      Timer.resetar();
      atualizarTituloTimer();
      salvarDraftUI();
    });

    btnFinalizar?.addEventListener('click', () => {
      const topico = InputSanitizer.texto(inTopico?.value, { max: 200 });
      if (!topico) { Toast.aviso('Informe o tópico estudado.'); return; }
      const e = Timer.estado();
      if ((e.totalDecorrido ?? 0) < 1) { Toast.aviso('Inicie o timer antes de finalizar.'); return; }
      Timer.parar();
      abrirModalFinalizar({ concursoId: concurso.id, disciplinaId: disciplinaSelId, topico, tipo: tipoSelecionado, duracaoSegundos: e.totalDecorrido, iniciadoEm: e.iniciadoEm });
    });

    salvarDraftUI();
    atualizarTituloTimer();
  }
};
window.Paginas = Paginas;

/* ===== REVISÕES ===== */
Paginas.revisoes = async function(main) {
  const concurso = await Concursos.ativo();
  if (!concurso) { main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">🎯</div><div class="empty-state-text">Configure um concurso primeiro</div></div>'; return; }
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
    todas: () => true
  };

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Revisões</h1>
      <p class="page-subtitle">${pendentes.length} pendente${pendentes.length !== 1 ? 's' : ''}</p>
    </div>
    <div class="tabs">
      <button class="tab ${filtroAtual === 'hoje' ? 'active' : ''}" data-filtro="hoje">Hoje</button>
      <button class="tab ${filtroAtual === 'atrasadas' ? 'active' : ''}" data-filtro="atrasadas">Atrasadas</button>
      <button class="tab ${filtroAtual === 'proximos7' ? 'active' : ''}" data-filtro="proximos7">Próximos 7 dias</button>
      <button class="tab ${filtroAtual === 'todas' ? 'active' : ''}" data-filtro="todas">Todas</button>
    </div>
    <div id="lista-revisoes"></div>`;

  function renderLista(filtro) {
    const cont = document.getElementById('lista-revisoes');
    if (!cont) return;
    const lista = (todas ?? []).filter(filtros[filtro] ?? filtros.hoje);
    if (lista.length === 0) { cont.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">✨</div><div class="empty-state-text">Nenhuma revisão nesta categoria.</div></div>'; return; }
    cont.innerHTML = lista.map(r => {
      const d = mapaDisc[r?.disciplinaId];
      const data = new Date(r?.dataPrevista);
      const atrasada = r?.status === 'pendente' && data < hoje;
      const tipoMap = { 'R1': 'Revisão 1', 'R2': 'Revisão 2', 'R3': 'Revisão 3' };
      const tipoCompleto = tipoMap[r?.tipoRevisao] ?? 'Revisão';
      return `<div class="review-item ${atrasada ? 'overdue' : ''}" data-id="${r.id}" data-disc="${r?.disciplinaId}" data-topico="${escapeHtml(r?.topico ?? '')}" data-tipo="${tipoCompleto}" data-status="${r?.status}">
        <span class="color-dot color-dot-lg" style="background-color:${escapeHtml(d?.cor ?? '#e94560')}"></span>
        <div class="item-content">
          <div class="item-title">${escapeHtml(r?.topico ?? '-')}</div>
          <div class="item-subtitle">${escapeHtml(d?.nome ?? '-')} · <span class="review-type-badge">${escapeHtml(r?.tipoRevisao ?? '')}</span> ${atrasada ? '· ⚠️ atrasada' : ''} ${r?.status === 'feita' ? '· ✓ feita' : ''}</div>
        </div>
        <div class="item-meta">${DataUtil.formatarData(r?.dataPrevista)}</div>
      </div>`;
    }).join('');
    cont.querySelectorAll('.review-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.status === 'feita') return;
        Router.ir('estudar', { disciplinaId: parseInt(el.dataset.disc), topico: el.dataset.topico, tipo: el.dataset.tipo });
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

/* ===== HISTÓRICO ===== */
Paginas.historico = async function(main) {
  const concurso = await Concursos.ativo();
  if (!concurso) { main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">🎯</div><div class="empty-state-text">Configure um concurso primeiro</div></div>'; return; }
  const sessoes = await Sessoes.listar(concurso.id);
  const disciplinas = await Disciplinas.listar(concurso.id);
  const mapaDisc = {};
  for (const d of disciplinas ?? []) mapaDisc[d.id] = d;

  let filtroDisc = 'todas';
  let filtroPeriodo = 'todas';

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Histórico</h1>
      <p class="page-subtitle">${sessoes?.length ?? 0} sessões</p>
    </div>
    <div class="card">
      <div class="card-title">Horas por semana (últimas 8)</div>
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
      <label>Filtrar por período</label>
      <select id="filtro-periodo">
        <option value="todas">Todas</option>
        <option value="semana">Última semana</option>
        <option value="mes">Último mês</option>
      </select>
    </div>
    <div id="lista-historico"></div>`;

  function renderHistorico() {
    const cont = document.getElementById('lista-historico');
    if (!cont) return;
    let lista = sessoes ?? [];
    if (filtroDisc !== 'todas') lista = lista.filter(s => String(s?.disciplinaId) === String(filtroDisc));
    if (filtroPeriodo === 'semana') { const lim = DataUtil.adicionarDias(new Date(), -7); lista = lista.filter(s => new Date(s?.data) >= lim); }
    else if (filtroPeriodo === 'mes') { const lim = DataUtil.adicionarDias(new Date(), -30); lista = lista.filter(s => new Date(s?.data) >= lim); }
    if (lista.length === 0) { cont.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">📝</div><div class="empty-state-text">Nenhuma sessão registrada ainda.</div></div>'; return; }

    const grupos = {};
    for (const s of lista) { const d = new Date(s?.data ?? 0); const chave = DataUtil.inicioDia(d).toISOString(); if (!grupos[chave]) grupos[chave] = []; grupos[chave].push(s); }
    const chaves = Object.keys(grupos).sort((a, b) => new Date(b) - new Date(a));
    const hj = DataUtil.hoje();
    const ontem = DataUtil.adicionarDias(hj, -1);

    let html = '';
    for (const k of chaves) {
      const grupo = grupos[k];
      const totalSegDia = grupo.reduce((acc, s) => acc + (s?.duracaoSegundos ?? 0), 0);
      const dataGrupo = new Date(k);
      let label = DataUtil.formatarData(dataGrupo);
      if (dataGrupo.getTime() === hj.getTime()) label = 'Hoje';
      else if (dataGrupo.getTime() === ontem.getTime()) label = 'Ontem';
      html += `<div class="history-day-header">${label} <span class="history-day-total">· ${TempoUtil.formatarHhMm(totalSegDia)} · ${grupo.length} sessão${grupo.length !== 1 ? 'es' : ''}</span></div>`;
      for (const s of grupo) {
        const d = mapaDisc[s?.disciplinaId];
        const tipoIcons = { 'Novo': '📗', 'Revisão 1': '🔄', 'Revisão 2': '🔄', 'Revisão 3': '🔄', 'Questões': '📝' };
        const icon = tipoIcons[s?.tipo] ?? '📖';
        const stars = '★'.repeat(s?.avaliacao ?? 0) + '☆'.repeat(5 - (s?.avaliacao ?? 0));
        html += `<div class="session-item">
          <span style="font-size:20px;">${icon}</span>
          <div class="item-content">
            <div class="item-title">${escapeHtml(s?.topico ?? '-')}</div>
            <div class="item-subtitle"><span class="color-dot" style="background-color:${escapeHtml(d?.cor ?? '#e94560')};display:inline-block;margin-right:6px;vertical-align:middle;"></span>${escapeHtml(d?.nome ?? '-')} · ${escapeHtml(s?.tipo ?? '-')} · ${TempoUtil.formatarHhMm(s?.duracaoSegundos)}</div>
            ${(s?.avaliacao ?? 0) > 0 ? `<div class="session-rating">${stars}</div>` : ''}
            ${s?.notas ? `<div class="item-subtitle" style="margin-top:4px;font-style:italic;">"${escapeHtml(s.notas)}"</div>` : ''}
          </div>
        </div>`;
      }
    }
    cont.innerHTML = html;
  }
  document.getElementById('filtro-disciplina')?.addEventListener('change', (e) => { filtroDisc = e.target.value; renderHistorico(); });
  document.getElementById('filtro-periodo')?.addEventListener('change', (e) => { filtroPeriodo = e.target.value; renderHistorico(); });
  renderHistorico();
  setTimeout(() => Graficos.linhaSemanasHistorico('chart-historico', concurso.id), 50);
};

/* ===== QUESTÕES ===== */
Paginas.questoes = async function(main) {
  const concurso = await Concursos.ativo();
  if (!concurso) { main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">🎯</div><div class="empty-state-text">Configure um concurso primeiro</div></div>'; return; }
  const disciplinas = await Disciplinas.listar(concurso.id);
  if (!disciplinas || disciplinas.length === 0) { main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">📚</div><div class="empty-state-text">Adicione disciplinas em Configurações</div></div>'; return; }
  const mapaDisc = {};
  for (const d of disciplinas) mapaDisc[d.id] = d;

  const statsGeral = await Questoes.estatisticasPorDisciplina(concurso.id);
  const todasQuestoes = await Questoes.listar(concurso.id);

  let discSel = disciplinas[0]?.id;
  let tabAtiva = 'registrar';

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Questões</h1>
      <p class="page-subtitle">${todasQuestoes.length} questões registradas</p>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="registrar">Registrar</button>
      <button class="tab" data-tab="estatisticas">Estatísticas</button>
      <button class="tab" data-tab="historico-q">Histórico</button>
    </div>
    <div id="tab-content"></div>`;

  function renderTab(tab) {
    tabAtiva = tab;
    const cont = document.getElementById('tab-content');
    if (!cont) return;
    if (tab === 'registrar') renderRegistrar(cont);
    else if (tab === 'estatisticas') renderEstatisticas(cont);
    else if (tab === 'historico-q') renderHistoricoQ(cont);
  }

  function renderRegistrar(cont) {
    cont.innerHTML = `
      <div class="card" style="margin-top:12px;">
        <div class="card-title">Registrar questão</div>
        <div class="form-group">
          <label>Disciplina</label>
          <select id="q-disciplina">
            ${disciplinas.map(d => `<option value="${d.id}" ${d.id === discSel ? 'selected' : ''}>${escapeHtml(d.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Tópico / Assunto</label>
          <input type="text" id="q-topico" maxlength="200" placeholder="Ex: Princípios orçamentários" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>Origem (banca / concurso)</label>
          <input type="text" id="q-origem" maxlength="100" placeholder="Ex: CESPE - PF 2021" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>Resultado</label>
          <div class="resultado-grid">
            <button class="resultado-btn acertou" data-resultado="acertou">
              <span class="resultado-icon">✅</span>
              <span class="resultado-label">Acertou</span>
            </button>
            <button class="resultado-btn acertou-duvida" data-resultado="acertou_duvida">
              <span class="resultado-icon">🟡</span>
              <span class="resultado-label">Acertou com dúvida</span>
            </button>
            <button class="resultado-btn errou" data-resultado="errou">
              <span class="resultado-icon">❌</span>
              <span class="resultado-label">Errou</span>
            </button>
            <button class="resultado-btn errou-desatencao" data-resultado="errou_desatencao">
              <span class="resultado-icon">⚠️</span>
              <span class="resultado-label">Errou por desatenção</span>
            </button>
          </div>
        </div>
        <div id="q-feedback" style="display:none;"></div>
        <div id="q-contador" class="text-dim text-center mt-12"></div>
      </div>`;

    let contadorSessao = 0;

    setupAutocomplete('q-topico', async () => {
      const selVal = parseInt(document.getElementById('q-disciplina')?.value);
      return await Questoes.topicosUsados(selVal);
    });

    setupAutocomplete('q-origem', async () => {
      return await Questoes.origensUsadas(concurso.id);
    });

    document.getElementById('q-disciplina')?.addEventListener('change', (e) => {
      discSel = parseInt(e.target.value);
    });

    cont.querySelectorAll('.resultado-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const topico = InputSanitizer.texto(document.getElementById('q-topico')?.value, { max: 200 });
        const origem = InputSanitizer.texto(document.getElementById('q-origem')?.value, { max: 100 });
        const resultado = btn.dataset.resultado;

        if (!topico) { Toast.aviso('Informe o tópico da questão.'); return; }

        try {
          await Questoes.criar({
            concursoId: concurso.id,
            disciplinaId: discSel,
            topico,
            origem: origem ?? '',
            resultado
          });

          contadorSessao++;
          const feedback = document.getElementById('q-feedback');
          const labelRes = Questoes.LABELS_RESULTADO[resultado] ?? resultado;
          const iconeRes = Questoes.ICONES_RESULTADO[resultado] ?? '';
          if (feedback) {
            feedback.style.display = 'block';
            feedback.className = `q-feedback q-feedback-${resultado}`;
            feedback.innerHTML = `${iconeRes} ${escapeHtml(labelRes)} — <strong>${escapeHtml(topico)}</strong>`;
            setTimeout(() => { if (feedback) feedback.style.display = 'none'; }, 2500);
          }
          document.getElementById('q-contador').textContent = `${contadorSessao} questão${contadorSessao !== 1 ? 'ões' : ''} registrada${contadorSessao !== 1 ? 's' : ''} nesta sessão`;

          const inTopico = document.getElementById('q-topico');
          if (inTopico) { inTopico.value = ''; inTopico.focus(); }

        } catch (e) {
          Toast.erro('Erro ao registrar questão.');
          console.error(e);
        }
      });
    });
  }

  function renderEstatisticas(cont) {
    if (Object.keys(statsGeral).length === 0) {
      cont.innerHTML = '<div class="empty-state" style="margin-top:20px;"><div class="empty-state-emoji">📊</div><div class="empty-state-text">Registre questões para ver as estatísticas.</div></div>';
      return;
    }

    let totalGeral = 0, acertosGeral = 0, acertosDuvidaGeral = 0, errosGeral = 0, errosDesatGeral = 0;
    for (const did of Object.keys(statsGeral)) {
      const s = statsGeral[did];
      totalGeral += s.total;
      acertosGeral += s.acertou;
      acertosDuvidaGeral += s.acertouDuvida;
      errosGeral += s.errou;
      errosDesatGeral += s.errouDesatencao;
    }
    const taxaGeral = totalGeral > 0 ? (((acertosGeral + acertosDuvidaGeral) / totalGeral) * 100).toFixed(0) : 0;
    const taxaSolida = totalGeral > 0 ? ((acertosGeral / totalGeral) * 100).toFixed(0) : 0;

    let html = `
      <div class="card" style="margin-top:12px;">
        <div class="card-title">Resumo geral</div>
        <div class="card-grid" style="margin-bottom:0;">
          <div class="card"><div class="card-title">Total</div><div class="card-value">${totalGeral}</div></div>
          <div class="card"><div class="card-title">Taxa de acerto</div><div class="card-value">${taxaGeral}%</div></div>
          <div class="card"><div class="card-title">Acerto sólido</div><div class="card-value">${taxaSolida}%</div></div>
          <div class="card"><div class="card-title">Erros desatenção</div><div class="card-value">${errosDesatGeral}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Por disciplina</div>`;

    for (const d of disciplinas) {
      const s = statsGeral[d.id];
      if (!s) continue;
      const taxa = Questoes.taxaAcerto(s).toFixed(0);
      const taxaSol = Questoes.taxaAcertoSolido(s).toFixed(0);
      const elimInfo = DistribuicaoEstudo.calcularMinimoEliminatoria(d);
      const corTaxa = elimInfo ? (parseFloat(taxa) >= elimInfo.percentual ? 'text-success' : 'text-danger') : '';

      html += `
        <div class="stat-disciplina">
          <div class="stat-disc-header">
            <span class="color-dot" style="background-color:${escapeHtml(d.cor)}"></span>
            <strong>${escapeHtml(d.nome)}</strong>
            <span class="text-dim">${s.total} questões</span>
          </div>
          <div class="stat-disc-barras">
            <div class="stat-mini-bar">
              <div class="stat-mini-fill" style="width:${(s.acertou/s.total*100).toFixed(0)}%;background:#4ade80;" title="Acertou: ${s.acertou}"></div>
              <div class="stat-mini-fill" style="width:${(s.acertouDuvida/s.total*100).toFixed(0)}%;background:#fbbf24;" title="Acertou c/ dúvida: ${s.acertouDuvida}"></div>
              <div class="stat-mini-fill" style="width:${(s.errou/s.total*100).toFixed(0)}%;background:#ef4444;" title="Errou: ${s.errou}"></div>
              <div class="stat-mini-fill" style="width:${(s.errouDesatencao/s.total*100).toFixed(0)}%;background:#ff9149;" title="Desatenção: ${s.errouDesatencao}"></div>
            </div>
          </div>
          <div class="stat-disc-detalhe">
            Taxa: <span class="${corTaxa}">${taxa}%</span> · Sólido: ${taxaSol}%
            ${elimInfo ? ` · Mín. eliminatória: ${elimInfo.percentual}%` : ''}
            · ✅${s.acertou} 🟡${s.acertouDuvida} ❌${s.errou} ⚠️${s.errouDesatencao}
          </div>
        </div>`;
    }
    html += '</div>';
    cont.innerHTML = html;
  }

  async function renderHistoricoQ(cont) {
    const lista = todasQuestoes.slice(0, 100);
    if (lista.length === 0) {
      cont.innerHTML = '<div class="empty-state" style="margin-top:20px;"><div class="empty-state-emoji">📋</div><div class="empty-state-text">Nenhuma questão registrada ainda.</div></div>';
      return;
    }
    let html = '<div style="margin-top:12px;">';
    for (const q of lista) {
      const d = mapaDisc[q.disciplinaId];
      const icone = Questoes.ICONES_RESULTADO[q.resultado] ?? '❓';
      const label = Questoes.LABELS_RESULTADO[q.resultado] ?? q.resultado;
      html += `<div class="session-item">
        <span style="font-size:20px;">${icone}</span>
        <div class="item-content">
          <div class="item-title">${escapeHtml(q.topico ?? '-')}</div>
          <div class="item-subtitle"><span class="color-dot" style="background-color:${escapeHtml(d?.cor ?? '#e94560')};display:inline-block;margin-right:6px;vertical-align:middle;"></span>${escapeHtml(d?.nome ?? '-')} · ${escapeHtml(label)} ${q.origem ? '· ' + escapeHtml(q.origem) : ''}</div>
        </div>
        <div class="item-meta">${DataUtil.formatarData(q.data)}</div>
      </div>`;
    }
    html += '</div>';
    cont.innerHTML = html;
  }

  renderTab('registrar');
  document.querySelectorAll('.tabs .tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      renderTab(t.dataset.tab);
    });
  });
};

/* ===== CICLO ===== */
Paginas.ciclo = async function(main) {
  const concurso = await Concursos.ativo();
  if (!concurso) { main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">🎯</div><div class="empty-state-text">Configure um concurso primeiro</div></div>'; return; }
  const disciplinas = await Disciplinas.listar(concurso.id);
  const cfg = await Ciclo.obter(concurso.id);
  let cicloIds = [];
  if (cfg?.cicloJSON) { try { cicloIds = JSON.parse(cfg.cicloJSON); } catch { cicloIds = []; } }
  if (cicloIds.length === 0) cicloIds = (disciplinas ?? []).map(d => d.id);
  const posicaoAtual = cfg?.posicaoAtual ?? 0;
  const mapaDisc = {};
  for (const d of disciplinas ?? []) mapaDisc[d.id] = d;

  const distribuicao = DistribuicaoEstudo.calcularDistribuicao(disciplinas, concurso.horasDiarias);
  const distMap = {};
  for (const d of distribuicao) distMap[d.disciplina.id] = d;

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Ciclo de Estudos</h1>
      <p class="page-subtitle">Baseado no impacto na nota + grau de conhecimento</p>
    </div>
    <div class="btn-row mb-12">
      <button class="btn btn-primary" id="btn-gerar-auto">🎲 Gerar Ciclo Automático</button>
    </div>
    <div id="lista-ciclo"></div>`;

  function renderCiclo() {
    const cont = document.getElementById('lista-ciclo');
    if (!cont) return;
    if (cicloIds.length === 0) { cont.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">🔄</div><div class="empty-state-text">Gere um ciclo automático</div></div>'; return; }
    cont.innerHTML = cicloIds.map((id, idx) => {
      const d = mapaDisc[id];
      if (!d) return '';
      const dist = distMap[d.id];
      const isAtual = idx === posicaoAtual;
      const grauLabel = DistribuicaoEstudo.LABELS_CONHECIMENTO[d.grauConhecimento] ?? '';
      return `<div class="cycle-item ${isAtual ? 'current' : ''}" data-idx="${idx}">
        ${isAtual ? '<div class="cycle-current-tag">VOCÊ ESTÁ AQUI</div>' : ''}
        <span class="color-dot color-dot-lg" style="background-color:${escapeHtml(d?.cor ?? '#e94560')}"></span>
        <div class="item-content">
          <div class="item-title">${escapeHtml(d?.nome ?? '-')}</div>
          <div class="item-subtitle">${d.numQuestoes ?? 0}q × peso ${d.pesoQuestao ?? 1} = ${(d.numQuestoes ?? 0) * (d.pesoQuestao ?? 1)}pts · ${grauLabel}${dist ? ' · ~' + TempoUtil.formatarHhMm(dist.segundosSugeridos) : ''}</div>
        </div>
        <div class="cycle-controls">
          <button class="cycle-btn" data-acao="up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="cycle-btn" data-acao="down" data-idx="${idx}" ${idx === cicloIds.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
      </div>`;
    }).join('');

    cont.querySelectorAll('.cycle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        const acao = btn.dataset.acao;
        if (acao === 'up' && idx > 0) { [cicloIds[idx - 1], cicloIds[idx]] = [cicloIds[idx], cicloIds[idx - 1]]; }
        else if (acao === 'down' && idx < cicloIds.length - 1) { [cicloIds[idx], cicloIds[idx + 1]] = [cicloIds[idx + 1], cicloIds[idx]]; }
        await Ciclo.salvar(concurso.id, posicaoAtual, JSON.stringify(cicloIds));
        renderCiclo();
      });
    });
  }
  renderCiclo();

  document.getElementById('btn-gerar-auto')?.addEventListener('click', async () => {
    cicloIds = await Ciclo.gerarAutomatico(concurso.id, concurso.horasDiarias);
    Toast.sucesso('Ciclo gerado com base no impacto + conhecimento!');
    renderCiclo();
  });
};

/* ===== MAIS ===== */
Paginas.mais = async function(main) {
  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Mais</h1>
    </div>
    <div class="session-item" id="btn-ir-ciclo" style="cursor:pointer;">
      <span style="font-size:20px;">🔄</span>
      <div class="item-content"><div class="item-title">Ciclo de Estudos</div><div class="item-subtitle">Gerencie a ordem das disciplinas</div></div>
    </div>
    <div class="session-item" id="btn-ir-config" style="cursor:pointer;">
      <span style="font-size:20px;">⚙️</span>
      <div class="item-content"><div class="item-title">Configurações</div><div class="item-subtitle">Concurso, disciplinas e backup</div></div>
    </div>
    <div class="session-item" id="btn-ir-sobre" style="cursor:pointer;">
      <span style="font-size:20px;">ℹ️</span>
      <div class="item-content"><div class="item-title">Sobre</div><div class="item-subtitle">MentorConcursos v3.0</div></div>
    </div>`;
  document.getElementById('btn-ir-ciclo')?.addEventListener('click', () => Router.ir('ciclo'));
  document.getElementById('btn-ir-config')?.addEventListener('click', () => Router.ir('configuracoes'));
  document.getElementById('btn-ir-sobre')?.addEventListener('click', () => {
    Modal.abrir(`
      <div class="modal-title">MentorConcursos v3.0</div>
      <div class="modal-text">Gerenciador de estudos para concursos públicos. Meta semanal, acompanhamento temporal e visão por disciplina. Dados armazenados localmente via IndexedDB.</div>
      <div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.fechar()">Fechar</button></div>
    `);
  });
};

/* ===== ACOMPANHAMENTO (NOVO v3) ===== */
Paginas.acompanhamento = async function(main) {
  const concurso = await Concursos.ativo();
  if (!concurso) { main.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">🎯</div><div class="empty-state-text">Configure um concurso primeiro</div></div>'; return; }
  const sessoes = await Sessoes.listar(concurso.id);
  const disciplinas = await Disciplinas.listar(concurso.id);
  const mapaDisc = {};
  for (const d of disciplinas ?? []) mapaDisc[d.id] = d;
  const distribuicao = DistribuicaoEstudo.calcularDistribuicao(disciplinas, concurso.horasDiarias);
  const distMap = {};
  for (const d of distribuicao) distMap[d.disciplina.id] = d;

  let tabAtiva = 'semanal';

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Acompanhamento</h1>
      <p class="page-subtitle">${escapeHtml(concurso.nome)}</p>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="semanal">Semanal</button>
      <button class="tab" data-tab="mensal">Mensal</button>
      <button class="tab" data-tab="total">Total</button>
      <button class="tab" data-tab="disciplinas">Disciplinas</button>
    </div>
    <div id="acomp-content"></div>`;

  function sessoesPeriodo(inicio, fim) {
    return (sessoes ?? []).filter(s => {
      const d = new Date(s?.data);
      return d >= inicio && d <= fim;
    });
  }

  function segPorDisc(lista) {
    const mapa = {};
    for (const s of lista) {
      const id = s?.disciplinaId;
      mapa[id] = (mapa[id] || 0) + (s?.duracaoSegundos ?? 0);
    }
    return mapa;
  }

  function diasEstudadosCount(lista) {
    const s = new Set();
    for (const sess of lista) s.add(new Date(sess?.data).toDateString());
    return s.size;
  }

  function renderTab(tab) {
    tabAtiva = tab;
    const cont = document.getElementById('acomp-content');
    if (!cont) return;
    if (tab === 'semanal') renderSemanal(cont);
    else if (tab === 'mensal') renderMensal(cont);
    else if (tab === 'total') renderTotal(cont);
    else if (tab === 'disciplinas') renderDisciplinas(cont);
  }

  function renderSemanal(cont) {
    const inicioSem = DataUtil.inicioSemana(new Date());
    const fimSem = DataUtil.fimSemana(new Date());
    const lista = sessoesPeriodo(inicioSem, fimSem);
    const segTotal = lista.reduce((a, s) => a + (s?.duracaoSegundos ?? 0), 0);
    const metaSem = (concurso.horasDiarias ?? 4) * 3600 * 7;
    const pct = metaSem > 0 ? Math.min(100, Math.round((segTotal / metaSem) * 100)) : 0;
    const diasEst = diasEstudadosCount(lista);
    const diaDaSemana = new Date().getDay();
    const diasPassados = diaDaSemana === 0 ? 7 : diaDaSemana;
    const diasRest = 7 - diasPassados;
    const segRest = Math.max(0, metaSem - segTotal);
    const metaDiaria = diasRest > 0 ? segRest / diasRest : 0;
    const porDisc = segPorDisc(lista);

    let html = `
      <div class="card" style="margin-top:12px;">
        <div class="card-title">Semana atual (${DataUtil.formatarData(inicioSem)} - ${DataUtil.formatarData(fimSem)})</div>
        <div class="meta-resumo">
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${TempoUtil.formatarHhMm(segTotal)}</div><div class="meta-resumo-label">Estudado</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${TempoUtil.formatarHhMm(metaSem)}</div><div class="meta-resumo-label">Meta</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${pct}%</div><div class="meta-resumo-label">Concluído</div></div>
        </div>
        <div class="progress-bar" style="height:10px;margin:10px 0;"><div class="progress-bar-fill" style="width:${pct}%;background:${pct >= 100 ? '#4ade80' : pct >= 60 ? '#fbbf24' : '#e94560'};"></div></div>
        <div class="meta-resumo">
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${diasEst}/${diasPassados}</div><div class="meta-resumo-label">Dias estudados</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${TempoUtil.formatarHhMm(metaDiaria)}</div><div class="meta-resumo-label">Meta diária sugerida</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${lista.length}</div><div class="meta-resumo-label">Sessões</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Por disciplina (semana)</div>`;
    for (const d of disciplinas) {
      const seg = porDisc[d.id] || 0;
      const metaDiscSem = (distMap[d.id]?.segundosSugeridos ?? 0) * 7;
      const pctD = metaDiscSem > 0 ? Math.min(100, Math.round((seg / metaDiscSem) * 100)) : 0;
      html += `<div class="acomp-disc-item">
        <div class="acomp-disc-header"><span class="color-dot" style="background-color:${escapeHtml(d.cor)}"></span><strong>${escapeHtml(d.nome)}</strong><span class="acomp-status-badge" style="background:${pctD >= 100 ? '#4ade80' : pctD >= 60 ? '#fbbf24' : '#e94560'};">${pctD}%</span></div>
        <div class="progress-bar" style="height:6px;margin:4px 0;"><div class="progress-bar-fill" style="width:${pctD}%;background-color:${escapeHtml(d.cor)};"></div></div>
        <div class="text-dim" style="font-size:12px;">${TempoUtil.formatarHhMm(seg)} / ${TempoUtil.formatarHhMm(metaDiscSem)}</div>
      </div>`;
    }
    html += '</div>';
    cont.innerHTML = html;
  }

  function renderMensal(cont) {
    const inicioMes = DataUtil.inicioMes(new Date());
    const fimMes = DataUtil.fimMes(new Date());
    const lista = sessoesPeriodo(inicioMes, fimMes);
    const segTotal = lista.reduce((a, s) => a + (s?.duracaoSegundos ?? 0), 0);
    const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const metaMes = (concurso.horasDiarias ?? 4) * 3600 * diasNoMes;
    const pct = metaMes > 0 ? Math.min(100, Math.round((segTotal / metaMes) * 100)) : 0;
    const diasEst = diasEstudadosCount(lista);
    const diaAtual = new Date().getDate();
    const porDisc = segPorDisc(lista);

    let html = `
      <div class="card" style="margin-top:12px;">
        <div class="card-title">Mês atual (${DataUtil.formatarData(inicioMes)} - ${DataUtil.formatarData(fimMes)})</div>
        <div class="meta-resumo">
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${TempoUtil.formatarHhMm(segTotal)}</div><div class="meta-resumo-label">Estudado</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${TempoUtil.formatarHhMm(metaMes)}</div><div class="meta-resumo-label">Meta mensal</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${pct}%</div><div class="meta-resumo-label">Concluído</div></div>
        </div>
        <div class="progress-bar" style="height:10px;margin:10px 0;"><div class="progress-bar-fill" style="width:${pct}%;background:${pct >= 100 ? '#4ade80' : pct >= 60 ? '#fbbf24' : '#e94560'};"></div></div>
        <div class="meta-resumo">
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${diasEst}/${diaAtual}</div><div class="meta-resumo-label">Dias estudados</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${lista.length}</div><div class="meta-resumo-label">Sessões</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${lista.length > 0 ? TempoUtil.formatarHhMm(Math.round(segTotal / diasEst)) : '0min'}</div><div class="meta-resumo-label">Média/dia estudado</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Por disciplina (mês)</div>`;
    for (const d of disciplinas) {
      const seg = porDisc[d.id] || 0;
      const metaDiscMes = (distMap[d.id]?.segundosSugeridos ?? 0) * diasNoMes;
      const pctD = metaDiscMes > 0 ? Math.min(100, Math.round((seg / metaDiscMes) * 100)) : 0;
      html += `<div class="acomp-disc-item">
        <div class="acomp-disc-header"><span class="color-dot" style="background-color:${escapeHtml(d.cor)}"></span><strong>${escapeHtml(d.nome)}</strong><span class="acomp-status-badge" style="background:${pctD >= 100 ? '#4ade80' : pctD >= 60 ? '#fbbf24' : '#e94560'};">${pctD}%</span></div>
        <div class="progress-bar" style="height:6px;margin:4px 0;"><div class="progress-bar-fill" style="width:${pctD}%;background-color:${escapeHtml(d.cor)};"></div></div>
        <div class="text-dim" style="font-size:12px;">${TempoUtil.formatarHhMm(seg)} / ${TempoUtil.formatarHhMm(metaDiscMes)}</div>
      </div>`;
    }
    html += '</div>';
    cont.innerHTML = html;
  }

  function renderTotal(cont) {
    const segTotal = (sessoes ?? []).reduce((a, s) => a + (s?.duracaoSegundos ?? 0), 0);
    const diasEst = diasEstudadosCount(sessoes ?? []);
    const porDisc = segPorDisc(sessoes ?? []);
    const mediaSegDia = diasEst > 0 ? Math.round(segTotal / diasEst) : 0;

    let html = `
      <div class="card" style="margin-top:12px;">
        <div class="card-title">Totais acumulados</div>
        <div class="meta-resumo">
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${TempoUtil.formatarHhMm(segTotal)}</div><div class="meta-resumo-label">Total estudado</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${(sessoes ?? []).length}</div><div class="meta-resumo-label">Sessões</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${diasEst}</div><div class="meta-resumo-label">Dias estudados</div></div>
        </div>
        <div class="meta-resumo" style="margin-top:8px;">
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${TempoUtil.formatarHhMm(mediaSegDia)}</div><div class="meta-resumo-label">Média por dia</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Total por disciplina</div>`;
    for (const d of disciplinas) {
      const seg = porDisc[d.id] || 0;
      const pctD = segTotal > 0 ? Math.round((seg / segTotal) * 100) : 0;
      html += `<div class="acomp-disc-item">
        <div class="acomp-disc-header"><span class="color-dot" style="background-color:${escapeHtml(d.cor)}"></span><strong>${escapeHtml(d.nome)}</strong><span class="text-dim">${pctD}%</span></div>
        <div class="progress-bar" style="height:6px;margin:4px 0;"><div class="progress-bar-fill" style="width:${pctD}%;background-color:${escapeHtml(d.cor)};"></div></div>
        <div class="text-dim" style="font-size:12px;">${TempoUtil.formatarHhMm(seg)}</div>
      </div>`;
    }
    html += '</div>';
    cont.innerHTML = html;
  }

  function renderDisciplinas(cont) {
    const inicioSem = DataUtil.inicioSemana(new Date());
    const fimSem = DataUtil.fimSemana(new Date());
    const sessSem = sessoesPeriodo(inicioSem, fimSem);
    const porDiscSem = segPorDisc(sessSem);
    const porDiscTotal = segPorDisc(sessoes ?? []);

    let html = '<div style="margin-top:12px;">';
    for (const d of disciplinas) {
      const dist = distMap[d.id];
      const metaDiaria = dist?.segundosSugeridos ?? 0;
      const metaSem = metaDiaria * 7;
      const segSem = porDiscSem[d.id] || 0;
      const segTotal = porDiscTotal[d.id] || 0;
      const pctSem = metaSem > 0 ? Math.min(100, Math.round((segSem / metaSem) * 100)) : 0;
      const grauLabel = DistribuicaoEstudo.LABELS_CONHECIMENTO[d.grauConhecimento] ?? '';

      let statusCor, statusLabel;
      if (pctSem >= 100) { statusCor = '#4ade80'; statusLabel = 'No alvo'; }
      else if (pctSem >= 60) { statusCor = '#fbbf24'; statusLabel = 'Atenção'; }
      else { statusCor = '#e94560'; statusLabel = 'Atrasada'; }

      html += `<div class="card" style="border-left:4px solid ${escapeHtml(d.cor)};margin-bottom:10px;">
        <div class="acomp-disc-header" style="margin-bottom:6px;">
          <span class="color-dot" style="background-color:${escapeHtml(d.cor)}"></span>
          <strong>${escapeHtml(d.nome)}</strong>
          <span class="acomp-status-badge" style="background:${statusCor};">${statusLabel}</span>
        </div>
        <div class="text-dim" style="font-size:12px;margin-bottom:6px;">${d.numQuestoes ?? 0}q × peso ${d.pesoQuestao ?? 1} · ${grauLabel}${d.eliminatoria ? ' · Eliminatória' : ''}</div>
        <div class="meta-resumo">
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${TempoUtil.formatarHhMm(segSem)}</div><div class="meta-resumo-label">Semana</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${TempoUtil.formatarHhMm(metaSem)}</div><div class="meta-resumo-label">Meta sem.</div></div>
          <div class="meta-resumo-item"><div class="meta-resumo-valor">${pctSem}%</div><div class="meta-resumo-label">Progresso</div></div>
        </div>
        <div class="progress-bar" style="height:6px;margin:6px 0;"><div class="progress-bar-fill" style="width:${pctSem}%;background-color:${escapeHtml(d.cor)};"></div></div>
        <div class="text-dim" style="font-size:12px;">Total acumulado: ${TempoUtil.formatarHhMm(segTotal)} · Meta diária: ~${TempoUtil.formatarHhMm(metaDiaria)}</div>
      </div>`;
    }
    html += '</div>';
    cont.innerHTML = html;
  }

  renderTab('semanal');
  document.querySelectorAll('.tabs .tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      renderTab(t.dataset.tab);
    });
  });
};

/* ===== CONFIGURAÇÕES ===== */
Paginas.configuracoes = async function(main) {
  const concurso = await Concursos.ativo();
  const disciplinas = concurso ? await Disciplinas.listar(concurso.id) : [];

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Configurações</h1>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Concurso</div>
      ${concurso ? `
      <div class="form-group"><label>Nome</label><input type="text" id="cfg-nome" maxlength="100" value="${escapeHtml(concurso.nome)}" /></div>
      <div class="form-group"><label>Data da prova</label><input type="date" id="cfg-data" value="${concurso.dataProva ? new Date(concurso.dataProva).toISOString().split('T')[0] : ''}" /></div>
      <div class="form-group"><label>Horas diárias disponíveis</label><input type="number" id="cfg-horas" min="1" max="18" value="${concurso.horasDiarias ?? 4}" /></div>
      <div class="form-group"><label>Total de questões da prova</label><input type="number" id="cfg-total-questoes" min="1" max="5000" value="${concurso.totalQuestoes ?? ''}" placeholder="Ex: 120" /></div>
      <button class="btn btn-primary btn-sm" id="btn-salvar-concurso">Salvar concurso</button>
      ` : `<button class="btn btn-primary" id="btn-criar-concurso">Criar concurso</button>`}
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Disciplinas</div>
      <div id="lista-disciplinas"></div>
      ${concurso ? '<button class="btn btn-sm btn-primary mt-12" id="btn-add-disciplina">+ Adicionar disciplina</button>' : ''}
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Backup</div>
      <div class="btn-row">
        <button class="btn btn-sm btn-primary" id="btn-exportar">Exportar</button>
        <button class="btn btn-sm btn-secondary" id="btn-importar-trigger">Importar</button>
        <button class="btn btn-sm btn-secondary" id="btn-compartilhar">Compartilhar</button>
      </div>
      <div id="backup-progresso" class="text-dim" style="margin-top:8px;display:none;">Progresso: <span id="backup-progresso-val">0%</span></div>
      <input type="file" id="input-importar" accept=".json" style="display:none;" />
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Integridade</div>
      <button class="btn btn-sm btn-secondary" id="btn-verificar-integridade">Verificar integridade do banco</button>
      <div id="integridade-resultado" class="text-dim" style="margin-top:8px;"></div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title" style="color:var(--danger);">Zona de perigo</div>
      <button class="btn btn-sm btn-danger" id="btn-limpar-dados">Limpar todos os dados</button>
    </div>`;

  function setBackupUIBusy(busy) {
    ['btn-exportar', 'btn-importar-trigger', 'btn-compartilhar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !!busy;
    });
    const p = document.getElementById('backup-progresso');
    if (p) p.style.display = busy ? 'block' : 'none';
  }

  function atualizarProgressoBackup(pct) {
    const v = document.getElementById('backup-progresso-val');
    if (v) v.textContent = `${pct}%`;
  }

  function renderDisciplinas() {
    const cont = document.getElementById('lista-disciplinas');
    if (!cont) return;
    if (disciplinas.length === 0) { cont.innerHTML = '<div class="text-dim">Nenhuma disciplina cadastrada.</div>'; return; }
    cont.innerHTML = disciplinas.map(d => {
      const grauLabel = DistribuicaoEstudo.LABELS_CONHECIMENTO[d.grauConhecimento] ?? 'Médio';
      const pontos = (d.numQuestoes ?? 0) * (d.pesoQuestao ?? 1);
      return `<div class="discipline-item" data-id="${d.id}">
        <span class="color-dot color-dot-lg" style="background-color:${escapeHtml(d.cor)}"></span>
        <div class="item-content">
          <div class="item-title">${escapeHtml(d.nome)}</div>
          <div class="item-subtitle">${d.numQuestoes ?? 0}q × peso ${d.pesoQuestao ?? 1} = ${pontos}pts · ${grauLabel}${d.eliminatoria ? ` · Elim. ${d.percentualMinimo ?? 50}%` : ''}</div>
        </div>
        <button class="btn-icon btn-edit-disc" data-id="${d.id}" title="Editar">✏️</button>
      </div>`;
    }).join('');

    cont.querySelectorAll('.btn-edit-disc').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const disc = disciplinas.find(d => d.id === id);
        if (disc) abrirModalEditarDisciplina(disc, concurso);
      });
    });
  }
  renderDisciplinas();

  document.getElementById('btn-salvar-concurso')?.addEventListener('click', async () => {
    try {
      await Concursos.atualizar(concurso.id, {
        nome: InputSanitizer.texto(document.getElementById('cfg-nome')?.value, { max: 100, obrigatorio: true }),
        dataProva: document.getElementById('cfg-data')?.value ? new Date(document.getElementById('cfg-data').value + 'T04:00:00Z').toISOString() : null,
        horasDiarias: InputSanitizer.inteiro(document.getElementById('cfg-horas')?.value, { min: 1, max: 18, fallback: 4 }),
        totalQuestoes: document.getElementById('cfg-total-questoes')?.value ? InputSanitizer.inteiro(document.getElementById('cfg-total-questoes')?.value, { min: 1, max: 5000, fallback: null }) : null
      });
      Toast.sucesso('Concurso salvo!');
    } catch (e) { Toast.erro(e?.message ?? 'Erro ao salvar.'); }
  });

  document.getElementById('btn-criar-concurso')?.addEventListener('click', () => abrirModalSetupConcurso());
  document.getElementById('btn-add-disciplina')?.addEventListener('click', () => { if (concurso) abrirModalEditarDisciplina(null, concurso); });

  document.getElementById('btn-exportar')?.addEventListener('click', async () => {
    try { await Backup.exportar(); Toast.sucesso('Backup exportado!'); } catch (e) { Toast.erro(e?.message ?? 'Erro'); }
  });

  document.getElementById('btn-importar-trigger')?.addEventListener('click', () => document.getElementById('input-importar')?.click());
  document.getElementById('input-importar')?.addEventListener('change', async (e) => {
    setBackupUIBusy(true);
    atualizarProgressoBackup(0);
    try {
      await Backup.importarDeArquivo(e.target.files?.[0], pct => atualizarProgressoBackup(pct));
      Toast.sucesso('Importação concluída com consistência verificada.');
      Router.ir('dashboard');
    } catch (err) {
      Toast.erro(err?.message ?? 'Falha na importação transacional.');
      const snapshot = Backup.obterSnapshotPreImportacao?.();
      if (snapshot) {
        Modal.abrir(`
          <div class="modal-title">Falha na importação</div>
          <div class="modal-text">Deseja restaurar automaticamente o snapshot salvo antes da importação?</div>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="btn-snap-nao">Agora não</button>
            <button class="btn btn-primary" id="btn-snap-sim">Restaurar snapshot</button>
          </div>
        `);
        document.getElementById('btn-snap-nao')?.addEventListener('click', () => Modal.fechar());
        document.getElementById('btn-snap-sim')?.addEventListener('click', async () => {
          try {
            await Backup.restaurarSnapshotPreImportacao();
            Toast.sucesso('Snapshot restaurado com sucesso.');
            Modal.fechar();
            Router.ir('dashboard');
          } catch (e2) {
            Toast.erro(e2?.message ?? 'Falha ao restaurar snapshot.');
          }
        });
      }
    } finally {
      setBackupUIBusy(false);
      const input = document.getElementById('input-importar');
      if (input) input.value = '';
    }
  });

  document.getElementById('btn-compartilhar')?.addEventListener('click', async () => {
    try { const r = await Backup.compartilhar(); if (r?.ok && !r?.cancelado) Toast.sucesso('Backup compartilhado!'); }
    catch { Toast.erro('Erro ao compartilhar'); }
  });

  document.getElementById('btn-verificar-integridade')?.addEventListener('click', async () => {
    try {
      const info = await verificarIntegridadeBanco();
      const out = document.getElementById('integridade-resultado');
      const linhas = info.resumo.map(x => `${x.tabela}: ${x.total}`).join(' · ');
      if (out) out.innerHTML = `${escapeHtml(linhas)}${info.conflitos ? ' · ⚠️ Múltiplos concursos detectados' : ' · ✅ OK'}`;
      if (info.conflitos) {
        Modal.abrir(`
          <div class="modal-title">Resolver concursos duplicados</div>
          <div class="modal-text">Foram encontrados múltiplos concursos ativos. O sistema manterá apenas o mais recente.</div>
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
            <button class="btn btn-primary" id="btn-resolver-conflito">Resolver agora</button>
          </div>
        `);
        document.getElementById('btn-resolver-conflito')?.addEventListener('click', async () => {
          const ativo = await Concursos.ativo();
          if (ativo) await Concursos.criar(ativo);
          Modal.fechar();
          Toast.sucesso('Conflito de concurso resolvido.');
          Router.ir('configuracoes');
        });
      }
    } catch (e) {
      Toast.erro(e?.message ?? 'Falha na verificação de integridade.');
    }
  });

  document.getElementById('btn-limpar-dados')?.addEventListener('click', () => {
    Modal.abrir(`
      <div class="modal-title">⚠️ Limpar todos os dados</div>
      <div class="modal-text">Essa ação é irreversível. Digite <strong>APAGAR</strong> para confirmar:</div>
      <div class="form-group"><input type="text" id="input-confirmar-limpar" maxlength="20" placeholder="APAGAR" /></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn btn-danger" id="btn-confirmar-limpar">Limpar</button>
      </div>
    `);
    document.getElementById('btn-confirmar-limpar')?.addEventListener('click', async () => {
      if (document.getElementById('input-confirmar-limpar')?.value?.trim() !== 'APAGAR') { Toast.aviso('Digite APAGAR para confirmar.'); return; }
      try {
        await db.concursos.clear(); await db.disciplinas.clear(); await db.topicos.clear();
        await db.sessoes.clear(); await db.revisoes.clear(); await db.cicloConfig.clear(); await db.questoes.clear();
        Modal.fechar(); Toast.sucesso('Dados limpos!'); Router.ir('dashboard');
      } catch { Toast.erro('Erro ao limpar dados.'); }
    });
  });
};

/* ============ Modal: Setup Concurso ============ */
async function abrirModalSetupConcurso() {
  Modal.abrir(`
    <div class="modal-title">🎯 Configurar Concurso</div>
    <div class="form-group"><label>Nome do concurso</label><input type="text" id="setup-nome" maxlength="100" placeholder="Ex: TRF3 - Analista" /></div>
    <div class="form-group"><label>Data da prova</label><input type="date" id="setup-data" /></div>
    <div class="form-group"><label>Horas diárias disponíveis</label><input type="number" id="setup-horas" min="1" max="18" value="6" /></div>
    <div class="form-group"><label>Total de questões da prova</label><input type="number" id="setup-total-q" min="1" max="5000" placeholder="Ex: 120" /></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn btn-primary" id="setup-salvar">Criar</button>
    </div>
  `, { fecharNoFundo: false });

  document.getElementById('setup-salvar')?.addEventListener('click', async () => {
    try {
      const nome = InputSanitizer.texto(document.getElementById('setup-nome')?.value, { max: 100, obrigatorio: true });
      const dataVal = document.getElementById('setup-data')?.value;
      const horas = InputSanitizer.inteiro(document.getElementById('setup-horas')?.value, { min: 1, max: 18, fallback: 6 });
      const totalQ = document.getElementById('setup-total-q')?.value ? InputSanitizer.inteiro(document.getElementById('setup-total-q')?.value, { min: 1, max: 5000, fallback: null }) : null;
      await Concursos.criar({ nome, dataProva: dataVal ? new Date(dataVal + 'T04:00:00Z').toISOString() : null, horasDiarias: horas, totalQuestoes: totalQ });
      Modal.fechar();
      Toast.sucesso('Concurso criado!');
      const nav = document.getElementById('bottom-nav');
      if (nav) nav.style.display = 'flex';
      Router.ir('configuracoes');
    } catch (e) {
      Toast.erro(e?.message ?? 'Erro ao criar concurso.');
    }
  });
}
window.abrirModalSetupConcurso = abrirModalSetupConcurso;

/* ============ Modal: Editar/Criar Disciplina ============ */
async function abrirModalEditarDisciplina(disc, concurso) {
  const isNovo = !disc;
  const corPadrao = CORES_PADRAO[Math.floor(Math.random() * CORES_PADRAO.length)];

  Modal.abrir(`
    <div class="modal-title">${isNovo ? '+ Nova Disciplina' : 'Editar Disciplina'}</div>
    <div class="form-group"><label>Nome</label><input type="text" id="disc-nome" maxlength="100" value="${escapeHtml(disc?.nome ?? '')}" placeholder="Ex: Direito Constitucional" /></div>
    <div class="form-group"><label>Nº de questões na prova</label><input type="number" id="disc-num-questoes" min="1" max="1000" value="${disc?.numQuestoes ?? 10}" /></div>
    <div class="form-group"><label>Peso por questão</label><input type="number" id="disc-peso-questao" min="1" max="50" value="${disc?.pesoQuestao ?? 1}" /></div>
    <div class="form-group"><label>Grau de conhecimento</label>
      <select id="disc-grau">${[1,2,3,4,5].map(g => `<option value="${g}" ${(disc?.grauConhecimento ?? 3) === g ? 'selected' : ''}>${g} - ${DistribuicaoEstudo.LABELS_CONHECIMENTO[g]}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Cor</label><input type="color" id="disc-cor" value="${disc?.cor ?? corPadrao}" /></div>
    <div class="form-group">
      <div class="row" style="border:none;padding:0;"><label style="margin:0;">Eliminatória?</label><div class="toggle-switch ${disc?.eliminatoria ? 'active' : ''}" id="disc-elim-toggle"></div></div>
    </div>
    <div class="form-group" id="disc-elim-percentual-wrap" style="display:${disc?.eliminatoria ? 'block' : 'none'};">
      <label>Percentual mínimo de acerto (%)</label>
      <input type="number" id="disc-percentual-min" min="1" max="100" value="${disc?.percentualMinimo ?? 50}" />
    </div>
    <div class="modal-actions">
      ${!isNovo ? '<button class="btn btn-danger btn-sm" id="disc-remover">Remover</button>' : ''}
      <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
      <button class="btn btn-primary" id="disc-salvar">Salvar</button>
    </div>
  `);

  let eliminatoria = disc?.eliminatoria ?? false;
  document.getElementById('disc-elim-toggle')?.addEventListener('click', () => {
    eliminatoria = !eliminatoria;
    document.getElementById('disc-elim-toggle')?.classList.toggle('active', eliminatoria);
    document.getElementById('disc-elim-percentual-wrap').style.display = eliminatoria ? 'block' : 'none';
  });

  document.getElementById('disc-salvar')?.addEventListener('click', async () => {
    try {
      const dados = {
        concursoId: concurso.id,
        nome: InputSanitizer.texto(document.getElementById('disc-nome')?.value, { max: 100, obrigatorio: true }),
        numQuestoes: InputSanitizer.inteiro(document.getElementById('disc-num-questoes')?.value, { min: 1, max: 1000, fallback: 10 }),
        pesoQuestao: InputSanitizer.inteiro(document.getElementById('disc-peso-questao')?.value, { min: 1, max: 50, fallback: 1 }),
        grauConhecimento: InputSanitizer.inteiro(document.getElementById('disc-grau')?.value, { min: 1, max: 5, fallback: 3 }),
        cor: InputSanitizer.corHex(document.getElementById('disc-cor')?.value, { fallback: corPadrao }),
        eliminatoria,
        percentualMinimo: eliminatoria ? InputSanitizer.percentual(document.getElementById('disc-percentual-min')?.value, { fallback: 50 }) : null,
        ordemCiclo: disc?.ordemCiclo ?? 0
      };
      if (isNovo) {
        const discs = await Disciplinas.listar(concurso.id);
        dados.ordemCiclo = discs.length;
        await Disciplinas.criar(dados);
        Toast.sucesso('Disciplina adicionada!');
      } else {
        await Disciplinas.atualizar(disc.id, dados);
        Toast.sucesso('Disciplina atualizada!');
      }
      Modal.fechar();
      Router.ir('configuracoes');
    } catch (e) {
      Toast.erro(e?.message ?? 'Erro ao salvar disciplina.');
    }
  });

  document.getElementById('disc-remover')?.addEventListener('click', async () => {
    if (!disc) return;
    Modal.abrir(`
      <div class="modal-title">Remover disciplina?</div>
      <div class="modal-text">Isso removerá "${escapeHtml(disc.nome)}" e todas as sessões, revisões e questões associadas.</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.fechar()">Cancelar</button>
        <button class="btn btn-danger" id="disc-confirmar-remover">Remover</button>
      </div>
    `);
    document.getElementById('disc-confirmar-remover')?.addEventListener('click', async () => {
      try {
        await Disciplinas.remover(disc.id);
        const sessoes = await db.sessoes.where({ disciplinaId: disc.id }).toArray();
        for (const s of sessoes) await db.sessoes.delete(s.id);
        const revisoes = await db.revisoes.where({ disciplinaId: disc.id }).toArray();
        for (const r of revisoes) await db.revisoes.delete(r.id);
        const questoes = await db.questoes.where({ disciplinaId: disc.id }).toArray();
        for (const q of questoes) await db.questoes.delete(q.id);
        Modal.fechar(); Toast.sucesso('Disciplina removida!'); Router.ir('configuracoes');
      } catch { Toast.erro('Erro ao remover.'); }
    });
  });
}
window.abrirModalEditarDisciplina = abrirModalEditarDisciplina;

/* ============ Modal: Finalizar Sessão ============ */
async function abrirModalFinalizar(dados) {
  const frase = FRASES_MOTIVACIONAIS[Math.floor(Math.random() * FRASES_MOTIVACIONAIS.length)];

  Modal.abrir(`
    <div class="modal-title">🎉 Sessão finalizada!</div>
    <div class="modal-text" style="font-style:italic;">"${escapeHtml(frase)}"</div>
    <div class="modal-text"><strong>${escapeHtml(dados.topico)}</strong><br/>${escapeHtml(dados.tipo)} · ${TempoUtil.formatarHhMm(dados.duracaoSegundos)}</div>
    <div class="form-group"><label>Como você avalia essa sessão?</label><div class="stars" id="stars-avaliacao">${[1,2,3,4,5].map(i => `<span class="star" data-val="${i}">☆</span>`).join('')}</div></div>
    <div class="form-group"><label>Anotações (opcional)</label><textarea id="finalizar-notas" maxlength="5000" rows="2" placeholder="Ex: Preciso revisar a parte de..."></textarea></div>
    <div class="modal-actions"><button class="btn btn-secondary" id="finalizar-descartar">Descartar</button><button class="btn btn-primary" id="finalizar-salvar">Salvar sessão</button></div>
  `, { fecharNoFundo: false });

  let avaliacao = 0;
  document.querySelectorAll('#stars-avaliacao .star').forEach(star => {
    star.addEventListener('click', () => {
      avaliacao = parseInt(star.dataset.val, 10);
      document.querySelectorAll('#stars-avaliacao .star').forEach((s, i) => {
        s.textContent = (i < avaliacao) ? '★' : '☆';
        s.classList.toggle('active', i < avaliacao);
      });
    });
  });

  document.getElementById('finalizar-descartar')?.addEventListener('click', async () => {
    const concurso = await Concursos.ativo();
    if (concurso?.id) limparRascunhoSessaoEstudo(concurso.id);
    Modal.fechar();
    Timer.resetar();
    atualizarTituloTimer();
  });

  document.getElementById('finalizar-salvar')?.addEventListener('click', async () => {
    try {
      const notas = InputSanitizer.texto(document.getElementById('finalizar-notas')?.value, { max: 5000 });
      const sessaoId = await Sessoes.criar({
        concursoId: dados.concursoId,
        disciplinaId: dados.disciplinaId,
        topico: InputSanitizer.texto(dados.topico, { max: 200, obrigatorio: true }),
        tipo: dados.tipo,
        data: dados.iniciadoEm ?? new Date().toISOString(),
        duracaoSegundos: dados.duracaoSegundos,
        avaliacao,
        notas
      });

      if (dados.tipo === 'Novo') {
        await Revisoes.criarParaSessao({ id: sessaoId, disciplinaId: dados.disciplinaId, topico: dados.topico, tipo: 'Novo', data: dados.iniciadoEm ?? new Date().toISOString() });
      }

      if (dados.tipo?.startsWith('Revisão')) {
        const rev = await Revisoes.encontrarRevisaoCorrespondente(dados.disciplinaId, dados.topico, dados.tipo);
        if (rev) await Revisoes.marcarFeita(rev.id);
      }

      const concurso = await Concursos.ativo();
      if (concurso) {
        await Ciclo.avancarPosicao(concurso.id);
        limparRascunhoSessaoEstudo(concurso.id);
      }

      Modal.fechar(); Timer.resetar(); atualizarTituloTimer();
      Toast.sucesso('Sessão registrada!');
      Router.ir('dashboard');
    } catch (e) {
      Toast.erro(e?.message ?? 'Erro ao salvar sessão.');
    }
  });
}
window.abrirModalFinalizar = abrirModalFinalizar;

/* ============ Inicialização ============ */
document.addEventListener('DOMContentLoaded', async () => {
  const nav = document.getElementById('bottom-nav');
  const concurso = await Concursos.ativo();
  if (nav) nav.style.display = concurso ? 'flex' : 'none';

  nav?.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      Router.ir(item.dataset.page);
    });
  });

  await registrarServiceWorkerConfiavel();
  Router.ir('dashboard');
});