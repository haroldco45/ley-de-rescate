// Robot de noticias — Ley de Rescate al Día · Vibras Positivas HM
// Lo ejecuta GitHub Actions cada 30 minutos. Trae SOLO lo relacionado con la
// Ley de Rescate Económico (Proyecto de Ley 477 de 2026 Cámara):
//   1. Titulares de Google Noticias y Bing Noticias
//   2. Notas con FOTO real de los medios colombianos (sus RSS), filtradas por el tema
//   3. La foto que cada medio publica para compartir la nota (og:image) cuando el RSS no la trae
//   4. Videos de los noticieros colombianos en YouTube que hablen del tema
//   5. "Señales del trámite": titulares que dicen que el proyecto avanzó (ponencia, debate, aprobación, sanción)
// Escribe noticias.json solo si algo cambió.
import { readFile, writeFile } from 'node:fs/promises';

const ARCHIVO = 'noticias.json';
const MAX_NOTICIAS = 220;
const DIAS_MAX = 120;      // el trámite dura meses: se guarda historia larga
const MAX_VIDEOS = 40;
const DIAS_VIDEOS = 60;
const MAX_FOTOS_POR_CORRIDA = 60;

// Qué cuenta como "del tema"
export const TEMA = /ley de rescate|rescate (econ[oó]mico|fiscal)|ley de ajuste fiscal|ajuste fiscal|proyecto (de ley )?477|pl 477|efectiva\b|reforma tributaria|tributaria de (abelardo|de la espriella)|miguel g[oó]mez mart[ií]nez|ministro (de hacienda|miguel g[oó]mez)|minhacienda|regla fiscal|d[eé]ficit fiscal|facultades extraordinarias|iva (al|a la|del) (caf[eé]|az[uú]car|cerveza|gasolina)|arreglar (las )?cuentas/i;
// Señales de que el trámite avanzó
const SENALES = [
  { paso: 'ponentes', re: /ponente|ponencia|coordinador(es)? ponente/i },
  { paso: 'urgencia', re: /mensaje de urgencia|sesiones conjuntas|comisiones (econ[oó]micas|terceras|cuartas)/i },
  { paso: 'primer', re: /primer debate|aprobad[ao] en (las )?comisi[oó]n/i },
  { paso: 'segundo', re: /segundo debate|plenaria de la c[aá]mara/i },
  { paso: 'senado', re: /tercer debate|cuarto debate|plenaria del senado/i },
  { paso: 'conciliacion', re: /concilia(ci[oó]n|do|da)/i },
  { paso: 'sancion', re: /sancion[oó]|sancionad[ao]|ya es ley|firm[oó] la ley/i },
  { paso: 'hundido', re: /se hundi[oó]|archivad[ao]|hundieron/i },
];

