<script>
  import { signInWithGoogle, signInWithEmail, registerWithEmail, authError } from '../stores/auth.js'

  let loading       = false
  let isOffline     = !navigator.onLine
  let modo          = 'google'   // 'google' | 'login' | 'registro' | 'testing' | 'verificado'
  let email         = ''
  let password      = ''
  let passwordConf  = ''
  let loadingEmail  = false
  let errorLocal    = ''

  window.addEventListener('online',  () => { isOffline = false })
  window.addEventListener('offline', () => { isOffline = true  })

  async function handleGoogle() {
    if (loading || isOffline) return
    loading = true
    await signInWithGoogle()
    loading = false
  }

  async function handleLogin() {
    errorLocal = ''
    if (!email || !password) { errorLocal = 'Completá email y contraseña.'; return }
    loadingEmail = true
    await signInWithEmail(email, password)
    loadingEmail = false
  }

  async function handleRegistro() {
    errorLocal = ''
    if (!email || !password || !passwordConf) { errorLocal = 'Completá todos los campos.'; return }
    if (password.length < 6) { errorLocal = 'La contraseña debe tener al menos 6 caracteres.'; return }
    if (password !== passwordConf) { errorLocal = 'Las contraseñas no coinciden.'; return }
    loadingEmail = true
    const result = await registerWithEmail(email, password)
    loadingEmail = false
    if (result?.success) {
      modo = 'verificado'
      authError.set(null)
    }
  }

  // ── Testing ───────────────────────────────────────────────────────────────
  let modTesting = false
  let testPassword = ''

  function toggleTesting() { modTesting = !modTesting; authError.set(null) }

  async function handleEmail() {
    if (loadingEmail || !email || !testPassword) return
    loadingEmail = true
    await signInWithEmail(email, testPassword)
    loadingEmail = false
  }

  function cambiarModo(nuevo) {
    modo = nuevo
    email = ''; password = ''; passwordConf = ''
    errorLocal = ''
    authError.set(null)
  }
</script>

