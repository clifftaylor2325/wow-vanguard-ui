-- Match words: the word lists the chat filter and the group board read chat with, one table per client
-- locale. They are matching data (what players type in chat), not player text, so they are not in the
-- string table and Locales/ does not hold them. A locale with no entry for a category has no words for it:
-- the chat filter then hides that category's switch and does not match it, so nobody gets an English-only
-- filter without being told. Lists are written by hand from how each language's players write in chat; add
-- words to a locale only where the usage is certain. Words are plain text, lower-case or not (both sides are
-- folded), matched inside the line (chat filter) or as whole words (group board).

local ADDON, ns = ...

-- The locales whose client reports another locale's name: enGB clients report enUS, and the like.
local ALIASES = { enGB = "enUS" }

-- Chat filter: per locale, per category, the groups a line must each hold a word of. The web-address group
-- is the same in every language, since sellers post the same sites.
local WEB = { "www.", "http", ".com", ".net", "paypal", "usd", "$", "\226\130\172" }

-- The web-address words with a language's own after them ("fast delivery").
local function web(...)
  local out = { unpack(WEB) }
  for _, w in ipairs({ ... }) do out[#out + 1] = w end
  return out
end

local FILTER = {
  enUS = {
    gold = { { "gold", "coins" }, web("fast delivery") },
    boosting = { { "boost", "power level", "powerlevel" },
      { "wts", "selling", "service", "cheap", "price", "discount", "gold", "usd", "$", "pm me", "whisper me" } },
    recruiting = { { "recruiting", "looking for new members", "accepting applications", "join our guild" },
      { "guild", "raid team", "casual", "social", "community" } },
  },
  deDE = {
    gold = { { "gold", "münzen" }, web("schnelle lieferung") },
    boosting = { { "boost", "power level", "powerlevel" },
      { "wts", "verkaufe", "verkauf", "service", "günstig", "preis", "rabatt", "gold", "usd", "$", "pm me", "flüster mir" } },
    recruiting = { { "rekrutieren", "rekrutiert", "neue mitglieder", "bewerbungen", "tritt unserer gilde bei" },
      { "gilde", "raidteam", "raid team", "casual", "sozial", "community" } },
  },
  frFR = {
    gold = { { "gold", "pièces" }, web("livraison rapide") },
    boosting = { { "boost", "power level", "powerlevel" },
      { "wts", "vends", "vente", "service", "pas cher", "prix", "promo", "gold", "usd", "$", "pm me", "chuchote" } },
    recruiting = { { "recrute", "recrutement", "nouveaux membres", "candidatures", "rejoignez notre guilde" },
      { "guilde", "équipe de raid", "casual", "social", "communauté" } },
  },
  esES = {
    gold = { { "oro", "gold", "monedas" }, web("entrega rápida") },
    boosting = { { "boost", "power level", "powerlevel" },
      { "wts", "vendo", "servicio", "barato", "precio", "descuento", "oro", "gold", "usd", "$", "susurra" } },
    recruiting = { { "reclutando", "reclutamiento", "nuevos miembros", "solicitudes", "únete a nuestra hermandad" },
      { "hermandad", "raid", "casual", "social", "comunidad" } },
  },
  itIT = {
    gold = { { "oro", "gold", "monete" }, web("consegna veloce") },
    boosting = { { "boost", "power level", "powerlevel" },
      { "wts", "vendo", "servizio", "economico", "prezzo", "sconto", "oro", "gold", "usd", "$", "sussurra" } },
    recruiting = { { "recluta", "reclutiamo", "nuovi membri", "candidature", "unisciti alla nostra gilda" },
      { "gilda", "raid", "casual", "sociale", "comunità" } },
  },
  ptBR = {
    gold = { { "ouro", "gold", "moedas" }, web("entrega rápida") },
    boosting = { { "boost", "power level", "powerlevel" },
      { "wts", "vendo", "serviço", "barato", "preço", "desconto", "ouro", "gold", "usd", "$", "sussurre" } },
    recruiting = { { "recrutando", "recrutamento", "novos membros", "inscrições", "junte-se à nossa guilda" },
      { "guilda", "raid", "casual", "social", "comunidade" } },
  },
  ruRU = {
    gold = { { "золото", "золота", "голд", "голда", "gold" }, web("быстрая доставка") },
    boosting = { { "буст", "бустим", "прокачка", "пауэрлевел", "powerlevel" },
      { "wts", "продам", "продаю", "услуги", "дешево", "дёшево", "цена", "скидка", "голд", "usd", "$", "шепни" } },
    recruiting = { { "набор", "набираем", "рекрутинг", "принимаем заявки", "вступай в гильдию" },
      { "гильдия", "гильдию", "гильдии", "рейд", "казуал", "дружн" } },
  },
  koKR = {
    gold = { { "골드" }, web("빠른 배송") },
    boosting = { { "부스팅", "파워레벨", "대리" }, { "팝니다", "판매", "가격", "저렴", "골드", "귓속말", "귓말" } },
    recruiting = { { "길드원 모집", "신입 모집", "길드원 구합니다", "길드 가입" }, { "길드", "레이드", "친목", "캐주얼" } },
  },
  zhCN = {
    gold = { { "金币" }, web("快速交货") },
    boosting = { { "代练", "代打", "代刷" }, { "出售", "价格", "便宜", "优惠", "密我", "私聊", "金币" } },
    recruiting = { { "招募", "招人", "欢迎加入" }, { "公会", "团队", "休闲" } },
  },
  zhTW = {
    gold = { { "金幣" }, web("快速交貨") },
    boosting = { { "代練", "代打", "代刷" }, { "出售", "價格", "便宜", "優惠", "密我", "私聊", "金幣" } },
    recruiting = { { "招募", "招人", "歡迎加入" }, { "公會", "團隊", "休閒" } },
  },
}
FILTER.esMX = FILTER.esES

-- Group board: words every locale's players type as they are (the acronyms and role loan words of the
-- vanilla dungeon scene), then each locale's own phrases. Dungeons are keyed by id (the one GroupBoard.lua
-- lists with their level ranges); a line names a dungeon by an acronym, by the locale's phrases for it, or
-- by the dungeon's name in the client's language (added by GroupBoard.lua, never written here).
local BOARD_SHARED = {
  lfm = { "lfm", "lf1m", "lf2m", "lf3m", "lf4m" },
  lfg = { "lfg" },
  roles = { tank = { "tank", "tanks", "mt" }, healer = { "heal", "heals", "healer", "healers", "healz" }, dps = { "dps", "dd" } },
  wings = { "lib", "arms", "cath", "gy" },
  dungeons = {
    rfc = { "rfc" }, wc = { "wc" }, dmaul = { "dme", "dmw", "dmn", "dm e", "dm w", "dm n" }, deadmines = { "vc", "dm" },
    sfk = { "sfk" }, bfd = { "bfd" }, stockade = {}, gnomer = { "gnomer" }, rfk = { "rfk" }, sm = { "sm" }, rfd = { "rfd" },
    uld = { "ulda", "uld" }, zf = { "zf" }, mara = { "mara" }, st = { "st" }, brd = { "brd" }, ubrs = { "ubrs" },
    lbrs = { "lbrs" }, strat = { "strat" }, scholo = { "scholo" }, mc = { "mc" }, ony = { "ony" }, zg = { "zg" },
    bwl = { "bwl" }, aq20 = { "aq20", "aq 20" }, aq40 = { "aq40", "aq 40" }, naxx = { "naxx" },
  },
}

