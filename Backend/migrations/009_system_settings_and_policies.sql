-- ============================================================
-- Migration 009: System Settings persistence & Authoritative Policy Docs
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
    key         VARCHAR(80) PRIMARY KEY,
    value       JSONB NOT NULL,
    category    VARCHAR(40) NOT NULL DEFAULT 'general',
    description TEXT,
    updated_by  VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_system_settings_updated ON system_settings;
CREATE TRIGGER trg_system_settings_updated BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

COMMENT ON TABLE system_settings IS 'Cấu hình hệ thống toàn doanh nghiệp (chấm công, OT, thuế TNCN, BHXH, bán kính GPS)';

INSERT INTO system_settings (key, value, category, description) VALUES
  ('late_grace_minutes', '15'::jsonb, 'attendance', 'Thời gian ân hạn đi trễ buổi sáng (phút sau 08:00)'),
  ('standard_shift_morning', '"08:00 - 12:00"'::jsonb, 'attendance', 'Khung giờ ca sáng chuẩn'),
  ('standard_shift_afternoon', '"13:30 - 17:30"'::jsonb, 'attendance', 'Khung giờ ca chiều chuẩn'),
  ('max_ot_per_month', '40'::jsonb, 'attendance', 'Giới hạn số giờ làm thêm tối đa mỗi tháng (Điều 107 BLLĐ)'),
  ('auto_approve_ot', 'false'::jsonb, 'attendance', 'Tự động duyệt OT dưới 2 giờ vào ngày thường'),
  ('personal_income_tax_deduction', '11000000'::jsonb, 'tax_bhxh', 'Mức giảm trừ gia cảnh bản thân người nộp thuế (VNĐ/tháng)'),
  ('dependent_deduction', '4400000'::jsonb, 'tax_bhxh', 'Mức giảm trừ cho mỗi người phụ thuộc (VNĐ/người/tháng)'),
  ('employee_bhxh_rate', '10.5'::jsonb, 'tax_bhxh', 'Tỷ lệ trích đóng BHXH/BHYT/BHTN phần người lao động (%)'),
  ('employer_bhxh_rate', '21.5'::jsonb, 'tax_bhxh', 'Tỷ lệ đóng BHXH/BHYT/BHTN phần doanh nghiệp (%)'),
  ('gps_radius_meters', '250'::jsonb, 'biometrics', 'Bán kính hợp lệ cho phép nhân viên check-in GPS (mét)'),
  ('office_lat', '10.762622'::jsonb, 'biometrics', 'Vĩ độ trụ sở chính NEXUS'),
  ('office_lng', '106.660172'::jsonb, 'biometrics', 'Kinh độ trụ sở chính NEXUS'),
  ('office_name', '"Tòa nhà NEXUS Tower"'::jsonb, 'biometrics', 'Tên địa điểm trụ sở chính'),
  ('face_confidence_threshold', '98'::jsonb, 'biometrics', 'Ngưỡng độ tin cậy chấm công Kiosk (%)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO handbook_docs (id, title, category, content, version, is_active) VALUES
  (
    'HB-POL-01',
    'Quy chế Giờ làm việc, Chấm công GPS & Giải trình (2026)',
    'Chấm công & Giờ làm',
    '1. Khung giờ làm việc hành chính chuẩn: Ca sáng 08:00 - 12:00 (4.0 giờ), Ca chiều 13:30 - 17:30 (4.0 giờ), từ Thứ Hai đến Thứ Sáu.\n2. Thời gian ân hạn đi muộn (Grace Period): 15 phút (check-in sau 08:15 được ghi nhận là DI_MUON).\n3. Chấm công GPS/QR: Nhân viên thực hiện check-in trong bán kính cấu hình của trụ sở hoặc quét mã QR tại Kiosk cổng. Hệ thống kiểm tra tọa độ số học (vĩ độ [-90, 90], kinh độ [-180, 180]).\n4. Đơn giải trình chấm công: Nhân viên gửi đơn giải trình cho các trường hợp đi muộn, về sớm, quên chấm công hoặc công tác ngoài văn phòng. Quản lý trực tiếp hoặc Giám đốc Nhân sự xét duyệt (không tự duyệt đơn của chính mình). Khi đơn giải trình được duyệt (DA_DUYET), bảng công ngày đó được chuẩn hóa về trạng thái Đúng giờ (DUNG_GIO).',
    2,
    TRUE
  ),
  (
    'HB-POL-02',
    'Chính sách Nghỉ phép năm, Nghỉ ốm BHXH (C65) & Quy trình phê duyệt 2 cấp',
    'Nghỉ phép & Chế độ',
    '1. Phép năm hưởng nguyên lương (PHEP_NAM / LT-AL): 12 ngày/năm đối với điều kiện làm việc bình thường.\n2. Nghỉ ốm hưởng BHXH (NGHI_OM / LT-SL): Tối đa 30 ngày/năm có giấy chứng nhận nghỉ việc hưởng BHXH mẫu C65-HD.\n3. Nghỉ việc riêng có hưởng lương (VIEC_RIENG / LT-PL): Tối đa 3 ngày/năm (kết hôn, hiếu hỉ theo Bộ luật Lao động).\n4. Nghỉ không lương (KHONG_LUONG / LT-UL) và Công tác (CONG_TAC / LT-BT).\n5. Quy trình phê duyệt 2 cấp: Đơn của Nhân viên (EMPLOYEE) qua Trưởng phòng duyệt cấp 1 (CHO_TRUONG_PHONG_DUYET -> CHO_HR_PHE_CHUAN) rồi Giám đốc Nhân sự (HR_DIRECTOR) phê chuẩn cấp 2 (DA_PHE_DUYET). Đơn của Trưởng phòng hoặc Giám đốc Nhân sự chuyển trực tiếp tới Tổng Giám đốc (CEO). Ngày nghỉ chỉ tính trên ngày làm việc (không trừ Thứ Bảy, Chủ Nhật và ngày lễ).',
    2,
    TRUE
  ),
  (
    'HB-POL-03',
    'Quy định Tiền lương, Thuế TNCN (Nghị quyết 954/2020) & Trích nộp BHXH bắt buộc',
    'Lương, Thuế & BHXH',
    '1. Công thức lương tháng: Lương theo ngày công = Lương cơ bản hợp đồng * (Số ngày công thực tế / Số ngày công chuẩn trong kỳ). Nếu nhân viên có 0 ngày công thực tế và không có ngày nghỉ hưởng lương hợp lệ, lương theo ngày công bằng 0 VNĐ.\n2. Bảo hiểm bắt buộc phần người lao động: 10.5% lương đóng bảo hiểm (gồm 8% BHXH, 1.5% BHYT, 1% BHTN). Phần doanh nghiệp đóng: 21.5%.\n3. Thuế Thu nhập cá nhân (TNCN): Giảm trừ gia cảnh bản thân 11.000.000 VNĐ/tháng, mỗi người phụ thuộc 4.400.000 VNĐ/tháng (Nghị quyết 954/2020/UBTVQH14), tính theo biểu thuế lũy tiến từng phần từ 5% đến 35%.\n4. Chốt bảng lương: Khi kỳ lương ở trạng thái Đã chốt (DA_CHOT) hoặc Đã chuyển khoản (DA_CHUYEN_KHOAN), số liệu được đóng băng để phục vụ chi trả và đối soát.',
    2,
    TRUE
  ),
  (
    'HB-POL-04',
    'Chính sách Làm thêm giờ (OT) theo Điều 107 Bộ luật Lao động',
    'Làm thêm giờ (OT)',
    '1. Giới hạn giờ làm thêm: Không quá 40 giờ/tháng và không quá 200 giờ/năm (hoặc 300 giờ/năm đối với các ngành nghề đặc thù theo quy định).\n2. Hệ số lương làm thêm giờ: Ngày thường 150%, ngày nghỉ hàng tuần 200%, ngày lễ/Tết 300% đơn giá tiền lương giờ thực trả.\n3. Mọi yêu cầu làm thêm giờ phải có sự đồng ý của người lao động và được cấp thẩm quyền phê duyệt.',
    1,
    TRUE
  ),
  (
    'HB-POL-05',
    'Quy định Đánh giá Hiệu suất 9-Box & Kế hoạch Cải thiện Hiệu suất (PIP)',
    'Đánh giá & Phát triển',
    '1. Ma trận 9-Box Talent Matrix kết hợp Điểm Hiệu suất (Performance 0-100) và Điểm Tiềm năng (Potential 0-100) để phân loại nhân sự vào 9 ô (Ô 1 đến Ô 9).\n2. Nhân sự thuộc nhóm hiệu suất thấp (Ô 1, 2, 4) có thể được Trưởng phòng đề xuất hoặc Giám đốc Nhân sự kích hoạt Kế hoạch Cải thiện Hiệu suất (PIP) với mục tiêu định lượng rõ ràng.',
    1,
    TRUE
  )
ON CONFLICT (id) DO NOTHING;
