// lib/barcode.js — Detección de código de barras + lookup Open Food Facts

// ── Soporte nativo BarcodeDetector ───────────────────────────────────────

export function soportaBarcodeDetector() {
  return typeof BarcodeDetector !== 'undefined'
}

/**
 * Crea un detector nativo o lanza error si no está disponible.
 * Formatos relevantes para productos en comercios.
 */
export async function crearDetectorNativo() {
  const formatos = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']
  return new BarcodeDetector({ formats: formatos })
}

/**
 * Detecta códigos desde un ImageBitmap/HTMLVideoElement/HTMLCanvasElement.
 * Devuelve el primer código encontrado o null.
 */
export async function detectarDesdeFrame(detector, source) {
  try {
    const barcodes = await detector.detect(source)
    return barcodes.length > 0 ? barcodes[0].rawValue : null
  } catch {
    return null
  }
}

// ── Fallback: zxing-js para Safari / iOS ─────────────────────────────────

let _zxingReader = null

async function getZxingReader() {
  if (_zxingReader) return _zxingReader
  // Cargamos zxing desde CDN solo si lo necesitamos
  await new Promise((resolve, reject) => {
    if (window.ZXing) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/zxing-js/0.20.0/zxing.min.js'
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  const hints = new window.ZXing.Map()
  hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true)
  _zxingReader = new window.ZXing.BrowserMultiFormatReader(hints)
  return _zxingReader
}

/**
 * Escanea desde un elemento <video> usando zxing (fallback para iOS).
 * Devuelve el código o null.
 */
export async function detectarDesdeVideoZxing(videoEl) {
  try {
    const reader = await getZxingReader()
    const result = await reader.decodeFromVideoElement(videoEl)
    return result?.getText() || null
  } catch {
    return null
  }
}

// ── Cámara ────────────────────────────────────────────────────────────────

/**
 * Pide acceso a la cámara trasera.
 * Devuelve el MediaStream o lanza error descriptivo.
 */
export async function abrirCamara() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Tu dispositivo no soporta acceso a la cámara.')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' }, // cámara trasera
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    })
  } catch (err) {
    if (err.name === 'NotAllowedError')
      throw new Error('Permiso de cámara denegado. Habilitalo en la configuración del navegador.')
    if (err.name === 'NotFoundError')
      throw new Error('No se encontró ninguna cámara en este dispositivo.')
    throw new Error('No se pudo acceder a la cámara: ' + err.message)
  }
}

export function cerrarCamara(stream) {
  stream?.getTracks().forEach(t => t.stop())
}

// ══════════════════════════════════════════════════════════════════════════
// LOOKUP DE PRODUCTOS — cadena de 3 APIs gratuitas sin registro
// 1° Open Food Facts  → alimentos y bebidas
// 2° Open Beauty Facts → higiene, cosmética, farmacia
// 3° UPC Item DB      → todo lo demás (librería, limpieza, electro, etc.)
// ══════════════════════════════════════════════════════════════════════════

// ── Helpers compartidos ───────────────────────────────────────────────────

/**
 * fetch con timeout manual — compatible con todos los browsers móviles.
 * AbortSignal.timeout() no está disponible en Android WebView < Chrome 103.
 */
function fetchConTimeout(url, ms = 7000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal })
    .finally(() => clearTimeout(timer))
}

