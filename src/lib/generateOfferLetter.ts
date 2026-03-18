import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  LevelFormat,
  Header,
} from "docx";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface OfferLetterContact {
  name: string;
  company: string;
}

interface OfferLetterAddress {
  street: string;
  number: string;
  commune: string;
  region: string;
}

interface OfferLetterVersion {
  regime_rent: number;
  regime_rent_is_uf_m2?: boolean | null;
  initial_rent?: number | null;
  initial_rent_is_uf_m2?: boolean | null;
  duration_months: number;
  grace_months?: number | null;
  guarantee_type?: string | null;
  guarantee_multiplier?: number | null;
  guarantee_fixed_amount?: number | null;
  guarantee_fixed_currency?: string | null;
  gastos_comunes_methodology?: string | null;
  gastos_comunes_uf_m2?: number | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  gastos_comunes_tope?: number | null;
  fondo_promocion_percentage?: number | null;
  otros_egresos_amount?: number | null;
  otros_egresos_description?: string | null;
  has_periodic_adjustments?: boolean | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;
  auto_renewal?: boolean | null;
  auto_renewal_type?: string | null;
  auto_renewal_months?: number | null;
  rent_escalations?: Array<{ month_number: number; amount: number; is_uf_m2?: boolean }>;
}

interface OfferLetterParams {
  contractName: string;
  contacts: OfferLetterContact[];
  address: OfferLetterAddress | null;
  version: OfferLetterVersion;
  superficie: number;
  logoUrl: string | null;
}

