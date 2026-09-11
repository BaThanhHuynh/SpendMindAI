/* ==========================================================================
   LOGIN SCRIPT - CREDENTIALS VERIFICATION & ROUTING (QUAN LY CHI TIEU)
   ========================================================================== */

const API_URL = "api";

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initGoogleButtonLabel();
    if (!checkGoogleOAuthRedirect()) {
        checkAuthSession();
    }
    initGoogleAuth();
    document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);
    document.getElementById("google-auth-btn").addEventListener("click", triggerGoogleAuthSimulated);
    lucide.createIcons();
});

let googleTokenClient = null;

// Helpers for Google Accounts storage
function getSavedGoogleAccounts() {
    try {
        const stored = localStorage.getItem("google_accounts_list");
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function saveGoogleAccount(email, googleId, username, avatarUrl) {
    let accounts = getSavedGoogleAccounts();
    accounts = accounts.filter(acc => acc.email !== email);
    accounts.unshift({ email, googleId, username, avatarUrl });
    if (accounts.length > 5) {
        accounts = accounts.slice(0, 5);
    }
    localStorage.setItem("google_accounts_list", JSON.stringify(accounts));
}

const DEFAULT_GOOGLE_CLIENT_ID = "125274610515-6qi1cnl41k7itnfch3v6123q6tbqgovf.apps.googleusercontent.com";

function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
        showToast("Không nhận được chứng thực từ Google.", "error");
        return;
    }
    const rememberChecked = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : false;
    
    const modal = document.getElementById("google-sim-modal");
    const emailStep = document.getElementById("google-email-step");
    const chooserStep = document.getElementById("google-chooser-step");
    const loadingStep = document.getElementById("google-loading-step");
    if (modal) {
        if (emailStep) emailStep.classList.add("hidden");
        if (chooserStep) chooserStep.classList.add("hidden");
        if (loadingStep) loadingStep.classList.remove("hidden");
        modal.classList.remove("hidden");
    }
    
    fetch(`${API_URL}?action=google_auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential, remember: rememberChecked })
    })
    .then(async res => {
        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw new Error(!res.ok ? `Lỗi kết nối máy chủ (${res.status}). Vui lòng kiểm tra biến môi trường CSDL trên Vercel.` : "Phản hồi máy chủ không hợp lệ");
        }
        if (!res.ok || !data.success) {
            throw new Error(data.message || "Xác thực Google thất bại");
        }
        return data;
    })
    .then(data => {
        if (data.success) {
            if (data.email) {
                const finalAvatar = data.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(data.email.split('@')[0]) + '&background=059669&color=fff&size=128');
                const googleId = data.google_id || ("google_id_" + btoa(unescape(encodeURIComponent(data.email))).replace(/[^a-zA-Z0-9]/g, "").substring(0, 24));
                saveGoogleAccount(data.email, googleId, data.username, finalAvatar);
            }
            if (modal) modal.classList.add("hidden");
            showToast(data.message, "success");
            setTimeout(() => {
                window.location.href = "dashboard";
            }, 1000);
        }
    })
    .catch(err => {
        if (modal) modal.classList.add("hidden");
        showToast(err.message, "error");
    });
}

function initGoogleButtonLabel() {
    const customBtn = document.getElementById("google-auth-btn");
    const textSpan = document.getElementById("google-btn-text");
    if (!customBtn || !textSpan) return;

    const savedAccounts = getSavedGoogleAccounts();
    if (savedAccounts && savedAccounts.length > 0) {
        const topAccount = savedAccounts[0];
        const displayName = topAccount.username || "Bá Thành";
        textSpan.textContent = `Tiếp tục bằng tên ${displayName}`;
        
        if (topAccount.avatarUrl && !customBtn.querySelector(".google-saved-avatar")) {
            const avatarImg = document.createElement("img");
            avatarImg.className = "google-saved-avatar";
            avatarImg.src = topAccount.avatarUrl;
            avatarImg.alt = displayName;
            avatarImg.style.cssText = "width: 22px; height: 22px; border-radius: 50%; object-fit: cover; margin-right: 4px; flex-shrink: 0;";
            customBtn.insertBefore(avatarImg, textSpan);
        }
    } else {
        textSpan.textContent = "Tiếp tục với Google";
    }
}

function setupGoogleTokenClient(clientId) {
    if (window.google && window.google.accounts) {
        // 1. Initialize official Google Identity Services (Never blocked by popup blocker)
        if (window.google.accounts.id) {
            try {
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: handleGoogleCredentialResponse,
                    auto_select: false,
                    cancel_on_tap_outside: true
                });
                const btnContainer = document.getElementById("g_id_signin");
                const wrapper = document.getElementById("google-auth-wrapper");
                if (btnContainer) {
                    const isLight = document.documentElement.getAttribute("data-theme") === "light";
                    const containerWidth = btnContainer.parentElement ? btnContainer.parentElement.clientWidth : 320;
                    const btnWidth = Math.min(360, Math.max(240, containerWidth));

                    window.google.accounts.id.renderButton(btnContainer, {
                        theme: isLight ? "outline" : "filled_black",
                        size: "large",
                        type: "standard",
                        shape: "pill",
                        text: "continue_with",
                        logo_alignment: "left",
                        width: btnWidth
                    });
                    if (wrapper) {
                        wrapper.classList.add("has-gis");
                    }
                    const customBtn = document.getElementById("google-auth-btn");
                    if (customBtn) {
                        customBtn.classList.add("hidden");
                        customBtn.style.display = "none";
                    }
                }
            } catch (errId) {
                console.warn("Lỗi khởi tạo Google ID button:", errId);
            }
        }

        // 2. Fallback OAuth Token Client
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
                        console.warn("Google OAuth Error Callback:", error);
                        if (error && error.type === 'popup_failed_to_open') {
                            showToast("Trình duyệt đang chặn cửa sổ bật lên (Pop-up). Vui lòng bấm vào biểu tượng 🚫 ở thanh địa chỉ URL để Cho phép pop-up.", "warning");
                            triggerGoogleSimulatedModalDirectly();
                        }
                    }
                });
            } catch (e) {
                console.warn("Lỗi khởi tạo Google Token Client:", e);
            }
        }
    } else {
        setTimeout(() => setupGoogleTokenClient(clientId), 400);
    }
}

// Initialize Google OAuth2 Token Client if client_id is set
function initGoogleAuth() {
    fetch(`${API_URL}?action=get_google_client_id`)
        .then(async res => {
            if (!res.ok) return null;
            return res.json().catch(() => null);
        })
        .then(data => {
            const clientId = (data && data.client_id) ? data.client_id : DEFAULT_GOOGLE_CLIENT_ID;
            setupGoogleTokenClient(clientId);
        })
        .catch(err => {
            console.warn("Lỗi cấu hình Google OAuth, sử dụng Client ID mặc định:", err);
            setupGoogleTokenClient(DEFAULT_GOOGLE_CLIENT_ID);
        });
}

// Handle real Google token validation
function handleGoogleToken(accessToken) {
    const modal = document.getElementById("google-sim-modal");
    const emailStep = document.getElementById("google-email-step");
    const chooserStep = document.getElementById("google-chooser-step");
    const loadingStep = document.getElementById("google-loading-step");
    
    // Show loading spinner modal
    emailStep.classList.add("hidden");
    if (chooserStep) chooserStep.classList.add("hidden");
    loadingStep.classList.remove("hidden");
    modal.classList.remove("hidden");
    
    const rememberChecked = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : false;
    
    fetch(`${API_URL}?action=google_auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, remember: rememberChecked })
    })
    .then(async res => {
        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw new Error(!res.ok ? `Lỗi kết nối máy chủ (${res.status}). Vui lòng kiểm tra biến môi trường CSDL trên Vercel.` : "Phản hồi máy chủ không hợp lệ");
        }
        if (!res.ok) {
            throw new Error(data.message || "Xác thực Google thất bại");
        }
        return data;
    })
    .then(data => {
        if (data.success) {
            if (data.email) {
                const finalAvatar = data.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(data.email.split('@')[0]) + '&background=059669&color=fff&size=128');
                const googleId = data.google_id || ("google_id_" + btoa(unescape(encodeURIComponent(data.email))).replace(/[^a-zA-Z0-9]/g, "").substring(0, 24));
                saveGoogleAccount(data.email, googleId, data.username, finalAvatar);
            }
            
            modal.classList.add("hidden");
            showToast(data.message, "success");
            setTimeout(() => {
                window.location.href = "dashboard";
            }, 1000);
        }
    })
    .catch(err => {
        modal.classList.add("hidden");
        showToast(err.message, "error");
    });
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

