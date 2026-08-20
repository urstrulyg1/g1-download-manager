import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'cyan' | 'purple' | 'neutral' | 'amber';
  size?: 'sm' | 'md';
  className?: string;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  className = '',
  icon,
}) => {
  const variantStyles = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    info: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    neutral: 'bg-slate-800 text-slate-300 border-slate-700/80',
  };

  const sizeStyles = {
    sm: 'text-[10px] font-bold px-2 py-0.5 rounded-full',
    md: 'text-xs font-semibold px-2.5 py-1 rounded-lg',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 border font-mono uppercase tracking-wider select-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
};
