<script>
  import { onMount } from 'svelte'
  import { currentPage } from '../stores/auth.js'
  import { userProfile } from '../stores/auth.js'
  import {
    comercios, cargandoComercios, errorComercios,
    cargarComerciosPorLocalidad, filtrarComercios,
    TIPOS_COMERCIO, ESTADOS
  } from '../stores/comercios.js'
  import { obtenerPosicion, formatDistancia } from '../lib/geolocation.js'
  import BottomNav from '../components/BottomNav.svelte'
  import { cargarSolicitudes } from '../stores/listas_compras.js'

  let busqueda   = ''
  let tipoFiltro = ''
  let posicion   = null
  let buscandoGPS = false

  $: perfil = $userProfile
  $: lista  = filtrarComercios($comercios, { busqueda, tipo: tipoFiltro, posicion })

  let solicitudes        = []
  let mostrarSolicitudes = false

  async function cargarSolicitudesLocalidad() {
    const loc = $userProfile?.localidad
    if (!loc) return
    solicitudes = await cargarSolicitudes(loc)
  }

  onMount(async () => {
    if (perfil?.localidad) {
      await cargarComerciosPorLocalidad(perfil.localidad)
      cargarSolicitudesLocalidad()  // no bloqueante
    }
    // Intentar obtener GPS silenciosamente
    try {
      posicion = await obtenerPosicion()
    } catch { /* sin GPS, no pasa nada */ }
  })

  async function usarGPS() {
    buscandoGPS = true
    try {
      posicion = await obtenerPosicion()
    } catch (e) {
      alert(e.message)
    } finally {
      buscandoGPS = false
    }
  }

  function goAltaComercio() { currentPage.set('alta-comercio') }
  function goDetalle(id)    { currentPage.set('detalle-comercio:' + id) }

  function tipoInfo(id) {
    return TIPOS_COMERCIO.find(t => t.id === id) || { emoji: '🏬', label: id }
  }
</script>

