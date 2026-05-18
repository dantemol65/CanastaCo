// stores/listas_compras.js
import { writable, get } from 'svelte/store'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, serverTimestamp, writeBatch
} from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { currentUser } from './auth.js'

// ── Stores ────────────────────────────────────────────────────────────────

export const misListas        = writable([])
export const listaActiva      = writable(null)
export const cargandoListas   = writable(false)

// ── CRUD de listas ────────────────────────────────────────────────────────

export async function cargarMisListas() {
  const user = get(currentUser)
  if (!user) return
  cargandoListas.set(true)
  try {
    const q = query(
      collection(db, 'listas_compras'),
      where('usuarioId', '==', user.uid)
    )
    const snap = await getDocs(q)
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.creadaEn?.toDate?.() || new Date(a.creadaEn || 0)
        const tb = b.creadaEn?.toDate?.() || new Date(b.creadaEn || 0)
        return tb - ta
      })
    misListas.set(lista)
    return lista
  } catch (e) {
    console.error('cargarMisListas:', e)
    return []
  } finally {
    cargandoListas.set(false)
  }
}

export async function crearLista(nombre, localidad) {
  const user = get(currentUser)
  if (!user) throw new Error('No autenticado')

  const nueva = {
    usuarioId: user.uid,
    nombre:    nombre.trim(),
    localidad,
    items:     [],
    creadaEn:  serverTimestamp(),
    editadaEn: serverTimestamp(),
  }
  const ref = await addDoc(collection(db, 'listas_compras'), nueva)
  const conId = { id: ref.id, ...nueva, items: [] }
  misListas.update(l => [conId, ...l])
  return conId
}

export async function eliminarLista(listaId) {
  await deleteDoc(doc(db, 'listas_compras', listaId))
  misListas.update(l => l.filter(x => x.id !== listaId))
}

export async function renombrarLista(listaId, nuevoNombre) {
  await updateDoc(doc(db, 'listas_compras', listaId), {
    nombre:    nuevoNombre.trim(),
    editadaEn: serverTimestamp(),
  })
  misListas.update(l =>
    l.map(x => x.id === listaId ? { ...x, nombre: nuevoNombre.trim() } : x)
  )
}

export async function cargarLista(listaId) {
  const snap = await getDoc(doc(db, 'listas_compras', listaId))
  if (!snap.exists()) return null
  const lista = { id: snap.id, ...snap.data() }
  listaActiva.set(lista)
  return lista
}

// ── Ítems de la lista ─────────────────────────────────────────────────────

export async function agregarItem(listaId, producto) {
  const lista = get(listaActiva)
  if (!lista) return

  // Evitar duplicados
  if (lista.items.some(i => i.productoId === producto.id)) return

  const item = {
    productoId:        producto.id,
    productoNombre:    producto.nombre,
    productoMarca:     producto.marca || '',
    productoUnidad:    producto.unidad || 'u',
    productoCategoria: producto.categoria || 'otros',
  }

  const nuevosItems = [...lista.items, item]
  await updateDoc(doc(db, 'listas_compras', listaId), {
    items:     nuevosItems,
    editadaEn: serverTimestamp(),
  })

  const actualizada = { ...lista, items: nuevosItems }
  listaActiva.set(actualizada)
  misListas.update(l => l.map(x => x.id === listaId ? actualizada : x))
}

export async function quitarItem(listaId, productoId, productoNombre = null) {
  const lista = get(listaActiva)
  if (!lista) return

  // Para ítems pendientes (productoId === null), usar el nombre como identificador
  // Para ítems normales, usar productoId
  let removido = false
  const nuevosItems = lista.items.filter(i => {
    if (removido) return true  // ya eliminamos uno, conservar el resto
    if (productoId !== null && i.productoId === productoId) {
      removido = true; return false
    }
    if (productoId === null && i.productoNombre === productoNombre) {
      removido = true; return false
    }
    return true
  })
  await updateDoc(doc(db, 'listas_compras', listaId), {
    items:     nuevosItems,
    editadaEn: serverTimestamp(),
  })

  const actualizada = { ...lista, items: nuevosItems }
  listaActiva.set(actualizada)
  misListas.update(l => l.map(x => x.id === listaId ? actualizada : x))
}

// ── Optimizador ───────────────────────────────────────────────────────────

/**
 * Carga todos los precios activos de la localidad para los productos
 * de la lista. Agrupa por comercio.
 *
 * @returns {Map<comercioId, { nombre, precios: Map<productoId, precio> }>}
 */
