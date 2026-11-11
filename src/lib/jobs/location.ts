// Reads a job's place name and says which country group it belongs to. Pure text rules, no network and no Node-only code,
// so both the collector and the screens can use it.

const US_STATES = "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";
const US_PLACES = "new england|midwest|northeast|southeast|southwest|northwest|san diego|san jose|portland|salt lake|raleigh|charlotte|phoenix|philadelphia|pittsburgh|minneapolis|houston|washington,? d\\.?c|nashville|detroit|columbus|cleveland|baltimore|orlando|tampa|las vegas|sacramento|brooklyn|manhattan|silicon valley";

/** Place-name rules in order: the first match decides. The label is what gets stored with each job. */
const MARKET_MAP: [RegExp, string][] = [
  [/\b(india|mumbai|bangalore|bengaluru|delhi|new delhi|gurgaon|gurugram|noida|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|kochi|chandigarh|haryana|maharashtra|karnataka|telangana|tamil nadu)\b/i, "India"],
  [/\bnew england\b/i, "US"], // before the UK rule below, which would read "England"
  [/\b(uk|u\.k\.|united kingdom|england|scotland|wales|london|manchester|edinburgh|bristol|leeds|cambridge, uk)\b/i, "UK"],
  [/\b(ireland|dublin|cork)\b/i, "Ireland"],
  [/\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|dach)\b/i, "Germany"],
  [/\b(netherlands|nederland|amsterdam|rotterdam|utrecht|eindhoven|benelux)\b/i, "Netherlands"],
  [/\b(france|paris|lyon|bordeaux)\b/i, "France"],
  [/\b(spain|madrid|barcelona)\b/i, "Spain"],
  [/\b(sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|nordics)\b/i, "Nordics"],
  [/\b(poland|warsaw|krakow|czech|prague|romania|bucharest|portugal|lisbon|italy|milan|switzerland|zurich|austria|vienna|belgium|brussels|estonia|tallinn|hungary|budapest|greece|athens|turkey|türkiye|istanbul)\b/i, "Europe"],
  [/\b(emea|europe)\b/i, "Europe"],
  [/\b(uae|united arab emirates|dubai|abu dhabi|saudi|riyadh|qatar|doha|kuwait|bahrain|oman)\b/i, "UAE"],
  [/\b(israel|tel aviv)\b/i, "Israel"],
  [/\b(south africa|johannesburg|cape town|nigeria|lagos|kenya|nairobi|egypt|cairo|africa)\b/i, "Africa"],
  [/\b(singapore)\b/i, "Singapore"],
  [/\b(australia|sydney|melbourne|brisbane|new zealand|auckland)\b/i, "Australia"],
  [/\b(canada|toronto|vancouver|montreal|ontario|quebec|british columbia|alberta|calgary|ottawa)\b/i, "Canada"],
  [/\b(brazil|brasil|são paulo|sao paulo|colombia|bogot[aá]|mexico|méxico|argentina|buenos aires|chile|peru|latam|latin america)\b/i, "LatAm"],
  [/\b(japan|tokyo|china|shanghai|beijing|hong kong|korea|seoul|philippines|manila|thailand|bangkok|malaysia|kuala lumpur|indonesia|jakarta|vietnam|taiwan)\b/i, "APAC"],
  [/\b(us|u\.s\.|usa|united states|nyc|san francisco|bay area|austin|chicago|boston|seattle|denver|atlanta|los angeles|miami|dallas|north america|amer)\b/i, "US"],
  [new RegExp(`\\b(${US_STATES}|${US_PLACES})\\b`, "i"), "US"],
  [/,\s?(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])\b/, "US"],
  [/\b(apac|asia)\b/i, "APAC"],
];

export function detectMarket(location: string): string {
  for (const [re, market] of MARKET_MAP) if (re.test(location)) return market;
  if (/remote|anywhere|global|worldwide/i.test(location)) return "Remote";
  return location.trim() ? "Other" : "Unknown";
}
