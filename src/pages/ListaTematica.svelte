<script>
  import { onMount } from 'svelte'
  import { currentPage, currentUser, userProfile } from '../stores/auth.js'
  import {
    comercios as comerciosStore,
    cargarComerciosPorLocalidad,
  } from '../stores/comercios.js'
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

  // paso: 'meta' | 'comercio' | 'items' | 'confirmacion'
  let paso         = 'meta'

  let listaMeta    = { nombre: '', ocasion: '', vencimiento: '' }
  let listaId      = null
  let comercioSel  = null
  let busqComercio = ''

  let listaItems   = []
  let busquedaProd   = ''
  let productoSel    = null
  let sugerencias    = []
  let modoNuevo      = false
  let nuevaMarca     = ''
  let nuevaUnidad    = 'u'
  let nuevaCategoria = 'otros'
  let precioValor    = ''
  let esOferta       = false
  let vencimientoPrecio = ''
  let guardandoItem  = false
  let guardandoMeta  = false
  let publicando     = false

  let toastMsg  = ''
  let toastTipo = 'ok'
  let error     = null

  $: perfil     = $userProfile
  $: localidad  = perfil?.localidad || ''

  $: comerciosFiltrados = $comerciosStore
    .filter(c => c.estado !== 'rechazado')
    .filter(c => !busqComercio || c.nombre.toLowerCase().includes(busqComercio.toLowerCase()))
    .slice(0, 8)

  $: if (busquedaProd.length >= 2) {
    const q = busquedaProd.toLowerCase()
    sugerencias = $productos
      .filter(p => p.nombre.toLowerCase().includes(q))
      .slice(0, 5)
    modoNuevo = sugerencias.length === 0
  } else {
    sugerencias = []
    modoNuevo   = false
  }

  $: totalItems = listaItems.length

  onMount(async () => {
    await Promise.all([
      cargarProductos(localidad),
      cargarComerciosPorLocalidad(localidad),
    ])
  })

  function showToast(msg, tipo = 'ok') {
    toastMsg = msg; toastTipo = tipo
    setTimeout(() => toastMsg = '', 3000)
  }

  function catEmoji(id) { return CATEGORIAS.find(c => c.id === id)?.emoji || '📦' }

  // ── Paso 1: Meta ───────────────────────────────────────────────────────

  async function confirmarMeta() {
    if (!listaMeta.nombre.trim()) return
    guardandoMeta = true
    try {
      const lista = await crearLista({
        nombre:      listaMeta.nombre,
        ocasion:     listaMeta.ocasion,
        vencimiento: listaMeta.vencimiento || null,
        localidad,
        tipo:        'tematica',
        comercioId:  null,
      })
      listaId = lista.id
      paso = 'comercio'
    } catch (e) {
      showToast('Error: ' + e.message, 'err')
    } finally {
      guardandoMeta = false
    }
  }

  // ── Paso 2: Elegir comercio ────────────────────────────────────────────

  function seleccionarComercio(c) {
    comercioSel  = c
    busqComercio = ''
    paso = 'items'
  }

  function sinComercio() {
    comercioSel = { id: 'general', nombre: 'Varios comercios' }
    paso = 'items'
  }

  // ── Paso 3: Cargar ítems ───────────────────────────────────────────────

  function seleccionarProducto(p) {
    productoSel  = p
    busquedaProd = p.nombre
    sugerencias  = []
  }

  async function confirmarProductoNuevo() {
    try {
      const p = await buscarOCrearProducto({
        nombre: busquedaProd, marca: nuevaMarca,
        unidad: nuevaUnidad, categoria: nuevaCategoria,
        localidad,
      })
      productoSel = p
    } catch (e) { showToast('Error: ' + e.message, 'err') }
  }

  function limpiarItemForm() {
    busquedaProd = ''; productoSel = null; sugerencias = []; modoNuevo = false
    nuevaMarca = ''; nuevaUnidad = 'u'; nuevaCategoria = 'otros'
    precioValor = ''; esOferta = false; vencimientoPrecio = ''
  }

  async function agregarItem() {
    if (!productoSel || !precioValor || isNaN(parseFloat(precioValor))) return
    guardandoItem = true
    try {
      const cId   = comercioSel.id !== 'general' ? comercioSel.id : null
      const cNom  = comercioSel.nombre

      const nuevo = await registrarPrecio({
        comercioId:        cId || 'general',
        comercioNombre:    cNom,
        localidad,
        productoId:        productoSel.id,
        productoNombre:    productoSel.nombre,
        productoUnidad:    productoSel.unidad,
        productoCategoria: productoSel.categoria,
        precio:            precioValor,
        esOferta,
        vencimiento:       esOferta && vencimientoPrecio ? vencimientoPrecio : null,
        listaId,
      })

      listaItems = [...listaItems, {
        productoNombre:    productoSel.nombre,
        productoCategoria: productoSel.categoria,
        comercioNombre:    cNom,
        precio:            parseFloat(precioValor),
        esOferta,
      }]
      showToast(`✓ ${productoSel.nombre}`)
      limpiarItemForm()
    } catch (e) {
      showToast('Error: ' + e.message, 'err')
    } finally {
      guardandoItem = false
    }
  }

  async function publicar() {
    if (totalItems === 0) return
    publicando = true
    try {
      await actualizarTotalItems(listaId, totalItems)
      await publicarLista(listaId)
      paso = 'confirmacion'
    } catch (e) {
      showToast('Error al publicar: ' + e.message, 'err')
    } finally {
      publicando = false
    }
  }

  function volver() {
    if (paso === 'meta')        currentPage.set('publicar')
    else if (paso === 'comercio') paso = 'meta'
    else if (paso === 'items')    paso = 'comercio'
    else currentPage.set('publicar')
  }

  function irHome() { currentPage.set('home') }
