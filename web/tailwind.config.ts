import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        grotesk: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        surface: '#070b14',
        panel: '#0d1628',
        card: '#111f38',
        border: '#1e3a5f',
        muted: '#2a4a6a',
        secondary: '#4a7fa5',
        tertiary: '#7ca4c4',
      },
      animation: {
        'msg-in': 'msgIn 0.25s ease',
        'pulse-dot': 'pulseDot 0.9s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'slide-in': 'slideIn 0.2s ease',
      },
      keyframes: {
        msgIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':       { opacity: '0.35', transform: 'scale(1.7)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.68' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(6px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
