
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import nlp from 'compromise';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

function limpiarTexto(texto) {
  return texto
    .toLowerCase()
    .replace(/[.,;:()¿?¡!"“”]/g, '')
    .trim();
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

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

    topic = limpiarTexto(topic);
    const topicCapitalizado = capitalizar(topic);

    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topicCapitalizado)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(404).json({ error: `No se encontró Wikipedia para el tema: ${topicCapitalizado}`, topic });
    }

    const data = await response.json();
    if (!data.extract) {
      return res.status(404).json({ error: `No se encontró resumen para el tema: ${topicCapitalizado}`, topic });
    }

    const texto = data.extract;
    const doc = nlp(texto);
    const terms = doc.terms().json();

    let nuevasPendientes = [];

    for (const term of terms) {
      let palabra = limpiarTexto(term.text);
      if (palabra.length < 3 || palabra === topic) continue;

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

    // Conexiones laterales (estructura tipo red)
    for (let i = 0; i < nuevasPendientes.length; i++) {
      for (let j = i + 1; j < nuevasPendientes.length; j++) {
        const palabra1 = nuevasPendientes[i];
        const palabra2 = nuevasPendientes[j];

        const { data: existente } = await supabase
          .from('conexiones')
          .select('fuerza')
          .eq('palabra1', palabra1)
          .eq('palabra2', palabra2)
          .single();

        if (existente) {
          await supabase
            .from('conexiones')
            .update({ fuerza: existente.fuerza + 1 })
            .eq('palabra1', palabra1)
            .eq('palabra2', palabra2);
        } else {
          await supabase.from('conexiones').insert({
            palabra1,
            palabra2,
            fuerza: 1
          });
        }
      }
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
