import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { Providers } from '@/components/Providers'

const OG_IMAGE = 'https://restaurante-sumak.vercel.app/logo-sumak-dark.jpg'
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
        width: 1024,
        height: 1024,
        alt: 'Restaurante Sumak — Comida Boliviana & Andina',
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

const MAPS_URL = 'https://www.google.com/maps/place/SUMAK/@-32.8949139,-68.8292403,19.5z/data=!4m6!3m5!1s0x967e09a1dd6eefdd:0x698ad41b5908215c!8m2!3d-32.8949528!4d-68.8286573!16s%2Fg%2F11xgssdlt9'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Restaurant',
  name: 'Restaurante Sumak',
  url: SITE_URL,
  menu: SITE_URL,
  hasMap: MAPS_URL,
  servesCuisine: ['Bolivian', 'Andean'],
  priceRange: '$',
  currenciesAccepted: 'ARS',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Juan B Alberdi 247',
    addressLocality: 'Guaymallén',
    addressRegion: 'Mendoza',
    postalCode: 'M5519',
    addressCountry: 'AR',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: -32.8949528,
    longitude: -68.8286573,
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
