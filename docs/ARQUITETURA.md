# Arquitetura do Mini Engine

## Princípios

1. **Sem build, sem frameworks.** JavaScript em módulos ES, carregado direto pelo navegador.
2. **Módulos independentes.** Cada tela é um arquivo que só conhece `core/` e `ui/`. Se uma etapa futura quebrar, as anteriores continuam funcionando.
3. **Telas nunca falam com o IndexedDB.** Só usam `core/storage.js`. Assim, uma sincronização opcional (GitHub, nuvem) pode ser acrescentada depois como outro módulo com a mesma interface, sem mexer nas telas.
4. **Tudo que o editor faz é uma função.** (Decisão para a Etapa 2.) Botões e IA chamam as mesmas funções (`criarCamada`, `preencherArea`, `espelhar`…). Sem isso, a "Solicitar IA" exigiria reescrever o editor.
5. **Texto vindo do usuário nunca vira HTML.** `ui/dom.js` só cria nós de texto.

## Mapa dos módulos

```
main.js ──► core/router.js ──► screens/*.js ──► core/storage.js ──► core/db.js ──► IndexedDB
                                    │
                                    └──► ui/dom.js · ui/dialogos.js · ui/toast.js · ui/formato.js
```

- **router.js**: rotas por hash. Cada tela exporta `montar(el, { parametro, navegar, voltar })` e pode devolver uma função de limpeza. `voltar()` volta à tela de onde o usuário veio e, se não houver (link aberto direto), cai num destino seguro sem sair do site.
- **dialogos.js**: `confirmar`, `pedirTexto`, `escolherPasta`, `menuAcoes` e o genérico `abrirDialogo`, sobre o `<dialog>` nativo. O padrão `processar` faz a operação dentro do diálogo, que continua aberto mostrando erros como "nome já existe".

## O editor (Etapa 2a)

```
screens/editor.js ──► editor/controlador.js ──► editor/documento.js · editor/algoritmos.js
        │                     ▲
        ├──► editor/vista.js ─┘ (ferramentas.js chama o controlador)
        ├──► painel-quadros · painel-paleta · painel-ia · barra-ferramentas · dialogos-editor
        └──► editor/arquivo.js ──► core/storage.js
```

- **Controlador sem tela.** `Controlador` guarda o estado do desenho e expõe cada edição como método (`adicionarQuadro`, `inserirQuadroComPixels`, `espelhar`, `girar`, `adicionarCor`, `alterarCor`, `removerCor`…). Botões e atalhos chamam esses métodos, e a IA (Etapa 5) chamará os mesmos. Ele emite `mudou` e `sujo`; as telas só reagem.
- **Desfazer por compartilhamento.** Buffers de pixels nunca são alterados no lugar (copia-ao-escrever); o histórico guarda fotografias que compartilham os buffers que não mudaram. Limite de 50 passos. Um traço inteiro (do toque ao soltar) é um passo só.
- **Estado do desenho:** `{ nome, largura, altura, fps, paleta, camadas, quadros, atual, camadaAtiva }`. Cada quadro tem um `Uint8Array` por camada, com **índices da paleta** (o índice 0 é transparente), exatamente como o arquivo. Isso torna "editar uma cor muda todos os pixels" uma troca de uma entrada da paleta.
- **Um frame = um item sprite.** O JSON salvo é o mesmo da Etapa 1 (`{ version, name, size, palette, layers, fps }`), com **um quadro por arquivo**. Os frames de um desenho se chamam `base_01`, `base_02`… (`base_001` a partir de 100). Uma *cadeia* é o conjunto de itens da mesma pasta com a mesma base e o mesmo tamanho; abrir um deles carrega a cadeia toda e junta as paletas por cor (`#hex`). `arquivo.js` é o único lugar que conhece essa convenção.
- **Salvar** (`analisarSalvamento` e `salvarDesenho`): arquivos de **outro** desenho com o mesmo nome exigem confirmação; os frames do próprio desenho são reaproveitados (mesmos ids); frames que sobram vão para a lixeira. Tudo em uma transação lógica por item, com nomes validados antes de gravar.
- **Rascunho:** chave `editor.rascunho` na store `meta`, gravada cerca de 1 s depois de cada alteração e ao sair da tela. Apagada ao salvar.
- **Vista:** um `<canvas>` por tela com zoom inteiro (pixels nítidos), grade a partir de 6×, cebola, seleção e contorno do pixel sob o ponteiro. Usa `pointer events` (mouse, toque, caneta) com `touch-action: none`; dois dedos fazem pinça e mover.
- **Gavetas:** Cores (esquerda) e Chamar IA (direita) são `<aside>` com uma aba sempre visível. Abaixo de 900 px cobrem o desenho; acima, empurram.

