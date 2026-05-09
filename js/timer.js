/* ==== MentorConcursos - Timer resiliente (timestamp + persistência) ==== */
const Timer = {
  CHAVE_ESTADO: 'mentor_timer_state',
  duracaoInicial: 45 * 60,
  restante: 45 * 60,
  extra: 0,
  totalDecorrido: 0,
  rodando: false,
  pausado: false,
  intervalo: null,
  alarmoTocado: false,
  audioCtx: null,
  callbacks: {},

  iniciadoEm: null,
  iniciadoEmMs: null,
  pausadoEmMs: null,
  tempoPausadoAcumuladoMs: 0,
  ultimaPersistenciaMs: 0,

  _agoraMs() { return Date.now(); },

  _calcularDecorridoMs() {
    if (!this.iniciadoEmMs) return 0;
    const agora = this.rodando ? this._agoraMs() : (this.pausadoEmMs ?? this._agoraMs());
    return Math.max(0, agora - this.iniciadoEmMs - (this.tempoPausadoAcumuladoMs ?? 0));
  },

  _sincronizarEstadoDerivado() {
    const decorridoSeg = Math.floor(this._calcularDecorridoMs() / 1000);
    this.totalDecorrido = decorridoSeg;
    this.restante = Math.max(0, this.duracaoInicial - decorridoSeg);
    this.extra = Math.max(0, decorridoSeg - this.duracaoInicial);
  },

  _iniciarIntervaloPreciso() {
    this._encerrarIntervalo();
    this.intervalo = setInterval(() => this.tick(), 1000);
  },

  _encerrarIntervalo() {
    if (this.intervalo) {
      clearInterval(this.intervalo);
      this.intervalo = null;
    }
  },

  init(duracaoMin = 45) {
    this.duracaoInicial = Math.max(1, Math.min(600, parseInt(duracaoMin, 10) || 45)) * 60;
    this.restante = this.duracaoInicial;
    this.extra = 0;
    this.totalDecorrido = 0;
    this.rodando = false;
    this.pausado = false;
    this.alarmoTocado = false;
    this.iniciadoEm = null;
    this.iniciadoEmMs = null;
    this.pausadoEmMs = null;
    this.tempoPausadoAcumuladoMs = 0;
    this._encerrarIntervalo();
    this.salvarEstado();
  },

  setDuracao(min) {
    if (this.rodando || this.pausado) return false;
    const novaDur = Math.max(1, Math.min(600, parseInt(min, 10) || 45));
    this.duracaoInicial = novaDur * 60;
    this.restante = this.duracaoInicial;
    this.extra = 0;
    this.totalDecorrido = 0;
    this.alarmoTocado = false;
    this.salvarEstado();
    this.notificar('tick');
    return true;
  },

  ajustar(deltaMin) {
    if (this.rodando || this.pausado) return false;
    const minAtual = this.duracaoInicial / 60;
    return this.setDuracao(Math.max(1, minAtual + deltaMin));
  },

  iniciar() {
    if (this.rodando) return;
    const agora = this._agoraMs();
    if (!this.iniciadoEmMs) {
      this.iniciadoEmMs = agora;
      this.iniciadoEm = new Date(agora).toISOString();
    }
    this.rodando = true;
    this.pausado = false;
    this.pausadoEmMs = null;
    this._sincronizarEstadoDerivado();
    this._iniciarIntervaloPreciso();
    this.salvarEstado();
    this.notificar('iniciar');
  },

  pausar() {
    if (!this.rodando) return;
    this._sincronizarEstadoDerivado();
    this.rodando = false;
    this.pausado = true;
    this.pausadoEmMs = this._agoraMs();
    this._encerrarIntervalo();
    this.salvarEstado();
    this.notificar('pausar');
  },

  retomar() {
    if (this.rodando || !this.pausado) return;
    const agora = this._agoraMs();
    if (this.pausadoEmMs) this.tempoPausadoAcumuladoMs += Math.max(0, agora - this.pausadoEmMs);
    this.pausadoEmMs = null;
    this.rodando = true;
    this.pausado = false;
    this._sincronizarEstadoDerivado();
    this._iniciarIntervaloPreciso();
    this.salvarEstado();
    this.notificar('retomar');
  },

  parar() {
    this._sincronizarEstadoDerivado();
    this.rodando = false;
    this.pausado = false;
    this.pausadoEmMs = null;
    this._encerrarIntervalo();
    this.salvarEstado();
  },

  resetar() {
    this.rodando = false;
    this.pausado = false;
    this._encerrarIntervalo();
    this.restante = this.duracaoInicial;
    this.extra = 0;
    this.totalDecorrido = 0;
    this.alarmoTocado = false;
    this.iniciadoEm = null;
    this.iniciadoEmMs = null;
    this.pausadoEmMs = null;
    this.tempoPausadoAcumuladoMs = 0;
    this.limparEstadoPersistido();
    this.notificar('reset');
  },

  tick() {
    this._sincronizarEstadoDerivado();
    if (this.restante === 0 && !this.alarmoTocado) {
      this.alarmoTocado = true;
      this.dispararAlarme();
    }
    this.salvarEstadoThrottled();
    this.notificar('tick');
  },

  salvarEstado() {
    try {
      const estado = {
        duracaoInicial: this.duracaoInicial,
        restante: this.restante,
        extra: this.extra,
        totalDecorrido: this.totalDecorrido,
        rodando: this.rodando,
        pausado: this.pausado,
        iniciadoEm: this.iniciadoEm,
        iniciadoEmMs: this.iniciadoEmMs,
        pausadoEmMs: this.pausadoEmMs,
        tempoPausadoAcumuladoMs: this.tempoPausadoAcumuladoMs,
        alarmoTocado: this.alarmoTocado,
        atualizadoEmMs: this._agoraMs()
      };
      localStorage.setItem(this.CHAVE_ESTADO, JSON.stringify(estado));
      this.ultimaPersistenciaMs = this._agoraMs();
      return true;
    } catch (e) {
      console.warn('Timer.salvarEstado falhou:', e);
      return false;
    }
  },

  salvarEstadoThrottled(intervaloMs = 2000) {
    const agora = this._agoraMs();
    if ((agora - (this.ultimaPersistenciaMs ?? 0)) >= intervaloMs) this.salvarEstado();
  },

  restaurarEstado() {
    try {
      const bruto = localStorage.getItem(this.CHAVE_ESTADO);
      if (!bruto) return false;
      const estado = JSON.parse(bruto);
      if (!estado || !estado.duracaoInicial) return false;

      this.duracaoInicial = parseInt(estado.duracaoInicial, 10) || (45 * 60);
      this.iniciadoEm = estado.iniciadoEm ?? null;
      this.iniciadoEmMs = estado.iniciadoEmMs ?? null;
      this.pausadoEmMs = estado.pausadoEmMs ?? null;
      this.tempoPausadoAcumuladoMs = estado.tempoPausadoAcumuladoMs ?? 0;
      this.alarmoTocado = Boolean(estado.alarmoTocado);
      this.rodando = Boolean(estado.rodando);
      this.pausado = Boolean(estado.pausado);

      // Se estava rodando e página recarregou, mantém rodando com contagem correta
      if (this.rodando && this.pausado) {
        this.pausado = false;
        this.pausadoEmMs = null;
      }

      this._sincronizarEstadoDerivado();
      if (this.rodando) this._iniciarIntervaloPreciso();
      else this._encerrarIntervalo();

      this.notificar('tick');
      return true;
    } catch (e) {
      console.warn('Timer.restaurarEstado falhou:', e);
      return false;
    }
  },

  carregarEstado() {
    return this.restaurarEstado();
  },

  limparEstadoPersistido() {
    try { localStorage.removeItem(this.CHAVE_ESTADO); } catch {}
    this.ultimaPersistenciaMs = 0;
  },

  on(evento, callback) {
    if (!this.callbacks[evento]) this.callbacks[evento] = [];
    this.callbacks[evento].push(callback);
  },

  off(evento) {
    this.callbacks[evento] = [];
  },

  notificar(evento) {
    const lista = this.callbacks[evento] ?? [];
    for (const cb of lista) {
      try { cb?.(this); } catch (e) { console.warn(e); }
    }
  },

  estado() {
    this._sincronizarEstadoDerivado();
    return {
      rodando: this.rodando,
      pausado: this.pausado,
      restante: this.restante,
      extra: this.extra,
      totalDecorrido: this.totalDecorrido,
      duracaoInicial: this.duracaoInicial,
      iniciadoEm: this.iniciadoEm,
      iniciadoEmMs: this.iniciadoEmMs,
      pausadoEmMs: this.pausadoEmMs,
      tempoPausadoAcumuladoMs: this.tempoPausadoAcumuladoMs
    };
  },

  dispararAlarme() {
    try {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new Ctx();
      }
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') ctx.resume?.();

      const tocarBeep = (offsetSec) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime + offsetSec);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + offsetSec + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + offsetSec + 1.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offsetSec);
        osc.stop(ctx.currentTime + offsetSec + 1.5);
      };
      tocarBeep(0);
      tocarBeep(1.8);
      tocarBeep(3.6);
    } catch (e) {
      console.warn('Audio alarme:', e);
    }

    try { if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]); } catch (e) { console.warn(e); }

    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('MentorConcursos', {
          body: 'Tempo concluído! Bom trabalho! 🎉',
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png'
        });
      }
    } catch (e) { console.warn(e); }
  }
};

// Reconciliar tempo ao voltar do background
try {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (Timer.rodando || Timer.pausado) {
        Timer.tick();
      }
    } else {
      Timer.salvarEstado();
    }
  });
} catch (e) {
  console.warn('visibilitychange indisponível', e);
}

window.Timer = Timer;
