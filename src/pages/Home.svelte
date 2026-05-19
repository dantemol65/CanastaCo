<script>
  // ── Imports ───────────────────────────────────────────────────────────────
  import { onMount } from 'svelte'
  import { writable } from 'svelte/store'
  import { currentUser, userProfile, currentPage, pendingSync, syncPendingProfile } from '../stores/auth.js'
  import { totalNoLeidas, cargarNotificaciones } from '../stores/notificaciones.js'
  import { cargarFotoCacheada } from '../lib/fotocache.js'
  import { localidades as allLocalidades } from '../data/argentina.js'
  import { productos, cargarProductos, CATEGORIAS } from '../stores/precios.js'
  import { cargarSolicitudes } from '../stores/listas_compras.js'
  import { productoSolicitadoSeleccionado } from '../stores/contexto.js'
  import BottomNav from '../components/BottomNav.svelte'

  // ── Conectividad ──────────────────────────────────────────────────────────
  const offline = writable(false)

  async function checkConexion() {
    try {
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), 3000)
      await fetch('https://www.google.com/generate_204', {
        mode: 'no-cors', signal: ctrl.signal, cache: 'no-store'
      })
      offline.set(false)
    } catch {
      offline.set(true)
    }
  }

  // ── Reactivos ─────────────────────────────────────────────────────────────
  $: user    = $currentUser
  $: profile = $userProfile

  // Recargar solicitudes cada vez que Home se vuelve la página activa
  $: if ($currentPage === 'home') {
    cargarSolicitudesHome()
  }

  $: displayName  = profile?.alias || user?.displayName?.split(' ')[0] || 'Usuario'
  $: displayPhoto = profile?.foto  || user?.photoURL || cargarFotoCacheada() || ''

  $: localidadNombre = (() => {
    if (!profile?.localidad) return 'tu zona'
    const deptId = profile.departamento || ''
    const locId  = profile.localidad
    const locs   = allLocalidades[deptId] || []
    return locs.find(l => l.id === locId)?.nombre || profile.localidad
  })()

  // ── Módulos ───────────────────────────────────────────────────────────────
  const modulos = [
    {
      id: 2, icon: '🏪', titulo: 'Comercios',
      desc: 'Explorá comercios de tu zona, verificalos y agregá nuevos.',
      color: '#1B6B3A', disponible: true, pagina: 'buscar',
    },
    {
      id: 3, icon: '🏷️', titulo: 'Precios',
      desc: 'Consultá, cargá y comparás precios entre comercios de tu localidad.',
      color: '#0277BD', disponible: true, pagina: 'publicar',
    },
    {
      id: 4, icon: '📊', titulo: 'Estadísticas',
      desc: 'Mirá cómo evolucionan los precios en tu barrio.',
      color: '#E65100', disponible: false,
    },
    {
      id: 5, icon: '🤖', titulo: 'Asistente IA',
      desc: 'Cargá listas por voz o foto con ayuda de inteligencia artificial.',
      color: '#6A1B9A', disponible: false,
    },
  ]

  // ── Solicitudes de la comunidad ───────────────────────────────────────────
  let solicitudes     = []
  let solExpandido    = false
  let solSeleccionado = null
  let avisoProd       = false
  let avisoTimer      = null

  async function cargarSolicitudesHome() {
    if (!profile?.localidad) return
    solicitudes = await cargarSolicitudes(profile.localidad)
  }

  function seleccionarSolicitado(sol) {
    solSeleccionado = sol
    productoSolicitadoSeleccionado.set(sol)
    avisoProd = true
    clearTimeout(avisoTimer)
    avisoTimer = setTimeout(() => { avisoProd = false }, 4000)
  }

  function cancelarSeleccionado() {
    solSeleccionado = null
    productoSolicitadoSeleccionado.set(null)
    avisoProd = false
    clearTimeout(avisoTimer)
  }

  // ── Buscador de productos ─────────────────────────────────────────────────
  let busquedaProd = ''
  let prodCargados = false
  let cargandoProd = false

  $: resultadosBusq = busquedaProd.trim().length >= 2
    ? $productos.filter(p =>
        p.nombre?.toLowerCase().includes(busquedaProd.toLowerCase()) ||
        p.marca?.toLowerCase().includes(busquedaProd.toLowerCase())
      ).slice(0, 8)
    : []

  async function cargarCatalogo() {
    if (prodCargados || !profile?.localidad) return
    cargandoProd = true
    await cargarProductos(profile.localidad)
    prodCargados = true
    cargandoProd = false
  }

  function irComparador(productoId) {
    currentPage.set('comparador:' + productoId + '__home')
  }

  function catEmoji(id) {
    return CATEGORIAS.find(c => c.id === id)?.emoji || '📦'
  }

  // ── Navegación ────────────────────────────────────────────────────────────
  function goToPerfil() { currentPage.set('perfil') }
  function goAdmin()    { currentPage.set('admin') }
  function goMisListas(){ currentPage.set('mis-listas') }

  // ── Mount ─────────────────────────────────────────────────────────────────
  onMount(() => {
    checkConexion()
    window.addEventListener('online',  checkConexion)
    window.addEventListener('offline', () => offline.set(true))
    const interval = setInterval(checkConexion, 30000)
    cargarNotificaciones()
    const foto = cargarFotoCacheada()
    cargarSolicitudesHome()
    return () => {
      window.removeEventListener('online',  checkConexion)
      window.removeEventListener('offline', () => offline.set(true))
      clearInterval(interval)
    }
  })
