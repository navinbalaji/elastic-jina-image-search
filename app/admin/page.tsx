'use client';

import {
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFilePicker,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiLink,
  EuiPageTemplate,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  type EuiBasicTableColumn,
  type EuiFilePickerRef,
} from '@elastic/eui';
import { useRouter } from 'next/navigation';
import { ConfigSettings } from '@/components/ConfigSettings';
import { FaceScan } from '@/components/FaceScan';
import { PasswordSettings } from '@/components/PasswordSettings';
import { RateLimitSettings } from '@/components/RateLimitSettings';
import { ApiError, fetchJson } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { detectFaces, loadImage, uploadFaces } from '@/lib/face-detect';
import type { IngestResult, IngestStatus } from '@/lib/types';
import { useCallback, useEffect, useRef, useState } from 'react';

const BATCH_SIZE = 8;
// Serverless hosts such as Amplify reject request bodies over about 6 MB
const BATCH_BYTES = 4 * 1024 * 1024;

// Group files into requests of at most BATCH_SIZE files and BATCH_BYTES (a larger file goes alone)
function toBatches(files: File[]): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let bytes = 0;
  for (const file of files) {
    if (current.length && (current.length === BATCH_SIZE || bytes + file.size > BATCH_BYTES)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += file.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

const STATUS: Record<IngestStatus, { color: string; label: string }> = {
  indexed: { color: 'success', label: 'Indexed' },
  duplicate: { color: 'subdued', label: 'Already indexed' },
  error: { color: 'danger', label: 'Error' },
};

type Tab = 'photos' | 'configuration';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'photos', label: 'Photos', icon: 'image' },
  { id: 'configuration', label: 'Configuration', icon: 'gear' },
];

const DESCRIPTIONS: Record<Tab, string> = {
  photos:
    'Upload photos to embed them with Jina embeddings on Elastic Inference Service and index them in Elasticsearch. Duplicate files are detected by content hash and skipped.',
  configuration: 'Elasticsearch connection, rate limiting and the admin password.',
};

const columns: EuiBasicTableColumn<IngestResult>[] = [
  { field: 'filename', name: 'File', truncateText: true },
  {
    field: 'status',
    name: 'Status',
    width: '160px',
    render: (status: IngestStatus) => <EuiHealth color={STATUS[status].color}>{STATUS[status].label}</EuiHealth>,
  },
  { field: 'faces', name: 'Faces', width: '80px', render: (n?: number) => n ?? '–' },
  { field: 'error', name: 'Details', truncateText: true, render: (e?: string) => e ?? '' },
];

