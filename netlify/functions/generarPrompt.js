exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { idea } = JSON.parse(event.body);
    if (!idea) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Falta la idea' }) };
    }

    const systemPrompt = `Eres un experto en ingeniería de prompts para Claude (Anthropic).
Recibís una idea simple de una app o solución de software, escrita en lenguaje llano por alguien sin formación técnica profunda.
Tu tarea es devolver SOLO un objeto JSON (sin texto adicional, sin markdown, sin backticks) con esta forma exacta:
{
  "prompt": "un prompt detallado, estructurado y específico, listo para pegar en Claude, que describa la app a construir: funcionalidades, pantallas, lógica de datos, y estándar técnico esperado (archivo único HTML, Firebase, CRUD completo, panel admin, modo oscuro, etc.)",
  "consejo": "un consejo breve y práctico sobre cómo usar este prompt o qué aclarar antes de mandarlo",
  "mermaid": "un diagrama de flujo en sintaxis Mermaid (graph TD) que muestre los pasos principales de uso de la app, como string plano"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: idea }]
      })
    });

    // Leemos el body como texto CRUDO primero, antes de intentar parsear JSON.
    // Esto evita que un body vacío/cortado tire "Unexpected end of JSON input"
    // sin darnos ninguna pista de qué pasó.
    const rawText = await response.text();

    if (!rawText || rawText.trim() === '') {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'Anthropic devolvió una respuesta vacía',
          status_anthropic: response.status
        })
      };
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'La respuesta de Anthropic no es JSON válido',
          status_anthropic: response.status,
          raw: rawText.slice(0, 500)
        })
      };
    }

    if (!response.ok || !data.content || !data.content[0]) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Error de Anthropic API', detalle: data })
      };
    }

    let text = data.content[0].text || '';
    text = text.replace(/```json|```/g, '').trim();

    if (!text) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'El modelo devolvió texto vacío', detalle: data })
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr2) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'El texto del modelo no es JSON válido',
          raw: text.slice(0, 800)
        })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
