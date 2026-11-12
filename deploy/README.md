# Local Development Stack

This folder holds the Docker Compose stack for running Perimeter locally with
one command: PostgreSQL, the correlation engine (port 8000) and the BFF (port 3001).
All ports are bound to 127.0.0.1 only.

## Prerequisites

- Docker Desktop, or Docker Engine with the Compose plugin
- Git clone of this repository

## 1. Create your environment file

From the repository root:

```bash
cp .env.example .env
```

Edit `.env` if you need different ports or credentials. Keep `.env` out of git and run `chmod 600 .env`. Set `GROQ_API_KEY` if you want root-cause drafts (without it incidents are still stored, with no draft).

## 2. Start the stack

From the repository root:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

This builds and starts three containers: `perimeter-postgres` (5432), `perimeter-engine` (8000) and `perimeter-bff` (3001). `./scripts/demo.sh` does the same, then posts one alert and prints the stored incident. Both reuse the existing database volume, so they add rows to any data already there.

On first start, PostgreSQL runs `deploy/db/init.sql` automatically to create
the schema and seed data. The seed is for development only: all four demo users share the password `perimeter-dev`. The init script only runs when the data volume is
empty, and there are no migrations yet, so any schema change needs the reset below.

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