<div class="login-shell">

  <!-- Fondo -->
  <div class="bg-orbs" aria-hidden="true">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>
  <div class="dot-pattern" aria-hidden="true"></div>

  <div class="login-content">

    <!-- Brand -->
    <div class="brand fade-in">
      <div class="logo-mark">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <rect width="56" height="56" rx="16" fill="white" fill-opacity="0.15"/>
          <path d="M14 32 C16 20, 40 20, 42 32" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
          <path d="M10 32 L46 32 L43 44 Q42 46 40 46 L16 46 Q14 46 13 44 Z" fill="white" fill-opacity="0.25"/>
          <path d="M10 32 L46 32 L43 44 Q42 46 40 46 L16 46 Q14 46 13 44 Z" stroke="white" stroke-width="2" fill="none"/>
          <line x1="22" y1="32" x2="20" y2="46" stroke="white" stroke-width="1.5" stroke-opacity="0.6"/>
          <line x1="28" y1="32" x2="28" y2="46" stroke="white" stroke-width="1.5" stroke-opacity="0.6"/>
          <line x1="34" y1="32" x2="36" y2="46" stroke="white" stroke-width="1.5" stroke-opacity="0.6"/>
          <rect x="30" y="10" width="18" height="14" rx="4" fill="var(--c-accent)" />
          <text x="39" y="21" text-anchor="middle" font-size="9" font-weight="700" fill="white" font-family="sans-serif">$</text>
        </svg>
      </div>
      <h1 class="brand-name">Canasta<span class="brand-dot">.co</span></h1>
      <p class="brand-tagline">Encontrá los mejores precios<br>de tu barrio</p>
    </div>

    <!-- Card -->
    <div class="login-card fade-in" style="animation-delay: 0.15s">

      {#if isOffline}
        <!-- Sin conexión -->
        <div class="offline-msg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          <span>Sin conexión. Necesitás red para ingresar.</span>
        </div>

      {:else if modo === 'verificado'}
        <!-- Email enviado -->
        <div class="verificado-state">
          <div class="verif-icon">📧</div>
          <h2 class="card-title">¡Revisá tu email!</h2>
          <p class="card-sub">
            Te enviamos un link de verificación a <strong>{email}</strong>.
            Hacé clic en el link para activar tu cuenta y luego ingresá.
          </p>
          <p class="verif-hint">
            Si no lo encontrás, revisá la carpeta de spam o correo no deseado.
          </p>
          <button class="btn btn-primary btn-full" on:click={() => cambiarModo('login')}>
            Ya verifiqué — Ingresar
          </button>
          <button class="btn-link" on:click={() => cambiarModo('registro')}>
            ← Volver al registro
          </button>
        </div>

      {:else if !modTesting}

        {#if modo === 'google'}
          <!-- ── Login principal con Google ── -->
          <p class="card-eyebrow">Comunidad de precios</p>
          <h2 class="card-title">Ingresá a tu cuenta</h2>

          {#if $authError}
            <div class="alert alert-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {$authError}
            </div>
          {/if}

          <!-- Google -->
          <button class="btn btn-google" on:click={handleGoogle} disabled={loading}>
            {#if loading}
              <div class="btn-spinner"></div><span>Conectando…</span>
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

          <div class="divider"><span>o</span></div>

          <!-- Email -->
          <button class="btn btn-email" on:click={() => cambiarModo('login')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span>Continuar con email</span>
          </button>

          <p class="register-link">
            ¿No tenés cuenta?
            <button class="btn-link" on:click={() => cambiarModo('registro')}>Registrate</button>
          </p>

          <p class="privacy-note">Al ingresar aceptás los términos de uso.<br>Nunca compartimos tus datos personales.</p>
          <button class="btn-testing-toggle" on:click={toggleTesting}>🧪 Acceso testing</button>

        {:else if modo === 'login'}
          <!-- ── Login con email ── -->
          <div class="modo-header">
            <button class="btn-back" on:click={() => cambiarModo('google')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <h2 class="card-title" style="flex:1;text-align:center">Ingresá</h2>
          </div>

          {#if $authError || errorLocal}
            <div class="alert alert-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {$authError || errorLocal}
            </div>
          {/if}

          <div class="form-group">
            <label class="form-label" for="login-email">Email</label>
            <input id="login-email" type="email" class="form-input"
              placeholder="tu@email.com" bind:value={email}
              autocomplete="email" autocapitalize="off"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="login-pass">Contraseña</label>
            <input id="login-pass" type="password" class="form-input"
              placeholder="••••••••" bind:value={password}
              autocomplete="current-password"
              on:keydown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <button class="btn btn-primary btn-full" on:click={handleLogin}
            disabled={!email || !password || loadingEmail}>
            {#if loadingEmail}
              <div class="btn-spinner" style="border-top-color:white"></div> Ingresando…
            {:else}
              Ingresar
            {/if}
          </button>

          <p class="register-link">
            ¿No tenés cuenta?
            <button class="btn-link" on:click={() => cambiarModo('registro')}>Registrate</button>
          </p>

        {:else if modo === 'registro'}
          <!-- ── Registro nuevo usuario ── -->
          <div class="modo-header">
            <button class="btn-back" on:click={() => cambiarModo('google')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <h2 class="card-title" style="flex:1;text-align:center">Crear cuenta</h2>
          </div>

          {#if $authError || errorLocal}
            <div class="alert alert-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {$authError || errorLocal}
            </div>
          {/if}

          <div class="form-group">
            <label class="form-label" for="reg-email">Email</label>
            <input id="reg-email" type="email" class="form-input"
              placeholder="tu@email.com" bind:value={email}
              autocomplete="email" autocapitalize="off"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-pass">Contraseña</label>
            <input id="reg-pass" type="password" class="form-input"
              placeholder="Mínimo 6 caracteres" bind:value={password}
              autocomplete="new-password"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-pass2">Repetí la contraseña</label>
            <input id="reg-pass2" type="password" class="form-input"
              placeholder="••••••••" bind:value={passwordConf}
              autocomplete="new-password"
              on:keydown={e => e.key === 'Enter' && handleRegistro()}
            />
          </div>

          <button class="btn btn-primary btn-full" on:click={handleRegistro}
            disabled={!email || !password || !passwordConf || loadingEmail}>
            {#if loadingEmail}
              <div class="btn-spinner" style="border-top-color:white"></div> Creando cuenta…
            {:else}
              Crear cuenta
            {/if}
          </button>

          <p class="privacy-note" style="margin-top:4px">
            Te enviaremos un email de verificación para activar tu cuenta.
          </p>
          <p class="register-link">
            ¿Ya tenés cuenta?
            <button class="btn-link" on:click={() => cambiarModo('login')}>Ingresá</button>
          </p>
        {/if}

      {:else}
        <!-- ── Testing ── -->
        <div class="testing-header">
          <span class="testing-badge">🧪 Modo testing</span>
          <button class="btn-back" on:click={toggleTesting}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Volver
          </button>
        </div>

        {#if $authError}
          <div class="alert alert-error" style="width:100%">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {$authError}
          </div>
        {/if}

        <div class="form-group" style="width:100%">
          <label class="form-label" for="test-email">Email</label>
          <input id="test-email" type="email" class="form-input"
            placeholder="comercio@test.com" bind:value={email}
            autocomplete="email" autocapitalize="off"
          />
        </div>
        <div class="form-group" style="width:100%">
          <label class="form-label" for="test-pass">Contraseña</label>
          <input id="test-pass" type="password" class="form-input"
            placeholder="••••••••" bind:value={testPassword}
            autocomplete="current-password"
            on:keydown={e => e.key === 'Enter' && handleEmail()}
          />
        </div>

        <button class="btn btn-primary btn-full" on:click={handleEmail}
          disabled={!email || !testPassword || loadingEmail}>
          {#if loadingEmail}
            <div class="btn-spinner" style="border-top-color:white"></div> Ingresando…
          {:else}
            Ingresar como tester
          {/if}
        </button>

        <div class="cuentas-rapidas">
          <p class="cuentas-label">Acceso rápido:</p>
          <div class="cuentas-grid">
            {#each [
              { label: 'Usuario',  email: 'usuario@test.com'  },
              { label: 'Comercio', email: 'comercio@test.com' },
              { label: 'Dedicado', email: 'dedicado@test.com' },
              { label: 'Admin',    email: 'admin@test.com'    },
            ] as cuenta}
              <button class="cuenta-chip"
                on:click={() => { email = cuenta.email; testPassword = '' }}>
                {cuenta.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}

    </div>

    <p class="login-footer fade-in" style="animation-delay: 0.25s">
      Gratis · Sin publicidad · Hecho en Argentina 🇦🇷
    </p>
  </div>
</div>

<style>
  .login-shell {
    min-height: 100dvh; width: 100%; max-width: var(--app-width);
    background: linear-gradient(160deg, #134D2A 0%, #1B6B3A 45%, #1D7A42 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative; overflow: hidden; padding: 32px 24px 48px;
  }
  .bg-orbs { position: absolute; inset: 0; pointer-events: none; }
  .orb { position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.18; }
  .orb-1 { width:320px; height:320px; background:#F5A321; top:-80px; right:-60px; animation:float1 8s ease-in-out infinite; }
  .orb-2 { width:280px; height:280px; background:#2D9B57; bottom:40px; left:-80px; animation:float2 10s ease-in-out infinite; }
  .orb-3 { width:200px; height:200px; background:#fff; top:50%; left:50%; transform:translate(-50%,-50%); animation:float3 12s ease-in-out infinite; }
  @keyframes float1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(20px)} }
  @keyframes float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
  @keyframes float3 { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.1)} }
  .dot-pattern {
    position: absolute; inset: 0; pointer-events: none;
    background-image: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
    background-size: 24px 24px;
    mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
  }
  .login-content {
    position: relative; z-index: 1;
    display: flex; flex-direction: column; align-items: center; gap: 32px;
    width: 100%; max-width: 340px;
  }
  .brand { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .logo-mark { filter: drop-shadow(0 8px 24px rgba(0,0,0,0.25)); animation: logoFloat 4s ease-in-out infinite; }
  @keyframes logoFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  .brand-name { font-family: var(--f-brand); font-size: 42px; font-weight: 700; color: #fff; line-height: 1; letter-spacing: -1px; }
  .brand-dot  { color: var(--c-accent); }
  .brand-tagline { font-size: 16px; color: rgba(255,255,255,0.75); line-height: 1.55; }

  .login-card {
    width: 100%; background: rgba(255,255,255,0.97); border-radius: 28px;
    padding: 28px 24px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.15);
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }
  .card-eyebrow {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--c-primary);
    background: var(--c-surface-2); padding: 4px 12px; border-radius: 99px;
  }
  .card-title { font-family: var(--f-brand); font-size: 22px; font-weight: 700; color: var(--c-text); text-align: center; }
  .card-sub   { font-size: 13px; color: var(--c-text-mid); text-align: center; line-height: 1.55; }

  .alert { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px;
    border-radius: 10px; font-size: 13px; line-height: 1.4; width: 100%; }
  .alert-error { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }

  .btn-google {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 13px 20px; background: white; border: 1.5px solid #dadce0;
    border-radius: 12px; font-size: 15px; font-weight: 600; color: #3c4043;
    cursor: pointer; transition: all 0.15s; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .btn-google:hover { background: #f8f9fa; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }

  .btn-email {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 13px 20px; background: var(--c-surface-2); border: 1.5px solid var(--c-border);
    border-radius: 12px; font-size: 15px; font-weight: 600; color: var(--c-text);
    cursor: pointer; transition: all 0.15s;
  }
  .btn-email:hover { background: var(--c-border); }

  .divider {
    display: flex; align-items: center; gap: 10px; width: 100%;
    color: var(--c-text-light); font-size: 12px;
  }
  .divider::before, .divider::after {
    content: ''; flex: 1; height: 1px; background: var(--c-border);
  }

  .modo-header {
    display: flex; align-items: center; gap: 8px; width: 100%; margin-bottom: 4px;
  }

  .form-group { width: 100%; display: flex; flex-direction: column; gap: 6px; }
  .form-label { font-size: 13px; font-weight: 700; color: var(--c-text-mid); }
  .form-input {
    width: 100%; padding: 12px 14px; border: 1.5px solid var(--c-border);
    border-radius: 10px; font-size: 15px; font-family: var(--f-ui); color: var(--c-text);
    background: var(--c-surface); box-sizing: border-box; transition: border-color 0.15s;
  }
  .form-input:focus { outline: none; border-color: var(--c-primary); }

  .btn-spinner {
    width: 18px; height: 18px; border: 2px solid #dadce0; border-top-color: #4285F4;
    border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .btn-link {
    background: none; border: none; color: var(--c-primary); font-size: 13px;
    font-weight: 700; cursor: pointer; text-decoration: underline;
    font-family: var(--f-ui); padding: 0;
  }

  .register-link { font-size: 13px; color: var(--c-text-light); text-align: center; }
  .privacy-note  { font-size: 11px; color: var(--c-text-light); text-align: center; line-height: 1.5; }

  /* Email verificado */
  .verificado-state { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
  .verif-icon  { font-size: 48px; }
  .verif-hint  { font-size: 12px; color: var(--c-text-light); background: var(--c-surface-2); padding: 10px 14px; border-radius: 10px; line-height: 1.5; }

  /* Testing toggle */
  .btn-testing-toggle {
    background: none; border: none; font-size: 11px; color: var(--c-text-light);
    cursor: pointer; padding: 6px 8px; margin-top: 4px; border-radius: 8px; transition: background 0.15s;
  }
  .btn-testing-toggle:hover { background: var(--c-surface-2); }

  /* Testing panel */
  .testing-header { width: 100%; display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .testing-badge { font-size: 12px; font-weight: 700; color: #92400E; background: #FEF3C7; padding: 4px 10px; border-radius: 99px; border: 1px solid #F59E0B; }
  .btn-back { background: none; border: none; font-size: 12px; color: var(--c-text-light); cursor: pointer; display: flex; align-items: center; gap: 3px; padding: 4px 6px; border-radius: 6px; }
  .btn-back:hover { background: var(--c-surface-2); }

  .cuentas-rapidas { width: 100%; padding: 12px; margin-top: 4px; background: #FFFBEB; border: 1px dashed #F59E0B; border-radius: 12px; }
  .cuentas-label { font-size: 11px; font-weight: 700; color: #92400E; margin-bottom: 8px; }
  .cuentas-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .cuenta-chip { padding: 7px; background: white; border: 1px solid #F59E0B; border-radius: 8px; font-size: 12px; font-weight: 700; color: #92400E; cursor: pointer; transition: background 0.15s; }
  .cuenta-chip:hover { background: #FEF3C7; }

  .offline-msg { display: flex; align-items: flex-start; gap: 10px; padding: 14px; background: #FFF8E1; border-radius: 12px; color: #795548; font-size: 14px; line-height: 1.5; border: 1px solid #FFE082; width: 100%; }
  .offline-msg svg { flex-shrink: 0; margin-top: 1px; }

  .login-footer { font-size: 12px; color: rgba(255,255,255,0.5); text-align: center; }

  .fade-in { animation: fadeIn 0.4s ease both; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
</style>