export type CommitGraphInput = {
  sha: string;
  parents: string[];
};

export type CommitGraphEdge = {
  fromColumn: number;
  toColumn: number;
};

export type CommitGraphRow = {
  sha: string;
  column: number;
  /** Active lane count for this row (for SVG width). */
  columns: number;
  /** Lines drawn from this row toward the next (older) row. */
  edges: CommitGraphEdge[];
  isMerge: boolean;
  /** Columns that meet at this commit (fork/rejoin in the loaded window). */
  joinColumns: number[];
};

function allocateLane(lanes: (string | null)[], sha: string): number {
  const existing = lanes.findIndex((s) => s === sha);
  if (existing !== -1) return existing;
  const empty = lanes.findIndex((s) => s === null);
  if (empty !== -1) {
    lanes[empty] = sha;
    return empty;
  }
  lanes.push(sha);
  return lanes.length - 1;
}

function trimTrailingNulls(lanes: (string | null)[]): void {
  while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
    lanes.pop();
  }
}

/**
 * Layout commits (newest-first, as returned by remote APIs) into graph lanes
 * for the currently loaded history window.
 * One output row per input commit (index-aligned with the source list).
 */
export function layoutCommitGraph(commits: CommitGraphInput[]): CommitGraphRow[] {
  let active: (string | null)[] = [];
  const rows: CommitGraphRow[] = [];

  for (const commit of commits) {
    const sha = String(commit.sha || '');
    const laneKey = sha || `__empty_${rows.length}`;
    const parents = (commit.parents || []).map(String).filter(Boolean);

    // All lanes currently waiting for this commit (branch join / fork point).
    const waitingColumns = active
      .map((waiting, index) => (waiting === laneKey ? index : -1))
      .filter((index) => index >= 0);

    let column: number;
    if (waitingColumns.length > 0) {
      column = Math.min(...waitingColumns);
    } else {
      column = allocateLane(active, laneKey);
      waitingColumns.push(column);
    }

    const nextActive: (string | null)[] = active.map((waiting, index) => {
      if (waitingColumns.includes(index)) return null;
      return waiting;
    });
    while (nextActive.length <= column) {
      nextActive.push(null);
    }

    const edges: CommitGraphEdge[] = [];

    // Pass-through lanes that are not this commit.
    for (let i = 0; i < active.length; i++) {
      if (waitingColumns.includes(i)) continue;
      const waiting = active[i];
      if (!waiting) continue;
      edges.push({ fromColumn: i, toColumn: i });
      nextActive[i] = waiting;
    }

    if (parents.length === 0) {
      nextActive[column] = null;
    } else {
      const firstParent = parents[0];
      // Prefer continuing on this column; if first parent is already reserved
      // elsewhere, draw a diagonal rejoin into that lane.
      let firstCol = nextActive.findIndex(
        (waiting, index) => index !== column && waiting === firstParent
      );
      if (firstCol === -1) {
        firstCol = column;
        nextActive[column] = firstParent;
      } else {
        nextActive[column] = null;
      }
      edges.push({ fromColumn: column, toColumn: firstCol });

      for (let p = 1; p < parents.length; p++) {
        const parentSha = parents[p];
        let parentCol = nextActive.findIndex((waiting) => waiting === parentSha);
        if (parentCol === -1) {
          parentCol = allocateLane(nextActive, parentSha);
        }
        edges.push({ fromColumn: column, toColumn: parentCol });
      }
    }

    trimTrailingNulls(nextActive);

    rows.push({
      sha,
      column,
      columns: Math.max(active.length, nextActive.length, column + 1, ...waitingColumns.map((c) => c + 1)),
      edges,
      isMerge: parents.length > 1,
      joinColumns: [...new Set(waitingColumns)].sort((a, b) => a - b),
    });

    active = nextActive;
  }

  return rows;
}
