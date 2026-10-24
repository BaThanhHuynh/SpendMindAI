/* ==========================================================================
   SPENDMINDAI - UNIFIED AUTHENTICATION MODULE (LOGIN, REGISTER & GOOGLE GIS)
   Optimized with Ponytail: Zero bloat, DRY architecture, zero external dependencies
   ========================================================================== */

const API_URL = "api";
const DEFAULT_GOOGLE_CLIENT_ID = "125274610515-6qi1cnl41k7itnfch3v6123q6tbqgovf.apps.googleusercontent.com";
let googleTokenClient = null;

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initGoogleButtonLabel();
    if (!checkGoogleOAuthRedirect()) {
        checkAuthSession();
    }
    initGoogleAuth();

    const loginForm = document.getElementById("login-form");
    if (loginForm) loginForm.addEventListener("submit", handleLoginSubmit);

    const registerForm = document.getElementById("register-form");
    if (registerForm) registerForm.addEventListener("submit", handleRegisterSubmit);

    const googleBtn = document.getElementById("google-auth-btn");
    if (googleBtn) googleBtn.addEventListener("click", triggerGoogleAuth);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// 1. Google Accounts local cache for fast 1-tap experience
function getSavedGoogleAccounts() {
    try {
        const stored = localStorage.getItem("google_accounts_list");
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function saveGoogleAccount(email, googleId, username, avatarUrl) {
    let accounts = getSavedGoogleAccounts().filter(acc => acc.email !== email);
    accounts.unshift({ email, googleId, username, avatarUrl });
    if (accounts.length > 5) accounts = accounts.slice(0, 5);
    localStorage.setItem("google_accounts_list", JSON.stringify(accounts));
}

function initGoogleButtonLabel() {
    const customBtn = document.getElementById("google-auth-btn");
    const textSpan = document.getElementById("google-btn-text");
    if (!customBtn || !textSpan) return;

    const saved = getSavedGoogleAccounts();
    if (saved.length > 0) {
        const top = saved[0];
        const displayName = top.username || "Bá Thành";
        textSpan.textContent = `Tiếp tục bằng tên ${displayName}`;

        if (top.avatarUrl && !customBtn.querySelector(".google-saved-avatar")) {
            const img = document.createElement("img");
            img.className = "google-saved-avatar";
            img.src = top.avatarUrl;
            img.alt = displayName;
            img.style.cssText = "width: 22px; height: 22px; border-radius: 50%; object-fit: cover; margin-right: 4px; flex-shrink: 0;";
            customBtn.insertBefore(img, textSpan);
        }
    } else {
        textSpan.textContent = "Tiếp tục với Google";
    }
}

// 2. Google Identity Services (GIS) & OAuth Token Handlers
function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
        showToast("Không nhận được chứng thực từ Google.", "error");
        return;
    }
    const rememberChecked = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : true;
    showToast("Đang xác thực tài khoản Google...", "info");

    fetch(`${API_URL}?action=google_auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential, remember: rememberChecked })
    })
    .then(parseApiResponse)
    .then(onAuthSuccess)
    .catch(err => showToast(err.message, "error"));
}

function handleGoogleToken(accessToken) {
    showToast("Đang xác thực tài khoản Google...", "info");
    const rememberChecked = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : true;

    fetch(`${API_URL}?action=google_auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, remember: rememberChecked })
    })
    .then(parseApiResponse)
    .then(onAuthSuccess)
    .catch(err => showToast(err.message, "error"));
}

function onAuthSuccess(data) {
    if (data.email) {
        const avatar = data.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(data.email.split('@')[0]) + '&background=059669&color=fff&size=128');
        const googleId = data.google_id || ("google_id_" + btoa(unescape(encodeURIComponent(data.email))).replace(/[^a-zA-Z0-9]/g, "").substring(0, 24));
        saveGoogleAccount(data.email, googleId, data.username, avatar);
    }
    showToast(data.message, "success");
    setTimeout(() => { window.location.href = "dashboard"; }, 1000);
}

