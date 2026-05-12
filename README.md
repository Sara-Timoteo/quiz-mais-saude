# Quiz Mais Saúde — PWA

Versão Progressive Web App (PWA) da tua app **Quiz Mais Saúde**, reconstruída em HTML/CSS/JS puro. Liga diretamente ao mesmo Supabase do projecto FlutterFlow, instalável em Android e iOS a partir do browser, e pode ser empacotada para a Google Play e App Store sem precisares de Flutter, Android Studio, Xcode ou qualquer outra ferramenta nativa.

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

