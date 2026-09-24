import { useState } from "react";
import { Button, Field, ErrorText } from "./ui";
export interface Area {
  municipality: string;
  state: string;
  latitude?: number;
  longitude?: number;
  source: "manual" | "browser";
}
export function LocationPicker({
  value,
  onChange,
  disabled = false,
  temporary = false,
}: {
  value: Area;
  onChange: (a: Area) => void;
  disabled?: boolean;
  temporary?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const coordinates =
    value.latitude !== undefined && value.longitude !== undefined;
  const query = coordinates
    ? `${value.latitude},${value.longitude}`
    : [value.municipality, value.state, "México"].filter(Boolean).join(", ");
  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("Este navegador no admite ubicación. Selecciona tu municipio.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({
          ...value,
          latitude: Number(p.coords.latitude.toFixed(4)),
          longitude: Number(p.coords.longitude.toFixed(4)),
          source: "browser",
        });
        setBusy(false);
      },
      (e) => {
        setError(
          e.code === 1
            ? "No autorizaste la ubicación. Puedes usar el municipio."
            : "No pudimos obtener tu ubicación. Intenta de nuevo o usa el municipio.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
  return (
    <section className="location-picker">
      <p className="helper">
        {temporary
          ? "La ubicación para esta compra es temporal y no cambia tu hogar."
          : "La zona se guardará con el hogar al confirmar. No necesitamos tu domicilio exacto."}{" "}
        Al usar ubicación actual, tu navegador pedirá permiso. Al abrir el mapa
        compartirás ese punto con Google Maps.
      </p>
      <div className="form-grid">
        <Field label="Municipio">
          <input
            required
            maxLength={120}
            disabled={disabled}
            value={value.municipality}
            onChange={(e) =>
              onChange({
                state: value.state,
                municipality: e.target.value,
                source: "manual",
              })
            }
          />
        </Field>
        <Field label="Estado">
          <input
            maxLength={120}
            disabled={disabled}
            value={value.state}
            onChange={(e) =>
              onChange({
                municipality: value.municipality,
                state: e.target.value,
                source: "manual",
              })
            }
          />
        </Field>
      </div>
      <Button
        type="button"
        className="secondary"
        disabled={disabled || busy}
        onClick={locate}
      >
        {busy
          ? "Obteniendo ubicación…"
          : coordinates
            ? "Actualizar mi ubicación"
            : "Usar mi ubicación"}
      </Button>
      {coordinates && (
        <>
          <small>
            Coordenadas aproximadas: {value.latitude}, {value.longitude}.
            Confirma el municipio para filtrar precios.
          </small>
          <button
            disabled={disabled}
            type="button"
            className="text-button"
            onClick={() =>
              onChange({
                municipality: value.municipality,
                state: value.state,
                source: "manual",
              })
            }
          >
            Usar solo municipio
          </button>
        </>
      )}
      <a
        className="text-button"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Ver zona en Google Maps ↗
      </a>
      <ErrorText text={error} />
    </section>
  );
}