function setupGoogleTokenClient(clientId) {
    if (!window.google || !window.google.accounts) {
        setTimeout(() => setupGoogleTokenClient(clientId), 400);
        return;
    }

    if (window.google.accounts.id) {
        try {
            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: handleGoogleCredentialResponse,
                auto_select: false,
                cancel_on_tap_outside: true
            });
            const btnContainer = document.getElementById("g_id_signin");
            if (btnContainer) {
                const isLight = document.documentElement.getAttribute("data-theme") === "light";
                const w = Math.min(360, Math.max(240, btnContainer.parentElement ? btnContainer.parentElement.clientWidth : 320));
                window.google.accounts.id.renderButton(btnContainer, {
                    theme: isLight ? "outline" : "filled_black",
                    size: "large",
                    type: "standard",
                    shape: "pill",
                    text: "continue_with",
                    logo_alignment: "left",
                    width: w
                });
                const wrapper = document.getElementById("google-auth-wrapper");
                if (wrapper) wrapper.classList.add("has-gis");
                const customBtn = document.getElementById("google-auth-btn");
                if (customBtn) customBtn.style.display = "none";
            }
        } catch (e) {
            console.warn("GIS button render notice:", e);
        }
    }

    if (window.google.accounts.oauth2) {
        try {
            googleTokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        handleGoogleToken(tokenResponse.access_token);
                    } else {
                        showToast("Không nhận được Access Token từ Google.", "error");
                    }
                },
                error_callback: (error) => {
                    if (error && error.type === 'popup_failed_to_open') {
                        showToast("Trình duyệt chặn Pop-up. Bấm 🚫 trên thanh URL để cho phép.", "warning");
                    }
                }
            });
        } catch (e) {
            console.warn("Token client notice:", e);
        }
    }
}

function initGoogleAuth() {
    fetch(`${API_URL}?action=get_google_client_id`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setupGoogleTokenClient((data && data.client_id) ? data.client_id : DEFAULT_GOOGLE_CLIENT_ID))
        .catch(() => setupGoogleTokenClient(DEFAULT_GOOGLE_CLIENT_ID));
}

function checkGoogleOAuthRedirect() {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token=")) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        if (accessToken) {
            history.replaceState(null, "", window.location.pathname + window.location.search);
            handleGoogleToken(accessToken);
            return true;
        }
    }
    return false;
}

function triggerGoogleAuth() {
    if (googleTokenClient) {
        try {
            googleTokenClient.requestAccessToken({ prompt: 'select_account' });
            return;
        } catch (e) { }
    }
    const redirectUri = window.location.origin;
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${DEFAULT_GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=email%20profile`;
}

// 3. Form Submissions
async function parseApiResponse(res) {
    let data;
    try {
        data = await res.json();
    } catch (e) {
        throw new Error(!res.ok ? `Lỗi kết nối máy chủ (${res.status}).` : "Phản hồi máy chủ không hợp lệ");
    }
    if (!res.ok || !data.success) {
        throw new Error(data.message || "Thao tác thất bại");
    }
    return data;
}

function handleLoginSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const oldBtnHtml = btn ? btn.innerHTML : '';
    const restoreBtn = () => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldBtnHtml;
            if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
        }
    };

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const remember = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : false;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-inline"></span> Đang đăng nhập...`;
    }

    fetch(`${API_URL}?action=login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, remember })
    })
    .then(parseApiResponse)
    .then(data => {
        showToast(data.message, "success");
        setTimeout(() => { window.location.href = "dashboard"; }, 1000);
    })
    .catch(err => {
        showToast(err.message, "error");
        restoreBtn();
    });
}

function handleRegisterSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const oldBtnHtml = btn ? btn.innerHTML : '';
    const restoreBtn = () => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldBtnHtml;
            if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
        }
    };

    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm-password").value;

    if (password !== confirm) {
        showToast("Mật khẩu xác nhận không khớp!", "error");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-inline"></span> Đang tạo tài khoản...`;
    }

    fetch(`${API_URL}?action=register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password })
    })
    .then(parseApiResponse)
    .then(data => {
        showToast(data.message, "success");
        setTimeout(() => { window.location.href = "login"; }, 1500);
    })
    .catch(err => {
        showToast(err.message, "error");
        restoreBtn();
    });
}

// 4. Shared Utilities (Session, Theme, Toast)
function checkAuthSession() {
    if (!navigator.onLine) return;
    fetch(`${API_URL}?action=check_session`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && data.authenticated) {
                window.location.href = "dashboard";
            }
        })
        .catch(() => {});
}

function applyTheme(name) {
    const isDark = name === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : name === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

function initTheme() {
    const theme = localStorage.getItem("quan_ly_chi_tieu_theme") || "system";
    applyTheme(theme);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        if ((localStorage.getItem("quan_ly_chi_tieu_theme") || "system") === "system") {
            document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
        }
    });
}

function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    const msg = document.getElementById("toast-message");
    const icon = document.getElementById("toast-icon");
    if (!toast || !msg) return;

    toast.className = `toast toast-${type}`;
    msg.textContent = message;
    if (icon) {
        const icons = { success: "check-circle", error: "alert-triangle", info: "info" };
        icon.setAttribute("data-lucide", icons[type] || "info");
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}
