/**
 * SPENDMINDAI - COOKIE CONSENT & PRIVACY PREFERENCES MODULE
 * Streamlined with Ponytail: Native platform, zero inline CSS strings, DRY Apple HIG styling
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'spendmind_cookie_consent';

    function getConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function saveConsent(analytics = true) {
        const payload = {
            essential: true,
            functional: true,
            analytics: analytics,
            version: '1.0',
            timestamp: new Date().toISOString()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) { }

        window.dispatchEvent(new CustomEvent('spendmind:cookie-consent-updated', { detail: payload }));
        dismissBanner();
    }

    function dismissBanner() {
        const banner = document.getElementById('spendmind-cookie-banner');
        if (banner) {
            banner.classList.remove('show');
            setTimeout(() => banner.remove(), 350);
        }
    }

    function renderBanner() {
        if (document.getElementById('spendmind-cookie-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'spendmind-cookie-banner';
        banner.className = 'spendmind-cookie-banner';
        banner.innerHTML = `
            <div class="cookie-banner-content">
                <div class="cookie-banner-header">
                    <div class="cookie-banner-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/></svg>
                    </div>
                    <div>
                        <h4 class="cookie-banner-title">Quyền riêng tư & Cookie</h4>
                        <p class="cookie-banner-text">SpendMindAI sử dụng cookie để ghi nhớ phiên đăng nhập, giao diện và tối ưu trải nghiệm của bạn.</p>
                    </div>
                </div>
                <div class="cookie-banner-actions">
                    <button type="button" class="btn-cookie-essential" id="btn-cookie-reject">Chỉ bắt buộc</button>
                    <button type="button" class="btn-cookie-accept" id="btn-cookie-accept">Chấp nhận tất cả</button>
                </div>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('btn-cookie-accept').addEventListener('click', () => saveConsent(true));
        document.getElementById('btn-cookie-reject').addEventListener('click', () => saveConsent(false));

        requestAnimationFrame(() => {
            setTimeout(() => banner.classList.add('show'), 300);
        });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        const consent = getConsent();
        if (consent) {
            window.dispatchEvent(new CustomEvent('spendmind:cookie-consent-updated', { detail: consent }));
        } else {
            renderBanner();
        }
    }

    window.openSpendMindCookiePreferences = function () {
        renderBanner();
    };
})();
