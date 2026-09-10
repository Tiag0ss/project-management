import type { CommitGraphRow } from '@/lib/git/commitGraphLayout';

export type LaneHeadCommit = {
  sha: string;
  parents?: string[];
  branches?: string[];
  mergedFrom?: string[];
};

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const name = String(value || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function shasMatch(a: string, b: string): boolean {
  const left = String(a || '').trim().toLowerCase();
  const right = String(b || '').trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  const minLen = Math.min(left.length, right.length);
  if (minLen < 7) return false;
  return left.startsWith(right) || right.startsWith(left);
}

/**
 * Ensure the newest visible commit on each graph lane carries a branch name
 * when a merge in the window already identified that incoming branch.
 */
export function decorateLaneHeadBranchNames(
  commits: LaneHeadCommit[],
  rows: CommitGraphRow[]
): string[][] {
  const names = commits.map((commit) => uniqueNames(commit.branches || []));
  const firstIndexByColumn = new Map<number, number>();
  for (let i = 0; i < rows.length; i++) {
    const column = rows[i]?.column;
    if (column == null || firstIndexByColumn.has(column)) continue;
    firstIndexByColumn.set(column, i);
  }

  const labelHead = (index: number, labels: string[]) => {
    if (index < 0 || index >= names.length) return;
    if (names[index].length > 0) return;
    const next = uniqueNames(labels);
    if (next.length === 0) return;
    names[index] = next;
  };

  rows.forEach((row, mergeIndex) => {
    if (!row.isMerge) return;
    const mergedFrom = uniqueNames(commits[mergeIndex]?.mergedFrom || []);
    if (mergedFrom.length === 0) return;
    const extraEdges = row.edges.filter(
      (edge) => edge.fromColumn === row.column && edge.toColumn !== row.column
    );
    extraEdges.forEach((edge, edgeIndex) => {
      const headIndex = firstIndexByColumn.get(edge.toColumn);
      if (headIndex == null) return;
      labelHead(headIndex, [mergedFrom[Math.min(edgeIndex, mergedFrom.length - 1)]]);
    });
  });

  commits.forEach((commit) => {
    const extras = (commit.parents || []).slice(1);
    const mergedFrom = uniqueNames(commit.mergedFrom || []);
    if (extras.length === 0 || mergedFrom.length === 0) return;
    extras.forEach((parentSha, parentIndex) => {
      const parentIndexInList = commits.findIndex((row) => shasMatch(row.sha, parentSha));
      if (parentIndexInList < 0) return;
      const column = rows[parentIndexInList]?.column;
      if (column == null) return;
      if (firstIndexByColumn.get(column) !== parentIndexInList) return;
      labelHead(parentIndexInList, [mergedFrom[Math.min(parentIndex, mergedFrom.length - 1)]]);
    });
  });

  return names;
}
