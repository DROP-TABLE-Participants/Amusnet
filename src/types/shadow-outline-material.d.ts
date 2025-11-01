import type { Object3DNode } from '@react-three/fiber'
import type {
  ShadowOutlineMaterialImpl,
  ShadowOutlineMaterialClass,
} from '../shaders/ShadowOutlineMaterial'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      shadowOutlineMaterial: Object3DNode<
        ShadowOutlineMaterialImpl,
        ShadowOutlineMaterialClass
      >
    }
  }
}

export {}
