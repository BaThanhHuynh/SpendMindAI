/* ==========================================================================
   SPENDMINDAI - PWA INSTALLATION MANAGER (ANDROID & IOS)
   Provides native 1-click install on Android/Desktop and visual step-by-step
   Add to Home Screen guide for iOS Safari.
   ========================================================================== */

(function () {
    let deferredPrompt = null;
    const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    document.addEventListener('DOMContentLoaded', () => {
        initPwaInstaller();
    });

    function initPwaInstaller() {
        injectIosModalHTML();
        injectFloatingInstallBanner();

        // 1. Android & Desktop Chrome/Edge event
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            updateInstallUI(true);
        });

        // 2. Track successful app install
        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            updateInstallUI(false, true);
            hideFloatingBanner();
            if (typeof showToast === 'function') {
                showToast("Chúc mừng! Ứng dụng SpendMindAI đã được cài đặt thành công lên thiết bị.", "success");
            }
        });

        // 3. Bind click events on any install triggers
        bindInstallTriggers();

        // 4. Initial state check
        if (isStandalone) {
            updateInstallUI(false, true);
        } else if (isIOS) {
            updateInstallUI(true);
        }
    }

    function bindInstallTriggers() {
        // Settings menu trigger
        const settingsInstallBtn = document.getElementById('menu-item-install-pwa');
        if (settingsInstallBtn) {
            settingsInstallBtn.addEventListener('click', (e) => {
                e.preventDefault();
                promptInstallFlow();
            });
        }

        // Floating banner trigger
        const bannerBtn = document.getElementById('btn-pwa-banner-install');
        if (bannerBtn) {
            bannerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                promptInstallFlow();
            });
        }

        const bannerClose = document.getElementById('btn-pwa-banner-close');
        if (bannerClose) {
            bannerClose.addEventListener('click', () => {
                hideFloatingBanner();
                sessionStorage.setItem('spendmind_pwa_banner_dismissed', '1');
            });
        }

        // iOS Modal close button
        const iosCloseBtn = document.getElementById('btn-close-ios-install');
        const iosBackdrop = document.getElementById('ios-install-backdrop');
        if (iosCloseBtn) iosCloseBtn.addEventListener('click', closeIosModal);
        if (iosBackdrop) iosBackdrop.addEventListener('click', closeIosModal);
    }

    function promptInstallFlow() {
        if (isStandalone) {
            if (typeof showToast === 'function') {
                showToast("Ứng dụng SpendMindAI đã được cài đặt trên thiết bị của bạn.", "info");
            }
            return;
        }

        // Android / Desktop native install prompt
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    hideFloatingBanner();
                }
                deferredPrompt = null;
            }).catch((err) => {
                console.warn('Install prompt error:', err);
            });
            return;
        }

        // iOS Safari guide
        if (isIOS) {
            openIosModal();
            return;
        }

        // Fallback for desktop browsers without prompt
        openIosModal();
    }

    function updateInstallUI(available, installed = false) {
        const badge = document.getElementById('badge-pwa-install');
        const menuItem = document.getElementById('menu-item-install-pwa');

        if (badge) {
            if (installed) {
                badge.textContent = "Đã cài";
                badge.style.background = "rgba(16, 185, 129, 0.15)";
                badge.style.color = "#10b981";
            } else if (available) {
                badge.textContent = isIOS ? "Thêm vào MH" : "Cài ngay";
                badge.style.background = "rgba(0, 104, 255, 0.15)";
                badge.style.color = "#0068ff";
            }
        }

        // Show floating banner on mobile if not standalone and not dismissed
        if (!isStandalone && !sessionStorage.getItem('spendmind_pwa_banner_dismissed')) {
            showFloatingBanner();
        }
    }

    function showFloatingBanner() {
        const banner = document.getElementById('pwa-floating-banner');
        if (banner) {
            setTimeout(() => {
                banner.classList.add('visible');
            }, 1200);
        }
    }

    function hideFloatingBanner() {
        const banner = document.getElementById('pwa-floating-banner');
        if (banner) {
            banner.classList.remove('visible');
        }
    }

    function openIosModal() {
        const modal = document.getElementById('ios-install-modal');
        const backdrop = document.getElementById('ios-install-backdrop');
        if (modal && backdrop) {
            backdrop.classList.remove('hidden');
            modal.classList.remove('hidden');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    function closeIosModal() {
        const modal = document.getElementById('ios-install-modal');
        const backdrop = document.getElementById('ios-install-backdrop');
        if (modal) modal.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
    }

    function injectIosModalHTML() {
        if (document.getElementById('ios-install-modal')) return;

        const container = document.createElement('div');
        container.innerHTML = `
            <div id="ios-install-backdrop" class="ios-modal-backdrop hidden"></div>
            <div id="ios-install-modal" class="ios-install-sheet hidden">
                <div class="ios-sheet-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="images/logoapp.png?v=20260911_v8" alt="SpendMindAI" style="width: 36px; height: 36px; border-radius: 9px;">
                        <div>
                            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">Cài Đặt SpendMindAI</h4>
                            <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: var(--text-secondary);">Thêm vào màn hình chính như ứng dụng</p>
                        </div>
                    </div>
                    <button type="button" id="btn-close-ios-install" class="btn-close-sheet" title="Đóng">
                        <i data-lucide="x" style="width: 16px; height: 16px;"></i>
                    </button>
                </div>
                <div class="ios-sheet-body">
                    <div class="ios-step-item">
                        <div class="step-badge">1</div>
                        <div class="step-text">
                            Nhấn vào biểu tượng <strong>Chia sẻ</strong> 
                            <span class="ios-icon-box">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                                    <polyline points="16 6 12 2 8 6"></polyline>
                                    <line x1="12" y1="2" x2="12" y2="15"></line>
                                </svg>
                            </span>
                            ở thanh công cụ dưới cùng Safari.
                        </div>
                    </div>
                    <div class="ios-step-item">
                        <div class="step-badge">2</div>
                        <div class="step-text">
                            Cuộn xuống danh sách tùy chọn và chọn <strong>"Thêm vào Màn hình chính" (Add to Home Screen)</strong> 📲.
                        </div>
                    </div>
                    <div class="ios-step-item">
                        <div class="step-badge">3</div>
                        <div class="step-text">
                            Nhấn <strong>"Thêm" (Add)</strong> ở góc trên bên phải để hoàn tất cài đặt ứng dụng.
                        </div>
                    </div>
                </div>
                <div class="ios-sheet-footer">
                    <button type="button" class="btn btn-sm btn-primary w-full" onclick="document.getElementById('ios-install-backdrop').classList.add('hidden'); document.getElementById('ios-install-modal').classList.add('hidden');">
                        Đã hiểu
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(container);
    }

    function injectFloatingInstallBanner() {
        if (document.getElementById('pwa-floating-banner') || isStandalone) return;

        const banner = document.createElement('div');
        banner.id = 'pwa-floating-banner';
        banner.className = 'pwa-floating-banner';
        banner.innerHTML = `
            <div class="pwa-banner-content">
                <img src="images/logoapp.png?v=20260911_v8" alt="SpendMindAI" class="pwa-banner-icon">
                <div class="pwa-banner-info">
                    <div class="pwa-banner-title">Cài đặt SpendMindAI</div>
                    <div class="pwa-banner-desc">Lưu về máy dùng mượt mà toàn màn hình</div>
                </div>
            </div>
            <div class="pwa-banner-actions">
                <button type="button" id="btn-pwa-banner-install" class="btn-pwa-install-action">Cài đặt</button>
                <button type="button" id="btn-pwa-banner-close" class="btn-pwa-close-action" title="Bỏ qua">✕</button>
            </div>
        `;
        document.body.appendChild(banner);
    }

    // Expose trigger globally
    window.SpendMindPWA = {
        promptInstall: promptInstallFlow,
        isStandalone: () => isStandalone,
        isIOS: () => isIOS
    };
})();
