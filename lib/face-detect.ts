// Browser only: find faces in a photo and crop each one for embedding
import { fetchJson } from './api-client';
import { MIN_FACE_CONFIDENCE, type FaceBox } from './types';

export interface DetectedFace {
  box: FaceBox;
  score: number;
  crop: Blob;
}

// Ignore faces smaller than this many pixels across; too blurry to match
const MIN_FACE_PX = 24;
// Room around the face, as a fraction of its size, so the crop keeps hair and jawline
const MARGIN = 0.3;
const CROP_PX = 256;

type FaceApi = typeof import('@vladmandic/face-api');
let loading: Promise<FaceApi> | undefined;

// Load the detector (about 6 MB) on first use only
function detector(): Promise<FaceApi> {
  loading ??= (async () => {
    const faceapi = await import('@vladmandic/face-api');
    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
    return faceapi;
  })();
  loading.catch(() => (loading = undefined));
  return loading;
}

export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the image'));
    img.src = url;
  }).finally(() => {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }) as Promise<HTMLImageElement>;
}

function cropFace(img: HTMLImageElement, [x, y, w, h]: FaceBox): Promise<Blob> {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  // Square crop centred on the face, clamped to the photo
  const side = Math.min(Math.max(w * W, h * H) * (1 + 2 * MARGIN), W, H);
  const left = Math.min(Math.max((x + w / 2) * W - side / 2, 0), W - side);
  const top = Math.min(Math.max((y + h / 2) * H - side / 2, 0), H - side);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(CROP_PX, Math.round(side));
  canvas.getContext('2d')?.drawImage(img, left, top, side, side, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not crop face'))), 'image/jpeg', 0.92),
  );
}

// All faces in the photo, largest first
export async function detectFaces(img: HTMLImageElement, max = 50): Promise<DetectedFace[]> {
  const faceapi = await detector();
  const found = await faceapi.detectAllFaces(
    img,
    new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_FACE_CONFIDENCE, maxResults: max }),
  );
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const faces = found
    .filter((d) => Math.min(d.box.width, d.box.height) >= MIN_FACE_PX)
    .sort((a, b) => b.box.area - a.box.area)
    .map((d) => {
      const x = Math.max(d.box.x, 0) / W;
      const y = Math.max(d.box.y, 0) / H;
      const box: FaceBox = [x, y, Math.min(d.box.width / W, 1 - x), Math.min(d.box.height / H, 1 - y)];
      return { box, score: d.score };
    });
  return Promise.all(faces.map(async (f) => ({ ...f, crop: await cropFace(img, f.box) })));
}

// Send a photo's faces to the server; returns how many were stored
export async function uploadFaces(id: string, faces: DetectedFace[]): Promise<number> {
  const body = new FormData();
  body.set('id', id);
  body.set('faces', JSON.stringify(faces.map(({ box, score }) => ({ box, score }))));
  faces.forEach((f) => body.append('crop', f.crop, 'face.jpg'));
  return (await fetchJson<{ faces: number }>('/api/admin/faces', { method: 'POST', body })).faces;
}
