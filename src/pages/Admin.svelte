<script>
  import { onMount } from 'svelte'
  import { currentPage, currentUser, userProfile } from '../stores/auth.js'
  import {
    notificaciones, totalNoLeidas,
    cargarNotificaciones, marcarLeida, marcarTodasLeidas,
    TIPOS_NOTIF
  } from '../stores/notificaciones.js'
  import {
    collection, getDocs, query, where, orderBy,
    doc, updateDoc, serverTimestamp
  } from 'firebase/firestore'
  import { db } from '../lib/firebase.js'
  import { generarCredencial } from '../stores/comercios.js'
  import { generarPDFCredencial } from '../lib/credencial.js'

  // Verificar que sea admin
  $: if ($userProfile && $userProfile.rol !== 'admin') {
    currentPage.set('home')
  }

  let seccion = 'notificaciones'  // notificaciones | comercios | usuarios | credencial
  let cargando = false
  let offline  = !navigator.onLine

  // Detectar cambios de conexión
  if (typeof window !== 'undefined') {
    window.addEventListener('online',  () => offline = false)
    window.addEventListener('offline', () => offline = true)
  }

  // Datos
  let comerciosPendientes = []
  let usuariosLista       = []
  let comercioCredencial  = null
  let generandoPDF        = false
  let codigoGenerado      = null
  let busquedaComercio    = ''

  onMount(async () => {
    await cargarNotificaciones()
  })

  async function irSeccion(s) {
    seccion = s
    cargando = true
    try {
      if (s === 'comercios') await cargarComerciosPendientes()
      if (s === 'usuarios')  await cargarUsuarios()
    } finally {
      cargando = false
    }
  }

  async function cargarComerciosPendientes() {
    if (!navigator.onLine) { comerciosPendientes = []; return }
    try {
      const q = query(
        collection(db, 'comercios'),
        where('estado', '==', 'pendiente')
      )
      const snap = await getDocs(q)
      comerciosPendientes = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.creadoEn?.toDate?.() || 0) - (a.creadoEn?.toDate?.() || 0))
    } catch (e) {
      console.error('cargarComerciosPendientes:', e)
      comerciosPendientes = []
    }
  }

  async function cargarUsuarios() {
    if (!navigator.onLine) { usuariosLista = []; return }
    try {
      const snap = await getDocs(collection(db, 'usuarios'))
      usuariosLista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (e) {
      console.error('cargarUsuarios:', e)
      usuariosLista = []
    }
  }

  async function aprobarComercio(id, nombre) {
    await updateDoc(doc(db, 'comercios', id), {
      estado:     'verificado',
      reputacion: 50,
      verificadoEn: serverTimestamp(),
    })
    comerciosPendientes = comerciosPendientes.filter(c => c.id !== id)
    mostrarToast(`"${nombre}" verificado`)
  }

  async function rechazarComercio(id, nombre) {
    if (!confirm(`¿Rechazar "${nombre}"? Esta acción no se puede deshacer.`)) return
    await updateDoc(doc(db, 'comercios', id), { estado: 'rechazado' })
    comerciosPendientes = comerciosPendientes.filter(c => c.id !== id)
    mostrarToast(`"${nombre}" rechazado`)
  }

  async function cambiarRol(uid, rolActual) {
    const roles = ['usuario', 'dedicado', 'admin']
    const nuevoRol = prompt(`Rol actual: ${rolActual}\nNuevo rol (usuario/dedicado/admin):`)
    if (!nuevoRol || !roles.includes(nuevoRol)) return
    await updateDoc(doc(db, 'usuarios', uid), { rol: nuevoRol })
    usuariosLista = usuariosLista.map(u => u.id === uid ? { ...u, rol: nuevoRol } : u)
    mostrarToast('Rol actualizado')
  }

  async function desbloquearComercio(id, nombre) {
    await updateDoc(doc(db, 'comercios', id), {
      reclamoBloqueado: false,
      intentosFallidos: 0,
    })
    mostrarToast(`"${nombre}" desbloqueado`)
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
    } finally {
      cargando = false
    }
  }

  async function handleGenerarCredencial() {
    if (!comercioCredencial) return
    generandoPDF = true
    try {
      const { codigoPublico, codigoPrivado } = await generarCredencial(comercioCredencial.id)
      codigoGenerado = { codigoPublico, codigoPrivado }

      // Generar y descargar PDF
      const pdf = await generarPDFCredencial({
        comercio:     comercioCredencial,
        codigoPublico,
        codigoPrivado,
      })
      pdf.save(`credencial-${comercioCredencial.nombre.replace(/\s+/g, '-')}.pdf`)
      mostrarToast('Credencial generada y descargada')
    } catch (e) {
      mostrarToast('Error al generar credencial: ' + e.message)
    } finally {
      generandoPDF = false
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────

  let toastMsg = ''
  function mostrarToast(msg) {
    toastMsg = msg
    setTimeout(() => toastMsg = '', 3000)
  }

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

  <!-- Nav interna -->
  <nav class="admin-nav">
    {#each [
      { id:'notificaciones', label:'Notif.', icon:'🔔', badge: $totalNoLeidas },
      { id:'comercios',      label:'Comercios', icon:'🏪' },
      { id:'usuarios',       label:'Usuarios', icon:'👥' },
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

    <!-- ── Comercios pendientes ───────────────────────────────────────── -->
    {:else if seccion === 'comercios'}
      <h2 class="section-title">Comercios pendientes</h2>

      {#if cargando}
        <div class="loading-msg">Cargando…</div>
      {:else if offline}
        <div class="empty-state">
          <div class="empty-icon">📵</div>
          <p>Sin conexión — no disponible offline</p>
        </div>
      {:else if comerciosPendientes.length === 0}
        <div class="empty-state">
          <div class="empty-icon">✅</div>
          <p>Sin comercios pendientes</p>
        </div>
      {:else}
        <div class="items-lista">
          {#each comerciosPendientes as c (c.id)}
            <div class="item-card">
              <div class="item-info">
                <p class="item-nombre">{c.nombre}</p>
                <p class="item-sub">{c.tipo} · {c.direccion || 'Sin dirección'}</p>
                {#if c.creadoEn}
                  <p class="item-fecha">{formatFecha(c.creadoEn)}</p>
                {/if}
                {#if c.reclamoBloqueado}
                  <button class="btn-desbloquear" on:click={() => desbloquearComercio(c.id, c.nombre)}>
                    🔓 Desbloquear reclamo
                  </button>
                {/if}
              </div>
              <div class="item-acciones">
                <button class="btn-aprobar" on:click={() => aprobarComercio(c.id, c.nombre)}>✓</button>
                <button class="btn-rechazar" on:click={() => rechazarComercio(c.id, c.nombre)}>✕</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Usuarios ───────────────────────────────────────────────────── -->
    {:else if seccion === 'usuarios'}
      <h2 class="section-title">Usuarios ({usuariosLista.length})</h2>

      {#if cargando}
        <div class="loading-msg">Cargando…</div>
      {:else if offline}
        <div class="empty-state">
          <div class="empty-icon">📵</div>
          <p>Sin conexión — no disponible offline</p>
        </div>
      {:else}
        <div class="items-lista">
          {#each usuariosLista as u (u.id)}
            <div class="item-card">
              <div class="item-info">
                <p class="item-nombre">{u.alias || u.email}</p>
                <p class="item-sub">{u.email}</p>
                <span class="rol-chip rol-{u.rol || 'usuario'}">{u.rol || 'usuario'}</span>
              </div>
              <button class="btn-rol" on:click={() => cambiarRol(u.id, u.rol || 'usuario')}>
                Cambiar rol
              </button>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Credencial ─────────────────────────────────────────────────── -->
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