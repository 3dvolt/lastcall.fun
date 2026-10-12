export function Logo({ size = 28 }: { size?: number }) {
  return <img src="/logo.png" width={size} height={size} alt="" aria-hidden="true" style={{ display: "block", flex: "none", borderRadius: size * 0.2 }} />;
}
