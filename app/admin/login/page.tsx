'use client';

import {
  EuiButton,
  EuiCallOut,
  EuiFieldPassword,
  EuiForm,
  EuiFormRow,
  EuiIcon,
  EuiPageTemplate,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { postJson } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Only allow same-site relative redirects
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await postJson('/api/auth/login', { password });
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
      setLoading(false);
    }
  }

  return (
    <EuiPanel hasBorder paddingSize="l" style={{ width: 380, maxWidth: '100%' }}>
      <div style={{ textAlign: 'center' }}>
        <EuiIcon type="lock" size="xl" color="primary" />
        <EuiSpacer size="s" />
        <EuiTitle size="s">
          <h2>Admin login</h2>
        </EuiTitle>
        <EuiText size="s" color="subdued">
          <p>Enter the admin password to upload and index photos.</p>
        </EuiText>
      </div>
      <EuiSpacer />
      {error && (
        <>
          <EuiCallOut title={error} color="danger" iconType="error" size="s" />
          <EuiSpacer size="m" />
        </>
      )}
      <EuiForm component="form" onSubmit={onSubmit}>
        <EuiFormRow label="Password" fullWidth>
          <EuiFieldPassword
            type="dual"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            fullWidth
            isInvalid={Boolean(error)}
          />
        </EuiFormRow>
        <EuiSpacer size="m" />
        <EuiButton type="submit" fill fullWidth iconType="lockOpen" isLoading={loading} isDisabled={!password}>
          Log in
        </EuiButton>
      </EuiForm>
    </EuiPanel>
  );
}

export default function LoginPage() {
  return (
    <EuiPageTemplate responsive={[]} panelled={false} grow={false} style={{ flexGrow: 1 }}>
      <EuiPageTemplate.Section alignment="center">
        <Suspense>
          <LoginForm />
        </Suspense>
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
}
