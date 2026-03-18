export const ALMOXARIFADOS = [
  { id: 'almox-001', codigoCompleto: '30.01.001.001', codigoReduzido: '001', nome: 'Almox Expediente' },
  { id: 'almox-003', codigoCompleto: '30.01.001.003', codigoReduzido: '003', nome: 'Almox Infraestrutura' },
  { id: 'almox-004', codigoCompleto: '30.01.001.004', codigoReduzido: '004', nome: 'Almox Info' },
  { id: 'almox-005', codigoCompleto: '30.01.001.005', codigoReduzido: '005', nome: 'Almox Pat' }
];

export const INITIAL_STATE = {
  configuracoes: {
    desvioAceitavelUnidades: 2,
    desvioAceitavelPercentual: 5
  },
  campanhas: [
    {
      id: 'camp-2026',
      nome: 'Inventário Unidade de Materiais 2026',
      ano: 2026,
      status: 'Em andamento',
      descricao: 'Campanha inicial do PWA de gestão do inventário.',
      dataAbertura: '2026-03-16',
      dataEncerramentoPrevista: '2026-12-15'
    }
  ],
  equipes: [
    {
      id: 'eq-1',
      nome: 'Equipe Alfa',
      responsavel: 'Wagner',
      observacoes: 'Equipe móvel de contagem.',
      ativa: true,
      integrantes: [
        { id: 'int-1', nome: 'Wagner', matriculaLogin: 'WG001', funcao: 'Coordenador' },
        { id: 'int-2', nome: 'Aglaé', matriculaLogin: 'AG002', funcao: 'Contadora' },
        { id: 'int-3', nome: 'Hannah', matriculaLogin: 'HN003', funcao: 'Contadora' }
      ]
    },
    {
      id: 'eq-2',
      nome: 'Equipe Beta',
      responsavel: 'Júlia',
      observacoes: 'Equipe de apoio e recontagem.',
      ativa: true,
      integrantes: [
        { id: 'int-4', nome: 'Júlia', matriculaLogin: 'JL004', funcao: 'Contadora' },
        { id: 'int-5', nome: 'Carlos', matriculaLogin: 'CR005', funcao: 'Contador' },
        { id: 'int-6', nome: 'Maria', matriculaLogin: 'MR006', funcao: 'Contadora' }
      ]
    }
  ],
  itens: [
    { id: 'item-1', campanhaId: 'camp-2026', almoxarifadoId: 'almox-001', codigoItem: '0001.0001.000001', descricaoItem: 'Papel A4', saldoTeorico: 120, unidade: 'Resma', observacao: '', zerado: false },
    { id: 'item-2', campanhaId: 'camp-2026', almoxarifadoId: 'almox-001', codigoItem: '0001.0001.000002', descricaoItem: 'Caneta esferográfica azul', saldoTeorico: 300, unidade: 'Un', observacao: '', zerado: false },
    { id: 'item-3', campanhaId: 'camp-2026', almoxarifadoId: 'almox-001', codigoItem: '0001.0001.000003', descricaoItem: 'Envelope pardo A4', saldoTeorico: 95, unidade: 'Un', observacao: '', zerado: false },
    { id: 'item-4', campanhaId: 'camp-2026', almoxarifadoId: 'almox-003', codigoItem: '0002.0001.000010', descricaoItem: 'Lâmpada LED 20W', saldoTeorico: 48, unidade: 'Un', observacao: '', zerado: false },
    { id: 'item-5', campanhaId: 'camp-2026', almoxarifadoId: 'almox-003', codigoItem: '0002.0001.000011', descricaoItem: 'Extensão elétrica 10m', saldoTeorico: 12, unidade: 'Un', observacao: '', zerado: false },
    { id: 'item-6', campanhaId: 'camp-2026', almoxarifadoId: 'almox-004', codigoItem: '0003.0002.000001', descricaoItem: 'Teclado USB', saldoTeorico: 15, unidade: 'Un', observacao: '', zerado: false },
    { id: 'item-7', campanhaId: 'camp-2026', almoxarifadoId: 'almox-004', codigoItem: '0003.0002.000002', descricaoItem: 'Mouse USB', saldoTeorico: 28, unidade: 'Un', observacao: '', zerado: false },
    { id: 'item-8', campanhaId: 'camp-2026', almoxarifadoId: 'almox-005', codigoItem: '0004.0003.000001', descricaoItem: 'Etiqueta patrimonial', saldoTeorico: 0, unidade: 'Un', observacao: '', zerado: true },
    { id: 'item-9', campanhaId: 'camp-2026', almoxarifadoId: 'almox-005', codigoItem: '0004.0003.000002', descricaoItem: 'Lacre de segurança', saldoTeorico: 80, unidade: 'Un', observacao: '', zerado: false }
  ],
  tarefas: [
    {
      id: 'tar-1',
      campanhaId: 'camp-2026',
      almoxarifadoId: 'almox-001',
      equipeId: 'eq-1',
      equipeNome: 'Equipe Alfa',
      equipeTipo: 'fixa',
      equipeIntegrantes: ['Wagner', 'Aglaé', 'Hannah'],
      tipoContagem: '1ª contagem',
      status: 'Em execução',
      dataInicio: '2026-03-16T09:00',
      dataFim: '',
      observacao: 'Lote inicial do expediente.',
      titulo: '1ª contagem - Expediente lote A',
      itemIds: ['item-1', 'item-2']
    }
  ],
  registros: [
    {
      id: 'reg-1',
      tarefaId: 'tar-1',
      itemId: 'item-1',
      quantidadeContada: 120,
      diferenca: 0,
      classificacao: 'Sem diferença',
      observacao: '',
      usuarioRegistro: 'Wagner',
      dataHoraRegistro: '2026-03-16T10:00:00'
    },
    {
      id: 'reg-2',
      tarefaId: 'tar-1',
      itemId: 'item-2',
      quantidadeContada: 290,
      diferenca: -10,
      classificacao: 'Diferença crítica',
      observacao: 'Solicitar recontagem.',
      usuarioRegistro: 'Wagner',
      dataHoraRegistro: '2026-03-16T10:05:00'
    }
  ],
  analises: []
};
