import { MountParams } from '../../types/lamp';

export interface LedKit001Dimensions {
  /** Nominal 59.5 mm + tolerance (default +0.2 mm => Ø59.7 mm nominal for PLA) */
  cavityDiameterMm: number;
  cavityRadiusMm: number;
  /** Standard Bambu Lab LED Lamp Kit 001 depth: 8.5 mm */
  cavityHeightMm: number;
  /** Width of the vertical side notch in the upper cup floor for dropping the USB cord inside the base */
  cupCordNotchWidthMm: number;
  /** Central cable/ventilation bore radius underneath the upper LED cup */
  cableConduitRadiusMm: number;
  /** Thickness of the horizontal support shelf underneath the LED puck */
  cupFloorThicknessMm: number;
  /** 45° internal chamfer height transitioning cavityRadiusMm -> lightHoleRadiusMm (used in monoblock mode) */
  chamferTopMm: number;
  /** Top retainer ceiling thickness above chamfer/cavity (monoblock mode) */
  retainerThicknessMm: number;
  /** Total deck height from build plate to top of retainer (monoblock mode) */
  deckTopMm: number;
  /** Light opening radius above the LED puck (leaves 4 mm stop lip in monoblock mode) */
  lightHoleRadiusMm: number;
  /** Outer radius of the LED puck housing sleeve (when spoked ventilation is used) */
  hubOuterRadiusMm: number;
  /** USB cord exit slot dimensions at Z=0: 6.5 mm wide x 5.0 mm tall (with 45° peaked gable roof!) */
  usbSlotWidthMm: number;
  usbSlotHeightMm: number;
  /** Minimum outer base radius to contain cavity + wall safely */
  minOuterRadiusMm: number;
}

export const DEFAULT_LED_KIT_TOLERANCE_MM = 0.2; // 59.5 + 0.2 = 59.7 mm nominal for PLA

export function getLedKit001Dimensions(mount: MountParams): LedKit001Dimensions {
  const tol = Number.isFinite(mount.ledTolerance) ? mount.ledTolerance : DEFAULT_LED_KIT_TOLERANCE_MM;
  const cavityDiameterMm = 59.5 + tol;
  const cavityRadiusMm = cavityDiameterMm * 0.5;
  const cavityHeightMm = 8.5;
  const cupCordNotchWidthMm = 7.0; // 7 mm side notch to drop the USB cord down inside the base
  const cableConduitRadiusMm = Math.min(20.0, cavityRadiusMm - 7.5); // ~20 mm bore (leaves ~9.85 mm support shelf)
  const cupFloorThicknessMm = 3.2;
  const lightHoleRadiusMm = cavityRadiusMm - 4.0; // ~25.85 mm (Ø51.7 mm)
  // Exact 45° internal chamfer from cavityRadiusMm -> lightHoleRadiusMm: Δy = Δr = 4.0 mm
  const chamferDelta = Math.max(1.5, cavityRadiusMm - lightHoleRadiusMm);
  const chamferTopMm = cavityHeightMm + chamferDelta; // 12.5 mm
  const retainerThicknessMm = 2.0;
  const deckTopMm = chamferTopMm + retainerThicknessMm; // 14.5 mm
  const sleeveWall = Math.max(mount.wallThickness, 2.4);
  const hubOuterRadiusMm = cavityRadiusMm + sleeveWall;
  const usbSlotWidthMm = 6.5;
  const usbSlotHeightMm = 5.0;
  const minOuterRadiusMm = hubOuterRadiusMm + 1.2;

  return {
    cavityDiameterMm,
    cavityRadiusMm,
    cavityHeightMm,
    cupCordNotchWidthMm,
    cableConduitRadiusMm,
    cupFloorThicknessMm,
    chamferTopMm,
    retainerThicknessMm,
    deckTopMm,
    lightHoleRadiusMm,
    hubOuterRadiusMm,
    usbSlotWidthMm,
    usbSlotHeightMm,
    minOuterRadiusMm,
  };
}
