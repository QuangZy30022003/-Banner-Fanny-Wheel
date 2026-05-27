/* ==========================================================================
   Fanny Ice Cream - Simplified Lucky Wheel JS Engine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const wheel = document.getElementById('wheel-element');
    const wheelWrapper = document.getElementById('wheel-wrapper');
    const spinBtn = document.getElementById('spin-btn');
    const ctaBtn = document.getElementById('cta-btn');
    
    // Modal elements
    const rewardModal = document.getElementById('reward-modal');
    const modalPrizeName = document.getElementById('modal-prize-name');
    
    // New Modal elements for steps
    const modalRibbon = document.getElementById('modal-ribbon');
    const btnGoToClaim = document.getElementById('go-to-claim');
    const btnCloseModal1 = document.getElementById('close-modal-1');
    const btnSubmitClaim = document.getElementById('submit-claim');
    const btnGoBackReveal = document.getElementById('go-back-reveal');
    const btnCloseModalSuccess = document.getElementById('close-modal-success');
    
    const claimNameInput = document.getElementById('claim-name');
    const claimPhoneInput = document.getElementById('claim-phone');
    const claimErrorMsg = document.getElementById('claim-error');
    const successCodeEl = document.getElementById('success-code');
    
    // History Panel elements
    const historyBtn = document.getElementById('history-btn');
    const historyPanel = document.getElementById('history-panel');
    const historyCloseBtn = document.getElementById('history-close');
    const historyList = document.getElementById('history-list');

    // Confetti canvas inside banner
    const bannerConfettiCanvas = document.getElementById('banner-confetti');
    const bannerConfettiCtx = bannerConfettiCanvas.getContext('2d');

    // --- State Variables ---
    let isSpinning = false;
    let isDemoSpinning = false;
    let currentRotation = 0;
    let currentWinningPrize = null;
    let inactivityTimer = null;
    
    // Audio Context (lazily initialized on first interaction)
    let audioCtx = null;

    // --- Prizes Mapping (8 segments, 45 deg each) ---
    // Pointer in muiten.png is pointing to the upper-left (~135 degrees)
    const prizes = [
        { name: "Mochi Kem Fanny Lạnh" },
        { name: "1 Phần Kem Viên Fanny" },
        { name: "Dù (Ô) Fanny Cao Cấp" },
        { name: "Túi Vải Fanny Thân Thiện" },
        { name: "1 Hộp Kem Fanny 475ml" },
        { name: "1 Lẩu Kem Fanny Đặc Biệt" },
        { name: "Túi Vải Fanny Thân Thiện" },
        { name: "1 Phần Kem Viên Fanny" }
    ];

    // --- Audio Synthesis Engine ---
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playTickSound() {
        if (!audioCtx) return;
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        // High-pitched click sound
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.04);
        
        gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    }

    function playWinSound() {
        if (!audioCtx) return;
        
        const now = audioCtx.currentTime;
        // Festive ascending chords
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            
            gainNode.gain.setValueAtTime(0.12, now + idx * 0.08);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
            
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.4);
        });
    }

    // --- Modal Step Navigation Helper ---
    function showModalStep(stepId) {
        const steps = ['step-reveal', 'step-form', 'step-success'];
        steps.forEach(id => {
            const el = document.getElementById(id);
            if (id === stepId) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    // --- Unique Claim Code Generator ---
    function generateClaimCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = 'FN-';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // --- LocalStorage History Management ---
    const STORAGE_KEY = 'fanny_wheel_history';

    function getHistory() {
        const history = localStorage.getItem(STORAGE_KEY);
        return history ? JSON.parse(history) : [];
    }

    function saveToHistory(item) {
        const history = getHistory();
        history.unshift(item); // Add newest on top
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        updateHistoryUI();
    }

    function updateHistoryUI() {
        const history = getHistory();
        if (history.length === 0) {
            historyList.innerHTML = '<div class="no-history">Chưa có lịch sử quay thưởng.</div>';
            return;
        }
        
        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-item-info">
                    <span class="history-item-prize">${item.prize}</span>
                    <span class="history-item-date">${item.date} - ${item.name} (${item.phone})</span>
                </div>
                <div class="history-item-code">${item.code}</div>
            </div>
        `).join('');
    }

    // --- Auto-Demo Spin Timer & Logic ---
    function resetInactivityTimer() {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
        }
        
        const isModalOpen = rewardModal.classList.contains('show');
        const isHistoryOpen = historyPanel.classList.contains('show');
        
        if (!isSpinning && !isDemoSpinning && !isModalOpen && !isHistoryOpen) {
            inactivityTimer = setTimeout(triggerDemoSpin, 5000);
        }
    }

    function triggerDemoSpin() {
        if (isSpinning || isDemoSpinning) return;
        isDemoSpinning = true;
        
        initAudio();
        
        // Remove idle rotation class during active demo spin
        wheelWrapper.classList.remove('idle-spin');
        
        const startRotation = currentRotation % 360;
        const targetRotation = startRotation + 360;
        const duration = 1500;
        const startTime = performance.now();
        
        let lastPlayedSliceIndex = Math.floor(((135 - startRotation) % 360 + 360) % 360 / 45);
        
        function updateDemoSpin(currentTime) {
            const elapsedTime = currentTime - startTime;
            
            if (elapsedTime >= duration) {
                currentRotation = targetRotation;
                wheel.style.transform = `rotate(${currentRotation}deg)`;
                isDemoSpinning = false;
                
                // Re-enable slow idle spin
                wheelWrapper.classList.add('idle-spin');
                resetInactivityTimer();
                return;
            }
            
            // Ease In Out Cubic curve
            const progress = elapsedTime / duration;
            const easeProgress = progress < 0.5 
                ? 4 * progress * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                
            const currentAngle = startRotation + (targetRotation - startRotation) * easeProgress;
            currentRotation = currentAngle;
            wheel.style.transform = `rotate(${currentAngle}deg)`;
            
            // Play audio click on crossing slice boundary
            const currentPointerAngle = ((135 - currentAngle) % 360 + 360) % 360;
            const currentSliceIndex = Math.floor(currentPointerAngle / 45);
            
            if (currentSliceIndex !== lastPlayedSliceIndex) {
                playTickSound();
                lastPlayedSliceIndex = currentSliceIndex;
            }
            
            requestAnimationFrame(updateDemoSpin);
        }
        
        requestAnimationFrame(updateDemoSpin);
    }

    // --- Confetti Particle System (Within Banner) ---
    let confettis = [];
    let confettiActive = false;

    function resizeCanvas() {
        bannerConfettiCanvas.width = 300;
        bannerConfettiCanvas.height = 250;
    }
    resizeCanvas();

    class Confetti {
        constructor() {
            // Erupt from the wheel center (X=243, Y=190)
            this.x = 243;
            this.y = 190;
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 4;
            
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed - (Math.random() * 2 + 1);
            this.size = Math.random() * 4 + 2;
            this.color = `hsl(${Math.random() * 360}, 90%, 60%)`;
            this.opacity = 1.0;
            this.decay = Math.random() * 0.015 + 0.01;
            this.gravity = 0.15;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += this.gravity;
            this.vx *= 0.98;
            this.opacity -= this.decay;
        }

        draw() {
            bannerConfettiCtx.save();
            bannerConfettiCtx.globalAlpha = this.opacity;
            bannerConfettiCtx.fillStyle = this.color;
            bannerConfettiCtx.beginPath();
            bannerConfettiCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            bannerConfettiCtx.fill();
            bannerConfettiCtx.restore();
        }
    }

    function triggerConfetti() {
        confettis = [];
        confettiActive = true;
        for (let i = 0; i < 70; i++) {
            confettis.push(new Confetti());
        }
    }

    function animateConfetti() {
        bannerConfettiCtx.clearRect(0, 0, bannerConfettiCanvas.width, bannerConfettiCanvas.height);
        
        if (confettiActive) {
            confettis.forEach((c, index) => {
                c.update();
                c.draw();
                if (c.opacity <= 0) {
                    confettis.splice(index, 1);
                }
            });
            
            if (confettis.length === 0) {
                confettiActive = false;
            }
        }
        requestAnimationFrame(animateConfetti);
    }
    animateConfetti();

    // --- Spinning Physics & Animation ---
    function spinWheel() {
        if (isSpinning || isDemoSpinning) return;
        
        // Cancel inactivity timer
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
        }
        
        initAudio();
        isSpinning = true;
        
        // Add class to hide alternating text and gifts during the spin
        document.getElementById('lucky-banner').classList.add('spinning');
        
        // Random prize selection
        const targetPrizeIndex = Math.floor(Math.random() * prizes.length);
        const selectedPrize = prizes[targetPrizeIndex];
        currentWinningPrize = selectedPrize.name;
        
        // Equation to align target sector center with the pointer (pointing to ~135 degrees)
        const baseTargetAngle = 135 - (targetPrizeIndex * 45 + 22.5);
        const fullSpins = 8 + Math.floor(Math.random() * 4);
        const startRotation = currentRotation % 360;
        const targetRotation = startRotation + (fullSpins * 360) + (baseTargetAngle - startRotation);
        
        const duration = 5000;
        const startTime = performance.now();
        
        let lastPlayedSliceIndex = Math.floor(((135 - startRotation) % 360 + 360) % 360 / 45);

        // Remove idle rotation
        wheelWrapper.classList.remove('idle-spin');

        function updateSpin(currentTime) {
            const elapsedTime = currentTime - startTime;
            
            if (elapsedTime >= duration) {
                currentRotation = targetRotation;
                wheel.style.transform = `rotate(${currentRotation}deg)`;
                isSpinning = false;
                
                // Victory effects
                playWinSound();
                triggerConfetti();
                
                // Reveal reward modal
                setTimeout(() => {
                    modalPrizeName.textContent = selectedPrize.name;
                    
                    // Reset modal steps
                    showModalStep('step-reveal');
                    modalRibbon.textContent = 'CHÚC MỪNG!';
                    
                    // Reset inputs
                    claimNameInput.value = '';
                    claimPhoneInput.value = '';
                    claimErrorMsg.classList.remove('show');
                    
                    rewardModal.classList.add('show');
                }, 800);
                
                return;
            }
            
            // Easing Out Quintic
            const progress = elapsedTime / duration;
            const easeProgress = 1 - Math.pow(1 - progress, 5);
            const currentAngle = startRotation + (targetRotation - startRotation) * easeProgress;
            
            currentRotation = currentAngle;
            wheel.style.transform = `rotate(${currentAngle}deg)`;
            
            // Ticker sound logic
            const currentPointerAngle = ((135 - currentAngle) % 360 + 360) % 360;
            const currentSliceIndex = Math.floor(currentPointerAngle / 45);
            
            if (currentSliceIndex !== lastPlayedSliceIndex) {
                playTickSound();
                lastPlayedSliceIndex = currentSliceIndex;
            }
            
            requestAnimationFrame(updateSpin);
        }
        
        requestAnimationFrame(updateSpin);
    }

    // --- Interactive Listeners ---
    
    // Clicking ANYWHERE on the banner container starts the spin!
    const bannerContainer = document.getElementById('lucky-banner');
    bannerContainer.addEventListener('click', (e) => {
        // Prevent click if spinning, or clicking interactive elements/modals
        if (isSpinning || isDemoSpinning) return;
        
        // Ignore clicks if clicked inside the history panel or on interactive triggers
        if (historyPanel.classList.contains('show')) return;
        
        spinWheel();
    });

    // Spin trigger (Center "QUAY" button)
    spinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        spinWheel();
    });

    // CTA Trigger ("THAM GIA NGAY" button)
    ctaBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        spinWheel();
    });
    
    // --- New Modal & Form Step Interactive Listeners ---
    
    // Step 1: Click "Nhận Quà Ngay" -> Switch to Step 2
    btnGoToClaim.addEventListener('click', (e) => {
        e.stopPropagation();
        modalRibbon.textContent = 'ĐĂNG KÝ QUÀ';
        showModalStep('step-form');
    });
    
    // Step 1: Skip / Cancel -> Close Modal
    btnCloseModal1.addEventListener('click', (e) => {
        e.stopPropagation();
        rewardModal.classList.remove('show');
        document.getElementById('lucky-banner').classList.remove('spinning');
        wheelWrapper.classList.add('idle-spin');
        resetInactivityTimer();
    });

    // Step 2: Go Back to Step 1
    btnGoBackReveal.addEventListener('click', (e) => {
        e.stopPropagation();
        modalRibbon.textContent = 'CHÚC MỪNG!';
        showModalStep('step-reveal');
    });

    // Step 2: Submit Form -> Validate & Save to History -> Switch to Step 3
    btnSubmitClaim.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const name = claimNameInput.value.trim();
        const phone = claimPhoneInput.value.trim();
        
        // Simple Real Validation
        if (!name) {
            claimErrorMsg.textContent = 'Vui lòng nhập họ và tên!';
            claimErrorMsg.classList.add('show');
            return;
        }
        
        const phoneRegex = /^[0-9]{10,11}$/;
        if (!phone || !phoneRegex.test(phone)) {
            claimErrorMsg.textContent = 'Số điện thoại gồm 10-11 chữ số!';
            claimErrorMsg.classList.add('show');
            return;
        }
        
        claimErrorMsg.classList.remove('show');
        
        // Generate Reward Code
        const claimCode = generateClaimCode();
        successCodeEl.textContent = claimCode;
        
        // Save to LocalStorage History
        const formattedDate = new Date().toLocaleDateString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        saveToHistory({
            prize: currentWinningPrize,
            name: name,
            phone: phone,
            code: claimCode,
            date: formattedDate
        });
        
        // Show Success Step
        modalRibbon.textContent = 'NHẬN THÀNH CÔNG';
        showModalStep('step-success');
    });

    // Step 3: Complete & Close Modal
    btnCloseModalSuccess.addEventListener('click', (e) => {
        e.stopPropagation();
        rewardModal.classList.remove('show');
        document.getElementById('lucky-banner').classList.remove('spinning');
        wheelWrapper.classList.add('idle-spin');
        resetInactivityTimer();
    });

    // --- History Panel Slide-over Listeners ---
    
    // Open History Panel
    if (historyBtn) {
        historyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Stop any inactivity timer
            if (inactivityTimer) {
                clearTimeout(inactivityTimer);
            }
            
            updateHistoryUI();
            historyPanel.classList.add('show');
        });
    }

    // Close History Panel
    historyCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        historyPanel.classList.remove('show');
        resetInactivityTimer();
    });
    
    // --- Global Banner Interaction Event Listeners to reset Inactivity Timer ---
    ['mousemove', 'mouseenter', 'mouseleave', 'click', 'touchstart'].forEach(evt => {
        bannerContainer.addEventListener(evt, resetInactivityTimer);
    });

    // Initialize UI and Start First Timer
    wheelWrapper.classList.add('idle-spin');
    updateHistoryUI();
    resetInactivityTimer();
});
