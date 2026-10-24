'use strict';

function formatDateVi(isoDateStr = '') {
  const s = String(isoDateStr || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s || 'Chưa xác định';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatVnd(value) {
  if (value === null || value === undefined || value === '') {
    return 'Chưa có dữ liệu';
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 'Chưa có dữ liệu';
  }
  const rounded = Math.round(num);
  const formatted = new Intl.NumberFormat('vi-VN').format(Math.abs(rounded));
  if (rounded < 0) {
    return `-${formatted} ₫`;
  }
  return `${formatted} ₫`;
}

function formatSignedVndDelta(delta) {
  if (delta === null || delta === undefined || !Number.isFinite(Number(delta))) {
    return 'Chưa có dữ liệu';
  }
  const rounded = Math.round(Number(delta));
  const formatted = new Intl.NumberFormat('vi-VN').format(Math.abs(rounded));
  if (rounded > 0) return `+${formatted} ₫ (tăng)`;
  if (rounded < 0) return `-${formatted} ₫ (giảm)`;
  return '0 ₫ (không đổi)';
}

function formatNumberVi(value, unit = '') {
  if (value === null || value === undefined || value === '') {
    return 'Chưa có dữ liệu';
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 'Chưa có dữ liệu';
  }
  const str = Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
  return unit ? `${str} ${unit}` : str;
}

function translatePeriodStatusVi(status = '') {
  const code = String(status || '').toUpperCase();
  if (code === 'DA_CHOT') return 'Đã chốt bảng lương';
  if (code === 'DA_CHUYEN_KHOAN' || code === 'DA_CHI') return 'Đã chuyển khoản chi trả';
  if (code === 'DU_THAO') return 'Dự thảo (chưa công bố)';
  return status || 'Chưa xác định';
}

function translateSettingKeyVi(key = '') {
  const map = {
    standard_work_days: 'Số ngày công chuẩn trong tháng',
    attendance_max_radius_m: 'Bán kính chấm công GPS tối đa (mét)',
    personal_deduction: 'Mức giảm trừ gia cảnh bản thân',
    dependent_deduction: 'Mức giảm trừ người phụ thuộc',
    default_allowances: 'Phụ cấp mặc định',
    insurance_cap_salary: 'Mức trần lương đóng BHXH/BHYT',
    ot_rate_weekday: 'Hệ số lương làm thêm ngày thường (%)',
    ot_rate_weekend: 'Hệ số lương làm thêm cuối tuần (%)',
    ot_rate_holiday: 'Hệ số lương làm thêm ngày lễ (%)',
    policy_effective_from: 'Kỳ hiệu lực chính sách',
  };
  return map[key] || key;
}

/**
 * Compute deterministic server-side delta between two published payslips of the same employee.
 * Never allows the LLM to do mental math on salary numbers.
 */
function computePayslipComparison(firstPayslipEv, secondPayslipEv) {
  if (!firstPayslipEv || !secondPayslipEv) return null;
  const pA = String(firstPayslipEv.period?.period || '');
  const pB = String(secondPayslipEv.period?.period || '');
  const [earlier, later] = pA <= pB ? [firstPayslipEv, secondPayslipEv] : [secondPayslipEv, firstPayslipEv];

  const fEarly = earlier.fields || {};
  const fLate = later.fields || {};
  const periodEarly = earlier.period?.period;
  const periodLate = later.period?.period;

  const metricDefs = [
    { key: 'netSalary', label: 'Lương thực lĩnh (Net)', unit: 'VND' },
    { key: 'grossIncome', label: 'Tổng thu nhập (Gross)', unit: 'VND' },
    { key: 'baseSalary', label: 'Lương cơ bản hợp đồng', unit: 'VND' },
    { key: 'actualWorkDays', label: 'Số ngày công thực tế', unit: 'ngày' },
    { key: 'workDaysSalary', label: 'Lương theo ngày công', unit: 'VND' },
    { key: 'totalAllowances', label: 'Tổng phụ cấp', unit: 'VND' },
    { key: 'bonus', label: 'Thưởng trong kỳ', unit: 'VND' },
    { key: 'otPay', label: 'Lương làm thêm giờ (OT)', unit: 'VND' },
    { key: 'totalDeductions', label: 'Tổng các khoản khấu trừ', unit: 'VND' },
    { key: 'pitAmount', label: 'Thuế TNCN (PIT)', unit: 'VND' },
  ];

  const deltas = {};
  const changedComponents = [];
  const calculationClaims = [];

  for (const def of metricDefs) {
    const valEarly = Number(fEarly[def.key] ?? 0);
    const valLate = Number(fLate[def.key] ?? 0);
    const diff = Number((valLate - valEarly).toFixed(2));
    deltas[def.key] = {
      label: def.label,
      unit: def.unit,
      earlierPeriod: periodEarly,
      laterPeriod: periodLate,
      earlierValue: valEarly,
      laterValue: valLate,
      delta: diff,
    };
    if (diff !== 0 && def.key !== 'netSalary' && def.key !== 'grossIncome') {
      changedComponents.push(deltas[def.key]);
    }
    calculationClaims.push({
      sourceId: `${earlier.sourceId || 'payslip'}+${later.sourceId || 'payslip'}`,
      tool: 'get_my_payslip',
      entity: { employeeId: earlier.entity?.employeeId },
      period: { fromPeriod: periodEarly, toPeriod: periodLate },
      field: `${def.key}Delta`,
      value: diff,
      unit: def.unit,
      operands: [valEarly, valLate],
      formula: `${periodLate}.${def.key} - ${periodEarly}.${def.key}`,
      roundingRule: def.unit === 'VND' ? 'integer_vnd' : 'decimal_2',
    });
  }

  return {
    earlierPeriod: periodEarly,
    laterPeriod: periodLate,
    earlierSourceId: earlier.sourceId,
    laterSourceId: later.sourceId,
    deltas,
    changedComponents,
    calculationClaims,
  };
}

/**
 * Build structured Vietnamese `answerSections` and calculation claims from verified tool evidence
 * and raw tool results (including empty/unpublished states).
 */
function buildAnswerSectionsAndClaims({
  intent = 'answer',
  structuredEvidence = [],
  rawToolResults = [],
  toolsUsed = [],
}) {
  const sections = [];
  const extraVerifiedClaims = [];

  // 1. Leave Balance Sections
  const leaveEvs = structuredEvidence.filter((e) => e.tool === 'get_my_leave_balance');
  for (const ev of leaveEvs) {
    const year = ev.period?.year;
    const balances = ev.fields?.balances || [];
    const sourceRefs = ev.sourceId ? [ev.sourceId] : [];
    const summaryLines = balances.map((b) => {
      const typeName = b.leaveTypeName || b.leaveTypeCode || 'Nghỉ phép';
      return `${typeName} (năm ${year}): còn lại ${formatNumberVi(b.remaining, 'ngày')}, khả dụng thực tế ${formatNumberVi(b.available, 'ngày')}.`;
    });

    sections.push({
      type: 'summary',
      title: `Tóm tắt quỹ phép năm ${year}`,
      text: summaryLines.join(' '),
      items: balances.map((b) => ({
        label: `${b.leaveTypeName || b.leaveTypeCode} (${year})`,
        value: `Còn lại ${formatNumberVi(b.remaining, 'ngày')} | Khả dụng ${formatNumberVi(b.available, 'ngày')}`,
      })),
      claimRefs: balances.map((b) => `leave:${b.leaveTypeCode}:remaining`),
      sourceRefs,
      verified: true,
    });

    sections.push({
      type: 'facts',
      title: 'Chi tiết theo loại phép',
      text: balances
        .map(
          (b) =>
            `${b.leaveTypeName || b.leaveTypeCode}: Tổng định mức ${formatNumberVi(b.entitlement, 'ngày')}, Đã nghỉ ${formatNumberVi(b.used, 'ngày')}, Đang chờ duyệt ${formatNumberVi(b.pending, 'ngày')}, Còn lại ${formatNumberVi(b.remaining, 'ngày')}, Khả dụng ${formatNumberVi(b.available, 'ngày')}.`
        )
        .join('\n'),
      items: balances.flatMap((b) => [
        { label: `${b.leaveTypeName || b.leaveTypeCode} — Tổng định mức`, value: formatNumberVi(b.entitlement, 'ngày') },
        { label: `${b.leaveTypeName || b.leaveTypeCode} — Đã sử dụng`, value: formatNumberVi(b.used, 'ngày') },
        { label: `${b.leaveTypeName || b.leaveTypeCode} — Đơn đang chờ duyệt`, value: formatNumberVi(b.pending, 'ngày') },
        { label: `${b.leaveTypeName || b.leaveTypeCode} — Số dư còn lại`, value: formatNumberVi(b.remaining, 'ngày') },
        { label: `${b.leaveTypeName || b.leaveTypeCode} — Số dư khả dụng`, value: formatNumberVi(b.available, 'ngày') },
      ]),
      claimRefs: balances.map((b) => `leave:${b.leaveTypeCode}:facts`),
      sourceRefs,
      verified: true,
    });

    const calcTexts = balances.map((b) => {
      const baseCalc = `${b.leaveTypeName || b.leaveTypeCode}: Định mức (${b.entitlement}) - Đã dùng (${b.used}) = Còn lại (${b.remaining} ngày).`;
      if (Number(b.pending) > 0) {
        return `${baseCalc} Do có ${b.pending} ngày đang chờ phê duyệt nên số ngày khả dụng có thể đăng ký mới là ${b.remaining} - ${b.pending} = ${b.available} ngày.`;
      }
      return `${baseCalc} Không có đơn chờ duyệt (0 ngày) nên số ngày khả dụng bằng ${b.available} ngày.`;
    });

    sections.push({
      type: 'calculation',
      title: 'Cách tính số dư & khả dụng',
      text: calcTexts.join('\n'),
      items: [],
      claimRefs: balances.map((b) => `leave:${b.leaveTypeCode}:calculation`),
      sourceRefs,
      verified: true,
    });
  }

  // Handle empty leave record (hasRecord === false)
  for (let i = 0; i < rawToolResults.length; i += 1) {
    const tr = rawToolResults[i];
    const tName = toolsUsed[i]?.name;
    if (tName === 'get_my_leave_balance' && tr?.ok === true && tr.hasRecord === false) {
      sections.push({
        type: 'limitations',
        title: `Chưa có bản ghi quỹ phép năm ${tr.year}`,
        text: `Hệ thống chưa ghi nhận bản ghi quỹ phép cho năm ${tr.year}. Hệ thống giữ nguyên trạng thái trống và không tự gán mức mặc định 12 ngày hay 0 ngày.`,
        items: [],
        claimRefs: [],
        sourceRefs: [],
        verified: false,
      });
    }
  }

  // 2. Attendance Sections
  const attEvs = structuredEvidence.filter((e) => e.tool === 'get_my_attendance');
  for (const ev of attEvs) {
    const f = ev.fields || {};
    const fromLabel = formatDateVi(ev.period?.from);
    const toLabel = formatDateVi(ev.period?.to);
    const sourceRefs = ev.sourceId ? [ev.sourceId] : [];

    sections.push({
      type: 'summary',
      title: `Tổng hợp chấm công (${fromLabel} – ${toLabel})`,
      text: `Từ ${fromLabel} đến ${toLabel}, hệ thống ghi nhận ${formatNumberVi(f.totalLogs, 'bản ghi')}: đúng giờ ${formatNumberVi(f.presentDays, 'ngày')}, đi muộn ${formatNumberVi(f.lateDays, 'ngày')}, về sớm ${formatNumberVi(f.earlyLeaveDays, 'ngày')}, nghỉ phép ${formatNumberVi(f.leaveDays, 'ngày')}, tổng giờ làm việc ${formatNumberVi(f.totalWorkHours, 'giờ')} (tăng ca ${formatNumberVi(f.totalOtHours, 'giờ')}).`,
      items: [
        { label: 'Tổng số bản ghi chấm công', value: formatNumberVi(f.totalLogs, 'bản ghi') },
        { label: 'Số ngày đúng giờ', value: formatNumberVi(f.presentDays, 'ngày') },
        { label: 'Số ngày đi muộn / về sớm', value: `${formatNumberVi(f.lateDays, 'ngày')} / ${formatNumberVi(f.earlyLeaveDays, 'ngày')}` },
        { label: 'Số ngày nghỉ phép đã ghi nhận', value: formatNumberVi(f.leaveDays, 'ngày') },
        { label: 'Số ngày vắng không phép đã ghi nhận', value: formatNumberVi(f.absentDays, 'ngày') },
        { label: 'Tổng giờ công / Tăng ca (OT)', value: `${formatNumberVi(f.totalWorkHours, 'giờ')} / ${formatNumberVi(f.totalOtHours, 'giờ')}` },
        { label: 'Bản ghi thiếu GPS / Đơn giải trình', value: `${formatNumberVi(f.missingGpsCount, 'lượt')} / ${formatNumberVi(f.appealsCount, 'đơn')}` },
      ],
      claimRefs: ['attendance:summary'],
      sourceRefs,
      verified: true,
    });

    sections.push({
      type: 'limitations',
      title: 'Lưu ý đối soát ngày công',
      text: 'Các ngày làm việc trong kỳ chưa có bản ghi chấm công được giữ ở trạng thái chờ đối soát nhân sự; hệ thống không tự động kết luận ngày thiếu bản ghi là nghỉ không phép.',
      items: [],
      claimRefs: [],
      sourceRefs,
      verified: true,
    });
  }

  // 3. Payslip Explanation & Comparison Sections
  const payslipEvs = structuredEvidence.filter((e) => e.tool === 'get_my_payslip');
  if (payslipEvs.length >= 2) {
    const comp = computePayslipComparison(payslipEvs[0], payslipEvs[1]);
    if (comp) {
      extraVerifiedClaims.push(...comp.calculationClaims);
      const dNet = comp.deltas.netSalary;
      const dGross = comp.deltas.grossIncome;
      const sourceRefs = [comp.earlierSourceId, comp.laterSourceId].filter(Boolean);

      sections.push({
        type: 'summary',
        title: `So sánh phiếu lương kỳ ${comp.earlierPeriod} và ${comp.laterPeriod}`,
        text: `Lương thực lĩnh (Net) kỳ ${comp.laterPeriod} là ${formatVnd(dNet.laterValue)}, chênh lệch ${formatSignedVndDelta(dNet.delta)} so với kỳ ${comp.earlierPeriod} (${formatVnd(dNet.earlierValue)}). Tổng thu nhập (Gross) chênh lệch ${formatSignedVndDelta(dGross.delta)}.`,
        items: [
          { label: `Thực lĩnh kỳ ${comp.earlierPeriod}`, value: formatVnd(dNet.earlierValue) },
          { label: `Thực lĩnh kỳ ${comp.laterPeriod}`, value: formatVnd(dNet.laterValue) },
          { label: 'Chênh lệch Thực lĩnh (Net)', value: formatSignedVndDelta(dNet.delta) },
          { label: 'Chênh lệch Tổng thu nhập (Gross)', value: formatSignedVndDelta(dGross.delta) },
        ],
        claimRefs: ['payslip:comparison:netSalaryDelta', 'payslip:comparison:grossIncomeDelta'],
        sourceRefs,
        verified: true,
      });

      const compItems = Object.values(comp.deltas).map((d) => ({
        label: d.label,
        value:
          d.unit === 'VND'
            ? `${formatVnd(d.earlierValue)} → ${formatVnd(d.laterValue)} (${formatSignedVndDelta(d.delta)})`
            : `${formatNumberVi(d.earlierValue, d.unit)} → ${formatNumberVi(d.laterValue, d.unit)} (${d.delta > 0 ? `+${d.delta}` : d.delta} ${d.unit})`,
      }));

      sections.push({
        type: 'comparison',
        title: 'Biến động từng khoản mục giữa hai kỳ',
        text:
          comp.changedComponents.length > 0
            ? `Các khoản mục thay đổi giữa kỳ ${comp.earlierPeriod} và ${comp.laterPeriod}: ` +
              comp.changedComponents
                .map((c) =>
                  c.unit === 'VND'
                    ? `${c.label}: ${formatVnd(c.earlierValue)} → ${formatVnd(c.laterValue)} (${formatSignedVndDelta(c.delta)})`
                    : `${c.label}: ${c.earlierValue} → ${c.laterValue} ${c.unit}`
                )
                .join('; ') +
              '.'
            : `Tất cả khoản mục thu nhập và khấu trừ giữa kỳ ${comp.earlierPeriod} và ${comp.laterPeriod} giữ nguyên không đổi.`,
        items: compItems,
        claimRefs: comp.calculationClaims.map((c) => c.field),
        sourceRefs,
        verified: true,
      });

      sections.push({
        type: 'limitations',
        title: 'Nguyên tắc đối chiếu',
        text: 'Số liệu chênh lệch được tính trực tiếp từ hai phiếu lương đã công bố chính thức của bạn; hệ thống không tự suy đoán nguyên nhân ngoài dữ liệu bảng lương.',
        items: [],
        claimRefs: [],
        sourceRefs,
        verified: true,
      });
    }
  } else if (payslipEvs.length === 1) {
    const ev = payslipEvs[0];
    const f = ev.fields || {};
    const period = ev.period?.period;
    const statusVi = translatePeriodStatusVi(ev.period?.periodStatus);
    const sourceRefs = ev.sourceId ? [ev.sourceId] : [];

    sections.push({
      type: 'summary',
      title: `Tóm tắt phiếu lương kỳ ${period} (${statusVi})`,
      text: `Kỳ lương ${period} (${statusVi}): Lương thực lĩnh (Net) là ${formatVnd(f.netSalary)}, tổng thu nhập (Gross) là ${formatVnd(f.grossIncome)}, tổng khấu trừ là ${formatVnd(f.totalDeductions)}.`,
      items: [
        { label: 'Kỳ lương & Trạng thái', value: `${period} (${statusVi})` },
        { label: 'Lương thực lĩnh (Net)', value: formatVnd(f.netSalary) },
        { label: 'Tổng thu nhập (Gross)', value: formatVnd(f.grossIncome) },
        { label: 'Tổng khấu trừ (BHXH, BHYT, BHTN, Thuế TNCN)', value: formatVnd(f.totalDeductions) },
      ],
      claimRefs: ['payslip:netSalary', 'payslip:grossIncome', 'payslip:totalDeductions'],
      sourceRefs,
      verified: true,
    });

    sections.push({
      type: 'facts',
      title: 'Chi tiết các khoản thu nhập & khấu trừ',
      text: `Lương cơ bản: ${formatVnd(f.baseSalary)} | Ngày công: ${formatNumberVi(f.actualWorkDays)}/${formatNumberVi(f.standardWorkDays, 'ngày')} (Lương ngày công: ${formatVnd(f.workDaysSalary)}) | Phụ cấp: ${formatVnd(f.totalAllowances)} | Thưởng: ${formatVnd(f.bonus)} | Lương tăng ca (OT): ${formatVnd(f.otPay)} | BHXH: ${formatVnd(f.bhxhEmp)}, BHYT: ${formatVnd(f.bhytEmp)}, BHTN: ${formatVnd(f.bhtnEmp)} | Thuế TNCN: ${formatVnd(f.pitAmount)}.`,
      items: [
        { label: 'Lương cơ bản hợp đồng', value: formatVnd(f.baseSalary) },
        { label: 'Ngày công thực tế / Ngày công chuẩn', value: `${formatNumberVi(f.actualWorkDays)} / ${formatNumberVi(f.standardWorkDays, 'ngày')}` },
        { label: 'Lương tính theo ngày công', value: formatVnd(f.workDaysSalary) },
        { label: 'Phụ cấp & Thưởng', value: `${formatVnd(f.totalAllowances)} / ${formatVnd(f.bonus)}` },
        { label: 'Lương làm thêm giờ (OT)', value: formatVnd(f.otPay) },
        { label: 'Bảo hiểm bắt buộc (BHXH + BHYT + BHTN)', value: `${formatVnd(f.bhxhEmp)} + ${formatVnd(f.bhytEmp)} + ${formatVnd(f.bhtnEmp)}` },
        { label: 'Thu nhập tính thuế / Thuế TNCN', value: `${formatVnd(f.taxableIncome)} / ${formatVnd(f.pitAmount)}` },
      ],
      claimRefs: ['payslip:baseSalary', 'payslip:pitAmount'],
      sourceRefs,
      verified: true,
    });

    sections.push({
      type: 'calculation',
      title: 'Công thức tính từ bảng lương đã chốt',
      text: `Tổng thu nhập (${formatVnd(f.grossIncome)}) - Tổng khấu trừ (${formatVnd(f.totalDeductions)}) = Thực lĩnh (${formatVnd(f.netSalary)}).`,
      items: [],
      claimRefs: ['payslip:calculation'],
      sourceRefs,
      verified: true,
    });
  }

  // Check if a payslip tool call returned unpublished or not found (including incomplete comparison)
  for (let i = 0; i < rawToolResults.length; i += 1) {
    const tr = rawToolResults[i];
    const tName = toolsUsed[i]?.name;
    if (tName === 'get_my_payslip' && tr?.ok === true) {
      if (tr.found === false) {
        sections.push({
          type: 'limitations',
          title: 'Chưa có dữ liệu phiếu lương',
          text: tr.message || 'Hệ thống chưa tìm thấy phiếu lương đã công bố cho kỳ được yêu cầu. Không gán giá trị 0 ₫ cho kỳ chưa có dữ liệu.',
          items: [],
          claimRefs: [],
          sourceRefs: [],
          verified: false,
        });
      } else if (tr.published === false) {
        sections.push({
          type: 'limitations',
          title: `Kỳ lương ${tr.period} chưa công bố chính thức`,
          text: `Kỳ lương ${tr.period} hiện đang ở trạng thái ${translatePeriodStatusVi(tr.periodStatus)}. Để bảo đảm tính chính xác, hệ thống không hiển thị hoặc so sánh số liệu của kỳ lương chưa chốt.`,
          items: [],
          claimRefs: [],
          sourceRefs: [],
          verified: false,
        });
      }
    }
  }

  // 4. Policy Lookup Sections
  const policyRawResults = rawToolResults.filter((tr, idx) => toolsUsed[idx]?.name === 'search_policies');
  for (const tr of policyRawResults) {
    if (tr?.ok === true && tr.found === true) {
      const sourceRefs = (tr.sources || []).map((s) => s.id);
      const matches = tr.matches || [];
      const effFrom = tr.effectiveFrom || 'Hiện hành';
      const verId = tr.policyVersionId ? `v${tr.policyVersionId}` : matches[0]?.version ? `v${matches[0].version}` : 'v1';

      sections.push({
        type: 'summary',
        title: `Quy chế & Chính sách nội bộ (Hiệu lực: ${effFrom}, ${verId})`,
        text:
          matches.length > 0
            ? matches.map((m) => `${m.title} (Mã ${m.id}, Phiên bản v${m.version}): ${m.excerpt}`).join('\n\n')
            : `Thông số cấu hình chính sách hiệu lực từ kỳ ${effFrom} (Phiên bản ${verId}).`,
        items: [
          ...matches.map((m) => ({
            label: `${m.title} (v${m.version})`,
            value: m.excerpt,
          })),
          ...(tr.systemSettings || []).slice(0, 6).map((s) => ({
            label: translateSettingKeyVi(s.key),
            value: `${s.value} (hiệu lực từ ${s.effectiveFrom || effFrom})`,
          })),
        ],
        claimRefs: ['policy:matches'],
        sourceRefs,
        verified: true,
      });

      sections.push({
        type: 'limitations',
        title: 'Phạm vi áp dụng văn bản quy chế',
        text: 'Trích đoạn trên được đối chiếu trực tiếp từ văn bản nội bộ đã phê duyệt và phiên bản chính sách đúng kỳ hiệu lực; trợ lý AI không tự suy diễn quy định ngoài văn bản hoặc suy ra trạng thái cá nhân.',
        items: [],
        claimRefs: [],
        sourceRefs,
        verified: true,
      });
    } else if (tr?.ok === true && tr.found === false) {
      sections.push({
        type: 'limitations',
        title: 'Chưa có văn bản quy chế hoặc phiên bản chính sách phù hợp',
        text:
          tr.message ||
          'Chưa tìm thấy văn bản quy chế đang có hiệu lực hoặc phiên bản chính sách lịch sử cho kỳ được hỏi. Hệ thống không lấy quy định hiện tại để trả lời thay cho kỳ lịch sử.',
        items: [],
        claimRefs: [],
        sourceRefs: [],
        verified: false,
      });
    }
  }

  // 5. Dashboard & Performance Sections
  const dashEvs = structuredEvidence.filter((e) => e.tool === 'get_scoped_dashboard');
  for (const ev of dashEvs) {
    const f = ev.fields || {};
    const scopeLabel = ev.entity?.departmentId ? `Phòng ban ${ev.entity.departmentId}` : 'Toàn công ty';
    const sourceRefs = ev.sourceId ? [ev.sourceId] : [];
    const items = Object.entries(f)
      .filter(([, v]) => v !== null && typeof v !== 'object')
      .map(([k, v]) => ({
        label: k,
        value: String(v),
      }));

    sections.push({
      type: 'summary',
      title: `Tổng quan nhân sự (${scopeLabel})`,
      text: `Số liệu thống kê trong phạm vi ${scopeLabel} đã được đối chiếu từ hệ thống.`,
      items,
      claimRefs: ['dashboard:overview'],
      sourceRefs,
      verified: true,
    });
  }

  const perfEvs = structuredEvidence.filter((e) => e.tool === 'get_scoped_performance');
  for (const ev of perfEvs) {
    const f = ev.fields || {};
    const targetLabel = ev.entity?.employeeId || (ev.entity?.departmentId ? `Phòng ban ${ev.entity.departmentId}` : 'Toàn công ty');
    const sourceRefs = ev.sourceId ? [ev.sourceId] : [];

    sections.push({
      type: 'summary',
      title: `Đánh giá hiệu suất & Chỉ báo rủi ro (${targetLabel})`,
      text: f.missingReview
        ? `Chưa có bản ghi đánh giá hiệu suất chính thức cho ${targetLabel}.`
        : `Kết quả đánh giá hiệu suất (${targetLabel}): Điểm hiệu suất ${formatNumberVi(f.performanceScore)}, Điểm tiềm năng ${formatNumberVi(f.potentialScore)}${f.turnoverScore !== null && f.turnoverScore !== undefined ? `, Điểm chỉ báo rủi ro nghỉ việc ${formatNumberVi(f.turnoverScore)} (Mức: ${f.turnoverLevel || 'Chưa xác định'})` : ''}.`,
      items: [
        { label: 'Điểm đánh giá hiệu suất', value: formatNumberVi(f.performanceScore) },
        { label: 'Điểm đánh giá tiềm năng', value: formatNumberVi(f.potentialScore) },
        ...(f.turnoverScore !== null && f.turnoverScore !== undefined
          ? [{ label: 'Chỉ báo rủi ro nghỉ việc (Turnover Risk)', value: `${f.turnoverScore}/100 (${f.turnoverLevel || ''})` }]
          : []),
      ],
      claimRefs: ['performance:summary'],
      sourceRefs,
      verified: true,
    });

    sections.push({
      type: 'limitations',
      title: 'Lưu ý về chỉ báo rủi ro (Read-only)',
      text: 'Điểm rủi ro nghỉ việc (Turnover Risk) là chỉ báo định lượng theo quy tắc hiện hành để hỗ trợ quản lý, không phải kết luận về ý định nghỉ việc của cá nhân. Trợ lý AI ở chế độ chỉ đọc, không tự động sửa điểm hoặc kích hoạt PIP.',
      items: [],
      claimRefs: [],
      sourceRefs,
      verified: true,
    });
  }

  const payslipComparison =
    payslipEvs.length >= 2 ? computePayslipComparison(payslipEvs[0], payslipEvs[1]) : null;

  return {
    sections,
    answerSections: sections,
    extraVerifiedClaims,
    payslipComparison,
  };
}

/**
 * Render a natural Vietnamese (or English if user asked in English) canonical answer
 * from structuredEvidence without leaking raw technical field names (`baseSalary`, `totalEmployees`, etc.).
 */
function renderNaturalVerifiedAnswer(userMessage = '', structuredEvidence = [], rawToolResults = []) {
  const isEnglish =
    /\b(how many|how much|what|which|check|show|my|vacation|leave|balance|salary|payslip|attendance|policy|performance|dashboard)\b/i.test(
      String(userMessage || '')
    ) && !/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(String(userMessage || ''));

  const payslipEvs = structuredEvidence.filter((e) => e.tool === 'get_my_payslip');
  if (payslipEvs.length >= 2 && !isEnglish) {
    const comp = computePayslipComparison(payslipEvs[0], payslipEvs[1]);
    if (comp) {
      const dNet = comp.deltas.netSalary;
      const dGross = comp.deltas.grossIncome;
      const changedText =
        comp.changedComponents.length > 0
          ? comp.changedComponents
              .map((c) =>
                c.unit === 'VND'
                  ? `${c.label}: kỳ ${comp.earlierPeriod} là ${formatVnd(c.earlierValue)}, kỳ ${comp.laterPeriod} là ${formatVnd(c.laterValue)} (chênh lệch ${formatSignedVndDelta(c.delta)})`
                  : `${c.label}: kỳ ${comp.earlierPeriod} là ${c.earlierValue} ${c.unit}, kỳ ${comp.laterPeriod} là ${c.laterValue} ${c.unit}`
              )
              .join('; ')
          : 'các khoản thành phần giữ nguyên không đổi';
      return `So sánh phiếu lương đã công bố kỳ ${comp.earlierPeriod} và kỳ ${comp.laterPeriod}: Lương thực lĩnh kỳ ${comp.earlierPeriod} là ${formatVnd(dNet.earlierValue)}, kỳ ${comp.laterPeriod} là ${formatVnd(dNet.laterValue)} (chênh lệch ${formatSignedVndDelta(dNet.delta)}); tổng thu nhập kỳ ${comp.earlierPeriod} là ${formatVnd(dGross.earlierValue)}, kỳ ${comp.laterPeriod} là ${formatVnd(dGross.laterValue)} (chênh lệch ${formatSignedVndDelta(dGross.delta)}). Chi tiết biến động: ${changedText}.`;
    }
  }

  const parts = [];
  for (const ev of structuredEvidence) {
    if (ev.tool === 'get_my_leave_balance') {
      const year = ev.period?.year;
      const balances = ev.fields?.balances || [];
      for (const b of balances) {
        const label = b.leaveTypeCode || b.leaveTypeName || 'LEAVE';
        if (isEnglish) {
          parts.push(
            `Verified leave balance (${year}, ${label}): remaining ${b.remaining} days (available: ${b.available} days, used: ${b.used} days, total entitlement: ${b.entitlement} days, pending: ${b.pending} days).`
          );
        } else {
          parts.push(
            `Số dư phép đã xác minh năm ${year} (${b.leaveTypeName || label}): còn lại ${b.remaining} ngày (khả dụng: ${b.available} ngày, đã dùng: ${b.used} ngày, tổng định mức: ${b.entitlement} ngày, chờ duyệt: ${b.pending} ngày).`
          );
        }
      }
    } else if (ev.tool === 'get_my_payslip') {
      const f = ev.fields || {};
      const period = ev.period?.period;
      const statusVi = translatePeriodStatusVi(ev.period?.periodStatus);
      if (isEnglish) {
        parts.push(
          `Verified payslip (${period}, status ${ev.period?.periodStatus}): net salary ${f.netSalary} VND, gross income ${f.grossIncome} VND, base salary ${f.baseSalary} VND, PIT ${f.pitAmount} VND, total deductions ${f.totalDeductions} VND.`
        );
      } else {
        parts.push(
          `Phiếu lương chính thức kỳ ${period} (${statusVi}): lương thực lĩnh ${formatVnd(f.netSalary)}, tổng thu nhập ${formatVnd(f.grossIncome)}, lương cơ bản ${formatVnd(f.baseSalary)}, phụ cấp ${formatVnd(f.totalAllowances)}, thưởng ${formatVnd(f.bonus)}, lương tăng ca ${formatVnd(f.otPay)}, thuế TNCN ${formatVnd(f.pitAmount)}, tổng khấu trừ ${formatVnd(f.totalDeductions)}.`
        );
      }
    } else if (ev.tool === 'get_my_attendance') {
      const f = ev.fields || {};
      if (isEnglish) {
        parts.push(
          `Verified attendance (${ev.period?.from} to ${ev.period?.to}): total logs ${f.totalLogs ?? 0}, present ${f.presentDays ?? 0} days, late ${f.lateDays ?? 0} days, work hours ${f.totalWorkHours ?? 0}.`
        );
      } else {
        parts.push(
          `Tổng hợp bảng chấm công (${formatDateVi(ev.period?.from)} đến ${formatDateVi(ev.period?.to)}): tổng cộng ${f.totalLogs ?? 0} bản ghi, đúng giờ ${f.presentDays ?? 0} ngày, đi muộn ${f.lateDays ?? 0} ngày, về sớm ${f.earlyLeaveDays ?? 0} ngày, tổng giờ làm việc ${f.totalWorkHours ?? 0} giờ (tăng ca ${f.totalOtHours ?? 0} giờ).`
        );
      }
    } else if (ev.tool === 'search_policies') {
      const policyTr = rawToolResults.find((r) => r && r.ok === true && Array.isArray(r.matches));
      const firstMatch = policyTr?.matches?.[0];
      const effFrom = ev.period?.effectiveFrom || 'hiện hành';
      if (isEnglish) {
        const docIds = (ev.fields?.matchIds || []).join(', ');
        parts.push(`Verified policy evidence (effective ${effFrom}): documents [${docIds || 'N/A'}].`);
      } else if (firstMatch) {
        parts.push(
          `Theo văn bản quy chế "${firstMatch.title}" (Mã ${firstMatch.id}, phiên bản v${firstMatch.version}, kỳ hiệu lực ${effFrom}): ${firstMatch.excerpt}`
        );
      } else {
        parts.push(`Thông tin quy chế nội bộ đã xác minh (kỳ hiệu lực ${effFrom}).`);
      }
    } else if (ev.tool === 'get_scoped_performance') {
      const f = ev.fields || {};
      const target = ev.entity?.employeeId || (ev.entity?.departmentId ? `phòng ban ${ev.entity.departmentId}` : 'toàn công ty');
      if (isEnglish) {
        parts.push(
          `Verified performance (${target}): performance score ${f.performanceScore ?? 'N/A'}, potential score ${f.potentialScore ?? 'N/A'}, turnover risk indicator ${f.turnoverScore ?? 'N/A'} (${f.turnoverLevel ?? 'N/A'}).`
        );
      } else {
        parts.push(
          `Kết quả đánh giá hiệu suất (${target}): điểm hiệu suất ${f.performanceScore ?? 'chưa có'}, điểm tiềm năng ${f.potentialScore ?? 'chưa có'}, chỉ báo rủi ro nghỉ việc ${f.turnoverScore ?? 'chưa có'} (mức ${f.turnoverLevel ?? 'chưa xác định'}). Lưu ý: chỉ báo rủi ro nghỉ việc chỉ mang tính tham khảo định lượng ở chế độ chỉ đọc.`
        );
      }
    } else if (ev.tool === 'get_scoped_dashboard') {
      const f = ev.fields || {};
      const target = ev.entity?.departmentId ? `phòng ban ${ev.entity.departmentId}` : 'toàn công ty';
      const headcount = f.totalEmployees ?? f.activeEmployees ?? f.headcount;
      if (isEnglish) {
        parts.push(
          `Verified dashboard summary (${target}):${headcount !== undefined ? ` total employees ${headcount}.` : ' data verified.'}`
        );
      } else {
        parts.push(
          `Số liệu tổng hợp nhân sự (${target}):${headcount !== undefined ? ` tổng quân số ${headcount} nhân sự.` : ' đã đối chiếu từ hệ thống.'}`
        );
      }
    }
  }
  return parts.join(' ');
}

module.exports = {
  formatDateVi,
  formatVnd,
  formatSignedVndDelta,
  formatNumberVi,
  translatePeriodStatusVi,
  translateSettingKeyVi,
  computePayslipComparison,
  buildAnswerSectionsAndClaims,
  renderNaturalVerifiedAnswer,
};
