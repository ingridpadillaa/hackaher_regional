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
  const [section, setSection] = useState("");
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
          ? { ...prefs, members, monthlyBudget: monthlyIncome }
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
  const panels = [
    {
      title: "Estilo de vida",
      subtitle:
        "Hábitos para que Jami adapte sus consejos; no cambia tu presupuesto.",
      icon: Heart,
    },
    {
      title: "Metas prioritarias",
      subtitle:
        "Temas que Jami debe priorizar; las metas con monto se crean en Simulador.",
      icon: Target,
    },
    {
      title: "Tu asistente Jami",
      subtitle: "Personaliza a Jami y elige cómo quieres que te acompañe.",
      icon: Heart,
    },
  ];
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
          Cuéntanos sobre tu hogar y estilo de vida
          <br />
          para darte una experiencia hecha a tu medida.
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
        {panels.map(({ title, subtitle, icon: Icon }) => (
          <button
            type="button"
            disabled={!owner}
            key={title}
            className="card profile-row"
            onClick={() => setSection(title)}
          >
            <span className="tile">
              {title === "Tu asistente Jami" ? (
                <img src="/images/jami-avatar.png" alt="" />
              ) : (
                <Icon />
              )}
            </span>
            <span>
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
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
              <h2>Ingreso mensual del hogar</h2>
              <strong>{money(monthlyIncome)}</strong>
              <p>
                Calculado con los ingresos que registraste en los perfiles.
                Puedes corregirlos seleccionando a la persona en Tu hogar.
              </p>
              <small>
                Quincenal: 2 pagos al mes. Semanal: promedio de 52 semanas entre
                12 meses.
              </small>
            </section>
            <section className="card profile-settings">
              <h2>Ubicación del hogar</h2>
              <div>
                <Field label="Municipio">
                  <input
                    required={owner}
                    disabled={!owner}
                    maxLength={120}
                    value={prefs.municipality}
                    placeholder="Municipio del hogar"
                    onChange={(e) => change("municipality", e.target.value)}
                  />
                </Field>
              </div>
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
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={prefs.bankConsent}
                  disabled={!owner}
                  onChange={(e) => change("bankConsent", e.target.checked)}
                />
                <span>Quiero conectar mi banco para verificar mi ahorro.</span>
              </label>
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
      <ShareHome code={home.invitationCode} />
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
      {section && (
        <Modal title={section} onClose={() => setSection("")}>
          {section === "Estilo de vida" ? (
            <Field label="Así es nuestro día a día">
              <textarea
                maxLength={400}
                value={prefs.lifestyle}
                onChange={(e) => change("lifestyle", e.target.value)}
                placeholder="Hábitos, transporte y actividades del hogar"
              />
            </Field>
          ) : section === "Metas prioritarias" ? (
            <div className="chips">
              {[
                "Fondo de emergencia",
                "Viaje",
                "Educación",
                "Casa",
                "Pagar deudas",
              ].map((x) => (
                <button
                  key={x}
                  className={prefs.priorities.includes(x) ? "selected" : ""}
                  onClick={() =>
                    change(
                      "priorities",
                      prefs.priorities.includes(x)
                        ? prefs.priorities.filter((v) => v !== x)
                        : [...prefs.priorities, x],
                    )
                  }
                >
                  {x}
                </button>
              ))}
            </div>
          ) : (
            <Field label="¿Cómo quieres que te acompañe Jami?">
              <select
                value={prefs.assistantTone}
                onChange={(e) => change("assistantTone", e.target.value)}
              >
                <option value="cercano">Cercano y cálido</option>
                <option value="directo">Breve y directo</option>
                <option value="motivador">Con ánimo y motivación</option>
              </select>
            </Field>
          )}
          <Button onClick={() => setSection("")}>Listo</Button>
        </Modal>
      )}
    </main>
  );
}
