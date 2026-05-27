<script>
  import { onMount } from 'svelte'
  import { currentPage, currentUser, userProfile, normalizarAlias } from '../stores/auth.js'
  import {
    notificaciones, totalNoLeidas,
    cargarNotificaciones, marcarLeida, marcarTodasLeidas,
    TIPOS_NOTIF
  } from '../stores/notificaciones.js'
  import {
    collection, getDocs, query, where, limit, orderBy,
    doc, updateDoc, serverTimestamp, writeBatch, setDoc
  } from 'firebase/firestore'
  import { db } from '../lib/firebase.js'
  import { getNombreProvincia, resolverNombresLocalidad, formatLocalidadProvincia } from '../lib/georef.js'
  import { appConfig, cargarConfig, guardarConfig } from '../stores/config.js'
  import { generarCredencial } from '../stores/comercios.js'
  import { generarPDFCredencial } from '../lib/credencial.js'

  $: if ($userProfile && $userProfile.rol !== 'admin') currentPage.set('home')

  // ── Estado global ─────────────────────────────────────────────────────
  let seccion          = 'notificaciones'
  let cargando         = false
  let offline          = false

  // ── Selector global de localidad ──────────────────────────────────────
  let localidadGlobal  = ''
  let localidadesAdmin = []
  let nombresLocalidad = new Map()

  // ── Datos por sección ─────────────────────────────────────────────────
  let comercios        = []
  let filtroEstado     = 'pendiente'
  let filtroRol        = ''

  let usuarios         = []
  let busquedaUsuario  = ''

  let precios          = []

  // ── Configuración ─────────────────────────────────────────────────────────
  let cfgRestriccion    = false
  let cfgLocalidades    = []
  let cfgNuevaLocalidad = ''
  let guardandoCfg      = false

  async function cargarConfigAdmin() {
    if (!$appConfig) await cargarConfig()
    cfgRestriccion = $appConfig?.restriccionActiva || false
    cfgLocalidades = [...($appConfig?.localidadesHabilitadas || [])]
  }

  async function guardarConfigAdmin() {
    guardandoCfg = true
    try {
      const mapNombres = await resolverNombresLocalidad(cfgLocalidades)
      await guardarConfig({
        restriccionActiva:       cfgRestriccion,
        localidadesHabilitadas:  cfgLocalidades,
      })
      mostrarToast('Configuración guardada')
    } catch (e) {
      mostrarToast('Error: ' + e.message)
    } finally {
      guardandoCfg = false
    }
  }

  function agregarLocalidadCfg() {
    const id = cfgNuevaLocalidad.trim()
    if (!id || cfgLocalidades.includes(id)) return
    cfgLocalidades = [...cfgLocalidades, id]
    cfgNuevaLocalidad = ''
    resolverNombresLocalidad([id]).then(map => {
      nombresLocalidad = new Map([...nombresLocalidad, ...map])
    })
  }

  function quitarLocalidadCfg(id) {
    cfgLocalidades = cfgLocalidades.filter(l => l !== id)
  }

  // ── Migración alias_index ─────────────────────────────────────────────────
  // Pobla alias_index con los alias existentes en la colección usuarios.
  // Ejecutar una vez después de activar la verificación de unicidad.
  // Operación idempotente: puede repetirse sin daño.
  let migrandoAlias = false
  let migracionMsg  = ''

  async function migrarAliasIndex() {
    if (!confirm('¿Poblar alias_index con todos los alias existentes?\nEsta operación es segura y puede repetirse.')) return
    migrandoAlias = true
    migracionMsg  = ''
    try {
      const snap = await getDocs(collection(db, 'usuarios'))

      // Firestore batch: máximo 500 escrituras por lote
      let batch  = writeBatch(db)
      let enLote = 0
      let total  = 0

      for (const d of snap.docs) {
        const data = d.data()
        if (!data.alias) continue

        const clave = normalizarAlias(data.alias)
        batch.set(doc(db, 'alias_index', clave), {
          uid:           d.id,
          alias:         data.alias,
          actualizadoEn: new Date().toISOString(),
        })
        enLote++
        total++

        if (enLote === 499) {
          await batch.commit()
          batch  = writeBatch(db)
          enLote = 0
        }
      }

      if (enLote > 0) await batch.commit()

      migracionMsg = `✓ ${total} alias indexados correctamente.`
    } catch (e) {
      migracionMsg = `Error: ${e.message}`
    } finally {
      migrandoAlias = false
    }
  }

  // ── Sugerencias ───────────────────────────────────────────────────────────
  let sugerencias      = []
  let filtroSugCat     = ''
  let filtroSugLeida   = 'todas'

  let comercioCredencial = null
  let generandoPDF       = false
  let codigoGenerado     = null
  let busquedaComercio   = ''

  // ── Reactivos derivados ───────────────────────────────────────────────
  $: comerciosFiltrados = comercios
    .filter(c => filtroEstado === 'todos' || c.estado === filtroEstado)
    .sort((a, b) => (b.creadoEn?.toDate?.() || 0) - (a.creadoEn?.toDate?.() || 0))

  $: aliasMap = new Map(usuarios.map(u => [u.id, u.alias || u.email || u.id]))

  function aliasReclamador(uid) {
    if (!uid) return null
    return aliasMap.get(uid) || uid
  }

  // ── Sheet de usuario ──────────────────────────────────────────────────────
  let usuarioSheet   = null
  let sheetCambiando = false

  function abrirSheetUsuario(uid) {
    if (!uid) return
    const u = usuarios.find(u => u.id === uid)
    if (u) { usuarioSheet = u; return }
    import('firebase/firestore').then(({ getDoc, doc }) => {
      getDoc(doc(db, 'usuarios', uid)).then(snap => {
        if (snap.exists()) usuarioSheet = { id: snap.id, ...snap.data() }
      })
    })
  }

  function cerrarSheetUsuario() { usuarioSheet = null }

  async function sheetCambiarRol() {
    if (!usuarioSheet) return
    const roles = ['usuario', 'dedicado', 'comercio', 'admin']
    const nuevoRol = prompt(`Rol actual: ${usuarioSheet.rol || 'usuario'}\nNuevo rol:\n${roles.join(' / ')}`)
    if (!nuevoRol || !roles.includes(nuevoRol)) return
    sheetCambiando = true
    await updateDoc(doc(db, 'usuarios', usuarioSheet.id), { rol: nuevoRol })
    usuarioSheet = { ...usuarioSheet, rol: nuevoRol }
    usuarios = usuarios.map(u => u.id === usuarioSheet.id ? { ...u, rol: nuevoRol } : u)
    mostrarToast('Rol actualizado')
    sheetCambiando = false
  }

  async function sheetCambiarEstado() {
    if (!usuarioSheet) return
    const estados = ['activo', 'suspendido', 'bloqueado']
    const nuevo = prompt(`Estado actual: ${usuarioSheet.estado || 'activo'}\nNuevo estado:\n${estados.join(' / ')}`)
    if (!nuevo || !estados.includes(nuevo)) return
    sheetCambiando = true
    await updateDoc(doc(db, 'usuarios', usuarioSheet.id), { estado: nuevo })
    usuarioSheet = { ...usuarioSheet, estado: nuevo }
    usuarios = usuarios.map(u => u.id === usuarioSheet.id ? { ...u, estado: nuevo } : u)
    mostrarToast(`Usuario ${nuevo}`)
    sheetCambiando = false
  }

  function formatFechaSheet(ts) {
    if (!ts) return '—'
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' })
  }

  $: usuariosFiltrados = usuarios
    .filter(u => !filtroRol || (u.rol || 'usuario') === filtroRol)
    .filter(u => !busquedaUsuario ||
      u.alias?.toLowerCase().includes(busquedaUsuario.toLowerCase()) ||
      u.email?.toLowerCase().includes(busquedaUsuario.toLowerCase())
    )
    .sort((a, b) => (a.alias || '').localeCompare(b.alias || '', 'es'))

  // ── Conexión ──────────────────────────────────────────────────────────
  async function checkConexion() {
    try {
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), 3000)
      await fetch('https://www.google.com/generate_204', { mode:'no-cors', signal:ctrl.signal, cache:'no-store' })
      offline = false
    } catch { offline = true }
  }

  // ── Mount ─────────────────────────────────────────────────────────────
  onMount(async () => {
    checkConexion()
    window.addEventListener('online',  checkConexion)
    window.addEventListener('offline', () => offline = true)
    await cargarNotificaciones()
    cargarLocalidades()
  })

  // ── Localidades ───────────────────────────────────────────────────────
  async function cargarLocalidades() {
    try {
      const snap = await getDocs(collection(db, 'comercios'))
      const set  = new Set()
      snap.docs.forEach(d => { const loc = d.data().localidad; if (loc) set.add(loc) })
      const ids = Array.from(set).sort()
      localidadesAdmin = ids
      if (ids.length) {
        const map = await resolverNombresLocalidad(ids)
        nombresLocalidad = new Map([...nombresLocalidad, ...map])
      }
    } catch {}
  }

  // Cuando cambia la localidad global → recargar la sección activa
  async function onLocalidadChange() {
    if (seccion === 'comercios') await cargarComerciosAdmin()
    if (seccion === 'usuarios')  await cargarUsuarios()
    if (seccion === 'precios')   await cargarPreciosAdmin()
  }

  // ── Navegación interna ────────────────────────────────────────────────
  async function irSeccion(s) {
    seccion  = s
    cargando = true
    try {
      if (s === 'comercios')    await cargarComerciosAdmin()
      if (s === 'usuarios')     await cargarUsuarios()
      if (s === 'precios')      await cargarPreciosAdmin()
      if (s === 'sugerencias')  await cargarSugerencias()
      if (s === 'configuracion') await cargarConfigAdmin()
    } finally { cargando = false }
  }

  // ── Comercios ─────────────────────────────────────────────────────────
  async function cargarComerciosAdmin() {
    if (!navigator.onLine) { comercios = []; return }
    if (!usuarios.length) await cargarUsuarios()
    try {
      const snap = await getDocs(query(collection(db, 'comercios')))
      let lista  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (localidadGlobal) lista = lista.filter(c => c.localidad === localidadGlobal)
      comercios = lista
      const ids = [...new Set(lista.map(c => c.localidad).filter(Boolean))]
      if (ids.length) {
        const map = await resolverNombresLocalidad(ids)
        nombresLocalidad = new Map([...nombresLocalidad, ...map])
        localidadesAdmin = [...new Set(snap.docs.map(d => d.data().localidad).filter(Boolean))].sort()
      }
    } catch (e) { console.error(e); comercios = [] }
  }

  async function aprobarComercio(id, nombre) {
    await updateDoc(doc(db, 'comercios', id), { estado:'verificado', reputacion:50, verificadoEn:serverTimestamp() })
    comercios = comercios.map(c => c.id === id ? { ...c, estado:'verificado' } : c)
    mostrarToast(`"${nombre}" verificado`)
  }

  async function rechazarComercio(id, nombre) {
    if (!confirm(`¿Rechazar "${nombre}"?`)) return
    await updateDoc(doc(db, 'comercios', id), { estado:'rechazado' })
    comercios = comercios.map(c => c.id === id ? { ...c, estado:'rechazado' } : c)
    mostrarToast(`"${nombre}" rechazado`)
  }

  async function desbloquearComercio(id, nombre) {
    await updateDoc(doc(db, 'comercios', id), { reclamoBloqueado:false, intentosFallidos:0 })
    comercios = comercios.map(c => c.id === id ? { ...c, reclamoBloqueado:false } : c)
    mostrarToast(`"${nombre}" desbloqueado`)
  }

  async function liberarComercio(id, nombre) {
    if (!confirm(`¿Liberar "${nombre}"?\nEsto eliminará el dueño actual y dejará el comercio disponible para un nuevo reclamo.`)) return
    await updateDoc(doc(db, 'comercios', id), {
      reclamadoPor:      null,
      reclamoAprobado:   false,
      reclamoFecha:      null,
      intentosFallidos:  0,
      reclamoBloqueado:  false,
      codigoPrivadoHash: null,
      codigoPublico:     null,
      estado:            'verificado',
    })
    comercios = comercios.map(c => c.id === id
      ? { ...c, reclamadoPor: null, reclamoAprobado: false,
          reclamoBloqueado: false, codigoPrivadoHash: null }
      : c
    )
    mostrarToast(`"${nombre}" liberado — disponible para nuevo reclamo`)
  }

  // ── Usuarios ──────────────────────────────────────────────────────────
  async function cargarUsuarios() {
    if (!navigator.onLine) { usuarios = []; return }
    try {
      const snap = await getDocs(collection(db, 'usuarios'))
      let lista  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (localidadGlobal) lista = lista.filter(u => u.localidad === localidadGlobal)
      usuarios = lista
      const uids = [...new Set(lista.map(u => u.localidad).filter(Boolean))]
      if (uids.length) {
        const map = await resolverNombresLocalidad(uids)
        nombresLocalidad = new Map([...nombresLocalidad, ...map])
      }
    } catch (e) { console.error(e); usuarios = [] }
  }

  async function cambiarRol(uid, rolActual) {
    const roles = ['usuario', 'dedicado', 'comercio', 'admin']
    const nuevoRol = prompt(`Rol actual: ${rolActual}\nNuevo rol:\n${roles.join(' / ')}`)
    if (!nuevoRol || !roles.includes(nuevoRol)) return
    await updateDoc(doc(db, 'usuarios', uid), { rol: nuevoRol })
    usuarios = usuarios.map(u => u.id === uid ? { ...u, rol: nuevoRol } : u)
    mostrarToast('Rol actualizado')
  }

  async function cambiarEstado(uid, estadoActual) {
    const estados = ['activo', 'suspendido', 'bloqueado']
    const nuevo = prompt(`Estado actual: ${estadoActual || 'activo'}\nNuevo estado:\n${estados.join(' / ')}`)
    if (!nuevo || !estados.includes(nuevo)) return
    await updateDoc(doc(db, 'usuarios', uid), { estado: nuevo })
    usuarios = usuarios.map(u => u.id === uid ? { ...u, estado: nuevo } : u)
    mostrarToast(`Usuario ${nuevo}`)
  }

  // ── Sugerencias ───────────────────────────────────────────────────────
  async function cargarSugerencias() {
    try {
      const snap = await getDocs(collection(db, 'sugerencias'))
      sugerencias = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.creadaEn?.toDate?.() || new Date(a.creadaEn || 0)
          const tb = b.creadaEn?.toDate?.() || new Date(b.creadaEn || 0)
          return tb - ta
        })
    } catch (e) {
      console.error('[Admin] cargarSugerencias error:', e)
    }
  }

  async function marcarSugerenciaLeida(id) {
    await updateDoc(doc(db, 'sugerencias', id), { leida: true })
    sugerencias = sugerencias.map(s => s.id === id ? { ...s, leida: true } : s)
  }

  $: sugerenciasFiltradas = sugerencias
    .filter(s => !filtroSugCat     || s.categoria === filtroSugCat)
    .filter(s => filtroSugLeida === 'todas'
      ? true
      : filtroSugLeida === 'no_leidas' ? !s.leida : s.leida
    )

  $: noLeidasSug = sugerencias.filter(s => !s.leida).length

  // ── Precios ───────────────────────────────────────────────────────────
  async function cargarPreciosAdmin() {
    cargando = true
    try {
      const q    = query(collection(db, 'precios'), where('activo', '==', true), limit(100))
      const snap = await getDocs(q)
      let lista  = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.creadoEn?.toDate?.() || new Date(0)
          const tb = b.creadoEn?.toDate?.() || new Date(0)
          return tb - ta
        })
      if (localidadGlobal) lista = lista.filter(p => p.localidad === localidadGlobal)
      precios = lista
    } catch (e) { console.error(e) } finally { cargando = false }
  }

  async function desactivarPrecio(precioId) {
    if (!confirm('¿Desactivar este precio?')) return
    await updateDoc(doc(db, 'precios', precioId), {
      activo:false, desactivadoPorAdmin:true, desactivadoEn:serverTimestamp()
    })
    precios = precios.filter(p => p.id !== precioId)
    mostrarToast('Precio desactivado')
  }

  // ── Credencial ────────────────────────────────────────────────────────
  async function buscarComercioParaCredencial() {
    if (!busquedaComercio.trim()) return
    cargando = true
    try {
      const snap = await getDocs(collection(db, 'comercios'))
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const q = busquedaComercio.toLowerCase()
      comercioCredencial = todos.find(c =>
        c.nombre?.toLowerCase().includes(q) || c.id === busquedaComercio
      ) || null
      codigoGenerado = null
    } finally { cargando = false }
  }

  async function handleGenerarCredencial() {
    if (!comercioCredencial) return
    generandoPDF = true
    try {
      const { codigoPublico, codigoPrivado } = await generarCredencial(comercioCredencial.id)
      codigoGenerado = { codigoPublico, codigoPrivado }
      const pdf = await generarPDFCredencial({ comercio:comercioCredencial, codigoPublico, codigoPrivado })
      pdf.save(`credencial-${comercioCredencial.nombre.replace(/\s+/g, '-')}.pdf`)
      mostrarToast('Credencial generada y descargada')
    } catch (e) {
      mostrarToast('Error: ' + e.message)
    } finally { generandoPDF = false }
  }

  // ── Toast / utils ─────────────────────────────────────────────────────
  let toastMsg = ''
  function mostrarToast(msg) { toastMsg = msg; setTimeout(() => toastMsg = '', 3000) }

  function formatFecha(ts) {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
  }
