import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import './globals.css'

const sans = Space_Grotesk({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

// Next.js applies basePath to <Link>/next/image but not to URLs written into metadata.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const metadata: Metadata = {
  title: 'Automata Lab — DFA, NFA, PDA and CFG',
  description: 'Separate visual labs for deterministic and nondeterministic finite automata, with NFA-to-DFA conversion.',
  icons: {
    icon: [
      {
        url: `${basePath}/icon-light-32x32.png`,
        media: '(prefers-color-scheme: light)',
      },
      {
        url: `${basePath}/icon-dark-32x32.png`,
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: `${basePath}/icon.svg`,
        type: 'image/svg+xml',
      },
    ],
    apple: `${basePath}/apple-icon.png`,
  },
}

// Light by default, whatever the system setting; dark only once someone picks it with the toggle.
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('automata-lab-theme')==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: 'white',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets the theme before first paint so a dark-theme reload does not flash light. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`antialiased ${sans.variable} ${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  )
}
