<script>
  import { onMount } from 'svelte'
  import { currentPage, userProfile } from '../stores/auth.js'
  import {
    cargarPreciosProducto,
    verificarPrecio,
    reportarPrecioIncorrecto,
    CATEGORIAS,
    freshness, freshnessLabel, formatPrecio,
  } from '../stores/precios.js'
  import { getDoc, doc } from 'firebase/firestore'
  import { db } from '../lib/firebase.js'

  export let pageParam = ''   // formato: 'productoId__comercioId'

  $: productoId = pageParam.split('__')[0] || ''
  $: origenComercioId = pageParam.split('__')[1] || ''

  let producto     = null
  let precios      = []
  let cargando     = true
  let error        = null
  let toastMsg     = ''
  let toastTipo    = 'ok'

  $: perfil      = $userProfile
  $: localidad   = perfil?.localidad || ''
  $: catEmoji    = id => CATEGORIAS.find(c => c.id === id)?.emoji || '📦'
  $: catLabel    = id => CATEGORIAS.find(c => c.id === id)?.label || id

  $: masBarato  = precios.length > 0 ? precios[0] : null
  $: masCaroIdx = precios.length > 1 ? precios.length - 1 : -1

  onMount(async () => {
    try {
      // Cargar producto
      const snap = await getDoc(doc(db, 'productos', productoId))
      if (!snap.exists()) { error = 'Producto no encontrado.'; cargando = false; return }
      producto = { id: snap.id, ...snap.data() }

      // Cargar precios en la localidad
      precios = await cargarPreciosProducto(productoId, localidad)
    } catch (e) {
      error = 'Error al cargar comparación.'
    } finally {
      cargando = false
    }
  })

  function showToast(msg, tipo = 'ok') {
    toastMsg = msg; toastTipo = tipo
    setTimeout(() => toastMsg = '', 3000)
  }

  async function handleVerificar(precioId, idx) {
    try {
      await verificarPrecio(precioId)
      precios = precios.map((p, i) => i === idx
        ? { ...p, totalVerificaciones: (p.totalVerificaciones || 0) + 1 }
        : p
      )
      showToast('✓ Precio confirmado')
    } catch (e) {
      showToast(e.message, 'err')
    }
  }

  async function handleReportar(precioId, idx) {
    try {
      const total = await reportarPrecioIncorrecto(precioId)
      if (total >= 3) {
        precios = precios.filter((_, i) => i !== idx)
        showToast('Precio removido por reportes')
      } else {
        showToast(`Reportado (${total}/3 para remover)`)
      }
    } catch (e) {
      showToast(e.message, 'err')
    }
  }

  function irComercio(comercioId) {
    currentPage.set('precios-comercio:' + comercioId)
  }

  function volver() {
    if (origenComercioId === 'home') {
      currentPage.set('home')
    } else if (origenComercioId) {
      currentPage.set('precios-comercio:' + origenComercioId)
    } else {
      currentPage.set('buscar')
    }
  }

  function pctDiff(precio) {
    if (!masBarato || masBarato.precio === 0) return null
    const diff = ((precio.precio - masBarato.precio) / masBarato.precio) * 100
    return diff > 0 ? `+${diff.toFixed(0)}%` : null
  }
</script>

