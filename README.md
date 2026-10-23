# Organizador do PDV — Mega Matte

Site simples, com a cara do PDV (Linx Degust), para a gestora reorganizar as **categorias** e os **produtos** sem mexer no PDV de verdade.
Tudo o que ela muda é salvo automaticamente neste repositório, na pasta `data/`.

## O que fica salvo (pasta `data/`)

| Arquivo | Para quê |
|---|---|
| `RESUMO.md` | **Leia este.** Lista o que mudou em relação ao PDV atual (produtos movidos, novos, retirados, categorias novas/excluídas/renomeadas), a estrutura final completa na ordem da tela e o histórico de alterações. |
| `pdv-final.csv` | Planilha (abre no Excel) com a estrutura final: categoria, grupo, produto, código, ordem e situação (Mantido / Entrou nesta categoria / Produto novo). |
| `pdv.json` | Dados brutos usados pelo site. |

Cada salvamento vira um commit, com a descrição da alteração na mensagem — o histórico de commits mostra a sequência exata do que foi feito.

## Arquivos do site

- `index.html` — o site inteiro (tela de categorias, tela de produtos, janelas, resumo).
- `sugestao.json` — a proposta de organização do botão **✨ Minha sugestão** (a Marina pode aplicar com um clique e desfazer).
- `seed.json` — como o PDV está **hoje** (gerado a partir dos CSVs exportados do Linx). É a base de comparação do resumo.
- `img/` — imagens das categorias recortadas da tela do PDV.
- `api/data.js` — função da Vercel que lê e grava os dados no GitHub.
- `vercel.json` — faz a Vercel **não** refazer o deploy quando só a pasta `data/` muda.

## Colocar no ar na Vercel (uma vez só)

1. **Criar um token no GitHub**: github.com → Settings → Developer settings → Personal access tokens → *Fine-grained tokens* → *Generate new token*.
   - Repository access: *Only select repositories* → `organizador-pdv-megamatte`
   - Permissions → Repository permissions → **Contents: Read and write**
   - Copie o token gerado.
2. **Importar na Vercel**: vercel.com → *Add New… → Project* → importe `Ucasplayer/organizador-pdv-megamatte`. Framework: *Other*. Não precisa de build command.
3. Em **Environment Variables**, adicione:
   - `GITHUB_TOKEN` = o token do passo 1
   - `GITHUB_REPO` = `Ucasplayer/organizador-pdv-megamatte`
   - (opcional) `EDIT_PASSWORD` = uma senha. Se definir, o site pede a senha na primeira vez que alguém tentar salvar (fica guardada no navegador).
4. Clique em **Deploy** e mande o link para a gestora.

Se mudar alguma variável depois, faça *Redeploy* para valer.

## Recomeçar do zero

Apague o arquivo `data/pdv.json` no GitHub. Na próxima vez que o site abrir, ele volta para o estado original do PDV (`seed.json`).

## Atualizar a base com novos CSVs do PDV

Os CSVs exportados do Linx (colunas `Grupo;Descrição do Grupo;Produto;Descrição do produto;…;Prioridade;Repetir;Exibir`) geram o `seed.json`. Se a base mudar, gere um novo `seed.json` e apague `data/pdv.json` para começar a partir dele.
