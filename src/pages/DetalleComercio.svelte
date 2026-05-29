<script>
  import { onMount } from 'svelte'
  import { currentPage, currentUser, userProfile } from '../stores/auth.js'
  import {
    comercioActivo, cargarComercio, verificarComercio, reclamarConCodigo,
    TIPOS_COMERCIO, ESTADOS
  } from '../stores/comercios.js'
  import { abrirMapa, formatDistancia, distanciaKm, obtenerPosicion, geocodificarDireccion } from '../lib/geolocation.js'
  import { generarCartelPDF, verificarTokenCartel } from '../lib/cartel.js'
  import BottomNav from '../components/BottomNav.svelte'

  export let comercioId = ''
  export let qrDir      = ''   // recibido desde App.svelte al abrir via QR
  export let qrToken    = ''   // recibido desde App.svelte al abrir via QR

  let cargando    = true
  let error       = null
  let verificando = false
  let yaVerifique = false
  let toastMsg    = ''
  let posicion    = null

  // ── Verificación QR del cartel ────────────────────────────────────────────
  // null = navegación normal | 'verificando' | 'ok' | 'error'
  let qrEstado = null

  // ── Cartel ────────────────────────────────────────────────────────────────
  let generandoCartel = false
  let errorCartel     = ''

  $: comercio   = $comercioActivo
  $: user       = $currentUser
  $: tipoInfo   = TIPOS_COMERCIO.find(t => t.id === comercio?.tipo) || { emoji: '🏪', label: comercio?.tipo }
  $: estadoInfo = ESTADOS[comercio?.estado] || ESTADOS.pendiente
  $: distancia  = (posicion && comercio?.lat && comercio?.lng)
      ? distanciaKm(posicion.lat, posicion.lng, comercio.lat, comercio.lng)
      : null

  // ¿Es el dueño reclamado?
  $: esDueno = comercio?.reclamadoPor && user && comercio.reclamadoPor === user.uid

  // ¿Ya verifiqué este comercio?
  $: if (comercio && user) {
    yaVerifique = comercio.verificaciones?.some(v => v.uid === user.uid) || false
  }

  // ¿Puede descargar el cartel?
  // Solo el dueño reclamado + comercio verificado + tiene codigoPublico
  $: puedeCartel = esDueno && comercio?.estado === 'verificado' && !!comercio?.codigoPublico

  onMount(async () => {
    if ($comercioActivo?.id !== comercioId) comercioActivo.set(null)
    const c = await cargarComercio(comercioId)
    if (!c) {
      error = navigator.onLine
        ? 'Comercio no encontrado.'
        : 'Sin conexión - este comercio no está guardado localmente.'
    }
    cargando = false
    obtenerPosicion().then(p => posicion = p).catch(() => {})

    // ── Verificación del QR del cartel ──────────────────────────────────────
    // Si la app se abrió escaneando el QR, qrDir y qrToken llegan como props.
    // Se verifica que el token corresponda a los datos reales del comercio.
    if (qrDir && qrToken && c) {
      qrEstado = 'verificando'
      try {
        const ok = await verificarTokenCartel(
          c.id,
          decodeURIComponent(qrDir),
          c.codigoPublico || '',
          qrToken
        )
        qrEstado = ok ? 'ok' : 'error'
      } catch {
        qrEstado = 'error'
      }
    }
  })

  async function handleVerificar() {
    if (yaVerifique || verificando) return
    verificando = true
    try {
      await verificarComercio(comercioId)
      yaVerifique = true
      showToast('¡Gracias por verificar este comercio!')
    } catch (e) {
      showToast('Error al verificar. Intentá de nuevo.')
    } finally {
      verificando = false
    }
  }

  // ── Cartel PDF ────────────────────────────────────────────────────────────
  async function handleDescargarCartel() {
    if (generandoCartel) return
    generandoCartel = true
    errorCartel     = ''
    try {
      const pdf = await generarCartelPDF(comercio)
      pdf.save(`cartel-${comercio.nombre.replace(/\s+/g, '-').toLowerCase()}.pdf`)
      showToast('Cartel descargado. ¡Pegalo en tu local!')
    } catch (e) {
      errorCartel = e.message || 'Error al generar el cartel. Verificá tu conexión.'
    } finally {
      generandoCartel = false
    }
  }

  // ── Reclamo con código privado ─────────────────────────────────────────────
  let mostrarFormReclamo = false
  let codigoReclamo      = ''
  let reclamando         = false
  let errorReclamo       = ''

  function toggleFormReclamo() {
    mostrarFormReclamo = !mostrarFormReclamo
    codigoReclamo = ''
    errorReclamo  = ''
  }

  async function handleReclamar() {
    if (!codigoReclamo.trim() || reclamando) return
    reclamando   = true
    errorReclamo = ''
    try {
      await reclamarConCodigo(comercioId, codigoReclamo)
      mostrarFormReclamo = false
      showToast('¡Comercio reclamado exitosamente! Sos el dueño verificado.')
    } catch (e) {
      errorReclamo = e.message
    } finally {
      reclamando = false
    }
  }

  function showToast(msg) {
    toastMsg = msg
    setTimeout(() => toastMsg = '', 3500)
  }

  async function abrirMapaComercio() {
    if (comercio.lat && comercio.lng) {
      abrirMapa(comercio.lat, comercio.lng)
      return
    }
    const result = await geocodificarDireccion({
      direccion: comercio.direccion,
      localidad: '',
      provincia: '',
    }).catch(() => null)
    if (result) {
      abrirMapa(result.lat, result.lng)
    } else {
      abrirMapa(null, null, comercio.nombre + ' ' + comercio.direccion)
    }
  }

  function volver()     { currentPage.set('buscar') }
  function verPrecios() { currentPage.set('precios-comercio:' + comercioId) }
