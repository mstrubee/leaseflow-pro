import PptxGenJS from "pptxgenjs";
import { supabase } from "@/integrations/supabase/client";
import { getLogoUrls } from "@/hooks/useAppLogos";
import { getSignedUrl, isStorageUrl } from "@/lib/storageUtils";

// Colors matching the template
const TITLE_RED = "B71C1C";
const DARK = "333333";
const MUTED = "999999";
const LINE_COLOR = "CCCCCC";

interface SingleContractPPTData {
  contractId: string;
  contractName: string;
  companyNames: string[];
  address?: string;
}

async function loadImageAsBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function getContractAddress(contractId: string): Promise<string> {
  const { data } = await supabase
    .from("contract_addresses")
    .select("street, number, commune, region")
    .eq("contract_id", contractId)
    .limit(1)
    .maybeSingle();

  if (!data) return "";
  const parts = [data.street, data.number, data.commune, data.region].filter(Boolean);
  return parts.join(", ");
}

async function getBusinessCaseImages(contractId: string): Promise<string[]> {
  // Find the "Caso de Negocio" folder
  const { data: folder } = await supabase
    .from("repository_folders")
    .select("id")
    .eq("contract_id", contractId)
    .eq("name", "Caso de Negocio")
    .maybeSingle();

  if (!folder) return [];

  const { data: files } = await supabase
    .from("repository_files")
    .select("name, url")
    .eq("folder_id", folder.id)
    .order("uploaded_at", { ascending: true });

  if (!files) return [];

  // Filter only images (exclude Excel files)
  const imageFiles = files.filter(f => !/\.(xls|xlsx)$/i.test(f.name));

  const urls: string[] = [];
  for (const f of imageFiles) {
    if (isStorageUrl(f.url)) {
      const signed = await getSignedUrl(f.url);
      if (signed) urls.push(signed);
    } else {
      urls.push(f.url);
    }
  }
  return urls;
}

