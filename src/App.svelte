<script>
  import { onMount } from 'svelte'
  import { currentPage, initAuth } from './stores/auth.js'
  import Login            from './pages/Login.svelte'
  import Perfil           from './pages/Perfil.svelte'
  import Home             from './pages/Home.svelte'
  import Buscar           from './pages/Buscar.svelte'
  import AltaComercio     from './pages/AltaComercio.svelte'
  import DetalleComercio  from './pages/DetalleComercio.svelte'
  import Admin            from './pages/Admin.svelte'
  // Módulo 3 — Precios
  import MisListas          from './pages/MisListas.svelte'
  import MiLista            from './pages/MiLista.svelte'
  import OptimizadorCompras from './pages/OptimizadorCompras.svelte'
  import Precios            from './pages/Precios.svelte'
  import ListaPrecios     from './pages/ListaPrecios.svelte'
  import ListaTematica    from './pages/ListaTematica.svelte'
  import ComparadorPrecios from './pages/ComparadorPrecios.svelte'
  import PublicarLanding  from './pages/PublicarLanding.svelte'
  import Notificaciones   from './pages/Notificaciones.svelte'
  import Bloqueado        from './pages/Bloqueado.svelte'
  import Sugerencias      from './pages/Sugerencias.svelte'
  import { cargarConfig }  from './stores/config.js'

  let mostrarConfirmSalir = false

  onMount(() => {
    initAuth()
    cargarConfig()

    // Agregar entrada al historial para interceptar el botón back del móvil
    history.pushState({ canastaco: true }, '')

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  })

  function onPopState(e) {
    const pagina = $currentPage

    // Si está en Home o Login → confirmar salida
    if (pagina === 'home' || pagina === 'login' || pagina === 'loading') {
      mostrarConfirmSalir = true
      // Volver a agregar la entrada para que el próximo back también sea interceptado
      history.pushState({ canastaco: true }, '')
      return
    }

    // En cualquier otra pantalla → navegación interna (volver atrás)
    // No hacemos nada — cada pantalla tiene su propio botón volver
    history.pushState({ canastaco: true }, '')
  }

  function confirmarSalir() {
    mostrarConfirmSalir = false
    // Eliminar el estado que pusimos y dejar que el browser cierre/salga
    history.go(-2)
  }

  function cancelarSalir() {
    mostrarConfirmSalir = false
  }

  // Extraer id de rutas con parámetros (ej: 'detalle-comercio:abc123')
  $: [basePage, pageParam] = ($currentPage || '').split(':')
</script>

{#if basePage === 'loading'}
  <div class="loading-screen">
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
      <rect width="52" height="52" rx="14" fill="white" fill-opacity="0.15"/>
      <path d="M10 34 C14 22, 38 22, 42 34" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <path d="M8 34 L44 34" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M14 34 L14 28 Q14 24 18 24 L34 24 Q38 24 38 28 L38 34" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="20" cy="20" r="3" fill="white" fill-opacity="0.7"/>
      <circle cx="32" cy="18" r="2" fill="white" fill-opacity="0.5"/>
      <circle cx="26" cy="16" r="2.5" fill="white" fill-opacity="0.6"/>
    </svg>
    <div class="spinner"></div>
  </div>

{:else if basePage === 'login'}
  <Login />

{:else if basePage === 'perfil'}
  <Perfil />

{:else if basePage === 'home'}
  <Home />

{:else if basePage === 'buscar'}
  <Buscar />

{:else if basePage === 'alta-comercio'}
  <AltaComercio />

{:else if basePage === 'detalle-comercio'}
  <DetalleComercio comercioId={pageParam} />

{:else if basePage === 'admin'}
  <Admin />

<!-- ── Módulo 3: Precios ── -->

{:else if basePage === 'precios-comercio'}
  <Precios comercioId={pageParam} />

{:else if basePage === 'lista-precios'}
  <ListaPrecios comercioId={pageParam} />

{:else if basePage === 'lista-tematica'}
  <ListaTematica />

{:else if basePage === 'comparador'}
  <ComparadorPrecios pageParam={pageParam} />

{:else if basePage === 'publicar'}
  <PublicarLanding />

{:else if basePage === 'notificaciones'}
  <Notificaciones />

{:else if basePage === 'bloqueado'}
  <Bloqueado />

{:else if basePage === 'sugerencias'}
  <Sugerencias />

{:else if basePage === 'mis-listas'}
  <MisListas />

{:else if basePage === 'mi-lista'}
  <MiLista listaId={pageParam} />

{:else if basePage === 'optimizador'}
  <OptimizadorCompras listaId={pageParam} />

{/if}

<!-- Dialog de confirmación de salida -->
{#if mostrarConfirmSalir}
  <div class="salir-overlay" role="presentation" on:click={cancelarSalir}></div>
  <div class="salir-dialog" role="alertdialog" aria-modal="true">
    <div class="salir-icon">👋</div>
    <h2 class="salir-titulo">¿Salir de Canasta.co?</h2>
    <p class="salir-msg">¿Querés cerrar la aplicación?</p>
    <div class="salir-btns">
      <button class="salir-btn salir-cancelar" on:click={cancelarSalir}>
        Cancelar
      </button>
      <button class="salir-btn salir-confirmar" on:click={confirmarSalir}>
        Salir
      </button>
    </div>
  </div>
{/if}

<style>
  .loading-screen {
    min-height: 100dvh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--c-primary);
    flex-direction: column;
    gap: 24px;
  }

  /* ── Dialog confirmar salida ── */
  .salir-overlay {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.5);
    animation: fadeIn 0.15s ease;
  }
  .salir-dialog {
    position: fixed; z-index: 301;
    bottom: 0; left: 50%; transform: translateX(-50%);
    width: min(420px, 100vw);
    background: var(--c-surface); border-radius: 24px 24px 0 0;
    padding: 28px 24px 40px;
    text-align: center;
    box-shadow: 0 -4px 32px rgba(0,0,0,0.18);
    animation: slideUp 0.2s ease;
  }
  @keyframes slideUp {
    from { transform: translateX(-50%) translateY(100%); }
    to   { transform: translateX(-50%) translateY(0); }
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .salir-icon   { font-size: 44px; margin-bottom: 12px; }
  .salir-titulo { font-family: var(--f-brand); font-size: 20px; color: var(--c-text); margin-bottom: 8px; }
  .salir-msg    { font-size: 14px; color: var(--c-text-light); margin-bottom: 24px; }

  .salir-btns {
    display: flex; gap: 12px;
  }
  .salir-btn {
    flex: 1; padding: 14px; border-radius: var(--r-xl);
    font-size: 15px; font-weight: 700; cursor: pointer;
    font-family: var(--f-ui); border: none;
    transition: opacity 0.15s; -webkit-tap-highlight-color: transparent;
  }
  .salir-btn:active { opacity: 0.8; }
  .salir-cancelar { background: var(--c-surface-2); color: var(--c-text); }
  .salir-confirmar { background: var(--c-primary); color: white; }

</style>