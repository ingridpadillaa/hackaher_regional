import { useState, useRef } from "react";
import {
  Plus,
  House,
  Users,
  Share2,
  Copy,
  Trash2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { call, errorMessage } from "./firebase";
import { type Member, emptyMember, money } from "./types";
import { Logo, Button, Next, Field, Modal, ErrorText } from "./ui";
export function MemberEditor({
  member,
  onSave,
  onClose,
  onDelete,
}: {
  member: Member;
  onSave: (m: Member) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [m, setM] = useState(member);
  const [age, setAge] = useState(member.name ? String(member.age) : "");
  const [income, setIncome] = useState(
    member.name ? String(member.income) : "",
  );
  const change = (k: keyof Member, v: unknown) => setM({ ...m, [k]: v });
  return (
    <Modal
      title={member.id ? "Editar perfil" : "Agregar perfil"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...m, age: Number(age), income: Number(income) });
        }}
      >
        <Field label="Nombre">
          <input
            required
            maxLength={120}
            value={m.name}
            onChange={(e) => change("name", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Edad">
            <input
              type="number"
              min="0"
              max="120"
              required
              inputMode="numeric"
              placeholder="Edad en años"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </Field>
          <Field label="Perfil">
            <select
              value={m.relationship}
              onChange={(e) => change("relationship", e.target.value)}
            >
              {[
                "Administrador",
                "Adulto",
                "Dependiente",
                "Papá",
                "Mamá",
                "Hija",
                "Hijo",
                "Otro",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Estudios">
          <select
            required
            value={m.education}
            onChange={(e) => change("education", e.target.value)}
          >
            <option value="">Selecciona</option>
            {[
              "Sin estudios",
              "Primaria",
              "Secundaria",
              "Preparatoria",
              "Universidad",
              "Posgrado",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Trabajo u ocupación">
          <input
            required
            maxLength={80}
            placeholder="¿A qué se dedica?"
            value={m.occupation}
            onChange={(e) => change("occupation", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Ingreso">
            <input
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              required
              inputMode="decimal"
              placeholder="0.00"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
            />
          </Field>
          <Field label="Periodicidad">
            <select
              value={m.period}
              onChange={(e) => change("period", e.target.value)}
            >
              <option value="mensual">Mensual</option>
              <option value="quincenal">Quincenal</option>
              <option value="semanal">Semanal</option>
            </select>
          </Field>
        </div>
        <Button>Guardar perfil</Button>
        {onDelete && (
          <Button
            type="button"
            className="secondary danger-text"
            onClick={onDelete}
          >
            Eliminar perfil
          </Button>
        )}
      </form>
    </Modal>
  );
}
export function Household({ onSaved }: { onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(
    !!sessionStorage.getItem("summa-invite"),
  );
  const [preview, setPreview] = useState<{
    name: string;
    expiresAt: string;
  } | null>(null);
  const [code, setCode] = useState(
    sessionStorage.getItem("summa-invite") ?? "",
  );
  async function save() {
    setError("");
    setBusy(true);
    try {
      if (joining) {
        if (!preview) {
          setPreview(
            await call("previewInvitation", { code: code.toUpperCase() }),
          );
          return;
        }
        await call("joinHome", { code: code.toUpperCase() });
        sessionStorage.removeItem("summa-invite");
      } else await call("createHome", { name, members });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="onboarding page">
      <Logo />
      <header className="intro">
        <span className="step-label">1 DE 2 · TU HOGAR</span>
        <h1>
          Crea tu
          <br />
          <em>hogar</em>
        </h1>
        <p>
          Agrega los miembros
          <br />
          de tu hogar para organizar
          <br />
          mejor sus finanzas.
        </p>
      </header>
      <section className="card">
        <div className="segmented">
          <button
            className={!joining ? "active" : ""}
            onClick={() => setJoining(false)}
          >
            Crear mi hogar
          </button>
          <button
            className={joining ? "active" : ""}
            onClick={() => setJoining(true)}
          >
            Unirme con código
          </button>
        </div>
        {joining ? (
          <Field label="Código de invitación">
            <input
              value={code}
              maxLength={32}
              onChange={(e) => {
                setCode(e.target.value);
                setPreview(null);
              }}
              placeholder="Código del hogar"
            />
          </Field>
        ) : (
          <>
            <div className="section-heading">
              <span className="tile">
                <House />
              </span>
              <Field label="Nombre de tu hogar">
                <input
                  required
                  maxLength={120}
                  placeholder="Ponle un nombre a tu hogar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            </div>
            <div className="section-heading">
              <Users className="pink" />
              <div>
                <h3>
                  {members.length}{" "}
                  {members.length === 1 ? "miembro" : "miembros"}
                </h3>
                <small>Aquí viven, comparten y logran juntos.</small>
              </div>
            </div>
            {members.map((m, i) => (
              <div className="member-row" key={i}>
                <button className="member-detail" onClick={() => setEditing(i)}>
                  <span className="avatar">{m.name[0]}</span>
                  <span>
                    <strong>{m.name}</strong>
                    <span className="badge">
                      {i === 0 ? "Administrador" : m.relationship}
                    </span>
                    <small>
                      {m.age} años · {m.occupation} · {money(m.income)}/
                      {m.period}
                    </small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Quitar a ${m.name}`}
                  onClick={() =>
                    setMembers(members.filter((_, idx) => idx !== i))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <Button
              className="secondary"
              disabled={members.length >= 20}
              onClick={() => setEditing(members.length)}
            >
              <Plus />
              Agregar perfil
            </Button>
          </>
        )}
        {joining && preview && (
          <p className="invite-preview">
            Te unirás a <strong>{preview.name}</strong> como integrante. No
            obtendrás permisos de administrador. Confirma para continuar.
          </p>
        )}
        <ErrorText text={error} />
        <Button
          busy={busy}
          disabled={!joining && (!name.trim() || !members.length)}
          onClick={save}
        >
          <Next>
            {joining
              ? preview
                ? "Confirmar y unirme"
                : "Revisar invitación"
              : "Crear hogar y continuar"}
          </Next>
        </Button>
      </section>
      <p className="helper">
        Después personalizarás la experiencia de tu hogar.
      </p>
      {editing !== null && (
        <MemberEditor
          member={
            members[editing] ?? {
              ...emptyMember(),
              relationship: editing === 0 ? "Administrador" : "Adulto",
            }
          }
          onClose={() => setEditing(null)}
          onSave={(m) => {
            const next = [...members];
            next[editing] = m;
            setMembers(next);
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}
export function ShareHome({
  code,
  expiresAt,
  owner,
  onSaved,
}: {
  code: string;
  expiresAt?: string | null;
  owner: boolean;
  onSaved: () => Promise<void>;
}) {
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const qr = useRef<HTMLDivElement>(null);
  const url = `${location.origin}/?invite=${code}`;
  const active = !!expiresAt && Date.parse(expiresAt) > Date.now();
  async function manage(action: string) {
    setBusy(true);
    setError("");
    try {
      await call(action);
      await onSaved();
      setMessage(
        action === "rotateInvitation"
          ? "Nueva invitación creada. La anterior dejó de funcionar."
          : "Invitación revocada.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Enlace copiado.");
    } catch {
      setError("No se pudo copiar; selecciona el enlace que aparece abajo.");
    }
  }
  return (
    <section className="card invitation-card">
      <h2>Invitar a mi hogar</h2>
      <p>Comparte el enlace o QR con la persona que quieres invitar.</p>
      {active ? (
        <>
          <div ref={qr} className="invitation-qr">
            <QRCodeSVG value={url} size={160} marginSize={4} />
          </div>
          <small>Vence: {new Date(expiresAt!).toLocaleString("es-MX")}</small>
          <input
            aria-label="Enlace de invitación"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
          <div className="saving-actions">
            <Button
              className="secondary"
              onClick={async () => {
                if (navigator.share) {
                  try {
                    await navigator.share({
                      title: "Únete a mi hogar en Summa",
                      text: "Te invito a compartir mi hogar en Summa.",
                      url,
                    });
                  } catch (e) {
                    if ((e as Error).name !== "AbortError")
                      setError(
                        "No se pudo compartir. Puedes copiar el enlace.",
                      );
                  }
                } else await copy();
              }}
            >
              Compartir invitación
            </Button>
            <Button className="secondary" onClick={copy}>
              Copiar enlace
            </Button>
            <Button
              className="secondary"
              onClick={() => {
                const svg = qr.current?.querySelector("svg");
                if (!svg) return;
                const blob = new Blob(
                  [new XMLSerializer().serializeToString(svg)],
                  { type: "image/svg+xml" },
                );
                const objectUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = objectUrl;
                a.download = "invitacion-summa.svg";
                a.click();
                setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
              }}
            >
              Descargar QR
            </Button>
          </div>
        </>
      ) : (
        <p>
          La invitación está vencida o revocada.{" "}
          {owner
            ? "Genera una nueva para invitar."
            : "Pide una nueva a quien administra el hogar."}
        </p>
      )}
      {owner && (
        <div className="saving-actions">
          <Button
            className="secondary"
            busy={busy}
            onClick={() => manage("rotateInvitation")}
          >
            Generar nueva invitación
          </Button>
          {active && (
            <Button
              className="secondary"
              disabled={busy}
              onClick={() => manage("revokeInvitation")}
            >
              Revocar invitación
            </Button>
          )}
        </div>
      )}
      <p role="status">{message}</p>
      <ErrorText text={error} />
    </section>
  );
}
