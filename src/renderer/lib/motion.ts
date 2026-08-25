/**
 * G1DM Motion & Design Tokens
 * Centralized easing, durations, and animation definitions for UI/UX consistency.
 */

export const MotionTokens = {
  duration: {
    instant: 75,
    fast: 150,
    normal: 250,
    slow: 400,
    modal: 200,
  },
  easing: {
    standard: 'cubic-bezier(0.16, 1, 0.3, 1)',
    decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  transition: {
    fast: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
    normal: 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)',
    slow: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
    transform: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
    opacity: 'opacity 150ms ease-out',
    colors: 'color 150ms ease-in-out, background-color 150ms ease-in-out, border-color 150ms ease-in-out',
  },
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
    pill: 'rounded-full',
  },
  shadow: {
    subtle: 'shadow-sm',
    card: 'shadow-md shadow-slate-950/20',
    elevated: 'shadow-xl shadow-slate-950/30',
    glowBlue: 'shadow-lg shadow-blue-500/20',
    glowCyan: 'shadow-lg shadow-cyan-500/20',
    glowEmerald: 'shadow-lg shadow-emerald-500/20',
  },
} as const;

export type MotionDuration = keyof typeof MotionTokens.duration;
export type MotionEasing = keyof typeof MotionTokens.easing;
