import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Карта курьера — СПб и ЛО",
  description: "Личная карта курьера: подъезды, проходы, заметки. PostGIS + MapLibre + PMTiles + GraphHopper + Pelias.",
};

// Диапазоны глифов для предзагрузки. Самые используемые:
// 0-255   — ASCII/цифры/пунктуация (номера домов, дороги на английском)
// 1024-1279 — Кириллица (улицы, POI на русском)
const PRELOAD_GLYPH_RANGES = ["0-255", "1024-1279", "256-511"];
const PRELOAD_FONTS = ["Noto Sans Regular", "Noto Sans Bold"];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {PRELOAD_FONTS.flatMap((font) =>
          PRELOAD_GLYPH_RANGES.map((range) => (
            <link
              key={`${font}-${range}`}
              rel="preload"
              as="fetch"
              crossOrigin="anonymous"
              href={`/api/tiles/font/${encodeURIComponent(font)}/${range}.pbf`}
            />
          ))
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
