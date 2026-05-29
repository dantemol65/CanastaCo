<script>
  import { currentPage } from '../stores/auth.js'

  export let comercioId = ''
  export let qrDir      = ''
  export let qrToken    = ''

  function irALaApp() { currentPage.set('buscar') }
</script>

<div class="publico-shell">

  <header class="pub-header">
    <span class="pub-brand-nombre">Canasta<span class="pub-dot">.co</span></span>
    <span class="pub-tagline">Comparador comunitario de precios</span>
  </header>

  <main class="pub-main">

    <div class="pub-comercio-hero">
      <div class="pub-tipo-emoji">🏪</div>
      <div class="pub-comercio-info">
        <h1 class="pub-nombre">Verificación de cartel</h1>
        <span class="pub-tipo">ID: {comercioId || '—'}</span>
      </div>
    </div>

    <div class="pub-dir-card">
      <span class="pub-dir-label">Dirección en el QR</span>
      <p class="pub-dir-valor">{qrDir ? decodeURIComponent(qrDir) : 'Sin dirección'}</p>
    </div>

    <div class="pub-instruccion">
      <p class="pub-instruccion-titulo">¿Cómo verificar este cartel?</p>
      <ol class="pub-instruccion-pasos">
        <li>Leé la dirección que aparece arriba.</li>
        <li>Compará con la dirección impresa en el cartel físico.</li>
        <li>Comprobá que coincide con el local donde estás parado.</li>
      </ol>
    </div>

    <div class="pub-ctas">
      <button class="pub-cta-primary" on:click={irALaApp}>
        Ver precios de este comercio
      </button>
      <p class="pub-cta-hint">Canasta.co · Gratis · Sin publicidad · 🇦🇷</p>
    </div>

  </main>
</div>

<style>
  .publico-shell {
    min-height: 100dvh; background: var(--c-bg);
    display: flex; flex-direction: column;
    max-width: var(--app-width); width: 100%;
  }
  .pub-header {
    background: var(--c-primary); padding: 18px 20px 14px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .pub-brand-nombre { font-family: var(--f-brand); font-size: 22px; font-weight: 700; color: white; }
  .pub-dot     { color: var(--c-accent); }
  .pub-tagline { font-size: 11px; color: rgba(255,255,255,0.65); }

  .pub-main {
    flex: 1; padding: 20px 16px 40px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .pub-comercio-hero {
    display: flex; align-items: center; gap: 14px;
    background: white; border: 1.5px solid var(--c-border);
    border-radius: var(--r-xl); padding: 16px;
  }
  .pub-tipo-emoji { font-size: 2rem; }
  .pub-comercio-info { flex: 1; }
  .pub-nombre { font-family: var(--f-brand); font-size: 20px; font-weight: 700; color: var(--c-text); margin: 0 0 4px; }
  .pub-tipo   { font-size: 12px; color: var(--c-text-mid); }

  .pub-dir-card {
    background: white; border: 2px solid var(--c-primary);
    border-radius: var(--r-xl); padding: 16px 18px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .pub-dir-label { font-size: 11px; font-weight: 700; color: var(--c-primary); text-transform: uppercase; letter-spacing: 0.06em; }
  .pub-dir-valor { font-size: 18px; font-weight: 700; color: var(--c-text); margin: 0; line-height: 1.3; }

  .pub-instruccion {
    background: rgba(27,107,58,0.06); border: 1px solid rgba(27,107,58,0.18);
    border-radius: var(--r-lg); padding: 16px;
  }
  .pub-instruccion-titulo { font-size: 13px; font-weight: 700; color: var(--c-primary); margin: 0 0 10px; }
  .pub-instruccion-pasos  { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
  .pub-instruccion-pasos li { font-size: 13px; color: var(--c-text); line-height: 1.45; }

  .pub-ctas { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
  .pub-cta-primary {
    width: 100%; padding: 16px; background: var(--c-primary); color: white;
    border: none; border-radius: var(--r-full); font-family: var(--f-ui);
    font-size: 15px; font-weight: 700; cursor: pointer;
    box-shadow: 0 4px 14px rgba(27,107,58,0.32);
  }
  .pub-cta-primary:active { opacity: 0.85; }
  .pub-cta-hint { font-size: 11px; color: var(--c-text-light); text-align: center; margin: 0; }
</style>