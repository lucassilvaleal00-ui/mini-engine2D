# Mini Engine — CONTEXTO GERAL (cole no início de cada etapa)

Você vai construir (ou continuar) o "Mini Engine": um site que roda 100% no navegador, hospedado no GitHub Pages (repositório público gratuito), onde eu crio sprites de pixel art, monto cenários, escrevo a lógica, as regras e a história de um jogo com ajuda de IA e rodo o jogo no mesmo lugar. Destino final: jogos 2D top-down em pixel art para celular.

## Telas (todas começam na tela inicial)

1. **Editor de pixel art**: todas as ferramentas para criar sprites, com camadas, quadros e **ações** editáveis.
2. **Gerenciador de pixel art**: pastas, subpastas e sub-subpastas ilimitadas com sprites, cenários e jogos. Em cada sprite salvo existe **"Solicitar IA"**: abre um chat com o sprite já anexado; a IA usa as ferramentas do app e devolve o resultado **no editor, como cópia**, com cada camada separada, para eu revisar, alterar e salvar. O original fica intacto até eu decidir.
3. **Construção de cenário**: painel com todas as pastas de pixel art, onde coloco sprites numa tela com grade. Cada objeto tem **camada de profundidade 1, 2 ou 3** (fundo, meio, frente) e é **sólido** (colide) ou só **decoração**. O cenário guarda referências (id + posição), não cópias, e é salvo nas pastas.
4. **Criar jogo**: chat com a IA para criar **lógica, regras e história**. Eu chamo sprites, partes, pastas e cenários por `@`. O jogo roda em tempo real ao lado (abas Chat | Jogo | Código no celular). **Aqui não se altera sprite nem cenário**; quando falta algo, a IA registra uma lista de pendências.

## Regras técnicas fixas

- HTML, CSS e JavaScript puro (módulos ES), sem frameworks e sem etapa de build.
- Phaser **3.90.0** local em `/vendor/phaser.min.js` (versão registrada em `vendor/vendor.json` e no README). Nunca carregar bibliotecas de links externos. Outras bibliotecas (ex.: JSZip, codificador de GIF) são permitidas **se também ficarem locais em `/vendor`**, com versão anotada.
- Interface em português do Brasil, escura, funcional em celular (toque) e PC (mouse).
- Estrutura: `/src` (módulos: `core/`, `ui/`, `screens/`, `css/`), `/vendor`, `/docs`. Código comentado em português.
- Dados do usuário no IndexedDB, sincronizados com o Supabase (sem servidor próprio). Telas só falam com `core/storage.js`.
- Chaves de API só no localStorage; nunca no código nem enviadas a terceiros, exceto ao provedor escolhido.
- O jogo de teste roda em `<iframe sandbox>` **sem** `allow-same-origin`.
- Cada módulo é independente: se uma etapa futura falhar, as anteriores continuam funcionando.
- **Todas as ações do editor são funções** (criar camada, preencher, espelhar, recolorir, duplicar quadro…), chamadas igualmente pelos botões e pela IA.
- Ao terminar cada etapa: atualizar o README (o que foi feito e como testar) e **PARAR**. Não implementar etapas seguintes sem eu pedir.

## Armazenamento (já implementado na Etapa 1)

- Item: `{ id, tipo: pasta|sprite|cenario|jogo, nome, paiId ("raiz" na raiz), criadoEm, atualizadoEm, resumo? }`; dados pesados em store separada. API: `criarPasta`, `criarItem`, `obter`, `obterComDados`, `salvarDados`, `listarFilhos`, `caminho`, `listarPastas`, `renomear`, `mover`, `duplicar`, `enviarParaLixeira`, `restaurar`, `listarLixeira`, `excluirDefinitivamente`, `esvaziarLixeira`.
- Nomes únicos por pasta; proibidos `/ \ : @ .`; máximo 60 caracteres.
- Excluir manda para a lixeira (lote) com "Desfazer"; restaurar volta à pasta original ou à raiz.

## Editor (já implementado na Etapa 2a)

