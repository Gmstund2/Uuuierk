import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import nlp from 'compromise';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Refuerza conexión entre dos palabras
async function reforzarConexion(origen, destino, refuerzo = 1, contexto = '') {
  const { data: existente } = await supabase
    .from('conexiones')
    .select('id, fuerza')
    .eq('origen', origen)
    .eq('destino', destino)
    .limit(1)
    .single();

  if (existente) {
    await supabase
      .from('conexiones')
      .update({ fuerza: existente.fuerza + refuerzo })
      .eq('id', existente.id);
  } else {
    await supabase.from('conexiones').insert({
      origen,
      destino,
      fuerza: refuerzo,
      contexto
    });
  }
}

export default async function handler(req, res) {
  try {
    let { topic } = req.query;

    if (!topic) {
      const { data: pendientes } = await supabase
        .from('pendientes')
        .select('palabra')
        .order('creada_en', { ascending: true })
        .limit(1);

      if (!pendientes || pendientes.length === 0) {
        return res.status(200).json({ mensaje: 'No hay temas pendientes.' });
      }

      topic = pendientes[0].palabra;
    }

    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(500).json({ error: `Error al obtener Wikipedia: ${response.statusText}` });
    }

    const data = await response.json();
    if (!data.extract) return res.status(404).json({ error: 'Tema no encontrado' });

    const texto = data.extract;
    const doc = nlp(texto);
    const terms = doc.terms().json();

    let nuevasPendientes = [];

    for (const term of terms) {
      let palabra = term.text.toLowerCase().replace(/[.,;:()¿?¡!"“”]/g, '').trim();
      if (palabra.length < 3 || palabra === topic.toLowerCase()) continue;

      const { data: existe } = await supabase
        .from('lexicon')
        .select('palabra')
        .eq('palabra', palabra)
        .limit(1);

      if (existe && existe.length > 0) continue;

      await supabase.from('lexicon').insert({
        palabra,
        tipo: term.bestTag || 'desconocido',
        ejemplo_uso: texto,
        relacionado_a: topic,
        idioma: 'es'
      });

      nuevasPendientes.push(palabra);
    }

    for (const palabra of nuevasPendientes) {
      await supabase.from('pendientes').upsert({ palabra }, { onConflict: ['palabra'] });
      await reforzarConexion(topic, palabra, 0.2, 'extraída de Wikipedia');
    }

    // Relaciones cruzadas entre las nuevas palabras
    for (let i = 0; i < nuevasPendientes.length; i++) {
      for (let j = 0; j < nuevasPendientes.length; j++) {
        if (i !== j) {
          await reforzarConexion(nuevasPendientes[i], nuevasPendientes[j], 0.05, `co-ocurrencia con ${topic}`);
        }
      }
    }

    await supabase.from('pendientes').delete().eq('palabra', topic);

    res.status(200).json({
      mensaje: `Aprendí sobre ${topic}`,
      palabras: nuevasPendientes.length,
      sugerencia: nuevasPendientes[0] || ''
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: `Fallo en el aprendizaje: ${error.message}` });
  }
}
