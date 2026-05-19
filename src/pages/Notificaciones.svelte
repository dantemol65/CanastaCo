<script>
  import { onMount } from 'svelte'
  import { currentPage } from '../stores/auth.js'
  import {
    notificaciones, totalNoLeidas, cargandoNotifs,
    cargarNotificaciones, marcarLeida, marcarTodasLeidas,
    TIPOS_NOTIF
  } from '../stores/notificaciones.js'
  import BottomNav from '../components/BottomNav.svelte'

  onMount(() => cargarNotificaciones())

  function formatFecha(ts) {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    const ahora = new Date()
    const diff  = Math.floor((ahora - d) / 60000)
    if (diff < 1)   return 'Ahora'
    if (diff < 60)  return `Hace ${diff} min`
    if (diff < 1440) return `Hace ${Math.floor(diff/60)}h`
    return d.toLocaleDateString('es-AR', { day:'2-digit', month:'short' })
  }

  async function handleTocar(notif) {
    if (!notif.leida) await marcarLeida(notif.id)
    // Navegar según tipo
    if (notif.datos?.comercioId) {
      currentPage.set('detalle-comercio:' + notif.datos.comercioId)
    } else if (notif.datos?.productoId) {
      currentPage.set('mis-listas')
    }
  }

  function volver() { currentPage.set('home') }
</script>

<div class="app-shell notif-shell">

  <header class="notif-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <h1 class="notif-titulo">Notificaciones</h1>
    {#if $totalNoLeidas > 0}
      <button class="btn-marcar-todas" on:click={marcarTodasLeidas}>
        Marcar todas
      </button>
    {/if}
  </header>

  <main class="notif-main scroll-area">

    {#if $cargandoNotifs}
      <div class="skeleton-group">
        {#each Array(4) as _}
          <div class="skeleton-row"></div>
        {/each}
      </div>

    {:else if $notificaciones.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🔔</div>
        <p class="empty-title">Sin notificaciones</p>
        <p class="empty-sub">Cuando haya actividad relacionada con tus listas o comercios, aparecerá acá.</p>
      </div>

    {:else}
      {#each $notificaciones as notif (notif.id)}
        {@const tipo = TIPOS_NOTIF[notif.tipo] || { icono: '📢', label: '' }}
        <button
          class="notif-item"
          class:no-leida={!notif.leida}
          on:click={() => handleTocar(notif)}
        >
          <div class="notif-icono">{tipo.icono}</div>
          <div class="notif-cuerpo">
            <p class="notif-titulo-item">{notif.titulo}</p>
            <p class="notif-mensaje">{notif.mensaje}</p>
            <span class="notif-fecha">{formatFecha(notif.creadaEn)}</span>
          </div>
          {#if !notif.leida}
            <div class="notif-punto"></div>
          {/if}
        </button>
      {/each}
    {/if}

    <div style="height:24px"></div>
  </main>

  <BottomNav active="home" />
</div>

<style>
  .notif-shell { padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px)); }

  .notif-header {
    position: sticky; top: 0; z-index: 50;
    background: var(--c-surface); border-bottom: 1px solid var(--c-border);
    padding: 14px 16px; display: flex; align-items: center; gap: 10px;
  }
  .btn-volver {
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: var(--c-surface-2);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; color: var(--c-text);
  }
  .notif-titulo { font-family: var(--f-brand); font-size: 20px; flex: 1; }
  .btn-marcar-todas {
    background: none; border: none; font-size: 12px; font-weight: 700;
    color: var(--c-primary); cursor: pointer; white-space: nowrap;
  }

  .notif-main { padding: 8px 0; }

  .notif-item {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 16px; width: 100%; text-align: left;
    background: none; border: none; border-bottom: 1px solid var(--c-border);
    cursor: pointer; transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
    position: relative;
  }
  .notif-item:active { background: var(--c-surface-2); }
  .notif-item.no-leida { background: rgba(27,107,58,0.04); }

  .notif-icono { font-size: 24px; flex-shrink: 0; margin-top: 2px; }
  .notif-cuerpo { flex: 1; min-width: 0; }
  .notif-titulo-item { font-size: 14px; font-weight: 700; color: var(--c-text); margin-bottom: 3px; }
  .notif-mensaje { font-size: 13px; color: var(--c-text-mid); line-height: 1.4; margin-bottom: 4px; }
  .notif-fecha   { font-size: 11px; color: var(--c-text-light); }

  .notif-punto {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--c-primary); flex-shrink: 0; margin-top: 6px;
  }

  /* Skeleton */
  .skeleton-group { padding: 8px 16px; display: flex; flex-direction: column; gap: 8px; }
  .skeleton-row { height: 72px; background: var(--c-border); border-radius: var(--r-md); animation: pulse 1.4s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

  /* Empty */
  .empty-state { text-align: center; padding: 60px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .empty-icon  { font-size: 48px; }
  .empty-title { font-family: var(--f-brand); font-size: 20px; color: var(--c-text); }
  .empty-sub   { font-size: 14px; color: var(--c-text-light); line-height: 1.6; max-width: 280px; }
</style>