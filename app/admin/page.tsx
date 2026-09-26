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
import { PasswordSettings } from '@/components/PasswordSettings';
import { RateLimitSettings } from '@/components/RateLimitSettings';
import { ApiError, fetchJson } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import type { IngestResult, IngestStatus } from '@/lib/types';
import { useCallback, useEffect, useRef, useState } from 'react';

const BATCH_SIZE = 8;

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
    'Upload photos to embed them with Jina CLIP v2 on Elastic Inference Service and index them in Elasticsearch. Duplicate files are detected by content hash and skipped.',
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
  { field: 'error', name: 'Details', truncateText: true, render: (e?: string) => e ?? '' },
];

export default function AdminPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<IngestResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('photos');
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
    const queue = [...files];
    setResults([]);
    setProgress({ done: 0, total: queue.length });
    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
      const batch = queue.slice(i, i + BATCH_SIZE);
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
      setResults((prev) => [...prev, ...batchResults]);
      setProgress({ done: Math.min(i + BATCH_SIZE, queue.length), total: queue.length });
    }
    setFiles([]);
    picker.current?.removeFiles();
    setProgress(null);
    refreshCount();
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
