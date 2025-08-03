// js/login.js
import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

class LoginManager {
    constructor() {
        this.loginForm = document.getElementById('login-form');
        this.loginBtn = document.getElementById('login-btn');
        this.demoBtn = document.getElementById('demo-login');
        this.passwordToggle = document.getElementById('password-toggle');
        this.passwordInput = document.getElementById('login-password');
        this.passwordIcon = document.getElementById('password-icon');
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupAuthListener();
        this.setupPasswordToggle();
    }

    setupEventListeners() {
        // Login form submission
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Demo login button
        this.demoBtn.addEventListener('click', () => {
            this.handleDemoLogin();
        });

        // Enter key support
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !this.loginBtn.disabled) {
                this.handleLogin();
            }
        });
    }

    setupPasswordToggle() {
        this.passwordToggle.addEventListener('click', () => {
            const isPassword = this.passwordInput.type === 'password';
            this.passwordInput.type = isPassword ? 'text' : 'password';
            this.passwordIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
            lucide.createIcons();
        });
    }

    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log('✅ User authenticated:', user.email);
                this.showSuccessMessage('Login successful! Redirecting to dashboard...');
                
                // Redirect to dashboard after short delay
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1500);
            }
        });
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        // Validation
        if (!email || !password) {
            this.showErrorMessage('Please fill in all fields');
            return;
        }

        if (!this.isValidEmail(email)) {
            this.showErrorMessage('Please enter a valid email address');
            return;
        }

        this.setLoadingState(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Success handled by auth state listener
        } catch (error) {
            console.error('❌ Login failed:', error);
            this.handleAuthError(error);
        } finally {
            this.setLoadingState(false);
        }
    }

    async handleDemoLogin() {
        // Demo credentials - replace with your demo account
        const demoEmail = 'demo@restaurant.com';
        const demoPassword = 'demo123456';

        document.getElementById('login-email').value = demoEmail;
        document.getElementById('login-password').value = demoPassword;

        this.showSuccessMessage('Demo credentials loaded. Signing in...');
        
        setTimeout(() => {
            this.handleLogin();
        }, 1000);
    }

    setLoadingState(loading) {
        this.loginBtn.disabled = loading;
        
        const btnText = this.loginBtn.querySelector('.btn-text');
        const btnLoading = this.loginBtn.querySelector('.btn-loading');
        
        if (loading) {
            btnText.style.display = 'none';
            btnLoading.style.display = 'flex';
        } else {
            btnText.style.display = 'flex';
            btnLoading.style.display = 'none';
        }
    }

    handleAuthError(error) {
        let message = 'Login failed. Please try again.';
        
        switch (error.code) {
            case 'auth/user-not-found':
                message = 'No account found with this email address.';
                break;
            case 'auth/wrong-password':
                message = 'Incorrect password. Please try again.';
                break;
            case 'auth/invalid-email':
                message = 'Please enter a valid email address.';
                break;
            case 'auth/user-disabled':
                message = 'This account has been disabled.';
                break;
            case 'auth/too-many-requests':
                message = 'Too many failed attempts. Please try again later.';
                break;
            case 'auth/network-request-failed':
                message = 'Network error. Please check your connection.';
                break;
            default:
                message = error.message || 'An unexpected error occurred.';
        }
        
        this.showErrorMessage(message);
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    showSuccessMessage(message) {
        this.showMessage(message, 'success');
    }

    showErrorMessage(message) {
        this.showMessage(message, 'error');
    }

    showMessage(message, type) {
        const container = document.getElementById('message-container');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const icon = type === 'success' ? 'check-circle' : 'alert-circle';
        messageDiv.innerHTML = `
            <i data-lucide="${icon}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(messageDiv);
        lucide.createIcons();

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.style.animation = 'slideOut 0.3s ease forwards';
                setTimeout(() => {
                    container.removeChild(messageDiv);
                }, 300);
            }
        }, 5000);
    }
}

// Add slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize login manager
const loginManager = new LoginManager();

console.log('🚀 Professional login system loaded!');
