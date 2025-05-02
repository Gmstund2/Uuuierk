import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import nlp from 'compromise';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function procesarTema(topic) {
  const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Wikipedia no encontró el tema "${topic}"`);
  }

  const data = await response.json();
  if (!data.extract) {
    throw new Error(`No hay extracto para el tema "${topic}"`);
  }

  const texto = data.extract;
  const doc = nlp(texto);
  const terms = doc.terms().json();

  let nuevasPendientes = [];

  for (const term of terms) {
    const palabra = term.text.toLowerCase();
    if (palabra.length < 3 || palabra === topic.toLowerCase()) continue;

    await supabase.from('lexicon').insert({
      palabra,
      tipo: term.bestTag || 'desconocido',
      ejemplo_uso: texto,
      relacionado_a: topic,
      idioma: 'es'
    });

    nuevasPendientes.push(palabra);
  }

  // Guardar nuevas pendientes
  for (const palabra of nuevasPendientes) {
    await supabase.from('pendientes').upsert({ palabra }, { onConflict: ['palabra'] });
  }

  // Eliminar la pendiente actual
  await supabase.from('pendientes').delete().eq('palabra', topic);

  return {
    mensaje: `Aprendí sobre ${topic}`,
    palabras: terms.length,
    sugerencia: nuevasPendientes[0] || ''
  };
}

export default async function handler(req, res) {
  try {
    let { topic } = req.query;

    // Si no hay topic, obtener uno de la tabla pendientes
    if (!topic) {
      const { data: pendientes } = await supabase
        .from('pendientes')
        .select('palabra')
        .order('creada_en', { ascending: true })
        .limit(5);

      if (!pendientes || pendientes.length === 0) {
        return res.status(200).json({ mensaje: 'No hay temas pendientes por aprender.' });
      }

      // Intentar con cada palabra pendiente hasta que una funcione
      for (const item of pendientes) {
        try {
          const resultado = await procesarTema(item.palabra);
          return res.status(200).json(resultado);
        } catch (err) {
          console.warn(`Error con "${item.palabra}", probando siguiente...`);
        }
      }

      return res.status(500).json({ error: 'Ninguna de las palabras pendientes funcionó.' });

    } else {
      // Si se recibe un topic directo
      const resultado = await procesarTema(topic);
      return res.status(200).json(resultado);
    }

  } catch (error) {
    console.error('Error en el proceso general:', error);
    res.status(500).json({ error: `Error en el proceso: ${error.message}` });
  }
      }
