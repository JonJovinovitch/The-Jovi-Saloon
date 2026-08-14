/**
 * An in-app replacement for window.prompt.
 *
 * Discord runs activities inside a sandboxed iframe where native dialogs are
 * blocked, so anywhere we need a value from the player it has to come from our
 * own DOM.
 */

export interface PromptOptions {
  title: string;
  label: string;
  value?: string;
  kind?: 'text' | 'number';
  min?: number;
  confirmText?: string;
  /** Hide the cancel button for prompts that must be answered (your name). */
  required?: boolean;
}

export function textPrompt(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `
      <div class="modal">
        <h2></h2>
        <div class="field">
          <label></label>
          <input />
        </div>
        <div class="modal-actions">
          <button class="btn ghost cancel">Cancel</button>
          <button class="btn primary ok"></button>
        </div>
      </div>`;

    const modal = scrim.querySelector('.modal') as HTMLElement;
    (scrim.querySelector('h2') as HTMLElement).textContent = opts.title;
    (scrim.querySelector('label') as HTMLElement).textContent = opts.label;
    const input = scrim.querySelector('input') as HTMLInputElement;
    input.type = opts.kind ?? 'text';
    input.value = opts.value ?? '';
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.kind !== 'number') input.maxLength = 24;

    const ok = scrim.querySelector('.ok') as HTMLButtonElement;
    ok.textContent = opts.confirmText ?? 'OK';
    const cancel = scrim.querySelector('.cancel') as HTMLButtonElement;
    cancel.hidden = !!opts.required;

    const finish = (value: string | null): void => {
      scrim.remove();
      resolve(value);
    };

    ok.addEventListener('click', () => {
      const v = input.value.trim();
      if (opts.required && !v) {
        input.focus();
        modal.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 180 },
        );
        return;
      }
      finish(v);
    });
    cancel.addEventListener('click', () => finish(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ok.click();
      if (e.key === 'Escape' && !opts.required) finish(null);
    });
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim && !opts.required) finish(null);
    });

    document.body.appendChild(scrim);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  });
}
