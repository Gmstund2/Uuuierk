import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import nlp from 'compromise';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

function limpiarTexto(texto) {
  return texto.toLowerCase().replace(/[.,;:()¿?¡!"“”]/g, '').trim();
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function handler(req, res) {
  try {
    let topic = null;

    // Bucle para intentar varios temas
    const { data: pendientes } = await supabase
      .from('pendientes')
      .select('palabra')
      .order('creada_en', { ascending: true })
      .limit(10); // intenta los primeros 10

    for (const pendiente of pendientes || []) {
      const posible = limpiarTexto(pendiente.palabra);
      const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(capitalizar(posible))}`;
      const respuesta = await fetch(url);

      if (respuesta.ok) {
        topic = posible;
        break;
      } else {
        // Eliminar tema que no existe
        await supabase.from('pendientes').delete().eq('palabra', posible);
      }
    }

    if (!topic) {
      return res.status(200).json({ mensaje: 'No se encontró ningún tema válido en Wikipedia.' });
    }

    const topicCapitalizado = capitalizar(topic);
    const response = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topicCapitalizado)}`);
    const data = await response.json();

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

    // Conexiones laterales
    for (let i = 0; i < nuevasPendientes.length; i++) {
      for (let j = i + 1; j < nuevasPendientes.length; j++) {
        const palabra1 = nuevasPendientes[i];
        const palabra2 = nuevasPendientes[j];

        await supabase.from('conexiones').upsert({
          palabra1,
          palabra2,
          fuerza: 1
        }, { onConflict: ['palabra1', 'palabra2'], ignoreDuplicates: false });
      }
    }

    // Guardar nuevas pendientes
    for (const palabra of nuevasPendientes) {
      await supabase.from('pendientes').upsert({ palabra }, { onConflict: ['palabra'] });
    }

    // Eliminar el topic procesado
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
