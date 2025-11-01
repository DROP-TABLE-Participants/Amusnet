import {
  MeshBasicMaterial,
  ShaderMaterial,
  Color
} from 'three'

// === CONFIG ===
export const SILHOUETTE_FILL = '#112644'
export const SILHOUETTE_OUTLINE = '#dae9fe'

// === FILL MATERIAL (flat, unlit) ===
export const createSilhouetteFillMaterial = () =>
  new MeshBasicMaterial({
    color: new Color(SILHOUETTE_FILL),
    transparent: true,
    opacity: 0.25,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })

// === OUTLINE MATERIAL (inflated backfaces) ===
const outlineVertex = `
  uniform float thickness;
  void main() {
    vec3 n = normalize(normal);
    vec4 mvPosition = modelViewMatrix * vec4(position + n * thickness, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const outlineFragment = `
  uniform vec3 color;
  uniform float opacity;
  void main() {
    gl_FragColor = vec4(color, opacity);
  }
`

export const createSilhouetteOutlineMaterial = () =>
  new ShaderMaterial({
    uniforms: {
      color: { value: new Color(SILHOUETTE_OUTLINE) },
      opacity: { value: 0.95 },
      thickness: { value: 0.05 },
    },
    vertexShader: outlineVertex,
    fragmentShader: outlineFragment,
    side: 1,            // BackSide
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
