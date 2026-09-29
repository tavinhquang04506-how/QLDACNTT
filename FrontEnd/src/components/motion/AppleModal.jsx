import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export default function AppleModal({ 
  isOpen, 
  onClose, 
  title, 
  subtitle, 
  badge, 
  children, 
  maxWidth = 'max-w-4xl', 
  showClose = true 
}) {
  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
          {/* Apple-style Backdrop with smooth blur */}
          <motion.div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            onClick={onClose}
          />

          {/* Apple Spring Modal Container */}
          <motion.div
            className={`relative w-full ${maxWidth} bg-white rounded-2xl shadow-apple-modal border border-slate-200/90 overflow-hidden flex flex-col max-h-[92vh] z-10`}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ 
              type: 'spring', 
              damping: 26, 
              stiffness: 320,
              mass: 0.8
            }}
          >
            {/* Header if title provided */}
            {(title || showClose) && (
              <div className="px-6 py-4 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0">
                <div className="flex flex-col pr-4">
                  <div className="flex items-center gap-2.5">
                    {title && (
                      <h2 className="text-[17px] font-bold text-slate-900 font-display tracking-tight leading-snug">
                        {title}
                      </h2>
                    )}
                    {badge}
                  </div>
                  {subtitle && (
                    <p className="text-xs text-slate-500 mt-0.5 font-normal">
                      {subtitle}
                    </p>
                  )}
                </div>

                {showClose && (
                  <button
                    onClick={onClose}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
                    aria-label="Đóng cửa sổ"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
