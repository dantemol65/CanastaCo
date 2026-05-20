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

  let tab              = 'uno'
  let cargando         = true
  let error            = null

  let lista            = null
  let comerciosMap     = null
  let topComercios     = []
  let repartido        = null
  let pendientesOmitidos = []

  // Cantidades por productoId — defecto 1
  let cantidades = {}   // { [productoId]: number }

  $: perfil    = $userProfile
  $: localidad = perfil?.localidad || ''

  // ── Calcular totales con cantidades ──────────────────────────────────────

  function cant(productoId) {
    return cantidades[productoId] ?? 1
  }

  function setCant(productoId, val) {
    const n = Math.max(1, Math.min(99, parseInt(val) || 1))
    cantidades = { ...cantidades, [productoId]: n }
  }

  // Totales del caso 1 con cantidades
  $: topComerciosConCant = topComercios.map(com => {
    const total = com.detalle.reduce((s, i) => s + i.precio * cant(i.productoId), 0)
    return { ...com, totalConCant: total }
  })

  // Totales del caso 2 con cantidades
  $: repartidoConCant = repartido ? {
    ...repartido,
    sublistas: repartido.sublistas.map(sub => ({
      ...sub,
      totalConCant: sub.items.reduce((s, i) => s + i.precio * cant(i.productoId), 0),
      items: sub.items.map(i => ({ ...i, cantConCant: cant(i.productoId) }))
    })),
    totalRepartidoConCant: repartido.sublistas.reduce((s, sub) =>
      s + sub.items.reduce((ss, i) => ss + i.precio * cant(i.productoId), 0), 0
    ),
  } : null

  onMount(async () => {
    try {
      lista = await cargarLista(listaId)
      if (!lista) { error = 'Lista no encontrada.'; cargando = false; return }
      if (!lista.items?.length) { error = 'La lista está vacía.'; cargando = false; return }

      const itemsReales     = lista.items.filter(i => !i.pendiente && i.productoId)
      const itemsPendientes = lista.items.filter(i => i.pendiente)

      if (itemsReales.length === 0) {
        error = 'Todos los productos están pendientes — no hay nada para optimizar.'
        cargando = false; return
      }

      comerciosMap = await cargarPreciosParaOptimizar(itemsReales, localidad)

      if (comerciosMap.size === 0) {
        error = 'No hay precios registrados en tu localidad para estos productos.'
        cargando = false; return
      }

      topComercios       = optimizarUnComercio(itemsReales, comerciosMap)
      repartido          = optimizarRepartido(itemsReales, comerciosMap)
      pendientesOmitidos = itemsPendientes.map(i => i.productoNombre)

      // Inicializar cantidades en 1
      const ids = {}
      itemsReales.forEach(i => ids[i.productoId] = 1)
      cantidades = ids

    } catch (e) {
      console.error(e)
      error = 'Error al calcular la optimización.'
    } finally {
      cargando = false
    }
  })

  function volver() { currentPage.set('mi-lista:' + listaId) }

  function pctAhorro(total, base) {
    if (!base || base <= total) return ''
    return `-${((base - total) / base * 100).toFixed(0)}%`
  }

  // ── Compartir ─────────────────────────────────────────────────────────────

  function generarTextoCompartir() {
    const lineas = [`📋 ${lista?.nombre || 'Lista de compras'}\n`]

    if (tab === 'uno' && topComerciosConCant.length > 0) {
      const com = topComerciosConCant[0]
      lineas.push(`🏪 ${com.comercioNombre}`)
      if (com.comercioDireccion) lineas.push(`📍 ${com.comercioDireccion}`)
      lineas.push(`Total: ${formatPrecioLista(com.totalConCant)}\n`)
      com.detalle.forEach(i => {
        const c = cant(i.productoId)
        lineas.push(`• ${i.productoNombre}${c > 1 ? ` ×${c}` : ''} — ${formatPrecioLista(i.precio * c)}`)
      })
      if (com.faltantes.length) lineas.push(`\n⚠ Sin precio: ${com.faltantes.join(', ')}`)
    } else if (tab === 'repartido' && repartidoConCant) {
      repartidoConCant.sublistas.forEach((sub, idx) => {
        lineas.push(`\n📍 Parada ${idx + 1} — ${sub.comercioNombre}`)
        if (sub.comercioDireccion) lineas.push(`   ${sub.comercioDireccion}`)
        lineas.push(`Subtotal: ${formatPrecioLista(sub.totalConCant)}`)
        sub.items.forEach(i => {
          const c = cant(i.productoId)
          lineas.push(`• ${i.productoNombre}${c > 1 ? ` ×${c}` : ''} — ${formatPrecioLista(i.precio * c)}`)
        })
      })
      lineas.push(`\n💰 Total: ${formatPrecioLista(repartidoConCant.totalRepartidoConCant)}`)
    }

    lineas.push(`\nGenerado con Canasta.co`)
    return lineas.join('\n')
  }

  async function compartir() {
    const texto = generarTextoCompartir()
    if (navigator.share) {
      await navigator.share({ title: lista?.nombre || 'Lista', text: texto })
    } else {
      await navigator.clipboard.writeText(texto)
      alert('Lista copiada al portapapeles')
    }
  }

  function imprimir() {
    const texto = generarTextoCompartir()
    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${lista?.nombre || 'Lista'}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; font-size: 14px; }
        h1 { font-size: 18px; margin-bottom: 16px; }
        pre { white-space: pre-wrap; line-height: 1.8; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <pre>${texto.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
      </body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    w.print()
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
    {#if !cargando && !error}
      <div class="header-acciones">
        <button class="btn-accion-header" on:click={compartir} title="Compartir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
        <button class="btn-accion-header" on:click={imprimir} title="Imprimir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
        </button>
      </div>
    {/if}
  </header>

  <!-- Tabs -->
  <div class="tabs-bar">
    <button class="tab-btn" class:active={tab === 'uno'}       on:click={() => tab = 'uno'}>🏪 Un comercio</button>
    <button class="tab-btn" class:active={tab === 'repartido'} on:click={() => tab = 'repartido'}>🗂 Repartir</button>
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

    {:else}

      <!-- Instrucción de cantidades -->
      <div class="cant-instruccion">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Ajustá las cantidades de cada producto para ver el total real
      </div>

      {#if tab === 'uno'}
        <!-- ── Caso 1: Top 3 comercios ── -->

        {#if topComerciosConCant.length === 0}
          <div class="empty-state"><div class="empty-icon">🔍</div><p class="empty-title">Sin datos suficientes</p></div>
        {:else}

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

          {#each topComerciosConCant as com, idx (com.comercioId)}
            <div class="comercio-card" class:mejor={idx === 0}>
              <div class="com-header">
                <div class="com-rank">{#if idx === 0}🥇{:else if idx === 1}🥈{:else}🥉{/if}</div>
                <div class="com-info">
                  <span class="com-nombre">{com.comercioNombre}</span>
                  <div class="com-chips">
                    <span class="cobertura-chip" class:completa={com.cobertura===100} class:parcial={com.cobertura<100}>
                      {com.encontrados}/{com.totalItems} productos
                    </span>
                    {#if idx === 0 && topComerciosConCant.length > 1}
                      <span class="mejor-chip">Más conveniente</span>
                    {/if}
                  </div>
                </div>
                <div class="com-total-wrap">
                  <span class="com-total">{formatPrecioLista(com.totalConCant)}</span>
                  {#if idx > 0}
                    <span class="com-diff">+{formatPrecioLista(com.totalConCant - topComerciosConCant[0].totalConCant)}</span>
                  {/if}
                </div>
              </div>

              <div class="com-detalle">
                {#each com.detalle as item}
                  <div class="detalle-row" class:alternativo={item.esAlternativo}>
                    <div class="detalle-izq">
                      <span class="detalle-nombre">
                        {item.productoNombre}
                        {#if item.esAlternativo}<span class="alt-label">→ {item.precioNombre}</span>{/if}
                      </span>
                      <span class="detalle-unit-price">{formatPrecioLista(item.precio)} c/u</span>
                    </div>
                    <div class="cant-control">
                      <button class="cant-btn" on:click={() => setCant(item.productoId, cant(item.productoId) - 1)}>−</button>
                      <input
                        type="number" min="1" max="99"
                        class="cant-input"
                        value={cant(item.productoId)}
                        on:change={e => setCant(item.productoId, e.target.value)}
                      />
                      <button class="cant-btn" on:click={() => setCant(item.productoId, cant(item.productoId) + 1)}>+</button>
                    </div>
                    <span class="detalle-precio">{formatPrecioLista(item.precio * cant(item.productoId))}</span>
                  </div>
                {/each}

                {#if com.faltantes.length > 0}
                  <div class="faltantes-wrap">
                    <p class="faltantes-titulo">⚠ No disponibles en este comercio:</p>
                    {#each com.faltantes as f}<span class="faltante-chip">{f}</span>{/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {/if}

      {:else}
        <!-- ── Caso 2: Repartido ── -->

        {#if !repartidoConCant || repartidoConCant.sublistas.length === 0}
          <div class="empty-state"><div class="empty-icon">🔍</div><p class="empty-title">Sin datos suficientes</p></div>
        {:else}

          {#if repartidoConCant.ahorro > 0}
            <div class="ahorro-banner">
              <div class="ahorro-icon">💰</div>
              <div class="ahorro-text">
                <span class="ahorro-label">Ahorro estimado repartiendo</span>
                <span class="ahorro-valor">{formatPrecioLista(repartidoConCant.ahorro)}</span>
              </div>
              <span class="ahorro-pct">{pctAhorro(repartidoConCant.totalRepartidoConCant, repartidoConCant.totalSinRepartir)}</span>
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
            Dividí tu compra en {repartidoConCant.sublistas.length} parada{repartidoConCant.sublistas.length !== 1 ? 's' : ''} —
            Total: <strong>{formatPrecioLista(repartidoConCant.totalRepartidoConCant)}</strong>
          </p>

          {#each repartidoConCant.sublistas as sub, idx}
            <div class="sublista-card">
              <div class="sub-header">
                <div class="sub-num">Parada {idx + 1}</div>
                <span class="sub-comercio">{sub.comercioNombre}</span>
                <span class="sub-total">{formatPrecioLista(sub.totalConCant)}</span>
              </div>
              <div class="sub-items">
                {#each sub.items as item}
                  <div class="sub-row">
                    <span class="sub-nombre">{item.productoNombre}</span>
                    <div class="cant-control cant-control-sm">
                      <button class="cant-btn" on:click={() => setCant(item.productoId, cant(item.productoId) - 1)}>−</button>
                      <input
                        type="number" min="1" max="99"
                        class="cant-input"
                        value={cant(item.productoId)}
                        on:change={e => setCant(item.productoId, e.target.value)}
                      />
                      <button class="cant-btn" on:click={() => setCant(item.productoId, cant(item.productoId) + 1)}>+</button>
                    </div>
                    <span class="sub-precio">{formatPrecioLista(item.precio * cant(item.productoId))}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}

          {#if repartidoConCant.productosSinPrecio?.length > 0}
            <div class="sin-precio-wrap">
              <p class="sin-precio-titulo">Sin precio registrado:</p>
              {#each repartidoConCant.productosSinPrecio as p}<span class="faltante-chip">{p}</span>{/each}
            </div>
          {/if}
        {/if}
      {/if}

      <div style="height: 32px"></div>
    {/if}
  </main>
</div>

<style>
  .opt-shell { min-height: 100dvh; display: flex; flex-direction: column; }

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
  .opt-titulo  { font-family: var(--f-brand); font-size: 18px; }
  .opt-sub     { font-size: 12px; color: var(--c-text-light); }
  .header-acciones { display: flex; gap: 6px; flex-shrink: 0; }
  .btn-accion-header {
    width: 36px; height: 36px; border-radius: 50%;
    border: 1px solid var(--c-border); background: var(--c-surface);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--c-text-mid); transition: all 0.15s;
  }
  .btn-accion-header:hover { background: var(--c-surface-2); }

  .tabs-bar { display: flex; border-bottom: 1px solid var(--c-border); background: var(--c-surface); }
  .tab-btn {
    flex: 1; padding: 12px 8px; border: none; background: none;
    font-size: 13px; font-weight: 700; color: var(--c-text-light);
    cursor: pointer; border-bottom: 2px solid transparent;
    transition: all 0.15s; font-family: var(--f-ui);
  }
  .tab-btn.active { color: var(--c-primary); border-bottom-color: var(--c-primary); }

  .opt-main { flex: 1; padding: 16px; overflow-y: auto; }

  /* Instrucción cantidades */
  .cant-instruccion {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: var(--c-text-light);
    background: var(--c-surface-2); border-radius: var(--r-lg);
    padding: 10px 14px; margin-bottom: 14px;
  }

  /* Control de cantidad */
  .cant-control {
    display: flex; align-items: center; gap: 4px; flex-shrink: 0;
  }
  .cant-control-sm .cant-btn  { width: 24px; height: 24px; font-size: 14px; }
  .cant-control-sm .cant-input { width: 32px; font-size: 12px; }
  .cant-btn {
    width: 28px; height: 28px; border-radius: 50%;
    border: 1.5px solid var(--c-border); background: var(--c-surface);
    font-size: 16px; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--c-primary); line-height: 1; padding: 0;
    transition: all 0.15s; -webkit-tap-highlight-color: transparent;
  }
  .cant-btn:active { background: var(--c-surface-2); transform: scale(0.9); }
  .cant-input {
    width: 38px; text-align: center; border: 1.5px solid var(--c-border);
    border-radius: var(--r-md); font-size: 13px; font-weight: 700;
    padding: 4px 2px; font-family: var(--f-ui); color: var(--c-text);
    background: var(--c-surface); -moz-appearance: textfield;
  }
  .cant-input::-webkit-outer-spin-button,
  .cant-input::-webkit-inner-spin-button { -webkit-appearance: none; }

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

  /* Comercio cards */
  .comercio-card {
    background: var(--c-surface); border-radius: var(--r-xl);
    border: 1px solid var(--c-border); overflow: hidden;
    margin-bottom: 12px; box-shadow: var(--s-xs);
  }
  .comercio-card.mejor { border-color: var(--c-primary); box-shadow: 0 0 0 2px rgba(27,107,58,0.12), var(--s-sm); }
  .com-header { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--c-border); }
  .com-rank   { font-size: 24px; flex-shrink: 0; }
  .com-info   { flex: 1; min-width: 0; }
  .com-nombre { font-size: 15px; font-weight: 700; color: var(--c-text); display: block; }
  .com-chips  { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .cobertura-chip { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--r-full); }
  .cobertura-chip.completa { background: #D1FAE5; color: #065F46; }
  .cobertura-chip.parcial  { background: #FEF3C7; color: #92400E; }
  .mejor-chip { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: var(--r-full); background: var(--c-primary); color: white; }
  .com-total-wrap { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
  .com-total { font-family: var(--f-brand); font-size: 20px; font-weight: 700; color: var(--c-primary); }
  .com-diff  { font-size: 11px; color: #DC2626; font-weight: 700; }

  /* Detalle con cantidades */
  .com-detalle { padding: 8px 16px 12px; }
  .detalle-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 0; border-bottom: 1px solid var(--c-border);
  }
  .detalle-row:last-child { border-bottom: none; }
  .detalle-row.alternativo { background: rgba(245,163,33,0.06); border-radius: 4px; padding: 8px 8px; }
  .detalle-izq   { flex: 1; min-width: 0; }
  .detalle-nombre { display: block; font-size: 13px; color: var(--c-text); font-weight: 600; }
  .detalle-unit-price { display: block; font-size: 11px; color: var(--c-text-light); margin-top: 1px; }
  .alt-label { font-size: 11px; color: #92400E; display: block; }
  .detalle-precio { font-weight: 700; color: var(--c-text); white-space: nowrap; font-size: 14px; min-width: 64px; text-align: right; }

  .faltantes-wrap  { padding: 10px 0 4px; }
  .faltantes-titulo { font-size: 12px; color: #DC2626; font-weight: 600; margin-bottom: 6px; }
  .faltante-chip { display: inline-block; margin: 2px; padding: 3px 10px; background: #FEE2E2; color: #DC2626; border-radius: var(--r-full); font-size: 11px; font-weight: 600; }

  /* Ahorro banner */
  .ahorro-banner {
    display: flex; align-items: center; gap: 14px;
    background: linear-gradient(135deg, rgba(27,107,58,0.1), rgba(27,107,58,0.05));
    border: 1.5px solid rgba(27,107,58,0.25); border-radius: var(--r-xl);
    padding: 16px; margin-bottom: 16px;
  }
  .ahorro-icon  { font-size: 28px; }
  .ahorro-text  { flex: 1; }
  .ahorro-label { display: block; font-size: 11px; font-weight: 700; color: var(--c-primary); text-transform: uppercase; letter-spacing: 0.06em; }
  .ahorro-valor { display: block; font-family: var(--f-brand); font-size: 22px; font-weight: 700; color: var(--c-primary); }
  .ahorro-pct   { font-size: 16px; font-weight: 700; color: #059669; flex-shrink: 0; }

  /* Sublistas */
  .sublista-card { background: var(--c-surface); border-radius: var(--r-xl); border: 1px solid var(--c-border); overflow: hidden; margin-bottom: 12px; box-shadow: var(--s-xs); }
  .sub-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--c-surface-2); border-bottom: 1px solid var(--c-border); }
  .sub-num      { font-size: 11px; font-weight: 700; color: var(--c-text-light); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
  .sub-comercio { flex: 1; font-size: 15px; font-weight: 700; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub-total    { font-family: var(--f-brand); font-size: 17px; font-weight: 700; color: var(--c-primary); white-space: nowrap; }
  .sub-items    { padding: 8px 16px 12px; }
  .sub-row {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 0; border-bottom: 1px solid var(--c-border); font-size: 13px;
  }
  .sub-row:last-child { border-bottom: none; }
  .sub-nombre { color: var(--c-text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub-precio { font-weight: 700; color: var(--c-primary); white-space: nowrap; min-width: 64px; text-align: right; }

  .sin-precio-wrap   { padding: 12px; background: var(--c-surface-2); border-radius: var(--r-lg); margin-top: 8px; }
  .sin-precio-titulo { font-size: 12px; color: var(--c-text-light); margin-bottom: 8px; }

  /* Aviso pendientes */
  .pendientes-aviso {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px; margin-bottom: 14px;
    background: #FFFBEB; border: 1px solid #F59E0B; border-radius: var(--r-lg); color: #92400E;
  }
  .pendientes-aviso svg { flex-shrink: 0; margin-top: 1px; }
  .pendientes-titulo { display: block; font-size: 12px; font-weight: 700; }
  .pendientes-lista  { display: block; font-size: 12px; font-style: italic; margin-top: 2px; }

  /* Empty */
  .empty-state { text-align: center; padding: 60px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .empty-icon  { font-size: 48px; }
  .empty-title { font-family: var(--f-brand); font-size: 20px; color: var(--c-text); }
</style>