export async function cargarPreciosParaOptimizar(items, localidad) {
  if (!items.length) return new Map()

  const productoIds = items.map(i => i.productoId)

  // Firestore 'in' soporta hasta 30 elementos — dividir en chunks
  const chunks = []
  for (let i = 0; i < productoIds.length; i += 30) {
    chunks.push(productoIds.slice(i, i + 30))
  }

  const todosPrecios = []
  for (const chunk of chunks) {
    const q = query(
      collection(db, 'precios'),
      where('localidad',  '==', localidad),
      where('activo',     '==', true),
      where('productoId', 'in', chunk)
    )
    const snap = await getDocs(q)
    snap.docs.forEach(d => todosPrecios.push({ id: d.id, ...d.data() }))
  }

  // Agrupar por comercio
  const comercios = new Map()
  for (const p of todosPrecios) {
    if (!comercios.has(p.comercioId)) {
      comercios.set(p.comercioId, {
        comercioId:     p.comercioId,
        comercioNombre: p.comercioNombre,
        precios:        new Map(),  // productoId → { precio, productoNombre }
      })
    }
    const com = comercios.get(p.comercioId)
    // Guardar solo el precio más bajo si hay varios del mismo producto
    const existing = com.precios.get(p.productoId)
    if (!existing || p.precio < existing.precio) {
      com.precios.set(p.productoId, {
        precio:         p.precio,
        productoNombre: p.productoNombre,
        productoMarca:  p.productoMarca || '',
      })
    }
  }

  return comercios
}

/**
 * Caso 1: Top 3 comercios para comprar todo (o casi todo) junto.
 * Para productos sin precio exacto, busca alternativo por nombre normalizado.
 */
export function optimizarUnComercio(items, comerciosMap) {
  const resultados = []

  for (const [, com] of comerciosMap) {
    let total       = 0
    let encontrados = 0
    const detalle   = []
    const faltantes = []

    for (const item of items) {
      const precio = com.precios.get(item.productoId)

      if (precio) {
        total += precio.precio
        encontrados++
        detalle.push({
          productoId:     item.productoId,
          productoNombre: item.productoNombre,
          precio:         precio.precio,
          esAlternativo:  false,
        })
      } else {
        // Buscar alternativo: mismo nombre normalizado, distinta marca
        const nombreNorm = item.productoNombre.toLowerCase()
        let alternativo  = null

        for (const [pid, p] of com.precios) {
          if (p.productoNombre.toLowerCase().includes(nombreNorm) ||
              nombreNorm.includes(p.productoNombre.toLowerCase())) {
            alternativo = { productoId: pid, ...p }
            break
          }
        }

        if (alternativo) {
          total += alternativo.precio
          encontrados++
          detalle.push({
            productoId:     alternativo.productoId,
            productoNombre: item.productoNombre,
            precioNombre:   alternativo.productoNombre,
            precio:         alternativo.precio,
            esAlternativo:  true,
          })
        } else {
          faltantes.push(item.productoNombre)
        }
      }
    }

    if (encontrados === 0) continue

    resultados.push({
      comercioId:     com.comercioId,
      comercioNombre: com.comercioNombre,
      total,
      encontrados,
      totalItems:     items.length,
      cobertura:      Math.round((encontrados / items.length) * 100),
      detalle,
      faltantes,
    })
  }

  // Ordenar: primero cobertura completa, luego por precio
  return resultados
    .sort((a, b) => {
      if (b.cobertura !== a.cobertura) return b.cobertura - a.cobertura
      return a.total - b.total
    })
    .slice(0, 3)
}

/**
 * Caso 2: División óptima en 2-3 sublistas por comercio más barato por producto.
 * Agrupa y fusiona si hay más de 3 comercios distintos.
 */
export function optimizarRepartido(items, comerciosMap) {
  // Para cada producto, encontrar el comercio con precio más bajo
  const asignaciones = new Map() // comercioId → { comercioNombre, items: [] }

  for (const item of items) {
    let mejorComercio = null
    let mejorPrecio   = Infinity

    for (const [cid, com] of comerciosMap) {
      const precio = com.precios.get(item.productoId)
      if (precio && precio.precio < mejorPrecio) {
        mejorPrecio   = precio.precio
        mejorComercio = { id: cid, nombre: com.comercioNombre }
      }
    }

    if (!mejorComercio) continue  // producto sin precio en ningún comercio

    if (!asignaciones.has(mejorComercio.id)) {
      asignaciones.set(mejorComercio.id, {
        comercioId:     mejorComercio.id,
        comercioNombre: mejorComercio.nombre,
        items:          [],
        total:          0,
      })
    }

    const grp = asignaciones.get(mejorComercio.id)
    grp.items.push({ ...item, precio: mejorPrecio })
    grp.total += mejorPrecio
  }

  let sublistas = Array.from(asignaciones.values())
    .sort((a, b) => b.items.length - a.items.length)

  // Si hay más de 3 comercios, fusionar los de menor cantidad de ítems
  while (sublistas.length > 3) {
    const ultimo     = sublistas.pop()
    const penultimo  = sublistas.pop()
    // Fusionar en el que ya tiene más ítems (el primero de los dos)
    const destino = sublistas[0]
    destino.items  = [...destino.items, ...ultimo.items, ...penultimo.items]
    destino.total += ultimo.total + penultimo.total
    destino.comercioNombre += ' + más'
  }

  // Calcular ahorro vs caso 1 (comprar todo en el más barato de un solo comercio)
  const totalRepartido = sublistas.reduce((s, g) => s + g.total, 0)
  const sinRepartir    = items.reduce((s, item) => {
    // Precio mínimo disponible para cada producto en cualquier comercio
    let min = Infinity
    for (const [, com] of comerciosMap) {
      const p = com.precios.get(item.productoId)
      if (p && p.precio < min) min = p.precio
    }
    return s + (min === Infinity ? 0 : min)
  }, 0)

  return {
    sublistas,
    totalRepartido,
    totalSinRepartir: sinRepartir,
    ahorro:           Math.max(0, sinRepartir - totalRepartido),
    productosSinPrecio: items.filter(item => {
      for (const [, com] of comerciosMap) {
        if (com.precios.has(item.productoId)) return false
      }
      return true
    }).map(i => i.productoNombre),
  }
}

