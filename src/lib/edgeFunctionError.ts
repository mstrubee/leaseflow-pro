/**
 * supabase.functions.invoke() nunca lee el body de la respuesta cuando el
 * status no es 2xx -- lanza un FunctionsHttpError con mensaje fijo genérico
 * ("Edge Function returned a non-2xx status code") y guarda la Response
 * cruda (sin consumir) en `error.context`. El mensaje real que devuelve
 * nuestra Edge Function (ej. "Ya existe una cuenta con este correo...")
 * queda enterrado ahí, nunca leído -- el usuario ve un error genérico e
 * incomprensible en vez del mensaje útil.
 */
export async function getFunctionErrorMessage(error: any, fallback: string): Promise<string> {
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return body.error;
    } catch {
      // No era JSON, o el body ya se había consumido -- usar el fallback.
    }
  }
  return error?.message || fallback;
}
