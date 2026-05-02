export function YardsAndFootways() {
  const bg = "#0e1116";
  const buildingLow = "#252a36";
  const buildingHigh = "#525984";

  const Change = ({
    label,
    before,
    after,
    note,
  }: {
    label: string;
    before: { color: string; style?: string };
    after: { color: string; style?: string };
    note: string;
  }) => (
    <div className="mb-4">
      <div className="text-xs text-slate-400 uppercase tracking-widest mb-1.5">{label}</div>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-[10px] text-slate-500 mb-1">Сейчас</div>
          <div className="flex items-center gap-2">
            <div
              className="w-32 h-3 rounded-sm flex-shrink-0"
              style={{
                background: before.color,
                ...(before.style === "dashed"
                  ? {
                      backgroundImage: `repeating-linear-gradient(90deg, ${before.color} 0 6px, transparent 6px 10px)`,
                      background: "transparent",
                      borderTop: `3px dashed ${before.color}`,
                      height: "3px",
                      marginTop: "4px",
                    }
                  : {}),
              }}
            />
            <span className="text-[11px] font-mono text-slate-600">{before.color}</span>
          </div>
        </div>
        <div className="text-slate-600 mt-4">→</div>
        <div className="flex-1">
          <div className="text-[10px] text-slate-400 mb-1">Предложение</div>
          <div className="flex items-center gap-2">
            <div
              className="w-32 h-3 rounded-sm flex-shrink-0"
              style={{
                background: after.color,
                ...(after.style === "dashed"
                  ? {
                      backgroundImage: `repeating-linear-gradient(90deg, ${after.color} 0 6px, transparent 6px 10px)`,
                      background: "transparent",
                      borderTop: `3px dashed ${after.color}`,
                      height: "3px",
                      marginTop: "4px",
                    }
                  : {}),
              }}
            />
            <span className="text-[11px] font-mono text-slate-300">{after.color}</span>
          </div>
        </div>
      </div>
      <p className="text-[12px] text-slate-500 mt-2 leading-relaxed">{note}</p>
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
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[11px] uppercase tracking-[0.15em] text-slate-500">
                Улучшение 1 / 3
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mt-1">Дворы и проходы</h2>
            <p className="text-slate-400 text-[13px] mt-2 leading-relaxed">
              Курьер проходит через дворы десятки раз в день. Сейчас пешеходные
              тропы почти невидимы на тёмном фоне — контраст недостаточен.
            </p>
          </div>

          <div className="p-7">
            <div
              className="rounded-xl p-4 mb-6 border"
              style={{ background: "#0a0e15", borderColor: "#1a2030" }}
            >
              <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-3">
                Визуальный сравнительный фрагмент
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="text-[10px] text-slate-600 mb-2">Сейчас</div>
                  <div
                    className="rounded-lg overflow-hidden relative"
                    style={{ height: 120, background: bg }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{ background: "#12161e", opacity: 0.4 }}
                    />
                    <div
                      className="absolute"
                      style={{
                        left: 12,
                        top: 20,
                        width: 70,
                        height: 50,
                        background: buildingLow,
                        borderRadius: 2,
                      }}
                    />
                    <div
                      className="absolute"
                      style={{
                        left: 95,
                        top: 15,
                        width: 55,
                        height: 60,
                        background: buildingLow,
                        borderRadius: 2,
                      }}
                    />
                    <div
                      className="absolute"
                      style={{
                        left: 12,
                        top: 80,
                        width: 45,
                        height: 30,
                        background: buildingHigh,
                        borderRadius: 2,
                      }}
                    />
                    <svg className="absolute inset-0 w-full h-full">
                      <line
                        x1="82"
                        y1="0"
                        x2="82"
                        y2="120"
                        stroke="#2a3245"
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                      />
                      <line
                        x1="0"
                        y1="75"
                        x2="160"
                        y2="75"
                        stroke="#2a3245"
                        strokeWidth="1.2"
                        strokeDasharray="4 2"
                      />
                      <line
                        x1="60"
                        y1="35"
                        x2="95"
                        y2="35"
                        stroke="#ffd166"
                        strokeWidth="1.5"
                        strokeDasharray="3 2"
                        strokeOpacity="0.6"
                      />
                    </svg>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1.5 text-center">
                    Пешеходные пути едва видны
                  </p>
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-slate-400 mb-2">Предложение</div>
                  <div
                    className="rounded-lg overflow-hidden relative"
                    style={{ height: 120, background: bg }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{ background: "#12161e", opacity: 0.4 }}
                    />
                    <div
                      className="absolute"
                      style={{
                        left: 12,
                        top: 20,
                        width: 70,
                        height: 50,
                        background: buildingLow,
                        borderRadius: 2,
                      }}
                    />
                    <div
                      className="absolute"
                      style={{
                        left: 95,
                        top: 15,
                        width: 55,
                        height: 60,
                        background: buildingLow,
                        borderRadius: 2,
                      }}
                    />
                    <div
                      className="absolute"
                      style={{
                        left: 12,
                        top: 80,
                        width: 45,
                        height: 30,
                        background: buildingHigh,
                        borderRadius: 2,
                      }}
                    />
                    <svg className="absolute inset-0 w-full h-full">
                      <line
                        x1="82"
                        y1="0"
                        x2="82"
                        y2="120"
                        stroke="#4a6080"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                      <line
                        x1="0"
                        y1="75"
                        x2="160"
                        y2="75"
                        stroke="#4a6080"
                        strokeWidth="1.8"
                        strokeDasharray="4 2"
                      />
                      <line
                        x1="60"
                        y1="35"
                        x2="95"
                        y2="35"
                        stroke="#ffd166"
                        strokeWidth="2.5"
                        strokeDasharray="3 1.5"
                      />
                    </svg>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                    Чёткие пути через дворы
                  </p>
                </div>
              </div>
            </div>

            <Change
              label="Тропинки во дворе (footway / path)"
              before={{ color: "#2a3245", style: "dashed" }}
              after={{ color: "#4a6080", style: "dashed" }}
              note="Контраст вырастает в 2× — курьер видит маршрут через двор с первого взгляда, не теряя время."
            />

            <Change
              label="Арки и проходы насквозь (tunnel=building_passage)"
              before={{ color: "#ffd166", style: "dashed" }}
              after={{ color: "#ffd166" }}
              note="Арки — фишка Питера. Делаем сплошную линию вместо пунктира на z17+ и увеличиваем толщину. Пунктир остаётся на z14–16."
            />

            <Change
              label="Сервисные дороги во дворах (highway=service)"
              before={{ color: "#3e4e68" }}
              after={{ color: "#2e4060" }}
              note="Чуть темнее жилых улиц — курьер сразу отличает «заезд во двор» от проезжей части."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
