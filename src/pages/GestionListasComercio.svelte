<script>
  import { onMount } from 'svelte'
  import { currentPage, currentUser, userProfile } from '../stores/auth.js'
  import { comercioActivo, cargarComercio } from '../stores/comercios.js'
  import {
    collection, query, where, getDocs, addDoc, updateDoc,
    deleteDoc, doc, serverTimestamp
  } from 'firebase/firestore'
  import { db } from '../lib/firebase.js'
  import BottomNav from '../components/BottomNav.svelte'

  export let comercioId = ''

  let comercio      = null
  let cargando      = true
  let listas        = []
  let toastMsg      = ''
  let mostrarNueva  = false
  let nombreNueva   = ''
  let creando       = false
  let editandoId    = null
  let editandoNombre = ''

  $: user   = $currentUser
  $: perfil = $userProfile

  const categoriasSugeridas = [
    'Carnicería', 'Verdulería', 'Bebidas', 'Limpieza',
    'Lácteos', 'Panadería', 'Ofertas del día', '3x2',
    'Por proveedor', 'Congelados', 'Perfumería',
  ]

  onMount(async () => {
    const c = await cargarComercio(comercioId)
    comercio = c
    if (!c || c.reclamadoPor !== user?.uid) {
      currentPage.set('precios-comercio:' + comercioId)
      return
    }
    await cargarListas()
    cargando = false
  })

  async function cargarListas() {
    try {
      const q = query(
        collection(db, 'listas'),
        where('comercioId', '==', comercioId),
        where('tipo',       '==', 'comercio')
      )
      const snap = await getDocs(q)
      listas = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.editadaEn?.toDate?.() || a.creadaEn?.toDate?.() || new Date(0)
          const tb = b.editadaEn?.toDate?.() || b.creadaEn?.toDate?.() || new Date(0)
          return tb - ta
        })
    } catch (e) {
      console.error('cargarListas comercio:', e)
    }
  }

  async function crearNueva() {
    if (!nombreNueva.trim() || creando) return
    creando = true
    try {
      const ref = await addDoc(collection(db, 'listas'), {
        nombre:     nombreNueva.trim(),
        tipo:       'comercio',
        comercioId,
        localidad:  perfil?.localidad || '',
        publicada:  false,
        totalItems: 0,
        creadoPor:  user?.uid,
        creadaEn:   serverTimestamp(),
        editadaEn:  serverTimestamp(),
      })
      const nueva = { id: ref.id, nombre: nombreNueva.trim(), tipo: 'comercio', comercioId, totalItems: 0, publicada: false }
      listas = [nueva, ...listas]
      nombreNueva  = ''
      mostrarNueva = false
      showToast('Lista creada')
      // Ir directo a cargar precios
      currentPage.set('lista-precios:' + comercioId + ':' + ref.id)
    } catch (e) {
      showToast('Error: ' + e.message)
    } finally {
      creando = false
    }
  }

  async function eliminar(lista) {
    if (!confirm(`¿Eliminar "${lista.nombre}"?`)) return
    await deleteDoc(doc(db, 'listas', lista.id))
    listas = listas.filter(l => l.id !== lista.id)
    showToast('Lista eliminada')
  }

  async function renombrar() {
    if (!editandoNombre.trim()) return
    await updateDoc(doc(db, 'listas', editandoId), {
      nombre:    editandoNombre.trim(),
      editadaEn: serverTimestamp(),
    })
    listas = listas.map(l => l.id === editandoId ? { ...l, nombre: editandoNombre.trim() } : l)
    editandoId = null
    showToast('Nombre actualizado')
  }

  function irALista(listaId) {
    currentPage.set('lista-precios:' + comercioId + ':' + listaId)
  }

  function volver() { currentPage.set('precios-comercio:' + comercioId) }

  function showToast(msg) {
    toastMsg = msg
    setTimeout(() => toastMsg = '', 2500)
  }

  function formatFecha(ts) {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  }
</script>

