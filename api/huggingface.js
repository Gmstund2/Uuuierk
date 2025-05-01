export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { prompt } = req.body;
  const HF_TOKEN = process.env.HF_TOKEN;

  try {
    const response = await fetch('https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    });

    const data = await response.json();

    if (response.ok) {
      return res.status(200).json({ generated_text: data[0]?.generated_text });
    } else {
      return res.status(response.status).json({ error: data.error || 'Error desconocido' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
}