const formatUF = (value: number): string => {
  return `UF ${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

async function fetchImageAsBuffer(url: string): Promise<{ buffer: ArrayBuffer; type: "png" | "jpg" } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const isPng = url.toLowerCase().includes(".png");
    return { buffer, type: isPng ? "png" : "jpg" };
  } catch {
    return null;
  }
}

export async function generateOfferLetter(params: OfferLetterParams) {
  const { contractName, contacts, address, version, superficie, logoUrl } = params;

  const today = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });

  // Fetch logo
  let logoImage: { buffer: ArrayBuffer; type: "png" | "jpg" } | null = null;
  if (logoUrl) {
    logoImage = await fetchImageAsBuffer(logoUrl);
  }

  // Build header with logo
  const headerChildren: Paragraph[] = [];
  if (logoImage) {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new ImageRun({
            type: logoImage.type,
            data: logoImage.buffer,
            transformation: { width: 150, height: 50 },
            altText: { title: "Logo", description: "Logo empresa", name: "logo" },
          }),
        ],
      })
    );
  }

  // Build address string
  const addressStr = address
    ? `${address.street} ${address.number}, ${address.commune}, ${address.region}`
    : contractName;

  // Build recipient names
  const recipientNames = contacts.length > 0
    ? contacts.map((c) => c.name).join(" / ")
    : "Propietario";

  // --- Document body ---
  const children: Paragraph[] = [];

  // Date
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 400 },
      children: [new TextRun({ text: `Santiago, ${today}`, size: 22, font: "Arial" })],
    })
  );

  // Recipient
  children.push(
    new Paragraph({ children: [new TextRun({ text: "Señor(a)", size: 22, font: "Arial" })] })
  );
  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: recipientNames, bold: true, size: 22, font: "Arial" })],
    })
  );
  children.push(
    new Paragraph({
      spacing: { after: 300 },
      children: [new TextRun({ text: "Presente", size: 22, font: "Arial" })],
    })
  );

  // REF
  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({ text: "REF: ", bold: true, size: 22, font: "Arial" }),
        new TextRun({ text: "CARTA OFERTA DE ARRIENDO", bold: true, size: 22, font: "Arial", underline: {} }),
      ],
    })
  );
  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({ text: `     ${contractName}`, size: 22, font: "Arial" }),
      ],
    })
  );
  if (address) {
    children.push(
      new Paragraph({
        spacing: { after: 300 },
        children: [new TextRun({ text: `     ${addressStr}`, size: 22, font: "Arial" })],
      })
    );
  }

  // Greeting
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: "De nuestra consideración:", size: 22, font: "Arial" })],
    })
  );

  // Body text
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Por medio de la presente, tenemos el agrado de presentar nuestra oferta para el arriendo del inmueble ubicado en ${addressStr}, de acuerdo a las siguientes condiciones comerciales:`,
          size: 22,
          font: "Arial",
        }),
      ],
    })
  );

  // Section title
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({ text: "CONDICIONES COMERCIALES:", bold: true, size: 22, font: "Arial", underline: {} }),
      ],
    })
  );

  // Build bullet items conditionally
  const bulletItems: string[] = [];

  // Superficie (always)
  bulletItems.push(`Superficie Aproximada: ${superficie.toLocaleString("es-CL")} m²`);

  // Canon régimen (always)
  const isUfM2 = version.regime_rent_is_uf_m2 === true;
  if (isUfM2) {
    bulletItems.push(
      `Canon de Arriendo Régimen: ${formatUF(version.regime_rent)}/m² (${formatUF(version.regime_rent * superficie)} totales)`
    );
  } else {
    bulletItems.push(`Canon de Arriendo Régimen: ${formatUF(version.regime_rent)}`);
  }

  // Canon inicial (only if differs)
  if (version.initial_rent != null && version.initial_rent !== version.regime_rent) {
    const isInitialUfM2 = version.initial_rent_is_uf_m2 === true;
    if (isInitialUfM2) {
      bulletItems.push(
        `Canon de Arriendo Inicial: ${formatUF(version.initial_rent)}/m² (${formatUF(version.initial_rent * superficie)} totales)`
      );
    } else {
      bulletItems.push(`Canon de Arriendo Inicial: ${formatUF(version.initial_rent)}`);
    }
  }

  // Duración (always)
  bulletItems.push(`Duración del Contrato: ${version.duration_months} meses`);

  // Garantía (only if has value)
  if (version.guarantee_type) {
    let garantiaText = "";
    if (version.guarantee_type === "multiplier" && version.guarantee_multiplier) {
      garantiaText = `${version.guarantee_multiplier} meses de renta`;
    } else if (version.guarantee_type === "fixed" && version.guarantee_fixed_amount) {
      const currency = version.guarantee_fixed_currency || "UF";
      garantiaText = `${currency} ${version.guarantee_fixed_amount.toLocaleString("es-CL")}`;
    }
    if (garantiaText) {
      bulletItems.push(`Garantía: ${garantiaText}`);
    }
  }

  // Gastos comunes (only if > 0)
  const methodology = version.gastos_comunes_methodology || "uf_m2";
  if (methodology === "percentage" && (version.gastos_comunes_percentage || 0) > 0) {
    bulletItems.push(`Gastos Comunes: ${version.gastos_comunes_percentage}% del total centro comercial`);
  } else if (methodology === "uf_m2" && (version.gastos_comunes_uf_m2 || 0) > 0) {
    bulletItems.push(
      `Gastos Comunes: ${formatUF(version.gastos_comunes_uf_m2!)}/m² (${formatUF(version.gastos_comunes_uf_m2! * superficie)} totales)`
    );
  }

  // Fondo de promoción (only if > 0)
  if ((version.fondo_promocion_percentage || 0) > 0) {
    bulletItems.push(`Fondo de Promoción: ${version.fondo_promocion_percentage}% sobre el canon`);
  }

  // Meses de gracia (only if > 0)
  if ((version.grace_months || 0) > 0) {
    bulletItems.push(`Meses de Gracia: ${version.grace_months}`);
  }

  // Escalaciones (only if exist)
  const escalations = version.rent_escalations || [];
  if (escalations.length > 0) {
    const sorted = [...escalations].sort((a, b) => a.month_number - b.month_number);
    const escText = sorted
      .map((e) => {
        const amt = e.is_uf_m2 ? `${formatUF(e.amount)}/m²` : formatUF(e.amount);
        return `Mes ${e.month_number}: ${amt}`;
      })
      .join("; ");
    bulletItems.push(`Escalaciones de Renta: ${escText}`);
  }

  // Ajustes periódicos (only if active)
  if (version.has_periodic_adjustments && (version.adjustment_value || 0) > 0) {
    const adjType = version.adjustment_type === "percentage" ? "%" : " UF";
    bulletItems.push(
      `Ajustes Periódicos: ${version.adjustment_value}${adjType} cada ${version.adjustment_periodicity_months || 12} meses, desde el mes ${version.first_adjustment_month}`
    );
  }

  // Renovación automática (only if active)
  if (version.auto_renewal) {
    const months = version.auto_renewal_months || version.duration_months;
    bulletItems.push(`Renovación Automática: Sí, por ${months} meses`);
  }

  // Otros egresos (only if > 0)
  if ((version.otros_egresos_amount || 0) > 0) {
    const desc = version.otros_egresos_description ? ` (${version.otros_egresos_description})` : "";
    bulletItems.push(`Otros Egresos: ${formatUF(version.otros_egresos_amount!)}${desc}`);
  }

  // Add bullets using numbering
  const numbering = {
    config: [
      {
        reference: "offer-bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720, hanging: 360 },
              },
            },
          },
        ],
      },
    ],
  };

  for (const item of bulletItems) {
    children.push(
      new Paragraph({
        numbering: { reference: "offer-bullets", level: 0 },
        spacing: { after: 100 },
        children: [new TextRun({ text: item, size: 22, font: "Arial" })],
      })
    );
  }

  // Closing
  children.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({
          text: "La presente oferta tiene un carácter referencial y no constituye un compromiso vinculante hasta la firma del contrato respectivo.",
          size: 22,
          font: "Arial",
          italics: true,
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 200, after: 400 },
      children: [
        new TextRun({
          text: "Sin otro particular, le saluda atentamente,",
          size: 22,
          font: "Arial",
        }),
      ],
    })
  );

  // Signature
  children.push(new Paragraph({ spacing: { before: 600 }, children: [] }));
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "_________________________", size: 22, font: "Arial" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "Matías Strube", bold: true, size: 22, font: "Arial" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "Gerente de Desarrollo", size: 22, font: "Arial" })],
    })
  );

  // Create document
  const doc = new Document({
    numbering,
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: headerChildren.length > 0
          ? { default: new Header({ children: headerChildren }) }
          : undefined,
        children,
      },
    ],
  });

  // Generate and download
  const buffer = await Packer.toBlob(doc);
  const url = URL.createObjectURL(buffer);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Carta_Oferta_${contractName.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
