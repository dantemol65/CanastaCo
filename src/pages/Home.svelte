<script>
  import { currentUser, userProfile, currentPage } from '../stores/auth.js'
  import BottomNav from '../components/BottomNav.svelte'

  $: user    = $currentUser
  $: profile = $userProfile

  $: displayName  = profile?.alias || user?.displayName?.split(' ')[0] || 'Usuario'
  $: displayPhoto = profile?.foto  || user?.photoURL || ''
  $: localidad    = profile?.localidad
    ? profile.localidad.split('-').pop()  // ID final, mejoramos con datos reales
    : 'tu localidad'

  // Obtener nombre legible de localidad
  import { localidades as allLocalidades } from '../data/argentina.js'
  $: localidadNombre = (() => {
    if (!profile?.localidad) return 'tu zona'
    const deptId = profile.departamento || ''
    const locId  = profile.localidad
    const locs   = allLocalidades[deptId] || []
    return locs.find(l => l.id === locId)?.nombre || profile.localidad
  })()

  const modulos = [
    {
      id: 2,
      icon: '🔍',
      titulo: 'Buscar productos',
      desc: 'Encontrá el precio más bajo de un producto en tu zona.',
      color: '#1B6B3A',
      disponible: false,
    },
    {
      id: 3,
      icon: '📷',
      titulo: 'Cargar precios',
      desc: 'Publicá precios escaneando ticket o dictando por voz.',
      color: '#0277BD',
      disponible: false,
    },
    {
      id: 4,
      icon: '🏪',
      titulo: 'Comercios',
      desc: 'Registrá tu comercio y subí tu lista de precios.',
      color: '#6A1B9A',
      disponible: false,
    },
    {
      id: 5,
      icon: '📊',
      titulo: 'Estadísticas',
      desc: 'Mirá cómo evolucionan los precios en tu barrio.',
      color: '#E65100',
      disponible: false,
    },
  ]

  function goToPerfil() {
    currentPage.set('perfil')
  }
</script>

