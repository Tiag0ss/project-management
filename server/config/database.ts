import mysql from 'mysql2/promise';
import mssql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

type SupportedProvider = 'mysql' | 'mssql';
type QueryParams = any[] | undefined;

export type RowDataPacket = Record<string, any>;

export type ResultSetHeader = {
  affectedRows: number;
  insertId: number;
  changedRows: number;
  warningStatus: number;
  rowsAffected?: number[];
};

type MssqlExecutionPlan = {
  sql: string;
  params: any[];
  ignoreDuplicateOnInsert: boolean;
};

const injectMssqlInsertOutput = (sql: string): string => {
  if (!/^\s*INSERT\s+INTO\s+/i.test(sql)) {
    return sql;
  }

  if (/\bOUTPUT\b/i.test(sql)) {
    return sql;
  }

  const valuesInsertMatch = sql.match(/^(\s*INSERT\s+INTO\s+[\[\]\w.]+\s*\([^)]+\)\s*)(VALUES\s*\()/i);
  if (valuesInsertMatch) {
    return sql.replace(
      /^(\s*INSERT\s+INTO\s+[\[\]\w.]+\s*\([^)]+\)\s*)(VALUES\s*\()/i,
      '$1OUTPUT INSERTED.* $2'
    );
  }

  const selectInsertMatch = sql.match(/^(\s*INSERT\s+INTO\s+[\[\]\w.]+\s*\([^)]+\)\s*)(SELECT\s+)/i);
  if (selectInsertMatch) {
    return sql.replace(
      /^(\s*INSERT\s+INTO\s+[\[\]\w.]+\s*\([^)]+\)\s*)(SELECT\s+)/i,
      '$1OUTPUT INSERTED.* $2'
    );
  }

  return sql;
};

interface DbTransactionConnection {
  execute<T = any>(sql: string, params?: QueryParams): Promise<[T, any]>;
  query<T = any>(sql: string, params?: QueryParams): Promise<[T, any]>;
  escape(value: any): string;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

interface DbPoolLike {
  execute<T = any>(sql: string, params?: QueryParams): Promise<[T, any]>;
  query<T = any>(sql: string, params?: QueryParams): Promise<[T, any]>;
  escape(value: any): string;
  getConnection(): Promise<DbTransactionConnection>;
}

class MySqlConnectionWrapper implements DbTransactionConnection {
  constructor(private readonly connection: mysql.PoolConnection) {}

  execute<T = any>(sql: string, params: QueryParams = []): Promise<[T, any]> {
    return this.connection.execute(sql, params as any) as Promise<[T, any]>;
  }

  query<T = any>(sql: string, params: QueryParams = []): Promise<[T, any]> {
    return this.connection.query(sql, params as any) as Promise<[T, any]>;
  }

  escape(value: any): string {
    return mysql.escape(value);
  }

  async beginTransaction(): Promise<void> {
    await this.connection.beginTransaction();
  }

  async commit(): Promise<void> {
    await this.connection.commit();
  }

  async rollback(): Promise<void> {
    await this.connection.rollback();
  }

  release(): void {
    this.connection.release();
  }
}

class MySqlPoolWrapper implements DbPoolLike {
  private readonly pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'projectmanagement',
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
      queueLimit: 0,
      timezone: 'Z',
      dateStrings: true,
    });
  }

  execute<T = any>(sql: string, params: QueryParams = []): Promise<[T, any]> {
    return this.pool.execute(sql, params as any) as Promise<[T, any]>;
  }

  query<T = any>(sql: string, params: QueryParams = []): Promise<[T, any]> {
    return this.pool.query(sql, params as any) as Promise<[T, any]>;
  }

  escape(value: any): string {
    return mysql.escape(value);
  }

  async getConnection(): Promise<DbTransactionConnection> {
    const connection = await this.pool.getConnection();
    return new MySqlConnectionWrapper(connection);
  }
}

