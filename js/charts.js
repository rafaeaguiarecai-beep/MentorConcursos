/* ====== MentorConcursos - Gráficos (Chart.js) ====== */
const Graficos = {
  cores: ['#e94560', '#60B5FF', '#FF9149', '#FF9898', '#FF90BB', '#80D8C3', '#A19AD3', '#72BF78', '#fbbf24', '#4ade80'],
  instances: {},

  destruirGrafico(id) {
    if (this.instances[id]) {
      try { this.instances[id].destroy(); } catch (e) {}
      delete this.instances[id];
    }
  },

  configBase() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#a8a8b8', font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#16213e',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#0f3460',
          borderWidth: 1
        }
      }
    };
  },

  async barrasHorasPorDisciplina(canvasId, concursoId) {
    this.destruirGrafico(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const sessoes = await Sessoes.listar(concursoId);
    const disciplinas = await Disciplinas.listar(concursoId);
    const map = {};
    for (const s of sessoes ?? []) {
      const did = s?.disciplinaId;
      if (did === undefined || did === null) continue;
      map[did] = (map[did] ?? 0) + (s?.duracaoSegundos ?? 0);
    }
    const labels = (disciplinas ?? []).map(d => d?.nome ?? '-');
    const dados = (disciplinas ?? []).map(d => +(((map[d?.id] ?? 0) / 3600).toFixed(2)));
    const cores = (disciplinas ?? []).map(d => d?.cor ?? '#e94560');

    if (labels.length === 0) {
      ctx.parentElement.innerHTML = '<div class="empty-state"><div class="empty-state-emoji">📊</div><div class="empty-state-text">Sem dados ainda. Comece a estudar!</div></div>';
      return;
    }

    this.instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Horas estudadas',
          data: dados,
          backgroundColor: cores,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        ...this.configBase(),
        indexAxis: 'y',
        plugins: { ...this.configBase().plugins, legend: { display: false } },
        scales: {
          x: {
            ticks: { color: '#a8a8b8', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' },
            title: { display: true, text: 'Horas', color: '#a8a8b8', font: { size: 11 } }
          },
          y: {
            ticks: { color: '#a8a8b8', font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });
  },

  async linhaSemanasHistorico(canvasId, concursoId) {
    this.destruirGrafico(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const sessoes = await Sessoes.listar(concursoId);
    const semanas = 8;
    const labels = [];
    const dados = [];
    const hoje = DataUtil.hoje();
    // Encontra início da semana atual (segunda-feira)
    const dia = hoje.getDay(); // 0=domingo
    const offsetSegunda = (dia === 0 ? -6 : 1 - dia);
    const inicioSemanaAtual = DataUtil.adicionarDias(hoje, offsetSegunda);

    for (let i = semanas - 1; i >= 0; i--) {
      const inicio = DataUtil.adicionarDias(inicioSemanaAtual, -7 * i);
      const fim = DataUtil.adicionarDias(inicio, 6);
      const fimDia = DataUtil.fimDia(fim);
      const totalSeg = (sessoes ?? []).reduce((acc, s) => {
        const d = new Date(s?.data ?? 0);
        if (d >= inicio && d <= fimDia) return acc + (s?.duracaoSegundos ?? 0);
        return acc;
      }, 0);
      const pad = n => String(n).padStart(2, '0');
      labels.push(`${pad(inicio.getDate())}/${pad(inicio.getMonth()+1)}`);
      dados.push(+(totalSeg / 3600).toFixed(2));
    }

    this.instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Horas por semana',
          data: dados,
          borderColor: '#e94560',
          backgroundColor: 'rgba(233,69,96,0.15)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#e94560',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        ...this.configBase(),
        plugins: { ...this.configBase().plugins, legend: { display: false } },
        scales: {
          x: {
            ticks: { color: '#a8a8b8', font: { size: 10 } },
            grid: { display: false }
          },
          y: {
            ticks: { color: '#a8a8b8', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' },
            beginAtZero: true,
            title: { display: true, text: 'Horas', color: '#a8a8b8', font: { size: 11 } }
          }
        }
      }
    });
  }
};

window.Graficos = Graficos;
