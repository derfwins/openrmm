-- Guacamole database initialization
-- Run as part of PostgreSQL init

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create guacamole database if not exists
-- (Guacamole will handle schema creation on first boot)
SELECT 'CREATE DATABASE guacamole_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'guacamole_db')\gexec

-- Grant access to guacamole user
GRANT ALL PRIVILEGES ON DATABASE guacamole_db TO openrmm;