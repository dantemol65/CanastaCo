<script>
  import { currentPage, currentUser, userProfile } from '../stores/auth.js'
  import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
  import { db } from '../lib/firebase.js'

  $: perfil = $userProfile
  $: user   = $currentUser

  let texto      = ''
  let categoria  = 'general'
  let enviando   = false
  let enviado    = false
  let error      = null

  const categorias = [
    { id: 'general',       label: 'General' },
    { id: 'funcionalidad', label: 'Nueva funcionalidad' },
    { id: 'error',         label: 'Reportar un error' },
    { id: 'contenido',     label: 'Contenido / datos' },
    { id: 'otro',          label: 'Otro' },
  ]

  async function enviar() {
    if (!texto.trim() || enviando) return
    enviando = true
    error    = null
    try {
      await addDoc(collection(db, 'sugerencias'), {
        usuarioId:    user?.uid || null,
        usuarioAlias: perfil?.alias || user?.displayName || 'Anónimo',
        localidad:    perfil?.localidad || null,
        categoria,
        texto:        texto.trim(),
        leida:        false,
        creadaEn:     serverTimestamp(),
      })
      enviado = true
    } catch (e) {
      error = 'Error al enviar. Intentá de nuevo.'
    } finally {
      enviando = false
    }
  }

  function volver() { currentPage.set('home') }
</script>

<div class="app-shell sug-shell">

  <header class="sug-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <h1 class="sug-titulo">Sugerencias</h1>
  </header>

  <main class="sug-main scroll-area">

    {#if enviado}
      <div class="enviado-state">
        <div class="enviado-icon">🎉</div>
        <p class="enviado-titulo">¡Gracias por tu sugerencia!</p>
        <p class="enviado-sub">El equipo de Mejor Precio la revisará pronto.</p>
        <button class="btn btn-primary" on:click={volver}>Volver al inicio</button>
      </div>

    {:else}
      <p class="sug-intro">
        ¿Tenés una idea para mejorar la app, encontraste un error o querés que agreguemos algo?
        Contanos acá — leemos todas las sugerencias.
      </p>

      <div class="form-group">
        <label class="form-label">Categoría</label>
        <div class="cat-chips">
          {#each categorias as cat}
            <button
              class="cat-chip"
              class:active={categoria === cat.id}
              on:click={() => categoria = cat.id}
            >
              {cat.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="sug-texto">Tu sugerencia</label>
        <textarea
          id="sug-texto"
          class="sug-textarea"
          placeholder="Describí tu idea o problema con el mayor detalle posible…"
          bind:value={texto}
          maxlength="1000"
          rows="6"
        ></textarea>
        <span class="char-count">{texto.length}/1000</span>
      </div>

      {#if error}
        <p class="sug-error">{error}</p>
      {/if}

      <button
        class="btn btn-primary btn-full"
        on:click={enviar}
        disabled={!texto.trim() || enviando}
      >
        {enviando ? 'Enviando…' : '📤 Enviar sugerencia'}
      </button>

      <div style="height: 24px"></div>
    {/if}

  </main>
</div>

<style>
  .sug-shell { min-height: 100dvh; display: flex; flex-direction: column; }

  .sug-header {
    position: sticky; top: 0; z-index: 50;
    background: var(--c-surface); border-bottom: 1px solid var(--c-border);
    padding: 14px 16px; display: flex; align-items: center; gap: 12px;
  }
  .btn-volver {
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: var(--c-surface-2);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; color: var(--c-text);
  }
  .sug-titulo { font-family: var(--f-brand); font-size: 20px; }

  .sug-main   { flex: 1; padding: 20px 16px; }
  .sug-intro  { font-size: 14px; color: var(--c-text-light); line-height: 1.6; margin-bottom: 24px; }

  .form-group  { margin-bottom: 20px; }
  .form-label  { display: block; font-size: 13px; font-weight: 700; color: var(--c-text-mid); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }

  .cat-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .cat-chip {
    padding: 7px 14px; border-radius: var(--r-full);
    border: 1.5px solid var(--c-border); background: var(--c-surface);
    font-size: 13px; font-weight: 600; color: var(--c-text-mid);
    cursor: pointer; font-family: var(--f-ui); transition: all 0.15s;
  }
  .cat-chip.active {
    background: var(--c-primary); border-color: var(--c-primary); color: white;
  }

  .sug-textarea {
    width: 100%; padding: 12px 14px; font-size: 14px; line-height: 1.6;
    border: 1.5px solid var(--c-border); border-radius: var(--r-lg);
    background: var(--c-surface); color: var(--c-text);
    font-family: var(--f-ui); resize: vertical; min-height: 140px;
    box-sizing: border-box;
  }
  .sug-textarea:focus { outline: none; border-color: var(--c-primary); }
  .char-count { display: block; text-align: right; font-size: 11px; color: var(--c-text-light); margin-top: 4px; }

  .sug-error { color: var(--c-error); font-size: 13px; margin-bottom: 12px; }

  /* Enviado */
  .enviado-state { text-align: center; padding: 60px 24px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .enviado-icon  { font-size: 56px; }
  .enviado-titulo { font-family: var(--f-brand); font-size: 22px; color: var(--c-text); }
  .enviado-sub    { font-size: 14px; color: var(--c-text-light); }
</style>