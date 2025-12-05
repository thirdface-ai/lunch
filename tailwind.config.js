/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // Spacing scale based on 4px/8px base unit (Dieter Rams inspired)
      spacing: {
        '0': '0',
        '1': '4px',      // 0.25rem - Tight spacing
        '2': '8px',      // 0.5rem  - Default small
        '3': '12px',     // 0.75rem - Medium-small
        '4': '16px',     // 1rem    - Default medium
        '5': '20px',     // 1.25rem - Medium
        '6': '24px',     // 1.5rem  - Large
        '7': '28px',     // 1.75rem
        '8': '32px',     // 2rem    - XL
        '10': '40px',    // 2.5rem  - XXL
        '12': '48px',    // 3rem    - Section spacing
        '16': '64px',    // 4rem    - Major sections
        '20': '80px',    // 5rem    - Page sections
        '24': '96px',    // 6rem    - Hero spacing
      },
      
      // Braun-inspired color palette
      colors: {
        // Light theme
        'braun-bg': '#EFEFE8',
        'braun-surface': '#F9F9F7',
        'braun-border': '#D4D4D0',
        'braun-dark': '#3D3D3D',
        'braun-text': '#5A5A5A',
        'braun-text-muted': '#8A8A8A',
        'braun-orange': '#FF4400',
        
        // Dark theme
        'dark-bg': '#0A0A0A',
        'dark-surface': '#141414',
        'dark-border': '#2A2A2A',
        'dark-text': '#E0E0E0',
        'dark-text-muted': '#707070',
      },
      
      // Custom shadows
      boxShadow: {
        'braun-deep': '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        'dark-deep': '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
        'braun-raised': '0 3px 0 #D4D4D0',
        'dark-raised': '0 3px 0 #2A2A2A',
      },
      
      // Typography
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'monospace'],
      },
      
      // Custom animations - Dieter Rams Inspired
      // Principle: Subtle, purposeful, elegant - less but better
      keyframes: {
        // Entrance animations
        'scroll-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-scale': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        
        // Indicator animations
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px #FF4400' },
          '50%': { boxShadow: '0 0 16px #FF4400' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'breathe': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.02)', opacity: '0.9' },
        },
        
        // Button press animation
        'press': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.97)' },
          '100%': { transform: 'scale(1)' },
        },
        'press-deep': {
          '0%': { transform: 'scale(1) translateY(0)' },
          '50%': { transform: 'scale(0.98) translateY(1px)' },
          '100%': { transform: 'scale(1) translateY(0)' },
        },
        
        // Loading/Progress animations
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'progress-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        
        // Stagger entrance for lists
        'stagger-fade': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        
        // Industrial/mechanical feel
        'mechanical-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '60%': { opacity: '1', transform: 'translateY(1px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'indicator-on': {
          '0%': { opacity: '0', boxShadow: '0 0 0 #FF4400' },
          '50%': { opacity: '1', boxShadow: '0 0 12px #FF4400' },
          '100%': { opacity: '1', boxShadow: '0 0 6px #FF4400' },
        },
        
        // Screen/CRT effect
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'flicker': {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.8' },
          '94%': { opacity: '1' },
        },
      },
      animation: {
        // Entrances
        'scroll-up': 'scroll-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in-scale': 'fade-in-scale 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-left': 'slide-in-left 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        
        // Indicators
        'blink': 'blink 1s step-end infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'breathe': 'breathe 3s ease-in-out infinite',
        
        // Interactive
        'press': 'press 0.15s ease-out',
        'press-deep': 'press-deep 0.2s ease-out',
        
        // Loading
        'shimmer': 'shimmer 2s linear infinite',
        'progress-pulse': 'progress-pulse 1.5s ease-in-out infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
        
        // Lists
        'stagger-fade': 'stagger-fade 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        
        // Industrial
        'mechanical-in': 'mechanical-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'indicator-on': 'indicator-on 0.3s ease-out forwards',
        
        // Effects
        'scanline': 'scanline 8s linear infinite',
        'flicker': 'flicker 4s linear infinite',
      },
      
      // Custom timing functions for that premium feel
      transitionTimingFunction: {
        'bounce-sm': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'snap': 'cubic-bezier(0.7, 0, 0.3, 1)',
      },
      
      // Border radius following Dieter Rams (minimal, functional)
      borderRadius: {
        'none': '0',
        'sm': '2px',
        'DEFAULT': '4px',
        'md': '6px',
        'lg': '8px',
      },
    },
  },
  plugins: [],
};

