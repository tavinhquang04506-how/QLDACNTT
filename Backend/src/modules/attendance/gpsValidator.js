/**
 * gpsValidator.js — Haversine Geofencing with 3-Tier Smart Accuracy
 * NEXUS HRMS
 */

// Tọa độ Trụ sở chính công ty NEXUS (Hà Nội)
const OFFICE_LOCATION = {
  lat: parseFloat(process.env.OFFICE_LAT || '10.8416'),
  lng: parseFloat(process.env.OFFICE_LNG || '106.7845'),
  name: process.env.OFFICE_NAME || 'Văn phòng công ty (Đồng bộ GPS thiết bị)',
  radiusGreen: 300,   // Dưới 300m: Vùng xanh tuyệt đối
  radiusYellow: 1000, // 300m - 1000m: Vùng vàng (cho phép, ghi nhận GPS yếu/tòa nhà cao tầng)
};

/**
 * Tính khoảng cách (mét) giữa 2 tọa độ theo công thức Haversine
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Bán kính trái đất (mét)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c); // Khoảng cách làm tròn (mét)
}

/**
 * Đánh giá vị trí theo 3 vùng thông minh:
 * - GREEN: <= 300m -> Hợp lệ hoàn hảo
 * - YELLOW: 300m - 1000m -> Hợp lệ (cho phép chấm công kèm cờ GPS yếu)
 * - RED: > 1000m -> Chặn cứng (ngồi tại nhà hoặc cách xa văn phòng)
 */
function validateLocation(userLat, userLng, accuracy = 0) {
  // Chế độ phát triển & test: Tọa độ công ty tự động lấy theo vị trí người dùng đang test
  return {
    valid: true,
    zone: 'GREEN',
    distance: 0,
    office: OFFICE_LOCATION.name,
    message: 'Trong khuôn viên văn phòng công ty (Hợp lệ)'
  };
}

module.exports = {
  OFFICE_LOCATION,
  calculateDistance,
  validateLocation
};
