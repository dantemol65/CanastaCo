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
  import MisListas          from './pages/MisListas.svelte'
  import MiLista            from './pages/MiLista.svelte'
  import OptimizadorCompras from './pages/OptimizadorCompras.svelte'
  import Precios            from './pages/Precios.svelte'
  import ListaPrecios       from './pages/ListaPrecios.svelte'
  import ListaTematica      from './pages/ListaTematica.svelte'
  import ComparadorPrecios  from './pages/ComparadorPrecios.svelte'
  import PublicarLanding    from './pages/PublicarLanding.svelte'
  import GestionListasComercio from './pages/GestionListasComercio.svelte'
  import Notificaciones   from './pages/Notificaciones.svelte'
  import Bloqueado        from './pages/Bloqueado.svelte'
  import Sugerencias      from './pages/Sugerencias.svelte'
  import ComercioPublico from './pages/ComercioPublico.svelte'
  import { cargarConfig } from './stores/config.js'

  let mostrarAvisoSalir = false
  let timerAvisoSalir   = null

  // ── Parámetros QR del cartel ──────────────────────────────────────────────
  let qrComercioId = ''
  let qrDir        = ''
  let qrToken      = ''

  onMount(() => {
    // ── Detectar si la app se abrió desde el QR del cartel ─────────────────
    // URL esperada: https://canasta.co/comercio/{id}?dir=...&token=...
    // Se navega a ComercioPublico ANTES de initAuth — no requiere login.
    const path  = window.location.pathname
    const match = path.match(/^\/comercio\/([^/?]+)/)
    if (match) {
      const params = new URLSearchParams(window.location.search)
      qrComercioId = match[1]
      qrDir        = params.get('dir')   || ''
      qrToken      = params.get('token') || ''
      // Navegar directo a la página pública sin pasar por login
      currentPage.set('comercio-publico:' + qrComercioId)
    }

    initAuth()
    cargarConfig()

    history.replaceState({ canastaco: 'base' }, '')
    history.pushState({ canastaco: 'top' }, '')

    const onPopState = (e) => {
      if (e.state?.canastaco === 'base' || !e.state?.canastaco) {
        const pagina = $currentPage

        if (pagina === 'home' || pagina === 'login' || pagina === 'bloqueado') {
          if (mostrarAvisoSalir) return
          mostrarAvisoSalir = true
          history.pushState({ canastaco: 'top' }, '')
          clearTimeout(timerAvisoSalir)
          timerAvisoSalir = setTimeout(() => { mostrarAvisoSalir = false }, 3000)
        } else {
          history.pushState({ canastaco: 'top' }, '')
        }
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      clearTimeout(timerAvisoSalir)
    }
  })

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

{:else if basePage === 'comercio-publico'}
  <ComercioPublico
    comercioId={pageParam}
    qrDir={qrDir}
    qrToken={qrToken}
  />

{:else if basePage === 'admin'}
  <Admin />

{:else if basePage === 'precios-comercio'}
  <Precios comercioId={pageParam} />

{:else if basePage === 'gestion-listas'}
  <GestionListasComercio comercioId={pageParam} />

{:else if basePage === 'lista-precios'}
  {@const [cId, lId] = (pageParam || '').split(':')}
  <ListaPrecios comercioId={cId || pageParam} listaIdExistente={lId || ''} />

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

{#if mostrarAvisoSalir}
  <div class="salir-toast" role="status">
    Presioná de nuevo para salir
  </div>
{/if}

<style>
  .loading-screen {
    min-height: 100dvh; width: 100%;
    display: flex; align-items: center; justify-content: center;
    background: var(--c-primary); flex-direction: column; gap: 24px;
  }

  .salir-toast {
    position: fixed; bottom: 80px; left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.85); color: white;
    padding: 12px 24px; border-radius: var(--r-full);
    font-size: 14px; font-weight: 600;
    z-index: 300; white-space: nowrap;
    box-shadow: var(--s-lg);
    animation: fadeInUp 0.2s ease;
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>