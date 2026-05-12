<script>
  import { onMount } from 'svelte'
  import { currentPage, initAuth } from './stores/auth.js'
  import Login          from './pages/Login.svelte'
  import Perfil         from './pages/Perfil.svelte'
  import Home           from './pages/Home.svelte'
  import Buscar         from './pages/Buscar.svelte'
  import AltaComercio   from './pages/AltaComercio.svelte'
  import DetalleComercio from './pages/DetalleComercio.svelte'
  import Admin           from './pages/Admin.svelte'

  onMount(() => { initAuth() })

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
</style>