- Rotas: `#/editor` (criar, abrir ou continuar rascunho) e `#/editor/<idItem>`. Layout: frames no topo, aba Cores à esquerda, tela no centro, aba Chamar IA à direita, ferramentas embaixo.
- **Cada frame é um item sprite separado**, nomeado `base_01`, `base_02`… O editor junta a cadeia ao abrir. Salvar com nome já existente de outro desenho mostra aviso e pede confirmação.
- Código em `src/editor/`: `Controlador` (todas as edições são métodos, sem tela; a IA da Etapa 5 chama os mesmos, em especial `inserirQuadroComPixels` para entregar o resultado em um frame novo), `documento.js` (estado e conversão para o JSON do sprite), `arquivo.js` (convenção `_NN`), `vista.js`, `ferramentas.js`.
- Tamanho do desenho: 4 a 128. Paleta: até 36 itens (transparente + 35 cores).
- Fora do 2a: painel de camadas, ações/propriedades (2b), IA (5). (Exportações e importações: Etapa 3, abaixo.)
- **Imagem de inspiração (Etapa 3):** botão na gaveta da direita. O usuário escolhe uma imagem dele; ela fica ao lado do desenho, o conta-gotas funciona clicando nela, e ela **acompanha o projeto** (guardada no primeiro frame salvo, no campo `reference` do JSON, e no rascunho). **Nunca** entra em PNG, GIF, sprite sheet, frames ou no ZIP de imagens; só no JSON do projeto, se a opção for marcada. Fica fora do desfazer/refazer.

## Arquivos (já implementado na Etapa 3)

- **Exportar** (botão ⬇ no topo do editor): PNG do frame, todos os frames (ZIP), sprite sheet (PNG, com JSON opcional de posições), GIF animado, camadas separadas (ZIP, uma pasta por camada) e JSON do projeto. Ampliação 1×, 2×, 4×, 8×, 16×.
- **Importar** (cartão na escolha e menu do ⬇): JSON do sprite (validado; erros em português e correção automática com lista do que mudou), PNG/JPG/WebP/GIF como desenho novo, como sprite sheet (cortada em frames) ou **só as cores para a paleta** (aviso se passar de 35 cores; reduz por *median cut*).
- **Backup** (tela `#/backup`, rodapé da tela inicial): ZIP com tudo (pastas, sprites, cenários, jogos), `backup.json` + cópias legíveis na mesma árvore de pastas. **Não leva** lixeira, rascunho nem chaves de API. Restaurar cria uma pasta nova "Restaurado em dd-mm-aaaa HHhMM" e **nunca sobrescreve** nada. Lembrete na tela inicial quando faz tempo ou há muita coisa nova.
- **Variações sem IA** (menu ⇄ Transformar): *Mudar o tom das cores* (gira o matiz de toda a paleta, com prévia) e *Cobrir de neve* (a neve cai de cima e pousa no primeiro pixel visível de cada coluna; espessura 1 a 3; este frame ou todos; cor quase branca da paleta ou nova). Espelhar já existia. Cada uma é **um passo** de desfazer. Mesmas funções serão chamadas pela IA: `ctl.deslocarMatiz(graus)` e `ctl.aplicarNeve({ espessura, escopo })`.
- Os codificadores de ZIP, PNG e GIF são próprios (sem biblioteca em `/vendor`).

## Nuvem (já implementado, depois da Etapa 3)

- Sincronização PC ↔ celular com o **Supabase** (projeto `svtvaahkldhjslvvqiir`), sem biblioteca: `core/nuvem.js` (login por e-mail e senha, REST) e `core/sincronia.js` (automática). O IndexedDB continua sendo o banco local; o Supabase mantém os aparelhos iguais. Tela `#/nuvem`.
- Tabela `itens` em `docs/supabase.sql` (uma linha por item, RLS por conta). Conflito vira cópia `nome (conflito)`. Chaves de API e rascunho nunca sobem.
- **Para as próximas etapas:** cenários e jogos salvos pelo `storage.js` já sincronizam sozinhos. Não falar com o IndexedDB por fora do `storage.js`, senão a alteração não sobe.

## Criar jogo (já implementado; feito antes da Etapa 4 a pedido do usuário)

