<script>
  import { onMount, tick } from 'svelte'

  // Acción portal: mueve el nodo al body para escapar de cualquier overflow/transform
  function portal(node) {
    document.body.appendChild(node)
    return {
      destroy() { node.isConnected && document.body.removeChild(node) }
    }
  }
  import { currentPage, currentUser, userProfile, usuarioSuspendido } from '../stores/auth.js'
  import { comercioActivo, cargarComercio } from '../stores/comercios.js'
  import {
    productos, preciosComercio, cargandoPrecios,
    cargarProductos, cargarPreciosComercio, preciosCacheInfo,
    buscarOCrearProducto, registrarPrecio,
    reportarPrecioIncorrecto, verificarPrecio,
    CATEGORIAS, UNIDADES,
    freshness, freshnessLabel, formatPrecio, esPrecioVencido,
  } from '../stores/precios.js'
  import BottomNav from '../components/BottomNav.svelte'
  import { get } from 'svelte/store'
  import { productoSolicitadoSeleccionado } from '../stores/contexto.js'
  import { marcarSolicitudCubierta, cargarSolicitudes } from '../stores/listas_compras.js'
  import EscanerCodigo from '../components/EscanerCodigo.svelte'
  import BotonVoz from '../components/BotonVoz.svelte'

  export let comercioId = ''

  let comercio      = null
  let cargando      = true
  let error         = null
  let toastMsg      = ''
  let toastTipo     = 'ok'   // 'ok' | 'err'

  // ── Estado del formulario inline ──────────────────────────────────────
  let mostrarForm    = false
  let mostrarEscaner = false
  let cacheInfo      = null   // texto de antigüedad del caché
  let yaConfirmados  = new Set()  // IDs de precios ya confirmados por el usuario en esta sesión
  let yaReportados   = new Set()  // IDs de precios ya reportados por el usuario
  let solicitudIdActual = null  // si se abrió desde una solicitud, guardar el id
  let paso           = 1      // 1: buscar producto  2: ingresar precio

  // Paso 1
  let busquedaProd   = ''
  let productoSel    = null
  let sugerencias    = []
  let modoNuevo      = false
  let nuevaMarca     = ''
  let nuevaUnidad    = 'u'
  let nuevaCategoria = 'otros'

  // Paso 2
  let precioValor    = ''
  let esOferta       = false
  let vencimiento    = ''
  let guardando      = false

  // ── Filtros vista ─────────────────────────────────────────────────────
  let filtroCategoria = ''

  $: user    = $currentUser
  $: perfil  = $userProfile
  $: rol     = perfil?.rol || 'usuario'
  $: esComercioOwner = comercio?.reclamadoPor === user?.uid
  $: esDedicado      = rol === 'dedicado'

  $: localidadId = perfil?.localidad || ''

  // Agrupar por categoría
  $: listaCategorias = (() => {
    const f = filtroCategoria
    const lista = $preciosComercio.filter(p => !f || p.productoCategoria === f)
    const grupos = {}
    for (const p of lista) {
      const cat = p.productoCategoria || 'otros'
      if (!grupos[cat]) grupos[cat] = []
      grupos[cat].push(p)
    }
    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0], 'es'))
  })()

  $: catLabel = id => CATEGORIAS.find(c => c.id === id)?.label || id
  $: catEmoji = id => CATEGORIAS.find(c => c.id === id)?.emoji || '📦'

  // Búsqueda de productos
  $: if (busquedaProd.length >= 2) {
    const q = busquedaProd.toLowerCase()
    sugerencias = $productos
      .filter(p => p.nombre.toLowerCase().includes(q) || p.marca?.toLowerCase().includes(q))
      .slice(0, 6)
    modoNuevo = sugerencias.length === 0
  } else {
    sugerencias = []
    modoNuevo   = false
  }

  onMount(async () => {
    const c = await cargarComercio(comercioId)
    comercio = c
    if (!c) { error = 'Comercio no encontrado.'; cargando = false; return }

    // Verificar que el perfil tiene localidad antes de continuar
    if (!localidadId) {
      error = 'Tu perfil no tiene localidad configurada. Actualizá tu perfil para continuar.'
      cargando = false
      return
    }
    // Promise.allSettled: si productos falla (ej: localidad vacía),
    // los precios igual se cargan
    await Promise.allSettled([
      cargarPreciosComercio(comercioId),
      cargarProductos(localidadId),
    ])
    cacheInfo = preciosCacheInfo(comercioId)
    cargando = false

    // Marcar precios ya confirmados y reportados por el usuario actual
    const uid = user?.uid
    if (uid) {
      const confirmados = new Set()
      const reportados  = new Set()
      $preciosComercio.forEach(p => {
        if (p.verificaciones?.some(v => v.uid === uid)) confirmados.add(p.id)
        if (p.reportes?.some(r => r.uid === uid))       reportados.add(p.id)
      })
      yaConfirmados = confirmados
      yaReportados  = reportados
    }

    // Si viene un producto solicitado seleccionado desde Home → abrir form pre-cargado
    const solicitado = get(productoSolicitadoSeleccionado)
    if (solicitado) {
      busquedaProd      = solicitado.nombre
      solicitudIdActual = solicitado.solicitudId  // guardar para marcar cubierta al guardar
      modoNuevo         = true
      nuevaMarca        = ''
      nuevaUnidad       = 'u'
      nuevaCategoria    = 'otros'
      mostrarForm       = true
      paso              = 1
      productoSolicitadoSeleccionado.set(null)
      await tick()
      if (inputBusqEl) inputBusqEl.focus()
    }
  })

  // ── Helpers ───────────────────────────────────────────────────────────

  function showToast(msg, tipo = 'ok') {
    toastMsg = msg; toastTipo = tipo
    setTimeout(() => toastMsg = '', 3000)
  }

  function abrirForm() {
    if ($usuarioSuspendido) { showToast('Tu cuenta está suspendida — no podés cargar precios', 'err'); return }
    mostrarForm    = true
    paso           = 1
    busquedaProd   = ''
    productoSel    = null
    sugerencias    = []
    modoNuevo      = false
    nuevaMarca     = ''
    nuevaUnidad    = 'u'
    nuevaCategoria = 'otros'
    precioValor    = ''
    esOferta       = false
    vencimiento    = ''
    if (inputBusqEl) inputBusqEl.placeholder = 'Leche, Tomate, Pan lactal…'
    codigoBarrasActual = null
  }

  function cerrarForm() {
    mostrarForm    = false
    desdeEscaner   = false
    codigoBarrasActual = null
  }

  function abrirEscaner() { mostrarEscaner = true }
  function cerrarEscaner() { mostrarEscaner = false }

  // Producto identificado por OFF → pre-llenar y pasar al paso 2
  function onProductoEscaneado(e) {
    const p = e.detail
    mostrarEscaner = false
    // Buscar si ya existe en el catálogo local
    const existente = $productos.find(
      prod => prod.nombreNorm === p.nombre.trim().toLowerCase()
    )
    if (existente) {
      productoSel  = existente
      busquedaProd = existente.nombre
    } else {
      // Pre-llenar formulario de nuevo producto
      busquedaProd   = p.nombre
      nuevaMarca     = p.marca || ''
      nuevaCategoria = p.categoria || 'otros'
      nuevaUnidad    = p.unidad || 'u'
      modoNuevo      = true
    }
    mostrarForm = true
    paso = productoSel ? 2 : 1
  }

  // Código leído pero sin datos OFF → abrir form con código como nombre
  // ── Voz ──────────────────────────────────────────────────────────────

  async function onResultadoVoz(e) {
    const datos = e.detail  // { producto, marca, unidad, precio, esOferta, textoRaw }

    if (!datos.producto) return  // nada útil

    // Buscar si el producto ya existe en el catálogo local
    const q = datos.producto.toLowerCase()
    const existente = $productos.find(p =>
      p.nombreNorm === q ||
      p.nombre.toLowerCase().includes(q) ||
      q.includes(p.nombre.toLowerCase())
    )

    if (existente) {
      productoSel  = existente
      busquedaProd = existente.nombre
      paso = 2
    } else {
      busquedaProd   = datos.producto
      nuevaMarca     = datos.marca     || ''
      nuevaUnidad    = datos.unidad    || 'u'
      nuevaCategoria = 'otros'
      modoNuevo      = true
      paso = 1
    }

    // Si además viene el precio → rellenar paso 2 directamente
    if (datos.precio) {
      precioValor = String(datos.precio)
      esOferta    = datos.esOferta || false
      paso = 2
    }

    // Asegurarse de que el form esté abierto
    mostrarForm = true
  }

  function onErrorVoz(e) {
    // El componente ya muestra el error internamente
  }

    let codigoBarrasActual = null  // código escaneado para asociar al nuevo producto
  let desdeEscaner       = false // indica que el form se abrió desde escaneo sin nombre

  function onCodigoSinProducto(e) {
    const { codigoBarras } = e.detail
    codigoBarrasActual = codigoBarras
    mostrarEscaner = false
    busquedaProd   = ''
    nuevaMarca     = ''
    nuevaCategoria = 'otros'
    nuevaUnidad    = 'u'
    modoNuevo      = true
    desdeEscaner   = true
    mostrarForm    = true
    paso           = 1
    tick().then(() => {
      if (inputBusqEl) {
        inputBusqEl.placeholder = `Código: ${codigoBarras} — escribí el nombre`
        inputBusqEl.focus()
      }
    })
  }

  function seleccionarProducto(p) {
    productoSel  = p
    busquedaProd = p.nombre
    sugerencias  = []
    paso = 2
  }

  async function confirmarProductoNuevo() {
    if (!busquedaProd.trim()) return
    try {
      const p = await buscarOCrearProducto({
        nombre:       busquedaProd,
        marca:        nuevaMarca,
        unidad:       nuevaUnidad,
        categoria:    nuevaCategoria,
        localidad:    localidadId,
        codigoBarras: codigoBarrasActual || null,
      })
      productoSel        = p
      codigoBarrasActual = null  // limpiar después de usar
      desdeEscaner      = false
      paso = 2
    } catch (e) {
      showToast('Error al crear producto: ' + e.message, 'err')
    }
  }

  async function guardarPrecio() {
    if (!precioValor || isNaN(parseFloat(precioValor)) || !productoSel) return
    guardando = true
    try {
      const nuevo = await registrarPrecio({
        comercioId,
        comercioNombre: comercio.nombre,
        localidad:      localidadId,
        productoId:     productoSel.id,
        productoNombre: productoSel.nombre,
        productoUnidad: productoSel.unidad,
        productoCategoria: productoSel.categoria,
        precio:         precioValor,
        esOferta,
        vencimiento:    esOferta && vencimiento ? vencimiento : null,
      })
      // Actualizar store local
      preciosComercio.update(l => {
        const filtered = l.filter(p => p.productoId !== productoSel.id)
        return [...filtered, nuevo].sort((a, b) =>
          (a.productoNombre || '').localeCompare(b.productoNombre || '', 'es')
        )
      })
      showToast('✓ Precio guardado')
      cerrarForm()

      // Si este precio cubre una solicitud pendiente → marcarla como cubierta
      // y actualizar todas las listas de la localidad que tengan ese ítem pendiente
      console.log('[guardarPrecio] solicitudIdActual:', solicitudIdActual, '| localidadId:', localidadId)
      if (solicitudIdActual) {
        marcarSolicitudCubierta(solicitudIdActual, {
          id:        productoSel.id,
          nombre:    productoSel.nombre,
          marca:     productoSel.marca     || '',
          unidad:    productoSel.unidad    || 'u',
          categoria: productoSel.categoria || 'otros',
          localidad: localidadId,
        }).catch(() => {})
        solicitudIdActual = null
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'err')
    } finally {
      guardando = false
    }
  }

  async function handleReportar(precioId) {
    if (yaReportados.has(precioId)) {
      showToast('Ya reportaste este precio', 'err')
      return
    }
    try {
      const total = await reportarPrecioIncorrecto(precioId)
      yaReportados = new Set([...yaReportados, precioId])
      if (total >= 3) {
        preciosComercio.update(l => l.filter(p => p.id !== precioId))
        showToast('Precio removido por múltiples reportes')
      } else {
        showToast(`Precio reportado (${total}/3 para remover)`)
      }
    } catch (e) {
      showToast(e.message, 'err')
    }
  }

  async function handleVerificar(precioId) {
    if (yaConfirmados.has(precioId)) {
      showToast('Ya confirmaste este precio', 'err')
      return
    }
    try {
      await verificarPrecio(precioId)
      yaConfirmados = new Set([...yaConfirmados, precioId])
      preciosComercio.update(l =>
        l.map(p => p.id === precioId
          ? { ...p, totalVerificaciones: (p.totalVerificaciones || 0) + 1 }
          : p
        )
      )
      showToast('✓ Precio confirmado')
    } catch (e) {
      showToast(e.message, 'err')
    }
  }

  function irComparador(productoId) {
    // Codificamos comercioId en la ruta para que el comparador sepa adónde volver
    currentPage.set('comparador:' + productoId + '__' + comercioId)
  }

  function irListaPrecios() {
    // Ir a gestión de listas en lugar de crear una nueva directo
    currentPage.set('gestion-listas:' + comercioId)
  }

  // ── Editar / eliminar precios propios (solo owner) ────────────────────

  let precioEditando   = null   // { id, precio, esOferta, vencimiento }
  let precioEditValor  = ''
  let precioEditOferta = false
  let precioEditVenc   = ''
  let guardandoEdicion = false

  function abrirEdicion(precio) {
    precioEditando   = precio
    precioEditValor  = String(precio.precio)
    precioEditOferta = precio.esOferta || false
    precioEditVenc   = precio.vencimiento || ''
  }

  function cerrarEdicion() {
    precioEditando = null
  }

  async function guardarEdicion() {
    if (!precioEditValor || isNaN(parseFloat(precioEditValor))) return
    guardandoEdicion = true
    try {
      const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
      const { db } = await import('../lib/firebase.js')
      await updateDoc(doc(db, 'precios', precioEditando.id), {
        precio:      parseFloat(precioEditValor),
        esOferta:    precioEditOferta,
        vencimiento: precioEditOferta && precioEditVenc ? precioEditVenc : null,
        editadoEn:   serverTimestamp(),
      })
      preciosComercio.update(l =>
        l.map(p => p.id === precioEditando.id
          ? { ...p,
              precio:      parseFloat(precioEditValor),
              esOferta:    precioEditOferta,
              vencimiento: precioEditOferta && precioEditVenc ? precioEditVenc : null,
            }
          : p
        )
      )
      showToast('✓ Precio actualizado')
      cerrarEdicion()
    } catch (e) {
      showToast('Error: ' + e.message, 'err')
    } finally {
      guardandoEdicion = false
    }
  }

  async function eliminarPrecio(precioId) {
    if (!confirm('¿Eliminar este precio?')) return
    try {
      const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
      const { db } = await import('../lib/firebase.js')
      await updateDoc(doc(db, 'precios', precioId), {
        activo:       false,
        eliminadoEn:  serverTimestamp(),
        eliminadoPor: user?.uid,
      })
      preciosComercio.update(l => l.filter(p => p.id !== precioId))
      showToast('Precio eliminado')
    } catch (e) {
      showToast('Error: ' + e.message, 'err')
    }
  }

  function volver() { currentPage.set('detalle-comercio:' + comercioId) }

  // Auto-foco al input de búsqueda cuando abre el sheet
  let inputBusqEl
  $: if (mostrarForm && paso === 1 && inputBusqEl) {
    tick().then(() => {
      setTimeout(() => inputBusqEl?.focus(), 120)
    })
  }
