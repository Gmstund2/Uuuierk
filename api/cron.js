import { learnNewWord } from './learnFromWikipedia'; // Importar la función que aprende nuevas palabras

export default async function handler(req, res) {
  try {
    // Llama a la función que procesa el aprendizaje
    await learnNewWord();
    res.status(200).json({ mensaje: 'Aprendizaje ejecutado correctamente.' });
  } catch (error) {
    console.error('Error al ejecutar el cron job:', error);
    res.status(500).json({ error: 'Hubo un error al ejecutar el cron job.' });
  }
}
