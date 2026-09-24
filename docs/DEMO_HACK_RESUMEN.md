# Hogar Hack · demostración

Proyecto Firebase: hackaher. Hogar: demo-hack.

Datos ficticios autorizados para la demo, del 2026-07-01 al 2026-09-24. Perfiles: Rosy y Vane. 78 movimientos, 2 metas, carrito sin precios inventados. Ingreso mensual agregado: $27,000 MXN (capturado en perfiles, no duplicado como movimientos).

Los accesos están únicamente en backend/.demo-hack-access.local, excluido de Git. No se enviaron correos.

Totales de control:

```json
{
  "2026-07": {
    "expenses": 16485,
    "extraIncome": 600
  },
  "2026-08": {
    "expenses": 15215,
    "extraIncome": 600
  },
  "2026-09": {
    "expenses": 14905,
    "extraIncome": 600
  }
}
```

La carga en Firestore no despliega Hosting ni Functions. El modo demo-summa local usa otra base; no muestra automáticamente estos datos de la nube.
