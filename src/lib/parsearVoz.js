// lib/parsearVoz.js — Parser de texto de voz, 100% local, sin IA ni red
// Convierte frases en español rioplatense → datos estructurados de producto/precio

// ── Números en español → valor numérico ──────────────────────────────────

const UNIDADES_NUM = {
  cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5,
  seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12,
  trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17,
  dieciocho:18, diecinueve:19, veinte:20, veintiuno:21, veintidos:22,
  veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26,
  veintisiete:27, veintiocho:28, veintinueve:29,
}
const DECENAS = {
  treinta:30, cuarenta:40, cincuenta:50, sesenta:60,
  setenta:70, ochenta:80, noventa:90,
}
const CENTENAS = {
  cien:100, ciento:100, doscientos:200, doscientas:200,
  trescientos:300, trescientas:300, cuatrocientos:400, cuatrocientas:400,
  quinientos:500, quinientas:500, seiscientos:600, seiscientas:600,
  setecientos:700, setecientas:700, ochocientos:800, ochocientas:800,
  novecientos:900, novecientas:900,
}

function palabrasANumero(tokens) {
  let total = 0, parcial = 0
  for (const t of tokens) {
    if (t === 'mil') { parcial = parcial || 1; total += parcial * 1000; parcial = 0 }
    else if (CENTENAS[t] !== undefined) parcial += CENTENAS[t]
    else if (DECENAS[t]  !== undefined) parcial += DECENAS[t]
    else if (UNIDADES_NUM[t] !== undefined) parcial += UNIDADES_NUM[t]
  }
  return total + parcial || null
}

// ── Extracción de precio ──────────────────────────────────────────────────

function extraerPrecio(texto) {
  // 1. Dígitos: "1200", "850", "12.50"
  const mDigitos = texto.match(/\b(\d{1,5}(?:[.,]\d{2})?)\b/)
  if (mDigitos) {
    const v = parseFloat(mDigitos[1].replace(',', '.'))
    if (v > 0 && v < 100000) return v
  }

  // 2. "dos cincuenta" → 250, "tres ochenta" → 380 (patrón argentino)
  const m2 = texto.match(
    /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\s+(diez|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\b/
  )
  if (m2) return (UNIDADES_NUM[m2[1]] * 100) + DECENAS[m2[2]]

  // 3. Palabras numéricas puras
  const tokens = texto.toLowerCase().replace(/\s+y\s+/g, ' ').split(/\s+/)
  return palabrasANumero(tokens)
}

// ── Unidades ──────────────────────────────────────────────────────────────

const UNIDAD_MAP = [
  { re: /\b(kilos?|kg)\b/,               v: 'kg'   },
  { re: /\b(gramos?|grs?)\b/,            v: 'g'    },
  { re: /\b(litros?|lts?)\b/,            v: 'L'    },
  { re: /\b(mililitros?|ml)\b/,          v: 'ml'   },
  { re: /\b(docenas?|doce unidades)\b/,  v: 'dz'   },
  { re: /\b(pack|paquetes?|combo)\b/,    v: 'pack' },
]

function extraerUnidad(texto) {
  for (const { re, v } of UNIDAD_MAP) if (re.test(texto)) return v
  return null
}

// ── Marcas conocidas ──────────────────────────────────────────────────────

const MARCAS = [
  'la serenisima','serenisima','cocinero','natura','arcor','marolio',
  'molinos','bimbo','fargo','ilolay','sancor','tregar','cunnington',
  'villavicencio','glaciar','knorr','maggi','nestle','quilmes','brahma',
  'ala','skip','ariel','pampers','huggies','johnson','jumbo',
]

function extraerMarca(texto) {
  for (const m of MARCAS) {
    if (texto.includes(m)) {
      return m.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }
  }
  return null
}

// ── Palabras de ruido ─────────────────────────────────────────────────────

const RUIDO = [
  'oferta','promocion','descuento','especial','liquidacion',
  'precio','pesos','el kilo','el litro','por unidad','la unidad',
  'hoy','quiero cargar','quiero agregar','agregar','cargar',
]

// ── Parser principal ──────────────────────────────────────────────────────

export async function parsearVoz(textoVoz) {
  let t = textoVoz.toLowerCase().trim()
  // Normalizar tildes para matching
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const tn = norm(t)

  const esOferta = /\b(oferta|promoci[oo]n|descuento|especial|liquidaci[oo]n)\b/.test(tn)

  const precio = extraerPrecio(tn)
  const unidad = extraerUnidad(tn)
  const marca  = extraerMarca(tn)

  // Limpiar para obtener solo el nombre del producto
  let nombre = tn

  if (marca) nombre = nombre.replace(norm(marca.toLowerCase()), '')

  for (const { re } of UNIDAD_MAP) nombre = nombre.replace(new RegExp(re.source, 'gi'), '')

  // Quitar dígitos
  nombre = nombre.replace(/\b\d[\d.,]*\b/g, '')

  // Quitar números en palabras al final de la frase (suelen ser precio)
  const todosNums = [...Object.keys(UNIDADES_NUM), ...Object.keys(DECENAS), ...Object.keys(CENTENAS), 'mil']
  nombre = nombre.replace(new RegExp(`\\b(${todosNums.join('|')})\\b.*$`, 'gi'), '')

  // Quitar ruido
  for (const r of RUIDO) nombre = nombre.replace(new RegExp(`\\b${norm(r)}\\b`, 'gi'), '')

  // Quitar preposiciones iniciales y limpiar espacios
  nombre = nombre.replace(/^(de|del|un|una|el|la|los|las|con|para)\s+/gi, '')
  nombre = nombre.replace(/[^a-z\s]/gi, '').replace(/\s+/g, ' ').trim()

  // Capitalizar
  const producto = nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : ''

  return { producto, marca: marca || null, unidad: unidad || null, precio: precio || null, esOferta }
}