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

// ── Open Food Facts ───────────────────────────────────────────────────────

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product'

// Mapeo de categorías OFF → categorías canasta.co
const CAT_MAP = {
  'en:dairy':               'lacteos',
  'en:milks':               'lacteos',
  'en:yogurts':             'lacteos',
  'en:cheeses':             'fiambreria',
  'en:meats':               'carnes',
  'en:beverages':           'bebidas',
  'en:waters':              'bebidas',
  'en:juices':              'bebidas',
  'en:sodas':               'bebidas',
  'en:breads':              'panaderia',
  'en:cereals':             'almacen',
  'en:pastas':              'almacen',
  'en:rice':                'almacen',
  'en:flours':              'almacen',
  'en:oils':                'almacen',
  'en:sauces':              'almacen',
  'en:condiments':          'almacen',
  'en:snacks':              'almacen',
  'en:chocolates':          'almacen',
  'en:frozen-foods':        'congelados',
  'en:cleaning-products':   'limpieza',
  'en:personal-care':       'higiene',
  'en:hygiene':             'higiene',
  'en:fruits':              'frutas',
  'en:vegetables':          'verduras',
  'en:plant-based-foods':   'verduras',
}

function mapearCategoria(cats = []) {
  for (const c of cats) {
    const k = c.toLowerCase()
    for (const [key, val] of Object.entries(CAT_MAP)) {
      if (k.includes(key.replace('en:', ''))) return val
    }
  }
  return 'otros'
}

function mapearUnidad(producto) {
  const q = (producto.quantity || producto.net_weight_value || '').toLowerCase()
  if (q.includes('kg') || q.includes('kilo')) return 'kg'
  if (q.includes(' g') || q.endsWith('g'))    return 'g'
  if (q.includes(' l') || q.endsWith(' l'))   return 'L'
  if (q.includes('ml'))                        return 'ml'
  return 'u'
}

/**
 * Busca un producto en Open Food Facts por código de barras.
 * Devuelve un objeto normalizado para canasta.co, o null si no se encuentra.
 */
export async function buscarEnOFF(codigo) {
  try {
    const campos = 'product_name,product_name_es,brands,categories_tags,quantity,image_front_small_url,stores_tags,countries_tags'
    const url = `${OFF_BASE}/${encodeURIComponent(codigo)}?fields=${campos}`
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const json = await res.json()
    if (json.status !== 1 || !json.product) return null

    const p = json.product

    // Nombre: preferir español, luego genérico
    const nombre = (
      p.product_name_es?.trim() ||
      p.product_name?.trim()    ||
      ''
    )
    if (!nombre) return null // producto sin nombre, no sirve

    // Limpiar nombre: capitalizar primer letra
    const nombreLimpio = nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase()

    return {
      codigoBarras: codigo,
      nombre:       nombreLimpio,
      marca:        p.brands?.split(',')[0]?.trim() || '',
      categoria:    mapearCategoria(p.categories_tags || []),
      unidad:       mapearUnidad(p),
      imagen:       p.image_front_small_url || null,
      fuente:       'openfoodfacts',
    }
  } catch (err) {
    console.warn('OFF lookup error:', err)
    return null
  }
}