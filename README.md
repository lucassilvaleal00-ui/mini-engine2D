# Mini Engine

Site que roda 100% no navegador (HTML, CSS e JavaScript puro, sem build) para criar sprites de pixel art, montar cenários e, nas próximas etapas, criar jogos 2D com ajuda de IA. Hospedado no GitHub Pages; os dados ficam no IndexedDB do navegador, sem backend.

**Situação:** prontas as Etapas 1, 2a, 3, **4 (Construção de cenário)**, 5 (módulo de IA) e 6 (Criar jogo), mais a sincronização PC ↔ celular (Supabase). O Gerenciador ganhou miniaturas e a vista em blocos, e o Modelo IA ganhou o campo da chave da PixelLab. Ainda faltam o painel de camadas, a Etapa 2b (ações e propriedades), o "Solicitar IA" nos sprites e a Etapa 7 (entrega).

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

**Ainda não está nesta parte:** painel de camadas (o formato do arquivo já suporta várias camadas, falta o painel) e ações como "andar" e "correr" com propriedades como origem e hitbox (Etapa 2b).

## O que a Etapa 3 entrega (arquivos, inspiração, variações e backup)

- **Imagem de inspiração:** na lateral direita do editor, a aba com ícone de imagem (*Imagem de inspiração*) abre um painel ao lado do desenho. Escolha uma imagem sua (PNG, JPG, WebP ou GIF) e ela fica ali para você olhar e copiar. **O conta-gotas funciona nela**: toque ou clique na imagem para pegar uma cor (se a cor não estiver na paleta, ela é acrescentada). Arraste para mover a imagem; role ou use dois dedos para dar zoom. Ela **acompanha o projeto**: é guardada junto com o primeiro frame salvo e no rascunho, e volta quando você abrir o desenho de novo. **Nunca aparece** nos PNG, GIF, sprite sheet ou frames exportados; só vai no arquivo JSON do projeto, e só se você marcar essa opção.
- **Exportar** (botão ⬇ no topo do editor → *Exportar*), sempre com prévia e ampliação de 1× a 16×:
  - **Imagem PNG** do frame atual (`Nome_01.png`);
  - **Todos os frames** em um ZIP de PNGs;
  - **Sprite sheet** (PNG, com a opção de um JSON com a posição de cada frame, em ZIP);
  - **GIF animado** (usa o fps do desenho);
  - **Camadas separadas** (ZIP com uma pasta por camada; só aparece quando há mais de uma camada);
  - **Arquivo do projeto (JSON)**, o mesmo formato do sprite, para guardar ou levar a outro aparelho.
- **Importar** (cartão *Importar* na tela do editor, ou ⬇ → *Importar*):
  - **JSON** de sprite, com validação: se o arquivo estiver quebrado, a mensagem diz o que e onde; se estiver quase certo (cor repetida, linha curta, nome com símbolo proibido…), o app **corrige sozinho** e mostra a lista do que mudou antes de você aceitar;
  - **Imagem** (PNG, JPG, WebP, GIF) como **desenho novo**, como **sprite sheet** (você diz o tamanho de cada frame e ela é cortada) ou **só as cores** (entram na paleta do desenho que está aberto; essa opção só aparece quando há um desenho aberto). Imagens com mais de 35 cores são reduzidas, com aviso.
- **Variações sem IA** (botão ⇄ *Transformar*, quando não há seleção): **Mudar o tom das cores** gira o matiz de toda a paleta de uma vez (o herói vermelho vira verde, azul…), com prévia; **Cobrir de neve** pinta de quase branco o topo do desenho (a neve cai de cima e pousa no primeiro pixel visível de cada coluna; espessura de 1 a 3 pixels; neste frame ou em todos). Espelhar, que já existia, também faz parte das variações. Cada uma é **um passo só** de desfazer.
- **Backup em ZIP** (rodapé da tela inicial → *Backup*, rota `#/backup`):
  - **Baixar backup**: um ZIP com pastas, sprites, cenários e jogos, mais cópias legíveis na mesma organização de pastas e um `LEIA-ME.txt`. **A lixeira, o rascunho e as chaves de API não entram.**
  - **Restaurar**: mostra o que há no arquivo e pergunta; cria uma pasta nova chamada `Restaurado em dd-mm-aaaa HHhMM` com tudo dentro. **Nada do que você tem é apagado ou substituído.**
  - A tela inicial lembra de fazer backup quando você nunca fez ou quando já faz tempo e há coisas novas (dá para adiar o lembrete).
