'use client';

import { EuiButtonIcon, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { useSetColorMode } from '@/app/providers';

export function ColorModeToggle() {
  const { colorMode } = useEuiTheme();
  const setColorMode = useSetColorMode();
  const isDark = colorMode === 'DARK';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <EuiToolTip content={label} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType={isDark ? 'sun' : 'moon'}
        aria-label={label}
        color="text"
        onClick={() => setColorMode(isDark ? 'light' : 'dark')}
      />
    </EuiToolTip>
  );
}
