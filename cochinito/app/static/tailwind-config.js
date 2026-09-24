if (window.tailwind) {
    tailwind.config = {
        corePlugins: { preflight: false },
        theme: {
            extend: {
                colors: {
                    cream: 'var(--bg)', coral: 'var(--primary)',
                    lavender: 'var(--lavender)', ink: 'var(--ink)'
                },
                borderRadius: { card: '24px', pill: '999px' },
                fontFamily: {
                    serif: ['Instrument Serif', 'serif'],
                    sans: ['Plus Jakarta Sans', 'sans-serif']
                }
            }
        }
    };
}
