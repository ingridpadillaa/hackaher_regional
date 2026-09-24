// Synthetic financial history, explicitly requested for the isolated demonstration.
export const seedTag = "hacka-phase7-v2";
export const homeId = "demo-hacka-v2";
export const people = [
  {
    uid: "demo-hacka-rosy-v2",
    name: "Rosy Herrera",
    email: "rosy.hacka.v2@example.test",
    age: 25,
    income: 15000,
    relationship: "Administrador",
  },
  {
    uid: "demo-hacka-vane-v2",
    name: "Vane Ramirez",
    email: "vane.hacka.v2@example.test",
    age: 26,
    income: 12000,
    relationship: "Adulto",
  },
];
export function buildDataset(end, products = []) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    new Date(end).toISOString().slice(0, 10) !== end
  )
    throw Error("Fecha inválida");
  const start = new Date(end + "T12:00:00Z");
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 2);
  const docs = [],
    months = {},
    saved = { emergency: 0, trip: 0 };
  const ownerUid = people[0].uid;
  const add = (collection, id, data) =>
    docs.push({
      path: `hogares/${homeId}/${collection}/${id}`,
      data: { ...data, esPrueba: true, seedTag },
    });
  const movement = (
    date,
    person,
    category,
    amount,
    note,
    type = "gasto",
    incomeKind,
  ) => {
    const row = {
      type,
      amount,
      category,
      note: `${note} · Demo`,
      date,
      method: "manual",
      ownerUid: person.uid,
      private: false,
      createdAt: date + "T18:00:00.000Z",
    };
    if (incomeKind) row.incomeKind = incomeKind;
    add("movements", `seed-${date}-${docs.length}`, row);
    const m = months[date.slice(0, 7)];
    if (type === "gasto") m.expenses += amount;
    if (type === "ingreso")
      m[incomeKind === "regular" ? "regularIncome" : "extraIncome"] += amount;
    if (type === "transferencia") m.transfers += amount;
  };
  for (
    let d = new Date(start), i = 0;
    d.toISOString().slice(0, 10) <= end;
    d.setUTCDate(d.getUTCDate() + 1), i++
  ) {
    const date = d.toISOString().slice(0, 10),
      day = d.getUTCDate(),
      month = date.slice(0, 7),
      p = people[i % 2];
    months[month] ??= {
      regularIncome: 0,
      extraIncome: 0,
      expenses: 0,
      transfers: 0,
      budget: 18000,
    };
    if (day === 1 || day === 15)
      for (const person of people)
        movement(
          date,
          person,
          "Otros",
          person.income / 2,
          "Nómina recibida",
          "ingreso",
          "regular",
        );
    if (day === 1) movement(date, p, "Vivienda", 6500, "Renta compartida");
    if (day === 5) movement(date, p, "Servicios", 1250, "Servicios del hogar");
    if (day === 12) movement(date, p, "Salud", 460, "Consulta y farmacia");
    if (day === 18) movement(date, p, "Educación", 700, "Curso");
    if (day === 22) movement(date, p, "Recreación", 380, "Salida");
    if (day === 20) movement(date, p, "Ropa", 350, "Ropa");
    if (day === 10)
      movement(
        date,
        p,
        "Otros",
        1000,
        "Entre cuentas propias",
        "transferencia",
      );
    if (day === 16)
      movement(
        date,
        people[1],
        "Otros",
        900,
        "Trabajo adicional",
        "ingreso",
        "extra",
      );
    if (i % 7 === 0)
      movement(date, p, "Alimentación", 850 + (i % 5) * 35, "Despensa");
    if (i % 3 === 0)
      movement(date, p, "Transporte", 95 + (i % 4) * 10, "Traslados");
    if (i % 5 === 0)
      movement(date, p, "Alimentación", 180 + (i % 3) * 20, "Comida fuera");
    if (d.getUTCDay() === 1)
      for (const [goalId, amount] of [
        ["emergency", 400],
        ["trip", 200],
      ]) {
        add("savingsEntries", `${goalId}-${date}`, {
          goalId,
          type: "contribution",
          amount,
          date,
          note: "Aportación semanal · Demo",
          source: "manual",
          verified: false,
          ownerUid: p.uid,
          createdAt: date + "T18:00:00.000Z",
        });
        saved[goalId] += amount;
      }
    if (day === 23) {
      add("savingsEntries", `withdrawal-${date}`, {
        goalId: "emergency",
        type: "withdrawal",
        amount: 150,
        date,
        note: "Imprevisto · Demo",
        source: "manual",
        verified: false,
        ownerUid,
        createdAt: date + "T18:00:00.000Z",
      });
      saved.emergency -= 150;
    }
  }
  for (const person of people) {
    const { uid, email, ...member } = person;
    add("members", uid, {
      ...member,
      education: "Universidad",
      occupation: "Empleada · Demo",
      period: "mensual",
      accountUid: uid,
    });
    add("incomePlans", uid, {
      memberId: uid,
      amount: person.income,
      frequency: "mensual",
      source: "profile",
      active: true,
    });
  }
  for (const [month, totals] of Object.entries(months))
    add("budgets", month, {
      amount: totals.budget,
      source: "manual",
      updatedBy: ownerUid,
      updatedAt: end + "T18:00:00.000Z",
    });
  for (const [id, name, target] of [
    ["emergency", "Fondo de emergencia · Demo", 18000],
    ["trip", "Viaje compartido · Demo", 12000],
  ])
    add("goals", id, {
      name,
      target,
      saved: saved[id],
      ownerUid,
      createdAt: start.toISOString(),
    });
  const next = new Date(end + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  for (const [id, title, kind, amount, frequency, category] of [
    ["rent", "Renta · Demo", "payment", 6500, "monthly", "Vivienda"],
    ["income", "Cobro de nómina · Demo", "income", 7500, "biweekly", "Otros"],
    [
      "saving",
      "Apartar para emergencias · Demo",
      "saving",
      400,
      "weekly",
      "Otros",
    ],
  ])
    add("schedules", id, {
      title,
      kind,
      amount,
      nextDate: next.toISOString().slice(0, 10),
      frequency,
      anchorDay: next.getUTCDate(),
      category,
      ...(kind === "saving" ? { goalId: "emergency" } : {}),
      active: true,
      updatedBy: ownerUid,
    });
  add("cart", "current", {
    items: products
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        quantity: 1,
        selected: true,
      })),
    updatedAt: end + "T18:00:00.000Z",
  });
  add("notifications", "welcome", {
    title: "Hogar Hacka · demostración",
    message:
      "Historia financiera ficticia de tres meses. Ahorro declarado, sin verificación bancaria. Los precios de PROFECO conservan su fuente y fecha reales.",
    kind: "demo",
    createdAt: end + "T18:00:00.000Z",
  });
  return {
    docs,
    manifest: {
      seedTag,
      homeId,
      name: "Hacka",
      start: start.toISOString().slice(0, 10),
      end,
      months,
      saved,
      documents: docs.length,
      profiles: people.map((p) => p.name),
      marketPricesCreated: 0,
    },
  };
}
