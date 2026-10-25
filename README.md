# Mini Engine

Site que roda 100% no navegador (HTML, CSS e JavaScript puro, sem build) para criar sprites de pixel art, montar cenários e, nas próximas etapas, criar jogos 2D com ajuda de IA. Hospedado no GitHub Pages; os dados ficam no IndexedDB do navegador, sem backend.

**Etapa atual: 2a de 7 — concluída** (editor de pixel art: desenho, frames, paleta e salvamento nas pastas). A Etapa 1 (tela inicial, armazenamento e gerenciador) continua como estava.

## O que a Etapa 1 entrega

- **Tela inicial** com as quatro portas: Editor de pixel art, Gerenciador de pixel art, Construção de cenário e Criar jogo. Só o Gerenciador está pronto; as outras abrem uma tela provisória que mostra o que virá.
- **Gerenciador** com pastas, subpastas e sub-subpastas ilimitadas: criar, renomear, mover, duplicar (com todo o conteúdo) e enviar para a lixeira.
- **Lixeira** com restaurar, excluir para sempre e esvaziar. Excluir uma pasta leva todo o conteúdo junto, e o aviso "Desfazer" traz tudo de volta na hora.
- **Armazenamento por tipo de item** (`sprite`, `cenario`, `jogo`, além de `pasta`), já pronto para o editor, o construtor de cenários e o criador de jogos guardarem seus dados no mesmo lugar.
- **Phaser 3.90.0** incluído localmente em `vendor/`, com uma página de **Diagnóstico** que prova que ele carrega e desenha.
- Interface escura em português, feita para toque (celular) e mouse (PC).

## O que a Etapa 2a entrega (editor de pixel art)

- **Criar ou abrir:** ao entrar no Editor, o app pergunta. *Criar* pede **nome, largura e altura** (4 a 128 pixels; atalhos 16, 32, 48 e 64). *Abrir* mostra as suas pastas com os desenhos salvos; tocar em um desenho abre o editor com ele. Se você saiu sem salvar, aparece também *Continuar rascunho*.
- **Layout:** frames no topo, aba **Cores** retrátil à esquerda, tela de desenho transparente no centro, aba **Chamar IA** retrátil à direita e as ferramentas embaixo. No celular as abas abrem por cima do desenho e fecham ao tocar de novo; no computador elas empurram o desenho.
- **Ferramentas (inspiradas no Piskel):** Lápis `P`, Borracha `E`, Balde `B` (com "todas da mesma cor"), Linha `L`, Retângulo `R`, Círculo/elipse `C` (vazados ou preenchidos), Conta-gotas `O`, Selecionar `Q` (arrastar de dentro move o conteúdo), Mover tudo `M` e Mão `H`. Opções: pincel 1 a 4 (`[` e `]`), espelho ↔ ↕ ✛ (desenha simétrico), grade `G` e papel cebola `U` (mostra o frame anterior esmaecido).
- **Zoom e movimento:** botões ＋ － ⤢, `+`/`-`, roda do mouse, pinça no celular. Para mover a vista: ferramenta Mão, botão do meio do mouse, barra de espaço ou dois dedos.
- **Desfazer/refazer** (até 50 passos): botões ou `Ctrl+Z` / `Ctrl+Y`.
- **Transformar** (botão ⇄ no topo): espelhar o frame ou todos os frames (ex.: andar para a esquerda → direita), girar 90°, limpar o frame; com uma seleção ativa, age só nela.
- **Frames:** *Adicionar frame*, duplicar, excluir, mover ◀ ▶, prévia animada com play/pause e fps.
- **Paleta:** 16 cores prontas (Sweetie 16, domínio público) mais a transparente. *Adicionar* abre um seletor no estilo do Piskel (quadrado de saturação/brilho, barra de matiz e campo `#hex`); *Editar* troca a cor **em todos os pixels que a usam**; *Apagar* avisa quantos pixels ficarão transparentes e dá para desfazer. Máximo de 36 itens (35 cores + transparente), por causa do formato do sprite.
- **Salvar:** pede o nome (pode mudar) e a pasta (com **＋ Nova pasta** dentro do próprio diálogo). **Cada frame vira um arquivo separado**: `heroi_01`, `heroi_02`… (3 dígitos a partir de 100 frames). Se já existir arquivo com o mesmo nome na pasta, aparece um **aviso** e o botão passa a dizer *Substituir*. Salvar de novo o mesmo desenho atualiza os mesmos arquivos (sem aviso); se você tiver apagado frames, os arquivos que sobram vão para a lixeira.
- **Abrir uma cadeia:** o editor junta `heroi_01`, `heroi_02`… em **um desenho só**. No Gerenciador, tocar em qualquer um deles abre o desenho inteiro. Arquivos com tamanho diferente do resto da cadeia ficam de fora (com aviso). Um sprite sem sufixo (como os de exemplo do Diagnóstico) abre normalmente e ganha `_01` ao ser salvo.
- **Rascunho automático:** cerca de 1 segundo depois de qualquer alteração o app guarda um rascunho no navegador. Se a aba fechar, o celular reiniciar ou você tocar em voltar, o desenho volta pelo botão *Continuar rascunho*. Rascunho **não** é o mesmo que salvar: só o *Salvar* cria os arquivos nas pastas.
- **A aba "Chamar IA" ainda é só visual.** Ela mostra como vai funcionar (a IA usa as mesmas ferramentas do editor, entrega o resultado **em um frame novo**, aceita imagem de inspiração e pode partir do zero ou do primeiro frame), mas o chat de verdade chega na Etapa 5.

