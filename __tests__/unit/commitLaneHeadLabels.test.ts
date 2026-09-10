import { layoutCommitGraph } from '../../lib/git/commitGraphLayout';
import { decorateLaneHeadBranchNames } from '../../lib/git/commitLaneHeadLabels';

describe('decorateLaneHeadBranchNames', () => {
  it('puts the merged branch name on the newest commit of the incoming lane', () => {
    const commits = [
      { sha: 'merge', parents: ['main1', 'feat1'], mergedFrom: ['feature/login'], branches: ['main'] },
      { sha: 'feat1', parents: ['main0'], branches: [] as string[] },
      { sha: 'main1', parents: ['main0'], branches: [] as string[] },
      { sha: 'main0', parents: [] as string[], branches: [] as string[] },
    ];
    const rows = layoutCommitGraph(commits);
    const names = decorateLaneHeadBranchNames(commits, rows);
    const featIndex = commits.findIndex((c) => c.sha === 'feat1');
    expect(names[featIndex]).toEqual(['feature/login']);
    expect(names[0]).toEqual(['main']);
  });

  it('does not overwrite an existing tip label', () => {
    const commits = [
      { sha: 'merge', parents: ['main1', 'feat1'], mergedFrom: ['feature/login'], branches: ['main'] },
      { sha: 'feat1', parents: ['main0'], branches: ['feature/login'] },
      { sha: 'main1', parents: ['main0'], branches: [] as string[] },
      { sha: 'main0', parents: [] as string[], branches: [] as string[] },
    ];
    const rows = layoutCommitGraph(commits);
    const names = decorateLaneHeadBranchNames(commits, rows);
    const featIndex = commits.findIndex((c) => c.sha === 'feat1');
    expect(names[featIndex]).toEqual(['feature/login']);
  });
});
