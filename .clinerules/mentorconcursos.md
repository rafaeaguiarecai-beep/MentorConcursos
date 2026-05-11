# MentorConcursos – Regras do Projeto

## Stack e Restrições
- PWA 100% client-side, JavaScript vanilla (ES2020+), sem frameworks, sem TypeScript
- Banco de dados: IndexedDB via Dexie.js (carregado via CDN unpkg)
- Gráficos: Chart.js (carregado via CDN jsdelivr)
- Nenhuma outra biblioteca externa pode ser adicionada
- Não usar npm, webpack, bundlers ou transpilers
- Todo código roda no navegador, sem backend

## Estrutura de Arquivos
- `/index.html` – shell do app, carrega scripts em ordem fixa
- `/sw.js` – Service Worker (cache offline)
- `/manifest.json` – manifest da PWA
- `/css/style.css` – estilos globais
- `/js/db.js` – schema Dexie, validações, CRUD, algoritmos (SM-2, distribuição, diagnóstico)
- `/js/app.js` – UI, Router, páginas, modais, lógica de apresentação
- `/js/timer.js` – cronômetro de estudo (exporta `window.Timer`)
- `/js/backup.js` – exportação/importação JSON (exporta `window.Backup`)
- `/js/charts.js` – wrappers Chart.js (exporta `window.Graficos`)

## Ordem de Carregamento dos Scripts (NUNCA alterar)
Dexie (CDN)
Chart.js (CDN)
js/db.js
js/timer.js
js/backup.js
js/charts.js
js/app.js

## Padrões de Código
- Módulos são objetos expostos em `window` (ex: `window.Concursos`, `window.Sessoes`)
- Comunicação entre módulos via `window.NomeDoModulo.metodo()`
- Funções assíncronas usam async/await (não .then chains)
- Validação de inputs via `Validacao` (definido em db.js)
- Datas sempre em ISO string; tempos em segundos (inteiros)
- IDs são auto-increment do Dexie
- Sanitização de HTML com `escapeHtml()` definido em app.js
- Toast para feedback ao usuário (`Toast.show()`)
- Modais via `Modal.abrir()` / `Modal.fechar()`
- Navegação via `Router.ir('nomePagina')`

## Schema Dexie Atual (versões 1–3)
- Tabelas: concursos, disciplinas, topicos, sessoes, revisoes, cicloConfig, questoes
- Campos SM-2 em revisoes: fatorFacilidade, intervaloAtual, repeticoes, notaRevisao
- Campos em disciplinas: numQuestoes, pesoQuestao, eliminatoria, minimoPercentual
- Campo em concursos: diasEstudoSemana (array de 0-6)

## Service Worker
- CACHE_NAME segue padrão `mentorconcursos-vN` (incrementar N a cada mudança)
- APP_SHELL lista todos os arquivos locais
- CDN usa stale-while-revalidate
- Navegação usa network-first
- Ao alterar qualquer arquivo, SEMPRE incrementar a versão do cache no sw.js

## Regras de Implementação
- Ao criar novas tabelas no Dexie, adicionar nova version() incremental (nunca editar versions existentes)
- Ao adicionar campos a tabelas existentes, usar upgrade() na nova version
- Ao criar novas páginas, registrar no Router e adicionar na navegação se necessário
- Ao criar novos módulos em db.js, exportar via window no final do arquivo
- backup.js deve validar todos os campos de todas as tabelas (incluindo novos campos)
- Testar que o app carrega sem erro no console após cada alteração
- Nunca remover funcionalidade existente ao adicionar nova

## Entrega
- Editar os arquivos diretamente no workspace
- Após cada arquivo modificado, explicar brevemente o que mudou
- Se o arquivo ficar muito grande, NÃO dividir em múltiplos arquivos – manter a estrutura atual
- Sempre incrementar CACHE_NAME no sw.js ao final
