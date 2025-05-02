import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import nlp from 'compromise';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    let { topic } = req.query;

    // Buscar tema si no se especificó
    if (!topic) {
      const { data: pendientes, error } = await supabase
        .from('pendientes')
        .select('palabra')
        .order('creada_en', { ascending: true })
        .limit(1);

      if (error || !pendientes || pendientes.length === 0) {
        return res.status(200).json({ mensaje: 'No hay temas pendientes por aprender.' });
      }

      topic = pendientes[0].palabra;
    }

    // Limpiar y capitalizar el topic
    const limpio = topic.trim().replace(/[.,;:()¿?¡!"“”]/g, '');
    const topicCapitalizado = limpio.charAt(0).toUpperCase() + limpio.slice(1);

    // Obtener resumen de Wikipedia
    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topicCapitalizado)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(404).json({ 
        error: `No se encontró Wikipedia para el tema: ${topicCapitalizado}`,
        topic: topicCapitalizado
      });
    }

    const data = await response.json();
    if (!data.extract) {
      return res.status(404).json({ 
        error: `El tema ${topicCapitalizado} no tiene contenido en Wikipedia.`,
        topic: topicCapitalizado
      });
    }

    const texto = data.extract;
    const doc = nlp(texto);
    const terms = doc.terms().json();

    let nuevasPendientes = [];

    for (const term of terms) {
      let palabra = term.text.toLowerCase().replace(/[.,;:()¿?¡!"“”]/g, '').trim();
      if (palabra.length < 3 || palabra === limpio.toLowerCase()) continue;

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
        relacionado_a: limpio,
        idioma: 'es'
      });

      nuevasPendientes.push(palabra);
    }

    for (const palabra of nuevasPendientes) {
      await supabase.from('pendientes').upsert({ palabra }, { onConflict: ['palabra'] });
    }

    await supabase.from('pendientes').delete().eq('palabra', topic);

    res.status(200).json({
      mensaje: `Aprendí sobre "${topicCapitalizado}"`,
      palabras: nuevasPendientes.length,
      sugerencia: nuevasPendientes[0] || '',
      topic: topicCapitalizado
    });

  } catch (error) {
    console.error('Error en el proceso:', error);
    res.status(500).json({ error: `Error en el proceso: ${error.message}` });
  }
}