const toMssqlParameterizedQuery = (sql: string, params: QueryParams = []): { sql: string; paramMap: Array<{ name: string; value: any }> } => {
  const values = Array.isArray(params) ? params : [];

  const hasBulkArrayParam = values.some((item) => Array.isArray(item));
  if (hasBulkArrayParam) {
    throw new Error('Bulk array parameters are MySQL-specific. Use provider-specific query logic for MSSQL.');
  }

  let index = 0;
  const paramMap: Array<{ name: string; value: any }> = [];
  const convertedSql = sql.replace(/\?/g, () => {
    const name = `p${index + 1}`;
    const value = values[index];
    paramMap.push({ name, value });
    index += 1;
    return `@${name}`;
  });

  return { sql: convertedSql, paramMap };
};

const adaptSqlForMssql = (inputSql: string, inputParams: QueryParams = []): MssqlExecutionPlan => {
  const params = Array.isArray(inputParams) ? [...inputParams] : [];
  let sql = inputSql;
  let ignoreDuplicateOnInsert = false;
  const isInsert = /^\s*INSERT\s+/i.test(sql);

  if (/^\s*INSERT\s+IGNORE\s+/i.test(sql)) {
    sql = sql.replace(/^\s*INSERT\s+IGNORE\s+/i, 'INSERT ');
    ignoreDuplicateOnInsert = true;
  }

  if (isInsert) {
    sql = injectMssqlInsertOutput(sql);
  }

  sql = sql.replace(/\bWITH\s+RECURSIVE\b/gi, 'WITH');

  sql = sql.replace(
    /DATE_SUB\(\s*CURDATE\(\)\s*,\s*INTERVAL\s*DAYOFWEEK\(CURDATE\(\)\)\s*-\s*1\s*DAY\s*\)/gi,
    'DATEADD(DAY, 1 - DATEPART(WEEKDAY, CAST(GETDATE() AS DATE)), CAST(GETDATE() AS DATE))'
  );

  sql = sql.replace(/\bNOW\(\)/gi, 'GETDATE()');
  sql = sql.replace(/\bCURDATE\(\)/gi, 'CAST(GETDATE() AS DATE)');
  sql = sql.replace(
    /TIMESTAMP\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    "CAST(CONCAT(CONVERT(varchar(10), $1, 23), ' ', CONVERT(varchar(8), $2, 108)) AS datetime2)"
  );
  sql = sql.replace(/DATE_FORMAT\(\s*([^,]+?)\s*,\s*'%Y-%m-%d'\s*\)/gi, 'CONVERT(varchar(10), $1, 23)');
  sql = sql.replace(/DATE_FORMAT\(\s*([^,]+?)\s*,\s*'%Y%m%d'\s*\)/gi, 'CONVERT(varchar(8), $1, 112)');
  sql = sql.replace(/TIMESTAMPDIFF\(\s*MINUTE\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi, 'DATEDIFF(MINUTE, $1, $2)');
  sql = sql.replace(/\bDATE\(\s*([^)]+?)\s*\)/gi, 'CAST($1 AS DATE)');
  sql = sql.replace(
    /GROUP_CONCAT\(\s*DISTINCT\s+([\w.]+)\s+ORDER\s+BY\s+([\w.]+)\s+SEPARATOR\s+'([^']*)'\s*\)/gi,
    "STRING_AGG(DISTINCT $1, '$3') WITHIN GROUP (ORDER BY $2)"
  );

  sql = sql.replace(
    /DATE_SUB\(\s*(GETDATE\(\)|CAST\(GETDATE\(\) AS DATE\))\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi,
    'DATEADD(DAY, -$2, $1)'
  );
  sql = sql.replace(
    /DATE_SUB\(\s*(GETDATE\(\)|CAST\(GETDATE\(\) AS DATE\))\s*,\s*INTERVAL\s+\?\s+DAY\s*\)/gi,
    'DATEADD(DAY, -CAST(? AS INT), $1)'
  );
  sql = sql.replace(
    /([\w.]+)\s+NOT\s+REGEXP\s+'\^\[0-9\]\+\$'/gi,
    'TRY_CONVERT(INT, $1) IS NULL'
  );

  const limitParamMatch = sql.match(/\s+LIMIT\s+\?\s*;?\s*$/i);
  if (limitParamMatch && /^\s*SELECT\s+/i.test(sql)) {
    const rawLimit = params.pop();
    const parsedLimit = Number(rawLimit);
    if (!Number.isNaN(parsedLimit) && Number.isFinite(parsedLimit) && parsedLimit > 0) {
      sql = sql.replace(/\s+LIMIT\s+\?\s*;?\s*$/i, '');
      sql = sql.replace(/^\s*SELECT\s+/i, `SELECT TOP ${Math.floor(parsedLimit)} `);
    } else {
      params.push(rawLimit);
    }
  }

  const limitOffsetParamMatch = sql.match(/\s+LIMIT\s+\?\s+OFFSET\s+\?\s*;?\s*$/i);
  if (limitOffsetParamMatch && /^\s*SELECT\s+/i.test(sql)) {
    const rawOffset = params.pop();
    const rawLimit = params.pop();
    const parsedLimit = Number(rawLimit);
    const parsedOffset = Number(rawOffset);

    if (
      !Number.isNaN(parsedLimit)
      && Number.isFinite(parsedLimit)
      && parsedLimit > 0
      && !Number.isNaN(parsedOffset)
      && Number.isFinite(parsedOffset)
      && parsedOffset >= 0
    ) {
      sql = sql.replace(
        /\s+LIMIT\s+\?\s+OFFSET\s+\?\s*;?\s*$/i,
        ` OFFSET ${Math.floor(parsedOffset)} ROWS FETCH NEXT ${Math.floor(parsedLimit)} ROWS ONLY`
      );
    } else {
      params.push(rawLimit, rawOffset);
    }
  }

  const limitOffsetLiteralMatch = sql.match(/\s+LIMIT\s+(\d+)\s+OFFSET\s+(\d+)\s*;?\s*$/i);
  if (limitOffsetLiteralMatch && /^\s*SELECT\s+/i.test(sql)) {
    const parsedLimit = Number(limitOffsetLiteralMatch[1]);
    const parsedOffset = Number(limitOffsetLiteralMatch[2]);

    if (
      !Number.isNaN(parsedLimit)
      && parsedLimit > 0
      && !Number.isNaN(parsedOffset)
      && parsedOffset >= 0
    ) {
      sql = sql.replace(
        /\s+LIMIT\s+\d+\s+OFFSET\s+\d+\s*;?\s*$/i,
        ` OFFSET ${Math.floor(parsedOffset)} ROWS FETCH NEXT ${Math.floor(parsedLimit)} ROWS ONLY`
      );
    }
  }

  const limitLiteralMatch = sql.match(/\s+LIMIT\s+(\d+)\s*;?\s*$/i);
  if (limitLiteralMatch && /^\s*SELECT\s+/i.test(sql)) {
    const parsedLimit = Number(limitLiteralMatch[1]);
    if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
      sql = sql.replace(/\s+LIMIT\s+\d+\s*;?\s*$/i, '');
      sql = sql.replace(/^\s*SELECT\s+/i, `SELECT TOP ${Math.floor(parsedLimit)} `);
    }
  }

  sql = sql.replace(
    /\(\s*SELECT\s+([\s\S]*?)\s+LIMIT\s+(\d+)\s*\)/gi,
    (_match, selectBody: string, limitLiteral: string) => {
      const parsedLimit = Number(limitLiteral);
      if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
        return `(SELECT ${selectBody})`;
      }
      return `(SELECT TOP ${Math.floor(parsedLimit)} ${selectBody})`;
    }
  );

  return {
    sql,
    params,
    ignoreDuplicateOnInsert,
  };
};

