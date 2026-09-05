import {
  detectVcsProviderFromRepoUrl,
  exclusiveApplicationVcsFks,
  nameFromIntegrationUrl,
  parseOwnerRepoFromUrl,
  pickDefaultVcsIntegration,
} from '../../server/utils/vcsIntegrationHelpers';

describe('nameFromIntegrationUrl', () => {
  it('uses hostname from https URL', () => {
    expect(nameFromIntegrationUrl('https://github.com')).toBe('github.com');
    expect(nameFromIntegrationUrl('https://www.github.com/api')).toBe('github.com');
  });

  it('falls back when URL is empty or invalid', () => {
    expect(nameFromIntegrationUrl('')).toBe('Default');
    expect(nameFromIntegrationUrl(null)).toBe('Default');
    expect(nameFromIntegrationUrl('not a url', 'Fallback')).toBe('not a url');
  });
});

describe('detectVcsProviderFromRepoUrl', () => {
  it('detects github and bitbucket hosts', () => {
    expect(detectVcsProviderFromRepoUrl('https://github.com/acme/app')).toBe('github');
    expect(detectVcsProviderFromRepoUrl('https://bitbucket.org/acme/app')).toBe('bitbucket');
  });

  it('detects gitea when host hints exist', () => {
    expect(detectVcsProviderFromRepoUrl('https://gitea.example.com/acme/app')).toBe('gitea');
  });

  it('returns null for unknown hosts', () => {
    expect(detectVcsProviderFromRepoUrl('https://git.company.internal/acme/app')).toBeNull();
    expect(detectVcsProviderFromRepoUrl('')).toBeNull();
  });
});

describe('parseOwnerRepoFromUrl', () => {
  it('parses https and ssh URLs', () => {
    expect(parseOwnerRepoFromUrl('https://github.com/acme/app.git')).toEqual({
      owner: 'acme',
      repo: 'app',
    });
    expect(parseOwnerRepoFromUrl('git@github.com:acme/app.git')).toEqual({
      owner: 'acme',
      repo: 'app',
    });
  });

  it('returns null when owner/repo cannot be parsed', () => {
    expect(parseOwnerRepoFromUrl('https://github.com/')).toBeNull();
    expect(parseOwnerRepoFromUrl('')).toBeNull();
  });
});

describe('pickDefaultVcsIntegration', () => {
  const rows = [
    { Id: 1, IsEnabled: 0, IsDefault: 0 },
    { Id: 2, IsEnabled: 1, IsDefault: 0 },
    { Id: 3, IsEnabled: 1, IsDefault: 1 },
  ];

  it('returns explicit id when present', () => {
    expect(pickDefaultVcsIntegration(rows, 2)?.Id).toBe(2);
  });

  it('prefers IsDefault then first enabled', () => {
    expect(pickDefaultVcsIntegration(rows)?.Id).toBe(3);
    expect(
      pickDefaultVcsIntegration([
        { Id: 10, IsEnabled: 0, IsDefault: 0 },
        { Id: 11, IsEnabled: 1, IsDefault: 0 },
      ])?.Id
    ).toBe(11);
  });

  it('falls back to first row or null', () => {
    expect(pickDefaultVcsIntegration([{ Id: 9, IsEnabled: 0, IsDefault: 0 }])?.Id).toBe(9);
    expect(pickDefaultVcsIntegration([])).toBeNull();
    expect(pickDefaultVcsIntegration(rows, 999)).toBeNull();
  });
});

describe('exclusiveApplicationVcsFks', () => {
  it('allows only one FK and prefers URL provider', () => {
    expect(
      exclusiveApplicationVcsFks({
        githubIntegrationId: 1,
        giteaIntegrationId: 2,
        bitbucketIntegrationId: 3,
        repositoryUrl: 'https://github.com/acme/app',
      })
    ).toEqual({
      GitHubIntegrationId: 1,
      GiteaIntegrationId: null,
      BitbucketIntegrationId: null,
    });
  });

  it('returns all null when none set', () => {
    expect(exclusiveApplicationVcsFks({})).toEqual({
      GitHubIntegrationId: null,
      GiteaIntegrationId: null,
      BitbucketIntegrationId: null,
    });
  });
});
