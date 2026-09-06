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
      GitHubToken TEXT NOT NULL,
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
      GitHubToken NVARCHAR(MAX) NOT NULL,
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

async function getPrimaryKeyColumns(tableName: string): Promise<string[]> {
  try {
    const query = isMssql
      ? `SELECT c.name AS COLUMN_NAME
         FROM sys.indexes i
         INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
         INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
         INNER JOIN sys.tables t ON i.object_id = t.object_id
         WHERE i.is_primary_key = 1 AND t.name = ?
         ORDER BY ic.key_ordinal`
      : `SELECT COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
         ORDER BY ORDINAL_POSITION`;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [tableName]);
    return rows.map((row) => String(row.COLUMN_NAME || ''));
  } catch {
    return [];
  }
}

/** Pure helper for tests: true when table still uses OrganizationId as identity/PK. */
export function needsVcsMultiInstanceRebuild(meta: {
  tableExists: boolean;
  hasIdColumn: boolean;
  primaryKeyColumns: string[];
}): boolean {
  if (!meta.tableExists) return false;
  if (!meta.hasIdColumn) return true;
  const pk = meta.primaryKeyColumns.map((col) => col.toLowerCase());
  if (pk.length === 0) return true;
  if (!pk.includes('id')) return true;
  if (pk.length === 1 && pk[0] === 'organizationid') return true;
  return false;
}

async function shouldRebuildVcsTable(tableName: string): Promise<boolean> {
  if (!(await tableExists(tableName))) return false;
  const hasIdColumn = await columnExists(tableName, 'Id');
  const primaryKeyColumns = await getPrimaryKeyColumns(tableName);
  return needsVcsMultiInstanceRebuild({ tableExists: true, hasIdColumn, primaryKeyColumns });
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

  const hasName = await columnExists(cfg.tableName, 'Name');
  const hasIsDefault = await columnExists(cfg.tableName, 'IsDefault');
  const extra = cfg.extraSelectColumns.length
    ? `, ${cfg.extraSelectColumns.map((c) => q(c)).join(', ')}`
    : '';
  const nameSelect = hasName ? `, ${q('Name')}` : '';
  const defaultSelect = hasIsDefault ? `, ${q('IsDefault')}` : '';

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ${q('OrganizationId')}, ${q(cfg.urlColumn)}, ${q(cfg.tokenColumn)},
            ${q('IsEnabled')}, ${q('CreatedAt')}, ${q('UpdatedAt')}${nameSelect}${defaultSelect}${extra}
     FROM ${q(cfg.tableName)}`
  );

  for (const row of rows) {
    const existingName = hasName ? String(row.Name || '').trim() : '';
    const name = existingName || nameFromIntegrationUrl(row[cfg.urlColumn] as string);
    const isDefault = hasIsDefault ? (row.IsDefault ? 1 : 0) : 1;

    if (cfg.provider === 'bitbucket') {
      await pool.execute(
        `INSERT INTO ${q(tempName)} (${cfg.insertColumnList})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.OrganizationId,
          name,
          row.IsEnabled ? 1 : 0,
          isDefault,
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
          isDefault,
          row[cfg.urlColumn],
          row[cfg.tokenColumn],
          row.CreatedAt,
          row.UpdatedAt,
        ]
      );
    }
  }

  // Ensure at least one default per organization when all were 0
  const [orgIds] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT ${q('OrganizationId')} AS OrganizationId FROM ${q(tempName)}`
  );
  for (const org of orgIds) {
    const [defaults] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM ${q(tempName)}
       WHERE ${q('OrganizationId')} = ? AND ${q('IsDefault')} = 1
       ORDER BY Id ASC`,
      [org.OrganizationId]
    );
    if (defaults.length > 0) continue;
    const [first] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM ${q(tempName)} WHERE ${q('OrganizationId')} = ? ORDER BY Id ASC`,
      [org.OrganizationId]
    );
    if (first[0]?.Id != null) {
      await pool.execute(`UPDATE ${q(tempName)} SET ${q('IsDefault')} = 1 WHERE ${q('Id')} = ?`, [
        first[0].Id,
      ]);
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
 *
 * Also rebuilds hybrid tables where schema sync added Name/IsDefault but left
 * OrganizationId as the primary key (no usable Id identity column).
 */
export async function migrateVcsIntegrationsToMultiInstance(): Promise<void> {
  logger.info('⚡ Running migration: VCS integrations to multi-instance...');

  for (const cfg of VCS_TABLES) {
    try {
      if (!(await shouldRebuildVcsTable(cfg.tableName))) {
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
