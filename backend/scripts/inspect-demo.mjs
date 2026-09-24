import { maintenanceClient } from "./firebase-admin-local.mjs";
const { db, client } = await maintenanceClient();
const homes = await db
  .collection("hogares")
  .select("name", "nombre", "ownerUid", "esDemo")
  .get();
for (const h of homes.docs) {
  if (/hack/i.test(h.data().name || h.data().nombre || "")) {
    const members = await h.ref.collection("members").get();
    console.log(
      JSON.stringify({
        id: h.id,
        ...h.data(),
        members: members.docs.map((m) => ({
          id: m.id,
          name: m.data().name,
          accountUid: m.data().accountUid,
        })),
        movementCount: (
          await h.ref.collection("movements").count().get()
        ).data().count,
      }),
    );
  }
}
console.log(JSON.stringify({ totalHomes: homes.size }));
try {
  const response = await client.request({
    url: "https://secretmanager.googleapis.com/v1/projects/hackaher/secrets/SUMMA_INTEGRATIONS/versions/latest:access",
  });
  const values = JSON.parse(
    Buffer.from(response.data.payload.data, "base64").toString(),
  );
  console.log(
    JSON.stringify({
      geminiKeyConfigured: !!values.geminiKey,
      geminiModelConfigured: !!values.geminiModel,
    }),
  );
} catch (e) {
  console.log(
    JSON.stringify({ secretAccess: e.response?.status ?? "unavailable" }),
  );
}
