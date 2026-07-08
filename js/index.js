/* ==========================================================================
   INDEX SCRIPT - TYPEWRITER EFFECT & AUTH ROUTING (QUAN LY CHI TIEU)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initSplashScreen();
    checkAuthSession();
    initMobileNav();
    initScrollTypewriter();
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

const API_URL = "api.php";

// 1. Typewriter phrase configuration for Hero Section (only greeting phrase)
const typewriterPhrases = [
    "Định hình tư duy chi tiêu - Làm chủ tương lai tài chính"
];
let typewriterCharIdx = 0;

function runTypewriter() {
    const target = document.getElementById("typewriter-target");
    if (!target) return;

    const currentPhrase = typewriterPhrases[0];

    if (typewriterCharIdx < currentPhrase.length) {
        const typedText = currentPhrase.substring(0, typewriterCharIdx + 1);
        const untypedText = currentPhrase.substring(typewriterCharIdx + 1);
        target.innerHTML = typedText + '<span style="opacity: 0;">' + untypedText + '</span>';
        
        typewriterCharIdx++;
        setTimeout(runTypewriter, Math.random() * 25 + 25);
    } else {
        target.innerHTML = currentPhrase;
        // Make hero items fade in
        const heroActions = document.querySelector(".hero-actions");
        if (heroActions) {
            heroActions.classList.add("fade-in-active");
        }
    }
}

// 2. Initialize layout theme
function applyTheme(themeName) {
    if (themeName === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    } else {
        document.documentElement.setAttribute("data-theme", themeName);
    }
}

function initTheme() {
    if (!localStorage.getItem("qlct_theme_migrated_v3")) {
        localStorage.setItem("quan_ly_chi_tieu_theme", "system");
        localStorage.setItem("qlct_theme_migrated_v3", "1");
    }
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

// 3. Router check: If logged in, redirect directly to dashboard.html
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
            console.error("Session router check error:", err);
            showConnectionError(err.message);
        });
}

function showConnectionError(message) {
    if (document.getElementById("db-connection-error-banner")) return;
    const banner = document.createElement("div");
    banner.id = "db-connection-error-banner";
    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.left = "0";
    banner.style.width = "100%";
    banner.style.backgroundColor = "#ef4444";
    banner.style.color = "#ffffff";
    banner.style.padding = "12px 24px";
    banner.style.textAlign = "center";
    banner.style.fontWeight = "600";
    banner.style.fontSize = "0.95rem";
    banner.style.zIndex = "9999";
    banner.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    banner.style.display = "flex";
    banner.style.justifyContent = "center";
    banner.style.alignItems = "center";
    banner.style.gap = "12px";
    banner.style.fontFamily = "system-ui, -apple-system, sans-serif";

    banner.innerHTML = `
        <span style="font-size: 1.2rem;">⚠️</span>
        <span>${message || "Không thể kết nối đến cơ sở dữ liệu. Vui lòng kiểm tra lại cấu hình hoặc thử lại sau."}</span>
        <button onclick="window.location.reload()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); color: white; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: all 0.2s;">Thử lại</button>
    `;
    document.body.appendChild(banner);
}

// 4. Initialize Welcome Splash Screen
function initSplashScreen() {
    const splash = document.getElementById("iphone-splash-screen");
    if (!splash) {
        document.body.classList.add("splash-completed");
        runTypewriter();
        return;
    }

    if (sessionStorage.getItem("splash_screen_shown")) {
        splash.remove();
        document.body.classList.add("splash-completed");
        runTypewriter();
        return;
    }

    const path1 = document.querySelector(".path-1");
    const path2 = document.querySelector(".path-2");

    if (!path1 || !path2) {
        splash.remove();
        document.body.classList.add("splash-completed");
        runTypewriter();
        return;
    }

    const len1 = path1.getTotalLength();
    const len2 = path2.getTotalLength();

    path1.style.strokeDasharray = len1;
    path1.style.strokeDashoffset = len1;
    path2.style.strokeDasharray = len2;
    path2.style.strokeDashoffset = len2;

    setTimeout(() => {
        path1.style.transition = "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)";
        path1.style.strokeDashoffset = "0";

        setTimeout(() => {
            path2.style.transition = "stroke-dashoffset 1.8s cubic-bezier(0.4, 0, 0.2, 1)";
            path2.style.strokeDashoffset = "0";
        }, 300);
    }, 500);

    setTimeout(() => {
        const subtitle = document.querySelector(".splash-subtitle");
        if (subtitle) subtitle.classList.add("subtitle-visible");
    }, 1600);

    setTimeout(() => {
        splash.classList.add("splash-hidden");
        document.body.classList.add("splash-completed");
        sessionStorage.setItem("splash_screen_shown", "true");

        setTimeout(() => {
            splash.remove();
            runTypewriter();
        }, 800);
    }, 3400);
}

// 5. Initialize Mobile Hamburger Menu
function initMobileNav() {
    const hamburgerBtn = document.getElementById("hamburger-btn");
    const mobileNavDropdown = document.getElementById("mobile-nav-dropdown");
    const icon = document.getElementById("hamburger-icon");

    if (hamburgerBtn && mobileNavDropdown) {
        hamburgerBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            mobileNavDropdown.classList.toggle("active");

            if (mobileNavDropdown.classList.contains("active")) {
                icon.setAttribute("data-lucide", "x");
            } else {
                icon.setAttribute("data-lucide", "menu");
            }
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });

        // Close when clicking outside
        document.addEventListener("click", (e) => {
            if (!mobileNavDropdown.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                if (mobileNavDropdown.classList.contains("active")) {
                    mobileNavDropdown.classList.remove("active");
                    icon.setAttribute("data-lucide", "menu");
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            }
        });
    }
}

// 6. Intersection Observer for scroll-triggered typewriter and fade-in elements
function initScrollTypewriter() {
    const sections = document.querySelectorAll(".landing-scroll-section, .landing-footer");

    const observerOptions = {
        root: null,
        rootMargin: "0px 0px -100px 0px",
        threshold: 0.15
    };

    const sectionObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const section = entry.target;
                section.classList.add("section-visible");

                // Immediately trigger all scroll fades (images, mockup containers, contact grids) in this section
                const fades = section.querySelectorAll(".scroll-fade-in");
                fades.forEach(el => el.classList.add("fade-in-active"));

                sectionObserver.unobserve(section);
            }
        });
    }, observerOptions);

    sections.forEach(sec => {
        sectionObserver.observe(sec);
    });

    // Separate observer to trigger the typewriter animation on active elements
    const typewriterTargets = document.querySelectorAll(".scroll-typewriter-target, .footer-copyright-text");
    const typewriterObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const text = target.getAttribute("data-text") || target.innerText || "";

                // Add a small delay (350ms) so the image and title display first, then typewriter starts
                setTimeout(() => {
                    typeWriterEffect(target, text, 0);
                }, 350);

                typewriterObserver.unobserve(target);
            }
        });
    }, observerOptions);

    typewriterTargets.forEach(target => {
        // Prevent layout shift: Set initial height by injecting the full text invisibly
        const text = target.getAttribute("data-text") || target.innerText || "";
        if (text) {
            target.innerHTML = '<span style="opacity: 0;">' + text + '</span>';
        }
        typewriterObserver.observe(target);
    });
}

function typeWriterEffect(element, text, charIdx, callback) {
    if (charIdx < text.length) {
        const typedText = text.substring(0, charIdx + 1);
        const untypedText = text.substring(charIdx + 1);
        element.innerHTML = typedText + '<span style="opacity: 0;">' + untypedText + '</span>';
        
        setTimeout(() => {
            typeWriterEffect(element, text, charIdx + 1, callback);
        }, Math.random() * 5 + 5);
    } else {
        element.innerHTML = text;
        if (callback) callback();
    }
}
