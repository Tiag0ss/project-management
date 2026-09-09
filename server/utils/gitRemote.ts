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
  /** Parent commit SHAs (first parent is the mainline; 2+ means merge). */
  parents: string[];
}

export interface NormalizedBranch {
  name: string;
  isDefault: boolean;
}

export interface ListBranchesResult {
  branches: NormalizedBranch[];
  defaultBranch: string | null;
  provider: GitProvider;
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
  /** Ref used for the listing (default branch when omitted by caller). */
  branch: string | null;
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
 * When multiple instances exist, prefer explicit integration ids, then host match,
 * then IsDefault / first enabled.
 */
export async function resolveGitCredentials(
  organizationId: number,
  parsed: ParsedRepo,
  opts?: {
    githubIntegrationId?: number | null;
    giteaIntegrationId?: number | null;
    bitbucketIntegrationId?: number | null;
  }
): Promise<GitCredentials | null> {
  const [ghRows] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, GitHubUrl, GitHubToken, IsDefault FROM OrganizationGitHubIntegrations
     WHERE OrganizationId = ? AND IsEnabled = 1
     ORDER BY IsDefault DESC, Id ASC`,
    [organizationId]
  );
  const [giteaRows] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, GiteaUrl, GiteaToken, IsDefault FROM OrganizationGiteaIntegrations
     WHERE OrganizationId = ? AND IsEnabled = 1
     ORDER BY IsDefault DESC, Id ASC`,
    [organizationId]
  );
  const [bbRows] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, BitbucketUrl, BitbucketToken, BitbucketUsername, IsDefault FROM OrganizationBitbucketIntegrations
     WHERE OrganizationId = ? AND IsEnabled = 1
     ORDER BY IsDefault DESC, Id ASC`,
    [organizationId]
  );

  const pickById = (rows: RowDataPacket[], id?: number | null): RowDataPacket | undefined =>
    id ? rows.find((r) => Number(r.Id) === Number(id)) : undefined;

  const pickByHost = (rows: RowDataPacket[], urlField: string): RowDataPacket | undefined => {
    for (const row of rows) {
      const h = hostnameOf(String(row[urlField]));
      if (
        h &&
        (parsed.host === h ||
          parsed.host.replace(/^api\./, '') === h.replace(/^api\./, '') ||
          parsed.host.includes(h) ||
          h.includes(parsed.host))
      ) {
        return row;
      }
    }
    return undefined;
  };

  const isGithubHost =
    parsed.provider === 'github' ||
    parsed.host.includes('github') ||
    ghRows.some((r) => {
      const ghHost = hostnameOf(String(r.GitHubUrl));
      return (
        ghHost != null &&
        (parsed.host === ghHost ||
          parsed.host.replace(/^api\./, '') === ghHost.replace(/^api\./, ''))
      );
    });

  if (isGithubHost && ghRows.length > 0) {
    const row =
      pickById(ghRows, opts?.githubIntegrationId) ||
      pickByHost(ghRows, 'GitHubUrl') ||
      ghRows[0];
    return {
      provider: 'github',
      apiBaseUrl: String(row.GitHubUrl).replace(/\/$/, ''),
      token: decrypt(row.GitHubToken),
    };
  }

  const bbHostCandidates = bbRows.map((r) => hostnameOf(String(r.BitbucketUrl)));
  const isBitbucketCloudHost =
    parsed.bitbucketKind === 'cloud' || parsed.host.includes('bitbucket.org');
  const isBitbucketServerHost = bbHostCandidates.some(
    (bbHost) => bbHost != null && parsed.host === bbHost && !isBitbucketCloudHost
  );
  const isBitbucket =
    parsed.provider === 'bitbucket' || isBitbucketCloudHost || isBitbucketServerHost;

  if (isBitbucket && bbRows.length > 0) {
    const row =
      pickById(bbRows, opts?.bitbucketIntegrationId) ||
      pickByHost(bbRows, 'BitbucketUrl') ||
      bbRows[0];
    const bbHost = hostnameOf(String(row.BitbucketUrl));
    const cloud =
      isBitbucketCloudHost ||
      (bbHost != null && (bbHost.includes('bitbucket.org') || bbHost === 'api.bitbucket.org'));
    return {
      provider: 'bitbucket',
      apiBaseUrl: String(row.BitbucketUrl).replace(/\/$/, ''),
      token: decrypt(row.BitbucketToken),
      username: row.BitbucketUsername || null,
      bitbucketKind: cloud ? 'cloud' : 'server',
    };
  }

  if (giteaRows.length > 0) {
    const row =
      pickById(giteaRows, opts?.giteaIntegrationId) ||
      pickByHost(giteaRows, 'GiteaUrl') ||
      (parsed.provider === 'gitea' ? giteaRows[0] : undefined);
    if (row) {
      return {
        provider: 'gitea',
        apiBaseUrl: String(row.GiteaUrl).replace(/\/$/, ''),
        token: decrypt(row.GiteaToken),
      };
    }
  }

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
       WHERE OrganizationId = ? AND IsEnabled = 1
       ORDER BY IsDefault DESC, Id ASC`,
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
       WHERE OrganizationId = ? AND IsEnabled = 1
       ORDER BY IsDefault DESC, Id ASC`,
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

/** Build provider commits list URL (exported for unit tests). */
export function buildRemoteCommitsListUrl(
  parsed: ParsedRepo,
  creds: GitCredentials,
  options: { page: number; perPage: number; branch?: string | null }
): string {
  const { page, perPage } = options;
  const branch = typeof options.branch === 'string' ? options.branch.trim() : '';
  const owner = encodeURIComponent(parsed.owner);
  const repo = encodeURIComponent(parsed.repo);

  if (creds.provider === 'github') {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (branch) params.set('sha', branch);
    return `${creds.apiBaseUrl}/repos/${owner}/${repo}/commits?${params}`;
  }

  if (creds.provider === 'gitea') {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(perPage),
    });
    if (branch) params.set('sha', branch);
    return `${creds.apiBaseUrl}/api/v1/repos/${owner}/${repo}/commits?${params}`;
  }

  if (creds.bitbucketKind === 'cloud') {
    const params = new URLSearchParams({
      page: String(page),
      pagelen: String(perPage),
    });
    // Without include=, Bitbucket returns commits across all branches.
    if (branch) params.set('include', branch);
    return `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/commits?${params}`;
  }

  // Bitbucket Server / DC
  const params = new URLSearchParams({
    start: String((page - 1) * perPage),
    limit: String(perPage),
  });
  if (branch) params.set('until', branch);
  return `${creds.apiBaseUrl}/rest/api/1.0/projects/${owner}/repos/${repo}/commits?${params}`;
}

function parentShasFromGithubLike(parents: unknown): string[] {
  if (!Array.isArray(parents)) return [];
  return parents
    .map((p) => {
      if (!p || typeof p !== 'object') return '';
      const sha = (p as { sha?: string }).sha;
      return typeof sha === 'string' ? sha : '';
    })
    .filter(Boolean);
}

async function fetchDefaultBranchName(
  parsed: ParsedRepo,
  creds: GitCredentials
): Promise<string | null> {
  const headers = authHeaders(creds);
  const owner = encodeURIComponent(parsed.owner);
  const repo = encodeURIComponent(parsed.repo);

  try {
    if (creds.provider === 'github') {
      const res = await fetch(`${creds.apiBaseUrl}/repos/${owner}/${repo}`, { headers });
      if (!res.ok) return null;
      const body = await res.json();
      return typeof body?.default_branch === 'string' ? body.default_branch : null;
    }
    if (creds.provider === 'gitea') {
      const res = await fetch(`${creds.apiBaseUrl}/api/v1/repos/${owner}/${repo}`, { headers });
      if (!res.ok) return null;
      const body = await res.json();
      return typeof body?.default_branch === 'string' ? body.default_branch : null;
    }
    if (creds.bitbucketKind === 'cloud') {
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}`,
        { headers }
      );
      if (!res.ok) return null;
      const body = await res.json();
      const name = body?.mainbranch?.name;
      return typeof name === 'string' ? name : null;
    }
    const res = await fetch(
      `${creds.apiBaseUrl}/rest/api/1.0/projects/${owner}/repos/${repo}/branches/default`,
      { headers }
    );
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.displayId === 'string'
      ? body.displayId
      : typeof body?.id === 'string'
        ? String(body.id).replace(/^refs\/heads\//, '')
        : null;
  } catch (error) {
    logger.error('fetchDefaultBranchName failed:', creds.provider, error);
    return null;
  }
}

