<script>
  import { createEventDispatcher } from 'svelte'
  import { soportaVoz, escucharFrase } from '../lib/voz.js'
  import { parsearVoz } from '../lib/parsearVoz.js'

  // Eventos:
  //   on:resultado → DatosVoz { producto, marca, unidad, precio, esOferta }
  //   on:error     → string (mensaje de error)
  //   on:transcripcion → string (texto crudo mientras habla, para mostrar live)
  const dispatch = createEventDispatcher()

  // 'idle' | 'escuchando' | 'procesando' | 'listo' | 'error'
  let estado       = 'idle'
  let transcripcion = ''
  let errorMsg      = ''
  let mostrarTooltip = false

  $: disponible = soportaVoz()

  async function activar() {
    if (estado !== 'idle' && estado !== 'error' && estado !== 'listo') return

    transcripcion = ''
    errorMsg      = ''
    estado        = 'escuchando'

    let textoRaw = ''
    try {
      textoRaw = await escucharFrase({
        onInterim: (t) => {
          transcripcion = t
          dispatch('transcripcion', t)
        },
        timeout: 9000,
      })
    } catch (err) {
      estado   = 'error'
      errorMsg = err.message
      dispatch('error', err.message)
      setTimeout(() => { if (estado === 'error') estado = 'idle' }, 3000)
      return
    }

    transcripcion = textoRaw
    estado = 'procesando'

    try {
      const datos = await parsearVoz(textoRaw)
      estado = 'listo'
      dispatch('resultado', { ...datos, textoRaw })
      // Volver a idle después de un momento
      setTimeout(() => { estado = 'idle'; transcripcion = '' }, 2500)
    } catch (err) {
      estado   = 'error'
      errorMsg = err.message
      dispatch('error', err.message)
      setTimeout(() => { if (estado === 'error') estado = 'idle' }, 3000)
    }
  }
</script>

