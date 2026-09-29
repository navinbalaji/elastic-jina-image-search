import { NextResponse, type NextRequest } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { pendingPhotos, photoExists, setFaces, type FaceCrop } from '@/lib/faces';
import { jsonError } from '@/lib/http';
import { MAX_FACES_PER_PHOTO, type FaceBox } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Photos still waiting for a face scan
export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 10, 1), 50);
  try {
    return NextResponse.json(await pendingPhotos(limit));
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

function isBox(v: unknown): v is FaceBox {
  return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && n >= 0 && n <= 1);
}

// Form fields: id, faces (JSON array of { box, score }), crop (one JPEG per face, same order)
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const id = String(form.get('id') || '');
    const crops = form.getAll('crop').filter((f): f is File => f instanceof File);
    let faces: { box: unknown; score: unknown }[];
    try {
      faces = JSON.parse(String(form.get('faces') || '[]'));
    } catch {
      return jsonError('faces must be JSON', 400);
    }
    if (!/^[a-f0-9]{64}$/.test(id)) return jsonError('Invalid photo id', 400);
    if (!Array.isArray(faces) || faces.length !== crops.length) return jsonError('Send one crop per face', 400);
    if (faces.length > MAX_FACES_PER_PHOTO) return jsonError(`At most ${MAX_FACES_PER_PHOTO} faces per photo`, 400);
    if (!faces.every((f) => isBox(f.box) && typeof f.score === 'number')) return jsonError('Invalid face box', 400);
    if (!(await photoExists(id))) return jsonError('Photo not found', 404);

    const input: FaceCrop[] = await Promise.all(
      crops.map(async (c, k) => ({
        box: faces[k].box as FaceBox,
        score: faces[k].score as number,
        buffer: Buffer.from(await c.arrayBuffer()),
      })),
    );
    return NextResponse.json({ faces: await setFaces(id, input) });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
