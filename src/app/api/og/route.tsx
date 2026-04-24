import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  // Fetch the logo (dark version with black background) to embed in the OG image
  const logoUrl = 'https://restaurante-sumak.vercel.app/logo-sumak-dark.jpg'

  let logoData: string | null = null
  try {
    const res = await fetch(logoUrl)
    if (res.ok) {
      const buf = await res.arrayBuffer()
      // Edge-compatible base64 encoding
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      logoData = `data:image/jpeg;base64,${base64}`
    }
  } catch {
    // fall through to text-only layout
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #3E1C00 0%, #6B3A1F 50%, #8B4A10 100%)',
          fontFamily: 'serif',
          position: 'relative',
        }}
      >
        {/* Decorative top border */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '8px',
            background: '#C8962E',
          }}
        />
        {/* Decorative bottom border */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '8px',
            background: '#C8962E',
          }}
        />

        {/* Logo or fallback */}
        {logoData ? (
          <img
            src={logoData}
            width={420}
            height={200}
            style={{ objectFit: 'contain', marginBottom: '24px' }}
          />
        ) : (
          <div
            style={{
              fontSize: '80px',
              marginBottom: '20px',
            }}
          >
            🍽️
          </div>
        )}

        {/* Divider */}
        <div
          style={{
            width: '120px',
            height: '3px',
            background: '#C8962E',
            marginBottom: '20px',
            borderRadius: '2px',
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            fontSize: '32px',
            color: '#E8C888',
            textAlign: 'center',
            fontStyle: 'italic',
            letterSpacing: '1px',
          }}
        >
          Comida Boliviana &amp; Andina
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