{#if disponible}
  <button
    class="btn-voz"
    class:escuchando={estado === 'escuchando'}
    class:procesando={estado === 'procesando'}
    class:listo={estado === 'listo'}
    class:con-error={estado === 'error'}
    on:click={activar}
    disabled={estado === 'escuchando' || estado === 'procesando'}
    aria-label={
      estado === 'escuchando'  ? 'Escuchando…' :
      estado === 'procesando'  ? 'Procesando…' :
      'Dictar producto y precio'
    }
    title="Dictar producto y precio"
  >
    <!-- Ícono dinámico según estado -->
    {#if estado === 'idle' || estado === 'listo'}
      <!-- Micrófono -->
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8"  y1="23" x2="16" y2="23"/>
      </svg>

    {:else if estado === 'escuchando'}
      <!-- Ondas animadas -->
      <span class="ondas-wrap" aria-hidden="true">
        <span class="onda"></span>
        <span class="onda"></span>
        <span class="onda"></span>
      </span>

    {:else if estado === 'procesando'}
      <!-- Spinner -->
      <span class="voz-spinner" aria-hidden="true"></span>

    {:else if estado === 'error'}
      <!-- X -->
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6"  y1="6" x2="18" y2="18"/>
      </svg>
    {/if}

  </button>

  <!-- Feedback inline: transcripción o error -->
  {#if transcripcion && estado === 'escuchando'}
    <div class="voz-feedback escuchando-feedback" role="status" aria-live="polite">
      <span class="pulso-dot"></span>
      {transcripcion}…
    </div>
  {:else if estado === 'procesando'}
    <div class="voz-feedback procesando-feedback" role="status">
      <span class="voz-spinner-sm"></span>
      Interpretando…
    </div>
  {:else if estado === 'error' && errorMsg}
    <div class="voz-feedback error-feedback" role="alert">
      {errorMsg}
    </div>
  {:else if estado === 'listo'}
    <div class="voz-feedback listo-feedback" role="status">
      ✓ Datos completados
    </div>
  {/if}
{:else}
  <!-- Dispositivo sin soporte de reconocimiento de voz -->
  <button
    class="btn-voz btn-voz-no-soportado"
    disabled
    title="Tu navegador no soporta reconocimiento de voz. Usá Chrome en Android."
    aria-label="Reconocimiento de voz no disponible"
    on:click={() => mostrarTooltip = !mostrarTooltip}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke-dasharray="4 2"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8"  y1="23" x2="16" y2="23"/>
      <line x1="2"  y1="2"  x2="22" y2="22" stroke-width="2"/>
    </svg>
  </button>
  {#if mostrarTooltip}
    <div class="voz-feedback no-soportado-feedback" role="alert">
      🎤 Tu navegador no soporta reconocimiento de voz. Usá Chrome en Android o Safari en iOS 17+.
    </div>
  {/if}
{/if}

<style>
  .btn-voz {
    width: 46px; height: 46px; border-radius: 50%;
    border: 2px solid var(--c-border);
    background: var(--c-surface);
    color: var(--c-text-mid);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0;
    transition: all 0.2s;
    -webkit-tap-highlight-color: transparent;
    position: relative; overflow: hidden;
  }
  .btn-voz:hover:not(:disabled)  { border-color: var(--c-primary); color: var(--c-primary); }
  .btn-voz:active:not(:disabled) { transform: scale(0.94); }
  .btn-voz:disabled { cursor: default; }

  /* Estado escuchando: anillo rojo pulsante */
  .btn-voz.escuchando {
    border-color: #DC2626;
    background: #FEE2E2;
    color: #DC2626;
    animation: ringPulse 1.2s ease-in-out infinite;
  }
  @keyframes ringPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); }
    50%      { box-shadow: 0 0 0 8px rgba(220,38,38,0); }
  }

  /* Estado procesando */
  .btn-voz.procesando {
    border-color: var(--c-primary);
    background: rgba(27,107,58,0.06);
    color: var(--c-primary);
  }

  /* Estado listo */
  .btn-voz.listo {
    border-color: #059669;
    background: #D1FAE5;
    color: #059669;
  }

  /* Estado error */
  .btn-voz.con-error {
    border-color: #DC2626;
    background: #FEE2E2;
    color: #DC2626;
  }

  /* Ondas de audio */
  .ondas-wrap {
    display: flex; align-items: center; gap: 3px; height: 18px;
  }
  .onda {
    display: block; width: 3px; border-radius: 2px;
    background: currentColor;
    animation: ondaAnim 0.8s ease-in-out infinite;
  }
  .onda:nth-child(1) { animation-delay: 0s;    height: 8px; }
  .onda:nth-child(2) { animation-delay: 0.15s; height: 14px; }
  .onda:nth-child(3) { animation-delay: 0.3s;  height: 6px; }
  @keyframes ondaAnim {
    0%,100% { transform: scaleY(1); }
    50%     { transform: scaleY(0.3); }
  }

  /* Spinner */
  .voz-spinner {
    display: block; width: 16px; height: 16px;
    border: 2px solid rgba(27,107,58,0.25);
    border-top-color: var(--c-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Feedback */
  .voz-feedback {
    margin-top: 8px; padding: 8px 12px;
    border-radius: var(--r-md); font-size: 13px;
    display: flex; align-items: center; gap: 8px;
    line-height: 1.3; font-style: italic;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }

  .escuchando-feedback {
    background: #FEE2E2; color: #DC2626; font-style: normal;
    border: 1px solid rgba(220,38,38,0.2);
  }
  .procesando-feedback {
    background: rgba(27,107,58,0.06); color: var(--c-primary);
    border: 1px solid rgba(27,107,58,0.15);
  }
  .listo-feedback {
    background: #D1FAE5; color: #059669; font-style: normal;
    font-weight: 700; border: 1px solid rgba(5,150,105,0.2);
  }
  .error-feedback {
    background: #FEE2E2; color: #DC2626; font-style: normal;
    border: 1px solid rgba(220,38,38,0.2);
  }

  /* Punto pulsante */
  .pulso-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #DC2626; flex-shrink: 0;
    animation: pulsoAnim 1s ease-in-out infinite;
  }
  @keyframes pulsoAnim {
    0%,100% { opacity: 1; transform: scale(1); }
    50%     { opacity: 0.4; transform: scale(0.7); }
  }

  /* Botón no soportado */
  .btn-voz-no-soportado {
    opacity: 0.4;
    cursor: not-allowed !important;
    border-style: dashed;
  }
  .no-soportado-feedback {
    background: var(--c-surface-2);
    color: var(--c-text-mid);
    border: 1px solid var(--c-border);
    font-style: normal;
    font-size: 12px;
    line-height: 1.5;
  }

  /* Spinner pequeño inline */
  .voz-spinner-sm {
    display: inline-block; width: 12px; height: 12px;
    border: 2px solid rgba(27,107,58,0.2);
    border-top-color: var(--c-primary);
    border-radius: 50%; flex-shrink: 0;
    animation: spin 0.7s linear infinite;
  }
</style>