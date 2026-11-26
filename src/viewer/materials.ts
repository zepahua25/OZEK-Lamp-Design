import * as THREE from 'three';
import { MaterialPresetId } from '../types/lamp';

export interface MaterialPresetSpec {
  id: MaterialPresetId;
  name: string;
  shortName: string;
  swatchHex: string;
  swatchRingHex: string;
  color: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  translucency: number;
  absorption: number;
  glowTint: string;
  opacity: number;
}

export const MATERIAL_PRESETS: Record<MaterialPresetId, MaterialPresetSpec> = {
  ozek_sand: {
    id: 'ozek_sand',
    name: 'Arena Natural (OZ☰K)',
    shortName: 'Arena',
    swatchHex: '#F5F2EB',
    swatchRingHex: '#D8D0C2',
    color: '#F5F2EB',
    roughness: 0.7,
    metalness: 0.0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.6,
    translucency: 0.96,
    absorption: 0.32,
    glowTint: '#ffd088',
    opacity: 1.0,
  },
  ozek_onyx: {
    id: 'ozek_onyx',
    name: 'Gris Ónice (OZ☰K)',
    shortName: 'Ónice',
    swatchHex: '#252525',
    swatchRingHex: '#101010',
    color: '#252525',
    roughness: 0.6,
    metalness: 0.04,
    clearcoat: 0.14,
    clearcoatRoughness: 0.45,
    translucency: 0.16,
    absorption: 0.68,
    glowTint: '#ffaa4d',
    opacity: 1.0,
  },
  ozek_copper: {
    id: 'ozek_copper',
    name: 'Cobre / Bronce (OZ☰K)',
    shortName: 'Cobre',
    swatchHex: '#C87D55',
    swatchRingHex: '#8C4E2E',
    color: '#C87D55',
    roughness: 0.36,
    metalness: 0.52,
    clearcoat: 0.28,
    clearcoatRoughness: 0.3,
    translucency: 0.22,
    absorption: 0.56,
    glowTint: '#ff9648',
    opacity: 1.0,
  },
  pla_white: {
    id: 'pla_white',
    name: 'PLA Blanco Mate',
    shortName: 'Blanco',
    swatchHex: '#f3eee4',
    swatchRingHex: '#d6cdc0',
    color: '#f2ece1',
    roughness: 0.72,
    metalness: 0.0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.65,
    translucency: 0.92,
    absorption: 0.34,
    glowTint: '#ffcf86',
    opacity: 1.0,
  },
  amber_translucent: {
    id: 'amber_translucent',
    name: 'Ámbar Translúcido',
    shortName: 'Ámbar',
    swatchHex: '#c6681c',
    swatchRingHex: '#8a3e07',
    color: '#a34a0e',
    roughness: 0.2,
    metalness: 0.04,
    clearcoat: 0.88,
    clearcoatRoughness: 0.14,
    translucency: 1.2,
    absorption: 0.24,
    glowTint: '#ff9624',
    opacity: 0.92,
  },
  smoked_amber: {
    id: 'smoked_amber',
    name: 'Ahumado Translúcido',
    shortName: 'Ahumado',
    swatchHex: '#5a595c',
    swatchRingHex: '#2f2e32',
    color: '#4e4d52',
    roughness: 0.18,
    metalness: 0.08,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
    translucency: 1.15,
    absorption: 0.25,
    glowTint: '#ffa538',
    opacity: 0.9,
  },
  terracotta: {
    id: 'terracotta',
    name: 'Terracota',
    shortName: 'Terracota',
    swatchHex: '#b85c38',
    swatchRingHex: '#873d20',
    color: '#b45a36',
    roughness: 0.82,
    metalness: 0.0,
    clearcoat: 0.02,
    clearcoatRoughness: 0.8,
    translucency: 0.45,
    absorption: 0.46,
    glowTint: '#ff7a33',
    opacity: 1.0,
  },
  olive_green: {
    id: 'olive_green',
    name: 'Verde Olivo',
    shortName: 'Olivo',
    swatchHex: '#53684d',
    swatchRingHex: '#354530',
    color: '#4e6348',
    roughness: 0.78,
    metalness: 0.0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.7,
    translucency: 0.4,
    absorption: 0.5,
    glowTint: '#c8be62',
    opacity: 1.0,
  },
  sand_wood: {
    id: 'sand_wood',
    name: 'Madera / Arena',
    shortName: 'Arena',
    swatchHex: '#dfc194',
    swatchRingHex: '#b08e5d',
    color: '#d9b98b',
    roughness: 0.84,
    metalness: 0.0,
    clearcoat: 0.02,
    clearcoatRoughness: 0.8,
    translucency: 0.32,
    absorption: 0.55,
    glowTint: '#ffcf88',
    opacity: 1.0,
  },
  stone_gray: {
    id: 'stone_gray',
    name: 'Piedra / Concreto',
    shortName: 'Piedra',
    swatchHex: '#b5b5b2',
    swatchRingHex: '#848480',
    color: '#b4b4b0',
    roughness: 0.88,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.9,
    translucency: 0.12,
    absorption: 0.72,
    glowTint: '#ffd294',
    opacity: 1.0,
  },
  matte_black: {
    id: 'matte_black',
    name: 'Negro Mate',
    shortName: 'Negro',
    swatchHex: '#25272b',
    swatchRingHex: '#0f1012',
    color: '#23262a',
    roughness: 0.58,
    metalness: 0.04,
    clearcoat: 0.14,
    clearcoatRoughness: 0.45,
    translucency: 0.18,
    absorption: 0.65,
    glowTint: '#ffaa4d',
    opacity: 1.0,
  },
};

