// CC0-1.0. Shared identity resolution for the card's MVU schema and inline HUD.
import catalog from './catalog.js';

const byId = new Map(), english = new Map(), japanese = new Map(), sprite = new Map(), defaultBySpecies = new Map(), formKeys = new Map();
const base = new URL('../', import.meta.url);
const emptyNames = new Set(['なし', 'タマゴ', 'たまご', '卵']);
function token(value) {
  if (typeof value !== 'string' || /[\/\\:%?#<>]/.test(value)) return '';
  return value.normalize('NFKC').toLowerCase().replace(/\.(?:gif|png)$/i, '').replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/[^a-z0-9]/g, '');
}
function jaToken(value) { return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : ''; }
function addUnique(index, key, record) {
  if (!key) return;
  if (!index.has(key)) index.set(key, record);
  else if (index.get(key)?.id !== record.id) index.set(key, null);
}
for (const raw of catalog.records) {
  const record = Object.freeze({...raw, sprites: Object.freeze({...raw.sprites})});
  byId.set(record.id, record);
  addUnique(english, token(record.id), record);
  addUnique(formKeys, record.speciesId + '|' + token(record.formKey), record);
  if (record.default) defaultBySpecies.set(record.speciesId, record);
  if (record.displayJa !== record.ja) addUnique(japanese, jaToken(record.displayJa), record);
  for (const file of Object.values(record.sprites)) if (file) addUnique(sprite, token(file.split('/').at(-1)), record);
}
// A species name always identifies its default form. Ambiguous form/image
// aliases never override the canonical English identifier or species name.
for (const record of defaultBySpecies.values()) {
  english.set(token(record.species), record);
  japanese.set(jaToken(record.ja), record);
}
for (const [alias, id] of Object.entries(catalog.inputAliases)) japanese.set(jaToken(alias), byId.get(id));

export function lookupPokemon(value) {
  if (typeof value === 'string' && /\.(?:gif|png)$/i.test(value)) {
    const bySprite = sprite.get(token(value));
    if (bySprite) return bySprite;
  }
  return byId.get(value) || english.get(token(value)) || japanese.get(jaToken(value)) || sprite.get(token(value)) || null;
}
function nameParts(value) {
  const name = typeof value === 'string' ? value : '';
  const match = name.match(/^((?:パートナー|ボス|頭目)\s+)(.*)$/);
  return match ? {prefix: match[1], name: match[2]} : {prefix: '', name};
}
const stateForms = new Map([
  ['mega', 'mega'], ['mega-x', 'mega-x'], ['mega-y', 'mega-y'], ['mega-z', 'mega-z'],
  ['g-max', 'gmax'], ['gmax', 'gmax'], ['キョダイマックス', 'gmax'], ['primal', 'primal'], ['ゲンシカイキ', 'primal'],
  ['alola', 'alola'], ['アローラ', 'alola'], ['galar', 'galar'], ['ガラル', 'galar'],
  ['hisui', 'hisui'], ['ヒスイ', 'hisui'], ['paldea', 'paldea'], ['パルデア', 'paldea'],
]);
export function resolvePokemon(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const parts = nameParts(record.名前);
  if (emptyNames.has(parts.name)) return null;
  const explicit = lookupPokemon(record.英語名);
  let entry = explicit || lookupPokemon(parts.name) || lookupPokemon(record.アイコン);
  if (!entry) return null;
  // Explicit form identifiers win. Old cards often used a base identifier
  // with the form in 状態 or アイコン; accept only hints for the same species.
  const explicitForm = explicit && entry.id !== entry.species && token(record.英語名) === token(entry.id);
  if (entry.default && !explicitForm) {
    const hint = stateForms.get(String(record.状態 || '').toLowerCase());
    const stateEntry = hint && (byId.get(entry.id + '-' + hint) || formKeys.get(entry.speciesId + '|' + token(hint)));
    const iconEntry = lookupPokemon(record.アイコン);
    if (stateEntry) entry = stateEntry;
    else if (iconEntry && iconEntry.speciesId === entry.speciesId && !iconEntry.default) entry = iconEntry;
  }
  return entry;
}
export function normalizePokemonIdentity(pokemon) {
  const entry = resolvePokemon(pokemon);
  if (!entry) return pokemon;
  const {prefix} = nameParts(pokemon.名前);
  return {...pokemon, 名前: prefix + entry.displayJa, 英語名: entry.id,
    アイコン: entry.sprites.normal ? entry.sprites.normal.split('/').at(-1) : 'unknown.svg'};
}
export function mappedPokemonSprite(pokemon, shiny = false) {
  const entry = typeof pokemon === 'string' ? lookupPokemon(pokemon) : resolvePokemon(pokemon);
  if (!entry) return new URL('runtime/unknown.svg', base).href;
  const female = typeof pokemon === 'object' && pokemon?.性別 === '♀';
  const file = shiny
    ? (female && entry.sprites.femaleShiny) || entry.sprites.shiny
    : (female && entry.sprites.female) || entry.sprites.normal;
  return new URL(file || 'runtime/unknown.svg', base).href;
}
export const registryInfo = Object.freeze({version: catalog.version, species: catalog.speciesCount, forms: byId.size, sourceCommit: catalog.sourceCommit});
