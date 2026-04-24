import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { Providers } from '@/components/Providers'

const OG_IMAGE = 'https://restaurante-sumak.vercel.app/api/og'
const SITE_URL = 'https://restaurante-sumak.vercel.app'

export const metadata: Metadata = {
  title: 'Restaurante Sumak — Comida Boliviana & Andina',
  description: 'Menú auténtico boliviano: Silpancho, Pique Macho, Sopa de Maní y más. Pedí online o por WhatsApp.',
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: 'Restaurante Sumak — Comida Boliviana & Andina',
    description: 'Menú auténtico boliviano: Silpancho, Pique Macho, Sopa de Maní y más. Pedí online o por WhatsApp.',
    url: SITE_URL,
    siteName: 'Restaurante Sumak',
    locale: 'es_AR',
    type: 'website',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Pique Macho — Restaurante Sumak',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Restaurante Sumak — Comida Boliviana & Andina',
    description: 'Menú auténtico boliviano: Silpancho, Pique Macho, Sopa de Maní y más. Pedí online o por WhatsApp.',
    images: [OG_IMAGE],
  },
  icons: {
    icon: [
      { url: '/logo-sumak.png', type: 'image/png' }
    ],
    apple: '/logo-sumak.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#3E1C00',
  colorScheme: 'light',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Restaurant',
  name: 'Restaurante Sumak',
  url: SITE_URL,
  menu: SITE_URL,
  servesCuisine: ['Bolivian', 'Andean'],
  priceRange: '$',
  currenciesAccepted: 'ARS',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '',
    addressLocality: '',
    addressCountry: 'AR',
  },
  image: OG_IMAGE,
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
        <Script
          id="json-ld-restaurant"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans antialiased bg-sumak-cream text-sumak-brown selection:bg-sumak-gold selection:text-sumak-brown">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
