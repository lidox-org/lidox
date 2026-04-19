from app.db import execute


MIGRATIONS: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      ai_budget_cents INT NOT NULL DEFAULT 10000,
      ai_budget_used_cents INT NOT NULL DEFAULT 0,
      ai_retention_days INT NOT NULL DEFAULT 30
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255),
      name VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(2048),
      org_id UUID REFERENCES organizations(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(500) NOT NULL,
      owner_id UUID NOT NULL REFERENCES users(id),
      ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS document_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id),
      snapshot TEXT,
      crdt_clock INT NOT NULL,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id),
      user_id UUID REFERENCES users(id),
      link_token VARCHAR(255),
      role VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_interactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id),
      user_id UUID NOT NULL REFERENCES users(id),
      task_type VARCHAR(50) NOT NULL,
      input_tokens INT NOT NULL,
      output_tokens INT NOT NULL,
      model_used VARCHAR(100) NOT NULL,
      cost_cents INT NOT NULL,
      status VARCHAR(20) NOT NULL,
      source_text_hash VARCHAR(128),
      source_text TEXT,
      proposal_text TEXT,
      source_state_vector TEXT,
      applied_text TEXT,
      stale_at_review BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    ALTER TABLE ai_interactions
    ADD COLUMN IF NOT EXISTS source_text TEXT,
    ADD COLUMN IF NOT EXISTS proposal_text TEXT,
    ADD COLUMN IF NOT EXISTS source_state_vector TEXT,
    ADD COLUMN IF NOT EXISTS applied_text TEXT,
    ADD COLUMN IF NOT EXISTS stale_at_review BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    """,
    """
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      token_hash VARCHAR(255) NOT NULL,
      family_id UUID NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE
    );
    """,
)


async def run_migrations() -> None:
    for statement in MIGRATIONS:
        await execute(statement)

