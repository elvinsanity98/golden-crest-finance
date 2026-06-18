/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan every template + client script so used classes are kept.
  content: [
    './views/**/*.ejs',
    './public/js/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        // Brand gold — metallic gold matching the logo (gold → olive, never brown)
        brand: {
          50:  '#fbf7ec',
          100: '#f6edd2',
          200: '#edd9a4',
          300: '#e2c477',
          400: '#d6ad4c',
          500: '#cf9f37',
          600: '#b1842a',
          700: '#8c6823',
          800: '#6f521f',
          900: '#54401b'
        },
        // Ink — dark teal #054E5F for dark surfaces & headings
        ink: {
          DEFAULT: '#054e5f',
          700: '#0a6275',
          800: '#053f4d',
          900: '#04323d'
        },
        royal: '#00337c',
        olive: '#898544'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  // Status colors are built by string concatenation in EJS; keep them safe.
  safelist: [
    'bg-emerald-500', 'bg-amber-400', 'bg-red-200', 'text-red-800',
    'bg-emerald-100', 'text-emerald-700', 'bg-amber-100', 'text-amber-700',
    'bg-red-100', 'text-red-700', 'bg-brand-100', 'text-brand-800',
    'bg-blue-100', 'text-blue-700', 'bg-slate-200', 'text-slate-700',
    'text-slate-900', 'ring-2', 'ring-brand-300'
  ],
  plugins: []
};
