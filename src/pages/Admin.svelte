<script>
  import { onMount } from 'svelte'
  import { currentPage, currentUser, userProfile } from '../stores/auth.js'
  import {
    notificaciones, totalNoLeidas,
    cargarNotificaciones, marcarLeida, marcarTodasLeidas,
    TIPOS_NOTIF
  } from '../stores/notificaciones.js'
  import {
    collection, getDocs, query, where, limit, orderBy,
    doc, updateDoc, serverTimestamp
  } from 'firebase/firestore'
  import { db } from '../lib/firebase.js'
  import { getNombreProvincia, resolverNombresLocalidad, formatLocalidadProvincia } from '../lib/georef.js'
  import { generarCredencial } from '../stores/comercios.js'
  import { generarPDFCredencial } from '../lib/credencial.js'

  $: if ($userProfile && $userProfile.rol !== 'admin') currentPage.set('home')

  // ── Estado global ─────────────────────────────────────────────────────
  let seccion          = 'notificaciones'
  let cargando         = false
  let offline          = false

  // ── Selector global de localidad ──────────────────────────────────────
  let localidadGlobal  = ''          // '' = todas las localidades
  let localidadesAdmin = []          // se puebla al cargar comercios o usuarios
  let nombresLocalidad = new Map()   // id → nombre legible (se resuelve via georef)

  // ── Datos por sección ─────────────────────────────────────────────────
  let comercios        = []
  let filtroEstado     = 'pendiente'
  let filtroRol        = ''

  let usuarios         = []
  let busquedaUsuario  = ''

  let precios          = []

  // ── Sugerencias ───────────────────────────────────────────────────────────
  let sugerencias      = []
  let filtroSugCat     = ''

  let comercioCredencial = null
  let generandoPDF       = false
  let codigoGenerado     = null
  let busquedaComercio   = ''

  // ── Reactivos derivados ───────────────────────────────────────────────
  $: comerciosFiltrados = comercios
    .filter(c => filtroEstado === 'todos' || c.estado === filtroEstado)
    .sort((a, b) => (b.creadoEn?.toDate?.() || 0) - (a.creadoEn?.toDate?.() || 0))

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
    // Cargar localidades disponibles en background
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

      // Resolver nombres inmediatamente para que el selector muestre texto legible
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
      if (s === 'comercios') await cargarComerciosAdmin()
      if (s === 'usuarios')  await cargarUsuarios()
      if (s === 'precios')   await cargarPreciosAdmin()
    } finally { cargando = false }
  }

  // ── Comercios ─────────────────────────────────────────────────────────
  async function cargarComerciosAdmin() {
    if (!navigator.onLine) { comercios = []; return }
    try {
      const snap = await getDocs(query(collection(db, 'comercios')))
      let lista  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (localidadGlobal) lista = lista.filter(c => c.localidad === localidadGlobal)
      comercios = lista

      // Resolver nombres legibles de localidades
      const ids = [...new Set(lista.map(c => c.localidad).filter(Boolean))]
      if (ids.length) {
        const map = await resolverNombresLocalidad(ids)
        nombresLocalidad = new Map([...nombresLocalidad, ...map])
        // Poblar selector con nombres legibles
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

  // ── Usuarios ──────────────────────────────────────────────────────────
  async function cargarUsuarios() {
    if (!navigator.onLine) { usuarios = []; return }
    try {
      const snap = await getDocs(collection(db, 'usuarios'))
      let lista  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (localidadGlobal) lista = lista.filter(u => u.localidad === localidadGlobal)
      usuarios = lista

      // Resolver nombres de localidades de usuarios
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

  // ── Precios ───────────────────────────────────────────────────────────
  async function cargarSugerencias() {
    try {
      const snap = await getDocs(query(
        collection(db, 'sugerencias'),
        orderBy('creadaEn', 'desc')
      ))
      sugerencias = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (e) { console.error(e) }
  }

  async function marcarSugerenciaLeida(id) {
    await updateDoc(doc(db, 'sugerencias', id), { leida: true })
    sugerencias = sugerencias.map(s => s.id === id ? { ...s, leida: true } : s)
  }

  $: sugerenciasFiltradas = filtroSugCat
    ? sugerencias.filter(s => s.categoria === filtroSugCat)
    : sugerencias

  $: noLeidasSug = sugerencias.filter(s => !s.leida).length

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

  <!-- Header con selector global de localidad -->
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
    <select
      class="loc-global-select"
      bind:value={localidadGlobal}
      on:change={onLocalidadChange}
    >
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
      { id:'notificaciones', label:'Notif.', icon:'🔔', badge: $totalNoLeidas },
      { id:'comercios',      label:'Comercios', icon:'🏪' },
      { id:'usuarios',       label:'Usuarios', icon:'👥' },
      { id:'precios',        label:'Precios', icon:'🏷️' },
      { id:'sugerencias',    label:'Sugerencias', icon:'💡', badge: noLeidasSug },
      { id:'credencial',     label:'Credencial', icon:'📄' },
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

    <!-- ── Notificaciones ────────────────────────────────────────────── -->
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
              <span class="notif-icon">
                {TIPOS_NOTIF[notif.tipo]?.icono || '📌'}
              </span>
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

    <!-- ── Comercios ────────────────────────────────────────────────── -->
    {:else if seccion === 'comercios'}
      <!-- Filtro por estado (localidad ya la maneja el selector global) -->
      <div class="admin-filters">
        {#each [
          { v:'pendiente',  l:'Pendientes' },
          { v:'verificado', l:'Verificados' },
          { v:'rechazado',  l:'Rechazados' },
          { v:'todos',      l:'Todos' },
        ] as f}
          <button
            class="filter-chip"
            class:active={filtroEstado === f.v}
            on:click={() => filtroEstado = f.v}
          >{f.l}</button>
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

    <!-- ── Usuarios ─────────────────────────────────────────────────── -->
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
          <button
            class="filter-chip"
            class:active={filtroRol === f.v}
            on:click={() => filtroRol = f.v}
          >{f.l}</button>
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
                <button class="btn-rol" on:click={() => cambiarRol(u.id, u.rol || 'usuario')}>
                  Rol
                </button>
                <button
                  class="btn-estado"
                  class:estado-activo={!u.estado || u.estado === 'activo'}
                  class:estado-suspendido={u.estado === 'suspendido'}
                  class:estado-bloqueado={u.estado === 'bloqueado'}
                  on:click={() => cambiarEstado(u.id, u.estado || 'activo')}
                  title="Cambiar estado"
                >
                  {#if u.estado === 'suspendido'}⏸{:else if u.estado === 'bloqueado'}🚫{:else}✓{/if}
                  {u.estado || 'activo'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Credencial ─────────────────────────────────────────────────── -->

    <!-- ── Precios (multi-localidad) ────────────────────────────────── -->
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
                  on:click={() => desactivarPrecio(p.id)}
                  title="Desactivar precio">
                  Desactivar
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    {:else if seccion === 'sugerencias'}
      <!-- Filtro por categoría -->
      <div class="admin-filters" style="margin-bottom:12px">
        {#each [
          { v:'',              l:'Todas' },
          { v:'general',       l:'General' },
          { v:'funcionalidad', l:'Funcionalidad' },
          { v:'error',         l:'Errores' },
          { v:'contenido',     l:'Contenido' },
          { v:'otro',          l:'Otro' },
        ] as f}
          <button
            class="filter-chip"
            class:active={filtroSugCat === f.v}
            on:click={() => filtroSugCat = f.v}
          >{f.l}</button>
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
        <button class="btn btn-primary" on:click={buscarComercioParaCredencial}>
          Buscar
        </button>
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
              {#if generandoPDF}
                Generando PDF…
              {:else}
                📄 Generar y descargar credencial PDF
              {/if}
            </button>
          {/if}
        </div>
      {/if}

    {/if}

  </main>
</div>

<style>
  .admin-shell {
    background: var(--c-bg);
    min-height: 100dvh;
  }

  .offline-banner {
    background: #FEF3C7;
    border-bottom: 1px solid #FDE68A;
    color: #92400E;
    font-size: 0.78rem;
    font-weight: 600;
    padding: 8px 16px;
    text-align: center;
  }

  /* Header */
  .admin-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: var(--c-primary);
    color: white;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .btn-volver {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 4px;
    display: flex;
  }
  .admin-titulo-wrap { display: flex; align-items: center; gap: 8px; flex: 1; }
  .admin-titulo { font-family: var(--font-brand); font-size: 1.1rem; margin: 0; color: white; }
  .admin-badge {
    background: rgba(255,255,255,0.25);
    color: white;
    font-size: 0.65rem;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 99px;
    letter-spacing: 0.05em;
  }
  .notif-dot {
    background: #EF4444;
    color: white;
    font-size: 0.7rem;
    font-weight: 800;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Nav interna */
  .admin-nav {
    display: flex;
    background: white;
    border-bottom: 1px solid var(--c-border);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .admin-nav::-webkit-scrollbar { display: none; }
  .admin-nav-btn {
    flex: 1;
    min-width: 70px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 8px;
    background: none;
    border: none;
    border-bottom: 2.5px solid transparent;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--c-text-muted);
    cursor: pointer;
    position: relative;
    font-family: var(--font-ui);
    transition: all 0.15s;
  }
  .admin-nav-btn.active {
    border-bottom-color: var(--c-primary);
    color: var(--c-primary);
  }
  .nav-badge {
    position: absolute;
    top: 6px;
    right: 12px;
    background: #EF4444;
    color: white;
    font-size: 0.6rem;
    font-weight: 800;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Main */
  .admin-main { padding: 16px; }
  .section-title { font-size: 1rem; font-weight: 700; color: var(--c-text); margin: 0 0 12px; }
  .section-desc { font-size: 0.82rem; color: var(--c-text-muted); margin: -8px 0 14px; }
  .section-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .btn-marcar-todas {
    font-size: 0.75rem;
    color: var(--c-primary);
    background: none;
    border: none;
    cursor: pointer;
    font-weight: 600;
    font-family: var(--font-ui);
  }

  /* Notificaciones */
  .notif-lista { display: flex; flex-direction: column; gap: 8px; }
  .notif-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: white;
    border: 1.5px solid var(--c-border);
    border-radius: 12px;
    padding: 12px;
    text-align: left;
    cursor: pointer;
    width: 100%;
    transition: background 0.15s;
    position: relative;
  }
  .notif-card.no-leida { border-color: var(--c-primary); background: #F0FDF4; }
  .notif-card:active { background: var(--c-bg); }
  .notif-icon { font-size: 1.3rem; flex-shrink: 0; }
  .notif-body { flex: 1; }
  .notif-titulo { font-size: 0.85rem; font-weight: 700; color: var(--c-text); margin: 0 0 3px; }
  .notif-msg    { font-size: 0.78rem; color: var(--c-text-muted); margin: 0 0 3px; }
  .notif-fecha  { font-size: 0.7rem; color: var(--c-text-light); margin: 0; }
  .notif-punto  {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--c-primary);
    flex-shrink: 0;
    margin-top: 4px;
  }

  /* Items lista (comercios/usuarios) */
  .items-lista { display: flex; flex-direction: column; gap: 8px; }
  .item-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: white;
    border: 1.5px solid var(--c-border);
    border-radius: 12px;
    padding: 12px;
  }
  .item-info  { flex: 1; }
  .item-nombre { font-size: 0.9rem; font-weight: 700; color: var(--c-text); margin: 0 0 2px; }
  .item-sub    { font-size: 0.75rem; color: var(--c-text-muted); margin: 0 0 3px; }
  .item-fecha  { font-size: 0.7rem; color: var(--c-text-light); margin: 0; }
  .item-acciones { display: flex; gap: 6px; }
  .btn-aprobar {
    width: 36px; height: 36px;
    background: #D1FAE5;
    color: #065F46;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    font-weight: 700;
  }
  .btn-rechazar {
    width: 36px; height: 36px;
    background: #FEE2E2;
    color: #991B1B;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    font-weight: 700;
  }
  .btn-desbloquear {
    font-size: 0.72rem;
    color: var(--c-primary);
    background: none;
    border: none;
    cursor: pointer;
    font-weight: 600;
    padding: 0;
    margin-top: 4px;
    font-family: var(--font-ui);
  }
  .btn-rol {
    font-size: 0.75rem;
    padding: 6px 10px;
    background: none;
    border: 1.5px solid var(--c-border);
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    color: var(--c-text-muted);
    font-family: var(--font-ui);
    white-space: nowrap;
  }
  .rol-chip {
    display: inline-block;
    font-size: 0.68rem;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 99px;
    margin-top: 2px;
  }
  .rol-admin    { background: #EDE9FE; color: #5B21B6; }
  .rol-dedicado { background: #FEF3C7; color: #92400E; }
  .rol-usuario  { background: #F3F4F6; color: #374151; }

  /* Credencial */
  .credencial-search { display: flex; gap: 8px; margin-bottom: 12px; }
  .credencial-search .form-input { flex: 1; }
  .credencial-preview {
    background: white;
    border: 1.5px solid var(--c-border);
    border-radius: 14px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .credencial-nombre { display: flex; align-items: flex-start; gap: 10px; }
  .cred-emoji { font-size: 1.8rem; }
  .cred-nombre { font-size: 0.95rem; font-weight: 700; color: var(--c-text); margin: 0 0 3px; }
  .cred-dir    { font-size: 0.78rem; color: var(--c-text-muted); margin: 0 0 3px; }
  .cred-estado { font-size: 0.75rem; color: var(--c-text-light); margin: 0; }
  .codigo-generado {
    background: #F0FDF4;
    border: 1px solid #BBF7D0;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .codigo-label { font-size: 0.85rem; font-weight: 700; color: var(--c-primary); margin: 0; }
  .codigo-pub   { font-size: 0.82rem; color: var(--c-text); margin: 0; }
  .codigo-priv  { font-size: 0.82rem; color: var(--c-text); margin: 0; }
  .codigo-priv-valor {
    font-family: monospace;
    font-size: 1.1rem;
    letter-spacing: 0.15em;
    color: var(--c-primary);
  }
  .codigo-aviso { font-size: 0.72rem; color: #92400E; margin: 0; }

  /* Selector global de localidad */
  .loc-global-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px;
    background: rgba(27,107,58,0.06);
    border-bottom: 1px solid var(--c-border);
  }
  .loc-global-bar svg { color: var(--c-primary); flex-shrink: 0; }
  .loc-global-select {
    flex: 1; border: none; background: transparent;
    font-size: 0.85rem; font-weight: 600; color: var(--c-primary);
    font-family: var(--f-ui); cursor: pointer;
    -webkit-appearance: none; appearance: none;
  }
  .loc-global-select:focus { outline: none; }
  .loc-clear {
    background: none; border: none; color: var(--c-text-light);
    font-size: 0.75rem; cursor: pointer; padding: 2px 4px;
    border-radius: 4px; flex-shrink: 0;
  }
  .loc-clear:hover { background: var(--c-border); }

  /* Filtros admin — chips de estado/rol */
  .admin-filters {
    display: flex; gap: 6px; margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .filter-chip {
    padding: 5px 12px; border-radius: 99px;
    border: 1.5px solid var(--c-border);
    background: var(--c-surface);
    font-size: 0.75rem; font-weight: 700;
    color: var(--c-text-mid); cursor: pointer;
    transition: all 0.15s; font-family: var(--f-ui);
    white-space: nowrap;
  }
  .filter-chip.active {
    background: var(--c-primary); border-color: var(--c-primary); color: white;
  }
  .filter-chip:active { transform: scale(0.95); }

  /* Búsqueda usuarios */
  .admin-search-row { margin-bottom: 10px; }
  .admin-search { font-size: 0.85rem; padding: 10px 14px; }

  .loc-sub {
    color: var(--c-text-light) !important;
    font-size: 0.7rem !important;
  }
  .estado-chip {
    font-size: 0.7rem; font-weight: 700; padding: 3px 8px;
    border-radius: 99px; white-space: nowrap;
  }
  .estado-verificado { background: #D1FAE5; color: #065F46; }
  .estado-rechazado  { background: #FEE2E2; color: #991B1B; }
  .estado-pendiente  { background: #FEF3C7; color: #92400E; }

  /* Botones usuario */
  .user-btns { display: flex; gap: 6px; flex-shrink: 0; }
  .btn-estado {
    padding: 6px 10px; border-radius: var(--r-full);
    border: 1.5px solid var(--c-border); background: var(--c-surface);
    font-size: 11px; font-weight: 700; cursor: pointer;
    font-family: var(--f-ui); white-space: nowrap;
    display: flex; align-items: center; gap: 4px;
    transition: all 0.15s;
  }
  .btn-estado.estado-activo     { border-color: #059669; color: #059669; }
  .btn-estado.estado-suspendido { border-color: #F59E0B; color: #92400E; background: #FFFBEB; }
  .btn-estado.estado-bloqueado  { border-color: #DC2626; color: #DC2626; background: #FEF2F2; }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 24px;
    gap: 8px;
    color: var(--c-text-muted);
    font-size: 0.88rem;
  }
  .empty-icon { font-size: 2.5rem; }
  .loading-msg { text-align: center; color: var(--c-text-muted); padding: 32px; font-size: 0.88rem; }

  /* Toast */
  .toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--c-text);
    color: white;
    font-size: 0.82rem;
    font-weight: 600;
    padding: 10px 20px;
    border-radius: 99px;
    white-space: nowrap;
    box-shadow: var(--s-md);
    z-index: 999;
    animation: toastIn 0.2s ease;
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>