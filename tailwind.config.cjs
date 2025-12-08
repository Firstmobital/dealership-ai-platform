module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        messageAppear: {
          "0%": { opacity: 0, transform: "translateY(6px)" },
          "100%": { opacity: 1, transform: "translateY(0px)" }
        }
      },
      animation: {
        messageAppear: "messageAppear 0.25s ease-out"
      },
      colors: {
        primary: '#1F2937',
        accent: '#7C3AED',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444'
      }
    }
  },
  plugins: []
};
