/**
 * Pure helpers for VCS multi-instance migration and resolution.
 */

export type VcsProvider = 'github' | 'gitea' | 'bitbucket';

/** Derive a display name from an integration base URL. */
export function nameFromIntegrationUrl(url: string | null | undefined, fallback = 'Default'): string {
  if (!url || !String(url).trim()) return fallback;
  try {
    const host = new URL(String(url).trim()).hostname.replace(/^www\./i, '');
    return host || fallback;
  } catch {
    const cleaned = String(url).replace(/^https?:\/\//i, '').split('/')[0]?.trim();
    return cleaned || fallback;
  }
}

/** Detect which VCS provider a repository URL likely belongs to. */
export function detectVcsProviderFromRepoUrl(repoUrl: string | null | undefined): VcsProvider | null {
  if (!repoUrl || !String(repoUrl).trim()) return null;
  const lower = String(repoUrl).toLowerCase();
  if (lower.includes('github.com') || lower.includes('github.')) return 'github';
  if (lower.includes('bitbucket.org') || lower.includes('bitbucket.')) return 'bitbucket';
  if (lower.includes('gitea.') || lower.includes('/gitea')) return 'gitea';
  // Self-hosted Gitea often has no distinctive host — leave null for manual assignment
  return null;
}

/** Parse owner/repo from a git HTTPS/SSH repository URL. */
export function parseOwnerRepoFromUrl(repoUrl: string | null | undefined): { owner: string; repo: string } | null {
  if (!repoUrl || !String(repoUrl).trim()) return null;
  const raw = String(repoUrl).trim();

  // git@host:owner/repo.git
  const sshMatch = raw.match(/^git@[^:]+:([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2].replace(/\.git$/i, '') };
  }

  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const parts = u.pathname.replace(/^\/+/, '').replace(/\.git$/i, '').split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  } catch {
    // fall through
  }

  const pathMatch = raw.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (pathMatch) {
    return { owner: pathMatch[1], repo: pathMatch[2].replace(/\.git$/i, '') };
  }

  return null;
}

export function applicationFkColumnForProvider(provider: VcsProvider): string {
  if (provider === 'github') return 'GitHubIntegrationId';
  if (provider === 'gitea') return 'GiteaIntegrationId';
  return 'BitbucketIntegrationId';
}

export type ExclusiveVcsFks = {
  GitHubIntegrationId: number | null;
  GiteaIntegrationId: number | null;
  BitbucketIntegrationId: number | null;
};

/**
 * An application has one RepositoryUrl, so at most one VCS integration FK may be set.
 * If several are provided, keep the one matching the repo URL host, else the first set.
 */
export function exclusiveApplicationVcsFks(input: {
  githubIntegrationId?: number | null;
  giteaIntegrationId?: number | null;
  bitbucketIntegrationId?: number | null;
  repositoryUrl?: string | null;
}): ExclusiveVcsFks {
  const candidates: { provider: VcsProvider; id: number }[] = [];
  const gh = Number(input.githubIntegrationId);
  const gt = Number(input.giteaIntegrationId);
  const bb = Number(input.bitbucketIntegrationId);
  if (Number.isFinite(gh) && gh > 0) candidates.push({ provider: 'github', id: gh });
  if (Number.isFinite(gt) && gt > 0) candidates.push({ provider: 'gitea', id: gt });
  if (Number.isFinite(bb) && bb > 0) candidates.push({ provider: 'bitbucket', id: bb });

  const empty: ExclusiveVcsFks = {
    GitHubIntegrationId: null,
    GiteaIntegrationId: null,
    BitbucketIntegrationId: null,
  };
  if (candidates.length === 0) return empty;

  const detected = detectVcsProviderFromRepoUrl(input.repositoryUrl);
  const chosen =
    (detected && candidates.find((c) => c.provider === detected)) || candidates[0];

  return {
    GitHubIntegrationId: chosen.provider === 'github' ? chosen.id : null,
    GiteaIntegrationId: chosen.provider === 'gitea' ? chosen.id : null,
    BitbucketIntegrationId: chosen.provider === 'bitbucket' ? chosen.id : null,
  };
}

export type VcsIntegrationCandidate = {
  Id: number;
  IsEnabled?: number | boolean;
  IsDefault?: number | boolean;
};

/**
 * Pure resolution order matching resolveVcsIntegration (without DB):
 * explicit id → IsDefault → first enabled → first row.
 */
export function pickDefaultVcsIntegration<T extends VcsIntegrationCandidate>(
  rows: T[],
  integrationId?: number | null
): T | null {
  if (!rows.length) return null;
  if (integrationId) {
    const exact = rows.find((r) => Number(r.Id) === Number(integrationId));
    return exact || null;
  }
  const defaults = rows.filter((r) => Number(r.IsDefault) === 1);
  if (defaults[0]) return defaults[0];
  const enabled = rows.filter((r) => Number(r.IsEnabled) === 1);
  if (enabled[0]) return enabled[0];
  return rows[0] || null;
}
