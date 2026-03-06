import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";

// Key cities: [lat, lng, label]
const CITIES: [number, number, string][] = [
  [22.3193, 114.1694, "Hong Kong"],
  [22.5431, 114.0579, "Shenzhen"],
  [23.1291, 113.2644, "Guangzhou"],
  [22.1987, 113.5439, "Macau"],
  [1.3521, 103.8198, "Singapore"],
  [35.6762, 139.6503, "Tokyo"],
  [37.5665, 126.978, "Seoul"],
  [25.033, 121.5654, "Taipei"],
  [13.7563, 100.5018, "Bangkok"],
  [51.5074, -0.1278, "London"],
  [40.7128, -74.006, "New York"],
  [37.7749, -122.4194, "San Francisco"],
];

// Connections from HK
const CONNECTIONS: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [0, 11],
  [1, 2], [4, 8],
];

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function GlobeMesh() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.002;
    }
  });

  const cityPoints = useMemo(() => {
    return CITIES.map(([lat, lng]) => latLngToVector3(lat, lng, 2.02));
  }, []);

  const arcLines = useMemo(() => {
    return CONNECTIONS.map(([from, to]) => {
      const start = cityPoints[from];
      const end = cityPoints[to];
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const dist = start.distanceTo(end);
      mid.normalize().multiplyScalar(2 + dist * 0.15);

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const points = curve.getPoints(32);
      return points;
    });
  }, [cityPoints]);

  return (
    <group ref={groupRef} rotation={[0.3, -1.8, 0]}>
      {/* Globe sphere */}
      <Sphere args={[2, 64, 64]}>
        <meshPhongMaterial
          color="#0c1426"
          transparent
          opacity={0.85}
          wireframe={false}
        />
      </Sphere>

      {/* Wireframe overlay */}
      <Sphere args={[2.01, 32, 32]}>
        <meshBasicMaterial
          color="#0ea5e9"
          wireframe
          transparent
          opacity={0.06}
        />
      </Sphere>

      {/* City dots */}
      {cityPoints.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[i === 0 ? 0.06 : 0.035, 16, 16]} />
          <meshBasicMaterial color={i === 0 ? "#f97316" : i <= 3 ? "#22d3ee" : "#0ea5e9"} />
        </mesh>
      ))}

      {/* Glow ring for HK */}
      <mesh position={cityPoints[0]}>
        <ringGeometry args={[0.08, 0.12, 32]} />
        <meshBasicMaterial color="#f97316" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* Connection arcs */}
      {arcLines.map((points, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
              count={points.length}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={i <= 2 ? "#22d3ee" : "#0ea5e9"}
            transparent
            opacity={i <= 2 ? 0.5 : 0.25}
          />
        </line>
      ))}
    </group>
  );
}

const InteractiveGlobe = () => {
  return (
    <div className="w-full h-full min-h-[400px]">
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 45 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <pointLight position={[-5, -5, 5]} intensity={0.3} color="#0ea5e9" />
        <GlobeMesh />
      </Canvas>
    </div>
  );
};

export default InteractiveGlobe;