export default function AdminPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<IngestResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('photos');
  // Bumped after each upload so the face scan recounts
  const [uploads, setUploads] = useState(0);
  const picker = useRef<EuiFilePickerRef>(null);
  const router = useRouter();

  // Session expired, back to login
  const toLogin = useCallback(() => router.replace('/admin/login?next=/admin'), [router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    toLogin();
  }

  const refreshCount = useCallback(async () => {
    try {
      const { count } = await fetchJson<{ count: number }>('/api/ingest');
      setCount(count);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return toLogin();
      setError(errorMessage(err));
    }
  }, [toLogin]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  // Keep the open tab in the URL hash so a reload stays on it
  useEffect(() => {
    if (window.location.hash === '#configuration') setTab('configuration');
  }, []);

  function openTab(next: Tab) {
    setTab(next);
    history.replaceState(null, '', next === 'photos' ? window.location.pathname : `#${next}`);
  }

  async function upload() {
    const total = files.length;
    let done = 0;
    setResults([]);
    setProgress({ done, total });
    for (const batch of toBatches(files)) {
      const body = new FormData();
      batch.forEach((f) => body.append('files', f));
      let batchResults: IngestResult[];
      try {
        ({ results: batchResults } = await fetchJson<{ results: IngestResult[] }>('/api/ingest', {
          method: 'POST',
          body,
        }));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return toLogin();
        batchResults = batch.map((f) => ({ filename: f.name, status: 'error', error: errorMessage(err) }));
      }
      // Find and store faces for newly indexed photos
      for (const [k, r] of batchResults.entries()) {
        if (r.status !== 'indexed' || !r.id) continue;
        try {
          r.faces = await uploadFaces(r.id, await detectFaces(await loadImage(batch[k])));
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) return toLogin();
          r.error = `Face scan failed: ${errorMessage(err)}`;
        }
      }
      setResults((prev) => [...prev, ...batchResults]);
      done += batch.length;
      setProgress({ done, total });
    }
    setFiles([]);
    picker.current?.removeFiles();
    setProgress(null);
    refreshCount();
    setUploads((n) => n + 1);
  }

  const busy = progress !== null;
  const tally = (s: IngestStatus) => results.filter((r) => r.status === s).length;

  return (
    <EuiPageTemplate responsive={[]} restrictWidth={1000} panelled={false} grow={false}>
      <EuiPageTemplate.Header
        pageTitle="Admin"
        description={DESCRIPTIONS[tab]}
        tabs={TABS.map((t) => ({
          label: t.label,
          prepend: <EuiIcon type={t.icon} />,
          isSelected: tab === t.id,
          onClick: () => openTab(t.id),
        }))}
        rightSideItems={[
          <EuiButtonEmpty key="logout" iconType="logOut" onClick={logout}>
            Log out
          </EuiButtonEmpty>,
        ]}
      />
      <EuiPageTemplate.Section>
        {error && (
          <>
            <EuiCallOut title="Cannot reach Elasticsearch" color="danger" iconType="error">
              <p>{error}</p>
              <p>
                Check the connection under <EuiLink onClick={() => openTab('configuration')}>Configuration</EuiLink>.
              </p>
            </EuiCallOut>
            <EuiSpacer />
          </>
        )}
        {tab === 'photos' ? (
          <>
            <EuiFlexGroup gutterSize="m" responsive={false} wrap>
              {[
                { title: count ?? '–', description: 'Photos in index', color: 'default' as const },
                { title: tally('indexed'), description: 'Indexed now', color: 'success' as const },
                { title: tally('duplicate'), description: 'Already indexed', color: 'subdued' as const },
                { title: tally('error'), description: 'Errors', color: 'danger' as const },
              ].map((s) => (
                <EuiFlexItem key={s.description} style={{ minWidth: 140 }}>
                  <EuiPanel hasBorder paddingSize="m">
                    <EuiStat title={s.title} description={s.description} titleColor={s.color} titleSize="m" reverse />
                  </EuiPanel>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
            <EuiSpacer />

            <EuiPanel hasBorder>
              <EuiFilePicker
                ref={picker}
                id="upload"
                multiple
                display="large"
                accept="image/jpeg,image/png,image/webp,image/gif"
                initialPromptText="Drop photos here or click to select"
                onChange={(list) => setFiles(list ? Array.from(list) : [])}
                disabled={busy}
                fullWidth
                aria-label="Photos to index"
              />
              <EuiSpacer size="m" />
              {busy && (
                <>
                  <EuiProgress value={progress.done} max={progress.total} size="s" color="primary" />
                  <EuiSpacer size="xs" />
                  <EuiText size="xs" color="subdued">
                    Indexing {progress.done} / {progress.total}…
                  </EuiText>
                  <EuiSpacer size="m" />
                </>
              )}
              <EuiButton fill iconType="upload" onClick={upload} isLoading={busy} isDisabled={files.length === 0}>
                {files.length ? `Index ${files.length} photo${files.length === 1 ? '' : 's'}` : 'Index photos'}
              </EuiButton>
            </EuiPanel>

            {results.length > 0 && (
              <>
                <EuiSpacer />
                <EuiBasicTable items={results} columns={columns} tableCaption="Upload results" />
              </>
            )}

            <EuiSpacer />
            <FaceScan onUnauthorized={toLogin} refreshKey={uploads} />
          </>
        ) : (
          <>
            <ConfigSettings onUnauthorized={toLogin} onChanged={refreshCount} />
            <EuiSpacer />
            <RateLimitSettings onUnauthorized={toLogin} />
            <EuiSpacer />
            <PasswordSettings onUnauthorized={toLogin} />
          </>
        )}
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
}
