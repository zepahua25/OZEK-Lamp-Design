import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { LampConfig, LampMetrics, MeshPartData } from '../types/lamp';
import { getEffectiveShadeHeight } from './silhouette';
import { detectOzekCollectionPiece } from '../data/ozekCollection';
import { buildZipArchive, ZipEntryInput } from './zipWriter';

export interface StlExportOptions {
  /**
   * Flips the exported part 180° upside-down (around X axis) so the top flat face rests on Z = 0.
   * Used automatically for Tripod bases (ring down, legs growing up < 42°) and optional upside-down shades!
   */
  flipUpsideDown?: boolean;
}

/**
 * Converts a Y-up Three.js MeshPartData (in mm) to Bambu Studio Z-up coordinates (1 unit = 1 mm),
 * shifts its lowest Z face cleanly onto Z = 0.00 mm (build plate), centers X/Y around 0,
 * and serializes to a compact Binary STL ArrayBuffer using Three.js STLExporter.
 */
export function exportPartToBinarySTL(
  part: MeshPartData,
  options: StlExportOptions = {}
): ArrayBuffer {
  const geom = new THREE.BufferGeometry();
  const srcPos = part.positions;
  const vertCount = srcPos.length / 3;
  const zUpPos = new Float32Array(srcPos.length);
  const indices = new Uint32Array(part.indices);
  const flip = options.flipUpsideDown ?? false;

  // Normal Y-up -> Z-up: (x, y, z) -> (x, -z, y)  [det = +1]
  // Flipped 180° around X: (x, y, z) -> (x, z, -y) [det = +1, preserves outward normals cleanly!]
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
    const by = flip ? z : -z;
    const bz = flip ? -y : y;

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

  for (let i = 0; i < vertCount; i++) {
    zUpPos[i * 3] -= cx;
    zUpPos[i * 3 + 1] -= cy;
    zUpPos[i * 3 + 2] -= minZ;
  }

  geom.setAttribute('position', new THREE.BufferAttribute(zUpPos, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom);
  const exporter = new STLExporter();
  const dataView = exporter.parse(mesh, { binary: true }) as DataView;

  geom.dispose();
  const copy = new Uint8Array(dataView.byteLength);
  copy.set(new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength));
  return copy.buffer;
}

/**
 * Generates dynamic Bambu Studio slicing instructions tailored to the exact active lamp configuration.
 */
