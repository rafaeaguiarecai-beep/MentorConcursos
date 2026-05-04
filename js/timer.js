/* ====== MentorConcursos - Timer com Web Audio API ====== */
const Timer = {
  duracaoInicial: 45 * 60, // segundos
  restante: 45 * 60,
  extra: 0,
  intervalo: null,
  rodando: false,
  pausado: false,
  iniciadoEm: null,
  totalDecorrido: 0, // segundos
  alarmoTocado: false,
  audioCtx: null,
  callbacks: {},

  init(duracaoMin = 45) {
    this.duracaoInicial = (duracaoMin ?? 45) * 60;
    this.restante = this.duracaoInicial;
    this.extra = 0;
    this.rodando = false;
    this.pausado = false;
    this.totalDecorrido = 0;
    this.alarmoTocado = false;
    this.iniciadoEm = null;
    this.parar();
  },

  setDuracao(min) {
    if (this.rodando || this.pausado) return false;
    const novaDur = Math.max(1, Math.min(600, parseInt(min) || 45));
    this.duracaoInicial = novaDur * 60;
    this.restante = this.duracaoInicial;
    this.notificar('tick');
    return true;
  },

  ajustar(deltaMin) {
    if (this.rodando || this.pausado) return false;
    const minAtual = this.duracaoInicial / 60;
    const novo = Math.max(1, minAtual + deltaMin);
    return this.setDuracao(novo);
  },

  iniciar() {
    if (this.rodando) return;
    this.rodando = true;
    this.pausado = false;
    if (!this.iniciadoEm) this.iniciadoEm = new Date().toISOString();
    this.intervalo = setInterval(() => this.tick(), 1000);
    this.notificar('iniciar');
  },

  pausar() {
    if (!this.rodando) return;
    this.rodando = false;
    this.pausado = true;
    clearInterval(this.intervalo);
    this.intervalo = null;
    this.notificar('pausar');
  },

  retomar() {
    if (this.rodando) return;
    this.rodando = true;
    this.pausado = false;
    this.intervalo = setInterval(() => this.tick(), 1000);
    this.notificar('retomar');
  },

  parar() {
    this.rodando = false;
    this.pausado = false;
    if (this.intervalo) {
      clearInterval(this.intervalo);
      this.intervalo = null;
    }
  },

  resetar() {
    this.parar();
    this.restante = this.duracaoInicial;
    this.extra = 0;
    this.totalDecorrido = 0;
    this.alarmoTocado = false;
    this.iniciadoEm = null;
    this.notificar('reset');
  },

  tick() {
    this.totalDecorrido++;
    if (this.restante > 0) {
      this.restante--;
      if (this.restante === 0 && !this.alarmoTocado) {
        this.alarmoTocado = true;
        this.dispararAlarme();
      }
    } else {
      this.extra++;
    }
    this.notificar('tick');
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
    return {
      rodando: this.rodando,
      pausado: this.pausado,
      restante: this.restante,
      extra: this.extra,
      totalDecorrido: this.totalDecorrido,
      duracaoInicial: this.duracaoInicial,
      iniciadoEm: this.iniciadoEm
    };
  },

  dispararAlarme() {
    // Web Audio API - 800Hz, 3 beeps de 1.5s com 0.3s de intervalo
    try {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new Ctx();
      }
      const ctx = this.audioCtx;
      // resume contexto se suspenso (mobile)
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
      tocarBeep(1.8); // 1.5 + 0.3
      tocarBeep(3.6);
    } catch (e) {
      console.warn('Audio alarme:', e);
    }

    // Vibração
    try {
      if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }
    } catch (e) { console.warn(e); }

    // Notificação
    try {
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('MentorConcursos', {
            body: 'Tempo concluído! Bom trabalho! 🎉',
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png'
          });
        }
      }
    } catch (e) { console.warn(e); }
  }
};

window.Timer = Timer;
