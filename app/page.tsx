'use client';

import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFilePicker,
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
import type { SearchHit } from '@/lib/types';

type Mode = 'image' | 'text';
type Query =
  | { kind: 'image'; file: File; previewUrl: string }
  | { kind: 'text'; text: string }
  | { kind: 'id'; id: string; url: string; filename: string };

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

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Release object URLs for previous uploads
  useEffect(() => {
    return () => {
      if (query?.kind === 'image') URL.revokeObjectURL(query.previewUrl);
    };
  }, [query]);

  async function runSearch(q: Query) {
    if (cooldown > 0) return;
    setQuery(q);
    setLoading(true);
    setError(null);
    const body = new FormData();
    body.set('mode', q.kind);
    body.set('k', String(MAX_RESULTS));
    if (q.kind === 'image') body.set('file', q.file);
    if (q.kind === 'text') body.set('text', q.text);
    if (q.kind === 'id') body.set('id', q.id);
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

  function searchImage(file: File) {
    runSearch({ kind: 'image', file, previewUrl: URL.createObjectURL(file) });
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) searchImage(file);
  }

  function onFindSimilar(hit: SearchHit) {
    runSearch({ kind: 'id', id: hit.id, url: hit.url, filename: hit.filename });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const visible = useMemo(() => hits?.filter((h) => h.score >= minScore) ?? [], [hits, minScore]);
  const queryImage = query?.kind === 'image' ? query.previewUrl : query?.kind === 'id' ? query.url : null;

  return (
    <EuiPageTemplate responsive={[]} restrictWidth={1400} panelled={false} grow={false}>
      <EuiPageTemplate.Header
        pageTitle="Reverse image search"
        description="Upload or take a photo to find visually similar images, or describe what you're looking for. Powered by Jina CLIP v2 on Elastic Inference Service and Elasticsearch kNN."
      />
      <EuiPageTemplate.Section>
        <EuiFlexGroup gutterSize="l" alignItems="flexStart" responsive>
          <EuiFlexItem grow={false} style={{ width: 320, maxWidth: '100%' }}>
            <EuiPanel hasBorder>
              <EuiTabs size="s" expand>
                <EuiTab
                  isSelected={mode === 'image'}
                  onClick={() => setMode('image')}
                  prepend={<EuiIcon type="image" />}
                >
                  Image
                </EuiTab>
                <EuiTab
                  isSelected={mode === 'text'}
                  onClick={() => setMode('text')}
                  prepend={<EuiIcon type="editorComment" />}
                >
                  Text
                </EuiTab>
              </EuiTabs>
              <EuiSpacer size="m" />

              {mode === 'image' ? (
                <>
                  <EuiFilePicker
                    id="query-image"
                    display="large"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    initialPromptText="Drop a photo here or click to browse"
                    onChange={onFiles}
                    aria-label="Query image"
                    disabled={cooldown > 0}
                    fullWidth
                  />
                  <EuiSpacer size="s" />
                  <EuiButton
                    iconType={CameraIcon}
                    onClick={() => setCameraOpen(true)}
                    isDisabled={cooldown > 0}
                    fullWidth
                  >
                    Take a photo
                  </EuiButton>
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
                  body={<p>Upload or take a photo, or type a description, to find matching images.</p>}
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
            searchImage(file);
          }}
        />
      )}
    </EuiPageTemplate>
  );
}
