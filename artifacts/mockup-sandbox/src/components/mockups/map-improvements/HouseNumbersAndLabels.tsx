export function HouseNumbersAndLabels() {
  const bg = "#0e1116";
  const buildingLow = "#252a36";
  const buildingMid = "#3d4360";

  const ZoomRow = ({
    zoom,
    before,
    after,
  }: {
    zoom: string;
    before: { size: number; opacity?: number };
    after: { size: number; opacity?: number };
  }) => (
    <div className="flex items-center gap-3 py-1.5 border-b" style={{ borderColor: "#1a2030" }}>
      <div className="w-12 text-[11px] font-mono text-slate-500">{zoom}</div>
      <div className="flex-1 flex items-center gap-1.5">
        <span
          className="font-bold"
          style={{
            color: "#ffd166",
            fontSize: before.size,
            opacity: before.opacity ?? 1,
            textShadow: "0 0 4px #0e1116",
          }}
        >
          47к3
        </span>
        <span className="text-[9px] text-slate-600">{before.size}px</span>
      </div>
      <div className="text-slate-600">→</div>
      <div className="flex-1 flex items-center gap-1.5">
        <span
          className="font-bold"
          style={{
            color: "#ffd166",
            fontSize: after.size,
            opacity: after.opacity ?? 1,
            textShadow: "0 0 4px #0e1116",
          }}
        >
          47к3
        </span>
        <span className="text-[9px] text-slate-400">{after.size}px</span>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#080b10", fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-[620px]">
        <div
          className="rounded-2xl overflow-hidden border"
          style={{ background: bg, borderColor: "#1e2535" }}
        >
          <div
            className="px-7 pt-6 pb-5 border-b"
            style={{ borderColor: "#1e2535", background: "#0c1019" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-[11px] uppercase tracking-[0.15em] text-slate-500">
                Улучшение 3 / 3
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mt-1">Номера домов и подписи</h2>
            <p className="text-slate-400 text-[13px] mt-2 leading-relaxed">
              Номер дома — первое, что ищет курьер. На z13 сейчас 10px — читается
              с трудом. Названия второстепенных улиц появляются слишком поздно.
            </p>
          </div>

          <div className="p-7">
            <div
              className="rounded-xl p-4 mb-6 border"
              style={{ background: "#0a0e15", borderColor: "#1a2030" }}
            >
              <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-3">
                Визуальный сравнительный фрагмент (z14)
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="text-[10px] text-slate-600 mb-2">Сейчас</div>
                  <div
                    className="rounded-lg overflow-hidden relative flex items-center justify-center"
                    style={{ height: 120, background: bg }}
                  >
                    <div
                      className="absolute"
                      style={{ left: 8, top: 10, width: 64, height: 48, background: buildingLow, borderRadius: 2 }}
                    />
                    <div
                      className="absolute"
                      style={{ left: 90, top: 8, width: 60, height: 52, background: buildingMid, borderRadius: 2 }}
                    />
                    <div
                      className="absolute"
                      style={{ left: 12, top: 70, width: 50, height: 38, background: buildingLow, borderRadius: 2 }}
                    />
                    <div className="absolute" style={{ left: 24, top: 26 }}>
                      <span style={{ fontSize: 10, color: "#ffd166", fontWeight: 700, textShadow: "0 0 3px #0e1116" }}>12</span>
                    </div>
                    <div className="absolute" style={{ left: 108, top: 28 }}>
                      <span style={{ fontSize: 10, color: "#ffd166", fontWeight: 700, textShadow: "0 0 3px #0e1116" }}>14к1</span>
                    </div>
                    <div className="absolute" style={{ left: 22, top: 82 }}>
                      <span style={{ fontSize: 10, color: "#ffd166", fontWeight: 700, textShadow: "0 0 3px #0e1116" }}>16</span>
                    </div>
                    <svg className="absolute inset-0 w-full h-full">
                      <line x1="0" y1="62" x2="160" y2="62" stroke="#3e4e68" strokeWidth="3.5" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1.5 text-center">10px — мелко на ходу</p>
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-slate-400 mb-2">Предложение</div>
                  <div
                    className="rounded-lg overflow-hidden relative"
                    style={{ height: 120, background: bg }}
                  >
                    <div
                      className="absolute"
                      style={{ left: 8, top: 10, width: 64, height: 48, background: buildingLow, borderRadius: 2 }}
                    />
                    <div
                      className="absolute"
                      style={{ left: 90, top: 8, width: 60, height: 52, background: buildingMid, borderRadius: 2 }}
                    />
                    <div
                      className="absolute"
                      style={{ left: 12, top: 70, width: 50, height: 38, background: buildingLow, borderRadius: 2 }}
                    />
                    <div className="absolute" style={{ left: 20, top: 22 }}>
                      <span style={{ fontSize: 13, color: "#ffd166", fontWeight: 700, textShadow: "0 0 4px #0e1116, 0 0 4px #0e1116" }}>12</span>
                    </div>
                    <div className="absolute" style={{ left: 103, top: 24 }}>
                      <span style={{ fontSize: 13, color: "#ffd166", fontWeight: 700, textShadow: "0 0 4px #0e1116, 0 0 4px #0e1116" }}>14к1</span>
                    </div>
                    <div className="absolute" style={{ left: 20, top: 79 }}>
                      <span style={{ fontSize: 13, color: "#ffd166", fontWeight: 700, textShadow: "0 0 4px #0e1116, 0 0 4px #0e1116" }}>16</span>
                    </div>
                    <svg className="absolute inset-0 w-full h-full">
                      <line x1="0" y1="62" x2="160" y2="62" stroke="#4a5e7a" strokeWidth="3.5" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">13px — чётко с первого взгляда</p>
                </div>
              </div>
            </div>

            <div className="mb-5">
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">
                Размер номера дома по зумам
              </div>
              <div
                className="rounded-xl overflow-hidden border"
                style={{ background: "#0a0e15", borderColor: "#1a2030" }}
              >
                <div className="flex items-center gap-3 px-3 py-1.5 border-b" style={{ borderColor: "#1a2030" }}>
                  <div className="w-12 text-[10px] text-slate-600">Зум</div>
                  <div className="flex-1 text-[10px] text-slate-600">Сейчас</div>
                  <div className="w-4" />
                  <div className="flex-1 text-[10px] text-slate-400">Предложение</div>
                </div>
                <div className="px-3">
                  <ZoomRow zoom="z12" before={{ size: 0, opacity: 0 }} after={{ size: 9, opacity: 0.6 }} />
                  <ZoomRow zoom="z13" before={{ size: 10 }} after={{ size: 12 }} />
                  <ZoomRow zoom="z15" before={{ size: 13 }} after={{ size: 15 }} />
                  <ZoomRow zoom="z17" before={{ size: 16 }} after={{ size: 18 }} />
                  <ZoomRow zoom="z19" before={{ size: 19 }} after={{ size: 21 }} />
                </div>
              </div>
            </div>

            <div className="mb-2">
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">
                Подписи второстепенных улиц
              </div>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex items-center gap-2 flex-1">
                  <div className="text-[10px] text-slate-500">Minzoom сейчас:</div>
                  <div className="px-2 py-0.5 rounded font-mono text-[11px]" style={{ background: "#1a2030", color: "#cfd6dc" }}>z14</div>
                </div>
                <div className="text-slate-600">→</div>
                <div className="flex items-center gap-2 flex-1">
                  <div className="text-[10px] text-slate-400">Предложение:</div>
                  <div className="px-2 py-0.5 rounded font-mono text-[11px]" style={{ background: "#1a3040", color: "#e8edf3" }}>z13</div>
                </div>
              </div>
              <p className="text-[12px] text-slate-500 leading-relaxed">
                На z13 курьер уже видит конкретный квартал — ему нужно знать название улицы,
                чтобы сориентироваться. Появление подписей на зум раньше сэкономит секунды.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
