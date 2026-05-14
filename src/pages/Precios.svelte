<script>
  import { onMount, tick } from 'svelte'
  import { currentPage, currentUser, userProfile } from '../stores/auth.js'
  import { comercioActivo, cargarComercio } from '../stores/comercios.js'
  import {
    productos, preciosComercio, cargandoPrecios,
    cargarProductos, cargarPreciosComercio,
    buscarOCrearProducto, registrarPrecio,
    reportarPrecioIncorrecto, verificarPrecio,
    CATEGORIAS, UNIDADES,
    freshness, freshnessLabel, formatPrecio, esPrecioVencido,
  } from '../stores/precios.js'
  import BottomNav from '../components/BottomNav.svelte'

  export let comercioId = ''

  let comercio      = null
  let cargando      = true
  let error         = null
  let toastMsg      = ''
  let toastTipo     = 'ok'   // 'ok' | 'err'

  // ── Estado del formulario inline ──────────────────────────────────────
  let mostrarForm    = false
  let paso           = 1      // 1: buscar producto  2: ingresar precio

  // Paso 1
  let busquedaProd   = ''
  let productoSel    = null
  let sugerencias    = []
  let modoNuevo      = false
  let nuevaMarca     = ''
  let nuevaUnidad    = 'u'
  let nuevaCategoria = 'otros'

  // Paso 2
  let precioValor    = ''
  let esOferta       = false
  let vencimiento    = ''
  let guardando      = false

  // ── Filtros vista ─────────────────────────────────────────────────────
  let filtroCategoria = ''

  $: user    = $currentUser
  $: perfil  = $userProfile
  $: rol     = perfil?.rol || 'usuario'
  $: esComercioOwner = comercio?.reclamadoPor === user?.uid
  $: esDedicado      = rol === 'dedicado'

  $: localidadId = perfil?.localidad || ''

  // Agrupar por categoría
  $: listaCategorias = (() => {
    const f = filtroCategoria
    const lista = $preciosComercio.filter(p => !f || p.productoCategoria === f)
    const grupos = {}
    for (const p of lista) {
      const cat = p.productoCategoria || 'otros'
      if (!grupos[cat]) grupos[cat] = []
      grupos[cat].push(p)
    }
    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0], 'es'))
  })()

  $: catLabel = id => CATEGORIAS.find(c => c.id === id)?.label || id
  $: catEmoji = id => CATEGORIAS.find(c => c.id === id)?.emoji || '📦'

  // Búsqueda de productos
  $: if (busquedaProd.length >= 2) {
    const q = busquedaProd.toLowerCase()
    sugerencias = $productos
      .filter(p => p.nombre.toLowerCase().includes(q) || p.marca?.toLowerCase().includes(q))
      .slice(0, 6)
    modoNuevo = sugerencias.length === 0
  } else {
    sugerencias = []
    modoNuevo   = false
  }

  onMount(async () => {
    const c = await cargarComercio(comercioId)
    comercio = c
    if (!c) { error = 'Comercio no encontrado.'; cargando = false; return }
    await Promise.all([
      cargarPreciosComercio(comercioId),
      cargarProductos(localidadId),
    ])
    cargando = false
  })

  // ── Helpers ───────────────────────────────────────────────────────────

  function showToast(msg, tipo = 'ok') {
    toastMsg = msg; toastTipo = tipo
    setTimeout(() => toastMsg = '', 3000)
  }

  function abrirForm() {
    mostrarForm    = true
    paso           = 1
    busquedaProd   = ''
    productoSel    = null
    sugerencias    = []
    modoNuevo      = false
    nuevaMarca     = ''
    nuevaUnidad    = 'u'
    nuevaCategoria = 'otros'
    precioValor    = ''
    esOferta       = false
    vencimiento    = ''
  }

  function cerrarForm() { mostrarForm = false }

  function seleccionarProducto(p) {
    productoSel  = p
    busquedaProd = p.nombre
    sugerencias  = []
    paso = 2
  }

  async function confirmarProductoNuevo() {
    if (!busquedaProd.trim()) return
    try {
      const p = await buscarOCrearProducto({
        nombre:    busquedaProd,
        marca:     nuevaMarca,
        unidad:    nuevaUnidad,
        categoria: nuevaCategoria,
        localidad: localidadId,
      })
      productoSel = p
      paso = 2
    } catch (e) {
      showToast('Error al crear producto: ' + e.message, 'err')
    }
  }

  async function guardarPrecio() {
    if (!precioValor || isNaN(parseFloat(precioValor)) || !productoSel) return
    guardando = true
    try {
      const nuevo = await registrarPrecio({
        comercioId,
        comercioNombre: comercio.nombre,
        localidad:      localidadId,
        productoId:     productoSel.id,
        productoNombre: productoSel.nombre,
        productoUnidad: productoSel.unidad,
        productoCategoria: productoSel.categoria,
        precio:         precioValor,
        esOferta,
        vencimiento:    esOferta && vencimiento ? vencimiento : null,
      })
      // Actualizar store local
      preciosComercio.update(l => {
        const filtered = l.filter(p => p.productoId !== productoSel.id)
        return [...filtered, nuevo].sort((a, b) =>
          (a.productoNombre || '').localeCompare(b.productoNombre || '', 'es')
        )
      })
      showToast('✓ Precio guardado')
      cerrarForm()
    } catch (e) {
      showToast('Error: ' + e.message, 'err')
    } finally {
      guardando = false
    }
  }

  async function handleReportar(precioId) {
    try {
      const total = await reportarPrecioIncorrecto(precioId)
      if (total >= 3) {
        preciosComercio.update(l => l.filter(p => p.id !== precioId))
        showToast('Precio removido por múltiples reportes')
      } else {
        showToast(`Precio reportado (${total}/3 para remover)`)
      }
    } catch (e) {
      showToast(e.message, 'err')
    }
  }

  async function handleVerificar(precioId) {
    try {
      await verificarPrecio(precioId)
      preciosComercio.update(l =>
        l.map(p => p.id === precioId
          ? { ...p, totalVerificaciones: (p.totalVerificaciones || 0) + 1 }
          : p
        )
      )
      showToast('✓ Precio confirmado')
    } catch (e) {
      showToast(e.message, 'err')
    }
  }

  function irComparador(productoId) {
    currentPage.set('comparador:' + productoId)
  }

  function irListaPrecios() {
    currentPage.set('lista-precios:' + comercioId)
  }

  function volver() { currentPage.set('detalle-comercio:' + comercioId) }
