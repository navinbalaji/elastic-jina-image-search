'use client';

import { EuiFlexGroup, EuiHeader, EuiHeaderLink, EuiHeaderSectionItem, EuiIcon, EuiTitle } from '@elastic/eui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ColorModeToggle } from './ColorModeToggle';

const LINKS = [
  { href: '/', label: 'Search', icon: 'search' },
  { href: '/admin', label: 'Admin', icon: 'upload' },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <EuiHeader position="fixed">
      <EuiHeaderSectionItem>
        <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiIcon type="logoElasticsearch" size="l" />
            <EuiTitle size="xxs">
              <h1>Image Search</h1>
            </EuiTitle>
          </EuiFlexGroup>
        </Link>
      </EuiHeaderSectionItem>
      <EuiHeaderSectionItem>
        {/* Plain links instead of EuiHeaderLinks, whose mobile popover breaks SSR hydration */}
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          {LINKS.map((l) => (
            <EuiHeaderLink
              key={l.href}
              href={l.href}
              iconType={l.icon}
              isActive={pathname === l.href}
              aria-label={l.label}
              className="header-link"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                router.push(l.href);
              }}
            >
              {l.label}
            </EuiHeaderLink>
          ))}
          <ColorModeToggle />
        </EuiFlexGroup>
      </EuiHeaderSectionItem>
    </EuiHeader>
  );
}
