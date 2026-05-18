<script>
  import { onMount } from 'svelte'
  import { currentPage, userProfile } from '../stores/auth.js'
  import {
    listaActiva, cargarLista,
    cargarPreciosParaOptimizar,
    optimizarUnComercio,
    optimizarRepartido,
    formatPrecioLista,
  } from '../stores/listas_compras.js'

  export let listaId = ''

  let tab         = 'uno'   // 'uno' | 'repartido'
  let cargando    = true
  let error       = null

  let lista       = null
  let comerciosMap = null

  // Resultados
  let topComercios      = []
  let repartido         = null
  let pendientesOmitidos = []

  $: perfil    = $userProfile
  $: localidad = perfil?.localidad || ''

  onMount(async () => {
    try {
      lista = await cargarLista(listaId)
      if (!lista) { error = 'Lista no encontrada.'; cargando = false; return }
      if (!lista.items?.length) { error = 'La lista está vacía.'; cargando = false; return }

      // Separar ítems pendientes (sin productoId) de los reales
      const itemsReales    = lista.items.filter(i => !i.pendiente && i.productoId)
      const itemsPendientes = lista.items.filter(i => i.pendiente)

      if (itemsReales.length === 0) {
        error = 'Todos los productos de la lista están pendientes — no hay nada para optimizar aún.'
        cargando = false
        return
      }

      comerciosMap = await cargarPreciosParaOptimizar(itemsReales, localidad)

      if (comerciosMap.size === 0) {
        error = 'No hay precios registrados para los productos de esta lista en tu localidad.'
        cargando = false
        return
      }

      topComercios  = optimizarUnComercio(itemsReales, comerciosMap)
      repartido     = optimizarRepartido(itemsReales, comerciosMap)
      pendientesOmitidos = itemsPendientes.map(i => i.productoNombre)
    } catch (e) {
      console.error(e)
      error = 'Error al calcular la optimización.'
    } finally {
      cargando = false
    }
  })

  function volver() { currentPage.set('mi-lista:' + listaId) }

  // Formatear ahorro como porcentaje
  function pctAhorro(total, base) {
    if (!base || base <= 0) return ''
    const pct = ((base - total) / base * 100).toFixed(0)
    return pct > 0 ? `-${pct}%` : ''
  }
</script>