</script>

<div class="app-shell admin-shell">

  {#if toastMsg}
    <div class="toast" role="status">{toastMsg}</div>
  {/if}

  <!-- Header -->
  <header class="admin-header">
    <button class="btn-volver" on:click={() => currentPage.set('home')} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="admin-titulo-wrap">
      <h1 class="admin-titulo">Panel Admin</h1>
      <span class="admin-badge">admin</span>
    </div>
    {#if $totalNoLeidas > 0}
      <div class="notif-dot">{$totalNoLeidas}</div>
    {/if}
  </header>

  <!-- Selector global de localidad -->
  <div class="loc-global-bar">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
    <select class="loc-global-select" bind:value={localidadGlobal} on:change={onLocalidadChange}>
      <option value="">🌍 Todas las localidades</option>
      {#each localidadesAdmin as loc}
        <option value={loc}>{nombresLocalidad.get(`${loc}__label`) || nombresLocalidad.get(loc) || loc}</option>
      {/each}
    </select>
    {#if localidadGlobal}
      <button class="loc-clear" on:click={() => { localidadGlobal = ''; onLocalidadChange() }} title="Ver todas">✕</button>
    {/if}
  </div>

  <!-- Nav interna -->
  <nav class="admin-nav">
    {#each [
      { id:'notificaciones', label:'Notif.',     icon:'🔔', badge: $totalNoLeidas },
      { id:'comercios',      label:'Comercios',  icon:'🏪' },
      { id:'usuarios',       label:'Usuarios',   icon:'👥' },
      { id:'precios',        label:'Precios',    icon:'🏷️' },
      { id:'sugerencias',    label:'Sugerencias',icon:'💡', badge: noLeidasSug },
      { id:'credencial',     label:'Credencial', icon:'📄' },
      { id:'configuracion',  label:'Config.',    icon:'⚙️' },
    ] as item}
      <button
        class="admin-nav-btn"
        class:active={seccion === item.id}
        on:click={() => irSeccion(item.id)}
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
        {#if item.badge > 0}
          <span class="nav-badge">{item.badge}</span>
        {/if}
      </button>
    {/each}
  </nav>

  {#if offline}
    <div class="offline-banner">
      📵 Sin conexión — algunas funciones no están disponibles
    </div>
  {/if}

  <main class="admin-main">

    <!-- ── Notificaciones ── -->
    {#if seccion === 'notificaciones'}
      <div class="section-header-row">
        <h2 class="section-title">Notificaciones</h2>
        {#if $totalNoLeidas > 0}
          <button class="btn-marcar-todas" on:click={marcarTodasLeidas}>
            Marcar todas como leídas
          </button>
        {/if}
      </div>

      {#if $notificaciones.length === 0}
        <div class="empty-state">
          <div class="empty-icon">🔔</div>
          <p>Sin notificaciones</p>
        </div>
      {:else}
        <div class="notif-lista">
          {#each $notificaciones as notif (notif.id)}
            <button
              class="notif-card"
              class:no-leida={!notif.leida}
              on:click={() => marcarLeida(notif.id)}
            >
              <span class="notif-icon">{TIPOS_NOTIF[notif.tipo]?.icono || '📌'}</span>
              <div class="notif-body">
                <p class="notif-titulo">{notif.titulo}</p>
                <p class="notif-msg">{notif.mensaje}</p>
                {#if notif.creadaEn}
                  <p class="notif-fecha">{formatFecha(notif.creadaEn)}</p>
                {/if}
              </div>
              {#if !notif.leida}
                <span class="notif-punto" aria-label="No leída"></span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

    <!-- ── Comercios ── -->
    {:else if seccion === 'comercios'}
      <div class="admin-filters">
        {#each [
          { v:'pendiente',  l:'Pendientes' },
          { v:'verificado', l:'Verificados' },
          { v:'rechazado',  l:'Rechazados' },
          { v:'todos',      l:'Todos' },
        ] as f}
          <button class="filter-chip" class:active={filtroEstado === f.v} on:click={() => filtroEstado = f.v}>{f.l}</button>
        {/each}
      </div>

      {#if cargando}
        <div class="loading-msg">Cargando…</div>
      {:else if offline}
        <div class="empty-state"><div class="empty-icon">📵</div><p>Sin conexión</p></div>
      {:else if comerciosFiltrados.length === 0}
        <div class="empty-state"><div class="empty-icon">✅</div><p>Sin resultados</p></div>
      {:else}
        <p class="section-desc">
          {comerciosFiltrados.length} comercio{comerciosFiltrados.length !== 1 ? 's' : ''}
          {localidadGlobal ? `· ${nombresLocalidad.get(localidadGlobal) || localidadGlobal}` : '· todas las localidades'}
        </p>
        <div class="items-lista">
          {#each comerciosFiltrados as c (c.id)}
            <div class="item-card">
              <div class="item-info">
                <p class="item-nombre">{c.nombre}</p>
                <p class="item-sub">{c.tipo} · {c.direccion || 'Sin dirección'}</p>
                {#if !localidadGlobal}
                  <p class="item-sub loc-sub">
                    📍 {formatLocalidadProvincia(c.localidad, c.provincia, nombresLocalidad)}
                  </p>
                {/if}
                {#if c.reclamadoPor}
                  <div class="reclamador-row">
                    <button class="reclamador-btn" on:click={() => abrirSheetUsuario(c.reclamadoPor)}>
                      👤 {aliasReclamador(c.reclamadoPor)}
                    </button>
                    <button class="btn-liberar" on:click={() => liberarComercio(c.id, c.nombre)} title="Liberar comercio">
                      🔄 Liberar
                    </button>
                  </div>
                {/if}
                {#if c.creadoEn}<p class="item-fecha">{formatFecha(c.creadoEn)}</p>{/if}
                {#if c.reclamoBloqueado}
                  <button class="btn-desbloquear" on:click={() => desbloquearComercio(c.id, c.nombre)}>
                    🔓 Desbloquear reclamo
                  </button>
                {/if}
              </div>
              <div class="item-acciones">
                {#if c.estado === 'pendiente'}
                  <button class="btn-aprobar" on:click={() => aprobarComercio(c.id, c.nombre)}>✓</button>
                  <button class="btn-rechazar" on:click={() => rechazarComercio(c.id, c.nombre)}>✕</button>
                {:else}
                  <span class="estado-chip estado-{c.estado}">{c.estado}</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Usuarios ── -->
    {:else if seccion === 'usuarios'}
      <div class="admin-search-row">
        <input
          type="search"
          class="form-input admin-search"
          placeholder="Buscar por alias o email…"
          bind:value={busquedaUsuario}
        />
      </div>

      <div class="admin-filters">
        {#each [
          { v:'',          l:'Todos' },
          { v:'usuario',   l:'Usuarios' },
          { v:'dedicado',  l:'Dedicados' },
          { v:'comercio',  l:'Comercios' },
          { v:'admin',     l:'Admins' },
        ] as f}
          <button class="filter-chip" class:active={filtroRol === f.v} on:click={() => filtroRol = f.v}>{f.l}</button>
        {/each}
      </div>

      {#if cargando}
        <div class="loading-msg">Cargando…</div>
      {:else if offline}
        <div class="empty-state"><div class="empty-icon">📵</div><p>Sin conexión</p></div>
      {:else}
        <p class="section-desc">
          {usuariosFiltrados.length} usuario{usuariosFiltrados.length !== 1 ? 's' : ''}
          {localidadGlobal ? `· ${nombresLocalidad.get(localidadGlobal) || localidadGlobal}` : '· todas las localidades'}
        </p>
        <div class="items-lista">
          {#each usuariosFiltrados as u (u.id)}
            <div class="item-card">
              <div class="item-info">
                <p class="item-nombre">{u.alias || u.email}</p>
                <p class="item-sub">{u.email}</p>
                {#if !localidadGlobal && u.localidad}
                  <p class="item-sub loc-sub">
                    📍 {formatLocalidadProvincia(u.localidad, u.provincia, nombresLocalidad)}
                  </p>
                {/if}
                <span class="rol-chip rol-{u.rol || 'usuario'}">{u.rol || 'usuario'}</span>
              </div>
              <div class="user-btns">
                <button class="btn-rol" on:click={() => cambiarRol(u.id, u.rol || 'usuario')}>Rol</button>
                <button
                  class="btn-estado"
                  class:estado-activo={!u.estado || u.estado === 'activo'}
                  class:estado-suspendido={u.estado === 'suspendido'}
                  class:estado-bloqueado={u.estado === 'bloqueado'}
                  on:click={() => cambiarEstado(u.id, u.estado || 'activo')}
                >
                  {#if u.estado === 'suspendido'}⏸{:else if u.estado === 'bloqueado'}🚫{:else}✓{/if}
                  {u.estado || 'activo'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Precios ── -->
    {:else if seccion === 'precios'}
      {#if cargando}
        <div class="loading-msg">Cargando…</div>
      {:else if precios.length === 0}
        <div class="empty-state">
          <div class="empty-icon">🏷️</div>
          <p>Sin precios registrados</p>
        </div>
      {:else}
        <p class="section-desc">{precios.length} precio{precios.length !== 1 ? 's' : ''} (últimos 100)</p>
        <div class="items-lista">
          {#each precios as p (p.id)}
            <div class="item-card">
              <div class="item-info">
                <p class="item-nombre">{p.productoNombre}</p>
                <p class="item-sub">{p.comercioNombre}</p>
                <p class="item-sub loc-sub">
                  📍 {formatLocalidadProvincia(p.localidad, p.provincia, nombresLocalidad)}
                </p>
                <p class="item-fecha">{formatFecha(p.creadoEn)}</p>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                <span style="font-weight:700;color:var(--c-primary);font-size:1rem">
                  ${p.precio?.toLocaleString('es-AR')}
                </span>
                <button class="btn-rechazar" style="font-size:0.7rem;width:auto;padding:4px 8px"
                  on:click={() => desactivarPrecio(p.id)}>
                  Desactivar
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Sugerencias ── -->
    {:else if seccion === 'sugerencias'}
      <div class="admin-filters" style="margin-bottom:8px">
        {#each [
          { v:'todas',     l:'Todas' },
          { v:'no_leidas', l:`No leídas${noLeidasSug > 0 ? ` (${noLeidasSug})` : ''}` },
          { v:'leidas',    l:'Leídas' },
        ] as f}
          <button class="filter-chip" class:active={filtroSugLeida === f.v} on:click={() => filtroSugLeida = f.v}>{f.l}</button>
        {/each}
      </div>

      <div class="admin-filters" style="margin-bottom:12px">
        {#each [
          { v:'',              l:'Todas' },
          { v:'general',       l:'General' },
          { v:'funcionalidad', l:'Funcionalidad' },
          { v:'error',         l:'Errores' },
          { v:'contenido',     l:'Contenido' },
          { v:'otro',          l:'Otro' },
        ] as f}
          <button class="filter-chip" class:active={filtroSugCat === f.v} on:click={() => filtroSugCat = f.v}>{f.l}</button>
        {/each}
      </div>

      {#if cargando}
        <div class="loading-msg">Cargando…</div>
      {:else if sugerenciasFiltradas.length === 0}
        <div class="empty-state"><div class="empty-icon">💡</div><p>Sin sugerencias</p></div>
      {:else}
        <p class="section-desc">
          {sugerenciasFiltradas.length} sugerencia{sugerenciasFiltradas.length !== 1 ? 's' : ''}
          {noLeidasSug > 0 ? `· ${noLeidasSug} sin leer` : ''}
        </p>
        <div class="items-lista">
          {#each sugerenciasFiltradas as sug (sug.id)}
            <div class="sug-card" class:sug-no-leida={!sug.leida}>
              <div class="sug-top">
                <div class="sug-meta">
                  <span class="sug-alias">{sug.usuarioAlias || 'Anónimo'}</span>
                  {#if sug.localidad}
                    <span class="sug-loc">📍 {nombresLocalidad.get(sug.localidad) || sug.localidad}</span>
                  {/if}
                  <span class="sug-cat-chip">{sug.categoria || 'general'}</span>
                </div>
                <span class="sug-fecha">{formatFecha(sug.creadaEn)}</span>
              </div>
              <p class="sug-texto">{sug.texto}</p>
              {#if !sug.leida}
                <button class="btn-sug-leida" on:click={() => marcarSugerenciaLeida(sug.id)}>
                  ✓ Marcar como leída
                </button>
              {:else}
                <span class="sug-leida-chip">✓ Leída</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Credencial ── -->
    {:else if seccion === 'credencial'}
      <h2 class="section-title">Generar credencial</h2>
      <p class="section-desc">
        Buscá el comercio, generá la credencial PDF y entregá el trozo desprendible al dueño del local.
      </p>

      <div class="credencial-search">
        <input
          class="form-input"
          type="text"
          placeholder="Nombre del comercio…"
          bind:value={busquedaComercio}
          on:keydown={(e) => e.key === 'Enter' && buscarComercioParaCredencial()}
        />
        <button class="btn btn-primary" on:click={buscarComercioParaCredencial}>Buscar</button>
      </div>

      {#if comercioCredencial}
        <div class="credencial-preview">
          <div class="credencial-nombre">
            <span class="cred-emoji">🏪</span>
            <div>
              <p class="cred-nombre">{comercioCredencial.nombre}</p>
              <p class="cred-dir">{comercioCredencial.direccion || 'Sin dirección'}</p>
              <p class="cred-estado">Estado actual: <strong>{comercioCredencial.estado}</strong></p>
            </div>
          </div>

          {#if codigoGenerado}
            <div class="codigo-generado">
              <p class="codigo-label">✅ Credencial generada</p>
              <p class="codigo-pub">Código público: <strong>{codigoGenerado.codigoPublico}</strong></p>
              <p class="codigo-priv">
                Código privado (solo visible ahora):
                <strong class="codigo-priv-valor">{codigoGenerado.codigoPrivado}</strong>
              </p>
              <p class="codigo-aviso">⚠️ El código privado no se puede recuperar. Ya fue descargado en el PDF.</p>
            </div>
          {:else}
            <button
              class="btn btn-primary btn-full"
              on:click={handleGenerarCredencial}
              disabled={generandoPDF}
            >
              {generandoPDF ? 'Generando PDF…' : '📄 Generar y descargar credencial PDF'}
            </button>
          {/if}
        </div>
      {/if}

    <!-- ── Configuración ── -->
    {:else if seccion === 'configuracion'}
      <h2 class="section-title">Restricción de localidades</h2>

      <div class="cfg-card">
        <div class="cfg-row">
          <div class="cfg-row-info">
            <span class="cfg-label">Restringir localidades</span>
            <span class="cfg-desc">Solo los usuarios de las localidades habilitadas podrán registrarse</span>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" bind:checked={cfgRestriccion} class="toggle-input" />
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>

      {#if cfgRestriccion}
        <div class="cfg-card" style="margin-top:12px">
          <p class="cfg-section-label">Localidades habilitadas</p>

          {#if cfgLocalidades.length === 0}
            <p class="cfg-empty">Sin localidades — todos los usuarios podrán elegir cualquier localidad.</p>
          {:else}
            <div class="cfg-locs-lista">
              {#each cfgLocalidades as id}
                <div class="cfg-loc-item">
                  <span class="cfg-loc-nombre">
                    {nombresLocalidad.get(`${id}__label`) || nombresLocalidad.get(id) || id}
                  </span>
                  <button class="cfg-loc-quitar" on:click={() => quitarLocalidadCfg(id)}>✕</button>
                </div>
              {/each}
            </div>
          {/if}

          <div class="cfg-add-row">
            <input
              type="text"
              class="form-input cfg-input"
              placeholder="ID de localidad (ej: 66063010)"
              bind:value={cfgNuevaLocalidad}
              on:keydown={e => e.key === 'Enter' && agregarLocalidadCfg()}
            />
            <button class="btn btn-primary cfg-add-btn" on:click={agregarLocalidadCfg}>
              + Agregar
            </button>
          </div>
          <p class="cfg-hint">
            Buscá el ID en:
            <a href="https://apis.datos.gob.ar/georef/api/localidades?nombre=metan&provincia=salta" target="_blank" rel="noopener">
              API Georef
            </a>
          </p>
        </div>
      {/if}

      <button
        class="btn btn-primary btn-full"
        style="margin-top:16px"
        on:click={guardarConfigAdmin}
        disabled={guardandoCfg}
      >
        {guardandoCfg ? 'Guardando…' : '💾 Guardar configuración'}
      </button>

      <!-- ── Migración alias_index ── -->
      <div class="cfg-card" style="margin-top:20px">
        <p class="cfg-section-label">Unicidad de alias</p>
        <p class="cfg-desc" style="margin-bottom:12px">
          Pobla el índice <strong>alias_index</strong> con todos los alias existentes.
          Ejecutar una vez después de activar la verificación de unicidad.
        </p>
        <button
          class="btn btn-primary btn-full"
          on:click={migrarAliasIndex}
          disabled={migrandoAlias}
        >
          {migrandoAlias ? '⏳ Migrando…' : '🔑 Migrar alias existentes'}
        </button>
        {#if migracionMsg}
          <p class="cfg-migracion-msg" class:ok={migracionMsg.startsWith('✓')}>
            {migracionMsg}
          </p>
        {/if}
      </div>

    {/if}

  </main>

  <!-- ── Sheet de usuario ── -->
  {#if usuarioSheet}
    <div class="sheet-overlay" on:click={cerrarSheetUsuario} role="presentation"></div>
    <div class="bottom-sheet user-sheet" role="dialog" aria-label="Datos del usuario">

      <div class="sheet-handle-wrap">
        <div class="sheet-handle"></div>
      </div>

      <div class="user-sheet-header">
        <div class="user-sheet-avatar">
          {#if usuarioSheet.foto}
            <img src={usuarioSheet.foto} alt={usuarioSheet.alias} class="avatar-img" />
          {:else}
            <div class="avatar-fallback-lg">
              {(usuarioSheet.alias || usuarioSheet.email || '?').charAt(0).toUpperCase()}
            </div>
          {/if}
        </div>
        <div class="user-sheet-info">
          <p class="user-sheet-alias">{usuarioSheet.alias || '(sin alias)'}</p>
          <p class="user-sheet-email">{usuarioSheet.email || '—'}</p>
        </div>
        <button class="sheet-cerrar-btn" on:click={cerrarSheetUsuario}>✕</button>
      </div>

      <div class="user-sheet-datos">
        <div class="dato-row">
          <span class="dato-label">Rol</span>
          <span class="rol-chip rol-{usuarioSheet.rol || 'usuario'}">{usuarioSheet.rol || 'usuario'}</span>
        </div>
        <div class="dato-row">
          <span class="dato-label">Estado</span>
          <span class="estado-chip estado-{usuarioSheet.estado || 'activo'}">{usuarioSheet.estado || 'activo'}</span>
        </div>
        <div class="dato-row">
          <span class="dato-label">Localidad</span>
          <span class="dato-valor">
            {formatLocalidadProvincia(usuarioSheet.localidad, usuarioSheet.provincia, nombresLocalidad)}
          </span>
        </div>
        <div class="dato-row">
          <span class="dato-label">Reputación</span>
          <span class="dato-valor">⭐ {usuarioSheet.reputacion ?? 0}</span>
        </div>
        <div class="dato-row">
          <span class="dato-label">Registrado</span>
          <span class="dato-valor">{formatFechaSheet(usuarioSheet.creadoEn)}</span>
        </div>
        <div class="dato-row">
          <span class="dato-label">Último acceso</span>
          <span class="dato-valor">{formatFechaSheet(usuarioSheet.ultimoAcceso)}</span>
        </div>
      </div>

      <div class="user-sheet-acciones">
        <button class="btn-sheet-accion" on:click={sheetCambiarRol} disabled={sheetCambiando}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Cambiar rol
        </button>
        <button class="btn-sheet-accion btn-sheet-estado" on:click={sheetCambiarEstado} disabled={sheetCambiando}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Cambiar estado
        </button>
      </div>

    </div>
  {/if}

</div>

<style>
  .admin-shell { background: var(--c-bg); min-height: 100dvh; }

  .offline-banner {
    background: #FEF3C7; border-bottom: 1px solid #FDE68A;
    color: #92400E; font-size: 0.78rem; font-weight: 600;
    padding: 8px 16px; text-align: center;
  }

  /* Header */
  .admin-header {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; background: var(--c-primary); color: white;
    position: sticky; top: 0; z-index: 10;
  }
  .btn-volver { background: none; border: none; color: white; cursor: pointer; padding: 4px; display: flex; }
  .admin-titulo-wrap { display: flex; align-items: center; gap: 8px; flex: 1; }
  .admin-titulo { font-family: var(--font-brand); font-size: 1.1rem; margin: 0; color: white; }
  .admin-badge {
    background: rgba(255,255,255,0.25); color: white;
    font-size: 0.65rem; font-weight: 800; padding: 2px 7px;
    border-radius: 99px; letter-spacing: 0.05em;
  }
  .notif-dot {
    background: #EF4444; color: white; font-size: 0.7rem; font-weight: 800;
    width: 22px; height: 22px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }

  /* Nav interna */
  .admin-nav {
    display: flex; background: white; border-bottom: 1px solid var(--c-border);
    overflow-x: auto; scrollbar-width: none;
  }
  .admin-nav::-webkit-scrollbar { display: none; }
  .admin-nav-btn {
    flex: 1; min-width: 70px; display: flex; flex-direction: column;
    align-items: center; gap: 2px; padding: 10px 8px;
    background: none; border: none; border-bottom: 2.5px solid transparent;
    font-size: 0.68rem; font-weight: 600; color: var(--c-text-muted);
    cursor: pointer; position: relative; font-family: var(--font-ui); transition: all 0.15s;
  }
  .admin-nav-btn.active { border-bottom-color: var(--c-primary); color: var(--c-primary); }
  .nav-badge {
    position: absolute; top: 6px; right: 12px;
    background: #EF4444; color: white; font-size: 0.6rem; font-weight: 800;
    width: 16px; height: 16px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }

  /* Main */
  .admin-main { padding: 16px; }
  .section-title { font-size: 1rem; font-weight: 700; color: var(--c-text); margin: 0 0 12px; }
  .section-desc { font-size: 0.82rem; color: var(--c-text-muted); margin: -8px 0 14px; }
  .section-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .btn-marcar-todas {
    font-size: 0.75rem; color: var(--c-primary); background: none;
    border: none; cursor: pointer; font-weight: 600; font-family: var(--font-ui);
  }

  /* Notificaciones */
  .notif-lista { display: flex; flex-direction: column; gap: 8px; }
  .notif-card {
    display: flex; align-items: flex-start; gap: 10px;
    background: white; border: 1.5px solid var(--c-border);
    border-radius: 12px; padding: 12px; text-align: left;
    cursor: pointer; width: 100%; transition: background 0.15s; position: relative;
  }
  .notif-card.no-leida { border-color: var(--c-primary); background: #F0FDF4; }
  .notif-card:active { background: var(--c-bg); }
  .notif-icon  { font-size: 1.3rem; flex-shrink: 0; }
  .notif-body  { flex: 1; }
  .notif-titulo { font-size: 0.85rem; font-weight: 700; color: var(--c-text); margin: 0 0 3px; }
  .notif-msg    { font-size: 0.78rem; color: var(--c-text-muted); margin: 0 0 3px; }
  .notif-fecha  { font-size: 0.7rem; color: var(--c-text-light); margin: 0; }
  .notif-punto  { width: 8px; height: 8px; border-radius: 50%; background: var(--c-primary); flex-shrink: 0; margin-top: 4px; }

  /* Items lista */
  .items-lista { display: flex; flex-direction: column; gap: 8px; }
  .item-card {
    display: flex; align-items: center; gap: 12px;
    background: white; border: 1.5px solid var(--c-border); border-radius: 12px; padding: 12px;
  }
  .item-info   { flex: 1; }
  .item-nombre { font-size: 0.9rem; font-weight: 700; color: var(--c-text); margin: 0 0 2px; }
  .item-sub    { font-size: 0.75rem; color: var(--c-text-muted); margin: 0 0 3px; }
  .item-fecha  { font-size: 0.7rem; color: var(--c-text-light); margin: 0; }
  .item-acciones { display: flex; gap: 6px; }
  .btn-aprobar {
    width: 36px; height: 36px; background: #D1FAE5; color: #065F46;
    border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; font-weight: 700;
  }
  .btn-rechazar {
    width: 36px; height: 36px; background: #FEE2E2; color: #991B1B;
    border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; font-weight: 700;
  }
  .btn-desbloquear {
    font-size: 0.72rem; color: var(--c-primary); background: none; border: none;
    cursor: pointer; font-weight: 600; padding: 0; margin-top: 4px; font-family: var(--font-ui);
  }
  .btn-rol {
    font-size: 0.75rem; padding: 6px 10px; background: none;
    border: 1.5px solid var(--c-border); border-radius: 8px; cursor: pointer;
    font-weight: 600; color: var(--c-text-muted); font-family: var(--font-ui); white-space: nowrap;
  }
  .rol-chip { display: inline-block; font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 99px; margin-top: 2px; }
  .rol-admin    { background: #EDE9FE; color: #5B21B6; }
  .rol-dedicado { background: #FEF3C7; color: #92400E; }
  .rol-usuario  { background: #F3F4F6; color: #374151; }
  .estado-chip  { font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 99px; white-space: nowrap; }
  .estado-verificado { background: #D1FAE5; color: #065F46; }
  .estado-rechazado  { background: #FEE2E2; color: #991B1B; }
  .estado-pendiente  { background: #FEF3C7; color: #92400E; }
  .user-btns { display: flex; gap: 6px; flex-shrink: 0; }
  .btn-estado {
    padding: 6px 10px; border-radius: var(--r-full); border: 1.5px solid var(--c-border);
    background: var(--c-surface); font-size: 11px; font-weight: 700; cursor: pointer;
    font-family: var(--f-ui); white-space: nowrap; display: flex; align-items: center; gap: 4px; transition: all 0.15s;
  }
  .btn-estado.estado-activo     { border-color: #059669; color: #059669; }
  .btn-estado.estado-suspendido { border-color: #F59E0B; color: #92400E; background: #FFFBEB; }
  .btn-estado.estado-bloqueado  { border-color: #DC2626; color: #DC2626; background: #FEF2F2; }

  /* Sugerencias */
  .sug-card {
    background: white; border: 1.5px solid var(--c-border);
    border-radius: 12px; padding: 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .sug-no-leida { border-color: var(--c-primary); background: #F0FDF4; }
  .sug-top  { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .sug-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .sug-alias { font-size: 0.8rem; font-weight: 700; color: var(--c-text); }
  .sug-loc   { font-size: 0.72rem; color: var(--c-text-light); }
  .sug-cat-chip {
    font-size: 0.65rem; font-weight: 700; padding: 2px 7px;
    border-radius: 99px; background: var(--c-surface-2); color: var(--c-text-mid);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .sug-fecha   { font-size: 0.68rem; color: var(--c-text-light); flex-shrink: 0; }
  .sug-texto   { font-size: 0.85rem; color: var(--c-text); line-height: 1.5; margin: 0; }
  .btn-sug-leida {
    font-size: 0.75rem; font-weight: 600; color: var(--c-primary);
    background: none; border: none; cursor: pointer; padding: 0;
    font-family: var(--f-ui); text-align: left;
  }
  .sug-leida-chip { font-size: 0.72rem; color: #059669; font-weight: 600; }

  /* Credencial */
  .credencial-search { display: flex; gap: 8px; margin-bottom: 12px; }
  .credencial-search .form-input { flex: 1; }
  .credencial-preview {
    background: white; border: 1.5px solid var(--c-border);
    border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 12px;
  }
  .credencial-nombre { display: flex; align-items: flex-start; gap: 10px; }
  .cred-emoji  { font-size: 1.8rem; }
  .cred-nombre { font-size: 0.95rem; font-weight: 700; color: var(--c-text); margin: 0 0 3px; }
  .cred-dir    { font-size: 0.78rem; color: var(--c-text-muted); margin: 0 0 3px; }
  .cred-estado { font-size: 0.75rem; color: var(--c-text-light); margin: 0; }
  .codigo-generado {
    background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 12px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .codigo-label { font-size: 0.85rem; font-weight: 700; color: var(--c-primary); margin: 0; }
  .codigo-pub   { font-size: 0.82rem; color: var(--c-text); margin: 0; }
  .codigo-priv  { font-size: 0.82rem; color: var(--c-text); margin: 0; }
  .codigo-priv-valor { font-family: monospace; font-size: 1.1rem; letter-spacing: 0.15em; color: var(--c-primary); }
  .codigo-aviso { font-size: 0.72rem; color: #92400E; margin: 0; }

  /* Selector global de localidad */
  .loc-global-bar {
    display: flex; align-items: center; gap: 8px; padding: 8px 16px;
    background: rgba(27,107,58,0.06); border-bottom: 1px solid var(--c-border);
  }
  .loc-global-bar svg { color: var(--c-primary); flex-shrink: 0; }
  .loc-global-select {
    flex: 1; border: none; background: transparent;
    font-size: 0.85rem; font-weight: 600; color: var(--c-primary);
    font-family: var(--f-ui); cursor: pointer; -webkit-appearance: none; appearance: none;
  }
  .loc-global-select:focus { outline: none; }
  .loc-clear {
    background: none; border: none; color: var(--c-text-light);
    font-size: 0.75rem; cursor: pointer; padding: 2px 4px; border-radius: 4px; flex-shrink: 0;
  }
  .loc-clear:hover { background: var(--c-border); }

  /* Filtros */
  .admin-filters { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
  .filter-chip {
    padding: 5px 12px; border-radius: 99px; border: 1.5px solid var(--c-border);
    background: var(--c-surface); font-size: 0.75rem; font-weight: 700;
    color: var(--c-text-mid); cursor: pointer; transition: all 0.15s;
    font-family: var(--f-ui); white-space: nowrap;
  }
  .filter-chip.active { background: var(--c-primary); border-color: var(--c-primary); color: white; }
  .filter-chip:active { transform: scale(0.95); }

  .admin-search-row { margin-bottom: 10px; }
  .admin-search { font-size: 0.85rem; padding: 10px 14px; }

  .loc-sub      { color: var(--c-text-light) !important; font-size: 0.7rem !important; }
  .reclamador-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .reclamador-btn {
    background: none; border: none; cursor: pointer; font-size: 0.72rem;
    font-weight: 600; color: var(--c-primary); padding: 2px 0; text-align: left;
    font-family: var(--f-ui); text-decoration: underline; text-underline-offset: 2px;
  }
  .reclamador-btn:hover { opacity: 0.75; }
  .btn-liberar {
    font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: var(--r-full);
    border: 1.5px solid #F59E0B; background: #FFFBEB; color: #92400E;
    cursor: pointer; font-family: var(--f-ui); transition: all 0.15s; white-space: nowrap;
  }
  .btn-liberar:hover { background: #FEF3C7; }

  /* Empty / loading */
  .empty-state { display: flex; flex-direction: column; align-items: center; padding: 40px 24px; gap: 8px; color: var(--c-text-muted); font-size: 0.88rem; }
  .empty-icon  { font-size: 2.5rem; }
  .loading-msg { text-align: center; color: var(--c-text-muted); padding: 32px; font-size: 0.88rem; }

  /* Toast */
  .toast {
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: var(--c-text); color: white; font-size: 0.82rem; font-weight: 600;
    padding: 10px 20px; border-radius: 99px; white-space: nowrap;
    box-shadow: var(--s-md); z-index: 999; animation: toastIn 0.2s ease;
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* Sheet de usuario */
  .sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200; }
  .bottom-sheet {
    position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
    width: min(480px, 100vw); background: var(--c-surface);
    border-radius: var(--r-xl) var(--r-xl) 0 0; z-index: 201;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.15); max-height: 85dvh; overflow-y: auto;
  }
  .sheet-handle-wrap { display: flex; justify-content: center; padding: 10px 0 0; }
  .sheet-handle { width: 40px; height: 4px; background: var(--c-border); border-radius: 2px; }
  .user-sheet-header {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 20px; border-bottom: 1px solid var(--c-border);
  }
  .user-sheet-avatar { flex-shrink: 0; }
  .avatar-img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; }
  .avatar-fallback-lg {
    width: 52px; height: 52px; border-radius: 50%; background: var(--c-primary); color: white;
    font-size: 22px; font-weight: 700; display: flex; align-items: center; justify-content: center;
  }
  .user-sheet-info  { flex: 1; min-width: 0; }
  .user-sheet-alias { font-size: 16px; font-weight: 700; color: var(--c-text); }
  .user-sheet-email { font-size: 12px; color: var(--c-text-light); margin-top: 2px; }
  .sheet-cerrar-btn {
    background: var(--c-surface-2); border: none; border-radius: 50%;
    width: 30px; height: 30px; font-size: 13px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--c-text-light); flex-shrink: 0;
  }
  .user-sheet-datos { padding: 12px 20px; }
  .dato-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 0; border-bottom: 1px solid var(--c-border); font-size: 13px;
  }
  .dato-row:last-child { border-bottom: none; }
  .dato-label { color: var(--c-text-light); font-weight: 600; }
  .dato-valor { color: var(--c-text); font-weight: 600; }
  .user-sheet-acciones { display: flex; gap: 10px; padding: 12px 20px 24px; border-top: 1px solid var(--c-border); }
  .btn-sheet-accion {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 11px 14px; border-radius: var(--r-lg); border: 1.5px solid var(--c-border);
    background: var(--c-surface); font-size: 13px; font-weight: 700; color: var(--c-text);
    cursor: pointer; font-family: var(--f-ui); transition: all 0.15s;
  }
  .btn-sheet-accion:hover    { background: var(--c-surface-2); }
  .btn-sheet-accion:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-sheet-estado          { border-color: #F59E0B; color: #92400E; }
  .btn-sheet-estado:hover    { background: #FFFBEB; }

  /* Configuración */
  .section-title { font-family: var(--f-brand); font-size: 18px; margin-bottom: 14px; }
  .cfg-card { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--r-xl); padding: 16px; }
  .cfg-row  { display: flex; align-items: center; gap: 12px; }
  .cfg-row-info { flex: 1; }
  .cfg-label { display: block; font-size: 14px; font-weight: 700; color: var(--c-text); }
  .cfg-desc  { display: block; font-size: 12px; color: var(--c-text-light); margin-top: 3px; }
  .cfg-section-label { font-size: 12px; font-weight: 700; color: var(--c-text-mid); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
  .cfg-empty { font-size: 13px; color: var(--c-text-light); }
  .cfg-locs-lista { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .cfg-loc-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--c-surface-2); border-radius: var(--r-md); }
  .cfg-loc-nombre { flex: 1; font-size: 13px; font-weight: 600; color: var(--c-text); }
  .cfg-loc-quitar { background: none; border: none; color: var(--c-text-light); cursor: pointer; font-size: 14px; padding: 2px 4px; }
  .cfg-loc-quitar:hover { color: var(--c-error); }
  .cfg-add-row { display: flex; gap: 8px; }
  .cfg-input   { flex: 1; font-size: 13px; }
  .cfg-add-btn { white-space: nowrap; padding: 10px 16px; font-size: 13px; }
  .cfg-hint    { font-size: 11px; color: var(--c-text-light); margin-top: 10px; line-height: 1.5; }
  .cfg-hint a  { color: var(--c-primary); }

  /* Migración alias */
  .cfg-migracion-msg {
    font-size: 13px; font-weight: 600; margin-top: 10px;
    padding: 8px 12px; border-radius: 8px;
    background: var(--c-error-bg); color: var(--c-error);
  }
  .cfg-migracion-msg.ok { background: rgba(27,107,58,0.08); color: var(--c-primary); }

  /* Toggle switch */
  .toggle-wrap  { position: relative; display: inline-flex; align-items: center; flex-shrink: 0; }
  .toggle-input { position: absolute; opacity: 0; width: 0; height: 0; }
  .toggle-track {
    width: 44px; height: 26px; background: var(--c-border); border-radius: 13px;
    transition: background 0.2s; cursor: pointer; display: block;
  }
  .toggle-track::after {
    content: ''; position: absolute; top: 3px; left: 3px;
    width: 20px; height: 20px; background: white; border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform 0.2s;
  }
  .toggle-input:checked + .toggle-track { background: var(--c-primary); }
  .toggle-input:checked + .toggle-track::after { transform: translateX(18px); }
</style>