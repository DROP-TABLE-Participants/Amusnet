import { shaderMaterial } from '@react-three/drei'
import { Color, UniformsLib, UniformsUtils, type IUniform } from 'three'
import { extend } from '@react-three/fiber'

const vertexShader = /* glsl */ `
  #include <common>
  #include <shadowmap_pars_vertex>

  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorldPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;

    #include <shadowmap_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <common>
  #include <packing>
  #include <shadowmap_pars_fragment>

  uniform vec3 outlineColor;
  uniform float outlineWidth;
  uniform float outlineStrength;
  uniform float softness;

  float occlusionSample( int index, vec4 shadowCoord, vec2 offset ) {
  #if NUM_DIR_LIGHT_SHADOWS == 0
    return 0.0;
  #else
    vec4 coord = shadowCoord;
    if ( coord.w <= 0.0 ) {
      return 0.0;
    }
    coord.xy += offset * coord.w;
    vec3 proj = coord.xyz / coord.w;
    if ( proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0 || proj.z > 1.0 ) {
      return 0.0;
    }
    float depth = unpackRGBAToDepth( texture2D( directionalShadowMap[ index ], proj.xy ) );
    float bias = directionalLightShadows[ index ].shadowBias;
    return proj.z - bias > depth ? 1.0 : 0.0;
  #endif
  }

  float outlineAmount( int index, vec4 shadowCoord ) {
    vec2 texel = vec2( outlineWidth ) / directionalShadowMapSize[ index ];
    float center = occlusionSample( index, shadowCoord, vec2( 0.0 ) );
    float maxDiff = 0.0;

    vec2 offsets[8];
    offsets[0] = vec2(  texel.x,  0.0 );
    offsets[1] = vec2( -texel.x,  0.0 );
    offsets[2] = vec2(  0.0,      texel.y );
    offsets[3] = vec2(  0.0,     -texel.y );
    offsets[4] = vec2(  texel.x,  texel.y );
    offsets[5] = vec2( -texel.x,  texel.y );
    offsets[6] = vec2(  texel.x, -texel.y );
    offsets[7] = vec2( -texel.x, -texel.y );

    for ( int i = 0; i < 8; i ++ ) {
      float neighbor = occlusionSample( index, shadowCoord, offsets[ i ] );
      maxDiff = max( maxDiff, abs( center - neighbor ) );
    }

    return smoothstep( 0.0, softness, maxDiff );
  }

  void main() {
    float outline = 0.0;

  #if NUM_DIR_LIGHT_SHADOWS > 0
    for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
      outline = max( outline, outlineAmount( i, vDirectionalShadowCoord[ i ] ) );
    }
  #endif

    float alpha = clamp( outline * outlineStrength, 0.0, 1.0 );
    if (alpha <= 0.001) {
      discard;
    }

    gl_FragColor = vec4( outlineColor, alpha );
  }
`

const ShadowOutlineMaterial = shaderMaterial(
  {
    outlineColor: new Color('#55ccff'),
    outlineWidth: 1.4,
    outlineStrength: 1.0,
    softness: 0.35,
  },
  vertexShader,
  fragmentShader,
  (material) => {
    if (!material) {
      return
    }

    material.lights = true

    const lights = UniformsUtils.clone(UniformsLib.lights)
    const shadowSource = (UniformsLib as unknown as {
      shadowmap?: Record<string, IUniform>
    }).shadowmap ?? {}
    const shadowUniforms = UniformsUtils.clone(shadowSource)

    Object.assign(material.uniforms, lights, shadowUniforms)

    material.defines = {
      ...(material.defines ?? {}),
      USE_SHADOWMAP: '',
      USE_LIGHTS: '',
    }

    material.transparent = true
    material.depthWrite = false
    material.depthTest = false
    material.toneMapped = false
    material.needsUpdate = true
    material.needsUpdate = true
  },
)

ShadowOutlineMaterial.key = 'ShadowOutlineMaterial'

extend({ ShadowOutlineMaterial })

export { ShadowOutlineMaterial }
export type ShadowOutlineMaterialImpl = InstanceType<typeof ShadowOutlineMaterial>
export type ShadowOutlineMaterialClass = typeof ShadowOutlineMaterial