- Os codificadores de ZIP, PNG e GIF foram escritos para o projeto (sem biblioteca extra em `vendor/`).

**Pedidos já registrados, para as etapas certas** (ainda **não** implementados, porque dependem de telas que não existem): na Etapa 5 (IA) o comando **"aprimorar"**, a IA **mostrar o resultado primeiro** e entregar **frame por frame** quando o pedido tiver vários frames; na Etapa 4 (cenário) **mover os itens segurando e arrastando**, respeitando a ordem de profundidade 1, 2 e 3. Os detalhes estão em [`docs/CONTEXTO.md`](docs/CONTEXTO.md), e a aba "Chamar IA" já lista isso.

## Últimos ajustes do editor e do cenário

- **＋ Novo desenho** no topo do editor: começa outro desenho sem sair. Se o atual tiver alterações não salvas, o app pergunta: **Salvar agora**, **Guardar como rascunho** ou **Descartar as alterações**.
- **Vários rascunhos:** cada desenho não salvo tem o seu (até 10), e todos aparecem na tela do editor em "Continuar rascunho".
- **Borracha e lápis maiores:** **Ctrl +** aumenta e **Ctrl −** diminui (de 1×1 até 16×16). Também há os botões − e + na barra e as teclas [ e ]. O contorno sob o mouse mostra o tamanho.
- **Cenário: ferramenta Selecionar** (embaixo, à esquerda; ao lado da ✋ Mão). Toque num objeto: aparece uma barra em cima com **Nível 1 Fundo / 2 Meio / 3 Frente**, ⧉ duplicar, **🗑 Apagar** e ✕. Se houver objetos empilhados, tocar de novo passa para o de baixo.
- O cenário continua pedindo a **grade** (8, 16, 32 ou 64) e o tamanho ao ser criado.

## Construção de cenário (Etapa 4)

- **Tela inicial → Construção de cenário**: lista os cenários (com miniatura). **＋ Novo cenário** pergunta primeiro o **nome**, depois o tamanho da célula da grade (8, 16, 32 ou 64 px, o mesmo dos seus sprites), o tamanho em células e a pasta onde guardar.
- **Construtor** (como no seu desenho):
  - **à esquerda, as pastas e arquivos**, com a imagem do 1º frame de cada desenho;
  - **no centro, a tela gigante com grade**: dá zoom (roda do mouse, pinça, ＋ －), move a vista (arraste no vazio, ✋, Espaço ou dois dedos) e ⤢ mostra tudo;
  - **à direita, as informações** do objeto selecionado: frame, **nível 1 Fundo / 2 Meio / 3 Frente**, Sólido (colide) ou Decoração, posição, espelhar, para a frente e para trás no nível, duplicar e remover. Sem nada selecionado, aparecem as informações do cenário: ver só alguns níveis, encaixar na grade, cor de fundo e tamanho;
  - **no celular**, os painéis abrem pelos botões 📁 Arquivos e ℹ Info.
- **Colocar:** toque num desenho; se ele tiver **vários frames, o app pergunta qual frame colocar**. Depois toque no cenário, quantas vezes quiser, e na faixa de cima escolha o nível. **✕ Parar** ou Esc encerra.
- **Mover:** segure e arraste. A profundidade vale na hora: um objeto do nível 2 arrastado para trás de um do nível 3 fica **escondido atrás dele**.
- **Atalhos (PC):**
  - Delete remove o objeto;
  - as setas movem uma célula (com Shift, 1 pixel);
  - 1, 2 e 3 mudam o nível;
  - Ctrl+D duplica;
  - Ctrl+Z e Ctrl+Y desfazem e refazem.
- **Salva sozinho** a cada mudança e sincroniza com a nuvem. O cenário guarda **referências** aos frames, não cópias: se você editar o sprite, o cenário muda junto.
- **No Criar jogo**, chame com `@nomeDoCenario`. A IA recebe uma imagem por nível e a lista de objetos sólidos, e monta com `montarCenario(this, 'chave')`: o fundo, o meio e a frente ficam em profundidades diferentes, e o jogador pode passar atrás da frente.

## Gerenciador: miniaturas e blocos

- Cada desenho aparece com a **imagem do primeiro frame**, o jogo com a imagem do projeto e o cenário com a miniatura dele.
- **☰ Lista / ▦ Blocos** troca a visualização da pasta, e a escolha fica lembrada neste aparelho.

## Chaves de IA

