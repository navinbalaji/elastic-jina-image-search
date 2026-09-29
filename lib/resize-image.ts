// Browser only: shrink a query photo before upload, keeping requests small and fast
const MAX_SIDE = 1024;
const SMALL_ENOUGH = 1024 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  if (file.size <= SMALL_ENOUGH) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    // Unsupported format for decoding; send the original
    return file;
  }
}
