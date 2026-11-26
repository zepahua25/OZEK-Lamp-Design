import React from 'react';
import { LampFamilyId } from '../types/lamp';

interface FamilyThumbnailProps {
  family: LampFamilyId;
}

export const FamilyThumbnail: React.FC<FamilyThumbnailProps> = ({ family }) => {
  if (family === 'pleated') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <linearGradient id="pl-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f5ede4" />
            <stop offset="100%" stopColor="#e6d6c7" />
          </linearGradient>
          <linearGradient id="pl-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#94472a" />
            <stop offset="45%" stopColor="#cc6e46" />
            <stop offset="100%" stopColor="#853c22" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="10" fill="url(#pl-bg)" />
        <rect x="21" y="38" width="22" height="16" rx="2" fill="url(#pl-body)" />
        <rect x="13" y="13" width="38" height="27" rx="3" fill="url(#pl-body)" />
        {[17, 22, 27, 32, 37, 42, 47].map((x) => (
          <line key={x} x1={x} y1="14" x2={x} y2="39" stroke="#f6c39c" strokeOpacity="0.45" strokeWidth="1.6" />
        ))}
      </svg>
    );
  }

  if (family === 'japanese_flute') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <linearGradient id="jp-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f6f1ea" />
            <stop offset="100%" stopColor="#e5ddd1" />
          </linearGradient>
          <radialGradient id="jp-shade" cx="50%" cy="52%" r="48%">
            <stop offset="0%" stopColor="#fff8e3" />
            <stop offset="65%" stopColor="#f2e4c9" />
            <stop offset="100%" stopColor="#d9c6a9" />
          </radialGradient>
        </defs>
        <rect width="64" height="64" rx="10" fill="url(#jp-bg)" />
        <path d="M18 54 C18 43, 24 38, 32 38 C40 38, 46 43, 46 54 Z" fill="#b45a36" />
        <path
          d="M24 12 L40 12 L53 38 Q48 42 43 38 Q37 42 32 38 Q27 42 21 38 Q16 42 11 38 Z"
          fill="url(#jp-shade)"
          stroke="#c8b392"
          strokeWidth="0.9"
        />
        {[26, 29, 32, 35, 38].map((x, idx) => (
          <line
            key={x}
            x1={x}
            y1="13"
            x2={18 + idx * 7}
            y2="37"
            stroke="#c4ab87"
            strokeOpacity="0.55"
            strokeWidth="0.9"
          />
        ))}
      </svg>
    );
  }

  if (family === 'helical') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <linearGradient id="he-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8f1e6" />
            <stop offset="100%" stopColor="#eadbc7" />
          </linearGradient>
          <radialGradient id="he-glow" cx="50%" cy="48%" r="48%">
            <stop offset="0%" stopColor="#ffca64" />
            <stop offset="55%" stopColor="#c45c11" />
            <stop offset="100%" stopColor="#6e2c06" />
          </radialGradient>
        </defs>
        <rect width="64" height="64" rx="10" fill="url(#he-bg)" />
        <path d="M25 39 L39 39 L42 56 L22 56 Z" fill="#27272a" />
        <rect x="14" y="11" width="36" height="28" rx="3" fill="url(#he-glow)" />
        {[-6, 0, 6, 12, 18, 24, 30, 36].map((o) => (
          <line
            key={o}
            x1={14 + o}
            y1="39"
            x2={24 + o}
            y2="11"
            stroke="#ffe09e"
            strokeOpacity="0.42"
            strokeWidth="2.1"
          />
        ))}
      </svg>
    );
  }

  if (family === 'louvers') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <linearGradient id="lv-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#262629" />
            <stop offset="100%" stopColor="#141416" />
          </linearGradient>
          <radialGradient id="lv-core" cx="50%" cy="50%" r="42%">
            <stop offset="0%" stopColor="#ffe599" />
            <stop offset="55%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#3f2711" />
          </radialGradient>
        </defs>
        <rect width="64" height="64" rx="10" fill="url(#lv-bg)" />
        <rect x="15" y="11" width="34" height="42" rx="5" fill="url(#lv-core)" />
        {[17, 22, 27, 32, 37, 42, 47].map((x) => (
          <path
            key={x}
            d={`M${x} 11 C${x - 4} 24, ${x + 5} 38, ${x - 1} 53`}
            fill="none"
            stroke="#27272a"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        ))}
      </svg>
    );
  }

  if (family === 'origami') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <linearGradient id="og-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#eef2f6" />
            <stop offset="100%" stopColor="#dce2e9" />
          </linearGradient>
          <linearGradient id="og-lit" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e8dcc8" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="10" fill="url(#og-bg)" />
        <rect x="22" y="42" width="20" height="12" rx="2" fill="#9ca3af" />
        {/* Faceted Yoshimura origami diamonds */}
        <polygon points="32,10 47,20 32,30 17,20" fill="url(#og-lit)" stroke="#b4a795" strokeWidth="1" />
        <polygon points="17,20 32,30 18,42 12,30" fill="#e5d7be" stroke="#b4a795" strokeWidth="1" />
        <polygon points="47,20 52,30 46,42 32,30" fill="#d9c6a6" stroke="#b4a795" strokeWidth="1" />
        <polygon points="32,30 46,42 32,44 18,42" fill="#fff7e6" stroke="#b4a795" strokeWidth="1" />
      </svg>
    );
  }

  if (family === 'woven') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <linearGradient id="wo-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ecebe9" />
            <stop offset="100%" stopColor="#d8d5d0" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="10" fill="url(#wo-bg)" />
        <ellipse cx="32" cy="46" rx="15" ry="10" fill="#2c2e33" />
        <path d="M23 12 L41 12 L52 38 L12 38 Z" fill="#1e2024" />
        {[16, 20, 24, 28, 32, 36].map((y, row) =>
          [16, 23, 30, 37, 44].map((x) => (
            <rect
              key={`${row}-${x}`}
              x={x + (row % 2 === 0 ? 0 : 3.2)}
              y={y}
              width="5.2"
              height="2.1"
              rx="1"
              fill="#d99748"
              fillOpacity="0.65"
            />
          ))
        )}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className="w-full h-full">
      <defs>
        <linearGradient id="or-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2c241d" />
          <stop offset="100%" stopColor="#1b1612" />
        </linearGradient>
        <radialGradient id="or-sphere" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="55%" stopColor="#f8b957" />
          <stop offset="100%" stopColor="#b06a29" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="10" fill="url(#or-bg)" />
      <circle cx="32" cy="32" r="21" fill="url(#or-sphere)" />
      <path d="M15 26 C22 18, 34 38, 48 22" fill="none" stroke="#fff9e2" strokeOpacity="0.72" strokeWidth="2.2" />
      <path d="M13 36 C25 26, 36 46, 51 33" fill="none" stroke="#8f4c16" strokeOpacity="0.45" strokeWidth="1.8" />
    </svg>
  );
};
