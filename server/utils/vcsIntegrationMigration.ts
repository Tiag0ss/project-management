import { dbProvider, pool, RowDataPacket } from '../config/database';
import logger from './logger';
import {
  applicationFkColumnForProvider,
  detectVcsProviderFromRepoUrl,
  nameFromIntegrationUrl,
  type VcsProvider,
} from './vcsIntegrationHelpers';

const isMssql = dbProvider === 'mssql';

type VcsTableConfig = {
  provider: VcsProvider;
  tableName: string;
  urlColumn: string;
  tokenColumn: string;
  extraSelectColumns: string[];
  createColumnsSqlMysql: string;
  createColumnsSqlMssql: string;
  insertColumnList: string;
};

const VCS_TABLES: VcsTableConfig[] = [
  {
    provider: 'github',
    tableName: 'OrganizationGitHubIntegrations',
    urlColumn: 'GitHubUrl',
    tokenColumn: 'GitHubToken',
    extraSelectColumns: [],
    createColumnsSqlMysql: `
      Id INT NOT NULL AUTO_INCREMENT,
      OrganizationId INT NOT NULL,
      Name VARCHAR(255) NOT NULL,
      IsEnabled TINYINT(1) NOT NULL DEFAULT 1,
      IsDefault TINYINT(1) NOT NULL DEFAULT 0,
      GitHubUrl VARCHAR(255) NOT NULL,
      GitHubToken VARCHAR(500) NOT NULL,
      CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (Id)
    `,
    createColumnsSqlMssql: `
      Id INT NOT NULL IDENTITY(1,1),
      OrganizationId INT NOT NULL,
      Name NVARCHAR(255) NOT NULL,
      IsEnabled BIT NOT NULL DEFAULT 1,
      IsDefault BIT NOT NULL DEFAULT 0,
      GitHubUrl NVARCHAR(255) NOT NULL,
      GitHubToken NVARCHAR(500) NOT NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_OrganizationGitHubIntegrations PRIMARY KEY (Id)
    `,
    insertColumnList: 'OrganizationId, Name, IsEnabled, IsDefault, GitHubUrl, GitHubToken, CreatedAt, UpdatedAt',
  },
  {
    provider: 'gitea',
    tableName: 'OrganizationGiteaIntegrations',
    urlColumn: 'GiteaUrl',
    tokenColumn: 'GiteaToken',
    extraSelectColumns: [],
    createColumnsSqlMysql: `
      Id INT NOT NULL AUTO_INCREMENT,
      OrganizationId INT NOT NULL,
      Name VARCHAR(255) NOT NULL,
      IsEnabled TINYINT(1) NOT NULL DEFAULT 1,
      IsDefault TINYINT(1) NOT NULL DEFAULT 0,
      GiteaUrl VARCHAR(500) NOT NULL,
      GiteaToken TEXT NOT NULL,
      CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (Id)
    `,
    createColumnsSqlMssql: `
      Id INT NOT NULL IDENTITY(1,1),
      OrganizationId INT NOT NULL,
      Name NVARCHAR(255) NOT NULL,
      IsEnabled BIT NOT NULL DEFAULT 1,
      IsDefault BIT NOT NULL DEFAULT 0,
      GiteaUrl NVARCHAR(500) NOT NULL,
      GiteaToken NVARCHAR(MAX) NOT NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_OrganizationGiteaIntegrations PRIMARY KEY (Id)
    `,
    insertColumnList: 'OrganizationId, Name, IsEnabled, IsDefault, GiteaUrl, GiteaToken, CreatedAt, UpdatedAt',
  },
  {
    provider: 'bitbucket',
    tableName: 'OrganizationBitbucketIntegrations',
    urlColumn: 'BitbucketUrl',
    tokenColumn: 'BitbucketToken',
    extraSelectColumns: ['BitbucketUsername'],
    createColumnsSqlMysql: `
      Id INT NOT NULL AUTO_INCREMENT,
      OrganizationId INT NOT NULL,
      Name VARCHAR(255) NOT NULL,
      IsEnabled TINYINT(1) NOT NULL DEFAULT 1,
      IsDefault TINYINT(1) NOT NULL DEFAULT 0,
      BitbucketUrl VARCHAR(500) NOT NULL,
      BitbucketUsername VARCHAR(255) NULL,
      BitbucketToken TEXT NOT NULL,
      CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (Id)
    `,
    createColumnsSqlMssql: `
      Id INT NOT NULL IDENTITY(1,1),
      OrganizationId INT NOT NULL,
      Name NVARCHAR(255) NOT NULL,
      IsEnabled BIT NOT NULL DEFAULT 1,
      IsDefault BIT NOT NULL DEFAULT 0,
      BitbucketUrl NVARCHAR(500) NOT NULL,
      BitbucketUsername NVARCHAR(255) NULL,
      BitbucketToken NVARCHAR(MAX) NOT NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_OrganizationBitbucketIntegrations PRIMARY KEY (Id)
    `,
    insertColumnList:
      'OrganizationId, Name, IsEnabled, IsDefault, BitbucketUrl, BitbucketUsername, BitbucketToken, CreatedAt, UpdatedAt',
  },
];

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const query = isMssql
      ? `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? AND column_name = ?`
      : `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`;
    const params = isMssql ? ['dbo', tableName, columnName] : [tableName, columnName];
    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const query = isMssql
      ? `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`
      : `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`;
    const params = isMssql ? ['dbo', tableName] : [tableName];
    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function isLegacyVcsTable(tableName: string): Promise<boolean> {
  if (!(await tableExists(tableName))) return false;
  // New shape always has Name; legacy OrganizationId-PK tables do not.
  const hasName = await columnExists(tableName, 'Name');
  return !hasName;
}