function triggerGoogleAuthSimulated() {
    // Direct page navigation to Google OAuth (Completely immune to popup blockers!)
    const clientId = DEFAULT_GOOGLE_CLIENT_ID;
    const redirectUri = window.location.origin; // https://spend-mind-aia.vercel.app
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=email%20profile`;
    window.location.href = authUrl;
}

function triggerGoogleSimulatedModalDirectly() {
    const rememberChecked = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : false;
    const modal = document.getElementById("google-sim-modal");
    if (!modal) return;
    const emailInput = document.getElementById("google-sim-email");
    const emailStep = document.getElementById("google-email-step");
    const chooserStep = document.getElementById("google-chooser-step");
    const loadingStep = document.getElementById("google-loading-step");
    
    // Reset state
    if (emailInput) emailInput.value = "";
    if (emailStep) emailStep.classList.add("hidden");
    if (chooserStep) chooserStep.classList.add("hidden");
    if (loadingStep) loadingStep.classList.add("hidden");
    modal.classList.remove("hidden");
    
    const accounts = getSavedGoogleAccounts();
    
    const showEmailStep = () => {
        if (chooserStep) chooserStep.classList.add("hidden");
        if (emailStep) emailStep.classList.remove("hidden");
        if (emailInput) emailInput.focus();
    };
    
    const startSimulatedAuth = (email, googleId) => {
        emailStep.classList.add("hidden");
        chooserStep.classList.add("hidden");
        loadingStep.classList.remove("hidden");
        
        setTimeout(() => {
            fetch(`${API_URL}?action=google_auth`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email, google_id: googleId, remember: rememberChecked })
            })
            .then(async res => {
                let data;
                try {
                    data = await res.json();
                } catch (e) {
                    throw new Error(!res.ok ? `Lỗi kết nối máy chủ (${res.status}). Vui lòng kiểm tra biến môi trường CSDL trên Vercel.` : "Phản hồi máy chủ không hợp lệ");
                }
                if (!res.ok || !data.success) {
                    throw new Error(data.message || "Xác thực Google thất bại");
                }
                return data;
            })
            .then(data => {
                if (data.success) {
                    const finalAvatar = data.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(email.split('@')[0]) + '&background=059669&color=fff&size=128');
                    saveGoogleAccount(email, googleId, email.split('@')[0], finalAvatar);
                    
                    modal.classList.add("hidden");
                    showToast(data.message, "success");
                    setTimeout(() => {
                        window.location.href = "dashboard";
                    }, 1000);
                }
            })
            .catch(err => {
                showToast(err.message, "error");
                loadingStep.classList.add("hidden");
                if (accounts.length > 0) {
                    chooserStep.classList.remove("hidden");
                } else {
                    emailStep.classList.remove("hidden");
                }
            });
        }, 1200);
    };
    
    if (accounts.length > 0) {
        const container = document.getElementById("google-accounts-list-container");
        container.innerHTML = "";
        
        accounts.forEach(acc => {
            const item = document.createElement("div");
            item.className = "google-account-item";
            item.innerHTML = `
                <img src="${acc.avatarUrl}" class="google-account-avatar" alt="avatar">
                <div class="google-account-info">
                    <span class="google-account-name">${acc.username}</span>
                    <span class="google-account-email">${acc.email}</span>
                </div>
            `;
            item.onclick = () => {
                startSimulatedAuth(acc.email, acc.googleId);
            };
            container.appendChild(item);
        });
        
        chooserStep.classList.remove("hidden");
    } else {
        showEmailStep();
    }
    
    const btnNext = document.getElementById("btn-next-google-sim");
    const btnCancel = document.getElementById("btn-cancel-google-sim");
    const btnCancelChooser = document.getElementById("btn-cancel-google-chooser");
    const btnUseOther = document.getElementById("btn-use-other-account");
    const btnClose = document.getElementById("btn-close-google-modal");
    
    btnNext.onclick = (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        if (!email || !email.includes("@")) {
            showToast("Vui lòng nhập địa chỉ email hợp lệ!", "error");
            return;
        }
        
        const googleId = "google_id_" + btoa(unescape(encodeURIComponent(email))).replace(/[^a-zA-Z0-9]/g, "").substring(0, 24);
        startSimulatedAuth(email, googleId);
    };
    
    btnUseOther.onclick = (e) => {
        e.preventDefault();
        showEmailStep();
    };
    
    const closeModal = (e) => {
        if (e) e.preventDefault();
        modal.classList.add("hidden");
    };
    
    btnCancel.onclick = closeModal;
    btnCancelChooser.onclick = closeModal;
    btnClose.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.add("hidden");
        }
    };
}

// 1. Initialize layout theme
function applyTheme(themeName) {
    if (themeName === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    } else {
        document.documentElement.setAttribute("data-theme", themeName);
    }
}

function initTheme() {
    const storedTheme = localStorage.getItem("quan_ly_chi_tieu_theme") || "system";
    applyTheme(storedTheme);

    // Lắng nghe thay đổi theme hệ thống
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        const currentTheme = localStorage.getItem("quan_ly_chi_tieu_theme") || "system";
        if (currentTheme === "system") {
            document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
        }
    });
}

// 2. If already logged in, redirect directly to dashboard.html
function checkAuthSession() {
    fetch(`${API_URL}?action=check_session`)
        .then(res => {
            if (!res.ok) return null;
            return res.json().catch(() => null);
        })
        .then(data => {
            if (data && data.authenticated) {
                window.location.href = "dashboard";
            }
        })
        .catch(err => {
            console.warn("Session check notice:", err);
        });
}

// 3. Handle login submission
function handleLoginSubmit(e) {
    e.preventDefault();
    const usernameInput = document.getElementById("login-username").value.trim();
    const passwordInput = document.getElementById("login-password").value;
    const rememberChecked = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : false;

    fetch(`${API_URL}?action=login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameInput, password: passwordInput, remember: rememberChecked })
    })
    .then(async res => {
        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw new Error(!res.ok ? `Lỗi kết nối máy chủ (${res.status}). Vui lòng kiểm tra biến môi trường CSDL trên Vercel.` : "Phản hồi máy chủ không hợp lệ");
        }
        if (!res.ok || !data.success) {
            throw new Error(data.message || "Đăng nhập thất bại");
        }
        return data;
    })
    .then(data => {
        if (data.success) {
            showToast(data.message, "success");
            setTimeout(() => {
                window.location.href = "dashboard";
            }, 1000);
        }
    })
    .catch(err => {
        showToast(err.message, "error");
    });
}

// 4. Toast notifications
function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    const toastMessage = document.getElementById("toast-message");
    const toastIcon = document.getElementById("toast-icon");

    toast.className = "toast";
    toast.classList.add(`toast-${type}`);
    toastMessage.textContent = message;

    const icons = {
        success: "check-circle",
        error: "alert-triangle",
        info: "info"
    };
    toastIcon.setAttribute("data-lucide", icons[type] || "info");
    lucide.createIcons();

    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}
