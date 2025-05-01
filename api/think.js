import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('lexicon')
      .select('palabra, relacionado_a')
      .limit(20);

    if (error) throw error;

    const frecuencia = {};
    data.forEach(({ palabra, relacionado_a }) => {
      const key = relacionado_a || 'general';
      if (!frecuencia[key]) frecuencia[key] = new Set();
      frecuencia[key].add(palabra.toLowerCase());
    });

    const sugerencias = Object.entries(frecuencia).map(([tema, palabras]) => {
      return {
        tema,
        sugerencia: `Buscar en Wikipedia: "${tema} significado, uso, contexto"`
      };
    });

    res.status(200).json({
      mensaje: 'Pensamiento completado.',
      sugerencias
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
                                       }
