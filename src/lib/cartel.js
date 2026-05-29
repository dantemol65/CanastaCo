// lib/cartel.js
// Genera el cartel PDF A5 apaisado para pegar en la entrada del comercio.
// El QR codifica una URL con token firmado que permite verificar
// que el cartel corresponde exactamente al comercio en esa dirección.
//
// Dependencias: jsPDF (ya incluida en el proyecto via credencial.js)
// El QR se genera vía api.qrserver.com (ya en NetworkOnly de vite.config.js)

// ── Firma del token ────────────────────────────────────────────────────────
// El token es un hash SHA-256 truncado de: comercioId + direccion + codigoPublico
// Esto hace que el token sea único por comercio y no falsificable sin el codigoPublico.

export async function generarTokenCartel(comercioId, direccion, codigoPublico) {
  const datos  = `${comercioId}|${(direccion || '').toLowerCase().trim()}|${codigoPublico || ''}`
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(datos))
  const hex    = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 16)   // 16 chars es suficiente para verificación
}

export function construirUrlCartel(comercioId, token) {
  // La dirección NO va en la URL — se lee de Firestore al abrir el QR.
  // Esto evita problemas con caracteres especiales en query strings.
  return `https://canastaco.netlify.app/comercio/${comercioId}?token=${token}`
}

// ── Verificación (se usa en DetalleComercio.svelte al abrir QR) ────────────
export async function verificarTokenCartel(comercioId, direccion, codigoPublico, tokenRecibido) {
  if (!tokenRecibido) return false
  const esperado = await generarTokenCartel(comercioId, direccion, codigoPublico)
  return esperado === tokenRecibido
}

// ── Carga de imagen via canvas (mismo patrón que credencial.js) ────────────
function cargarImagen(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.width
      canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = url
  })
}

// ── Generación del PDF ─────────────────────────────────────────────────────
export async function generarCartelPDF(comercio) {
  // Mismo patrón de importación que credencial.js — prueba las tres variantes
  const jspdfMod = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
  const jsPDF = jspdfMod.jsPDF
    || jspdfMod.default?.jsPDF
    || window.jspdf?.jsPDF
  if (!jsPDF) throw new Error('No se pudo cargar jsPDF')

  if (!comercio.codigoPublico) {
    throw new Error('El comercio no tiene credencial generada. Pedile al admin que genere la credencial primero.')
  }

  // ── Token y URL del QR ───────────────────────────────────────────────────
  const token = await generarTokenCartel(comercio.id, comercio.direccion, comercio.codigoPublico)
  const urlQR = construirUrlCartel(comercio.id, token)

  // ── Documento: A5 apaisado (148 x 210 mm) ────────────────────────────────
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' })
  const W   = 210   // ancho
  const H   = 148   // alto

  // ── Fondo blanco ─────────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, W, H, 'F')

  // ── Franja superior verde ─────────────────────────────────────────────────
  doc.setFillColor(27, 107, 58)
  doc.rect(0, 0, W, 36, 'F')

  // ── Logo / marca en la franja ─────────────────────────────────────────────
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.text('Canasta', 16, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(28)
  doc.setTextColor(245, 163, 33)   // --c-accent
  doc.text('.co', 16 + doc.getTextWidth('Canasta'), 22)

  // Tagline en la franja
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200, 230, 210)
  doc.text('Comparador de precios comunitario', 16, 30)

  // ── Contenido principal ───────────────────────────────────────────────────
  // Columna izquierda: datos del comercio
  const colIzq = 16
  const colQR  = W - 62   // columna del QR

  // Nombre del comercio
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(28, 43, 30)
  // Truncar nombre si es muy largo
  const nombreComercio = comercio.nombre || ''
  const nombreTruncado = doc.getTextWidth(nombreComercio) > colQR - colIzq - 8
    ? doc.splitTextToSize(nombreComercio, colQR - colIzq - 8).slice(0, 2).join('\n')
    : nombreComercio
  doc.text(nombreTruncado, colIzq, 50)

  // Línea separadora
  doc.setDrawColor(213, 227, 216)
  doc.setLineWidth(0.5)
  doc.line(colIzq, 56, colQR - 8, 56)

  // Dirección
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(74, 94, 78)
  const direccionLabel = '📍  ' + (comercio.direccion || 'Sin dirección registrada')
  doc.text(doc.splitTextToSize(direccionLabel, colQR - colIzq - 8), colIzq, 63)

  // Mensaje principal
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(27, 107, 58)
  doc.text('Este comercio publica\nsus precios en Canasta.co', colIzq, 82)

  // Descripción
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(100, 120, 104)
  doc.text(
    'Consultá y comparás los precios de este\nlocal desde tu celular, gratis y sin publicidad.',
    colIzq, 97
  )

  // Badge "Comercio adherido"
  doc.setFillColor(240, 253, 244)
  doc.setDrawColor(187, 247, 208)
  doc.roundedRect(colIzq, 107, 68, 10, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(27, 107, 58)
  doc.text('✓  Comercio adherido al programa', colIzq + 3, 113.5)

  // Instrucción para el usuario
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(143, 164, 148)
  doc.text('Escaneá el QR para ver precios y verificar este cartel', colIzq, 127)

  // URL pie
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(27, 107, 58)
  doc.text('canasta.co', colIzq, 134)

  // ── QR ────────────────────────────────────────────────────────────────────
  // Marco del QR
  doc.setFillColor(247, 249, 244)
  doc.setDrawColor(213, 227, 216)
  doc.roundedRect(colQR, 40, 56, 56, 3, 3, 'FD')

  // Imagen QR — usando cargarImagen con canvas (mismo patrón que credencial.js)
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(urlQR)}&color=1B6B3A&bgcolor=FFFFFF&qzone=2&format=png`
  try {
    const qrData = await cargarImagen(qrImgUrl)
    doc.addImage(qrData, 'PNG', colQR + 3, 43, 50, 50)
  } catch {
    // Fallback: mostrar la URL como texto si falla la imagen
    doc.setFontSize(6)
    doc.setTextColor(100, 100, 100)
    doc.text('QR no disponible', colQR + 28, 68, { align: 'center' })
  }

  // Texto debajo del QR
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(74, 94, 78)
  doc.text('Escaneá para\nverificar precios', colQR + 28, 101, { align: 'center' })

  // ── Línea de corte inferior (referencia para imprenta) ────────────────────
  doc.setDrawColor(213, 227, 216)
  doc.setLineDash([2, 2])
  doc.setLineWidth(0.3)
  doc.line(0, H - 6, W, H - 6)
  doc.setLineDash([])

  // Nota al pie
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(180, 200, 184)
  doc.text(
    `Imprimí en color · ID: ${comercio.id.slice(0, 8).toUpperCase()} · canasta.co`,
    W / 2,
    H - 2,
    { align: 'center' }
  )

  return doc
}