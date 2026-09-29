'use client';

import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFilePicker,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiImage,
  EuiLoadingSpinner,
  EuiPageTemplate,
  EuiPanel,
  EuiRange,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
} from '@elastic/eui';
import { useEffect, useMemo, useState } from 'react';
import { CameraCapture, CameraIcon } from '@/components/CameraCapture';
import { ResultsGrid } from '@/components/ResultsGrid';
import { ApiError, fetchJson } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { detectFaces, loadImage, type DetectedFace } from '@/lib/face-detect';
import { shrinkImage } from '@/lib/resize-image';
import type { SearchHit } from '@/lib/types';

type Mode = 'image' | 'face' | 'text';
type Query =
  | { kind: 'image'; file: File; previewUrl: string }
  | { kind: 'text'; text: string }
  | { kind: 'id'; id: string; url: string; filename: string }
  | { kind: 'face'; crop: Blob; previewUrl: string }
  | { kind: 'face-id'; id: string; face: number; url: string; filename: string };

// Faces found in a photo with several people, waiting for the user to pick one
type FaceChoice = DetectedFace & { url: string };

// Largest faces first; more than this is rarely useful to pick from
const MAX_FACE_CHOICES = 20;

// Face matches below about 40% are usually a different person
const DEFAULT_MIN_SCORE: Record<Mode, number> = { image: 0, face: 0.4, text: 0 };

