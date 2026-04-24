import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
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

        {/* Emoji icon */}
        <div
          style={{
            fontSize: '80px',
            marginBottom: '20px',
          }}
        >
          🍽️
        </div>

        {/* Main title */}
        <div
          style={{
            fontSize: '72px',
            fontWeight: 'bold',
            color: '#F5E6C8',
            letterSpacing: '-1px',
            textAlign: 'center',
            lineHeight: 1.1,
            marginBottom: '16px',
            textShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          Restaurante Sumak
        </div>

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