export const MATERIAL_LIST: MaterialPresetSpec[] = [
  MATERIAL_PRESETS.ozek_sand,
  MATERIAL_PRESETS.ozek_onyx,
  MATERIAL_PRESETS.ozek_copper,
  MATERIAL_PRESETS.pla_white,
  MATERIAL_PRESETS.amber_translucent,
  MATERIAL_PRESETS.smoked_amber,
  MATERIAL_PRESETS.terracotta,
  MATERIAL_PRESETS.olive_green,
  MATERIAL_PRESETS.sand_wood,
  MATERIAL_PRESETS.stone_gray,
  MATERIAL_PRESETS.matte_black,
];

export interface LampShaderUniforms {
  uBulbPos: { value: THREE.Vector3 };
  uBulbColor: { value: THREE.Color };
  uBulbIntensity: { value: number };
  uTranslucency: { value: number };
  uAbsorption: { value: number };
  uGlowTint: { value: THREE.Color };
  uShowOverhangs: { value: number };
  /** 0 = solid, 1 = AMS Z-stripes, 2 = edges/crests, 3 = alternating strands */
  uColorMode: { value: number };
  uAccentColor: { value: THREE.Color };
  uThirdColor: { value: THREE.Color };
  uStripeRepeats: { value: number };
  uEdgeDepthMm: { value: number };
  uShadeMinY: { value: number };
  uShadeHeight: { value: number };
}

export function kelvinToColor(kelvin: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (kelvin - 2200) / (4000 - 2200)));
  const r = 1.0;
  const g = 0.62 + 0.31 * t;
  const b = 0.25 + 0.55 * t;
  return new THREE.Color(r, g, b);
}