const MAX_RESULTS = 60;

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>('image');
  const [text, setText] = useState('');
  const [query, setQuery] = useState<Query | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seconds until the rate limit resets
  const [cooldown, setCooldown] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [faceChoices, setFaceChoices] = useState<FaceChoice[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Release object URLs for previous uploads
  useEffect(() => {
    return () => {
      if (query?.kind === 'image' || query?.kind === 'face') URL.revokeObjectURL(query.previewUrl);
    };
  }, [query]);

  useEffect(() => {
    return () => faceChoices.forEach((f) => URL.revokeObjectURL(f.url));
  }, [faceChoices]);

  async function runSearch(q: Query) {
    if (cooldown > 0) return;
    setQuery(q);
    setLoading(true);
    setError(null);
    const body = new FormData();
    body.set('mode', q.kind);
    body.set('k', String(MAX_RESULTS));
    if (q.kind === 'image') body.set('file', await shrinkImage(q.file));
    if (q.kind === 'text') body.set('text', q.text);
    if (q.kind === 'id' || q.kind === 'face-id') body.set('id', q.id);
    if (q.kind === 'face-id') body.set('face', String(q.face));
    if (q.kind === 'face') body.set('file', q.crop, 'face.jpg');
    try {
      const { hits } = await fetchJson<{ hits: SearchHit[] }>('/api/search', { method: 'POST', body });
      setHits(hits);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        // Keep previous results and block new searches until reset
        setCooldown(Number(err.body.retryAfter) || 60);
        return;
      }
      setError(errorMessage(err));
      setHits(null);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setMinScore(DEFAULT_MIN_SCORE[next]);
  }

  function searchImage(file: File) {
    runSearch({ kind: 'image', file, previewUrl: URL.createObjectURL(file) });
  }

  function searchFace(face: DetectedFace) {
    setFaceChoices([]);
    runSearch({ kind: 'face', crop: face.crop, previewUrl: URL.createObjectURL(face.crop) });
  }

  // Search straight away for one face, or let the user pick from several
  async function findFaces(file: File) {
    setFaceChoices([]);
    setError(null);
    setDetecting(true);
    try {
      const faces = await detectFaces(await loadImage(file), MAX_FACE_CHOICES);
      if (faces.length === 0) setError('No face found in this photo. Try a clearer, front-facing photo.');
      else if (faces.length === 1) searchFace(faces[0]);
      else setFaceChoices(faces.map((f) => ({ ...f, url: URL.createObjectURL(f.crop) })));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDetecting(false);
    }
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (mode === 'face') findFaces(file);
    else searchImage(file);
  }

  function onFindSimilar(hit: SearchHit) {
    if (hit.face) {
      runSearch({ kind: 'face-id', id: hit.id, face: hit.face.index, url: hit.url, filename: hit.filename });
    } else {
      runSearch({ kind: 'id', id: hit.id, url: hit.url, filename: hit.filename });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const visible = useMemo(() => hits?.filter((h) => h.score >= minScore) ?? [], [hits, minScore]);
  const queryImage =
    query?.kind === 'image' || query?.kind === 'face'
      ? query.previewUrl
      : query?.kind === 'id' || query?.kind === 'face-id'
        ? query.url
        : null;

  return (
    <EuiPageTemplate responsive={[]} restrictWidth={1400} panelled={false} grow={false}>
      <EuiPageTemplate.Header
        pageTitle="Reverse image search"
        description="Upload or take a photo to find visually similar images or the same face, or describe what you're looking for. Powered by Jina embeddings on Elastic Inference Service and Elasticsearch kNN."
      />
      <EuiPageTemplate.Section>
        <EuiFlexGroup gutterSize="l" alignItems="flexStart" responsive>
          <EuiFlexItem grow={false} style={{ width: 320, maxWidth: '100%' }}>
            <EuiPanel hasBorder>
              <EuiTabs size="s" expand>
                <EuiTab
                  isSelected={mode === 'image'}
                  onClick={() => switchMode('image')}
                  prepend={<EuiIcon type="image" />}
                >
                  Image
                </EuiTab>
                <EuiTab
                  isSelected={mode === 'face'}
                  onClick={() => switchMode('face')}
                  prepend={<EuiIcon type="user" />}
                >
                  Face
                </EuiTab>
                <EuiTab
                  isSelected={mode === 'text'}
                  onClick={() => switchMode('text')}
                  prepend={<EuiIcon type="editorComment" />}
                >
                  Text
                </EuiTab>
              </EuiTabs>
              <EuiSpacer size="m" />

              {mode !== 'text' ? (
                <>
                  {mode === 'face' && (
                    <>
                      <EuiText size="xs" color="subdued">
                        <p>Find photos of the same person, including group photos.</p>
                      </EuiText>
                      <EuiSpacer size="s" />
                    </>
                  )}
                  <EuiFilePicker
                    // Remount per mode so the picker clears when switching
                    key={mode}
                    id="query-image"
                    display="large"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    initialPromptText={
                      mode === 'face' ? 'Drop a photo with a face' : 'Drop a photo here or click to browse'
                    }
                    onChange={onFiles}
                    aria-label={mode === 'face' ? 'Photo with a face' : 'Query image'}
                    disabled={cooldown > 0 || detecting}
                    isLoading={detecting}
                    fullWidth
                  />
                  <EuiSpacer size="s" />
                  <EuiButton
                    iconType={CameraIcon}
                    onClick={() => setCameraOpen(true)}
                    isDisabled={cooldown > 0}
                    fullWidth
                  >
                    {mode === 'face' ? 'Take a selfie' : 'Take a photo'}
                  </EuiButton>
                  {detecting && (
                    <>
                      <EuiSpacer size="s" />
                      <EuiText size="xs" color="subdued">
                        Looking for faces…
                      </EuiText>
                    </>
                  )}
                  {faceChoices.length > 0 && (
                    <>
                      <EuiSpacer size="m" />
                      <EuiText size="xs">
                        <strong>{faceChoices.length} faces found.</strong> Pick one to search for.
                      </EuiText>
                      <EuiSpacer size="s" />
                      <EuiFlexGrid columns={4} gutterSize="s" responsive={false}>
                        {faceChoices.map((f, i) => (
                          <EuiFlexItem key={f.url}>
                            <button
                              type="button"
                              onClick={() => searchFace(f)}
                              aria-label={`Search for face ${i + 1}`}
                              className="face-choice"
                            >
                              <EuiImage src={f.url} alt={`Face ${i + 1}`} size="fullWidth" />
                            </button>
                          </EuiFlexItem>
                        ))}
                      </EuiFlexGrid>
                    </>
                  )}
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) runSearch({ kind: 'text', text: text.trim() });
                  }}
                >
                  <EuiFieldSearch
                    placeholder="e.g. person wearing a red jacket"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    fullWidth
                    isClearable
                  />
                  <EuiSpacer size="s" />
                  <EuiButton type="submit" fill fullWidth iconType="search" isDisabled={!text.trim() || cooldown > 0}>
                    Search
                  </EuiButton>
                </form>
              )}

              {queryImage && (
                <>
                  <EuiSpacer size="m" />
                  <EuiText size="xs" color="subdued">
                    <strong>Query</strong>
                    {query?.kind === 'id' && <> · similar to {query.filename}</>}
                    {query?.kind === 'face-id' && <> · a face in {query.filename}</>}
                  </EuiText>
                  <EuiSpacer size="xs" />
                  <EuiImage src={queryImage} alt="Query" size="fullWidth" hasShadow allowFullScreen />
                </>
              )}

              <EuiSpacer size="m" />
              <EuiFormRow label={`Minimum similarity: ${Math.round(minScore * 100)}%`} fullWidth>
                <EuiRange
                  min={0}
                  max={1}
                  step={0.01}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.currentTarget.value))}
                  fullWidth
                  aria-label="Minimum similarity"
                />
              </EuiFormRow>
            </EuiPanel>
          </EuiFlexItem>

          <EuiFlexItem>
            {cooldown > 0 && (
              <>
                <EuiCallOut title="You're searching too fast" color="warning" iconType="clock">
                  <p>
                    You&apos;ve reached the search limit. You can search again in <strong>{cooldown}s</strong>.
                  </p>
                </EuiCallOut>
                <EuiSpacer />
              </>
            )}
            {error && (
              <>
                <EuiCallOut title="Search failed" color="danger" iconType="error">
                  <p>{error}</p>
                </EuiCallOut>
                <EuiSpacer />
              </>
            )}
            {loading ? (
              <EuiFlexGroup justifyContent="center" style={{ padding: 64 }}>
                <EuiLoadingSpinner size="xxl" />
              </EuiFlexGroup>
            ) : hits === null ? (
              !error && (
                <EuiEmptyPrompt
                  iconType="image"
                  title={<h2>Search your photo library</h2>}
                  body={
                    <p>Upload or take a photo, search for a face, or type a description to find matching images.</p>
                  }
                />
              )
            ) : visible.length === 0 ? (
              <EuiEmptyPrompt
                iconType="search"
                title={<h2>No matches</h2>}
                body={
                  <p>
                    {hits.length > 0
                      ? `${hits.length} results are below ${Math.round(minScore * 100)}% similarity.`
                      : 'The index is empty. Add photos on the Admin page.'}
                  </p>
                }
                actions={
                  hits.length > 0 && <EuiButtonEmpty onClick={() => setMinScore(0)}>Lower the threshold</EuiButtonEmpty>
                }
              />
            ) : (
              <>
                <EuiText size="s" color="subdued">
                  <p>
                    Showing {visible.length} of {hits.length} nearest images
                  </p>
                </EuiText>
                <EuiSpacer size="s" />
                <ResultsGrid hits={visible} onFindSimilar={onFindSimilar} />
              </>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageTemplate.Section>
      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            if (mode === 'face') findFaces(file);
            else searchImage(file);
          }}
        />
      )}
    </EuiPageTemplate>
  );
}
