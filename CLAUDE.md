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

## Notas para Claude

- Matias es el founder. Es no-técnico, así que explicar las decisiones técnicas en lenguaje simple cuando sea relevante.
- Cuando haya más de una forma de hacer algo, presentar las opciones con sus trade-offs antes de implementar.
- Si algo no está claro, preguntar antes de asumir — especialmente en temas que afecten datos de usuarios reales.
