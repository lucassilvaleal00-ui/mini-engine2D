# Mini Engine

Site que roda 100% no navegador (HTML, CSS e JavaScript puro, sem build) para criar sprites de pixel art, montar cenários e, nas próximas etapas, criar jogos 2D com ajuda de IA. Hospedado no GitHub Pages; os dados ficam no IndexedDB do navegador, sem backend.

**Etapa atual: 1 de 7 — concluída** (tela inicial, armazenamento e gerenciador de pastas).

## O que a Etapa 1 entrega

- **Tela inicial** com as quatro portas: Editor de pixel art, Gerenciador de pixel art, Construção de cenário e Criar jogo. Só o Gerenciador está pronto; as outras abrem uma tela provisória que mostra o que virá.
- **Gerenciador** com pastas, subpastas e sub-subpastas ilimitadas: criar, renomear, mover, duplicar (com todo o conteúdo) e enviar para a lixeira.
- **Lixeira** com restaurar, excluir para sempre e esvaziar. Excluir uma pasta leva todo o conteúdo junto, e o aviso "Desfazer" traz tudo de volta na hora.
- **Armazenamento por tipo de item** (`sprite`, `cenario`, `jogo`, além de `pasta`), já pronto para o editor, o construtor de cenários e o criador de jogos guardarem seus dados no mesmo lugar.
- **Phaser 3.90.0** incluído localmente em `vendor/`, com uma página de **Diagnóstico** que prova que ele carrega e desenha.
- Interface escura em português, feita para toque (celular) e mouse (PC).

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
  screens/            inicio, gerenciador, lixeira, diagnostico, em-breve
  css/app.css         tema escuro
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
| 2 | Editor de pixel art (a: desenho, camadas, quadros · b: ações e propriedades) |
| 3 | Importar/exportar e backup em ZIP |
| 4 | Construção de cenário |
| 5 | Módulo de chat com IA e "Solicitar IA" nos sprites |
| 6 | Criar jogo (chat, teste ao vivo, correção automática) |
| 7 | Entrega (ZIP do jogo, PWA ou Capacitor, sincronização com GitHub) |

Detalhes das decisões em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). O texto de contexto para colar no início de cada nova etapa está em [`docs/CONTEXTO.md`](docs/CONTEXTO.md).
