import React, { useRef, useState } from 'react';
import { SplineControlPoint } from '../../types/lamp';
import {
  SILHOUETTE_SPLINE_TEMPLATES,
  evaluateMonotoneSpline,
} from '../../geometry/silhouette';

interface SilhouetteCurveEditorProps {
  points: SplineControlPoint[];
  heightMm: number;
  dark?: boolean;
  onChange: (points: SplineControlPoint[]) => void;
  onCommit: () => void;
}

const SVG_W = 280;
const SVG_H = 152;
const CENTER_X = SVG_W / 2;
const PAD_Y = 14;
const DRAW_H = SVG_H - PAD_Y * 2;
const MAX_R_MM = 118;
const MIN_R_MM = 26;
const HALF_DRAW_W = SVG_W / 2 - 16;

function rToDx(rMm: number): number {
  return (Math.max(0, Math.min(MAX_R_MM, rMm)) / MAX_R_MM) * HALF_DRAW_W;
}

function dxToR(dx: number): number {
  const raw = (Math.abs(dx) / HALF_DRAW_W) * MAX_R_MM;
  return Math.round(Math.max(MIN_R_MM, Math.min(MAX_R_MM, raw)));
}

function vToY(v: number): number {
  return PAD_Y + (1 - Math.max(0, Math.min(1, v))) * DRAW_H;
}

function yToV(y: number): number {
  return Math.max(0, Math.min(1, 1 - (y - PAD_Y) / DRAW_H));
}

