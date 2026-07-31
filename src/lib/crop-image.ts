/**
 * Canvas helpers for react-easy-crop (drag crop + rotation).
 * Crop math follows the library's documented getCroppedImg pattern.
 */

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.crossOrigin = "anonymous";
    image.src = src;
  });
}

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

/**
 * Returns a JPEG blob of the cropped (and rotated) region.
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  crop: PixelCrop,
  rotation = 0,
  options?: { maxEdge?: number; quality?: number },
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const maxEdge = options?.maxEdge ?? 2400;
  const quality = options?.quality ?? 0.92;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const maxSize = Math.max(image.width, image.height);
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

  canvas.width = safeArea;
  canvas.height = safeArea;

  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate(rad(rotation));
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const data = ctx.getImageData(0, 0, safeArea, safeArea);

  const cropW = Math.max(1, Math.round(crop.width));
  const cropH = Math.max(1, Math.round(crop.height));
  canvas.width = cropW;
  canvas.height = cropH;

  ctx.putImageData(
    data,
    Math.round(0 - safeArea / 2 + image.width / 2 - crop.x),
    Math.round(0 - safeArea / 2 + image.height / 2 - crop.y),
  );

  const scale = Math.min(1, maxEdge / Math.max(cropW, cropH));
  if (scale < 1) {
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.round(cropW * scale));
    scaled.height = Math.max(1, Math.round(cropH * scale));
    const sctx = scaled.getContext("2d");
    if (!sctx) throw new Error("Canvas unavailable");
    sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    return canvasToJpeg(scaled, quality);
  }

  return canvasToJpeg(canvas, quality);
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Could not encode image"));
        else resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}
