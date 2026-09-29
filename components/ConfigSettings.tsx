'use client';

import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiConfirmModal,
  EuiFieldPassword,
  EuiFieldText,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiPanel,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useEffect, useState } from 'react';
import { ApiError, fetchJson, postJson } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import type { ConfigKey, ConfigSource, ConfigUpdate, ConfigView, ConnectionTest } from '@/lib/types';

type FieldKey = Exclude<ConfigKey, 'esApiKey'>;

const FIELDS: { key: FieldKey; label: string; env: string; help: string }[] = [
  {
    key: 'esEndpoint',
    label: 'Elasticsearch endpoint',
    env: 'ES_URL / ES_CLOUD_ID',
    help: 'Serverless or deployment URL, or an Elastic Cloud ID.',
  },
  { key: 'esIndex', label: 'Index name', env: 'ES_INDEX', help: 'Where photos and their vectors are stored.' },
  {
    key: 'inferenceId',
    label: 'Inference endpoint',
    env: 'INFERENCE_ID',
    help: 'A multimodal embedding endpoint. Switching models means recreating the index.',
  },
];

const SOURCES: Record<ConfigSource, { label: string; color: string }> = {
  admin: { label: 'Admin panel', color: 'primary' },
  env: { label: '.env', color: 'hollow' },
  default: { label: 'Default', color: 'hollow' },
  unset: { label: 'Not set', color: 'warning' },
};

function SourceBadge({ source }: { source: ConfigSource }) {
  return <EuiBadge color={SOURCES[source].color}>{SOURCES[source].label}</EuiBadge>;
}

interface ConfigSettingsProps {
  onUnauthorized: () => void;
  // Called after anything that can change the photo count
  onChanged: () => void;
}

export function ConfigSettings({ onUnauthorized, onChanged }: ConfigSettingsProps) {
  const [view, setView] = useState<ConfigView | null>(null);
  const [draft, setDraft] = useState<Record<FieldKey, string> | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'index' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [test, setTest] = useState<ConnectionTest | null>(null);
  const [confirmRecreate, setConfirmRecreate] = useState(false);

  function load(next: ConfigView) {
    setView(next);
    setDraft(next.values);
    setApiKey('');
  }

  // Run a request, sending expired sessions back to login
  async function run<T>(kind: 'save' | 'test' | 'index', request: () => Promise<T>): Promise<T | undefined> {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      return await request();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    fetchJson<ConfigView>('/api/admin/config')
      .then(load)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else setError(errorMessage(err));
      });
  }, [onUnauthorized]);

  // Only send fields that changed; an emptied field falls back to .env or the default
  const changes: ConfigUpdate = {};
  if (view && draft) {
    for (const { key } of FIELDS) if (draft[key].trim() !== view.values[key]) changes[key] = draft[key].trim();
  }
  if (apiKey) changes.esApiKey = apiKey;
  const dirty = Object.keys(changes).length > 0;

  async function save(update: ConfigUpdate, done: string) {
    const next = await run('save', () => postJson<ConfigView>('/api/admin/config', update, 'PUT'));
    if (!next) return;
    load(next);
    setTest(null);
    setMessage(done);
    onChanged();
  }

  async function testConnection() {
    setTest(null);
    const result = await run('test', () => postJson<ConnectionTest>('/api/admin/config/test', changes));
    if (result) setTest(result);
  }

  async function createIndex(recreate: boolean) {
    setConfirmRecreate(false);
    const result = await run('index', () =>
      postJson<{ index: string; dims: number }>('/api/admin/index', { recreate }),
    );
    if (!result) return;
    onChanged();
    await testConnection();
    setMessage(`${recreate ? 'Recreated' : 'Created'} index "${result.index}" for ${result.dims}-d vectors`);
  }

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiIcon type="gear" size="l" />
        <EuiTitle size="xs">
          <h3>Configuration</h3>
        </EuiTitle>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <p>
          Settings saved here override <code>.env</code> and are stored in{' '}
          <code>{view?.settingsLocation ?? 'settings.json'}</code>, including the API key. Empty a field to go back to
          the <code>.env</code> value or the default.
        </p>
      </EuiText>
      <EuiSpacer size="m" />

      {error && (
        <>
          <EuiCallOut title={error} color="danger" iconType="error" size="s" />
          <EuiSpacer size="m" />
        </>
      )}

      {!view || !draft ? (
        !error && <EuiSkeletonText lines={6} />
      ) : (
        <>
          <EuiFlexGrid columns={2} gutterSize="m">
            {FIELDS.map((f) => (
              <EuiFlexItem key={f.key}>
                <EuiFormRow
                  label={f.label}
                  labelAppend={<SourceBadge source={view.sources[f.key]} />}
                  helpText={`${f.help} (${f.env})`}
                  fullWidth
                >
                  <EuiFieldText
                    value={draft[f.key]}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    disabled={busy !== null}
                    fullWidth
                  />
                </EuiFormRow>
              </EuiFlexItem>
            ))}
            <EuiFlexItem>
              <EuiFormRow
                label="Elasticsearch API key"
                labelAppend={<SourceBadge source={view.sources.esApiKey} />}
                helpText={
                  view.sources.esApiKey === 'admin' ? (
                    <EuiButtonEmpty
                      size="xs"
                      flush="left"
                      onClick={() => save({ esApiKey: '' }, 'Using the .env API key')}
                    >
                      Use the .env key instead
                    </EuiButtonEmpty>
                  ) : (
                    'Never shown again once saved. (ES_API_KEY)'
                  )
                }
                fullWidth
              >
                <EuiFieldPassword
                  type="dual"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={view.sources.esApiKey === 'unset' ? 'Not set' : 'Saved · leave empty to keep'}
                  autoComplete="off"
                  disabled={busy !== null}
                  fullWidth
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGrid>
          <EuiSpacer size="m" />

          <EuiFlexGroup gutterSize="s" responsive={false} wrap>
            <EuiButton
              fill
              iconType="save"
              onClick={() => save(changes, 'Configuration saved')}
              isLoading={busy === 'save'}
              isDisabled={!dirty || busy !== null}
            >
              Save changes
            </EuiButton>
            <EuiButton iconType="link" onClick={testConnection} isLoading={busy === 'test'} isDisabled={busy !== null}>
              {dirty ? 'Test changes' : 'Test connection'}
            </EuiButton>
            {dirty && (
              <EuiButtonEmpty onClick={() => load(view)} isDisabled={busy !== null}>
                Discard
              </EuiButtonEmpty>
            )}
          </EuiFlexGroup>

          {message && (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="success">
                <EuiIcon type="check" /> {message}
              </EuiText>
            </>
          )}

          {test && (
            <>
              <EuiSpacer size="m" />
              <TestResult
                test={test}
                dirty={dirty}
                busy={busy === 'index'}
                onCreate={() => createIndex(false)}
                onRecreate={() => setConfirmRecreate(true)}
              />
            </>
          )}
        </>
      )}

      {confirmRecreate && test && (
        <EuiConfirmModal
          title={`Recreate index "${test.index}"?`}
          onCancel={() => setConfirmRecreate(false)}
          onConfirm={() => createIndex(true)}
          cancelButtonText="Cancel"
          confirmButtonText="Recreate index"
          buttonColor="danger"
          defaultFocusedButton="cancel"
        >
          <p>
            All {test.docCount ?? 0} indexed photos will be removed from search. Their image files are kept, but
            you&apos;ll need to upload them again.
          </p>
        </EuiConfirmModal>
      )}
    </EuiPanel>
  );
}