export function generateBambuStudioGuide(
  config: LampConfig,
  metrics: LampMetrics,
  exportedFiles: string[]
): string {
  const isTwoPart =
    config.silhouette.buildMode === 'two_part' && config.mount.position === 'bottom';
  const hasWavySkirt = config.silhouette.skirtWaveAmp > 0.2;
  const isSpider = isTwoPart && config.base.coupling === 'spider' && config.base.style !== 'compact_flush';
  const isCompactFlush = isTwoPart && config.base.style === 'compact_flush';
  const isTripod = isTwoPart && config.base.style === 'tripod';
  const isPendant = config.mount.position === 'top';
  const isOrganic = config.family === 'organic';
  const isThinTranslucent =
    config.family === 'woven' ||
    config.family === 'japanese_flute' ||
    config.silhouette.includeDiffuser;
  const effShadeH = getEffectiveShadeHeight(config.silhouette);
  const sizeLabel =
    effShadeH < 138
      ? 'XS (125 mm)'
      : effShadeH < 160
        ? 'S (150 mm)'
        : effShadeH < 185
          ? 'M (170 mm)'
          : effShadeH < 218
            ? 'L (200 mm)'
            : 'XL (235 mm)';
  const matchedPiece = detectOzekCollectionPiece(config);
  const maxDimMm = Math.max(metrics.widthMm, metrics.depthMm, metrics.heightMm);
  const fitsA1Strict = maxDimMm <= 245;
  const hasAuthorSeal = isTwoPart && config.base.authorSeal !== false;

  const lines: string[] = [
    '====================================================================',
    '  OZ☰K STUDIO — Colección 01 ("Damos alma a cada pieza.")',
    '  FICHA TÉCNICA DFM & AJUSTES PARA BAMBU STUDIO (BAMBU LAB A1)',
    '====================================================================',
    '',
    `Serie             : ${matchedPiece ? `${matchedPiece.code} · ${matchedPiece.kanji} (${matchedPiece.title})` : `Diseño personalizado (${config.family})`}`,
    `Talla de pantalla : ${sizeLabel} (altura efectiva ${Math.round(effShadeH)} mm)`,
    `Familia de diseño : ${config.family}`,
    `Arquitectura      : ${isTwoPart ? '2 Piezas (Base + Pantalla)' : isPendant ? 'Colgante (1 Pieza)' : 'Monobloque (1 Pieza)'}`,
    `Montura / Socket  : ${config.mount.type === 'led_kit_001' ? `Bambu Lab LED Lamp Kit 001 (Ø${(59.5 + config.mount.ledTolerance).toFixed(1)} × 8.5 mm)` : `Socket E26/E27 (Ø${config.mount.e26Diameter.toFixed(1)} mm · techo ${config.mount.e26LipThickness.toFixed(1)} mm · compatible Adaptador LED 001)`}`,
    `Verificación A1   : Ø${Math.round(Math.max(metrics.widthMm, metrics.depthMm))} × ${Math.round(metrics.heightMm)} mm (${fitsA1Strict ? '✓ OK ≤ 245 mm para Bambu Lab A1 256³' : metrics.fitsBambuA1 ? '✓ Cabe en Bambu Lab A1 (245–256 mm)' : 'ADVERTENCIA: Excede 256 mm'})`,
    `Sello de autor Z☰ : ${hasAuthorSeal ? 'Activo (bajorrelieve 0.6 mm en cara trasera de la Base)' : 'Desactivado'}`,
    '',
    '--- ARCHIVOS INCLUIDOS EN ESTE PAQUETE ---',
    ...exportedFiles.map((f) => `  • ${f}`),
    '',
    '--- ESTIMADO DE FILAMENTO PLA (~1.24 g/cm³) ---',
    `  • Total aproximado : ≈ ${Math.round(metrics.gramsPLA)} g PLA`,
  ];

  if (metrics.baseGramsPLA > 1) {
    lines.push(`  • Base             : ≈ ${Math.round(metrics.baseGramsPLA)} g PLA`);
  }
  if (metrics.shadeGramsPLA > 1) {
    lines.push(`  • Pantalla         : ≈ ${Math.round(metrics.shadeGramsPLA)} g PLA`);
  }
  if (metrics.diffuserGramsPLA > 1) {
    lines.push(`  • Difusor Interno  : ≈ ${Math.round(metrics.diffuserGramsPLA)} g PLA`);
  }

  lines.push(
    '',
    '--- ORIENTACIÓN EN CAMA Y NOTA HONESTA DE SOPORTES (DFM) ---'
  );

  if (matchedPiece) {
    lines.push(`  • Guía de serie   : ${matchedPiece.dfmSupportNote}`);
  }

  if (isCompactFlush) {
    lines.push(
      '  • Base Compacta / Al ras (Ø 75.0 × 15.0 mm): Imprimir derecha en Z = 0 (0% soportes).',
      '    Encaja empotrada al ras dentro de la esfera con bayoneta de 3 pestañas (Ø 74.2 mm).',
      '    Alinear la salida trasera de cable USB (techo a 45°) con el arco trasero de la esfera.'
    );
  } else if (isTripod) {
    lines.push(
      '  • Base Trípode: YA VIENE EXPORTADA BOCA ABAJO (anillo plano en Z=0) para imprimir',
      '    las 3 patas hacia arriba (< 42°) 100% sin soportes.'
    );
  } else if (isTwoPart) {
    lines.push(
      '  • Base: Imprimir derecha (tal cual cae en Z=0). Las bóvedas internas y el techo del',
      '    canal de cable tienen chaflán a 45° para imprimir 100% sin soportes.'
    );
  }

  if (config.base.coupling === 'slender_e26' && config.mount.type === 'e26_e27') {
    lines.push(
      '  • Pantalla (Cuello Esbelto E26/E27 · Araña en Z=0): Imprimir parada derecha en Z = 0,',
      '    100% sin soportes. El anillo central (Ø 40.8 mm) se sujeta directo con la tuerca',
      '    roscada del socket E26/E27 sobre el cuello Ø 17 mm (ocultando el socket bajo la pantalla).'
    );
  } else if (isSpider && !hasWavySkirt) {
    lines.push(
      '  • Pantalla (Araña interna en Z=0): Imprimir parada derecha en Z = 0, 100% sin soportes',
      '    (el anillo central con su bayoneta y los 4 radios planos descansan al ras de la cama).'
    );
  } else if (hasWavySkirt) {
    lines.push(
      '  • Pantalla (Falda ondulada / Araña interna elevada a 45°):',
      '    RECOMENDADO VOLTEAR 180° en Bambu Studio apoyando el borde superior plano en la cama.',
      '    Así los 4 radios de la araña (inclinados a 45°) y las ondas de la falda se imprimen',
      '    100% SIN SOPORTES.'
    );
  } else if (isOrganic) {
    lines.push(
      '  • Pantalla Orgánica: El borde superior (v >= 94%) es totalmente plano. Si notas voladizos',
      '    en la zona inferior, puedes voltearla 180° para imprimir aún más limpia.'
    );
  } else if (isPendant) {
    lines.push(
      config.mount.autoFlipPendantExport
        ? '  • Colgante E26/E27: Ya fue auto-orientada boca abajo con el collarín en Z=0 (sin soportes).'
        : '  • Colgante E26/E27: Voltea 180° si deseas apoyar el collarín plano en Z=0.'
    );
  } else {
    lines.push('  • Pantalla: Imprimir derecha tal cual cae en Z=0 (0% soportes).');
  }

  if (config.silhouette.includeDiffuser) {
    lines.push(
      '  • Difusor Interno (1.0 mm): Imprimir derecho en PLA Blanco Mate o Arena Natural',
      '    (2 perímetros, 0% relleno, borde exterior opcional Brim 3 mm).'
    );
  }

  if (config.silhouette.closeTopDome) {
    lines.push(
      config.mount.type === 'led_kit_001'
        ? '  • Cúpula / Esfera Cerrada (R = 0 mm): Cerrada en cúpula continua para LED Kit 001 (5V USB).'
        : '  • Cúpula con respiro discreto (Ø 16 mm): Orificio superior para evacuación térmica de foco LED E26/E27.'
    );
  }

  if (config.visual.colorMode && config.visual.colorMode !== 'solid') {
    lines.push('', '--- COLORACIÓN MULTICOLOR BAMBU LAB AMS ---');
    if (config.visual.colorMode === 'stripes') {
      const bands = Math.max(2, (config.visual.stripeRepeats || 2) * 2);
      const stepMm = getEffectiveShadeHeight(config.silhouette) / bands;
      lines.push(
        `  • Modo Rayas AMS (Z) — PURGA MÍNIMA (${bands} franjas horizontales, cambio cada ≈ ${stepMm.toFixed(1)} mm):`,
        '    En Bambu Studio > Vista previa > deslizador derecho, añade un "Change Filament" en las alturas:',
        `    ${Array.from({ length: bands - 1 }, (_, i) => `${((i + 1) * stepMm).toFixed(1)} mm`).join(' · ')}`
      );
    } else if (config.visual.colorMode === 'edges') {
      lines.push(
        '  • Modo Bordes / Crestas: En Bambu Studio usa la herramienta "Color Painting" > "Height / Smart Fill"',
        '    o filamento bicolor Silk/Dual-Color para resaltar las crestas exteriores sobre el núcleo translúcido.'
      );
    } else {
      lines.push(
        '  • Modo Hilos / Alternado: Aviso AMS — los cambios de color por capa aumentan purgas y tiempo;',
        '    en Bambu Studio puedes pintar sectores con "Color Painting" o imprimir el núcleo aparte.'
      );
    }
  }

  lines.push(
    '',
    '--- PERFIL RECOMENDADO EN BAMBU STUDIO (BOQUILLA 0.4 mm · CAPA 0.20 mm) ---',
    '  1. Generador de paredes (Wall Generator): ARACHNE',
    isThinTranslucent
      ? '     -> Crítico para paredes finas de 0.7–1.2 mm (Mimbre / Knitted / RippleMesh / Japonés / Difusor) sin huecos.'
      : '     -> Mejora definición en crestas finas, roscas y bayonetas.',
    '  2. DESACTIVAR "Ensure vertical shell thickness" (Asegurar grosor de carcasa vertical)',
    '     -> Evita que Bambu Studio inyecte relleno sólido interno que genera sombras oscuras',
    '        al encender la lámpara con luz cálida.',
    '  3. Base mate (opcional acabado cerámica/piedra UMINO):',
    '     -> Activar Fuzzy Skin (Piel difusa) SOLO en la pared exterior de la Base:',
    '        • Fuzzy skin point distance : 0.8 mm',
    '        • Fuzzy skin thickness      : 0.3 mm',
    '        (IMPORTANTE: pintar bloqueo de Fuzzy Skin sobre el sello trasero Z☰ y sobre la',
    '        zona de bayoneta/rosca; NO aplicar Fuzzy Skin en la pantalla translúcida).',
    '  4. Relleno en Base: 15% Gyroid (3 paredes). En Pantalla: 100% paredes / 0% relleno.',
    '  5. Costura (Seam position): "Aligned" o "Back" (desplazada a un costado del sello trasero Z☰).',
    '',
    '--- AVISO DE SEGURIDAD ELÉCTRICA ---',
    '  ⚠️  USAR EXCLUSIVAMENTE FOCOS LED DE BAJA TEMPERATURA (máx. 7–9 W, 2700K–3000K)',
    '      o el Bambu Lab LED Lamp Kit 001 (5V USB).',
    '      NUNCA usar focos incandescentes ni halógenos con lámparas impresas en PLA/PETG.',
    ''
  );

  return lines.join('\r\n');
}

