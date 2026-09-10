import {
  annotateCommitBranchMeta,
  formatMergedBranchesLabel,
  mergeCommitMembership,
  parseMergeCommitMessage,
} from '../../server/utils/commitBranchMeta';

describe('parseMergeCommitMessage', () => {
  it('reads a git merge of one branch into another', () => {
    expect(parseMergeCommitMessage("Merge branch 'feature/login' into main")).toEqual({
      mergedFrom: ['feature/login'],
      mergeInto: 'main',
    });
  });

  it('reads GitHub pull-request merge subjects', () => {
    expect(parseMergeCommitMessage('Merge pull request #42 from acme/hotfix/api')).toEqual({
      mergedFrom: ['hotfix/api'],
      mergeInto: null,
    });
  });

  it('reads octopus merge subjects', () => {
    expect(parseMergeCommitMessage("Merge branches 'a', 'b' and 'c' into develop")).toEqual({
      mergedFrom: ['a', 'b', 'c'],
      mergeInto: 'develop',
    });
  });

  it('returns empty meta for non-merge messages', () => {
    expect(parseMergeCommitMessage('Fix login timeout')).toEqual({
      mergedFrom: [],
      mergeInto: null,
    });
  });
});

describe('annotateCommitBranchMeta', () => {
  it('labels merge sources from membership and destination from the merge tip', () => {
    const membership = mergeCommitMembership([
      { branchName: 'main', shas: ['merge', 'main1'] },
      { branchName: 'feature/login', shas: ['feat1'] },
    ]);
    const rows = annotateCommitBranchMeta(
      [
        { sha: 'merge', parents: ['main1', 'feat1'], message: 'Merge stuff' },
        { sha: 'feat1', parents: ['main0'], message: 'wip' },
        { sha: 'main1', parents: ['main0'], message: 'main' },
      ],
      [{ name: 'main', sha: 'merge' }],
      membership
    );
    expect(rows[0]).toEqual({
      sha: 'merge',
      branches: ['main'],
      mergedFrom: ['feature/login'],
      mergeInto: 'main',
    });
    expect(rows[1].branches).toEqual(['feature/login']);
  });

  it('labels the newest loaded commit of a branch even without a matching tip SHA', () => {
    const membership = mergeCommitMembership([
      { branchName: 'main', shas: ['c3', 'c2', 'c1'] },
      { branchName: 'feature/ui', shas: ['f2', 'f1'] },
    ]);
    const rows = annotateCommitBranchMeta(
      [
        { sha: 'c3', parents: ['c2'], message: 'head' },
        { sha: 'f2', parents: ['f1'], message: 'feature tip' },
        { sha: 'c2', parents: ['c1'], message: 'older main' },
        { sha: 'f1', parents: ['c1'], message: 'older feature' },
        { sha: 'c1', parents: [], message: 'base' },
      ],
      [],
      membership
    );
    expect(rows[0].branches).toEqual(['main']);
    expect(rows[1].branches).toEqual(['feature/ui']);
    expect(rows[2].branches).toEqual([]);
    expect(rows[3].branches).toEqual([]);
  });

  it('matches branch tips when SHA casing or abbreviation differs', () => {
    const rows = annotateCommitBranchMeta(
      [{ sha: 'ABCDEF1234567890', parents: ['p'], message: 'tip' }],
      [{ name: 'release/1.4', sha: 'abcdef1234567890abcd' }],
      new Map()
    );
    expect(rows[0].branches).toEqual(['release/1.4']);
  });

  it('falls back to the merge message when parents are not in the loaded window', () => {
    const rows = annotateCommitBranchMeta(
      [{ sha: 'merge', parents: ['p1', 'p2'], message: "Merge branch 'release/1.2' into develop" }],
      [],
      new Map()
    );
    expect(rows[0].mergedFrom).toEqual(['release/1.2']);
    expect(rows[0].mergeInto).toBe('develop');
    expect(rows[0].branches).toEqual([]);
  });
});

describe('formatMergedBranchesLabel', () => {
  it('formats source and destination', () => {
    expect(formatMergedBranchesLabel(['feature/login'], 'main')).toBe('feature/login → main');
  });

  it('formats sources only', () => {
    expect(formatMergedBranchesLabel(['a', 'b'], null)).toBe('a, b');
  });
});