- **Gemini:** https://aistudio.google.com/apikey
- **OpenRouter:** https://openrouter.ai/keys (entre na conta → *Keys* → *Create Key*; a chave começa com `sk-or-`).
- **PixelLab** (gera pixel art): https://www.pixellab.ai/account (entre na conta e copie o *API token*; é paga por uso). Fica em **Modelo IA → Chave da PixelLab**, com o botão "Salvar e testar". Ela será usada pelo "Solicitar IA" dos sprites.
- Todas as chaves ficam só no aparelho onde você colou: não vão para a nuvem, nem para o backup, nem para o jogo.

## Criar jogo (chat com a IA + teste ao vivo)

- **Tela inicial → Criar jogo**: lista os projetos. **＋ Adicionar novo projeto** pede o **nome** e uma **imagem** (a capa). Cada projeto é um jogo diferente e é salvo como um item "jogo": entra no backup e sincroniza com a nuvem.
- **Tela do projeto** (como no seu desenho):
  - **à esquerda, o chat** com a IA, as **Dicas de comandos** e a caixa "Escreva aqui…", com 📎 (anexar imagem), **Modelo IA** e **＋ Nova conversa**;
  - **à direita, a área de teste**: o jogo roda ao vivo e você já pode jogar. Enquanto a IA trabalha, o jogo fica **pausado**; enquanto não existe jogo, a área fica **bloqueada** (🔒). Embaixo fica o console do jogo, e o botão **</> Código** mostra os arquivos;
  - **no celular**, as mesmas partes viram abas: **Chat | Jogo | Código**.
- **Chamar seus desenhos com @** (as Dicas de comandos explicam):
  - `@heroi` chama um desenho com todos os frames;
  - `@Inimigos/` chama todos os desenhos de uma pasta e das subpastas;
  - `@heroi.roupa` chama só uma camada;
  - `@floresta` chama um cenário;
  - `@[nome com espaço]` serve para nomes com espaço.

  Ao digitar `@` aparece a lista para escolher. O app transforma cada desenho num sprite sheet, e a IA usa só os nomes que existem. Se você editar o sprite no editor, o jogo muda na próxima vez que rodar.
- **Modelo IA:** Gemini (Google) ou OpenRouter. O mesmo botão aparece na aba **Chamar IA** do editor; a escolha vale para os dois. A lista de modelos vem do próprio provedor. A **chave fica só neste aparelho**: não vai para a nuvem, nem para o backup, nem para o jogo. No outro aparelho, cole de novo.
- **A IA programa com Phaser 3.90**:
  - a resposta mostra o que ela fez e quais arquivos mudou (✎ main.js…);
  - o que falta você fazer aparece como 📌 (por exemplo, "desenhar uma moeda");
  - se o jogo der **erro**, ela recebe o erro e **corrige sozinha** (até 3 tentativas);
  - cada resposta tem **↩ Desfazer esta mudança**.
- **Conversas ligadas:** "＋ Nova conversa" abre uma conversa limpa no mesmo projeto. A IA continua lembrando do jogo, porque recebe a **memória do projeto** (que ela mesma atualiza), os arquivos, os desenhos chamados e os títulos das outras conversas.
- **Segurança:** o jogo roda isolado (`iframe sandbox` sem `allow-same-origin`). O código gerado pela IA não consegue ler as suas chaves nem os seus dados.

### Como testar o Criar jogo

1. Pegue uma chave grátis do Gemini em https://aistudio.google.com/apikey (ou uma do OpenRouter em https://openrouter.ai/keys).
2. Tela inicial → **Criar jogo** → **＋ Adicionar novo projeto** → nome + imagem → **Criar**.
3. Escreva: `Crie um jogo simples onde @` e escolha um desenho seu na lista; complete com `anda pela tela com setas e toque`. Toque em **Enviar**. Na primeira vez abre o **Modelo IA**: cole a chave, **Salvar chave**, escolha o modelo e **Usar este modelo**.
4. Enquanto a IA escreve, a área de teste fica pausada. Depois o jogo aparece e você já pode jogar. No celular, vá na aba **Jogo**.
5. Peça uma mudança ("adicione pulo"). Se der erro, veja a correção automática. Teste **↩ Desfazer esta mudança**.
6. Toque em **＋ Nova conversa** e pergunte "o que o jogo já tem?": ela lembra.

## Sincronização na nuvem (PC ↔ celular)

O app continua guardando tudo no navegador (funciona sem internet), e agora **também** sincroniza com um banco no **Supabase**. Assim o que você faz no PC aparece no celular e vice-versa.

