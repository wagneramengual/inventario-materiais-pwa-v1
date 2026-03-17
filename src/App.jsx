import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ALMOXARIFADOS, INITIAL_STATE } from './data/seed';

const STORAGE_KEY = 'inventario-materiais-pwa-v2';

const tabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'campanhas', label: 'Campanhas' },
  { id: 'equipes', label: 'Equipes' },
  { id: 'itens', label: 'Itens / Importação' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'divergencias', label: 'Divergências' },
  { id: 'relatorios', label: 'PDF / Relatórios' }
];

const TASK_SCOPE_OPTIONS = [
  { value: 'almoxCompleto', label: 'Almoxarifado completo' },
  { value: 'somentePendentes', label: 'Somente itens pendentes' },
  { value: 'somenteDivergentes', label: 'Somente itens divergentes' },
  { value: 'selecaoManual', label: 'Seleção manual' }
];

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return INITIAL_STATE;
  try {
    return JSON.parse(raw);
  } catch {
    return INITIAL_STATE;
  }
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getAlmoxName(almoxId) {
  return ALMOXARIFADOS.find((almox) => almox.id === almoxId)?.nome || 'Não informado';
}

function getAlmoxIdByCode(code) {
  const normalized = String(code || '').trim();
  const match = ALMOXARIFADOS.find(
    (almox) => almox.codigoCompleto === normalized || almox.codigoReduzido === normalized.split('.').slice(-1)[0]
  );
  return match?.id || '';
}

function classifyDifference(diferenca, saldoTeorico) {
  if (Number(diferenca) === 0) return 'Sem diferença';
  const referencia = Math.max(Number(saldoTeorico || 0), 1);
  const percentual = Math.abs(Number(diferenca || 0)) / referencia;
  return percentual <= 0.05 ? 'Diferença admissível' : 'Diferença crítica';
}

function statusClassName(value) {
  return `status-badge ${String(value || 'sem-registro').replace(/\s+/g, '-').toLowerCase()}`;
}

function Card({ title, value, subtitle }) {
  return (
    <div className="card metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      {subtitle ? <div className="metric-subtitle">{subtitle}</div> : null}
    </div>
  );
}

function SectionTitle({ title, description, action }) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function ProgressBar({ value, total }) {
  const percent = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <small>{percent}%</small>
    </div>
  );
}

function parseMembersText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nome, matriculaLogin = '', funcao = 'Contador'] = line.split('|').map((part) => part.trim());
      return { id: uid('int'), nome, matriculaLogin, funcao };
    });
}

function buildMembersText(integrantes = []) {
  return integrantes.map((item) => [item.nome, item.matriculaLogin, item.funcao].filter(Boolean).join(' | ')).join('\n');
}

function findHeader(row, candidates) {
  const normalizedRow = row.map((cell) => normalizeText(cell));
  return candidates.find((candidate) => normalizedRow.includes(normalizeText(candidate)));
}

function parseImportedRows(rows, campaignId) {
  if (!rows.length) return { importedItems: [], sourceMode: 'desconhecido' };

  const cleanedRows = rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  if (!cleanedRows.length) return { importedItems: [], sourceMode: 'desconhecido' };

  let headerIndex = cleanedRows.findIndex((row) => findHeader(row, ['Item Material', 'Item']) && findHeader(row, ['Almoxarifado', 'Local']));
  if (headerIndex < 0) headerIndex = 0;

  const header = cleanedRows[headerIndex].map((cell) => String(cell ?? '').trim());
  const dataRows = cleanedRows.slice(headerIndex + 1);
  const headerMap = Object.fromEntries(header.map((item, index) => [normalizeText(item), index]));

  const mode = headerMap[normalizeText('Item Material')] !== undefined ? 'planilha-base' : 'contagem';

  const col = (names) => names.map((name) => headerMap[normalizeText(name)]).find((index) => index !== undefined);

  const idxCodigo = col(['Item Material', 'Item']);
  const idxDescricao = col(['Nome Específico (Nome)', 'Nome Item']);
  const idxAlmox = col(['Almoxarifado', 'Local']);
  const idxSaldo = col(['Saldo Disponível', 'Disponível']);
  const idxUnidade = col(['Unidade', 'UM']);

  const importedItems = dataRows
    .map((row) => {
      const codigo = String(row[idxCodigo] ?? '').trim();
      const descricao = String(row[idxDescricao] ?? '').trim();
      const almoxId = getAlmoxIdByCode(row[idxAlmox]);
      const saldoTeorico = Number(row[idxSaldo] ?? 0) || 0;
      if (!codigo || !descricao || !almoxId) return null;
      return {
        id: uid('item'),
        campanhaId: campaignId,
        almoxarifadoId: almoxId,
        codigoItem: codigo,
        descricaoItem: descricao,
        saldoTeorico,
        unidade: String(row[idxUnidade] ?? 'Un').trim() || 'Un',
        observacao: '',
        zerado: saldoTeorico === 0
      };
    })
    .filter(Boolean);

  const uniqueMap = new Map();
  importedItems.forEach((item) => uniqueMap.set(`${item.almoxarifadoId}-${item.codigoItem}`, item));

  return { importedItems: Array.from(uniqueMap.values()), sourceMode: mode };
}

