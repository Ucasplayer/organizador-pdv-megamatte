// Confere a senha do botão EDITAR. A senha fica só no servidor (variável EDIT_PASSWORD na Vercel; padrão 7901).
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'metodo' });
  }
  const pass = process.env.EDIT_PASSWORD || '7901';
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body || '{}'); } catch (_) { body = {}; }
  const given = String((body && body.senha) || '');
  await new Promise(r => setTimeout(r, 400)); // deixa tentativas em massa mais lentas
  if (given && given === pass) return res.status(200).json({ ok: true });
  return res.status(401).json({ error: 'senha' });
};