// ── Solicitudes de productos a la comunidad ──────────────────────────────

/**
 * Solicita un producto a la comunidad y lo agrega a la lista como pendiente.
 */
export async function solicitarProducto(listaId, nombreProducto, localidad) {
  const user = get(currentUser)
  if (!user) throw new Error('No autenticado')

  // 1. Crear solicitud en Firestore
  const solicitud = {
    nombre:        nombreProducto.trim(),
    nombreNorm:    nombreProducto.trim().toLowerCase(),
    localidad,
    solicitadoPor: user.uid,
    creadaEn:      serverTimestamp(),
    estado:        'pendiente',   // 'pendiente' | 'cubierto'
    votos:         1,             // el solicitante ya vota
    votantes:      [user.uid],
  }

  // Verificar si ya existe una solicitud similar
  const q = query(
    collection(db, 'solicitudes_productos'),
    where('localidad',  '==', localidad),
    where('nombreNorm', '==', solicitud.nombreNorm),
    where('estado',     '==', 'pendiente')
  )
  const snap = await getDocs(q)

  let solicitudId
  if (!snap.empty) {
    // Ya existe → sumar voto
    const existing = snap.docs[0]
    const data     = existing.data()
    if (!data.votantes?.includes(user.uid)) {
      await updateDoc(doc(db, 'solicitudes_productos', existing.id), {
        votos:    (data.votos || 1) + 1,
        votantes: [...(data.votantes || []), user.uid],
      })
    }
    solicitudId = existing.id
  } else {
    const ref   = await addDoc(collection(db, 'solicitudes_productos'), solicitud)
    solicitudId = ref.id
  }

  // 2. Agregar a la lista como ítem pendiente (sin productoId)
  const lista = get(listaActiva)
  if (!lista) return

  // Evitar duplicados en la lista
  if (lista.items.some(i => i.productoNombre?.toLowerCase() === nombreProducto.trim().toLowerCase())) {
    return { yaEnLista: true, solicitudId }
  }

  const itemPendiente = {
    productoId:        null,
    productoNombre:    nombreProducto.trim(),
    productoMarca:     '',
    productoUnidad:    'u',
    productoCategoria: 'otros',
    pendiente:         true,
    solicitudId,
  }

  const nuevosItems = [...lista.items, itemPendiente]
  await updateDoc(doc(db, 'listas_compras', listaId), {
    items:     nuevosItems,
    editadaEn: serverTimestamp(),
  })

  const actualizada = { ...lista, items: nuevosItems }
  listaActiva.set(actualizada)
  misListas.update(l => l.map(x => x.id === listaId ? actualizada : x))

  return { solicitudId }
}

/**
 * Reemplaza un ítem pendiente por un producto real del catálogo.
 */
export async function resolverItemPendiente(listaId, productoNombrePendiente, productoReal) {
  const lista = get(listaActiva)
  if (!lista) return

  const nuevosItems = lista.items.map(i => {
    if (i.pendiente && i.productoNombre?.toLowerCase() === productoNombrePendiente.toLowerCase()) {
      return {
        productoId:        productoReal.id,
        productoNombre:    productoReal.nombre,
        productoMarca:     productoReal.marca || '',
        productoUnidad:    productoReal.unidad || 'u',
        productoCategoria: productoReal.categoria || 'otros',
        pendiente:         false,
      }
    }
    return i
  })

  await updateDoc(doc(db, 'listas_compras', listaId), {
    items:     nuevosItems,
    editadaEn: serverTimestamp(),
  })

  const actualizada = { ...lista, items: nuevosItems }
  listaActiva.set(actualizada)
  misListas.update(l => l.map(x => x.id === listaId ? actualizada : x))
}

