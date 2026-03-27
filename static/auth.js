const authGuard = document.body.dataset.authGuard || "";
const authMode = document.body.dataset.authMode || "";
const authSettingsKey = "ai_financial_concierge_settings";

function loadStoredSettings() {
    try {
        const raw = localStorage.getItem(authSettingsKey);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        return {};
    }
}

function saveStoredSettings(settings) {
    localStorage.setItem(authSettingsKey, JSON.stringify(settings));
}

function getSupabaseClient() {
    const url = window.SUPABASE_URL || "";
    const anonKey = window.SUPABASE_ANON_KEY || "";
    if (!url || !anonKey || !window.supabase) {
        return null;
    }
    return window.supabase.createClient(url, anonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
}

function showAuthMessage(message, type = "error") {
    const messageNode = document.getElementById("auth-message");
    if (!messageNode) {
        return;
    }
    messageNode.textContent = message;
    messageNode.classList.remove("hidden", "auth-message-error", "auth-message-success");
    messageNode.classList.add(type === "success" ? "auth-message-success" : "auth-message-error");
}

function showRecoveryMessage(message, type = "error") {
    const messageNode = document.getElementById("recovery-message");
    if (!messageNode) {
        return;
    }
    messageNode.textContent = message;
    messageNode.classList.remove("hidden", "auth-message-error", "auth-message-success");
    messageNode.classList.add(type === "success" ? "auth-message-success" : "auth-message-error");
}

function setSubmittingState(form, isSubmitting) {
    if (!form) {
        return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    const fields = form.querySelectorAll("input, button, select");
    fields.forEach(field => {
        field.disabled = isSubmitting;
    });
    if (submitButton) {
        submitButton.dataset.originalLabel = submitButton.dataset.originalLabel || submitButton.textContent;
        submitButton.textContent = isSubmitting ? "Please wait..." : submitButton.dataset.originalLabel;
    }
}

function formatAuthError(error) {
    const message = String(error?.message || error || "").trim();
    if (!message) {
        return "Something went wrong. Please try again.";
    }

    const lowered = message.toLowerCase();
    if (lowered.includes("load failed") || lowered.includes("failed to fetch") || lowered.includes("network")) {
        return "Could not connect to Supabase. Check your internet, project URL, and anon key, then try again.";
    }
    if (lowered.includes("unsupported provider") || lowered.includes("provider is not enabled")) {
        return "Google sign-in is not enabled in your Supabase project yet. Turn on the Google provider in Supabase Authentication > Providers, then try again.";
    }
    if (lowered.includes("email rate limit exceeded")) {
        return "Too many email auth requests were made recently. Please wait a minute before trying again.";
    }
    if (lowered.includes("only request this after")) {
        return message;
    }
    return message;
}

function getDiagnosticsNode() {
    return document.getElementById("auth-diagnostics-list");
}

function renderDiagnostics(items) {
    const node = getDiagnosticsNode();
    if (!node) {
        return;
    }

    node.innerHTML = "";
    items.forEach(item => {
        const row = document.createElement("div");
        row.className = `auth-diagnostic-item auth-diagnostic-${item.status}`;
        row.textContent = `${item.label}: ${item.message}`;
        node.appendChild(row);
    });
}

function buildLocalDiagnostics() {
    const url = (window.SUPABASE_URL || "").trim();
    const anonKey = (window.SUPABASE_ANON_KEY || "").trim();
    const items = [];

    items.push({
        label: "Browser Network",
        status: navigator.onLine ? "ok" : "warn",
        message: navigator.onLine ? "Online" : "Offline or blocked"
    });

    items.push({
        label: "Supabase URL",
        status: url && /^https?:\/\//.test(url) ? "ok" : "error",
        message: url ? "Present" : "Missing from environment"
    });

    items.push({
        label: "Anon Key",
        status: anonKey ? "ok" : "error",
        message: anonKey ? "Present" : "Missing from environment"
    });

    items.push({
        label: "Supabase JS",
        status: window.supabase ? "ok" : "error",
        message: window.supabase ? "Loaded" : "Could not load Supabase client library"
    });

    return items;
}

async function runDiagnostics(client) {
    const diagnostics = buildLocalDiagnostics();

    if (!client) {
        renderDiagnostics(diagnostics);
        return;
    }

    try {
        await client.auth.getSession();
        diagnostics.push({
            label: "Supabase Session Check",
            status: "ok",
            message: "Connection successful"
        });
    } catch (error) {
        diagnostics.push({
            label: "Supabase Session Check",
            status: "error",
            message: formatAuthError(error)
        });
    }

    renderDiagnostics(diagnostics);
}

function hideAuthMessage() {
    const messageNode = document.getElementById("auth-message");
    if (!messageNode) {
        return;
    }
    messageNode.classList.add("hidden");
    messageNode.textContent = "";
}

function hasOAuthCallbackParams() {
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    const params = new URLSearchParams(search);
    return (
        params.has("code") ||
        params.has("access_token") ||
        params.has("refresh_token") ||
        hash.includes("access_token") ||
        hash.includes("refresh_token")
    );
}

function getOAuthCode() {
    const params = new URLSearchParams(window.location.search || "");
    return params.get("code") || "";
}

function getOAuthHashSession() {
    const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
    const params = new URLSearchParams(hash || "");
    const accessToken = params.get("access_token") || "";
    const refreshToken = params.get("refresh_token") || "";

    if (!accessToken || !refreshToken) {
        return null;
    }

    return {
        access_token: accessToken,
        refresh_token: refreshToken
    };
}

function wait(ms) {
    return new Promise(resolve => {
        window.setTimeout(resolve, ms);
    });
}

async function resolveSession(client) {
    const shouldWaitForOAuth = hasOAuthCallbackParams();
    const maxAttempts = shouldWaitForOAuth ? 8 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const { data } = await client.auth.getSession();
        if (data.session?.user) {
            return data.session;
        }

        if (!shouldWaitForOAuth) {
            return null;
        }

        await wait(350);
    }

    return null;
}

async function recoverOAuthSession(client) {
    const hashSession = getOAuthHashSession();
    if (hashSession) {
        try {
            const { data, error } = await client.auth.setSession(hashSession);
            if (error) {
                throw error;
            }

            const cleanUrl = `${window.location.origin}${window.location.pathname}`;
            window.history.replaceState({}, document.title, cleanUrl);
            return data.session || null;
        } catch (error) {
            console.error("OAuth hash session recovery failed", error);
        }
    }

    const code = getOAuthCode();
    if (!code) {
        return null;
    }

    try {
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
            throw error;
        }

        const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash || ""}`;
        window.history.replaceState({}, document.title, cleanUrl);
        return data.session || null;
    } catch (error) {
        console.error("OAuth session recovery failed", error);
        return null;
    }
}

async function applyAuthGuard(client) {
    if (!client) {
        if (authGuard === "protected") {
            window.location.replace("/login");
            return false;
        }
        document.body.classList.remove("auth-pending");
        return false;
    }

    let session = null;
    try {
        session = await recoverOAuthSession(client);
        if (!session) {
            session = await resolveSession(client);
        }
    } catch (error) {
        if (authGuard === "protected") {
            document.body.classList.remove("auth-pending");
            window.location.replace("/login");
            return false;
        }
        document.body.classList.remove("auth-pending");
        showAuthMessage(formatAuthError(error));
        return false;
    }

    if (session?.user) {
        const storedSettings = loadStoredSettings();
        if (!storedSettings.display_name || storedSettings.display_name === "ET User") {
            const email = session.user.email || "";
            const fallbackName = email ? email.split("@")[0] : "ET User";
            saveStoredSettings({
                display_name: fallbackName,
                default_mode: storedSettings.default_mode || "chat",
                default_simplify_level: storedSettings.default_simplify_level || "basic",
                language: storedSettings.language || "english"
            });
        }
    }

    if (authGuard === "protected" && !session) {
        window.location.replace("/login");
        return false;
    }

    if (authGuard === "guest" && session) {
        window.location.replace("/");
        return false;
    }

    document.body.classList.remove("auth-pending");
    return true;
}

function bindLogout(client) {
    const logoutButton = document.getElementById("logout-button");
    if (!logoutButton || !client) {
        return;
    }

    logoutButton.addEventListener("click", async () => {
        await client.auth.signOut();
        window.location.replace("/login");
    });
}

function bindLogin(client) {
    const form = document.getElementById("login-form");
    const recoveryForm = document.getElementById("recovery-form");
    const googleLoginButton = document.getElementById("google-login-button");
    if (!form || !client) {
        return;
    }

    const hash = window.location.hash || "";
    const isRecoveryFlow = hash.includes("type=recovery");
    if (isRecoveryFlow && recoveryForm) {
        form.classList.add("hidden");
        recoveryForm.classList.remove("hidden");
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        hideAuthMessage();

        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;

        setSubmittingState(form, true);
        try {
            const { error } = await client.auth.signInWithPassword({ email, password });
            if (error) {
                showAuthMessage(formatAuthError(error));
                return;
            }

            showAuthMessage("Login successful. Redirecting...", "success");
            window.location.replace("/");
        } catch (error) {
            showAuthMessage(formatAuthError(error));
        } finally {
            setSubmittingState(form, false);
        }
    });

    if (recoveryForm) {
        recoveryForm.addEventListener("submit", async event => {
            event.preventDefault();
            const password = document.getElementById("recovery-password").value;
            const confirmPassword = document.getElementById("recovery-confirm-password").value;

            if (password !== confirmPassword) {
                showRecoveryMessage("Passwords do not match.");
                return;
            }

            setSubmittingState(recoveryForm, true);
            try {
                const { error } = await client.auth.updateUser({ password });
                if (error) {
                    showRecoveryMessage(formatAuthError(error));
                    return;
                }

                showRecoveryMessage("Password updated successfully. You can now log in.", "success");
                setTimeout(() => {
                    window.location.replace("/login");
                }, 1200);
            } catch (error) {
                showRecoveryMessage(formatAuthError(error));
            } finally {
                setSubmittingState(recoveryForm, false);
            }
        });
    }

    googleLoginButton?.addEventListener("click", async () => {
        hideAuthMessage();
        googleLoginButton.disabled = true;
        try {
            const { error } = await client.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: `${window.location.origin}/`
                }
            });
            if (error) {
                showAuthMessage(formatAuthError(error));
            }
        } catch (error) {
            showAuthMessage(formatAuthError(error));
        } finally {
            googleLoginButton.disabled = false;
        }
    });
}

function bindSignup(client) {
    const form = document.getElementById("signup-form");
    const googleSignupButton = document.getElementById("google-signup-button");
    if (!form || !client) {
        return;
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        hideAuthMessage();

        const email = document.getElementById("signup-email").value.trim();
        const password = document.getElementById("signup-password").value;
        const confirmPassword = document.getElementById("signup-confirm-password").value;

        if (password !== confirmPassword) {
            showAuthMessage("Passwords do not match.");
            return;
        }

        setSubmittingState(form, true);
        try {
            const { data, error } = await client.auth.signUp({ email, password });
            if (error) {
                showAuthMessage(formatAuthError(error));
                return;
            }

            const userEmail = data?.user?.email || email;
            if (data?.session) {
                showAuthMessage("Sign-up successful. Redirecting to your dashboard...", "success");
                window.location.replace("/");
                return;
            }

            showAuthMessage(`Sign-up successful for ${userEmail}. You can log in right away.`, "success");
        } catch (error) {
            showAuthMessage(formatAuthError(error));
        } finally {
            setSubmittingState(form, false);
        }
    });

    googleSignupButton?.addEventListener("click", async () => {
        hideAuthMessage();
        googleSignupButton.disabled = true;
        try {
            const { error } = await client.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: `${window.location.origin}/`
                }
            });
            if (error) {
                showAuthMessage(formatAuthError(error));
            }
        } catch (error) {
            showAuthMessage(formatAuthError(error));
        } finally {
            googleSignupButton.disabled = false;
        }
    });
}

function bindForgotPassword(client) {
    const form = document.getElementById("forgot-password-form");
    if (!form || !client) {
        return;
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        hideAuthMessage();

        const email = document.getElementById("forgot-password-email").value.trim();
        setSubmittingState(form, true);
        try {
            const { error } = await client.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/login`
            });

            if (error) {
                showAuthMessage(formatAuthError(error));
                return;
            }

            showAuthMessage("Reset link sent. Check your email.", "success");
        } catch (error) {
            showAuthMessage(formatAuthError(error));
        } finally {
            setSubmittingState(form, false);
        }
    });
}

async function initAuthPage() {
    const client = getSupabaseClient();
    const retryButton = document.getElementById("auth-diagnostics-retry");

    if (retryButton) {
        retryButton.addEventListener("click", async () => {
            const freshClient = getSupabaseClient();
            await runDiagnostics(freshClient);
        });
    }

    await runDiagnostics(client);

    if (!client) {
        showAuthMessage("Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY to your environment.");
        document.body.classList.remove("auth-pending");
        return;
    }

    const canContinue = await applyAuthGuard(client);
    if (!canContinue) {
        return;
    }

    client.auth.onAuthStateChange((event, session) => {
        if (session?.user && authGuard === "guest") {
            window.location.replace("/");
            return;
        }

        if (!session && authGuard === "protected" && event === "SIGNED_OUT") {
            window.location.replace("/login");
        }
    });

    bindLogout(client);
    bindLogin(client);
    bindSignup(client);
    bindForgotPassword(client);
}

document.addEventListener("DOMContentLoaded", initAuthPage);
