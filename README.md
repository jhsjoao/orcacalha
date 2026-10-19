# OrçaCalha

Aplicativo web (PWA) para a microempresa de calhas e rufos de Indianópolis/MG:

- **Orçamentos pelo método das abas**: soma das abas do perfil = desenvolvimento da chapa; × metros lineares × preço do m² (ou preço por metro linear). Gera o PDF itemizado e envia pelo WhatsApp.
- **Lista de corte** de cada orçamento (largura da tira × metros, por material).
- **Clientes** com histórico de orçamentos e serviços.
- **Agenda** de visitas, orçamentos, instalações e manutenções, com reagendamento do dia inteiro em dia de chuva e lembrete no Google Agenda.
- **Campanhas de manutenção**: lista quem teve o último serviço há mais de X meses e abre o convite pronto no WhatsApp.
- **Funciona sem internet** depois de instalado. Os dados ficam **só no celular**, com backup em arquivo.

Não precisa de servidor, banco de dados nem mensalidade.

---

## 1. Publicar no GitHub Pages (gratuito)

1. Crie uma conta em <https://github.com> (se ainda não tiver).
2. Clique em **New repository**. Nome: `orcacalha`. Marque **Public** e clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file** (ou **Add file → Upload files**).
4. Descompacte o `orcacalha.zip` no computador e **arraste o conteúdo da pasta** para a página: `index.html`, `manifest.webmanifest`, `sw.js`, `.nojekyll` e as pastas `css`, `js`, `icons` e `vendor`. Não arraste o arquivo .zip.
   - O `.nojekyll` fica oculto no Windows e no Mac. Se ele não subir, não tem problema: o app funciona sem ele.
5. Clique em **Commit changes**.
6. Vá em **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e clique em **Save**.
7. Espere 1 a 2 minutos. O endereço do app aparece no topo da página de Pages, no formato
   `https://SEU-USUARIO.github.io/orcacalha/`.

> **Privacidade:** o repositório público contém só o código do app. Clientes, orçamentos e agenda **nunca vão para o GitHub**: ficam guardados no celular de quem usa.

## 2. Instalar no celular do Thiago

- **Android (Chrome):** abra o endereço, toque no menu ⋮ e escolha **Instalar app** (ou **Adicionar à tela inicial**).
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**.

O ícone do OrçaCalha aparece junto dos outros aplicativos e abre em tela cheia.

## 3. Primeiro uso

1. Toque na engrenagem ⚙ e preencha o **telefone da empresa** (sai no PDF).
2. Em **Perfis e preços**, ajuste os perfis mais feitos: nome, abas em cm (ex.: `3 + 2 + 12 + 15 + 10 + 3`) e preço. Os perfis que vêm cadastrados são só exemplos.
3. Em **Peças e serviços**, coloque os preços de instalação, suportes, bocais etc.
4. Ajuste prazo, pagamento e garantia padrão.

Para demonstrar o app, use **Carregar dados de exemplo**. Depois, use **Apagar todos os dados** antes de começar a cadastrar clientes reais.

## 4. Backup (importante)

Como os dados ficam só no celular, **faça backup toda semana**: ⚙ → **Fazer backup agora** → salve no Google Drive ou envie para você mesmo no WhatsApp. O app avisa quando o último backup tem mais de 7 dias.

Se trocar de celular, ou se os dados do navegador forem apagados, instale o app de novo e use **Restaurar um backup**.

## 5. Atualizar o app

1. Suba os arquivos alterados no repositório, substituindo os antigos.
2. Em `sw.js`, aumente a versão na primeira linha (ex.: `orcacalha-v1.0.1`). Isso faz os celulares baixarem a versão nova.
3. No celular, feche e abra o app duas vezes.

---

### Estrutura

```
index.html              página única do app
manifest.webmanifest    nome, ícones e cores para instalação
sw.js                   service worker (funcionamento offline)
css/app.css             visual
js/calc.js              cálculos (abas, áreas, totais, lista de corte)
js/store.js             armazenamento no aparelho e backup
js/pdf.js               geração do PDF do orçamento
js/app.js               telas e navegação
vendor/jspdf.umd.min.js biblioteca jsPDF (licença MIT)
icons/                  ícones do app
```

Desenvolvido como parte do projeto extensionista *Empreendedorismo e Desenvolvimento de Soluções*, PUCRS, Tecnólogo em Gestão da Tecnologia da Informação.
