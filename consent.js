/* ============================================================
   Quiz Mais Saúde — Consent flow.
   
   Funções:
     QMSConsent.ensureConsent(pin, sb)  → record (ou null se recusou)
     QMSConsent.getConsentStatus(pin, sb) → record actual ou null
     QMSConsent.withdrawConsent(pin, sb) → apaga dados servidor
     QMSConsent.CONSENT_VERSION → string
   
   Subir a versão quando o texto mudar — utilizadores serão re-prompted.
   ============================================================ */

(function () {
  'use strict';

  const CONSENT_VERSION = 'v1-2026-05';

  const TEXT = {
    version: CONSENT_VERSION,
    title: 'Antes de continuar',
    intro: 'A sua privacidade é importante. Para usar o Quiz Mais Saúde, precisamos da sua autorização para alguns pontos:',
    purposes: [
      {
        key: 'quiz',
        label: 'Participar no quiz',
        description: 'As suas respostas e pontuações serão guardadas no nosso sistema, associadas apenas ao código que recebeu — nunca ao seu nome.',
        required: true,
      },
      {
        key: 'rewards',
        label: 'Receber recompensas',
        description: 'Quando atingir os níveis, podem ser-lhe atribuídas recompensas, visíveis no seu perfil.',
        required: false,
      },
    ],
    reassurance: 'Os dados sobre os seus medicamentos e medições (tensão, glicemia) ficam apenas no seu telemóvel, encriptados — nem o sistema do programa pode aceder a eles.',
    changeMind: 'Pode mudar de ideias a qualquer momento, no seu perfil.',
    buttonAccept: 'Aceitar e continuar',
    buttonRefuse: 'Não aceito',
  };

  async function ensureConsent(pin, sb) {
    const existing = await getConsentStatus(pin, sb);
    if (existing && existing.consent_version === CONSENT_VERSION) {
      return existing;
    }

    const choice = await showConsentModal();
    if (!choice) return null;

    try {
      const { error } = await sb.rpc('record_consent', {
        p_pin: pin,
        p_version: CONSENT_VERSION,
        p_purposes: choice,
        p_user_agent: (navigator.userAgent || '').slice(0, 500),
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
      throw new Error('Não foi possível registar o consentimento. Tente novamente.');
    }
  }

  async function getConsentStatus(pin, sb) {
    try {
      const { data, error } = await sb.rpc('get_active_consent', { p_pin: pin });
      if (error) {
        console.error('Failed to fetch consent status:', error);
        return null;
      }
      if (!data || data.length === 0) return null;
      return data[0];
    } catch (err) {
      console.error('Consent status error:', err);
      return null;
    }
  }

  async function withdrawConsent(pin, sb) {
    try {
      const { error } = await sb.rpc('withdraw_consent_and_erase', { p_pin: pin });
      if (error) {
        console.error('Failed to withdraw consent:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Withdraw consent error:', err);
      return false;
    }
  }

  function showConsentModal() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'consent-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'consent-title');

      const purposesHtml = TEXT.purposes.map((p) => `
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
          <h2 id="consent-title">${TEXT.title}</h2>
          <p id="consent-intro">${TEXT.intro}</p>
          ${purposesHtml}
          <p class="consent-reassurance">${TEXT.reassurance}</p>
          <p class="consent-change-mind">${TEXT.changeMind}</p>
          <div class="consent-buttons">
            <button type="button" class="consent-btn consent-btn-accept">${TEXT.buttonAccept}</button>
            <button type="button" class="consent-btn consent-btn-refuse">${TEXT.buttonRefuse}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      document.body.classList.add('consent-open');

      const modalEl = overlay.querySelector('.consent-modal');
      setTimeout(() => modalEl.focus(), 50);

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') finish(null);
      });

      overlay.querySelector('.consent-btn-accept').addEventListener('click', () => {
        const choice = {};
        overlay.querySelectorAll('input[data-purpose]').forEach((input) => {
          choice[input.dataset.purpose] = input.checked;
        });
        finish(choice);
      });

      overlay.querySelector('.consent-btn-refuse').addEventListener('click', () => finish(null));

      function finish(result) {
        document.body.classList.remove('consent-open');
        overlay.remove();
        resolve(result);
      }
    });
  }

  window.QMSConsent = {
    CONSENT_VERSION,
    ensureConsent,
    getConsentStatus,
    withdrawConsent,
  };
})();
