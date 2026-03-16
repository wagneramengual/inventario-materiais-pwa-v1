import React, { useEffect, useMemo, useState } from 'react';
import { ALMOXARIFADOS, INITIAL_STATE } from './data/seed';

const STORAGE_KEY = 'inventario-materiais-pwa-v1';

const tabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'campanhas', label: 'Campanhas' },
  { id: 'equipes', label: 'Equipes' },
  { id: 'itens', label: 'Itens' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'divergencias', label: 'Divergências' },
  { id: 'relatorios', label: 'Listas / Relatórios' }
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
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function getAlmoxName(almoxId) {
  return ALMOXARIFADOS.find((almox) => almox.id === almoxId)?.nome || 'Não informado';
}

function classifyDifference(diferenca, saldoTeorico) {
  if (diferenca === 0) return 'Sem diferença';
  const referencia = Math.max(Number(saldoTeorico || 0), 1);
  const percentual = Math.abs(diferenca) / referencia;
  return percentual <= 0.05 ? 'Diferença admissível' : 'Diferença crítica';
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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [state, setState] = useState(INITIAL_STATE);
  const [showZeroItems, setShowZeroItems] = useState(false);
  const [itemFilter, setItemFilter] = useState('todos');
  const [almoxFilter, setAlmoxFilter] = useState('todos');
  const [taskForm, setTaskForm] = useState({ almoxarifadoId: 'almox-001', equipeId: 'eq-1', tipoContagem: '1ª contagem', observacao: '' });
  const [countForm, setCountForm] = useState({ tarefaId: 'tar-1', itemId: '', quantidadeContada: '', usuarioRegistro: 'Wagner', observacao: '' });
  const [teamForm, setTeamForm] = useState({ nome: '', responsavel: '', observacoes: '', integrantesTexto: '' });

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

  const itensComStatus = useMemo(() => {
    return state.itens.map((item) => {
      const registros = registrosPorItem.get(item.id) || [];
      const ultimoRegistro = registros[registros.length - 1];
      return {
        ...item,
        totalRegistros: registros.length,
        ultimoRegistro,
        statusContagem: ultimoRegistro ? 'Contado' : 'Pendente',
        diferencaAtual: ultimoRegistro?.diferenca ?? null,
        classificacaoAtual: ultimoRegistro?.classificacao || 'Sem registro'
      };
    });
  }, [state.itens, registrosPorItem]);

  const divergencias = useMemo(() => itensComStatus.filter((item) => ['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual)), [itensComStatus]);

  const dashboard = useMemo(() => {
    const totalItens = state.itens.length;
    const itensZerados = state.itens.filter((item) => item.zerado).length;
    const itensAtivos = totalItens - itensZerados;
    const contados = itensComStatus.filter((item) => item.statusContagem === 'Contado').length;
    const pendentes = totalItens - contados;
    const tarefasEmExecucao = state.tarefas.filter((t) => t.status === 'Em execução').length;
    const tarefasConcluidas = state.tarefas.filter((t) => t.status === 'Concluída' || t.status === 'Validada').length;
    const criticas = divergencias.filter((item) => item.classificacaoAtual === 'Diferença crítica').length;
    return { totalItens, itensZerados, itensAtivos, contados, pendentes, tarefasEmExecucao, tarefasConcluidas, divergencias: divergencias.length, criticas };
  }, [state, itensComStatus, divergencias]);

  const filteredItems = useMemo(() => {
    return itensComStatus.filter((item) => {
      if (!showZeroItems && item.zerado) return false;
      if (almoxFilter !== 'todos' && item.almoxarifadoId !== almoxFilter) return false;
      if (itemFilter === 'pendentes' && item.statusContagem !== 'Pendente') return false;
      if (itemFilter === 'contados' && item.statusContagem !== 'Contado') return false;
      if (itemFilter === 'divergentes' && !['Diferença admissível', 'Diferença crítica'].includes(item.classificacaoAtual)) return false;
      return true;
    });
  }, [itensComStatus, showZeroItems, almoxFilter, itemFilter]);

  const itemsForCurrentTask = useMemo(() => {
    const selectedTask = state.tarefas.find((t) => t.id === countForm.tarefaId);
    if (!selectedTask) return [];
    return state.itens.filter((item) => item.almoxarifadoId === selectedTask.almoxarifadoId && item.campanhaId === selectedTask.campanhaId && !item.zerado);
  }, [countForm.tarefaId, state.tarefas, state.itens]);

  useEffect(() => {
    if (itemsForCurrentTask.length && !itemsForCurrentTask.some((item) => item.id === countForm.itemId)) {
      setCountForm((prev) => ({ ...prev, itemId: itemsForCurrentTask[0].id }));
    }
  }, [itemsForCurrentTask, countForm.itemId]);

  function updateState(updater) {
    setState((prev) => updater(prev));
  }

  function handleCreateTeam(event) {
    event.preventDefault();
    const integrantes = teamForm.integrantesTexto
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [nome, matriculaLogin = '', funcao = 'Contador'] = line.split('|').map((part) => part.trim());
        return { id: uid('int'), nome, matriculaLogin, funcao };
      });

    const novaEquipe = {
      id: uid('eq'),
      nome: teamForm.nome,
      responsavel: teamForm.responsavel,
      observacoes: teamForm.observacoes,
      ativa: true,
      integrantes
    };

    updateState((prev) => ({ ...prev, equipes: [...prev.equipes, novaEquipe] }));
    setTeamForm({ nome: '', responsavel: '', observacoes: '', integrantesTexto: '' });
  }

  function handleCreateTask(event) {
    event.preventDefault();
    const tarefa = {
      id: uid('tar'),
      campanhaId: campanhaAtual.id,
      almoxarifadoId: taskForm.almoxarifadoId,
      equipeId: taskForm.equipeId,
      tipoContagem: taskForm.tipoContagem,
      status: 'Pendente',
      dataInicio: '',
      dataFim: '',
      observacao: taskForm.observacao
    };
    updateState((prev) => ({ ...prev, tarefas: [tarefa, ...prev.tarefas] }));
    setTaskForm((prev) => ({ ...prev, observacao: '' }));
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
    if (!item) return;
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
            preAnalise: `Divergência identificada na ${prev.tarefas.find((t) => t.id === countForm.tarefaId)?.tipoContagem || 'contagem'}.`,
            analiseFinal: '',
            situacaoDocumental: 'Pendente de verificação',
            observacaoGerencial: 'Avaliar necessidade de recontagem.'
          }
        ];
      }
      return { ...prev, registros: [registro, ...prev.registros], analises };
    });

    setCountForm((prev) => ({ ...prev, quantidadeContada: '', observacao: '' }));
  }

  function generateRecount(itemId) {
    const item = state.itens.find((current) => current.id === itemId);
    if (!item) return;
    const lastTaskId = registrosPorItem.get(itemId)?.slice(-1)[0]?.tarefaId;
    const lastTask = state.tarefas.find((t) => t.id === lastTaskId);
    const alternativeTeam = state.equipes.find((team) => team.id !== lastTask?.equipeId) || state.equipes[0];

    const novaTarefa = {
      id: uid('tar'),
      campanhaId: campanhaAtual.id,
      almoxarifadoId: item.almoxarifadoId,
      equipeId: alternativeTeam?.id || state.equipes[0]?.id,
      tipoContagem: lastTask?.tipoContagem === '1ª contagem' ? '2ª contagem' : '3ª contagem',
      status: 'Pendente',
      dataInicio: '',
      dataFim: '',
      observacao: `Recontagem gerada automaticamente para o item ${item.codigoItem}.`
    };

    updateState((prev) => ({ ...prev, tarefas: [novaTarefa, ...prev.tarefas] }));
    setActiveTab('tarefas');
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL_STATE);
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">PWA</span>
          <div>
            <strong>Inventário Materiais</strong>
            <small>V1 operacional + gerencial</small>
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
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <>
            <SectionTitle title="Painel geral" description="Indicadores principais do inventário e visão gerencial da execução." />
            <section className="metrics-grid">
              <Card title="Total de itens" value={dashboard.totalItens} subtitle="Base completa da campanha" />
              <Card title="Itens com saldo > 0" value={dashboard.itensAtivos} subtitle="Elegíveis à contagem física" />
              <Card title="Itens zerados" value={dashboard.itensZerados} subtitle="Podem ser ocultados da impressão" />
              <Card title="Itens contados" value={dashboard.contados} subtitle={`Pendentes: ${dashboard.pendentes}`} />
              <Card title="Divergências" value={dashboard.divergencias} subtitle={`Críticas: ${dashboard.criticas}`} />
              <Card title="Tarefas em execução" value={dashboard.tarefasEmExecucao} subtitle={`Concluídas: ${dashboard.tarefasConcluidas}`} />
            </section>

            <section className="dashboard-grid">
              <div className="card">
                <SectionTitle title="Resumo por almoxarifado" />
                <table>
                  <thead>
                    <tr>
                      <th>Almoxarifado</th>
                      <th>Itens</th>
                      <th>Contados</th>
                      <th>Divergências</th>
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
                          <td>{contados}</td>
                          <td>{diverg}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <SectionTitle title="Desempenho por equipe" />
                <table>
                  <thead>
                    <tr>
                      <th>Equipe</th>
                      <th>Tarefas</th>
                      <th>Registros</th>
                      <th>Almox distintos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.equipes.map((equipe) => {
                      const tarefas = state.tarefas.filter((tarefa) => tarefa.equipeId === equipe.id);
                      const registros = state.registros.filter((registro) => tarefas.some((tarefa) => tarefa.id === registro.tarefaId));
                      const almoxSet = new Set(tarefas.map((tarefa) => tarefa.almoxarifadoId));
                      return (
                        <tr key={equipe.id}>
                          <td>{equipe.nome}</td>
                          <td>{tarefas.length}</td>
                          <td>{registros.length}</td>
                          <td>{almoxSet.size}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeTab === 'campanhas' && (
          <div className="card">
            <SectionTitle title="Campanha atual" description="Nesta V1 a campanha é única, mas a estrutura já suporta evolução para múltiplas campanhas." />
            <div className="details-grid">
              <div><strong>Nome:</strong> {campanhaAtual.nome}</div>
              <div><strong>Ano:</strong> {campanhaAtual.ano}</div>
              <div><strong>Status:</strong> {campanhaAtual.status}</div>
              <div><strong>Abertura:</strong> {campanhaAtual.dataAbertura}</div>
              <div><strong>Encerramento previsto:</strong> {campanhaAtual.dataEncerramentoPrevista}</div>
            </div>
          </div>
        )}

        {activeTab === 'equipes' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Cadastrar equipe" description="Equipe móvel de contagem. Integrantes: um por linha, no formato Nome | Matrícula | Função." />
              <form className="form-grid" onSubmit={handleCreateTeam}>
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
                  <textarea rows="6" value={teamForm.integrantesTexto} onChange={(e) => setTeamForm((prev) => ({ ...prev, integrantesTexto: e.target.value }))} placeholder="Fulano | MAT001 | Contador" />
                </label>
                <button className="primary-btn full-width" type="submit">Salvar equipe</button>
              </form>
            </div>

            <div className="card">
              <SectionTitle title="Equipes cadastradas" />
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
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'itens' && (
          <div className="card">
            <SectionTitle title="Base de itens" description="Filtros operacionais, com possibilidade de ocultar os itens zerados na emissão das listas físicas." />
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
              <label className="checkbox-row">
                <input type="checkbox" checked={showZeroItems} onChange={(e) => setShowZeroItems(e.target.checked)} />
                Mostrar itens zerados
              </label>
            </div>
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
                    <td>{item.saldoTeorico}</td>
                    <td>{item.statusContagem}</td>
                    <td><span className={`status-badge ${item.classificacaoAtual.replace(/\s+/g, '-').toLowerCase()}`}>{item.classificacaoAtual}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'tarefas' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Criar tarefa" description="As equipes são móveis e podem ser usadas em qualquer almoxarifado." />
              <form className="form-grid" onSubmit={handleCreateTask}>
                <label>
                  Almoxarifado
                  <select value={taskForm.almoxarifadoId} onChange={(e) => setTaskForm((prev) => ({ ...prev, almoxarifadoId: e.target.value }))}>
                    {ALMOXARIFADOS.map((almox) => <option key={almox.id} value={almox.id}>{almox.nome}</option>)}
                  </select>
                </label>
                <label>
                  Equipe
                  <select value={taskForm.equipeId} onChange={(e) => setTaskForm((prev) => ({ ...prev, equipeId: e.target.value }))}>
                    {state.equipes.map((equipe) => <option key={equipe.id} value={equipe.id}>{equipe.nome}</option>)}
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
                <label className="full-width">
                  Observação
                  <input value={taskForm.observacao} onChange={(e) => setTaskForm((prev) => ({ ...prev, observacao: e.target.value }))} />
                </label>
                <button className="primary-btn full-width" type="submit">Criar tarefa</button>
              </form>
            </div>

            <div className="card">
              <SectionTitle title="Registrar contagem" description="Nesta V1 o registro é feito item a item, filtrado pelo almoxarifado da tarefa." />
              <form className="form-grid" onSubmit={handleRegisterCount}>
                <label>
                  Tarefa
                  <select value={countForm.tarefaId} onChange={(e) => setCountForm((prev) => ({ ...prev, tarefaId: e.target.value }))}>
                    {state.tarefas.map((tarefa) => (
                      <option key={tarefa.id} value={tarefa.id}>
                        {tarefa.tipoContagem} - {getAlmoxName(tarefa.almoxarifadoId)} - {state.equipes.find((equipe) => equipe.id === tarefa.equipeId)?.nome}
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
              <SectionTitle title="Tarefas criadas" />
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Almoxarifado</th>
                    <th>Equipe</th>
                    <th>Status</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {state.tarefas.map((tarefa) => (
                    <tr key={tarefa.id}>
                      <td>{tarefa.tipoContagem}</td>
                      <td>{getAlmoxName(tarefa.almoxarifadoId)}</td>
                      <td>{state.equipes.find((equipe) => equipe.id === tarefa.equipeId)?.nome}</td>
                      <td>{tarefa.status}</td>
                      <td>{formatDateTime(tarefa.dataInicio)}</td>
                      <td>{formatDateTime(tarefa.dataFim)}</td>
                      <td className="actions-cell">
                        <button className="secondary-btn" onClick={() => startTask(tarefa.id)}>Iniciar</button>
                        <button className="secondary-btn" onClick={() => concludeTask(tarefa.id)}>Concluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'divergencias' && (
          <div className="card">
            <SectionTitle title="Divergências e recontagem" description="Itens divergentes podem gerar nova tarefa de recontagem com equipe diferente da anterior, quando possível." />
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
                    <td><span className={`status-badge ${item.classificacaoAtual.replace(/\s+/g, '-').toLowerCase()}`}>{item.classificacaoAtual}</span></td>
                    <td>{formatDateTime(item.ultimoRegistro?.dataHoraRegistro)}</td>
                    <td><button className="primary-btn" onClick={() => generateRecount(item.id)}>Gerar recontagem</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'relatorios' && (
          <section className="two-column-grid">
            <div className="card">
              <SectionTitle title="Lista física recomendada" description="Itens zerados ficam fora por padrão, para economizar papel." />
              <div className="print-sheet">
                {ALMOXARIFADOS.map((almox) => {
                  const itens = state.itens.filter((item) => item.almoxarifadoId === almox.id && !item.zerado);
                  return (
                    <div key={almox.id} className="print-group">
                      <h3>{almox.nome}</h3>
                      <ul>
                        {itens.map((item) => (
                          <li key={item.id}>{item.codigoItem} — {item.descricaoItem} — saldo {item.saldoTeorico}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <SectionTitle title="Lista de recontagem" description="Somente itens divergentes da campanha atual." />
              <ul className="stack-list simple-list">
                {divergencias.map((item) => (
                  <li key={item.id} className="stack-item">
                    <strong>{item.codigoItem}</strong> — {item.descricaoItem}<br />
                    <span>{getAlmoxName(item.almoxarifadoId)} | diferença atual: {item.diferencaAtual} | {item.classificacaoAtual}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
