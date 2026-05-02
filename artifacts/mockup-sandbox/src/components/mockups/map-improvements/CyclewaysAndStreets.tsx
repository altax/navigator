export function CyclewaysAndStreets() {
  const bg = "#0e1116";
  const buildingLow = "#252a36";

  const Change = ({
    label,
    before,
    after,
    note,
  }: {
    label: string;
    before: { color: string; width?: number };
    after: { color: string; width?: number };
    note: string;
  }) => (
    <div className="mb-4">
      <div className="text-xs text-slate-400 uppercase tracking-widest mb-1.5">{label}</div>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-[10px] text-slate-500 mb-1">Сейчас</div>
          <div className="flex items-center gap-2">
            <div
              className="flex-shrink-0"
              style={{
                width: 96,
                height: before.width ?? 4,
                background: before.color,
                borderRadius: 2,
                marginTop: 2,
              }}
            />
            <span className="text-[11px] font-mono text-slate-600">{before.color}</span>
          </div>
        </div>
        <div className="text-slate-600 mt-3">→</div>
        <div className="flex-1">
          <div className="text-[10px] text-slate-400 mb-1">Предложение</div>
          <div className="flex items-center gap-2">
            <div
              className="flex-shrink-0"
              style={{
                width: 96,
                height: after.width ?? 4,
                background: after.color,
                borderRadius: 2,
                marginTop: 2,
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
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-[11px] uppercase tracking-[0.15em] text-slate-500">
                Улучшение 2 / 3
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mt-1">Велодорожки и улицы</h2>
            <p className="text-slate-400 text-[13px] mt-2 leading-relaxed">
              Велодорожки — главный инструмент e-bike курьера. Сейчас тёмно-зелёный
              цвет сливается с фоном. Иерархия дорог тоже недостаточно чёткая.
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
                      className="absolute"
                      style={{ left: 10, top: 15, width: 55, height: 38, background: buildingLow, borderRadius: 2 }}
                    />
                    <div
                      className="absolute"
                      style={{ left: 95, top: 20, width: 50, height: 42, background: buildingLow, borderRadius: 2 }}
                    />
                    <svg className="absolute inset-0 w-full h-full">
                      <line x1="0" y1="62" x2="160" y2="62" stroke="#5070a0" strokeWidth="6" />
                      <line x1="0" y1="80" x2="160" y2="80" stroke="#3e4e68" strokeWidth="3" />
                      <line x1="0" y1="95" x2="160" y2="95" stroke="#3e4e68" strokeWidth="2" />
                      <line x1="65" y1="0" x2="65" y2="120" stroke="#1a7a3c" strokeWidth="2" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1.5 text-center">
                    Велополоса почти невидима
                  </p>
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-slate-400 mb-2">Предложение</div>
                  <div
                    className="rounded-lg overflow-hidden relative"
                    style={{ height: 120, background: bg }}
                  >
                    <div
                      className="absolute"
                      style={{ left: 10, top: 15, width: 55, height: 38, background: buildingLow, borderRadius: 2 }}
                    />
                    <div
                      className="absolute"
                      style={{ left: 95, top: 20, width: 50, height: 42, background: buildingLow, borderRadius: 2 }}
                    />
                    <svg className="absolute inset-0 w-full h-full">
                      <line x1="0" y1="62" x2="160" y2="62" stroke="#6090c0" strokeWidth="7" />
                      <line x1="0" y1="80" x2="160" y2="80" stroke="#4a5e7a" strokeWidth="3.5" />
                      <line x1="0" y1="95" x2="160" y2="95" stroke="#3a4e66" strokeWidth="2" />
                      <line x1="65" y1="0" x2="65" y2="120" stroke="#22c55e" strokeWidth="2.5" />
                      <line x1="65" y1="0" x2="65" y2="120" stroke="#22c55e" strokeWidth="6" strokeOpacity="0.15" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                    Чёткий маршрут для e-bike
                  </p>
                </div>
              </div>
            </div>

            <Change
              label="Велодорожки и велополосы (highway=cycleway)"
              before={{ color: "#1a7a3c", width: 3 }}
              after={{ color: "#22c55e", width: 3 }}
              note="Яркий lime-green виден мгновенно. На z15+ добавляем слабое зелёное свечение (boxShadow-эффект через вторую линию с opacity 15%) — велополоса «светится» как на реальной разметке."
            />

            <Change
              label="Главные дороги (primary / secondary)"
              before={{ color: "#5070a0", width: 5 }}
              after={{ color: "#6090c0", width: 6 }}
              note="Насыщенность +20% — проспекты и шоссе выделяются чётче. Толщина тоже чуть больше на z13."
            />

            <Change
              label="Жилые улицы (residential)"
              before={{ color: "#3e4e68", width: 3 }}
              after={{ color: "#4a5e7a", width: 3.5 }}
            note="Светлее на 10% — отчётливо отличаются от тёмного фона, но не «кричат» как главные дороги."
            />

            <Change
              label="Жилые зоны / велодорожки во дворе (living_street)"
              before={{ color: "#3e4e68", width: 2 }}
              after={{ color: "#3a4a5c", width: 2 }}
              note="Чуть теплее и темнее жилых улиц — сразу ясно, что это зона медленного движения, приоритет пешеходу."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
