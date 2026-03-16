# Inventário Materiais - PWA V1

Primeira versão de um PWA para apoiar a gestão do inventário anual da Unidade de Materiais.

## O que esta V1 já faz

- cadastro e visualização de equipes de contagem
- campanha inicial de inventário
- base inicial de itens com os 4 almoxarifados
- filtro para ocultar itens zerados
- criação de tarefas de contagem
- registro manual de contagem por item
- classificação automática de divergências
- geração de tarefas de recontagem
- dashboards gerenciais
- emissão visual de lista física e lista de recontagem
- backup em JSON dos dados locais
- comportamento de PWA com manifest + service worker básico

## Tecnologias

- React
- Vite
- localStorage para persistência local

## Como rodar

```bash
npm install
npm run dev
```

## Como gerar build

```bash
npm run build
npm run preview
```

## Observações importantes

- Os dados desta V1 ficam salvos no navegador via `localStorage`.
- O botão **Resetar dados** restaura o estado inicial.
- O botão **Exportar backup** salva um JSON com os dados atuais.
- Esta versão é ideal como base de validação funcional e pode evoluir depois para backend/API.

## Próximos passos sugeridos

- importação real de CSV/XLSX
- múltiplas campanhas
- autenticação por perfis
- emissão real em PDF
- histórico completo por item com trilha de auditoria
- integração com leitura por código de barras/QR Code