const Q = '"ley de rescate" OR "rescate económico" OR "rescate fiscal" OR "ajuste fiscal" Colombia';
const TEMAS = [
  { tema: 'Ley de Rescate', q: Q, dias: 7 },
  { tema: 'Ley de Rescate', q: '"Miguel Gómez" Hacienda ley', dias: 7 },
  { tema: 'Congreso', q: '"ley de rescate" Cámara OR Senado OR ponencia OR debate', dias: 14 },
  { tema: 'Impuestos', q: '"ley de rescate" IVA OR renta OR impuesto OR EfectIVA', dias: 14 },
];
const BING = [
  { tema: 'Ley de Rescate', q: '"Ley de Rescate" Colombia' },
  { tema: 'Ley de Rescate', q: '"Ley de Rescate Económico"' },
  { tema: 'Impuestos', q: 'Ley de Rescate IVA Colombia' },
  { tema: 'Congreso', q: 'Ley de Rescate Congreso ponencia' },
];
const MEDIOS = [
  { medio: 'Infobae Colombia', url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/colombia/' },
  { medio: 'Semana', url: 'https://www.semana.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'El Tiempo', url: 'https://www.eltiempo.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'El Espectador', url: 'https://www.elespectador.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'Noticias Caracol', url: 'https://www.noticiascaracol.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'Caracol Radio', url: 'https://caracol.com.co/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'Blu Radio', url: 'https://www.bluradio.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'La FM', url: 'https://www.lafm.com.co/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'El Colombiano', url: 'https://www.elcolombiano.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'El Heraldo', url: 'https://www.elheraldo.co/rss.xml' },
  { medio: 'El Universal', url: 'https://www.eluniversal.com.co/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'La Silla Vacía', url: 'https://www.lasillavacia.com/feed/' },
  { medio: 'Kienyke', url: 'https://www.kienyke.com/feed' },
  { medio: 'Cambio', url: 'https://cambiocolombia.com/rss.xml' },
  { medio: 'La República', url: 'https://www.larepublica.co/rss/' },
  { medio: 'Portafolio', url: 'https://www.portafolio.co/rss/economia.xml' },
  { medio: 'Valora Analitik', url: 'https://www.valoraanalitik.com/feed/' },
];
const CANALES = [
  { nombre: 'Noticias Caracol', handle: 'NoticiasCaracol', id: 'UC2Xq2PK-got3Rtz9ZJ32hLQ' },
  { nombre: 'Noticias RCN', handle: 'NoticiasRCN', id: 'UCnr6pbeXJmkNQJ9PSYle7QQ' },
  { nombre: 'El Tiempo', handle: 'ElTiempo', id: 'UCe5-b0fCK3eQCpwS6MT0aNw' },
  { nombre: 'El Espectador', handle: 'elespectador', id: 'UCFYdMS-M4mRdbxPuErz1CVw' },
  { nombre: 'Blu Radio', handle: 'BluRadioCo', id: 'UCUYokk2dJxFZf7NgxTL-ROg' },
  { nombre: 'Noticias Uno', handle: 'NoticiasUnoColombia', id: 'UC3NUgxBBl05tthfGBS6kPkA' },
  { nombre: 'Semana', handle: 'RevistaSemana' },
  { nombre: 'Caracol Radio', handle: 'CaracolRadio' },
  { nombre: 'La República', handle: 'larepublicaco' },
  { nombre: 'Canal Congreso', handle: 'CanalCongresoColombia' },
  { nombre: 'Presidencia', handle: 'infopresidencia' },
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const CABECERAS = { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9,en;q=0.6', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

const decodificar = t => (t || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
const etiqueta = (xml, tag) => decodificar((xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`)) || [])[1]);
const atributo = (tagXml, attr) => decodificar((tagXml.match(new RegExp(`\\s${attr}=["']([^"']+)["']`)) || [])[1]);
const sinHtml = t => decodificar(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const clave = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);
const corto = (t, n = 180) => t.length > n ? t.slice(0, t.lastIndexOf(' ', n)) + '…' : t;

function imagenValida(u) {
  if (!u) return '';
  u = decodificar(u).replace(/^\/\//, 'https://');
  if (!/^https?:\/\//.test(u)) return '';
  if (/logo|favicon|avatar|placeholder|pixel|1x1|blank\.|default-image|og-default/i.test(u)) return '';
  return u.replace(/^http:/, 'https:');
}

function imagenDe(bloque) {
  const cands = [];
  for (const m of bloque.matchAll(/<media:content\b[^>]*>/g)) {
    const tipo = atributo(m[0], 'type'), medio = atributo(m[0], 'medium');
    if (!tipo || tipo.startsWith('image') || medio === 'image') cands.push(atributo(m[0], 'url'));
  }
  for (const m of bloque.matchAll(/<media:thumbnail\b[^>]*>/g)) cands.push(atributo(m[0], 'url'));
  for (const m of bloque.matchAll(/<enclosure\b[^>]*>/g)) if ((atributo(m[0], 'type') || 'image').startsWith('image')) cands.push(atributo(m[0], 'url'));
  const html = decodificar(etiqueta(bloque, 'content:encoded') + ' ' + etiqueta(bloque, 'description'));
  for (const m of html.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/g)) cands.push(m[1]);
  return cands.map(imagenValida).find(Boolean) || '';
}

export function parsearRSS(xml, extra = {}) {
  const items = xml.includes('<item') ? xml.split(/<item[\s>]/).slice(1) : xml.split(/<entry[\s>]/).slice(1);
  return items.map(b => {
    const fuente = extra.fuente || etiqueta(b, 'source');
    let titulo = sinHtml(etiqueta(b, 'title'));
    if (fuente && titulo.endsWith(' - ' + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
    let enlace = etiqueta(b, 'link') || atributo((b.match(/<link\b[^>]*>/) || [''])[0], 'href') || etiqueta(b, 'guid');
    const fecha = new Date(etiqueta(b, 'pubDate') || etiqueta(b, 'published') || etiqueta(b, 'updated') || etiqueta(b, 'dc:date'));
    const n = { titulo, enlace: enlace.trim(), fuente, fecha: isNaN(fecha) ? null : fecha.toISOString(), tema: extra.tema || '' };
    if (extra.conFoto) {
      const img = imagenDe(b); if (img) n.imagen = img;
      const res = corto(sinHtml(etiqueta(b, 'description')));
      if (res && res.length > 30 && clave(res) !== clave(titulo)) n.resumen = res;
    }
    return n;
  }).filter(n => n.titulo && /^https?:\/\//.test(n.enlace) && n.fecha);
}

export function parsearVideos(xml, canal) {
  return xml.split('<entry>').slice(1).map(b => {
    const enlace = atributo((b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/) || [''])[0], 'href');
    return {
      id: etiqueta(b, 'yt:videoId'),
      titulo: sinHtml(etiqueta(b, 'title')),
      fecha: etiqueta(b, 'published'),
      canal,
      ...(enlace.includes('/shorts/') ? { corto: true } : {}),
    };
  }).filter(v => v.id && v.titulo);
}

async function traer(url, ms = 20000, extra = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { ...CABECERAS, ...extra }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

async function enParalelo(lista, n, fn) {
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < lista.length) { const k = i++; res[k] = await fn(lista[k], k); } }));
  return res;
}

const reporte = {};

async function titularesGoogle() {
  const res = await enParalelo(TEMAS, 4, async t => {
    const url = t.url || `https://news.google.com/rss/search?q=${encodeURIComponent(t.q + ' when:2d')}&hl=es-419&gl=CO&ceid=CO:es-419`;
    const urlF = t.url || url.replace(' when:2d', ` when:${t.dias || 2}d`);
    try { const l = parsearRSS(await traer(urlF), { tema: t.tema }).slice(0, 40); reporte['google:' + t.tema] = l.length; return l; }
    catch (e) { reporte['google:' + t.tema] = e.message; return []; }
  });
  return res.flat();
}

export function parsearBing(xml, tema) {
  return xml.split('<item>').slice(1).map(b => {
    let enlace = etiqueta(b, 'link');
    const u = enlace.match(/[?&]url=([^&]+)/); if (u) enlace = decodeURIComponent(u[1]);
    let imagen = imagenValida(etiqueta(b, 'News:Image'));
    if (imagen && imagen.includes('bing.com/th')) imagen += (imagen.includes('?') ? '&' : '?') + 'w=700&h=420&c=7';
    const fecha = new Date(etiqueta(b, 'pubDate'));
    const res = corto(sinHtml(etiqueta(b, 'description')));
    return { titulo: sinHtml(etiqueta(b, 'title')), enlace, fuente: etiqueta(b, 'News:Source') || new URL(enlace).hostname.replace(/^www\./, ''),
      fecha: isNaN(fecha) ? null : fecha.toISOString(), tema, ...(imagen ? { imagen } : {}), ...(res.length > 30 ? { resumen: res } : {}) };
  }).filter(n => n.titulo && /^https?:\/\//.test(n.enlace) && !n.enlace.includes('bing.com') && n.fecha);
}

async function noticiasBing() {
  const res = await enParalelo(BING, 3, async b => {
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(b.q)}&format=rss&setlang=es&cc=CO&mkt=es-CO`;
    try { const l = parsearBing(await traer(url), b.tema).slice(0, 25); reporte['bing:' + b.q] = `${l.length} notas, ${l.filter(n => n.imagen).length} con foto`; return l; }
    catch (e) { reporte['bing:' + b.q] = e.message; return []; }
  });
  return res.flat();
}

async function noticiasConFoto() {
  const res = await enParalelo(MEDIOS, 5, async m => {
    try {
      const l = parsearRSS(await traer(m.url), { fuente: m.medio, conFoto: true, tema: m.tema || '' }).slice(0, 30);
      reporte['medio:' + m.medio + ' ' + new URL(m.url).pathname.slice(0, 30)] = `${l.length} notas, ${l.filter(n => n.imagen).length} con foto`;
      return l;
    } catch (e) { reporte['medio:' + m.medio + ' ' + new URL(m.url).pathname.slice(0, 30)] = e.message; return []; }
  });
  return res.flat();
}

// Foto que el medio publica para compartir la nota (og:image)
async function fotoDeLaNota(url) {
  try {
    const html = (await traer(url, 9000)).slice(0, 400000);
    const metas = html.match(/<meta\b[^>]+>/gi) || [];
    for (const nombre of ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']) {
      const m = metas.find(x => new RegExp(`(property|name)=["']${nombre}["']`, 'i').test(x));
      const u = m && imagenValida(atributo(m, 'content'));
      if (u) return u;
    }
  } catch {}
  return '';
}

async function codigoCanal(c, previo) {
  if (c.id) return c.id;
  if (previo[c.handle]) return previo[c.handle];
  try {
    const html = await traer(`https://www.youtube.com/@${c.handle}`, 15000, { Cookie: 'CONSENT=YES+1; SOCS=CAI' });
    return (html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)
      || html.match(/channel_id=(UC[\w-]{22})/) || html.match(/"browseId":"(UC[\w-]{22})"/) || [])[1] || '';
  } catch (e) { reporte['canal:' + c.nombre] = 'sin código: ' + e.message; return ''; }
}

async function videosNoticieros(previoCanales) {
  const canales = {};
  const res = await enParalelo(CANALES, 4, async c => {
    const id = await codigoCanal(c, previoCanales);
    if (!id) { reporte['canal:' + c.nombre] ??= 'sin código'; return []; }
    canales[c.handle] = id;
    try {
      const l = parsearVideos(await traer(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`), c.nombre).slice(0, 15);
      reporte['canal:' + c.nombre] = l.length + ' videos';
      return l;
    } catch (e) { reporte['canal:' + c.nombre] = e.message; return []; }
  });
  return { videos: res.flat(), canales };
}

function senalesDe(noticias) {
  const vistas = [];
  for (const n of noticias) {
    if (!TEMA.test(n.titulo)) continue;
    for (const s of SENALES) if (s.re.test(n.titulo)) { vistas.push({ paso: s.paso, titulo: n.titulo, enlace: n.enlace, fuente: n.fuente, fecha: n.fecha }); break; }
  }
  const unicas = new Map();
  for (const s of vistas) if (!unicas.has(clave(s.titulo))) unicas.set(clave(s.titulo), s);
  return [...unicas.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 25);
}

async function main() {
  let previo = { noticias: [], videos: [], canales: {} };
  try { previo = JSON.parse(await readFile(ARCHIVO, 'utf8')); } catch {}

  const [google, medios, bing, yt] = await Promise.all([titularesGoogle(), noticiasConFoto(), noticiasBing(), videosNoticieros(previo.canales || {})]);
  // De los medios generales solo quedan las notas del tema
  const mediosTema = medios.filter(n => TEMA.test(n.titulo + ' ' + (n.resumen || ''))).map(n => ({ ...n, tema: n.tema || 'Ley de Rescate' }));
  const googleTema = google.filter(n => TEMA.test(n.titulo) || /rescate/i.test(n.titulo));
  const bingTema = bing.filter(n => TEMA.test(n.titulo + ' ' + (n.resumen || '')) || /rescate/i.test(n.titulo));
  reporte.filtradas = `medios ${mediosTema.length}/${medios.length} · google ${googleTema.length}/${google.length} · bing ${bingTema.length}/${bing.length}`;

  const limite = Date.now() - DIAS_MAX * 86400000;
  const fotoPrevia = new Map((previo.noticias || []).filter(n => n.imagen || n.sinFoto).map(n => [n.enlace, n]));
  const mapa = new Map();
  for (const n of [...mediosTema, ...bingTema, ...googleTema, ...(previo.noticias || [])]) {
    const t = new Date(n.fecha).getTime();
    if (t < limite || t > Date.now() + 3600000) continue;
    const k = clave(n.titulo);
    const ya = mapa.get(k);
    if (!ya) {
      const p = fotoPrevia.get(n.enlace);
      mapa.set(k, { ...n, ...(p?.imagen && !n.imagen ? { imagen: p.imagen } : {}), ...(p?.sinFoto && !n.imagen ? { sinFoto: true } : {}) });
    } else {
      if (!ya.imagen && n.imagen) ya.imagen = n.imagen;
      if (!ya.resumen && n.resumen) ya.resumen = n.resumen;
    }
  }
  const noticias = [...mapa.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, MAX_NOTICIAS);

  const faltan = noticias.filter(n => !n.imagen && !n.sinFoto && !n.enlace.includes('news.google.com')).slice(0, MAX_FOTOS_POR_CORRIDA);
  let halladas = 0;
  await enParalelo(faltan, 6, async n => { const img = await fotoDeLaNota(n.enlace); if (img) { n.imagen = img; halladas++; } else n.sinFoto = true; });
  reporte.fotosBuscadas = `${halladas} de ${faltan.length}`;

  const limV = Date.now() - DIAS_VIDEOS * 86400000;
  const vm = new Map();
  for (const v of [...yt.videos.filter(v => TEMA.test(v.titulo)), ...(previo.videos || [])]) if (new Date(v.fecha).getTime() > limV && !vm.has(v.id)) vm.set(v.id, v);
  const videos = [...vm.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, MAX_VIDEOS);

  const contenido = { canales: { ...(previo.canales || {}), ...yt.canales }, noticias, videos, senales: senalesDe(noticias) };
  reporte.total = `${noticias.length} noticias (${noticias.filter(n => n.imagen).length} con foto), ${videos.length} videos, ${contenido.senales.length} señales`;
  console.log(JSON.stringify(reporte, null, 1));

  const { actualizado, ...previoSinFecha } = previo;
  if (JSON.stringify(contenido) === JSON.stringify(previoSinFecha)) { console.log('Sin cambios.'); return; }
  await writeFile(ARCHIVO, JSON.stringify({ actualizado: new Date().toISOString(), ...contenido }) + '\n');
  console.log('Guardado.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
