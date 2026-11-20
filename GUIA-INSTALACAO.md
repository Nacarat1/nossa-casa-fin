# Guia de Instalação no Celular (PWA 100% Offline e Gratuito)

O app **Nossa Casa** guarda **100% dos seus dados apenas na memória do celular** (`localStorage`). Nenhum dado financeiro é enviado para servidores externos.

Para que o Android ou iPhone permita **instalar com ícone na tela inicial e abrir em tela cheia**, basta publicar a pasta `fin` em um link HTTPS gratuito (uma única vez). Depois de instalado, o app funciona **mesmo sem internet**.

---

## Opção 1 — Mais rápida (2 minutos): Netlify Drop (grátis)

1. Acesse **https://app.netlify.com/drop** no computador (faça login gratuito com Google ou GitHub se pedir).
2. Arraste **a pasta inteira `fin`** (`c:\Users\PRIUM\OneDrive\Desktop\fin`) para dentro da área tracejada do site.
3. Em poucos segundos, o Netlify gera um link HTTPS exclusivo (ex: `https://nossa-casa-xyz.netlify.app`).
4. Abra esse link no navegador do seu celular (e no da sua namorada).

## Opção 2 — GitHub Pages (grátis e permanente)

1. Crie um repositório no GitHub e envie os arquivos da pasta `fin`.
2. Vá em **Settings → Pages → Source: Deploy from a branch (main / root)**.
3. Em cerca de 1 minuto seu link `https://seu-usuario.github.io/seu-repo/` estará no ar.

---

## Como instalar na tela inicial do celular

### Android (Google Chrome)
1. Abra o link do app no **Chrome**.
2. Toque no menu **⋮** (canto superior direito) → **Instalar aplicativo** (ou **Adicionar à tela inicial**).
   *(Você também verá o botão **Instalar App Agora** dentro da aba **Ajustes** do app!)*
3. Pronto! O ícone **Nossa Casa** aparece na tela inicial e abre em tela cheia.

### iPhone (Safari)
1. Abra o link do app no **Safari** (precisa ser no Safari, não no Chrome).
2. Toque no botão **Compartilhar** (quadrado com seta para cima na barra inferior).
3. Role para baixo e toque em **Adicionar à Tela de Início**.
4. Toque em **Adicionar**.

---

## Dica: Como sincronizar entre os dois celulares

Como os dados ficam salvos localmente na memória de cada celular:
- Sempre que quiserem compartilhar ou fazer backup, vá em **Ajustes → Exportar Backup** (gera um arquivo `.json`).
- Envie o arquivo pelo WhatsApp para o outro celular e toque em **Ajustes → Importar Backup**.
