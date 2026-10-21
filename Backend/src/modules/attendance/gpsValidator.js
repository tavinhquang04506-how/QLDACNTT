/**
 * gpsValidator.js — Haversine Geofencing with 3-Tier Smart Accuracy (F06)
 * NEXUS HRMS
 */

const OFFICE_LOCATION = {
  lat: parseFloat(process.env.OFFICE_LAT || '10.7700'),
  lng: parseFloat(process.env.OFFICE_LNG || '106.7000'),
  name: process.env.OFFICE_NAME || 'Tòa nhà NEXUS Tower',
  radiusGreen: 250,   // Dưới 250m (hoặc theo system_settings.gps_radius_meters): Vùng xanh
  radiusYellow: 1000, // Vùng vàng (cho phép kèm cảnh báo sai số GPS tòa nhà)
};

function isValidCoord(val, min, max) {
  return typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max;
}

/**
 * Tính khoảng cách (mét) giữa 2 tọa độ theo công thức Haversine
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Bán kính trái đất (mét)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Đánh giá vị trí theo 3 vùng thông minh (F06):
 * - Hỗ trợ tọa độ 0 (lat === 0 hoặc lng === 0) như số hợp lệ, không coi 0 là falsy.
 * - Đọc cấu hình bán kính & tọa độ văn phòng từ options (system_settings).
 * - GREEN: <= radiusGreen -> Hợp lệ
 * - YELLOW: <= radiusYellow -> Hợp lệ (ghi nhận sai số GPS)
 * - RED: > radiusYellow -> Chặn chấm công
 */
function validateLocation(userLat, userLng, accuracy = 0, options = {}) {
  const lat = typeof userLat === 'string' && userLat.trim() !== '' ? Number(userLat) : userLat;
  const lng = typeof userLng === 'string' && userLng.trim() !== '' ? Number(userLng) : userLng;

  if (!isValidCoord(lat, -90, 90) || !isValidCoord(lng, -180, 180)) {
    return {
      valid: false,
      zone: 'RED',
      distance: null,
      office: options.officeName || OFFICE_LOCATION.name,
      message: 'Tọa độ GPS không hợp lệ',
    };
  }

  const officeLat = isValidCoord(Number(options.officeLat), -90, 90)
    ? Number(options.officeLat)
    : OFFICE_LOCATION.lat;
  const officeLng = isValidCoord(Number(options.officeLng), -180, 180)
    ? Number(options.officeLng)
    : OFFICE_LOCATION.lng;
  const officeName = options.officeName || OFFICE_LOCATION.name;
  const radiusGreen = Number(options.radiusGreen) > 0 ? Number(options.radiusGreen) : OFFICE_LOCATION.radiusGreen;
  const radiusYellow =
    Number(options.radiusYellow) > 0
      ? Number(options.radiusYellow)
      : Math.max(radiusGreen * 3, OFFICE_LOCATION.radiusYellow);

  const distance = calculateDistance(lat, lng, officeLat, officeLng);
  const gpsJitter = Math.min(Math.max(Number(accuracy) || 0, 0), 100);
  const effectiveDistance = Math.max(0, distance - gpsJitter);

  if (effectiveDistance <= radiusGreen) {
    return {
      valid: true,
      zone: 'GREEN',
      distance,
      office: officeName,
      message: `Trong khuôn viên văn phòng công ty (${distance}m — Hợp lệ)`,
    };
  }

  if (effectiveDistance <= radiusYellow) {
    return {
      valid: true,
      zone: 'YELLOW',
      distance,
      office: officeName,
      message: `Trong bán kính mở rộng văn phòng (${distance}m — Hợp lệ kèm sai số GPS)`,
    };
  }

  return {
    valid: false,
    zone: 'RED',
    distance,
    office: officeName,
    message: `Vị trí hiện tại cách văn phòng ${distance}m, vượt quá bán kính cho phép (${radiusGreen}m)`,
  };
}

module.exports = {
  OFFICE_LOCATION,
  calculateDistance,
  validateLocation,
};