/**
 * Carga solicitudes pendientes de una localidad.
 */
export async function cargarSolicitudes(localidad) {
  try {
    const q = query(
      collection(db, 'solicitudes_productos'),
      where('localidad', '==', localidad),
      where('estado',    '==', 'pendiente')
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.votos || 0) - (a.votos || 0))
  } catch (e) {
    console.error('cargarSolicitudes:', e)
    return []
  }
}

/**
 * Marca una solicitud como cubierta (cuando alguien agrega el producto al catálogo).
 */
export async function marcarSolicitudCubierta(solicitudId, productoReal = null) {
  // 1. Marcar la solicitud como cubierta
  await updateDoc(doc(db, 'solicitudes_productos', solicitudId), {
    estado:     'cubierto',
    cubiertaEn: serverTimestamp(),
  })

  if (!productoReal) return

  // 2. Actualizar SOLO las listas del usuario actual que tengan el ítem pendiente
  // (evita necesitar permisos sobre listas ajenas)
  const user = get(currentUser)
  if (!user) return

  try {
    const qListas = query(
      collection(db, 'listas_compras'),
      where('usuarioId', '==', user.uid)
    )
    const snap = await getDocs(qListas)

    const batch = writeBatch(db)
    let hayActualizaciones = false

    for (const d of snap.docs) {
      const items  = d.data().items || []
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

      batch.update(doc(db, 'listas_compras', d.id), {
        items:     nuevosItems,
        editadaEn: serverTimestamp(),
      })
      hayActualizaciones = true
    }

    if (hayActualizaciones) await batch.commit()

    // Actualizar el store local también
    listaActiva.update(lista => {
      if (!lista) return lista
      if (!lista.items?.some(i => i.pendiente && i.solicitudId === solicitudId)) return lista
      return {
        ...lista,
        items: lista.items.map(i =>
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
        ),
      }
    })
  } catch (e) {
    console.error('marcarSolicitudCubierta:', e)
  }
}

/**
 * Verifica los ítems pendientes de una lista y los resuelve si la solicitud
 * ya fue cubierta. Lo ejecuta el dueño de la lista al abrirla.
 */
export async function resolverPendientesDeLista(listaId) {
  const lista = get(listaActiva)
  if (!lista) return

  const pendientes = lista.items?.filter(i => i.pendiente && i.solicitudId) || []
  if (!pendientes.length) return

  let hubocambios = false
  let nuevosItems = [...lista.items]

  for (const item of pendientes) {
    try {
      const snap = await getDoc(doc(db, 'solicitudes_productos', item.solicitudId))
      if (!snap.exists()) continue
      const sol = snap.data()

      // Si ya fue cubierta, buscar el producto real por nombre normalizado
      if (sol.estado !== 'cubierto') continue

      // Buscar el producto en el catálogo local por nombre normalizado
      const nombreNorm = item.productoNombre.toLowerCase()
      const qProd = query(
        collection(db, 'productos'),
        where('localidad',  '==', lista.localidad),
        where('nombreNorm', '==', nombreNorm)
      )
      const snapProd = await getDocs(qProd)

      let productoReal = null
      if (!snapProd.empty) {
        productoReal = { id: snapProd.docs[0].id, ...snapProd.docs[0].data() }
      } else {
        // Búsqueda parcial — el nombre puede haber cambiado ligeramente
        const qProdAll = query(
          collection(db, 'productos'),
          where('localidad', '==', lista.localidad)
        )
        const snapAll = await getDocs(qProdAll)
        const match = snapAll.docs.find(d =>
          d.data().nombreNorm?.includes(nombreNorm) ||
          nombreNorm.includes(d.data().nombreNorm || '')
        )
        if (match) productoReal = { id: match.id, ...match.data() }
      }

      if (!productoReal) continue

      // Reemplazar el ítem pendiente por el producto real
      nuevosItems = nuevosItems.map(i =>
        i.pendiente && i.solicitudId === item.solicitudId
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
      hubocambios = true
    } catch (e) {
      console.error('resolverPendientesDeLista:', e)
    }
  }

  if (!hubocambios) return

  // Guardar en Firestore (el dueño siempre puede escribir su propia lista)
  await updateDoc(doc(db, 'listas_compras', listaId), {
    items:     nuevosItems,
    editadaEn: serverTimestamp(),
  })

  const actualizada = { ...lista, items: nuevosItems }
  listaActiva.set(actualizada)
  misListas.update(l => l.map(x => x.id === listaId ? actualizada : x))
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function formatPrecioLista(valor) {
  return new Intl.NumberFormat('es-AR', {
    style:                 'currency',
    currency:              'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)
}