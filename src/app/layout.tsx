import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sumak | Restaurante Boliviano',
  description: 'Auténtica cocina boliviana. Pedidos en línea — Sopas, Platos Principales, Empanadas, Acompañamientos y Bebidas. Cantidades en tiempo real.',
  openGraph: {
    title: 'Sumak | Restaurante Boliviano',
    description: 'Auténtica cocina boliviana. Pedidos en línea.',
    type: 'website',
    locale: 'es_CO',
  },
  icons: {
    icon: [
      { url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍽️</text></svg>' }
    ]
  },
}

export const viewport: Viewport = {
  themeColor: '#3E1C00',
  colorScheme: 'light',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        {/* Preconnect for faster font loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-sumak-cream text-sumak-brown selection:bg-sumak-gold selection:text-sumak-brown">
        {children}
      </body>
    </html>
  )
}