const buildMssqlMeta = (result: mssql.IResult<any>) => {
  const insertedId = (result.recordset && result.recordset[0] && (
    result.recordset[0].insertedId ||
    result.recordset[0].Id ||
    result.recordset[0].id
  )) || 0;

  return {
    affectedRows: result.rowsAffected?.[0] || 0,
    rowsAffected: result.rowsAffected || [],
    insertId: insertedId,
    changedRows: result.rowsAffected?.[0] || 0,
    warningStatus: 0,
  };
};

const isMssqlRowsetQuery = (sql: string): boolean => {
  const normalized = sql.trim().replace(/^;+\s*/, '').toUpperCase();
  return normalized.startsWith('SELECT') || normalized.startsWith('WITH');
};

const mapMssqlResult = <T = any>(sql: string, result: mssql.IResult<any>): [T, any] => {
  const rows = (result.recordset || []) as T;
  const meta = buildMssqlMeta(result);

  if (isMssqlRowsetQuery(sql)) {
    return [rows, meta];
  }

  return [meta as T, undefined];
};

class MsSqlConnectionWrapper implements DbTransactionConnection {
  private hasBegun = false;

  constructor(private readonly transaction: mssql.Transaction) {}

  async execute<T = any>(sql: string, params: QueryParams = []): Promise<[T, any]> {
    const plan = adaptSqlForMssql(sql, params);
    const { sql: convertedSql, paramMap } = toMssqlParameterizedQuery(plan.sql, plan.params);
    const request = new mssql.Request(this.transaction);
    paramMap.forEach((param) => {
      request.input(param.name, param.value as any);
    });
    try {
      const result = await request.query(convertedSql);
      return mapMssqlResult<T>(plan.sql, result);
    } catch (error: any) {
      const duplicateNumber = error?.originalError?.info?.number ?? error?.number;
      if (plan.ignoreDuplicateOnInsert && (duplicateNumber === 2627 || duplicateNumber === 2601)) {
        return [[] as T, { affectedRows: 0, rowsAffected: [0], insertId: 0 }];
      }
      throw error;
    }
  }

