import { ImageResponse } from "next/og";

export const alt = "KPLC Assistant — live demo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0c130f", borderBottom: "16px solid #33c46a", color: "#edf1e9" }}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: 2 }}>KPLC Assistant</div>
        <div style={{ fontSize: 38, color: "#90a396", marginTop: 16 }}>Answers grounded in Kenya Power&apos;s published guidance</div>
        <div style={{ fontSize: 56, color: "#e8a33d", marginTop: 48 }}>00:47 ● live</div>
      </div>
    ),
    size
  );
}
