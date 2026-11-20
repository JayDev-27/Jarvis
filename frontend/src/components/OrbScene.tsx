import { Environment, Lightformer, MeshDistortMaterial } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, type Group, type InstancedMesh, MathUtils, Object3D } from 'three'
import type { AudioLevels } from '../hooks/useSpeechToText'

export type OrbMode = 'idle' | 'listening' | 'thinking' | 'speaking'

type LevelsRef = RefObject<AudioLevels>

type Props = {
  micLevels: LevelsRef
  voiceLevels: LevelsRef
  mode: OrbMode
  reducedMotion?: boolean
}

// Seeded PRNG so the layout is stable between renders (react-hooks/purity friendly).
function rng(seed: number) {
  let s = seed
  return () => {
    s = (1664525 * s + 1013904223) % 4294967296
    return s / 4294967296
  }
}

type Satellite = {
  radius: number
  speed: number
  phase: number
  tilt: number
  yaw: number
  size: number
  bob: number
}

function makeSatellites(count: number, seed: number): Satellite[] {
  const r = rng(seed)
  return Array.from({ length: count }, () => ({
    radius: 2.0 + r() * 1.5,
    speed: (0.12 + r() * 0.28) * (r() > 0.5 ? 1 : -1),
    phase: r() * Math.PI * 2,
    tilt: (r() - 0.5) * 1.6,
    yaw: r() * Math.PI * 2,
    size: 0.09 + Math.pow(r(), 2.2) * 0.32,
    bob: r() * Math.PI * 2,
  }))
}

const ACCENT = new Color('#2b36ff')
const ACCENT_HOT = new Color('#5b8cff')

/** One family of glossy orbiting spheres sharing a material. */
function SatelliteSwarm({
  sats, color, roughness, metalness, clearcoat, levels, speedRef,
}: {
  sats: Satellite[]
  color: string
  roughness: number
  metalness: number
  clearcoat: number
  levels: RefObject<{ bass: number; volume: number }>
  speedRef: RefObject<number>
}) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const time = useRef(0)

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m) return
    time.current += delta * (speedRef.current ?? 1)
    const t = time.current
    const { bass, volume } = levels.current ?? { bass: 0, volume: 0 }
    sats.forEach((s, i) => {
      const a = s.phase + t * s.speed
      const rad = s.radius * (1 + bass * 0.35)
      let x = Math.cos(a) * rad
      let z = Math.sin(a) * rad
      let y = Math.sin(t * 0.6 + s.bob) * 0.18
      // incline each orbit
      const cy = Math.cos(s.tilt), sy = Math.sin(s.tilt)
      const y2 = y * cy - z * sy
      z = y * sy + z * cy
      y = y2
      const cw = Math.cos(s.yaw), sw = Math.sin(s.yaw)
      const x2 = x * cw - z * sw
      z = x * sw + z * cw
      x = x2
      dummy.position.set(x, y, z)
      dummy.scale.setScalar(s.size * (1 + volume * 0.9))
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, sats.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshPhysicalMaterial color={color} roughness={roughness} metalness={metalness} clearcoat={clearcoat} clearcoatRoughness={0.08} />
    </instancedMesh>
  )
}