<div class="app-shell comp-shell">

  {#if toastMsg}
    <div class="toast" class:toast-err={toastTipo === 'err'} role="status">{toastMsg}</div>
  {/if}

  <!-- Header -->
  <header class="comp-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="header-info">
      <h1 class="header-titulo">Comparar precios</h1>
    </div>
  </header>

  <main class="comp-main scroll-area">

    {#if cargando}
      <div class="skeleton-prod"></div>
      {#each Array(3) as _}
        <div class="skeleton-row"></div>
      {/each}

    {:else if error}
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>{error}</p>
        <button class="btn btn-primary" on:click={volver}>Volver</button>
      </div>

    {:else if producto}

      <!-- Producto hero -->
      <div class="producto-hero">
        <div class="prod-emoji-wrap">
          <span class="prod-emoji">{catEmoji(producto.categoria)}</span>
        </div>
        <div class="prod-info">
          <h2 class="prod-nombre">{producto.nombre}</h2>
          {#if producto.marca}<p class="prod-marca">{producto.marca}</p>{/if}
          <p class="prod-cat-label">{catLabel(producto.categoria)} · {producto.unidad}</p>
        </div>
      </div>

      <!-- Banner mejor precio -->
      {#if masBarato}
        <div class="banner-mejor">
          <div class="banner-icon">🏆</div>
          <div class="banner-text">
            <span class="banner-label">Más barato en</span>
            <span class="banner-comercio">{masBarato.comercioNombre}</span>
          </div>
          <div class="banner-precio">{formatPrecio(masBarato.precio)}</div>
        </div>
      {:else}
        <div class="empty-state" style="padding: 40px 24px;">
          <div class="empty-icon">🔍</div>
          <p class="empty-title">Sin precios registrados</p>
          <p class="empty-sub">Nadie cargó este producto en tu localidad todavía.</p>
        </div>
      {/if}

      <!-- Lista de comercios -->
      {#if precios.length > 0}
        <div class="comparacion-lista">
          <div class="comparacion-header">
            <span class="comp-count">{precios.length} comercio{precios.length !== 1 ? 's' : ''}</span>
            <span class="comp-order">ordenados por precio</span>
          </div>

          {#each precios as p, idx (p.id)}
            {@const fresco = freshness(p)}
            {@const diff   = pctDiff(p)}
            <div
              class="comp-row"
              class:mejor={idx === 0}
              class:peor={idx === masCaroIdx && idx > 0}
            >
              <div class="comp-rank">
                {#if idx === 0}
                  <span class="rank-icon rank-1">🥇</span>
                {:else if idx === 1}
                  <span class="rank-icon">🥈</span>
                {:else if idx === 2}
                  <span class="rank-icon">🥉</span>
                {:else}
                  <span class="rank-num">{idx + 1}</span>
                {/if}
              </div>

              <div class="comp-info">
                <button class="comercio-link" on:click={() => irComercio(p.comercioId)}>
                  {p.comercioNombre}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>

                <div class="comp-chips">
                  <span class="freshness-chip" class:fresco={fresco==='fresco'} class:valido={fresco==='valido'} class:viejo={fresco==='viejo'}>
                    {freshnessLabel(p)}
                  </span>
                  {#if p.esOferta}
                    <span class="oferta-chip">🔥 Oferta</span>
                  {/if}
                  {#if p.totalVerificaciones > 0}
                    <span class="verif-chip">✓ {p.totalVerificaciones}</span>
                  {/if}
                </div>
              </div>

              <div class="comp-precio-col">
                <span class="comp-precio">{formatPrecio(p.precio)}</span>
                {#if diff}
                  <span class="comp-diff">{diff}</span>
                {/if}
              </div>
            </div>

            <!-- Acciones de este precio (colapsadas) -->
            <div class="comp-acciones">
              <button class="accion-mini verif" on:click={() => handleVerificar(p.id, idx)}>
                ✓ Confirmar
              </button>
              <button class="accion-mini report" on:click={() => handleReportar(p.id, idx)}>
                ⚠ Incorrecto
              </button>
            </div>
          {/each}
        </div>
      {/if}

    {/if}

    <div style="height: 32px"></div>
  </main>
</div>

<style>
  .comp-shell { min-height: 100dvh; display: flex; flex-direction: column; }

  .comp-header {
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
  .header-titulo { font-family: var(--f-brand); font-size: 18px; }

  .comp-main { flex: 1; padding: 16px; overflow-y: auto; }

  /* Producto hero */
  .producto-hero {
    display: flex; align-items: center; gap: 16px;
    background: var(--c-surface); border-radius: var(--r-xl); padding: 18px;
    border: 1px solid var(--c-border); margin-bottom: 12px;
  }
  .prod-emoji-wrap {
    width: 56px; height: 56px; border-radius: 16px;
    background: var(--c-surface-2); display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .prod-emoji { font-size: 28px; }
  .prod-nombre { font-family: var(--f-brand); font-size: 20px; font-weight: 700; color: var(--c-text); }
  .prod-marca  { font-size: 13px; color: var(--c-text-light); }
  .prod-cat-label { font-size: 12px; color: var(--c-text-mid); margin-top: 4px; }

  /* Banner mejor precio */
  .banner-mejor {
    display: flex; align-items: center; gap: 12px;
    background: linear-gradient(135deg, rgba(27,107,58,0.12), rgba(27,107,58,0.06));
    border: 1.5px solid rgba(27,107,58,0.3); border-radius: var(--r-lg);
    padding: 14px 16px; margin-bottom: 16px;
  }
  .banner-icon { font-size: 24px; flex-shrink: 0; }
  .banner-text { flex: 1; }
  .banner-label { display: block; font-size: 10px; font-weight: 700; color: var(--c-primary); text-transform: uppercase; letter-spacing: 0.08em; }
  .banner-comercio { font-size: 15px; font-weight: 700; color: var(--c-text); }
  .banner-precio { font-family: var(--f-brand); font-size: 22px; font-weight: 700; color: var(--c-primary); }

  /* Lista comparación */
  .comparacion-lista { background: var(--c-surface); border-radius: var(--r-xl); border: 1px solid var(--c-border); overflow: hidden; }
  .comparacion-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px; border-bottom: 1px solid var(--c-border);
  }
  .comp-count { font-size: 13px; font-weight: 700; color: var(--c-text-mid); }
  .comp-order { font-size: 11px; color: var(--c-text-light); }

  .comp-row {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; border-bottom: 1px solid var(--c-border);
    transition: background 0.15s;
  }
  .comp-row.mejor { background: rgba(27,107,58,0.04); }
  .comp-row.peor  { background: rgba(220,38,38,0.03); }

  .comp-rank { width: 28px; flex-shrink: 0; display: flex; justify-content: center; }
  .rank-icon { font-size: 20px; }
  .rank-num  { font-size: 13px; font-weight: 700; color: var(--c-text-light); }

  .comp-info { flex: 1; min-width: 0; }
  .comercio-link {
    background: none; border: none; cursor: pointer; padding: 0;
    font-size: 14px; font-weight: 700; color: var(--c-primary);
    display: flex; align-items: center; gap: 3px; text-align: left;
    transition: color 0.15s;
  }
  .comercio-link:hover { color: var(--c-primary-soft); }

  .comp-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .freshness-chip {
    font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: var(--r-full);
  }
  .freshness-chip.fresco { background: #D1FAE5; color: #059669; }
  .freshness-chip.valido { background: #FEF3C7; color: #D97706; }
  .freshness-chip.viejo  { background: #FEE2E2; color: #DC2626; }
  .oferta-chip { font-size: 10px; color: #B86C00; background: rgba(245,163,33,0.15); padding: 2px 7px; border-radius: var(--r-full); font-weight: 600; }
  .verif-chip  { font-size: 10px; color: var(--c-primary); font-weight: 600; }

  .comp-precio-col { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
  .comp-precio { font-family: var(--f-brand); font-size: 18px; font-weight: 700; color: var(--c-text); }
  .comp-diff   { font-size: 11px; font-weight: 700; color: #DC2626; }

  /* Acciones mini */
  .comp-acciones {
    display: flex; gap: 8px; padding: 6px 16px 10px;
    border-bottom: 1px solid var(--c-border);
  }
  .comp-acciones:last-child { border-bottom: none; }
  .accion-mini {
    padding: 5px 12px; border-radius: var(--r-full);
    border: 1.5px solid; font-size: 11px; font-weight: 700;
    cursor: pointer; background: transparent; transition: background 0.15s;
  }
  .accion-mini.verif  { border-color: #059669; color: #059669; }
  .accion-mini.report { border-color: #DC2626; color: #DC2626; }
  .accion-mini.verif:hover  { background: #D1FAE5; }
  .accion-mini.report:hover { background: #FEE2E2; }

  /* Skeleton */
  .skeleton-prod { height: 92px; background: var(--c-border); border-radius: var(--r-xl); margin-bottom: 12px; animation: pulse 1.4s infinite; }
  .skeleton-row  { height: 70px; background: var(--c-border); border-radius: var(--r-lg); margin-bottom: 8px; animation: pulse 1.4s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

  /* Empty */
  .empty-state { text-align: center; }
  .empty-icon  { font-size: 48px; margin-bottom: 12px; }
  .empty-title { font-family: var(--f-brand); font-size: 18px; color: var(--c-text); margin-bottom: 8px; }
  .empty-sub   { font-size: 14px; color: var(--c-text-light); }

  .toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: var(--c-text); color: white; padding: 10px 20px;
    border-radius: var(--r-full); font-size: 13px; font-weight: 600;
    box-shadow: var(--s-md); z-index: 200; white-space: nowrap;
    animation: toastIn 0.2s ease;
  }
  .toast.toast-err { background: var(--c-error); }
  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(-6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
</style>