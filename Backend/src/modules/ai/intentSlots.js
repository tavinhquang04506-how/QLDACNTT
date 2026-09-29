'use strict';

const { computePreviousMonthString } = require('./schema');
const { isValidPeriodMonth, isValidIsoDate } = require('./tools');

function normalizeTextAscii(text = '') {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract all explicit YYYY-MM periods from raw or normalized text, including:
 * - "2026-08", "2026-09"
 * - "tháng 8/2026", "08/2026", "tháng 8 năm 2026"
 * - "tháng 8 và tháng 9 năm 2026" / "tháng 8 và 9/2026"
 */
function extractAllPeriodsFromText(rawText = '', defaultYear = null) {
  const text = String(rawText || '');
  const norm = normalizeTextAscii(text);
  const periods = [];
  const addPeriod = (y, m) => {
    const p = `${y}-${String(Number(m)).padStart(2, '0')}`;
    if (isValidPeriodMonth(p) && !periods.includes(p)) {
      periods.push(p);
    }
  };

  // 1. Compound pattern: "thang 8 va (thang) 9 nam 2026" or "thang 8 va 9/2026"
  const compoundRx = /\b(?:thang|ky)\s*(0?[1-9]|1[0-2])\s*(?:va|voi|,|den|-)\s*(?:thang\s*|ky\s*)?(0?[1-9]|1[0-2])\s*(?:\/|-|\s+nam\s+)\s*(20\d{2})\b/gi;
  let cm;
  while ((cm = compoundRx.exec(norm)) !== null) {
    addPeriod(cm[3], cm[1]);
    addPeriod(cm[3], cm[2]);
  }

  // 2. ISO YYYY-MM (avoid matching YYYY-MM-DD full dates as period if followed by -DD)
  const isoRx = /\b(20\d{2})-(0[1-9]|1[0-2])(?![-\d])\b/g;
  let im;
  while ((im = isoRx.exec(text)) !== null) {
    addPeriod(im[1], im[2]);
  }

  // 3. Vietnamese MM/YYYY or "thang M nam YYYY"
  const vnRx = /\b(?:thang|ky(?:\s+luong)?)\s*(0?[1-9]|1[0-2])\s*(?:\/|-|\s+nam\s+)\s*(20\d{2})\b/gi;
  let vm;
  while ((vm = vnRx.exec(norm)) !== null) {
    addPeriod(vm[2], vm[1]);
  }

  const slashRx = /\b(0?[1-9]|1[0-2])\/(20\d{2})\b/g;
  let sm;
  while ((sm = slashRx.exec(text)) !== null) {
    addPeriod(sm[2], sm[1]);
  }

  // 4. Bare month "thang 8 va thang 9" when defaultYear is known
  if (periods.length === 0 && defaultYear) {
    const bareCompoundRx = /\b(?:thang|ky)\s*(0?[1-9]|1[0-2])\s*(?:va|voi)\s*(?:thang\s*|ky\s*)?(0?[1-9]|1[0-2])\b/i;
    const bm = bareCompoundRx.exec(norm);
    if (bm) {
      addPeriod(defaultYear, bm[1]);
      addPeriod(defaultYear, bm[2]);
    }
  }

  return periods;
}

function extractIsoDatesFromText(rawText = '') {
  const text = String(rawText || '');
  const found = [];
  const rx = /\b(20\d{2}-\d{2}-\d{2})\b/g;
  let m;
  while ((m = rx.exec(text)) !== null) {
    found.push(m[1]);
  }
  return found;
}

function extractLeaveTypeSlot(normText = '') {
  if (/\b(nghi om|phep om|om dau|sick|medical|lt-sl|nghi_om)\b/i.test(normText)) {
    const alsoAnnual = /\b(phep nam|annual|vacation|lt-al|phep_nam)\b/i.test(normText);
    if (alsoAnnual) return null; // Asking for both annual and sick leave -> return all balances
    return 'NGHI_OM';
  }
  if (/\b(viec rieng|nghi viec rieng|personal leave|vi_rieng)\b/i.test(normText)) {
    return 'VIEC_RIENG';
  }
  if (/\b(phep nam|nghi phep nam|annual|vacation|pto|lt-al|phep_nam)\b/i.test(normText)) {
    return 'PHEP_NAM';
  }
  return null;
}

function detectPrimaryIntent(rawMessage = '', normMsg = '') {
  if (!normMsg) return 'clarification';

  // Pure greeting check
  const isGreetingStart =
    /^(xin chao|chao\b|hello\b|hi\b|hey\b|good morning|good afternoon|good evening|cam on|thank you|thanks)/i.test(
      normMsg
    );
  const hasDomainKeywords =
    /\b(phep|nghi|cham cong|bang cong|di muon|ve som|giai trinh|gps|luong|phieu luong|thuc linh|gross|net|thue|tncn|bhxh|bhyt|bhtn|bao hiem|phu cap|ot|tang ca|quy che|chinh sach|noi quy|so tay|handbook|dashboard|thong ke|quan so|bien dong|hieu suat|9 box|nine box|kpi|pip|rui ro|turnover|so sanh|khac nhau|chenh lech|vacation|leave|balance|attendance|salary|payslip|payroll|policy|performance)\b/i.test(
      normMsg
    );

  if (isGreetingStart && !hasDomainKeywords) {
    return 'greeting';
  }

  // Write / mutation / unsupported action check (AI is strictly read-only)
  if (
    /\b(duyet don|phe duyet giup|sua bang cong|cap nhat luong|chinh sua luong|xoa nhan vien|tao don nghi|gui don nghi|approve my|update my salary|delete employee|exec sql|select \* from)\b/i.test(
      normMsg
    ) &&
    !/\b(quy che|chinh sach|trang thai|da duoc duyet chua|cho duyet)\b/i.test(normMsg)
  ) {
    return 'unsupported';
  }

  // Payslip comparison check
  const hasSalaryKeyword = /\b(luong|phieu luong|thu nhap|thuc linh|gross|net|payslip|salary|payroll)\b/i.test(normMsg);
  const hasCompareKeyword =
    /\b(so sanh|khac nhau|chenh lech|tang hay giam|bien dong giua|vi sao .* khac|tai sao .* khac|compare|difference between)\b/i.test(
      normMsg
    );
  if (hasSalaryKeyword && hasCompareKeyword) {
    return 'payslip_comparison';
  }

  // Policy lookup check
  if (
    /\b(quy che|chinh sach|noi quy|so tay|cam nang|quy dinh|ban kinh gps|muc giam tru|phu cap an trua|policy|policies|handbook|vinmec|esop)\b/i.test(
      normMsg
    )
  ) {
    return 'policy_lookup';
  }

  // Leave balance check
  if (
    /\b(ngay phep|quy phep|phep nam|nghi om|phep om|con bao nhieu phep|con may ngay phep|bao nhieu ngay phep|so du phep|leave|vacation|pto|days off)\b/i.test(
      normMsg
    )
  ) {
    return 'leave_balance';
  }

  // Attendance check
  if (
    /\b(cham cong|bang cong|ngay cong|di muon|ve som|vang mat|check in|check out|giai trinh|attendance|work hours|gio cong)\b/i.test(
      normMsg
    )
  ) {
    return 'attendance_summary';
  }

  // Payslip explanation check
  if (hasSalaryKeyword) {
    return 'payslip_explanation';
  }

  // Performance / 9-Box / Turnover check
  if (
    /\b(hieu suat|9 box|nine box|danh gia|tiem nang|rui ro nghi viec|turnover|pip|kpi|performance)\b/i.test(
      normMsg
    )
  ) {
    return 'performance_summary';
  }

  // Dashboard summary check
  if (
    /\b(dashboard|tong quan nhan su|thong ke nhan su|tong hop phong ban|quan so|headcount)\b/i.test(
      normMsg
    )
  ) {
    return 'dashboard_summary';
  }

  return null;
}

function isEllipticalFollowUpMessage(normMsg = '') {
  if (!normMsg) return false;
  return /^(con\b|the con\b|vay con\b|entitled\b|what about\b|how about\b|con thang\b|con ky\b|con nam\b|thang truoc thi sao|nam ngoai thi sao|ky truoc thi sao|so sanh voi\b)/i.test(
    normMsg
  );
}

/**
 * Resolve structured intent, slots, follow-up context inheritance, and clarification needs.
 */
function resolveIntentAndSlots({
  message = '',
  clock,
  actor,
  priorContext = null,
  hasConversationHistory = false,
  clientProvidedConversationId = false,
  publishedPeriods = null,
}) {
  const rawMsg = String(message || '').trim();
  const normMsg = normalizeTextAscii(rawMsg);
  const currentYear = clock?.year || new Date().getFullYear();
  const currentMonth = clock?.month || `${currentYear}-01`;
  const prevMonth = computePreviousMonthString(currentMonth) || `${currentYear - 1}-12`;

  let detectedIntent = detectPrimaryIntent(rawMsg, normMsg);
  const elliptical = isEllipticalFollowUpMessage(normMsg);
  const hasCompareKeyword =
    /\b(so sanh|khac nhau|chenh lech|tang hay giam|bien dong giua|vi sao .* khac|tai sao .* khac|compare|difference between)\b/i.test(
      normMsg
    );
  if (
    !detectedIntent &&
    hasCompareKeyword &&
    priorContext?.lastIntent &&
    ['payslip_explanation', 'payslip_comparison'].includes(priorContext.lastIntent)
  ) {
    detectedIntent = 'payslip_comparison';
  }

  // Extract raw time/entity slots from current message
  const extractedPeriods = extractAllPeriodsFromText(rawMsg, currentYear);
  const extractedDates = extractIsoDatesFromText(rawMsg);
  const leaveType = extractLeaveTypeSlot(normMsg);
  const empMatch = rawMsg.match(/\b(NV-[A-Za-z0-9-]+)\b/i);
  const deptMatch = rawMsg.match(/\b(DEPT-[A-Za-z0-9-]+)\b/i);

  let yearSlot = null;
  const yearMatch = /\b(20\d{2})\b/.exec(rawMsg);
  if (/\b(nam nay|this year|current year)\b/i.test(normMsg)) {
    yearSlot = currentYear;
  } else if (/\b(nam ngoai|nam truoc|last year|previous year)\b/i.test(normMsg)) {
    yearSlot = currentYear - 1;
  } else if (yearMatch && extractedPeriods.length === 0 && extractedDates.length === 0) {
    yearSlot = Number(yearMatch[1]);
  }

  let relativePeriodType = null;
  let singlePeriod = extractedPeriods[0] || null;
  if (/\b(ky cong bo truoc|ky gan nhat truoc|ky da chot truoc|previous published)\b/i.test(normMsg)) {
    relativePeriodType = 'previous_published';
  } else if (/\b(thang truoc|ky truoc|last month|previous month)\b/i.test(normMsg)) {
    relativePeriodType = 'previous_month';
    if (!singlePeriod) singlePeriod = prevMonth;
  } else if (/\b(thang nay|ky nay|this month|current month)\b/i.test(normMsg)) {
    relativePeriodType = 'current_month';
    if (!singlePeriod) singlePeriod = currentMonth;
  } else if (/\b(gan nhat|moi nhat|latest|most recent)\b/i.test(normMsg)) {
    relativePeriodType = 'latest_published';
  }

  // Case: Elliptical follow-up ("Còn tháng trước?", "Thế còn năm ngoái?")
  let inheritedFromPrior = false;
  let topicSwitched = false;

  if (!detectedIntent && elliptical) {
    if (priorContext && priorContext.lastIntent && !['greeting', 'clarification', 'unsupported'].includes(priorContext.lastIntent)) {
      detectedIntent = priorContext.lastIntent;
      inheritedFromPrior = true;
    } else {
      // Lost conversation context / server restart / no prior turn
      const isManagerOrExec = ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER'].includes(actor?.roleCode);
      const targetPeriodLabel = singlePeriod || (yearSlot ? `năm ${yearSlot}` : `kỳ ${prevMonth}`);
      const choices =
        actor?.roleCode === 'ADMIN'
          ? [
              {
                label: `Quy chế áp dụng cho ${targetPeriodLabel}`,
                query: `Tra cứu quy chế nội bộ áp dụng cho ${targetPeriodLabel}`,
                value: 'policy_lookup',
              },
            ]
          : [
              {
                label: `Bảng chấm công ${targetPeriodLabel}`,
                query: `Tổng hợp bảng chấm công của tôi ${targetPeriodLabel}`,
                value: 'attendance_summary',
              },
              {
                label: `Phiếu lương ${targetPeriodLabel}`,
                query: `Giải thích phiếu lương của tôi ${targetPeriodLabel}`,
                value: 'payslip_explanation',
              },
              isManagerOrExec
                ? {
                    label: `Thống kê phòng ban ${targetPeriodLabel}`,
                    query: `Tóm tắt số liệu nhân sự phòng ban của tôi ${targetPeriodLabel}`,
                    value: 'dashboard_summary',
                  }
                : {
                    label: `Quỹ ngày phép năm ${yearSlot || currentYear}`,
                    query: `Tôi còn bao nhiêu ngày phép năm ${yearSlot || currentYear}?`,
                    value: 'leave_balance',
                  },
            ];

      return {
        intent: 'clarification',
        inheritedFromPrior: false,
        topicSwitched: false,
        lostContextDetected: Boolean(!hasConversationHistory),
        needsClarification: true,
        clarification: {
          slot: 'intent',
          question:
            'Phiên hội thoại trước đó đã được làm mới hoặc chưa có chủ đề gốc. Bạn muốn tra cứu thông tin nào cho kỳ vừa nêu?',
          choices: choices.slice(0, 3),
        },
        slots: {
          year: yearSlot,
          month: singlePeriod,
          period: singlePeriod,
          from: null,
          to: null,
          comparisonPeriods: [],
          leaveType: null,
          policyTopic: null,
          departmentId: null,
          targetEmployeeId: null,
          relativePeriodType,
        },
      };
    }
  }

  // Check topic switch: if prior intent existed and differs from new detected intent, clear old slots!
  if (
    priorContext &&
    priorContext.lastIntent &&
    detectedIntent &&
    priorContext.lastIntent !== detectedIntent &&
    !inheritedFromPrior
  ) {
    topicSwitched = true;
  }

  // If still no detected intent (vague query like "Tra cứu giúp tôi", "Cho tôi hỏi thông tin")
  if (!detectedIntent) {
    const isManagerOrExec = ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER'].includes(actor?.roleCode);
    const choices =
      actor?.roleCode === 'ADMIN'
        ? [
            {
              label: 'Quy chế giờ làm việc & GPS',
              query: 'Quy chế giờ làm việc và bán kính chấm công GPS hiện hành là gì?',
              value: 'policy_lookup',
            },
            {
              label: 'Quy định nghỉ phép năm',
              query: 'Quy định về nghỉ phép năm trong Sổ tay Nhân sự hiện hành?',
              value: 'policy_lookup',
            },
          ]
        : [
            {
              label: `Quỹ ngày phép năm ${currentYear}`,
              query: `Tôi còn bao nhiêu ngày phép năm nay (${currentYear})?`,
              value: 'leave_balance',
            },
            {
              label: 'Phiếu lương kỳ gần nhất',
              query: 'Giải thích phiếu lương chính thức kỳ gần nhất của tôi',
              value: 'payslip_explanation',
            },
            isManagerOrExec
              ? {
                  label: 'Thống kê nhân sự theo quyền',
                  query: 'Tóm tắt số liệu nhân sự theo phạm vi quản lý của tôi',
                  value: 'dashboard_summary',
                }
              : {
                  label: `Bảng chấm công tháng trước (${prevMonth})`,
                  query: `Tổng hợp bảng chấm công của tôi tháng trước (${prevMonth})`,
                  value: 'attendance_summary',
                },
          ];

    return {
      intent: 'clarification',
      inheritedFromPrior: false,
      topicSwitched,
      lostContextDetected: false,
      needsClarification: true,
      clarification: {
        slot: 'intent',
        question: 'Bạn muốn tra cứu nội dung nào? Vui lòng chọn một trong các mục được hỗ trợ dưới đây:',
        choices: choices.slice(0, 3),
      },
      slots: {
        year: null,
        month: null,
        period: null,
        from: null,
        to: null,
        comparisonPeriods: [],
        leaveType: null,
        policyTopic: null,
        departmentId: null,
        targetEmployeeId: null,
        relativePeriodType: null,
      },
    };
  }

  // Build clean slots for the active intent (never carrying irrelevant slots across topic switches!)
  const slots = {
    year: null,
    month: null,
    period: null,
    from: null,
    to: null,
    comparisonPeriods: [],
    leaveType: null,
    policyTopic: null,
    departmentId: deptMatch ? deptMatch[1].toUpperCase() : null,
    targetEmployeeId: empMatch ? empMatch[1].toUpperCase() : null,
    relativePeriodType,
  };

  if (detectedIntent === 'leave_balance') {
    slots.year =
      yearSlot ||
      (singlePeriod ? Number(singlePeriod.slice(0, 4)) : null) ||
      (inheritedFromPrior && priorContext?.lastSlots?.year ? priorContext.lastSlots.year : currentYear);
    slots.leaveType =
      leaveType || (inheritedFromPrior && !topicSwitched ? priorContext?.lastSlots?.leaveType || null : null);
  } else if (detectedIntent === 'attendance_summary') {
    if (extractedDates.length >= 2) {
      slots.from = extractedDates[0];
      slots.to = extractedDates[1];
    } else if (
      inheritedFromPrior &&
      relativePeriodType === 'previous_month' &&
      extractedPeriods.length === 0 &&
      (priorContext?.lastSlots?.month || priorContext?.lastSlots?.period)
    ) {
      slots.month =
        computePreviousMonthString(priorContext.lastSlots.month || priorContext.lastSlots.period) ||
        prevMonth;
    } else {
      slots.month = singlePeriod || currentMonth;
    }
  } else if (detectedIntent === 'payslip_explanation') {
    // Notice: do NOT carry over leave year or leaveType when switching from leave_balance to payslip_explanation!
    const sortedPublished = Array.isArray(publishedPeriods)
      ? Array.from(new Set(publishedPeriods.filter(Boolean))).sort((a, b) => b.localeCompare(a))
      : [];
    const priorWasLatestPublished = priorContext?.lastSlots?.relativePeriodType === 'latest_published';
    if (
      inheritedFromPrior &&
      (relativePeriodType === 'previous_published' ||
        (relativePeriodType === 'previous_month' && priorWasLatestPublished)) &&
      extractedPeriods.length === 0
    ) {
      const priorPeriod = priorContext?.lastSlots?.period || sortedPublished[0] || null;
      const nextPublished =
        sortedPublished.length > 0
          ? priorPeriod
            ? sortedPublished.find((p) => p < priorPeriod) || null
            : sortedPublished[1] || null
          : priorPeriod
            ? computePreviousMonthString(priorPeriod)
            : null;
      slots.period = nextPublished;
      slots.relativePeriodType = 'previous_published';
    } else if (
      inheritedFromPrior &&
      relativePeriodType === 'previous_month' &&
      extractedPeriods.length === 0 &&
      (priorContext?.lastSlots?.period || priorContext?.lastSlots?.month)
    ) {
      slots.period =
        computePreviousMonthString(priorContext.lastSlots.period || priorContext.lastSlots.month) ||
        prevMonth;
    } else {
      slots.period = singlePeriod || null;
    }
    if (!slots.period && !relativePeriodType) {
      slots.relativePeriodType = 'latest_published';
    }
    if (slots.relativePeriodType === 'latest_published' && !slots.period && sortedPublished.length > 0) {
      slots.period = sortedPublished[0];
    }
  } else if (detectedIntent === 'payslip_comparison') {
    const sortedPublished = Array.isArray(publishedPeriods)
      ? Array.from(new Set(publishedPeriods.filter(Boolean))).sort((a, b) => b.localeCompare(a))
      : [];
    const asksExplicitThisAndPrevMonth =
      /\b(thang nay.*thang truoc|thang truoc.*thang nay|ky nay.*ky truoc|ky truoc.*ky nay)\b/i.test(normMsg);
    const asksLatestTwoPublished =
      /\b((?:2|hai)\s*(?:ky|thang)(?:\s+luong)?\s*(?:da\s+cong\s+bo\s*|chinh\s+thuc\s*)?(?:gan\s*nhat|moi\s*nhat)|ky\s+gan\s+nhat\s+(?:va|voi)\s+ky\s+(?:truoc|cong\s+bo\s+truoc|gan\s+nhat\s+truoc)|so\s+sanh\s+voi\s+ky\s+(?:cong\s+bo\s+truoc|gan\s+nhat\s+truoc)|latest\s+two|two\s+most\s+recent)\b/i.test(
        normMsg
      );

    if (extractedPeriods.length >= 2) {
      slots.comparisonPeriods = Array.from(new Set(extractedPeriods)).slice(0, 2);
      slots.relativePeriodType = null;
    } else if (asksExplicitThisAndPrevMonth && extractedPeriods.length === 0) {
      // User explicitly asked for current month vs previous month: preserve requested calendar months
      slots.comparisonPeriods = [prevMonth, currentMonth];
      slots.relativePeriodType = 'current_and_previous_month';
    } else if (asksLatestTwoPublished) {
      // AI-V1-F02: "hai kỳ gần nhất" must resolve from actor's distinct published payslips in DB, never from calendar!
      slots.relativePeriodType = 'latest_two_published';
      slots.comparisonPeriods = sortedPublished.length >= 2 ? sortedPublished.slice(0, 2) : [];
    } else if (
      extractedPeriods.length === 1 &&
      /\b(thang truoc|ky truoc|last month|previous month)\b/i.test(normMsg)
    ) {
      const prevOfExtracted = computePreviousMonthString(extractedPeriods[0]);
      if (prevOfExtracted) {
        slots.comparisonPeriods = [prevOfExtracted, extractedPeriods[0]];
      }
    } else if (
      extractedPeriods.length === 1 &&
      priorContext?.lastSlots?.period &&
      ['payslip_explanation', 'payslip_comparison'].includes(priorContext?.lastIntent) &&
      priorContext.lastSlots.period !== extractedPeriods[0]
    ) {
      slots.comparisonPeriods = [priorContext.lastSlots.period, extractedPeriods[0]];
    } else if (
      extractedPeriods.length === 0 &&
      priorContext?.lastSlots?.period &&
      ['payslip_explanation', 'payslip_comparison'].includes(priorContext?.lastIntent) &&
      /\b(thang truoc|ky truoc|last month|previous month)\b/i.test(normMsg)
    ) {
      if (priorContext?.lastSlots?.relativePeriodType === 'latest_published' && /\bky truoc\b/i.test(normMsg)) {
        slots.relativePeriodType = 'latest_two_published';
        slots.comparisonPeriods = sortedPublished.length >= 2 ? sortedPublished.slice(0, 2) : [];
      } else {
        const prevOfPrior = computePreviousMonthString(priorContext.lastSlots.period);
        if (prevOfPrior) {
          slots.comparisonPeriods = [prevOfPrior, priorContext.lastSlots.period];
        }
      }
    }
  } else if (detectedIntent === 'policy_lookup') {
    slots.period = singlePeriod || null;
    slots.policyTopic = rawMsg;
  } else if (detectedIntent === 'dashboard_summary' || detectedIntent === 'performance_summary') {
    slots.period = singlePeriod || null;
  }

  // Check if payslip_comparison is missing period slots
  if (detectedIntent === 'payslip_comparison' && slots.comparisonPeriods.length < 2 && slots.relativePeriodType !== 'latest_two_published') {
    const pPrev2 = computePreviousMonthString(prevMonth) || `${currentYear - 1}-11`;
    return {
      intent: 'payslip_comparison',
      inheritedFromPrior,
      topicSwitched,
      lostContextDetected: false,
      needsClarification: true,
      clarification: {
        slot: 'comparisonPeriods',
        question:
          extractedPeriods.length === 1
            ? `Bạn đã nêu kỳ ${extractedPeriods[0]}. Vui lòng chọn thêm kỳ lương đã công bố thứ hai để hệ thống đối chiếu:`
            : 'Vui lòng cho biết hai kỳ lương đã công bố (định dạng YYYY-MM) mà bạn muốn so sánh:',
        choices: [
          {
            label: `So sánh kỳ ${pPrev2} và ${prevMonth}`,
            query: `So sánh phiếu lương kỳ ${pPrev2} và kỳ ${prevMonth} của tôi`,
            value: `${pPrev2},${prevMonth}`,
          },
          {
            label: 'Xem phiếu lương kỳ gần nhất trước',
            query: 'Giải thích phiếu lương chính thức kỳ gần nhất của tôi',
            value: 'latest_published',
          },
        ],
      },
      slots,
    };
  }

  return {
    intent: detectedIntent,
    inheritedFromPrior,
    topicSwitched,
    lostContextDetected: false,
    needsClarification: false,
    clarification: null,
    slots,
  };
}

module.exports = {
  normalizeTextAscii,
  extractAllPeriodsFromText,
  extractIsoDatesFromText,
  extractLeaveTypeSlot,
  detectPrimaryIntent,
  isEllipticalFollowUpMessage,
  resolveIntentAndSlots,
};
