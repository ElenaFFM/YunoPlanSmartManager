# 14. Catálogo de validaciones y gates

## 1. Clasificación

- `ERROR`: bloquea guardado, ejecución o aprobación según la etapa.
- `WARNING`: permite continuar solo con rol habilitado y justificación.
- `INFO`: explica un impacto o una decisión calculada.

Cada validación debe tener código estable, mensaje para usuario, detalle técnico, campo/entidad afectada y etapa donde aplica.

## 2. Catálogo y plantillas

| Código | Regla | Severidad |
|---|---|---|
| `CAT-BANK-001` | Código y nombre de banco obligatorios y únicos | ERROR |
| `CAT-IIN-001` | BIN/IIN con longitud y formato aceptados por Yuno | ERROR |
| `CAT-IIN-002` | BIN activo asignado a un único banco | ERROR |
| `CAT-IIN-003` | Cambio de BIN impacta campañas activas/futuras | WARNING con análisis |
| `TPL-001` | Banco/General tienen exactamente cuatro tramos | ERROR |
| `TPL-002` | Límites ordenados y min menor/igual que max | ERROR |
| `TPL-003` | Sin huecos ni cruces según política vigente | ERROR por default |
| `TPL-004` | Cobertura inicia en cero y llega al tope | ERROR por default |
| `TPL-005` | Set contiene cuota 1 | ERROR |
| `TPL-006` | Cuotas positivas, únicas y descendentes | ERROR |
| `TPL-007` | Todas las tasas son 1 | ERROR |
| `TPL-008` | Desactivar plantilla no altera campañas | INFO |
| `TPL-AMEX-001` | Cambio de Amex puede modificar protección superior | WARNING |

## 3. Campañas

| Código | Regla | Severidad |
|---|---|---|
| `CMP-001` | Nombre, motivo y alcance requeridos | ERROR |
| `CMP-002` | Inicio válido en zona Argentina | ERROR |
| `CMP-003` | Fin posterior al inicio | ERROR |
| `CMP-004` | Vigencia indefinida confirmada explícitamente | WARNING/confirmación |
| `CMP-005` | Una configuración efectiva por banco | ERROR |
| `CMP-006` | Una configuración General efectiva | ERROR |
| `CMP-007` | Los tramos del grupo comparten vigencia esperada | ERROR |
| `CMP-008` | Estado anterior proyectado disponible | ERROR |
| `CMP-009` | Estado posterior definido si la campaña termina | ERROR |
| `CMP-010` | Transformación conserva opciones inferiores exactas | ERROR |
| `CMP-011` | Cambio estructural crea nueva versión | ERROR interno |
| `CMP-012` | Combinación o monto fuera del patrón histórico | WARNING |

## 4. Proyección temporal

| Código | Regla | Severidad |
|---|---|---|
| `TIME-001` | Todos los puntos de cambio generan segmentos | ERROR |
| `TIME-002` | Segmentos consecutivos no se pisan | ERROR |
| `TIME-003` | Cada punto banco/monto/fecha resuelve una configuración | ERROR |
| `TIME-004` | Días específicos enumerados individualmente | ERROR |
| `TIME-005` | Fin de una regla durante otra recalcula segmentos | ERROR |
| `TIME-006` | Fecha ficticia solo existe en TestRun | ERROR de seguridad |

## 5. Estado remoto e IDs

| Código | Regla | Severidad |
|---|---|---|
| `REMOTE-001` | Todo create confirmado tiene ID persistido | ERROR |
| `REMOTE-002` | Futuro a reemplazar tiene ID conocido | ERROR |
| `REMOTE-003` | ID remoto pertenece al ambiente correcto | ERROR |
| `REMOTE-004` | Snapshot base coincide con remoto/local | ERROR si hay drift relevante |
| `REMOTE-005` | Plan finalizado naturalmente no genera delete | ERROR interno |
| `REMOTE-006` | Delete tiene motivo y autorización | ERROR |
| `REMOTE-007` | General no envía BINs | ERROR |
| `REMOTE-008` | Account, country, currency y merchant reference corresponden a Argentina/ambiente | ERROR |

## 6. Plan de ejecución

| Código | Regla | Severidad |
|---|---|---|
| `EXEC-001` | Orden jerárquico válido; General último | ERROR |
| `EXEC-002` | Cada write tiene verificación y compensación | ERROR |
| `EXEC-003` | Deletes posteriores a reemplazos/verificación | ERROR |
| `EXEC-004` | Lock de alcance adquirido | ERROR |
| `EXEC-005` | Versión inmutable coincide con plan | ERROR |
| `EXEC-006` | No hay otro run activo incompatible | ERROR |
| `EXEC-007` | Resultado desconocido bloquea reintento ciego | ERROR |
| `EXEC-008` | Compensación potencialmente destructiva requiere evaluación | WARNING/ERROR |

## 7. Laboratorio SDK

| Código | Regla | Severidad |
|---|---|---|
| `SDK-001` | Ambiente forzado a sandbox | ERROR de seguridad |
| `SDK-002` | Checkpoints obligatorios generados | ERROR |
| `SDK-003` | Caso por tramo y límite monetario | ERROR |
| `SDK-004` | Tarjetas/BINs afectados incluidos | ERROR |
| `SDK-005` | Esperado coincide con observado | ERROR para aprobación |
| `SDK-006` | NOT_APPLICABLE justificado | ERROR si falta motivo |
| `SDK-007` | Ensayo inició desde baseline sandbox conocido | ERROR |
| `SDK-008` | No existe otro laboratorio con lock | ERROR |
| `SDK-009` | Hash probado coincide con versión actual | ERROR |

## 8. Gate de producción

La acción de aprobar/ejecutar producción exige todos estos checks:

- [ ] Validaciones estructurales sin errores.
- [ ] Proyección temporal revisada.
- [ ] Planes futuros afectados con IDs conocidos.
- [ ] Sandbox ejecutado según política.
- [ ] Etapa Antes aprobada.
- [ ] Todas las etapas Durante aprobadas.
- [ ] Etapa Después aprobada o no aplicable automáticamente.
- [ ] TestRuns iniciados desde baseline sandbox conocido.
- [ ] Checklist comercial confirmado.
- [ ] Advertencias justificadas por usuario autorizado.
- [ ] Hash probado igual al actual.
- [ ] Aprobación vigente.
- [ ] Drift productivo inexistente o no relevante.
- [ ] Usuario activo con rol `OPERATOR` o `ADMIN`.
- [ ] Ejecutor y locks saludables.

## 9. Confirmación del usuario

Los checks manuales no reemplazan validaciones automáticas. Registran que una persona revisó:

- bancos y BINs;
- rangos;
- sets exactos;
- fechas;
- fases;
- resultados SDK;
- operaciones remotas;
- compensaciones;
- ambiente destino.

## 10. Invalidación del gate

Se invalida si cambia:

- fecha o recurrencia;
- rango;
- cuota;
- BIN/banco;
- plantilla o snapshot;
- segmento temporal;
- estado base relevante;
- contrato remoto que afecte el payload.

Una invalidación conserva evidencia histórica, pero impide reutilizarla para producción.
