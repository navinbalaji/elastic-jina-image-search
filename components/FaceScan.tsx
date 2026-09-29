'use client';

import {
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchJson } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { detectFaces, loadImage, uploadFaces } from '@/lib/face-detect';
import type { PendingPhoto } from '@/lib/types';

interface FaceScanProps {
  onUnauthorized: () => void;
  // Changes after uploads, to refresh the pending count
  refreshKey: number;
}

// Finds faces in photos indexed before face search (or whose scan failed)
export function FaceScan({ onUnauthorized, refreshKey }: FaceScanProps) {
  const [pending, setPending] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; faces: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { total } = await fetchJson<{ total: number }>('/api/admin/faces?limit=1');
      setPending(total);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onUnauthorized();
      setError(errorMessage(err));
    }
  }, [onUnauthorized]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  async function scan() {
    const skip = new Set<string>();
    const failures: string[] = [];
    const total = pending ?? 0;
    let done = 0;
    let faces = 0;
    setError(null);
    setFailed([]);
    setProgress({ done, total, faces });
    try {
      for (;;) {
        const { photos } = await fetchJson<{ photos: PendingPhoto[] }>(`/api/admin/faces?limit=${skip.size + 10}`);
        const todo = photos.filter((p) => !skip.has(p.id));
        if (todo.length === 0) break;
        for (const photo of todo) {
          try {
            faces += await uploadFaces(photo.id, await detectFaces(await loadImage(photo.url)));
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) return onUnauthorized();
            // Leave it pending for a later scan
            skip.add(photo.id);
            failures.push(`${photo.filename}: ${errorMessage(err)}`);
          }
          done++;
          setProgress({ done, total: Math.max(total, done), faces });
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onUnauthorized();
      setError(errorMessage(err));
    }
    setFailed(failures);
    setProgress(null);
    refresh();
  }

  const busy = progress !== null;

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="user" size="m" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="xs">
            <h3>Face search</h3>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <p>
          New uploads are scanned for faces automatically. Each face, including every face in a group photo, is cropped
          in your browser and embedded separately. Scan photos indexed earlier to include them in face search.
        </p>
      </EuiText>
      <EuiSpacer size="m" />
      {error && (
        <>
          <EuiCallOut title={error} color="danger" iconType="error" size="s" />
          <EuiSpacer size="m" />
        </>
      )}
      {failed.length > 0 && (
        <>
          <EuiCallOut title={`${failed.length} photos couldn't be scanned`} color="warning" iconType="warning" size="s">
            <ul>
              {failed.slice(0, 5).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}
      {busy && (
        <>
          <EuiProgress value={progress.done} max={Math.max(progress.total, 1)} size="s" color="primary" />
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            Scanned {progress.done} / {progress.total} photos, {progress.faces} faces found…
          </EuiText>
          <EuiSpacer size="m" />
        </>
      )}
      <EuiButton iconType="user" onClick={scan} isLoading={busy} isDisabled={!pending}>
        {pending === null
          ? 'Scan for faces'
          : pending === 0
            ? 'All photos scanned'
            : `Scan ${pending} photo${pending === 1 ? '' : 's'} for faces`}
      </EuiButton>
    </EuiPanel>
  );
}
