-- fn_calc_attendance used to overwrite the status on every insert/update that had a check-in time, so a status
-- chosen by HR (business trip, holiday, paid leave...) was silently lost. It now only decides between the two
-- automatic statuses; any other status is kept. Late minutes are still measured against 08:00 company time.
CREATE OR REPLACE FUNCTION fn_calc_attendance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
        NEW.work_hours = ROUND(EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0, 2);
        IF NEW.work_hours > 8.0 THEN
            NEW.ot_hours = ROUND(NEW.work_hours - 8.0, 2);
        ELSE
            NEW.ot_hours = 0;
        END IF;
    END IF;

    IF NEW.check_in_time IS NOT NULL THEN
        DECLARE
            checkin_time TIME := NEW.check_in_time::TIME;
            standard_time TIME := '08:00:00';
        BEGIN
            IF checkin_time > standard_time THEN
                NEW.late_minutes = EXTRACT(EPOCH FROM (checkin_time - standard_time)) / 60;
                IF NEW.late_minutes > 0 AND NEW.status IN ('DUNG_GIO', 'DI_MUON') THEN
                    NEW.status = 'DI_MUON';
                END IF;
            ELSE
                NEW.late_minutes = 0;
                IF NEW.status IN ('DUNG_GIO', 'DI_MUON') THEN
                    NEW.status = 'DUNG_GIO';
                END IF;
            END IF;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_calculate_payslip(VARCHAR, VARCHAR) IS
    'DEPRECATED: flat 5% tax and no insurance ceilings. Payroll is calculated by Backend/src/modules/payroll/tax.js';
