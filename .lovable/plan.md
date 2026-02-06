

# Fix: Indicadores Economicos no visibles por bloqueo CORS

## Problema detectado

La funcion backend `economic-indicators` funciona correctamente y devuelve datos (UF: 39.066, USD: 865.67), pero el navegador **bloquea la respuesta por CORS** cuando se accede desde el dominio de preview.

El archivo `_shared/cors.ts` tiene una lista restrictiva de origenes permitidos que no incluye todos los dominios desde donde se accede a la aplicacion. Cuando el origen no coincide, el header `Access-Control-Allow-Origin` devuelve un valor incorrecto y el navegador rechaza la respuesta.

Error confirmado en consola:
```
Access to fetch blocked by CORS policy: The 'Access-Control-Allow-Origin' header 
has a value that is not equal to the supplied origin.
```

## Solucion

Actualizar `supabase/functions/_shared/cors.ts` para usar `Access-Control-Allow-Origin: *` como indican las mejores practicas de Supabase para edge functions. Esto es seguro porque:

- La autenticacion se maneja via JWT en el header `Authorization`, no via cookies/origen
- Las funciones ya tienen `verify_jwt = false` con validacion manual cuando es necesario
- El patron `*` es el estandar recomendado para APIs REST

## Cambio tecnico

**Archivo: `supabase/functions/_shared/cors.ts`**

Simplificar la configuracion CORS para usar el wildcard estandar:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

export function getCorsHeaders(_req: Request): Record<string, string> {
  return corsHeaders;
}

export function handleCorsPreflightRequest(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}
```

Esto corrige el problema sin modificar ninguna otra funcion, ya que todas importan desde `_shared/cors.ts`.

## Impacto

- Todas las edge functions se benefician del fix (no solo `economic-indicators`)
- No requiere cambios en el frontend
- No requiere redespliegue individual de cada funcion (el archivo compartido se incluye automaticamente)

