export default async function handler(req, res) {
  const prompt = req.body.prompt;

  try {
    const response = await fetch('https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al conectar con Hugging Face', details: error.message });
  }
      }
