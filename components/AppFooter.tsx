'use client';

import { EuiFlexGroup, EuiIcon, EuiLink, EuiText, useEuiTheme } from '@elastic/eui';

export function AppFooter() {
  const { euiTheme } = useEuiTheme();

  return (
    <footer style={{ padding: euiTheme.size.l, borderTop: euiTheme.border.thin }}>
      <EuiText size="xs" color="subdued">
        <EuiFlexGroup gutterSize="xs" alignItems="center" justifyContent="center" responsive={false}>
          <span>Powered by</span>
          <EuiLink href="https://www.elastic.co" target="_blank" external={false} color="text">
            <EuiFlexGroup component="span" gutterSize="xs" alignItems="center" responsive={false}>
              <EuiIcon type="logoElastic" size="m" aria-hidden />
              <strong>Elastic</strong>
            </EuiFlexGroup>
          </EuiLink>
        </EuiFlexGroup>
      </EuiText>
    </footer>
  );
}
