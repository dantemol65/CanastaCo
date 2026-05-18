<script>
  import { onMount } from 'svelte'
  import { currentPage, userProfile } from '../stores/auth.js'
  import {
    misListas, cargandoListas,
    cargarMisListas, crearLista, eliminarLista, renombrarLista,
  } from '../stores/listas_compras.js'
  import BottomNav from '../components/BottomNav.svelte'

  $: perfil    = $userProfile
  $: localidad = perfil?.localidad || ''

  let mostrarNueva   = false
  let nombreNueva    = ''
  let creando        = false
  let editandoId     = null
  let editandoNombre = ''
  let toastMsg       = ''

  onMount(() => cargarMisListas())

  function showToast(msg) {
    toastMsg = msg
    setTimeout(() => toastMsg = '', 2500)
  }

  async function handleCrear() {
    if (!nombreNueva.trim()) return
    creando = true
    try {
      const nueva = await crearLista(nombreNueva, localidad)
      nombreNueva  = ''
      mostrarNueva = false
      showToast('Lista creada')
      // Ir directo a la nueva lista
      currentPage.set('mi-lista:' + nueva.id)
    } catch (e) {
      showToast('Error: ' + e.message)
    } finally {
      creando = false
    }
  }

  async function handleEliminar(lista) {
    if (!confirm(`¿Eliminar "${lista.nombre}"?`)) return
    await eliminarLista(lista.id)
    showToast('Lista eliminada')
  }

  function iniciarEdicion(lista) {
    editandoId     = lista.id
    editandoNombre = lista.nombre
  }

  async function guardarEdicion() {
    if (!editandoNombre.trim()) return
    await renombrarLista(editandoId, editandoNombre)
    editandoId = null
    showToast('Nombre actualizado')
  }

  function irLista(id) { currentPage.set('mi-lista:' + id) }
  function volver()    { currentPage.set('home') }

  function formatFecha(ts) {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  }
</script>

