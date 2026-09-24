import {
  useEffect,
  useRef,
  useId,
  isValidElement,
  cloneElement,
  type ReactNode,
} from "react";
import {
  X,
  ArrowRight,
  House,
  Utensils,
  Car,
  Heart,
  GraduationCap,
  Gamepad2,
  Zap,
  Shirt,
  Ellipsis,
} from "lucide-react";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <img
      src="/images/summa-logo.png"
      alt="Summa"
      className={small ? "logo small" : "logo"}
    />
  );
}
export function Jami({
  kind = "ideas",
  className = "",
}: {
  kind?: string;
  className?: string;
}) {
  return (
    <img
      className={"jami " + className}
      src={`/images/jami-${kind}.png`}
      alt="Jami, tu asistente de ahorro"
    />
  );
}
export function Button({
  children,
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={"button " + (props.className ?? "")}
    >
      {busy ? "Guardando…" : children}
    </button>
  );
}
export function Next({ children = "Continuar" }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <ArrowRight size={20} />
    </>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = before;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <button
          className="icon-button close"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
export function CategoryIcon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  const C =
    (
      {
        Vivienda: House,
        Alimentación: Utensils,
        Transporte: Car,
        Salud: Heart,
        Educación: GraduationCap,
        Recreación: Gamepad2,
        Servicios: Zap,
        Ropa: Shirt,
      } as Record<string, typeof House>
    )[name] ?? Ellipsis;
  return <C size={size} />;
}
export function ErrorText({ text }: { text: string }) {
  return text ? (
    <p className="error" role="alert">
      {text}
    </p>
  ) : null;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const control =
    isValidElement(children) &&
    ["input", "select", "textarea"].includes(String(children.type))
      ? cloneElement(children as React.ReactElement<any>, {
          id,
          "aria-label": label,
        })
      : children;
  return (
    <label
      className="field"
      htmlFor={
        isValidElement(control) &&
        ["input", "select", "textarea"].includes(String(control.type))
          ? id
          : undefined
      }
    >
      <span>{label}</span>
      {control}
    </label>
  );
}
