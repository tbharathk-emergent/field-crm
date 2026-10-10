/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Work Sans"', 'system-ui', 'sans-serif'],
        display: ['Outfit', '"Work Sans"', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))', '2': 'hsl(var(--chart-2))', '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))', '5': 'hsl(var(--chart-5))',
        },
        // Channel form ("r g b") so opacity modifiers such as bg-brand-primary/10
        // generate real CSS. The -rgb variables mirror the hex ones in index.css
        // and are kept in sync at runtime by applyTenantTheme().
        brand: {
          primary: 'rgb(var(--brand-primary-rgb, 44 94 67) / <alpha-value>)',
          'primary-hover': 'rgb(var(--brand-primary-hover-rgb, 30 66 47) / <alpha-value>)',
          secondary: 'rgb(var(--brand-secondary-rgb, 211 84 0) / <alpha-value>)',
          'secondary-hover': 'rgb(var(--brand-secondary-hover-rgb, 168 67 0) / <alpha-value>)',
          surface: 'rgb(var(--brand-surface-rgb, 255 255 255) / <alpha-value>)',
          bg: 'rgb(var(--brand-bg-rgb, 249 248 246) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink-rgb, 28 40 51) / <alpha-value>)',
          mute: 'rgb(var(--brand-mute-rgb, 86 101 115) / <alpha-value>)',
          line: 'rgb(var(--brand-line-rgb, 229 231 235) / <alpha-value>)',
          success: '#27AE60',
          warning: '#F1C40F',
          error: '#E74C3C',
          info: '#2980B9',
        },
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.4s ease-out',
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    // `desktop:` follows the active shell (sidebar web shell), not just the
    // viewport: lib/platform.js sets html.is-desktop only on wide web windows,
    // never inside the native apps. Use it for anything tied to the shell
    // itself (sticky offsets, fixed bars); use the normal breakpoints for
    // content that should simply grow with the available width.
    require("tailwindcss/plugin")(({ addVariant }) => {
      addVariant("desktop", "html.is-desktop &");
    }),
  ],
};
