import './style.css'
import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

const host = document.querySelector<HTMLDivElement>('#scene')!
const renderer = new WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
host.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0x050505)
const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.01, 20)

renderer.setAnimationLoop(() => renderer.render(scene, camera))

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