<div class="app-shell glc-shell">

  {#if toastMsg}
    <div class="toast" role="status">{toastMsg}</div>
  {/if}

  <header class="glc-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="glc-titulo-wrap">
      <h1 class="glc-titulo">Mis listas de precios</h1>
      {#if comercio}<p class="glc-sub">{comercio.nombre}</p>{/if}
    </div>
    <button class="btn-nueva-header" on:click={() => mostrarNueva = !mostrarNueva} aria-label="Nueva lista">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  </header>

  <!-- Form nueva lista -->
  {#if mostrarNueva}
    <div class="nueva-form">
      <p class="nueva-form-label">Nombre de la lista</p>
      <input
        type="text"
        class="form-input"
        placeholder="Ej: Ofertas del día, Carnicería, 3x2…"
        bind:value={nombreNueva}
        autofocus
        maxlength="60"
        on:keydown={e => e.key === 'Enter' && crearNueva()}
      />
      <!-- Sugerencias rápidas -->
      <div class="sugerencias-chips">
        {#each categoriasSugeridas as sug}
          <button class="sug-chip" on:click={() => nombreNueva = sug}>{sug}</button>
        {/each}
      </div>
      <div class="nueva-btns">
        <button class="btn btn-primary" on:click={crearNueva} disabled={!nombreNueva.trim() || creando}>
          {creando ? 'Creando…' : 'Crear y cargar precios'}
        </button>
        <button class="btn-cancelar" on:click={() => { mostrarNueva = false; nombreNueva = '' }}>Cancelar</button>
      </div>
    </div>
  {/if}

  <main class="glc-main scroll-area">

    {#if cargando}
      <div class="skeleton-group">
        {#each Array(3) as _}
          <div class="skeleton-card"></div>
        {/each}
      </div>

    {:else if listas.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p class="empty-title">Sin listas todavía</p>
        <p class="empty-sub">Creá listas para organizar tus precios por categoría, proveedor u ocasión.</p>
        <button class="btn btn-primary" on:click={() => mostrarNueva = true}>
          + Crear primera lista
        </button>
      </div>

    {:else}
      <div class="listas-grid">
        {#each listas as lista (lista.id)}
          <div class="lista-card">

            {#if editandoId === lista.id}
              <div class="edicion-wrap">
                <input
                  type="text"
                  class="form-input"
                  bind:value={editandoNombre}
                  on:keydown={e => e.key === 'Enter' && renombrar()}
                  autofocus
                />
                <div class="edicion-btns">
                  <button class="btn btn-primary" style="font-size:13px;padding:8px 16px" on:click={renombrar}>Guardar</button>
                  <button class="btn-cancelar" on:click={() => editandoId = null}>Cancelar</button>
                </div>
              </div>

            {:else}
              <button class="lista-main-btn" on:click={() => irALista(lista.id)}>
                <div class="lista-icon">📋</div>
                <div class="lista-info">
                  <span class="lista-nombre">{lista.nombre}</span>
                  <span class="lista-meta">
                    {lista.totalItems || 0} producto{lista.totalItems !== 1 ? 's' : ''}
                    {#if lista.publicada}<span class="publicada-chip">✓ Publicada</span>{/if}
                    {#if lista.editadaEn}· {formatFecha(lista.editadaEn)}{/if}
                  </span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-light)" stroke-width="2.5" stroke-linecap="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>

              <div class="lista-acciones">
                <button class="btn-accion" on:click={() => { editandoId = lista.id; editandoNombre = lista.nombre }} title="Renombrar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="btn-accion btn-eliminar" on:click={() => eliminar(lista)} title="Eliminar">
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

    <div style="height:24px"></div>
  </main>

  <BottomNav active="buscar" />
</div>

<style>
  .glc-shell { padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px)); }

  .glc-header {
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
  .glc-titulo-wrap { flex: 1; min-width: 0; }
  .glc-titulo { font-family: var(--f-brand); font-size: 18px; }
  .glc-sub    { font-size: 12px; color: var(--c-text-light); }
  .btn-nueva-header {
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: var(--c-primary); color: white;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: var(--s-sm);
  }

  /* Form nueva */
  .nueva-form {
    padding: 16px; background: var(--c-surface-2);
    border-bottom: 1px solid var(--c-border);
    display: flex; flex-direction: column; gap: 10px;
  }
  .nueva-form-label { font-size: 13px; font-weight: 700; color: var(--c-text-mid); }
  .sugerencias-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .sug-chip {
    padding: 5px 12px; border-radius: var(--r-full);
    border: 1px solid var(--c-border); background: var(--c-surface);
    font-size: 12px; font-weight: 600; color: var(--c-text-mid);
    cursor: pointer; font-family: var(--f-ui); transition: all 0.15s;
  }
  .sug-chip:active { background: var(--c-primary); border-color: var(--c-primary); color: white; }
  .nueva-btns { display: flex; gap: 10px; align-items: center; }
  .btn-cancelar { background: none; border: none; font-size: 14px; color: var(--c-text-light); cursor: pointer; padding: 4px 8px; }

  /* Main */
  .glc-main { padding: 16px; }

  /* Listas */
  .listas-grid { display: flex; flex-direction: column; gap: 10px; }
  .lista-card {
    background: var(--c-surface); border-radius: var(--r-lg);
    border: 1px solid var(--c-border); overflow: hidden; box-shadow: var(--s-xs);
  }
  .lista-main-btn {
    display: flex; align-items: center; gap: 14px;
    padding: 14px; width: 100%; text-align: left;
    background: none; border: none; cursor: pointer;
    transition: background 0.15s; -webkit-tap-highlight-color: transparent;
  }
  .lista-main-btn:active { background: var(--c-surface-2); }
  .lista-icon {
    font-size: 22px; width: 44px; height: 44px;
    background: rgba(27,107,58,0.08); border-radius: 10px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .lista-info   { flex: 1; min-width: 0; }
  .lista-nombre { display: block; font-size: 15px; font-weight: 700; color: var(--c-text); }
  .lista-meta   { display: block; font-size: 12px; color: var(--c-text-light); margin-top: 2px; }
  .publicada-chip { background: #D1FAE5; color: #065F46; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: var(--r-full); margin-left: 4px; }

  .lista-acciones {
    display: flex; align-items: center; justify-content: flex-end; gap: 6px;
    padding: 8px 12px; border-top: 1px solid var(--c-border); background: var(--c-surface-2);
  }
  .btn-accion {
    width: 32px; height: 32px; border-radius: var(--r-md);
    border: 1px solid var(--c-border); background: var(--c-surface);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--c-text-mid); transition: all 0.15s;
  }
  .btn-eliminar:hover { border-color: var(--c-error); color: var(--c-error); background: var(--c-error-bg); }

  /* Edición */
  .edicion-wrap { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
  .edicion-btns { display: flex; gap: 8px; align-items: center; }

  /* Skeleton */
  .skeleton-group { display: flex; flex-direction: column; gap: 10px; }
  .skeleton-card { height: 76px; background: var(--c-border); border-radius: var(--r-lg); animation: pulse 1.4s infinite; }
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
  }
</style>