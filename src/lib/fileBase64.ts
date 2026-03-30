/**
 * Convierte un File a base64 (sin prefijo data:...)
 * usando FileReader para evitar errores con archivos grandes.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("No se pudo convertir archivo a base64"));
        return;
      }

      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Error leyendo archivo"));
    };

    reader.readAsDataURL(file);
  });
}
