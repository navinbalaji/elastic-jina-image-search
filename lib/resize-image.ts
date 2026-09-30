// Browser only: shrink photos before upload, keeping requests small and fast on slow connections

interface ShrinkOptions {
  // Longest side in pixels after resizing
  maxSide?: number;
  // Files up to this size are sent as they are
  minBytes?: number;
}

export async function shrinkImage(
  file: File,
  { maxSide = 1024, minBytes = 1024 * 1024 }: ShrinkOptions = {},
): Promise<File> {
  if (file.size <= minBytes) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    // Keep the original when re-encoding doesn't help
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    // Unsupported format for decoding; send the original
    return file;
  }
}

export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
