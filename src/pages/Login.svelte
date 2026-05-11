<script>
  import { signInWithGoogle, authError } from '../stores/auth.js'

  let loading = false
  let isOffline = !navigator.onLine

  window.addEventListener('online',  () => { isOffline = false })
  window.addEventListener('offline', () => { isOffline = true  })

  async function handleLogin() {
    if (loading || isOffline) return
    loading = true
    await signInWithGoogle()
    loading = false
  }
</script>

<div class="login-shell">

  <!-- Fondo orgánico animado -->
  <div class="bg-orbs" aria-hidden="true">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>

  <!-- Patrón de puntos -->
  <div class="dot-pattern" aria-hidden="true"></div>

  <!-- Contenido principal -->
  <div class="login-content">

    <!-- Logo + Brand -->
    <div class="brand fade-in">
      <div class="logo-mark">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <!-- Canasta estilizada -->
          <rect width="56" height="56" rx="16" fill="white" fill-opacity="0.15"/>
          <!-- Arco superior -->
          <path d="M14 32 C16 20, 40 20, 42 32" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
          <!-- Base de la canasta -->
          <path d="M10 32 L46 32 L43 44 Q42 46 40 46 L16 46 Q14 46 13 44 Z" fill="white" fill-opacity="0.25"/>
          <path d="M10 32 L46 32 L43 44 Q42 46 40 46 L16 46 Q14 46 13 44 Z" stroke="white" stroke-width="2" fill="none"/>
          <!-- Líneas de la canasta -->
          <line x1="22" y1="32" x2="20" y2="46" stroke="white" stroke-width="1.5" stroke-opacity="0.6"/>
          <line x1="28" y1="32" x2="28" y2="46" stroke="white" stroke-width="1.5" stroke-opacity="0.6"/>
          <line x1="34" y1="32" x2="36" y2="46" stroke="white" stroke-width="1.5" stroke-opacity="0.6"/>
          <!-- Precio tag -->
          <rect x="30" y="10" width="18" height="14" rx="4" fill="var(--c-accent)" />
          <text x="39" y="21" text-anchor="middle" font-size="9" font-weight="700" fill="white" font-family="sans-serif">$</text>
        </svg>
      </div>

      <h1 class="brand-name">Canasta<span class="brand-dot">.co</span></h1>
      <p class="brand-tagline">Encontrá los mejores precios<br>de tu barrio</p>
    </div>

    <!-- Card de ingreso -->
    <div class="login-card fade-in" style="animation-delay: 0.15s">

      {#if isOffline}
        <div class="offline-msg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"></path>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
          <span>Sin conexión. Necesitás red para ingresar por primera vez.</span>
        </div>
      {:else}
        <p class="card-eyebrow">Comunidad de precios</p>
        <h2 class="card-title">Ingresá a tu cuenta</h2>
        <p class="card-sub">Usamos Google para verificar tu identidad de forma segura y sin contraseñas.</p>

        {#if $authError}
          <div class="alert alert-error" style="margin-bottom: 16px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {$authError}
          </div>
        {/if}

        <button
          class="btn btn-google"
          on:click={handleLogin}
          disabled={loading}
          aria-label="Ingresar con Google"
        >
          {#if loading}
            <div class="btn-spinner"></div>
            <span>Conectando…</span>
          {:else}
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Continuar con Google</span>
          {/if}
        </button>

        <p class="privacy-note">
          Al ingresar aceptás los términos de uso.<br>
          Nunca compartimos tus datos personales.
        </p>
      {/if}
    </div>

    <!-- Footer -->
    <p class="login-footer fade-in" style="animation-delay: 0.25s">
      Gratis · Sin publicidad · Hecho en Argentina 🇦🇷
    </p>

  </div>
</div>

<style>
  .login-shell {
    min-height: 100dvh;
    width: 100%;
    max-width: var(--app-width);
    background: linear-gradient(160deg, #134D2A 0%, #1B6B3A 45%, #1D7A42 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    padding: 32px 24px 48px;
  }

  /* ── Fondo orgánico ── */
  .bg-orbs {
    position: absolute; inset: 0; pointer-events: none;
  }
  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(70px);
    opacity: 0.18;
  }
  .orb-1 {
    width: 320px; height: 320px;
    background: #F5A321;
    top: -80px; right: -60px;
    animation: float1 8s ease-in-out infinite;
  }
  .orb-2 {
    width: 280px; height: 280px;
    background: #2D9B57;
    bottom: 40px; left: -80px;
    animation: float2 10s ease-in-out infinite;
  }
  .orb-3 {
    width: 200px; height: 200px;
    background: #fff;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    animation: float3 12s ease-in-out infinite;
  }
  @keyframes float1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(20px)} }
  @keyframes float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
  @keyframes float3 { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.1)} }

  .dot-pattern {
    position: absolute; inset: 0; pointer-events: none;
    background-image: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
    background-size: 24px 24px;
    mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
  }

  /* ── Contenido ── */
  .login-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    width: 100%;
    max-width: 340px;
  }

  /* ── Brand ── */
  .brand {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .logo-mark {
    filter: drop-shadow(0 8px 24px rgba(0,0,0,0.25));
    animation: logoFloat 4s ease-in-out infinite;
  }
  @keyframes logoFloat {
    0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)}
  }

  .brand-name {
    font-family: var(--f-brand);
    font-size: 42px;
    font-weight: 700;
    color: #fff;
    line-height: 1;
    letter-spacing: -1px;
  }
  .brand-dot { color: var(--c-accent); }

  .brand-tagline {
    font-size: 16px;
    color: rgba(255,255,255,0.75);
    line-height: 1.55;
    font-weight: 400;
  }

  /* ── Card ── */
  .login-card {
    width: 100%;
    background: rgba(255,255,255,0.97);
    border-radius: 28px;
    padding: 28px 24px 24px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.15);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .card-eyebrow {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--c-primary);
    background: var(--c-surface-2);
    padding: 4px 12px;
    border-radius: 99px;
  }

  .card-title {
    font-family: var(--f-brand);
    font-size: 24px;
    font-weight: 700;
    color: var(--c-text);
    text-align: center;
    margin-top: 2px;
  }

  .card-sub {
    font-size: 14px;
    color: var(--c-text-mid);
    text-align: center;
    line-height: 1.55;
    margin-bottom: 4px;
  }

  .btn-spinner {
    width: 18px; height: 18px;
    border: 2px solid #dadce0;
    border-top-color: #4285F4;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .privacy-note {
    font-size: 11px;
    color: var(--c-text-light);
    text-align: center;
    line-height: 1.5;
    margin-top: 4px;
  }

  /* ── Offline ── */
  .offline-msg {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px;
    background: #FFF8E1;
    border-radius: 12px;
    color: #795548;
    font-size: 14px;
    line-height: 1.5;
    border: 1px solid #FFE082;
    width: 100%;
  }
  .offline-msg svg { flex-shrink: 0; margin-top: 1px; }

  /* ── Footer ── */
  .login-footer {
    font-size: 12px;
    color: rgba(255,255,255,0.5);
    text-align: center;
  }
</style>
