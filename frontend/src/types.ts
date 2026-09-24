export interface Member {
  id?: string;
  name: string;
  age: number;
  relationship: string;
  education: string;
  occupation: string;
  income: number;
  period: "mensual" | "quincenal" | "semanal";
}
export interface Preferences {
  municipality: string;
  monthlyBudget: number;
  lifestyle: string;
  priorities: string[];
  assistantTone: "cercano" | "directo" | "motivador";
  aiConsent: boolean;
  bankConsent: boolean;
  privacyAccepted: boolean;
  alerts: boolean;
  goals: boolean;
  donations: boolean;
}
export interface Movement {
  id?: string;
  type: "gasto" | "ingreso";
  amount: number;
  category: string;
  note: string;
  date: string;
  method: "manual" | "pdf" | "audio" | "ticket";
  requestId?: string;
  draftId?: string;
  draftIndex?: number;
}
export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  selected: boolean;
}
export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
}
export interface Notice {
  id: string;
  title: string;
  message: string;
  read: boolean;
  kind: string;
}
export interface State {
  user: {
    nombre: string;
    hogarId?: string;
    personalizacionCompleta: boolean;
    rol?: string;
  };
  home: null | {
    id: string;
    name: string;
    ownerUid: string;
    invitationCode: string;
    members: Member[];
    preferences?: Preferences;
    personalized?: boolean;
  };
  movements: Movement[];
  goals: Goal[];
  cart: CartItem[];
  date: string;
  summary: {
    expenses: number;
    extraIncome: number;
    budget: number;
    remaining: number;
    byCategory: { name: string; amount: number }[];
  };
  forecast: {
    name: string;
    date: string;
    extra: number | null;
    source: string;
  };
  notifications: Notice[];
  bank: {
    sandbox?: boolean;
    sandboxConnected?: boolean;
    sandboxAccountCount?: number;
    sandboxTransactionCount?: number;
    sandboxLastSync?: string;
    connected: boolean;
    streak: number;
    lastSync: string | null;
  };
}
export const money = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(n);
export const dateLabel = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const categories = [
  "Vivienda",
  "Alimentación",
  "Transporte",
  "Salud",
  "Educación",
  "Recreación",
  "Servicios",
  "Ropa",
  "Otros",
];
export const emptyMember = (): Member => ({
  name: "",
  age: 0,
  relationship: "Adulto",
  education: "",
  occupation: "",
  income: 0,
  period: "mensual",
});
