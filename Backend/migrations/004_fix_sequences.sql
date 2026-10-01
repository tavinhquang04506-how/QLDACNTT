-- Seed data inserted rows with explicit ids (e.g. payroll_periods 1 and 2) without advancing the serial
-- sequences, so the first row created through the API collided with a seed row. Move every serial sequence
-- past the highest existing id.
DO $$
DECLARE
    r RECORD;
    seq TEXT;
BEGIN
    FOR r IN
        SELECT table_name FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'id' AND column_default LIKE 'nextval(%'
    LOOP
        seq := pg_get_serial_sequence(quote_ident(r.table_name), 'id');
        IF seq IS NOT NULL THEN
            EXECUTE format(
                'SELECT setval(%L, GREATEST((SELECT COALESCE(MAX(id), 0) FROM %I), 1), (SELECT COALESCE(MAX(id), 0) FROM %I) > 0)',
                seq, r.table_name, r.table_name);
        END IF;
    END LOOP;
END $$;
