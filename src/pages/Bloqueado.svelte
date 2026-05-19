<script>
  import { currentPage } from '../stores/auth.js'
  import { signOut } from '../stores/auth.js'
</script>

<div class="blocked-shell">
  <div class="blocked-card">
    <div class="blocked-icon">🚫</div>
    <h1 class="blocked-title">Cuenta bloqueada</h1>
    <p class="blocked-msg">
      Tu cuenta ha sido bloqueada por el administrador del sistema.
      Si creés que es un error, contactá al soporte.
    </p>
    <button class="btn-salir" on:click={signOut}>
      Cerrar sesión
    </button>
  </div>
</div>

<style>
  .blocked-shell {
    min-height: 100dvh;
    display: flex; align-items: center; justify-content: center;
    background: var(--c-surface-2); padding: 24px;
  }
  .blocked-card {
    background: var(--c-surface); border-radius: var(--r-xl);
    border: 1px solid var(--c-border); padding: 40px 28px;
    text-align: center; max-width: 340px; width: 100%;
    box-shadow: var(--s-lg);
    display: flex; flex-direction: column; align-items: center; gap: 16px;
  }
  .blocked-icon  { font-size: 56px; }
  .blocked-title { font-family: var(--f-brand); font-size: 24px; color: var(--c-text); }
  .blocked-msg   { font-size: 14px; color: var(--c-text-light); line-height: 1.6; }
  .btn-salir {
    margin-top: 8px; padding: 12px 32px;
    background: var(--c-error); color: white; border: none;
    border-radius: var(--r-full); font-size: 15px; font-weight: 700;
    cursor: pointer; font-family: var(--f-ui);
  }
</style>