import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { MeshPartData } from '../types/lamp';

/**
 * Converts a Y-up Three.js MeshPartData (in mm) to Bambu Studio Z-up coordinates (1 unit = 1 mm),
 * shifts its lowest Z face cleanly onto Z = 0.00 mm (build plate), centers X/Y around 0,
 * and serializes to a compact Binary STL ArrayBuffer using Three.js STLExporter.
 */
export function exportPartToBinarySTL(part: MeshPartData): ArrayBuffer {
  const geom = new THREE.BufferGeometry();
  const srcPos = part.positions;
  const vertCount = srcPos.length / 3;
  const zUpPos = new Float32Array(srcPos.length);

  // Rotate +90° around X axis: (x, y, z)_ThreeJS_Yup -> (x, -z, y)_BambuStudio_Zup
  // Verify right-handed determinant: det([[1,0,0],[0,0,-1],[0,1,0]]) = +1 (preserves outward winding!)
  let minZ = Infinity;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (let i = 0; i < vertCount; i++) {
    const x = srcPos[i * 3];
    const y = srcPos[i * 3 + 1];
    const z = srcPos[i * 3 + 2];

    const bx = x;
    const by = -z;
    const bz = y;

    zUpPos[i * 3] = bx;
    zUpPos[i * 3 + 1] = by;
    zUpPos[i * 3 + 2] = bz;

    if (bz < minZ) minZ = bz;
    if (bx < minX) minX = bx;
    if (bx > maxX) maxX = bx;
    if (by < minY) minY = by;
    if (by > maxY) maxY = by;
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;

  // Snap base onto Z = 0 and center X/Y on build plate
  for (let i = 0; i < vertCount; i++) {
    zUpPos[i * 3] -= cx;
    zUpPos[i * 3 + 1] -= cy;
    zUpPos[i * 3 + 2] -= minZ;
  }

  geom.setAttribute('position', new THREE.BufferAttribute(zUpPos, 3));
  geom.setIndex(new THREE.BufferAttribute(part.indices, 1));
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom);
  const exporter = new STLExporter();
  const dataView = exporter.parse(mesh, { binary: true }) as DataView;

  geom.dispose();
  const copy = new Uint8Array(dataView.byteLength);
  copy.set(new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength));
  return copy.buffer;
}

export function triggerBinaryDownload(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
