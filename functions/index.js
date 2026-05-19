const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { initializeApp }     = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

initializeApp()
const db = getFirestore()

/**
 * Se dispara cuando solicitudes_productos/{id} cambia estado a 'cubierto'.
 * 1. Busca el producto real en el catálogo de la localidad
 * 2. Actualiza todas las listas_compras de esa localidad que tengan el ítem pendiente
 * 3. Crea una notificación para cada usuario afectado
 */
exports.onSolicitudCubierta = onDocumentUpdated(
  'solicitudes_productos/{solicitudId}',
  async (event) => {
    const antes  = event.data.before.data()
    const despues = event.data.after.data()

    // Solo actuar cuando cambia a 'cubierto'
    if (antes.estado === despues.estado) return null
    if (despues.estado !== 'cubierto')   return null

    const solicitudId = event.params.solicitudId
    const localidad   = despues.localidad
    const nombreSol   = despues.nombre || ''
    const nombreNorm  = nombreSol.toLowerCase()

    console.log(`Solicitud cubierta: ${solicitudId} — "${nombreSol}" en ${localidad}`)

    // ── 1. Buscar el producto real en el catálogo ─────────────────────────
    let productoReal = null

    // Búsqueda exacta por nombreNorm
    const snapProdExacto = await db.collection('productos')
      .where('localidad',  '==', localidad)
      .where('nombreNorm', '==', nombreNorm)
      .limit(1)
      .get()

    if (!snapProdExacto.empty) {
      const d = snapProdExacto.docs[0]
      productoReal = { id: d.id, ...d.data() }
    } else {
      // Búsqueda parcial — el nombre puede diferir ligeramente
      const snapTodos = await db.collection('productos')
        .where('localidad', '==', localidad)
        .get()

      for (const d of snapTodos.docs) {
        const nn = d.data().nombreNorm || ''
        if (nn.includes(nombreNorm) || nombreNorm.includes(nn)) {
          productoReal = { id: d.id, ...d.data() }
          break
        }
      }
    }

    if (!productoReal) {
      console.log('No se encontró el producto real en el catálogo — abortando')
      return null
    }

    console.log(`Producto real encontrado: ${productoReal.id} — "${productoReal.nombre}"`)

    // ── 2. Buscar listas con el ítem pendiente ────────────────────────────
    const snapListas = await db.collection('listas_compras')
      .where('localidad', '==', localidad)
      .get()

    const batch     = db.batch()
    const afectados = []  // UIDs de usuarios a notificar

    for (const doc of snapListas.docs) {
      const lista = doc.data()
      const items = lista.items || []

      const tieneP = items.some(i => i.pendiente && i.solicitudId === solicitudId)
      if (!tieneP) continue

      const nuevosItems = items.map(i =>
        i.pendiente && i.solicitudId === solicitudId
          ? {
              productoId:        productoReal.id,
              productoNombre:    productoReal.nombre,
              productoMarca:     productoReal.marca     || '',
              productoUnidad:    productoReal.unidad    || 'u',
              productoCategoria: productoReal.categoria || 'otros',
              pendiente:         false,
            }
          : i
      )

      batch.update(doc.ref, {
        items:     nuevosItems,
        editadaEn: FieldValue.serverTimestamp(),
      })

      if (lista.usuarioId && !afectados.includes(lista.usuarioId)) {
        afectados.push(lista.usuarioId)
      }
    }

    await batch.commit()
    console.log(`Listas actualizadas. Usuarios afectados: ${afectados.length}`)

    // ── 3. Crear notificación para cada usuario afectado ──────────────────
    const notisBatch = db.batch()
    for (const uid of afectados) {
      const ref = db.collection('notificaciones').doc()
      notisBatch.set(ref, {
        destinatario: uid,
        tipo:         'solicitud_cubierta',
        titulo:       '¡Tu pedido fue cubierto!',
        mensaje:      `"${nombreSol}" ya está en el catálogo de tu localidad.`,
        datos:        { productoId: productoReal.id, solicitudId },
        leida:        false,
        creadaEn:     FieldValue.serverTimestamp(),
      })
    }
    await notisBatch.commit()
    console.log(`Notificaciones creadas: ${afectados.length}`)

    return null
  }
)