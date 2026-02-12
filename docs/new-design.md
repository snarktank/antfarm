ANTFARM — Plano de Redesign Visual e UX (v1.0)

Tipo: Documento de especificação de UI/UX
Escopo: Dashboard Kanban + Arquitetura visual do produto
Foco: Agentes + Tarefas (sem usuários humanos na interface)
Paradigma: Mission Control para orquestração de IA

1) Visão de Produto (Norte Conceitual)

O Antfarm não é um Kanban de tarefas humanas.
Ele é um painel de comando de um enxame de agentes de IA que executam, verificam e refinam trabalho técnico.

O redesign deve transmitir três ideias ao mesmo tempo:

Sistema vivo — agentes estão sempre “trabalhando”.

Precisão técnica — nada é infantil ou cartunesco.

Controle humano estratégico — o operador observa, prioriza e intervém quando necessário.

Metáfora central:

“Uma ponte de comando onde colunas são estações e cards são agentes em ação.”

2) Estrutura Geral da Interface (Nova Arquitetura Visual)

A UI será dividida em três camadas fixas:

2.1 — Barra Superior (Mission Control Bar)

Posição: Topo fixo da página
Altura sugerida: 64px

Elementos (da esquerda para a direita):

ANTFARM | [Workflow Selector] | Auto-refresh: 30s | Dark Mode Toggle

Especificação visual:

Fundo: cinza muito escuro (#0B0F14)

Texto: branco suave (#E6E9ED)

Separadores: linhas finas semi-transparentes

O nome ANTFARM deve ser em tipografia monoespaçada moderna ou geométrica.

2.2 — Barra de Abas (Modo de Visualização)

Logo abaixo da barra superior:

[ Overview ]  [ Kanban ]  [ Agents ]  [ Logs ]  [ Metrics ]


Comportamento:

Aba ativa sublinhada com linha neon sutil.

Por padrão, Kanban é a aba inicial.

Nota: Nesta versão do redesign, o foco principal é Kanban, mas a UI já nasce preparada para múltiplas visões.

2.3 — Área Principal (Canvas de Trabalho)

Aqui vive o Kanban.
Ele deve ocupar toda a largura da tela, com scroll horizontal se necessário.

3) Kanban — Nova Estrutura Visual
3.1 — Colunas (Estações de Trabalho)

As colunas permanecem as mesmas:

PLAN

SETUP

IMPLEMENT

VERIFY

TEST

PR

REVIEW

Porém, cada coluna agora é tratada como um módulo independente.

Cada coluna terá:

Cabeçalho com:

Nome da coluna

Ícone simbólico sutil

Contador de tarefas (ex: 2 tasks)

Fundo levemente diferenciado (variação mínima de tom).

Bordas arredondadas suaves.

Leve sombra para separação visual.

Metáforas por coluna (para orientar design):
Coluna	Identidade Visual
PLAN	Sala de estratégia
SETUP	Laboratório de configuração
IMPLEMENT	Fábrica inteligente
VERIFY	Centro de validação
TEST	Ambiente de simulação
PR	Ponte de integração
REVIEW	Tribunal técnico
3.2 — Botão de Ação por Coluna

No topo de cada coluna:

+ Nova tarefa


Botão com:

Cor neutra padrão

Hover com leve brilho

Sem efeitos exagerados.

4) Cards — O Coração do Sistema

Cada card não representa uma pessoa, mas sim um agente executando uma tarefa.

4.1 — Estrutura de um Card (Layout)

Cada card terá quatro camadas visuais:

A) Cabeçalho do card

Nome da tarefa (curto e direto)

Ícone do tipo de tarefa (ex: código, análise, teste, revisão)

B) Agente responsável

Avatar estilizado do agente (símbolo, não rosto humano).

Nome do agente (ex: “Forge”, “Scout”, “Verifier”).

C) Estado do agente

Um dos três estados visíveis:

RUNNING → bolinha verde pulsante

IDLE → bolinha amarela estática

DONE → bolinha cinza

Opcional: texto pequeno abaixo:

“Last run: 3 minutes ago”

D) Indicador de progresso

Barra de progresso fina
OU

Anel circular discreto no canto do card.

4.2 — Micro-Interações (UX Avançada)

Quando o mouse passa sobre o card:

Leve elevação (shadow maior)

Brilho sutil nas bordas

Pequeno tooltip com resumo do último log do agente.

5) Paleta de Cores (Sistema Visual)
Tema Dark (Padrão)

Fundo principal: #0B0F14

Cards: #111827

Bordas: rgba(255,255,255,0.08)

Texto primário: #E6E9ED

Texto secundário: #A8B1C0

Cores de status

RUNNING: Verde neon suave #2DFF7A

IDLE: Amarelo âmbar #FFC83D

DONE: Cinza azulado #6B7280

6) Hierarquia Visual (Regra de Ouro)

O olhar do usuário deve percorrer a tela assim:

Barra superior → “Onde estou?”

Abas → “Que modo estou vendo?”

Colunas → “Em que fase estão as tarefas?”

Cards → “O que cada agente está fazendo agora?”

Nada pode quebrar esse fluxo.

7) Comportamento Dinâmico (Sistema Vivo)

O dashboard deve parecer “respirar”.

Elementos dinâmicos desejados:

Pulso suave em cards RUNNING

Atualização automática a cada 30s

Mudança de coluna automática quando status muda

Pequenos fades ao mover cards

Nada chamativo — apenas orgânico.

8) Limites Claros (O que NÃO fazer)

Não usar:

Fotos de pessoas reais

Avatares cartunescos

Cores neon exageradas

Animações tipo “game”

Emojis em cards

O Antfarm é técnico, não lúdico.

9) Roadmap de Implementação (Ordem Recomendada)
Fase 1 — Estrutura (Semana 1)

Criar nova barra superior

Implementar abas básicas

Redesenhar colunas visualmente

Fase 2 — Cards (Semana 2)

Novo layout de cards

Estados RUNNING/IDLE/DONE

Barra de progresso

Fase 3 — Dinâmica (Semana 3)

Auto-refresh visual

Micro-animações

Tooltips inteligentes

Fase 4 — Evolução (Futuro)

Aba “Agents” mostrando todos os agentes em tempo real

Aba “Logs” com histórico de execuções

Aba “Metrics” com gráficos de produtividade.

10) Resultado Esperado

Ao final desse redesign, o Antfarm deve parecer:

“O cockpit onde humanos comandam um enxame de agentes inteligentes.”

Não um quadro de tarefas.
Não um Trello sofisticado.
Mas um sistema operacional visual para IA.