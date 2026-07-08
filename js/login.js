/* ==========================================================================
   LOGIN SCRIPT - CREDENTIALS VERIFICATION & ROUTING (QUAN LY CHI TIEU)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    checkAuthSession();
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

// Initialize Google OAuth2 Token Client if client_id is set
function initGoogleAuth() {
    fetch('api.php?action=get_google_client_id')
        .then(res => res.json())
        .then(data => {
            const clientId = data.client_id;
            if (!clientId) {
                console.log("No Google Client ID configured. Using high-fidelity simulated sign-in mode.");
                return;
            }
            if (window.google && window.google.accounts) {
                googleTokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
                    callback: (tokenResponse) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            handleGoogleToken(tokenResponse.access_token);
                        } else {
                            showToast("Không nhận được Access Token từ Google.", "error");
                        }
                    }
                });
            }
        })
        .catch(err => {
            console.error("Lỗi cấu hình Google OAuth:", err);
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
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.message || "Xác thực Google thất bại"); });
        }
        return res.json();
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
                window.location.href = "dashboard.html";
            }, 1000);
        }
    })
    .catch(err => {
        modal.classList.add("hidden");
        showToast(err.message, "error");
    });
}

// Trigger Google Sign-In (Real or Simulated)
function triggerGoogleAuthSimulated() {
    const rememberChecked = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : false;
    
    if (googleTokenClient) {
        googleTokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
    }
    const modal = document.getElementById("google-sim-modal");
    const emailInput = document.getElementById("google-sim-email");
    const emailStep = document.getElementById("google-email-step");
    const chooserStep = document.getElementById("google-chooser-step");
    const loadingStep = document.getElementById("google-loading-step");
    
    // Reset state
    emailInput.value = "";
    emailStep.classList.add("hidden");
    chooserStep.classList.add("hidden");
    loadingStep.classList.add("hidden");
    modal.classList.remove("hidden");
    
    const accounts = getSavedGoogleAccounts();
    
    const showEmailStep = () => {
        chooserStep.classList.add("hidden");
        emailStep.classList.remove("hidden");
        emailInput.focus();
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
            .then(res => {
                if (!res.ok) {
                    return res.json().then(err => { throw new Error(err.message || "Xác thực Google thất bại"); });
                }
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    const finalAvatar = data.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(email.split('@')[0]) + '&background=059669&color=fff&size=128');
                    saveGoogleAccount(email, googleId, email.split('@')[0], finalAvatar);
                    
                    modal.classList.add("hidden");
                    showToast(data.message, "success");
                    setTimeout(() => {
                        window.location.href = "dashboard.html";
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

const API_URL = "api.php";

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
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || "Lỗi kết nối cơ sở dữ liệu"); });
            }
            return res.json();
        })
        .then(data => {
            if (data.authenticated) {
                window.location.href = "dashboard.html";
            }
        })
        .catch(err => {
            console.error("Session check error:", err);
            showToast(err.message, "error");
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
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.message || "Đăng nhập thất bại"); });
        }
        return res.json();
    })
    .then(data => {
        if (data.success) {
            showToast(data.message, "success");
            setTimeout(() => {
                window.location.href = "dashboard.html";
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
