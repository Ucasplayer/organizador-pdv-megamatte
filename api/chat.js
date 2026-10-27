// Chat com o Claude dentro do Organizador do PDV.
// O servidor só conversa com a API da Anthropic; quem aplica as alterações é o navegador,
// que devolve o resultado de cada ferramenta na próxima chamada.
//
// Variáveis de ambiente:
//   ANTHROPIC_API_KEY  chave da API (console.anthropic.com)  — obrigatória para o chat
//   CLAUDE_MODEL       padrão: claude-sonnet-5-5
//   EDIT_PASSWORD      se definida, o chat também pede a senha de edição

const MAX_MESSAGES = 60;
const MAX_BODY_CHARS = 400000;

const TOOLS = [
  {
    name: 'move_products',
    description: 'Move produtos de uma categoria para outra (saem da origem e entram no fim da categoria de destino).',
    input_schema: {
      type: 'object',
      properties: {
        product_codes: { type: 'array', items: { type: 'string' }, description: 'Códigos dos produtos' },
        from_category: { type: 'string', description: 'Id (ex.: c19) ou nome da categoria de origem' },
        to_category: { type: 'string', description: 'Id ou nome da categoria de destino' },
      },
      required: ['product_codes', 'from_category', 'to_category'],
    },
  },
  {
    name: 'add_products_to_category',
    description: 'Coloca produtos também numa categoria, sem tirar de onde já estão. Serve também para recolocar no PDV um produto que está fora de todas as categorias.',
    input_schema: {
      type: 'object',
      properties: {
        product_codes: { type: 'array', items: { type: 'string' } },
        category: { type: 'string', description: 'Id ou nome da categoria' },
      },
      required: ['product_codes', 'category'],
    },
  },
  {
    name: 'remove_products_from_category',
    description: 'Tira produtos de uma categoria. Se o produto não estiver em nenhuma outra, ele sai do PDV (dá para recolocar depois).',
    input_schema: {
      type: 'object',
      properties: {
        product_codes: { type: 'array', items: { type: 'string' } },
        category: { type: 'string', description: 'Id ou nome da categoria' },
      },
      required: ['product_codes', 'category'],
    },
  },
  {
    name: 'create_category',
    description: 'Cria uma categoria nova (vazia). Por padrão ela vai para o fim da tela.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        after_category: { type: 'string', description: 'Opcional: id ou nome da categoria depois da qual a nova deve ficar' },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_category',
    description: 'Muda o nome de uma categoria.',
    input_schema: {
      type: 'object',
      properties: { category: { type: 'string' }, new_name: { type: 'string' } },
      required: ['category', 'new_name'],
    },
  },
  {
    name: 'delete_category',
    description: 'Exclui uma categoria. Se ela tiver produtos, informe move_products_to (para onde vão) ou delete_products=true (os produtos saem junto). Pergunte à Marina antes de excluir uma categoria com produtos.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        move_products_to: { type: 'string', description: 'Id ou nome da categoria que recebe os produtos' },
        delete_products: { type: 'boolean' },
      },
      required: ['category'],
    },
  },
  {
    name: 'rename_product',
    description: 'Muda o nome de um produto (vale em todas as categorias onde ele aparece).',
    input_schema: {
      type: 'object',
      properties: { product_code: { type: 'string' }, new_name: { type: 'string' } },
      required: ['product_code', 'new_name'],
    },
  },
  {
    name: 'create_product',
    description: 'Cria um produto novo numa categoria. O código é opcional (deixe vazio se ela não souber).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, code: { type: 'string' }, category: { type: 'string' } },
      required: ['name', 'category'],
    },
  },
  {
    name: 'set_category_order',
    description: 'Define a ordem das categorias na tela. As categorias listadas vêm primeiro, nessa ordem; as que não forem listadas continuam depois, na ordem atual.',
    input_schema: {
      type: 'object',
      properties: { categories_in_order: { type: 'array', items: { type: 'string' }, description: 'Ids ou nomes' } },
      required: ['categories_in_order'],
    },
  },
  {
    name: 'set_product_order',
    description: 'Define a ordem dos produtos dentro de uma categoria. Os listados vêm primeiro, nessa ordem; os demais continuam depois.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        product_codes_in_order: { type: 'array', items: { type: 'string' } },
      },
      required: ['category', 'product_codes_in_order'],
    },
  },
];

function systemPrompt(structure, recent) {
  return `Você é o Claude, assistente dentro do site "Organizador do PDV" da Mega Matte (rede carioca de lojas de mate, guaraná natural, sucos, açaí, pão de queijo, salgados e cafeteria).
Quem conversa com você é a equipe da Mega Matte (normalmente a Marina, gestora). Ela está decidindo como organizar as categorias e os produtos da tela do caixa (PDV Linx Degust). Nada aqui mexe no PDV de verdade: as alterações ficam salvas e o Lucas aplica no sistema depois.

Como agir:
- Responda sempre em português do Brasil, de forma curta, simpática e sem termos técnicos.
- Para mudar alguma coisa, use as ferramentas. Faça exatamente o que foi pedido.
- Pergunte antes de agir quando o pedido for ambíguo, quando for excluir uma categoria que tem produtos ou quando for tirar muitos produtos do PDV.
- Quando pedirem opinião ou sugestão, explique a ideia em poucas linhas e pergunte se pode aplicar antes de mudar.
- Use os códigos dos produtos e os ids das categorias (ex.: c19) da estrutura abaixo. Para uma categoria que você acabou de criar, use o nome dela.
- Nomes de categorias e de produtos ficam em MAIÚSCULAS, como no PDV.
- Depois de alterar, diga em uma ou duas frases o que foi feito. Tudo pode ser desfeito pelo botão "Desfazer".
- Você não consegue trocar fotos: para isso existe o botão "Editar nome e foto".
- Se perguntarem algo que não tem a ver com o PDV, responda brevemente e volte ao assunto.

Estrutura atual da tela, na ordem (id da categoria, nome, grupo no PDV, e os produtos como "código: nome"):
${structure}
${recent ? `\nÚltimas alterações feitas no site (mais recentes primeiro):\n${recent}` : ''}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'metodo' });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'chat_not_configured' });
  const pass = process.env.EDIT_PASSWORD || '';
  if (pass && req.headers['x-senha'] !== pass) return res.status(401).json({ error: 'senha' });

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    const raw = JSON.stringify(body || {});
    if (raw.length > MAX_BODY_CHARS) return res.status(413).json({ error: 'conversa_muito_longa' });
    const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
    // a conversa precisa começar com uma mensagem da pessoa (texto), não com resultado de ferramenta
    while (messages.length && !(messages[0].role === 'user' && typeof messages[0].content === 'string')) messages.shift();
    if (!messages.length) return res.status(400).json({ error: 'sem_mensagem' });

    const r = await fetch((process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2048,
        system: systemPrompt(String(body.structure || '').slice(0, 120000), String(body.recent || '').slice(0, 4000)),
        tools: TOOLS,
        messages,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j && j.error && j.error.message) || `HTTP ${r.status}`;
      return res.status(502).json({ error: `Claude: ${msg}` });
    }
    return res.status(200).json({ content: j.content || [], stop_reason: j.stop_reason });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
