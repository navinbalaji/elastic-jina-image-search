'use client';

import createCache from '@emotion/cache';
import { EuiProvider } from '@elastic/eui';
import { useServerInsertedHTML } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { COLOR_MODE_COOKIE, SYSTEM_COLOR_MODE_COOKIE, type ColorMode } from '@/lib/color-mode';

// Collect EUI's Emotion styles during SSR so the first paint is styled
function useEmotionCache() {
  const [registry] = useState(() => {
    const cache = createCache({ key: 'eui' });
    cache.compat = true;
    const insert = cache.insert;
    let inserted: { name: string; isGlobal: boolean }[] = [];
    cache.insert = (...args) => {
      const [selector, serialized] = args;
      if (cache.inserted[serialized.name] === undefined) inserted.push({ name: serialized.name, isGlobal: !selector });
      return insert(...args);
    };
    const flush = () => {
      const flushed = inserted;
      inserted = [];
      return flushed;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const flushed = registry.flush();
    if (flushed.length === 0) return null;
    const { key, inserted } = registry.cache;
    const css = (name: string) => (typeof inserted[name] === 'string' ? (inserted[name] as string) : '');
    const scoped = flushed.filter((f) => !f.isGlobal).map((f) => f.name);

    // Global styles get their own tags so Emotion can replace them on the client (e.g. theme switch)
    return (
      <>
        {flushed
          .filter((f) => f.isGlobal)
          .map(({ name }) => (
            <style key={name} data-emotion={`${key}-global ${name}`} dangerouslySetInnerHTML={{ __html: css(name) }} />
          ))}
        {scoped.length > 0 && (
          <style
            data-emotion={`${key} ${scoped.join(' ')}`}
            dangerouslySetInnerHTML={{ __html: scoped.map(css).join('') }}
          />
        )}
      </>
    );
  });

  return registry.cache;
}

const ColorModeContext = createContext<(mode: ColorMode) => void>(() => {});

export const useSetColorMode = () => useContext(ColorModeContext);

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

interface ProvidersProps {
  children: ReactNode;
  // Explicit user choice, if any
  colorMode?: ColorMode;
  // Server's best guess when there is no explicit choice
  systemColorMode?: ColorMode;
}

export function Providers({ children, colorMode, systemColorMode = 'light' }: ProvidersProps) {
  const cache = useEmotionCache();
  const [choice, setChoice] = useState(colorMode);
  // Start from the server's guess so hydration matches, then sync with the real system theme
  const [system, setSystem] = useState(systemColorMode);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const mode = query.matches ? 'dark' : 'light';
      setSystem(mode);
      setCookie(SYSTEM_COLOR_MODE_COOKIE, mode);
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const setColorMode = useCallback((next: ColorMode) => {
    setChoice(next);
    setCookie(COLOR_MODE_COOKIE, next);
  }, []);

  return (
    <ColorModeContext.Provider value={setColorMode}>
      <EuiProvider colorMode={choice ?? system} cache={cache}>
        {children}
      </EuiProvider>
    </ColorModeContext.Provider>
  );
}
