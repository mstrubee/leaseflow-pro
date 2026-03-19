import PptxGenJS from "pptxgenjs";
import { supabase } from "@/integrations/supabase/client";
import { getLogoUrls } from "@/hooks/useAppLogos";
import { getSignedUrl, isStorageUrl } from "@/lib/storageUtils";

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

interface ImgData {
  base64: string;
  w: number;
  h: number;
}

async function loadImage(src: string): Promise<ImgData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve({ base64: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = src;
  });
}

/** Calculate dimensions to fit image inside box while preserving aspect ratio */
function fitContain(imgW: number, imgH: number, boxW: number, boxH: number) {
  const imgAspect = imgW / imgH;
  const boxAspect = boxW / boxH;
  if (imgAspect > boxAspect) {
    // image wider than box → constrain by width
    return { w: boxW, h: boxW / imgAspect };
  } else {
    return { w: boxH * imgAspect, h: boxH };
  }
}

async function getContractAddress(contractId: string): Promise<string> {
  const { data } = await supabase
    .from("contract_addresses")
    .select("street, number, commune, region")
    .eq("contract_id", contractId)
    .limit(1)
    .maybeSingle();
  if (!data) return "";
  return [data.street, data.number, data.commune, data.region].filter(Boolean).join(", ");
}

async function getBusinessCaseImages(contractId: string): Promise<string[]> {
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

  // Exclude Excel and "Graficos"
  const imageFiles = files.filter(f => {
    if (/\.(xls|xlsx)$/i.test(f.name)) return false;
    if (/graficos/i.test(f.name.replace(/\.[^.]+$/, ""))) return false;
    return true;
  });

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

  const isAgroplanet = data.companyNames.some(n => n.toLowerCase().includes("agroplanet"));
  const logos = await getLogoUrls();
  const logoUrl = isAgroplanet ? logos.agroplanet : logos.autoplanet;

  let logoImg: ImgData | null = null;
  try { logoImg = await loadImage(logoUrl); } catch { /* ignore */ }

  const address = data.address || await getContractAddress(data.contractId);
  const imageUrls = await getBusinessCaseImages(data.contractId);

  const imageList: ImgData[] = [];
  for (const url of imageUrls) {
    try { imageList.push(await loadImage(url)); } catch { /* ignore */ }
  }

  // Max 2 slides, split images
  const maxPerSlide = imageList.length <= 4 ? imageList.length : Math.ceil(imageList.length / 2);
  const slide1Images = imageList.slice(0, Math.min(maxPerSlide, 4));
  const slide2Images = imageList.slice(slide1Images.length, slide1Images.length + 4);

  const addHeader = (slide: PptxGenJS.Slide, subtitleText: string) => {
    slide.background = { color: "F5F5F5" };
    slide.addText("PLAN EXPANSIÓN", {
      x: 0.5, y: 0.3, w: 7, h: 0.5,
      fontSize: 28, fontFace: "Arial", color: TITLE_RED, bold: true,
    });
    slide.addText(subtitleText, {
      x: 0.5, y: 0.8, w: 7, h: 0.35,
      fontSize: 12, fontFace: "Arial", color: DARK, bold: true,
    });
    slide.addShape("line" as any, {
      x: 0.5, y: 1.2, w: 9, h: 0,
      line: { color: LINE_COLOR, width: 1.5 },
    });
    if (logoImg) {
      const fit = fitContain(logoImg.w, logoImg.h, 1.5, 0.8);
      slide.addImage({
        data: logoImg.base64,
        x: 8.0 + (1.5 - fit.w) / 2, y: 0.2 + (0.8 - fit.h) / 2,
        w: fit.w, h: fit.h,
      });
    }
  };

  // ═══════════ SLIDE 1 ═══════════
  const s1 = pres.addSlide();
  const subtitle = address ? `${data.contractName} - ${address}` : data.contractName;
  addHeader(s1, subtitle);
  addImageGrid(s1, slide1Images, 1.4);
  s1.addText("1", { x: 8.8, y: 5.1, w: 0.7, h: 0.3, fontSize: 14, fontFace: "Arial", color: MUTED, align: "right" });

  // ═══════════ SLIDE 2 ═══════════
  if (slide2Images.length > 0) {
    const s2 = pres.addSlide();
    addHeader(s2, `${data.contractName} (cont.)`);
    addImageGrid(s2, slide2Images, 1.4);
    s2.addText("2", { x: 8.8, y: 5.1, w: 0.7, h: 0.3, fontSize: 14, fontFace: "Arial", color: MUTED, align: "right" });
  }

  const fileName = `CAPEX_${data.contractName.replace(/[^a-zA-Z0-9]/g, "_")}.pptx`;
  await pres.writeFile({ fileName });
}

function addImageGrid(slide: PptxGenJS.Slide, images: ImgData[], startY: number) {
  if (images.length === 0) {
    slide.addText("Sin imágenes de Business Case", {
      x: 1, y: 2.5, w: 8, h: 1,
      fontSize: 16, fontFace: "Arial", color: "999999", align: "center",
    });
    return;
  }

  const contentH = 5.2 - startY - 0.4;
  const contentW = 9;
  const margin = 0.2;
  const xStart = 0.5;

  if (images.length === 1) {
    const boxW = contentW - 1;
    const boxH = contentH - 0.2;
    const fit = fitContain(images[0].w, images[0].h, boxW, boxH);
    slide.addImage({
      data: images[0].base64,
      x: xStart + 0.5 + (boxW - fit.w) / 2,
      y: startY + 0.1 + (boxH - fit.h) / 2,
      w: fit.w, h: fit.h,
    });
  } else if (images.length === 2) {
    const imgW = (contentW - margin) / 2;
    const imgH = contentH - 0.2;
    images.forEach((img, i) => {
      const fit = fitContain(img.w, img.h, imgW, imgH);
      slide.addImage({
        data: img.base64,
        x: xStart + i * (imgW + margin) + (imgW - fit.w) / 2,
        y: startY + 0.1 + (imgH - fit.h) / 2,
        w: fit.w, h: fit.h,
      });
    });
  } else {
    const cols = 2;
    const rows = Math.ceil(images.length / cols);
    const cellW = (contentW - margin) / cols;
    const cellH = (contentH - margin * (rows - 1)) / rows;
    images.forEach((img, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const fit = fitContain(img.w, img.h, cellW, cellH);
      slide.addImage({
        data: img.base64,
        x: xStart + col * (cellW + margin) + (cellW - fit.w) / 2,
        y: startY + row * (cellH + margin) + (cellH - fit.h) / 2,
        w: fit.w, h: fit.h,
      });
    });
  }
}
