export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const prompt = req.body?.prompt;
  if (!prompt) {
    return res.status(400).json({ error: 'Falta el prompt' });
  }

  try {
    const response = await fetch("https://api-inference.huggingface.co/models/EleutherAI/gpt-neo-1.3B", {
      method: "POST",
      headers: {
        "Authorization": "Bearer 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",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: prompt })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error });
    }

    const result = data[0]?.generated_text || JSON.stringify(data);
    res.status(200).json({ result });

  } catch (error) {
    res.status(500).json({ error: 'Error al conectar con Hugging Face' });
  }
}
