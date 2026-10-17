/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#F4F6FA",
        surface: "#FFFFFF",
        surface2: "#F8FAFC",
        border: "#E2E8F0",
        ink: "#0F172A",
        muted: "#5B6B80",
        faint: "#8A99AD",
        primary: {
          DEFAULT: "#3E4FE3",
          hover: "#3340C4",
          soft: "#EEF1FE",
          ring: "#6B7BFF"
        },
        accent: "#7C3AED",
        pay: { DEFAULT: "#0B8F5F", soft: "#E7F8F0", line: "#9FD9C0" },
        escalate: { DEFAULT: "#B8770B", soft: "#FDF4E3", line: "#E7C98C" },
        block: { DEFAULT: "#C22F2F", soft: "#FDECEC", line: "#EBB4B4" },
        info: "#0E7FA8"
      },
      fontFamily: {
        sans: ['"Fira Sans"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"Fira Code"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15,23,42,0.04), 0 4px 16px -6px rgba(15,23,42,0.08)",
        drawer: "-24px 0 60px -24px rgba(15,23,42,0.18)",
        modal: "0 24px 60px -20px rgba(15,23,42,0.28)"
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "slide-in": {
          "0%": { transform: "translateX(24px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" }
        },
        rise: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        },
        "pulse-ring": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(11,143,95,0.28)" },
          "50%": { boxShadow: "0 0 0 6px rgba(11,143,95,0)" }
        }
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "slide-in": "slide-in 260ms cubic-bezier(0.22,1,0.36,1)",
        rise: "rise 240ms ease-out both",
        "pulse-ring": "pulse-ring 2.4s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