</script>

<div class="app-shell precios-shell">

  {#if toastMsg}
    <div class="toast" class:toast-err={toastTipo === 'err'} role="status">{toastMsg}</div>
  {/if}

  <!-- Header -->
  <header class="precios-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="header-info">
      <h1 class="header-titulo">Precios</h1>
      {#if comercio}<p class="header-sub">{comercio.nombre}</p>{/if}
    </div>
    {#if esComercioOwner || esDedicado}
      <button class="btn-lista-header" on:click={irListaPrecios} title="Cargar lista completa">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="8" y1="6"  x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6"  x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        Lista
      </button>
    {/if}
  </header>

  <main class="precios-main scroll-area">

    {#if cargando}
      <div class="skeleton-group">
        {#each Array(5) as _}
          <div class="skeleton-row"></div>
        {/each}
      </div>

    {:else if error}
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p class="empty-title">{error}</p>
        <button class="btn btn-primary" on:click={volver}>Volver</button>
      </div>

    {:else}

      <!-- Filtro por categoría -->
      {#if $preciosComercio.length > 0}
        <div class="cat-pills">
          <button
            class="cat-pill"
            class:active={filtroCategoria === ''}
            on:click={() => filtroCategoria = ''}
          >Todos</button>
          {#each CATEGORIAS.filter(c => $preciosComercio.some(p => p.productoCategoria === c.id)) as cat}
            <button
              class="cat-pill"
              class:active={filtroCategoria === cat.id}
              on:click={() => filtroCategoria = cat.id}
            >
              {cat.emoji} {cat.label}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Lista de precios -->
      {#if listaCategorias.length === 0}
        <div class="empty-state">
          <div class="empty-icon">🏷️</div>
          <p class="empty-title">Sin precios registrados</p>
          <p class="empty-sub">¡Sé el primero en cargar precios de este comercio!</p>
        </div>
      {:else}
        {#each listaCategorias as [catId, items]}
          <div class="precio-grupo">
            <div class="grupo-header">
              <span class="grupo-emoji">{catEmoji(catId)}</span>
              <span class="grupo-label">{catLabel(catId)}</span>
            </div>

            {#each items as precio (precio.id)}
              {@const fresco = freshness(precio)}
              <div class="precio-card" class:oferta={precio.esOferta}>

                {#if precio.esOferta}
                  <div class="oferta-badge">🔥 Oferta</div>
                {/if}

                <div class="precio-top">
                  <div class="precio-producto">
                    <span class="precio-nombre">{precio.productoNombre}</span>
                    {#if precio.productoUnidad && precio.productoUnidad !== 'u'}
                      <span class="precio-unidad">× {precio.productoUnidad}</span>
                    {/if}
                  </div>
                  <div class="precio-valor">{formatPrecio(precio.precio)}</div>
                </div>

                <div class="precio-meta">
                  <span
                    class="freshness-chip"
                    class:fresco={fresco === 'fresco'}
                    class:valido={fresco === 'valido'}
                    class:viejo={fresco === 'viejo'}
                  >{freshnessLabel(precio)}</span>

                  {#if precio.totalVerificaciones > 0}
                    <span class="verif-chip">✓ {precio.totalVerificaciones}</span>
                  {/if}
                </div>

                <div class="precio-acciones">
                  <button class="accion-btn verif-btn"
                    on:click={() => handleVerificar(precio.id)}
                    title="Confirmar precio">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Confirmar
                  </button>

                  <button class="accion-btn comparar-btn"
                    on:click={() => irComparador(precio.productoId)}
                    title="Comparar en otros comercios">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    Comparar
                  </button>

                  <button class="accion-btn report-btn"
                    on:click={() => handleReportar(precio.id)}
                    title="Reportar precio incorrecto">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Incorrecto
                  </button>
                </div>

              </div>
            {/each}
          </div>
        {/each}
      {/if}

      <div style="height: 100px"></div>
    {/if}
  </main>

  <!-- FAB: cargar precio -->
  {#if !cargando && !error && !mostrarForm}
    <button class="fab-cargar" on:click={abrirForm} aria-label="Cargar precio">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5"  y1="12" x2="19" y2="12"/>
      </svg>
      Cargar precio
    </button>
  {/if}

  <!-- Bottom sheet: formulario de precio -->
  {#if mostrarForm}
    <div class="sheet-overlay" on:click={cerrarForm} role="presentation"></div>
    <div class="bottom-sheet" role="dialog" aria-label="Cargar precio">

      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h2 class="sheet-titulo">
          {paso === 1 ? '¿Qué producto?' : 'Ingresá el precio'}
        </h2>
        <button class="sheet-cerrar" on:click={cerrarForm} aria-label="Cerrar">✕</button>
      </div>

      <!-- Paso 1: buscar/crear producto -->
      {#if paso === 1}
        <div class="sheet-body">
          <div class="form-group">
            <label class="form-label" for="busq-prod">Nombre del producto</label>
            <input
              id="busq-prod"
              type="text"
              class="form-input"
              placeholder="Ej: Leche entera, Tomate, Pan lactal…"
              bind:value={busquedaProd}
              autocomplete="off"
              autocorrect="off"
            />
          </div>

          <!-- Sugerencias -->
          {#if sugerencias.length > 0}
            <div class="sugerencias">
              {#each sugerencias as sug}
                <button class="sugerencia-item" on:click={() => seleccionarProducto(sug)}>
                  <span class="sug-emoji">{catEmoji(sug.categoria)}</span>
                  <span class="sug-nombre">{sug.nombre}</span>
                  {#if sug.marca}<span class="sug-marca">{sug.marca}</span>{/if}
                  <span class="sug-unidad">{sug.unidad}</span>
                </button>
              {/each}
            </div>
          {/if}

          <!-- Modo nuevo producto -->
          {#if modoNuevo && busquedaProd.length >= 2}
            <div class="nuevo-producto-form">
              <p class="nuevo-titulo">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" stroke-width="2.5" stroke-linecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Producto nuevo: <strong>{busquedaProd}</strong>
              </p>

              <div class="nuevo-grid">
                <div class="form-group">
                  <label class="form-label" for="nueva-marca">Marca (opcional)</label>
                  <input id="nueva-marca" type="text" class="form-input" placeholder="Ej: La Serenísima" bind:value={nuevaMarca}/>
                </div>

                <div class="form-group">
                  <label class="form-label" for="nueva-unidad">Unidad</label>
                  <select id="nueva-unidad" class="form-select" bind:value={nuevaUnidad}>
                    {#each UNIDADES as u}
                      <option value={u.id}>{u.label}</option>
                    {/each}
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="nueva-cat">Categoría</label>
                <select id="nueva-cat" class="form-select" bind:value={nuevaCategoria}>
                  {#each CATEGORIAS as c}
                    <option value={c.id}>{c.emoji} {c.label}</option>
                  {/each}
                </select>
              </div>

              <button class="btn btn-primary btn-full" on:click={confirmarProductoNuevo}>
                Continuar con "{busquedaProd}"
              </button>
            </div>
          {/if}
        </div>

      <!-- Paso 2: ingresar precio -->
      {:else}
        <div class="sheet-body">
          <div class="producto-sel-chip">
            <span>{catEmoji(productoSel?.categoria)}</span>
            <span class="chip-nombre">{productoSel?.nombre}</span>
            {#if productoSel?.marca}<span class="chip-marca">{productoSel.marca}</span>{/if}
            <button class="chip-cambiar" on:click={() => { paso = 1; productoSel = null }}>cambiar</button>
          </div>

          <div class="form-group precio-input-group">
            <label class="form-label" for="precio-val">Precio ($)</label>
            <div class="precio-input-wrap">
              <span class="peso-symbol">$</span>
              <input
                id="precio-val"
                type="number"
                inputmode="decimal"
                class="form-input precio-input"
                placeholder="0"
                bind:value={precioValor}
                min="0"
                step="0.5"
              />
            </div>
          </div>

          <label class="oferta-toggle">
            <input type="checkbox" bind:checked={esOferta}/>
            <span class="toggle-track"></span>
            <span class="toggle-label">🔥 Es oferta / promoción</span>
          </label>

          {#if esOferta}
            <div class="form-group" style="margin-top:14px">
              <label class="form-label" for="venc">Vence el (opcional)</label>
              <input
                id="venc"
                type="date"
                class="form-input"
                bind:value={vencimiento}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          {/if}

          <button
            class="btn btn-primary btn-full"
            style="margin-top:20px"
            on:click={guardarPrecio}
            disabled={!precioValor || guardando}
          >
            {guardando ? 'Guardando…' : '✓ Guardar precio'}
          </button>
        </div>
      {/if}

    </div>
  {/if}

  <BottomNav active="buscar" />
</div>

<style>
  .precios-shell { padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px)); }

  /* Header */
  .precios-header {
    position: sticky; top: 0; z-index: 50;
    background: var(--c-surface);
    border-bottom: 1px solid var(--c-border);
    padding: 14px 16px;
    display: flex; align-items: center; gap: 10px;
  }
  .btn-volver {
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: var(--c-surface-2);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; color: var(--c-text);
  }
  .header-info { flex: 1; min-width: 0; }
  .header-titulo { font-family: var(--f-brand); font-size: 18px; color: var(--c-text); }
  .header-sub { font-size: 12px; color: var(--c-text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btn-lista-header {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 12px; border-radius: var(--r-full);
    border: 1.5px solid var(--c-primary); background: transparent;
    color: var(--c-primary); font-size: 13px; font-weight: 700;
    cursor: pointer; white-space: nowrap;
  }

  /* Main */
  .precios-main { padding: 12px 16px; }

  /* Filtro pills */
  .cat-pills {
    display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px;
    -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .cat-pills::-webkit-scrollbar { display: none; }
  .cat-pill {
    flex-shrink: 0; padding: 6px 14px; border-radius: var(--r-full);
    border: 1.5px solid var(--c-border); background: var(--c-surface);
    font-size: 12px; font-weight: 600; color: var(--c-text-mid);
    cursor: pointer; transition: all 0.15s;
  }
  .cat-pill.active {
    background: var(--c-primary); border-color: var(--c-primary);
    color: white;
  }

  /* Grupos */
  .precio-grupo { margin-bottom: 20px; }
  .grupo-header {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 0 10px;
  }
  .grupo-emoji { font-size: 16px; }
  .grupo-label { font-size: 13px; font-weight: 700; color: var(--c-text-mid); text-transform: uppercase; letter-spacing: 0.06em; }

  /* Precio card */
  .precio-card {
    background: var(--c-surface); border-radius: var(--r-lg);
    border: 1px solid var(--c-border); padding: 14px;
    margin-bottom: 8px; position: relative; overflow: hidden;
  }
  .precio-card.oferta { border-color: var(--c-accent); }
  .oferta-badge {
    position: absolute; top: 0; right: 0;
    background: var(--c-accent); color: white;
    font-size: 10px; font-weight: 700; padding: 3px 10px;
    border-radius: 0 var(--r-lg) 0 var(--r-md);
  }
  .precio-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
  .precio-producto { flex: 1; min-width: 0; }
  .precio-nombre { font-weight: 700; font-size: 15px; color: var(--c-text); display: block; }
  .precio-unidad { font-size: 11px; color: var(--c-text-light); }
  .precio-valor { font-family: var(--f-brand); font-size: 20px; font-weight: 700; color: var(--c-primary); white-space: nowrap; }

  .precio-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .freshness-chip {
    font-size: 11px; font-weight: 600; padding: 2px 8px;
    border-radius: var(--r-full);
  }
  .freshness-chip.fresco  { background: #D1FAE5; color: #059669; }
  .freshness-chip.valido  { background: #FEF3C7; color: #D97706; }
  .freshness-chip.viejo   { background: #FEE2E2; color: #DC2626; }
  .verif-chip { font-size: 11px; color: var(--c-primary); font-weight: 600; }

  .precio-acciones { display: flex; gap: 6px; }
  .accion-btn {
    flex: 1; padding: 7px 8px; border-radius: var(--r-md);
    border: 1.5px solid; font-size: 11px; font-weight: 700;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;
    transition: all 0.15s; background: transparent;
  }
  .accion-btn:active { transform: scale(0.95); }
  .verif-btn   { border-color: #059669; color: #059669; }
  .comparar-btn { border-color: var(--c-primary); color: var(--c-primary); }
  .report-btn  { border-color: #DC2626; color: #DC2626; }
  .verif-btn:hover   { background: #D1FAE5; }
  .comparar-btn:hover { background: rgba(27,107,58,0.08); }
  .report-btn:hover  { background: #FEE2E2; }

  /* FAB */
  .fab-cargar {
    position: fixed;
    bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 16px);
    left: 50%; transform: translateX(-50%);
    background: var(--c-primary); color: white;
    border: none; border-radius: var(--r-full);
    padding: 14px 24px; font-size: 15px; font-weight: 700;
    display: flex; align-items: center; gap: 8px;
    box-shadow: var(--s-lg); cursor: pointer;
    z-index: 60; transition: all 0.18s;
    -webkit-tap-highlight-color: transparent;
    width: calc(var(--app-width) - 48px); max-width: 380px;
    justify-content: center;
  }
  .fab-cargar:active { transform: translateX(-50%) scale(0.97); }

  /* Bottom sheet */
  .sheet-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4);
    z-index: 80; animation: fadeIn 0.2s ease;
  }
  .bottom-sheet {
    position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 100%; max-width: var(--app-width);
    background: var(--c-surface); border-radius: var(--r-xl) var(--r-xl) 0 0;
    padding: 12px 20px calc(env(safe-area-inset-bottom, 0px) + 24px);
    z-index: 90; max-height: 88dvh; overflow-y: auto;
    box-shadow: var(--s-lg);
    animation: sheetUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes sheetUp {
    from { transform: translateX(-50%) translateY(100%); }
    to   { transform: translateX(-50%) translateY(0); }
  }
  .sheet-handle { width: 40px; height: 4px; background: var(--c-border); border-radius: 2px; margin: 0 auto 16px; }
  .sheet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .sheet-titulo { font-family: var(--f-brand); font-size: 19px; color: var(--c-text); }
  .sheet-cerrar { background: none; border: none; font-size: 18px; color: var(--c-text-light); cursor: pointer; padding: 4px 8px; }

  /* Sugerencias */
  .sugerencias { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
  .sugerencia-item {
    display: flex; align-items: center; gap: 8px; padding: 10px 12px;
    background: var(--c-surface-2); border-radius: var(--r-md);
    border: none; cursor: pointer; text-align: left; transition: background 0.15s;
  }
  .sugerencia-item:hover { background: var(--c-border); }
  .sug-emoji  { font-size: 15px; }
  .sug-nombre { flex: 1; font-weight: 600; font-size: 14px; color: var(--c-text); }
  .sug-marca  { font-size: 12px; color: var(--c-text-light); }
  .sug-unidad { font-size: 12px; color: var(--c-text-mid); background: var(--c-surface); border-radius: 4px; padding: 2px 6px; }

  /* Nuevo producto */
  .nuevo-producto-form { background: var(--c-surface-2); border-radius: var(--r-lg); padding: 14px; margin-top: 8px; }
  .nuevo-titulo { font-size: 13px; color: var(--c-text-mid); margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }
  .nuevo-titulo strong { color: var(--c-text); }
  .nuevo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* Producto seleccionado chip */
  .producto-sel-chip {
    display: flex; align-items: center; gap: 8px;
    background: rgba(27,107,58,0.08); border-radius: var(--r-md);
    padding: 10px 14px; margin-bottom: 20px;
  }
  .chip-nombre { flex: 1; font-weight: 700; font-size: 15px; color: var(--c-primary); }
  .chip-marca  { font-size: 12px; color: var(--c-text-light); }
  .chip-cambiar { background: none; border: none; font-size: 12px; color: var(--c-text-light); text-decoration: underline; cursor: pointer; }

  /* Precio input */
  .precio-input-wrap { position: relative; }
  .peso-symbol {
    position: absolute; left: 15px; top: 50%; transform: translateY(-50%);
    font-size: 17px; font-weight: 700; color: var(--c-text-mid); pointer-events: none;
  }
  .precio-input { padding-left: 32px; font-size: 24px !important; font-weight: 700; letter-spacing: -0.02em; }

  /* Toggle oferta */
  .oferta-toggle {
    display: flex; align-items: center; gap: 12px; cursor: pointer;
    padding: 10px 0;
  }
  .oferta-toggle input { display: none; }
  .toggle-track {
    width: 44px; height: 24px; border-radius: 12px;
    background: var(--c-border); position: relative; transition: background 0.2s; flex-shrink: 0;
  }
  .toggle-track::after {
    content: ''; position: absolute; top: 3px; left: 3px;
    width: 18px; height: 18px; border-radius: 50%;
    background: white; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .oferta-toggle input:checked ~ .toggle-track { background: var(--c-accent); }
  .oferta-toggle input:checked ~ .toggle-track::after { transform: translateX(20px); }
  .toggle-label { font-size: 14px; font-weight: 600; color: var(--c-text); }

  /* Skeleton */
  .skeleton-group { padding: 8px 0; }
  .skeleton-row { height: 80px; background: var(--c-border); border-radius: var(--r-lg); margin-bottom: 8px; animation: pulse 1.4s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

  /* Empty state */
  .empty-state { text-align: center; padding: 60px 24px; }
  .empty-icon  { font-size: 48px; margin-bottom: 16px; }
  .empty-title { font-family: var(--f-brand); font-size: 20px; color: var(--c-text); margin-bottom: 8px; }
  .empty-sub   { font-size: 14px; color: var(--c-text-light); line-height: 1.5; }

  /* Toast */
  .toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: var(--c-text); color: white;
    padding: 10px 20px; border-radius: var(--r-full);
    font-size: 13px; font-weight: 600;
    box-shadow: var(--s-md); z-index: 200;
    animation: fadeIn 0.2s ease;
    white-space: nowrap;
  }
  .toast.toast-err { background: var(--c-error); }
</style>