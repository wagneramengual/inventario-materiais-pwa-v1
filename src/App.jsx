import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ALMOXARIFADOS, INITIAL_STATE } from './data/seed';

const STORAGE_KEY = 'inventario-materiais-pwa-v46';

const EMPTY_STATE = {
  ...structuredClone(INITIAL_STATE),
  equipes: [],
  itens: [],
  tarefas: [],
  registros: [],
  analises: []
};

const tabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'itens', label: 'Itens / Importação' },
  { id: 'equipes', label: 'Equipes' },
  { id: 'planejamento', label: 'Planejamento' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'contagem', label: 'Registrar contagem' },
  { id: 'divergencias', label: 'Validação / Recontagem' },
  { id: 'relatorios', label: 'PDF / Relatórios' }
];

const COUNT_TYPES = ['1ª contagem', '2ª contagem', '3ª contagem', 'Recontagem'];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return EMPTY_STATE;

    return {
      ...EMPTY_STATE,
      ...saved,
      configuracoes: {
        ...EMPTY_STATE.configuracoes,
        ...(saved.configuracoes || {})
      },
      campanhas: saved.campanhas || EMPTY_STATE.campanhas,
      equipes: saved.equipes || EMPTY_STATE.equipes,
      itens: saved.itens || EMPTY_STATE.itens,
      tarefas: saved.tarefas || EMPTY_STATE.tarefas,
      registros: saved.registros || EMPTY_STATE.registros,
      analises: saved.analises || EMPTY_STATE.analises
    };
  } catch {
    return EMPTY_STATE;
  }
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function findHeader(row, candidates) {
  const normalizedRow = row.map((cell) => normalizeText(cell));
  return candidates.find((candidate) => normalizedRow.includes(normalizeText(candidate)));
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function formatCode(value) {
  const digits = String(value || '').replace(/\D/g, '').padStart(14, '0').slice(-14);
  return `${digits.slice(0, 4)}.${digits.slice(4, 8)}.${digits.slice(8, 14)}`;
}

function buildMembersText(integrantes = []) {
  return integrantes.map((item) => [item.nome, item.matriculaLogin, item.funcao].filter(Boolean).join(' | ')).join('\n');
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

function buildMembersFromShortFields(teamForm) {
  return [teamForm.integrante1, teamForm.integrante2, teamForm.integrante3, teamForm.integrante4]
    .map((nome) => String(nome || '').trim())
    .filter(Boolean)
    .map((nome) => ({ id: uid('int'), nome, matriculaLogin: '', funcao: 'Contador' }));
}

function mapTeamToForm(equipe) {
  const nomes = (equipe.integrantes || []).map((item) => item.nome || '');
  return {
    id: equipe.id,
    nome: equipe.nome,
    observacoes: equipe.observacoes || '',
    integrante1: nomes[0] || '',
    integrante2: nomes[1] || '',
    integrante3: nomes[2] || '',
    integrante4: nomes[3] || ''
  };
}

function getAlmoxName(almoxId) {
  return ALMOXARIFADOS.find((item) => item.id === almoxId)?.nome || '-';
}

function getAlmoxIdByCode(code) {
  const normalized = String(code || '').trim();
  const digits = normalized.replace(/\D/g, '');
  const reduced = digits.slice(-3);
  const formatted = digits.length >= 12 ? `30.01.001.${reduced}` : normalized;
  return ALMOXARIFADOS.find((almox) => almox.codigoCompleto === formatted || almox.codigoReduzido === reduced)?.id || '';
}

function classifyDifference(diferenca, saldoTeorico, config) {
  const diff = Number(diferenca || 0);
  if (diff === 0) return 'Sem diferença';
  const absOk = Math.abs(diff) <= Number(config?.desvioAceitavelUnidades || 0);
  const referencia = Math.max(Number(saldoTeorico || 0), 1);
  const percent = (Math.abs(diff) / referencia) * 100;
  const percOk = percent <= Number(config?.desvioAceitavelPercentual || 0);
  return absOk || percOk ? 'Diferença admissível' : 'Diferença crítica';
}

function statusClassName(value) {
  const normalized = String(value || 'sem-registro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `status-badge ${normalized}`;
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
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(percent, 100)}%` }} /></div>
      <small>{percent}%</small>
    </div>
  );
}

function parseImportedRows(rows, campaignId) {
  if (!rows?.length) return [];
  const cleanedRows = rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  let headerIndex = cleanedRows.findIndex((row) => findHeader(row, ['Item Material', 'Item']) && findHeader(row, ['Almoxarifado', 'Local']));
  if (headerIndex < 0) headerIndex = 0;
  const header = cleanedRows[headerIndex].map((cell) => String(cell ?? '').trim());
  const dataRows = cleanedRows.slice(headerIndex + 1);
  const headerMap = Object.fromEntries(header.map((item, index) => [normalizeText(item), index]));
  const col = (names) => names.map((name) => headerMap[normalizeText(name)]).find((index) => index !== undefined);
  const idxCodigo = col(['Item Material', 'Item']);
  const idxDescricao = col(['Nome Específico (Nome)', 'Nome Item', 'Nome']);
  const idxAlmox = col(['Almoxarifado', 'Local']);
  const idxSaldo = col(['Saldo Disponível', 'Disponível', 'Saldo']);
  const idxUnidade = col(['Unidade', 'UM']);

  const items = dataRows.map((row) => {
    const codigo = formatCode(row[idxCodigo]);
    const descricao = String(row[idxDescricao] ?? '').trim();
    const almoxarifadoId = getAlmoxIdByCode(row[idxAlmox]);
    const saldoTeorico = Number(row[idxSaldo] ?? 0) || 0;
    if (!descricao || !almoxarifadoId) return null;
    return {
      id: uid('item'),
      campanhaId: campaignId,
      almoxarifadoId,
      codigoItem: codigo,
      descricaoItem: descricao,
      saldoTeorico,
      unidade: String(row[idxUnidade] ?? 'Un').trim() || 'Un',
      observacao: '',
      zerado: saldoTeorico === 0
    };
  }).filter(Boolean);

  return Array.from(new Map(items.map((item) => [`${item.almoxarifadoId}-${item.codigoItem}`, item])).values());
}

function openPrintWindow(title, htmlContent) {
  const popup = window.open('', '_blank', 'width=960,height=900');
  if (!popup) return;
  popup.document.write(`
    <html lang="pt-BR">
      <head>
        <title>${title}</title>
        <style>
          @page { margin: 16mm 10mm 18mm; }
          body { font-family: Arial, sans-serif; padding: 18px 22px 78px; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          h1,h2,h3 { margin: 0 0 10px; }
          .sheet { margin-bottom: 28px; page-break-inside: avoid; }
          .sheet:last-of-type { margin-bottom: 72px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; font-size: 11px; }
          th { background: #eff6ff; }
          tbody tr:nth-child(even) td { background: #f1f5f9 !important; }
          tbody tr:nth-child(odd) td { background: #ffffff !important; }
          .num { text-align: center; }
          .space { height: 24px; }
          .signature-block { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
          .signature-line { border-top: 1px solid #111827; padding-top: 6px; font-size: 11px; min-height: 24px; }
          .footer-meta { position: fixed; left: 22px; right: 22px; bottom: 8px; font-size: 11px; color: #475569; display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid #cbd5e1; padding-top: 6px; background: #fff; }
          @media print {
            body { padding-bottom: 80px; }
          }
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
  const [state, setState] = useState(EMPTY_STATE);
  const [showZeroItems, setShowZeroItems] = useState(false);
  const [almoxFilter, setAlmoxFilter] = useState('todos');
  const [itemFilter, setItemFilter] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [selectedRecountItemIds, setSelectedRecountItemIds] = useState([]);
  const [countDrafts, setCountDrafts] = useState({});
  const [currentTaskId, setCurrentTaskId] = useState('');
  const [teamForm, setTeamForm] = useState({ id: '', nome: '', observacoes: '', integrante1: '', integrante2: '', integrante3: '', integrante4: '' });
  const [taskForm, setTaskForm] = useState({
    titulo: '',
    almoxarifadoId: 'almox-001',
    equipeId: 'eq-1',
    tipoContagem: '1ª contagem',
    observacao: '',
    scope: 'somentePendentes',
    equipeModo: 'fixa',
    integrantesMistos: []
  });
  const [planningForm, setPlanningForm] = useState({
    almoxarifadoId: 'almox-001',
    includeZeroItems: false,
    selectedTeamIds: []
  });
  const [printOptions, setPrintOptions] = useState({ tarefaId: 'todas', incluirZerados: false, somenteDivergentes: false, mostrarSaldoTeorico: true });
  const [importInfo, setImportInfo] = useState(null);
  const [validationFilter, setValidationFilter] = useState('todas');

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const campanhaAtual = state.campanhas[0];

  const allMembers = useMemo(() => state.equipes.flatMap((equipe) => equipe.integrantes.map((integrante) => ({ ...integrante, equipeId: equipe.id, equipeNome: equipe.nome }))), [state.equipes]);
  const teamsById = useMemo(() => Object.fromEntries(state.equipes.map((equipe) => [equipe.id, equipe])), [state.equipes]);
  const tasksById = useMemo(() => Object.fromEntries(state.tarefas.map((tarefa) => [tarefa.id, tarefa])), [state.tarefas]);

  const openTasksForCounting = useMemo(
    () => state.tarefas.filter((tarefa) => !['Concluída', 'Cancelada', 'Validada', 'Validada com ressalvas'].includes(tarefa.status)),
    [state.tarefas]
  );

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

  const analisesByItem = useMemo(() => Object.fromEntries(state.analises.map((analise) => [analise.itemId, analise])), [state.analises]);

  const itensComStatus = useMemo(() => state.itens.map((item) => {
    const registros = registrosPorItem.get(item.id) || [];
    const ultimoRegistro = registros[registros.length - 1];
    const analise = analisesByItem[item.id];
    return {
      ...item,
      codigoItem: formatCode(item.codigoItem),
      ultimoRegistro,
      statusContagem: ultimoRegistro ? 'Contado' : 'Pendente',
      diferencaAtual: ultimoRegistro?.diferenca ?? null,
      classificacaoAtual: ultimoRegistro?.classificacao || 'Sem registro',
      ultimaTarefa: ultimoRegistro ? tasksById[ultimoRegistro.tarefaId] : null,
      situacaoValidacao: analise?.situacaoDocumental || 'Pendente de verificação'
    };
  }), [state.itens, registrosPorItem, tasksById, analisesByItem]);

  const divergencias = useMemo(
    () =>
      itensComStatus.filter(
        (item) =>
          ['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual) &&
          !['Validado', 'Em recontagem'].includes(item.situacaoValidacao)
      ),
    [itensComStatus]
  );

  const filteredDivergencias = useMemo(() => {
    if (validationFilter === 'todas') return divergencias;
    if (validationFilter === 'criticas') return divergencias.filter((item) => item.classificacaoAtual === 'Diferença crítica');
    if (validationFilter === 'admissiveis') return divergencias.filter((item) => item.classificacaoAtual === 'Diferença admissível');
    return divergencias;
  }, [divergencias, validationFilter]);

  const dashboard = useMemo(() => {
    const totalItens = state.itens.length;
    const itensZerados = state.itens.filter((item) => item.zerado).length;
    const contados = itensComStatus.filter((item) => item.statusContagem === 'Contado').length;
    const tarefasAbertas = state.tarefas.filter((tarefa) => !['Concluída', 'Cancelada'].includes(tarefa.status)).length;
    return {
      totalItens,
      itensZerados,
      itensAtivos: totalItens - itensZerados,
      contados,
      pendentes: totalItens - contados,
      divergencias: divergencias.length,
      criticas: divergencias.filter((item) => item.classificacaoAtual === 'Diferença crítica').length,
      tarefasAbertas,
      tarefasConcluidas: state.tarefas.filter((t) => t.status === 'Concluída').length,
      progresso: totalItens ? Math.round((contados / totalItens) * 100) : 0
    };
  }, [state.itens, state.tarefas, itensComStatus, divergencias]);

  const selectedTask = useMemo(
    () => openTasksForCounting.find((tarefa) => tarefa.id === currentTaskId) || openTasksForCounting[0] || null,
    [openTasksForCounting, currentTaskId]
  );

  useEffect(() => {
    if (!currentTaskId && openTasksForCounting[0]) setCurrentTaskId(openTasksForCounting[0].id);
    if (currentTaskId && !openTasksForCounting.some((tarefa) => tarefa.id === currentTaskId)) {
      setCurrentTaskId(openTasksForCounting[0]?.id || '');
    }
  }, [openTasksForCounting, currentTaskId]);

  const taskItems = useMemo(() => {
    if (!selectedTask) return [];
    return itensComStatus.filter((item) => selectedTask.itemIds?.includes(item.id));
  }, [selectedTask, itensComStatus]);

  function updateState(updater) {
    setState((prev) => updater(prev));
  }

  function resetTeamForm() {
    setTeamForm({ id: '', nome: '', observacoes: '', integrante1: '', integrante2: '', integrante3: '', integrante4: '' });
  }

  function handleCreateOrUpdateTeam(event) {
    event.preventDefault();
    const integrantes = buildMembersFromShortFields(teamForm);
    if (!integrantes.length) {
      alert('Informa ao menos um integrante da equipe.');
      return;
    }
    const payload = {
      id: teamForm.id || uid('eq'),
      nome: teamForm.nome,
      observacoes: teamForm.observacoes,
      ativa: true,
      integrantes
    };
    updateState((prev) => ({
      ...prev,
      equipes: teamForm.id ? prev.equipes.map((equipe) => (equipe.id === teamForm.id ? { ...equipe, ...payload } : equipe)) : [...prev.equipes, payload]
    }));
    resetTeamForm();
  }

  function editTeam(equipe) {
    setTeamForm(mapTeamToForm(equipe));
    setActiveTab('equipes');
  }

  function toggleTeamActive(teamId) {
    updateState((prev) => ({
      ...prev,
      equipes: prev.equipes.map((equipe) => (equipe.id === teamId ? { ...equipe, ativa: !equipe.ativa } : equipe))
    }));
  }

  function toggleMixedMember(memberId) {
    setTaskForm((prev) => ({
      ...prev,
      integrantesMistos: prev.integrantesMistos.includes(memberId)
        ? prev.integrantesMistos.filter((id) => id !== memberId)
        : [...prev.integrantesMistos, memberId]
    }));
  }

  function activeItemIdsInOpenTasks(almoxarifadoId) {
    return new Set(
      state.tarefas
        .filter((tarefa) => tarefa.almoxarifadoId === almoxarifadoId && !['Concluída', 'Cancelada', 'Validada', 'Validada com ressalvas'].includes(tarefa.status))
        .flatMap((tarefa) => tarefa.itemIds || [])
    );
  }

  function openTaskTeamIds() {
    return new Set(
      state.tarefas
        .filter((tarefa) => !['Concluída', 'Cancelada', 'Validada', 'Validada com ressalvas'].includes(tarefa.status) && tarefa.equipeId)
        .map((tarefa) => tarefa.equipeId)
    );
  }

  function splitItemsEqually(items, teamCount) {
    if (!teamCount) return [];
    const base = Math.floor(items.length / teamCount);
    const remainder = items.length % teamCount;
    const lots = [];
    let start = 0;
    for (let index = 0; index < teamCount; index += 1) {
      const size = base + (index < remainder ? 1 : 0);
      lots.push(items.slice(start, start + size));
      start += size;
    }
    return lots.filter((lot) => lot.length);
  }

  const availableItemsForTask = useMemo(() => {
    const base = itensComStatus.filter((item) => item.almoxarifadoId === taskForm.almoxarifadoId);
    const blocked = activeItemIdsInOpenTasks(taskForm.almoxarifadoId);

    if (taskForm.tipoContagem === 'Recontagem') {
      const idsSelecionados = selectedRecountItemIds.length ? selectedRecountItemIds : selectedItemIds;
      return base.filter((item) => idsSelecionados.includes(item.id));
    }

    let available = base.filter((item) => !blocked.has(item.id));
    if (taskForm.scope === 'somentePendentes') {
      available = available.filter((item) => item.statusContagem === 'Pendente');
    }
    if (taskForm.scope === 'selecaoManual') {
      available = available.filter((item) => selectedItemIds.includes(item.id));
    }
    return available;
  }, [itensComStatus, taskForm, selectedItemIds, selectedRecountItemIds, state.tarefas]);

  useEffect(() => {
    if (taskForm.tipoContagem === 'Recontagem') return;
    setSelectedItemIds([]);
  }, [taskForm.almoxarifadoId, taskForm.scope, taskForm.tipoContagem]);

  const activeTeamsInOpenTasks = useMemo(() => openTaskTeamIds(), [state.tarefas]);

  const planningEligibleTeams = useMemo(
    () => state.equipes.filter((equipe) => equipe.ativa && !activeTeamsInOpenTasks.has(equipe.id)),
    [state.equipes, activeTeamsInOpenTasks]
  );

  const manualEligibleTeams = useMemo(() => (
    state.equipes.filter((equipe) => {
      if (!equipe.ativa) return false;
      if (taskForm.tipoContagem === '1ª contagem') {
        return !activeTeamsInOpenTasks.has(equipe.id) || equipe.id === taskForm.equipeId;
      }
      return true;
    })
  ), [state.equipes, taskForm.tipoContagem, taskForm.equipeId, activeTeamsInOpenTasks]);


  useEffect(() => {
    if (taskForm.equipeModo !== 'fixa') return;
    if (manualEligibleTeams.some((equipe) => equipe.id === taskForm.equipeId)) return;

    setTaskForm((prev) => ({
      ...prev,
      equipeId: manualEligibleTeams[0]?.id || ''
    }));
  }, [manualEligibleTeams, taskForm.equipeId, taskForm.equipeModo]);

  const planningAvailableItems = useMemo(() => {
    const blocked = activeItemIdsInOpenTasks(planningForm.almoxarifadoId);
    return itensComStatus
      .filter((item) => item.almoxarifadoId === planningForm.almoxarifadoId)
      .filter((item) => (planningForm.includeZeroItems ? true : !item.zerado))
      .filter((item) => item.statusContagem === 'Pendente')
      .filter((item) => !blocked.has(item.id))
      .sort((a, b) => a.codigoItem.localeCompare(b.codigoItem));
  }, [itensComStatus, planningForm]);

  const planningPreviewLots = useMemo(() => {
    const teams = planningForm.selectedTeamIds
      .map((teamId) => teamsById[teamId])
      .filter(Boolean);
    const lots = splitItemsEqually(planningAvailableItems, teams.length);
    return teams.map((team, index) => ({
      team,
      items: lots[index] || []
    }));
  }, [planningForm.selectedTeamIds, planningAvailableItems, teamsById]);


  function togglePlanningTeam(teamId) {
    setPlanningForm((prev) => ({
      ...prev,
      selectedTeamIds: prev.selectedTeamIds.includes(teamId)
        ? prev.selectedTeamIds.filter((id) => id !== teamId)
        : [...prev.selectedTeamIds, teamId]
    }));
  }

  function generateTasksByPlanning() {
    const selectedTeams = planningForm.selectedTeamIds
      .map((teamId) => teamsById[teamId])
      .filter(Boolean);

    if (!selectedTeams.length) {
      alert('Seleciona ao menos uma equipe para o almoxarifado.');
      return;
    }

    if (selectedTeams.some((team) => activeTeamsInOpenTasks.has(team.id))) {
      alert('Há equipe selecionada que já possui lista ativa. Cada equipe pode assumir apenas uma lista por vez.');
      return;
    }

    if (!planningAvailableItems.length) {
      alert('Não há itens pendentes e disponíveis para esse almoxarifado.');
      return;
    }

    const lots = splitItemsEqually(planningAvailableItems, selectedTeams.length);
    const tarefasNovas = selectedTeams.map((team, index) => ({
      id: uid('tar'),
      campanhaId: campanhaAtual.id,
      almoxarifadoId: planningForm.almoxarifadoId,
      titulo: `1ª contagem - ${getAlmoxName(planningForm.almoxarifadoId)} - ${team.nome}`,
      tipoContagem: '1ª contagem',
      status: 'Pendente',
      dataInicio: '',
      dataFim: '',
      observacao: `Lote automático V4.5 gerado para ${team.nome}.`,
      itemIds: (lots[index] || []).map((item) => item.id),
      equipeId: team.id,
      equipeNome: team.nome,
      equipeTipo: 'fixa',
      equipeIntegrantes: team.integrantes.map((item) => item.nome)
    })).filter((tarefa) => tarefa.itemIds.length);

    if (!tarefasNovas.length) {
      alert('Não foi possível gerar lotes com os itens disponíveis.');
      return;
    }

    updateState((prev) => ({
      ...prev,
      tarefas: [...tarefasNovas, ...prev.tarefas]
    }));

    setPrintOptions((prev) => ({ ...prev, tarefaId: 'todas' }));
    setPlanningForm((prev) => ({ ...prev, selectedTeamIds: [] }));
    setActiveTab('tarefas');
  }

  function buildTaskTeamInfo() {
    if (taskForm.tipoContagem !== '1ª contagem' && taskForm.equipeModo === 'mista') {
      const members = allMembers.filter((member) => taskForm.integrantesMistos.includes(member.id));
      if (members.length < 2) {
        alert('Seleciona ao menos 2 integrantes para a equipe mista de recontagem.');
        return null;
      }
      return {
        equipeId: '',
        equipeNome: `Equipe mista (${members.length})`,
        equipeTipo: 'mista',
        equipeIntegrantes: members.map((item) => `${item.nome} (${item.equipeNome})`)
      };
    }
    const equipe = teamsById[taskForm.equipeId];
    if (!equipe) {
      alert('Seleciona uma equipe válida.');
      return null;
    }
    return {
      equipeId: equipe.id,
      equipeNome: equipe.nome,
      equipeTipo: 'fixa',
      equipeIntegrantes: equipe.integrantes.map((item) => item.nome)
    };
  }

function handleCreateTask(event) {
  event.preventDefault();
  const itemIds = availableItemsForTask.map((item) => item.id);

  if (!itemIds.length) {
    alert('Nenhum item disponível para esse recorte.');
    return;
  }

  const teamInfo = buildTaskTeamInfo();
  if (!teamInfo) return;

  if (taskForm.tipoContagem === '1ª contagem' && teamInfo.equipeId && activeTeamsInOpenTasks.has(teamInfo.equipeId)) {
    alert('Cada equipe pode assumir apenas uma lista ativa por vez.');
    return;
  }

  if (taskForm.tipoContagem !== '1ª contagem' && teamInfo.equipeId) {
    const invalid = itemIds.some((itemId) =>
      registrosPorItem.get(itemId)?.some(
        (registro) => tasksById[registro.tarefaId]?.equipeId === teamInfo.equipeId
      )
    );

    if (invalid) {
      alert('Recontagem deve ser feita por outra equipe. Escolhe outra equipe ou usa equipe mista.');
      return;
    }
  }

  const tarefa = {
    id: uid('tar'),
    campanhaId: campanhaAtual.id,
    almoxarifadoId: taskForm.almoxarifadoId,
    titulo: taskForm.titulo || `${taskForm.tipoContagem} - ${getAlmoxName(taskForm.almoxarifadoId)}`,
    tipoContagem: taskForm.tipoContagem,
    status: 'Pendente',
    dataInicio: '',
    dataFim: '',
    observacao: taskForm.observacao,
    itemIds,
    ...teamInfo
  };

  updateState((prev) => ({
    ...prev,
    tarefas: [tarefa, ...prev.tarefas]
  }));

  setTaskForm((prev) => ({
    ...prev,
    titulo: '',
    observacao: '',
    integrantesMistos: []
  }));

  setCurrentTaskId(tarefa.id);
  setSelectedRecountItemIds([]);
  setActiveTab('tarefas');
}

function updateTaskStatus(taskId, status) {
  updateState((prev) => ({
    ...prev,
    tarefas: prev.tarefas.map((tarefa) => {
      if (tarefa.id !== taskId) return tarefa;
      return {
        ...tarefa,
        status,
        dataInicio: status === 'Em execução' ? tarefa.dataInicio || new Date().toISOString() : tarefa.dataInicio,
        dataFim:
          status === 'Concluída'
            ? new Date().toISOString()
            : status === 'Cancelada'
              ? ''
              : tarefa.dataFim,
        dataValidacao: status === 'Concluída' ? new Date().toISOString() : tarefa.dataValidacao
      };
    })
  }));
}

function deleteTask(taskId) {
  const task = tasksById[taskId];
  if (!task) return;

  const hasRecords = state.registros.some((registro) => registro.tarefaId === taskId);

  if (hasRecords) {
    if (!window.confirm('Essa tarefa já possui registros. Deseja cancelar a tarefa em vez de excluir?')) return;
    updateTaskStatus(taskId, 'Cancelada');
    return;
  }

  if (!window.confirm('Excluir tarefa sem registros?')) return;

  updateState((prev) => ({
    ...prev,
    tarefas: prev.tarefas.filter((tarefa) => tarefa.id !== taskId)
  }));
}

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target.result, { type: 'array' });
        const targetSheet = workbook.Sheets['Planilha1'] || workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(targetSheet, { header: 1, raw: true });
        const importedItems = parseImportedRows(rows, campanhaAtual.id);
        if (!importedItems.length) {
          alert('Não foi possível identificar colunas válidas.');
          return;
        }
        updateState((prev) => ({ ...prev, itens: importedItems }));
        setImportInfo({ arquivo: file.name, total: importedItems.length });
      } catch {
        alert('Falha ao importar a planilha.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const filteredItems = useMemo(() => itensComStatus.filter((item) => {
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
  }), [itensComStatus, showZeroItems, almoxFilter, itemFilter, searchTerm]);

  function updateCountDraft(itemId, field, value) {
    setCountDrafts((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [field]: value }
    }));
  }

  function saveTableCounts() {
    if (!selectedTask) return;
    const entries = Object.entries(countDrafts).filter(([, draft]) => draft.quantidadeContada !== '' && draft.quantidadeContada !== undefined && draft.quantidadeContada !== null);
    if (!entries.length) {
      alert('Nenhum lançamento preenchido na tabela.');
      return;
    }

    const novosRegistros = [];
    const novasAnalises = [...state.analises];

    entries.forEach(([itemId, draft]) => {
      const item = state.itens.find((current) => current.id === itemId);
      if (!item) return;
      const quantidade = Number(draft.quantidadeContada);
      const diferenca = quantidade - Number(item.saldoTeorico || 0);
      const classificacao = classifyDifference(diferenca, item.saldoTeorico, state.configuracoes);
      novosRegistros.push({
        id: uid('reg'),
        tarefaId: selectedTask.id,
        itemId,
        quantidadeContada: quantidade,
        diferenca,
        classificacao,
        observacao: draft.observacao || '',
        usuarioRegistro: draft.usuarioRegistro || 'Operador',
        dataHoraRegistro: new Date().toISOString()
      });
      if (classificacao !== 'Sem diferença' && !novasAnalises.some((analise) => analise.itemId === itemId)) {
        novasAnalises.push({
          id: uid('an'),
          itemId,
          preAnalise: `Divergência identificada na ${selectedTask.tipoContagem}.`,
          analiseFinal: '',
          situacaoDocumental: 'Pendente de verificação',
          observacaoGerencial: 'Programar recontagem com outra equipe.'
        });
      }
    });

    updateState((prev) => ({ ...prev, registros: [...novosRegistros, ...prev.registros], analises: novasAnalises, tarefas: prev.tarefas.map((tarefa) => tarefa.id === selectedTask.id ? { ...tarefa, status: 'Aguardando validação', dataEnvioContagem: new Date().toISOString(), origemLancamento: tarefa.origemLancamento || 'chefe_inventario' } : tarefa) }));
    setCountDrafts({});

  }

  function toggleRecountSelection(itemId) {
    setSelectedRecountItemIds((prev) => (
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    ));
  }

  function selectAllDivergencias() {
    setSelectedRecountItemIds(filteredDivergencias.map((item) => item.id));
  }

  function selectCriticalDivergencias() {
    setSelectedRecountItemIds(filteredDivergencias.filter((item) => item.classificacaoAtual === 'Diferença crítica').map((item) => item.id));
  }

  function clearDivergenceSelection() {
    setSelectedRecountItemIds([]);
  }

  function applyValidationToItems(itemIds = [], action = 'validar') {
    const ids = itemIds.length ? itemIds : selectedRecountItemIds;
    const items = divergencias.filter((item) => ids.includes(item.id));
    if (!items.length) {
      alert(action === 'validar' ? 'Seleciona ao menos um item para validar.' : 'Seleciona ao menos um item divergente para solicitar recontagem.');
      return;
    }

    if (action === 'validar') {
      updateState((prev) => {
        const analises = items.reduce((acc, item) => {
          const existing = acc.find((analise) => analise.itemId === item.id);
          if (existing) {
            existing.analiseFinal = 'Contagem validada pelo chefe de inventário.';
            existing.situacaoDocumental = 'Validado';
            existing.observacaoGerencial = 'Item validado sem necessidade de nova lista.';
            return acc;
          }
          acc.push({
            id: uid('an'),
            itemId: item.id,
            preAnalise: `Validação da ${item.ultimaTarefa?.tipoContagem || 'contagem'}.`,
            analiseFinal: 'Contagem validada pelo chefe de inventário.',
            situacaoDocumental: 'Validado',
            observacaoGerencial: 'Item validado sem necessidade de nova lista.'
          });
          return acc;
        }, [...prev.analises]);

        const tarefas = prev.tarefas.map((tarefa) => {
          const itemIds = tarefa.itemIds || [];
          const hasAny = itemIds.some((itemId) => analises.find((analise) => analise.itemId === itemId));
          if (!hasAny) return tarefa;

          const hasRecount = itemIds.some((itemId) => analises.find((analise) => analise.itemId === itemId)?.situacaoDocumental === 'Em recontagem');
          const hasValidated = itemIds.some((itemId) => analises.find((analise) => analise.itemId === itemId)?.situacaoDocumental === 'Validado');

          if (hasValidated && hasRecount) {
            return { ...tarefa, status: 'Validada com ressalvas' };
          }
          if (hasValidated && !hasRecount) {
            return { ...tarefa, status: 'Validada' };
          }
          return tarefa;
        });

        return { ...prev, analises, tarefas };
      });
      setSelectedRecountItemIds([]);
      return;
    }

    const sameAlmox = new Set(items.map((item) => item.almoxarifadoId));
    if (sameAlmox.size > 1) {
      alert('Solicita a recontagem por almoxarifado. Seleciona itens de um mesmo almoxarifado.');
      return;
    }

    const targetAlmox = items[0].almoxarifadoId;
    const historicoTaskIds = new Set(items.flatMap((item) => (registrosPorItem.get(item.id) || []).map((registro) => registro.tarefaId)));
    const usedTeamIds = new Set(
      [...historicoTaskIds]
        .map((taskId) => tasksById[taskId]?.equipeId)
        .filter(Boolean)
    );

    const fallbackTeam = state.equipes.find((equipe) => equipe.ativa && !usedTeamIds.has(equipe.id) && !activeTeamsInOpenTasks.has(equipe.id));
    const orderedItems = [...items].sort((a, b) => a.codigoItem.localeCompare(b.codigoItem));

    setTaskForm({
      titulo: `Recontagem - ${getAlmoxName(targetAlmox)}`,
      almoxarifadoId: targetAlmox,
      equipeId: fallbackTeam?.id || '',
      tipoContagem: 'Recontagem',
      observacao: `Recontagem em lote com ${orderedItems.length} item(ns) divergente(s).`,
      scope: 'selecaoManual',
      equipeModo: fallbackTeam ? 'fixa' : 'mista',
      integrantesMistos: []
    });
    setSelectedItemIds(orderedItems.map((item) => item.id));
    setSelectedRecountItemIds(orderedItems.map((item) => item.id));
    updateState((prev) => {
      const analises = orderedItems.reduce((acc, item) => {
        const existing = acc.find((analise) => analise.itemId === item.id);
        if (existing) {
          existing.analiseFinal = '';
          existing.situacaoDocumental = 'Em recontagem';
          existing.observacaoGerencial = 'Lote enviado para recontagem.';
          return acc;
        }
        acc.push({
          id: uid('an'),
          itemId: item.id,
          preAnalise: `Divergência identificada na ${item.ultimaTarefa?.tipoContagem || 'contagem'}.`,
          analiseFinal: '',
          situacaoDocumental: 'Em recontagem',
          observacaoGerencial: 'Lote enviado para recontagem.'
        });
        return acc;
      }, [...prev.analises]);

      const tarefas = prev.tarefas.map((tarefa) => {
        const itemIds = tarefa.itemIds || [];
        const hasRecount = itemIds.some((itemId) => analises.find((analise) => analise.itemId === itemId)?.situacaoDocumental === 'Em recontagem');
        const hasValidated = itemIds.some((itemId) => analises.find((analise) => analise.itemId === itemId)?.situacaoDocumental === 'Validado');
        if (hasValidated && hasRecount) return { ...tarefa, status: 'Validada com ressalvas' };
        if (!hasValidated && hasRecount && orderedItems.some((item) => itemIds.includes(item.id))) return { ...tarefa, status: 'Validada com ressalvas' };
        return tarefa;
      });

      return { ...prev, analises, tarefas };
    });
    setActiveTab('tarefas');
  }

  function getHistoricoContagens(itemId) {
    const registros = [...(registrosPorItem.get(itemId) || [])].sort((a, b) => new Date(a.dataHoraRegistro) - new Date(b.dataHoraRegistro));
    return {
      primeira: registros[0]?.quantidadeContada ?? '',
      segunda: registros[1]?.quantidadeContada ?? '',
      terceira: registros[2]?.quantidadeContada ?? '',
      ultimaClassificacao: registros[registros.length - 1]?.classificacao || 'Sem registro'
    };
  }

  function buildRelatorioFinalRows() {
    return ALMOXARIFADOS.map((almox) => ({
      almox,
      items: itensComStatus
        .filter((item) => item.almoxarifadoId === almox.id)
        .sort((a, b) => a.codigoItem.localeCompare(b.codigoItem))
        .map((item) => {
          const historico = getHistoricoContagens(item.id);
          const ultimaContagem = historico.terceira !== '' ? Number(historico.terceira) : historico.segunda !== '' ? Number(historico.segunda) : historico.primeira !== '' ? Number(historico.primeira) : '';
          const saldoTeorico = Number(item.saldoTeorico || 0);
          const diferencaTotal = ultimaContagem === '' ? '' : Number(ultimaContagem) - saldoTeorico;
          return {
            codigo: item.codigoItem,
            descricao: item.descricaoItem,
            saldoTeorico,
            primeira: historico.primeira === '' ? '' : Number(historico.primeira),
            segunda: historico.segunda === '' ? '' : Number(historico.segunda),
            terceira: historico.terceira === '' ? '' : Number(historico.terceira),
            diferencaTotal,
            classificacaoFinal: historico.ultimaClassificacao
          };
        })
    })).filter((group) => group.items.length);
  }

  function generateRelatorioFinal() {
    const groups = buildRelatorioFinalRows();
    const html = groups.map(({ almox, items }) => `
      <div class="sheet">
        <h2>${almox.codigoCompleto} — ${almox.nome}</h2>
        <table>
          <thead>
            <tr>
              <th>Código</th><th>Descrição</th><th>Saldo teórico</th><th>1ª</th><th>2ª</th><th>3ª</th><th>Classificação final</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, index) => `
              <tr style="background:${index % 2 === 0 ? '#ffffff' : '#f1f5f9'};">
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td class="num">${formatNumber(item.saldoTeorico)}</td>
                <td class="num">${item.primeira === '' ? '' : formatNumber(item.primeira)}</td>
                <td class="num">${item.segunda === '' ? '' : formatNumber(item.segunda)}</td>
                <td class="num">${item.terceira === '' ? '' : formatNumber(item.terceira)}</td>
                <td class="num">${item.diferencaTotal === '' ? '' : formatNumber(item.diferencaTotal)}</td>
                <td>${item.classificacaoFinal}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `).join('');

    openPrintWindow('Relatório final de contagens', `
      ${html}
      <div class="footer-meta">
        <span>Relatório final de todas as contagens</span>
        <span>Campanha: ${campanhaAtual.nome}</span>
        <span>Emitido em: ${new Date().toLocaleString('pt-BR')}</span>
      </div>
    `);
  }

  function exportRelatorioFinalXlsx() {
    const groups = buildRelatorioFinalRows();
    const rows = groups.flatMap(({ almox, items }) => (
      items.map((item) => ({
        Almoxarifado: `${almox.codigoCompleto} — ${almox.nome}`,
        Código: item.codigo,
        Descrição: item.descricao,
        'Saldo teórico': item.saldoTeorico,
        '1ª contagem': item.primeira,
        '2ª contagem': item.segunda,
        '3ª contagem': item.terceira,
        'Diferença total': item.diferencaTotal,
        'Classificação final': item.classificacaoFinal
      }))
    ));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório final');
    XLSX.writeFile(workbook, 'relatorio-final-inventario.xlsx');
  }

  function generateListaFisica() {
    const tasks = printOptions.tarefaId === 'todas' ? state.tarefas.filter((tarefa) => tarefa.status !== 'Cancelada') : state.tarefas.filter((tarefa) => tarefa.id === printOptions.tarefaId);
    const html = tasks.map((tarefa) => {
      const itens = itensComStatus.filter((item) => tarefa.itemIds?.includes(item.id))
        .filter((item) => (printOptions.incluirZerados ? true : !item.zerado))
        .filter((item) => (printOptions.somenteDivergentes ? ['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual) : true));
      if (!itens.length) return '';
      return `
        <div class="sheet">
          <h2>${tarefa.titulo}</h2>
          <div><strong>Almoxarifado:</strong> ${ALMOXARIFADOS.find((almox) => almox.id === tarefa.almoxarifadoId)?.codigoCompleto || ''} — ${getAlmoxName(tarefa.almoxarifadoId)} &nbsp; | &nbsp; <strong>Equipe:</strong> ${tarefa.equipeNome}</div>
          <div><strong>Integrantes:</strong> ${tarefa.equipeIntegrantes.join(', ')}</div>
          <table>
            <thead>
              <tr>
                <th>Código</th><th>Descrição</th>${printOptions.mostrarSaldoTeorico ? '<th>Saldo teórico</th>' : ''}<th>Contagem</th><th>Observações</th>
              </tr>
            </thead>
            <tbody>
              ${itens.map((item, index) => `
                <tr style="background:${index % 2 === 0 ? '#ffffff' : '#f1f5f9'}; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                  <td>${item.codigoItem}</td>
                  <td>${item.descricaoItem}</td>
                  ${printOptions.mostrarSaldoTeorico ? `<td class="num">${formatNumber(item.saldoTeorico)}</td>` : ''}
                  <td class="space"></td>
                  <td></td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="signature-block">
            <div class="signature-line">Assinatura da equipe responsável: ${tarefa.equipeNome}</div>
            <div class="signature-line">Data: ____/____/________</div>
          </div>
        </div>
      `;
    }).join('');

    openPrintWindow('Lista física de contagem', `
      ${html}
      <div class="footer-meta">
        <span>Lista física de contagem</span>
        <span>Campanha: ${campanhaAtual.nome}</span>
        <span>Emitido em: ${new Date().toLocaleString('pt-BR')}</span>
      </div>
    `);
  }

  function exportSnapshot() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inventario-materiais-backup.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    const confirmed = window.confirm('Tem certeza que deseja apagar todos os dados locais do sistema?');
    if (!confirmed) return;

    const keysToRemove = [
      'inventario-materiais-pwa-v3',
      'inventario-materiais-pwa-v4',
      'inventario-materiais-pwa-v45',
    'inventario-materiais-pwa-v46',
      STORAGE_KEY
    ];

    [...new Set(keysToRemove)].forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {}
    });

    setState(structuredClone(EMPTY_STATE));
    setImportInfo(null);
    setCountDrafts({});
    setCurrentTaskId('');
    setSelectedItemIds([]);
    setSelectedRecountItemIds([]);
    setPrintOptions({
      tarefaId: 'todas',
      incluirZerados: false,
      somenteDivergentes: false,
      mostrarSaldoTeorico: true
    });

    window.location.reload();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">PWA</span>
          <div>
            <strong>Inventário Materiais</strong>
            <small>V4.6 operacional</small>
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
            <span className="pill">
              Desvio aceitável: {state.configuracoes?.desvioAceitavelUnidades ?? 0} un / {state.configuracoes?.desvioAceitavelPercentual ?? 0}%
            </span>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <>
            <section className="metrics-grid">
              <Card title="Total de itens" value={dashboard.totalItens} subtitle={`Zerados: ${dashboard.itensZerados}`} />
              <Card title="Contados" value={dashboard.contados} subtitle={`Pendentes: ${dashboard.pendentes}`} />
              <Card title="Divergências" value={dashboard.divergencias} subtitle={`Críticas: ${dashboard.criticas}`} />
              <Card title="Tarefas abertas" value={dashboard.tarefasAbertas} subtitle={`Concluídas: ${dashboard.tarefasConcluidas}`} />
            </section>

            <section className="dashboard-grid">
              <div className="card">
                <SectionTitle title="Resumo por almoxarifado" description="Com progresso por quantidade de itens contados." />
                <table>
                  <thead><tr><th>Almox</th><th>Itens</th><th>Avanço</th><th>Diverg.</th></tr></thead>
                  <tbody>
                    {ALMOXARIFADOS.map((almox) => {
                      const itens = itensComStatus.filter((item) => item.almoxarifadoId === almox.id);
                      const contados = itens.filter((item) => item.statusContagem === 'Contado').length;
                      const dif = itens.filter((item) => ['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual)).length;
                      return <tr key={almox.id}><td>{almox.nome}</td><td>{itens.length}</td><td><ProgressBar value={contados} total={itens.length} /></td><td>{dif}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <SectionTitle title="Parâmetros" description="Define o que é desvio admissível no inventário." />
                <div className="form-grid">
                  <label>
                    Desvio admissível em unidades
                    <input
                      type="number"
                      value={state.configuracoes?.desvioAceitavelUnidades ?? 0}
                      onChange={(e) =>
                        updateState((prev) => ({
                          ...prev,
                          configuracoes: {
                            ...INITIAL_STATE.configuracoes,
                            ...(prev.configuracoes || {}),
                            desvioAceitavelUnidades: Number(e.target.value || 0)
                          }
                        }))
                      }
                    />
                  </label>

                  <label>
                    Desvio admissível em percentual
                    <input
                      type="number"
                      value={state.configuracoes?.desvioAceitavelPercentual ?? 0}
                      onChange={(e) =>
                        updateState((prev) => ({
                          ...prev,
                          configuracoes: {
                            ...INITIAL_STATE.configuracoes,
                            ...(prev.configuracoes || {}),
                            desvioAceitavelPercentual: Number(e.target.value || 0)
                          }
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'equipes' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title={teamForm.id ? 'Editar equipe' : 'Cadastrar equipe'} description="Informa os nomes dos integrantes em campos curtos." action={teamForm.id ? <button className="secondary-btn" onClick={resetTeamForm}>Cancelar</button> : null} />
              <form className="form-grid" onSubmit={handleCreateOrUpdateTeam}>
                <label>Nome da equipe<input value={teamForm.nome} onChange={(e) => setTeamForm((prev) => ({ ...prev, nome: e.target.value }))} required /></label>
                <label className="full-width">Observações<input value={teamForm.observacoes} onChange={(e) => setTeamForm((prev) => ({ ...prev, observacoes: e.target.value }))} /></label>
                <label>Integrante 1<input value={teamForm.integrante1} onChange={(e) => setTeamForm((prev) => ({ ...prev, integrante1: e.target.value }))} /></label>
                <label>Integrante 2<input value={teamForm.integrante2} onChange={(e) => setTeamForm((prev) => ({ ...prev, integrante2: e.target.value }))} /></label>
                <label>Integrante 3<input value={teamForm.integrante3} onChange={(e) => setTeamForm((prev) => ({ ...prev, integrante3: e.target.value }))} /></label>
                <label>Integrante 4<input value={teamForm.integrante4} onChange={(e) => setTeamForm((prev) => ({ ...prev, integrante4: e.target.value }))} /></label>
                <button className="primary-btn full-width" type="submit">Salvar equipe</button>
              </form>
            </div>
            <div className="card">
              <SectionTitle title="Todas as equipes e integrantes" description={`Total de integrantes cadastrados: ${allMembers.length}`} />
              <div className="stack-list">
                {state.equipes.map((equipe) => (
                  <div key={equipe.id} className="stack-item">
                    <div className="stack-item-header"><strong>{equipe.nome}</strong><span className="pill">{equipe.ativa ? 'Ativa' : 'Inativa'}</span></div>
                    <ul>
                      {equipe.integrantes.map((integrante) => <li key={integrante.id}>{integrante.nome} — {integrante.matriculaLogin || '-'} — {integrante.funcao}</li>)}
                    </ul>
                    <div className="actions-cell"><button className="secondary-btn" onClick={() => editTeam(equipe)}>Editar</button><button className="secondary-btn" onClick={() => toggleTeamActive(equipe.id)}>{equipe.ativa ? 'Inativar' : 'Ativar'}</button></div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'itens' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Importação da base" description="Leitura de .xlsx, .ods e .csv. Códigos são padronizados para 0000.0000.000000." />
              <label className="primary-btn file-btn wide-btn">Selecionar planilha<input type="file" accept=".xlsx,.xls,.ods,.csv" onChange={handleImportFile} /></label>
              {importInfo ? <p className="top-gap"><strong>Última importação:</strong> {importInfo.arquivo} ({importInfo.total} itens)</p> : null}
            </div>
            <div className="card">
              <SectionTitle title="Base de itens" description="Filtra pendentes, contados e divergentes." />
              <div className="filter-row">
                <label>Almox<select value={almoxFilter} onChange={(e) => setAlmoxFilter(e.target.value)}><option value="todos">Todos</option>{ALMOXARIFADOS.map((almox) => <option key={almox.id} value={almox.id}>{almox.nome}</option>)}</select></label>
                <label>Situação<select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}><option value="todos">Todos</option><option value="pendentes">Pendentes</option><option value="contados">Contados</option><option value="divergentes">Divergentes</option></select></label>
                <label>Busca<input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Código ou descrição" /></label>
                <label className="checkbox-row"><input type="checkbox" checked={showZeroItems} onChange={(e) => setShowZeroItems(e.target.checked)} />Mostrar zerados</label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Código</th><th>Descrição</th><th>Almox</th><th>Saldo</th><th>Status</th><th>Classificação</th></tr></thead>
                  <tbody>
                    {filteredItems.map((item) => <tr key={item.id}><td>{item.codigoItem}</td><td>{item.descricaoItem}</td><td>{getAlmoxName(item.almoxarifadoId)}</td><td>{formatNumber(item.saldoTeorico)}</td><td>{item.statusContagem}</td><td><span className={statusClassName(item.classificacaoAtual)} style={item.classificacaoAtual === 'Sem diferença' ? { background: '#dcfce7', color: '#166534' } : undefined}>{item.classificacaoAtual}</span></td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}


        {activeTab === 'planejamento' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Planejamento por almoxarifado" description="Define equipes por almoxarifado e gera automaticamente as listas sem repetir bens." />
              <div className="form-grid">
                <label>
                  Almoxarifado
                  <select value={planningForm.almoxarifadoId} onChange={(e) => setPlanningForm((prev) => ({ ...prev, almoxarifadoId: e.target.value, selectedTeamIds: [] }))}>
                    {ALMOXARIFADOS.map((almox) => <option key={almox.id} value={almox.id}>{almox.nome}</option>)}
                  </select>
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={planningForm.includeZeroItems} onChange={(e) => setPlanningForm((prev) => ({ ...prev, includeZeroItems: e.target.checked }))} />
                  Incluir itens zerados na divisão
                </label>
                <div className="full-width muted-text">Equipes livres para assumir nova lista: {planningEligibleTeams.length}</div>
                <label className="full-width">Escolhe as equipes que vão atuar neste almoxarifado
                  <div className="check-grid scroll-box">
                    {planningEligibleTeams.length ? planningEligibleTeams.map((team) => (
                      <label key={team.id} className="compact-check">
                        <input type="checkbox" checked={planningForm.selectedTeamIds.includes(team.id)} onChange={() => togglePlanningTeam(team.id)} />
                        {team.nome} <span className="muted-inline">({team.integrantes.length} integrantes)</span>
                      </label>
                    )) : <span className="muted-inline">Nenhuma equipe livre. Conclui ou cancela listas ativas para liberar equipes.</span>}
                  </div>
                </label>
                <div className="full-width muted-text">Itens pendentes disponíveis para dividir: {planningAvailableItems.length}</div>
                <button className="primary-btn full-width" onClick={generateTasksByPlanning}>Gerar tarefas e listas</button>
              </div>
            </div>
            <div className="card">
              <SectionTitle title="Prévia dos lotes" description="A divisão fica o mais equilibrada possível entre as equipes selecionadas." />
              <div className="stack-list">
                {planningPreviewLots.length ? planningPreviewLots.map(({ team, items }) => (
                  <div key={team.id} className="stack-item">
                    <div className="stack-item-header"><strong>{team.nome}</strong><span className="pill">{items.length} itens</span></div>
                    <p><strong>Primeiro item:</strong> {items[0]?.codigoItem || '-'}</p>
                    <p><strong>Último item:</strong> {items[items.length - 1]?.codigoItem || '-'}</p>
                    <p><strong>Integrantes:</strong> {team.integrantes.map((item) => item.nome).join(', ')}</p>
                  </div>
                )) : <div className="empty-state">Seleciona as equipes para visualizar a divisão automática.</div>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'tarefas' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Criar tarefa manual (uso excepcional)" description="Use esta tela apenas para ajustes pontuais. O fluxo principal de geração de listas agora fica em Planejamento." />
              <form className="form-grid" onSubmit={handleCreateTask}>
                <label>Título<input value={taskForm.titulo} onChange={(e) => setTaskForm((prev) => ({ ...prev, titulo: e.target.value }))} /></label>
                <label>Tipo de contagem<select value={taskForm.tipoContagem} onChange={(e) => setTaskForm((prev) => ({ ...prev, tipoContagem: e.target.value }))}>{COUNT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label>Almoxarifado<select value={taskForm.almoxarifadoId} onChange={(e) => setTaskForm((prev) => ({ ...prev, almoxarifadoId: e.target.value }))}>{ALMOXARIFADOS.map((almox) => <option key={almox.id} value={almox.id}>{almox.nome}</option>)}</select></label>
                <label>Escopo<select value={taskForm.scope} onChange={(e) => setTaskForm((prev) => ({ ...prev, scope: e.target.value }))}><option value="somentePendentes">Itens pendentes disponíveis</option><option value="selecaoManual">Seleção manual</option></select></label>
                {taskForm.tipoContagem === '1ª contagem' ? (
                  <label className="full-width">Equipe<select value={taskForm.equipeId} onChange={(e) => setTaskForm((prev) => ({ ...prev, equipeId: e.target.value }))}><option value="">Selecione</option>{manualEligibleTeams.map((equipe) => <option key={equipe.id} value={equipe.id}>{equipe.nome}</option>)}</select></label>
                ) : (
                  <>
                    <label>Modo da equipe<select value={taskForm.equipeModo} onChange={(e) => setTaskForm((prev) => ({ ...prev, equipeModo: e.target.value }))}><option value="fixa">Outra equipe cadastrada</option><option value="mista">Equipe mista de recontagem</option></select></label>
                    {taskForm.equipeModo === 'fixa' ? <label>Equipe<select value={taskForm.equipeId} onChange={(e) => setTaskForm((prev) => ({ ...prev, equipeId: e.target.value }))}><option value="">Selecione</option><option value="">Selecione</option>{manualEligibleTeams.map((equipe) => <option key={equipe.id} value={equipe.id}>{equipe.nome}</option>)}</select></label> : null}
                    {taskForm.equipeModo === 'mista' ? <label className="full-width">Integrantes mistos<div className="check-grid">{allMembers.map((member) => <label key={member.id} className="compact-check"><input type="checkbox" checked={taskForm.integrantesMistos.includes(member.id)} onChange={() => toggleMixedMember(member.id)} />{member.nome} <span className="muted-inline">({member.equipeNome})</span></label>)}</div></label> : null}
                  </>
                )}
                <label className="full-width">Observação<input value={taskForm.observacao} onChange={(e) => setTaskForm((prev) => ({ ...prev, observacao: e.target.value }))} /></label>
                {taskForm.scope === 'selecaoManual' ? <label className="full-width">Itens do recorte<div className="check-grid scroll-box">{availableItemsForTask.length ? availableItemsForTask.map((item) => <label key={item.id} className="compact-check"><input type="checkbox" checked={selectedItemIds.includes(item.id)} onChange={() => setSelectedItemIds((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])} />{item.codigoItem} — {item.descricaoItem}</label>) : <span className="muted-inline">Nenhum item disponível.</span>}</div></label> : null}
                <div className="full-width muted-text">Itens disponíveis para a tarefa manual: {availableItemsForTask.length}</div>
                <div className="full-width muted-text">Cada equipe pode assumir apenas uma lista ativa por vez. Para divisão automática e equilibrada por almoxarifado, usa a aba Planejamento.</div>
                <button className="primary-btn full-width" type="submit">Criar tarefa manual</button>
              </form>
            </div>
            <div className="card">
              <SectionTitle title="Tarefas geradas e acompanhamento" description="As tarefas criadas em Planejamento aparecem aqui para iniciar, concluir, abrir tabela e cancelar." />
              <div className="stack-list">
                {state.tarefas.map((tarefa) => (
                  <div key={tarefa.id} className="stack-item">
                    <div className="stack-item-header"><strong>{tarefa.titulo}</strong><span className="pill">{tarefa.status}</span></div>
                    <p><strong>Almoxarifado:</strong> {getAlmoxName(tarefa.almoxarifadoId)}</p>
                    <p><strong>Equipe:</strong> {tarefa.equipeNome}</p>
                    <p><strong>Integrantes:</strong> {tarefa.equipeIntegrantes.join(', ')}</p>
                    <p><strong>Tipo:</strong> {tarefa.tipoContagem}</p>
                    <p><strong>Itens na lista:</strong> {tarefa.itemIds?.length || 0}</p>
                    <div className="actions-cell">
                      {tarefa.status === 'Pendente' ? <button className="primary-btn" onClick={() => updateTaskStatus(tarefa.id, 'Em execução')}>Iniciar</button> : null}
                      {tarefa.status === 'Em execução' ? <button className="secondary-btn" onClick={() => updateTaskStatus(tarefa.id, 'Concluída')}>Concluir</button> : null}
                      {!['Concluída', 'Cancelada'].includes(tarefa.status) ? <button className="secondary-btn" onClick={() => { setCurrentTaskId(tarefa.id); setActiveTab('contagem'); }}>Abrir tabela</button> : null}
                      <button className="danger-btn" onClick={() => deleteTask(tarefa.id)}>{state.registros.some((registro) => registro.tarefaId === tarefa.id) ? 'Cancelar' : 'Excluir'}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'contagem' && (
          <div className="card">
            <SectionTitle title="Registrar contagem por tarefa" description="Seleciona a tarefa da equipe e só então abre a tabela com os itens daquela lista." />
            <p className="muted-text">Estrutura preparada para futuro lançamento direto pela equipe, mantendo agora o chefe de inventário como operador principal.</p>
            {openTasksForCounting.length ? (
              <>
                <div className="stack-list compact-list">
                  {openTasksForCounting.map((tarefa) => (
                    <button
                      key={tarefa.id}
                      className={selectedTask?.id === tarefa.id ? 'task-pick active' : 'task-pick'}
                      onClick={() => setCurrentTaskId(tarefa.id)}
                    >
                      <strong>{tarefa.titulo}</strong>
                      <span>{getAlmoxName(tarefa.almoxarifadoId)} • {tarefa.equipeNome}</span>
                      <span>{tarefa.itemIds?.length || 0} item(ns) • {tarefa.status}</span>
                    </button>
                  ))}
                </div>
                {selectedTask ? (
                  <>
                    <p className="top-gap"><strong>Tarefa selecionada:</strong> {selectedTask.titulo}</p>
                    <p><strong>Equipe:</strong> {selectedTask.equipeNome} | <strong>Tipo:</strong> {selectedTask.tipoContagem} | <strong>Integrantes:</strong> {selectedTask.equipeIntegrantes.join(', ')}</p>
                    <div className="table-wrap top-gap">
                      <table>
                        <thead><tr><th>Código</th><th>Descrição</th><th>Saldo teórico</th><th>Quantidade contada</th><th>Usuário</th><th>Observação</th><th>Último status</th></tr></thead>
                        <tbody>
                          {taskItems.map((item) => (
                            <tr key={item.id}>
                              <td>{item.codigoItem}</td>
                              <td>{item.descricaoItem}</td>
                              <td className="num">{formatNumber(item.saldoTeorico)}</td>
                              <td><input type="number" value={countDrafts[item.id]?.quantidadeContada ?? ''} onChange={(e) => updateCountDraft(item.id, 'quantidadeContada', e.target.value)} /></td>
                              <td><input value={countDrafts[item.id]?.usuarioRegistro ?? ''} onChange={(e) => updateCountDraft(item.id, 'usuarioRegistro', e.target.value)} placeholder="Operador" /></td>
                              <td><input value={countDrafts[item.id]?.observacao ?? ''} onChange={(e) => updateCountDraft(item.id, 'observacao', e.target.value)} /></td>
                              <td>{item.classificacaoAtual === 'Sem registro' ? 'Sem registro' : <span className={statusClassName(item.classificacaoAtual)}>{item.classificacaoAtual}</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="actions-cell top-gap"><button className="primary-btn" onClick={saveTableCounts}>Salvar lançamentos em lote</button></div>
                  </>
                ) : null}
              </>
            ) : <div className="empty-state">Nenhuma tarefa disponível para lançamento.</div>}
          </div>
        )}

        {activeTab === 'divergencias' && (
          <div className="card">
            <SectionTitle title="Validação / Recontagem" description="Filtra por classificação, seleciona os itens e decide entre validar a contagem ou solicitar nova recontagem em lote." />
            <div className="form-grid top-gap">
              <label>Classificação
                <select value={validationFilter} onChange={(e) => setValidationFilter(e.target.value)}>
                  <option value="todas">Todas</option>
                  <option value="criticas">Diferença crítica</option>
                  <option value="admissiveis">Diferença admissível</option>
                </select>
              </label>
              <div className="actions-cell wrap-actions">
                <button className="secondary-btn" onClick={selectCriticalDivergencias}>Selecionar diferença crítica</button>
                <button className="secondary-btn" onClick={selectAllDivergencias}>Selecionar todos</button>
                <button className="secondary-btn" onClick={clearDivergenceSelection}>Limpar seleção</button>
              </div>
              <div className="actions-cell wrap-actions full-width">
                <button className="primary-btn" onClick={() => applyValidationToItems([], 'validar')}>Validar contagem</button>
                <button className="secondary-btn" onClick={() => applyValidationToItems([], 'recontagem')}>Solicitar recontagem</button>
              </div>
            </div>
            <div className="table-wrap top-gap">
              <table>
                <thead><tr><th></th><th>Código</th><th>Descrição</th><th>Almox</th><th>Diferença</th><th>Classificação</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>
                  {filteredDivergencias.map((item) => (
                    <tr key={item.id}>
                      <td><input type="checkbox" checked={selectedRecountItemIds.includes(item.id)} onChange={() => toggleRecountSelection(item.id)} /></td>
                      <td>{item.codigoItem}</td>
                      <td>{item.descricaoItem}</td>
                      <td>{ALMOXARIFADOS.find((almox) => almox.id === item.almoxarifadoId)?.codigoCompleto || ''} — {getAlmoxName(item.almoxarifadoId)}</td>
                      <td>{formatNumber(item.diferencaAtual)}</td>
                      <td><span className={statusClassName(item.classificacaoAtual)} style={item.classificacaoAtual === 'Sem diferença' ? { background: '#dcfce7', color: '#166534' } : undefined}>{item.classificacaoAtual}</span></td>
                      <td>{item.situacaoValidacao}</td>
                      <td>
                        <div className="actions-cell wrap-actions">
                          <button className="secondary-btn" onClick={() => applyValidationToItems([item.id], 'validar')}>Validar</button>
                          <button className="secondary-btn" onClick={() => applyValidationToItems([item.id], 'recontagem')}>Recontar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredDivergencias.length ? (
                    <tr><td colSpan="8" className="muted-text">Nenhum item pendente de validação para o filtro escolhido.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="muted-text top-gap">Itens selecionados: {selectedRecountItemIds.length}. O sistema prepara os lotes de recontagem conforme os itens marcados e registra o tipo de contagem como Recontagem.</p>
          </div>
        )}

        {activeTab === 'relatorios' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Listas físicas" description="Metadados no rodapé e nome da equipe em cada lista." />
              <div className="form-grid">
                <label>Tarefa<select value={printOptions.tarefaId} onChange={(e) => setPrintOptions((prev) => ({ ...prev, tarefaId: e.target.value }))}><option value="todas">Todas as tarefas</option>{state.tarefas.map((tarefa) => <option key={tarefa.id} value={tarefa.id}>{tarefa.titulo}</option>)}</select></label>
                <label className="checkbox-row"><input type="checkbox" checked={printOptions.incluirZerados} onChange={(e) => setPrintOptions((prev) => ({ ...prev, incluirZerados: e.target.checked }))} />Incluir zerados</label>
                <label className="checkbox-row"><input type="checkbox" checked={printOptions.somenteDivergentes} onChange={(e) => setPrintOptions((prev) => ({ ...prev, somenteDivergentes: e.target.checked }))} />Somente divergentes</label>
                <label className="checkbox-row"><input type="checkbox" checked={printOptions.mostrarSaldoTeorico} onChange={(e) => setPrintOptions((prev) => ({ ...prev, mostrarSaldoTeorico: e.target.checked }))} />Mostrar saldo do sistema</label>
                <button className="primary-btn full-width" onClick={generateListaFisica}>Gerar lista física</button>
                <button className="secondary-btn full-width" onClick={generateRelatorioFinal}>Emitir relatório final (PDF)</button>
                <button className="secondary-btn full-width" onClick={exportRelatorioFinalXlsx}>Exportar relatório final (.xlsx)</button>
              </div>
            </div>
            <div className="card">
              <SectionTitle title="Resumo da V4.6" description="Correções e entregas desta versão." />
              <ul className="simple-list">
                <li>• exclusão/cancelamento de tarefas</li>
                <li>• contagem em tabela aberta com salvamento em lote</li>
                <li>• parâmetros de desvio admissível</li>
                <li>• formatação de código 0000.0000.000000</li>
                <li>• recontagem em lote por outra equipe ou por equipe mista</li>
                <li>• lista completa de integrantes</li>
                <li>• divisão do mesmo almox sem repetir itens em tarefas abertas</li>
                <li>• PDF com equipe responsável, assinatura, opção com/sem saldo e linhas alternadas
                </li>
                <li>• relatório final separado por almoxarifado com código, em PDF e .xlsx
                </li>
                <li>• planejamento por almoxarifado com divisão automática por equipes
                </li>
                <li>• tarefas concluídas saem da lista do menu Registrar contagem</li>
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
