import { LampConfig, LampFamilyId } from '../types/lamp';
import type { SolidMeshBuilder } from './baseBuilder';

export interface ExtraGeometryContext {
  mb: SolidMeshBuilder;
  config: LampConfig;
  seatY: number;
  shadeHeight: number;
  draft: boolean;
  invertedForPendant: boolean;
}

export interface DisplacementContext {
  /** Normalized angle u in [0, 1) */
  u: number;
  /** Angle in radians [0, 2*PI) */
  theta: number;
  /** Normalized height v in [0, 1] along the full lamp silhouette */
  v: number;
  /** Physical height y in mm */
  y: number;
  /** Base silhouette radius at (theta, v) before pattern displacement */
  baseRadius: number;
  /** Total lamp height in mm */
  height: number;
  /** True when the mesh grid rings have already been rotated along the helix (do not add twistAtV again!) */
  gridTwisted?: boolean;
}

export interface DisplacementResult {
  /** Radial displacement of the outer wall in mm */
  outerOffset: number;
  /** Modulation of inner wall offset (0 = completely smooth continuous inner wall, 1 = constant wall thickness) */
  innerFollow: number;
  /**
   * Optional explicit wall thickness mode (e.g. Basketweave):
   * keeps the inner wall completely smooth at `baseR - nominalWall` while placing the outer wall
   * at `rIn + explicitWallThicknessMm` (e.g. 0.8 mm in translucent valleys to 2.2 mm on rounded crests).
   */
  explicitWallThicknessMm?: number;
  /**
   * Optional uniform thin-wall thickness override (e.g. Japanese Flute 0.8 - 2.4 mm):
   * keeps uniform translucent pleated wall following outerOffset cleanly.
   */
  uniformWallThicknessMm?: number;
}

export interface LampFamilyDefinition {
  id: LampFamilyId;
  name: string;
  shortName: string;
  tagline: string;
  /** Recommended grid resolution for interactive draft vs final/export */
  getResolution(config: LampConfig, draft: boolean): {
    radialSegs: number;
    heightSegs: number;
  };
  /** Creates a stateful evaluator (e.g. pre-seeded simplex noise) for one mesh build */
  createEvaluator(config: LampConfig): (ctx: DisplacementContext) => DisplacementResult;
  /** Optional post-pass to append watertight sculpted fins/ribbons anchored into the smooth diffuser core */
  appendExtraGeometry?(ctx: ExtraGeometryContext): void;
  /** Optional axial twist in radians so solidBuilder rotates mesh rings directly along the helix (CAD-grade zero aliasing!) */
  getAxialTwistRad?(config: LampConfig): number;
  /** Whether bottom spoked ventilation is requested for this family */
  wantsBottomVentilation?(config: LampConfig): boolean;
}

const familyRegistry = new Map<LampFamilyId, LampFamilyDefinition>();

export function registerLampFamily(def: LampFamilyDefinition): void {
  familyRegistry.set(def.id, def);
}

export function getLampFamily(id: LampFamilyId): LampFamilyDefinition {
  const def = familyRegistry.get(id);
  if (!def) {
    throw new Error(`Lamp family "${id}" is not registered.`);
  }
  return def;
}

export function listLampFamilies(): LampFamilyDefinition[] {
  return Array.from(familyRegistry.values());
}
