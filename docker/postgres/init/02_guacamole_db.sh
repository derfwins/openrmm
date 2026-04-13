#!/bin/bash
# Initialize Guacamole database schema
# This script generates the Guacamole schema SQL from the Guacamole container

set -e

echo "Initializing Guacamole database..."

# Wait for PostgreSQL to be ready
until pg_isready -h postgres -U openrmm; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

# Create guacamole_db database
psql -h postgres -U openrmm -d postgres -c "SELECT 'CREATE DATABASE guacamole_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'guacamole_db');" | grep -q "CREATE DATABASE" && psql -h postgres -U openrmm -d postgres -c "CREATE DATABASE guacamole_db;" || echo "Database already exists"

echo "Guacamole database initialized."