**Ainda não está nesta parte:** painel de camadas (o formato do arquivo já suporta várias camadas, falta o painel), ações como "andar" e "correr" e propriedades como origem e hitbox (Etapa 2b), exportar PNG/GIF e backup em ZIP (Etapa 3).

## Como testar a Etapa 2a ("pronto quando")

1. Tela inicial → **Editor de pixel art** → **Criar**. Digite `heroi`, escolha 32×32 e confirme.
2. Desenhe com o lápis; escolha outra cor na aba **Cores**. Teste borracha, balde, linha, retângulo e círculo. `Ctrl+Z` desfaz.
3. Toque em **Adicionar frame**, desenhe algo diferente e use o play da prévia para ver a animação.
4. Na aba **Cores**, toque em **Adicionar**, mude a cor no quadrado e na barra e confirme. Desenhe com ela, depois use **Editar** e veja os pixels mudarem de cor. Tente **Apagar** uma cor.
5. Toque em **Salvar**, crie a pasta `Personagens` pelo diálogo e salve. No **Gerenciador**, a pasta tem `heroi_01` e `heroi_02`.
6. Volte ao Editor → **Criar** → mesmo nome `heroi` → desenhe um pixel → **Salvar** em `Personagens`: o aviso de nome repetido aparece e o botão vira *Substituir*. Troque o nome e o aviso some.
7. Saia pela seta no topo (confirme *Sair e guardar rascunho*), volte ao Editor e use **Continuar rascunho**.
8. Editor → **Abrir** → `Personagens` → `heroi`: os 2 frames voltam como estavam. Feche o navegador por completo, reabra e repita.
9. No celular, confira que as abas **Cores** e **Chamar IA** abrem e fecham, e que o dedo desenha.

## Como testar no computador

O app usa módulos ES, e o navegador **não os carrega ao abrir o `index.html` com duplo clique** (`file://`). É preciso um servidor local simples. Dentro da pasta do projeto:

```bash
python3 -m http.server 8000
# ou: npx serve
```

Abra `http://localhost:8000`. No Windows, se o comando `python3` não existir, use `python -m http.server 8000`.

## Como publicar no GitHub Pages

1. Crie um repositório **público** no GitHub (por exemplo `mini-engine`).
2. Envie os arquivos **para a raiz do repositório** (o `index.html` precisa ficar na raiz, não dentro de uma subpasta):
   - **Pelo site:** em *Add file → Upload files*, arraste o **conteúdo** da pasta (`index.html`, `src`, `vendor`, `docs`, `README.md`) e confirme com *Commit changes*.
   - **Pelo Git:**
     ```bash
     git init
     git add .
     git commit -m "Etapa 1"
     git branch -M main
     git remote add origin https://github.com/SEU-USUARIO/mini-engine.git
     git push -u origin main
     ```
3. No repositório, abra *Settings → Pages*. Em *Build and deployment*, escolha *Source: Deploy from a branch*, *Branch: main*, pasta */(root)* e salve.
4. Em 1 a 2 minutos o site fica em `https://SEU-USUARIO.github.io/mini-engine/`.
5. Depois de enviar uma atualização, se o navegador mostrar a versão antiga, recarregue ignorando o cache (Ctrl+Shift+R no PC; no celular, limpe os dados do site ou abra em aba anônima).

> Os desenhos ficam no navegador de **cada aparelho**. O PC e o celular não compartilham dados até existir a exportação/backup (Etapa 3).

## Como testar a Etapa 1 ("pronto quando")