  async query<T = any>(sql: string, params: QueryParams = []): Promise<[T, any]> {
    return this.execute<T>(sql, params);
  }

  escape(value: any): string {
    return mysql.escape(value);
  }

  async beginTransaction(): Promise<void> {
    if (!this.hasBegun) {
      await this.transaction.begin();
      this.hasBegun = true;
    }
  }

  async commit(): Promise<void> {
    await this.transaction.commit();
    this.hasBegun = false;
  }

  async rollback(): Promise<void> {
    try {
      if (this.hasBegun) {
        await this.transaction.rollback();
      }
    } catch (error: any) {
      const code = error?.code;
      const message = String(error?.message || '').toLowerCase();
      const alreadyAborted = code === 'EABORT' || message.includes('transaction has been aborted');
      if (!alreadyAborted) {
        throw error;
      }
    } finally {
      this.hasBegun = false;
    }
  }

  release(): void {
    return;
  }
}

class MsSqlPoolWrapper implements DbPoolLike {
  private connectionPool: mssql.ConnectionPool | null = null;
  private connectionPromise: Promise<mssql.ConnectionPool> | null = null;
  private ensureDatabasePromise: Promise<void> | null = null;

  private getCommonConfig(): Omit<mssql.config, 'database'> {
    return {
      server: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'sa',
      password: process.env.DB_PASSWORD || '',
      port: Number(process.env.DB_PORT || 1433),
      options: {
        encrypt: String(process.env.DB_ENCRYPT || 'false').toLowerCase() === 'true',
        trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERT || 'true').toLowerCase() === 'true',
      },
      pool: {
        max: Number(process.env.DB_CONNECTION_LIMIT || 10),
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };
  }

