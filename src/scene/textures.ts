import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

export function noiseCanvas(size: number, base: [number, number, number], spread: number, streak = 0) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const row = Math.floor(i / size)
    const n = (Math.random() - 0.5) * spread + (streak ? Math.sin(row * 0.35 + Math.sin(row * 0.05) * 4) * streak : 0)
    img.data[i * 4] = base[0] + n
    img.data[i * 4 + 1] = base[1] + n
    img.data[i * 4 + 2] = base[2] + n
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

export function canvasTexture(canvas: HTMLCanvasElement, repeat?: [number, number]) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  if (repeat) texture.repeat.set(repeat[0], repeat[1])
  return texture
}
