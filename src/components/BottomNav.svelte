<script>
  export let active = 'home'

  import { currentPage } from '../stores/auth.js'

  function go(page) {
    if (page === 'home' || page === 'perfil') {
      currentPage.set(page)
    }
    // Los otros módulos muestran un tooltip "próximamente"
  }

  let comingSoon = false
  let comingSoonTimeout

  function showComingSoon() {
    clearTimeout(comingSoonTimeout)
    comingSoon = true
    comingSoonTimeout = setTimeout(() => { comingSoon = false }, 2000)
  }

  const tabs = [
    {
      id: 'home',
      label: 'Inicio',
      available: true,
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>`,
      iconActive: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22" stroke="white" stroke-width="1.5" fill="none"/>
      </svg>`,
    },
    {
      id: 'buscar',
      label: 'Buscar',
      available: false,
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>`,
    },
    {
      id: 'publicar',
      label: 'Publicar',
      available: false,
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="9"/>
        <line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>`,
    },
    {
      id: 'perfil',
      label: 'Perfil',
      available: true,
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>`,
      iconActive: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>`,
    },
  ]
</script>

<nav class="bottom-nav" aria-label="Navegación principal">
  {#if comingSoon}
    <div class="coming-soon-toast" role="status">🚧 Próximamente</div>
  {/if}

  {#each tabs as tab}
    <button
      class="nav-tab"
      class:active={active === tab.id}
      on:click={() => tab.available ? go(tab.id) : showComingSoon()}
      aria-label={tab.label}
      aria-current={active === tab.id ? 'page' : undefined}
    >
      <span class="tab-icon">
        {#if active === tab.id && tab.iconActive}
          {@html tab.iconActive}
        {:else}
          {@html tab.icon}
        {/if}
      </span>
      <span class="tab-label">{tab.label}</span>
      {#if !tab.available}
        <span class="tab-dot" aria-hidden="true"></span>
      {/if}
    </button>
  {/each}
</nav>

<style>
  .bottom-nav {
    position: fixed;
    bottom: 0; left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: var(--app-width);
    height: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: rgba(255,255,255,0.96);
    backdrop-filter: blur(16px);
    border-top: 1px solid var(--c-border);
    box-shadow: 0 -4px 20px rgba(27,107,58,0.08);
    display: flex;
    align-items: stretch;
    z-index: 100;
  }

  .nav-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px 4px;
    transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
    position: relative;
    color: var(--c-text-light);
  }

  .nav-tab:active { transform: scale(0.92); }

  .nav-tab.active { color: var(--c-primary); }

  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px; height: 28px;
    border-radius: 10px;
    transition: background 0.15s;
  }
  .nav-tab.active .tab-icon {
    background: rgba(27,107,58,0.10);
  }

  .tab-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    transition: color 0.15s;
  }

  /* Indicador "próximamente" */
  .tab-dot {
    position: absolute;
    top: 8px; right: calc(50% - 14px);
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--c-accent);
    opacity: 0.6;
  }

  /* Toast */
  .coming-soon-toast {
    position: absolute;
    top: -44px; left: 50%;
    transform: translateX(-50%);
    background: var(--c-text);
    color: white;
    font-size: 13px;
    font-weight: 600;
    padding: 9px 18px;
    border-radius: 99px;
    white-space: nowrap;
    box-shadow: var(--s-md);
    animation: toastIn 0.2s ease forwards;
    pointer-events: none;
  }

  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
