// Fotos de categorias e produtos, guardadas no GitHub em <DATA_DIR>/img/
//   GET  /api/image?f=<arquivo>.jpg  -> devolve a foto
//   POST /api/image  {kind, id, data(base64 jpeg)} -> grava e devolve {url}
// Usa as mesmas variáveis de ambiente de api/data.js.

const MAX_BYTES = 1.5 * 1024 * 1024;
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,80}\.jpg$/;

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

function gh(c, path, opts = {}) {
  return fetch(c.api + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'organizador-pdv',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
}

const imgPath = (c, name) => `${c.dir ? c.dir + '/' : ''}img/${name}`;
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';

module.exports = async function handler(req, res) {
  const c = cfg();
  if (!c.token || !c.repo) return res.status(503).json({ error: 'not_configured' });
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'GET') {
      const name = url.searchParams.get('f') || '';
      if (!NAME_RE.test(name)) return res.status(400).json({ error: 'nome_invalido' });
      const r = await gh(c, `/repos/${c.repo}/contents/${imgPath(c, name)}?ref=${encodeURIComponent(c.branch)}`, {
        headers: { Accept: 'application/vnd.github.raw+json' },
      });
      if (!r.ok) return res.status(r.status === 404 ? 404 : 502).json({ error: `github_${r.status}` });
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', 'image/jpeg');
      // o nome do arquivo muda a cada foto nova, então pode ficar em cache para sempre
      res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
      return res.status(200).end(buf);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      res.setHeader('Cache-Control', 'no-store');
      if (c.pass && req.headers['x-senha'] !== c.pass) return res.status(401).json({ error: 'senha' });
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const data = String((body && body.data) || '').replace(/^data:image\/\w+;base64,/, '');
      if (!data || !/^[A-Za-z0-9+/=\s]+$/.test(data)) return res.status(400).json({ error: 'imagem_invalida' });
      const bytes = Buffer.from(data, 'base64');
      if (bytes.length > MAX_BYTES) return res.status(413).json({ error: 'muito_grande' });
      if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return res.status(400).json({ error: 'nao_e_jpeg' });

      const kind = body.kind === 'cat' ? 'cat' : 'prod';
      const name = `${kind}-${slug(body.id)}-${Date.now().toString(36)}.jpg`;
      const put = () => gh(c, `/repos/${c.repo}/contents/${imgPath(c, name)}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Foto ${kind === 'cat' ? 'da categoria' : 'do produto'} ${String(body.label || body.id || '').slice(0, 80)}`,
          content: bytes.toString('base64'),
          branch: c.branch,
        }),
      });
      let r = await put();
      if (r.status === 409 || r.status === 422) r = await put(); // outro salvamento entrou no meio
      if (!r.ok) {
        const t = await r.text();
        return res.status(502).json({ error: `GitHub ${r.status}: ${t.slice(0, 200)}` });
      }
      return res.status(200).json({ ok: true, file: name, url: `api/image?f=${name}` });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'metodo' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
