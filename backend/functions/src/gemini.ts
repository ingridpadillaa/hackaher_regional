import { HttpsError } from "firebase-functions/v2/https";
import type { IntegrationSecrets } from "./banking";
export type GeminiPart =
  { text: string } | { inlineData: { mimeType: string; data: string } };

// Shared server-only client: no credentials, raw files or provider errors are logged.
export async function generateJson(
  secrets: IntegrationSecrets,
  instruction: string,
  parts: GeminiPart[],
  schema: Record<string, unknown>,
  maxOutputTokens = 4096,
) {
  if (!secrets.geminiKey || !secrets.geminiModel)
    throw new HttpsError(
      "failed-precondition",
      "Falta configurar la clave y el modelo de Gemini en el backend.",
    );
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(secrets.geminiModel)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": secrets.geminiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            temperature: 0.1,
            maxOutputTokens,
          },
        }),
        signal: AbortSignal.timeout(65000),
      },
    );
  } catch {
    throw new HttpsError(
      "unavailable",
      "No pudimos conectar con Gemini. Intenta de nuevo o usa captura manual.",
    );
  }
  if (!response.ok) {
    if (response.status === 429)
      throw new HttpsError(
        "resource-exhausted",
        "Gemini alcanzó su límite de uso. Espera un momento o usa captura manual.",
      );
    if ([400, 401, 403, 404].includes(response.status))
      throw new HttpsError(
        "failed-precondition",
        "Revisa la clave, los permisos y el modelo configurado de Gemini.",
      );
    throw new HttpsError(
      "unavailable",
      "Gemini no está disponible en este momento. Puedes usar captura manual.",
    );
  }
  try {
    const body: any = await response.json();
    const candidate = body.candidates?.[0];
    if (
      body.promptFeedback?.blockReason ||
      (candidate?.finishReason && candidate.finishReason !== "STOP")
    )
      throw new Error("Incomplete response");
    const text = candidate?.content?.parts
      ?.filter((p: any) => !p.thought)
      .map((p: any) => p.text ?? "")
      .join("");
    return JSON.parse(text);
  } catch {
    throw new HttpsError(
      "unavailable",
      "Gemini no devolvió un análisis completo. Intenta con un archivo más claro o usa captura manual.",
    );
  }
}