- Rotas `#/jogo` (lista + "＋ Adicionar novo projeto": nome + imagem obrigatórios) e `#/jogo/<id>`. Layout do desenho do usuário: chat à esquerda (lista, "Dicas de comandos", caixa "Escreva aqui…" com 📎, "Modelo IA" e "＋ Nova conversa"); área de teste à direita (ao vivo, PAUSADA enquanto a IA trabalha, BLOQUEADA sem jogo), console e "</> Código". Celular: abas Chat | Jogo | Código.
- Projeto = item `jogo` (dados em `src/jogo/projeto.js`: arquivos, memoria, pendencias, referencias, conversas, versoes). Entra no backup e na nuvem.
- IA: `core/ia.js` (Gemini com chave no cabeçalho `x-goog-api-key`; OpenRouter formato OpenAI). Chaves só no localStorage (`miniengine.ia.chave.<provedor>`). Lista de modelos vem do provedor.
- Protocolo da resposta: explicação + `===ARQUIVO: nome===…===FIM===` (arquivo inteiro), `===APAGAR: nome===`, `===MEMORIA===`, `===PENDENCIAS===`. Regras em `src/jogo/conversa.js` (REGRAS).
- Conversas ligadas: cada pedido leva a memória do projeto, os arquivos atuais, os assets e os títulos das outras conversas; só as últimas 16 mensagens da conversa atual.
- `@`: `@desenho`, `@pasta/`, `@desenho.camada`, `@cenário`, `@[nome com espaço]`; `@desenho:ação` aceita, mas usa o desenho inteiro até existirem ações (2b). Desenho = cadeia `base_NN`; vira spritesheet `key` + animação pronta. No jogo: `carregarAssets(this)` no preload e `criarAnimacoes(this)` no create; `ASSETS`, `CENARIOS`, `DADOS`.
- Jogo em `<iframe sandbox="allow-scripts">` (srcdoc); cada .js vira um blob (erros com arquivo e linha); pausar/continuar por postMessage; correção automática até 3 vezes; versões com "Desfazer esta mudança".
- O "Chamar IA" do editor já tem o botão Modelo IA (mesma escolha/chaves do Criar jogo). Imagens anexadas no chat: a IA recebe a versão até 1024 px; o projeto guarda só miniaturas (160 px).
- **Ainda falta da Etapa 5:** o "Solicitar IA" nos sprites (com o comando `aprimorar`, mostrar o resultado antes e entregar frame por frame), que vai reaproveitar o `core/ia.js`.

## Pedidos do usuário para as próximas etapas (registrados na Etapa 3, ainda NÃO implementados)

**Para a Etapa 5 (chat com IA e "Solicitar IA"):**
- Comando **`aprimorar`**: faz a IA refazer um trabalho com mais cuidado e precisão. (Sugestão de como: reabrir o resultado anterior, conferir cada detalhe contra o pedido e a imagem de inspiração e entregar a versão melhor num frame novo, sem apagar a anterior. A forma exata fica para decidir na Etapa 5.)
- A IA **sempre mostra o resultado primeiro**, antes de qualquer coisa ser salva ou aplicada.
- Quando o pedido envolver **mais de um frame** (ex.: "faça o andar"), a IA entrega **frame por frame**: mostra um, o usuário vê, e segue para o próximo; nunca despeja todos de uma vez.
- Ao montar o JSON do sprite para a IA, **tirar o campo `reference`** (imagem de inspiração em base64): ele é enorme e só deve ir se o usuário anexar a imagem de propósito.

**Para a Etapa 4 (construtor de cenário):**
- Mover os itens **segurando e arrastando** (toque e mouse), com a profundidade valendo ao vivo: cada item tem ordem 1, 2 ou 3 (fundo, meio, frente); se um item de ordem 2 for arrastado para trás de um item de ordem 3, o de ordem 2 deve ficar **escondido atrás** do de ordem 3 (o de ordem 3 é sempre desenhado por cima). Assim o usuário tem noção do que está montando enquanto mexe.

## Sintaxe `@` no chat de "Criar jogo"

`@pasta/` (pasta inteira, com subpastas) · `@guerreiro` (sprite com todas as ações) · `@guerreiro:andar` (uma ação) · `@guerreiro:andar.roupa` (uma camada) · `@floresta` (cenário). O app envia à IA só um **resumo** (nome, tamanho, ações, camadas) e a IA pede o detalhe por `ler_sprite` / `ler_cenario` quando precisar.

## Formato do sprite (JSON)

