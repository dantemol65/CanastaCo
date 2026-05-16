<script>
  import { currentUser, userProfile, currentPage, pendingSync, syncPendingProfile } from '../stores/auth.js'
  import { totalNoLeidas, cargarNotificaciones } from '../stores/notificaciones.js'
  import { cargarFotoCacheada } from '../lib/fotocache.js'
  import { onMount } from 'svelte'
  import { writable } from 'svelte/store'

  const offline = writable(false)

  // Verificación real de conectividad — navigator.onLine no es confiable
  // cuando hay red local sin internet
  async function checkConexion() {
    try {
      // Fetch a un recurso mínimo de Google con timeout corto
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

  onMount(() => {
    checkConexion()
    window.addEventListener('online',  checkConexion)
    window.addEventListener('offline', () => offline.set(true))
    // Verificar cada 30 segundos
    const interval = setInterval(checkConexion, 30000)
    return () => {
      window.removeEventListener('online',  checkConexion)
      window.removeEventListener('offline', () => offline.set(true))
      clearInterval(interval)
    }
  })
  import BottomNav from '../components/BottomNav.svelte'
  import { productos, cargarProductos, CATEGORIAS } from '../stores/precios.js'

  $: user    = $currentUser
  $: profile = $userProfile

  $: displayName  = profile?.alias || user?.displayName?.split(' ')[0] || 'Usuario'
  $: displayPhoto = profile?.foto  || user?.photoURL || cargarFotoCacheada() || ''
  $: localidad    = profile?.localidad
    ? profile.localidad.split('-').pop()  // ID final, mejoramos con datos reales
    : 'tu localidad'

  // Obtener nombre legible de localidad
  import { localidades as allLocalidades } from '../data/argentina.js'
  $: localidadNombre = (() => {
    if (!profile?.localidad) return 'tu zona'
    const deptId = profile.departamento || ''
    const locId  = profile.localidad
    const locs   = allLocalidades[deptId] || []
    return locs.find(l => l.id === locId)?.nombre || profile.localidad
  })()

  const modulos = [
    {
      id: 2,
      icon: '🏪',
      titulo: 'Comercios',
      desc: 'Explorá comercios de tu zona, verificalos y agregá nuevos.',
      color: '#1B6B3A',
      disponible: true,
      pagina: 'buscar',
    },
    {
      id: 3,
      icon: '🏷️',
      titulo: 'Precios',
      desc: 'Consultá, cargá y comparás precios entre comercios de tu localidad.',
      color: '#0277BD',
      disponible: true,
      pagina: 'publicar',
    },
    {
      id: 4,
      icon: '📊',
      titulo: 'Estadísticas',
      desc: 'Mirá cómo evolucionan los precios en tu barrio.',
      color: '#E65100',
      disponible: false,
    },
    {
      id: 5,
      icon: '🤖',
      titulo: 'Asistente IA',
      desc: 'Cargá listas por voz o foto con ayuda de inteligencia artificial.',
      color: '#6A1B9A',
      disponible: false,
    },
  ]

  onMount(() => { cargarNotificaciones() })

  function goToPerfil() { currentPage.set('perfil') }
  function goAdmin()    { currentPage.set('admin') }

  // ── Buscador de productos ─────────────────────────────────────────────
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
          <div class="busq-empty">
            Sin resultados para "<strong>{busquedaProd}</strong>" en tu localidad
          </div>
        {/if}
      </section>

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

  /* ── Buscador de productos ─────────────────────────────────────────── */
  .busq-section { margin: 0; }

  .busq-input-wrap {
    display: flex; align-items: center; gap: 10px;
    background: var(--c-surface); border: 1.5px solid var(--c-border);
    border-radius: var(--r-xl); padding: 12px 16px;
    box-shadow: var(--s-xs);
    transition: border-color 0.18s, box-shadow 0.18s;
  }
  .busq-input-wrap:focus-within {
    border-color: var(--c-primary);
    box-shadow: 0 0 0 3px rgba(27,107,58,0.10), var(--s-sm);
  }
  .busq-icon { color: var(--c-text-light); flex-shrink: 0; }
  .busq-input {
    flex: 1; border: none; background: transparent;
    font-family: var(--f-ui); font-size: 15px; color: var(--c-text);
  }
  .busq-input::placeholder { color: var(--c-text-light); }
  .busq-input:focus { outline: none; }
  .busq-clear {
    background: none; border: none; color: var(--c-text-light);
    font-size: 13px; cursor: pointer; padding: 2px 4px; flex-shrink: 0;
  }
  .busq-loading {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 4px; font-size: 13px; color: var(--c-text-light);
  }
  .busq-resultados {
    margin-top: 8px; background: var(--c-surface);
    border-radius: var(--r-lg); border: 1px solid var(--c-border);
    overflow: hidden; box-shadow: var(--s-sm);
  }
  .busq-item {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px; width: 100%; text-align: left;
    background: none; border: none; border-bottom: 1px solid var(--c-border);
    cursor: pointer; transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
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

</style>