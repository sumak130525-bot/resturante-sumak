import type { Metadata } from 'next'
import { Providers } from '@/components/Providers'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Menú — Restaurante Sumak',
  description: 'Carta digital del Restaurante Sumak',
  robots: { index: false, follow: false },
}

/**
 * Fullscreen layout — sin header, footer ni scrollbar del sitio principal.
 * Se usa exclusivamente para /menu-display (TV / tablet en el local).
 */
export default function MenuDisplayLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          html, body { overflow: hidden; height: 100%; }
          ::-webkit-scrollbar { display: none; }
          * { scrollbar-width: none; }
        `}</style>
      </head>
      <body className="font-sans antialiased bg-black text-white selection:bg-sumak-gold selection:text-sumak-brown">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
