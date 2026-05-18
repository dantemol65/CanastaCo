<script>
  import { onMount } from 'svelte'
  import { currentPage, userProfile } from '../stores/auth.js'
  import {
    listaActiva, cargarLista,
    agregarItem, quitarItem,
    solicitarProducto, resolverItemPendiente,
  } from '../stores/listas_compras.js'
  import { productos, cargarProductos, CATEGORIAS } from '../stores/precios.js'
  import BottomNav from '../components/BottomNav.svelte'

  export let listaId = ''

  let cargando     = true
  let error        = null
  let toastMsg     = ''
  let busqueda     = ''
  let prodCargados   = false
  let mostrarBusq    = false
  let solicitando    = false

  $: lista     = $listaActiva
  $: perfil    = $userProfile
  $: localidad = perfil?.localidad || ''

  // Recargar cuando vuelve a ser la página activa (por si se cubrió algún pendiente)
  $: if ($currentPage === 'mi-lista:' + listaId) {
    cargarLista(listaId)
  }

  $: resultados = busqueda.trim().length >= 2
    ? $productos
        .filter(p =>
          !lista?.items?.some(i => i.productoId === p.id) &&
          (p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
           p.marca?.toLowerCase().includes(busqueda.toLowerCase()))
        )
        .slice(0, 6)
    : []

  function catEmoji(id) { return CATEGORIAS.find(c => c.id === id)?.emoji || '📦' }

  onMount(async () => {
    try {
      const l = await cargarLista(listaId)
      if (!l) { error = 'Lista no encontrada.'; cargando = false; return }
    } catch (e) {
      error = 'Error al cargar la lista.'
    } finally {
      cargando = false
    }
  })

  async function abrirBuscador() {
    mostrarBusq = true
    if (!prodCargados && localidad) {
      await cargarProductos(localidad)
      prodCargados = true
    }
  }

  async function handleSolicitar() {
    if (!busqueda.trim() || solicitando) return
    solicitando = true
    try {
      const r = await solicitarProducto(listaId, busqueda, localidad)
      if (r?.yaEnLista) {
        showToast('Ese producto ya está en la lista')
      } else {
        busqueda = ''
        showToast('✓ Solicitud enviada a la comunidad — agregado como pendiente')
      }
    } catch (e) {
      showToast('Error: ' + e.message)
    } finally {
      solicitando = false
    }
  }

  async function handleResolver(itemPendiente, prodReal) {
    try {
      await resolverItemPendiente(listaId, itemPendiente.productoNombre, prodReal)
      showToast(`✓ ${prodReal.nombre} reemplaza a "${itemPendiente.productoNombre}"`)
    } catch (e) {
      showToast('Error: ' + e.message)
    }
  }

  async function handleAgregar(prod) {
    try {
      await agregarItem(listaId, prod)
      busqueda = ''
      showToast(`✓ ${prod.nombre} agregado`)
    } catch (e) {
      showToast('Error: ' + e.message)
    }
  }

  async function handleQuitar(productoId, nombre) {
    await quitarItem(listaId, productoId)
    showToast(`${nombre} quitado`)
  }

  function showToast(msg) {
    toastMsg = msg
    setTimeout(() => toastMsg = '', 2500)
  }

  function irOptimizador() { currentPage.set('optimizador:' + listaId) }
  function volver()        { currentPage.set('mis-listas') }
</script>

