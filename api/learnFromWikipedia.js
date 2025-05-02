
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import nlp from 'compromise';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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

    topic = topic.trim().replace(/[.,;:()¿?¡!"“”]/g, '');
    const cleanTopic = topic;

    // Obtener resumen de Wikipedia
    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTopic)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(500).json({ error: `Error al obtener datos desde Wikipedia: ${response.statusText}` });
    }

    const data = await response.json();
    if (!data.extract) return res.status(404).json({ error: `No se encontró Wikipedia para el tema: ${cleanTopic}`, topic: cleanTopic });

    const texto = data.extract;
    const doc = nlp(texto);
    const terms = doc.terms().json();

    let nuevasPalabras = [];

    for (const term of terms) {
      let palabra = term.text.toLowerCase().replace(/[.,;:()¿?¡!"“”]/g, '').trim();
      if (palabra.length < 3 || palabra === topic.toLowerCase()) continue;

      // Verifica si ya existe en lexicon
      const { data: existe } = await supabase
        .from('lexicon')
        .select('palabra')
        .eq('palabra', palabra)
        .limit(1);

      if (existe && existe.length > 0) continue;

      // Insertar en lexicon
      await supabase.from('lexicon').insert({
        palabra,
        tipo: term.bestTag || 'desconocido',
        ejemplo_uso: texto,
        relacionado_a: topic,
        idioma: 'es'
      });

      nuevasPalabras.push(palabra);
    }

    // Insertar en pendientes sin repetir
    for (const palabra of nuevasPalabras) {
      await supabase.from('pendientes').upsert({ palabra }, { onConflict: ['palabra'] });
    }

    // Insertar conexiones laterales entre palabras nuevas
    for (let i = 0; i < nuevasPalabras.length; i++) {
      for (let j = i + 1; j < nuevasPalabras.length; j++) {
        const palabraA = nuevasPalabras[i];
        const palabraB = nuevasPalabras[j];

        await supabase.from('relaciones').upsert({
          palabra_a: palabraA,
          palabra_b: palabraB,
          contexto: topic,
          fuerza: 1
        }, {
          onConflict: ['palabra_a', 'palabra_b', 'contexto'],
          ignoreDuplicates: false
        });

        // Inserta también la conexión inversa para simetría
        await supabase.from('relaciones').upsert({
          palabra_a: palabraB,
          palabra_b: palabraA,
          contexto: topic,
          fuerza: 1
        }, {
          onConflict: ['palabra_a', 'palabra_b', 'contexto'],
          ignoreDuplicates: false
        });
      }
    }

    // Eliminar el topic procesado
    await supabase.from('pendientes').delete().eq('palabra', topic);

    res.status(200).json({
      mensaje: `Aprendí sobre "${topic}"`,
      palabras: nuevasPalabras.length,
      sugerencia: nuevasPalabras[0] || '',
      topic
    });

  } catch (error) {
    console.error('Error en el proceso:', error);
    res.status(500).json({ error: `Error en el proceso: ${error.message}` });
  }
}
