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
      
      // Custom animations
      keyframes: {
        'scroll-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px #FF4400' },
          '50%': { boxShadow: '0 0 16px #FF4400' },
        },
      },
      animation: {
        'scroll-up': 'scroll-up 0.5s ease-out forwards',
        'blink': 'blink 1s step-end infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
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

