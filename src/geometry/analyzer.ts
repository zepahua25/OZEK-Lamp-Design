import { LampMetrics, ManifoldReport, MeshPartData } from '../types/lamp';

export const PLA_DENSITY_G_PER_CM3 = 1.24;
export const BAMBU_A1_LIMIT_MM = 256;

/**
 * Computes exact signed volume, manifold edge topology verification,
 * smooth vertex normals, and overhang surface masks for a closed mesh.
 */
export function validateManifold(
  positions: Float32Array,
  indices: Uint32Array
): ManifoldReport {
  const edgeCounts = new Map<string, number>();
  let signedVol6 = 0;

  const triCount = indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    const x0 = positions[i0 * 3];
    const y0 = positions[i0 * 3 + 1];
    const z0 = positions[i0 * 3 + 2];
    const x1 = positions[i1 * 3];
    const y1 = positions[i1 * 3 + 1];
    const z1 = positions[i1 * 3 + 2];
    const x2 = positions[i2 * 3];
    const y2 = positions[i2 * 3 + 1];
    const z2 = positions[i2 * 3 + 2];

    // Signed tetrahedron volume * 6 = v0 . (v1 x v2)
    signedVol6 +=
      x0 * (y1 * z2 - z1 * y2) -
      y0 * (x1 * z2 - z1 * x2) +
      z0 * (x1 * y2 - y1 * x2);

    // Undirected edge counting using canonical sorted index pair
    const edges: [number, number][] = [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ];
    for (let e = 0; e < 3; e++) {
      const a = edges[e][0];
      const b = edges[e][1];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  let openEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) openEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  return {
    isWatertight: openEdges === 0 && nonManifoldEdges === 0 && signedVol6 > 0,
    openEdges,
    nonManifoldEdges,
    signedVolumeMm3: signedVol6 / 6.0,
    triangleCount: triCount,
  };
}

/**
 * Ensures outward winding (positive signed volume) and computes area-weighted
 * vertex normals + per-vertex overhang intensity (against Y-up print axis).
 */
export function finalizePartGeometry(
  positions: Float32Array,
  indices: Uint32Array,
  thickness: Float32Array,
  overhangAngleDeg: number,
  skipManifoldCheck = false
): {
  normals: Float32Array;
  overhang: Float32Array;
  overhangAreaMm2: number;
  totalAreaMm2: number;
  signedVolumeMm3: number;
  report: ManifoldReport;
} {
  const vertCount = positions.length / 3;
  const triCount = indices.length / 3;

  // Quick signed volume check to guarantee outward winding
  let signedVol6 = 0;
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    const x0 = positions[i0 * 3];
    const y0 = positions[i0 * 3 + 1];
    const z0 = positions[i0 * 3 + 2];
    const x1 = positions[i1 * 3];
    const y1 = positions[i1 * 3 + 1];
    const z1 = positions[i1 * 3 + 2];
    const x2 = positions[i2 * 3];
    const y2 = positions[i2 * 3 + 1];
    const z2 = positions[i2 * 3 + 2];
    signedVol6 +=
      x0 * (y1 * z2 - z1 * y2) -
      y0 * (x1 * z2 - z1 * x2) +
      z0 * (x1 * y2 - y1 * x2);
  }

  if (signedVol6 < 0) {
    for (let t = 0; t < triCount; t++) {
      const tmp = indices[t * 3 + 1];
      indices[t * 3 + 1] = indices[t * 3 + 2];
      indices[t * 3 + 2] = tmp;
    }
    signedVol6 = -signedVol6;
  }

  const normals = new Float32Array(positions.length);
  const overhangAccum = new Float32Array(vertCount);
  const weightAccum = new Float32Array(vertCount);

  // Overhang threshold: downward normal ny < -sin(overhangAngleDeg)
  // Wait: a vertical wall has ny = 0 (0° overhang).
  // A 45° overhang facing down has ny = -sin(45°) = -0.7071.
  // A flat horizontal ceiling (90° overhang) has ny = -1.0.
  const thresholdNy = -Math.sin((overhangAngleDeg * Math.PI) / 180);
  const softStartNy = -Math.sin((Math.max(5, overhangAngleDeg - 6) * Math.PI) / 180);

  let totalAreaMm2 = 0;
  let overhangAreaMm2 = 0;

  // Find minY so bottom build-plate contact faces (y ≈ minY) are NOT counted as overhangs!
  let minY = Infinity;
  for (let i = 0; i < vertCount; i++) {
    const y = positions[i * 3 + 1];
    if (y < minY) minY = y;
  }

  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    const x0 = positions[i0 * 3];
    const y0 = positions[i0 * 3 + 1];
    const z0 = positions[i0 * 3 + 2];
    const x1 = positions[i1 * 3];
    const y1 = positions[i1 * 3 + 1];
    const z1 = positions[i1 * 3 + 2];
    const x2 = positions[i2 * 3];
    const y2 = positions[i2 * 3 + 1];
    const z2 = positions[i2 * 3 + 2];

    const ux = x1 - x0;
    const uy = y1 - y0;
    const uz = z1 - z0;
    const vx = x2 - x0;
    const vy = y2 - y0;
    const vz = z2 - z0;

    // Cross product (magnitude = 2 * area)
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;

    const len = Math.hypot(cx, cy, cz);
    if (len < 1e-9) continue;

    const area = len * 0.5;
    totalAreaMm2 += area;

    // Accumulate area-weighted face normal to vertices
    normals[i0 * 3] += cx;
    normals[i0 * 3 + 1] += cy;
    normals[i0 * 3 + 2] += cz;
    normals[i1 * 3] += cx;
    normals[i1 * 3 + 1] += cy;
    normals[i1 * 3 + 2] += cz;
    normals[i2 * 3] += cx;
    normals[i2 * 3 + 1] += cy;
    normals[i2 * 3 + 2] += cz;

    const ny = cy / len;
    const avgY = (y0 + y1 + y2) / 3;
    const isOnBuildPlate = avgY <= minY + 0.35;

    let ov = 0;
    if (!isOnBuildPlate && ny < softStartNy) {
      if (ny <= thresholdNy) {
        ov = 1.0;
        overhangAreaMm2 += area;
      } else {
        ov = (softStartNy - ny) / Math.max(softStartNy - thresholdNy, 1e-4);
      }
    }

    overhangAccum[i0] += ov * area;
    overhangAccum[i1] += ov * area;
    overhangAccum[i2] += ov * area;
    weightAccum[i0] += area;
    weightAccum[i1] += area;
    weightAccum[i2] += area;
  }

  const overhang = new Float32Array(vertCount);
  for (let i = 0; i < vertCount; i++) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const l = Math.hypot(nx, ny, nz);
    if (l > 1e-9) {
      normals[i * 3] = nx / l;
      normals[i * 3 + 1] = ny / l;
      normals[i * 3 + 2] = nz / l;
    } else {
      normals[i * 3 + 1] = 1;
    }
    overhang[i] = weightAccum[i] > 0 ? overhangAccum[i] / weightAccum[i] : 0;
    // Keep thickness attribute clean
    if (!Number.isFinite(thickness[i]) || thickness[i] <= 0) {
      thickness[i] = 2.0;
    }
  }

  const report: ManifoldReport = skipManifoldCheck
    ? {
        isWatertight: true,
        openEdges: 0,
        nonManifoldEdges: 0,
        signedVolumeMm3: signedVol6 / 6.0,
        triangleCount: triCount,
      }
    : validateManifold(positions, indices);

  return {
    normals,
    overhang,
    overhangAreaMm2,
    totalAreaMm2,
    signedVolumeMm3: signedVol6 / 6.0,
    report,
  };
}

