/* ==== MentorConcursos - Sistema de Backup ==== */
const Backup = {
  CHAVE_ULTIMO: 'mentorconcursos_ultimo_backup',
  CHAVE_SNAPSHOT_PRE_IMPORT: 'mentor_pre_import_snapshot',
  LIMITE_ARQUIVO_MB: 20,

  _listarTabelasSuportadas() {
    return Array.isArray(window.BACKUP_TABLES) ? window.BACKUP_TABLES : ['concursos', 'disciplinas', 'topicos', 'sessoes', 'revisoes', 'cicloConfig', 'questoes'];
  },

  _hashConteudo(payload) {
    const str = JSON.stringify(payload ?? {});
    let hash = 5381;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
    return (hash >>> 0).toString(16);
  },

  _compararHash(payload) {
    const hashEsperado = payload?.metadados?.hash;
    if (!hashEsperado) return true; // compatibilidade com backup legado
    const copia = structuredClone(payload);
    if (copia?.metadados) delete copia.metadados.hash;
    const hashAtual = this._hashConteudo(copia);
    return hashAtual === hashEsperado;
  },

  _normalizarPayload(payload) {
    const tabelas = this._listarTabelasSuportadas();
    const base = payload ?? {};
    const dadosOriginais = base?.dados ?? {};
    const dados = {};
    for (const t of tabelas) {
      dados[t] = Array.isArray(dadosOriginais?.[t]) ? dadosOriginais[t] : [];
    }
    const normalizado = {
      versao: String(base?.versao ?? '2.0'),
      dataExportacao: base?.dataExportacao ?? new Date().toISOString(),
      dados,
      metadados: base?.metadados ?? {}
    };
    return normalizado;
  },

  _validarTabela(nomeTabela, registros) {
    if (!Array.isArray(registros)) throw new Error(`Tabela ${nomeTabela} inválida no backup.`);

    const textoComLimite = (valor, campo, max, obrigatorio = false) => {
      const texto = String(valor ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
      if (obrigatorio && !texto) throw new Error(`Campo obrigatório ausente: ${nomeTabela}.${campo}`);
      if (texto.length > max) throw new Error(`Campo ${nomeTabela}.${campo} excede ${max} caracteres.`);
      return texto;
    };

    const inteiro = (valor, campo, { min = 0, max = Number.MAX_SAFE_INTEGER, obrigatorio = true } = {}) => {
      if (!obrigatorio && (valor === null || valor === undefined || String(valor).trim() === '')) return null;
      const n = Number.parseInt(valor, 10);
      if (Number.isNaN(n)) throw new Error(`Campo numérico inválido: ${nomeTabela}.${campo}`);
      if (n < min || n > max) throw new Error(`Campo fora da faixa: ${nomeTabela}.${campo}`);
      return n;
    };

    const dataISO = (valor, campo, obrigatorio = false) => {
      if (!obrigatorio && !valor) return null;
      const d = new Date(valor);
      if (Number.isNaN(d.getTime())) throw new Error(`Data inválida: ${nomeTabela}.${campo}`);
      return d.toISOString();
    };

    const enumValor = (valor, campo, opcoes) => {
      if (!opcoes.includes(valor)) throw new Error(`Valor inválido em ${nomeTabela}.${campo}`);
      return valor;
    };

    return registros.map((r) => {
      const item = { ...(r ?? {}) };
      if (item.id !== undefined) inteiro(item.id, 'id', { min: 1 });

      if (nomeTabela === 'concursos') {
        item.nome = textoComLimite(item.nome, 'nome', 100, true);
        item.horasDiarias = inteiro(item.horasDiarias ?? 4, 'horasDiarias', { min: 1, max: 18 });
        item.totalQuestoes = inteiro(item.totalQuestoes, 'totalQuestoes', { min: 1, max: 5000, obrigatorio: false });
        item.dataProva = dataISO(item.dataProva, 'dataProva');
        item.criadoEm = dataISO(item.criadoEm, 'criadoEm') ?? new Date().toISOString();
        // Sprint 2: dias de estudo (campo opcional, default seg-sáb)
        if (item.diasEstudoSemana !== undefined && item.diasEstudoSemana !== null) {
          if (!Array.isArray(item.diasEstudoSemana)) item.diasEstudoSemana = [1, 2, 3, 4, 5, 6];
          item.diasEstudoSemana = [...new Set(item.diasEstudoSemana.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
          if (item.diasEstudoSemana.length === 0) item.diasEstudoSemana = [1, 2, 3, 4, 5, 6];
        } else {
          item.diasEstudoSemana = [1, 2, 3, 4, 5, 6];
        }
      }

      if (nomeTabela === 'disciplinas') {
        item.concursoId = inteiro(item.concursoId, 'concursoId', { min: 1 });
        item.nome = textoComLimite(item.nome, 'nome', 100, true);
        item.numQuestoes = inteiro(item.numQuestoes ?? item.peso ?? 5, 'numQuestoes', { min: 1, max: 1000 });
        item.pesoQuestao = inteiro(item.pesoQuestao ?? 1, 'pesoQuestao', { min: 1, max: 50 });
        item.eliminatoria = Boolean(item.eliminatoria);
        item.percentualMinimo = item.eliminatoria ? inteiro(item.percentualMinimo ?? 50, 'percentualMinimo', { min: 1, max: 100 }) : null;
        item.grauConhecimento = inteiro(item.grauConhecimento ?? 3, 'grauConhecimento', { min: 1, max: 5 });
        item.cor = String(item.cor ?? '#e94560').trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(item.cor)) throw new Error('Cor inválida na tabela disciplinas.');
        item.ordemCiclo = inteiro(item.ordemCiclo ?? 0, 'ordemCiclo', { min: 0, max: 10000 });
      }

      if (nomeTabela === 'sessoes') {
        item.concursoId = inteiro(item.concursoId, 'concursoId', { min: 1 });
        item.disciplinaId = inteiro(item.disciplinaId, 'disciplinaId', { min: 1 });
        item.topico = textoComLimite(item.topico, 'topico', 200, true);
        item.tipo = enumValor(item.tipo ?? 'Novo', 'tipo', ['Novo', 'Revisão 1', 'Revisão 2', 'Revisão 3', 'Questões']);
        item.data = dataISO(item.data, 'data', true);
        item.duracaoSegundos = inteiro(item.duracaoSegundos ?? 0, 'duracaoSegundos', { min: 0, max: 86400 });
        item.avaliacao = inteiro(item.avaliacao ?? 0, 'avaliacao', { min: 0, max: 5 });
        item.notas = textoComLimite(item.notas, 'notas', 5000, false);
      }

      if (nomeTabela === 'revisoes') {
        item.sessaoId = inteiro(item.sessaoId, 'sessaoId', { min: 1, obrigatorio: false });
        item.disciplinaId = inteiro(item.disciplinaId, 'disciplinaId', { min: 1 });
        item.topico = textoComLimite(item.topico, 'topico', 200, true);
        item.tipoRevisao = enumValor(item.tipoRevisao ?? 'R1', 'tipoRevisao', ['R1', 'R2', 'R3']);
        item.dataPrevista = dataISO(item.dataPrevista, 'dataPrevista', true);
        item.dataRealizada = dataISO(item.dataRealizada, 'dataRealizada');
        item.status = enumValor(item.status ?? 'pendente', 'status', ['pendente', 'feita']);
        // Campos SM-2
        if (item.fatorFacilidade !== undefined && item.fatorFacilidade !== null) {
          const ef = parseFloat(item.fatorFacilidade);
          if (Number.isNaN(ef) || ef < 1.3 || ef > 5.0) item.fatorFacilidade = 2.5;
          else item.fatorFacilidade = Math.round(ef * 1000) / 1000;
        } else {
          item.fatorFacilidade = 2.5;
        }

        if (item.intervaloAtual !== undefined && item.intervaloAtual !== null) {
          item.intervaloAtual = inteiro(item.intervaloAtual, 'intervaloAtual', { min: 1, max: 36500 });
        } else {
          const mapaInt = { R1: 1, R2: 7, R3: 30 };
          item.intervaloAtual = mapaInt[item.tipoRevisao] ?? 1;
        }

        if (item.repeticoes !== undefined && item.repeticoes !== null) {
          item.repeticoes = inteiro(item.repeticoes, 'repeticoes', { min: 0, max: 10000 });
        } else {
          item.repeticoes = 0;
        }

        if (item.notaRevisao !== undefined && item.notaRevisao !== null) {
          item.notaRevisao = inteiro(item.notaRevisao, 'notaRevisao', { min: 0, max: 5 });
        } else {
          item.notaRevisao = null;
        }
      }

      if (nomeTabela === 'cicloConfig') {
        item.concursoId = inteiro(item.concursoId, 'concursoId', { min: 1 });
        item.posicaoAtual = inteiro(item.posicaoAtual ?? 0, 'posicaoAtual', { min: 0, max: 10000 });
        item.cicloJSON = String(item.cicloJSON ?? '[]');
      }

      if (nomeTabela === 'questoes') {
        item.concursoId = inteiro(item.concursoId, 'concursoId', { min: 1 });
        item.disciplinaId = inteiro(item.disciplinaId, 'disciplinaId', { min: 1 });
        item.topico = textoComLimite(item.topico, 'topico', 200, true);
        item.origem = textoComLimite(item.origem, 'origem', 100, false);
        item.resultado = enumValor(item.resultado ?? 'errou', 'resultado', ['acertou', 'acertou_duvida', 'errou', 'errou_desatencao']);
        item.data = dataISO(item.data, 'data', true);
      }

      if (nomeTabela === 'conquistas') {
        item.chave = textoComLimite(item.chave, 'chave', 100, true);
        item.desbloqueadaEm = dataISO(item.desbloqueadaEm, 'desbloqueadaEm', true);
        item.visualizada = Boolean(item.visualizada ?? false);
      }

      if (nomeTabela === 'simulados') {
        item.concursoId = inteiro(item.concursoId, 'concursoId', { min: 1 });
        item.titulo = textoComLimite(item.titulo, 'titulo', 200, false);
        item.duracaoLimite = inteiro(item.duracaoLimite ?? 3600, 'duracaoLimite', { min: 0, max: 86400 });
        item.status = enumValor(item.status ?? 'em_andamento', 'status', ['em_andamento', 'finalizado', 'cancelado']);
        item.data = dataISO(item.data, 'data', true);
        item.criadoEm = dataISO(item.criadoEm, 'criadoEm', false) ?? new Date().toISOString();
        item.finalizadoEm = dataISO(item.finalizadoEm, 'finalizadoEm', false);
        // respostas array
        item.respostas = Array.isArray(item.respostas) ? item.respostas.map((r, i) => {
          if (!r || typeof r !== 'object') return null;
          return {
            disciplinaId: r.disciplinaId ? inteiro(r.disciplinaId, `respostas[${i}].disciplinaId`, { min: 1, obrigatorio: false }) : null,
            topicoId: r.topicoId ?? null,
            enunciado: textoComLimite(r.enunciado, `respostas[${i}].enunciado`, 5000, false),
            alternativas: Array.isArray(r.alternativas) ? r.alternativas.map((a, j) => textoComLimite(a, `respostas[${i}].alternativas[${j}]`, 500, false)) : [],
            respostaCorreta: inteiro(r.respostaCorreta ?? 0, `respostas[${i}].respostaCorreta`, { min: 0, max: 20 }),
            respostaDada: r.respostaDada !== null && r.respostaDada !== undefined ? inteiro(r.respostaDada, `respostas[${i}].respostaDada`, { min: 0, max: 20 }) : null,
            tempo: inteiro(r.tempo ?? 0, `respostas[${i}].tempo`, { min: 0 })
          };
        }).filter(r => r !== null) : [];
        // resultado
        if (item.resultado && typeof item.resultado === 'object') {
          item.resultado.nota = parseFloat(item.resultado.nota ?? 0) || 0;
          item.resultado.acertos = inteiro(item.resultado.acertos ?? 0, 'resultado.acertos', { min: 0 });
          item.resultado.erros = inteiro(item.resultado.erros ?? 0, 'resultado.erros', { min: 0 });
          item.resultado.tempo = inteiro(item.resultado.tempo ?? 0, 'resultado.tempo', { min: 0 });
        } else if (!item.resultado) {
          item.resultado = null;
        }
      }

      return item;
    });
  },

  _validarEstrutura(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Payload de backup inválido.');
    if (!payload?.dados || typeof payload.dados !== 'object') throw new Error('Backup sem bloco de dados.');
    if (!this._compararHash(payload)) throw new Error('Falha de integridade: hash do backup não confere.');

    const tabelas = this._listarTabelasSuportadas();
    const saneado = {};
    for (const tabela of tabelas) {
      saneado[tabela] = this._validarTabela(tabela, payload?.dados?.[tabela] ?? []);
    }

    // Garantia de concurso único ativo
    if ((saneado.concursos?.length ?? 0) > 1) {
      saneado.concursos.sort((a, b) => new Date(b?.criadoEm ?? 0) - new Date(a?.criadoEm ?? 0));
      saneado.concursos = [saneado.concursos[0]];
    }

    return { ...payload, dados: saneado };
  },

  async exportarTudo() {
    try {
      const tabelas = this._listarTabelasSuportadas();
      const dados = {};
      for (const t of tabelas) dados[t] = await db[t].toArray();

      const base = {
        versao: '2.1',
        dataExportacao: new Date().toISOString(),
        dados,
        metadados: {
          app: 'MentorConcursos',
          tabelas,
          totalRegistros: tabelas.reduce((acc, t) => acc + (dados[t]?.length ?? 0), 0)
        }
      };
      base.metadados.hash = this._hashConteudo({ ...base, metadados: { ...base.metadados, hash: undefined } });
      return base;
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
        await navigator.share({ files: [arquivo], title: 'Backup MentorConcursos', text: 'Meu backup do MentorConcursos' });
        this.registrarBackup();
        return { ok: true, metodo: 'share' };
      }
      if (navigator.share) {
        const url = URL.createObjectURL(blob);
        await navigator.share({ title: 'Backup MentorConcursos', text: 'Backup do MentorConcursos', url });
        URL.revokeObjectURL(url);
        this.registrarBackup();
        return { ok: true, metodo: 'share-url' };
      }
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, cancelado: true };
      console.warn(e);
    }
    await this.exportar();
    return { ok: true, metodo: 'download' };
  },

  async criarSnapshotPreImportacao() {
    try {
      const snapshot = await this.exportarTudo();
      localStorage.setItem(this.CHAVE_SNAPSHOT_PRE_IMPORT, JSON.stringify(snapshot));
      return true;
    } catch (e) {
      console.warn('Falha ao criar snapshot pré-importação', e);
      return false;
    }
  },

  obterSnapshotPreImportacao() {
    try {
      const bruto = localStorage.getItem(this.CHAVE_SNAPSHOT_PRE_IMPORT);
      return bruto ? JSON.parse(bruto) : null;
    } catch {
      return null;
    }
  },

  limparSnapshotPreImportacao() {
    try { localStorage.removeItem(this.CHAVE_SNAPSHOT_PRE_IMPORT); } catch {}
  },

  async restaurarSnapshotPreImportacao() {
    const snapshot = this.obterSnapshotPreImportacao();
    if (!snapshot) throw new Error('Snapshot pré-importação não encontrado.');
    await this.importar(snapshot);
    return true;
  },

  async importarDeArquivo(file, onProgress) {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    const limiteBytes = this.LIMITE_ARQUIVO_MB * 1024 * 1024;
    if ((file.size ?? 0) > limiteBytes) throw new Error(`Arquivo muito grande. Limite de ${this.LIMITE_ARQUIVO_MB}MB.`);

    const texto = await file.text();
    let json;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new Error('Arquivo inválido. Selecione um backup JSON válido.');
    }
    if (!json?.dados) throw new Error('Estrutura de backup inválida (campo dados ausente).');

    return this.importar(json, onProgress);
  },

  async importar(json, onProgress) {
    const tabelas = this._listarTabelasSuportadas();
    const normalizado = this._normalizarPayload(json);
    const payload = this._validarEstrutura(normalizado);

    await this.criarSnapshotPreImportacao();

    try {
      await db.transaction('rw', ...tabelas.map(t => db[t]), async () => {
        for (const t of tabelas) await db[t].clear();

        let feitas = 0;
        const total = tabelas.length;
        for (const t of tabelas) {
          const arr = payload?.dados?.[t] ?? [];
          if (arr.length > 0) await db[t].bulkPut(arr);
          feitas++;
          onProgress?.(Math.round((feitas / total) * 100));
        }
      });

      this.registrarBackup();
      return true;
    } catch (e) {
      console.error('Falha na importação transacional:', e);
      throw new Error(`Falha na importação transacional: ${e?.message ?? 'erro desconhecido'}`);
    }
  },

  registrarBackup() {
    try { localStorage.setItem(this.CHAVE_ULTIMO, new Date().toISOString()); } catch {}
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