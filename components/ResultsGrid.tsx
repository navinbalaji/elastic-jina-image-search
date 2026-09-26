'use client';

import { EuiBadge, EuiButtonEmpty, EuiCard, EuiFlexGrid, EuiFlexItem, EuiImage, EuiToolTip } from '@elastic/eui';
import type { SearchHit } from '@/lib/types';

// Elasticsearch cosine score is (1 + cos) / 2
function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}

function scoreColor(score: number) {
  if (score >= 0.8) return 'success';
  if (score >= 0.5) return 'primary';
  return 'hollow';
}

interface ResultsGridProps {
  hits: SearchHit[];
  onFindSimilar: (hit: SearchHit) => void;
}

export function ResultsGrid({ hits, onFindSimilar }: ResultsGridProps) {
  return (
    <EuiFlexGrid columns={4} gutterSize="m" responsive className="results-grid">
      {hits.map((hit) => (
        <EuiFlexItem key={hit.id}>
          <EuiCard
            textAlign="left"
            paddingSize="s"
            image={
              <EuiImage
                src={hit.url}
                alt={hit.filename}
                allowFullScreen
                size="fullWidth"
                wrapperProps={{ style: { width: '100%' } }}
                style={{ aspectRatio: '1 / 1', objectFit: 'cover' }}
              />
            }
            title={
              <EuiToolTip content={hit.filename} display="block">
                {/* Size to the card, not the filename, so long names truncate on small screens */}
                <span className="eui-textTruncate" style={{ display: 'block', contain: 'inline-size' }}>
                  {hit.filename}
                </span>
              </EuiToolTip>
            }
            titleSize="xs"
            description={<EuiBadge color={scoreColor(hit.score)}>{formatScore(hit.score)} match</EuiBadge>}
            footer={
              <EuiButtonEmpty size="xs" iconType="search" flush="left" onClick={() => onFindSimilar(hit)}>
                Find similar
              </EuiButtonEmpty>
            }
          />
        </EuiFlexItem>
      ))}
    </EuiFlexGrid>
  );
}
