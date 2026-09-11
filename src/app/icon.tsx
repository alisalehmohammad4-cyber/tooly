import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          borderRadius: 96,
          border: '14px solid #dbeafe',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Ambient blue background soft glow */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            right: -60,
            width: 320,
            height: 320,
            borderRadius: '50%',
            backgroundColor: '#2563eb',
            opacity: 0.1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -80,
            left: -80,
            width: 300,
            height: 300,
            borderRadius: '50%',
            backgroundColor: '#1d4ed8',
            opacity: 0.08,
          }}
        />

        {/* Blue Tool Badge Container */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 220,
            height: 220,
            borderRadius: 44,
            backgroundColor: '#2563eb',
            boxShadow: '0 20px 40px rgba(37, 99, 235, 0.35)',
            marginBottom: 20,
            position: 'relative',
          }}
        >
          {/* Tool SVG in crisp white */}
          <svg
            width="130"
            height="130"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            <path d="m19 19-4-4" />
            <circle cx="18" cy="18" r="3" fill="#ffffff" fillOpacity="0.3" />
          </svg>
        </div>

        {/* Brand Name in Blue */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 4,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              letterSpacing: '0.12em',
              color: '#1e3a8a',
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            TOOLY
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 10,
              padding: '6px 18px',
              backgroundColor: '#eff6ff',
              borderRadius: 20,
              border: '1px solid #bfdbfe',
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '0.24em',
                color: '#2563eb',
                textTransform: 'uppercase',
              }}
            >
              ASSET CORE
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
