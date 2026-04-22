

# Endurecer la seguridad de la sesión y de las contraseñas

## Objetivo
Reducir el riesgo de accesos no autorizados con tu cuenta y dar visibilidad/control sobre las sesiones activas.

## Cambios a implementar

### 1. Activar protección de contraseñas filtradas (HIBP)
Activar el chequeo contra la base de datos "Have I Been Pwned" en Lovable Cloud. Si tu contraseña actual aparece en filtraciones públicas conocidas, el sistema te obligará a cambiarla y bloqueará a cualquiera que intente registrar/usar contraseñas comprometidas.

### 2. Forzar cierre de todas las sesiones activas ahora
Agregar un botón en el panel de administración: **"Cerrar todas las sesiones de todos los usuarios"**. Esto invalida cualquier `localStorage` existente en cualquier dispositivo. Todos (incluido quien sea que haya entrado) deberán volver a iniciar sesión.

### 3. Botón "Cerrar sesión en todos mis dispositivos" para cada usuario
En el menú de usuario (esquina superior), agregar la opción `signOut({ scope: 'global' })` para que cada persona pueda invalidar sus propias sesiones remotas sin depender del admin.

### 4. Banner de cambio de contraseña obligatorio
En `Auth.tsx`, agregar un flujo de **"Cambiar contraseña"** (usando `supabase.auth.updateUser({ password })`). Recomendación inmediata: tú cambias tu contraseña por una nueva, larga y única, después del paso 2.

### 5. Registro visible de inicios de sesión
Crear una vista en el Panel de Admin que muestre los últimos logins por usuario (fecha, hora, IP aproximada) leyendo desde `auth_logs` vía una edge function con service role. Así detectas accesos sospechosos rápido.

## Lo que NO se puede hacer (aclaración importante)
- **No se puede impedir que un link público (`gplanet.lovable.app`) sea visitado.** Esa URL solo abre la pantalla de login. La protección está en `ProtectedRoute`, que ya redirige a `/auth` si no hay sesión válida — eso ya funciona correctamente.
- **No se puede "revocar" un link.** El link es solo la dirección del sitio. Lo que se revoca son sesiones y contraseñas.

## Detalles técnicos

- **HIBP**: usar `configure_auth` con `password_hibp_enabled: true`.
- **Logout global admin**: edge function `force-logout-all` con service role que invoque `auth.admin.signOut(userId, 'global')` para cada usuario en `auth.users`.
- **Logout global propio**: en `useAuth.signOut`, cambiar a `supabase.auth.signOut({ scope: 'global' })`.
- **Cambio de contraseña**: nuevo componente `ChangePasswordDialog` accesible desde `FloatingUserStatus`.
- **Auditoría de logins**: edge function `recent-logins` que consulta `auth_logs` (últimas 100 entradas con `path=/token` y `action=login`) y la rendering en `AdminPanel`.

## Archivos a tocar
- `supabase/functions/force-logout-all/index.ts` (nuevo)
- `supabase/functions/recent-logins/index.ts` (nuevo)
- `src/hooks/useAuth.tsx` (signOut global)
- `src/components/FloatingUserStatus.tsx` (botón cerrar todo + cambiar contraseña)
- `src/pages/AdminPanel.tsx` (sección "Seguridad y sesiones")
- `src/components/admin/SecuritySessionsPanel.tsx` (nuevo)
- Configuración de auth: activar HIBP

