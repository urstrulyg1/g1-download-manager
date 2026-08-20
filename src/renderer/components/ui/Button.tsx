import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'amber' | 'emerald';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'sm',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold rounded-xl select-none transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';

  const variantStyles = {
    primary:
      'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/25 focus:ring-blue-500 border border-blue-500/30',
    secondary:
      'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:border-slate-600 focus:ring-slate-500',
    outline:
      'bg-transparent hover:bg-slate-800/60 text-slate-300 border border-slate-700 hover:border-slate-500 focus:ring-slate-400',
    ghost:
      'bg-transparent hover:bg-slate-800/60 text-slate-300 hover:text-white focus:ring-slate-500',
    danger:
      'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/25 focus:ring-rose-500 border border-rose-500/30',
    amber:
      'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-md shadow-amber-600/25 focus:ring-amber-500 border border-amber-500/30',
    emerald:
      'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/25 focus:ring-emerald-500 border border-emerald-500/30',
  };

  const sizeStyles = {
    xs: 'px-2.5 py-1 text-[11px] gap-1.5',
    sm: 'px-3.5 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-xs gap-2',
    lg: 'px-5 py-2.5 text-sm gap-2.5',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : leftIcon}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
};