- **Tela Nuvem** (tela inicial → rodapé **☁️ Nuvem**, rota `#/nuvem`): *Criar conta* na primeira vez, *Entrar* nos outros aparelhos com o mesmo e-mail e senha, *Sincronizar agora* e *Sair desta conta neste aparelho*.
- **Automática:** sincroniza ao abrir o app, uns 3 segundos depois de qualquer alteração, ao voltar para a aba, quando a internet volta e a cada minuto com o app aberto. O rodapé da tela inicial mostra a situação (*Sincronizado · horário*, *Sincronizando…*, *Sem internet · 2 alterações esperando*).
- **Ao entrar num aparelho**, o que já está nele é enviado e se junta ao que já está na nuvem. Nada é apagado.
- **Conflito** (o mesmo item mudou nos dois aparelhos antes de sincronizar): a versão da nuvem fica no lugar e a deste aparelho aparece ao lado como `nome (conflito)`, com um aviso. Você confere e apaga a que não quiser.
- **Vai para a nuvem:** pastas, sprites (com a imagem de inspiração), cenários, jogos, a lixeira e as exclusões. **Não vai:** chaves de API das IAs e o rascunho do editor.
- O Gerenciador e a Lixeira se atualizam sozinhos quando chega algo do outro aparelho.

### Configuração do Supabase (já feita)

1. A tabela `itens` com as regras de acesso (cada conta só vê o que é dela) foi criada com o SQL de [`docs/supabase.sql`](docs/supabase.sql).
2. Em *Authentication → Sign In / Providers → Email*, **Confirm email** está desligado.
3. **Depois de criar a sua conta no app**, desligue também **Allow new users to sign up** no mesmo lugar. Assim ninguém mais cria conta no seu banco usando a chave pública.

O endereço do projeto e a chave **anon public** estão em `src/core/nuvem.js`. Essa chave foi feita para ficar no código do site. **Nunca** coloque ali a chave `service_role`.

**Plano grátis:** o Supabase pausa o projeto depois de cerca de 7 dias sem nenhum uso. Se a sincronização parar com erro de servidor, abra o painel do Supabase e reative o projeto.

### Como testar a sincronização

1. No PC: tela inicial → **☁️ Nuvem** → digite e-mail e senha (mínimo 6 caracteres) → **Criar conta**. A situação vira *Sincronizado*.
2. No celular: abra o site → **☁️ Nuvem** → mesmo e-mail e senha → **Entrar**. No Gerenciador aparecem as pastas do PC; abra um desenho e ele está igual.
3. Crie uma pasta no celular. Em alguns segundos ela aparece no Gerenciador do PC (se demorar, toque em *Sincronizar agora*).
4. Ligue o modo avião no celular, renomeie algo: o rodapé mostra *Sem internet · 1 alteração esperando*. Desligue o modo avião: a alteração sobe sozinha.
5. Desligue **Allow new users to sign up** no Supabase (passo 3 da configuração).

## Como testar a Etapa 3 ("pronto quando")

1. **Imagem de inspiração:** no editor, abra a aba *Imagem de inspiração* (lateral direita), escolha uma foto. Selecione o **conta-gotas** `O` e toque na foto: a cor aparece na paleta. Desenhe com ela. Salve, saia, abra o desenho de novo: a foto continua lá.
2. **Exportar:** com 2 frames desenhados, toque em ⬇ → *Exportar*. Baixe o PNG, o ZIP de frames, a sprite sheet e o GIF; abra cada um e confira que **a foto de inspiração não aparece** em nenhum.
3. **Importar:** exporte o *Arquivo do projeto (JSON)*, volte ao Editor → **Importar** e escolha esse arquivo: o desenho volta igual. Tente importar uma imagem como *Só as cores*.
4. **Variações:** ⇄ → *Mudar o tom das cores*: arraste o controle, veja a prévia e aplique; `Ctrl+Z` desfaz tudo de uma vez. ⇄ → *Cobrir de neve*: escolha a espessura e aplique.
5. **Backup:** tela inicial → *Backup* → **Baixar backup (ZIP)**. Abra o ZIP no computador: há o `LEIA-ME.txt` e as pastas. Depois use **Restaurar de um backup** com esse mesmo arquivo: surge a pasta `Restaurado em …` e as suas pastas originais continuam intactas.

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

