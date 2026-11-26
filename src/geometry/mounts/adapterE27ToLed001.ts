import { MeshPartData, MountParams } from '../../types/lamp';
import { finalizePartGeometry } from '../analyzer';
import {
  ProfileNode,
  SolidMeshBuilder,
  buildClosedRevolutionWithOptionalCordSlot,
} from '../baseBuilder';
import { getLedKit001Dimensions } from './ledKit001';
import { getSocketE26Dimensions } from './socketE26';

/**
 * Generates a standalone 100% watertight, support-free **Universal E27 ↔ Bambu LED Kit 001 Adapter**:
 *  - Lower cylindrical stem (Ø e26Diameter - 0.7 mm, default Ø 39.8 mm, height 10.0 mm)
 *    drops cleanly into any E26/E27 Ø 40.5 mm lamp base socket hole.
 *  - 45° self-supporting outward conical flare expands smoothly to the upper cup.
 *  - Upper circular cup houses the Bambu Lab LED Lamp Kit 001 (Ø 59.7 mm nominal × 8.5 mm deep).
 *  - Central Ø 24 mm bore passes the USB cable straight down through the E27 base cord slot!
 * Prints upright flat on Z = 0 with 0% supports!
 */
export function generateAdapterE27ToLed001(mount: MountParams): {
  part: MeshPartData;
  gramsPLA: number;
  isWatertight: boolean;
  openEdges: number;
  nonManifoldEdges: number;
} {
  const mb = new SolidMeshBuilder();
  const N = 128;

  const led = getLedKit001Dimensions(mount);
  const e26 = getSocketE26Dimensions(mount);

  const rStemOut = Math.max(17.2, e26.holeRadiusMm - 0.35); // Ø 39.8 mm for Ø 40.5 mm E27 hole
  const rWireBore = 12.0; // Ø 24 mm generous pass-through for USB-A / inline switch plug
  const stemH = 10.0;

  const rCupIn = led.cavityRadiusMm; // ~29.85 mm (Ø 59.7 mm nominal)
  const cupWall = 2.6;
  const rCupOut = rCupIn + cupWall; // ~32.45 mm
  const cupDepth = led.cavityHeightMm; // 8.5 mm

  // Exact 45° outward flare: Δy = rCupOut - rStemOut
  const flareH = Math.max(8.0, rCupOut - rStemOut);
  const yCupFloor = stemH + flareH;
  const yTop = yCupFloor + cupDepth;

  // Inner cone rises at strictly <= 45° from rWireBore (at y=stemH) to rCupIn (at y=yCupFloor)
  // Check Δr_in = rCupIn - rWireBore ≈ 17.85 mm; ensure inner start Y allows <= 45° slope!
  const innerFlareDrop = Math.min(yCupFloor - 2.0, rCupIn - rWireBore);
  const yInnerFlareStart = yCupFloor - innerFlareDrop;

  // Small top lip chamfer & bottom entry lead-in chamfer for effortless insertion into E27 base
  const outer: ProfileNode[] = [
    { y: 0, r: rStemOut - 0.6 },
    { y: 1.0, r: rStemOut },
    { y: stemH, r: rStemOut },
    // Small 1.8 mm flange lip right at stemH so the adapter seats solidly on top of the E27 ceiling
    { y: stemH + 1.8, r: rStemOut + 1.8 },
    { y: yCupFloor, r: rCupOut },
    { y: yTop - 0.6, r: rCupOut },
    { y: yTop, r: rCupOut - 0.6 },
  ];

  const inner: ProfileNode[] = [
    { y: yTop, r: rCupIn + 0.4 },
    { y: yTop - 0.6, r: rCupIn },
    { y: yCupFloor, r: rCupIn },
    // 45° internal cone funnel guiding the USB cable cleanly down the center bore!
    { y: yInnerFlareStart, r: rWireBore },
    { y: 0, r: rWireBore },
  ];

  buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, null);

  const raw = mb.buildBuffers(undefined);
  const fin = finalizePartGeometry(raw.positions, raw.indices, raw.thickness, 45, false);

  const part: MeshPartData = {
    name: 'adapter',
    role: 'base',
    positions: raw.positions,
    normals: fin.normals,
    indices: raw.indices,
    thickness: raw.thickness,
    overhang: fin.overhang,
  };

  const gramsPLA = (Math.abs(fin.signedVolumeMm3) / 1000.0) * 1.24;

  return {
    part,
    gramsPLA,
    isWatertight: fin.report.isWatertight,
    openEdges: fin.report.openEdges,
    nonManifoldEdges: fin.report.nonManifoldEdges,
  };
}