function Orb({ micLevels, voiceLevels, mode, reducedMotion }: Props) {
  const root = useRef<Group>(null)
  const core = useRef<Group>(null)
  // MeshDistortMaterial exposes `distort` / `speed` uniforms on the instance
  const material = useRef<{ distort: number; speed: number; color: Color; emissiveIntensity: number } | null>(null)
  const smoothed = useRef({ volume: 0, bass: 0, mid: 0, treble: 0 })
  const speedRef = useRef(1)
  const { pointer } = useThree()

  const blue = useMemo(() => makeSatellites(14, 11), [])
  const white = useMemo(() => makeSatellites(12, 29), [])
  const black = useMemo(() => makeSatellites(10, 47), [])

  useFrame(({ clock }, delta) => {
    const mic = micLevels.current ?? { volume: 0, bass: 0, mid: 0, treble: 0 }
    const voice = voiceLevels.current ?? { volume: 0, bass: 0, mid: 0, treble: 0 }
    const src = voice.volume > mic.volume ? voice : mic
    const k = 1 - Math.exp(-delta * 10)
    const sm = smoothed.current
    sm.volume = MathUtils.lerp(sm.volume, Math.min(src.volume * 2.2, 1.4), k)
    sm.bass = MathUtils.lerp(sm.bass, Math.min(src.bass * 1.6, 1.4), k)
    sm.mid = MathUtils.lerp(sm.mid, Math.min(src.mid * 1.8, 1.4), k)
    sm.treble = MathUtils.lerp(sm.treble, Math.min(src.treble * 2, 1.4), k)

    const t = clock.getElapsedTime()
    const targetSpeed = reducedMotion ? 0.25 : mode === 'thinking' ? 3.2 : mode === 'listening' ? 1.6 : 1
    speedRef.current = MathUtils.lerp(speedRef.current, targetSpeed, 1 - Math.exp(-delta * 3))

    if (root.current) {
      // gentle parallax towards the pointer
      root.current.rotation.y = MathUtils.lerp(root.current.rotation.y, pointer.x * 0.35, 0.05)
      root.current.rotation.x = MathUtils.lerp(root.current.rotation.x, -pointer.y * 0.25, 0.05)
    }
    if (core.current) {
      const breath = reducedMotion ? 0 : Math.sin(t * 1.4) * 0.025
      const s = 1 + breath + sm.volume * 0.32 + sm.bass * 0.08
      core.current.scale.setScalar(s)
      core.current.rotation.y += delta * 0.15 * speedRef.current
    }
    const mat = material.current
    if (mat) {
      const base = mode === 'thinking' ? 0.42 : mode === 'listening' ? 0.32 : 0.22
      mat.distort = MathUtils.lerp(mat.distort, base + sm.mid * 0.35 + sm.treble * 0.15, 0.08)
      mat.speed = 1.2 + speedRef.current * 1.4 + sm.volume * 4
      mat.color.lerpColors(ACCENT, ACCENT_HOT, Math.min(1, sm.volume * 1.6 + (mode === 'listening' ? 0.25 : 0)))
      mat.emissiveIntensity = 0.12 + sm.volume * 0.9
    }
  })

  return (
    <group ref={root}>
      <group ref={core}>
        <mesh>
          <icosahedronGeometry args={[1.25, 48]} />
          <MeshDistortMaterial
            ref={material as never}
            color="#2b36ff"
            emissive="#1a22c9"
            emissiveIntensity={0.12}
            roughness={0.12}
            metalness={0.05}
            distort={0.22}
            speed={1.6}
          />
        </mesh>
      </group>
      <SatelliteSwarm sats={blue} color="#2b36ff" roughness={0.18} metalness={0.05} clearcoat={1} levels={smoothed} speedRef={speedRef} />
      <SatelliteSwarm sats={white} color="#e9eaf2" roughness={0.28} metalness={0} clearcoat={0.6} levels={smoothed} speedRef={speedRef} />
      <SatelliteSwarm sats={black} color="#0b0b12" roughness={0.1} metalness={0.3} clearcoat={1} levels={smoothed} speedRef={speedRef} />
    </group>
  )
}

/** Keeps the orb framed on narrow (portrait) canvases. */
function ResponsiveCamera() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    camera.position.z = aspect < 0.8 ? 10.5 : aspect < 1.2 ? 9 : 8
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

export function OrbScene(props: Props) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 8], fov: 42 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      aria-hidden
    >
      <ResponsiveCamera />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 6, 4]} intensity={2.2} />
      <directionalLight position={[-6, -2, -3]} intensity={0.8} color="#5b8cff" />
      <Orb {...props} />
      {/* Studio lighting built from local light-formers — no HDR download needed. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, -6]} scale={[12, 3, 1]} />
        <Lightformer form="rect" intensity={2} position={[-6, 0, 2]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#6f86ff" position={[6, -1, 1]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="ring" intensity={2} position={[0, 0, 6]} scale={3} />
      </Environment>
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.75} luminanceSmoothing={0.3} intensity={0.55} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  )
}