<div class="app-shell opt-shell">

  <header class="opt-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="header-info">
      <h1 class="opt-titulo">Optimizar compra</h1>
      {#if lista}<p class="opt-sub">{lista.nombre} · {lista.items?.length} productos</p>{/if}
    </div>
  </header>

  <!-- Tabs -->
  <div class="tabs-bar">
    <button
      class="tab-btn"
      class:active={tab === 'uno'}
      on:click={() => tab = 'uno'}
    >
      🏪 Un comercio
    </button>
    <button
      class="tab-btn"
      class:active={tab === 'repartido'}
      on:click={() => tab = 'repartido'}
    >
      🗂 Repartir
    </button>
  </div>

  <main class="opt-main scroll-area">

    {#if cargando}
      <div class="calculando">
        <div class="calc-spinner"></div>
        <p class="calc-text">Analizando precios…</p>
        <p class="calc-sub">Comparando {lista?.items?.length || 0} productos entre todos los comercios de tu localidad</p>
      </div>

    {:else if error}
      <div class="empty-state">
        <div class="empty-icon">😕</div>
        <p class="empty-title">{error}</p>
        <button class="btn btn-primary" on:click={volver}>Volver a la lista</button>
      </div>

    {:else if tab === 'uno'}
      <!-- ── Caso 1: Top 3 comercios ── -->

      {#if topComercios.length === 0}
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p class="empty-title">Sin datos suficientes</p>
          <p class="empty-sub">Ningún comercio tiene precios de estos productos aún.</p>
        </div>
      {:else}
        {#if pendientesOmitidos.length > 0}
          <div class="pendientes-aviso">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <span class="pendientes-titulo">{pendientesOmitidos.length} producto{pendientesOmitidos.length !== 1 ? 's' : ''} excluido{pendientesOmitidos.length !== 1 ? 's' : ''} por estar pendientes:</span>
              <span class="pendientes-lista">{pendientesOmitidos.join(', ')}</span>
            </div>
          </div>
        {/if}

        <p class="seccion-desc">
          Los mejores comercios para comprar tu lista completa de una sola parada.
          {#if topComercios[0]?.cobertura < 100}
            Los productos faltantes se muestran al expandir cada opción.
          {/if}
        </p>

        {#each topComercios as com, idx (com.comercioId)}
          {@const base = topComercios[topComercios.length - 1]?.total}
          <div class="comercio-card" class:mejor={idx === 0}>

            <div class="com-header">
              <div class="com-rank">
                {#if idx === 0}🥇{:else if idx === 1}🥈{:else}🥉{/if}
              </div>
              <div class="com-info">
                <span class="com-nombre">{com.comercioNombre}</span>
                <div class="com-chips">
                  <span class="cobertura-chip"
                    class:completa={com.cobertura === 100}
                    class:parcial={com.cobertura < 100}
                  >
                    {com.encontrados}/{com.totalItems} productos
                  </span>
                  {#if idx === 0 && topComercios.length > 1}
                    <span class="mejor-chip">Más conveniente</span>
                  {/if}
                </div>
              </div>
              <div class="com-total-wrap">
                <span class="com-total">{formatPrecioLista(com.total)}</span>
                {#if idx > 0}
                  <span class="com-diff">+{formatPrecioLista(com.total - topComercios[0].total)}</span>
                {/if}
              </div>
            </div>

            <!-- Detalle de productos -->
            <div class="com-detalle">
              {#each com.detalle as item}
                <div class="detalle-row" class:alternativo={item.esAlternativo}>
                  <span class="detalle-nombre">
                    {item.productoNombre}
                    {#if item.esAlternativo}
                      <span class="alt-label">→ {item.precioNombre}</span>
                    {/if}
                  </span>
                  <span class="detalle-precio">{formatPrecioLista(item.precio)}</span>
                </div>
              {/each}

              {#if com.faltantes.length > 0}
                <div class="faltantes-wrap">
                  <p class="faltantes-titulo">⚠ No disponibles en este comercio:</p>
                  {#each com.faltantes as f}
                    <span class="faltante-chip">{f}</span>
                  {/each}
                </div>
              {/if}
            </div>

          </div>
        {/each}
      {/if}

    {:else}
      <!-- ── Caso 2: Repartido por comercio más barato ── -->

      {#if !repartido || repartido.sublistas.length === 0}
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p class="empty-title">Sin datos suficientes</p>
        </div>
      {:else}

        <!-- Banner de ahorro -->
        {#if repartido.ahorro > 0}
          <div class="ahorro-banner">
            <div class="ahorro-icon">💰</div>
            <div class="ahorro-text">
              <span class="ahorro-label">Ahorro estimado repartiendo</span>
              <span class="ahorro-valor">{formatPrecioLista(repartido.ahorro)}</span>
            </div>
            <span class="ahorro-pct">
              {pctAhorro(repartido.totalRepartido, repartido.totalSinRepartir)}
            </span>
          </div>
        {/if}

        {#if pendientesOmitidos.length > 0}
          <div class="pendientes-aviso">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <span class="pendientes-titulo">{pendientesOmitidos.length} excluido{pendientesOmitidos.length !== 1 ? 's' : ''} (pendientes):</span>
              <span class="pendientes-lista">{pendientesOmitidos.join(', ')}</span>
            </div>
          </div>
        {/if}

        <p class="seccion-desc">
          Dividí tu compra en {repartido.sublistas.length} parada{repartido.sublistas.length !== 1 ? 's' : ''}
          eligiendo el precio más bajo para cada producto.
          Total: <strong>{formatPrecioLista(repartido.totalRepartido)}</strong>
        </p>

        {#each repartido.sublistas as sub, idx}
          <div class="sublista-card">
            <div class="sub-header">
              <div class="sub-num">Parada {idx + 1}</div>
              <span class="sub-comercio">{sub.comercioNombre}</span>
              <span class="sub-total">{formatPrecioLista(sub.total)}</span>
            </div>

            <div class="sub-items">
              {#each sub.items as item}
                <div class="sub-row">
                  <span class="sub-nombre">{item.productoNombre}</span>
                  <span class="sub-precio">{formatPrecioLista(item.precio)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}

        {#if repartido.productosSinPrecio.length > 0}
          <div class="sin-precio-wrap">
            <p class="sin-precio-titulo">Sin precio registrado en ningún comercio:</p>
            {#each repartido.productosSinPrecio as p}
              <span class="faltante-chip">{p}</span>
            {/each}
          </div>
        {/if}

      {/if}
    {/if}

    <div style="height: 32px"></div>
  </main>
</div>

<style>
  .opt-shell { min-height: 100dvh; display: flex; flex-direction: column; }

  /* Header */
  .opt-header {
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
  .header-info { flex: 1; min-width: 0; }
  .opt-titulo { font-family: var(--f-brand); font-size: 18px; }
  .opt-sub    { font-size: 12px; color: var(--c-text-light); }

  /* Tabs */
  .tabs-bar {
    display: flex; border-bottom: 1px solid var(--c-border);
    background: var(--c-surface);
  }
  .tab-btn {
    flex: 1; padding: 12px 8px;
    border: none; background: none;
    font-size: 13px; font-weight: 700; color: var(--c-text-light);
    cursor: pointer; border-bottom: 2px solid transparent;
    transition: all 0.15s; font-family: var(--f-ui);
  }
  .tab-btn.active { color: var(--c-primary); border-bottom-color: var(--c-primary); }

  /* Main */
  .opt-main { flex: 1; padding: 16px; overflow-y: auto; }

  /* Calculando */
  .calculando {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 60px 24px; gap: 16px; text-align: center;
  }
  .calc-spinner {
    width: 40px; height: 40px; border-radius: 50%;
    border: 3px solid var(--c-border); border-top-color: var(--c-primary);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .calc-text { font-family: var(--f-brand); font-size: 18px; color: var(--c-text); }
  .calc-sub  { font-size: 13px; color: var(--c-text-light); max-width: 280px; line-height: 1.5; }

  .seccion-desc { font-size: 13px; color: var(--c-text-light); margin-bottom: 16px; line-height: 1.5; }

  /* Caso 1: Comercio cards */
  .comercio-card {
    background: var(--c-surface); border-radius: var(--r-xl);
    border: 1px solid var(--c-border); overflow: hidden;
    margin-bottom: 12px; box-shadow: var(--s-xs);
  }
  .comercio-card.mejor {
    border-color: var(--c-primary);
    box-shadow: 0 0 0 2px rgba(27,107,58,0.12), var(--s-sm);
  }

  .com-header {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; border-bottom: 1px solid var(--c-border);
  }
  .com-rank  { font-size: 24px; flex-shrink: 0; }
  .com-info  { flex: 1; min-width: 0; }
  .com-nombre { font-size: 15px; font-weight: 700; color: var(--c-text); display: block; }
  .com-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }

  .cobertura-chip {
    font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--r-full);
  }
  .cobertura-chip.completa { background: #D1FAE5; color: #065F46; }
  .cobertura-chip.parcial  { background: #FEF3C7; color: #92400E; }

  .mejor-chip {
    font-size: 11px; font-weight: 700; padding: 2px 8px;
    border-radius: var(--r-full); background: var(--c-primary); color: white;
  }

  .com-total-wrap { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
  .com-total { font-family: var(--f-brand); font-size: 20px; font-weight: 700; color: var(--c-primary); }
  .com-diff  { font-size: 11px; color: #DC2626; font-weight: 700; }

  /* Detalle de productos */
  .com-detalle { padding: 8px 16px 12px; }
  .detalle-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 0; border-bottom: 1px solid var(--c-border);
    font-size: 13px;
  }
  .detalle-row:last-child { border-bottom: none; }
  .detalle-row.alternativo { background: rgba(245,163,33,0.06); border-radius: 4px; padding: 6px 8px; }
  .detalle-nombre { color: var(--c-text); flex: 1; min-width: 0; margin-right: 8px; }
  .alt-label { font-size: 11px; color: #92400E; display: block; }
  .detalle-precio { font-weight: 700; color: var(--c-text); white-space: nowrap; }

  .faltantes-wrap { padding: 10px 0 4px; }
  .faltantes-titulo { font-size: 12px; color: #DC2626; font-weight: 600; margin-bottom: 6px; }
  .faltante-chip {
    display: inline-block; margin: 2px; padding: 3px 10px;
    background: #FEE2E2; color: #DC2626; border-radius: var(--r-full);
    font-size: 11px; font-weight: 600;
  }

  /* Caso 2: Ahorro banner */
  .ahorro-banner {
    display: flex; align-items: center; gap: 14px;
    background: linear-gradient(135deg, rgba(27,107,58,0.1), rgba(27,107,58,0.05));
    border: 1.5px solid rgba(27,107,58,0.25);
    border-radius: var(--r-xl); padding: 16px; margin-bottom: 16px;
  }
  .ahorro-icon { font-size: 28px; }
  .ahorro-text { flex: 1; }
  .ahorro-label { display: block; font-size: 11px; font-weight: 700; color: var(--c-primary); text-transform: uppercase; letter-spacing: 0.06em; }
  .ahorro-valor { display: block; font-family: var(--f-brand); font-size: 22px; font-weight: 700; color: var(--c-primary); }
  .ahorro-pct   { font-size: 16px; font-weight: 700; color: #059669; flex-shrink: 0; }

  /* Sublistas */
  .sublista-card {
    background: var(--c-surface); border-radius: var(--r-xl);
    border: 1px solid var(--c-border); overflow: hidden;
    margin-bottom: 12px; box-shadow: var(--s-xs);
  }
  .sub-header {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px; background: var(--c-surface-2);
    border-bottom: 1px solid var(--c-border);
  }
  .sub-num      { font-size: 11px; font-weight: 700; color: var(--c-text-light); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
  .sub-comercio { flex: 1; font-size: 15px; font-weight: 700; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub-total    { font-family: var(--f-brand); font-size: 17px; font-weight: 700; color: var(--c-primary); white-space: nowrap; }

  .sub-items { padding: 8px 16px 12px; }
  .sub-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 0; border-bottom: 1px solid var(--c-border); font-size: 13px;
  }
  .sub-row:last-child { border-bottom: none; }
  .sub-nombre { color: var(--c-text); flex: 1; margin-right: 8px; }
  .sub-precio { font-weight: 700; color: var(--c-primary); white-space: nowrap; }

  /* Sin precio */
  .sin-precio-wrap { padding: 12px; background: var(--c-surface-2); border-radius: var(--r-lg); margin-top: 8px; }
  .sin-precio-titulo { font-size: 12px; color: var(--c-text-light); margin-bottom: 8px; }

  /* Aviso de pendientes */
  .pendientes-aviso {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px; margin-bottom: 14px;
    background: #FFFBEB; border: 1px solid #F59E0B;
    border-radius: var(--r-lg); color: #92400E;
  }
  .pendientes-aviso svg { flex-shrink: 0; margin-top: 1px; }
  .pendientes-titulo { display: block; font-size: 12px; font-weight: 700; }
  .pendientes-lista  { display: block; font-size: 12px; font-style: italic; margin-top: 2px; }

  /* Empty */
  .empty-state { text-align: center; padding: 60px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .empty-icon  { font-size: 48px; }
  .empty-title { font-family: var(--f-brand); font-size: 20px; color: var(--c-text); }
  .empty-sub   { font-size: 14px; color: var(--c-text-light); line-height: 1.6; max-width: 280px; }
</style>