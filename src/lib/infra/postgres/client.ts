import postgres from "postgres";

let _sql: postgres.Sql | undefined;

/**
 * Returns the singleton PostgreSQL client instance connected to Neon.
 * Connection pooling is configured with automatic SSL enforcement.
 */
export function getPostgresClient(): postgres.Sql {
  if (_sql) return _sql;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL environment variable for Neon PostgreSQL driver. " +
        "Please set DATABASE_URL in your environment or set DATA_REPOSITORY_DRIVER=supabase.",
    );
  }

  _sql = postgres(connectionString, {
    ssl: connectionString.includes("localhost") ? false : "require",
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return _sql;
}

export type DbClient = postgres.Sql | postgres.TransactionSql;

/**
 * Executes a callback within an isolated PostgreSQL transaction.
 */
export async function withTransaction<T>(callback: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = getPostgresClient();
  return (sql.begin as unknown as (cb: (tx: postgres.Sql) => Promise<T>) => Promise<T>)(callback);
}
