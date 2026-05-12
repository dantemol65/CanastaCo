// lib/credencial.js — Generación de códigos y PDF de credencial

/**
 * Genera un código alfanumérico aleatorio
 */
export function generarCodigo(longitud = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin O,0,I,1 para evitar confusión
  return Array.from({ length: longitud }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

/**
 * Hashea un código con SHA-256 (para guardar el privado en DB)
 */
export async function hashearCodigo(codigo) {
  const encoder = new TextEncoder()
  const data     = encoder.encode(codigo + 'canastaco_salt_2025')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray  = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verifica si un código ingresado coincide con el hash guardado
 */
export async function verificarCodigo(codigoIngresado, hashGuardado) {
  const hash = await hashearCodigo(codigoIngresado.toUpperCase().trim())
  return hash === hashGuardado
}

/**
 * Genera el PDF de credencial del comercio
 * Requiere que jsPDF esté cargado
 */
export async function generarPDFCredencial({ comercio, codigoPublico, codigoPrivado }) {
  // Cargamos jsPDF dinámicamente desde CDN
  // El módulo UMD puede exponer jsPDF de distintas formas según el bundler
  const jspdfMod = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
  const jsPDF = jspdfMod.jsPDF
    || jspdfMod.default?.jsPDF
    || window.jspdf?.jsPDF
  if (!jsPDF) throw new Error('No se pudo cargar jsPDF')

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  const W = 148, H = 210  // A5 en mm

  // ── Zona pública (parte superior, ~140mm) ─────────────────────────────

  // Fondo verde header
  pdf.setFillColor(27, 107, 58)
  pdf.rect(0, 0, W, 40, 'F')

  // Logo texto
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(22)
  pdf.setFont('helvetica', 'bold')
  pdf.text('🧺 canasta.co', W/2, 18, { align: 'center' })

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Red comunitaria de precios', W/2, 26, { align: 'center' })

  pdf.setFontSize(8)
  pdf.text('Comercio verificado', W/2, 33, { align: 'center' })

  // Datos del comercio
  pdf.setTextColor(30, 30, 30)
  pdf.setFontSize(15)
  pdf.setFont('helvetica', 'bold')
  pdf.text(comercio.nombre, W/2, 56, { align: 'center', maxWidth: W - 20 })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(80, 80, 80)
  pdf.text(comercio.tipo?.toUpperCase() || '', W/2, 65, { align: 'center' })

  pdf.setFontSize(9)
  pdf.setTextColor(60, 60, 60)
  if (comercio.direccion) {
    pdf.text(comercio.direccion, W/2, 73, { align: 'center', maxWidth: W - 20 })
  }

  // QR code usando API gratuita
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=canastaco://comercio/${codigoPublico}`
  try {
    // Creamos un canvas para el QR
    const img = await cargarImagen(qrUrl)
    pdf.addImage(img, 'PNG', W/2 - 20, 80, 40, 40)
  } catch {
    // Si falla el QR, ponemos el código público textual
    pdf.setFontSize(8)
    pdf.setTextColor(100,100,100)
    pdf.text('Código: ' + codigoPublico, W/2, 100, { align: 'center' })
  }

  pdf.setFontSize(8)
  pdf.setTextColor(100, 100, 100)
  pdf.text('Escaneá para ver este comercio en canasta.co', W/2, 124, { align: 'center' })

  // Código público visible
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(27, 107, 58)
  pdf.text('ID: ' + codigoPublico, W/2, 133, { align: 'center' })

  // Fecha
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(150, 150, 150)
  pdf.text('Emitido: ' + new Date().toLocaleDateString('es-AR'), W/2, 139, { align: 'center' })

  // ── Línea de corte ────────────────────────────────────────────────────

  pdf.setDrawColor(150, 150, 150)
  pdf.setLineDashPattern([2, 2], 0)
  pdf.line(10, 145, W - 10, 145)
  pdf.setLineDashPattern([], 0)

  pdf.setFontSize(7)
  pdf.setTextColor(150, 150, 150)
  pdf.text('✂  Entregar al dueño del comercio  ✂', W/2, 150, { align: 'center' })

  // ── Zona privada (trozo desprendible, parte inferior) ─────────────────

  pdf.setFillColor(245, 163, 33)  // ámbar
  pdf.rect(0, 153, W, 8, 'F')

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.text('🧺 canasta.co — CÓDIGO PRIVADO DE RECLAMACIÓN', W/2, 158, { align: 'center' })

  pdf.setTextColor(30, 30, 30)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Comercio: ' + comercio.nombre, 10, 170)
  pdf.text('Dirección: ' + (comercio.direccion || ''), 10, 178)

  pdf.setFontSize(22)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(27, 107, 58)
  pdf.text(codigoPrivado, W/2, 193, { align: 'center', charSpace: 6 })

  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(100, 100, 100)
  pdf.text('Ingresá este código en la app para reclamar la gestión del comercio.', W/2, 200, { align: 'center' })
  pdf.text('Válido por 30 días. No compartir.', W/2, 205, { align: 'center' })

  return pdf
}

// Helper: carga una imagen como base64 para jsPDF
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