export async function listRemoteBranches(
  parsed: ParsedRepo,
  creds: GitCredentials,
  options: { limit?: number } = {}
): Promise<ListBranchesResult> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 100));
  const headers = authHeaders(creds);
  const owner = encodeURIComponent(parsed.owner);
  const repo = encodeURIComponent(parsed.repo);
  const defaultBranch = await fetchDefaultBranchName(parsed, creds);

  let names: string[] = [];

  if (creds.provider === 'github') {
    const res = await fetch(
      `${creds.apiBaseUrl}/repos/${owner}/${repo}/branches?per_page=${limit}&page=1`,
      { headers }
    );
    if (!res.ok) {
      const errorText = await res.text();
      logger.error('listRemoteBranches failed:', creds.provider, res.status, errorText);
      throw new Error(`Failed to list branches (${res.status}): ${res.statusText}`);
    }
    const body = await res.json();
    const list = Array.isArray(body) ? body : [];
    names = list
      .map((b: { name?: string }) => (typeof b?.name === 'string' ? b.name : ''))
      .filter(Boolean);
  } else if (creds.provider === 'gitea') {
    const res = await fetch(
      `${creds.apiBaseUrl}/api/v1/repos/${owner}/${repo}/branches?limit=${limit}&page=1`,
      { headers }
    );
    if (!res.ok) {
      const errorText = await res.text();
      logger.error('listRemoteBranches failed:', creds.provider, res.status, errorText);
      throw new Error(`Failed to list branches (${res.status}): ${res.statusText}`);
    }
    const body = await res.json();
    const list = Array.isArray(body) ? body : [];
    names = list
      .map((b: { name?: string }) => (typeof b?.name === 'string' ? b.name : ''))
      .filter(Boolean);
  } else if (creds.bitbucketKind === 'cloud') {
    const res = await fetch(
      `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/refs/branches?pagelen=${limit}`,
      { headers }
    );
    if (!res.ok) {
      const errorText = await res.text();
      logger.error('listRemoteBranches failed:', creds.provider, res.status, errorText);
      if (res.status === 401) {
        throw new Error(
          'Bitbucket Cloud authentication failed (401). Use your Atlassian account email and an API token with repository read scopes — app passwords are discontinued.'
        );
      }
      throw new Error(`Failed to list branches (${res.status}): ${res.statusText}`);
    }
    const body = await res.json();
    const values = Array.isArray(body.values) ? body.values : [];
    names = values
      .map((b: { name?: string }) => (typeof b?.name === 'string' ? b.name : ''))
      .filter(Boolean);
  } else {
    const res = await fetch(
      `${creds.apiBaseUrl}/rest/api/1.0/projects/${owner}/repos/${repo}/branches?limit=${limit}&start=0`,
      { headers }
    );
    if (!res.ok) {
      const errorText = await res.text();
      logger.error('listRemoteBranches failed:', creds.provider, res.status, errorText);
      throw new Error(`Failed to list branches (${res.status}): ${res.statusText}`);
    }
    const body = await res.json();
    const values = Array.isArray(body.values) ? body.values : [];
    names = values
      .map((b: { displayId?: string; id?: string }) => {
        if (typeof b?.displayId === 'string') return b.displayId;
        if (typeof b?.id === 'string') return b.id.replace(/^refs\/heads\//, '');
        return '';
      })
      .filter(Boolean);
  }

  const unique = Array.from(new Set(names));
  if (defaultBranch && !unique.includes(defaultBranch)) {
    unique.unshift(defaultBranch);
  }

  const branches: NormalizedBranch[] = unique.map((name) => ({
    name,
    isDefault: Boolean(defaultBranch && name === defaultBranch),
  }));

  if (!defaultBranch && branches.length > 0) {
    branches[0] = { ...branches[0], isDefault: true };
  }

  branches.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    branches,
    defaultBranch: defaultBranch || branches.find((b) => b.isDefault)?.name || null,
    provider: creds.provider,
  };
}

