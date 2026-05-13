/**
 * Quiz Mais Saúde — Consent flow.
 *
 * Public API:
 *   ensureConsent(pin, supabaseClient) → resolves to consent record or null (user refused)
 *   getConsentStatus(pin, supabaseClient) → resolves to current active consent or null
 *   withdrawConsent(pin, supabaseClient) → withdraws and erases server-side data
 *
 * Bump CONSENT_VERSION whenever the text changes — users will be re-prompted.
 */

export const CONSENT_VERSION = 'v1-2026-05';

const CONSENT_TEXT_PT_PT = {
  version: CONSENT_VERSION,
  title: 'Antes de continuar, precisamos da sua autorização',
  intro: 'A sua privacidade é importante para nós. Para usar o Quiz Mais Saúde, peça-se-lhe que aceite alguns pontos:',
  purposes: [
    {
      key: 'quiz',
      label: 'Para participar no quiz',
      description: 'As suas respostas e pontuações serão guardadas no nosso sistema, associadas apenas ao código que recebeu — nunca ao seu nome.',
      required: true,
    },
    {
      key: 'rewards',
      label: 'Para receber recompensas',
      description: 'Quando atingir os níveis, poderá ser-lhe atribuída uma recompensa, visível no seu perfil.',
      required: false,
    },
  ],
  reassurance: 'Os dados sobre os seus medicamentos e as suas medições (tensão, glicemia) ficam apenas no seu telemóvel, encriptados — nem o sistema do programa pode aceder a eles.',
  changeMind: 'Pode mudar de ideias a qualquer momento, no seu perfil.',
  buttonAccept: 'Aceitar e continuar',
  buttonRefuse: 'Não aceito (sair)',
};

/**
 * Ensure the user has given (or refused) consent before allowing them to use the app.
 * If consent already exists for the current version, returns it.
 * If not, shows the modal and waits for user response.
 *
 * @param {string} pin
 * @param {SupabaseClient} supabase
 * @returns {Promise<object|null>} consent record, or null if user refused
 */
export async function ensureConsent(pin, supabase) {
  // Step 1: check server for existing consent
  const existing = await getConsentStatus(pin, supabase);
  if (existing && existing.consent_version === CONSENT_VERSION) {
    return existing;
  }

  // Step 2: show modal, wait for choice
  const choice = await showConsentModal();
  if (!choice) {
    return null;                     // user refused
  }

  // Step 3: record on server
  const userAgent = navigator.userAgent || '';
  try {
    const { data, error } = await supabase.rpc('record_consent', {
      p_pin: pin,
      p_version: CONSENT_VERSION,
      p_purposes: choice,
      p_user_agent: userAgent.slice(0, 500),
      p_language: 'pt-PT',
    });
    if (error) throw error;
    return {
      consent_version: CONSENT_VERSION,
      purposes: choice,
      granted_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Failed to record consent:', err);
    // Server recording failed — block the user to be safe
    throw new Error('Não foi possível registar o seu consentimento. Tente novamente.');
  }
}

/**
 * Read the current active consent for the given user.
 * @returns {Promise<object|null>}
 */
export async function getConsentStatus(pin, supabase) {
  const { data, error } = await supabase.rpc('get_active_consent', { p_pin: pin });
  if (error) {
    console.error('Failed to fetch consent status:', error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0];
}

/**
 * Withdraw consent and erase server-side data linked to this user.
 * Returns Promise<boolean> — true if successful.
 */
export async function withdrawConsent(pin, supabase) {
  const { error } = await supabase.rpc('withdraw_consent_and_erase', { p_pin: pin });
  if (error) {
    console.error('Failed to withdraw consent:', error);
    return false;
  }
  return true;
}

// ============================================================
// Modal — shows the consent UI and returns the user's choice
// ============================================================

function showConsentModal() {
  return new Promise((resolve) => {
    // Build modal
    const overlay = document.createElement('div');
    overlay.className = 'consent-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'consent-title');
    overlay.setAttribute('aria-describedby', 'consent-intro');

    const T = CONSENT_TEXT_PT_PT;

    const purposesHtml = T.purposes.map((p, i) => `
      <fieldset class="consent-purpose">
        <legend>
          <input type="checkbox"
                 id="consent-purpose-${p.key}"
                 ${p.required ? 'checked disabled' : 'checked'}
                 data-purpose="${p.key}" />
          <label for="consent-purpose-${p.key}">
            <strong>${p.label}</strong>
            ${p.required ? ' <span class="consent-required">(necessário)</span>' : ''}
          </label>
        </legend>
        <p>${p.description}</p>
      </fieldset>
    `).join('');

    overlay.innerHTML = `
      <div class="consent-modal" tabindex="-1">
        <h2 id="consent-title">${T.title}</h2>
        <p id="consent-intro">${T.intro}</p>
        ${purposesHtml}
        <p class="consent-reassurance">${T.reassurance}</p>
        <p class="consent-change-mind">${T.changeMind}</p>
        <div class="consent-buttons">
          <button type="button" class="consent-btn consent-btn-accept">${T.buttonAccept}</button>
          <button type="button" class="consent-btn consent-btn-refuse">${T.buttonRefuse}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('consent-open');

    // Focus the modal for accessibility
    const modalEl = overlay.querySelector('.consent-modal');
    setTimeout(() => modalEl.focus(), 50);

    // Trap focus inside the modal (basic)
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // ESC = refuse
        finish(null);
      }
    });

    // Wire up the buttons
    overlay.querySelector('.consent-btn-accept').addEventListener('click', () => {
      const choice = {};
      overlay.querySelectorAll('input[data-purpose]').forEach((input) => {
        choice[input.dataset.purpose] = input.checked;
      });
      finish(choice);
    });

    overlay.querySelector('.consent-btn-refuse').addEventListener('click', () => {
      finish(null);
    });

    function finish(result) {
      document.body.classList.remove('consent-open');
      overlay.remove();
      resolve(result);
    }
  });
}
