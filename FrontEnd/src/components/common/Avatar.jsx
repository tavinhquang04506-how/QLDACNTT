import React, { useState } from 'react';
import { getSafeAvatar, getInitials, getGradientForName } from '../../utils/avatarUtils';

export default function Avatar({
  src,
  name = 'Nhân viên',
  id = '',
  size = 'md', // 'xs', 'sm', 'md', 'lg', 'xl', '2xl'
  className = '',
  statusBadge = null, // 'online', 'busy', 'offline' or custom node
  shape = 'circle', // 'circle', 'rounded'
}) {
  const [hasError, setHasError] = useState(false);
  const safeSrc = getSafeAvatar(src, name, id);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm font-bold',
    lg: 'w-12 h-12 text-base font-bold',
    xl: 'w-14 h-14 text-lg font-bold',
    '2xl': 'w-20 h-20 text-2xl font-bold',
  };

  const currentSizeClass = sizeClasses[size] || sizeClasses.md;
  const roundedClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const initials = getInitials(name);
  const gradientClass = getGradientForName(name);

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {!hasError && safeSrc ? (
        <img
          src={safeSrc}
          alt={name}
          onError={() => setHasError(true)}
          className={`${currentSizeClass} ${roundedClass} object-cover ring-1 ring-slate-200/90 shadow-2xs transition-transform duration-200`}
          loading="lazy"
        />
      ) : (
        <div
          className={`${currentSizeClass} ${roundedClass} bg-gradient-to-tr ${gradientClass} text-white flex items-center justify-center font-bold tracking-wider shadow-2xs ring-1 ring-white/20 select-none`}
          title={name}
        >
          {initials}
        </div>
      )}

      {/* Optional Status Badge */}
      {statusBadge === 'online' && (
        <span className="absolute bottom-0 right-0 block w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
      )}
      {statusBadge === 'busy' && (
        <span className="absolute bottom-0 right-0 block w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
      )}
      {typeof statusBadge === 'object' && statusBadge}
    </div>
  );
}