  private async ensureDatabaseExists(): Promise<void> {
    if (this.ensureDatabasePromise) {
      return this.ensureDatabasePromise;
    }

    this.ensureDatabasePromise = (async () => {
      const targetDatabase = process.env.DB_NAME || 'projectmanagement';
      const literalDatabaseName = targetDatabase.replace(/'/g, "''");
      const bracketDatabaseName = targetDatabase.replace(/]/g, ']]');

      const bootstrapConfig: mssql.config = {
        ...this.getCommonConfig(),
        database: 'master',
      };

      const bootstrapPool = new mssql.ConnectionPool(bootstrapConfig);
      try {
        await bootstrapPool.connect();
        await bootstrapPool
          .request()
          .query(`IF DB_ID(N'${literalDatabaseName}') IS NULL BEGIN EXEC('CREATE DATABASE [${bracketDatabaseName}]') END`);
      } finally {
        try {
          await bootstrapPool.close();
        } catch {
          return;
        }
      }
    })();

    try {
      await this.ensureDatabasePromise;
    } catch (error) {
      this.ensureDatabasePromise = null;
      throw error;
    }
  }

  private async getPool(): Promise<mssql.ConnectionPool> {
    if (this.connectionPool) {
      return this.connectionPool;
    }

    if (!this.connectionPromise) {
      this.connectionPromise = (async () => {
        await this.ensureDatabaseExists();

        const config: mssql.config = {
          ...this.getCommonConfig(),
          database: process.env.DB_NAME || 'projectmanagement',
        };

        return new mssql.ConnectionPool(config).connect();
      })().catch((error) => {
        this.connectionPromise = null;
        throw error;
      });
    }

    this.connectionPool = await this.connectionPromise;
    return this.connectionPool;
  }

  async execute<T = any>(sql: string, params: QueryParams = []): Promise<[T, any]> {
    const pool = await this.getPool();
    const plan = adaptSqlForMssql(sql, params);
    const { sql: convertedSql, paramMap } = toMssqlParameterizedQuery(plan.sql, plan.params);
    const request = pool.request();
    paramMap.forEach((param) => {
      request.input(param.name, param.value as any);
    });
    try {
      const result = await request.query(convertedSql);
      return mapMssqlResult<T>(plan.sql, result);
    } catch (error: any) {
      const duplicateNumber = error?.originalError?.info?.number ?? error?.number;
      if (plan.ignoreDuplicateOnInsert && (duplicateNumber === 2627 || duplicateNumber === 2601)) {
        return [[] as T, { affectedRows: 0, rowsAffected: [0], insertId: 0 }];
      }
      throw error;
    }
  }

  async query<T = any>(sql: string, params: QueryParams = []): Promise<[T, any]> {
    return this.execute<T>(sql, params);
  }

  escape(value: any): string {
    return mysql.escape(value);
  }

  async getConnection(): Promise<DbTransactionConnection> {
    const pool = await this.getPool();
    const transaction = new mssql.Transaction(pool);
    const connection = new MsSqlConnectionWrapper(transaction);
    await connection.beginTransaction();
    return connection;
  }
}

const provider = (String(process.env.DB_PROVIDER || 'mysql').toLowerCase() === 'mssql'
  ? 'mssql'
  : 'mysql') as SupportedProvider;

export const dbProvider: SupportedProvider = provider;

export const pool: DbPoolLike = provider === 'mssql'
  ? new MsSqlPoolWrapper()
  : new MySqlPoolWrapper();

export const db = pool;

export async function testConnection() {
  try {
    if (provider === 'mssql') {
      await pool.execute('SELECT 1 as ok');
    } else {
      const connection = await pool.getConnection();
      connection.release();
    }

    console.log(`✓ Database connected successfully (${provider})`);
    return true;
  } catch (error) {
    console.error(`✗ Database connection failed (${provider}):`, error);
    return false;
  }
}
