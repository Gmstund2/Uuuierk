
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import nlp from 'compromise';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  const { topic } = req.query;

  if (!topic) return res.status(400).json({ error: 'Falta el tema' });

  const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(500).json({ error: `Error al obtener datos desde Wikipedia: ${response.statusText}` });
    }

    const data = await response.json();

    if (!data.extract) return res.status(404).json({ error: 'Tema no encontrado' });

    const texto = data.extract;
    const doc = nlp(texto);
    const terms = doc.terms().json();

    for (const term of terms) {
      await supabase.from('lexicon').insert({
        palabra: term.text,
        tipo: term.bestTag || 'desconocido',
        ejemplo_uso: texto,
        relacionado_a: topic,
        idioma: 'es'
      });
    }

    res.status(200).json({ mensaje: `Aprendí sobre ${topic}`, palabras: terms.length });
  } catch (error) {
    console.error('Error en el proceso:', error);
    res.status(500).json({ error: `Error en el proceso: ${error.message}` });
  }
}