<div class="app-shell listas-shell">

  {#if toastMsg}
    <div class="toast" role="status">{toastMsg}</div>
  {/if}

  <header class="listas-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <h1 class="listas-titulo">Mis Listas</h1>
    <button class="btn-nueva" on:click={() => mostrarNueva = !mostrarNueva} aria-label="Nueva lista">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  </header>

  <!-- Formulario nueva lista -->
  {#if mostrarNueva}
    <div class="nueva-form">
      <input
        type="text"
        class="form-input"
        placeholder="Nombre de la lista (ej: Lista del mes)"
        bind:value={nombreNueva}
        autofocus
        on:keydown={e => e.key === 'Enter' && handleCrear()}
        maxlength="60"
      />
      <div class="nueva-acciones">
        <button class="btn btn-primary" on:click={handleCrear} disabled={!nombreNueva.trim() || creando}>
          {creando ? 'Creando…' : 'Crear'}
        </button>
        <button class="btn-cancelar" on:click={() => { mostrarNueva = false; nombreNueva = '' }}>
          Cancelar
        </button>
      </div>
    </div>
  {/if}

  <main class="listas-main scroll-area">

    {#if $cargandoListas}
      <div class="skeleton-group">
        {#each Array(3) as _}
          <div class="skeleton-card"></div>
        {/each}
      </div>

    {:else if $misListas.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <p class="empty-title">Sin listas todavía</p>
        <p class="empty-sub">Creá tu primera lista de compras y encontrá los mejores precios de tu localidad.</p>
        <button class="btn btn-primary" on:click={() => mostrarNueva = true}>
          + Crear mi primera lista
        </button>
      </div>

    {:else}
      <div class="listas-grid">
        {#each $misListas as lista (lista.id)}
          <div class="lista-card">

            {#if editandoId === lista.id}
              <!-- Modo edición del nombre -->
              <div class="edicion-nombre">
                <input
                  type="text"
                  class="form-input"
                  bind:value={editandoNombre}
                  on:keydown={e => e.key === 'Enter' && guardarEdicion()}
                  autofocus
                />
                <div class="edicion-btns">
                  <button class="btn btn-primary" style="padding:8px 16px;font-size:13px" on:click={guardarEdicion}>
                    Guardar
                  </button>
                  <button class="btn-cancelar" on:click={() => editandoId = null}>Cancelar</button>
                </div>
              </div>

            {:else}
              <!-- Vista normal -->
              <button class="lista-main-btn" on:click={() => irLista(lista.id)}>
                <div class="lista-icon">🛒</div>
                <div class="lista-info">
                  <span class="lista-nombre">{lista.nombre}</span>
                  <span class="lista-meta">
                    {lista.items?.length || 0} producto{lista.items?.length !== 1 ? 's' : ''}
                    {#if lista.editadaEn}· {formatFecha(lista.editadaEn)}{/if}
                  </span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-light)" stroke-width="2.5" stroke-linecap="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>

              <div class="lista-acciones">
                {#if lista.items?.length > 0}
                  <button
                    class="btn-optimizar"
                    on:click={() => currentPage.set('optimizador:' + lista.id)}
                    title="Optimizar compra"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    Optimizar
                  </button>
                {/if}
                <button class="btn-accion" on:click={() => iniciarEdicion(lista)} title="Renombrar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="btn-accion btn-eliminar" on:click={() => handleEliminar(lista)} title="Eliminar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                </button>
              </div>
            {/if}

          </div>
        {/each}
      </div>
    {/if}

    <div style="height: 24px"></div>
  </main>

  <BottomNav active="home" />
</div>

<style>
  .listas-shell { padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px)); }

  .listas-header {
    position: sticky; top: 0; z-index: 50;
    background: var(--c-surface); border-bottom: 1px solid var(--c-border);
    padding: 14px 16px; display: flex; align-items: center; gap: 12px;
  }
  .btn-volver {
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: var(--c-surface-2);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; color: var(--c-text);
  }
  .listas-titulo { font-family: var(--f-brand); font-size: 20px; flex: 1; }
  .btn-nueva {
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: var(--c-primary); color: white;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: var(--s-sm);
  }

  /* Nueva lista form */
  .nueva-form {
    padding: 14px 16px; background: var(--c-surface-2);
    border-bottom: 1px solid var(--c-border);
    display: flex; flex-direction: column; gap: 10px;
  }
  .nueva-acciones { display: flex; gap: 10px; align-items: center; }
  .btn-cancelar {
    background: none; border: none; font-size: 14px;
    color: var(--c-text-light); cursor: pointer; padding: 4px 8px;
  }

  /* Main */
  .listas-main { padding: 16px; }

  /* Listas */
  .listas-grid { display: flex; flex-direction: column; gap: 10px; }

  .lista-card {
    background: var(--c-surface); border-radius: var(--r-lg);
    border: 1px solid var(--c-border); overflow: hidden;
    box-shadow: var(--s-xs);
  }

  .lista-main-btn {
    display: flex; align-items: center; gap: 14px;
    padding: 16px; width: 100%; text-align: left;
    background: none; border: none; cursor: pointer;
    transition: background 0.15s; -webkit-tap-highlight-color: transparent;
  }
  .lista-main-btn:active { background: var(--c-surface-2); }

  .lista-icon {
    font-size: 24px; width: 46px; height: 46px;
    background: rgba(27,107,58,0.08); border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .lista-info { flex: 1; min-width: 0; }
  .lista-nombre { display: block; font-size: 15px; font-weight: 700; color: var(--c-text); }
  .lista-meta   { display: block; font-size: 12px; color: var(--c-text-light); margin-top: 2px; }

  .lista-acciones {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-top: 1px solid var(--c-border);
    background: var(--c-surface-2);
  }

  .btn-optimizar {
    display: flex; align-items: center; gap: 6px;
    flex: 1; padding: 8px 12px; border-radius: var(--r-full);
    background: var(--c-primary); color: white; border: none;
    font-size: 12px; font-weight: 700; cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-optimizar:active { opacity: 0.85; }

  .btn-accion {
    width: 32px; height: 32px; border-radius: var(--r-md);
    border: 1px solid var(--c-border); background: var(--c-surface);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--c-text-mid); transition: all 0.15s;
  }
  .btn-accion:hover { background: var(--c-surface-2); }
  .btn-eliminar:hover { border-color: var(--c-error); color: var(--c-error); background: var(--c-error-bg); }

  /* Edición */
  .edicion-nombre { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
  .edicion-btns   { display: flex; gap: 8px; align-items: center; }

  /* Skeleton */
  .skeleton-group { display: flex; flex-direction: column; gap: 10px; }
  .skeleton-card  { height: 80px; background: var(--c-border); border-radius: var(--r-lg); animation: pulse 1.4s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

  /* Empty */
  .empty-state { text-align: center; padding: 60px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .empty-icon  { font-size: 52px; }
  .empty-title { font-family: var(--f-brand); font-size: 22px; color: var(--c-text); }
  .empty-sub   { font-size: 14px; color: var(--c-text-light); line-height: 1.6; max-width: 280px; }

  /* Toast */
  .toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: var(--c-text); color: white; padding: 10px 20px;
    border-radius: var(--r-full); font-size: 13px; font-weight: 600;
    z-index: 200; white-space: nowrap; box-shadow: var(--s-md);
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from{opacity:0;transform:translateX(-50%) translateY(-4px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
</style>