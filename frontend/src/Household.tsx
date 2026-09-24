import { useState } from "react";
import {
  Plus,
  House,
  Users,
  Share2,
  Copy,
  ChevronRight,
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
}: {
  member: Member;
  onSave: (m: Member) => void;
  onClose: () => void;
}) {
  const [m, setM] = useState(member);
  const change = (k: keyof Member, v: unknown) => setM({ ...m, [k]: v });
  return (
    <Modal
      title={member.id ? "Editar perfil" : "Agregar perfil"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(m);
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
              value={m.age}
              onChange={(e) => change("age", Number(e.target.value))}
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
              value={m.income}
              onChange={(e) => change("income", Number(e.target.value))}
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
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState(
    new URLSearchParams(location.search).get("invite") ?? "",
  );
  async function save() {
    setError("");
    setBusy(true);
    try {
      if (joining) await call("joinHome", { code: code.toUpperCase() });
      else await call("createHome", { name, members });
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
              maxLength={16}
              onChange={(e) => setCode(e.target.value)}
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
                  <ChevronRight size={18} />
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
        <ErrorText text={error} />
        <Button
          busy={busy}
          disabled={!joining && (!name.trim() || !members.length)}
          onClick={save}
        >
          <Next>{joining ? "Unirme al hogar" : "Crear hogar y continuar"}</Next>
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
export function ShareHome({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="card share-card">
      <Share2 className="pink" />
      <div>
        <strong>Compartir hogar</strong>
        <small>Invita a otros miembros con un código o código QR.</small>
      </div>
      <QRCodeSVG value={`${location.origin}/?invite=${code}`} size={64} />
      <button
        className="code"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        <small>{copied ? "¡Copiado!" : "Código de invitación"}</small>
        {code}
        <Copy size={14} />
      </button>
    </section>
  );
}