```json
{
  "version": 1, "name": "cavalo", "size": [32, 32],
  "palette": ["transparent", "#3b2a1a", "#8b5a2b"],
  "layers": [{ "name": "corpo", "frames": [["0000...", "0011..."]] }],
  "fps": 8,
  "reference": { "name": "cavalo.png", "data": "data:image/png;base64,...", "width": 600, "height": 400 }
}
```

- `reference` é opcional (imagem de inspiração; só no primeiro frame da cadeia). Não vai para a IA nem para imagens exportadas.
- Cada quadro é um array de strings (uma por linha); cada caractere é um índice da paleta (0-9, a-z, até 36 cores); `0` é transparente.
- Um quadro também pode ser definido só por transformações das camadas base: `{"layers":{"pata_esq":{"dx":2,"dy":-1}}}`.
- **Ações (proposta, a fechar na Etapa 2):** cada ação é um objeto do sprite com nome `acao_direcao` (minúsculas, sem acento), quadros, `fps`, `loop`, `flipX` e a ação de origem quando for espelho; mais `origem` e `hitbox` do sprite. Os nomes das camadas se repetem entre as ações (`corpo`, `roupa`, `arma`…). O **app** monta o nome final a partir de `(personagem, acao, direcao)`; a IA nunca inventa nomes. Vocabulário editável, inicial: parado, andar, correr, agachar, pular, atacar, morrer. Direita pode ser o espelho da esquerda.

## Formato do assets.json (gerado pelo app para o jogo)

```json
{ "version": 1, "sprites": { "guerreiro": {
  "file": "guerreiro_sheet.png", "frameWidth": 32, "frameHeight": 32,
  "origin": [0.5, 1], "hitbox": { "x": 8, "y": 16, "width": 16, "height": 14 },
  "animations": {
    "andar_baixo":   { "start": 0, "end": 5, "fps": 8, "loop": true },
    "andar_direita": { "flipX": true, "of": "andar_esquerda" } } } } }
```

O app monta o `assets.json` sozinho a partir dos sprites e cenários que eu citei no chat; a exportação manual deixa de ser obrigatória.

## Limites a respeitar

- A IA desenha mal pixel a pixel. As ferramentas dela são **operações de alto nível** (recolorir, espelhar, mover camada no quadro, duplicar quadro, contorno, neve), não "pintar o pixel x,y". O melhor fluxo é eu desenhar o personagem parado e pedir as ações a partir dele.
- Jogos simples a IA faz bem; quanto maior o jogo, mais ela esquece. Manter o código em arquivos pequenos, com `JOGO.md` (regras), `HISTORIA.md` (enredo) e falas/missões em JSON.
- O navegador pode apagar o IndexedDB: por isso o backup em ZIP (Etapa 3, já feito) e `navigator.storage.persist()`.

## Etapas

1. ✔ Tela inicial, armazenamento por tipo de item e gerenciador de pastas (com lixeira).
2. Editor de pixel art: ✔ 2a feita (ver seção Editor); falta (b). Plano original: (a) desenho, camadas, quadros, onion skin, animação, salvamento nas pastas; (b) painel de ações e propriedades (origem, hitbox, flipX). Pronto quando: desenho um cavalo em camadas, crio 4 quadros, vejo animar, fecho o navegador e reabro com tudo salvo.
3. ✔ Importar/exportar JSON, PNG, sprite sheet, GIF, camadas separadas, importar PNG para a paleta (aviso acima de 36 cores), ZIP de backup, variações sem IA (trocar cor, espelhar, "neve"), validação de JSON com mensagem clara e correção automática. Mais a imagem de inspiração (ver seção Editor).
4. Construção de cenário (referências, 3 camadas de profundidade, sólido/decoração, salvo nas pastas).
5. ✔ Módulo de chat com IA (Gemini e OpenRouter) — falta o **"Solicitar IA"** nos sprites, devolvendo cópia no editor.
6. ✔ Criar jogo: projetos com imagem, chat, `@`, iframe de teste, console de erros, correção automática (até 3 tentativas), versões com desfazer, pendências, conversas ligadas. (Feito antes da Etapa 4.)
7. Entrega: ZIP do jogo, PWA instalável (ou Capacitor, que exige PC com Node e Android Studio), sincronização opcional com GitHub por token restrito a um repositório, README final.
