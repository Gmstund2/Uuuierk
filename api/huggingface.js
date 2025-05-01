
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
        "Authorization": `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: prompt })
    });

    if (!response.ok) {
      return res.status(500).json({ error: `Error en la respuesta: ${response.statusText}` });
    }

    const data = await response.json();
    res.status(200).json({ result: data[0].generated_text });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al conectar con el modelo' });
  }
}
