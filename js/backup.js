/* ====== MentorConcursos - Sistema de Backup ====== */
const Backup = {
  CHAVE_ULTIMO: 'mentorconcursos_ultimo_backup',

  async exportarTudo() {
    try {
      const dados = {
        concursos: await db.concursos.toArray(),
        disciplinas: await db.disciplinas.toArray(),
        topicos: await db.topicos.toArray(),
        sessoes: await db.sessoes.toArray(),
        revisoes: await db.revisoes.toArray(),
        cicloConfig: await db.cicloConfig.toArray()
      };
      const json = {
        versao: '1.0',
        dataExportacao: new Date().toISOString(),
        dados
      };
      return json;
    } catch (e) {
      console.error(e);
      throw new Error('Erro ao exportar dados.');
    }
  },

  nomeArquivo() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `mentorconcursos_backup_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
  },

  async exportar() {
    const json = await this.exportarTudo();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.nomeArquivo();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.registrarBackup();
    return true;
  },

  async compartilhar() {
    const json = await this.exportarTudo();
    const conteudo = JSON.stringify(json, null, 2);
    const blob = new Blob([conteudo], { type: 'application/json' });
    const arquivo = new File([blob], this.nomeArquivo(), { type: 'application/json' });

    try {
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        await navigator.share({
          files: [arquivo],
          title: 'Backup MentorConcursos',
          text: 'Meu backup do MentorConcursos'
        });
        this.registrarBackup();
        return { ok: true, metodo: 'share' };
      }
      if (navigator.share) {
        // Fallback: compartilhar texto/url se arquivos não suportados
        const url = URL.createObjectURL(blob);
        await navigator.share({
          title: 'Backup MentorConcursos',
          text: 'Backup do MentorConcursos',
          url
        });
        URL.revokeObjectURL(url);
        this.registrarBackup();
        return { ok: true, metodo: 'share-url' };
      }
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, cancelado: true };
      console.warn(e);
    }
    // Fallback final - download direto
    await this.exportar();
    return { ok: true, metodo: 'download' };
  },

  async importarDeArquivo(file) {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    const texto = await file.text();
    let json;
    try { json = JSON.parse(texto); } catch {
      throw new Error('Arquivo inválido. Selecione um arquivo de backup válido do MentorConcursos.');
    }
    if (!json?.versao || !json?.dados) {
      throw new Error('Arquivo inválido. Selecione um arquivo de backup válido do MentorConcursos.');
    }
    return this.importar(json);
  },

  async importar(json, onProgress) {
    const dados = json?.dados ?? {};
    const tabelas = ['concursos', 'disciplinas', 'topicos', 'sessoes', 'revisoes', 'cicloConfig'];
    const total = tabelas.length;
    let feitas = 0;

    // Limpar tudo primeiro
    for (const t of tabelas) {
      try { await db[t].clear(); } catch (e) { console.warn('clear', t, e); }
    }

    for (const t of tabelas) {
      const arr = dados?.[t] ?? [];
      if (Array.isArray(arr) && arr.length > 0) {
        try {
          await db[t].bulkAdd(arr);
        } catch (e) {
          console.warn('bulkAdd', t, e);
        }
      }
      feitas++;
      onProgress?.(Math.round((feitas / total) * 100));
    }
    return true;
  },

  registrarBackup() {
    try { localStorage.setItem(this.CHAVE_ULTIMO, new Date().toISOString()); } catch (e) {}
  },

  ultimoBackup() {
    try { return localStorage.getItem(this.CHAVE_ULTIMO) ?? null; } catch { return null; }
  },

  diasDesdeUltimo() {
    const u = this.ultimoBackup();
    if (!u) return null;
    const dias = Math.floor((Date.now() - new Date(u).getTime()) / 86400000);
    return dias;
  },

  precisaLembrar() {
    const dias = this.diasDesdeUltimo();
    if (dias === null) return true;
    return dias >= 7;
  }
};

window.Backup = Backup;