export function createBacklitLampMaterial(
  presetId: MaterialPresetId,
  clippingPlanes: THREE.Plane[]
): {
  material: THREE.MeshPhysicalMaterial;
  uniforms: LampShaderUniforms;
} {
  const spec = MATERIAL_PRESETS[presetId] ?? MATERIAL_PRESETS.pla_white;

  const uniforms: LampShaderUniforms = {
    uBulbPos: { value: new THREE.Vector3(0, 75, 0) },
    uBulbColor: { value: kelvinToColor(2700) },
    uBulbIntensity: { value: 1.25 },
    uTranslucency: { value: spec.translucency },
    uAbsorption: { value: spec.absorption },
    uGlowTint: { value: new THREE.Color(spec.glowTint) },
    uShowOverhangs: { value: 0.0 },
    uColorMode: { value: 0.0 },
    uAccentColor: { value: new THREE.Color('#C87D55') },
    uThirdColor: { value: new THREE.Color('#252525') },
    uStripeRepeats: { value: 2.0 },
    uEdgeDepthMm: { value: 2.0 },
    uShadeMinY: { value: 0.0 },
    uShadeHeight: { value: 160.0 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(spec.color),
    roughness: spec.roughness,
    metalness: spec.metalness,
    clearcoat: spec.clearcoat,
    clearcoatRoughness: spec.clearcoatRoughness,
    transparent: spec.opacity < 0.99,
    opacity: spec.opacity,
    side: THREE.FrontSide,
    clippingPlanes,
    clipShadows: true,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aThickness;
        attribute float aOverhang;
        varying float vThickness;
        varying float vOverhang;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vThickness = aThickness;
        vOverhang = aOverhang;
        vec4 ozWorld = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = ozWorld.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uBulbPos;
        uniform vec3 uBulbColor;
        uniform float uBulbIntensity;
        uniform float uTranslucency;
        uniform float uAbsorption;
        uniform vec3 uGlowTint;
        uniform float uShowOverhangs;
        uniform float uColorMode;
        uniform vec3 uAccentColor;
        uniform vec3 uThirdColor;
        uniform float uStripeRepeats;
        uniform float uEdgeDepthMm;
        uniform float uShadeMinY;
        uniform float uShadeHeight;
        varying float vThickness;
        varying float vOverhang;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uColorMode > 0.5) {
          float vNorm = clamp((vWorldPos.y - uShadeMinY) / max(uShadeHeight, 1.0), 0.0, 1.0);
          if (uColorMode < 1.5) {
            // Mode 1: AMS Z-Stripes (crisp horizontal height-band color swaps)
            float band = mod(floor(vNorm * max(1.0, uStripeRepeats) * 3.0), 3.0);
            if (band > 0.5 && band < 1.5) {
              diffuseColor.rgb = uAccentColor;
            } else if (band >= 1.5) {
              diffuseColor.rgb = uThirdColor;
            }
          } else if (uColorMode < 2.5) {
            // Mode 2: Edges / Crests (accent color highlights thicker crests & extruded fin tips)
            float edgeMask = smoothstep(uEdgeDepthMm - 0.35, uEdgeDepthMm + 0.45, vThickness);
            diffuseColor.rgb = mix(diffuseColor.rgb, uAccentColor, edgeMask);
          } else {
            // Mode 3: Strands / Alternating (3-color angular/helical strand mapping)
            float ang = atan(-vWorldPos.z, vWorldPos.x);
            float sector = mod(floor(((ang / 6.2831853) + 1.0 + vNorm * 0.35) * 12.0), 3.0);
            if (sector > 0.5 && sector < 1.5) {
              diffuseColor.rgb = uAccentColor;
            } else if (sector >= 1.5) {
              diffuseColor.rgb = uThirdColor;
            }
          }
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 toBulb = uBulbPos - vWorldPos;
        float distMm = length(toBulb);
        vec3 bulbDir = toBulb / max(distMm, 0.001);

        // Exponential Beer-Lambert attenuation through real local wall thickness (mm)
        // Thin 0.65 mm RippleMesh/Grid cell windows & 1.2 mm Organic diffuser cores glow brilliantly warm,
        // while thick 3.5–6.5 mm arches & extruded fins stay crisp & sculpted!
        float thickAtten = exp(-max(vThickness, 0.6) * (uAbsorption * 1.42));
        float thinWindowBoost = pow(smoothstep(1.65, 0.62, vThickness), 1.45) * 1.38;
        float coreBoost = smoothstep(2.1, 1.05, vThickness) * 0.35;
        // Smooth radial distance falloff calibrated in millimeters
        float distAtten = 1.0 / (1.0 + 0.00016 * distMm * distMm);

        vec3 wn = normalize(vWorldNormal);
        float backFacing = clamp(dot(-wn, bulbDir) * 0.55 + 0.45, 0.0, 1.0);
        float innerLit = clamp(dot(wn, bulbDir), 0.0, 1.0);

        float glowPower =
          ((thickAtten * uTranslucency + coreBoost) * backFacing +
            thinWindowBoost * (0.55 + 0.45 * backFacing) +
            innerLit * 0.58) *
          distAtten *
          uBulbIntensity;
        vec3 warmGlow = uBulbColor * mix(uGlowTint, vec3(1.0, 0.86, 0.56), thinWindowBoost * 0.55) * glowPower * 1.55;
        totalEmissiveRadiance += warmGlow;`
      )
      .replace(
        '#include <dithering_fragment>',
        `if (uShowOverhangs > 0.5 && vOverhang > 0.04) {
          float mask = smoothstep(0.04, 0.55, vOverhang);
          vec3 alertColor = vec3(0.92, 0.08, 0.24);
          gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.85, alertColor, mask * 0.88);
        }
        #include <dithering_fragment>`
      );
  };

  material.customProgramCacheKey = () => 'ozek-backlit-lamp-v3-ams';

  return { material, uniforms };
}

export function applyMaterialPreset(
  material: THREE.MeshPhysicalMaterial,
  uniforms: LampShaderUniforms,
  presetId: MaterialPresetId
): void {
  const spec = MATERIAL_PRESETS[presetId] ?? MATERIAL_PRESETS.pla_white;
  material.color.set(spec.color);
  material.roughness = spec.roughness;
  material.metalness = spec.metalness;
  material.clearcoat = spec.clearcoat;
  material.clearcoatRoughness = spec.clearcoatRoughness;
  material.opacity = spec.opacity;
  const shouldBeTransparent = spec.opacity < 0.99;
  if (material.transparent !== shouldBeTransparent) {
    material.transparent = shouldBeTransparent;
    material.needsUpdate = true;
  }
  uniforms.uTranslucency.value = spec.translucency;
  uniforms.uAbsorption.value = spec.absorption;
  uniforms.uGlowTint.value.set(spec.glowTint);
}
