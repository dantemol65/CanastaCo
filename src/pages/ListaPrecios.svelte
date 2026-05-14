<script>
  import { onMount } from 'svelte'
  import { currentPage, currentUser, userProfile } from '../stores/auth.js'
  import { comercioActivo, cargarComercio } from '../stores/comercios.js'
  import {
    productos,
    cargarProductos,
    buscarOCrearProducto,
    registrarPrecio,
    crearLista,
    publicarLista,
    actualizarTotalItems,
    CATEGORIAS, UNIDADES,
    formatPrecio,
  } from '../stores/precios.js'

  export let comercioId = ''

  let comercio     = null
  let cargando     = true
  let toastMsg     = ''
  let toastTipo    = 'ok'

  // ── Lista activa ──────────────────────────────────────────────────────
  let listaId      = null
  let listaItems   = []   // { productoId, productoNombre, productoUnidad, productoCategoria, precio, esOferta, vencimiento }

  // ── Paso actual: 'form' | 'confirmacion' ─────────────────────────────
  let paso         = 'form'

  // ── Formulario de ítem ────────────────────────────────────────────────
  let busquedaProd   = ''
  let productoSel    = null
  let sugerencias    = []
  let modoNuevo      = false
  let nuevaMarca     = ''
  let nuevaUnidad    = 'u'
  let nuevaCategoria = 'otros'
  let precioValor    = ''
  let esOferta       = false
  let vencimiento    = ''
  let guardandoItem  = false
  let publicando     = false

  $: perfil     = $userProfile
  $: localidad  = perfil?.localidad || ''

  $: if (busquedaProd.length >= 2) {
    const q = busquedaProd.toLowerCase()
    sugerencias = $productos
      .filter(p => p.nombre.toLowerCase().includes(q) || p.marca?.toLowerCase().includes(q))
      .slice(0, 5)
    modoNuevo = sugerencias.length === 0
  } else {
    sugerencias = []
    modoNuevo   = false
  }

  $: totalItems = listaItems.length

  onMount(async () => {
    const c = await cargarComercio(comercioId)
    comercio = c
    await cargarProductos(localidad)
    // Crear la lista (tipo comercio) en Firestore al entrar
    if (c && localidad) {
      const lista = await crearLista({
        nombre:    `Lista de precios — ${c.nombre}`,
        ocasion:   '',
        vencimiento: null,
        localidad,
        tipo:      'comercio',
        comercioId,
      })
      listaId = lista.id
    }
    cargando = false
  })

  function showToast(msg, tipo = 'ok') {
    toastMsg = msg; toastTipo = tipo
    setTimeout(() => toastMsg = '', 3000)
  }

  function catEmoji(id) { return CATEGORIAS.find(c => c.id === id)?.emoji || '📦' }

  function limpiarForm() {
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

  function seleccionarProducto(p) {
    productoSel  = p
    busquedaProd = p.nombre
    sugerencias  = []
  }

  async function confirmarProductoNuevo() {
    if (!busquedaProd.trim()) return
    try {
      const p = await buscarOCrearProducto({
        nombre: busquedaProd, marca: nuevaMarca,
        unidad: nuevaUnidad, categoria: nuevaCategoria,
        localidad,
      })
      productoSel = p
    } catch (e) {
      showToast('Error: ' + e.message, 'err')
    }
  }

  async function agregarItem() {
    if (!productoSel || !precioValor || isNaN(parseFloat(precioValor))) return
    guardandoItem = true
    try {
      // Registrar precio en Firestore (con listaId)
      const nuevo = await registrarPrecio({
        comercioId,
        comercioNombre:    comercio.nombre,
        localidad,
        productoId:        productoSel.id,
        productoNombre:    productoSel.nombre,
        productoUnidad:    productoSel.unidad,
        productoCategoria: productoSel.categoria,
        precio:            precioValor,
        esOferta,
        vencimiento:       esOferta && vencimiento ? vencimiento : null,
        listaId,
      })

      listaItems = [...listaItems, {
        precioId:          nuevo.id,
        productoId:        productoSel.id,
        productoNombre:    productoSel.nombre,
        productoUnidad:    productoSel.unidad,
        productoCategoria: productoSel.categoria,
        precio:            parseFloat(precioValor),
        esOferta,
      }]

      showToast(`✓ ${productoSel.nombre} — ${formatPrecio(parseFloat(precioValor))}`)
      limpiarForm()
    } catch (e) {
      showToast('Error: ' + e.message, 'err')
    } finally {
      guardandoItem = false
    }
  }

  function eliminarItem(idx) {
    listaItems = listaItems.filter((_, i) => i !== idx)
  }

  async function publicarLista_() {
    if (listaItems.length === 0) return
    publicando = true
    try {
      await actualizarTotalItems(listaId, listaItems.length)
      await publicarLista(listaId)
      paso = 'confirmacion'
    } catch (e) {
      showToast('Error al publicar: ' + e.message, 'err')
    } finally {
      publicando = false
    }
  }

  function volver() { currentPage.set('precios-comercio:' + comercioId) }
  function irPrecios() { currentPage.set('precios-comercio:' + comercioId) }
</script>

<div class="app-shell lista-shell">

  {#if toastMsg}
    <div class="toast" class:toast-err={toastTipo === 'err'} role="status">{toastMsg}</div>
  {/if}

  <header class="lista-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="header-info">
      <h1 class="header-titulo">Lista de precios</h1>
      {#if comercio}<p class="header-sub">{comercio.nombre}</p>{/if}
    </div>
    {#if totalItems > 0 && paso === 'form'}
      <span class="items-badge">{totalItems}</span>
    {/if}
  </header>

  {#if cargando}
    <div class="cargando-wrap">
      <div class="spinner" style="border-top-color: var(--c-primary); width:28px; height:28px;"></div>
    </div>

  {:else if paso === 'confirmacion'}
    <div class="confirmacion-wrap fade-in">
      <div class="confirmacion-icon">🎉</div>
      <h2 class="confirmacion-titulo">¡Lista publicada!</h2>
      <p class="confirmacion-sub">Se cargaron <strong>{totalItems} precios</strong> de <strong>{comercio?.nombre}</strong> y quedaron visibles para la comunidad.</p>
      <button class="btn btn-primary btn-full" on:click={irPrecios}>Ver precios del comercio</button>
    </div>

  {:else}
    <main class="lista-main scroll-area">

      <!-- Formulario de ítem -->
      <div class="item-form card">

        <p class="form-section-label">➕ Agregar producto</p>

        <div class="form-group">
          <label class="form-label" for="lp-busq">Producto</label>
          <input
            id="lp-busq"
            type="text"
            class="form-input"
            placeholder="Buscar o escribir nombre…"
            bind:value={busquedaProd}
            autocomplete="off"
          />
        </div>

        {#if sugerencias.length > 0}
          <div class="sugerencias">
            {#each sugerencias as sug}
              <button class="sugerencia-item" on:click={() => seleccionarProducto(sug)}>
                <span>{catEmoji(sug.categoria)}</span>
                <span class="sug-nombre">{sug.nombre}</span>
                {#if sug.marca}<span class="sug-marca">{sug.marca}</span>{/if}
              </button>
            {/each}
          </div>
        {/if}

        {#if modoNuevo && busquedaProd.length >= 2 && !productoSel}
          <div class="nuevo-mini">
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label" for="lp-unidad">Unidad</label>
                <select id="lp-unidad" class="form-select" bind:value={nuevaUnidad}>
                  {#each UNIDADES as u}<option value={u.id}>{u.label}</option>{/each}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="lp-cat">Categoría</label>
                <select id="lp-cat" class="form-select" bind:value={nuevaCategoria}>
                  {#each CATEGORIAS as c}<option value={c.id}>{c.emoji} {c.label}</option>{/each}
                </select>
              </div>
            </div>
            <button class="btn-confirmar-nuevo" on:click={confirmarProductoNuevo}>
              Usar "{busquedaProd}" →
            </button>
          </div>
        {/if}

        {#if productoSel}
          <div class="prod-sel">
            <span>{catEmoji(productoSel.categoria)} {productoSel.nombre}</span>
            <button class="link-cambiar" on:click={() => { productoSel = null; busquedaProd = '' }}>cambiar</button>
          </div>
        {/if}

        <div class="grid-precio">
          <div class="form-group">
            <label class="form-label" for="lp-precio">Precio ($)</label>
            <div class="precio-wrap">
              <span class="peso">$</span>
              <input
                id="lp-precio"
                type="number"
                inputmode="decimal"
                class="form-input precio-input"
                placeholder="0"
                bind:value={precioValor}
                min="0" step="0.5"
              />
            </div>
          </div>

          <div class="oferta-col">
            <label class="form-label">Oferta</label>
            <label class="toggle-mini">
              <input type="checkbox" bind:checked={esOferta}/>
              <span class="track"></span>
            </label>
          </div>
        </div>

        {#if esOferta}
          <div class="form-group">
            <label class="form-label" for="lp-venc">Vence el</label>
            <input id="lp-venc" type="date" class="form-input" bind:value={vencimiento} min={new Date().toISOString().split('T')[0]}/>
          </div>
        {/if}

        <button
          class="btn btn-primary btn-full"
          on:click={agregarItem}
          disabled={!productoSel || !precioValor || guardandoItem}
        >
          {guardandoItem ? 'Guardando…' : '+ Agregar a la lista'}
        </button>
      </div>

      <!-- Items cargados -->
      {#if listaItems.length > 0}
        <div class="items-section">
          <div class="items-header">
            <span class="items-titulo">En la lista ({totalItems})</span>
          </div>
          {#each listaItems as item, idx}
            <div class="item-row">
              <span class="item-emoji">{catEmoji(item.productoCategoria)}</span>
              <span class="item-nombre">{item.productoNombre}</span>
              {#if item.esOferta}<span class="item-oferta-chip">🔥</span>{/if}
              <span class="item-precio">{formatPrecio(item.precio)}</span>
              <button class="btn-eliminar" on:click={() => eliminarItem(idx)} aria-label="Eliminar">✕</button>
            </div>
          {/each}

          <button
            class="btn btn-primary btn-full"
            style="margin-top: 16px"
            on:click={publicarLista_}
            disabled={publicando}
          >
            {publicando ? 'Publicando…' : '🚀 Publicar lista completa'}
          </button>
          <p class="publish-hint">Los precios quedarán visibles para toda la comunidad de tu localidad.</p>
        </div>
      {/if}

      <div style="height: 40px"></div>
    </main>
  {/if}

</div>

<style>
  .lista-shell { min-height: 100dvh; display: flex; flex-direction: column; }
  .lista-header {
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
  .header-titulo { font-family: var(--f-brand); font-size: 18px; }
  .header-sub { font-size: 12px; color: var(--c-text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .items-badge {
    background: var(--c-primary); color: white;
    font-size: 12px; font-weight: 700; padding: 3px 9px;
    border-radius: var(--r-full);
  }

  .lista-main { flex: 1; padding: 16px; overflow-y: auto; }
  .cargando-wrap { flex: 1; display: flex; align-items: center; justify-content: center; }

  .form-section-label { font-size: 12px; font-weight: 700; color: var(--c-text-mid); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px; }
  .item-form { padding: 18px; margin-bottom: 20px; }

  .sugerencias { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .sugerencia-item {
    display: flex; align-items: center; gap: 8px; padding: 9px 12px;
    background: var(--c-surface-2); border-radius: var(--r-md);
    border: none; cursor: pointer; text-align: left;
  }
  .sug-nombre { flex: 1; font-weight: 600; font-size: 14px; }
  .sug-marca { font-size: 12px; color: var(--c-text-light); }

  .nuevo-mini { background: var(--c-surface-2); border-radius: var(--r-md); padding: 12px; margin-bottom: 12px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .btn-confirmar-nuevo {
    width: 100%; margin-top: 8px; padding: 9px;
    background: var(--c-primary); color: white; border: none;
    border-radius: var(--r-md); font-weight: 700; font-size: 13px; cursor: pointer;
  }

  .prod-sel {
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(27,107,58,0.08); border-radius: var(--r-md);
    padding: 9px 12px; margin-bottom: 12px;
    font-weight: 700; font-size: 14px; color: var(--c-primary);
  }
  .link-cambiar { background: none; border: none; font-size: 12px; color: var(--c-text-light); text-decoration: underline; cursor: pointer; }

  .grid-precio { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; margin-bottom: 12px; }
  .precio-wrap { position: relative; }
  .peso { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-weight: 700; color: var(--c-text-mid); }
  .precio-input { padding-left: 28px !important; font-size: 20px !important; font-weight: 700; }
  .oferta-col { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-bottom: 2px; }
  .toggle-mini input { display: none; }
  .toggle-mini { cursor: pointer; }
  .track {
    display: block; width: 40px; height: 22px; border-radius: 11px;
    background: var(--c-border); position: relative; transition: background 0.2s;
  }
  .track::after {
    content: ''; position: absolute; top: 3px; left: 3px;
    width: 16px; height: 16px; border-radius: 50%;
    background: white; transition: transform 0.2s;
  }
  .toggle-mini input:checked ~ .track { background: var(--c-accent); }
  .toggle-mini input:checked ~ .track::after { transform: translateX(18px); }

  /* Items cargados */
  .items-section { background: var(--c-surface); border-radius: var(--r-lg); border: 1px solid var(--c-border); overflow: hidden; }
  .items-header { padding: 12px 16px 8px; border-bottom: 1px solid var(--c-border); }
  .items-titulo { font-size: 13px; font-weight: 700; color: var(--c-text-mid); text-transform: uppercase; letter-spacing: 0.06em; }
  .item-row {
    display: flex; align-items: center; gap: 8px;
    padding: 11px 14px; border-bottom: 1px solid var(--c-border);
  }
  .item-row:last-of-type { border-bottom: none; }
  .item-emoji { font-size: 15px; }
  .item-nombre { flex: 1; font-size: 14px; font-weight: 600; color: var(--c-text); }
  .item-oferta-chip { font-size: 12px; }
  .item-precio { font-weight: 700; color: var(--c-primary); font-size: 15px; white-space: nowrap; }
  .btn-eliminar { background: none; border: none; color: var(--c-text-light); font-size: 14px; cursor: pointer; padding: 4px 6px; }
  .btn-eliminar:hover { color: var(--c-error); }
  .items-section > .btn { border-radius: 0 !important; }
  .publish-hint { text-align: center; font-size: 12px; color: var(--c-text-light); padding: 8px 16px 16px; }

  /* Confirmación */
  .confirmacion-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 24px; text-align: center; gap: 16px; }
  .confirmacion-icon { font-size: 60px; }
  .confirmacion-titulo { font-family: var(--f-brand); font-size: 26px; color: var(--c-text); }
  .confirmacion-sub { font-size: 15px; color: var(--c-text-mid); line-height: 1.6; max-width: 280px; }

  .toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: var(--c-text); color: white; padding: 10px 20px;
    border-radius: var(--r-full); font-size: 13px; font-weight: 600;
    box-shadow: var(--s-md); z-index: 200; animation: fadeIn 0.2s ease; white-space: nowrap;
  }
  .toast.toast-err { background: var(--c-error); }
  @keyframes fadeIn { from{opacity:0;transform:translateX(-50%) translateY(-6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
</style>