1. Na tela inicial aparecem as 4 opções.
2. *Gerenciador de pixel art* → **＋ Nova pasta** → crie `Personagens`, entre nela, crie `Inimigos`, entre e crie `Slimes`. A trilha no topo mostra `Raiz › Personagens › Inimigos › Slimes`, e o botão voltar do aparelho sobe um nível.
3. Tente criar outra pasta com o mesmo nome, ou com `/`, `:`, `@` ou `.` no nome: o app explica o erro sem perder o que você digitou.
4. Abra *Diagnóstico* (rodapé da tela inicial) e toque em **🧪 Criar exemplos de teste**. Volte ao gerenciador e abra a pasta `Exemplo`: há sprites e um cenário de mentira para testar.
5. No menu **⋮** de um item: renomear, mover para… (escolhendo a pasta numa árvore), duplicar e enviar para a lixeira. Teste **Desfazer** logo após excluir.
6. Na **Lixeira**: restaurar (volta à pasta de origem, ou à raiz se ela não existir mais) e excluir para sempre.
7. Feche o navegador por completo, reabra o site e confira que tudo continua lá.
8. No Diagnóstico, **▶ Testar Phaser** mostra um quadrado animado e confirma a versão `3.90.0`.

## Phaser 3 (como está vinculado)

- Arquivo: `vendor/phaser.min.js`, versão **3.90.0** (registro em `vendor/vendor.json`, com o hash SHA-256 do arquivo). Vem do pacote oficial `phaser@3.90.0` do npm.
- É carregado em `index.html` por `<script defer src="vendor/phaser.min.js">` e fica disponível como a variável global `Phaser`. Nunca carregue o Phaser (nem outra biblioteca) de links externos.
- Para atualizar dentro da série 3.x: baixe o novo `phaser.min.js`, troque o arquivo e atualize `vendor/vendor.json` e este README. **Não use o Phaser 4**: a API mudou e o código gerado pela IA assume a série 3.
- Nas etapas 4 a 6, o jogo de teste roda dentro de um iframe isolado que carrega este mesmo arquivo local.

## Estrutura de pastas

```
index.html            entrada do site
src/
  main.js             registra as telas e liga o roteador
  core/               regras, sem interface
    db.js             IndexedDB (stores: itens, dados, meta)
    storage.js        API de armazenamento usada pelas telas
    tipos.js          tipos de item e constantes
    modelos.js        sprite/cenário em branco
    router.js         rotas por hash (#/gerenciador/ID) e botão voltar
  ui/                 dom.js, dialogos.js, toast.js, formato.js
  editor/             o editor de pixel art (etapa 2a), em módulos pequenos
    documento.js      modelo do desenho, paleta padrão, conversão de/para o JSON do sprite
    controlador.js    todas as ações de edição como funções + desfazer/refazer (sem tela)
    algoritmos.js     linha, elipse, balde, espelhar, girar… (sem tela)
    ferramentas.js    lápis, borracha, balde, linha, retângulo, círculo, conta-gotas, seleção, mover, mão
    vista.js          tela de desenho: zoom, mover, grade, cebola, toque e mouse
    arquivo.js        salvar/abrir os frames nas pastas (nome_01, nome_02…) e rascunho
    painel-*.js, barra-ferramentas.js, seletor-cor.js, dialogos-editor.js, icones.js, render.js
  screens/            inicio, gerenciador, lixeira, diagnostico, editor, em-breve
  css/                app.css (tema escuro) e editor.css
vendor/               phaser.min.js + vendor.json
docs/                 ARQUITETURA.md e CONTEXTO.md
```

## Regras de nome (valem para pastas e itens)

- Até 60 caracteres; não pode haver dois itens com o mesmo nome **na mesma pasta** (sem diferenciar maiúsculas).
- Os símbolos `/ \ : @ .` são proibidos porque serão usados para chamar itens no chat da IA (`@pasta/`, `@sprite`, `@sprite:acao.camada`).

## Limites conhecidos

- **O navegador pode apagar os dados do site** se o aparelho ficar sem espaço (principalmente o Safari do iPhone, que limpa sites não usados por semanas). O app pede armazenamento persistente quando você salva o primeiro item, mas o navegador pode recusar. A proteção de verdade será o backup em ZIP da Etapa 3.
- Uma aba anônima não guarda nada depois de fechada.

## Próximas etapas

| # | Etapa |
|---|-------|
| 1 | Tela inicial, armazenamento e gerenciador de pastas ✔ |
| 2 | Editor de pixel art — **2a: desenho, frames, paleta, salvar ✔** · camadas (painel) · 2b: ações e propriedades |
| 3 | Importar/exportar e backup em ZIP |
| 4 | Construção de cenário |
| 5 | Módulo de chat com IA e "Solicitar IA" nos sprites |
| 6 | Criar jogo (chat, teste ao vivo, correção automática) |
| 7 | Entrega (ZIP do jogo, PWA ou Capacitor, sincronização com GitHub) |

Detalhes das decisões em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). O texto de contexto para colar no início de cada nova etapa está em [`docs/CONTEXTO.md`](docs/CONTEXTO.md).
