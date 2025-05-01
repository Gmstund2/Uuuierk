export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const prompt = req.body?.prompt;
  if (!prompt) {
    return res.status(400).json({ error: 'Falta el prompt' });
  }

  // Usando el modelo GPT-Neo 1.3B
  const response = await fetch("https://api-inference.huggingface.co/models/gpt-neo-1.3B", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: prompt })
  });

  const data = await response.json();

  if (data.error) {
    return res.status(500).json({ error: data.error });
  }

  res.status(200).json({ result: data[0].generated_text });
}
