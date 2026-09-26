import { readImage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const image = await readImage(params.id);
  if (!image) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(image.buffer), {
    headers: {
      'Content-Type': image.contentType,
      // Files are content-addressed (sha256), so they never change
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