export async function generateSingleContractPPT(data: SingleContractPPTData) {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "GPlanet";
  pres.title = `Plan Expansión - ${data.contractName}`;

  // Determine company
  const isAgroplanet = data.companyNames.some(n => n.toLowerCase().includes("agroplanet"));
  const logos = await getLogoUrls();
  const logoUrl = isAgroplanet ? logos.agroplanet : logos.autoplanet;

  // Load logo as base64
  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64(logoUrl);
  } catch {
    console.log("Could not load company logo for PPT");
  }

  // Get address
  const address = data.address || await getContractAddress(data.contractId);

  // Get business case images
  const imageUrls = await getBusinessCaseImages(data.contractId);

  // Load images as base64
  const imageBase64List: string[] = [];
  for (const url of imageUrls) {
    try {
      const b64 = await loadImageAsBase64(url);
      imageBase64List.push(b64);
    } catch {
      console.log("Could not load business case image:", url);
    }
  }

  // Split images across max 2 slides
  // Slide 1: title + first images, Slide 2: remaining images
  const maxImagesPerSlide = imageBase64List.length <= 4 ? imageBase64List.length : Math.ceil(imageBase64List.length / 2);
  const slide1Images = imageBase64List.slice(0, Math.min(maxImagesPerSlide, 4));
  const slide2Images = imageBase64List.slice(slide1Images.length, slide1Images.length + 4);

  // ═══════════ SLIDE 1 ═══════════
  const s1 = pres.addSlide();
  s1.background = { color: "F5F5F5" };

  // Title: PLAN EXPANSIÓN
  s1.addText("PLAN EXPANSIÓN", {
    x: 0.5, y: 0.3, w: 7, h: 0.5,
    fontSize: 28, fontFace: "Arial", color: TITLE_RED, bold: true,
  });

  // Subtitle: name - address
  const subtitle = address ? `${data.contractName} - ${address}` : data.contractName;
  s1.addText(subtitle, {
    x: 0.5, y: 0.8, w: 7, h: 0.35,
    fontSize: 12, fontFace: "Arial", color: DARK, bold: true,
  });

  // Horizontal line
  s1.addShape("line" as any, {
    x: 0.5, y: 1.2, w: 9, h: 0,
    line: { color: LINE_COLOR, width: 1.5 },
  });

  // Company logo (top right)
  if (logoBase64) {
    s1.addImage({ data: logoBase64, x: 8.0, y: 0.2, w: 1.5, h: 0.8, sizing: { type: "contain", w: 1.5, h: 0.8 } });
  }

  // Place images on slide 1
  addImageGrid(s1, slide1Images, 1.4);

  // Page number
  s1.addText("1", {
    x: 8.8, y: 5.1, w: 0.7, h: 0.3,
    fontSize: 14, fontFace: "Arial", color: MUTED, align: "right",
  });

  // ═══════════ SLIDE 2 (if needed) ═══════════
  if (slide2Images.length > 0) {
    const s2 = pres.addSlide();
    s2.background = { color: "F5F5F5" };

    // Repeat header for continuity
    s2.addText("PLAN EXPANSIÓN", {
      x: 0.5, y: 0.3, w: 7, h: 0.5,
      fontSize: 28, fontFace: "Arial", color: TITLE_RED, bold: true,
    });

    s2.addText(`${data.contractName} (cont.)`, {
      x: 0.5, y: 0.8, w: 7, h: 0.35,
      fontSize: 12, fontFace: "Arial", color: DARK, bold: true,
    });

    s2.addShape("line" as any, {
      x: 0.5, y: 1.2, w: 9, h: 0,
      line: { color: LINE_COLOR, width: 1.5 },
    });

    if (logoBase64) {
      s2.addImage({ data: logoBase64, x: 8.0, y: 0.2, w: 1.5, h: 0.8, sizing: { type: "contain", w: 1.5, h: 0.8 } });
    }

    addImageGrid(s2, slide2Images, 1.4);

    s2.addText("2", {
      x: 8.8, y: 5.1, w: 0.7, h: 0.3,
      fontSize: 14, fontFace: "Arial", color: MUTED, align: "right",
    });
  }

  const fileName = `CAPEX_${data.contractName.replace(/[^a-zA-Z0-9]/g, "_")}.pptx`;
  await pres.writeFile({ fileName });
}

function addImageGrid(slide: PptxGenJS.Slide, images: string[], startY: number) {
  if (images.length === 0) {
    slide.addText("Sin imágenes de Business Case", {
      x: 1, y: 2.5, w: 8, h: 1,
      fontSize: 16, fontFace: "Arial", color: "999999", align: "center",
    });
    return;
  }

  const contentH = 5.2 - startY - 0.4; // available height
  const contentW = 9; // available width
  const margin = 0.15;
  const xStart = 0.5;

  if (images.length === 1) {
    slide.addImage({
      data: images[0],
      x: xStart + 0.5, y: startY + 0.1,
      w: contentW - 1, h: contentH - 0.2,
      sizing: { type: "contain", w: contentW - 1, h: contentH - 0.2 },
    });
  } else if (images.length === 2) {
    const imgW = (contentW - margin) / 2;
    images.forEach((img, i) => {
      slide.addImage({
        data: img,
        x: xStart + i * (imgW + margin), y: startY + 0.1,
        w: imgW, h: contentH - 0.2,
        sizing: { type: "contain", w: imgW, h: contentH - 0.2 },
      });
    });
  } else {
    // 2x2 grid
    const cols = 2;
    const rows = Math.ceil(images.length / cols);
    const imgW = (contentW - margin) / cols;
    const imgH = (contentH - margin * (rows - 1)) / rows;
    images.forEach((img, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      slide.addImage({
        data: img,
        x: xStart + col * (imgW + margin),
        y: startY + row * (imgH + margin),
        w: imgW, h: imgH,
        sizing: { type: "contain", w: imgW, h: imgH },
      });
    });
  }
}
