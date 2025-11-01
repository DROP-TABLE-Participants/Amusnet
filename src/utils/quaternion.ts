import { Euler, Quaternion, Vector3 } from 'three'

export type QuaternionTuple = [number, number, number, number]

export const IDENTITY_QUATERNION: QuaternionTuple = [0, 0, 0, 1]

export function toQuaternion(tuple: QuaternionTuple): Quaternion {
  return new Quaternion(tuple[0], tuple[1], tuple[2], tuple[3]).normalize()
}

export function toTuple(quaternion: Quaternion): QuaternionTuple {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w]
}

export function randomQuaternion(): Quaternion {
  const u1 = Math.random()
  const u2 = Math.random()
  const u3 = Math.random()

  const sqrt1MinusU1 = Math.sqrt(1 - u1)
  const sqrtU1 = Math.sqrt(u1)

  return new Quaternion(
    sqrt1MinusU1 * Math.sin(2 * Math.PI * u2),
    sqrt1MinusU1 * Math.cos(2 * Math.PI * u2),
    sqrtU1 * Math.sin(2 * Math.PI * u3),
    sqrtU1 * Math.cos(2 * Math.PI * u3),
  ).normalize()
}

export function randomDeviceOrientationQuaternion(): Quaternion {
  const yaw = Math.random() * Math.PI * 2
  const pitch = degToRad(randomInRange(-70, 70))
  const roll = degToRad(randomInRange(-90, 90))

  const euler = new Euler(pitch, yaw, roll, 'YXZ')
  return new Quaternion().setFromEuler(euler).normalize()
}

export function clampProgress(angleRadians: number): number {
  const maxAngle = Math.PI
  const normalized = Math.max(0, Math.min(1, 1 - angleRadians / maxAngle))
  const buffered = Math.min(1, normalized / 0.95)
  return Number(buffered.toFixed(3))
}

const FORWARD_VECTOR = new Vector3(0, 0, -1)
const UP_VECTOR = new Vector3(0, 1, 0)

function wrapToPi(value: number): number {
  const wrapped = Math.atan2(Math.sin(value), Math.cos(value))
  return wrapped
}

function toShadowOrientationAngles(quaternion: Quaternion): { pitch: number; yaw: number } {
  const forward = FORWARD_VECTOR.clone().applyQuaternion(quaternion)
  const clampedY = Math.max(-1, Math.min(1, forward.y))
  const pitch = Math.asin(clampedY)
  const yaw = Math.atan2(forward.x, -forward.z)
  return { pitch, yaw }
}

export function shadowAngleBetween(a: Quaternion, b: Quaternion): number {
  const aAngles = toShadowOrientationAngles(a)
  const bAngles = toShadowOrientationAngles(b)
  const pitchDelta = wrapToPi(aAngles.pitch - bAngles.pitch)
  const yawDelta = wrapToPi(aAngles.yaw - bAngles.yaw)

  const upA = UP_VECTOR.clone().applyQuaternion(a)
  const upB = UP_VECTOR.clone().applyQuaternion(b)
  const upYaw = wrapToPi(Math.atan2(upA.x, upA.y) - Math.atan2(upB.x, upB.y))

  const combined = Math.sqrt(pitchDelta * pitchDelta + yawDelta * yawDelta + upYaw * upYaw * 0.5)
  return combined
}

export function eulerFromDeviceOrientation(
  alpha: number,
  beta: number,
  gamma: number,
): Euler {
  const radAlpha = degToRad(alpha)
  const radBeta = degToRad(beta)
  const radGamma = degToRad(gamma)

  const euler = new Euler(0, 0, 0, 'ZXY')
  euler.z = radAlpha
  euler.x = radBeta
  euler.y = radGamma

  console.log(
    `[device-orientation] alpha: ${alpha.toFixed(1)}, beta: ${beta.toFixed(1)}, gamma: ${gamma.toFixed(1)}`,
  )

  return euler
}

export function degToRad(value: number): number {
  return (value * Math.PI) / 180
}

export function rotateVector(vector: Vector3, quaternion: Quaternion): Vector3 {
  return vector.clone().applyQuaternion(quaternion)
}

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}
