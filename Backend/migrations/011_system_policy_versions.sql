-- Migration 011: Versioned System Policy History for Payroll & Attendance (R09)

CREATE TABLE IF NOT EXISTS system_policy_versions (
    id SERIAL PRIMARY KEY,
    effective_from VARCHAR(7) NOT NULL UNIQUE CHECK (effective_from ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    policy JSONB NOT NULL,
    created_by VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_policy_versions_effective
    ON system_policy_versions (effective_from DESC);

INSERT INTO system_policy_versions (effective_from, policy)
SELECT
    COALESCE(
        (SELECT value #>> '{}' FROM system_settings WHERE key = 'policy_effective_from'),
        '2020-01'
    ),
    jsonb_object_agg(key, value)
FROM system_settings
ON CONFLICT (effective_from) DO NOTHING;