</script>

<div class="app-shell home-shell">

  <!-- Header -->
  <header class="home-header">
    <div class="header-inner">
      <div class="header-left">
        <div class="brand-home">Canasta<span class="accent-dot">.co</span></div>
        {#if localidadNombre}
          <div class="location-pill">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            {localidadNombre}
          </div>
        {/if}
      </div>

      {#if $userProfile?.rol === 'admin'}
        <button class="btn-admin" on:click={goAdmin} aria-label="Panel admin">
          ⚙️
          {#if $totalNoLeidas > 0}
            <span class="admin-notif-badge">{$totalNoLeidas}</span>
          {/if}
        </button>
      {/if}

      <!-- Campanita de notificaciones para todos los usuarios -->
      <button class="btn-notif" on:click={() => currentPage.set('notificaciones')} aria-label="Notificaciones">
        🔔
        {#if $totalNoLeidas > 0}
          <span class="notif-badge">{$totalNoLeidas}</span>
        {/if}
      </button>

      <button class="avatar-btn" on:click={goToPerfil} aria-label="Mi perfil">
        {#if displayPhoto}
          <img src={displayPhoto} alt={displayName} class="avatar header-avatar" width="40" height="40" />
        {:else}
          <div class="avatar-fallback">
            {displayName.charAt(0).toUpperCase()}
          </div>
        {/if}
      </button>
    </div>
  </header>

  {#if $offline}
    <div class="offline-banner-home">
      📵 Sin conexión — mostrando datos guardados
    </div>
  {/if}

  {#if $pendingSync}
    <button class="sync-banner" on:click={syncPendingProfile}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      Cambios guardados localmente · Tocá para sincronizar
    </button>
  {/if}

  <!-- Scroll area -->
  <div class="scroll-area home-scroll">
    <div class="home-content fade-in">

      <!-- Saludo -->
      <section class="greeting-section">
        <h1 class="greeting-title">¡Hola, <em>{displayName}</em>!</h1>
        <p class="greeting-sub">Comercios y precios de tu localidad</p>
      </section>

      <!-- Buscador de productos -->
      <section class="busq-section">
        <div class="busq-input-wrap">
          <svg class="busq-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            class="busq-input"
            placeholder="Buscá un producto y comparás precios…"
            bind:value={busquedaProd}
            on:focus={cargarCatalogo}
            autocomplete="off"
            autocorrect="off"
          />
          {#if busquedaProd}
            <button class="busq-clear" on:click={() => busquedaProd = ''} aria-label="Limpiar">✕</button>
          {/if}
        </div>
        {#if cargandoProd}
          <div class="busq-loading">
            <div class="spinner" style="width:18px;height:18px;border-width:2px;border-top-color:var(--c-primary)"></div>
            <span>Cargando catálogo…</span>
          </div>
        {:else if resultadosBusq.length > 0}
          <div class="busq-resultados">
            {#each resultadosBusq as prod (prod.id)}
              <button class="busq-item" on:click={() => irComparador(prod.id)}>
                <span class="busq-emoji">{catEmoji(prod.categoria)}</span>
                <div class="busq-info">
                  <span class="busq-nombre">{prod.nombre}</span>
                  {#if prod.marca}<span class="busq-marca">{prod.marca}</span>{/if}
                </div>
                <div class="busq-right">
                  <span class="busq-unidad">{prod.unidad}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-light)" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </button>
            {/each}
          </div>
        {:else if busquedaProd.trim().length >= 2}
          <div class="busq-empty">Sin resultados para "<strong>{busquedaProd}</strong>" en tu localidad</div>
        {/if}
      </section>

      <!-- Banner solicitudes comunidad -->
      {#if solicitudes.length > 0}
        <div class="sol-banner-home">
          <button
            class="sol-banner-header"
            on:click={() => solExpandido = !solExpandido}
            aria-expanded={solExpandido}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span class="sol-banner-texto">
              La comunidad necesita {solicitudes.length} producto{solicitudes.length !== 1 ? 's' : ''} —
              <strong>¿podés ayudar?</strong>
            </span>
            <svg class="sol-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#92400E" stroke-width="2.5" stroke-linecap="round"
              style="transform: rotate({solExpandido ? 180 : 0}deg); transition: transform 0.2s">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {#if solExpandido}
            <div class="sol-lista-home">
              <p class="sol-desc-home">
                Tocá un producto para seleccionarlo, luego ir a Comercios y elegí dónde lo encontraste.
              </p>
              {#each solicitudes as sol}
                <button
                  class="sol-item-btn"
                  class:seleccionado={solSeleccionado?.solicitudId === sol.id}
                  on:click={() => seleccionarSolicitado({ nombre: sol.nombre, solicitudId: sol.id })}
                >
                  <span class="sol-nombre">{sol.nombre}</span>
                  <div class="sol-item-right">
                    <span class="sol-votos-chip">{sol.votos} {sol.votos === 1 ? 'pedido' : 'pedidos'}</span>
                    {#if solSeleccionado?.solicitudId === sol.id}
                      <span class="sol-check">✓</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Aviso flotante producto seleccionado -->
      {#if avisoProd && solSeleccionado}
        <div class="aviso-prod-sel" role="status">
          <span class="aviso-prod-texto"><strong>{solSeleccionado.nombre}</strong> seleccionado</span>
          <span class="aviso-prod-sub">Ahora ir a Comercios y elegí dónde lo viste</span>
          <button class="aviso-cancelar" on:click={cancelarSeleccionado}>✕</button>
        </div>
      {/if}

      <!-- Mis Listas -->
      <button class="mis-listas-btn" on:click={goMisListas}>
        <div class="mls-icon">🛒</div>
        <div class="mls-info">
          <span class="mls-titulo">Mis Listas</span>
          <span class="mls-sub">Organizá tu compra y encontrá los mejores precios</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2.5" stroke-linecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      <!-- Módulos completados -->
      {#each [
        { num: 1, label: 'Login y Perfil' },
        { num: 2, label: 'Comercios' },
        { num: 3, label: 'Precios' },
      ] as m}
        <div class="module-done">
          <div class="module-done-icon">✓</div>
          <div class="module-done-text">
            <span class="module-done-num">Módulo {m.num}</span>
            <span class="module-done-label">{m.label}</span>
          </div>
          <div class="module-done-badge">
            <span class="badge badge-green">Completo</span>
          </div>
        </div>
      {/each}

      <!-- Próximos módulos -->
      <section class="modules-section">
        <div class="section-header">
          <h2 class="section-title">Módulos</h2>
        </div>

        <div class="modules-grid">
          {#each modulos as mod}
            <svelte:element
              this={mod.disponible ? 'button' : 'div'}
              class="module-card"
              class:module-available={mod.disponible}
              style="--mod-color: {mod.color}"
              role={mod.disponible ? 'button' : undefined}
              aria-label={mod.disponible ? 'Ir a ' + mod.titulo : undefined}
              on:click={() => mod.disponible && mod.pagina && currentPage.set(mod.pagina)}
            >
              <div class="module-icon">{mod.icon}</div>
              <div class="module-info">
                <div class="module-num">Módulo {mod.id}</div>
                <div class="module-title">{mod.titulo}</div>
                <p class="module-desc">{mod.desc}</p>
              </div>
              {#if mod.disponible}
                <div class="module-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              {:else}
                <div class="module-lock" aria-label="No disponible aún">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
              {/if}
            </svelte:element>
          {/each}
        </div>
      </section>

      <!-- Info card -->
      <div class="info-card">
        <div class="info-icon">💡</div>
        <div>
          <strong>¿Cómo funciona?</strong>
          <p>Los usuarios cargamos precios de los comercios del barrio. Entre todos encontramos dónde comprar más barato. Sin publicidad, sin fines de lucro.</p>
        </div>
      </div>

    </div>
  </div>

  <!-- Bottom Navigation -->
  <BottomNav active="home" />

</div>

<style>
  .home-shell {
    background: var(--c-bg);
    display: flex;
    flex-direction: column;
  }

  /* ── Header ── */
  .offline-banner-home {
    background: #FEF3C7;
    border-bottom: 1px solid #FDE68A;
    color: #92400E;
    font-size: 0.78rem;
    font-weight: 600;
    padding: 8px 16px;
    text-align: center;
  }

  .sync-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #FFF8E1;
    color: #E65100;
    font-size: 0.78rem;
    font-weight: 500;
    padding: 10px 16px;
    cursor: pointer;
    border-bottom: 1px solid #FFE082;
  }
  .sync-banner:hover { background: #FFF3CD; }

  .btn-admin {
    position: relative;
    background: rgba(255,255,255,0.2);
    border: none;
    border-radius: 10px;
    width: 36px;
    height: 36px;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-notif {
    position: relative;
    background: none; border: none;
    font-size: 20px; cursor: pointer;
    padding: 4px; line-height: 1;
    -webkit-tap-highlight-color: transparent;
  }
  .notif-badge {
    position: absolute; top: -2px; right: -4px;
    background: #DC2626; color: white;
    font-size: 10px; font-weight: 800;
    min-width: 16px; height: 16px;
    border-radius: 8px; padding: 0 4px;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--f-ui);
  }

  .admin-notif-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #EF4444;
    color: white;
    font-size: 0.55rem;
    font-weight: 800;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .home-header {
    position: sticky; top: 0; z-index: 20;
    background: var(--c-primary);
    padding-top: env(safe-area-inset-top, 0);
  }

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .brand-home {
    font-family: var(--f-brand);
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    line-height: 1;
  }
  .accent-dot { color: var(--c-accent); }

  .location-pill {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 600;
    color: rgba(255,255,255,0.75);
    letter-spacing: 0.02em;
  }

  .avatar-btn {
    background: none; border: none; cursor: pointer; padding: 0;
    border-radius: 50%;
    transition: transform 0.15s;
  }
  .avatar-btn:active { transform: scale(0.93); }

  .header-avatar {
    border: 2px solid rgba(255,255,255,0.4);
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }

  .avatar-fallback {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: var(--c-accent);
    border: 2px solid rgba(255,255,255,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700; color: white;
  }

  /* ── Scroll area ── */
  .home-scroll {
    flex: 1;
    padding-bottom: calc(var(--nav-h) + 16px + env(safe-area-inset-bottom, 0px));
  }

  .home-content {
    padding: 0 16px 16px;
    max-width: 440px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Greeting ── */
  .greeting-section { padding-top: 24px; }

  .greeting-title {
    font-family: var(--f-brand);
    font-size: 30px;
    font-weight: 700;
    color: var(--c-text);
    line-height: 1.1;
  }
  .greeting-title em {
    font-style: italic;
    color: var(--c-primary);
  }
  .greeting-sub {
    font-size: 15px;
    color: var(--c-text-mid);
    margin-top: 6px;
  }

  /* ── Módulo completado ── */
  .module-done {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--c-surface);
    border: 1.5px solid rgba(27,107,58,0.2);
    border-radius: var(--r-xl);
    padding: 16px 18px;
    box-shadow: var(--s-sm);
  }

  .module-done-icon {
    width: 42px; height: 42px;
    border-radius: 12px;
    background: var(--c-primary);
    color: white;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 700;
    flex-shrink: 0;
  }

  .module-done-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .module-done-num {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--c-text-light);
    font-weight: 700;
  }
  .module-done-label {
    font-size: 15px;
    font-weight: 700;
    color: var(--c-text);
  }

  /* ── Módulos próximos ── */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section-title {
    font-family: var(--f-brand);
    font-size: 20px;
    font-weight: 700;
    color: var(--c-text);
  }

  .modules-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .module-available {
    cursor: pointer;
    border-color: var(--mod-color) !important;
  }
  .module-available:active { transform: scale(0.97); }
  .module-arrow { color: var(--mod-color); }

  .module-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    padding: 14px 16px;
    opacity: 0.7;
    position: relative;
    overflow: hidden;
  }
  .module-card::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: var(--mod-color);
    border-radius: 3px 0 0 3px;
  }

  .module-icon {
    font-size: 26px;
    width: 44px; height: 44px;
    border-radius: 12px;
    background: var(--c-surface-2);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .module-info { flex: 1; min-width: 0; }
  .module-num {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--c-text-light);
    font-weight: 700;
  }
  .module-title { font-size: 14px; font-weight: 700; color: var(--c-text); }
  .module-desc  { font-size: 12px; color: var(--c-text-mid); line-height: 1.4; margin-top: 2px; }

  .module-lock {
    color: var(--c-text-light);
    flex-shrink: 0;
    padding: 6px;
    border-radius: 8px;
    background: var(--c-surface-2);
  }

  /* ── Info card ── */
  .info-card {
    display: flex;
    gap: 14px;
    background: linear-gradient(135deg, rgba(27,107,58,0.06) 0%, rgba(245,163,33,0.06) 100%);
    border: 1px solid rgba(27,107,58,0.12);
    border-radius: var(--r-lg);
    padding: 18px;
  }
  .info-icon { font-size: 28px; flex-shrink: 0; }
  .info-card strong {
    font-size: 14px; font-weight: 700; color: var(--c-text);
    display: block; margin-bottom: 6px;
  }
  .info-card p { font-size: 13px; color: var(--c-text-mid); line-height: 1.55; }

  /* ── Buscador de productos ─────────────────────────────────── */
  .busq-section { margin: 0; }
  .busq-input-wrap {
    display: flex; align-items: center; gap: 10px;
    background: var(--c-surface); border: 1.5px solid var(--c-border);
    border-radius: var(--r-xl); padding: 12px 16px; box-shadow: var(--s-xs);
  }
  .busq-input-wrap:focus-within { border-color: var(--c-primary); box-shadow: 0 0 0 3px rgba(27,107,58,0.10); }
  .busq-icon  { color: var(--c-text-light); flex-shrink: 0; }
  .busq-input { flex: 1; border: none; background: transparent; font-family: var(--f-ui); font-size: 15px; color: var(--c-text); }
  .busq-input::placeholder { color: var(--c-text-light); }
  .busq-input:focus { outline: none; }
  .busq-clear { background: none; border: none; color: var(--c-text-light); font-size: 13px; cursor: pointer; padding: 2px 4px; flex-shrink: 0; }
  .busq-loading { display: flex; align-items: center; gap: 10px; padding: 14px 4px; font-size: 13px; color: var(--c-text-light); }
  .busq-resultados { margin-top: 8px; background: var(--c-surface); border-radius: var(--r-lg); border: 1px solid var(--c-border); overflow: hidden; box-shadow: var(--s-sm); }
  .busq-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--c-border); cursor: pointer; transition: background 0.15s; -webkit-tap-highlight-color: transparent; }
  .busq-item:last-child { border-bottom: none; }
  .busq-item:active { background: var(--c-surface-2); }
  .busq-emoji { font-size: 18px; flex-shrink: 0; }
  .busq-info  { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .busq-nombre { font-size: 14px; font-weight: 700; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .busq-marca  { font-size: 11px; color: var(--c-text-light); }
  .busq-right  { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .busq-unidad { font-size: 11px; color: var(--c-text-light); background: var(--c-surface-2); padding: 2px 7px; border-radius: var(--r-full); }
  .busq-empty  { padding: 14px 4px; font-size: 13px; color: var(--c-text-light); text-align: center; }
  .busq-empty strong { color: var(--c-text); }

  /* ── Banner solicitudes en Home ─────────────────────────────── */
  .sol-banner-home { background: #FFFBEB; border: 1.5px solid #F59E0B; border-radius: var(--r-xl); overflow: hidden; }
  .sol-banner-header { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px; background: none; border: none; cursor: pointer; font-family: var(--f-ui); text-align: left; -webkit-tap-highlight-color: transparent; }
  .sol-banner-header:active { background: rgba(245,163,33,0.1); }
  .sol-banner-texto { flex: 1; font-size: 13px; color: #92400E; }
  .sol-banner-texto strong { color: #78350F; }
  .sol-lista-home { padding: 0 12px 12px; }
  .sol-desc-home  { font-size: 12px; color: #92400E; padding: 4px 0 10px; line-height: 1.5; }
  .sol-item-btn {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; padding: 10px 10px; margin-bottom: 4px;
    background: white; border: 1.5px solid rgba(245,163,33,0.3); border-radius: var(--r-md);
    cursor: pointer; font-family: var(--f-ui); text-align: left; transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .sol-item-btn:active { transform: scale(0.98); }
  .sol-item-btn.seleccionado { border-color: var(--c-primary); background: rgba(27,107,58,0.06); }
  .sol-nombre  { font-size: 14px; font-weight: 700; color: var(--c-text); }
  .sol-item-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .sol-votos-chip { font-size: 11px; font-weight: 700; color: #92400E; background: rgba(245,163,33,0.2); padding: 2px 8px; border-radius: var(--r-full); }
  .sol-check { font-size: 14px; color: var(--c-primary); font-weight: 700; }

  /* Aviso flotante */
  .aviso-prod-sel {
    position: fixed; bottom: calc(var(--nav-h) + env(safe-area-inset-bottom,0px) + 12px);
    left: 50%; transform: translateX(-50%);
    width: calc(100% - 32px); max-width: 400px;
    background: var(--c-primary); color: white; border-radius: var(--r-lg);
    padding: 12px 14px; display: flex; flex-direction: column; gap: 2px;
    box-shadow: var(--s-lg); z-index: 150;
    animation: slideUp 0.25s ease;
  }
  @keyframes slideUp { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  .aviso-prod-texto { font-size: 14px; font-weight: 700; padding-right: 24px; }
  .aviso-prod-sub   { font-size: 12px; opacity: 0.85; }
  .aviso-cancelar   { position: absolute; top: 10px; right: 12px; background: none; border: none; color: white; font-size: 14px; cursor: pointer; opacity: 0.7; padding: 2px 4px; }

  /* ── Botón Mis Listas ───────────────────────────────────────── */
  .mis-listas-btn {
    display: flex; align-items: center; gap: 14px; padding: 16px; width: 100%;
    text-align: left; background: var(--c-surface); border: 1.5px solid var(--c-primary);
    border-radius: var(--r-xl); cursor: pointer; transition: all 0.15s;
    box-shadow: var(--s-xs); -webkit-tap-highlight-color: transparent;
  }
  .mis-listas-btn:active { transform: scale(0.98); background: rgba(27,107,58,0.04); }
  .mls-icon  { font-size: 24px; width: 46px; height: 46px; background: rgba(27,107,58,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .mls-info  { flex: 1; min-width: 0; text-align: left; }
  .mls-titulo { display: block; font-size: 15px; font-weight: 700; color: var(--c-primary); }
  .mls-sub    { display: block; font-size: 12px; color: var(--c-text-light); margin-top: 2px; line-height: 1.4; }

</style>