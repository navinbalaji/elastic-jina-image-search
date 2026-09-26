'use client';

import {
  EuiButton,
  EuiCallOut,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHealth,
  EuiIcon,
  EuiPanel,
  EuiSelect,
  EuiSkeletonText,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ApiError, fetchJson, postJson } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import type { AppSettings, RateLimitSettings } from '@/lib/types';
import { useEffect, useState } from 'react';

type RateLimit = RateLimitSettings;

const WINDOWS = [
  { value: 60, text: 'per minute' },
  { value: 3600, text: 'per hour' },
  { value: 86400, text: 'per day' },
];

export function RateLimitSettings({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [saved, setSaved] = useState<RateLimit | null>(null);
  const [draft, setDraft] = useState<RateLimit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<AppSettings>('/api/admin/settings')
      .then(({ rateLimit }) => {
        setSaved(rateLimit);
        setDraft(rateLimit);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else setError(errorMessage(err));
      });
  }, [onUnauthorized]);

  async function save(next: RateLimit, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { rateLimit } = await postJson<AppSettings>('/api/admin/settings', { rateLimit: next }, 'PUT');
      setSaved(rateLimit);
      // Keep unsaved limit edits when only the switch changed
      setDraft((d) => (d ? { ...rateLimit, maxRequests: d.maxRequests, windowSeconds: d.windowSeconds } : rateLimit));
      setMessage(successMessage);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onUnauthorized();
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // The switch saves immediately; limits need Save
  function toggle(enabled: boolean) {
    if (!saved || !draft) return;
    setDraft({ ...draft, enabled });
    save({ ...saved, enabled }, enabled ? 'Rate limiting turned on' : 'Rate limiting turned off');
  }

  const dirty =
    saved && draft && (saved.maxRequests !== draft.maxRequests || saved.windowSeconds !== draft.windowSeconds);
  const validMax = draft && Number.isInteger(draft.maxRequests) && draft.maxRequests >= 1;
  const windowLabel = WINDOWS.find((w) => w.value === saved?.windowSeconds)?.text ?? `per ${saved?.windowSeconds}s`;

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="s" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiIcon type="clock" size="l" />
            <EuiTitle size="xs">
              <h3>Search rate limiting</h3>
            </EuiTitle>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {saved && (
            <EuiHealth color={saved.enabled ? 'success' : 'subdued'}>
              {saved.enabled ? `On · ${saved.maxRequests} searches ${windowLabel}` : 'Off'}
            </EuiHealth>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <p>
          Limits how many searches each visitor (by IP address) can run on the public search page. Logged-in admins are
          never limited.
        </p>
      </EuiText>
      <EuiSpacer size="m" />

      {error && (
        <>
          <EuiCallOut title={error} color="danger" iconType="error" size="s" />
          <EuiSpacer size="m" />
        </>
      )}

      {!draft ? (
        !error && <EuiSkeletonText lines={3} />
      ) : (
        <>
          <EuiSwitch
            label="Enable rate limiting"
            checked={draft.enabled}
            onChange={(e) => toggle(e.target.checked)}
            disabled={saving}
          />
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="s" alignItems="flexEnd" responsive={false} wrap>
            <EuiFlexItem grow={false} style={{ width: 160 }}>
              <EuiFormRow label="Max searches" isInvalid={!validMax} error="Must be 1 or more">
                <EuiFieldNumber
                  min={1}
                  max={100000}
                  value={Number.isNaN(draft.maxRequests) ? '' : draft.maxRequests}
                  onChange={(e) => setDraft({ ...draft, maxRequests: parseInt(e.target.value, 10) })}
                  disabled={!draft.enabled || saving}
                  isInvalid={!validMax}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ width: 160 }}>
              <EuiFormRow label="Window">
                <EuiSelect
                  options={WINDOWS}
                  value={draft.windowSeconds}
                  onChange={(e) => setDraft({ ...draft, windowSeconds: Number(e.target.value) })}
                  disabled={!draft.enabled || saving}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                onClick={() => save(draft, 'Limits saved')}
                isLoading={saving}
                isDisabled={!dirty || !validMax || !draft.enabled}
                iconType="save"
              >
                Save limits
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          {message && (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="success">
                <EuiIcon type="check" /> {message}
              </EuiText>
            </>
          )}
        </>
      )}
    </EuiPanel>
  );
}
