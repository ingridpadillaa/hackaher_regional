import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('qqp', Path(__file__).parents[1] / 'scripts/import-profeco.py')
qqp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qqp)

class CatalogTest(unittest.TestCase):
    def test_exact_presentations_latest_observation_and_invalid_prices(self):
        base = dict(producto='Producto de prueba', presentacion='1 litro', marca='Marca de prueba', precio='10', fecha_registro='2026-01-01', cadena_comercial='Cadena de prueba', nombre_comercial='Sucursal de prueba', direccion='Dirección de prueba', estado='Nuevo León', municipio='Monterrey', giro='Supermercado', latitud='25.6', longitud='-100.3')
        rows = [base, dict(base, precio='12', fecha_registro='2026-01-02'), dict(base, presentacion='2 litros', precio='20'), dict(base, precio='NaN'), dict(base, fecha_registro='2999-01-01')]
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'test.csv'
            with source.open('w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=list(base))
                writer.writeheader()
                writer.writerows(rows)
            result = qqp.convert(source, 'nuevo leon', ['MONTERREY'], 'https://example.test/fixture')
        self.assertEqual(len(result['products']), 2)
        self.assertEqual(len(result['stores']), 1)
        self.assertEqual(sorted(p['price'] for p in result['prices']), [12, 20])
        self.assertEqual(result['metadata']['rejected'], 2)

if __name__ == '__main__':
    unittest.main()