local BOARD = {
  enUS = {
    lfm = { "looking for more", "need tank", "need heals", "need healer", "need dps", "lf tank", "lf heals", "lf healer", "lf dps" },
    lfg = { "looking for group", "lf group", "lf grp" },
    roles = {},
    wings = { "library", "armory", "cathedral", "graveyard" },
    dungeons = {
      rfc = { "ragefire" }, wc = { "wailing caverns" },
      dmaul = { "dire maul", "dm east", "dm west", "dm north", "tribute" }, deadmines = { "deadmines" },
      sfk = { "shadowfang" }, bfd = { "blackfathom" }, stockade = { "stocks", "stockade", "stockades" },
      gnomer = { "gnomeregan" }, rfk = { "kraul" }, sm = { "scarlet" }, rfd = { "downs" }, uld = { "uldaman" },
      zf = { "zul farrak", "zulfarrak" }, mara = { "maraudon" }, st = { "sunken temple", "atal hakkar" },
      brd = { "blackrock depths" }, ubrs = { "upper spire" }, lbrs = { "lower spire" }, strat = { "strath", "stratholme" },
      scholo = { "scholomance" }, mc = { "molten core" }, ony = { "onyxia" }, zg = { "zul gurub" },
      bwl = { "blackwing" }, naxx = { "naxxramas" },
    },
  },
  deDE = {
    lfm = { "suche tank", "suche heiler", "suche dd", "suche dps", "suchen tank", "suchen heiler", "suchen dd", "suchen dps",
      "brauchen tank", "brauchen heiler", "brauchen dd", "brauchen dps", "gruppe sucht" },
    lfg = { "suche gruppe", "suche grp" },
    roles = { healer = { "heiler" } },
  },
  frFR = {
    lfm = { "recherche tank", "recherche heal", "recherche healer", "recherche soigneur", "recherche dps",
      "besoin de tank", "besoin de heal", "besoin de dps", "besoin d un tank", "besoin d un heal" },
    lfg = { "cherche groupe", "recherche groupe", "cherche grp" },
    roles = { healer = { "soigneur" } },
  },
  esES = {
    lfm = { "falta tanque", "falta sanador", "falta healer", "falta dps", "necesitamos tanque", "necesitamos healer",
      "necesitamos dps", "buscamos tanque", "buscamos healer", "buscamos sanador", "buscamos dps" },
    lfg = { "busco grupo", "busco grp", "buscando grupo" },
    roles = { tank = { "tanque" }, healer = { "sanador", "curandero" } },
  },
  itIT = {
    lfm = { "cerchiamo tank", "cerchiamo healer", "cerchiamo dps", "manca tank", "manca healer", "manca dps",
      "serve tank", "serve healer", "serve dps" },
    lfg = { "cerco gruppo", "cerco party", "cerco grp" },
    roles = { healer = { "guaritore" } },
  },
  ptBR = {
    lfm = { "precisamos de tank", "precisamos de healer", "precisamos de dps", "procuramos tank", "procuramos healer",
      "procuramos dps", "falta tank", "falta healer", "falta dps" },
    lfg = { "procuro grupo", "procurando grupo" },
    roles = { tank = { "tanque" }, healer = { "curandeiro" } },
  },
  ruRU = {
    lfm = { "ищем танка", "ищем хила", "ищем хилера", "ищем дд", "ищем дпс", "нужен танк", "нужен хил", "нужен дд", "нужен дпс",
      "собираем группу" },
    lfg = { "ищу группу", "ищу пати" },
    roles = { tank = { "танк", "танка", "танки" }, healer = { "хил", "хила", "хилы", "хилер", "хилера", "лекарь" },
      dps = { "дд", "дпс", "дамагер" } },
  },
  koKR = {},
  zhCN = {},
  zhTW = {},
}
BOARD.esMX = BOARD.esES

