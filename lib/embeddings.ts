import type { Client } from '@elastic/elasticsearch';
import { getConfig } from './config';
import { getEs } from './es';

// Embeddings from the Elastic Inference Service (EIS), default endpoint `.jina-embeddings-v5-omni-small`

interface ImageInput {
  buffer: Buffer;
  contentType: string;
}

type EmbeddingInput =
  { content: { type: 'text'; value: string } } | { content: { type: 'image'; format: 'base64'; value: string } };

interface EmbeddingResponse {
  embeddings: { embedding: number[] }[];
}

// Where to send requests; defaults to the current config
export interface InferenceTarget {
  es: Client;
  inferenceId: string;
}

async function currentTarget(): Promise<InferenceTarget> {
  const [es, { inferenceId }] = await Promise.all([getEs(), getConfig()]);
  return { es, inferenceId };
}

async function embed(input: EmbeddingInput[], target?: InferenceTarget): Promise<number[][]> {
  const { es, inferenceId } = target ?? (await currentTarget());
  const res = await es.transport.request<EmbeddingResponse>(
    { method: 'POST', path: `/_inference/embedding/${encodeURIComponent(inferenceId)}`, body: { input } },
    { requestTimeout: 120_000 },
  );
  const embeddings = res.embeddings.map((e) => e.embedding);
  if (embeddings.length !== input.length) {
    throw new Error(`Inference endpoint ${inferenceId} returned ${embeddings.length} of ${input.length} embeddings`);
  }
  return embeddings;
}

function imageInput({ buffer, contentType }: ImageInput): EmbeddingInput {
  return {
    content: { type: 'image', format: 'base64', value: `data:${contentType};base64,${buffer.toString('base64')}` },
  };
}

export function embedImages(images: ImageInput[], target?: InferenceTarget): Promise<number[][]> {
  return embed(images.map(imageInput), target);
}

export async function embedImage(image: ImageInput, target?: InferenceTarget): Promise<number[]> {
  return (await embed([imageInput(image)], target))[0];
}

export async function embedText(text: string, target?: InferenceTarget): Promise<number[]> {
  return (await embed([{ content: { type: 'text', value: text } }], target))[0];
}
