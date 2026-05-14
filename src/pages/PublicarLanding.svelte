<script>
  import { onMount } from 'svelte'
  import { currentPage, currentUser, userProfile } from '../stores/auth.js'
  import {
    comercios as comerciosStore,
    cargarComerciosPorLocalidad,
    TIPOS_COMERCIO,
  } from '../stores/comercios.js'
  import BottomNav from '../components/BottomNav.svelte'

  let busqueda   = ''
  let cargando   = false

  $: perfil     = $userProfile
  $: user       = $currentUser
  $: rol        = perfil?.rol || 'usuario'
  $: localidad  = perfil?.localidad || ''

  // Comercio propio (si tiene rol 'comercio')
  $: miComercio = rol === 'comercio'
    ? $comerciosStore.find(c => c.reclamadoPor === user?.uid)
    : null

  $: comerciosFiltrados = $comerciosStore
    .filter(c => c.estado !== 'rechazado')
    .filter(c => !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .slice(0, 10)

  function tipoEmoji(id) {
    return TIPOS_COMERCIO.find(t => t.id === id)?.emoji || '🏬'
  }

  onMount(async () => {
    if (localidad) {
      cargando = true
      await cargarComerciosPorLocalidad(localidad)
      cargando = false
    }
  })

  function irPreciosComercio(id) {
    currentPage.set('precios-comercio:' + id)
  }

  function irListaPrecios(id) {
    currentPage.set('lista-precios:' + id)
  }

  function irListaTematica() {
    currentPage.set('lista-tematica')
  }
</script>

<div class="app-shell publicar-shell">

  <!-- Header -->
  <header class="pub-header">
    <div class="pub-header-top">
      <h1 class="pub-titulo">Publicar precio</h1>
    </div>

    <!-- CTA por rol -->
    {#if rol === 'comercio' && miComercio}
      <div class="rol-banner banner-comercio">
        <div class="rol-banner-icon">🏪</div>
        <div class="rol-banner-text">
          <span class="rol-banner-label">Tu comercio</span>
          <span class="rol-banner-nombre">{miComercio.nombre}</span>
        </div>
        <button class="rol-banner-btn" on:click={() => irListaPrecios(miComercio.id)}>
          Cargar lista →
        </button>
      </div>
    {:else if rol === 'dedicado'}
      <div class="rol-banner banner-dedicado">
        <div class="rol-banner-icon">📋</div>
        <div class="rol-banner-text">
          <span class="rol-banner-label">Usuario dedicado</span>
          <span class="rol-banner-nombre">Podés crear listas temáticas</span>
        </div>
        <button class="rol-banner-btn" on:click={irListaTematica}>
          Nueva lista →
        </button>
      </div>
    {/if}
  </header>

  <main class="pub-main scroll-area">

    <!-- Instrucción -->
    <div class="instruccion">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01"/>
      </svg>
      <p>Elegí el comercio donde viste el precio</p>
    </div>

    <!-- Buscador de comercios -->
    <div class="search-box">
      <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
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

    {#if cargando}
      <div class="skeleton-group">
        {#each Array(4) as _}
          <div class="skeleton-row"></div>
        {/each}
      </div>
    {:else if comerciosFiltrados.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p class="empty-title">Sin resultados</p>
        <p class="empty-sub">Probá con otro nombre.</p>
      </div>
    {:else}
      <div class="comercios-lista">
        {#each comerciosFiltrados as c}
          <button class="comercio-card" on:click={() => irPreciosComercio(c.id)}>
            <div class="com-left">
              <span class="com-emoji">{tipoEmoji(c.tipo)}</span>
              <div class="com-info">
                <span class="com-nombre">{c.nombre}</span>
                {#if c.direccion}<span class="com-dir">{c.direccion}</span>{/if}
              </div>
            </div>
            <div class="com-right">
              {#if c.estado === 'verificado'}
                <span class="verif-dot" title="Verificado"></span>
              {/if}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-light)" stroke-width="2.5" stroke-linecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Dedicado: CTA lista temática también al fondo -->
    {#if rol === 'dedicado'}
      <div class="divider" style="margin: 20px 0"></div>
      <button class="btn-tematica" on:click={irListaTematica}>
        <span class="tematica-icon">📋</span>
        <div class="tematica-text">
          <span class="tematica-titulo">Crear lista temática</span>
          <span class="tematica-sub">Navidad, Pascuas, Escolar…</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2.5" stroke-linecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    {/if}

    <div style="height: 24px"></div>
  </main>

  <BottomNav active="publicar" />
</div>

<style>
  .publicar-shell { padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px)); }

  .pub-header {
    position: sticky; top: 0; z-index: 50;
    background: var(--c-surface); border-bottom: 1px solid var(--c-border);
    padding: 14px 16px 0;
  }
  .pub-header-top { margin-bottom: 12px; }
  .pub-titulo { font-family: var(--f-brand); font-size: 22px; color: var(--c-text); }

  /* Rol banners */
  .rol-banner {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border-radius: var(--r-lg) var(--r-lg) 0 0;
    margin: 0 -16px; /* sangrar hasta los bordes del header */
  }
  .banner-comercio { background: rgba(27,107,58,0.08); }
  .banner-dedicado { background: rgba(245,163,33,0.10); }
  .rol-banner-icon { font-size: 22px; }
  .rol-banner-text { flex: 1; }
  .rol-banner-label { display: block; font-size: 10px; font-weight: 700; color: var(--c-text-light); text-transform: uppercase; letter-spacing: 0.08em; }
  .rol-banner-nombre { font-size: 14px; font-weight: 700; color: var(--c-text); }
  .rol-banner-btn {
    padding: 7px 14px; border-radius: var(--r-full);
    background: var(--c-primary); color: white; border: none;
    font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;
    flex-shrink: 0;
  }

  .pub-main { padding: 16px; }

  .instruccion {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; background: rgba(27,107,58,0.06);
    border-radius: var(--r-md); margin-bottom: 14px;
    font-size: 13px; color: var(--c-text-mid); font-weight: 500;
  }

  /* Buscador */
  .search-box {
    position: relative; display: flex; align-items: center;
    background: var(--c-surface-2); border-radius: var(--r-lg);
    border: 1.5px solid var(--c-border); margin-bottom: 14px;
  }
  .search-icon { position: absolute; left: 14px; pointer-events: none; color: var(--c-text-light); }
  .search-input {
    width: 100%; padding: 12px 40px; background: transparent;
    border: none; font-family: var(--f-ui); font-size: 15px; color: var(--c-text);
  }
  .search-input:focus { outline: none; }
  .search-clear {
    position: absolute; right: 12px; background: none; border: none;
    color: var(--c-text-light); cursor: pointer; font-size: 14px; padding: 4px;
  }

  /* Lista de comercios */
  .comercios-lista { display: flex; flex-direction: column; gap: 6px; }
  .comercio-card {
    display: flex; align-items: center; justify-content: space-between;
    padding: 13px 14px; background: var(--c-surface);
    border: 1px solid var(--c-border); border-radius: var(--r-lg);
    cursor: pointer; transition: all 0.15s; text-align: left;
  }
  .comercio-card:hover { background: var(--c-surface-2); border-color: var(--c-primary); }
  .comercio-card:active { transform: scale(0.98); }
  .com-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
  .com-emoji { font-size: 20px; flex-shrink: 0; }
  .com-info { display: flex; flex-direction: column; min-width: 0; }
  .com-nombre { font-weight: 700; font-size: 15px; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .com-dir { font-size: 12px; color: var(--c-text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .com-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .verif-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c-primary); }

  /* Lista temática CTA */
  .btn-tematica {
    width: 100%; display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; background: var(--c-surface);
    border: 1.5px solid var(--c-primary); border-radius: var(--r-lg);
    cursor: pointer; transition: background 0.15s;
  }
  .btn-tematica:hover { background: rgba(27,107,58,0.06); }
  .tematica-icon { font-size: 24px; }
  .tematica-text { flex: 1; text-align: left; }
  .tematica-titulo { display: block; font-size: 15px; font-weight: 700; color: var(--c-primary); }
  .tematica-sub    { display: block; font-size: 12px; color: var(--c-text-light); }

  /* Skeleton */
  .skeleton-group { display: flex; flex-direction: column; gap: 6px; }
  .skeleton-row { height: 62px; background: var(--c-border); border-radius: var(--r-lg); animation: pulse 1.4s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

  .empty-state { text-align: center; padding: 40px 24px; }
  .empty-icon  { font-size: 40px; margin-bottom: 12px; }
  .empty-title { font-size: 17px; font-weight: 700; color: var(--c-text); margin-bottom: 6px; }
  .empty-sub   { font-size: 14px; color: var(--c-text-light); }
</style>