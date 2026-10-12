-- ============================================================================
-- Project Perimeter — Initial PostgreSQL Relational Schema & Seed Data
-- Sprint 1 Database Initialization
-- ============================================================================

-- Ensure uuid-ossp / pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Users Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(6) PRIMARY KEY,
    role VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    team_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_id_format CHECK (
        (role = 'admin' AND id ~ '^[0-9]{5}$') OR
        (role = 'team_member' AND id ~ '^[0-9]{6}$')
    )
);

-- ----------------------------------------------------------------------------
-- 2. Teams Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

-- Foreign key link for users.team_id after teams table creation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_team_id'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT fk_users_team_id
            FOREIGN KEY (team_id) REFERENCES teams(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Team Members Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(6) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id VARCHAR(50) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    seniority VARCHAR(20) CHECK (seniority IN ('junior', 'mid', 'senior', 'lead')),
    skills TEXT[] DEFAULT '{}',
    telegram_chat_id VARCHAR(50),
    is_on_leave BOOLEAN DEFAULT FALSE,
    on_call_status BOOLEAN DEFAULT FALSE,
    CONSTRAINT uq_team_members_user_team UNIQUE (user_id, team_id)
);

-- ----------------------------------------------------------------------------
-- 4. Services Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owning_team_id VARCHAR(50) REFERENCES teams(id),
    tier VARCHAR(20) DEFAULT 'medium'
);

-- ----------------------------------------------------------------------------
-- 5. Incidents Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    alert_service_id VARCHAR(50) REFERENCES services(id),
    blast_radius JSONB DEFAULT '[]',
    root_cause_draft TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Indexes on frequently queried foreign keys
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_services_owning_team_id ON services(owning_team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_incidents_alert_service_id ON incidents(alert_service_id);

-- ----------------------------------------------------------------------------
-- Seed Data
-- ----------------------------------------------------------------------------

-- Seed Teams: Payments, Core Platform
INSERT INTO teams (id, name, description) VALUES
    ('team-payments', 'Payments', 'Handles payments routing, gateways, and transactions'),
    ('team-core-platform', 'Core Platform', 'Maintains infrastructure, service mesh, and core developer tools')
ON CONFLICT (id) DO NOTHING;

-- Seed Users:
-- 1 admin with 5-digit numeric ID ('10001'), 3 team members with 6-digit numeric IDs ('100101', '100102', '100103')
INSERT INTO users (id, role, name, email, team_id) VALUES
    ('10001', 'admin', 'Alex Admin', 'alex.admin@perimeter.internal', 'team-core-platform'),
    ('100101', 'team_member', 'Dev Dave', 'dave@perimeter.internal', 'team-payments'),
    ('100102', 'team_member', 'Sara Senior', 'sara@perimeter.internal', 'team-payments'),
    ('100103', 'team_member', 'Ken Platform', 'ken@perimeter.internal', 'team-core-platform')
ON CONFLICT (id) DO NOTHING;

-- Seed Team Members (idempotent with UNIQUE(user_id, team_id))
INSERT INTO team_members (user_id, team_id, seniority, skills, telegram_chat_id, is_on_leave, on_call_status) VALUES
    ('100101', 'team-payments', 'mid', ARRAY['python', 'postgresql', 'fastapi'], 'chat_101', FALSE, TRUE),
    ('100102', 'team-payments', 'lead', ARRAY['go', 'distributed-systems', 'payments'], 'chat_102', FALSE, FALSE),
    ('100103', 'team-core-platform', 'senior', ARRAY['kubernetes', 'terraform', 'opentelemetry'], 'chat_103', FALSE, TRUE)
ON CONFLICT (user_id, team_id) DO NOTHING;

-- Seed Sample Services: checkout-service, payment-gateway, inventory-service
INSERT INTO services (id, name, owning_team_id, tier) VALUES
    ('checkout-service', 'Checkout Service', 'team-payments', 'high'),
    ('payment-gateway', 'Payment Gateway', 'team-payments', 'critical'),
    ('inventory-service', 'Inventory Service', 'team-core-platform', 'high')
ON CONFLICT (id) DO NOTHING;