<div class="app-shell milista-shell">

  {#if toastMsg}
    <div class="toast" role="status">{toastMsg}</div>
  {/if}

  <header class="milista-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="header-info">
      <h1 class="milista-titulo">{lista?.nombre || '…'}</h1>
      <p class="milista-sub">
        {lista?.items?.length || 0} producto{lista?.items?.length !== 1 ? 's' : ''}
      </p>
    </div>
    {#if lista?.items?.length > 0}
      <button class="btn-optimizar-header" on:click={irOptimizador} title="Optimizar compra">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        Optimizar
      </button>
    {/if}
  </header>

  <main class="milista-main scroll-area">

    {#if cargando}
      <div class="skeleton-group">
        {#each Array(4) as _}
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

      <!-- Buscador para agregar productos -->
      {#if mostrarBusq}
        <div class="busq-wrap">
          <div class="busq-input-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="search"
              class="busq-inner"
              placeholder="Buscar producto del catálogo…"
              bind:value={busqueda}
              autofocus
              autocomplete="off"
            />
            {#if busqueda}
              <button class="busq-clear" on:click={() => busqueda = ''}>✕</button>
            {/if}
          </div>

          {#if resultados.length > 0}
            <div class="busq-resultados">
              {#each resultados as prod (prod.id)}
                <button class="busq-item" on:click={() => handleAgregar(prod)}>
                  <span class="busq-emoji">{catEmoji(prod.categoria)}</span>
                  <div class="busq-info">
                    <span class="busq-nombre">{prod.nombre}</span>
                    {#if prod.marca}<span class="busq-marca">{prod.marca}</span>{/if}
                  </div>
                  <span class="busq-add">+</span>
                </button>
              {/each}
            </div>
          {:else if busqueda.trim().length >= 2}
            <div class="busq-sin-resultado">
              <p class="busq-empty">"{busqueda}" no está en el catálogo</p>
              <button
                class="btn-solicitar"
                on:click={handleSolicitar}
                disabled={solicitando}
              >
                {#if solicitando}
                  <div class="mini-spin"></div>
                  Enviando…
                {:else}
                  📣 Solicitar a la comunidad y agregar como pendiente
                {/if}
              </button>
            </div>
          {/if}

          <button class="btn-cerrar-busq" on:click={() => { mostrarBusq = false; busqueda = '' }}>
            Cerrar buscador
          </button>
        </div>
      {/if}

      <!-- Ítems de la lista -->
      {#if !lista?.items?.length}
        <div class="empty-state" style="padding:40px 24px">
          <div class="empty-icon">📝</div>
          <p class="empty-title">Lista vacía</p>
          <p class="empty-sub">Agregá productos del catálogo de tu localidad.</p>
        </div>
      {:else}
        <!-- Agrupar por categoría -->
        {#each CATEGORIAS.filter(c => lista.items.some(i => i.productoCategoria === c.id)) as cat}
          <div class="cat-grupo">
            <div class="cat-label">
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </div>
            {#each lista.items.filter(i => i.productoCategoria === cat.id) as item (item.productoId)}
              {#if item.pendiente}
                <!-- Ítem pendiente: sin precio, solicitado a la comunidad -->
                <div class="item-row item-pendiente">
                  <div class="item-info">
                    <span class="item-nombre">{item.productoNombre}</span>
                    <span class="pendiente-chip">⏳ Pendiente — solicitado a la comunidad</span>
                  </div>
                  <button
                    class="btn-quitar"
                    on:click={() => handleQuitar(item.productoId, item.productoNombre)}
                    aria-label="Quitar"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              {:else}
                <div class="item-row">
                  <div class="item-info">
                    <span class="item-nombre">{item.productoNombre}</span>
                    {#if item.productoMarca}
                      <span class="item-marca">{item.productoMarca}</span>
                    {/if}
                  </div>
                  <span class="item-unidad">{item.productoUnidad}</span>
                  <button
                    class="btn-quitar"
                    on:click={() => handleQuitar(item.productoId, item.productoNombre)}
                    aria-label="Quitar"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              {/if}
            {/each}
          </div>
        {/each}

        <!-- Items sin categoría reconocida -->
        {#if lista.items.some(i => !CATEGORIAS.find(c => c.id === i.productoCategoria))}
          <div class="cat-grupo">
            <div class="cat-label"><span>📦</span><span>Otros</span></div>
            {#each lista.items.filter(i => !CATEGORIAS.find(c => c.id === i.productoCategoria)) as item (item.productoId)}
{#if item.pendiente}
                <div class="item-row item-pendiente">
                  <div class="item-info">
                    <span class="item-nombre">{item.productoNombre}</span>
                    <span class="pendiente-chip">⏳ Pendiente</span>
                  </div>
                  <button class="btn-quitar" on:click={() => handleQuitar(item.productoId, item.productoNombre)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              {:else}
                <div class="item-row">
                  <div class="item-info">
                    <span class="item-nombre">{item.productoNombre}</span>
                    {#if item.productoMarca}<span class="item-marca">{item.productoMarca}</span>{/if}
                  </div>
                  <span class="item-unidad">{item.productoUnidad}</span>
                  <button class="btn-quitar" on:click={() => handleQuitar(item.productoId, item.productoNombre)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      {/if}

      <div style="height: 100px"></div>
    {/if}
  </main>

  <!-- FAB agregar producto -->
  {#if !cargando && !error && !mostrarBusq}
    <button class="fab-agregar" on:click={abrirBuscador} aria-label="Agregar producto">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Agregar producto
    </button>
  {/if}

  <BottomNav active="home" />
</div>

<style>
  .milista-shell { padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px)); }

  /* Header */
  .milista-header {
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
  .milista-titulo { font-family: var(--f-brand); font-size: 18px; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .milista-sub    { font-size: 12px; color: var(--c-text-light); }
  .btn-optimizar-header {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: var(--r-full);
    background: var(--c-primary); color: white; border: none;
    font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;
    flex-shrink: 0;
  }

  /* Main */
  .milista-main { padding: 16px; }

  /* Buscador */
  .busq-wrap {
    background: var(--c-surface); border-radius: var(--r-xl);
    border: 1.5px solid var(--c-primary); padding: 14px;
    margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px;
  }
  .busq-input-box {
    display: flex; align-items: center; gap: 10px;
    background: var(--c-surface-2); border-radius: var(--r-lg); padding: 10px 14px;
  }
  .busq-inner {
    flex: 1; border: none; background: transparent;
    font-size: 15px; font-family: var(--f-ui); color: var(--c-text);
  }
  .busq-inner:focus { outline: none; }
  .busq-clear { background: none; border: none; color: var(--c-text-light); cursor: pointer; font-size: 13px; }

  .busq-resultados { display: flex; flex-direction: column; gap: 4px; }
  .busq-item {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    background: var(--c-surface-2); border-radius: var(--r-md); border: none;
    cursor: pointer; text-align: left; transition: background 0.15s;
  }
  .busq-item:active { background: var(--c-border); }
  .busq-emoji { font-size: 16px; }
  .busq-info  { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .busq-nombre { font-size: 14px; font-weight: 600; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .busq-marca  { font-size: 11px; color: var(--c-text-light); }
  .busq-add    { font-size: 20px; font-weight: 700; color: var(--c-primary); flex-shrink: 0; }
  .busq-empty  { font-size: 13px; color: var(--c-text-light); text-align: center; padding: 8px 0; }
  .btn-cerrar-busq {
    background: none; border: none; font-size: 13px; color: var(--c-text-light);
    text-decoration: underline; cursor: pointer; text-align: center; padding: 4px;
  }

  /* Grupos de categoría */
  .cat-grupo { margin-bottom: 18px; }
  .cat-label {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 700; color: var(--c-text-mid);
    text-transform: uppercase; letter-spacing: 0.06em;
    padding: 6px 0 8px;
  }

  /* Ítems */
  .item-row {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; background: var(--c-surface);
    border-radius: var(--r-md); margin-bottom: 6px;
    border: 1px solid var(--c-border);
  }
  .item-info { flex: 1; min-width: 0; }
  .item-nombre { display: block; font-size: 14px; font-weight: 700; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-marca  { display: block; font-size: 11px; color: var(--c-text-light); }
  .item-unidad { font-size: 11px; color: var(--c-text-light); background: var(--c-surface-2); padding: 2px 7px; border-radius: var(--r-full); flex-shrink: 0; }
  .btn-quitar {
    width: 28px; height: 28px; border-radius: 50%;
    border: none; background: var(--c-surface-2); color: var(--c-text-light);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s;
  }
  .btn-quitar:hover { background: var(--c-error-bg); color: var(--c-error); }

  /* FAB */
  .fab-agregar {
    position: fixed;
    bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 16px);
    left: 50%; transform: translateX(-50%);
    background: var(--c-primary); color: white;
    border: none; border-radius: var(--r-full);
    padding: 14px 24px; font-size: 15px; font-weight: 700;
    display: flex; align-items: center; gap: 8px;
    box-shadow: var(--s-lg); cursor: pointer; z-index: 60;
    width: calc(var(--app-width) - 48px); max-width: 380px;
    justify-content: center; -webkit-tap-highlight-color: transparent;
  }
  .fab-agregar:active { transform: translateX(-50%) scale(0.97); }

  /* Skeleton */
  .skeleton-group { display: flex; flex-direction: column; gap: 8px; }
  .skeleton-row { height: 60px; background: var(--c-border); border-radius: var(--r-md); animation: pulse 1.4s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

  /* Empty */
  .empty-state { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .empty-icon  { font-size: 48px; }
  .empty-title { font-family: var(--f-brand); font-size: 20px; color: var(--c-text); }
  .empty-sub   { font-size: 14px; color: var(--c-text-light); line-height: 1.6; max-width: 280px; }

  /* Ítem pendiente */
  .item-pendiente {
    border-color: #F59E0B !important;
    background: #FFFBEB !important;
  }
  .pendiente-chip {
    display: block; font-size: 11px; color: #92400E;
    font-weight: 600; margin-top: 3px;
  }

  /* Botón solicitar */
  .busq-sin-resultado { display: flex; flex-direction: column; gap: 8px; }
  .btn-solicitar {
    width: 100%; padding: 11px 14px;
    background: rgba(245,163,33,0.1); border: 1.5px dashed #F59E0B;
    border-radius: var(--r-lg); color: #92400E;
    font-size: 13px; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background 0.15s; font-family: var(--f-ui);
  }
  .btn-solicitar:hover  { background: rgba(245,163,33,0.18); }
  .btn-solicitar:active { transform: scale(0.98); }
  .btn-solicitar:disabled { opacity: 0.6; cursor: not-allowed; }
  .mini-spin {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid rgba(146,64,14,0.3); border-top-color: #92400E;
    animation: spin 0.7s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Toast */
  .toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: var(--c-text); color: white; padding: 10px 20px;
    border-radius: var(--r-full); font-size: 13px; font-weight: 600;
    z-index: 200; white-space: nowrap; box-shadow: var(--s-md);
  }
</style>