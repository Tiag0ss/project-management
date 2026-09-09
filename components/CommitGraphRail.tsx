'use client';

import type { CommitGraphEdge, CommitGraphRow } from '@/lib/git/commitGraphLayout';

const COL_SPACING = 14;
const PAD_X = 10;

type CommitGraphRailProps = {
  row: CommitGraphRow;
  previousEdges?: CommitGraphEdge[];
  height?: number;
};

export default function CommitGraphRail({
  row,
  previousEdges = [],
  height = 56,
}: CommitGraphRailProps) {
  const midY = height / 2;
  const width = PAD_X * 2 + Math.max(1, row.columns) * COL_SPACING;
  const colX = (column: number) => PAD_X + column * COL_SPACING;
  const joinSet = new Set(row.joinColumns || [row.column]);

  return (
    <svg
      width={width}
      height={height}
      className="block shrink-0 overflow-visible text-gray-400 dark:text-gray-500"
      aria-hidden
    >
      {/* Incoming: converge onto this commit when multiple lanes waited for it. */}
      {previousEdges.map((edge, index) => {
        const arrivesAt = edge.toColumn;
        const goesToNode = joinSet.has(arrivesAt);
        const x1 = colX(arrivesAt);
        const x2 = goesToNode ? colX(row.column) : colX(arrivesAt);
        return (
          <line
            key={`in-${index}-${edge.fromColumn}-${edge.toColumn}`}
            x1={x1}
            y1={0}
            x2={x2}
            y2={midY}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}

      {/* Outgoing toward older commits (includes merge/fork diagonals). */}
      {row.edges.map((edge, index) => (
        <line
          key={`out-${index}-${edge.fromColumn}-${edge.toColumn}`}
          x1={colX(edge.fromColumn)}
          y1={midY}
          x2={colX(edge.toColumn)}
          y2={height}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}

      <circle
        cx={colX(row.column)}
        cy={midY}
        r={row.isMerge ? 5 : 4}
        className={row.isMerge ? 'fill-purple-500 dark:fill-purple-400' : 'fill-blue-500 dark:fill-blue-400'}
      />
    </svg>
  );
}
