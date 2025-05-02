import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import nlp from 'compromise';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function obtenerPendiente(excluir) {
  const { data, error } = await supabase
    .from('pendientes')
    .select('palabra')
    .order('creada_en', { ascending: true });

  if (error || !data || data.length === 0) return null;
  const palabra = data.find(p => p.palabra.toLowerCase() !== excluir?.toLowerCase());
  return palabra ? palabra.palabra : null;
}

export default async function handler(req, res) {
  try {
    let { topic } = req.query;
    if (!topic) {
      topic = await obtenerPendiente();
      if (!topic) {
        return res.status(200).json({ status: 'done', mensaje: 'No hay temas pendientes.', sugerencia: null });
      }
    }

    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
    const response = await fetch(url);

    if (!response.ok) {
      const nuevoTopic = await obtenerPendiente(topic);
      return nuevoTopic
        ? handler({ query: { topic: nuevoTopic } }, res)
        : res.status(404).json({ status: 'not_found', error: 'Wikipedia no tiene este tema y no hay más pendientes.' });
    }

    const data = await response.json();
    if (!data.extract) {
      await supabase.from('pendientes').delete().eq('palabra', topic);
      return res.status(404).json({ error: 'Tema no encontrado' });
    }

    const texto = data.extract;
    const doc = nlp(texto);
    const terms = doc.terms().json();

    const nuevasPendientes = [];

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

    for (const palabra of nuevasPendientes) {
      await supabase.from('pendientes').upsert({ palabra }, { onConflict: ['palabra'] });
    }

    await supabase.from('pendientes').delete().eq('palabra', topic);

    const sugerencia = nuevasPendientes.find(p => p !== topic.toLowerCase()) || await obtenerPendiente(topic);

    res.status(200).json({
      status: 'ok',
      mensaje: `Aprendí sobre ${topic}`,
      palabras: terms.length,
      sugerencia: sugerencia || null
    });

  } catch (error) {
    console.error('Error en el proceso:', error);
    res.status(500).json({ error: `Error en el proceso: ${error.message}` });
  }
          }
