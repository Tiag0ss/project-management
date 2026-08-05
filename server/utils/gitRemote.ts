import { RowDataPacket } from '../config/database';
import { pool } from '../config/database';
import { decrypt } from './encryption';
import logger from './logger';

export type GitProvider = 'github' | 'gitea' | 'bitbucket';

export interface ParsedRepo {
  provider: GitProvider;
  /** Hostname from repository URL (lowercase) */
  host: string;
  /** Owner, workspace, or Bitbucket Server project key */
  owner: string;
  repo: string;
  bitbucketKind?: 'cloud' | 'server';
}

export interface NormalizedCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitCredentials {
  provider: GitProvider;
  apiBaseUrl: string;
  token: string;
  username?: string | null;
  bitbucketKind?: 'cloud' | 'server';
}

export interface ListCommitsResult {
  commits: NormalizedCommit[];
  hasMore: boolean;
  provider: GitProvider;
}

function stripGitSuffix(name: string): string {
  return name.replace(/\.git$/i, '');
}

function hostnameOf(urlOrHost: string): string | null {
  try {
    if (urlOrHost.includes('://')) {
      return new URL(urlOrHost).hostname.toLowerCase();
    }
    return urlOrHost.split('/')[0].toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Parse a free-form repository URL into provider + owner/repo (or workspace/repo).
 */
export function parseRepositoryUrl(rawUrl: string): ParsedRepo | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let input = rawUrl.trim();
  if (!input) return null;

  // git@host:owner/repo.git
  const sshMatch = input.match(/^git@([^:]+):(.+)$/i);
  if (sshMatch) {
    input = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  if (!/^https?:\/\//i.test(input)) {
    input = `https://${input}`;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2) return null;

  // Bitbucket Server: /scm/{projectKey}/{repo}.git or /projects/{key}/repos/{slug}
  if (parts[0] === 'scm' && parts.length >= 3) {
    return {
      provider: 'bitbucket',
      host,
      owner: parts[1],
      repo: stripGitSuffix(parts[2]),
      bitbucketKind: host.includes('bitbucket.org') ? 'cloud' : 'server',
    };
  }
  if (parts[0] === 'projects' && parts[2] === 'repos' && parts.length >= 4) {
    return {
      provider: 'bitbucket',
      host,
      owner: parts[1],
      repo: stripGitSuffix(parts[3]),
      bitbucketKind: 'server',
    };
  }

  const owner = parts[0];
  const repo = stripGitSuffix(parts[1]);

  if (host === 'github.com' || host === 'www.github.com' || host.endsWith('.github.com')) {
    return { provider: 'github', host, owner, repo };
  }

  if (host === 'bitbucket.org' || host === 'www.bitbucket.org' || host === 'api.bitbucket.org') {
    return { provider: 'bitbucket', host, owner, repo, bitbucketKind: 'cloud' };
  }

  // Unknown host: treat as gitea-like by default; resolver may remap to bitbucket server / GH enterprise
  return { provider: 'gitea', host, owner, repo };
}

export function commitMatchesTask(
  message: string,
  taskId: number,
  gitHubIssueNumber?: number | null,
  giteaIssueNumber?: number | null
): boolean {
  if (!message) return false;
  const text = message;

  const taskIdPattern = new RegExp(`\\bTask\\s*#?\\s*${taskId}\\b`, 'i');
  if (taskIdPattern.test(text)) return true;

  if (gitHubIssueNumber != null && Number(gitHubIssueNumber) > 0) {
    const n = Number(gitHubIssueNumber);
    const issuePattern = new RegExp(`(?:^|[\\s(#])#${n}\\b`);
    if (issuePattern.test(text)) return true;
  }

  if (giteaIssueNumber != null && Number(giteaIssueNumber) > 0) {
    const n = Number(giteaIssueNumber);
    const issuePattern = new RegExp(`(?:^|[\\s(#])#${n}\\b`);
    if (issuePattern.test(text)) return true;
  }

  return false;
}

function authHeaders(creds: GitCredentials): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (creds.provider === 'github') {
    headers.Authorization = `Bearer ${creds.token}`;
    headers.Accept = 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    return headers;
  }
  if (creds.provider === 'gitea') {
    headers.Authorization = `token ${creds.token}`;
    return headers;
  }
  // Bitbucket Cloud REST requires Basic auth with Atlassian account email + API token.
  // App passwords are deprecated; Bearer-only auth is not supported for Cloud API tokens.
  if (creds.bitbucketKind === 'cloud') {
    const user = (creds.username || '').trim();
    if (!user) {
      throw new Error(
        'Bitbucket Cloud requires your Atlassian account email as username, plus an API token (app passwords are discontinued).'
      );
    }
    headers.Authorization = `Basic ${Buffer.from(`${user}:${creds.token}`).toString('base64')}`;
    return headers;
  }
  headers.Authorization = `Bearer ${creds.token}`;
  return headers;
}

/** Build Authorization header for Bitbucket Cloud (email + API token) or Server (Bearer PAT). */
export function bitbucketAuthHeader(opts: {
  kind: 'cloud' | 'server';
  token: string;
  username?: string | null;
}): Record<string, string> {
  return authHeaders({
    provider: 'bitbucket',
    apiBaseUrl: '',
    token: opts.token,
    username: opts.username,
    bitbucketKind: opts.kind,
  });
}

/**
 * Resolve org integration credentials for a parsed repo.
 */
export async function resolveGitCredentials(
  organizationId: number,
  parsed: ParsedRepo
): Promise<GitCredentials | null> {
  const [ghRows] = await pool.execute<RowDataPacket[]>(
    `SELECT GitHubUrl, GitHubToken FROM OrganizationGitHubIntegrations
     WHERE OrganizationId = ? AND IsEnabled = 1`,
    [organizationId]
  );
  const [giteaRows] = await pool.execute<RowDataPacket[]>(
    `SELECT GiteaUrl, GiteaToken FROM OrganizationGiteaIntegrations
     WHERE OrganizationId = ? AND IsEnabled = 1`,
    [organizationId]
  );
  const [bbRows] = await pool.execute<RowDataPacket[]>(
    `SELECT BitbucketUrl, BitbucketToken, BitbucketUsername FROM OrganizationBitbucketIntegrations
     WHERE OrganizationId = ? AND IsEnabled = 1`,
    [organizationId]
  );

  const ghHost = ghRows.length ? hostnameOf(String(ghRows[0].GitHubUrl)) : null;
  const giteaHost = giteaRows.length ? hostnameOf(String(giteaRows[0].GiteaUrl)) : null;
  const bbHost = bbRows.length ? hostnameOf(String(bbRows[0].BitbucketUrl)) : null;

  const isGithubHost =
    parsed.provider === 'github' ||
    parsed.host.includes('github') ||
    (ghHost != null &&
      (parsed.host === ghHost ||
        parsed.host.replace(/^api\./, '') === ghHost.replace(/^api\./, '')));

  if (isGithubHost && ghRows.length > 0) {
    return {
      provider: 'github',
      apiBaseUrl: String(ghRows[0].GitHubUrl).replace(/\/$/, ''),
      token: decrypt(ghRows[0].GitHubToken),
    };
  }

  const isBitbucketCloudHost =
    parsed.bitbucketKind === 'cloud' || parsed.host.includes('bitbucket.org');
  const isBitbucketServerHost =
    bbHost != null && parsed.host === bbHost && !isBitbucketCloudHost;
  const isBitbucket =
    parsed.provider === 'bitbucket' || isBitbucketCloudHost || isBitbucketServerHost;

  if (isBitbucket && bbRows.length > 0) {
    const cloud =
      isBitbucketCloudHost ||
      (bbHost != null && (bbHost.includes('bitbucket.org') || bbHost === 'api.bitbucket.org'));
    return {
      provider: 'bitbucket',
      apiBaseUrl: String(bbRows[0].BitbucketUrl).replace(/\/$/, ''),
      token: decrypt(bbRows[0].BitbucketToken),
      username: bbRows[0].BitbucketUsername || null,
      bitbucketKind: cloud ? 'cloud' : 'server',
    };
  }

  if (giteaRows.length > 0 && giteaHost && parsed.host === giteaHost) {
    return {
      provider: 'gitea',
      apiBaseUrl: String(giteaRows[0].GiteaUrl).replace(/\/$/, ''),
      token: decrypt(giteaRows[0].GiteaToken),
    };
  }

  // Unknown self-hosted URL classified as gitea: use Gitea integration when host matches only
  return null;
}

/**
 * Resolve credentials when project has explicit GitHub/Gitea owner/repo (no URL parse).
 */
export async function resolveProjectRepoCredentials(
  organizationId: number,
  opts: {
    gitHubOwner?: string | null;
    gitHubRepo?: string | null;
    giteaOwner?: string | null;
    giteaRepo?: string | null;
  }
): Promise<{ parsed: ParsedRepo; creds: GitCredentials } | null> {
  if (opts.gitHubOwner && opts.gitHubRepo) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT GitHubUrl, GitHubToken FROM OrganizationGitHubIntegrations
       WHERE OrganizationId = ? AND IsEnabled = 1`,
      [organizationId]
    );
    if (rows.length > 0) {
      const parsed: ParsedRepo = {
        provider: 'github',
        host: 'github.com',
        owner: opts.gitHubOwner,
        repo: opts.gitHubRepo,
      };
      return {
        parsed,
        creds: {
          provider: 'github',
          apiBaseUrl: String(rows[0].GitHubUrl).replace(/\/$/, ''),
          token: decrypt(rows[0].GitHubToken),
        },
      };
    }
  }

  if (opts.giteaOwner && opts.giteaRepo) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT GiteaUrl, GiteaToken FROM OrganizationGiteaIntegrations
       WHERE OrganizationId = ? AND IsEnabled = 1`,
      [organizationId]
    );
    if (rows.length > 0) {
      const giteaUrl = String(rows[0].GiteaUrl).replace(/\/$/, '');
      const host = hostnameOf(giteaUrl) || 'gitea';
      const parsed: ParsedRepo = {
        provider: 'gitea',
        host,
        owner: opts.giteaOwner,
        repo: opts.giteaRepo,
      };
      return {
        parsed,
        creds: {
          provider: 'gitea',
          apiBaseUrl: giteaUrl,
          token: decrypt(rows[0].GiteaToken),
        },
      };
    }
  }

  return null;
}

