/**
 * Deterministic 3D Simplex Noise with seedable permutation table and Domain Warping.
 * Zero external dependencies — runs cleanly inside Web Workers and Node tests.
 */

const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

const GRAD3: ReadonlyArray<[number, number, number]> = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SimplexNoise3D {
  private readonly perm = new Uint8Array(512);
  private readonly permMod12 = new Uint8Array(512);

  constructor(seed = 1337) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    const rng = mulberry32(Math.floor(seed));
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  /** Returns smooth 3D simplex noise in approximately [-1, 1]. */
  noise3D(xin: number, yin: number, zin: number): number {
    const perm = this.perm;
    const permMod12 = this.permMod12;

    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;

    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n0 = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      const gi0 = GRAD3[permMod12[ii + perm[jj + perm[kk]]]];
      t0 *= t0;
      n0 = t0 * t0 * (gi0[0] * x0 + gi0[1] * y0 + gi0[2] * z0);
    }

    let n1 = 0;
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      const gi1 = GRAD3[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]];
      t1 *= t1;
      n1 = t1 * t1 * (gi1[0] * x1 + gi1[1] * y1 + gi1[2] * z1);
    }

    let n2 = 0;
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      const gi2 = GRAD3[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]];
      t2 *= t2;
      n2 = t2 * t2 * (gi2[0] * x2 + gi2[1] * y2 + gi2[2] * z2);
    }

    let n3 = 0;
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      const gi3 = GRAD3[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]];
      t3 *= t3;
      n3 = t3 * t3 * (gi3[0] * x3 + gi3[1] * y3 + gi3[2] * z3);
    }

    return 32.0 * (n0 + n1 + n2 + n3);
  }

  /** Smooth fBM with 2 octaves for sculpted fluid waves */
  fbm3D(x: number, y: number, z: number): number {
    return (
      0.68 * this.noise3D(x, y, z) +
      0.32 * this.noise3D(x * 2.03 + 11.7, y * 2.03 - 7.3, z * 2.03 + 5.1)
    );
  }

  /** Domain-warped scalar field producing sweeping organic contour ribbons */
  warpedField(x: number, y: number, z: number, warpStrength: number): number {
    if (warpStrength <= 0.001) {
      return this.fbm3D(x, y, z);
    }
    const qx = this.noise3D(x + 3.1, y - 1.7, z + 5.2);
    const qy = this.noise3D(x - 4.8, y + 2.9, z - 2.3);
    const qz = this.noise3D(x + 1.4, y + 6.3, z - 4.1);
    return this.fbm3D(
      x + warpStrength * qx,
      y + warpStrength * qy,
      z + warpStrength * qz
    );
  }
}
