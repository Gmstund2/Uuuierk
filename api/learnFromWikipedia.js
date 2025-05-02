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

    // Obtener resumen de Wikipedia
    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(500).json({ error: `Error al obtener datos desde Wikipedia: ${response.statusText}` });
    }

    const data = await response.json();
    if (!data.extract) return res.status(404).json({ error: 'Tema no encontrado' });

    const texto = data.extract;
    const doc = nlp(texto);
    const terms = doc.terms().json();

    let nuevasPendientes = [];

    // Insertar las palabras nuevas en el lexicon y conectar con el topic
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

      nuevasPendientes.push(palabra);
    }

    // Insertar en pendientes sin repetir
    for (const palabra of nuevasPendientes) {
      await supabase.from('pendientes').upsert({ palabra }, { onConflict: ['palabra'] });
    }

    // Eliminar el topic procesado
    await supabase.from('pendientes').delete().eq('palabra', topic);

    // Ciclo para crear conexiones entre las palabras nuevas
    for (let i = 0; i < nuevasPendientes.length; i++) {
      for (let j = i + 1; j < nuevasPendientes.length; j++) {
        let palabra1 = nuevasPendientes[i];
        let palabra2 = nuevasPendientes[j];
        
        // Revisa si ya existe una conexión entre estas dos palabras
        const { data: conexionExistente } = await supabase
          .from('conexiones')
          .select('*')
          .eq('palabra_1', palabra1)
          .eq('palabra_2', palabra2)
          .limit(1);
        
        if (conexionExistente && conexionExistente.length > 0) {
          // Si ya existe, incrementa la fuerza de la relación
          await supabase
            .from('conexiones')
            .update({ fuerza: conexionExistente[0].fuerza + 1 })
            .eq('id', conexionExistente[0].id);
        } else {
          // Si no existe, crea una nueva conexión con fuerza 1
          await supabase
            .from('conexiones')
            .insert([
              { palabra_1: palabra1, palabra_2: palabra2, fuerza: 1 }
            ]);
        }
      }
    }

    res.status(200).json({
      mensaje: `Aprendí sobre ${topic}`,
      palabras: nuevasPendientes.length,
      sugerencia: nuevasPendientes[0] || '',
      topic
    });

  } catch (error) {
    console.error('Error en el proceso:', error);
    res.status(500).json({ error: `Error en el proceso: ${error.message}` });
  }
}
