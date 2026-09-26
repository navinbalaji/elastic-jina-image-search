'use client';

import {
  EuiButton,
  EuiCallOut,
  EuiFieldPassword,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useState } from 'react';
import { ApiError, postJson } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { MIN_PASSWORD_LENGTH } from '@/lib/types';

export function PasswordSettings({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current && next && confirm && !tooShort && !mismatch;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await postJson('/api/admin/password', { current, next }, 'PUT');
      setCurrent('');
      setNext('');
      setConfirm('');
      setMessage('Password changed');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onUnauthorized();
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiIcon type="lock" size="l" />
        <EuiTitle size="xs">
          <h3>Admin password</h3>
        </EuiTitle>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <p>
          Once changed here, it replaces <code>ADMIN_PASSWORD</code> from <code>.env</code> for logging in. Sessions
          that are already logged in stay valid until they expire.
        </p>
      </EuiText>
      <EuiSpacer size="m" />

      {error && (
        <>
          <EuiCallOut title={error} color="danger" iconType="error" size="s" />
          <EuiSpacer size="m" />
        </>
      )}

      <EuiForm component="form" onSubmit={onSubmit}>
        <EuiFlexGroup gutterSize="m" wrap>
          <EuiFlexItem style={{ minWidth: 200 }}>
            <EuiFormRow label="Current password" fullWidth>
              <EuiFieldPassword
                type="dual"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                fullWidth
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 200 }}>
            <EuiFormRow
              label="New password"
              isInvalid={tooShort}
              error={`At least ${MIN_PASSWORD_LENGTH} characters`}
              fullWidth
            >
              <EuiFieldPassword
                type="dual"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                isInvalid={tooShort}
                fullWidth
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 200 }}>
            <EuiFormRow label="Confirm new password" isInvalid={mismatch} error="Passwords don't match" fullWidth>
              <EuiFieldPassword
                type="dual"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                isInvalid={mismatch}
                fullWidth
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <EuiButton type="submit" iconType="lock" isLoading={saving} isDisabled={!ready}>
          Change password
        </EuiButton>
      </EuiForm>

      {message && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="success">
            <EuiIcon type="check" /> {message}
          </EuiText>
        </>
      )}
    </EuiPanel>
  );
}
