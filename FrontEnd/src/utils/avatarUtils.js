export const DEFAULT_AVATAR_URL = '/default-avatar.jpg';

// Unified default avatar for all accounts across the system
export const AVATAR_SEEDS = {
  CEO: DEFAULT_AVATAR_URL,
  HRD: DEFAULT_AVATAR_URL,
  LEAD: DEFAULT_AVATAR_URL,
  EMPLOYEE: DEFAULT_AVATAR_URL,
  FEMALE_1: DEFAULT_AVATAR_URL,
  MALE_1: DEFAULT_AVATAR_URL,
  FEMALE_2: DEFAULT_AVATAR_URL,
  MALE_2: DEFAULT_AVATAR_URL,
  FEMALE_3: DEFAULT_AVATAR_URL,
  MALE_3: DEFAULT_AVATAR_URL,
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
 * Return unified default avatar URL
 */
export function getSafeAvatar(src) {
  if (!src || src.includes('googleusercontent.com') || src.includes('unsplash.com') || src.includes('pravatar.cc')) {
    return DEFAULT_AVATAR_URL;
  }
  return src;
}