/**
 * Builds a complete downloadable ZIP package containing all active binary STLs (Z-up, mm)
 * plus a dynamic `ajustes_bambu_studio.txt` slicing guide!
 */
export function buildLampZipPackage(
  config: LampConfig,
  parts: MeshPartData[],
  metrics: LampMetrics,
  slugBase: string
): ArrayBuffer {
  const entries: ZipEntryInput[] = [];
  const fileNames: string[] = [];

  for (const part of parts) {
    let fname: string;
    let flipUpsideDown = false;

    if (part.name === 'base') {
      fname = `${slugBase}_Base.stl`;
      // Auto-flip Tripod base 180° so flat collar rests on Z=0 and legs grow upward < 42°!
      flipUpsideDown = config.base.style === 'tripod';
    } else if (part.name === 'shade') {
      fname = `${slugBase}_Pantalla.stl`;
    } else if (part.name === 'diffuser') {
      fname = `${slugBase}_Difusor.stl`;
    } else {
      fname = `${slugBase}_Lampara.stl`;
    }

    const stlBuf = exportPartToBinarySTL(part, { flipUpsideDown });
    entries.push({ filename: fname, data: new Uint8Array(stlBuf) });
    fileNames.push(fname);
  }

  const guideText = generateBambuStudioGuide(config, metrics, fileNames);
  entries.push({
    filename: 'ajustes_bambu_studio.txt',
    data: new TextEncoder().encode(guideText),
  });

  return buildZipArchive(entries);
}

export function triggerBinaryDownload(buffer: ArrayBuffer, filename: string): void {
  const mime = filename.endsWith('.zip') ? 'application/zip' : 'application/octet-stream';
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