export const SilhouetteCurveEditor: React.FC<SilhouetteCurveEditorProps> = ({
  points,
  heightMm,
  dark = false,
  onChange,
  onCommit,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const safePoints: SplineControlPoint[] =
    points && points.length >= 2
      ? points
      : SILHOUETTE_SPLINE_TEMPLATES.amphora.points;

  // Build smooth mirrored SVG silhouette path from monotone cubic spline
  const samples = 44;
  const rightPts: string[] = [];
  const leftPts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const v = i / samples;
    const r = evaluateMonotoneSpline(v, safePoints);
    const y = vToY(v);
    const dx = rToDx(r);
    rightPts.push(`${(CENTER_X + dx).toFixed(1)},${y.toFixed(1)}`);
    leftPts.unshift(`${(CENTER_X - dx).toFixed(1)},${y.toFixed(1)}`);
  }
  const fillPath = `M ${rightPts[0]} L ${rightPts.slice(1).join(' L ')} L ${leftPts.join(' L ')} Z`;
  const rightCurvePath = `M ${rightPts.join(' L ')}`;

  const updateFromPointer = (clientX: number, clientY: number, idx: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xSvg = ((clientX - rect.left) / Math.max(rect.width, 1)) * SVG_W;
    const ySvg = ((clientY - rect.top) / Math.max(rect.height, 1)) * SVG_H;

    const next = safePoints.map((pt) => ({ ...pt }));
    const rNew = dxToR(Math.max(12, xSvg - CENTER_X));
    next[idx].r = rNew;

    // Allow vertical dragging for interior control points while keeping strict monotonic order
    if (idx > 0 && idx < next.length - 1) {
      const minV = next[idx - 1].v + 0.08;
      const maxV = next[idx + 1].v - 0.08;
      next[idx].v = Number(Math.max(minV, Math.min(maxV, yToV(ySvg))).toFixed(2));
    }

    onChange(next);
  };

  const templates = Object.entries(SILHOUETTE_SPLINE_TEMPLATES) as Array<
    [keyof typeof SILHOUETTE_SPLINE_TEMPLATES, { label: string; points: SplineControlPoint[] }]
  >;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span
          className={`text-[12px] font-medium ${dark ? 'text-zinc-200' : 'text-zinc-700'}`}
        >
          Silueta 2D interactiva
        </span>
        <span
          className={`font-mono-num text-[10.5px] ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
        >
          Arrastra los puntos · H {Math.round(heightMm)} mm
        </span>
      </div>

      {/* Interactive SVG Canvas */}
      <div
        className={`rounded-2xl border overflow-hidden select-none touch-none ${
          dark
            ? 'bg-zinc-950/70 border-zinc-700/70'
            : 'bg-zinc-900/[0.03] border-zinc-900/[0.08]'
        }`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-[142px] block"
          onPointerMove={(e) => {
            if (draggingIdx === null) return;
            updateFromPointer(e.clientX, e.clientY, draggingIdx);
          }}
          onPointerUp={() => {
            if (draggingIdx !== null) {
              setDraggingIdx(null);
              onCommit();
            }
          }}
          onPointerLeave={() => {
            if (draggingIdx !== null) {
              setDraggingIdx(null);
              onCommit();
            }
          }}
        >
          {/* Subtle gridlines */}
          {[0.25, 0.5, 0.75].map((v) => (
            <line
              key={v}
              x1={16}
              x2={SVG_W - 16}
              y1={vToY(v)}
              y2={vToY(v)}
              stroke={dark ? '#3f3f46' : '#d4d4d8'}
              strokeDasharray="3 3"
              strokeWidth="0.8"
            />
          ))}

          {/* Center symmetry axis */}
          <line
            x1={CENTER_X}
            x2={CENTER_X}
            y1={8}
            y2={SVG_H - 8}
            stroke={dark ? '#52525b' : '#a1a1aa'}
            strokeDasharray="2 3"
            strokeWidth="1"
          />

          {/* Filled lamp silhouette preview */}
          <path
            d={fillPath}
            fill={dark ? 'rgba(251, 191, 36, 0.14)' : 'rgba(245, 158, 11, 0.14)'}
            stroke={dark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(24, 24, 27, 0.2)'}
            strokeWidth="1.2"
          />

          {/* Active right spline highlight */}
          <path
            d={rightCurvePath}
            fill="none"
            stroke={dark ? '#fbbf24' : '#18181b'}
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* Draggable control handles on right side + mirror dots on left */}
          {safePoints.map((pt, idx) => {
            const cx = CENTER_X + rToDx(pt.r);
            const cy = vToY(pt.v);
            const mx = CENTER_X - rToDx(pt.r);
            const isActive = draggingIdx === idx;

            return (
              <g key={idx}>
                {/* Mirror dot */}
                <circle
                  cx={mx}
                  cy={cy}
                  r={2.4}
                  fill={dark ? '#71717a' : '#a1a1aa'}
                />
                {/* Guide line to axis when dragging */}
                {isActive && (
                  <line
                    x1={CENTER_X}
                    x2={cx}
                    y1={cy}
                    y2={cy}
                    stroke="#f59e0b"
                    strokeWidth="1"
                  />
                )}
                {/* Hit area + visible handle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={12}
                  fill="transparent"
                  className="cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDraggingIdx(idx);
                    updateFromPointer(e.clientX, e.clientY, idx);
                  }}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 6.2 : 4.8}
                  fill={isActive ? '#f59e0b' : dark ? '#fbbf24' : '#18181b'}
                  stroke="#ffffff"
                  strokeWidth="1.8"
                  className="pointer-events-none"
                />
                {isActive && (
                  <text
                    x={Math.min(SVG_W - 34, cx + 10)}
                    y={Math.max(18, cy - 8)}
                    fontSize="10"
                    fontWeight="600"
                    fill={dark ? '#fde68a' : '#18181b'}
                  >
                    Ø{pt.r * 2}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 6 One-Click Quick Silhouette Templates (including Esfera / Orbe) */}
      <div className="grid grid-cols-3 gap-1">
        {templates.map(([key, tpl]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onChange(tpl.points.map((p) => ({ ...p })));
              onCommit();
            }}
            className={`py-1 px-1 rounded-lg text-[10.5px] font-medium border transition-colors ${
              dark
                ? 'border-zinc-700/70 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-200'
                : 'border-zinc-900/10 bg-white hover:bg-zinc-100 text-zinc-700'
            }`}
          >
            {tpl.label}
          </button>
        ))}
      </div>
    </div>
  );
};
