"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#8a949e", fontSize: 14 }}>
      Загрузка карты…
    </div>
  ),
});

export default function HomePage() {
  return <App />;
}