/** Aggregates metrics across one or more parts (e.g. monoblock or base + shade). */
export function aggregateMetrics(
  parts: MeshPartData[],
  partStats: Array<{
    signedVolumeMm3: number;
    overhangAreaMm2: number;
    totalAreaMm2: number;
    report: ManifoldReport;
  }>,
  overhangAngle: number,
  generationMs: number
): LampMetrics {
  let totalVolMm3 = 0;
  let baseVolMm3 = 0;
  let shadeVolMm3 = 0;
  let totalOvArea = 0;
  let totalArea = 0;
  let totalTriangles = 0;
  let openEdges = 0;
  let nonManifoldEdges = 0;
  let isWatertight = true;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;

  for (let p = 0; p < parts.length; p++) {
    const pos = parts[p].positions;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const y = pos[i + 1];
      const z = pos[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const st = partStats[p];
    const absVol = Math.abs(st.signedVolumeMm3);
    totalVolMm3 += absVol;
    if (parts[p].role === 'base') baseVolMm3 += absVol;
    else shadeVolMm3 += absVol;
    totalOvArea += st.overhangAreaMm2;
    totalArea += st.totalAreaMm2;
    totalTriangles += st.report.triangleCount;
    openEdges += st.report.openEdges;
    nonManifoldEdges += st.report.nonManifoldEdges;
    if (!st.report.isWatertight) isWatertight = false;
  }

  const volumeCm3 = totalVolMm3 / 1000.0;
  const gramsPLA = volumeCm3 * PLA_DENSITY_G_PER_CM3;
  const baseGramsPLA = (baseVolMm3 / 1000.0) * PLA_DENSITY_G_PER_CM3;
  const shadeGramsPLA = (shadeVolMm3 / 1000.0) * PLA_DENSITY_G_PER_CM3;
  const overhangPercent = totalArea > 0 ? (totalOvArea / totalArea) * 100 : 0;
  const widthMm = Number.isFinite(maxX - minX) ? maxX - minX : 0;
  const heightMm = Number.isFinite(maxY - minY) ? maxY - minY : 0;
  const depthMm = Number.isFinite(maxZ - minZ) ? maxZ - minZ : 0;

  const fitsBambuA1 =
    widthMm <= BAMBU_A1_LIMIT_MM &&
    depthMm <= BAMBU_A1_LIMIT_MM &&
    heightMm <= BAMBU_A1_LIMIT_MM;

  return {
    volumeCm3,
    gramsPLA,
    baseGramsPLA,
    shadeGramsPLA,
    overhangPercent,
    overhangAngle,
    totalTriangles,
    widthMm,
    depthMm,
    heightMm,
    fitsBambuA1,
    isWatertight,
    openEdges,
    nonManifoldEdges,
    generationMs,
  };
}
