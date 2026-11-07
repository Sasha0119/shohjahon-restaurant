#!/bin/sh
# Creates the database login the API runs as. It can read and change rows, but can't
# change tables, turn off the audit log's protection, or reach other databases.
# POSTGRES_USER stays the owner and is only used to run migrations and the seed.
#
# Runs by itself when the database volume is first created. For an existing database,
# and safe to repeat:
#   docker compose exec db sh /docker-entrypoint-initdb.d/10-app-role.sh
set -eu

psql -v ON_ERROR_STOP=1 -v app_password="$APP_DB_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SELECT 'CREATE ROLE restaurant_app LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'restaurant_app')
\gexec
ALTER ROLE restaurant_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';

REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"DBNAME" TO restaurant_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO restaurant_app;

-- Existing tables, and every table migrations create from now on.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO restaurant_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO restaurant_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO restaurant_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO restaurant_app;
SQL