> Os desenhos ficam no navegador de cada aparelho **e**, com a conta ligada (tela **☁️ Nuvem**), também no Supabase, que mantém o PC e o celular iguais.

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
    zip.js            ler e escrever ZIP (com proteção contra arquivos maliciosos)
    backup.js         montar e restaurar o backup em ZIP
    nuvem.js          conversa com o Supabase (login e tabela itens), só com fetch
    sincronia.js      sincronização automática: puxar, enviar, conflitos
    ia.js             módulo de IA (Gemini e OpenRouter): chaves, modelos, conversar
  ui/                 dom.js, dialogos.js, toast.js, formato.js, baixar.js
  editor/             o editor de pixel art (etapas 2a e 3), em módulos pequenos
    documento.js      modelo do desenho, paleta padrão, conversão de/para o JSON do sprite
    controlador.js    todas as ações de edição como funções + desfazer/refazer (sem tela)
    algoritmos.js     linha, elipse, balde, espelhar, girar… (sem tela)
    ferramentas.js    lápis, borracha, balde, linha, retângulo, círculo, conta-gotas, seleção, mover, mão
    vista.js          tela de desenho: zoom, mover, grade, cebola, toque e mouse
    arquivo.js        salvar/abrir os frames nas pastas (nome_01, nome_02…) e rascunho
    imagem.js         desenho <-> imagem RGBA, sprite sheet, quantização de cores (sem tela)
    png.js, gif.js    codificadores próprios de PNG e GIF
    exportar.js       gera cada formato de saída (PNG, frames, sheet, GIF, camadas, JSON)
    importar.js       lê e corrige JSON de sprite, lê imagens
    variacoes.js      mudar o tom das cores e neve (sem tela); cores.js: HSV <-> RGB
    referencia.js     painel da imagem de inspiração
    dialogos-arquivo.js, dialogos-variacoes.js   janelas de exportar, importar, tom e neve
    painel-*.js, barra-ferramentas.js, seletor-cor.js, dialogos-editor.js, icones.js, render.js
  screens/            inicio, gerenciador, lixeira, backup, nuvem, jogo, cenario, diagnostico, editor, em-breve
  cenario/            Construção de cenário: modelo.js (dados e regras), render.js (junta os frames), vista.js (tela gigante)
  jogo/               Criar jogo: projeto.js (dados), mencoes.js (@), assets.js (sprite sheets),
                      conversa.js (o que a IA recebe e como a resposta vira arquivos), palco.js (iframe),
                      dialogo-modelo.js (Modelo IA e chaves)
  css/                app.css (tema escuro), editor.css e jogo.css
vendor/               phaser.min.js + vendor.json
docs/                 ARQUITETURA.md, CONTEXTO.md e supabase.sql (tabela da nuvem)
```

## Regras de nome (valem para pastas e itens)

- Até 60 caracteres; não pode haver dois itens com o mesmo nome **na mesma pasta** (sem diferenciar maiúsculas).
- Os símbolos `/ \ : @ .` são proibidos porque serão usados para chamar itens no chat da IA (`@pasta/`, `@sprite`, `@sprite:acao.camada`).

## Limites conhecidos

- Com a nuvem ligada, os dados também ficam no Supabase. Sem ela:
- **O navegador pode apagar os dados do site** se o aparelho ficar sem espaço (principalmente o Safari do iPhone, que limpa sites não usados por semanas). O app pede armazenamento persistente quando você salva o primeiro item, mas o navegador pode recusar. A proteção de verdade é o **backup em ZIP** (tela inicial → Backup): faça um de vez em quando e guarde o arquivo fora do navegador.
- Uma aba anônima não guarda nada depois de fechada.

## Próximas etapas

| # | Etapa |
|---|-------|
| 1 | Tela inicial, armazenamento e gerenciador de pastas ✔ |
| 2 | Editor de pixel art — **2a: desenho, frames, paleta, salvar ✔** · camadas (painel) · 2b: ações e propriedades |
| 3 | Importar/exportar, imagem de inspiração, variações e backup em ZIP ✔ |
| 4 | Construção de cenário ✔ |
| 5 | Módulo de chat com IA ✔ (Gemini e OpenRouter) · falta o "Solicitar IA" nos sprites |
| 6 | Criar jogo (chat, teste ao vivo, correção automática) ✔ |
| 7 | Entrega (ZIP do jogo, PWA ou Capacitor, sincronização com GitHub) |

Detalhes das decisões em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). O texto de contexto para colar no início de cada nova etapa está em [`docs/CONTEXTO.md`](docs/CONTEXTO.md).
