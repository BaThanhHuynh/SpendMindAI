/**
 * ==============================================================================
 * SPENDMINDAI - COOKIE CONSENT & PRIVACY PREFERENCES MODULE (SELF-CONTAINED)
 * ==============================================================================
 * Self-contained zero-dependency privacy consent widget.
 * Injects its own scoped stylesheet into <head> to guarantee immediate,
 * pixel-perfect rendering and interaction resilience under any CDN/cache state.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'spendmind_cookie_consent';
    const CONSENT_VERSION = '1.0';

    const DEFAULT_CONSENT = {
        essential: true,    // Security, Session, CSRF (always enabled)
        functional: true,   // UI Themes, quick accounts, filters
        analytics: false,   // Anonymous performance & error diagnostics
        version: CONSENT_VERSION,
        timestamp: new Date().toISOString()
    };

    // Self-contained, bulletproof CSS injected directly into <head>
    const COOKIE_STYLES = `
/* SpendMindAI Cookie Consent & Preferences - Embedded Scope */
.spendmind-cookie-banner {
    position: fixed !important;
    bottom: 24px !important;
    left: 50% !important;
    transform: translateX(-50%) translateY(140%) !important;
    width: calc(100% - 32px) !important;
    max-width: 680px !important;
    z-index: 99998 !important;
    background: #192134 !important;
    background: var(--card-bg, rgba(25, 33, 52, 0.96)) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 16px !important;
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.55) !important;
    padding: 18px 22px !important;
    opacity: 0 !important;
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease !important;
    pointer-events: none !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', 'Montserrat', sans-serif !important;
    box-sizing: border-box !important;
    display: none;
}
.spendmind-cookie-banner.show {
    display: block !important;
    transform: translateX(-50%) translateY(0) !important;
    opacity: 1 !important;
    pointer-events: auto !important;
}
.cookie-banner-content {
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
    box-sizing: border-box !important;
}
.cookie-banner-header {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
}
.cookie-banner-icon {
    width: 32px !important;
    height: 32px !important;
    border-radius: 8px !important;
    background: rgba(5, 150, 105, 0.15) !important;
    color: #059669 !important;
    color: var(--accent-color, #059669) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
}
.cookie-banner-title {
    font-size: 0.95rem !important;
    font-weight: 600 !important;
    color: #ffffff !important;
    color: var(--text-primary, #ffffff) !important;
    margin: 0 !important;
}
.cookie-banner-text {
    font-size: 0.82rem !important;
    line-height: 1.5 !important;
    color: #94a3b8 !important;
    color: var(--text-secondary, #94a3b8) !important;
    margin: 0 !important;
}
.cookie-banner-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 10px !important;
    flex-wrap: wrap !important;
    margin-top: 4px !important;
}
.btn-cookie-accept {
    background: #059669 !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 8px !important;
    padding: 8px 16px !important;
    font-size: 0.82rem !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    transition: background-color 0.2s ease, transform 0.1s ease !important;
}
.btn-cookie-accept:hover {
    background: #047857 !important;
    transform: translateY(-1px) !important;
}
.btn-cookie-essential {
    background: transparent !important;
    color: #ffffff !important;
    color: var(--text-primary, #ffffff) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 8px !important;
    padding: 8px 14px !important;
    font-size: 0.82rem !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    transition: background-color 0.2s ease, border-color 0.2s ease !important;
}
.btn-cookie-essential:hover {
    background: rgba(255, 255, 255, 0.08) !important;
    border-color: #94a3b8 !important;
}
.btn-cookie-customize {
    background: transparent !important;
    color: #10b981 !important;
    color: var(--accent-color, #10b981) !important;
    border: none !important;
    padding: 8px 10px !important;
    font-size: 0.82rem !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    text-decoration: underline !important;
    text-underline-offset: 3px !important;
    transition: opacity 0.2s ease !important;
}
.btn-cookie-customize:hover {
    opacity: 0.85 !important;
}

/* Modal Overlay */
.spendmind-cookie-modal-overlay {
    position: fixed !important;
    inset: 0 !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    z-index: 99999 !important;
    background: rgba(0, 0, 0, 0.72) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    display: none;
    align-items: center !important;
    justify-content: center !important;
    padding: 16px !important;
    opacity: 0 !important;
    visibility: hidden !important;
    transition: opacity 0.25s ease, visibility 0.25s ease !important;
    box-sizing: border-box !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', 'Montserrat', sans-serif !important;
}
.spendmind-cookie-modal-overlay.show {
    display: flex !important;
    opacity: 1 !important;
    visibility: visible !important;
}
.spendmind-cookie-modal {
    width: 100% !important;
    max-width: 540px !important;
    max-height: 90vh !important;
    background: #192134 !important;
    background: var(--card-bg, #192134) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 18px !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65) !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    transform: scale(0.96) translateY(10px) !important;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    box-sizing: border-box !important;
}
.spendmind-cookie-modal-overlay.show .spendmind-cookie-modal {
    transform: scale(1) translateY(0) !important;
}
.cookie-modal-header {
    padding: 18px 22px !important;
    display: flex !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    box-sizing: border-box !important;
}
.cookie-modal-title-group h3 {
    margin: 0 !important;
    font-size: 1.05rem !important;
    font-weight: 600 !important;
    color: #ffffff !important;
    color: var(--text-primary, #ffffff) !important;
}
.cookie-modal-title-group p {
    margin: 4px 0 0 0 !important;
    font-size: 0.78rem !important;
    color: #94a3b8 !important;
    color: var(--text-secondary, #94a3b8) !important;
}
.cookie-modal-close-btn {
    background: transparent !important;
    border: none !important;
    color: #94a3b8 !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    transition: background-color 0.2s ease, color 0.2s ease !important;
}
.cookie-modal-close-btn:hover {
    background: rgba(255, 255, 255, 0.08) !important;
    color: #ffffff !important;
}
.cookie-modal-body {
    padding: 18px 22px !important;
    overflow-y: auto !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
    box-sizing: border-box !important;
}
.cookie-category-card {
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    border-radius: 12px !important;
    padding: 14px 16px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    box-sizing: border-box !important;
}
.cookie-category-top {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
}
.cookie-category-info {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
}
.cookie-category-icon {
    width: 28px !important;
    height: 28px !important;
    border-radius: 6px !important;
    background: rgba(255, 255, 255, 0.05) !important;
    color: #059669 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
}
.cookie-category-name {
    font-size: 0.88rem !important;
    font-weight: 600 !important;
    color: #ffffff !important;
    color: var(--text-primary, #ffffff) !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
}
.cookie-badge-required {
    font-size: 0.68rem !important;
    font-weight: 600 !important;
    color: #059669 !important;
    background: rgba(5, 150, 105, 0.15) !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
}
.cookie-category-desc {
    font-size: 0.77rem !important;
    line-height: 1.45 !important;
    color: #94a3b8 !important;
    color: var(--text-secondary, #94a3b8) !important;
    margin: 0 !important;
}
.cookie-modal-footer {
    padding: 16px 22px !important;
    border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
    background: rgba(0, 0, 0, 0.15) !important;
    flex-wrap: wrap !important;
    box-sizing: border-box !important;
}
@media (max-width: 600px) {
    .spendmind-cookie-banner {
        bottom: 12px !important;
        width: calc(100% - 24px) !important;
        padding: 14px 16px !important;
    }
    .cookie-banner-actions {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 8px !important;
    }
    .cookie-banner-actions button {
        width: 100% !important;
        text-align: center !important;
        justify-content: center !important;
    }
    .cookie-modal-footer {
        flex-direction: column-reverse !important;
        gap: 8px !important;
    }
    .cookie-modal-footer button,
    .cookie-modal-footer > div {
        width: 100% !important;
        text-align: center !important;
        justify-content: center !important;
    }
}
`;

    function injectStyles() {
        if (document.getElementById('spendmind-cookie-styles')) return;
        const styleEl = document.createElement('style');
        styleEl.id = 'spendmind-cookie-styles';
        styleEl.textContent = COOKIE_STYLES;
        document.head.appendChild(styleEl);
    }

    function getStoredConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'object' && parsed !== null && parsed.version === CONSENT_VERSION) {
                return parsed;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function saveConsent(consentData) {
        const payload = {
            essential: true,
            functional: Boolean(consentData.functional),
            analytics: Boolean(consentData.analytics),
            version: CONSENT_VERSION,
            timestamp: new Date().toISOString()
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('SpendMindAI Cookie: Unable to save to localStorage', e);
        }

        // Clear optional accounts if user rejects functional storage
        if (!payload.functional) {
            try {
                localStorage.removeItem('google_accounts_list');
            } catch (e) {}
        }

        // Dispatch reactive event for application listeners
        window.dispatchEvent(new CustomEvent('spendmind:cookie-consent-updated', { detail: payload }));

        hideBanner();
        closeModal();

        showToastNotification('Đã lưu tùy chọn cookie thành công!');
        return payload;
    }

    function showToastNotification(msg) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, 'success');
            return;
        }

        const existingToast = document.getElementById('toast');
        const toastMsg = document.getElementById('toast-message');
        if (existingToast && toastMsg) {
            toastMsg.textContent = msg;
            existingToast.classList.add('show');
            setTimeout(() => existingToast.classList.remove('show'), 3000);
        }
    }

    // DOM Template Injection
    function injectCookieUI() {
        injectStyles();

        // 1. Consent Banner
        let banner = document.getElementById('spendmind-cookie-banner');
        if (!banner) {
            banner = document.createElement('aside');
            banner.id = 'spendmind-cookie-banner';
            banner.className = 'spendmind-cookie-banner';
            banner.style.display = 'none';
            banner.setAttribute('role', 'region');
            banner.setAttribute('aria-label', 'Thông báo cookie');
            banner.innerHTML = `
                <div class="cookie-banner-content">
                    <div class="cookie-banner-header">
                        <div class="cookie-banner-icon">
                            <i data-lucide="cookie"></i>
                        </div>
                        <h3 class="cookie-banner-title">Tùy chọn Cookie & Quyền riêng tư</h3>
                    </div>
                    <p class="cookie-banner-text">
                        SpendMindAI sử dụng cookie và bộ nhớ cục bộ cần thiết để duy trì phiên làm việc an toàn, lưu chủ đề hiển thị và nâng cao trải nghiệm quản lý tài chính của bạn.
                    </p>
                    <div class="cookie-banner-actions">
                        <button type="button" class="btn-cookie-customize" id="btn-cookie-open-modal">Tùy chỉnh</button>
                        <button type="button" class="btn-cookie-essential" id="btn-cookie-essential-only">Chỉ cần thiết</button>
                        <button type="button" class="btn-cookie-accept" id="btn-cookie-accept-all">Chấp nhận tất cả</button>
                    </div>
                </div>
            `;
            document.body.appendChild(banner);
        }

        // 2. Preferences Modal
        let overlay = document.getElementById('spendmind-cookie-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'spendmind-cookie-modal-overlay';
            overlay.className = 'spendmind-cookie-modal-overlay';
            overlay.style.display = 'none';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'cookie-modal-title');
            overlay.innerHTML = `
                <div class="spendmind-cookie-modal card">
                    <div class="cookie-modal-header">
                        <div class="cookie-modal-title-group">
                            <h3 id="cookie-modal-title">Cài đặt & Tùy chọn Cookie</h3>
                            <p>Kiểm soát cách SpendMindAI lưu trữ dữ liệu trên trình duyệt của bạn</p>
                        </div>
                        <button type="button" class="cookie-modal-close-btn" id="btn-close-cookie-modal" title="Đóng" aria-label="Đóng bảng tùy chọn">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                    <div class="cookie-modal-body">
                        <!-- Category 1: Essential -->
                        <div class="cookie-category-card">
                            <div class="cookie-category-top">
                                <div class="cookie-category-info">
                                    <div class="cookie-category-icon">
                                        <i data-lucide="shield-check"></i>
                                    </div>
                                    <span class="cookie-category-name">
                                        Cookie Bắt buộc
                                        <span class="cookie-badge-required">Luôn bật</span>
                                    </span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" checked disabled aria-label="Cookie bắt buộc">
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <p class="cookie-category-desc">
                                Cần thiết để bảo mật phiên đăng nhập, chứng thực người dùng và phòng chống tấn công CSRF. Không thể tắt vì hệ thống không thể hoạt động an toàn nếu thiếu mục này.
                            </p>
                        </div>

                        <!-- Category 2: Functional / Preferences -->
                        <div class="cookie-category-card">
                            <div class="cookie-category-top">
                                <div class="cookie-category-info">
                                    <div class="cookie-category-icon">
                                        <i data-lucide="palette"></i>
                                    </div>
                                    <span class="cookie-category-name">Cookie Chức năng & Giao diện</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" id="cookie-toggle-functional" checked aria-label="Bật cookie chức năng">
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <p class="cookie-category-desc">
                                Ghi nhớ tùy chọn giao diện (chế độ Sáng / Tối / Tự động theo hệ thống), bộ lọc danh mục giao dịch và danh sách tài khoản Google để đăng nhập nhanh.
                            </p>
                        </div>

                        <!-- Category 3: Analytics & Performance -->
                        <div class="cookie-category-card">
                            <div class="cookie-category-top">
                                <div class="cookie-category-info">
                                    <div class="cookie-category-icon">
                                        <i data-lucide="activity"></i>
                                    </div>
                                    <span class="cookie-category-name">Cookie Hiệu năng & Thống kê</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" id="cookie-toggle-analytics" aria-label="Bật cookie hiệu năng">
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <p class="cookie-category-desc">
                                Thu thập số liệu hiệu năng phản hồi serverless và tần suất sử dụng tính năng một cách ẩn danh nhằm phát hiện lỗi và tối ưu hóa trải nghiệm ứng dụng.
                            </p>
                        </div>
                    </div>
                    <div class="cookie-modal-footer">
                        <button type="button" class="btn-cookie-essential" id="btn-modal-cookie-essential">Chỉ cần thiết</button>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="btn-cookie-essential" id="btn-modal-save-choices">Lưu tùy chọn</button>
                            <button type="button" class="btn-cookie-accept" id="btn-modal-accept-all">Chấp nhận tất cả</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        // Bind interactive events via Event Delegation
        bindCookieEvents();

        // Refresh icons if lucide is available
        if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function showBanner() {
        const banner = document.getElementById('spendmind-cookie-banner');
        if (banner) {
            banner.style.display = 'block';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    banner.classList.add('show');
                });
            });
        }
    }

    function hideBanner() {
        const banner = document.getElementById('spendmind-cookie-banner');
        if (banner) {
            banner.classList.remove('show');
            setTimeout(() => {
                banner.style.display = 'none';
            }, 350);
        }
    }

    function openModal() {
        injectCookieUI();

        const current = getStoredConsent() || DEFAULT_CONSENT;
        const functionalToggle = document.getElementById('cookie-toggle-functional');
        const analyticsToggle = document.getElementById('cookie-toggle-analytics');

        if (functionalToggle) functionalToggle.checked = Boolean(current.functional);
        if (analyticsToggle) analyticsToggle.checked = Boolean(current.analytics);

        const targetOverlay = document.getElementById('spendmind-cookie-modal-overlay');
        if (targetOverlay) {
            targetOverlay.style.display = 'flex';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    targetOverlay.classList.add('show');
                });
            });
            const closeBtn = document.getElementById('btn-close-cookie-modal');
            if (closeBtn) closeBtn.focus();
        }
    }

    function closeModal() {
        const overlay = document.getElementById('spendmind-cookie-modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 250);
        }
    }

    let eventsBound = false;
    function bindCookieEvents() {
        if (eventsBound) return;
        eventsBound = true;

        // Use Event Delegation on document for bulletproof click capturing
        document.addEventListener('click', (e) => {
            // Banner buttons
            if (e.target.closest('#btn-cookie-accept-all')) {
                e.preventDefault();
                saveConsent({ functional: true, analytics: true });
                return;
            }
            if (e.target.closest('#btn-cookie-essential-only')) {
                e.preventDefault();
                saveConsent({ functional: false, analytics: false });
                return;
            }
            if (e.target.closest('#btn-cookie-open-modal')) {
                e.preventDefault();
                openModal();
                return;
            }

            // Modal buttons
            if (e.target.closest('#btn-close-cookie-modal')) {
                e.preventDefault();
                closeModal();
                return;
            }
            if (e.target.closest('#btn-modal-accept-all')) {
                e.preventDefault();
                saveConsent({ functional: true, analytics: true });
                return;
            }
            if (e.target.closest('#btn-modal-cookie-essential')) {
                e.preventDefault();
                saveConsent({ functional: false, analytics: false });
                return;
            }
            if (e.target.closest('#btn-modal-save-choices')) {
                e.preventDefault();
                const functional = document.getElementById('cookie-toggle-functional')?.checked ?? true;
                const analytics = document.getElementById('cookie-toggle-analytics')?.checked ?? false;
                saveConsent({ functional, analytics });
                return;
            }

            // Overlay backdrop click to close
            const overlay = document.getElementById('spendmind-cookie-modal-overlay');
            if (overlay && e.target === overlay) {
                closeModal();
                return;
            }

            // External triggers (Footer button / Settings menu item)
            if (e.target.closest('#open-cookie-settings-footer')) {
                e.preventDefault();
                openModal();
                return;
            }
            if (e.target.closest('#menu-item-cookies')) {
                e.preventDefault();
                if (typeof window.closeSettingsDropdown === 'function') {
                    window.closeSettingsDropdown();
                }
                openModal();
                return;
            }
        });

        // Keyboard navigation: ESC to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('spendmind-cookie-modal-overlay');
                if (modal && modal.classList.contains('show')) {
                    closeModal();
                }
            }
        });
    }

    // Initialization
    function init() {
        injectCookieUI();

        const stored = getStoredConsent();
        if (!stored) {
            // First time visitor: show banner after a smooth 600ms delay
            setTimeout(showBanner, 600);
        } else {
            // Already consented: ensure elements stay hidden
            hideBanner();
            closeModal();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    window.SpendMindCookie = {
        openPreferences: openModal,
        closePreferences: closeModal,
        getConsent: () => getStoredConsent() || { ...DEFAULT_CONSENT },
        hasConsent: (category) => {
            const consent = getStoredConsent() || DEFAULT_CONSENT;
            return Boolean(consent[category]);
        },
        acceptAll: () => saveConsent({ functional: true, analytics: true }),
        acceptEssentialOnly: () => saveConsent({ functional: false, analytics: false }),
        savePreferences: saveConsent
    };

})();