<div class="app-shell home-shell">

  <!-- Header -->
  <header class="home-header">
    <div class="header-inner">
      <div class="header-left">
        <div class="brand-home">Canasta<span class="accent-dot">.co</span></div>
        {#if localidadNombre}
          <div class="location-pill">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            {localidadNombre}
          </div>
        {/if}
      </div>

      <button class="avatar-btn" on:click={goToPerfil} aria-label="Mi perfil">
        {#if displayPhoto}
          <img src={displayPhoto} alt={displayName} class="avatar header-avatar" width="40" height="40" />
        {:else}
          <div class="avatar-fallback">
            {displayName.charAt(0).toUpperCase()}
          </div>
        {/if}
      </button>
    </div>
  </header>

  <!-- Scroll area -->
  <div class="scroll-area home-scroll">
    <div class="home-content fade-in">

      <!-- Saludo -->
      <section class="greeting-section">
        <h1 class="greeting-title">¡Hola, <em>{displayName}</em>!</h1>
        <p class="greeting-sub">Esto es lo que viene en Canasta.co</p>
      </section>

      <!-- Módulo 1 completado -->
      <div class="module-done">
        <div class="module-done-icon">✓</div>
        <div class="module-done-text">
          <span class="module-done-num">Módulo 1</span>
          <span class="module-done-label">Login y Perfil</span>
        </div>
        <div class="module-done-badge">
          <span class="badge badge-green">Completo</span>
        </div>
      </div>

      <!-- Próximos módulos -->
      <section class="modules-section">
        <div class="section-header">
          <h2 class="section-title">En desarrollo</h2>
          <span class="badge badge-amber">Próximamente</span>
        </div>

        <div class="modules-grid">
          {#each modulos as mod}
            <div class="module-card" style="--mod-color: {mod.color}">
              <div class="module-icon">{mod.icon}</div>
              <div class="module-info">
                <div class="module-num">Módulo {mod.id}</div>
                <div class="module-title">{mod.titulo}</div>
                <p class="module-desc">{mod.desc}</p>
              </div>
              <div class="module-lock" aria-label="No disponible aún">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- Info card -->
      <div class="info-card">
        <div class="info-icon">💡</div>
        <div>
          <strong>¿Cómo funciona?</strong>
          <p>Los usuarios cargamos precios de los comercios del barrio. Entre todos encontramos dónde comprar más barato. Sin publicidad, sin fines de lucro.</p>
        </div>
      </div>

    </div>
  </div>

  <!-- Bottom Navigation -->
  <BottomNav active="home" />

</div>

<style>
  .home-shell {
    background: var(--c-bg);
    display: flex;
    flex-direction: column;
  }

  /* ── Header ── */
  .home-header {
    position: sticky; top: 0; z-index: 20;
    background: var(--c-primary);
    padding-top: env(safe-area-inset-top, 0);
  }

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .brand-home {
    font-family: var(--f-brand);
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    line-height: 1;
  }
  .accent-dot { color: var(--c-accent); }

  .location-pill {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 600;
    color: rgba(255,255,255,0.75);
    letter-spacing: 0.02em;
  }

  .avatar-btn {
    background: none; border: none; cursor: pointer; padding: 0;
    border-radius: 50%;
    transition: transform 0.15s;
  }
  .avatar-btn:active { transform: scale(0.93); }

  .header-avatar {
    border: 2px solid rgba(255,255,255,0.4);
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }

  .avatar-fallback {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: var(--c-accent);
    border: 2px solid rgba(255,255,255,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700; color: white;
  }

  /* ── Scroll area ── */
  .home-scroll {
    flex: 1;
    padding-bottom: calc(var(--nav-h) + 16px + env(safe-area-inset-bottom, 0px));
  }

  .home-content {
    padding: 0 16px 16px;
    max-width: 440px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Greeting ── */
  .greeting-section { padding-top: 24px; }

  .greeting-title {
    font-family: var(--f-brand);
    font-size: 30px;
    font-weight: 700;
    color: var(--c-text);
    line-height: 1.1;
  }
  .greeting-title em {
    font-style: italic;
    color: var(--c-primary);
  }
  .greeting-sub {
    font-size: 15px;
    color: var(--c-text-mid);
    margin-top: 6px;
  }

  /* ── Módulo completado ── */
  .module-done {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--c-surface);
    border: 1.5px solid rgba(27,107,58,0.2);
    border-radius: var(--r-xl);
    padding: 16px 18px;
    box-shadow: var(--s-sm);
  }

  .module-done-icon {
    width: 42px; height: 42px;
    border-radius: 12px;
    background: var(--c-primary);
    color: white;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 700;
    flex-shrink: 0;
  }

  .module-done-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .module-done-num {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--c-text-light);
    font-weight: 700;
  }
  .module-done-label {
    font-size: 15px;
    font-weight: 700;
    color: var(--c-text);
  }

  /* ── Módulos próximos ── */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section-title {
    font-family: var(--f-brand);
    font-size: 20px;
    font-weight: 700;
    color: var(--c-text);
  }

  .modules-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .module-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    padding: 14px 16px;
    opacity: 0.7;
    position: relative;
    overflow: hidden;
  }
  .module-card::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: var(--mod-color);
    border-radius: 3px 0 0 3px;
  }

  .module-icon {
    font-size: 26px;
    width: 44px; height: 44px;
    border-radius: 12px;
    background: var(--c-surface-2);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .module-info { flex: 1; min-width: 0; }
  .module-num {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--c-text-light);
    font-weight: 700;
  }
  .module-title { font-size: 14px; font-weight: 700; color: var(--c-text); }
  .module-desc  { font-size: 12px; color: var(--c-text-mid); line-height: 1.4; margin-top: 2px; }

  .module-lock {
    color: var(--c-text-light);
    flex-shrink: 0;
    padding: 6px;
    border-radius: 8px;
    background: var(--c-surface-2);
  }

  /* ── Info card ── */
  .info-card {
    display: flex;
    gap: 14px;
    background: linear-gradient(135deg, rgba(27,107,58,0.06) 0%, rgba(245,163,33,0.06) 100%);
    border: 1px solid rgba(27,107,58,0.12);
    border-radius: var(--r-lg);
    padding: 18px;
  }
  .info-icon { font-size: 28px; flex-shrink: 0; }
  .info-card strong {
    font-size: 14px; font-weight: 700; color: var(--c-text);
    display: block; margin-bottom: 6px;
  }
  .info-card p { font-size: 13px; color: var(--c-text-mid); line-height: 1.55; }
</style>
