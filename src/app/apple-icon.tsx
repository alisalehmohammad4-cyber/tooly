import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
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
          borderRadius: 36,
          border: '5px solid #dbeafe',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Soft blue glow */}
        <div
          style={{
            position: 'absolute',
            top: -20,
            right: -20,
            width: 90,
            height: 90,
            borderRadius: '50%',
            backgroundColor: '#2563eb',
            opacity: 0.12,
          }}
        />

        {/* Blue Tool Badge Container */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 82,
            height: 82,
            borderRadius: 18,
            backgroundColor: '#2563eb',
            boxShadow: '0 8px 16px rgba(37, 99, 235, 0.35)',
            marginBottom: 8,
          }}
        >
          <svg
            width="48"
            height="48"
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
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: '0.12em',
            color: '#1e3a8a',
            lineHeight: 1,
            textTransform: 'uppercase',
          }}
        >
          TOOLY
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
