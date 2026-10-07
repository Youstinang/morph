import { Environment, Lightformer } from "@react-three/drei";
import { NEON } from "./station-layout";

export function Chamber() {
  return (
    <>
      <color attach="background" args={["#04030a"]} />
      <fogExp2 attach="fog" args={["#0b0618", 0.016]} />
      <ambientLight intensity={0.22} color="#b9a8ff" />
      <hemisphereLight args={["#5fd6ff", "#3a0f33", 0.55]} />
      <directionalLight position={[-8, 14, 10]} intensity={1.7} color="#ffd9b8" />
      <directionalLight position={[2, 7, 16]} intensity={0.8} color="#d9e4ff" />
      <directionalLight position={[10, 6, -12]} intensity={2.2} color={NEON.cyan} />
      <directionalLight position={[-12, 5, -10]} intensity={1.9} color={NEON.pink} />
      <pointLight position={[-13, 3.2, -6]} color={NEON.pink} intensity={60} distance={26} decay={2} />
      <pointLight position={[14, 3.2, -6]} color={NEON.cyan} intensity={60} distance={26} decay={2} />
      <pointLight position={[0.6, 5.5, -15]} color={NEON.violet} intensity={70} distance={28} decay={2} />
      <pointLight position={[0, 2.5, 6]} color={NEON.amber} intensity={22} distance={16} decay={2} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.4} color={NEON.cyan} position={[8, 5, -10]} scale={[12, 2, 1]} />
        <Lightformer form="rect" intensity={1.4} color={NEON.pink} position={[-10, 4, -6]} rotation={[0, Math.PI / 2, 0]} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={0.7} color="#ffd9a8" position={[0, 6, 10]} rotation={[0, Math.PI, 0]} scale={[10, 2, 1]} />
        <Lightformer form="ring" intensity={0.6} color="#ffffff" position={[6, 8, 6]} scale={3} />
      </Environment>
    </>
  );
}