export async function listRemoteCommits(
  parsed: ParsedRepo,
  creds: GitCredentials,
  options: { page?: number; perPage?: number } = {}
): Promise<ListCommitsResult> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 30));
  const headers = authHeaders(creds);

  let fetchUrl: string;
  if (creds.provider === 'github') {
    fetchUrl = `${creds.apiBaseUrl}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/commits?page=${page}&per_page=${perPage}`;
  } else if (creds.provider === 'gitea') {
    fetchUrl = `${creds.apiBaseUrl}/api/v1/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/commits?page=${page}&limit=${perPage}`;
  } else if (creds.bitbucketKind === 'cloud') {
    fetchUrl = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/commits?page=${page}&pagelen=${perPage}`;
  } else {
    // Bitbucket Server / DC
    fetchUrl = `${creds.apiBaseUrl}/rest/api/1.0/projects/${encodeURIComponent(parsed.owner)}/repos/${encodeURIComponent(parsed.repo)}/commits?start=${(page - 1) * perPage}&limit=${perPage}`;
  }

  const response = await fetch(fetchUrl, { method: 'GET', headers });
  if (!response.ok) {
    const errorText = await response.text();
    logger.error('listRemoteCommits failed:', creds.provider, response.status, errorText);
    if (creds.provider === 'bitbucket' && creds.bitbucketKind === 'cloud' && response.status === 401) {
      throw new Error(
        'Bitbucket Cloud authentication failed (401). Use your Atlassian account email and an API token with repository read scopes — app passwords are discontinued.'
      );
    }
    throw new Error(`Failed to list commits (${response.status}): ${response.statusText}`);
  }

  const body = await response.json();
  let commits: NormalizedCommit[] = [];
  let hasMore = false;

  if (creds.provider === 'github') {
    const list = Array.isArray(body) ? body : [];
    commits = list.map((c: {
      sha?: string;
      commit?: { message?: string; author?: { name?: string; date?: string }; committer?: { date?: string } };
      html_url?: string;
      author?: { login?: string };
    }) => ({
      sha: c.sha || '',
      message: c.commit?.message || '',
      author: c.commit?.author?.name || c.author?.login || '',
      date: c.commit?.author?.date || c.commit?.committer?.date || '',
      url: c.html_url || '',
    }));
    hasMore = list.length >= perPage;
  } else if (creds.provider === 'gitea') {
    const list = Array.isArray(body) ? body : [];
    commits = list.map((c: {
      sha?: string;
      commit?: { message?: string; author?: { name?: string; date?: string } };
      html_url?: string;
      author?: { login?: string; username?: string };
    }) => ({
      sha: c.sha || '',
      message: c.commit?.message || '',
      author: c.commit?.author?.name || c.author?.login || c.author?.username || '',
      date: c.commit?.author?.date || '',
      url: c.html_url || '',
    }));
    hasMore = list.length >= perPage;
  } else if (creds.bitbucketKind === 'cloud') {
    const values = Array.isArray(body.values) ? body.values : [];
    commits = values.map((c: {
      hash?: string;
      message?: string;
      date?: string;
      author?: { raw?: string; user?: { display_name?: string } };
      links?: { html?: { href?: string } };
    }) => ({
      sha: c.hash || '',
      message: c.message || '',
      author: c.author?.user?.display_name || c.author?.raw || '',
      date: c.date || '',
      url: c.links?.html?.href || '',
    }));
    hasMore = Boolean(body.next) || values.length >= perPage;
  } else {
    const values = Array.isArray(body.values) ? body.values : [];
    commits = values.map((c: {
      id?: string;
      displayId?: string;
      message?: string;
      authorTimestamp?: number;
      author?: { name?: string; displayName?: string };
      links?: { self?: Array<{ href?: string }> };
    }) => ({
      sha: c.id || c.displayId || '',
      message: c.message || '',
      author: c.author?.displayName || c.author?.name || '',
      date: c.authorTimestamp ? new Date(c.authorTimestamp).toISOString() : '',
      url: c.links?.self?.[0]?.href || '',
    }));
    hasMore = body.isLastPage === false || values.length >= perPage;
  }

  return { commits, hasMore, provider: creds.provider };
}

/**
 * Fetch several pages and keep commits matching a task.
 */
export async function listCommitsForTask(
  parsed: ParsedRepo,
  creds: GitCredentials,
  taskId: number,
  gitHubIssueNumber?: number | null,
  giteaIssueNumber?: number | null,
  options: { maxPages?: number; perPage?: number } = {}
): Promise<ListCommitsResult> {
  const maxPages = options.maxPages ?? 5;
  const perPage = options.perPage ?? 100;
  const matched: NormalizedCommit[] = [];
  let lastHasMore = false;
  let provider = creds.provider;

  for (let page = 1; page <= maxPages; page++) {
    const result = await listRemoteCommits(parsed, creds, { page, perPage });
    provider = result.provider;
    lastHasMore = result.hasMore;
    for (const c of result.commits) {
      if (commitMatchesTask(c.message, taskId, gitHubIssueNumber, giteaIssueNumber)) {
        matched.push(c);
      }
    }
    if (!result.hasMore) {
      lastHasMore = false;
      break;
    }
  }

  return { commits: matched, hasMore: lastHasMore, provider };
}
