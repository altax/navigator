/**
 * Питерский нормализатор адресов.
 * Парсит вольную строку курьера в структуру для геокодера:
 *   "Седова 11 к2 лит А", "ул. Рубинштейна, 22", "пр. Большевиков 12"
 *   → { streetType, streetName, house, korpus, litera, city }
 *
 * Используется как для подготовки структурного запроса к Nominatim,
 * так и для генерации альтернативных вариантов поиска.
 */

export interface ParsedAddress {
  city: string;          // обычно "Санкт-Петербург"
  streetType?: string;   // "улица", "проспект", "переулок", …
  streetName?: string;   // "Рубинштейна"
  house?: string;        // "22"
  korpus?: string;       // "2"
  litera?: string;       // "А"
  // Полный канонический адрес для поиска
  full: string;
  // Полный адрес для отображения курьеру (короче)
  display: string;
}

const STREET_TYPE_MAP: Record<string, string> = {
  "ул": "улица",
  "ул.": "улица",
  "улица": "улица",
  "пр": "проспект",
  "пр.": "проспект",
  "пр-кт": "проспект",
  "пр-т": "проспект",
  "просп": "проспект",
  "просп.": "проспект",
  "проспект": "проспект",
  "наб": "набережная",
  "наб.": "набережная",
  "набережная": "набережная",
  "пер": "переулок",
  "пер.": "переулок",
  "переулок": "переулок",
  "бул": "бульвар",
  "бул.": "бульвар",
  "бульв": "бульвар",
  "бульв.": "бульвар",
  "бульвар": "бульвар",
  "ш": "шоссе",
  "ш.": "шоссе",
  "шоссе": "шоссе",
  "пл": "площадь",
  "пл.": "площадь",
  "площадь": "площадь",
  "ал": "аллея",
  "ал.": "аллея",
  "аллея": "аллея",
  "пр-зд": "проезд",
  "проезд": "проезд",
  "лин": "линия",
  "лин.": "линия",
  "линия": "линия",
  "туп": "тупик",
  "туп.": "тупик",
  "тупик": "тупик",
  "дор": "дорога",
  "дор.": "дорога",
  "дорога": "дорога",
};

const SPB_DISTRICT_HINTS: Record<string, string> = {
  "в.о.": "Васильевский остров",
  "во": "Васильевский остров",
  "васильевский": "Васильевский остров",
  "пс": "Петроградская сторона",
};

const HOUSE_RE = /\b(\d+[\-/]?\d*[а-яa-zА-ЯA-Z]?)/;
const KORPUS_RE = /(?:к(?:орп(?:ус)?)?\.?\s*|\/)\s*(\d+)/i;
const LITERA_RE = /(?:литер[аы]?|лит\.?)\s*([А-ЯA-Zа-яa-z])/i;
// Когда литера слитно с номером: "11А", "22Б"
const HOUSE_WITH_LITERA_RE = /^(\d+)([А-ЯA-Zа-яa-z])$/;

/**
 * Раскрыть сокращения вроде "ул." → "улица".
 */
function expandStreetTypeToken(token: string): string | null {
  const lc = token.toLowerCase().replace(/[^а-яёa-z.\-]/g, "");
  return STREET_TYPE_MAP[lc] ?? null;
}

/**
 * Капитализация имени собственного: "пушкина" → "Пушкина".
 */
function capitalize(s: string): string {
  if (!s) return s;
  return s
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "-") return part;
      if (part.length === 0) return part;
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

/**
 * Достать дом + корпус + литеру из хвоста запроса.
 * Возвращает совпадения и оставшийся текст без них.
 */
function extractHousePart(rest: string): { house?: string; korpus?: string; litera?: string; left: string } {
  let left = rest;
  let korpus: string | undefined;
  let litera: string | undefined;

  const km = left.match(KORPUS_RE);
  if (km) {
    korpus = km[1];
    left = left.replace(KORPUS_RE, " ");
  }
  const lm = left.match(LITERA_RE);
  if (lm) {
    litera = lm[1].toUpperCase();
    left = left.replace(LITERA_RE, " ");
  }
  const hm = left.match(HOUSE_RE);
  let house: string | undefined;
  if (hm) {
    house = hm[1];
    left = left.replace(HOUSE_RE, " ");
    // "11А" — литера слитно с номером
    const wl = house.match(HOUSE_WITH_LITERA_RE);
    if (wl && !litera) {
      house = wl[1];
      litera = wl[2].toUpperCase();
    }
  }
  return { house, korpus, litera, left: left.replace(/\s+/g, " ").trim() };
}

