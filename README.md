# Quiz Mais Saúde — PWA

Versão Progressive Web App (PWA) da tua app **Quiz Mais Saúde**, reconstruída em HTML/CSS/JS puro. Liga directamente ao mesmo Supabase do projecto FlutterFlow, instalável em Android e iOS a partir do browser, e pode ser empacotada para a Google Play e App Store sem precisares de Flutter, Android Studio, Xcode ou qualquer outra ferramenta nativa.

## Conteúdo do pacote

```
quiz-mais-saude/
├── index.html              ← página principal (login + níveis + quiz + terminar)
├── style.css               ← visual (Fraunces + Outfit, paleta verde-floresta)
├── app.js                  ← lógica + ligação ao Supabase  ⚙️ EDITA AQUI
├── manifest.json           ← metadata PWA (nome, ícone, cor)
├── sw.js                   ← service worker (funciona offline)
├── icon.svg                ← ícone vectorial
├── icon-192.png            ← ícone 192×192 para Android
├── icon-512.png            ← ícone 512×512 para stores
├── supabase-setup.sql      ← SQL para criar a tabela 'beneficiarios' + login
└── README.md               ← este ficheiro
```

## Passo 1 — Configurar o Supabase (2 minutos)

Abre `app.js` num editor de texto e edita estas duas linhas no topo:

```js
const SUPABASE_URL = '__SUPABASE_URL__';      // → substitui pelo teu Project URL
const SUPABASE_ANON_KEY = '__SUPABASE_KEY__'; // → substitui pela tua anon public key
```

Como obter os valores: Supabase → projecto `mais_saude_quiz` → `Settings` → `API`.

> **Nota:** a `anon public` key é feita para ser pública. Não te preocupes em incluí-la no código que vai para o GitHub. A segurança vem das **RLS policies** (Row Level Security) que defines no Supabase.

## Passo 2 — Testar localmente (1 minuto)

Não dá para abrir o `index.html` directamente do disco com duplo clique — os browsers bloqueiam service workers em `file://`. Precisas de um pequeno servidor local. Tens duas opções fáceis:

**Opção A — Extensão VS Code:** instala a extensão **"Live Server"** (Ritwick Dey), abre o `index.html`, clica direito → "Open with Live Server". A app abre em `http://127.0.0.1:5500`.

**Opção B — Python (já tens):** abre o terminal na pasta `quiz-mais-saude/` e corre:

```bash
python -m http.server 8000
```

E vai a `http://localhost:8000` no browser.

Em modo de teste (login a saltar), basta carregar em **"Modo de teste — saltar login"** e ver os níveis a aparecer.

## Passo 3 — Publicar em GitHub Pages (5 minutos)

1. Cria um repositório novo no GitHub (privado ou público), p.ex. `mais-saude-quiz-pwa`.
2. Faz upload de todos os ficheiros desta pasta para o repositório (drag-and-drop na interface web do GitHub funciona).
3. No repositório → `Settings` → `Pages` → em **Source**, escolhe **Deploy from a branch**, branch `main`, pasta `/ (root)` → **Save**.
4. Espera 1-2 minutos. O GitHub mostra-te o URL final, algo como:

   `https://sara-timoteo.github.io/mais-saude-quiz-pwa/`

5. Abre esse URL no telemóvel. No Chrome (Android) ou Safari (iOS), o browser oferece "Adicionar ao ecrã principal" — fica instalada como app.

> **Importante:** no Safari iOS, a opção está em `Partilhar → Adicionar ao ecrã principal`. No Chrome Android, aparece um banner ou via `Menu → Adicionar à página inicial`.

## Passo 4 — Activar o login real (depois de teres beneficiários)

Quando estiveres pronta para deixar de usar o modo de teste:

