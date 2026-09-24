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
  possibleDuplicate?: boolean;
  ruleApplied?: boolean;
  allowDuplicate?: boolean;
  learnCategory?: boolean;
  id?: string;
  type: "gasto" | "ingreso" | "transferencia";
  incomeKind?: "regular" | "extra";
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
  targetDate?: string;
}
export interface Notice {
  id: string;
  title: string;
  message: string;
  read: boolean;
  kind: string;
}
export interface SavingsEntry {
  id: string;
  goalId: string;
  type: "contribution" | "withdrawal" | "opening";
  amount: number;
  date: string;
  note: string;
  source: string;
  verified: boolean;
}
export interface Schedule {
  id: string;
  title: string;
  kind: "income" | "payment" | "saving";
  amount: number;
  nextDate: string;
  frequency: "once" | "weekly" | "biweekly" | "monthly";
  category: string;
  goalId?: string;
  active: boolean;
}
export interface State {
  savingsEntries: SavingsEntry[];
  savings: {
    streak: number;
    weeklyNet: number;
    source: string;
    currentWeek: string;
  };
  schedules: Schedule[];
  expectedIncome: number;
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
    esDemo?: boolean;
    invitationCode: string;
    invitationExpiresAt?: string | null;
    location?: import("./LocationPicker").Area;
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
    regularIncome: number;
    receivedIncome: number;
    balance: number;
    budgetRemaining: number;
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
