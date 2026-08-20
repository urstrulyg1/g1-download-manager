/**
 * G1DM Centralized Motion Design System
 * Defines durations, easing curves, transition presets, and reduced-motion behaviors.
 */

export const motionTokens = {
  durations: {
    instant: 50,
    micro: 100,
    fast: 150,
    normal: 250,
    slow: 350,
    emphasis: 450,
  },
  easings: {
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)', // Soft deceleration
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Subtle non-bouncy spring
    linear: 'linear',
  },
  presets: {
    fade: {
      transition: 'opacity 150ms cubic-bezier(0.16, 1, 0.3, 1)',
    },
    scaleFade: {
      transition: 'opacity 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1)',
    },
    slideFade: {
      transition: 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
    },
    panelSlide: {
      transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1), opacity 250ms cubic-bezier(0.16, 1, 0.3, 1)',
    },
  },
};

export class MotionManager {
  private static reducedMotionEnabled = false;

  public static setReducedMotion(enabled: boolean): void {
    this.reducedMotionEnabled = enabled;
  }

  public static isReducedMotion(): boolean {
    if (this.reducedMotionEnabled) return true;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }

  public static getTransition(preset: keyof typeof motionTokens.presets): string {
    if (this.isReducedMotion()) {
      return 'opacity 50ms linear';
    }
    return motionTokens.presets[preset].transition;
  }
}
