# Bíblia & Exegese — Etapa 1 (Gênesis)

Aplicativo web de estudo exegético do Antigo Testamento. Interface no **GitHub Pages**, login e dados do usuário no **Supabase**.

## O que já funciona

- Login com **GitHub** (via Supabase) ou e-mail e senha.
- Estante com os 39 livros do AT na ordem da **Bíblia Hebraica** (Torá, Profetas Anteriores, Profetas Posteriores, Os Doze, Escritos). Só Gênesis está aberto nesta etapa.
- Livro → **capítulo** → **versículo**, pela versificação portuguesa (Almeida / Bíblia Livre).
- Tabela por versículo, com uma linha para cada palavra hebraica:
  - **Texto Bíblico**: já vem com a palavra da Bíblia Livre que corresponde a cada termo hebraico (por alinhamento automático), e você pode corrigir. O **+** cria colunas de tradução suas.
  - **Hebraico**: texto original, transliteração, raiz com as traduções possíveis e ocorrências (no livro / no AT).
  - **Strong Hebraico**: número, traduções do termo e morfologia em português.
  - **LXX**: palavra grega sugerida automaticamente (★), e você pode trocar. A coluna **Strong Grego** mostra o número, as traduções e a morfologia.
  - As traduções são as mais frequentes na Bíblia Livre em todo o AT, calculadas por alinhamento estatístico hebraico ↔ português.
  - **Dicionários e Léxicos / Comentários exegéticos**: começam vazios. Você cadastra as obras, e cada uma vira uma coluna.
- Colunas compactas para celular. Há barra de rolagem horizontal também no topo da tabela, e as duas linhas de cabeçalho ficam congeladas.
- Todas as colunas têm a mesma largura. Texto longo aparece com reticências e abre completo quando você toca nele.
- Citações: na primeira vez, o app pede a obra e a referência completa. Depois disso, a mesma obra só pede **tipo (direta/indireta)** e **página**, e a página entra no fim da referência automaticamente.
- Seção inferior: **Espírito de Profecia**, **Contexto Histórico** (bloco "Ano" já vem pronto, e você pode criar blocos de Rei, Cidade, Região, Tribo, Profetas ou um título seu, além das citações teóricas), **Mapa** (próxima etapa) e **Aplicação** (seus comentários homiléticos). Cada item tem botões de editar, excluir e copiar.
- Modo demonstração sem login: `.../?demo=1`. Os dados ficam só no navegador.

## Como publicar

### 1. Supabase
1. Abra **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
2. Em **Authentication → URL Configuration**, coloque em **Site URL** o endereço do seu GitHub Pages (ex.: `https://SEU-USUARIO.github.io/biblia-exegese/`) e adicione esse mesmo endereço em **Redirect URLs**.
3. Para entrar com GitHub:
   - No GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
     - Homepage URL: o endereço do Pages.
     - Authorization callback URL: `https://fqesmehjosivwflxpwel.supabase.co/auth/v1/callback`
   - Copie o **Client ID**, gere um **Client secret** e cole os dois no Supabase em **Authentication → Providers → GitHub**. Depois ative o provedor.

### 2. GitHub Pages
1. Crie um repositório (ex.: `biblia-exegese`) e envie **todo o conteúdo desta pasta**.
2. Vá em **Settings → Pages → Branch: main / (root)** e salve.

## Fontes e licenças
- Português: **Bíblia Livre (BLIVRE)**, © Diego Santos, Mario Sérgio e Marco Teles, 2018. Licença CC BY 4.0. A atribuição é obrigatória e já aparece no app.
- Hebraico: Westminster Leningrad Codex (domínio público). Lemas e morfologia da OSHB (CC BY 4.0).
- Septuaginta: Rahlfs 1935, projeto CenterBLC/LXX (MIT).
- Léxico Strong (1890), hebraico e grego: domínio público.

## Para gerar os próximos livros
O arquivo `tools/build_data.py` (requer `text-fabric`, `spacy` e o modelo `pt_core_news_sm`) gera `data/livros/<abrev>.json`. Exemplo para Êxodo: `python3 tools/build_data.py <fontes> data/livros Exod`.
Antes, ajuste em `js/livros.js` o `arquivo` e o `ativo: true` do livro. Para os outros livros do Pentateuco, a versificação portuguesa precisa ser conferida de novo, como foi feito com Gn 31:55.