export async function listRemoteCommits(
  parsed: ParsedRepo,
  creds: GitCredentials,
  options: { page?: number; perPage?: number; branch?: string | null } = {}
): Promise<ListCommitsResult> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 30));
  const headers = authHeaders(creds);

  let branch = typeof options.branch === 'string' ? options.branch.trim() : '';
  if (!branch) {
    branch = (await fetchDefaultBranchName(parsed, creds)) || '';
  }

  const fetchUrl = buildRemoteCommitsListUrl(parsed, creds, { page, perPage, branch: branch || null });

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
      parents?: Array<{ sha?: string }>;
    }) => ({
      sha: c.sha || '',
      message: c.commit?.message || '',
      author: c.commit?.author?.name || c.author?.login || '',
      date: c.commit?.author?.date || c.commit?.committer?.date || '',
      url: c.html_url || '',
      parents: parentShasFromGithubLike(c.parents),
    }));
    hasMore = list.length >= perPage;
  } else if (creds.provider === 'gitea') {
    const list = Array.isArray(body) ? body : [];
    commits = list.map((c: {
      sha?: string;
      commit?: { message?: string; author?: { name?: string; date?: string } };
      html_url?: string;
      author?: { login?: string; username?: string };
      parents?: Array<{ sha?: string }>;
    }) => ({
      sha: c.sha || '',
      message: c.commit?.message || '',
      author: c.commit?.author?.name || c.author?.login || c.author?.username || '',
      date: c.commit?.author?.date || '',
      url: c.html_url || '',
      parents: parentShasFromGithubLike(c.parents),
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
      parents?: Array<{ hash?: string }>;
    }) => ({
      sha: c.hash || '',
      message: c.message || '',
      author: c.author?.user?.display_name || c.author?.raw || '',
      date: c.date || '',
      url: c.links?.html?.href || '',
      parents: Array.isArray(c.parents)
        ? c.parents.map((p) => p?.hash || '').filter(Boolean)
        : [],
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
      parents?: Array<{ id?: string }>;
    }) => ({
      sha: c.id || c.displayId || '',
      message: c.message || '',
      author: c.author?.displayName || c.author?.name || '',
      date: c.authorTimestamp ? new Date(c.authorTimestamp).toISOString() : '',
      url: c.links?.self?.[0]?.href || '',
      parents: Array.isArray(c.parents)
        ? c.parents.map((p) => p?.id || '').filter(Boolean)
        : [],
    }));
    hasMore = body.isLastPage === false || values.length >= perPage;
  }

  return { commits, hasMore, provider: creds.provider, branch: branch || null };
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
  let branch: string | null = null;

  for (let page = 1; page <= maxPages; page++) {
    const result = await listRemoteCommits(parsed, creds, { page, perPage });
    provider = result.provider;
    branch = result.branch;
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

  return { commits: matched, hasMore: lastHasMore, provider, branch };
}
