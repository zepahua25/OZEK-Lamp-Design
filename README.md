# OZEK Lamp Studio

Estudio paramétrico 100% local (**Vite + TypeScript + Three.js + React**) para diseñar colecciones de lámparas 3D escultóricas y exportar archivos **STL binarios** (*watertight / 2-manifold*, Z-up en milímetros) listos para imprimir en **Bambu Studio (Bambu Lab A1)**.

## Características principales

- **Motor geométrico watertight / 2-manifold (`src/geometry/`):** Mallas sólidas cerradas con normales hacia afuera y validación topológica automatizada con Vitest.
- **Modo 1 Pieza y 2 Piezas (Base + Pantalla):**
  - 5 formas de Base independientes: **Cúpula**, **Cónica**, **Cilíndrica**, **Conkel (Flowalistik)** y **Trípode**.
  - Acabado de Base **Lisa** o **Acanalada fina (40–100 costillas)**.
  - 5 sistemas de encaje: **Asiento directo (+0.4 mm)**, **Araña flotante (4 radios de 3 mm con bayoneta opcional)**, **Rosca 3D**, **Bayoneta ¼** y **Presión**.
  - Hardware integrado con ranura inferior de cable (`6.5 × 5 mm`): **Socket E26/E27** (cavidad amplia + techo `3.5 mm` + orificio `40.5 mm` ajustable `36–44 mm`) y **Bambu Lab LED Lamp Kit 001** (`Ø59.5 ± 0.5 × 8.5 mm`).
- **6 Familias de Pantalla modulares:**
  1. **Plisada / Acanalada**
  2. **Plisado Fino (Japonés)** (`40–100` pliegues suaves, pared translúcida `0.8–2.4 mm`)
  3. **Helicoidal / Espiral** (simple o doble diamante óptico)
  4. **Láminas / Aletas Twist**
  5. **Tejida / Basketweave** (tiras redondeadas de mimbre `0.8 → 2.2 mm`, pared interior lisa, `320–440` segmentos radiales)
  6. **Orgánica / Ondas Fluidas** (Simplex 3D con *domain warping*)
  - Control transversal **Onda en borde inferior (Falda)** (`0–15 mm`, `3–8` ondas) y sección superelíptica (`Circular ↔ Cuadrada`).
- **Visor 3D realista:** Shader de translucidez retroiluminada por grosor real de pared, **Vista Explotada (+50 mm)**, corte de sección, visualización de voladizos en rojo, placa Bambu Lab A1 (`256³ mm`) y telemetría en tiempo real de gramos PLA.
- **Exportación y Colecciones:** `Exportar Base.stl`, `Exportar Pantalla.stl`, `Base de prueba (15 mm)`, 7 presets curados, generador de variantes de colección y guardar/cargar JSON local.

## Inicio rápido

### Windows
Doble clic en `start.bat` (instala dependencias si faltan, levanta Vite y abre `http://localhost:5173`).

### macOS / Linux
Doble clic en `start.command` o ejecuta `./start.sh`.

## Comandos de desarrollo

```bash
npm install
npm run dev      # Servidor local en http://localhost:5173
npm test         # Suite de validación watertight / 2-manifold (Vitest)
npm run build    # Type-check + build de producción
```
