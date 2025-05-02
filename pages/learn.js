import { useState } from 'react';

export default function Learn() {
  const [mensaje, setMensaje] = useState('');
  const [palabras, setPalabras] = useState([]);
  const [cargando, setCargando] = useState(false);

  const aprender = async () => {
    setCargando(true);
    setMensaje('');
    setPalabras([]);

    const res = await fetch('/api/learnFromWikipedia'); // Ruta de tu función API
    const json = await res.json();

    if (res.ok) {
      setMensaje(json.mensaje);
      setPalabras(json.sugerencia ? [json.sugerencia] : []);
    } else {
      setMensaje(json.error || 'Error inesperado');
    }

    setCargando(false);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Aprender desde Wikipedia</h1>
      <button onClick={aprender} disabled={cargando}>
        {cargando ? 'Aprendiendo...' : 'Aprender una palabra'}
      </button>
      <p>{mensaje}</p>
      {palabras.length > 0 && (
        <ul>
          {palabras.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
