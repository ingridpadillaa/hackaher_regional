import { useState } from "react";
import { Button, Field, ErrorText } from "./ui";
import { call } from "./firebase";
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
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const coordinates =
    value.latitude !== undefined && value.longitude !== undefined;
  const query = coordinates
    ? `${value.latitude},${value.longitude}`
    : [value.municipality, value.state, "México"].filter(Boolean).join(", ");
  async function applyCoordinates(latitude: number, longitude: number) {
    setStatus("Ubicación obtenida. Identificando municipio y estado…");
    const detected = await call<Area>("reverseLocation", {
      latitude,
      longitude,
    });
    onChange(detected);
    setStatus(
      temporary
        ? `Zona detectada: ${detected.municipality}, ${detected.state}. Actualizando tiendas cercanas.`
        : `Zona detectada: ${detected.municipality}, ${detected.state}. Presiona Guardar zona para actualizar tu hogar.`,
    );
  }
  function locate() {
    setError("");
    setStatus("");
    if (!window.isSecureContext) {
      setError(
        "La ubicación requiere una conexión segura. Abre Summa en localhost o con HTTPS.",
      );
      return;
    }
    if (!navigator.geolocation) {
      setError("Este navegador no admite ubicación. Selecciona tu municipio.");
      return;
    }
    setBusy(true);
    setStatus("Buscando una ubicación precisa…");
    let best: GeolocationPosition | null = null;
    let watchId: number | undefined;
    let finished = false;
    let timer: number;
    const stop = () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
    };
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      stop();
      setStatus("");
      setError(message);
      setBusy(false);
    };
    const accept = async (position: GeolocationPosition) => {
      if (finished) return;
      finished = true;
      stop();
      const latitude = Number(position.coords.latitude.toFixed(5));
      const longitude = Number(position.coords.longitude.toFixed(5));
      try {
        await applyCoordinates(latitude, longitude);
      } catch {
        setStatus("");
        setError(
          temporary
            ? "Obtuvimos las coordenadas, pero no pudimos identificar la zona. Vuelve a intentar."
            : "Obtuvimos tus coordenadas, pero no pudimos identificar municipio y estado. Confírmalos manualmente.",
        );
      } finally {
        setBusy(false);
      }
    };
    timer = window.setTimeout(() => {
      if (best && best.coords.accuracy <= 250) void accept(best);
      else
        fail(
          "El dispositivo no logró una ubicación precisa. Activa la ubicación precisa de Windows o del teléfono y vuelve a intentar.",
        );
    }, 18000);
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (
          !Number.isFinite(position.coords.latitude) ||
          !Number.isFinite(position.coords.longitude) ||
          !Number.isFinite(position.coords.accuracy)
        )
          return;
        if (!best || position.coords.accuracy < best.coords.accuracy)
          best = position;
        setStatus(
          `Afinando ubicación… precisión aproximada de ${Math.round(best.coords.accuracy)} m.`,
        );
        if (best.coords.accuracy <= 80) void accept(best);
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED)
          fail(
            "No autorizaste la ubicación. Habilita el permiso de ubicación precisa para este sitio y vuelve a intentar.",
          );
        else if (!best && e.code === e.POSITION_UNAVAILABLE)
          fail(
            "El dispositivo no pudo determinar tu ubicación. Activa la ubicación del sistema y vuelve a intentar.",
          );
      },
      { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 },
    );
  }
  return (
    <section className="location-picker">
      <p className="helper">
        {temporary
          ? "La ubicación para esta compra es temporal y no cambia tu hogar. Al usar tu ubicación, Summa solicita la posición precisa del dispositivo y consulta OpenStreetMap para completar municipio y estado."
          : "Edita el municipio y estado donde vive tu hogar. Esta ubicación fija se guardará al confirmar; no cambia cuando te desplazas. No necesitamos tu domicilio exacto."}{" "}
        Al abrir el mapa compartirás la zona seleccionada con Google Maps.
      </p>
      {!temporary && (
        <div className="form-grid">
          <Field label="Municipio">
            <input
              required
              maxLength={120}
              disabled={disabled}
              value={value.municipality}
              onChange={(e) => {
                setError("");
                setStatus("");
                onChange({
                  state: value.state,
                  municipality: e.target.value,
                  source: "manual",
                });
              }}
            />
          </Field>
          <Field label="Estado">
            <input
              maxLength={120}
              disabled={disabled}
              value={value.state}
              onChange={(e) => {
                setError("");
                setStatus("");
                onChange({
                  municipality: value.municipality,
                  state: e.target.value,
                  source: "manual",
                });
              }}
            />
          </Field>
        </div>
      )}
      {temporary && (
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
              : "Detectar mi ubicación"}
        </Button>
      )}
      {coordinates && (
        <>
          <small>
            {temporary ? "Zona detectada:" : "Zona guardada:"}{" "}
            <strong>
              {value.municipality}, {value.state}
            </strong>
            . Usaremos esta ubicación para buscar sucursales cercanas.
          </small>
          {!temporary && (
            <button
              disabled={disabled}
              type="button"
              className="text-button"
              onClick={() => {
                setError("");
                setStatus("");
                onChange({
                  municipality: value.municipality,
                  state: value.state,
                  source: "manual",
                });
              }}
            >
              Usar solo municipio
            </button>
          )}
        </>
      )}
      {(!temporary || coordinates) && (
        <a
          className="text-button"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver zona en Google Maps
        </a>
      )}
      {temporary && (
        <a
          className="text-button"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          Datos de ubicación © colaboradores de OpenStreetMap
        </a>
      )}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      <ErrorText text={error} />
    </section>
  );
}