<div class="app-shell buscar-shell">

  <!-- Header -->
  <header class="buscar-header">
    <div class="buscar-header-top">
      <h1 class="buscar-titulo">Comercios</h1>
      <button class="btn-agregar" on:click={goAltaComercio} aria-label="Agregar comercio">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Agregar
      </button>
    </div>

    <!-- Buscador -->
    <div class="search-box">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="search"
        class="search-input"
        placeholder="Buscar comercio…"
        bind:value={busqueda}
        autocomplete="off"
      />
      {#if busqueda}
        <button class="search-clear" on:click={() => busqueda = ''} aria-label="Limpiar">✕</button>
      {/if}
    </div>

    <!-- Filtros -->
    <div class="filtros-row">
      <button
        class="filtro-btn"
        class:active={tipoFiltro === ''}
        on:click={() => tipoFiltro = ''}
      >Todos</button>
      {#each TIPOS_COMERCIO as tipo}
        <button
          class="filtro-btn"
          class:active={tipoFiltro === tipo.id}
          on:click={() => tipoFiltro = tipoFiltro === tipo.id ? '' : tipo.id}
        >{tipo.emoji} {tipo.label}</button>
      {/each}
    </div>

    <!-- GPS -->
    {#if posicion}
      <p class="gps-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--c-primary)" stroke="none">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        </svg>
        Ordenado por distancia
      </p>
    {:else}
      <button class="gps-btn" on:click={usarGPS} disabled={buscandoGPS}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>
        </svg>
        {buscandoGPS ? 'Buscando…' : 'Ordenar por distancia'}
      </button>
    {/if}
  </header>

  <!-- Contenido -->
  <main class="buscar-main">

    {#if !perfil?.localidad}
      <div class="empty-state">
        <div class="empty-icon">📍</div>
        <p class="empty-title">Completá tu perfil</p>
        <p class="empty-desc">Necesitás seleccionar tu localidad para ver comercios de tu zona.</p>
        <button class="btn btn-primary" on:click={() => currentPage.set('perfil')}>
          Ir a mi perfil
        </button>
      </div>

    {:else if $cargandoComercios}
      <div class="loading-list">
        {#each [1,2,3,4] as _}
          <div class="skeleton-card"></div>
        {/each}
      </div>

    {:else if $errorComercios}
      <div class="empty-state">
        <div class="empty-icon">{$errorComercios.includes('Sin conexión') ? '📵' : '⚠️'}</div>
        <p class="empty-title">{$errorComercios.includes('Sin conexión') ? 'Sin conexión' : 'Error al cargar'}</p>
        <p class="empty-desc">{$errorComercios}</p>
        {#if !$errorComercios.includes('Sin conexión')}
          <button class="btn btn-primary" on:click={() => cargarComerciosPorLocalidad(perfil.localidad)}>
            Reintentar
          </button>
        {/if}
      </div>

    {:else if lista.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🏪</div>
        <p class="empty-title">
          {busqueda || tipoFiltro ? 'Sin resultados' : 'Sin comercios aún'}
        </p>
        <p class="empty-desc">
          {busqueda || tipoFiltro
            ? 'Probá con otro término o filtro.'
            : '¡Sé el primero en agregar un comercio de tu localidad!'}
        </p>
        {#if !busqueda && !tipoFiltro}
          <button class="btn btn-primary" on:click={goAltaComercio}>
            Agregar comercio
          </button>
        {/if}
      </div>

    {:else}
      <p class="lista-count">{lista.length} comercio{lista.length !== 1 ? 's' : ''}</p>

      <div class="comercios-lista">
        {#each lista as comercio (comercio.id)}
          <button class="comercio-card" on:click={() => goDetalle(comercio.id)}>
            <div class="card-emoji">{tipoInfo(comercio.tipo).emoji}</div>
            <div class="card-body">
              <div class="card-nombre-row">
                <span class="card-nombre">{comercio.nombre}</span>
                {#if comercio.estado === 'verificado'}
                  <span class="badge-verificado" title="Verificado">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none">
                      <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                    </svg>
                  </span>
                {:else if comercio.estado === 'pendiente'}
                  <span class="badge-pendiente">Pendiente</span>
                {/if}
              </div>
              <p class="card-tipo">{tipoInfo(comercio.tipo).label}</p>
              {#if comercio.direccion}
                <p class="card-dir">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--c-text-light)" stroke="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  </svg>
                  {comercio.direccion}
                </p>
              {/if}
            </div>
            <div class="card-right">
              {#if comercio.distanciaKm !== undefined && comercio.distanciaKm !== null}
                <span class="card-dist">{formatDistancia(comercio.distanciaKm)}</span>
              {/if}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-light)" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </button>
        {/each}
      </div>
    {/if}

  </main>

  <!-- Banner de solicitudes de la comunidad — siempre visible si hay pendientes -->
  {#if solicitudes.length > 0}
    <div class="sol-banner" class:sol-expandido={mostrarSolicitudes}>

      <button
        class="sol-banner-header"
        on:click={() => mostrarSolicitudes = !mostrarSolicitudes}
        aria-expanded={mostrarSolicitudes}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
        <span class="sol-banner-texto">
          La comunidad necesita {solicitudes.length} producto{solicitudes.length !== 1 ? 's' : ''} —
          <strong>¿podés ayudar?</strong>
        </span>
        <svg
          class="sol-chevron"
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          style="transform: rotate({mostrarSolicitudes ? 180 : 0}deg)"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if mostrarSolicitudes}
        <div class="sol-lista">
          <p class="sol-desc">
            Encontraste alguno en un comercio? Cargá el precio desde ese comercio.
          </p>
          {#each solicitudes as sol}
            <div class="sol-item">
              <span class="sol-nombre">{sol.nombre}</span>
              <span class="sol-votos-chip">
                {sol.votos} {sol.votos === 1 ? 'pedido' : 'pedidos'}
              </span>
            </div>
          {/each}
        </div>
      {/if}

    </div>
  {/if}

  <BottomNav active="buscar" />
</div>

<style>
  .buscar-shell {
    padding-bottom: var(--nav-h);
    background: var(--c-bg);
    min-height: 100dvh;
  }

  /* Header */
  .buscar-header {
    background: white;
    padding: 16px 16px 8px;
    border-bottom: 1px solid var(--c-border);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .buscar-header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .buscar-titulo {
    font-family: var(--font-brand);
    font-size: 1.4rem;
    color: var(--c-primary);
    margin: 0;
  }
  .btn-agregar {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--c-primary);
    color: white;
    border: none;
    border-radius: 99px;
    padding: 8px 14px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    font-family: var(--font-ui);
  }

  /* Buscador */
  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: 10px;
  }
  .search-icon {
    position: absolute;
    left: 12px;
    color: var(--c-text-light);
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    padding: 10px 36px 10px 36px;
    border: 1.5px solid var(--c-border);
    border-radius: 12px;
    font-size: 0.9rem;
    font-family: var(--font-ui);
    background: var(--c-bg);
    color: var(--c-text);
    outline: none;
  }
  .search-input:focus { border-color: var(--c-primary); }
  .search-clear {
    position: absolute;
    right: 10px;
    background: none;
    border: none;
    color: var(--c-text-light);
    font-size: 14px;
    cursor: pointer;
    padding: 4px;
  }

  /* Filtros */
  .filtros-row {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 8px;
    scrollbar-width: none;
  }
  .filtros-row::-webkit-scrollbar { display: none; }
  .filtro-btn {
    flex-shrink: 0;
    padding: 5px 12px;
    border-radius: 99px;
    border: 1.5px solid var(--c-border);
    background: white;
    color: var(--c-text-muted);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    font-family: var(--font-ui);
    transition: all 0.15s;
  }
  .filtro-btn.active {
    background: var(--c-primary);
    border-color: var(--c-primary);
    color: white;
  }

  /* GPS */
  .gps-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: var(--c-primary);
    font-weight: 600;
    margin: 4px 0 0;
  }
  .gps-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    color: var(--c-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 0;
    font-family: var(--font-ui);
  }
  .gps-btn:disabled { opacity: 0.6; }

  /* Main */
  .buscar-main { padding: 12px 16px 8px; }
  .lista-count {
    font-size: 0.75rem;
    color: var(--c-text-muted);
    margin: 0 0 10px;
  }

  /* Cards */
  .comercios-lista { display: flex; flex-direction: column; gap: 8px; }
  .comercio-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: white;
    border: 1.5px solid var(--c-border);
    border-radius: 14px;
    padding: 12px;
    text-align: left;
    cursor: pointer;
    width: 100%;
    transition: all 0.15s;
  }
  .comercio-card:active { transform: scale(0.98); background: var(--c-bg); }

  .card-emoji {
    font-size: 1.6rem;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--c-bg);
    border-radius: 10px;
    flex-shrink: 0;
  }
  .card-body { flex: 1; min-width: 0; }
  .card-nombre-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .card-nombre {
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--c-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badge-verificado {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    background: var(--c-primary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .badge-pendiente {
    flex-shrink: 0;
    font-size: 0.65rem;
    font-weight: 700;
    color: #92400E;
    background: #FEF3C7;
    padding: 1px 6px;
    border-radius: 99px;
  }
  .card-tipo {
    font-size: 0.75rem;
    color: var(--c-text-muted);
    margin: 0 0 3px;
  }
  .card-dir {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.73rem;
    color: var(--c-text-light);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex-shrink: 0;
  }
  .card-dist {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--c-primary);
    white-space: nowrap;
  }

  /* Skeleton */
  .loading-list { display: flex; flex-direction: column; gap: 8px; }
  .skeleton-card {
    height: 74px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    border-radius: 14px;
    animation: shimmer 1.2s infinite;
  }
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 48px 24px;
    gap: 8px;
  }
  .empty-icon { font-size: 3rem; margin-bottom: 4px; }
  .empty-title { font-size: 1rem; font-weight: 700; color: var(--c-text); margin: 0; }
  .empty-desc  { font-size: 0.85rem; color: var(--c-text-muted); margin: 0 0 12px; max-width: 260px; }

  /* ── Banner solicitudes comunidad ────────────────────────────────── */
  .sol-banner {
    background: #FFFBEB;
    border-top: 2px solid #F59E0B;
    border-bottom: 2px solid #F59E0B;
  }
  .sol-banner-header {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 11px 16px;
    background: none; border: none; cursor: pointer;
    font-family: var(--f-ui); text-align: left;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;
    color: #92400E;
  }
  .sol-banner-header:active { background: rgba(245,163,33,0.12); }
  .sol-banner-header svg:first-child { flex-shrink: 0; color: #F59E0B; }
  .sol-banner-texto {
    flex: 1; font-size: 13px; color: #92400E;
  }
  .sol-banner-texto strong { color: #78350F; }
  .sol-chevron { flex-shrink: 0; transition: transform 0.2s; }

  .sol-lista { padding: 0 16px 12px; }
  .sol-desc  { font-size: 12px; color: #92400E; padding: 4px 0 10px; line-height: 1.5; }
  .sol-item  {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0; border-top: 1px solid rgba(245,163,33,0.3);
  }
  .sol-nombre { font-size: 14px; font-weight: 700; color: var(--c-text); }
  .sol-votos-chip {
    font-size: 11px; font-weight: 700; color: #92400E;
    background: rgba(245,163,33,0.2); padding: 2px 8px;
    border-radius: var(--r-full); white-space: nowrap;
  }
</style>