## Modelo de dados

Banco `mini-engine`, versão 1, três stores:

| Store | Conteúdo |
|-------|----------|
| `itens` | Metadados leves: `{ id, tipo, nome, paiId, criadoEm, atualizadoEm, resumo?, lixeira* }` |
| `dados` | O conteúdo pesado de cada item: `{ id, dados }` (só sprite, cenário e jogo) |
| `meta` | Configurações internas (chave/valor) |

**Por que separar `itens` de `dados`?** Abrir uma pasta lê só os metadados. Um personagem com 10 ações pode ter centenas de KB; ler isso de 50 personagens a cada abertura de pasta travaria o celular.

- `tipo`: `pasta`, `sprite`, `cenario` ou `jogo`.
- `paiId`: id da pasta-mãe, ou `"raiz"` (o IndexedDB não aceita `null` como chave de índice).
- `resumo`: objeto pequeno mostrado nas listas, ex.: `{ descricao: "3 camadas · 4 quadros" }`. Quem salva o item é quem preenche.
- **Nomes** únicos por pasta, sem diferenciar maiúsculas, até 60 caracteres, sem `/ \ : @ .` (reservados para a sintaxe `@` da IA). Nomes não são únicos no projeto todo: quando houver ambiguidade, a lista do `@` mostrará o caminho completo.
- **Lixeira:** excluir cria um *lote*. Todos os itens do lote recebem `lixeiraLote` e `lixeiraEm`; só o item excluído diretamente recebe `lixeiraRaiz` e `paiOriginalId`. Itens que já estavam em outra lixeira não entram no novo lote. Restaurar volta à pasta original; se ela sumiu, vai para a raiz; se o nome já estiver em uso, ganha ` (2)`.
- Todas as operações são **transações atômicas**: se algo falha no meio (nome inválido, destino inexistente), nada é gravado.
- Pastas não podem ser movidas para dentro de si mesmas nem de suas filhas.

## Como as próximas etapas se encaixam

- **Editor (Etapa 2):** 2a pronta (ver acima). Abre `#/editor` (pergunta criar/abrir) ou `#/editor/<id>` (abre a cadeia daquele frame). Na 2b, as **ações** (andar, correr…) serão uma convenção de nomes sobre grupos de arquivos (`personagem_acao_direcao_NN`) mais propriedades (origem, hitbox, flipX), em vez de um objeto dentro de um único sprite; isso mantém um frame por arquivo, como pedido. O campo `name` dentro do JSON é sincronizado com o nome do item ao salvar.
- **Cenário (Etapa 4):** guarda **referências** (id do sprite + posição + camada de profundidade 1/2/3 + sólido/decoração), não cópias. O formato em `core/modelos.js` é provisório.
- **IA (Etapas 5 e 6):** um módulo de chat único (provedores, chave, anexos, chamada de ferramentas) usado pelo "Solicitar IA" do sprite e pelo "Criar jogo". As chaves ficam só no `localStorage`. No "Criar jogo" a IA recebe apenas ferramentas de leitura dos sprites e cenários.
- **Jogo de teste:** `<iframe sandbox>` **sem** `allow-same-origin`, para que o código gerado pela IA não consiga ler o `localStorage` (onde ficam as chaves). Phaser, sprites e `assets.json` entram no iframe montados em memória.
- **Backup:** ZIP do projeto inteiro na Etapa 3, porque o navegador pode apagar o IndexedDB e a persistência não é garantida.
