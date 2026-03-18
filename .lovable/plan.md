

## Plan: Carta Oferta en Word (.docx) — Revisado

### Cambio solicitado
Solo incluir en la carta los ítems comerciales que tengan valor definido (> 0 o no nulo). Si Gastos Comunes, Fondo de Promoción, u otros campos no tienen valor, simplemente no se mencionan.

### Implementación

**1. Instalar dependencia `docx`** para generación de Word desde el navegador.

**2. Nuevo archivo: `src/lib/generateOfferLetter.ts`**
- Función `generateOfferLetter(contract, version, contacts, companyNames, logoUrl)`
- Genera .docx con:
  - **Logo** de la empresa (Autoplanet/Agroplanet) en el encabezado
  - **Fecha**: Santiago, [fecha actual]
  - **Destinatario**: nombre(s) de `contract_contacts`
  - **REF**: Nombre del local + dirección completa
  - **Cuerpo**: texto formal de oferta
  - **Condiciones comerciales** — solo los ítems con valor definido:
    - Superficie Aproximada (siempre)
    - Canon de Arriendo Régimen (siempre)
    - Canon de Arriendo Inicial (solo si difiere del régimen)
    - Duración (siempre)
    - Garantía (solo si tiene valor)
    - Gastos Comunes (solo si UF/m² > 0 o porcentaje > 0)
    - Fondo de Promoción (solo si porcentaje > 0)
    - Meses de Gracia (solo si > 0)
    - Escalaciones (solo si existen)
    - Renovación automática (solo si está activada)
    - Otros egresos (solo si > 0)
  - **Sin fecha de inicio**
  - **Firma**: Matías Strube, Gerente de Desarrollo
- Lógica condicional: cada ítem se agrega al array de párrafos solo si su valor es truthy/mayor a 0

**3. Modificar: `src/pages/ContractDetail.tsx`**
- Agregar botón "Carta Oferta" en el header, visible solo cuando `status === "en_negociacion"`
- Al click: obtiene logo URL, llama a `generateOfferLetter()`, descarga el .docx

### Dependencia nueva
- `docx` (npm) — generación de documentos Word desde el navegador

