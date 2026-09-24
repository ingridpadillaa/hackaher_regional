import { useEffect, useRef, useState } from "react";
import {
  Pencil,
  FileText,
  Mic,
  Receipt,
  Plus,
  Minus,
  Camera,
  Upload,
  Square,
} from "lucide-react";
import { call, errorMessage } from "./firebase";
import { type Movement, categories, money } from "./types";
import { Modal, Button, Next, Field, CategoryIcon, ErrorText } from "./ui";
export function MovementModal({
  date,
  onClose,
  onSaved,
}: {
  date: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [receipt, setReceipt] = useState<any>(null);
  const [incomeKind, setIncomeKind] = useState<"regular" | "extra">("extra");
  const [type, setType] = useState<"gasto" | "ingreso">("gasto");
  const [method, setMethod] = useState<Movement["method"]>("manual");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Alimentación");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysisWarning, setAnalysisWarning] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [drafts, setDrafts] = useState<Movement[]>([]);
  const [draftId, setDraftId] = useState("");
  const [preview, setPreview] = useState("");
  const [camera, setCamera] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const requestId = useRef(crypto.randomUUID());
  const unmounted = useRef(false);
  useEffect(
    () => () => {
      unmounted.current = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => {
    if (camera && video.current) video.current.srcObject = stream.current;
  }, [camera]);
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
  }
  function choose(m: Movement["method"]) {
    if (recording || busy) return;
    stop();
    setMethod(m);
    setFile(null);
    setDrafts([]);
    setTranscript("");
    setAnalysisWarning("");
    setError("");
  }
  async function startCamera() {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "La cámara necesita HTTPS y permiso del navegador. Puedes elegir una foto.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (unmounted.current) {
        stream.current.getTracks().forEach((t) => t.stop());
        return;
      }
      setCamera(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function takePhoto() {
    const v = video.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob)
          setFile(new File([blob], "ticket.jpg", { type: "image/jpeg" }));
        stop();
      },
      "image/jpeg",
      0.85,
    );
  }
  async function audio() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Tu navegador no permite grabar aquí. Puedes escribir tu transcripción.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (unmounted.current) {
        stream.current.getTracks().forEach((t) => t.stop());
        return;
      }
      const chunks: BlobPart[] = [];
      const r = new MediaRecorder(stream.current);
      recorder.current = r;
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (unmounted.current) return;
        const mime = r.mimeType.split(";")[0];
        setFile(new File(chunks, "audio", { type: mime }));
        setRecording(false);
      };
      r.start();
      setRecording(true);
      setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 60000);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function selectFile(f: File | undefined) {
    if (!f || busy) return;
    setAnalysisWarning("");
    if (f.size > 10 * 1024 * 1024) {
      setError("El archivo debe pesar como máximo 10 MB.");
      return;
    }
    setFile(f);
    setReceipt(null);
    setDrafts([]);
    setError("");
  }
  async function analyze(textOnly = false) {
    setAnalysisWarning("");
    setBusy(true);
    setError("");
    try {
      const payload: any = { method };
      if (textOnly || (!file && transcript)) payload.text = transcript;
      else if (file) {
        payload.base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        payload.mimeType = file.type;
      }
      const result = await call("analyze", payload);
      setTranscript(result.transcript || transcript);
      setDraftId(result.draftId);
      setReceipt(result.receipt ?? null);
      setAnalysisWarning(
        [result.warning, ...(result.missingFields ?? [])]
          .filter(Boolean)
          .join(" "),
      );
      setDrafts(
        result.movements.map((m: Movement, i: number) => ({
          ...m,
          method,
          learnCategory: true,
          requestId: crypto.randomUUID(),
          draftIndex: i,
        })),
      );
      if (!result.movements.length)
        setError(
          "No encontramos movimientos completos. Revisa la transcripción o usa captura manual.",
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (method !== "manual" && !drafts.length) return;
    setBusy(true);
    setError("");
    try {
      if (method === "manual")
        await call("saveMovement", {
          requestId: requestId.current,
          type,
          ...(type === "ingreso" ? { incomeKind } : {}),
          amount: Number(amount),
          category: type === "ingreso" ? "Otros" : category,
          note,
          date,
          method,
        });
      else
        for (const m of drafts) await call("saveMovement", { ...m, draftId });
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Registrar movimiento"
      onClose={() => {
        if (!busy) {
          stop();
          recorder.current?.stop();
          onClose();
        }
      }}
    >
      <p className="subtitle">Ingresa los detalles de tu gasto o ingreso.</p>
      <form onSubmit={save}>
        <div className="segmented movement-type">
          <button
            type="button"
            className={type === "gasto" ? "active" : ""}
            onClick={() => {
              setType("gasto");
              setDrafts([]);
            }}
          >
            <Minus />
            Gasto
          </button>
          <button
            type="button"
            className={type === "ingreso" ? "active" : ""}
            onClick={() => {
              setType("ingreso");
              choose("manual");
            }}
          >
            <Plus />
            Ingreso
          </button>
        </div>
        {type === "ingreso" && (
          <Field label="Tipo de ingreso">
            <select
              value={incomeKind}
              onChange={(e) =>
                setIncomeKind(e.target.value as "regular" | "extra")
              }
            >
              <option value="extra">Adicional o extraordinario</option>
              <option value="regular">Habitual (sueldo, pensión…)</option>
            </select>
          </Field>
        )}
        {type === "gasto" && (
          <>
            <h3 className="field-title">Método de registro</h3>
            <div className="methods">
              {(
                [
                  { key: "manual", label: "Manual", icon: Pencil },
                  { key: "pdf", label: "PDF", icon: FileText },
                  { key: "audio", label: "Audio", icon: Mic },
                  { key: "ticket", label: "Ticket", icon: Receipt },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  type="button"
                  disabled={busy || recording}
                  className={method === key ? "selected" : ""}
                  key={key}
                  onClick={() => choose(key)}
                >
                  <Icon />
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        {method === "manual" ? (
          <>
            <Field label="Monto">
              <div className="amount-input">
                <span>$</span>
                <input
                  required
                  aria-label="Monto"
                  type="number"
                  min="0.01"
                  max="10000000"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <small>MXN</small>
              </div>
            </Field>
            {type === "gasto" && (
              <>
                <h3 className="field-title">Categoría</h3>
                <div className="category-picker">
                  {categories.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                    >
                      <CategoryIcon name={c} />
                      {c === "Alimentación" ? "Comida" : c}
                    </button>
                  ))}
                </div>
              </>
            )}
            <Field label="Nota (opcional)">
              <input
                maxLength={400}
                placeholder="Ej. Almuerzo con amigos"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <>
            <div className="capture-area">
              {method === "pdf" ? (
                <label className="upload">
                  <Upload size={34} />
                  <strong>Sube tu PDF</strong>
                  <span>Estado de cuenta o comprobante · Máx. 10 MB</span>
                  <input
                    type="file"
                    disabled={busy}
                    accept="application/pdf"
                    onChange={(e) => selectFile(e.target.files?.[0])}
                  />
                </label>
              ) : method === "ticket" ? (
                <>
                  {camera ? (
                    <>
                      <video ref={video} autoPlay playsInline muted />
                      <Button type="button" onClick={takePhoto}>
                        <Camera />
                        Tomar foto
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        className="secondary"
                        onClick={startCamera}
                      >
                        <Camera />
                        Abrir cámara
                      </Button>
                      <label className="upload compact">
                        O elige una foto del ticket
                        <input
                          type="file"
                          disabled={busy}
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          onChange={(e) => selectFile(e.target.files?.[0])}
                        />
                      </label>
                    </>
                  )}
                  {preview && (
                    <img
                      className="ticket-preview"
                      src={preview}
                      alt="Foto del ticket para analizar"
                    />
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={
                      "record-button " + (recording ? "recording" : "")
                    }
                    onClick={audio}
                  >
                    {recording ? <Square /> : <Mic />}
                  </button>
                  <strong>
                    {recording
                      ? "Grabando… Toca para detener"
                      : "Toca para grabar un audio"}
                  </strong>
                  <small>
                    Hasta un minuto. Puedes corregir la transcripción.
                  </small>
                  {preview && <audio controls src={preview} />}
                  <Field label="Transcripción editable">
                    <textarea
                      value={transcript}
                      disabled={busy}
                      maxLength={10000}
                      onChange={(e) => {
                        setTranscript(e.target.value);
                        setDrafts([]);
                        setAnalysisWarning("");
                      }}
                      placeholder="Aquí aparecerá lo que dijiste; también puedes escribirlo."
                    />
                  </Field>
                </>
              )}
              {file && (
                <small>
                  {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </small>
              )}
            </div>
            <p className="helper">
              Jami identifica el monto y la categoría. Tus archivos se procesan
              y se descartan.
            </p>
            <Button
              type="button"
              className="secondary"
              busy={busy}
              disabled={recording || (!file && !transcript)}
              onClick={() => analyze(method === "audio" && !!transcript)}
            >
              {method === "audio"
                ? transcript
                  ? "Analizar transcripción"
                  : "Transcribir y analizar"
                : "Analizar comprobante"}
            </Button>
            {drafts.length > 0 && (
              <section className="analysis-result">
                <h3>Revisa antes de guardar</h3>
                {receipt && (
                  <details>
                    <summary>
                      Desglose del ticket ·{" "}
                      {receipt.total === null
                        ? "Total no legible"
                        : money(receipt.total)}
                    </summary>
                    {receipt.items.map((item: any, i: number) => (
                      <p key={i}>
                        {item.quantity} × {item.name} · {money(item.amount)} ·{" "}
                        {item.category}
                      </p>
                    ))}
                    <p>
                      Total que confirmarás:{" "}
                      {money(drafts.reduce((n, m) => n + m.amount, 0))}
                    </p>
                  </details>
                )}
                <p className="helper">
                  Gemini sugirió estas categorías. Puedes cambiarlas o descartar
                  movimientos; solo se guardan cuando confirmas.
                </p>
                {drafts.map((m, i) => (
                  <div className="draft-row" key={i}>
                    <Field label={`Categoría sugerida del movimiento ${i + 1}`}>
                      <select
                        value={m.category}
                        disabled={busy}
                        onChange={(e) =>
                          setDrafts((current) =>
                            current.map((draft, index) =>
                              index === i
                                ? { ...draft, category: e.target.value }
                                : draft,
                            ),
                          )
                        }
                      >
                        {categories.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={`Monto del movimiento ${i + 1}`}>
                      <input
                        disabled={busy}
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={m.amount}
                        onChange={(e) =>
                          setDrafts((current) =>
                            current.map((v, j) =>
                              j === i
                                ? { ...v, amount: Number(e.target.value) }
                                : v,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={`Fecha del movimiento ${i + 1}`}>
                      <input
                        disabled={busy}
                        required
                        type="date"
                        max={date}
                        value={m.date}
                        onChange={(e) =>
                          setDrafts((current) =>
                            current.map((v, j) =>
                              j === i ? { ...v, date: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={`Nota del movimiento ${i + 1}`}>
                      <input
                        disabled={busy}
                        maxLength={400}
                        value={m.note}
                        onChange={(e) =>
                          setDrafts((current) =>
                            current.map((v, j) =>
                              j === i ? { ...v, note: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </Field>
                    {m.ruleApplied && (
                      <small>
                        Categoría aprendida de una corrección de tu hogar.
                      </small>
                    )}
                    <label className="check-line">
                      <input
                        disabled={busy}
                        type="checkbox"
                        checked={m.learnCategory ?? true}
                        onChange={(e) =>
                          setDrafts((current) =>
                            current.map((v, j) =>
                              j === i
                                ? { ...v, learnCategory: e.target.checked }
                                : v,
                            ),
                          )
                        }
                      />
                      <span>Recordar mi corrección para esta descripción.</span>
                    </label>
                    {m.possibleDuplicate && (
                      <label className="check-line duplicate-warning">
                        <input
                          required
                          disabled={busy}
                          type="checkbox"
                          checked={m.allowDuplicate ?? false}
                          onChange={(e) =>
                            setDrafts((current) =>
                              current.map((v, j) =>
                                j === i
                                  ? { ...v, allowDuplicate: e.target.checked }
                                  : v,
                              ),
                            )
                          }
                        />
                        <span>
                          Posible duplicado. Revisé el historial y confirmo que
                          es otro movimiento.
                        </span>
                      </label>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter((_, index) => index !== i),
                        )
                      }
                    >
                      Descartar movimiento {i + 1}
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
        {analysisWarning && (
          <p className="helper" role="status">
            {analysisWarning}
          </p>
        )}
        <ErrorText text={error} />
        <Button
          busy={busy}
          disabled={recording || (method !== "manual" && !drafts.length)}
        >
          <Next>Guardar movimiento</Next>
        </Button>
      </form>
    </Modal>
  );
}