function openPrintWindow(title, htmlContent) {
  const popup = window.open('', '_blank', 'width=960,height=900');
  if (!popup) return;
  popup.document.write(`
    <html lang="pt-BR">
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          h1, h2, h3 { margin: 0 0 12px; }
          .meta { margin-bottom: 18px; color: #4b5563; }
          .sheet { margin-bottom: 28px; page-break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #eff6ff; }
          .space { height: 28px; }
          .small { color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [state, setState] = useState(INITIAL_STATE);
  const [showZeroItems, setShowZeroItems] = useState(false);
  const [itemFilter, setItemFilter] = useState('todos');
  const [almoxFilter, setAlmoxFilter] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [importInfo, setImportInfo] = useState(null);
  const [printOptions, setPrintOptions] = useState({ incluirZerados: false, somenteDivergentes: false, almoxarifadoId: 'todos' });
  const [taskForm, setTaskForm] = useState({
    almoxarifadoId: 'almox-001',
    equipeId: 'eq-1',
    tipoContagem: '1ª contagem',
    observacao: '',
    scope: 'almoxCompleto',
    titulo: ''
  });
  const [countForm, setCountForm] = useState({ tarefaId: 'tar-1', itemId: '', quantidadeContada: '', usuarioRegistro: 'Wagner', observacao: '' });
  const [teamForm, setTeamForm] = useState({ id: '', nome: '', responsavel: '', observacoes: '', integrantesTexto: '' });

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const campanhaAtual = state.campanhas[0];

  const registrosPorItem = useMemo(() => {
    const map = new Map();
    state.registros.forEach((registro) => {
      const current = map.get(registro.itemId) || [];
      current.push(registro);
      current.sort((a, b) => new Date(a.dataHoraRegistro) - new Date(b.dataHoraRegistro));
      map.set(registro.itemId, current);
    });
    return map;
  }, [state.registros]);

  const taskById = useMemo(() => Object.fromEntries(state.tarefas.map((tarefa) => [tarefa.id, tarefa])), [state.tarefas]);

  const itensComStatus = useMemo(() => {
    return state.itens.map((item) => {
      const registros = registrosPorItem.get(item.id) || [];
      const ultimoRegistro = registros[registros.length - 1];
      const ultimaTarefa = ultimoRegistro ? taskById[ultimoRegistro.tarefaId] : null;
      return {
        ...item,
        totalRegistros: registros.length,
        ultimoRegistro,
        ultimaTarefa,
        statusContagem: ultimoRegistro ? 'Contado' : 'Pendente',
        diferencaAtual: ultimoRegistro?.diferenca ?? null,
        classificacaoAtual: ultimoRegistro?.classificacao || 'Sem registro'
      };
    });
  }, [state.itens, registrosPorItem, taskById]);

  const divergencias = useMemo(
    () => itensComStatus.filter((item) => ['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual)),
    [itensComStatus]
  );

  const dashboard = useMemo(() => {
    const totalItens = state.itens.length;
    const itensZerados = state.itens.filter((item) => item.zerado).length;
    const itensAtivos = totalItens - itensZerados;
    const contados = itensComStatus.filter((item) => item.statusContagem === 'Contado').length;
    const pendentes = totalItens - contados;
    const tarefasEmExecucao = state.tarefas.filter((t) => t.status === 'Em execução').length;
    const tarefasConcluidas = state.tarefas.filter((t) => t.status === 'Concluída' || t.status === 'Validada').length;
    const criticas = divergencias.filter((item) => item.classificacaoAtual === 'Diferença crítica').length;
    const recontagens = state.tarefas.filter((t) => t.tipoContagem !== '1ª contagem').length;
    return {
      totalItens,
      itensZerados,
      itensAtivos,
      contados,
      pendentes,
      tarefasEmExecucao,
      tarefasConcluidas,
      divergencias: divergencias.length,
      criticas,
      recontagens,
      progresso: totalItens ? Math.round((contados / totalItens) * 100) : 0
    };
  }, [state, itensComStatus, divergencias]);

  const itensManualSelection = useMemo(
    () => state.itens.filter((item) => item.almoxarifadoId === taskForm.almoxarifadoId),
    [state.itens, taskForm.almoxarifadoId]
  );

  useEffect(() => {
    setSelectedItemIds([]);
  }, [taskForm.almoxarifadoId, taskForm.scope]);

  const filteredItems = useMemo(() => {
    return itensComStatus.filter((item) => {
      if (!showZeroItems && item.zerado) return false;
      if (almoxFilter !== 'todos' && item.almoxarifadoId !== almoxFilter) return false;
      if (itemFilter === 'pendentes' && item.statusContagem !== 'Pendente') return false;
      if (itemFilter === 'contados' && item.statusContagem !== 'Contado') return false;
      if (itemFilter === 'divergentes' && !['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual)) return false;
      if (searchTerm) {
        const bag = `${item.codigoItem} ${item.descricaoItem}`.toLowerCase();
        if (!bag.includes(searchTerm.toLowerCase())) return false;
      }
      return true;
    });
  }, [itensComStatus, showZeroItems, almoxFilter, itemFilter, searchTerm]);

  const itemsForCurrentTask = useMemo(() => {
    const selectedTask = state.tarefas.find((t) => t.id === countForm.tarefaId);
    if (!selectedTask) return [];
    const base = state.itens.filter(
      (item) => item.almoxarifadoId === selectedTask.almoxarifadoId && item.campanhaId === selectedTask.campanhaId && !item.zerado
    );
    const scoped = selectedTask.itemIds?.length ? base.filter((item) => selectedTask.itemIds.includes(item.id)) : base;
    return scoped;
  }, [countForm.tarefaId, state.tarefas, state.itens]);

  useEffect(() => {
    if (itemsForCurrentTask.length && !itemsForCurrentTask.some((item) => item.id === countForm.itemId)) {
      setCountForm((prev) => ({ ...prev, itemId: itemsForCurrentTask[0].id }));
    }
  }, [itemsForCurrentTask, countForm.itemId]);

  function updateState(updater) {
    setState((prev) => updater(prev));
  }

  function resetTeamForm() {
    setTeamForm({ id: '', nome: '', responsavel: '', observacoes: '', integrantesTexto: '' });
  }

  function handleCreateOrUpdateTeam(event) {
    event.preventDefault();
    const integrantes = parseMembersText(teamForm.integrantesTexto);
    const payload = {
      id: teamForm.id || uid('eq'),
      nome: teamForm.nome,
      responsavel: teamForm.responsavel,
      observacoes: teamForm.observacoes,
      ativa: true,
      integrantes
    };

    updateState((prev) => ({
      ...prev,
      equipes: teamForm.id ? prev.equipes.map((item) => (item.id === teamForm.id ? { ...item, ...payload } : item)) : [...prev.equipes, payload]
    }));
    resetTeamForm();
  }

  function editTeam(equipe) {
    setTeamForm({
      id: equipe.id,
      nome: equipe.nome,
      responsavel: equipe.responsavel,
      observacoes: equipe.observacoes,
      integrantesTexto: buildMembersText(equipe.integrantes)
    });
    setActiveTab('equipes');
  }

  function toggleTeamActive(teamId) {
    updateState((prev) => ({
      ...prev,
      equipes: prev.equipes.map((equipe) => (equipe.id === teamId ? { ...equipe, ativa: !equipe.ativa } : equipe))
    }));
  }

  function getCandidateItemsForTask() {
    const byAlmox = itensComStatus.filter((item) => item.almoxarifadoId === taskForm.almoxarifadoId);
    if (taskForm.scope === 'somentePendentes') return byAlmox.filter((item) => item.statusContagem === 'Pendente' && !item.zerado);
    if (taskForm.scope === 'somenteDivergentes') return byAlmox.filter((item) => ['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual));
    if (taskForm.scope === 'selecaoManual') return byAlmox.filter((item) => selectedItemIds.includes(item.id));
    return byAlmox.filter((item) => !item.zerado);
  }

  function handleCreateTask(event) {
    event.preventDefault();
    const selectedItems = getCandidateItemsForTask();
    if (!selectedItems.length) {
      alert('Nenhum item encontrado para o escopo selecionado.');
      return;
    }

    const tarefa = {
      id: uid('tar'),
      campanhaId: campanhaAtual.id,
      almoxarifadoId: taskForm.almoxarifadoId,
      equipeId: taskForm.equipeId,
      tipoContagem: taskForm.tipoContagem,
      status: 'Pendente',
      dataInicio: '',
      dataFim: '',
      observacao: taskForm.observacao,
      titulo: taskForm.titulo || `${taskForm.tipoContagem} - ${getAlmoxName(taskForm.almoxarifadoId)}`,
      scope: taskForm.scope,
      itemIds: selectedItems.map((item) => item.id)
    };
    updateState((prev) => ({ ...prev, tarefas: [tarefa, ...prev.tarefas] }));
    setTaskForm((prev) => ({ ...prev, observacao: '', titulo: '' }));
  }

  function startTask(taskId) {
    updateState((prev) => ({
      ...prev,
      tarefas: prev.tarefas.map((tarefa) =>
        tarefa.id === taskId ? { ...tarefa, status: 'Em execução', dataInicio: tarefa.dataInicio || new Date().toISOString() } : tarefa
      )
    }));
  }

  function concludeTask(taskId) {
    updateState((prev) => ({
      ...prev,
      tarefas: prev.tarefas.map((tarefa) =>
        tarefa.id === taskId ? { ...tarefa, status: 'Concluída', dataFim: new Date().toISOString() } : tarefa
      )
    }));
  }

  function handleRegisterCount(event) {
    event.preventDefault();
    const item = state.itens.find((current) => current.id === countForm.itemId);
    const tarefa = state.tarefas.find((current) => current.id === countForm.tarefaId);
    if (!item || !tarefa) return;
    const quantidade = Number(countForm.quantidadeContada);
    const diferenca = quantidade - Number(item.saldoTeorico || 0);
    const classificacao = classifyDifference(diferenca, item.saldoTeorico);

    const registro = {
      id: uid('reg'),
      tarefaId: countForm.tarefaId,
      itemId: item.id,
      quantidadeContada: quantidade,
      diferenca,
      classificacao,
      observacao: countForm.observacao,
      usuarioRegistro: countForm.usuarioRegistro,
      dataHoraRegistro: new Date().toISOString()
    };

    updateState((prev) => {
      const existingAnalise = prev.analises.find((analise) => analise.itemId === item.id);
      let analises = prev.analises;
      if (classificacao !== 'Sem diferença' && !existingAnalise) {
        analises = [
          ...prev.analises,
          {
            id: uid('an'),
            itemId: item.id,
            preAnalise: `Divergência identificada na ${tarefa.tipoContagem}.`,
            analiseFinal: '',
            situacaoDocumental: 'Pendente de verificação',
            observacaoGerencial: 'Avaliar necessidade de recontagem com equipe distinta.'
          }
        ];
      }
      return { ...prev, registros: [registro, ...prev.registros], analises };
    });

    setCountForm((prev) => ({ ...prev, quantidadeContada: '', observacao: '' }));
  }

  function generateRecountForItem(itemId) {
    const item = itensComStatus.find((current) => current.id === itemId);
    if (!item) return;
    const lastTaskId = registrosPorItem.get(itemId)?.slice(-1)[0]?.tarefaId;
    const lastTask = state.tarefas.find((t) => t.id === lastTaskId);
    const alternativeTeam = state.equipes.find((team) => team.id !== lastTask?.equipeId && team.ativa) || state.equipes[0];

    const novaTarefa = {
      id: uid('tar'),
      campanhaId: campanhaAtual.id,
      almoxarifadoId: item.almoxarifadoId,
      equipeId: alternativeTeam?.id || state.equipes[0]?.id,
      tipoContagem: lastTask?.tipoContagem === '1ª contagem' ? '2ª contagem' : '3ª contagem',
      status: 'Pendente',
      dataInicio: '',
      dataFim: '',
      observacao: `Recontagem gerada automaticamente para o item ${item.codigoItem}.`,
      titulo: `Recontagem ${item.codigoItem}`,
      scope: 'selecaoManual',
      itemIds: [item.id]
    };

    updateState((prev) => ({ ...prev, tarefas: [novaTarefa, ...prev.tarefas] }));
    setActiveTab('tarefas');
  }

  function generateRecountByAlmox(almoxId) {
    const itens = divergencias.filter((item) => item.almoxarifadoId === almoxId);
    if (!itens.length) {
      alert('Não há divergências nesse almoxarifado.');
      return;
    }
    const lastTeamIds = new Set(
      itens
        .map((item) => registrosPorItem.get(item.id)?.slice(-1)[0]?.tarefaId)
        .map((taskId) => state.tarefas.find((tarefa) => tarefa.id === taskId)?.equipeId)
        .filter(Boolean)
    );
    const equipe = state.equipes.find((item) => item.ativa && !lastTeamIds.has(item.id)) || state.equipes.find((item) => item.ativa);
    const tarefa = {
      id: uid('tar'),
      campanhaId: campanhaAtual.id,
      almoxarifadoId: almoxId,
      equipeId: equipe?.id || state.equipes[0]?.id,
      tipoContagem: '2ª contagem',
      status: 'Pendente',
      dataInicio: '',
      dataFim: '',
      observacao: 'Recontagem em lote gerada a partir das divergências do almoxarifado.',
      titulo: `Recontagem em lote - ${getAlmoxName(almoxId)}`,
      scope: 'somenteDivergentes',
      itemIds: itens.map((item) => item.id)
    };
    updateState((prev) => ({ ...prev, tarefas: [tarefa, ...prev.tarefas] }));
    setActiveTab('tarefas');
  }

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const data = loadEvent.target.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const targetSheet = workbook.Sheets['Planilha1'] || workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(targetSheet, { header: 1, raw: true });
        const { importedItems, sourceMode } = parseImportedRows(rows, campanhaAtual.id);
        if (!importedItems.length) {
          alert('Não foi possível identificar colunas válidas na planilha.');
          return;
        }
        updateState((prev) => ({ ...prev, itens: importedItems }));
        setImportInfo({ arquivo: file.name, total: importedItems.length, modo: sourceMode, planilha: targetSheet['!ref'] ? 'Planilha detectada' : 'Planilha importada' });
        setActiveTab('itens');
      } catch (error) {
        console.error(error);
        alert('Falha ao importar arquivo. Confere se a planilha é .xlsx, .ods ou .csv.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function exportSnapshot() {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inventario-materiais-backup.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL_STATE);
    setImportInfo(null);
  }

  function generatePdfListaFisica() {
    const almoxs = (printOptions.almoxarifadoId === 'todos' ? ALMOXARIFADOS : ALMOXARIFADOS.filter((item) => item.id === printOptions.almoxarifadoId))
      .map((almox) => {
        const itens = itensComStatus.filter((item) => {
          if (item.almoxarifadoId !== almox.id) return false;
          if (!printOptions.incluirZerados && item.zerado) return false;
          if (printOptions.somenteDivergentes && !['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual)) return false;
          return true;
        });
        return { almox, itens };
      })
      .filter((grupo) => grupo.itens.length);

    const html = `
      <h1>Lista física de contagem</h1>
      <div class="meta">Campanha: ${campanhaAtual.nome} | Emitido em: ${new Date().toLocaleString('pt-BR')}</div>
      ${almoxs
        .map(
          ({ almox, itens }) => `
            <div class="sheet">
              <h2>${almox.nome}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Saldo teórico</th>
                    <th>1ª contagem</th>
                    <th>2ª contagem</th>
                    <th>3ª contagem</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  ${itens
                    .map(
                      (item) => `
                        <tr>
                          <td>${item.codigoItem}</td>
                          <td>${item.descricaoItem}</td>
                          <td>${formatNumber(item.saldoTeorico)}</td>
                          <td class="space"></td>
                          <td class="space"></td>
                          <td class="space"></td>
                          <td></td>
                        </tr>
                      `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
        )
        .join('')}
    `;
    openPrintWindow('Lista física de contagem', html);
  }

  function generatePdfRecontagem() {
    const html = `
      <h1>Lista de recontagem</h1>
      <div class="meta">Campanha: ${campanhaAtual.nome} | Emitido em: ${new Date().toLocaleString('pt-BR')}</div>
      ${ALMOXARIFADOS.map((almox) => {
        const itens = divergencias.filter((item) => item.almoxarifadoId === almox.id);
        if (!itens.length) return '';
        return `
          <div class="sheet">
            <h2>${almox.nome}</h2>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Saldo teórico</th>
                  <th>Diferença atual</th>
                  <th>Classificação</th>
                  <th>Nova contagem</th>
                </tr>
              </thead>
              <tbody>
                ${itens
                  .map(
                    (item) => `
                      <tr>
                        <td>${item.codigoItem}</td>
                        <td>${item.descricaoItem}</td>
                        <td>${formatNumber(item.saldoTeorico)}</td>
                        <td>${formatNumber(item.diferencaAtual)}</td>
                        <td>${item.classificacaoAtual}</td>
                        <td class="space"></td>
                      </tr>
                    `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    `;
    openPrintWindow('Lista de recontagem', html);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">PWA</span>
          <div>
            <strong>Inventário Materiais</strong>
            <small>V2 operacional + gerencial</small>
          </div>
        </div>

        <nav className="nav-list">
          {tabs.map((tab) => (
            <button key={tab.id} className={activeTab === tab.id ? 'nav-btn active' : 'nav-btn'} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <label className="secondary-btn file-btn">
            Importar planilha
            <input type="file" accept=".xlsx,.xls,.ods,.csv" onChange={handleImportFile} />
          </label>
          <button className="secondary-btn" onClick={exportSnapshot}>Exportar backup</button>
          <button className="danger-btn" onClick={resetAll}>Resetar dados</button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{campanhaAtual.nome}</h1>
            <p>{campanhaAtual.descricao}</p>
          </div>
          <div className="topbar-info">
            <span className="pill">Status: {campanhaAtual.status}</span>
            <span className="pill">Ano: {campanhaAtual.ano}</span>
            <span className="pill">Progresso: {dashboard.progresso}%</span>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <>
            <SectionTitle title="Painel geral" description="Indicadores principais do inventário, com foco operacional e gerencial." />
            <section className="metrics-grid">
              <Card title="Total de itens" value={dashboard.totalItens} subtitle="Base completa da campanha" />
              <Card title="Itens com saldo > 0" value={dashboard.itensAtivos} subtitle="Elegíveis à contagem física" />
              <Card title="Itens contados" value={dashboard.contados} subtitle={`Pendentes: ${dashboard.pendentes}`} />
              <Card title="Divergências" value={dashboard.divergencias} subtitle={`Críticas: ${dashboard.criticas}`} />
              <Card title="Recontagens" value={dashboard.recontagens} subtitle="2ª e 3ª contagens abertas" />
              <Card title="Tarefas" value={dashboard.tarefasConcluidas} subtitle={`Em execução: ${dashboard.tarefasEmExecucao}`} />
            </section>

            <section className="dashboard-grid">
              <div className="card">
                <SectionTitle title="Resumo por almoxarifado" description="Avanço, divergências e necessidade de recontagem." />
                <table>
                  <thead>
                    <tr>
                      <th>Almoxarifado</th>
                      <th>Itens</th>
                      <th>Avanço</th>
                      <th>Divergências</th>
                      <th>PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ALMOXARIFADOS.map((almox) => {
                      const itens = itensComStatus.filter((item) => item.almoxarifadoId === almox.id);
                      const contados = itens.filter((item) => item.statusContagem === 'Contado').length;
                      const diverg = itens.filter((item) => ['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual)).length;
                      return (
                        <tr key={almox.id}>
                          <td>{almox.nome}</td>
                          <td>{itens.length}</td>
                          <td><ProgressBar value={contados} total={itens.length} /></td>
                          <td>{diverg}</td>
                          <td><button className="secondary-btn" onClick={() => { setPrintOptions((prev) => ({ ...prev, almoxarifadoId: almox.id })); generatePdfListaFisica(); }}>Lista</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <SectionTitle title="Desempenho por equipe" description="Tarefas, recontagens e cobertura dos almoxarifados." />
                <table>
                  <thead>
                    <tr>
                      <th>Equipe</th>
                      <th>Tarefas</th>
                      <th>Recontagens</th>
                      <th>Almox distintos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.equipes.map((equipe) => {
                      const tarefas = state.tarefas.filter((tarefa) => tarefa.equipeId === equipe.id);
                      const almoxSet = new Set(tarefas.map((tarefa) => tarefa.almoxarifadoId));
                      return (
                        <tr key={equipe.id}>
                          <td>{equipe.nome}</td>
                          <td>{tarefas.length}</td>
                          <td>{tarefas.filter((item) => item.tipoContagem !== '1ª contagem').length}</td>
                          <td>{almoxSet.size}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="card full-span">
                <SectionTitle title="Pendências para gestão" description="Itens críticos e tarefas já prontas para nova rodada." />
                <div className="stack-list">
                  {divergencias.slice(0, 8).map((item) => (
                    <div key={item.id} className="stack-item compact-item">
                      <div>
                        <strong>{item.codigoItem}</strong> — {item.descricaoItem}
                        <div className="muted-text">{getAlmoxName(item.almoxarifadoId)} | diferença: {item.diferencaAtual} | {item.classificacaoAtual}</div>
                      </div>
                      <button className="primary-btn" onClick={() => generateRecountForItem(item.id)}>Gerar recontagem</button>
                    </div>
                  ))}
                  {!divergencias.length && <div className="empty-state">Nenhuma divergência no momento.</div>}
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'campanhas' && (
          <div className="card">
            <SectionTitle title="Campanha atual" description="Nesta versão a campanha é única, com foco em testar o processo completo." />
            <div className="details-grid">
              <div><strong>Nome:</strong> {campanhaAtual.nome}</div>
              <div><strong>Ano:</strong> {campanhaAtual.ano}</div>
              <div><strong>Status:</strong> {campanhaAtual.status}</div>
              <div><strong>Abertura:</strong> {campanhaAtual.dataAbertura}</div>
              <div><strong>Encerramento previsto:</strong> {campanhaAtual.dataEncerramentoPrevista}</div>
              <div><strong>Total de equipes:</strong> {state.equipes.length}</div>
            </div>
          </div>
        )}

        {activeTab === 'equipes' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle
                title={teamForm.id ? 'Editar equipe' : 'Cadastrar equipe'}
                description="Duplas, trios ou equipes móveis. Integrantes: um por linha, no formato Nome | Matrícula | Função."
                action={teamForm.id ? <button className="secondary-btn" onClick={resetTeamForm}>Cancelar edição</button> : null}
              />
              <form className="form-grid" onSubmit={handleCreateOrUpdateTeam}>
                <label>
                  Nome da equipe
                  <input value={teamForm.nome} onChange={(e) => setTeamForm((prev) => ({ ...prev, nome: e.target.value }))} required />
                </label>
                <label>
                  Responsável
                  <input value={teamForm.responsavel} onChange={(e) => setTeamForm((prev) => ({ ...prev, responsavel: e.target.value }))} required />
                </label>
                <label className="full-width">
                  Observações
                  <input value={teamForm.observacoes} onChange={(e) => setTeamForm((prev) => ({ ...prev, observacoes: e.target.value }))} />
                </label>
                <label className="full-width">
                  Integrantes
                  <textarea rows="7" value={teamForm.integrantesTexto} onChange={(e) => setTeamForm((prev) => ({ ...prev, integrantesTexto: e.target.value }))} placeholder="Fulano | MAT001 | Contador" />
                </label>
                <button className="primary-btn full-width" type="submit">{teamForm.id ? 'Atualizar equipe' : 'Salvar equipe'}</button>
              </form>
            </div>

            <div className="card">
              <SectionTitle title="Equipes cadastradas" description="Agora com edição e ativação/inativação no app." />
              <div className="stack-list">
                {state.equipes.map((equipe) => (
                  <div key={equipe.id} className="stack-item">
                    <div className="stack-item-header">
                      <strong>{equipe.nome}</strong>
                      <span className="pill">{equipe.ativa ? 'Ativa' : 'Inativa'}</span>
                    </div>
                    <p><strong>Responsável:</strong> {equipe.responsavel}</p>
                    <p><strong>Observações:</strong> {equipe.observacoes || '-'}</p>
                    <p><strong>Integrantes:</strong></p>
                    <ul>
                      {equipe.integrantes.map((integrante) => (
                        <li key={integrante.id}>{integrante.nome} — {integrante.matriculaLogin || 'sem matrícula'} — {integrante.funcao}</li>
                      ))}
                    </ul>
                    <div className="actions-cell top-gap">
                      <button className="secondary-btn" onClick={() => editTeam(equipe)}>Editar</button>
                      <button className="secondary-btn" onClick={() => toggleTeamActive(equipe.id)}>{equipe.ativa ? 'Inativar' : 'Ativar'}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'itens' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Importação da base" description="Aceita .xlsx, .ods e .csv. Prioriza a aba Planilha1; se não existir, usa a primeira aba." />
              <div className="stack-list">
                <label className="primary-btn file-btn wide-btn">
                  Selecionar planilha
                  <input type="file" accept=".xlsx,.xls,.ods,.csv" onChange={handleImportFile} />
                </label>
                {importInfo ? (
                  <div className="stack-item">
                    <strong>Última importação</strong>
                    <p><strong>Arquivo:</strong> {importInfo.arquivo}</p>
                    <p><strong>Itens carregados:</strong> {importInfo.total}</p>
                    <p><strong>Modo detectado:</strong> {importInfo.modo}</p>
                  </div>
                ) : (
                  <div className="empty-state">Ainda não houve importação nesta sessão local.</div>
                )}
              </div>
            </div>

            <div className="card">
              <SectionTitle title="Base de itens" description="Filtros operacionais, busca e ocultação dos zerados." />
              <div className="filter-row">
                <label>
                  Almoxarifado
                  <select value={almoxFilter} onChange={(e) => setAlmoxFilter(e.target.value)}>
                    <option value="todos">Todos</option>
                    {ALMOXARIFADOS.map((almox) => <option key={almox.id} value={almox.id}>{almox.nome}</option>)}
                  </select>
                </label>
                <label>
                  Situação
                  <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
                    <option value="todos">Todos</option>
                    <option value="pendentes">Pendentes</option>
                    <option value="contados">Contados</option>
                    <option value="divergentes">Somente divergentes</option>
                  </select>
                </label>
                <label>
                  Busca
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Código ou descrição" />
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={showZeroItems} onChange={(e) => setShowZeroItems(e.target.checked)} />
                  Mostrar itens zerados
                </label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descrição</th>
                      <th>Almoxarifado</th>
                      <th>Saldo</th>
                      <th>Status</th>
                      <th>Classificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.codigoItem}</td>
                        <td>{item.descricaoItem}</td>
                        <td>{getAlmoxName(item.almoxarifadoId)}</td>
                        <td>{formatNumber(item.saldoTeorico)}</td>
                        <td>{item.statusContagem}</td>
                        <td><span className={statusClassName(item.classificacaoAtual)}>{item.classificacaoAtual}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'tarefas' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Criar tarefa real" description="Com escopo por almoxarifado, divergentes, pendentes ou seleção manual." />
              <form className="form-grid" onSubmit={handleCreateTask}>
                <label>
                  Título da tarefa
                  <input value={taskForm.titulo} onChange={(e) => setTaskForm((prev) => ({ ...prev, titulo: e.target.value }))} placeholder="Ex.: Recontagem Infra lote A" />
                </label>
                <label>
                  Almoxarifado
                  <select value={taskForm.almoxarifadoId} onChange={(e) => setTaskForm((prev) => ({ ...prev, almoxarifadoId: e.target.value }))}>
                    {ALMOXARIFADOS.map((almox) => <option key={almox.id} value={almox.id}>{almox.nome}</option>)}
                  </select>
                </label>
                <label>
                  Equipe
                  <select value={taskForm.equipeId} onChange={(e) => setTaskForm((prev) => ({ ...prev, equipeId: e.target.value }))}>
                    {state.equipes.filter((item) => item.ativa).map((equipe) => <option key={equipe.id} value={equipe.id}>{equipe.nome}</option>)}
                  </select>
                </label>
                <label>
                  Tipo de contagem
                  <select value={taskForm.tipoContagem} onChange={(e) => setTaskForm((prev) => ({ ...prev, tipoContagem: e.target.value }))}>
                    <option>1ª contagem</option>
                    <option>2ª contagem</option>
                    <option>3ª contagem</option>
                  </select>
                </label>
                <label>
                  Escopo
                  <select value={taskForm.scope} onChange={(e) => setTaskForm((prev) => ({ ...prev, scope: e.target.value }))}>
                    {TASK_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="full-width">
                  Observação
                  <input value={taskForm.observacao} onChange={(e) => setTaskForm((prev) => ({ ...prev, observacao: e.target.value }))} />
                </label>
                {taskForm.scope === 'selecaoManual' && (
                  <div className="full-width selector-box">
                    <strong>Itens selecionados manualmente</strong>
                    <div className="manual-list">
                      {itensManualSelection.map((item) => (
                        <label key={item.id} className="checkbox-row compact-check">
                          <input
                            type="checkbox"
                            checked={selectedItemIds.includes(item.id)}
                            onChange={(e) => setSelectedItemIds((prev) => (e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)))}
                          />
                          {item.codigoItem} — {item.descricaoItem}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="full-width helper-box">
                  Itens previstos para a tarefa: <strong>{getCandidateItemsForTask().length}</strong>
                </div>
                <button className="primary-btn full-width" type="submit">Criar tarefa</button>
              </form>
            </div>

            <div className="card">
              <SectionTitle title="Registrar contagem" description="Registro item a item dentro do escopo da tarefa selecionada." />
              <form className="form-grid" onSubmit={handleRegisterCount}>
                <label>
                  Tarefa
                  <select value={countForm.tarefaId} onChange={(e) => setCountForm((prev) => ({ ...prev, tarefaId: e.target.value }))}>
                    {state.tarefas.map((tarefa) => (
                      <option key={tarefa.id} value={tarefa.id}>
                        {tarefa.titulo || tarefa.tipoContagem} - {getAlmoxName(tarefa.almoxarifadoId)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Item
                  <select value={countForm.itemId} onChange={(e) => setCountForm((prev) => ({ ...prev, itemId: e.target.value }))}>
                    {itemsForCurrentTask.map((item) => (
                      <option key={item.id} value={item.id}>{item.codigoItem} - {item.descricaoItem}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantidade contada
                  <input type="number" min="0" value={countForm.quantidadeContada} onChange={(e) => setCountForm((prev) => ({ ...prev, quantidadeContada: e.target.value }))} required />
                </label>
                <label>
                  Usuário
                  <input value={countForm.usuarioRegistro} onChange={(e) => setCountForm((prev) => ({ ...prev, usuarioRegistro: e.target.value }))} required />
                </label>
                <label className="full-width">
                  Observação
                  <input value={countForm.observacao} onChange={(e) => setCountForm((prev) => ({ ...prev, observacao: e.target.value }))} />
                </label>
                <button className="primary-btn full-width" type="submit">Registrar contagem</button>
              </form>
            </div>

            <div className="card full-span">
              <SectionTitle title="Tarefas criadas" description="Agora com contagem de itens por tarefa e alerta de equipe repetida em recontagem." />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Tipo</th>
                      <th>Almoxarifado</th>
                      <th>Equipe</th>
                      <th>Itens</th>
                      <th>Status</th>
                      <th>Alerta</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.tarefas.map((tarefa) => {
                      const relatedRecords = state.registros.filter((registro) => registro.tarefaId === tarefa.id);
                      const repeatedTeamWarning = tarefa.tipoContagem !== '1ª contagem' && state.registros.some((registro) => {
                        const previousTask = taskById[registro.tarefaId];
                        return previousTask && previousTask.equipeId === tarefa.equipeId && (tarefa.itemIds || []).includes(registro.itemId);
                      });
                      return (
                        <tr key={tarefa.id}>
                          <td>{tarefa.titulo || tarefa.tipoContagem}</td>
                          <td>{tarefa.tipoContagem}</td>
                          <td>{getAlmoxName(tarefa.almoxarifadoId)}</td>
                          <td>{state.equipes.find((equipe) => equipe.id === tarefa.equipeId)?.nome}</td>
                          <td>{tarefa.itemIds?.length || 0} itens / {relatedRecords.length} registros</td>
                          <td>{tarefa.status}</td>
                          <td>{repeatedTeamWarning ? 'Mesma equipe já contou algum item' : '-'}</td>
                          <td className="actions-cell">
                            <button className="secondary-btn" onClick={() => startTask(tarefa.id)}>Iniciar</button>
                            <button className="secondary-btn" onClick={() => concludeTask(tarefa.id)}>Concluir</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'divergencias' && (
          <div className="card">
            <SectionTitle title="Divergências e recontagem" description="Criação de recontagem por item ou por almoxarifado inteiro." />
            <div className="actions-cell bottom-gap">
              {ALMOXARIFADOS.map((almox) => (
                <button key={almox.id} className="secondary-btn" onClick={() => generateRecountByAlmox(almox.id)}>Recontar {almox.codigoReduzido}</button>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Almoxarifado</th>
                    <th>Diferença</th>
                    <th>Classificação</th>
                    <th>Último registro</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {divergencias.map((item) => (
                    <tr key={item.id}>
                      <td>{item.codigoItem}</td>
                      <td>{item.descricaoItem}</td>
                      <td>{getAlmoxName(item.almoxarifadoId)}</td>
                      <td>{item.diferencaAtual}</td>
                      <td><span className={statusClassName(item.classificacaoAtual)}>{item.classificacaoAtual}</span></td>
                      <td>{formatDateTime(item.ultimoRegistro?.dataHoraRegistro)}</td>
                      <td><button className="primary-btn" onClick={() => generateRecountForItem(item.id)}>Gerar recontagem</button></td>
                    </tr>
                  ))}
                  {!divergencias.length && (
                    <tr>
                      <td colSpan="7" className="empty-state">Nenhuma divergência aberta.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'relatorios' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Emissão da lista física" description="Gera janela de impressão para salvar em PDF no navegador." />
              <div className="form-grid">
                <label>
                  Almoxarifado
                  <select value={printOptions.almoxarifadoId} onChange={(e) => setPrintOptions((prev) => ({ ...prev, almoxarifadoId: e.target.value }))}>
                    <option value="todos">Todos</option>
                    {ALMOXARIFADOS.map((almox) => <option key={almox.id} value={almox.id}>{almox.nome}</option>)}
                  </select>
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={printOptions.incluirZerados} onChange={(e) => setPrintOptions((prev) => ({ ...prev, incluirZerados: e.target.checked }))} />
                  Incluir zerados
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={printOptions.somenteDivergentes} onChange={(e) => setPrintOptions((prev) => ({ ...prev, somenteDivergentes: e.target.checked }))} />
                  Somente divergentes
                </label>
                <button className="primary-btn full-width" onClick={generatePdfListaFisica}>Gerar PDF da lista física</button>
              </div>
            </div>

            <div className="card">
              <SectionTitle title="Emissão da recontagem" description="Gera PDF apenas dos itens divergentes." />
              <div className="stack-list">
                <div className="helper-box">Itens divergentes atuais: <strong>{divergencias.length}</strong></div>
                <button className="primary-btn" onClick={generatePdfRecontagem}>Gerar PDF da recontagem</button>
                <div className="small-note">O navegador abrirá a visualização de impressão, onde tu pode salvar em PDF.</div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
