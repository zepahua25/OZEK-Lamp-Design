import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LampConfig, MeshPartData, SculptStroke, SculptToolId } from '../types/lamp';
import { getCouplingHeightMm, getShadeSeatY } from '../geometry/coupling';
import {
  LampShaderUniforms,
  MATERIAL_PRESETS,
  applyMaterialPreset,
  createBacklitLampMaterial,
  kelvinToColor,
} from './materials';

interface ScenePartEntry {
  role: 'shade' | 'base' | 'diffuser';
  mesh: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
  uniforms: LampShaderUniforms;
  targetOffsetY: number;
}

export class LampScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envRT: THREE.WebGLRenderTarget;

  private readonly lampGroup = new THREE.Group();
  private readonly cordGroup = new THREE.Group();
  private readonly buildPlateGroup = new THREE.Group();

  private readonly ambientLight: THREE.HemisphereLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.DirectionalLight;
  private readonly internalLight: THREE.PointLight;
  private readonly bulbCoreMesh: THREE.Mesh;
  private readonly floorMesh: THREE.Mesh;
  private readonly floorGlowMesh: THREE.Mesh;
  private readonly clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

  private parts: ScenePartEntry[] = [];
  private sectionCutEnabled = false;
  private rafId = 0;
  private disposed = false;
  private lastConfig: LampConfig | null = null;
  private resizeObserver: ResizeObserver;

  // Interactive 3D Sculpt Brush (e-leora inspired non-destructive UV brush)
  private readonly raycaster = new THREE.Raycaster();
  private readonly brushRingMesh: THREE.Mesh;
  private sculptTool: SculptToolId = 'off';
  private sculptRadiusMm = 28;
  private sculptStrength = 0.55;
  private isSculptDragging = false;
  private lastStrokeAtMs = 0;
  private onSculptStrokeCb: ((stroke: SculptStroke) => void) | null = null;
  private onSculptEndCb: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 1000, container.clientHeight || 700);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eeebe6');

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = this.pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.45;

    this.camera = new THREE.PerspectiveCamera(
      34,
      (container.clientWidth || 1000) / Math.max(container.clientHeight || 700, 1),
      2,
      3000
    );
    this.camera.position.set(345, 260, 500);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 95;
    this.controls.maxDistance = 1200;
    this.controls.maxPolarAngle = Math.PI * 0.72;
    this.controls.target.set(52, 126, 0);
    this.controls.update();

    this.ambientLight = new THREE.HemisphereLight('#fffaf2', '#d7cfc6', 0.92);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight('#fff6eb', 1.35);
    this.keyLight.position.set(240, 380, 260);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 50;
    this.keyLight.shadow.camera.far = 1100;
    const d = 240;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.radius = 4;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight('#dce4f5', 0.48);
    this.fillLight.position.set(-280, 160, -180);
    this.scene.add(this.fillLight);

    this.internalLight = new THREE.PointLight('#ffbb66', 18000, 560, 1.85);
    this.internalLight.position.set(0, 110, 0);
    this.internalLight.castShadow = false;
    this.scene.add(this.internalLight);

    const bulbGeo = new THREE.SphereGeometry(20, 28, 20);
    bulbGeo.scale(1, 1.18, 1);
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffebd0' });
    this.bulbCoreMesh = new THREE.Mesh(bulbGeo, bulbMat);
    this.scene.add(this.bulbCoreMesh);

    const floorGeo = new THREE.CircleGeometry(750, 72);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#e8e3dc',
      roughness: 0.92,
      metalness: 0.0,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.receiveShadow = true;
    this.floorMesh.position.y = -0.2;
    this.scene.add(this.floorMesh);

    // Floating 3D sculpt brush cursor ring on the lamp surface
    const ringGeo = new THREE.RingGeometry(0.84, 1.0, 40);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#f59e0b',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    this.brushRingMesh = new THREE.Mesh(ringGeo, ringMat);
    this.brushRingMesh.visible = false;
    this.brushRingMesh.renderOrder = 20;
    this.scene.add(this.brushRingMesh);

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);

    const glowTex = this.createRadialGlowTexture();
    const glowGeo = new THREE.PlaneGeometry(380, 380);
    glowGeo.rotateX(-Math.PI / 2);
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.floorGlowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.floorGlowMesh.position.y = 0.08;
    this.scene.add(this.floorGlowMesh);

    const cordGeo = new THREE.CylinderGeometry(3.2, 3.2, 320, 16);
    const cordMat = new THREE.MeshStandardMaterial({
      color: '#1b1c1f',
      roughness: 0.75,
    });
    const cordMesh = new THREE.Mesh(cordGeo, cordMat);
    cordMesh.position.y = 160;
    const capGeo = new THREE.CylinderGeometry(16, 20, 14, 24);
    const capMesh = new THREE.Mesh(capGeo, cordMat);
    capMesh.position.y = 6;
    this.cordGroup.add(cordMesh, capMesh);
    this.cordGroup.visible = false;
    this.scene.add(this.cordGroup);

    this.setupBambuA1Plate();
    this.buildPlateGroup.visible = false;
    this.scene.add(this.buildPlateGroup);

    this.scene.add(this.lampGroup);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.animate();
  }

  private createRadialGlowTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 195, 105, 0.95)');
    grad.addColorStop(0.35, 'rgba(255, 170, 75, 0.42)');
    grad.addColorStop(0.7, 'rgba(255, 145, 50, 0.1)');
    grad.addColorStop(1, 'rgba(255, 140, 40, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  private setupBambuA1Plate(): void {
    const size = 256;
    const plateGrid = new THREE.GridHelper(size, 16, 0x3f3f46, 0x9ca3af);
    plateGrid.position.y = 0.25;
    (plateGrid.material as THREE.Material).transparent = true;
    (plateGrid.material as THREE.Material).opacity = 0.45;
    this.buildPlateGroup.add(plateGrid);

    const boxGeo = new THREE.BoxGeometry(size, size, size);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.45,
    });
    const cage = new THREE.LineSegments(edges, lineMat);
    cage.position.y = size / 2;
    this.buildPlateGroup.add(cage);
    boxGeo.dispose();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth || 1000;
    const h = Math.max(this.container.clientHeight || 700, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  public updateMeshes(partDataList: MeshPartData[], config: LampConfig): void {
    this.lastConfig = config;

    const prevOffsets = new Map<'shade' | 'base' | 'diffuser', number>();
    for (const entry of this.parts) {
      prevOffsets.set(entry.role, entry.mesh.position.y);
      this.lampGroup.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.material.dispose();
    }
    this.parts = [];

    const activeClip = this.sectionCutEnabled ? [this.clipPlane] : [];

    for (const part of partDataList) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
      geom.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
      geom.setAttribute('aThickness', new THREE.BufferAttribute(part.thickness, 1));
      geom.setAttribute('aOverhang', new THREE.BufferAttribute(part.overhang, 1));
      geom.setIndex(new THREE.BufferAttribute(part.indices, 1));
      geom.computeBoundingSphere();

      const presetId =
        part.role === 'diffuser'
          ? 'pla_white'
          : part.role === 'base' && config.silhouette.buildMode === 'two_part'
            ? config.visual.baseMaterial
            : config.visual.material;

      const { material, uniforms } = createBacklitLampMaterial(presetId, activeClip);
      if (this.sectionCutEnabled) {
        material.side = THREE.DoubleSide;
      }
      const mesh = new THREE.Mesh(geom, material);
      mesh.castShadow = part.role !== 'diffuser';
      mesh.receiveShadow = true;
      mesh.position.y = prevOffsets.get(part.role) ?? 0;

      this.lampGroup.add(mesh);
      this.parts.push({
        role: part.role,
        mesh,
        material,
        uniforms,
        targetOffsetY: 0,
      });
    }

    this.updateVisualSettings(config);
  }

  public updateVisualSettings(config: LampConfig): void {
    this.lastConfig = config;
    const { visual, silhouette, base, mount } = config;
    const isNight = visual.sceneTheme === 'warm_night';
    const isTwoPart = silhouette.buildMode === 'two_part' && mount.position === 'bottom';
    const seatY = isTwoPart ? getShadeSeatY(config) : 0;

    if (isNight) {
      this.scene.background = new THREE.Color('#161414');
      (this.floorMesh.material as THREE.MeshStandardMaterial).color.set('#1f1c1a');
      this.ambientLight.intensity = 0.22;
      this.keyLight.intensity = 0.35;
      this.fillLight.intensity = 0.16;
      this.scene.environmentIntensity = 0.16;
    } else {
      this.scene.background = new THREE.Color('#eeebe6');
      (this.floorMesh.material as THREE.MeshStandardMaterial).color.set('#e8e3dc');
      this.ambientLight.intensity = 0.92;
      this.keyLight.intensity = 1.35;
      this.fillLight.intensity = 0.48;
      this.scene.environmentIntensity = 0.45;
    }

    const isPendant = mount.position === 'top';
    const couplingH = getCouplingHeightMm(base);
    let bulbY: number;
    let lightY: number;
    if (isPendant) {
      bulbY = silhouette.height * 0.56;
      lightY = bulbY;
    } else if (isTwoPart) {
      if (mount.type === 'led_kit_001') {
        // LED Kit 001 puck sits in the open-top upper cup flush with the top of the base collar!
        const ledCupTopY =
          base.style === 'conkel'
            ? Math.max(seatY, 14.5) + couplingH
            : seatY + couplingH;
        bulbY = ledCupTopY - 3.0;
        // Point light radiates upward from just above the LED puck into the shade cavity
        lightY = ledCupTopY + Math.min(silhouette.height * 0.34, 34);
      } else if (base.style === 'conkel') {
        bulbY = base.height + 28;
        lightY = bulbY;
      } else {
        bulbY = seatY + Math.min(silhouette.height * 0.46, 52);
        lightY = bulbY;
      }
    } else {
      bulbY =
        mount.type === 'led_kit_001'
          ? Math.min(silhouette.height * 0.45, Math.max(36, silhouette.height * 0.34))
          : silhouette.height * 0.48;
      lightY = bulbY;
    }

    const assembly = visual.assemblyView;
    const hasDiffuser = isTwoPart && silhouette.includeDiffuser;
    // Stepped exploded view: Base (0 mm) -> Diffuser (+34 mm) -> Outer Shade (+82 mm, or +50 mm without diffuser)
    const shadeExplodeY =
      isTwoPart && assembly === 'exploded'
        ? hasDiffuser
          ? 82
          : 50
        : isTwoPart && assembly === 'shade_only'
          ? -seatY
          : 0;
    const diffuserExplodeY =
      isTwoPart && assembly === 'exploded'
        ? 34
        : isTwoPart && assembly === 'shade_only'
          ? -seatY
          : 0;

    const bulbVisualY =
      isTwoPart && assembly === 'shade_only' ? silhouette.height * 0.45 : bulbY;
    const lightVisualY =
      isTwoPart && assembly === 'shade_only' ? silhouette.height * 0.45 : lightY;
    const bulbPos = new THREE.Vector3(0, bulbVisualY, 0);
    const lightPos = new THREE.Vector3(0, lightVisualY, 0);
    const bulbColor = kelvinToColor(visual.lightWarmth);
    const effIntensity = visual.lightOn ? visual.lightIntensity : 0;

    this.internalLight.position.copy(lightPos);
    this.internalLight.color.copy(bulbColor);
    this.internalLight.intensity = effIntensity * (isNight ? 28000 : 18500);

    if (mount.type === 'led_kit_001') {
      // Realistic Ø58 mm x ~7.5 mm glowing LED puck seated in the top cup of the base
      this.bulbCoreMesh.scale.set(1.42, 0.16, 1.42);
    } else {
      this.bulbCoreMesh.scale.set(1.0, 1.15, 1.0);
    }
    this.bulbCoreMesh.position.copy(bulbPos);
    this.bulbCoreMesh.visible =
      visual.lightOn && !visual.showOverhangs && assembly !== 'shade_only';
    (this.bulbCoreMesh.material as THREE.MeshBasicMaterial).color.copy(bulbColor);

    this.floorGlowMesh.visible = visual.lightOn && !visual.showOverhangs;
    const glowMat = this.floorGlowMesh.material as THREE.MeshBasicMaterial;
    glowMat.color.copy(bulbColor);
    glowMat.opacity = Math.min(0.85, effIntensity * (isNight ? 0.52 : 0.28));

    this.cordGroup.visible = isPendant;
    if (isPendant) {
      this.cordGroup.position.y = silhouette.height;
    }

    const colorModeNum =
      visual.colorMode === 'stripes'
        ? 1.0
        : visual.colorMode === 'edges'
          ? 2.0
          : visual.colorMode === 'strands'
            ? 3.0
            : 0.0;
    const accentHex =
      (MATERIAL_PRESETS[visual.accentMaterial] ?? MATERIAL_PRESETS.ozek_copper).color;
    const thirdHex =
      (MATERIAL_PRESETS[visual.thirdMaterial] ?? MATERIAL_PRESETS.ozek_onyx).color;

    for (const entry of this.parts) {
      const presetId =
        entry.role === 'diffuser'
          ? 'ozek_sand'
          : entry.role === 'base' && isTwoPart
            ? visual.baseMaterial
            : visual.material;
      applyMaterialPreset(entry.material, entry.uniforms, presetId);
      entry.uniforms.uBulbPos.value.copy(lightPos);
      entry.uniforms.uBulbColor.value.copy(bulbColor);
      entry.uniforms.uBulbIntensity.value =
        entry.role === 'diffuser' ? effIntensity * 1.25 : effIntensity;
      entry.uniforms.uShowOverhangs.value = visual.showOverhangs ? 1.0 : 0.0;

      // Apply AMS multicolor preview & per-strand circuit coloring strictly to the outer shade
      if (entry.role === 'shade') {
        const showStrandColors =
          config.family === 'organic' &&
          config.organic.mode === 'gravity' &&
          Boolean(config.organic.colorByStrand);
        entry.uniforms.uColorMode.value = colorModeNum;
        entry.uniforms.uColorByStrand.value = showStrandColors ? 1.0 : 0.0;
        entry.uniforms.uAccentColor.value.set(accentHex);
        entry.uniforms.uThirdColor.value.set(thirdHex);
        entry.uniforms.uStripeRepeats.value = visual.stripeRepeats || 2;
        entry.uniforms.uEdgeDepthMm.value = visual.edgeDepthMm || 2.0;
        entry.uniforms.uShadeMinY.value = isTwoPart ? seatY + shadeExplodeY : 0;
        entry.uniforms.uShadeHeight.value = silhouette.height;
      } else {
        entry.uniforms.uColorMode.value = 0.0;
        entry.uniforms.uColorByStrand.value = 0.0;
      }

      if (isTwoPart) {
        if (entry.role === 'base') {
          entry.mesh.visible = assembly !== 'shade_only';
          entry.targetOffsetY = 0;
        } else if (entry.role === 'diffuser') {
          entry.mesh.visible = assembly !== 'base_only';
          entry.targetOffsetY = diffuserExplodeY;
        } else {
          entry.mesh.visible = assembly !== 'base_only';
          entry.targetOffsetY = shadeExplodeY;
        }
      } else {
        entry.mesh.visible = true;
        entry.targetOffsetY = 0;
      }
    }
  }

  public setShowBuildPlate(show: boolean): void {
    this.buildPlateGroup.visible = show;
  }

  public setSectionCut(enabled: boolean): void {
    this.sectionCutEnabled = enabled;
    const planes = enabled ? [this.clipPlane] : [];
    for (const entry of this.parts) {
      entry.material.clippingPlanes = planes;
      entry.material.side = enabled ? THREE.DoubleSide : THREE.FrontSide;
      entry.material.needsUpdate = true;
    }
  }

  public zoom(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const len = offset.length();
    const nextLen = Math.max(
      this.controls.minDistance,
      Math.min(this.controls.maxDistance, len * factor)
    );
    offset.setLength(nextLen);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  public resetCamera(): void {
    const cfg = this.lastConfig;
    const isTwoPart = cfg?.silhouette.buildMode === 'two_part' && cfg.mount.position === 'bottom';
    const explodeExtra = isTwoPart && cfg?.visual.assemblyView === 'exploded' ? 58 : 0;
    const totalH = cfg
      ? (isTwoPart ? getShadeSeatY(cfg) + cfg.silhouette.height : cfg.silhouette.height) +
        explodeExtra
      : 230;
    this.controls.target.set(52, totalH * 0.5, 0);
    this.camera.position.set(345, totalH * 1.05, 500);
    this.controls.update();
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);
    for (const entry of this.parts) {
      const diff = entry.targetOffsetY - entry.mesh.position.y;
      if (Math.abs(diff) > 0.08) {
        entry.mesh.position.y += diff * 0.16;
      } else if (diff !== 0) {
        entry.mesh.position.y = entry.targetOffsetY;
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  public setSculptBrush(
    tool: SculptToolId,
    radiusMm: number,
    strength: number,
    onStroke: (stroke: SculptStroke) => void,
    onStrokeEnd: () => void
  ): void {
    this.sculptTool = tool;
    this.sculptRadiusMm = radiusMm;
    this.sculptStrength = strength;
    this.onSculptStrokeCb = onStroke;
    this.onSculptEndCb = onStrokeEnd;
    if (tool === 'off') {
      this.brushRingMesh.visible = false;
      this.isSculptDragging = false;
      this.controls.enabled = true;
      this.renderer.domElement.style.cursor = 'grab';
    } else {
      this.renderer.domElement.style.cursor = 'crosshair';
    }
  }

  private raycastShade(clientX: number, clientY: number): THREE.Intersection | null {
    const shadeEntry = this.parts.find((p) => p.role === 'shade' && p.mesh.visible);
    if (!shadeEntry) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(shadeEntry.mesh, false);
    return hits.length > 0 ? hits[0] : null;
  }

  private emitStrokeFromHit(hit: THREE.Intersection): void {
    if (this.sculptTool === 'off' || !this.onSculptStrokeCb || !this.lastConfig) return;
    const cfg = this.lastConfig;
    const isTwoPart = cfg.silhouette.buildMode === 'two_part' && cfg.mount.position === 'bottom';
    const shadeEntry = this.parts.find((p) => p.role === 'shade');
    const offsetY = shadeEntry ? shadeEntry.mesh.position.y : 0;
    const baseY = isTwoPart ? getShadeSeatY(cfg) + offsetY : offsetY;

    const p = hit.point;
    const theta = Math.atan2(-p.z, p.x);
    const u = ((theta / (2 * Math.PI)) % 1 + 1) % 1;
    const vRaw = (p.y - baseY) / Math.max(cfg.silhouette.height, 1);
    const v = Math.max(0.06, Math.min(0.94, vRaw));

    this.onSculptStrokeCb({
      u,
      v,
      radiusMm: this.sculptRadiusMm,
      strength: this.sculptStrength,
      tool: this.sculptTool,
    });
  }

  private updateBrushRing(hit: THREE.Intersection | null): void {
    if (!hit || this.sculptTool === 'off') {
      this.brushRingMesh.visible = false;
      return;
    }
    this.brushRingMesh.visible = true;
    const n = hit.face ? hit.face.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    this.brushRingMesh.position.copy(hit.point).addScaledVector(n, 1.5);
    this.brushRingMesh.lookAt(hit.point.clone().add(n));
    const scale = Math.max(8, this.sculptRadiusMm * 0.72);
    this.brushRingMesh.scale.set(scale, scale, 1);
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.sculptTool === 'off' || e.button !== 0) return;
    const hit = this.raycastShade(e.clientX, e.clientY);
    if (!hit) return;
    this.isSculptDragging = true;
    this.controls.enabled = false;
    this.lastStrokeAtMs = performance.now();
    this.updateBrushRing(hit);
    this.emitStrokeFromHit(hit);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.sculptTool === 'off') return;
    const hit = this.raycastShade(e.clientX, e.clientY);
    this.updateBrushRing(hit);
    if (!this.isSculptDragging || !hit) return;
    const now = performance.now();
    if (now - this.lastStrokeAtMs >= 85) {
      this.lastStrokeAtMs = now;
      this.emitStrokeFromHit(hit);
    }
  };

  private handlePointerUp = (): void => {
    if (!this.isSculptDragging) return;
    this.isSculptDragging = false;
    this.controls.enabled = true;
    this.onSculptEndCb?.();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const entry of this.parts) {
      entry.mesh.geometry.dispose();
      entry.material.dispose();
    }
    this.envRT.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