interface TestResultProps {
  test: ConnectionTest;
  dirty: boolean;
  busy: boolean;
  onCreate: () => void;
  onRecreate: () => void;
}

function TestResult({ test, dirty, busy, onCreate, onRecreate }: TestResultProps) {
  const mismatch = test.indexExists && test.indexDims !== undefined && test.indexDims !== test.dims;
  const color = !test.indexExists ? 'warning' : mismatch ? 'danger' : 'success';

  return (
    <EuiCallOut
      title={`Connected to Elasticsearch ${test.version}`}
      color={color}
      iconType={color === 'success' ? 'check' : 'warning'}
      size="s"
    >
      <p>
        Inference endpoint <code>{test.inferenceId}</code> returns {test.dims}-d vectors.{' '}
        {!test.indexExists && <>Index &quot;{test.index}&quot; doesn&apos;t exist yet.</>}
        {mismatch && (
          <>
            Index &quot;{test.index}&quot; holds {test.indexDims}-d vectors, so it has to be recreated for this
            endpoint.
          </>
        )}
        {test.indexExists && !mismatch && (
          <>
            Index &quot;{test.index}&quot; is ready with {test.docCount} photo{test.docCount === 1 ? '' : 's'}.
          </>
        )}
      </p>
      {dirty && (!test.indexExists || mismatch) ? (
        <p>Save your changes to set up the index.</p>
      ) : (
        !dirty && (
          <EuiButton
            size="s"
            color={test.indexExists ? 'danger' : 'primary'}
            fill={!test.indexExists || mismatch}
            iconType={test.indexExists ? 'refresh' : 'plusInCircle'}
            onClick={test.indexExists ? onRecreate : onCreate}
            isLoading={busy}
          >
            {test.indexExists ? 'Recreate index' : 'Create index'}
          </EuiButton>
        )
      )}
    </EuiCallOut>
  );
}
