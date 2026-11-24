import { MountParams } from '../../types/lamp';

export interface LedKit001Dimensions {
  /** Nominal 59.5 mm + tolerance (-0.5..+0.5 mm) */
  cavityDiameterMm: number;
  cavityRadiusMm: number;
  /** Standard Bambu Lab LED Lamp Kit 001 depth: 8.5 mm */
  cavityHeightMm: number;
  /** Top retainer ceiling thickness above cavity */
  retainerThicknessMm: number;
  /** Total deck height from build plate to top of retainer */
  deckTopMm: number;
  /** Light opening radius above the LED puck (leaves 4 mm stop lip) */
  lightHoleRadiusMm: number;
  /** Outer radius of the LED puck housing sleeve (when spoked ventilation is used) */
  hubOuterRadiusMm: number;
  /** USB cord exit slot dimensions: 6 mm wide x 4 mm tall */
  usbSlotWidthMm: number;
  usbSlotHeightMm: number;
  /** Minimum outer base radius to contain cavity + wall safely */
  minOuterRadiusMm: number;
}

export function getLedKit001Dimensions(mount: MountParams): LedKit001Dimensions {
  const cavityDiameterMm = 59.5 + mount.ledTolerance;
  const cavityRadiusMm = cavityDiameterMm * 0.5;
  const cavityHeightMm = 8.5;
  const retainerThicknessMm = 2.4;
  const deckTopMm = cavityHeightMm + retainerThicknessMm; // 10.9 mm
  const lightHoleRadiusMm = cavityRadiusMm - 4.0; // ~25.75 mm (Ø51.5 mm)
  const sleeveWall = Math.max(mount.wallThickness, 2.4);
  const hubOuterRadiusMm = cavityRadiusMm + sleeveWall;
  const usbSlotWidthMm = 6.0;
  const usbSlotHeightMm = 4.0;
  const minOuterRadiusMm = hubOuterRadiusMm + 1.2;

  return {
    cavityDiameterMm,
    cavityRadiusMm,
    cavityHeightMm,
    retainerThicknessMm,
    deckTopMm,
    lightHoleRadiusMm,
    hubOuterRadiusMm,
    usbSlotWidthMm,
    usbSlotHeightMm,
    minOuterRadiusMm,
  };
}
