/**
 * Compression d'une photo dans le navigateur, avant envoi :
 * plus grand côté ramené à `maxSize` px, export JPEG à la qualité donnée.
 * L'orientation EXIF des photos de téléphone est respectée.
 */
export async function compressImage(file: File, maxSize = 800, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponible");

    // Fond blanc : les zones transparentes (PNG) ne deviennent pas noires en JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Compression impossible"))), "image/jpeg", quality);
    });
  } finally {
    bitmap.close();
  }
}