</script>

<div class="app-shell detalle-shell">

  {#if toastMsg}
    <div class="toast" role="status">{toastMsg}</div>
  {/if}

  <header class="detalle-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <h1 class="detalle-titulo">Detalle del comercio</h1>
  </header>

  <main class="detalle-main">

    {#if cargando}
      <div class="skeleton-hero"></div>
      <div class="skeleton-section"></div>

    {:else if error}
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p class="empty-title">{error}</p>
        <button class="btn btn-primary" on:click={volver}>Volver</button>
      </div>

    {:else if comercio}

      <!-- Hero -->
      <div class="hero-card">
        <div class="hero-emoji">{tipoInfo.emoji}</div>
        <div class="hero-info">
          <div class="hero-nombre-row">
            <h2 class="hero-nombre">{comercio.nombre}</h2>
            {#if comercio.estado === 'verificado'}
              <span class="badge-verificado-lg" title="Verificado por la comunidad">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none">
                  <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                </svg>
                Verificado
              </span>
            {/if}
          </div>
          <p class="hero-tipo">{tipoInfo.label}</p>
          {#if distancia !== null}
            <p class="hero-dist">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--c-primary)" stroke="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              </svg>
              {formatDistancia(distancia)} de tu ubicación
            </p>
          {/if}
        </div>
      </div>

      <!-- ── Banner de verificación QR ── -->
      {#if qrEstado === 'verificando'}
        <div class="qr-banner qr-verificando">
          <div class="qr-spinner"></div>
          <span>Verificando autenticidad del cartel…</span>
        </div>

      {:else if qrEstado === 'ok'}
        <div class="qr-banner qr-ok">
          <div class="qr-icono">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </div>
          <div class="qr-texto">
            <p class="qr-titulo">✓ Cartel auténtico verificado por Canasta.co</p>
            <p class="qr-desc">Este comercio publica sus precios en la app</p>
          </div>
        </div>

      {:else if qrEstado === 'error'}
        <div class="qr-banner qr-error">
          <div class="qr-icono qr-icono-error">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div class="qr-texto">
            <p class="qr-titulo">⚠️ No se pudo verificar este cartel</p>
            <p class="qr-desc">La dirección no coincide con el comercio registrado. Si creés que es un error, contactá al administrador.</p>
          </div>
        </div>
      {/if}

      <!-- Info -->
      <div class="info-section">

        {#if comercio.direccion}
          <button class="info-row" on:click={abrirMapaComercio}>
            <div class="info-icon-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--c-primary)" stroke="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              </svg>
            </div>
            <div class="info-text">
              <span class="info-label">Dirección</span>
              <span class="info-value">{comercio.direccion}</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-light)" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        {/if}

        {#if comercio.descripcion}
          <div class="info-row no-action">
            <div class="info-icon-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="info-text">
              <span class="info-label">Descripción</span>
              <span class="info-value">{comercio.descripcion}</span>
            </div>
          </div>
        {/if}

        <!-- Estado -->
        <div class="info-row no-action">
          <div class="info-icon-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div class="info-text">
            <span class="info-label">Estado</span>
            <span class="estado-chip" style="color:{estadoInfo.color};background:{estadoInfo.bg}">
              {estadoInfo.label}
              {#if comercio.totalVerificaciones > 0}
                — {comercio.totalVerificaciones} verificación{comercio.totalVerificaciones !== 1 ? 'es' : ''}
              {/if}
            </span>
          </div>
        </div>
      </div>

      <!-- Botón: Ver precios -->
      <div class="accion-section">
        <button class="btn-precios-cta" on:click={verPrecios}>
          <span class="precios-cta-icon">🏷️</span>
          <div class="precios-cta-text">
            <span class="precios-cta-titulo">Ver precios</span>
            <span class="precios-cta-sub">Consultá y cargá precios de este comercio</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      <!-- ── Cartel PDF — solo visible para el dueño verificado ── -->
      {#if puedeCartel}
        <div class="cartel-section">
          <div class="cartel-card">
            <div class="cartel-info">
              <span class="cartel-emoji">🪧</span>
              <div>
                <p class="cartel-titulo">Cartel para tu local</p>
                <p class="cartel-desc">
                  Descargá el cartel con QR verificado para pegar en la entrada de tu comercio.
                </p>
              </div>
            </div>
            <button
              class="btn-cartel"
              on:click={handleDescargarCartel}
              disabled={generandoCartel}
            >
              {#if generandoCartel}
                <div class="mini-spinner"></div>
                Generando…
              {:else}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Descargar cartel PDF
              {/if}
            </button>
            {#if errorCartel}
              <p class="cartel-error">{errorCartel}</p>
            {/if}
            <p class="cartel-hint">
              Formato A5 apaisado · Imprimí en color · El QR permite que tus clientes verifiquen que el cartel es auténtico
            </p>
          </div>
        </div>
      {:else if esDueno && comercio?.estado !== 'verificado'}
        <!-- Dueño pero sin verificación todavía -->
        <div class="cartel-section">
          <div class="cartel-card cartel-pendiente">
            <span class="cartel-emoji">🪧</span>
            <div>
              <p class="cartel-titulo">Cartel para tu local</p>
              <p class="cartel-desc">
                Disponible cuando tu comercio esté <strong>verificado</strong> por la comunidad.
              </p>
            </div>
          </div>
        </div>
      {:else if esDueno && !comercio?.codigoPublico}
        <!-- Dueño verificado pero sin credencial generada -->
        <div class="cartel-section">
          <div class="cartel-card cartel-pendiente">
            <span class="cartel-emoji">🪧</span>
            <div>
              <p class="cartel-titulo">Cartel para tu local</p>
              <p class="cartel-desc">
                Pedile al administrador que genere tu credencial para habilitar el cartel.
              </p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Acciones: verificar y reclamar -->
      <div class="acciones-section">
        <h3 class="acciones-titulo">¿Conocés este comercio?</h3>

        {#if yaVerifique}
          <div class="verificado-msg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Ya verificaste este comercio. ¡Gracias!
          </div>
        {:else}
          <button class="btn-verificar" on:click={handleVerificar} disabled={verificando}>
            {#if verificando}
              <div class="mini-spinner"></div> Verificando…
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Confirmar que existe en esta dirección
            {/if}
          </button>
          <p class="verificar-desc">
            Al verificar confirmás que este comercio existe y está en la dirección indicada.
            Con 3 verificaciones queda confirmado automáticamente.
          </p>
        {/if}

        <!-- Reclamar si es el dueño -->
        {#if !comercio.reclamadoPor && user && !comercio.reclamoBloqueado}
          {#if !mostrarFormReclamo}
            <button class="btn-reclamar" on:click={toggleFormReclamo}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
              </svg>
              Soy el dueño — reclamar gestión
            </button>
          {:else}
            <div class="reclamo-form">
              <p class="reclamo-desc">
                Ingresá el código de 6 caracteres que figura en la credencial física entregada por el administrador.
              </p>
              <input
                class="reclamo-input"
                class:error={errorReclamo}
                type="text"
                placeholder="Ej: AB3K9P"
                bind:value={codigoReclamo}
                maxlength="8"
                autocomplete="off"
                autocapitalize="characters"
              />
              {#if errorReclamo}
                <p class="reclamo-error">{errorReclamo}</p>
              {/if}
              <div class="reclamo-btns">
                <button class="btn-reclamo-cancel" on:click={toggleFormReclamo}>Cancelar</button>
                <button class="btn-reclamo-ok" on:click={handleReclamar}
                  disabled={reclamando || !codigoReclamo.trim()}>
                  {reclamando ? 'Verificando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          {/if}

        {:else if comercio.reclamoBloqueado}
          <div class="reclamo-bloqueado">
            🔒 Este comercio está bloqueado por intentos fallidos. Contactá al administrador.
          </div>

        {:else if comercio.reclamadoPor === user?.uid}
          <div class="dueno-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            Sos el dueño verificado de este comercio
          </div>
        {/if}

      </div>

    {/if}
  </main>

  <BottomNav active="buscar" />
</div>

<style>
  .detalle-shell {
    background: var(--c-bg);
    min-height: 100dvh;
    padding-bottom: var(--nav-h);
  }

  .detalle-header {
    display: flex; align-items: center; gap: 12px;
    padding: 16px; background: white;
    border-bottom: 1px solid var(--c-border);
    position: sticky; top: 0; z-index: 10;
  }
  .btn-volver {
    background: none; border: none; cursor: pointer;
    padding: 4px; color: var(--c-text); display: flex;
  }
  .detalle-titulo {
    font-family: var(--f-brand); font-size: 1.1rem;
    color: var(--c-primary); margin: 0;
  }

  .detalle-main { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

  /* Hero */
  .hero-card {
    display: flex; align-items: flex-start; gap: 14px;
    background: white; border-radius: 16px; padding: 16px;
    border: 1.5px solid var(--c-border);
  }
  .hero-emoji {
    font-size: 2.2rem; width: 52px; height: 52px;
    display: flex; align-items: center; justify-content: center;
    background: var(--c-bg); border-radius: 12px; flex-shrink: 0;
  }
  .hero-info { flex: 1; }
  .hero-nombre-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .hero-nombre { font-size: 1.1rem; font-weight: 800; color: var(--c-text); margin: 0; }
  .badge-verificado-lg {
    display: flex; align-items: center; gap: 4px;
    background: var(--c-primary); color: white;
    font-size: 0.7rem; font-weight: 700;
    padding: 3px 8px; border-radius: 99px;
  }
  .hero-tipo  { font-size: 0.8rem; color: var(--c-text-mid); margin: 0 0 4px; }
  .hero-dist  {
    display: flex; align-items: center; gap: 4px;
    font-size: 0.78rem; color: var(--c-primary); font-weight: 600; margin: 0;
  }

  /* Info section */
  .info-section {
    background: white; border-radius: 16px;
    border: 1.5px solid var(--c-border); overflow: hidden;
  }
  .info-row {
    display: flex; align-items: center; gap: 12px;
    padding: 13px 16px; background: white; border: none;
    width: 100%; text-align: left; cursor: pointer;
    transition: background 0.15s;
    border-bottom: 1px solid var(--c-border);
  }
  .info-row:last-child  { border-bottom: none; }
  .info-row.no-action   { cursor: default; }
  .info-row:not(.no-action):active { background: var(--c-bg); }
  .info-icon-wrap {
    width: 32px; height: 32px; background: #F0FDF4;
    border-radius: 8px; display: flex; align-items: center;
    justify-content: center; flex-shrink: 0;
  }
  .info-text { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .info-label { font-size: 0.7rem; color: var(--c-text-mid); font-weight: 600; }
  .info-value { font-size: 0.88rem; color: var(--c-text); }
  .estado-chip { font-size: 0.78rem; font-weight: 700; padding: 2px 8px; border-radius: 99px; display: inline-block; }

  /* Ver precios CTA */
  .accion-section { margin: 0; }
  .btn-precios-cta {
    width: 100%; display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; background: var(--c-surface);
    border: 1.5px solid var(--c-primary); border-radius: var(--r-lg);
    cursor: pointer; text-align: left; transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-precios-cta:hover  { background: rgba(27,107,58,0.06); }
  .btn-precios-cta:active { transform: scale(0.98); }
  .precios-cta-icon  { font-size: 22px; }
  .precios-cta-text  { flex: 1; }
  .precios-cta-titulo { display: block; font-size: 15px; font-weight: 700; color: var(--c-primary); }
  .precios-cta-sub    { display: block; font-size: 12px; color: var(--c-text-light); margin-top: 1px; }

  /* ── Cartel PDF ── */
  .cartel-section { margin: 0; }
  .cartel-card {
    background: white; border: 1.5px solid var(--c-accent);
    border-radius: var(--r-lg); padding: 16px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .cartel-pendiente {
    border-color: var(--c-border); opacity: 0.75;
    flex-direction: row; align-items: center; gap: 14px;
  }
  .cartel-info { display: flex; align-items: flex-start; gap: 12px; }
  .cartel-emoji { font-size: 1.8rem; flex-shrink: 0; }
  .cartel-titulo { font-size: 0.95rem; font-weight: 700; color: var(--c-text); margin: 0 0 4px; }
  .cartel-desc   { font-size: 0.8rem; color: var(--c-text-mid); margin: 0; line-height: 1.45; }
  .btn-cartel {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 12px; background: var(--c-accent);
    border: none; border-radius: var(--r-md);
    font-family: var(--f-ui); font-size: 0.9rem; font-weight: 700;
    color: white; cursor: pointer; transition: opacity 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-cartel:disabled  { opacity: 0.65; cursor: not-allowed; }
  .btn-cartel:not(:disabled):active { transform: scale(0.97); }
  .cartel-error {
    font-size: 0.78rem; color: var(--c-error);
    background: var(--c-error-bg); border-radius: 8px;
    padding: 8px 10px; margin: 0;
  }
  .cartel-hint {
    font-size: 0.72rem; color: var(--c-text-light); margin: 0;
    line-height: 1.5; text-align: center;
  }

  /* Acciones */
  .acciones-section {
    background: white; border-radius: 16px;
    border: 1.5px solid var(--c-border); padding: 16px;
  }
  .acciones-titulo { font-size: 0.88rem; font-weight: 700; color: var(--c-text); margin: 0 0 12px; }
  .btn-verificar {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 13px; background: var(--c-primary); color: white;
    border: none; border-radius: 12px; font-size: 0.88rem; font-weight: 700;
    cursor: pointer; font-family: var(--f-ui); transition: opacity 0.15s;
  }
  .btn-verificar:disabled { opacity: 0.7; }
  .verificar-desc { font-size: 0.73rem; color: var(--c-text-mid); text-align: center; margin: 8px 0 0; }
  .verificado-msg {
    display: flex; align-items: center; gap: 8px;
    background: #F0FDF4; border: 1.5px solid #BBF7D0;
    border-radius: 12px; padding: 12px 14px;
    font-size: 0.85rem; font-weight: 600; color: var(--c-primary);
  }
  .btn-reclamar {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 7px;
    margin-top: 10px; padding: 11px; background: none;
    border: 1.5px solid var(--c-border); border-radius: 12px;
    font-size: 0.82rem; font-weight: 600; color: var(--c-text-mid);
    cursor: pointer; font-family: var(--f-ui);
  }
  .dueno-badge {
    display: flex; align-items: center; gap: 7px;
    margin-top: 10px; font-size: 0.78rem;
    color: var(--c-primary); font-weight: 600;
  }
  .reclamo-form  { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
  .reclamo-desc  { font-size: 0.78rem; color: var(--c-text-mid); margin: 0; }
  .reclamo-input {
    width: 100%; padding: 12px 14px;
    border: 1.5px solid var(--c-border); border-radius: 10px;
    font-size: 1.1rem; font-weight: 700; letter-spacing: 0.15em;
    text-align: center; text-transform: uppercase;
    font-family: var(--f-ui); outline: none; box-sizing: border-box;
  }
  .reclamo-input:focus { border-color: var(--c-primary); }
  .reclamo-input.error { border-color: var(--c-error); }
  .reclamo-error { font-size: 0.78rem; color: var(--c-error); font-weight: 600; margin: 0; }
  .reclamo-btns  { display: flex; gap: 8px; }
  .btn-reclamo-cancel {
    flex: 1; padding: 10px; border: 1.5px solid var(--c-border); border-radius: 10px;
    background: white; color: var(--c-text-mid); font-weight: 600; font-size: 0.85rem;
    cursor: pointer; font-family: var(--f-ui);
  }
  .btn-reclamo-ok {
    flex: 2; padding: 10px; border: none; border-radius: 10px;
    background: var(--c-primary); color: white; font-weight: 700;
    font-size: 0.85rem; cursor: pointer; font-family: var(--f-ui); transition: opacity 0.15s;
  }
  .btn-reclamo-ok:disabled { opacity: 0.6; }
  .reclamo-bloqueado {
    margin-top: 8px; background: #FEF2F2; border: 1px solid #FECACA;
    border-radius: 10px; padding: 10px 12px;
    font-size: 0.8rem; color: #991B1B; font-weight: 600;
  }

  /* Skeleton */
  .skeleton-hero, .skeleton-section {
    border-radius: 16px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
  }
  .skeleton-hero    { height: 90px; }
  .skeleton-section { height: 160px; }
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

  .empty-state {
    display: flex; flex-direction: column; align-items: center;
    text-align: center; padding: 48px 24px; gap: 8px;
  }
  .empty-icon  { font-size: 3rem; }
  .empty-title { font-size: 1rem; font-weight: 700; margin: 0; }

  /* ── Banner QR ── */
  .qr-banner {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 16px; border-radius: var(--r-lg);
    border: 1.5px solid transparent;
  }
  .qr-verificando {
    background: var(--c-surface-2); border-color: var(--c-border);
    color: var(--c-text-mid); font-size: 14px; font-weight: 600;
    align-items: center;
  }
  .qr-ok {
    background: #F0FDF4; border-color: #86EFAC;
  }
  .qr-error {
    background: #FEF2F2; border-color: #FECACA;
  }
  .qr-icono {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--c-primary);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .qr-icono-error { background: var(--c-error); }
  .qr-texto { flex: 1; }
  .qr-titulo {
    font-size: 14px; font-weight: 700; margin: 0 0 4px;
    color: var(--c-text);
  }
  .qr-ok .qr-titulo   { color: #166534; }
  .qr-error .qr-titulo { color: #991B1B; }
  .qr-desc {
    font-size: 12px; margin: 0; line-height: 1.45;
    color: var(--c-text-mid);
  }
  .qr-ok .qr-desc   { color: #15803D; }
  .qr-error .qr-desc { color: #B91C1C; }
  .qr-spinner {
    width: 18px; height: 18px;
    border: 2px solid var(--c-border);
    border-top-color: var(--c-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  /* Mini spinner */
  .mini-spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Toast */
  .toast {
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: var(--c-text); color: white; font-size: 0.82rem; font-weight: 600;
    padding: 10px 20px; border-radius: 99px; white-space: nowrap;
    box-shadow: var(--s-md); z-index: 999; animation: toastIn 0.2s ease;
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>