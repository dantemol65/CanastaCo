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
// 3° Go UPC           → todo lo demás (librería, limpieza, electro, etc.)
// ══════════════════════════════════════════════════════════════════════════

// ── Helpers compartidos ───────────────────────────────────────────────────

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
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
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
  } catch { return null }
}

// ── 2. Open Beauty Facts ──────────────────────────────────────────────────

async function buscarOBF(codigo) {
  try {
    const campos = 'product_name,brands,categories_tags,quantity,image_front_small_url'
    const url = `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(codigo)}?fields=${campos}`
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
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
  } catch { return null }
}

// ── 3. Go UPC ─────────────────────────────────────────────────────────────

async function buscarGoUPC(codigo) {
  try {
    const url = `https://go-upc.com/api/v1/code/${encodeURIComponent(codigo)}`
    const res  = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    const json = await res.json()
    if (!json.product?.name) return null

    const p      = json.product
    const nombre = capitalizar(p.name || '')
    if (!nombre) return null

    // Go UPC devuelve category como string libre
    const cats = [p.category || '', p.description || ''].filter(Boolean)

    return resultado(
      codigo,
      nombre,
      p.brand || '',
      mapearCategoria(cats),
      'u',           // Go UPC no siempre devuelve cantidad
      p.imageUrl || null,
      'Go UPC',
    )
  } catch { return null }
}

// ── Función principal exportada ───────────────────────────────────────────

/**
 * Busca un producto por código de barras encadenando las 3 APIs.
 * Devuelve el primer resultado encontrado, o null si ninguna lo tiene.
 *
 * @param {string} codigo
 * @returns {Promise<{codigoBarras, nombre, marca, categoria, unidad, imagen, fuente} | null>}
 */
export async function buscarEnOFF(codigo) {
  // Nombre de la función mantenido por compatibilidad con EscanerCodigo.svelte

  // Las tres se lanzan en paralelo con Promise.any para minimizar latencia
  // Si una falla o devuelve null, se prueba la siguiente
  const apis = [buscarOFF, buscarOBF, buscarGoUPC]

  for (const api of apis) {
    const r = await api(codigo)
    if (r) return r
  }

  return null
}