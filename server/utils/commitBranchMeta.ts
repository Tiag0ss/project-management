export type BranchTip = {
  name: string;
  sha: string;
};

export type CommitBranchAnnotation = {
  sha: string;
  branches: string[];
  mergedFrom: string[];
  mergeInto: string | null;
};

type AnnotateCommitInput = {
  sha: string;
  parents: string[];
  message: string;
};

export function uniqueStrings(values: string[]): string[] {
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

export function normalizeCommitSha(sha: string): string {
  return String(sha || '').trim().toLowerCase();
}

function shasMatch(a: string, b: string): boolean {
  const left = normalizeCommitSha(a);
  const right = normalizeCommitSha(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const minLen = Math.min(left.length, right.length);
  if (minLen < 7) return false;
  return left.startsWith(right) || right.startsWith(left);
}

function getBySha<T>(map: Map<string, T>, sha: string): T | undefined {
  const key = normalizeCommitSha(sha);
  if (!key) return undefined;
  const exact = map.get(key);
  if (exact !== undefined) return exact;
  for (const [stored, value] of map) {
    if (shasMatch(stored, key)) return value;
  }
  return undefined;
}

function stripRefName(raw: string): string {
  let name = String(raw || '').trim();
  name = name.replace(/^['"]+|['"]+$/g, '');
  name = name.replace(/^refs\/heads\//i, '');
  name = name.replace(/^origin\//i, '');
  name = name.replace(/[,.]+$/g, '');
  return name.trim();
}

/**
 * Parse git merge subject lines into source/target branch names.
 * Falls back to empty lists when the message is not a standard merge subject.
 */
export function parseMergeCommitMessage(message: string): {
  mergedFrom: string[];
  mergeInto: string | null;
} {
  const subject = String(message || '').split('\n')[0]?.trim() || '';
  if (!subject) return { mergedFrom: [], mergeInto: null };

  let mergeInto: string | null = null;
  let head = subject;
  const quotedInto = subject.match(/\s+into\s+'([^']+)'\s*$/i);
  const plainInto = quotedInto ? null : subject.match(/\s+into\s+(\S+)\s*$/i);
  const intoMatch = quotedInto || plainInto;
  if (intoMatch && intoMatch.index != null) {
    mergeInto = stripRefName(intoMatch[1] || '') || null;
    head = subject.slice(0, intoMatch.index).trim();
  }

  const prMatch = head.match(/^Merge pull request #\d+ from (.+)$/i);
  if (prMatch) {
    let ref = stripRefName(prMatch[1]);
    ref = ref.replace(/^[^/:]+:/, '');
    const slash = ref.indexOf('/');
    if (slash > 0) ref = ref.slice(slash + 1);
    return { mergedFrom: uniqueStrings([ref]), mergeInto };
  }

  const oneBranch = head.match(/^Merge (?:remote-tracking )?branch (?:'([^']+)'|(\S+))$/i);
  if (oneBranch) {
    return { mergedFrom: uniqueStrings([stripRefName(oneBranch[1] || oneBranch[2] || '')]), mergeInto };
  }

  const manyBranches = head.match(/^Merge (?:remote-tracking )?branches (.+)$/i);
  if (manyBranches) {
    const names = [...manyBranches[1].matchAll(/'([^']+)'/g)].map((m) => stripRefName(m[1]));
    return { mergedFrom: uniqueStrings(names), mergeInto };
  }

  return { mergedFrom: [], mergeInto };
}

export function mergeCommitMembership(
  pages: Array<{ branchName: string; shas: string[] }>
): Map<string, Set<string>> {
  const membership = new Map<string, Set<string>>();
  for (const page of pages) {
    const branchName = String(page.branchName || '').trim();
    if (!branchName) continue;
    for (const sha of page.shas) {
      const key = normalizeCommitSha(sha);
      if (!key) continue;
      let set = membership.get(key);
      if (!set) {
        set = new Set<string>();
        membership.set(key, set);
      }
      set.add(branchName);
    }
  }
  return membership;
}

/**
 * Attach branch-tip decorations and merge source/target names.
 * Merge names prefer graph membership / current tips, then the commit message.
 * Branch labels go on the newest loaded commit of each branch, not only an exact tip SHA match.
 */
export function annotateCommitBranchMeta(
  commits: AnnotateCommitInput[],
  branchTips: BranchTip[],
  membership?: Map<string, Set<string>>
): CommitBranchAnnotation[] {
  const tipsBySha = new Map<string, string[]>();
  for (const tip of branchTips) {
    const sha = normalizeCommitSha(tip.sha);
    const name = String(tip.name || '').trim();
    if (!sha || !name) continue;
    const list = tipsBySha.get(sha) || [];
    if (!list.includes(name)) list.push(name);
    tipsBySha.set(sha, list);
  }

  const claimedBranches = new Set<string>();
  const visibleHeadsBySha = new Map<string, string[]>();
  for (const commit of commits) {
    const shaKey = normalizeCommitSha(commit.sha);
    const names = uniqueStrings([...(getBySha(membership || new Map(), commit.sha) || [])]);
    const fresh: string[] = [];
    for (const name of names) {
      if (claimedBranches.has(name)) continue;
      claimedBranches.add(name);
      fresh.push(name);
    }
    if (fresh.length > 0) {
      visibleHeadsBySha.set(shaKey, uniqueStrings([...(visibleHeadsBySha.get(shaKey) || []), ...fresh]));
    }
  }

  return commits.map((commit) => {
    const sha = String(commit.sha || '');
    const parents = (commit.parents || []).map(String).filter(Boolean);
    const branches = uniqueStrings([
      ...(getBySha(tipsBySha, sha) || []),
      ...(getBySha(visibleHeadsBySha, sha) || []),
    ]);
    const parsed = parseMergeCommitMessage(commit.message || '');
    let mergedFrom = parsed.mergedFrom;
    let mergeInto = parsed.mergeInto;

    if (parents.length > 1) {
      const destFromTips = branches.length > 0 ? branches : uniqueStrings(getBySha(tipsBySha, parents[0]) || []);
      const destFromMembership = uniqueStrings([...(getBySha(membership || new Map(), sha) || [])]);
      const destSet = new Set(uniqueStrings([...destFromTips, ...destFromMembership, ...(mergeInto ? [mergeInto] : [])]));

      const inferredFrom: string[] = [];
      for (const parentSha of parents.slice(1)) {
        inferredFrom.push(...(getBySha(membership || new Map(), parentSha) || []));
        inferredFrom.push(...(getBySha(tipsBySha, parentSha) || []));
        inferredFrom.push(...(getBySha(visibleHeadsBySha, parentSha) || []));
      }
      const fromExclusive = uniqueStrings(inferredFrom.filter((name) => !destSet.has(name)));
      if (fromExclusive.length > 0) {
        mergedFrom = uniqueStrings([...fromExclusive, ...mergedFrom]);
      }

      if (!mergeInto) {
        if (destFromTips.length === 1) mergeInto = destFromTips[0];
        else if (destFromMembership.length === 1) mergeInto = destFromMembership[0];
      }
    } else {
      mergedFrom = [];
      mergeInto = null;
    }

    return {
      sha,
      branches,
      mergedFrom: parents.length > 1 ? mergedFrom : [],
      mergeInto: parents.length > 1 ? mergeInto : null,
    };
  });
}

export function formatMergedBranchesLabel(
  mergedFrom: string[] | undefined,
  mergeInto: string | null | undefined
): string {
  const from = uniqueStrings(mergedFrom || []);
  const into = String(mergeInto || '').trim();
  if (from.length > 0 && into) return `${from.join(', ')} → ${into}`;
  if (from.length > 0) return from.join(', ');
  if (into) return `into ${into}`;
  return '';
}
