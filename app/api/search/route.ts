import { NextResponse, type NextRequest } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { jsonError } from '@/lib/http';
import { embedImage, embedText } from '@/lib/embeddings';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getVector, knnSearch } from '@/lib/search';
import { extensionFor, IMAGE_TYPES } from '@/lib/storage';

export const runtime = 'nodejs';

const DEFAULT_K = 30;
const MAX_K = 200;

class BadRequest extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

async function queryVector(form: FormData): Promise<{ vector: number[]; excludeId?: string }> {
  const mode = String(form.get('mode') || 'image');
  switch (mode) {
    case 'image': {
      const file = form.get('file');
      if (!(file instanceof File)) throw new BadRequest('Upload an image');
      const ext = extensionFor(file.name, file.type);
      if (!ext) throw new BadRequest('Unsupported image type');
      const buffer = Buffer.from(await file.arrayBuffer());
      return { vector: await embedImage({ buffer, contentType: IMAGE_TYPES[ext] }) };
    }
    case 'text': {
      const text = String(form.get('text') || '').trim();
      if (!text) throw new BadRequest('Enter a search text');
      return { vector: await embedText(text) };
    }
    case 'id': {
      const id = String(form.get('id') || '');
      const vector = await getVector(id);
      if (!vector) throw new BadRequest('Image not found', 404);
      return { vector, excludeId: id };
    }
    default:
      throw new BadRequest(`Unknown mode "${mode}"`);
  }
}

// Form fields: mode (image | text | id), file | text | id, k
export async function POST(req: NextRequest) {
  const { headers, blocked } = await enforceRateLimit(req);
  if (blocked) return blocked;

  try {
    const form = await req.formData();
    const k = Math.min(Math.max(Number(form.get('k')) || DEFAULT_K, 1), MAX_K);

    const { vector, excludeId } = await queryVector(form);
    const hits = await knnSearch(vector, { k, excludeId });
    return NextResponse.json({ hits }, { headers });
  } catch (err) {
    if (err instanceof BadRequest) return jsonError(err.message, err.status, headers);
    return jsonError(errorMessage(err), 500, headers);
  }
}