-- Appends the words of list `from` to list `to` (nil from adds nothing).
local function append(to, from)
  for _, word in ipairs(from or {}) do to[#to + 1] = word end
end

-- The two lists joined, as a new list.
local function joined(first, second)
  local out = {}
  append(out, first)
  append(out, second)
  return out
end

-- One group-board table: the shared words and the locale's own, joined per kind, role and dungeon.
local function boardFor(own)
  local out = { lfm = joined(BOARD_SHARED.lfm, own.lfm), lfg = joined(BOARD_SHARED.lfg, own.lfg), roles = {}, dungeons = {},
    wings = joined(BOARD_SHARED.wings, own.wings) }
  for role, words in pairs(BOARD_SHARED.roles) do out.roles[role] = joined(words, (own.roles or {})[role]) end
  for id, words in pairs(BOARD_SHARED.dungeons) do out.dungeons[id] = joined(words, (own.dungeons or {})[id]) end
  return out
end

-- The client's locale for word lists: its own name, or enUS for one that reports a sibling's.
---@return string
function ns.MatchLocale()
  local locale = ns.Locale()
  return ALIASES[locale] or locale
end

-- The chat filter's categories for this client's locale, as { key = groups }, or an empty table for a locale
-- with no lists (so every category is unavailable).
---@return table
function ns.FilterWords()
  return FILTER[ns.MatchLocale()] or {}
end

-- The group board's words for this client's locale: the shared acronyms and role words with the locale's own
-- phrases (the shared ones alone for a locale with no entry).
---@return table
function ns.BoardWords()
  return boardFor(BOARD[ns.MatchLocale()] or {})
end
