<script>
  import { onMount } from 'svelte'
  import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
  import { db } from '../lib/firebase.js'
  import { currentPage } from '../stores/auth.js'
  import { verificarTokenCartel } from '../lib/cartel.js'

  export let comercioId = ''
  export let qrDir      = ''
  export let qrToken    = ''

  // ── Estado ────────────────────────────────────────────────────────────────
  let cargando  = true
  let comercio  = null
  let error     = null

  // Verificación del token QR
  // null = no viene de QR | 'verificando' | 'ok' | 'error'
  let tokenEstado = null

  // Último precio cargado (para mostrar actividad reciente)
  let ultimoPrecio    = null
  let totalPrecios    = 0

  onMount(async () => {
    try {
      // ── Cargar comercio desde Firestore (sin auth — read: true) ────────────
      const snap = await getDoc(doc(db, 'comercios', comercioId))
      if (!snap.exists()) {
        error = 'Comercio no encontrado.'
        cargando = false
        return
      }
      comercio = { id: snap.id, ...snap.data() }

      // ── Verificar token del QR ─────────────────────────────────────────────
      // El token es la capa técnica; el mensaje al usuario es comparar direcciones.
      if (qrDir && qrToken) {
        tokenEstado = 'verificando'
        try {
          const ok = await verificarTokenCartel(
            comercio.id,
            decodeURIComponent(qrDir),
            comercio.codigoPublico || '',
            qrToken
          )
          tokenEstado = ok ? 'ok' : 'error'
        } catch {
          tokenEstado = 'error'
        }
      }

      // ── Cargar cantidad y último precio ───────────────────────────────────
      try {
        const qPrecios = query(
          collection(db, 'precios'),
          where('comercioId', '==', comercioId),
          where('activo', '==', true),
          orderBy('creadoEn', 'desc'),
          limit(1)
        )
        const snapPrecios = await getDocs(qPrecios)
        totalPrecios = snapPrecios.size
        if (!snapPrecios.empty) {
          ultimoPrecio = snapPrecios.docs[0].data()
        }
      } catch { /* precios son opcionales para esta vista */ }

    } catch (e) {
      error = 'No se pudieron cargar los datos. Verificá tu conexión.'
    } finally {
      cargando = false
    }
  })

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatTiempoAtras(ts) {
    if (!ts) return null
    const d   = ts.toDate ? ts.toDate() : new Date(ts)
    const min = Math.floor((Date.now() - d.getTime()) / 60000)
    if (min < 60)   return `hace ${min} minuto${min !== 1 ? 's' : ''}`
    const hs = Math.floor(min / 60)
    if (hs < 24)    return `hace ${hs} hora${hs !== 1 ? 's' : ''}`
    const dias = Math.floor(hs / 24)
    if (dias < 30)  return `hace ${dias} día${dias !== 1 ? 's' : ''}`
    return null
  }

  $: tiempoUltimoPrecio = ultimoPrecio ? formatTiempoAtras(ultimoPrecio.creadoEn) : null

  function irALaApp() {
    // Si ya tiene la app instalada navega internamente,
    // si no la tiene la lleva al home de canasta.co
    currentPage.set('buscar')
  }
</script>

