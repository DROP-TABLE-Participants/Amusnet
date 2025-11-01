declare module 'qrcode' {
  type QRCodeColor = {
    dark?: string
    light?: string
  }

  export type QRCodeToCanvasOptions = {
    margin?: number
    width?: number
    color?: QRCodeColor
  }

  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeToCanvasOptions,
  ): Promise<void>
}
