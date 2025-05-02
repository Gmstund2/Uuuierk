import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import nlp from 'compromise';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  try {
    let { topic } = req.query;

    if (!topic) {
      const { data: pendientes, error } = await supabase
        .from('pendientes')
        .select('palabra')
        .order('creada_en', { ascending: true })
        .limit(1);

      if (error || !pendientes || pendientes.length === 0) {
        return res.status(200).json({ 
          status: 'done',
          mensaje: 'No hay temas pendientes por aprender.',
          sugerencia: null 
        });
      }

      topic = pendientes[0].palabra;
    }

    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(500).json({ 
        status: 'error', 
        error: `Error al obtener datos desde Wikipedia: ${response.statusText}` 
      });
    }

    const data = await response.json();
    if (!data.extract) {
      return res.status(404).json({ status: 'not_found', error: 'Tema no encontrado' });
    }

    const texto = data.extract;
    const doc = nlp(texto);
    const terms = doc.terms().json();

    let nuevasPendientes = [];
    for (const term of terms) {
      const palabra = term.text.toLowerCase();
      if (palabra.length < 3) continue;

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
    }

    await supabase.from('pendientes').delete().eq('palabra', topic);

    const sugerencia = nuevasPendientes[0] || null;

    res.status(200).json({
      status: 'ok',
      mensaje: `Aprendí sobre ${topic}`,
      palabras: terms.length,
      sugerencia
    });

  } catch (error) {
    console.error('Error en el proceso:', error);
    res.status(500).json({ status: 'error', error: `Error en el proceso: ${error.message}` });
  }
}
