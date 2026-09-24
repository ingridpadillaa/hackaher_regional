import { useEffect, useState } from "react";
import {
  Users,
  Heart,
  Target,
  Bell,
  ChevronRight,
  Plus,
  LogOut,
} from "lucide-react";
import { LocationPicker, type Area } from "./LocationPicker";
import { Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, call, errorMessage } from "./firebase";
import {
  type State,
  type Preferences,
  type Member,
  emptyMember,
  money,
} from "./types";
import { Logo, Button, Next, Modal, Field, ErrorText } from "./ui";
import { MemberEditor, ShareHome } from "./Household";
const defaults: Preferences = {
  municipality: "",
  monthlyBudget: 0,
  lifestyle: "",
  priorities: [],
  assistantTone: "cercano",
  aiConsent: false,
  bankConsent: false,
  privacyAccepted: false,
  alerts: true,
  goals: true,
  donations: false,
};
export function Profile({
  state,
  onSaved,
  initial = false,
}: {
  state: State;
  onSaved: () => Promise<void>;
  initial?: boolean;
}) {
  const home = state.home!;
  const [prefs, setPrefs] = useState<Preferences>({
    ...defaults,
    ...home.preferences,
    privacyAccepted: initial
      ? false
      : (home.preferences?.privacyAccepted ?? false),
  });
  const [area, setArea] = useState<Area>(
    home.location ?? {
      municipality: home.preferences?.municipality ?? "",
      state: "",
      source: "manual",
    },
  );
  const [members, setMembers] = useState<Member[]>(home.members);
  useEffect(() => {
    setMembers(home.members);
  }, [home.members]);
  const monthlyIncome =
    Math.round(
      members.reduce(
        (total, member) =>
          total +
          member.income *
            (member.period === "semanal"
              ? 52 / 12
              : member.period === "quincenal"
                ? 2
                : 1),
        0,
      ) * 100,
    ) / 100;
  const [editing, setEditing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const owner = home.ownerUid === auth.currentUser?.uid;
  function change(k: keyof Preferences, v: unknown) {
    setPrefs((p) => ({ ...p, [k]: v }));
    setSaved(false);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call(
        owner ? "savePreferences" : "completeMemberProfile",
        owner
          ? {
              ...prefs,
              members,
              assistantTone: "cercano",
              municipality: area.municipality,
              location: area,
            }
          : { privacyAccepted: prefs.privacyAccepted },
      );
      await onSaved();
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function removeMember() {
    if (deleting === null) return;
    const member = members[deleting];
    setBusy(true);
    setError("");
    try {
      if (member.id) {
        await call("deleteMember", { memberId: member.id });
        await onSaved();
      }
      setMembers((current) =>
        current.filter((item) =>
          member.id ? item.id !== member.id : item !== member,
        ),
      );
      setDeleting(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page profile-page">
      <Logo />
      {initial && <span className="step-label">2 DE 2 · PERSONALIZACIÓN</span>}
      <header className="intro">
        <h1>
          Personaliza
          <br />
          <em>tu experiencia</em>
        </h1>
        <p>
          Administra los integrantes de tu hogar
          <br />y sus preferencias de notificaciones.
        </p>
      </header>
      <form onSubmit={save}>
        <section className="card">
          <div className="section-heading">
            <span className="tile">
              <Users />
            </span>
            <div>
              <h3>Tu hogar</h3>
              <small>¿Cuántas personas viven en tu hogar?</small>
            </div>
          </div>
          <div className="profile-members">
            {members.map((m, i) => (
              <button
                type="button"
                key={m.id ?? i}
                disabled={!owner}
                onClick={() => setEditing(i)}
              >
                <span className="avatar">{m.name[0]}</span>
                <strong>{m.name}</strong>
                <small>{m.age} años</small>
              </button>
            ))}
            {owner && (
              <button type="button" onClick={() => setEditing(members.length)}>
                <span className="avatar add">
                  <Plus />
                </span>
                <strong>Agregar</strong>
                <small>persona</small>
              </button>
            )}
          </div>
        </section>
        <Link className="card profile-row" to="/simulador">
          <span className="tile">
            <Target />
          </span>
          <span>
            <strong>Metas de ahorro</strong>
            <small>
              Define objetivos y registra tus aportaciones en Simulador.
            </small>
          </span>
          <ChevronRight size={18} />
        </Link>
        <section className="card">
          <div className="section-heading">
            <span className="tile">
              <Bell />
            </span>
            <div>
              <h3>Notificaciones y alertas</h3>
              <small>Elige qué notificaciones quieres recibir.</small>
            </div>
          </div>
          {(
            [
              [
                "alerts",
                "Alertas importantes",
                "Pagos, fechas clave y movimientos de tu hogar.",
              ],
              [
                "goals",
                "Recordatorios de metas",
                "Avances, consejos y logros con SUMMA.",
              ],
              [
                "donations",
                "Notificaciones de donativos",
                "Recibe avisos sobre campañas y cómo apoyar.",
              ],
            ] as const
          ).map(([key, title, subtitle]) => (
            <label className="toggle-row" key={key}>
              <Bell size={18} />
              <span>
                <strong>{title}</strong>
                <small>{subtitle}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={prefs[key]}
                disabled={!owner}
                onChange={(e) => change(key, e.target.checked)}
              />
            </label>
          ))}
        </section>
        {initial && (
          <>
            <section
              className="card profile-income"
              aria-label="Ingreso registrado"
            >
              <h2>Ingresos previstos del hogar</h2>
              <strong>{money(monthlyIncome)}</strong>
              <p>
                Estimación a partir de los perfiles; no cuenta como dinero
                recibido. Puedes corregirlos seleccionando a la persona en Tu
                hogar.
              </p>
              <small>
                Quincenal: 2 pagos al mes. Semanal: promedio de 52 semanas entre
                12 meses.
              </small>
            </section>
            <section className="card profile-settings">
              <h2>Ubicación del hogar</h2>
              <LocationPicker
                value={area}
                onChange={setArea}
                disabled={!owner}
              />
            </section>
            <section className="card profile-settings">
              <h2>Privacidad y permisos</h2>
              <label className="check-line">
                <input
                  type="checkbox"
                  required
                  checked={prefs.privacyAccepted}
                  onChange={(e) => change("privacyAccepted", e.target.checked)}
                />
                <span>
                  Acepto el{" "}
                  <a href="/privacidad.html" target="_blank" rel="noreferrer">
                    aviso de privacidad
                  </a>
                  .
                </span>
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={prefs.aiConsent}
                  disabled={!owner}
                  onChange={(e) => change("aiConsent", e.target.checked)}
                />
                <span>
                  Permito a Jami analizar mis documentos con IA. Mis fotos y
                  documentos no se almacenan.
                </span>
              </label>
              <p className="helper">
                La conexión bancaria se autoriza de forma individual en
                Simulador → Conectar mi banco. No acredita ahorro
                automáticamente.
              </p>
            </section>
          </>
        )}
        {!owner && (
          <p className="helper">
            La persona administradora edita los datos compartidos del hogar.
          </p>
        )}
        <ErrorText text={error} />
        {saved && (
          <p className="success" role="status">
            Preferencias guardadas.
          </p>
        )}
        <Button busy={busy}>
          <Next>
            {initial
              ? "Guardar preferencias y empezar"
              : "Guardar preferencias"}
          </Next>
        </Button>
      </form>
      {!initial && (
        <section className="card">
          <h2>Zona del hogar</h2>
          <LocationPicker value={area} onChange={setArea} disabled={!owner} />
          {owner && (
            <Button
              busy={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await call("saveLocation", area);
                  await onSaved();
                  setSaved(true);
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Guardar zona
            </Button>
          )}
        </section>
      )}
      <ShareHome
        code={home.invitationCode}
        expiresAt={home.invitationExpiresAt}
        owner={owner}
        onSaved={onSaved}
      />
      {!initial && (
        <button className="text-button logout" onClick={() => signOut(auth)}>
          <LogOut size={18} />
          Cerrar sesión
        </button>
      )}
      {editing !== null && (
        <MemberEditor
          member={members[editing] ?? emptyMember()}
          onDelete={
            owner && members[editing]?.id !== home.ownerUid && members[editing]
              ? () => {
                  setDeleting(editing);
                  setEditing(null);
                }
              : undefined
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
      {deleting !== null && (
        <Modal
          title="Eliminar perfil"
          onClose={() => !busy && setDeleting(null)}
        >
          <p>
            ¿Eliminar a {members[deleting]?.name} del hogar? Sus movimientos
            anteriores se conservan. Si tiene una cuenta vinculada, perderá
            acceso a este hogar.
          </p>
          <ErrorText text={error} />
          <Button busy={busy} onClick={removeMember}>
            Sí, eliminar perfil
          </Button>
          <Button
            className="secondary"
            disabled={busy}
            onClick={() => setDeleting(null)}
          >
            Cancelar
          </Button>
        </Modal>
      )}
    </main>
  );
}
