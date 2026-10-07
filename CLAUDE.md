# LeaseFlow-pro — Instrucciones para Claude Code

## Qué es este proyecto

LeaseFlow-pro es un CRM para la administración de contratos de arriendo y presupuestos, con módulos integrados de mantención de propiedades. Tiene usuarios activos. Viene de un desarrollo en Lovable y está en proceso de migración hacia un stack propio.

---

## Contexto de negocio

- Mercado objetivo: administradoras de propiedades y corredoras en Chile / LATAM
- Usuarios del sistema: administradores, propietarios, arrendatarios, técnicos de mantención
- Módulos core: contratos, presupuestos, mantención, (otros por definir)
- Prioridad actual: estabilidad y fidelidad a lo que ya funciona en producción — no romper lo que existe

---

## Stack actual y migración

- **Origen:** Lovable (React + Supabase `tgxiqvfpirwvhktgqqfa`, rama `main`)
- **Destino:** Vercel + Supabase propio `ilcumthwzhmtumaklgvo` (rama `migration`)
- **Regla crítica:** durante la migración, mantener paridad funcional con lo que está en producción. Cada cambio debe ser incremental y reversible.
- Antes de proponer refactors grandes, preguntar si estamos en fase de migración activa o en desarrollo de nuevas features

---

## ⛔ REGLAS DE SEGURIDAD PARA MIGRACIÓN — LEER ANTES DE CUALQUIER ACCIÓN

### Rama `main` = Lovable en producción. ES INTOCABLE.
- **NUNCA** hacer commit a `main` de cambios relacionados con la migración
- **NUNCA** modificar `supabase/config.toml` en `main` (apunta a `tgxiqvfpirwvhktgqqfa` y debe quedarse así)
- **NUNCA** modificar archivos en `supabase/migrations/` en `main` (Lovable puede re-correrlos)
- **NUNCA** hacer `git push` a `main` sin confirmación explícita de Matias
- Cualquier cambio en `main` que Lovable detecte se despliega automáticamente en producción

### Todo el trabajo de migración va en la rama `migration`
- Cambios de config (Supabase nuevo, Vercel, variables de entorno) → solo en `migration`
- Correcciones de migraciones SQL para la DB nueva → solo en `migration`
- Vercel está conectado a `migration`, no a `main`

### Antes de cualquier commit, preguntarse:
1. ¿Estoy en la rama correcta? (`git branch` para verificar)
2. ¿Este archivo existe en Lovable? Si sí → solo va en `migration`
3. ¿Podría Lovable desplegar esto automáticamente? Si sí → STOP, confirmar con Matias primero

### Archivos que NUNCA deben cambiar en `main` durante la migración:
- `supabase/config.toml`
- `supabase/migrations/*.sql` (cualquier archivo existente)
- `.env` (el original apunta a Lovable)
- `src/integrations/supabase/client.ts`

---

## Reglas de desarrollo

1. **Cambios pequeños y testeables** — preferir PR atómicos sobre cambios masivos
2. **No asumir el stack destino** — si no está definido en la sesión, preguntar antes de generar código nuevo
3. **Documentar decisiones** — cuando se tome una decisión de arquitectura, dejarla comentada en el código o en este archivo
4. **Variables de entorno** — nunca hardcodear URLs, keys ni credenciales. Usar `.env` siempre
5. **Nombres en inglés** para código (variables, funciones, componentes), **UI en español** para los usuarios finales

---

## Pipeline de revisión obligatorio

Antes de entregar **cualquier** código, componente, query o configuración, ejecutar estos 3 agentes internamente y mostrar su output:

### 🔒 Agente 1 — Auditor de Seguridad
Revisar:
- ¿Hay datos sensibles expuestos (RUTs, contratos, montos)?
- ¿Los inputs están validados y sanitizados?
- ¿Las queries a Supabase usan RLS correctamente?
- ¿Hay keys o secrets en el código?

Output: `[SECURITY: ✅ OK]` o `[SECURITY: ⚠️ RIESGO — descripción]`

### 🧪 Agente 2 — Revisor de Calidad
Revisar:
- ¿El código es legible y consistente con el resto del proyecto?
- ¿Hay lógica duplicada que debería estar en un helper o hook?
- ¿Los componentes tienen responsabilidad única?
- ¿Se manejan los estados de carga y error?

Output: `[QUALITY: ✅ OK]` o `[QUALITY: ⚠️ OBSERVACIÓN — descripción]`

