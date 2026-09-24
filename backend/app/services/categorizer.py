import json
import re
import unicodedata
from pathlib import Path

CATEGORIES = json.loads((Path(__file__).resolve().parents[2] / "data/categorias.json").read_text())


def normalize(text):
    return re.sub(
        r"\s+",
        " ",
        "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn"),
    ).strip()


def categorize(description, rules=None, provider_category=None):
    key = normalize(description)
    if rules and key in rules:
        return rules[key]
    if provider_category in CATEGORIES:
        return provider_category
    for words, category in [
        ("super|abarrote|despensa|aceite|huevo", "Súper"),
        ("taco|comida|cafe|restaurante", "Comida fuera"),
        ("gasolina|camion|uber|transporte", "Transporte"),
        ("colegiatura|escuela|utiles", "Educación"),
        ("netflix|spotify|disney|youtube|prime", "Suscripciones"),
        ("cfe|telmex|luz|agua|internet|gas", "Servicios"),
        ("farmacia|medico", "Salud"),
        ("nomina|quincena|sueldo", "Sueldo"),
    ]:
        if re.search(words, key):
            return category
    return "Otros"


def is_card_payment(description):
    return bool(re.search(r"pago (?:de )?(?:tdc|tarjeta)", normalize(description)))