</script>

<div class="app-shell tematica-shell">

  {#if toastMsg}
    <div class="toast" class:toast-err={toastTipo === 'err'} role="status">{toastMsg}</div>
  {/if}

  <!-- Header con stepper -->
  <header class="tem-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="header-info">
      <h1 class="header-titulo">Lista temática</h1>
      {#if listaMeta.nombre}
        <p class="header-sub">{listaMeta.nombre}</p>
      {/if}
    </div>
  </header>

  <!-- Stepper -->
  {#if paso !== 'confirmacion'}
    <div class="stepper">
      {#each [
        { key: 'meta',     label: 'Tema' },
        { key: 'comercio', label: 'Comercio' },
        { key: 'items',    label: 'Precios' },
      ] as s, i}
        <div class="step" class:active={paso === s.key} class:done={
          (s.key === 'meta'     && ['comercio','items'].includes(paso)) ||
          (s.key === 'comercio' && paso === 'items')
        }>
          <div class="step-dot">{
            (s.key === 'meta'     && ['comercio','items'].includes(paso)) ||
            (s.key === 'comercio' && paso === 'items')
            ? '✓' : i + 1
          }</div>
          <span class="step-label">{s.label}</span>
        </div>
        {#if i < 2}<div class="step-line"></div>{/if}
      {/each}
    </div>
  {/if}

  <main class="tem-main scroll-area">

    <!-- PASO 1: Meta de la lista -->
    {#if paso === 'meta'}
      <div class="paso-wrap fade-in">
        <h2 class="paso-titulo">¿Qué lista estás creando?</h2>
        <p class="paso-sub">Dale un nombre representativo para que la comunidad la identifique.</p>

        <div class="form-group">
          <label class="form-label" for="tm-nombre">Nombre de la lista *</label>
          <input
            id="tm-nombre"
            type="text"
            class="form-input"
            placeholder="Ej: Lista de Navidad 2025, Pascuas…"
            bind:value={listaMeta.nombre}
            maxlength="80"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="tm-ocasion">Ocasión (opcional)</label>
          <input
            id="tm-ocasion"
            type="text"
            class="form-input"
            placeholder="Ej: Navidad, Cumpleaños, Escolar…"
            bind:value={listaMeta.ocasion}
            maxlength="60"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="tm-venc">Vigente hasta (opcional)</label>
          <input
            id="tm-venc"
            type="date"
            class="form-input"
            bind:value={listaMeta.vencimiento}
            min={new Date().toISOString().split('T')[0]}
          />
          <p class="form-hint">Después de esta fecha la lista deja de aparecer.</p>
        </div>

        <button
          class="btn btn-primary btn-full"
          on:click={confirmarMeta}
          disabled={!listaMeta.nombre.trim() || guardandoMeta}
        >
          {guardandoMeta ? 'Creando…' : 'Siguiente →'}
        </button>
      </div>

    <!-- PASO 2: Elegir comercio -->
    {:else if paso === 'comercio'}
      <div class="paso-wrap fade-in">
        <h2 class="paso-titulo">¿De qué comercio son los precios?</h2>
        <p class="paso-sub">Seleccioná un comercio o indicá que son de varios locales.</p>

        <div class="form-group">
          <label class="form-label" for="tm-com">Buscar comercio</label>
          <input
            id="tm-com"
            type="search"
            class="form-input"
            placeholder="Nombre del comercio…"
            bind:value={busqComercio}
            autocomplete="off"
          />
        </div>

        <div class="comercios-lista">
          {#each comerciosFiltrados as c}
            <button class="comercio-row" on:click={() => seleccionarComercio(c)}>
              <span class="com-nombre">{c.nombre}</span>
              {#if c.direccion}<span class="com-dir">{c.direccion}</span>{/if}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-light)" stroke-width="2.5" stroke-linecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          {/each}
          {#if comerciosFiltrados.length === 0}
            <p class="sin-resultados">No se encontraron comercios.</p>
          {/if}
        </div>

        <div class="divider"></div>

        <button class="btn-varios" on:click={sinComercio}>
          Varios comercios / no especificar
        </button>
      </div>

    <!-- PASO 3: Cargar ítems -->
    {:else if paso === 'items'}
      <div class="fade-in">

        {#if comercioSel}
          <div class="comercio-activo-chip">
            <span>🏪 {comercioSel.nombre}</span>
            <button class="chip-cambiar" on:click={() => paso = 'comercio'}>cambiar</button>
          </div>
        {/if}

        <!-- Form ítem -->
        <div class="item-form card">
          <p class="form-section-label">➕ Agregar producto</p>

          <div class="form-group">
            <label class="form-label" for="tm-prod">Producto</label>
            <input
              id="tm-prod"
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
                </button>
              {/each}
            </div>
          {/if}

          {#if modoNuevo && !productoSel}
            <div class="nuevo-mini">
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label" for="tm-un">Unidad</label>
                  <select id="tm-un" class="form-select" bind:value={nuevaUnidad}>
                    {#each UNIDADES as u}<option value={u.id}>{u.label}</option>{/each}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="tm-ca">Categoría</label>
                  <select id="tm-ca" class="form-select" bind:value={nuevaCategoria}>
                    {#each CATEGORIAS as c}<option value={c.id}>{c.emoji} {c.label}</option>{/each}
                  </select>
                </div>
              </div>
              <button class="btn-confirmar-nuevo" on:click={confirmarProductoNuevo}>Usar "{busquedaProd}" →</button>
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
              <label class="form-label" for="tm-price">Precio ($)</label>
              <div class="precio-wrap">
                <span class="peso">$</span>
                <input id="tm-price" type="number" inputmode="decimal" class="form-input precio-input"
                  placeholder="0" bind:value={precioValor} min="0" step="0.5"/>
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

          <button
            class="btn btn-primary btn-full"
            on:click={agregarItem}
            disabled={!productoSel || !precioValor || guardandoItem}
          >
            {guardandoItem ? 'Guardando…' : '+ Agregar'}
          </button>
        </div>

        <!-- Items en la lista -->
        {#if listaItems.length > 0}
          <div class="items-section">
            <div class="items-header">
              <span>En la lista ({totalItems})</span>
            </div>
            {#each listaItems as item}
              <div class="item-row">
                <span>{catEmoji(item.productoCategoria)}</span>
                <span class="item-nombre">{item.productoNombre}</span>
                {#if item.esOferta}<span>🔥</span>{/if}
                <span class="item-precio">{formatPrecio(item.precio)}</span>
              </div>
            {/each}
          </div>

          <button
            class="btn btn-primary btn-full"
            style="margin-top:16px"
            on:click={publicar}
            disabled={publicando}
          >
            {publicando ? 'Publicando…' : '🚀 Publicar lista'}
          </button>
          <p class="publish-hint">Se publicará como "{listaMeta.nombre} — curada por la comunidad"</p>
        {/if}

        <div style="height: 40px"></div>
      </div>

    <!-- PASO 4: Confirmación -->
    {:else if paso === 'confirmacion'}
      <div class="confirmacion-wrap fade-in">
        <div class="conf-icon">🎉</div>
        <h2 class="conf-titulo">¡Lista publicada!</h2>
        <p class="conf-sub">
          <strong>"{listaMeta.nombre}"</strong> ya está disponible en tu localidad
          con <strong>{totalItems} productos</strong>.
        </p>
        <p class="conf-sub" style="color: var(--c-text-light)">
          Aparecerá como <em>"{listaMeta.nombre} — curada por la comunidad"</em>
        </p>
        <button class="btn btn-primary btn-full" on:click={irHome}>Volver al inicio</button>
      </div>
    {/if}

  </main>
</div>

<style>
  .tematica-shell { min-height: 100dvh; display: flex; flex-direction: column; }

  .tem-header {
    position: sticky; top: 0; z-index: 50; background: var(--c-surface);
    border-bottom: 1px solid var(--c-border); padding: 14px 16px;
    display: flex; align-items: center; gap: 10px;
  }
  .btn-volver {
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: var(--c-surface-2);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; color: var(--c-text);
  }
  .header-info { flex: 1; min-width: 0; }
  .header-titulo { font-family: var(--f-brand); font-size: 18px; }
  .header-sub { font-size: 12px; color: var(--c-text-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Stepper */
  .stepper {
    display: flex; align-items: center; justify-content: center;
    padding: 12px 16px; background: var(--c-surface); border-bottom: 1px solid var(--c-border);
  }
  .step { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .step-dot {
    width: 28px; height: 28px; border-radius: 50%;
    border: 2px solid var(--c-border); background: var(--c-surface);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: var(--c-text-light);
    transition: all 0.2s;
  }
  .step.active .step-dot  { border-color: var(--c-primary); color: var(--c-primary); background: rgba(27,107,58,0.08); }
  .step.done .step-dot    { border-color: var(--c-primary); background: var(--c-primary); color: white; }
  .step-label { font-size: 10px; font-weight: 700; color: var(--c-text-light); }
  .step.active .step-label { color: var(--c-primary); }
  .step-line { flex: 1; height: 2px; background: var(--c-border); margin: 0 8px; min-width: 32px; }

  .tem-main { flex: 1; padding: 20px 16px; overflow-y: auto; }
  .paso-wrap { max-width: 420px; }
  .paso-titulo { font-family: var(--f-brand); font-size: 22px; color: var(--c-text); margin-bottom: 8px; }
  .paso-sub { font-size: 14px; color: var(--c-text-light); margin-bottom: 24px; line-height: 1.5; }

  /* Comercios */
  .comercios-lista { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
  .comercio-row {
    display: flex; align-items: center; gap: 10px; padding: 12px 14px;
    background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--r-md);
    cursor: pointer; text-align: left; transition: background 0.15s;
  }
  .comercio-row:hover { background: var(--c-surface-2); }
  .com-nombre { flex: 1; font-weight: 600; font-size: 14px; color: var(--c-text); }
  .com-dir { font-size: 12px; color: var(--c-text-light); }
  .sin-resultados { font-size: 14px; color: var(--c-text-light); padding: 12px; text-align: center; }
  .btn-varios {
    width: 100%; padding: 12px; background: transparent;
    border: 2px dashed var(--c-border); border-radius: var(--r-md);
    color: var(--c-text-mid); font-size: 14px; font-weight: 600; cursor: pointer;
    transition: border-color 0.15s;
  }
  .btn-varios:hover { border-color: var(--c-primary); color: var(--c-primary); }

  /* Comercio activo chip */
  .comercio-activo-chip {
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(27,107,58,0.08); border-radius: var(--r-md);
    padding: 10px 14px; margin-bottom: 16px;
    font-size: 14px; font-weight: 700; color: var(--c-primary);
  }
  .chip-cambiar { background: none; border: none; font-size: 12px; color: var(--c-text-light); text-decoration: underline; cursor: pointer; }

  /* Form */
  .item-form { padding: 16px; margin-bottom: 16px; }
  .form-section-label { font-size: 12px; font-weight: 700; color: var(--c-text-mid); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
  .sugerencias { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .sugerencia-item {
    display: flex; align-items: center; gap: 8px; padding: 9px 12px;
    background: var(--c-surface-2); border-radius: var(--r-md); border: none; cursor: pointer; text-align: left;
  }
  .sug-nombre { flex: 1; font-weight: 600; font-size: 14px; }
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
    padding: 9px 12px; margin-bottom: 12px; font-weight: 700; font-size: 14px; color: var(--c-primary);
  }
  .link-cambiar { background: none; border: none; font-size: 12px; color: var(--c-text-light); text-decoration: underline; cursor: pointer; }
  .grid-precio { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; margin-bottom: 12px; }
  .precio-wrap { position: relative; }
  .peso { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-weight: 700; color: var(--c-text-mid); }
  .precio-input { padding-left: 28px !important; font-size: 20px !important; font-weight: 700; }
  .oferta-col { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-bottom: 2px; }
  .toggle-mini input { display: none; }
  .toggle-mini { cursor: pointer; }
  .track { display: block; width: 40px; height: 22px; border-radius: 11px; background: var(--c-border); position: relative; transition: background 0.2s; }
  .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: white; transition: transform 0.2s; }
  .toggle-mini input:checked ~ .track { background: var(--c-accent); }
  .toggle-mini input:checked ~ .track::after { transform: translateX(18px); }

  /* Items */
  .items-section { background: var(--c-surface); border-radius: var(--r-lg); border: 1px solid var(--c-border); overflow: hidden; }
  .items-header { padding: 10px 14px; border-bottom: 1px solid var(--c-border); font-size: 13px; font-weight: 700; color: var(--c-text-mid); text-transform: uppercase; letter-spacing: 0.06em; }
  .item-row { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--c-border); }
  .item-row:last-child { border-bottom: none; }
  .item-nombre { flex: 1; font-size: 14px; font-weight: 600; }
  .item-precio { font-weight: 700; color: var(--c-primary); }
  .publish-hint { text-align: center; font-size: 12px; color: var(--c-text-light); padding: 10px 0; font-style: italic; }

  /* Confirmación */
  .confirmacion-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 16px; padding: 40px 24px; }
  .conf-icon { font-size: 64px; }
  .conf-titulo { font-family: var(--f-brand); font-size: 26px; }
  .conf-sub { font-size: 15px; color: var(--c-text-mid); line-height: 1.6; max-width: 300px; }

  .toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: var(--c-text); color: white; padding: 10px 20px; border-radius: var(--r-full);
    font-size: 13px; font-weight: 600; box-shadow: var(--s-md); z-index: 200; white-space: nowrap;
    animation: toastIn 0.2s ease;
  }
  .toast.toast-err { background: var(--c-error); }
  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(-6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
</style>