</script>

<div class="app-shell precios-shell">

  <!-- Header -->
  <header class="precios-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="header-info">
      <h1 class="header-titulo">Precios</h1>
      {#if comercio}<p class="header-sub">{comercio.nombre}</p>{/if}
    </div>
    {#if esComercioOwner || esDedicado}
      <button class="btn-lista-header" on:click={irListaPrecios} title="Cargar lista completa">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="8" y1="6"  x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6"  x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        Lista
      </button>
    {/if}
  </header>

  {#if !navigator.onLine && cacheInfo}
    <div class="cache-banner" role="status">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/>
        <line x1="8" y1="6" x2="8" y2="18"/><line x1="16" y1="2" x2="16" y2="14"/>
      </svg>
      Sin conexión · {cacheInfo}
    </div>
  {:else if !navigator.onLine}
    <div class="cache-banner cache-banner-warn" role="status">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Sin conexión · precios no disponibles offline para este comercio
    </div>
  {/if}

  <main class="precios-main scroll-area">

    {#if cargando}
      <div class="skeleton-group">
        {#each Array(5) as _}
          <div class="skeleton-row"></div>
        {/each}
      </div>

    {:else if error}
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p class="empty-title">{error}</p>
        <button class="btn btn-primary" on:click={volver}>Volver</button>
      </div>

    {:else}

      <!-- Filtro por categoría -->
      {#if $preciosComercio.length > 0}
        <div class="cat-pills">
          <button
            class="cat-pill"
            class:active={filtroCategoria === ''}
            on:click={() => filtroCategoria = ''}
          >Todos</button>
          {#each CATEGORIAS.filter(c => $preciosComercio.some(p => p.productoCategoria === c.id)) as cat}
            <button
              class="cat-pill"
              class:active={filtroCategoria === cat.id}
              on:click={() => filtroCategoria = cat.id}
            >
              {cat.emoji} {cat.label}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Lista de precios -->
      {#if listaCategorias.length === 0}
        <div class="empty-state">
          <div class="empty-icon">🏷️</div>
          <p class="empty-title">Sin precios registrados</p>
          <p class="empty-sub">¡Sé el primero en cargar precios de este comercio!</p>
        </div>
      {:else}
        {#each listaCategorias as [catId, items]}
          <div class="precio-grupo">
            <div class="grupo-header">
              <span class="grupo-emoji">{catEmoji(catId)}</span>
              <span class="grupo-label">{catLabel(catId)}</span>
            </div>

            {#each items as precio (precio.id)}
              {@const fresco  = freshness(precio)}
              {@const esMio   = esComercioOwner && precio.cargadoPor === user?.uid}
              <div class="precio-card"
                class:oferta={precio.esOferta}
                class:precio-propio={esMio}
              >

                <!-- Badge oferta o "Mi precio" -->
                {#if esMio}
                  <div class="propio-badge">✎ Mi precio</div>
                {:else if precio.esOferta}
                  <div class="oferta-badge">🔥 Oferta</div>
                {/if}

                <div class="precio-top">
                  <div class="precio-producto">
                    <span class="precio-nombre">{precio.productoNombre}</span>
                    {#if precio.productoMarca}
                      <span class="precio-marca">{precio.productoMarca}</span>
                    {/if}
                    {#if precio.productoUnidad && precio.productoUnidad !== 'u'}
                      <span class="precio-unidad">× {precio.productoUnidad}</span>
                    {/if}
                  </div>
                  <div class="precio-valor">{formatPrecio(precio.precio)}</div>
                </div>

                <div class="precio-meta">
                  <span
                    class="freshness-chip"
                    class:fresco={fresco === 'fresco'}
                    class:valido={fresco === 'valido'}
                    class:viejo={fresco === 'viejo'}
                  >{freshnessLabel(precio)}</span>

                  {#if precio.totalVerificaciones > 0}
                    <span class="verif-chip">✓ {precio.totalVerificaciones}</span>
                  {/if}

                  {#if !esMio && precio.cargadoPor}
                    <span class="comunidad-chip">comunidad</span>
                  {/if}
                </div>

                <!-- Acciones: owner ve editar/eliminar en sus precios -->
                {#if esMio}
                  <div class="precio-acciones">
                    <button class="accion-btn editar-btn"
                      on:click={() => abrirEdicion(precio)}
                      title="Editar precio">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      Editar
                    </button>

                    <button class="accion-btn comparar-btn"
                      on:click={() => irComparador(precio.productoId)}
                      title="Comparar en otros comercios">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                      </svg>
                      Comparar
                    </button>

                    <button class="accion-btn eliminar-btn"
                      on:click={() => eliminarPrecio(precio.id)}
                      title="Eliminar precio">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                      Eliminar
                    </button>
                  </div>

                {:else}
                  <!-- Acciones comunidad: confirmar, comparar, reportar -->
                  <div class="precio-acciones">
                    <button class="accion-btn verif-btn"
                      class:ya-confirmado={yaConfirmados.has(precio.id)}
                      on:click={() => handleVerificar(precio.id)}
                      title={yaConfirmados.has(precio.id) ? 'Ya confirmaste este precio' : 'Confirmar precio'}
                      disabled={yaConfirmados.has(precio.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {yaConfirmados.has(precio.id) ? 'Confirmado' : 'Confirmar'}
                    </button>

                    <button class="accion-btn comparar-btn"
                      on:click={() => irComparador(precio.productoId)}
                      title="Comparar en otros comercios">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                      </svg>
                      Comparar
                    </button>

                    <button class="accion-btn report-btn"
                      class:ya-reportado={yaReportados.has(precio.id)}
                      on:click={() => handleReportar(precio.id)}
                      title={yaReportados.has(precio.id) ? 'Ya reportaste este precio' : 'Reportar precio incorrecto'}
                      disabled={yaReportados.has(precio.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      {yaReportados.has(precio.id) ? 'Reportado' : 'Incorrecto'}
                    </button>
                  </div>
                {/if}

              </div>
            {/each}
          </div>
        {/each}
      {/if}

      <div style="height: 100px"></div>
    {/if}
  </main>

</div><!-- /app-shell -->

{#if toastMsg}
  <div class="toast" class:toast-err={toastTipo === 'err'} role="status">{toastMsg}</div>
{/if}

<!-- FAB: fuera del app-shell -->
{#if !cargando && !error && !mostrarForm && !mostrarEscaner}
  <div class="fab-grupo">
    <button class="fab-cargar" on:click={abrirForm} aria-label="Cargar precio">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5"  y1="12" x2="19" y2="12"/>
      </svg>
      Cargar precio
    </button>
    <button class="fab-icono" on:click={abrirEscaner} aria-label="Escanear código de barras" title="Escanear código">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M3 9V5h4M21 9V5h-4M3 15v4h4M21 15v4h-4"/>
        <line x1="7"  y1="12" x2="7.01"  y2="12" stroke-width="3"/>
        <line x1="11" y1="12" x2="11.01" y2="12" stroke-width="3"/>
        <line x1="15" y1="12" x2="17"    y2="12" stroke-width="3"/>
      </svg>
    </button>
    <!-- Botón de voz: usa BotonVoz pero estilizado como FAB icono -->
    <div class="fab-voz-wrap">
      <BotonVoz
        on:resultado={onResultadoVoz}
        on:error={onErrorVoz}
      />
    </div>
  </div>
{/if}

<!-- ── Bottom sheet: FUERA del app-shell para evitar overflow:hidden ── -->
{#if mostrarForm}
    <div class="sheet-overlay" use:portal on:click={cerrarForm} role="presentation"></div>
    <div class="bottom-sheet" use:portal role="dialog" aria-label="Cargar precio">

      <!-- Cabecera fija -->
      <div class="sheet-top">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <div class="sheet-paso-info">
            <span class="sheet-paso-num">Paso {paso} de 2</span>
            <h2 class="sheet-titulo">
              {paso === 1 ? 'Buscá el producto' : 'Ingresá el precio'}
            </h2>
          </div>
          <button class="sheet-cerrar" on:click={cerrarForm} aria-label="Cerrar">✕</button>
        </div>
      </div>

      <!-- Cuerpo scrollable -->
      <div class="sheet-scroll">

        <!-- Paso 1: buscar/crear producto -->
        {#if paso === 1}

          <div class="form-group">
            <div class="search-row">
              <div class="search-input-wrap" style="flex:1">
                <svg class="search-icon-inner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  id="busq-prod"
                  type="text"
                  class="form-input search-prod-input"
                  placeholder="Leche, Tomate, Pan lactal…"
                  bind:value={busquedaProd}
                  bind:this={inputBusqEl}
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="words"
                />
                {#if busquedaProd}
                  <button class="search-clear-btn" on:click={() => busquedaProd = ''} tabindex="-1">✕</button>
                {/if}
              </div>
              <BotonVoz
                on:resultado={onResultadoVoz}
                on:error={onErrorVoz}
              />
            </div>
            <p class="form-hint" style="margin-top:6px">
              Escribí el nombre o usá el <strong>🎤 micrófono</strong> para dictar el producto y el precio juntos.
            </p>
          </div>

          <!-- Sugerencias del catálogo -->
          {#if sugerencias.length > 0}
            <div class="sugerencias">
              {#each sugerencias as sug}
                <button class="sugerencia-item" on:click={() => seleccionarProducto(sug)}>
                  <span class="sug-emoji">{catEmoji(sug.categoria)}</span>
                  <div class="sug-info">
                    <span class="sug-nombre">{sug.nombre}</span>
                    {#if sug.marca}<span class="sug-marca">{sug.marca}</span>{/if}
                  </div>
                  <span class="sug-unidad">{sug.unidad}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-light)" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              {/each}
            </div>
          {/if}

          <!-- Producto no encontrado → crear nuevo -->
          {#if modoNuevo && (busquedaProd.length >= 2 || desdeEscaner)}
            <div class="nuevo-producto-form">
              <div class="nuevo-header">
                <span class="nuevo-icon">✨</span>
                <div>
                  <p class="nuevo-titulo">Producto nuevo</p>
                  <p class="nuevo-nombre-preview">"{busquedaProd}"</p>
                </div>
              </div>

              <div class="nuevo-grid">
                <div class="form-group">
                  <label class="form-label" for="nueva-marca">Marca <span style="font-weight:400;opacity:.6">(opcional)</span></label>
                  <input id="nueva-marca" type="text" class="form-input" placeholder="La Serenísima…" bind:value={nuevaMarca}/>
                </div>
                <div class="form-group">
                  <label class="form-label" for="nueva-unidad">Unidad</label>
                  <select id="nueva-unidad" class="form-select" bind:value={nuevaUnidad}>
                    {#each UNIDADES as u}<option value={u.id}>{u.label}</option>{/each}
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="nueva-cat">Categoría</label>
                <select id="nueva-cat" class="form-select" bind:value={nuevaCategoria}>
                  {#each CATEGORIAS as c}<option value={c.id}>{c.emoji} {c.label}</option>{/each}
                </select>
              </div>
            </div>
          {/if}

        <!-- Paso 2: ingresar precio -->
        {:else}

          <!-- Producto elegido -->
          <div class="producto-sel-chip">
            <span class="chip-emoji">{catEmoji(productoSel?.categoria)}</span>
            <div class="chip-data">
              <span class="chip-nombre">{productoSel?.nombre}</span>
              {#if productoSel?.marca}<span class="chip-marca">{productoSel.marca}</span>{/if}
            </div>
            <button class="chip-cambiar" on:click={() => { paso = 1; productoSel = null }}>
              cambiar
            </button>
          </div>

          <!-- Input precio grande -->
          <div class="form-group">
            <label class="form-label" for="precio-val">¿Cuánto cuesta?</label>
            <div class="precio-input-wrap">
              <span class="peso-symbol">$</span>
              <input
                id="precio-val"
                type="number"
                inputmode="decimal"
                class="form-input precio-input"
                placeholder="0"
                bind:value={precioValor}
                min="0"
                step="0.5"
              />
            </div>
          </div>

          <!-- Toggle oferta -->
          <label class="oferta-toggle">
            <input type="checkbox" bind:checked={esOferta}/>
            <span class="toggle-track"></span>
            <span class="toggle-label">🔥 Es oferta o promoción</span>
          </label>

          {#if esOferta}
            <div class="form-group" style="margin-top:14px">
              <label class="form-label" for="venc">Válido hasta <span style="font-weight:400;opacity:.6">(opcional)</span></label>
              <input
                id="venc"
                type="date"
                class="form-input"
                bind:value={vencimiento}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          {/if}

        {/if}

        <!-- Espaciado para que el footer no tape contenido -->
        <div style="height: 16px"></div>
      </div>

      <!-- Footer fijo con el botón de acción — SIEMPRE visible -->
      <div class="sheet-footer">
        {#if paso === 1}
          {#if modoNuevo && busquedaProd.length >= 2}
            <button class="btn btn-primary btn-full" on:click={confirmarProductoNuevo}>
              Crear y continuar →
            </button>
          {:else}
            <p class="footer-hint">
              {#if busquedaProd.length < 2}
                Escribí el nombre del producto para buscar
              {:else if sugerencias.length > 0}
                Tocá un producto de la lista
              {:else}
                Seguí escribiendo…
              {/if}
            </p>
          {/if}
        {:else}
          <button
            class="btn btn-primary btn-full"
            on:click={guardarPrecio}
            disabled={!precioValor || guardando}
          >
            {guardando ? 'Guardando…' : '✓ Guardar precio'}
          </button>
        {/if}
      </div>

    </div>
{/if}

{#if precioEditando}
  <div class="sheet-overlay" use:portal on:click={cerrarEdicion} role="presentation"></div>
  <div class="bottom-sheet sheet-edicion" use:portal role="dialog" aria-label="Editar precio">
    <div class="sheet-top">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div class="sheet-paso-info">
          <span class="sheet-paso-num">Editando</span>
          <h2 class="sheet-titulo">{precioEditando.productoNombre}</h2>
        </div>
        <button class="sheet-cerrar" on:click={cerrarEdicion} aria-label="Cerrar">✕</button>
      </div>
    </div>

    <div class="sheet-scroll">
      <div class="form-group">
        <label class="form-label" for="edit-precio">Nuevo precio ($)</label>
        <div class="precio-input-wrap">
          <span class="peso-symbol">$</span>
          <input
            id="edit-precio"
            type="number"
            inputmode="decimal"
            class="form-input precio-input"
            placeholder="0"
            bind:value={precioEditValor}
            min="0" step="0.5"
          />
        </div>
      </div>

      <label class="oferta-toggle">
        <input type="checkbox" bind:checked={precioEditOferta}/>
        <span class="toggle-track"></span>
        <span class="toggle-label">🔥 Es oferta / promoción</span>
      </label>

      {#if precioEditOferta}
        <div class="form-group" style="margin-top:14px">
          <label class="form-label" for="edit-venc">Válido hasta (opcional)</label>
          <input
            id="edit-venc"
            type="date"
            class="form-input"
            bind:value={precioEditVenc}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
      {/if}

      <div style="height:8px"></div>
    </div>

    <div class="sheet-footer">
      <button
        class="btn btn-primary btn-full"
        on:click={guardarEdicion}
        disabled={!precioEditValor || guardandoEdicion}
      >
        {guardandoEdicion ? 'Guardando…' : '✓ Guardar cambio'}
      </button>
    </div>
  </div>
{/if}

{#if mostrarEscaner}
  <EscanerCodigo
    catalogoLocal={$productos}
    on:encontrado={onProductoEscaneado}
    on:noEncontrado={onCodigoSinProducto}
    on:cancelar={cerrarEscaner}
  />
{/if}

<BottomNav active="buscar" />

<style>
  .precios-shell { padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px)); }

  /* Header */
  .precios-header {
    position: sticky; top: 0; z-index: 50;
    background: var(--c-surface);
    border-bottom: 1px solid var(--c-border);
    padding: 14px 16px;
    display: flex; align-items: center; gap: 10px;
  }
  .btn-volver {
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: var(--c-surface-2);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; color: var(--c-text);
  }
  .header-info { flex: 1; min-width: 0; }
  .header-titulo { font-family: var(--f-brand); font-size: 18px; color: var(--c-text); }
  .header-sub { font-size: 12px; color: var(--c-text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btn-lista-header {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 12px; border-radius: var(--r-full);
    border: 1.5px solid var(--c-primary); background: transparent;
    color: var(--c-primary); font-size: 13px; font-weight: 700;
    cursor: pointer; white-space: nowrap;
  }

  /* Main */
  .precios-main { padding: 12px 16px; }

  /* Filtro pills */
  .cat-pills {
    display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px;
    -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .cat-pills::-webkit-scrollbar { display: none; }
  .cat-pill {
    flex-shrink: 0; padding: 6px 14px; border-radius: var(--r-full);
    border: 1.5px solid var(--c-border); background: var(--c-surface);
    font-size: 12px; font-weight: 600; color: var(--c-text-mid);
    cursor: pointer; transition: all 0.15s;
  }
  .cat-pill.active {
    background: var(--c-primary); border-color: var(--c-primary);
    color: white;
  }

  /* Grupos */
  .precio-grupo { margin-bottom: 20px; }
  .grupo-header {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 0 10px;
  }
  .grupo-emoji { font-size: 16px; }
  .grupo-label { font-size: 13px; font-weight: 700; color: var(--c-text-mid); text-transform: uppercase; letter-spacing: 0.06em; }

  /* Precio card */
  .precio-card {
    background: var(--c-surface); border-radius: var(--r-lg);
    border: 1px solid var(--c-border); padding: 14px;
    margin-bottom: 8px; position: relative; overflow: hidden;
  }
  .precio-card.oferta { border-color: var(--c-accent); }
  .oferta-badge {
    position: absolute; top: 0; right: 0;
    background: var(--c-accent); color: white;
    font-size: 10px; font-weight: 700; padding: 3px 10px;
    border-radius: 0 var(--r-lg) 0 var(--r-md);
  }
  .precio-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
  .precio-producto { flex: 1; min-width: 0; }
  .precio-nombre { font-weight: 700; font-size: 15px; color: var(--c-text); display: block; }
  .precio-unidad { font-size: 11px; color: var(--c-text-light); }
  .precio-marca  { font-size: 11px; color: var(--c-text-light); font-style: italic; display: block; margin-top: 1px; }
  .precio-valor { font-family: var(--f-brand); font-size: 20px; font-weight: 700; color: var(--c-primary); white-space: nowrap; }

  .precio-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .freshness-chip {
    font-size: 11px; font-weight: 600; padding: 2px 8px;
    border-radius: var(--r-full);
  }
  .freshness-chip.fresco  { background: #D1FAE5; color: #059669; }
  .freshness-chip.valido  { background: #FEF3C7; color: #D97706; }
  .freshness-chip.viejo   { background: #FEE2E2; color: #DC2626; }
  .verif-chip { font-size: 11px; color: var(--c-primary); font-weight: 600; }

  .precio-acciones { display: flex; gap: 6px; }
  .accion-btn {
    flex: 1; padding: 7px 8px; border-radius: var(--r-md);
    border: 1.5px solid; font-size: 11px; font-weight: 700;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;
    transition: all 0.15s; background: transparent;
  }
  .accion-btn:active { transform: scale(0.95); }
  .verif-btn   { border-color: #059669; color: #059669; }
  .verif-btn.ya-confirmado { background: #D1FAE5; color: #065F46; opacity: 0.7; cursor: default; }
  .comparar-btn { border-color: var(--c-primary); color: var(--c-primary); }
  .report-btn  { border-color: #DC2626; color: #DC2626; }
  .report-btn.ya-reportado { background: #FEE2E2; color: #991B1B; opacity: 0.7; cursor: default; }
  .verif-btn:hover   { background: #D1FAE5; }
  .comparar-btn:hover { background: rgba(27,107,58,0.08); }
  .report-btn:hover  { background: #FEE2E2; }

  /* FAB grupo */
  .fab-grupo {
    position: fixed;
    bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 16px);
    left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 10px;
    width: calc(var(--app-width) - 48px); max-width: 380px;
    z-index: 60;
  }
  .fab-cargar {
    flex: 1;
    background: var(--c-primary); color: white;
    border: none; border-radius: var(--r-full);
    padding: 14px 20px; font-size: 15px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    box-shadow: var(--s-lg); cursor: pointer;
    transition: all 0.18s;
    -webkit-tap-highlight-color: transparent;
  }
  .fab-cargar:active { transform: scale(0.97); }
  .fab-icono {
    width: 52px; height: 52px; border-radius: var(--r-full);
    background: var(--c-surface); color: var(--c-primary);
    border: 2px solid var(--c-primary);
    display: flex; align-items: center; justify-content: center;
    box-shadow: var(--s-md); cursor: pointer;
    transition: all 0.18s; flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
  }
  .fab-icono:active { transform: scale(0.95); }
  .fab-icono:hover  { background: rgba(27,107,58,0.06); }

  /* Wrapper del BotonVoz en el FAB: iguala el tamaño del fab-icono */
  .fab-voz-wrap :global(.btn-voz) {
    width: 52px !important;
    height: 52px !important;
    border-width: 2px !important;
    border-color: var(--c-primary) !important;
    color: var(--c-primary) !important;
    box-shadow: var(--s-md);
  }
  .fab-voz-wrap :global(.btn-voz.escuchando) {
    border-color: #DC2626 !important;
  }
  /* Ocultar el feedback del BotonVoz cuando está en el FAB */
  .fab-voz-wrap :global(.voz-feedback) { display: none; }

  /* Search row: input + botón de voz en línea */
  .search-row {
    display: flex; align-items: center; gap: 8px;
  }

  /* ── Bottom sheet ─────────────────────────────────────────── */
  .sheet-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45);
    z-index: 9998;
    animation: fadeOverlay 0.2s ease;
  }
  @keyframes fadeOverlay { from{opacity:0} to{opacity:1} }

  .bottom-sheet {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 430px;
    background: var(--c-surface);
    border-radius: 20px 20px 0 0;
    z-index: 9999;
    box-shadow: 0 -8px 40px rgba(0,0,0,0.18);
    animation: sheetUp 0.28s cubic-bezier(0.34, 1.4, 0.64, 1);
    /* SIN flex, SIN max-height en el contenedor — control explícito por zona */
  }
  @keyframes sheetUp {
    from { transform: translateX(-50%) translateY(100%); }
    to   { transform: translateX(-50%) translateY(0); }
  }

  /* Cabecera: siempre visible, no scrollea */
  .sheet-top {
    padding: 12px 20px 0;
  }
  .sheet-handle {
    width: 40px; height: 4px; background: var(--c-border);
    border-radius: 2px; margin: 0 auto 14px;
  }
  .sheet-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding-bottom: 16px; border-bottom: 1px solid var(--c-border);
  }
  .sheet-paso-info {}
  .sheet-paso-num {
    display: block; font-size: 11px; font-weight: 700;
    color: var(--c-text-light); text-transform: uppercase;
    letter-spacing: 0.08em; margin-bottom: 2px;
  }
  .sheet-titulo { font-family: var(--f-brand); font-size: 20px; color: var(--c-text); }
  .sheet-cerrar {
    background: var(--c-surface-2); border: none; border-radius: 50%;
    width: 32px; height: 32px; font-size: 14px; color: var(--c-text-light);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 2px;
  }

  /* Zona scrollable: altura explícita, nunca más del 55% del viewport */
  .sheet-scroll {
    padding: 18px 20px 8px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    max-height: 55vh;
  }

  /* Footer: siempre visible, debajo del scroll */
  .sheet-footer {
    padding: 12px 20px;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);
    border-top: 1px solid var(--c-border);
    background: var(--c-surface);
    border-radius: 0 0 0 0;
  }
  .footer-hint {
    text-align: center; font-size: 13px; color: var(--c-text-light);
    padding: 8px 0; font-style: italic;
  }

  /* ── Input de búsqueda de producto ── */
  .search-input-wrap {
    position: relative; display: flex; align-items: center;
  }
  .search-icon-inner {
    position: absolute; left: 14px; color: var(--c-text-light); pointer-events: none;
  }
  .search-prod-input {
    padding-left: 44px !important;
    padding-right: 40px;
    font-size: 16px !important;
    background: var(--c-surface-2) !important;
    border-color: var(--c-border) !important;
  }
  .search-prod-input:focus {
    background: var(--c-surface) !important;
    border-color: var(--c-primary) !important;
  }
  .search-clear-btn {
    position: absolute; right: 12px; background: none; border: none;
    color: var(--c-text-light); cursor: pointer; font-size: 13px; padding: 6px;
  }

  /* Sugerencias */
  .sugerencias { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
  .sugerencia-item {
    display: flex; align-items: center; gap: 10px; padding: 11px 12px;
    background: var(--c-surface-2); border-radius: var(--r-md);
    border: none; cursor: pointer; text-align: left; transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .sugerencia-item:active { background: var(--c-border); }
  .sug-emoji  { font-size: 16px; flex-shrink: 0; }
  .sug-info   { flex: 1; min-width: 0; }
  .sug-nombre { display: block; font-weight: 600; font-size: 14px; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sug-marca  { display: block; font-size: 11px; color: var(--c-text-light); }
  .sug-unidad { font-size: 11px; color: var(--c-text-mid); background: var(--c-surface); border-radius: 4px; padding: 2px 7px; flex-shrink: 0; }

  /* Nuevo producto */
  .nuevo-producto-form {
    background: var(--c-surface-2); border-radius: var(--r-lg);
    border: 1.5px dashed var(--c-accent); padding: 14px; margin-top: 10px;
  }
  .nuevo-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .nuevo-icon  { font-size: 20px; }
  .nuevo-titulo { font-size: 11px; font-weight: 700; color: var(--c-text-mid); text-transform: uppercase; letter-spacing: 0.06em; }
  .nuevo-nombre-preview { font-size: 15px; font-weight: 700; color: var(--c-text); }
  .nuevo-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* Producto seleccionado chip */
  .producto-sel-chip {
    display: flex; align-items: center; gap: 10px;
    background: rgba(27,107,58,0.08); border-radius: var(--r-md);
    border: 1.5px solid rgba(27,107,58,0.2);
    padding: 11px 14px; margin-bottom: 20px;
  }
  .chip-emoji  { font-size: 20px; }
  .chip-data   { flex: 1; min-width: 0; }
  .chip-nombre { display: block; font-weight: 700; font-size: 15px; color: var(--c-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip-marca  { display: block; font-size: 11px; color: var(--c-text-light); }
  .chip-cambiar { background: none; border: none; font-size: 12px; color: var(--c-text-light); text-decoration: underline; cursor: pointer; padding: 4px 0; flex-shrink: 0; }

  /* Precio input */
  .precio-input-wrap { position: relative; }
  .peso-symbol {
    position: absolute; left: 15px; top: 50%; transform: translateY(-50%);
    font-size: 18px; font-weight: 700; color: var(--c-text-mid); pointer-events: none;
  }
  .precio-input { padding-left: 34px !important; font-size: 28px !important; font-weight: 700; letter-spacing: -0.02em; }

  /* Toggle oferta */
  .oferta-toggle {
    display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 12px 0;
  }
  .oferta-toggle input { display: none; }
  .toggle-track {
    width: 44px; height: 24px; border-radius: 12px;
    background: var(--c-border); position: relative; transition: background 0.2s; flex-shrink: 0;
  }
  .toggle-track::after {
    content: ''; position: absolute; top: 3px; left: 3px;
    width: 18px; height: 18px; border-radius: 50%;
    background: white; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .oferta-toggle input:checked ~ .toggle-track { background: var(--c-accent); }
  .oferta-toggle input:checked ~ .toggle-track::after { transform: translateX(20px); }
  .toggle-label { font-size: 14px; font-weight: 600; color: var(--c-text); }

  /* Skeleton */
  .skeleton-group { padding: 8px 0; }
  .skeleton-row { height: 80px; background: var(--c-border); border-radius: var(--r-lg); margin-bottom: 8px; animation: pulse 1.4s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

  /* Empty state */
  .empty-state { text-align: center; padding: 60px 24px; }
  .empty-icon  { font-size: 48px; margin-bottom: 16px; }
  .empty-title { font-family: var(--f-brand); font-size: 20px; color: var(--c-text); margin-bottom: 8px; }
  .empty-sub   { font-size: 14px; color: var(--c-text-light); line-height: 1.5; }

  /* Toast */
  .toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: var(--c-text); color: white;
    padding: 10px 20px; border-radius: var(--r-full);
    font-size: 13px; font-weight: 600;
    box-shadow: var(--s-md); z-index: 200;
    animation: fadeIn 0.2s ease;
    white-space: nowrap;
  }
  .toast.toast-err { background: var(--c-error); }

  /* Banner de caché offline */
  .cache-banner {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 16px; font-size: 12px; font-weight: 600;
    background: rgba(27,107,58,0.08); color: var(--c-primary);
    border-bottom: 1px solid rgba(27,107,58,0.15);
  }
  .cache-banner-warn {
    background: rgba(245,163,33,0.1); color: #92400E;
    border-bottom-color: rgba(245,163,33,0.3);
  }

  /* Precio propio del dueño */
  .precio-card.precio-propio {
    border-color: rgba(27,107,58,0.4);
    background: rgba(27,107,58,0.03);
  }
  .propio-badge {
    position: absolute; top: 0; right: 0;
    background: var(--c-primary); color: white;
    font-size: 10px; font-weight: 700; padding: 3px 10px;
    border-radius: 0 var(--r-lg) 0 var(--r-md);
  }
  .comunidad-chip {
    font-size: 10px; color: var(--c-text-light);
    background: var(--c-surface-2); padding: 2px 7px;
    border-radius: var(--r-full); font-weight: 600;
  }

  /* Botones editar / eliminar */
  .editar-btn   { border-color: var(--c-primary); color: var(--c-primary); }
  .eliminar-btn { border-color: #DC2626; color: #DC2626; }
  .editar-btn:hover   { background: rgba(27,107,58,0.08); }
  .eliminar-btn:hover { background: #FEE2E2; }

</style>