<div class="publico-shell">

  <!-- Header mínimo -->
  <header class="pub-header">
    <div class="pub-brand">
      <svg width="28" height="28" viewBox="0 0 52 52" fill="none">
        <rect width="52" height="52" rx="14" fill="white" fill-opacity="0.2"/>
        <path d="M14 32 C16 20, 40 20, 42 32" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <path d="M10 32 L46 32 L43 44 Q42 46 40 46 L16 46 Q14 46 13 44 Z" stroke="white" stroke-width="2" fill="none"/>
        <rect x="30" y="10" width="18" height="14" rx="4" fill="#F5A321"/>
        <text x="39" y="21" text-anchor="middle" font-size="9" font-weight="700" fill="white" font-family="sans-serif">$</text>
      </svg>
      <span class="pub-brand-nombre">Canasta<span class="pub-dot">.co</span></span>
    </div>
    <span class="pub-tagline">Comparador comunitario de precios</span>
  </header>

  <main class="pub-main">

    {#if cargando}
      <!-- Skeleton de carga -->
      <div class="pub-skeleton">
        <div class="skel skel-titulo"></div>
        <div class="skel skel-dir"></div>
        <div class="skel skel-card"></div>
      </div>

    {:else if error}
      <div class="pub-error">
        <span class="pub-error-icon">🔍</span>
        <p class="pub-error-titulo">Comercio no encontrado</p>
        <p class="pub-error-desc">{error}</p>
      </div>

    {:else if comercio}

      <!-- Nombre y tipo del comercio -->
      <div class="pub-comercio-hero">
        <div class="pub-tipo-emoji">
          {#if comercio.tipo === 'supermercado'}🛒
          {:else if comercio.tipo === 'verduleria'}🥬
          {:else if comercio.tipo === 'carniceria'}🥩
          {:else if comercio.tipo === 'panaderia'}🍞
          {:else if comercio.tipo === 'farmacia'}💊
          {:else if comercio.tipo === 'ferreteria'}🔧
          {:else}🏪{/if}
        </div>
        <div class="pub-comercio-info">
          <h1 class="pub-nombre">{comercio.nombre}</h1>
          {#if comercio.tipo}
            <span class="pub-tipo">{comercio.tipo}</span>
          {/if}
          {#if comercio.estado === 'verificado'}
            <span class="pub-verificado-badge">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
              </svg>
              Verificado por la comunidad
            </span>
          {/if}
        </div>
      </div>

      <!-- ── Bloque central: dirección desde Firestore ── -->
      <!-- Este es el dato clave que el usuario debe comparar con el cartel físico -->
      <div class="pub-dir-card">
        <div class="pub-dir-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--c-primary)" stroke="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <span class="pub-dir-label">Dirección registrada en Canasta.co</span>
        </div>
        <p class="pub-dir-valor">{comercio.direccion || 'Sin dirección registrada'}</p>
      </div>

      <!-- ── Instrucción de verificación ── -->
      <div class="pub-instruccion">
        <p class="pub-instruccion-titulo">¿Cómo verificar este cartel?</p>
        <ol class="pub-instruccion-pasos">
          <li>Leé la dirección que aparece arriba — es la que está en nuestra base de datos.</li>
          <li>Compará con la dirección impresa en el cartel físico.</li>
          <li>Comprobá que coincide con el local donde estás parado.</li>
        </ol>
        <p class="pub-instruccion-hint">
          Si las tres coinciden, el cartel es auténtico. Un cartel falsificado no puede mostrar la dirección correcta de Firestore.
        </p>
      </div>

      <!-- ── Estado de la verificación del token QR ── -->
      {#if tokenEstado === 'verificando'}
        <div class="pub-token pub-token-checking">
          <div class="pub-token-spinner"></div>
          <span>Verificando autenticidad del cartel…</span>
        </div>

      {:else if tokenEstado === 'ok'}
        <div class="pub-token pub-token-ok">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2.5" stroke-linecap="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
          <span>Cartel generado por el sistema oficial de Canasta.co</span>
        </div>

      {:else if tokenEstado === 'error'}
        <div class="pub-token pub-token-error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#991B1B" stroke-width="2.5" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>No se pudo verificar la autenticidad del cartel. Compará la dirección manualmente.</span>
        </div>
      {/if}

      <!-- ── Info adicional: precios ── -->
      {#if tiempoUltimoPrecio}
        <div class="pub-precios-info">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Precios actualizados {tiempoUltimoPrecio}
        </div>
      {/if}

      <!-- ── CTAs ── -->
      <div class="pub-ctas">
        <button class="pub-cta-primary" on:click={irALaApp}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          Ver precios de este comercio
        </button>

        <p class="pub-cta-hint">
          Canasta.co es gratis, sin publicidad y hecho en Argentina 🇦🇷
        </p>
      </div>

    {/if}

  </main>

</div>

<style>
  .publico-shell {
    min-height: 100dvh;
    background: var(--c-bg);
    display: flex;
    flex-direction: column;
    max-width: var(--app-width);
    width: 100%;
  }

  /* ── Header ── */
  .pub-header {
    background: var(--c-primary);
    padding: 18px 20px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pub-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pub-brand-nombre {
    font-family: var(--f-brand);
    font-size: 22px;
    font-weight: 700;
    color: white;
  }
  .pub-dot      { color: var(--c-accent); }
  .pub-tagline  {
    font-size: 11px;
    color: rgba(255,255,255,0.65);
    font-weight: 500;
    letter-spacing: 0.03em;
  }

  /* ── Main ── */
  .pub-main {
    flex: 1;
    padding: 20px 16px 40px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* ── Hero comercio ── */
  .pub-comercio-hero {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    background: white;
    border: 1.5px solid var(--c-border);
    border-radius: var(--r-xl);
    padding: 16px;
  }
  .pub-tipo-emoji {
    font-size: 2rem;
    width: 48px; height: 48px;
    background: var(--c-bg);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .pub-comercio-info { flex: 1; }
  .pub-nombre {
    font-family: var(--f-brand);
    font-size: 20px;
    font-weight: 700;
    color: var(--c-text);
    margin: 0 0 4px;
    line-height: 1.2;
  }
  .pub-tipo {
    font-size: 12px;
    color: var(--c-text-mid);
    text-transform: capitalize;
    display: block;
    margin-bottom: 6px;
  }
  .pub-verificado-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--c-primary);
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 99px;
  }

  /* ── Dirección — bloque central ── */
  .pub-dir-card {
    background: white;
    border: 2px solid var(--c-primary);
    border-radius: var(--r-xl);
    padding: 16px 18px;
  }
  .pub-dir-header {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
  }
  .pub-dir-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--c-primary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .pub-dir-valor {
    font-size: 18px;
    font-weight: 700;
    color: var(--c-text);
    margin: 0;
    line-height: 1.3;
  }

  /* ── Instrucción ── */
  .pub-instruccion {
    background: rgba(27,107,58,0.06);
    border: 1px solid rgba(27,107,58,0.18);
    border-radius: var(--r-lg);
    padding: 16px;
  }
  .pub-instruccion-titulo {
    font-size: 13px;
    font-weight: 700;
    color: var(--c-primary);
    margin: 0 0 10px;
  }
  .pub-instruccion-pasos {
    margin: 0 0 10px;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pub-instruccion-pasos li {
    font-size: 13px;
    color: var(--c-text);
    line-height: 1.45;
  }
  .pub-instruccion-hint {
    font-size: 11px;
    color: var(--c-text-mid);
    margin: 0;
    line-height: 1.5;
    font-style: italic;
  }

  /* ── Token QR ── */
  .pub-token {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--r-md);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }
  .pub-token svg { flex-shrink: 0; }
  .pub-token-checking {
    background: var(--c-surface-2);
    color: var(--c-text-mid);
  }
  .pub-token-ok {
    background: #F0FDF4;
    border: 1px solid #86EFAC;
    color: #166534;
  }
  .pub-token-error {
    background: #FEF2F2;
    border: 1px solid #FECACA;
    color: #991B1B;
  }
  .pub-token-spinner {
    width: 16px; height: 16px;
    border: 2px solid var(--c-border);
    border-top-color: var(--c-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  /* ── Precios info ── */
  .pub-precios-info {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--c-text-mid);
    font-weight: 600;
    padding: 0 4px;
  }

  /* ── CTAs ── */
  .pub-ctas {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 4px;
  }
  .pub-cta-primary {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px;
    background: var(--c-primary);
    color: white;
    border: none;
    border-radius: var(--r-full);
    font-family: var(--f-ui);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(27,107,58,0.32);
    transition: opacity 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .pub-cta-primary:active { opacity: 0.85; transform: scale(0.98); }
  .pub-cta-hint {
    font-size: 11px;
    color: var(--c-text-light);
    text-align: center;
    margin: 0;
  }

  /* ── Skeleton ── */
  .pub-skeleton { display: flex; flex-direction: column; gap: 14px; }
  .skel {
    border-radius: 12px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
  }
  .skel-titulo  { height: 80px; }
  .skel-dir     { height: 72px; }
  .skel-card    { height: 120px; }
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

  /* ── Error ── */
  .pub-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 24px;
    text-align: center;
  }
  .pub-error-icon   { font-size: 3rem; }
  .pub-error-titulo { font-size: 1rem; font-weight: 700; color: var(--c-text); margin: 0; }
  .pub-error-desc   { font-size: 0.85rem; color: var(--c-text-mid); margin: 0; }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>