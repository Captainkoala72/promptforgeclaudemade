import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_SOURCE_IMAGE_BYTES, type PromptImage } from "./images";

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(blob);
  });
}

function toWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob?.type === "image/webp") resolve(blob);
      else reject(new Error("Could not resize that image in this browser."));
    }, "image/webp", quality);
  });
}

/** Large photos are resized in the browser before they reach our API route. */
export async function prepareImage(file: File): Promise<PromptImage> {
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
    throw new Error(`${file.name}: choose a PNG, JPEG, or WebP image.`);
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(`${file.name}: the original file must be 20 MB or smaller.`);
  }

  if (file.size <= MAX_IMAGE_BYTES) {
    return { name: file.name, dataUrl: await readDataUrl(file), bytes: file.size };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: the image could not be opened.`);
  }

  try {
    let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the image for upload.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await toWebp(canvas, Math.max(0.55, 0.85 - attempt * 0.07));
      if (blob.size <= MAX_IMAGE_BYTES) {
        return {
          name: file.name.replace(/\.[^.]+$/, "") + ".webp",
          dataUrl: await readDataUrl(blob),
          bytes: blob.size,
        };
      }
      scale *= 0.75;
    }
    throw new Error(`${file.name}: the image is still too large after resizing.`);
  } finally {
    bitmap.close();
  }
}