function capitalizar(str) {
  if (!str) return ''
  const s = str.trim()
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function normalizarUnidad(texto = '') {
  const t = texto.toLowerCase()
  if (/kg|kilo/.test(t))      return 'kg'
  if (/g|gramo/.test(t))  return 'g'
  if (/l|litro/.test(t))  return 'L'
  if (/ml|mililitro/.test(t)) return 'ml'
  return 'u'
}

// Resultado normalizado común a las tres APIs
function resultado(codigoBarras, nombre, marca, categoria, unidad, imagen, fuente) {
  return { codigoBarras, nombre, marca, categoria, unidad, imagen, fuente }
}

// ── Mapeo de categorías compartido ───────────────────────────────────────

const CAT_KEYWORDS = [
  { keys: ['dairy','milk','yogurt','lacteo','leche'],          cat: 'lacteos'    },
  { keys: ['cheese','queso','fiambre','deli'],                  cat: 'fiambreria' },
  { keys: ['meat','carne','poultry','beef','chicken'],          cat: 'carnes'     },
  { keys: ['beverage','drink','water','juice','soda','bebida'], cat: 'bebidas'    },
  { keys: ['bread','bakery','pan','panaderia'],                 cat: 'panaderia'  },
  { keys: ['cereal','pasta','rice','flour','oil','sauce',
           'almacen','grocery','condiment','snack','chocolate'],cat: 'almacen'    },
  { keys: ['frozen','congelado'],                               cat: 'congelados' },
  { keys: ['cleaning','cleaner','detergent','limpieza'],        cat: 'limpieza'   },
  { keys: ['hygiene','personal care','beauty','cosmetic',
           'shampoo','soap','dental','higiene','farmacia',
           'medicine','vitamin','health','pharmaceutical',
           'perfume','skincare','makeup','fragrance'],          cat: 'higiene'    },
  { keys: ['fruit','fruta'],                                    cat: 'frutas'     },
  { keys: ['vegetable','verdura'],                              cat: 'verduras'   },
]

function mapearCategoria(textos = []) {
  const haystack = textos.join(' ').toLowerCase()
  for (const { keys, cat } of CAT_KEYWORDS) {
    if (keys.some(k => haystack.includes(k))) return cat
  }
  return 'otros'
}

// ── 1. Open Food Facts ────────────────────────────────────────────────────

async function buscarOFF(codigo) {
  try {
    const campos = 'product_name,product_name_es,brands,categories_tags,quantity,image_front_small_url'
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codigo)}?fields=${campos}`
    const res  = await fetchConTimeout(url, 7000)
    if (!res.ok) return null
    const json = await res.json()
    if (json.status !== 1 || !json.product) return null

    const p      = json.product
    const nombre = capitalizar(p.product_name_es?.trim() || p.product_name?.trim() || '')
    if (!nombre) return null

    return resultado(
      codigo,
      nombre,
      p.brands?.split(',')[0]?.trim() || '',
      mapearCategoria(p.categories_tags || []),
      normalizarUnidad(p.quantity || ''),
      p.image_front_small_url || null,
      'Open Food Facts',
    )
  } catch (e) { throw e }  // propagar para que buscarEnOFF muestre el error
}

// ── 2. Open Beauty Facts ──────────────────────────────────────────────────

async function buscarOBF(codigo) {
  try {
    const campos = 'product_name,brands,categories_tags,quantity,image_front_small_url'
    const url = `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(codigo)}?fields=${campos}`
    const res  = await fetchConTimeout(url, 7000)
    if (!res.ok) return null
    const json = await res.json()
    if (json.status !== 1 || !json.product) return null

    const p      = json.product
    const nombre = capitalizar(p.product_name?.trim() || '')
    if (!nombre) return null

    // OBF siempre es higiene/cosmética
    const cats = p.categories_tags || []
    const cat  = mapearCategoria([...cats, 'hygiene'])

    return resultado(
      codigo,
      nombre,
      p.brands?.split(',')[0]?.trim() || '',
      cat,
      normalizarUnidad(p.quantity || ''),
      p.image_front_small_url || null,
      'Open Beauty Facts',
    )
  } catch (e) { throw e }  // propagar
}

// ── 3. UPC Item DB (gratuito sin API key, 100 req/día) ───────────────────

async function buscarUPCItemDB(codigo) {
  try {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(codigo)}`
    const res  = await fetchConTimeout(url, 7000)
    if (!res.ok) return null
    const json = await res.json()
    const item = json.items?.[0]
    if (!item?.title) return null

    const nombre = capitalizar(item.title || '')
    if (!nombre) return null

    const cats = [item.category || '', item.description || ''].filter(Boolean)

    return resultado(
      codigo,
      nombre,
      item.brand || '',
      mapearCategoria(cats),
      normalizarUnidad(item.size || ''),
      item.images?.[0] || null,
      'UPC Item DB',
    )
  } catch (e) { throw e }  // propagar
}

// ── Función principal exportada ───────────────────────────────────────────

/**
 * Busca un producto por código de barras encadenando las 3 APIs.
 * Devuelve el primer resultado encontrado, o null si ninguna lo tiene.
 *
 * @param {string} codigo
 * @returns {Promise<{codigoBarras, nombre, marca, categoria, unidad, imagen, fuente} | null>}
 */
/**
 * @param {string} codigo
 * @param {((entrada: string) => void) | null} onLog  — callback para log en tiempo real (solo DEV)
 */
export async function buscarEnOFF(codigo, onLog = null) {
  // Nombre de la función mantenido por compatibilidad con EscanerCodigo.svelte
  const DEV = import.meta.env.DEV
  const log = []

  const APIs = [
    { nombre: 'Open Food Facts',   fn: buscarOFF  },
    { nombre: 'Open Beauty Facts', fn: buscarOBF  },
    { nombre: 'UPC Item DB',        fn: buscarUPCItemDB },
  ]

  for (const { nombre, fn } of APIs) {
    const t0 = Date.now()
    let r = null
    let errorMsg = ''
    try {
      r = await fn(codigo)
    } catch (e) {
      errorMsg = e?.message || String(e)
    }
    const ms = Date.now() - t0

    const entrada = r
      ? `✅ ${nombre} → "${r.nombre}" (${ms}ms)`
      : errorMsg
        ? `💥 ${nombre} → ERROR: ${errorMsg} (${ms}ms)`
        : `❌ ${nombre} → no encontrado (${ms}ms)`

    log.push(entrada)
    onLog?.(entrada)

    if (r) {
      if (DEV) {
        console.groupCollapsed(`🔍 Barcode ${codigo} — encontrado en ${nombre}`)
        log.forEach(l => console.log(l))
        console.groupEnd()
      }
      return r
    }
  }

  if (DEV) {
    console.groupCollapsed(`🔍 Barcode ${codigo} — no encontrado en ninguna API`)
    log.forEach(l => console.log(l))
    console.groupEnd()
  }

  return null
}