import os
import re
from typing import Protocol

from pydantic import BaseModel


class ExtractionUnavailable(ValueError):
    pass


class LLMClient(Protocol):
    def extract(
        self, prompt: str, schema: type[BaseModel], media: bytes | None = None, mime: str | None = None
    ) -> BaseModel: ...


def redact(text):
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[correo omitido]", text)
    text = re.sub(r"\b(?:\d[ -]?){10,18}\b", "[cuenta omitida]", text)
    # Statement lines carrying direct identity are never sent upstream.
    return "\n".join(
        line
        for line in text.splitlines()
        if not re.search(r"(?i)nombre|titular|domicilio|direccion|rfc|curp|cliente", line)
    )


class GeminiClient:
    def extract(self, prompt, schema, media=None, mime=None):
        from google import genai
        from google.genai import types

        if not os.getenv("GEMINI_API_KEY"):
            raise ExtractionUnavailable("Jami no está disponible en este momento. Puedes capturar a mano.")
        client = genai.Client(
            api_key=os.environ["GEMINI_API_KEY"], http_options=types.HttpOptions(timeout=8000)
        )
        contents = [redact(prompt)]
        if media:
            contents.append(types.Part.from_bytes(data=media, mime_type=mime))
        for _ in range(2):
            try:
                response = client.models.generate_content(
                    model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json", response_schema=schema, temperature=0
                    ),
                )
                return schema.model_validate_json(response.text)
            except Exception:
                continue
        raise ExtractionUnavailable("No pudimos leerlo con confianza. Intenta otra vez o usa captura manual.")


class OpenAIClient:
    def extract(self, prompt, schema, media=None, mime=None):
        if not os.getenv("OPENAI_API_KEY") or not os.getenv("OPENAI_MODEL"):
            raise ExtractionUnavailable("Jami no está disponible en este momento. Puedes capturar a mano.")
        try:
            from openai import OpenAI
        except ImportError as error:
            raise ExtractionUnavailable("Instala el proveedor opcional OpenAI o utiliza Gemini.") from error
        import base64

        content = [{"type": "input_text", "text": redact(prompt)}]
        if media:
            content.append(
                {
                    "type": "input_image",
                    "image_url": f"data:{mime};base64," + base64.b64encode(media).decode(),
                }
            )
        client = OpenAI(timeout=8, max_retries=0)
        for _ in range(2):
            try:
                response = client.responses.parse(
                    model=os.environ["OPENAI_MODEL"],
                    input=[{"role": "user", "content": content}],
                    text_format=schema,
                    store=False,
                )
                if response.output_parsed is not None:
                    return response.output_parsed
            except Exception:
                continue
        raise ExtractionUnavailable("Jami no está disponible en este momento. Puedes capturar a mano.")


def get_llm():
    if os.getenv("LLM_PROVIDER") == "openai":
        return OpenAIClient()
    if os.getenv("LLM_PROVIDER", "gemini") != "gemini":
        raise ExtractionUnavailable("Proveedor de IA no configurado; usa captura manual.")
    return GeminiClient()
