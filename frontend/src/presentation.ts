// Clean visible copy without changing stored records or integration identifiers.
export function interfaceText(text: string): string {
  return text
    .replace(/\s*[·|–—-]\s*demo\b/gi, "")
    .replace(/\bde\s+demo\b/gi, "de prueba")
    .replace(/\bdemo\b/gi, "de prueba")
    .replace(/\bdemostración\b/gi, "prueba")
    .trim();
}
const visibleFields = new Set([
  "name", "nombre", "title", "note", "description", "label",
  "reply", "advice", "notice", "message", "warning",
]);
export function presentResponse<T>(value: T): T {
  if (Array.isArray(value)) return value.map(presentResponse) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      visibleFields.has(key) && typeof item === "string"
        ? interfaceText(item)
        : presentResponse(item),
    ])) as T;
  }
  return value;
}