1. Abre o ficheiro `supabase-setup.sql` deste pacote, copia o conteúdo, e cola no **SQL Editor** do Supabase. Corre o script (botão "Run").
2. Importa o teu CSV de beneficiários para a tabela `beneficiarios` via `Table Editor → Insert → Import data from CSV`.
3. Em `app.js`, muda esta linha:

   ```js
   const REQUIRE_LOGIN = false;
   ```

   para:

   ```js
   const REQUIRE_LOGIN = true;
   ```

4. Faz commit & push para o GitHub. O GitHub Pages actualiza automaticamente em ~1 minuto.

## Passo 5 — Empacotar para a Google Play e App Store

Quando a PWA estiver online e a funcionar, podes gerar pacotes nativos para as stores **sem instalar nada local**:

1. Vai a **[pwabuilder.com](https://www.pwabuilder.com)** (ferramenta gratuita da Microsoft).
2. Cola o URL da tua PWA (o do GitHub Pages).
3. Clica em **"Start"**. Ele analisa, dá-te um relatório, e gera:
   - Um pacote **.aab** pronto para upload na Google Play Console.
   - Um pacote **.zip** com instruções para a App Store (este precisa de um Mac uma vez, ou da ferramenta deles em cloud).

A Google Play parte é fácil: criar conta de developer ($25 pagamento único), upload do `.aab`, preencher metadata, submeter. Demora 1-3 dias para aprovação.

A App Store parte é mais burocrática (conta $99/ano, validações), mas o ficheiro está gerado.

## Personalizar

| Quero mudar… | Onde |
|---|---|
| Cores | `style.css` → secção `:root` no topo |
| Tipografia | `style.css` → `--font-display` e `--font-body` |
| Nome da app | `manifest.json` → `name` e `short_name` |
| Ícone | `icon.svg`, `icon-192.png`, `icon-512.png` |
| Tempo de feedback após resposta | `app.js` → `FEEDBACK_MS` |
| Mensagens em português | procura o texto literal em `index.html` ou `app.js` |
| Nomes das tabelas Supabase | `app.js` → `TABLE_NIVEIS` e `TABLE_QUIZ` |

## Resolução de problemas

**"Não foi possível carregar os níveis"** — Verifica:
- `SUPABASE_URL` e `SUPABASE_ANON_KEY` estão correctos em `app.js`?
- A tabela chama-se exactamente `Niveis` (com N maiúsculo)? Se for `niveis` em minúsculas, altera `TABLE_NIVEIS` no `app.js`.
- Abre as DevTools do browser (F12) → Console → vê o erro detalhado.

**Quiz fica vazio** — A tabela `QuizOrganizado` tem registos com `id_niveis` a apontar para o nível seleccionado? Confirma no Table Editor do Supabase.

**Coluna não existe (`column does not exist`)** — Os nomes camelCase (`questaoOrdenada`, `opcaoCorreta`) podem ter sido criados em minúsculas pelo Postgres. Confirma no Supabase os nomes exactos das colunas e ajusta no `app.js`.

**Service worker não regista** — Tem de estar a correr em `https://` ou `localhost`. Não funciona em `file://`.

**iOS: não aparece "Adicionar ao ecrã principal"** — Tem de ser aberto no Safari (não no Chrome ou outros browsers em iOS). E o site tem de estar em HTTPS.

## Sobre as escolhas técnicas

- **Sem dependências de build** — só HTML, CSS e JS. Para deploy basta copiar ficheiros.
- **Supabase JS client via CDN** — não precisa de npm/yarn/webpack.
- **Service worker minimal** — cache-first para os ficheiros estáticos, network para Supabase (dados sempre frescos).
- **Tipografia variável** — Fraunces (display, com `opsz` para optical sizing) + Outfit (corpo). Ambas gratuitas em Google Fonts.
- **Acessibilidade** — todos os botões são teclado-acessíveis, contraste WCAG AA, suporte para `prefers-reduced-motion`.
- **Mobile-first** — limite de largura 560px, optimizado para portrait.

---

Boa sorte com o lançamento. 🌿
