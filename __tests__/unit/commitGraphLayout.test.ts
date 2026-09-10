import { layoutCommitGraph } from '../../lib/git/commitGraphLayout';
import { buildRemoteCommitsListUrl } from '../../server/utils/gitRemote';

describe('layoutCommitGraph', () => {
  it('layouts a linear history on a single lane', () => {
    const rows = layoutCommitGraph([
      { sha: 'c3', parents: ['c2'] },
      { sha: 'c2', parents: ['c1'] },
      { sha: 'c1', parents: [] },
    ]);
    expect(rows.map((r) => r.column)).toEqual([0, 0, 0]);
    expect(rows.every((r) => !r.isMerge)).toBe(true);
    expect(rows[0].edges).toContainEqual({ fromColumn: 0, toColumn: 0 });
  });

  it('marks merges and opens a side lane for the second parent', () => {
    const rows = layoutCommitGraph([
      { sha: 'merge', parents: ['main1', 'feat1'] },
      { sha: 'feat1', parents: ['main0'] },
      { sha: 'main1', parents: ['main0'] },
      { sha: 'main0', parents: [] },
    ]);
    expect(rows[0].isMerge).toBe(true);
    expect(rows[0].column).toBe(0);
    expect(rows[0].edges.some((e) => e.fromColumn === 0 && e.toColumn !== 0)).toBe(true);
    expect(rows[0].columns).toBeGreaterThanOrEqual(2);
  });

  it('rejoins a side branch back to the first parent lane', () => {
    const rows = layoutCommitGraph([
      { sha: 'merge', parents: ['m2', 'f1'] },
      { sha: 'f1', parents: ['m1'] },
      { sha: 'm2', parents: ['m1'] },
      { sha: 'm1', parents: [] },
    ]);
    const last = rows[rows.length - 1];
    expect(last.sha).toBe('m1');
    expect(last.isMerge).toBe(false);
    const m2 = rows.find((r) => r.sha === 'm2');
    expect(m2?.edges.some((e) => e.fromColumn !== e.toColumn)).toBe(true);
  });

  it('draws a diagonal when a second child rejoins an existing parent lane', () => {
    const rows = layoutCommitGraph([
      { sha: 'side', parents: ['base'] },
      { sha: 'main', parents: ['base'] },
      { sha: 'base', parents: [] },
    ]);
    const main = rows.find((r) => r.sha === 'main');
    expect(main?.edges.some((e) => e.fromColumn !== e.toColumn)).toBe(true);
    expect(rows[2].sha).toBe('base');
  });
});

describe('buildRemoteCommitsListUrl', () => {
  const parsed = { provider: 'github' as const, host: 'github.com', owner: 'acme', repo: 'app' };

  it('omits sha= when listing without a branch filter', () => {
    const url = buildRemoteCommitsListUrl(
      parsed,
      { provider: 'github', apiBaseUrl: 'https://api.github.com', token: 't' },
      { page: 1, perPage: 30 }
    );
    expect(url).not.toContain('sha=');
  });

  it('scopes GitHub commits with sha=', () => {
    const url = buildRemoteCommitsListUrl(
      parsed,
      { provider: 'github', apiBaseUrl: 'https://api.github.com', token: 't' },
      { page: 1, perPage: 30, branch: 'develop' }
    );
    expect(url).toContain('sha=develop');
    expect(url).toContain('per_page=30');
  });

  it('scopes Bitbucket Cloud commits with include=', () => {
    const url = buildRemoteCommitsListUrl(
      { provider: 'bitbucket', host: 'bitbucket.org', owner: 'ws', repo: 'app', bitbucketKind: 'cloud' },
      {
        provider: 'bitbucket',
        apiBaseUrl: 'https://api.bitbucket.org',
        token: 't',
        bitbucketKind: 'cloud',
      },
      { page: 2, perPage: 50, branch: 'main' }
    );
    expect(url).toContain('include=main');
    expect(url).toContain('pagelen=50');
  });

  it('scopes Bitbucket Server commits with until=', () => {
    const url = buildRemoteCommitsListUrl(
      { provider: 'bitbucket', host: 'git.example.com', owner: 'PRJ', repo: 'app', bitbucketKind: 'server' },
      {
        provider: 'bitbucket',
        apiBaseUrl: 'https://git.example.com',
        token: 't',
        bitbucketKind: 'server',
      },
      { page: 1, perPage: 25, branch: 'release' }
    );
    expect(url).toContain('until=release');
  });
});