### 🏗️ Agente 3 — Auditor de Migración
Revisar:
- ¿Este cambio es compatible con la migración en curso?
- ¿Introduce dependencias que compliquen el cambio de stack?
- ¿Hay algo que en Lovable funcionaba distinto y puede romper aquí?

Output: `[MIGRATION: ✅ OK]` o `[MIGRATION: ⚠️ ALERTA — descripción]`

---

## Qué hacer si hay alertas

- **SECURITY ⚠️** → No entregar el código. Corregir primero y mostrar la corrección.
- **QUALITY ⚠️** → Entregar el código con la observación visible y proponer la mejora.
- **MIGRATION ⚠️** → Entregar el código con la alerta y esperar confirmación antes de continuar.

---

## Módulos del sistema (actualizar según avance)

| Módulo | Estado | Notas |
|---|---|---|
| Contratos | ✅ En producción | Core del sistema |
| Presupuestos | ✅ En producción | |
| Mantención | ✅ En producción | |
| _(otros)_ | — | Definir |

---

## Restricciones conocidas — NO volver a intentar

| Restricción | Detalle |
|---|---|
| Supabase de Lovable (`tgxiqvfpirwvhktgqqfa`) | **No accesible.** Lovable no entrega acceso directo a la base de datos ni a las claves de servicio. No intentar pg_dump, CLI link, ni pedir credenciales. |
| `.env.production` en `main` | **Nunca debe existir.** Está en `.gitignore`. Su presencia causa que Lovable autentique contra el Supabase nuevo (vacío), rompiendo el login de todos los usuarios. |

---

## Notas para Claude

- Matias es el founder. Es no-técnico, así que explicar las decisiones técnicas en lenguaje simple cuando sea relevante.
- Cuando haya más de una forma de hacer algo, presentar las opciones con sus trade-offs antes de implementar.
- Si algo no está claro, preguntar antes de asumir — especialmente en temas que afecten datos de usuarios reales.

---

## Presentaciones (PPTX) — criterios aprendidos con Matias

Aplican a cualquier PPT que se edite o genere en este proyecto (ej. "Trimestral Octubre 26", área Desarrollo).

**Estilo de marca (extraído de la slide de análisis territorial):**
- Fuente: Arial en todo. Rojo corporativo `#C0003F` (cabeceras, cifras, títulos de sección), texto `#1A1A1A`, grises `#F2F2F2` (fondo de cards) y `#CCCCCC` (bordes), blanco.
- Estructura: sobretítulo rojo ("Desarrollo"), título en negrita, línea gris, contenido en cards con cabecera roja.

**Cómo trabajar un PPT que Matias ya editó:**
1. Matias retoca el archivo a mano entre iteraciones. Partir SIEMPRE de la última versión que suba, nunca de la propia; no rehacer lo que él ya ajustó.
2. Si él corrige algo (ej. los logos), su corrección es la fuente de verdad: no revertirla ni "mejorarla" sin avisar.
3. Antes de editar, revisar la lista de shapes y renderizar a imagen para ver el estado real; después de editar, validar y renderizar de nuevo y mirar la imagen.

**Logos en listados (AP / AG / otros):**
- AP → logo AP; AG → logo AG (cuadrado rojo/verde); Egakat → logo GP; filas "AP / AG ..." llevan los dos logos (AG a la izquierda, AP pegado al texto).
- Nunca usar un solo logo para todos los ítems: el logo depende del prefijo del ítem.
- Los logos deben tener fondo transparente (el PNG original del AP trae fondo blanco opaco y se ve como cuadrito sobre el gris).
- Todos los logos de ítems con la MISMA altura (0.19") y centrados verticalmente en su fila de texto. Calcular el centro de la fila desde el interlineado exacto del cuadro de texto (no a ojo).

**Alineación de cards:**
- Cards de una misma fila comparten exactamente el mismo `top`, alto de cabecera y ancho. Diferencias de milésimas de pulgada se notan (el texto de una cabecera "sube"). Ajustar con un script que fuerce los valores, no a mano.
- Listas en 10 pt con interlineado exacto (16.56 pt); en cards de 1.82" de ancho "AP / AG Casablanca" no cabe a 11 pt junto al logo.
- Dejar ≥0.1" entre el último ítem y el borde inferior de la card.

**Mantener consistentes los datos derivados:** si cambia una lista (ej. se saca "Mall Plaza Trébol"), actualizar también los totales (tiles) y el mapa/pines, o avisar a Matias de lo que quedó inconsistente.

**Entrega:** guardar el .pptx final con nombre versionado y enviarlo con SendUserFile; el repo no es el lugar de los PPT salvo que Matias lo pida.
