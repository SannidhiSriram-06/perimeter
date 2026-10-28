# Local Development Stack

This folder holds the Docker Compose stack for running Perimeter's local
dependencies (currently PostgreSQL) with one command.

## Prerequisites

- Docker Desktop, or Docker Engine with the Compose plugin
- Git clone of this repository

## 1. Create your environment file

From the repository root:

```bash
cp .env.example .env
```

Edit `.env` if you need different ports or credentials. Keep `.env` out of git.

## 2. Start the stack

From the repository root:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml up -d
```

On first start, PostgreSQL runs `deploy/db/init.sql` automatically to create
the schema and seed data. The init script only runs when the data volume is
empty.

Check that the database is healthy:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml ps
```

## 3. Verify the PostgreSQL connection

```bash
docker exec -it perimeter-postgres psql -U perimeter -d perimeter_db
```

Then run a quick check:

```sql
SELECT id, name FROM teams;
```

You should see `team-payments` and `team-core-platform`. Type `\q` to exit.

## 4. Reset the database

Re-running `init.sql` requires an empty volume. This deletes all local data:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml down -v
docker compose --env-file .env -f deploy/docker-compose.yml up -d
```

## 5. Stop the stack

```bash
docker compose --env-file .env -f deploy/docker-compose.yml down
```
