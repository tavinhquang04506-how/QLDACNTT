/**
 * R17: Canonical server baseline normalization and diff patch builder for SettingsPage.
 * Ensures client never initializes or submits sample defaults when GET /api/settings failed.
 */
export function normalizeServerSettingsBaseline(d) {
  if (!d || typeof d !== 'object') return null;
  return {
    autoApproveOT: Boolean(d.autoApproveOT ?? d.auto_approve_ot ?? false),
    lateGraceMinutes: Number(d.lateGraceMinutes ?? d.late_grace_minutes),
    maxOtPerMonth: Number(d.maxOtPerMonth ?? d.max_ot_per_month),
    faceConfidenceThreshold: Number(d.faceConfidenceThreshold ?? d.face_confidence_threshold),
    gpsRadiusMeters: Number(d.gpsRadiusMeters ?? d.gps_radius_meters),
    officeLat: Number(d.officeLat ?? d.office_lat),
    officeLng: Number(d.officeLng ?? d.office_lng),
    officeName: String(d.officeName ?? d.office_name ?? '').trim(),
    personalIncomeTaxDeduction: Number(d.personalIncomeTaxDeduction ?? d.personal_income_tax_deduction),
    dependentDeduction: Number(d.dependentDeduction ?? d.dependent_deduction),
    defaultAllowances: Number(d.defaultAllowances ?? d.default_allowances),
    policyEffectiveFrom: String(d.policyEffectiveFrom ?? d.policy_effective_from ?? '').trim(),
    updated_at: d.updated_at || null,
  };
}

export function canSubmitSettingsSave({ canEditSettings, saving, loading, hasLoadedBaseline, serverBaseline, loadError }) {
  return Boolean(
    canEditSettings &&
      !saving &&
      !loading &&
      hasLoadedBaseline &&
      serverBaseline &&
      typeof serverBaseline === 'object' &&
      !loadError
  );
}

export function buildSettingsPatch(serverBaseline, currentForm) {
  if (!serverBaseline || typeof serverBaseline !== 'object') {
    throw new Error('SETTINGS_BASELINE_MISSING: Chưa tải dữ liệu cấu hình từ máy chủ');
  }
  const normalizedCurrent = {
    autoApproveOT: Boolean(currentForm.autoApproveOT),
    lateGraceMinutes: Number(currentForm.lateGraceMinutes),
    maxOtPerMonth: Number(currentForm.maxOtPerMonth),
    faceConfidenceThreshold: Number(currentForm.faceConfidenceThreshold),
    gpsRadiusMeters: Number(currentForm.gpsRadiusMeters),
    officeLat: Number(currentForm.officeLat),
    officeLng: Number(currentForm.officeLng),
    officeName: String(currentForm.officeName ?? '').trim(),
    personalIncomeTaxDeduction: Number(currentForm.personalIncomeTaxDeduction),
    dependentDeduction: Number(currentForm.dependentDeduction),
    defaultAllowances: Number(currentForm.defaultAllowances),
    policyEffectiveFrom: String(currentForm.policyEffectiveFrom ?? '').trim(),
  };

  const patch = {};
  for (const [key, val] of Object.entries(normalizedCurrent)) {
    if (typeof val === 'number' && Number.isNaN(val)) continue;
    if (!Object.is(val, serverBaseline[key])) {
      patch[key] = val;
    }
  }

  // If no field differed from baseline, include policyEffectiveFrom from baseline so explicit save remains valid
  if (Object.keys(patch).length === 0) {
    patch.policyEffectiveFrom = serverBaseline.policyEffectiveFrom;
  }

  if (serverBaseline.updated_at) {
    patch.expectedUpdatedAt = serverBaseline.updated_at;
  }

  return patch;
}