async function rebuildVcsTable(cfg: VcsTableConfig): Promise<void> {
  const tempName = `${cfg.tableName}_multi_mig`;
  const q = (name: string) => (isMssql ? `[${name}]` : `\`${name}\``);

  if (await tableExists(tempName)) {
    await pool.execute(`DROP TABLE ${q(tempName)}`);
  }

  const createSql = isMssql
    ? `CREATE TABLE ${q(tempName)} (${cfg.createColumnsSqlMssql})`
    : `CREATE TABLE ${q(tempName)} (${cfg.createColumnsSqlMysql})`;
  await pool.execute(createSql);

  const extra = cfg.extraSelectColumns.length
    ? `, ${cfg.extraSelectColumns.map((c) => q(c)).join(', ')}`
    : '';

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ${q('OrganizationId')}, ${q(cfg.urlColumn)}, ${q(cfg.tokenColumn)},
            ${q('IsEnabled')}, ${q('CreatedAt')}, ${q('UpdatedAt')}${extra}
     FROM ${q(cfg.tableName)}`
  );

  for (const row of rows) {
    const name = nameFromIntegrationUrl(row[cfg.urlColumn] as string);
    if (cfg.provider === 'bitbucket') {
      await pool.execute(
        `INSERT INTO ${q(tempName)} (${cfg.insertColumnList})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.OrganizationId,
          name,
          row.IsEnabled ? 1 : 0,
          1,
          row.BitbucketUrl,
          row.BitbucketUsername ?? null,
          row.BitbucketToken,
          row.CreatedAt,
          row.UpdatedAt,
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO ${q(tempName)} (${cfg.insertColumnList})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.OrganizationId,
          name,
          row.IsEnabled ? 1 : 0,
          1,
          row[cfg.urlColumn],
          row[cfg.tokenColumn],
          row.CreatedAt,
          row.UpdatedAt,
        ]
      );
    }
  }

  await pool.execute(`DROP TABLE ${q(cfg.tableName)}`);

  if (isMssql) {
    await pool.execute(`EXEC sp_rename '${tempName}', '${cfg.tableName}'`);
  } else {
    await pool.execute(`RENAME TABLE ${q(tempName)} TO ${q(cfg.tableName)}`);
  }

  logger.info(`  ✓ Rebuilt ${cfg.tableName} with Id PK (${rows.length} row(s))`);
}

async function backfillApplicationFks(): Promise<void> {
  if (!(await tableExists('Applications'))) return;

  const hasGh = await columnExists('Applications', 'GitHubIntegrationId');
  const hasGt = await columnExists('Applications', 'GiteaIntegrationId');
  const hasBb = await columnExists('Applications', 'BitbucketIntegrationId');
  if (!hasGh && !hasGt && !hasBb) {
    logger.info('  ℹ Application VCS FK columns not present yet; skip backfill');
    return;
  }

  const [apps] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, OrganizationId, RepositoryUrl,
            ${hasGh ? 'GitHubIntegrationId' : 'NULL AS GitHubIntegrationId'},
            ${hasGt ? 'GiteaIntegrationId' : 'NULL AS GiteaIntegrationId'},
            ${hasBb ? 'BitbucketIntegrationId' : 'NULL AS BitbucketIntegrationId'}
     FROM Applications`
  );

  let updated = 0;
  for (const app of apps) {
    const provider = detectVcsProviderFromRepoUrl(app.RepositoryUrl as string | null);
    if (!provider) continue;

    const fkCol = applicationFkColumnForProvider(provider);
    if (provider === 'github' && !hasGh) continue;
    if (provider === 'gitea' && !hasGt) continue;
    if (provider === 'bitbucket' && !hasBb) continue;
    if (app[fkCol] != null) continue;

    const table =
      provider === 'github'
        ? 'OrganizationGitHubIntegrations'
        : provider === 'gitea'
          ? 'OrganizationGiteaIntegrations'
          : 'OrganizationBitbucketIntegrations';

    if (!(await columnExists(table, 'Id'))) continue;

    const [defaults] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM ${table}
       WHERE OrganizationId = ? AND IsDefault = 1
       ORDER BY Id ASC`,
      [app.OrganizationId]
    );
    let integrationId = defaults[0]?.Id as number | undefined;
    if (!integrationId) {
      const [any] = await pool.execute<RowDataPacket[]>(
        `SELECT Id FROM ${table} WHERE OrganizationId = ? ORDER BY Id ASC`,
        [app.OrganizationId]
      );
      integrationId = any[0]?.Id as number | undefined;
    }
    if (!integrationId) continue;

    await pool.execute(`UPDATE Applications SET ${fkCol} = ? WHERE Id = ?`, [integrationId, app.Id]);
    updated += 1;
  }

  if (updated > 0) {
    logger.info(`  ✓ Backfilled ${updated} Application VCS integration FK(s)`);
  }
}

/**
 * Migrate OrganizationGitHub/Gitea/BitbucketIntegrations from OrganizationId PK
 * to multi-instance Id PK. Idempotent. Does not touch Jira.
 */
export async function migrateVcsIntegrationsToMultiInstance(): Promise<void> {
  logger.info('⚡ Running migration: VCS integrations to multi-instance...');

  for (const cfg of VCS_TABLES) {
    try {
      if (!(await isLegacyVcsTable(cfg.tableName))) {
        logger.info(`  ℹ ${cfg.tableName} already multi-instance (or missing)`);
        continue;
      }
      await rebuildVcsTable(cfg);
    } catch (error: any) {
      logger.error(`  ✗ Failed migrating ${cfg.tableName}:`, error);
      throw error;
    }
  }

  await backfillApplicationFks();
  logger.info('✓ Migration complete: VCS multi-instance');
}
