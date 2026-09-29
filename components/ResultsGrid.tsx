'use client';

import { EuiBadge, EuiButtonEmpty, EuiCard, EuiFlexGrid, EuiFlexItem, EuiImage, EuiToolTip } from '@elastic/eui';
import type { SearchHit } from '@/lib/types';

// Scores are cosine similarity
function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}

function scoreColor(score: number) {
  if (score >= 0.8) return 'success';
  if (score >= 0.5) return 'primary';
  return 'hollow';
}

// Keep the matched face in view when the thumbnail is cropped to a square
function facePosition(hit: SearchHit) {
  if (!hit.face) return undefined;
  const [x, y, w, h] = hit.face.box;
  return `${((x + w / 2) * 100).toFixed(1)}% ${((y + h / 2) * 100).toFixed(1)}%`;
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
                style={{ aspectRatio: '1 / 1', objectFit: 'cover', objectPosition: facePosition(hit) }}
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
              <EuiButtonEmpty
                size="xs"
                iconType={hit.face ? 'user' : 'search'}
                flush="left"
                onClick={() => onFindSimilar(hit)}
              >
                {hit.face ? 'Find this face' : 'Find similar'}
              </EuiButtonEmpty>
            }
          />
        </EuiFlexItem>
      ))}
    </EuiFlexGrid>
  );
}
