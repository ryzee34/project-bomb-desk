import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ColorManagement,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  SpotLight,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { clock } from '../ui/format'
import { canvasTexture, noiseCanvas } from './textures'

const WIRE_HEX = [0xa8261d, 0x2c58a0, 0xc9a02a, 0x3b7337, 0xd6d1c4, 0x1c1c1c]
const KEY_ROWS = ['1234567890-', 'qwertyuiop', "asdfghjkl;'", 'zxcvbnm,./']
const SHIFTED: Record<string, string> = { '!': '1', '?': '/', ':': ';', '"': "'", _: '-' }
const LAMP = 3.6
const RED = 0.15
const EXPOSURE = 0.95

export interface DeskScene {
  pressKey(ch: string): void
  setDisplay(seconds: number, wiresLeft: number): void
  setSlips(count: number): void
  litWire(index: number | null): void
  cutWire(index: number): void
  resetWires(): void
  beat(): void
  setNerves(level: number): void
  setDread(on: boolean): void
  shake(amount: number): void
  flicker(amount: number): void
  blackout(): void
  relight(): void
}

interface Wire {
  curve: CatmullRomCurve3
  material: MeshStandardMaterial
  mesh: Mesh
  parts: Mesh[]
}

export function createDeskScene(host: HTMLElement, reduced: boolean): DeskScene {
  ColorManagement.enabled = false
  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = EXPOSURE
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(0x050505)
  scene.fog = new FogExp2(0x050505, 0.35)

  const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.01, 20)
  const camBase = new Vector3(0, 1.28, 0.92)
  const camTarget = new Vector3(0, 0.78, -0.12)

  const wood = new MeshStandardMaterial({ map: canvasTexture(noiseCanvas(256, [58, 38, 24], 22, 10), [2, 1]), roughness: 0.78, metalness: 0.04 })
  const desk = new Mesh(new BoxGeometry(1.9, 0.06, 1.1), wood)
  desk.position.set(0, 0.72, -0.05)
  desk.receiveShadow = true
  scene.add(desk)

  const wall = new Mesh(new PlaneGeometry(7, 3.4), new MeshStandardMaterial({ map: canvasTexture(noiseCanvas(256, [40, 38, 34], 30), [4, 2]), roughness: 0.96 }))
  wall.position.set(0, 1.5, -0.8)
  wall.receiveShadow = true
  scene.add(wall)

  const floor = new Mesh(new PlaneGeometry(8, 8), new MeshStandardMaterial({ color: 0x0d0c0b, roughness: 1 }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  const keyboard = new Group()
  const board = new Mesh(new BoxGeometry(0.64, 0.025, 0.27), new MeshStandardMaterial({ color: 0x100f0e, roughness: 0.55, metalness: 0.4 }))
  board.position.set(0, 0.7625, 0.25)
  board.castShadow = board.receiveShadow = true
  keyboard.add(board)
  const capMaterial = new MeshStandardMaterial({ color: 0x24211d, roughness: 0.68 })
  const capGeometry = new BoxGeometry(0.042, 0.016, 0.04)
  const keys = new Map<string, Mesh>()
  KEY_ROWS.forEach((row, r) => {
    ;[...row].forEach((ch, i) => {
      const key = new Mesh(capGeometry, capMaterial)
      key.position.set(-((row.length - 1) * 0.05) / 2 + r * 0.012 + i * 0.05 - 0.02, 0.783, 0.15 + r * 0.047)
      key.castShadow = true
      key.userData.y = key.position.y
      keyboard.add(key)
      keys.set(ch, key)
    })
  })
  const space = new Mesh(new BoxGeometry(0.27, 0.016, 0.04), capMaterial)
  space.position.set(0, 0.783, 0.15 + 4 * 0.047)
  space.castShadow = true
  space.userData.y = space.position.y
  keyboard.add(space)
  keys.set(' ', space)
  scene.add(keyboard)

  const device = new Group()
  device.position.set(0.3, 0.815, -0.17)
  device.rotation.y = -0.38
  const body = new Mesh(new BoxGeometry(0.36, 0.13, 0.22), new MeshStandardMaterial({ color: 0x2b2e2a, roughness: 0.42, metalness: 0.6 }))
  body.castShadow = body.receiveShadow = true
  device.add(body)

  const displayCanvas = document.createElement('canvas')
  displayCanvas.width = 256
  displayCanvas.height = 112
  const displayTexture = new CanvasTexture(displayCanvas)
  displayTexture.colorSpace = SRGBColorSpace
  const display = new Mesh(new PlaneGeometry(0.2, 0.0875), new MeshBasicMaterial({ map: displayTexture, toneMapped: false }))
  display.position.set(-0.03, 0.005, 0.1105)
  device.add(display)

  const ledMaterial = new MeshStandardMaterial({ color: 0x400806, emissive: 0xff2a1a, emissiveIntensity: 0.3, toneMapped: false })
  const led = new Mesh(new SphereGeometry(0.011, 16, 12), ledMaterial)
  led.position.set(0.12, 0.04, 0.113)
  device.add(led)

  const bulbs = [0, 1, 2].map(i => {
    const material = new MeshStandardMaterial({ color: 0x2a2620, emissive: 0xffa23a, emissiveIntensity: 0, toneMapped: false })
    const bulb = new Mesh(new SphereGeometry(0.008, 12, 10), material)
    bulb.position.set(-0.12 + i * 0.028, 0.068, 0.07)
    device.add(bulb)
    return material
  })
  scene.add(device)
  device.updateMatrixWorld(true)

  const redLight = new PointLight(0xff2a1a, RED * 0.15, 1.1, 2)
  redLight.position.copy(device.localToWorld(new Vector3(0.12, 0.06, 0.16)))
  scene.add(redLight)

  const chargeMaterial = new MeshStandardMaterial({ color: 0x5b3b25, roughness: 0.85 })
  const tapeMaterial = new MeshStandardMaterial({ color: 0x8f8a7e, roughness: 0.7 })
  for (const [y, z] of [[0.782, -0.225], [0.782, -0.16], [0.838, -0.192]] as const) {
    const charge = new Mesh(new CylinderGeometry(0.032, 0.032, 0.26, 20), chargeMaterial)
    charge.rotation.z = Math.PI / 2
    charge.position.set(-0.3, y, z)
    charge.castShadow = charge.receiveShadow = true
    scene.add(charge)
  }
  for (const x of [-0.37, -0.23]) {
    const tape = new Mesh(new BoxGeometry(0.03, 0.12, 0.13), tapeMaterial)
    tape.position.set(x, 0.805, -0.192)
    tape.castShadow = true
    scene.add(tape)
  }

  const wires: Wire[] = WIRE_HEX.map((hex, i) => {
    const start = device.localToWorld(new Vector3(-0.18, -0.025 + (i % 2) * 0.035, -0.06 + Math.floor(i / 2) * 0.06))
    const end = new Vector3(-0.165, 0.79 + (i % 3) * 0.012, -0.2 + (i - 2.5) * 0.017)
    const mid = start.clone().lerp(end, 0.5)
    mid.y = 0.758
    mid.z += 0.05 + i * 0.014
    const p1 = start.clone().add(new Vector3(-0.06, -0.035, 0.02 + i * 0.006))
    const p3 = end.clone().add(new Vector3(0.06, -0.02, 0.01))
    const curve = new CatmullRomCurve3([start, p1, mid, p3, end])
    const material = new MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0.1, emissive: hex, emissiveIntensity: 0 })
    const mesh = new Mesh(new TubeGeometry(curve, 64, 0.0055, 8), material)
    mesh.castShadow = true
    scene.add(mesh)
    return { curve, material, mesh, parts: [] }
  })

  const shade = new Mesh(new ConeGeometry(0.12, 0.14, 28, 1, true), new MeshStandardMaterial({ color: 0x24221f, roughness: 0.5, metalness: 0.5, side: DoubleSide }))
  shade.position.set(-0.44, 1.4, -0.14)
  shade.rotation.z = -0.42
  scene.add(shade)
  const bulbMaterial = new MeshBasicMaterial({ color: 0xffe0a8, toneMapped: false })
  const bulb = new Mesh(new SphereGeometry(0.035, 16, 12), bulbMaterial)
  bulb.position.set(-0.415, 1.35, -0.14)
  scene.add(bulb)
  const lamp = new SpotLight(0xffc883, LAMP, 3.6, 0.66, 0.6, 2)
  lamp.position.copy(bulb.position)
  lamp.target.position.set(0.06, 0.75, 0.02)
  lamp.castShadow = true
  lamp.shadow.mapSize.set(1024, 1024)
  lamp.shadow.bias = -0.0008
  lamp.shadow.radius = 3
  scene.add(lamp, lamp.target)
  scene.add(new HemisphereLight(0x2a2b33, 0x0a0806, 0.5))

  let shakeAmount = 0
  let flickerAmount = 0
  let ledLevel = 0
  let nerves = 1
  let lampTarget = LAMP
  let redExtra = 0
  let dark = false

  function render(now: number) {
    const t = now / 1000
    const swayX = reduced ? 0 : Math.sin(t * 0.5 * nerves) * 0.006 + Math.sin(t * 1.3) * 0.002
    const swayY = reduced ? 0 : Math.sin(t * 0.8 * nerves) * 0.004
    camera.position.set(camBase.x + swayX + (Math.random() - 0.5) * shakeAmount, camBase.y + swayY + (Math.random() - 0.5) * shakeAmount, camBase.z)
    camera.lookAt(camTarget.x + swayX * 0.5, camTarget.y, camTarget.z)
    shakeAmount *= 0.9
    if (!reduced && Math.random() < 0.004) flickerAmount = Math.max(flickerAmount, 0.1 + Math.random() * 0.3)
    const noise = reduced ? 0 : (Math.random() - 0.5) * 0.06
    lamp.intensity = lampTarget * (1 - flickerAmount * (Math.random() < 0.5 ? 1 : 0.2) + noise)
    bulbMaterial.color.setScalar(lampTarget > 0 ? 0.55 + 0.45 * (lamp.intensity / LAMP) : 0.05)
    flickerAmount *= 0.92
    ledLevel *= 0.9
    ledMaterial.emissiveIntensity = 0.25 + ledLevel * 1.1 + redExtra * 0.5
    redLight.intensity = dark ? 0 : (0.15 + ledLevel * 1.1 + redExtra) * RED
    renderer.render(scene, camera)
  }

  renderer.setAnimationLoop(render)

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
  })

  return {
    pressKey(ch) {
      const lower = ch.toLowerCase()
      const key = keys.get(SHIFTED[lower] ?? lower)
      if (!key) return
      key.position.y = key.userData.y - 0.006
      setTimeout(() => (key.position.y = key.userData.y), 90)
    },
    setDisplay(seconds, wiresLeft) {
      const ctx = displayCanvas.getContext('2d')!
      ctx.fillStyle = '#140404'
      ctx.fillRect(0, 0, 256, 112)
      ctx.fillStyle = seconds <= 10 ? '#ff4a36' : '#e8322a'
      ctx.font = '600 62px "IBM Plex Mono", monospace'
      ctx.textBaseline = 'middle'
      ctx.fillText(clock(seconds), 18, 46)
      ctx.fillStyle = '#7a1c16'
      ctx.font = '500 22px "IBM Plex Mono", monospace'
      ctx.fillText(`1 IN ${wiresLeft}`, 20, 94)
      displayTexture.needsUpdate = true
    },
    setSlips(count) {
      bulbs.forEach((material, i) => (material.emissiveIntensity = i < count ? 1.3 : 0))
    },
    litWire(index) {
      wires.forEach((wire, i) => (wire.material.emissiveIntensity = i === index ? 0.9 : 0))
    },
    cutWire(index) {
      const wire = wires[index]
      if (!wire || wire.parts.length) return
      wire.mesh.visible = false
      const points = wire.curve.getPoints(80)
      for (const segment of [points.slice(0, 28), points.slice(54)]) {
        const part = new Mesh(new TubeGeometry(new CatmullRomCurve3(segment), 32, 0.0055, 8), wire.material)
        part.castShadow = true
        scene.add(part)
        wire.parts.push(part)
      }
    },
    resetWires() {
      for (const wire of wires) {
        for (const part of wire.parts) {
          scene.remove(part)
          part.geometry.dispose()
        }
        wire.parts = []
        wire.mesh.visible = true
        wire.material.emissiveIntensity = 0
      }
    },
    beat() {
      ledLevel = 1
    },
    setNerves(level) {
      nerves = level
    },
    setDread(on) {
      lampTarget = on ? LAMP * 0.35 : LAMP
      redExtra = on ? 0.8 : 0
    },
    shake(amount) {
      if (!reduced) shakeAmount = Math.max(shakeAmount, amount)
    },
    flicker(amount) {
      flickerAmount = Math.max(flickerAmount, amount)
    },
    blackout() {
      dark = true
      lampTarget = 0
      redExtra = 0
      renderer.toneMappingExposure = 0
    },
    relight() {
      dark = false
      lampTarget = LAMP
      redExtra = 0
      renderer.toneMappingExposure = EXPOSURE
    },
  }
}
