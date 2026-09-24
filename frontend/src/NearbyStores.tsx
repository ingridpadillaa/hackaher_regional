import { useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";
import { Button, ErrorText } from "./ui";

export function NearbyStores({ municipality }: { municipality: string }) {
  const [coordinates, setCoordinates] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = coordinates
    ? `supermercados cerca de ${coordinates}`
    : `supermercados en ${municipality}`;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError(
        "Este navegador no permite obtener tu ubicación. Puedes buscar por municipio.",
      );
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates(`${coords.latitude},${coords.longitude}`);
        setBusy(false);
      },
      (failure) => {
        setError(
          failure.code === 1
            ? "No autorizaste la ubicación. Puedes buscar por municipio."
            : "No pudimos obtener tu ubicación. Intenta otra vez o busca por municipio.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <section className="card nearby-stores" aria-label="Supermercados cercanos">
      <h2>
        <MapPin size={22} /> ¿Qué supermercados tienes cerca?
      </h2>
      <p>Consulta sucursales y cómo llegar en Google Maps.</p>
      <p className="helper">
        Tu ubicación es opcional. Se comparte con Google Maps al abrir la
        búsqueda y no se guarda en tu hogar.
      </p>
      <Button className="secondary" disabled={busy} onClick={locate}>
        {busy
          ? "Buscando ubicación…"
          : coordinates
            ? "Actualizar mi ubicación"
            : "Usar mi ubicación"}
      </Button>
      <ErrorText text={error} />
      {(coordinates || municipality.trim()) && (
        <a
          className="button secondary"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {coordinates
            ? "Ver supermercados cerca de mí"
            : `Buscar en ${municipality}`}
          <ExternalLink size={16} />
        </a>
      )}
      {coordinates && (
        <button className="text-button" onClick={() => setCoordinates(null)}>
          Dejar de usar mi ubicación
        </button>
      )}
      <small>
        Las sucursales se consultan en Google Maps. Los precios del carrito
        dependen del catálogo disponible.
      </small>
    </section>
  );
}
