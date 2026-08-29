// Uploaded logos/backgrounds were going straight into the card as raw file
// data with no size limit: a multi-MB phone photo landed in CardData
// exactly as picked. That's what blew out QR Transfer's payload cap (see
// Holder.tsx/TransferClaim.tsx) and bloats every order row in the DB. This
// re-encodes uploads as WebP (keeps alpha for logo transparency, much
// smaller than PNG at equivalent quality), shrinking dimensions and quality
// step by step until the result fits under a byte budget.

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = dataUrl;
  });
}

function canvasToWebpDataUrl(canvas: HTMLCanvasElement, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Compression failed."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      },
      "image/webp",
      quality,
    );
  });
}

function estimateBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export async function compressImageToDataUrl(
  file: File,
  { maxBytes, maxDimension }: { maxBytes: number; maxDimension: number },
): Promise<string> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);

  const dimensionSteps = [maxDimension, maxDimension * 0.75, maxDimension * 0.5, maxDimension * 0.35];
  const qualitySteps = [0.85, 0.7, 0.55, 0.4, 0.25];

  let smallest: string = original;
  for (const dim of dimensionSteps) {
    const scale = Math.min(1, dim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    ctx.drawImage(img, 0, 0, w, h);

    for (const quality of qualitySteps) {
      const dataUrl = await canvasToWebpDataUrl(canvas, quality);
      if (dataUrl.length < smallest.length) smallest = dataUrl;
      if (estimateBytes(dataUrl) <= maxBytes) return dataUrl;
    }
  }
  // Couldn't hit the target even at the smallest size/quality tried, so
  // return the smallest one produced rather than failing the upload.
  return smallest;
}
