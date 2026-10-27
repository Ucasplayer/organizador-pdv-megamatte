// Função serverless (Vercel) que lê e grava os dados do organizador no GitHub.
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   GITHUB_TOKEN   token do GitHub com permissão "Contents: Read and write" neste repositório (obrigatório)
//   GITHUB_REPO    ex.: Ucasplayer/organizador-pdv-megamatte (obrigatório)
//   GITHUB_BRANCH  padrão: main
//   DATA_DIR       pasta onde os dados ficam no repositório. padrão: data
//   EDIT_PASSWORD  senha do botão EDITAR (padrão: 7901). Sem ela ninguém salva.

const ALLOWED = ['pdv.json', 'RESUMO.md', 'pdv-final.csv'];
const MAX_BYTES = 3 * 1024 * 1024;

function cfg() {
  return {
    api: (process.env.GITHUB_API || 'https://api.github.com').replace(/\/+$/, ''),
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || 'main',
    dir: (process.env.DATA_DIR || 'data').replace(/^\/+|\/+$/g, ''),
    pass: process.env.EDIT_PASSWORD || '7901',
  };
}

async function gh(c, path, opts = {}) {
  const headers = {
    Authorization: `Bearer ${c.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'organizador-pdv',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers || {}),
  };
  return fetch(c.api + path, { ...opts, headers });
}

async function ghJson(c, path, opts) {
  const r = await gh(c, path, opts);
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!r.ok) {
    const err = new Error(`GitHub ${r.status}: ${(json && json.message) || text.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

async function commitFiles(c, files, message) {
  const repo = `/repos/${c.repo}`;
  const ref = await ghJson(c, `${repo}/git/ref/heads/${encodeURIComponent(c.branch)}`);
  const baseSha = ref.object.sha;
  const baseCommit = await ghJson(c, `${repo}/git/commits/${baseSha}`);
  const tree = await ghJson(c, `${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: Object.entries(files).map(([name, content]) => ({
        path: c.dir ? `${c.dir}/${name}` : name,
        mode: '100644',
        type: 'blob',
        content,
      })),
    }),
  });
  if (tree.sha === baseCommit.tree.sha) return { sha: baseSha, unchanged: true };
  const commit = await ghJson(c, `${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  });
  await ghJson(c, `${repo}/git/refs/heads/${encodeURIComponent(c.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return { sha: commit.sha };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const c = cfg();
  if (!c.token || !c.repo) {
    return res.status(503).json({ error: 'not_configured' });
  }

  try {
    if (req.method === 'GET') {
      const path = `/repos/${c.repo}/contents/${c.dir ? c.dir + '/' : ''}pdv.json?ref=${encodeURIComponent(c.branch)}`;
      const r = await gh(c, path, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (r.status === 404) return res.status(200).json({ data: null, needsPassword: !!c.pass });
      if (!r.ok) return res.status(502).json({ error: `github_${r.status}` });
      const data = JSON.parse(await r.text());
      return res.status(200).json({ data, needsPassword: !!c.pass });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      if (c.pass && req.headers['x-senha'] !== c.pass) {
        return res.status(401).json({ error: 'senha' });
      }
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const files = body && body.files;
      if (!files || typeof files !== 'object') return res.status(400).json({ error: 'sem_arquivos' });
      const clean = {};
      let total = 0;
      for (const [name, content] of Object.entries(files)) {
        if (!ALLOWED.includes(name) || typeof content !== 'string') {
          return res.status(400).json({ error: `arquivo_invalido: ${name}` });
        }
        total += Buffer.byteLength(content, 'utf8');
        clean[name] = content;
      }
      if (!clean['pdv.json']) return res.status(400).json({ error: 'faltou_pdv_json' });
      JSON.parse(clean['pdv.json']); // garante que é JSON válido
      if (total > MAX_BYTES) return res.status(413).json({ error: 'muito_grande' });

      // Proteção: só salva se a tela partiu da versão que está no GitHub agora.
      // Assim uma aba antiga não apaga o que foi salvo por outro lugar.
      const cur = await gh(c, `/repos/${c.repo}/contents/${c.dir ? c.dir + '/' : ''}pdv.json?ref=${encodeURIComponent(c.branch)}`, {
        headers: { Accept: 'application/vnd.github.raw+json' },
      });
      if (cur.ok) {
        let curSaved = null;
        try { curSaved = JSON.parse(await cur.text()).savedAt || null; } catch (_) {}
        const base = body.baseSavedAt === undefined ? '(sem versão)' : body.baseSavedAt;
        if (curSaved !== base) return res.status(409).json({ error: 'conflito', savedAt: curSaved });
      } else if (cur.status !== 404) {
        return res.status(502).json({ error: `github_${cur.status}` });
      }

      const message = String((body && body.message) || 'Atualização do organizador do PDV').slice(0, 300);
      let result;
      try {
        result = await commitFiles(c, clean, message);
      } catch (e) {
        // Se outro salvamento entrou no meio, tenta de novo uma vez (o último a salvar vale)
        if (e.status === 422 || e.status === 409) result = await commitFiles(c, clean, message);
        else throw e;
      }
      return res.status(200).json({ ok: true, commit: result.sha, at: new Date().toISOString() });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'metodo' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
