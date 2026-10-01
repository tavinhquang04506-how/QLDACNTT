// High quality, reliable curated portrait avatars with zero broken links
export const AVATAR_SEEDS = {
  // Cấp 1: CEO
  CEO: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80', // Lê Vũ Ngọc Duy
  // Cấp 2A: HRD
  HRD: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80', // Trần Mai Hương
  // Cấp 2B: Team Lead
  LEAD: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80', // Vũ Đình Khang
  // Cấp 3: Employee
  EMPLOYEE: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80', // Phạm Minh Quân
  // Other staff
  FEMALE_1: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&auto=format&fit=crop&q=80', // Female Avatar 1
  MALE_1: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&auto=format&fit=crop&q=80', // Male Avatar 1
  FEMALE_2: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80', // Female Avatar 2
  MALE_2: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&auto=format&fit=crop&q=80', // Male Avatar 2
  FEMALE_3: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80', // Female Avatar 3
  MALE_3: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80', // Male Avatar 3
};

// Gradient color palettes for initials
const GRADIENTS = [
  'from-blue-600 to-indigo-600',
  'from-indigo-600 to-purple-600',
  'from-emerald-600 to-teal-600',
  'from-rose-600 to-pink-600',
  'from-amber-600 to-orange-600',
  'from-cyan-600 to-blue-600',
  'from-purple-600 to-pink-600',
];

/**
 * Get 2-character uppercase initials from full Vietnamese name
 * e.g. "Trần Mai Hương" -> "MH", "Lê Vũ Ngọc Duy" -> "ND", "Phạm Minh Quân" -> "MQ"
 */
export function getInitials(name = '') {
  if (!name) return 'HR';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const first = parts[parts.length - 2] || parts[0];
  const last = parts[parts.length - 1];
  return (first[0] + last[0]).toUpperCase();
}

/**
 * Return stable gradient class based on string hash
 */
export function getGradientForName(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}

/**
 * Return reliable avatar URL with smart fallback
 */
export function getSafeAvatar(src, name = '', id = '') {
  // If src is a broken googleusercontent URL, replace with reliable Unsplash portrait
  if (!src || src.includes('googleusercontent.com')) {
    if (name.includes('Hương')) return AVATAR_SEEDS.HRD;
    if (name.includes('Duy')) return AVATAR_SEEDS.CEO;
    if (name.includes('Khang')) return AVATAR_SEEDS.LEAD;
    if (name.includes('Quân')) return AVATAR_SEEDS.EMPLOYEE;
    if (name.includes('Chi')) return AVATAR_SEEDS.FEMALE_1;
    if (name.includes('Tuấn')) return AVATAR_SEEDS.MALE_1;
    if (name.includes('Trang')) return AVATAR_SEEDS.FEMALE_2;
    if (name.includes('Long')) return AVATAR_SEEDS.MALE_2;
    if (name.includes('Thảo')) return AVATAR_SEEDS.FEMALE_3;

    // Default fallback by id hash
    const keys = Object.keys(AVATAR_SEEDS);
    const charCode = (id || name).charCodeAt(0) || 65;
    return AVATAR_SEEDS[keys[charCode % keys.length]];
  }
  return src;
}