/**
 * Парсит вольный адрес. Возвращает null, если адрес не похож на питерский
 * (нет улицы или дома) — такой запрос лучше отдать в свободный поиск.
 */
export function parseSpbAddress(input: string): ParsedAddress | null {
  if (!input) return null;
  // Уберём лишние запятые и нормализуем пробелы
  const raw = input.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();
  if (raw.length < 2) return null;

  // Город Санкт-Петербург по умолчанию, но если явно "Гатчина" / "Колпино" / etc — берём его
  const city = "Санкт-Петербург";

  // 1) Извлекаем дом / корпус / литеру с хвоста
  const { house, korpus, litera, left } = extractHousePart(raw);

  // 2) В оставшемся ищем сокращение типа улицы
  const tokens = left.split(/\s+/);
  let streetType: string | undefined;
  let streetTypeIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    const expanded = expandStreetTypeToken(tokens[i]);
    if (expanded) {
      streetType = expanded;
      streetTypeIdx = i;
      break;
    }
  }
  // 3) Имя улицы — всё, что осталось вокруг типа
  let streetName: string | undefined;
  if (streetTypeIdx >= 0) {
    const before = tokens.slice(0, streetTypeIdx).join(" ").trim();
    const after = tokens.slice(streetTypeIdx + 1).join(" ").trim();
    streetName = (before || after).trim();
  } else {
    // Тип не указан, считаем всё имя улицы (Nominatim сам поймёт)
    streetName = left.trim();
  }
  streetName = streetName.replace(/^[\.,;:]+|[\.,;:]+$/g, "").trim();
  if (!streetName) return null;

  // Если у нас нет ни дома, ни внятного типа улицы — это вряд ли структурный адрес
  if (!house && !streetType) return null;

  // Нормализованные значения
  const niceStreetName = capitalize(streetName);
  const display = [
    streetType ? `${streetType} ${niceStreetName}` : niceStreetName,
    house && (korpus ? `${house} к${korpus}` : house),
    litera ? `лит. ${litera}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  // В OSM номер дома обычно записан как "22", "22к1" или "22А"
  // Формируем самый «жирный» вариант для structured search
  let osmHouse = house ?? "";
  if (korpus) osmHouse = `${osmHouse}к${korpus}`;
  if (litera && !osmHouse.endsWith(litera)) osmHouse = `${osmHouse}${litera}`;

  const full = [
    streetType ? `${streetType} ${niceStreetName}` : niceStreetName,
    osmHouse || null,
    city,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    city,
    streetType,
    streetName: niceStreetName,
    house: osmHouse || undefined,
    korpus,
    litera,
    full,
    display,
  };
}

/**
 * Сгенерировать набор поисковых вариантов от наиболее точного к наиболее общему.
 * Используется для нескольких параллельных запросов к Nominatim,
 * результаты которых потом дедуплицируются по координатам.
 */
export function buildSearchVariants(parsed: ParsedAddress): string[] {
  const variants: string[] = [];
  const street = parsed.streetType
    ? `${parsed.streetType} ${parsed.streetName}`
    : parsed.streetName ?? "";
  if (!street) return variants;

  // 1) Самый точный: улица + дом с корпусом и литерой
  if (parsed.house) {
    variants.push(`${street}, ${parsed.house}, ${parsed.city}`);
  }
  // 2) Без литеры
  if (parsed.house && parsed.litera) {
    const houseNoLitera = parsed.house.replace(parsed.litera, "");
    if (houseNoLitera && houseNoLitera !== parsed.house) {
      variants.push(`${street}, ${houseNoLitera}, ${parsed.city}`);
    }
  }
  // 3) Только улица
  variants.push(`${street}, ${parsed.city}`);
  return Array.from(new Set(variants));
}

/**
 * Параметры для structured-search запроса Nominatim.
 */
export function nominatimStructuredParams(parsed: ParsedAddress): Record<string, string> {
  const params: Record<string, string> = {
    city: parsed.city,
    countrycodes: "ru",
  };
  if (parsed.streetName) {
    const streetLabel = parsed.streetType
      ? `${parsed.streetType} ${parsed.streetName}`
      : parsed.streetName;
    params.street = parsed.house ? `${parsed.house} ${streetLabel}` : streetLabel;
  }
  return params;
}

// Учёт районных хинтов (экспортируем чтобы UI мог показывать подсказки)
export const SPB_DISTRICT_HINTS_TABLE = SPB_DISTRICT_HINTS;
