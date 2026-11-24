import { MountParams } from '../../types/lamp';

export interface SocketE26Dimensions {
  /** Central socket hole diameter: 36 - 44 mm (default 40 mm) */
  holeDiameterMm: number;
  holeRadiusMm: number;
  /** Solid support lip thickness around the threaded socket: default 3.0 mm */
  lipThicknessMm: number;
  /** Outer radius of the solid collar hub around the E26/E27 opening */
  hubOuterRadiusMm: number;
  /** Number of radial ventilation slots / structural spokes */
  ventSlots: number;
  /** Minimum outer shell radius to safely contain the socket hub */
  minOuterRadiusMm: number;
}

export function getSocketE26Dimensions(mount: MountParams): SocketE26Dimensions {
  const holeDiameterMm = Math.max(36, Math.min(44, mount.e26Diameter));
  const holeRadiusMm = holeDiameterMm * 0.5;
  const lipThicknessMm = Math.max(2.4, Math.min(4.5, mount.e26LipThickness));
  const hubRadialWidth = 6.5; // solid collar ring for E26/E27 nut grip
  const hubOuterRadiusMm = holeRadiusMm + hubRadialWidth;
  const ventSlots = Math.max(4, Math.min(12, Math.round(mount.ventSlots)));
  const minOuterRadiusMm = hubOuterRadiusMm + Math.max(mount.wallThickness, 2.0) + 1.5;

  return {
    holeDiameterMm,
    holeRadiusMm,
    lipThicknessMm,
    hubOuterRadiusMm,
    ventSlots,
    minOuterRadiusMm,
  };
}
