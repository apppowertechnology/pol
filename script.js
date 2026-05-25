// Firebase Configuration
const firebaseConfig = {
    databaseURL: "https://polsa-e6958-default-rtdb.firebaseio.com/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// State Management
let featureSettings = {};
let currentCourses = [];
const logoImg = new Image();
logoImg.src = 'logo.png.png';

// Voting Price State
let votePrice = 100;
db.ref('votingSettings/pricePerVote').on('value', snap => {
    votePrice = snap.exists() ? snap.val() : 100;
    // Dynamically update UI if modal is visible
    if (!document.getElementById('vote-modal').classList.contains('hidden')) {
        updateVoteAmount();
    }
});

// Premium Controls State
let premiumControls = { cgpaPaymentRequired: true };
db.ref('polsaSettings/premiumControls').on('value', snap => {
    if (snap.exists()) premiumControls = snap.val();
});

const adminSignatureImg = new Image();
adminSignatureImg.crossOrigin = "anonymous";

db.ref('polsaSettings/adminSignature').on('value', snap => {
    adminSignatureImg.src = snap.exists() ? snap.val() : "";
});

// Device ID for tracking free usage and payments
let deviceId = localStorage.getItem('polsa_device_id');
if (!deviceId) {
    deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    localStorage.setItem('polsa_device_id', deviceId);
}

// Anonymous Identity
let anonId = localStorage.getItem('polsa_anon_id');
if (!anonId) {
    anonId = 'POL-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    localStorage.setItem('polsa_anon_id', anonId);
}

window.addEventListener('load', initMoodSelector);

// Visitor Tracking
(function trackVisitor() {
    const lastVisit = localStorage.getItem('polsa_last_visit');
    const today = new Date().toISOString().split('T')[0];
    if (lastVisit !== today) {
        db.ref('analytics/totalVisits').transaction(c => (c || 0) + 1);
        db.ref('analytics/dailyVisits').child(today).transaction(c => (c || 0) + 1);
        localStorage.setItem('polsa_last_visit', today);
    }
})();

// Initialize settings from Firebase
db.ref('featureSettings').on('value', (snapshot) => {
    if (snapshot.exists()) {
        featureSettings = snapshot.val();
        syncFeatureVisibility();
    }
});

// Listen for Maintenance Mode
db.ref('polsaSettings/maintenanceMode').on('value', snap => {
    const isMaintenance = !!snap.val();
    const screen = document.getElementById('maintenance-screen');
    const main = document.getElementById('main-content');
    const nav = document.querySelector('.navbar');
    const bottomNav = document.querySelector('.bottom-nav');
    const footer = document.querySelector('.footer');

    if (isMaintenance) {
        screen?.classList.remove('hidden');
        main?.classList.add('hidden');
        nav?.classList.add('hidden');
        bottomNav?.classList.add('hidden');
        footer?.classList.add('hidden');
    } else {
        screen?.classList.add('hidden');
        main?.classList.remove('hidden');
        nav?.classList.remove('hidden');
        bottomNav?.classList.remove('hidden');
        footer?.classList.remove('hidden');
    }
});

// Listen for Court Link
db.ref('polsaSettings/courtLink').on('value', (snap) => {
    const link = snap.val() || "about:blank";
    const iframe = document.getElementById('court-iframe');
    if(iframe && iframe.src !== link) {
        document.getElementById('court-loader').style.display = 'block';
        iframe.src = link;
    }
});

// Handle Notification Registration
if ('Notification' in window) {
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            subscribeToNotifications();
        }
    });
}

// Listen for News Link
db.ref('polsaSettings/newsLink').on('value', (snap) => {
    const link = (snap.val() && snap.val() !== "about:blank") ? snap.val() : "https://polsablog.blogspot.com";
    if (link) {
        loadCleanNews(link);
    }
});

function retryNewsLoad() {
    db.ref('polsaSettings/newsLink').once('value', snap => {
        const link = snap.val() || "https://polsablog.blogspot.com";
        loadCleanNews(link);
    });
}

function toggleNewsDebug() {
    const debugBox = document.getElementById('news-debug-info');
    if (debugBox) {
        debugBox.classList.toggle('hidden');
    }
}

// Connection Status Listeners
window.addEventListener('online', () => document.getElementById('offline-banner')?.classList.add('hidden'));
window.addEventListener('offline', () => document.getElementById('offline-banner')?.classList.remove('hidden'));

window.addEventListener('load', () => {
    // Check initial status
    if (!navigator.onLine) document.getElementById('offline-banner')?.classList.remove('hidden');
});

async function loadCleanNews(url) {
    const viewport = document.getElementById('news-reader-viewport');
    const loader = document.getElementById('news-loader');
    if (!viewport) return;

    if (loader) loader.style.display = 'block';
    viewport.innerHTML = '';
    let loadStage = "Connecting to Proxy";

    try {
        let contents = null;
        const encodedUrl = encodeURIComponent(url);

        // Attempt 1: AllOrigins (Primary)
        try {
            const response = await fetch(`https://api.allorigins.win/get?url=${encodedUrl}`);
            if (response.ok) {
                const data = await response.json();
                contents = data.contents;
            }
        } catch (e) { console.warn("Primary proxy connection failed."); }

        // Attempt 2: CodeTabs (Highly reliable fallback for Blogspot)
        if (!contents) {
            loadStage = "Connecting to Secondary Proxy";
            const ctRes = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodedUrl}`);
            if (ctRes.ok) contents = await ctRes.text();
        }

        // Attempt 3: CorsProxy.io (Final Fallback)
        if (!contents) {
            loadStage = "Connecting to Fallback Proxy";
            const fallbackRes = await fetch(`https://corsproxy.io/?${encodedUrl}`);
            if (fallbackRes.ok) contents = await fallbackRes.text();
        }

        if (!contents) throw new Error("Failed to connect to news source through available proxies.");

        loadStage = "Parsing HTML Structure";
        const parser = new DOMParser();
        const doc = parser.parseFromString(contents, 'text/html');

        // Security: Intercept any stray link clicks to prevent external navigation
        viewport.onclick = (e) => {
            if (e.target.closest('a')) {
                e.preventDefault();
                return false;
            }
        };

        // 1. Extract Metadata
        const title = doc.querySelector('h1.post-title, h1.entry-title, h1')?.innerText || doc.title || "News Update";
        const author = doc.querySelector('[rel="author"], .author, .byline, .post-author')?.innerText || "";
        const date = doc.querySelector('time, .date, .published')?.innerText || "";

        loadStage = "Extracting Article Body";
        // 2. Extract Main Content (Expanded Heuristics)
        const articleSelectors = [
            '.post-body', 'article', '.article-content', '.post-content', 
            '.entry-content', '.article-body', '#article-body', 'main', '.main'
        ];
        
        let contentRoot = null;
        for (let selector of articleSelectors) {
            contentRoot = doc.querySelector(selector);
            // Heuristic: Ensure the found container actually has substantial text content
            if (contentRoot && contentRoot.innerText.trim().length > 50) break;
        }
        if (!contentRoot || contentRoot.innerText.trim().length < 10) contentRoot = doc.body;

        // 3. Build Header Section
        const newsHeader = document.createElement('div');
        newsHeader.className = 'news-header';
        newsHeader.innerHTML = `<h1>${title}</h1>`;
        if (author || date) {
            const meta = document.createElement('div');
            meta.className = 'news-meta';
            meta.innerHTML = `
                ${author ? `<span><i class="fas fa-user-edit"></i> ${author.trim()}</span>` : ''} 
                ${date ? `<span><i class="fas fa-clock"></i> ${date.trim()}</span>` : ''}
                <span><i class="fas fa-shield-alt"></i> Verified Content</span>
            `;
            newsHeader.appendChild(meta);
        }

        const container = document.createElement('div');
        container.className = 'news-reader-content';
        container.appendChild(newsHeader);

        const cleanFragment = document.createDocumentFragment();
        const processedNodes = new Set();

        // Whitelist tags for Reader Mode
        const allowedTags = ['P', 'H2', 'H3', 'H4', 'IMG', 'UL', 'OL', 'LI', 'BLOCKQUOTE'];
        
        if (!contentRoot) contentRoot = doc.body;
        const walker = doc.createTreeWalker(contentRoot, NodeFilter.SHOW_ELEMENT);

        while(walker.nextNode()) {
            let currentNode = walker.currentNode;
            if (allowedTags.includes(currentNode.tagName) && !processedNodes.has(currentNode)) {
                const clone = currentNode.cloneNode(true);
                let shouldAppend = true;
                
                // Handle Images (Resolve relative URLs and support lazy-loading)
                if (clone.tagName === 'IMG') {
                    try {
                        const rawSrc = clone.getAttribute('src') || clone.getAttribute('data-src');
                        if (rawSrc) {
                            clone.src = new URL(rawSrc, url).href;
                            clone.removeAttribute('srcset'); // Remove responsive clutter
                            clone.removeAttribute('width');
                            clone.removeAttribute('height');
                        } else {
                            shouldAppend = false;
                        }
                    } catch(e) { 
                        shouldAppend = false; // Skip this specific image if URL is malformed
                    }
                }
                
                if (shouldAppend) {
                    // Mark children as processed to avoid duplication
                    currentNode.querySelectorAll('*').forEach(child => processedNodes.add(child));

                    // Remove all attributes except essential ones to ensure a clean native view
                    if (clone.tagName !== 'IMG') {
                        while(clone.attributes.length > 0) clone.removeAttribute(clone.attributes[0].name);
                    }
                    cleanFragment.appendChild(clone);
                }
            }
        }

        container.appendChild(cleanFragment);
        viewport.appendChild(container);

    } catch (err) {
        console.error("Reader Mode Error:", err);
        viewport.innerHTML = `<div class="news-reader-error" style="text-align:center; padding: 40px 20px;">
            <i class="fas fa-exclamation-circle"></i><br><br>
            The content could not be displayed internally at this time.<br>
            <p style="font-size: 0.8rem; color: #888; margin: 10px 0;">Error: ${err.message || 'Structure mismatch'}</p>
            <div id="news-debug-info" class="hidden" style="background: #f8f8f8; color: #333; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: left; font-family: monospace; font-size: 0.7rem; border: 1px solid #ddd; word-break: break-all;">
                <strong>Diagnostic Log:</strong><br>
                URL: ${url}<br>
                Stage: ${loadStage}<br>
                Time: ${new Date().toLocaleTimeString()}
            </div>
            <button class="btn-primary" onclick="retryNewsLoad()" style="margin-top:15px; padding: 8px 20px;">Retry Loading</button>
            <button class="btn-secondary" onclick="toggleNewsDebug()" style="margin-top:15px; padding: 8px 20px;">Debug Info</button>
        </div>`;
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// Social Media Sync
db.ref('polsaSettings/socialLinks').on('value', snap => {
    const links = snap.val() || {};
    const container = document.getElementById('social-icons-list');
    if(!container) return;
    container.innerHTML = '';
    const platforms = [
        {key: 'facebook', icon: 'fa-facebook'}, {key: 'instagram', icon: 'fa-instagram'},
        {key: 'x', icon: 'fa-brands fa-x-twitter'}, {key: 'tiktok', icon: 'fa-tiktok'},
        {key: 'whatsapp', icon: 'fa-whatsapp'}, {key: 'youtube', icon: 'fa-youtube'}
    ];
    platforms.forEach(p => {
        if(links[p.key]) container.innerHTML += `<a href="${links[p.key]}" target="_blank"><i class="fab ${p.icon}"></i></a>`;
    });
});

// PWA Installation Logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-container')?.classList.remove('hidden');
});

// Check for installation status and handle iOS visibility on load
window.addEventListener('load', () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) {
        document.getElementById('install-container')?.classList.add('hidden');
        return;
    }

    // iOS detection for manual install instructions as the beforeinstallprompt event won't fire
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
        const container = document.getElementById('install-container');
        const btn = document.getElementById('install-app-btn');
        if (container) container.classList.remove('hidden');
        if (btn) btn.innerText = 'How to Install';
    }
});

async function installPWA() {
    if (!deferredPrompt) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            alert("To install POLSA GRADE on iPhone:\n1. Tap the 'Share' icon in Safari.\n2. Select 'Add to Home Screen' from the menu.");
        }
        return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        document.getElementById('install-container').classList.add('hidden');
        trackUsage('app_installation');
    }
    deferredPrompt = null;
}

let freeCalcUsed = localStorage.getItem('polsa_free_used') === 'true';

// Navigation & Access Control
function goBack() {
    const overlay = document.getElementById('anon-reveal-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        window.history.back();
        return;
    }

    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = "index.html";
    }
}

window.addEventListener('popstate', (event) => {
    const overlay = document.getElementById('anon-reveal-overlay');
    if (overlay) overlay.classList.add('hidden');

    const voteModal = document.getElementById('vote-modal');
    if (voteModal) voteModal.classList.add('hidden');

    if (event.state && event.state.sectionId) {
        // Handle internal navigation for voting contestants
        if (event.state.sectionId === 'voting-section' && event.state.subView === 'contestants') {
            showSection('voting-section', false, false);
            viewContestants(event.state.categoryId, false);
        } else {
            showSection(event.state.sectionId, false);
        }
    } else {
        showSection('home', false);
    }
});

function showSection(sectionId, push = true, resetVoting = true) {
    if (sectionId === 'cgpa-calc' && !featureSettings.cgpa) {
        alert("The CGPA Calculator is currently disabled by Admin.");
        return;
    }
    if (sectionId === 'period-calc' && !featureSettings.period) {
        alert("The Period Calculator is currently disabled by Admin.");
        return;
    }
    if (sectionId === 'voting-section' && featureSettings.voting === false) {
        alert("The Campus Voting feature is currently disabled by Admin.");
        return;
    }

    if (push) {
        const hash = sectionId === 'home' ? '' : `#${sectionId}`;
        history.pushState({ sectionId }, '', window.location.pathname + hash);
    }

    // Ensure voting view resets to categories unless specifically navigating to contestants
    if (sectionId === 'voting-section' && resetVoting) {
        const catList = document.getElementById('voting-categories-list');
        const conList = document.getElementById('voting-contestants-list');
        if (catList) catList.classList.remove('hidden');
        if (conList) conList.classList.add('hidden');
    }

    const backBtn = document.getElementById('back-nav-btn');
    if (backBtn) {
        if (sectionId === 'home') backBtn.classList.add('hidden');
        else backBtn.classList.remove('hidden');
    }
    
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(sectionId).classList.add('active');
    const navItem = Array.from(document.querySelectorAll('.nav-item')).find(n => n.getAttribute('onclick')?.includes(sectionId));
    if(navItem) navItem.classList.add('active');

    if (sectionId === 'news-section') trackUsage('news');
    if (sectionId === 'court-section') trackUsage('court');
    if (sectionId === 'cgpa-calc') trackUsage('cgpa_tool');
    if (sectionId === 'voting-section') trackUsage('voting_tool');
    if (sectionId === 'library-section') trackUsage('library_tool');
    if (sectionId === 'period-calc') trackUsage('ovulation_tool');
    
    window.scrollTo(0, 0);
}

function syncFeatureVisibility() {
    const map = {
        'cgpa': ['card-cgpa', 'nav-cgpa'],
        'period': ['card-ovulation', 'nav-ovulation'],
        'news': ['card-news', 'nav-news'],
        'anonymous': ['card-anonymous'],
        'library': ['card-library'],
        'court': ['card-court', 'nav-court'],
        'voting': ['card-vote'], // New voting card
        'installBtn': ['install-container'], 
        'pdfDownload': ['btn-download-pdf']
    };

    Object.keys(map).forEach(key => {
        const isEnabled = featureSettings[key] !== false;
        map[key].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (isEnabled) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        });
    });

    // Notification logic
    if (featureSettings.notifications === false) {
        // Kill notification listeners if disabled
        db.ref('polsaSettings/lastNotification').off();
    }
}

// Share Application
async function shareApp() {
    const shareData = {
        title: 'POLSA GRADE',
        text: 'Calculate your CGPA, track ovulation, and stay updated with POLSA GRADE.',
        url: window.location.origin
    };
    if (navigator.share) {
        await navigator.share(shareData);
    }
}
// Tracking Logic
function trackUsage(feature) {
    const now = new Date();
    const dateKey = now.toISOString().split('T')[0];
    db.ref(`analytics/totalUsage/${feature}`).transaction(c => (c || 0) + 1);
    db.ref(`analytics/daily/${dateKey}/${feature}`).transaction(c => (c || 0) + 1);
}

// CGPA Calculator Logic
function addCourseRow() {
    const container = document.getElementById('course-list');
    const row = document.createElement('div');
    row.className = 'course-row';
    row.innerHTML = `
        <input type="text" class="c-title" placeholder="Course Title">
        <input type="number" class="c-unit" placeholder="Unit" min="1" max="6">
        <div class="score-input-wrapper">
            <input type="number" class="c-score" placeholder="Score (0-100)" min="0" max="100">
        </div>
        <button class="btn-remove" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(row);
}

function calculateCGPA() {
    const rows = document.querySelectorAll('.course-row:not(.header)');
    if (rows.length === 0) return alert("Please add at least one course.");

    // Check if payment is required based on Admin settings
    if (premiumControls.cgpaPaymentRequired) {
        if (confirm("Payment required to continue CGPA calculation. This is a one-time fee of ₦200 per result. Proceed to secure payment?")) {
            payWithPaystack('CGPA Calculation Fee', 20000, () => performCalculation(rows));
        }
    } else {
        // Free access
        performCalculation(rows);
    }
}

function performCalculation(rows) {
    let totalUnits = 0, totalPoints = 0;
    currentCourses = [];

    rows.forEach(row => {
        const title = row.querySelector('.c-title').value || "Unnamed Course";
        const unit = parseFloat(row.querySelector('.c-unit').value) || 0;
        const score = parseFloat(row.querySelector('.c-score').value) || 0;
        
        if (isNaN(unit) || isNaN(score)) return; 
        const validScore = isNaN(score) ? 0 : Math.min(100, Math.max(0, score));
        const grade = getGradeFromScore(validScore);

        if (unit > 0) {
            totalUnits += unit;
            totalPoints += (unit * grade.points);
            currentCourses.push({ title, unit, grade: grade.letter, score });
        }
    });

    if (totalUnits === 0) return alert("Please add course units.");
    const gpa = (totalPoints / totalUnits).toFixed(2);
    finalizeCalculation(gpa);
}

function getClassificationFromGPA(gpa) {
    if (gpa >= 4.50) return "First Class";
    if (gpa >= 3.50) return "Second Class Upper";
    if (gpa >= 2.40) return "Second Class Lower";
    return "Third Class / Pass";
}

function getGradeFromScore(score) {
    if (score >= 70) return { letter: 'A', points: 5, class: 'First Class' };
    if (score >= 60) return { letter: 'B', points: 4, class: 'Second Class Upper' };
    if (score >= 50) return { letter: 'C', points: 3, class: 'Second Class Lower' };
    if (score >= 45) return { letter: 'D', points: 2, class: 'Third Class' };
    return { letter: 'F', points: 0, class: 'Fail' };
}

async function finalizeCalculation(gpa) {
    const name = document.getElementById('student-name').value || "Student";
    const classification = getClassificationFromGPA(gpa);
    
    const resultData = {
        name, gpa, classification,
        courses: currentCourses,
        timestamp: Date.now()
    };

    try {
        const newRef = db.ref('sharedResults').push();
        await newRef.set(resultData);
        // Generate and tie a stamp serial to this calculation session
        const serial = "PGS-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 900000 + 100000);
        const verifId = Math.random().toString(36).substr(2, 6).toUpperCase();
        sessionStorage.setItem('current_stamp_serial', serial);
        sessionStorage.setItem('current_verif_id', verifId);
        sessionStorage.setItem('current_result_id', newRef.key);
        displayResults(gpa, newRef.key, serial);
    } catch (e) {
        displayResults(gpa, null);
    }
    trackUsage('cgpa_calculator');
}

function displayResults(gpa, resultId = null, serial = null) {
    let classification = getClassificationFromGPA(gpa), remark = "";
    if (gpa >= 4.50) { 
        remark = "Outstanding academic excellence has been demonstrated. This result reflects discipline, consistency, and intellectual commitment. Continue to uphold this standard of excellence as you progress academically and professionally."; 
    } else if (gpa >= 3.50) { 
        remark = "Strong academic achievement recorded. This performance reflects dedication and consistency. With sustained effort, even greater academic excellence is within reach."; 
    } else if (gpa >= 2.40) { 
        remark = "A satisfactory academic performance has been achieved. Improvement in consistency and academic engagement is encouraged to reach higher distinction levels."; 
    } else { 
        remark = "This result indicates the need for significant academic improvement. With focused effort, structured study habits, and determination, stronger outcomes are achievable."; 
    }

    document.getElementById('final-gpa').innerText = `GPA: ${gpa}`;
    document.getElementById('classification').innerText = classification;
    document.getElementById('remark').innerText = remark;
    document.getElementById('btn-download-pdf').classList.remove('hidden'); // Show download button
    document.getElementById('result-display').classList.remove('hidden');
    
    // Prepare QR Code in background for PDF inclusion
    prepareBackgroundQR(resultId, serial);
}

function triggerNativeDownload(doc, filename) {
    try {
        const blob = doc.output('blob');
        if (blob.size < 100) throw new Error("PDF generation resulted in empty file");

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { 
            document.body.removeChild(a); 
            window.URL.revokeObjectURL(url); 
        }, 200);
        return true;
    } catch (e) {
        try {
            window.open(doc.output('bloburl'), '_blank');
            return true;
        } catch (err) { return false; }
    }
}

async function generatePDF() {
    const btn = document.getElementById('btn-download-pdf');
    const originalContent = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';

        const jsPDF = window.jspdf.jsPDF;
        const doc = new jsPDF();
        
        if (typeof doc.autoTable !== 'function') {
            throw new Error("jsPDF-autotable plugin not loaded correctly.");
        }

        const name = document.getElementById('student-name').value || "N/A";
        const gpa = document.getElementById('final-gpa').innerText;
        const classification = document.getElementById('classification').innerText;
        const remarkText = document.getElementById('remark').innerText;
        const serial = sessionStorage.getItem('current_stamp_serial') || "PGS-TEMP-" + Date.now();
        const verifId = sessionStorage.getItem('current_verif_id') || Math.random().toString(36).substr(2, 6).toUpperCase();
        const resultId = sessionStorage.getItem('current_result_id');
        const margin = 20;
        let currentY = 15;

        // Save Stamp Tracking Data
        await db.ref(`stamps/${serial}`).set({
            serial,
            verifId,
            type: 'CGPA Result',
            subject: name,
            gpa: gpa,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            date: new Date().toLocaleString(),
            deviceId: deviceId,
            resultId: resultId
        });
        
        // 1. Header Section (Center Aligned)
        if (logoImg.complete) doc.addImage(logoImg, 'PNG', 105 - 12.5, currentY, 25, 25);
        currentY += 32;
        doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(0, 104, 55);
        doc.text("POLSA GRADE OFFICIAL SYSTEM", 105, currentY, { align: "center" });
        currentY += 8;
        doc.setFontSize(11); doc.setTextColor(80);
        doc.text("OFFICIAL ACADEMIC STATEMENT OF RESULTS", 105, currentY, { align: "center" });
        currentY += 5;
        doc.setDrawColor(0, 104, 55); doc.setLineWidth(0.5);
        doc.line(margin, currentY, 210 - margin, currentY);
        currentY += 15;

        // 2. Student Details Section
        doc.setFontSize(11); doc.setTextColor(0);
        doc.text("STUDENT INFORMATION", margin, currentY);
        doc.setFont("helvetica", "normal"); currentY += 7;
        doc.text(`Name: ${name.toUpperCase()}`, margin, currentY);
        doc.text(`Level: ${document.getElementById('level').value || 'N/A'}`, 110, currentY);
        currentY += 6;
        doc.text(`Department: ${document.getElementById('department').value || 'N/A'}`, margin, currentY);
        doc.text(`Semester: ${document.getElementById('semester').value} Semester`, 110, currentY);
        currentY += 6;
        doc.text(`Date of Issue: ${new Date().toLocaleDateString()}`, margin, currentY);
        currentY += 10;

        // Watermark
        doc.saveGraphicsState();
        doc.setTextColor(245, 245, 245); doc.setFontSize(40);
        doc.text("VERIFIED ACADEMIC SYSTEM", 105, 150, { align: "center", angle: 45 });
        doc.restoreGraphicsState();

        // 3. Academic Performance Table
        doc.autoTable({
            startY: currentY, margin: { left: margin, right: margin },
            head: [['COURSE TITLE', 'UNIT', 'GRADE/SCORE']],
            body: currentCourses.map(c => [c.title, c.unit, c.grade]),
            theme: 'grid',
            headStyles: { fillColor: [0, 104, 55], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 3 }
        });
        currentY = doc.lastAutoTable.finalY + 15;

        // 4. Result Summary Box
        doc.setDrawColor(0, 104, 55); doc.setLineWidth(0.5);
        doc.rect(margin, currentY, 170, 25);
        doc.setFont("helvetica", "bold"); doc.setFontSize(11);
        doc.text("PERFORMANCE SUMMARY", margin + 5, currentY + 8);
        doc.setFont("helvetica", "normal"); doc.setFontSize(11);
        doc.text(`Final GPA: ${gpa}`, margin + 5, currentY + 16);
        doc.text(`Classification: ${classification}`, 110, currentY + 16);
        currentY += 35;

        // 5. Motivational Remark Section
        doc.setDrawColor(230); doc.setFillColor(245, 250, 245);
        doc.roundedRect(margin, currentY, 170, 25, 2, 2, 'FD');
        doc.setFont("helvetica", "bolditalic"); doc.setFontSize(9); doc.setTextColor(60);
        const splitRemark = doc.splitTextToSize(`Academic Remarks: ${remarkText}`, 170);
        doc.text(splitRemark, margin + 5, currentY + 7);

        // 6 & 7. Verification & Signature Sections (Bottom)
        const footerY = 220;
        doc.setDrawColor(0, 104, 55); doc.setLineWidth(0.3);
        doc.line(margin, footerY, 210 - margin, footerY);
        
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(0, 104, 55);
        doc.text("Official Authorization Section", margin, footerY + 7);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(80);
        doc.text("Officially generated and verified by the POLSA GRADE OFFICIAL SYSTEM.", margin, footerY + 12);

        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
        doc.text("Approved and Signed by:", margin, footerY + 22);

        // Add platform link professionally in footer area
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
        doc.text("Official Portal: www.polsablog.name.ng", 105, 290, { align: "center" });

        if (adminSignatureImg.complete && adminSignatureImg.naturalWidth !== 0) {
            doc.addImage(adminSignatureImg, 'PNG', margin, footerY + 23, 40, 12);
        }
    
    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.line(margin, footerY + 36, margin + 65, footerY + 36); 
    
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Nwigwe Goodness", margin, footerY + 41);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text("Administrator, POLSA GRADE System", margin, footerY + 46);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, footerY + 51);

    trackUsage('pdf_download');

    // Verification Elements (Stamp & QR)
    drawOfficialStamp(doc, 133, footerY + 32, serial, verifId);

    const qrCanvas = document.querySelector('#qrcode-container canvas');
    if (qrCanvas) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizing...';
        const qrData = qrCanvas.toDataURL("image/png");
        doc.addImage(qrData, 'PNG', 165, footerY + 18, 25, 25);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7);
        doc.text("VERIFY RESULT", 177.5, footerY + 47, { align: "center" });
    }

    const filename = `POLSA_GRADE_Result_${Date.now()}.pdf`;
    if (triggerNativeDownload(doc, filename)) {
        alert("PDF successfully downloaded to your device.");
    }
    } catch (err) {
        console.error("PDF generation error:", err);
        alert("Download failed. Please try again or check browser permissions.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

function drawOfficialStamp(doc, x, y, serial, verifId) {
    const crimson = [220, 20, 60]; // Vibrant crimson red
    const points = 36; // Number of saw-teeth spikes
    const outerR = 21;
    const innerR = 18;

    // Professional shadow effect
    if (doc.GState) {
        doc.setGState(new doc.GState({ opacity: 0.15 }));
        doc.setFillColor(0, 0, 0);
        doc.circle(x + 0.8, y + 0.8, outerR, 'F');
        doc.setGState(new doc.GState({ opacity: 0.9 })); // Embossed semi-transparent overlay
    }

    doc.setFillColor(...crimson);
    doc.setDrawColor(...crimson);

    // Draw Spiked saw-like edge
    for (let i = 0; i < points; i++) {
        const a1 = (i / points) * Math.PI * 2;
        const a2 = ((i + 0.5) / points) * Math.PI * 2;
        const a3 = ((i + 1) / points) * Math.PI * 2;
        doc.triangle(
            x + Math.cos(a1) * innerR, y + Math.sin(a1) * innerR,
            x + Math.cos(a2) * outerR, y + Math.sin(a2) * outerR,
            x + Math.cos(a3) * innerR, y + Math.sin(a3) * innerR,
            'FD'
        );
    }
    doc.circle(x, y, innerR, 'FD'); // Fill seal center

    // Inner aesthetic ring
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.circle(x, y, innerR - 1.5, 'S');

    // Stamp Content
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.text("POLSA GRADE", x, y - 7, { align: 'center' });
    doc.setFontSize(4);
    doc.text("VERIFIED RESULT", x, y - 4, { align: 'center' });
    doc.setFontSize(10);
    doc.text("✓", x, y - 0.5, { align: 'center' });
    doc.setFontSize(4);
    doc.text(serial, x, y + 4.5, { align: 'center' });
    doc.setFontSize(3.5);
    doc.text(`CODE: ${verifId || 'OFFICIAL'}`, x, y + 7.5, { align: 'center' });
    doc.setFontSize(3);
    doc.text("OFFICIAL SECURE SYSTEM", x, y + 10.5, { align: 'center' });

    if (doc.GState) doc.setGState(new doc.GState({ opacity: 1 }));
    doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2);
}

// Period Calculator Logic
function calculatePeriod() {
    const lastDate = new Date(document.getElementById('last-period').value);
    const cycle = parseInt(document.getElementById('cycle-length').value) || 28;
    if (isNaN(lastDate.getTime())) return alert("Select a date.");

    const next = new Date(lastDate); next.setDate(lastDate.getDate() + cycle);
    const ovulation = new Date(next); ovulation.setDate(next.getDate() - 14);
    const fertileStart = new Date(ovulation); fertileStart.setDate(ovulation.getDate() - 3);
    const fertileEnd = new Date(ovulation); fertileEnd.setDate(ovulation.getDate() + 2);
    
    const bestIntimacyStart = new Date(ovulation); bestIntimacyStart.setDate(ovulation.getDate() - 2);
    const bestIntimacyEnd = new Date(ovulation); bestIntimacyEnd.setDate(ovulation.getDate() + 1);

    const diff = Math.ceil((next - new Date()) / (1000 * 60 * 60 * 24));

    document.getElementById('next-period-val').innerText = next.toDateString();
    document.getElementById('ovulation-val').innerText = ovulation.toDateString();
    document.getElementById('fertile-val').innerText = `${fertileStart.getDate()} - ${fertileEnd.toDateString()}`;
    document.getElementById('safe-val').innerText = `Days 1-7 & ${ovulation.getDate() + 3}-${cycle}`;
    document.getElementById('countdown-val').innerText = diff > 0 ? `${diff} Days` : "Due";
    
    document.getElementById('period-results').classList.remove('hidden');
    trackUsage('period_calculator');
}

// Paystack Integration
function payWithPaystack(purpose = 'Support', amount = 250000, successCallback = null, metadata = {}) {
    const name = document.getElementById('student-name')?.value || 'User';
    const handler = PaystackPop.setup({
        key: 'pk_live_3a2d9b17bf073866779fb99b2a14ac5aeb5b8fb4',
        email: `user_${deviceId.toLowerCase()}@polsagrade.com`,
        amount: amount,
        metadata: {
            custom_fields: [
                { display_name: "Purpose", variable_name: "purpose", value: purpose },
                { display_name: "Device ID", variable_name: "device_id", value: deviceId },
                ...Object.entries(metadata).map(([key, value]) => ({ display_name: key, variable_name: key.toLowerCase().replace(/\s/g, '_'), value: value }))
            ]
        },
        callback: function(res) {
            saveTransaction(res.reference, 'success', amount / 100, purpose, metadata);
            if(successCallback) successCallback();
        },
        onClose: () => saveTransaction('CANCELLED-' + Date.now(), 'failed', 0, purpose, metadata)
    });
    handler.openIframe();
}

function saveTransaction(ref, status, amount, purpose, metadata = {}) {
    db.ref('transactions').push({ ref, status, amount, purpose, date: new Date().toLocaleString(), timestamp: Date.now(), deviceId, ...metadata });
}

// Voting System Logic
let currentVotingCategory = null;
let currentVotingContestant = null;

function loadVotingCategories() {
    if (featureSettings.voting === false) {
        alert("The POLSA AWARD feature is currently disabled by Admin.");
        return;
    }
    showSection('voting-section');
    const container = document.getElementById('voting-categories-list');
    container.innerHTML = '<div class="loader"><i class="fas fa-spinner fa-spin"></i> Loading Categories...</div>';
    db.ref('voting/categories').orderByChild('status').equalTo('active').on('value', snap => {
        container.innerHTML = '';
        if (!snap.exists()) {
            container.innerHTML = '<p class="empty-msg">No active voting categories at the moment.</p>';
            return;
        }
        snap.forEach(child => {
            const category = child.val();
            category.id = child.key;
            const card = document.createElement('div');
            card.className = 'voting-category-card';
            card.innerHTML = `
                <h3>${category.name}</h3>
                <p>${category.description || 'No description provided.'}</p>
                <button class="btn-primary" onclick="viewContestants('${category.id}')">View Contestants</button>
            `;
            container.appendChild(card);
        });
    });
}

function viewContestants(categoryId) {
    currentVotingCategory = categoryId;
    document.getElementById('voting-categories-list').classList.add('hidden');
    const contestantsSection = document.getElementById('voting-contestants-list');
    contestantsSection.classList.remove('hidden');
    contestantsSection.innerHTML = '<div class="loader"><i class="fas fa-spinner fa-spin"></i> Loading Contestants...</div>';

    db.ref(`voting/categories/${categoryId}/contestants`).on('value', snap => {
        contestantsSection.innerHTML = '';
        if (!snap.exists()) {
            contestantsSection.innerHTML = '<p class="empty-msg">No contestants in this category yet.</p>';
            return;
        }
        snap.forEach(child => {
            const contestant = child.val();
            contestant.id = child.key;
            const card = document.createElement('div');
            card.className = 'contestant-card';
            card.innerHTML = `
                <img src="${contestant.imageUrl || 'https://via.placeholder.com/150'}" alt="${contestant.name}">
                <h4>${contestant.name}</h4>
                <p>Dept: ${contestant.department || 'N/A'}</p>
                <p>Level: ${contestant.level || 'N/A'}</p>
                <div class="votes-display">Votes: <span id="votes-${contestant.id}">${contestant.votes || 0}</span></div>
                <button class="btn-primary" onclick="openVoteModal('${contestant.id}', '${categoryId}')">Vote Now</button>
            `;
            contestantsSection.appendChild(card);
        });
    });
}

function openVoteModal(contestantId, categoryId) {
    currentVotingContestant = contestantId;
    currentVotingCategory = categoryId;
    document.getElementById('vote-modal').classList.remove('hidden');
    document.getElementById('vote-quantity').value = 1;
    updateVoteAmount();
}

function closeVoteModal() {
    document.getElementById('vote-modal').classList.add('hidden');
}

function updateVoteAmount() {
    const quantity = parseInt(document.getElementById('vote-quantity').value);
    const amount = quantity * votePrice; 
    document.getElementById('total-vote-amount').innerText = `₦${amount}`;
}

function incrementVoteQuantity() {
    document.getElementById('vote-quantity').stepUp();
    updateVoteAmount();
}

function decrementVoteQuantity() {
    document.getElementById('vote-quantity').stepDown();
    updateVoteAmount();
}

async function submitVotePayment() {
    const quantity = parseInt(document.getElementById('vote-quantity').value);
    const amount = quantity * votePrice * 100; // Paystack amount in kobo

    if (quantity <= 0) {
        alert("Please select at least one vote.");
        return;
    }

    const categoryRef = await db.ref(`voting/categories/${currentVotingCategory}`).once('value');
    const contestantRef = await db.ref(`voting/categories/${currentVotingCategory}/contestants/${currentVotingContestant}`).once('value');
    
    if (!categoryRef.exists() || !contestantRef.exists()) {
        alert("Error: Category or contestant not found.");
        return;
    }

    const categoryName = categoryRef.val().name;
    const contestantName = contestantRef.val().name;

    payWithPaystack(
        `Vote for ${contestantName} in ${categoryName}`,
        amount,
        async () => {
            // Payment successful, update votes
            const contestantVotesRef = db.ref(`voting/categories/${currentVotingCategory}/contestants/${currentVotingContestant}/votes`);
            await contestantVotesRef.transaction(currentVotes => (currentVotes || 0) + quantity);
            alert(`Successfully cast ${quantity} vote(s) for ${contestantName}!`);
            closeVoteModal();
        },
        {
            categoryId: currentVotingCategory,
            contestantId: currentVotingContestant,
            votesCount: quantity,
            categoryName: categoryName,
            contestantName: contestantName
        }
    );
}

// Background QR preparation for the current session
function prepareBackgroundQR(resultId, serial = null) {
    const qrContainer = document.getElementById('qrcode-container');
    if (!qrContainer) return;
    qrContainer.innerHTML = ''; 
    let shareUrl = resultId ? `${window.location.origin}${window.location.pathname}?res=${resultId}` : window.location.origin;
    if(serial) shareUrl += `&serial=${serial}`;

    new QRCode(qrContainer, {
        text: shareUrl,
        width: 150,
        height: 150,
        colorDark : "#006837",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}

// Placeholder for Profile Section
document.getElementById('main-content').insertAdjacentHTML('beforeend', `<section id="profile-section" class="section"><div class="card"><h2><i class="fas fa-user"></i> User Profile</h2><p>Your profile information will appear here.</p></div></section>`);

// Share Result Feature
async function shareResult() {
    const gpa = document.getElementById('final-gpa').innerText.replace('GPA: ', '');
    const classification = document.getElementById('classification').innerText;
    const remark = document.getElementById('remark').innerText;
    const name = document.getElementById('student-name').value || "Student";
    
    const resultData = {
        name, gpa, classification, remark,
        courses: currentCourses,
        timestamp: Date.now()
    };

    try {
        const newRef = db.ref('sharedResults').push();
        await newRef.set(resultData);
        const resultId = newRef.key;
        const shareUrl = `${window.location.origin}${window.location.pathname}?res=${resultId}`;

        // Generate QR Code
        const qrContainer = document.getElementById('qrcode-container');
        qrContainer.innerHTML = ''; // Clear previous QR
        new QRCode(qrContainer, {
            text: shareUrl,
            width: 150,
            height: 150,
            colorDark : "#006837",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        // Style QR with Logo & Reveal Download Button
        setTimeout(() => {
            const canvas = qrContainer.querySelector('canvas');
            if (canvas && logoImg.complete) {
                const ctx = canvas.getContext('2d');
                const size = canvas.width;
                const logoSize = size * 0.25; // Scale logo to 25% of QR size
                const x = (size - logoSize) / 2;
                const y = (size - logoSize) / 2;

                // Draw white background for logo to ensure scannability
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(x - 2, y - 2, logoSize + 4, logoSize + 4);
                ctx.drawImage(logoImg, x, y, logoSize, logoSize);

                // Update the img tag (for mobile "long-press" support)
                const img = qrContainer.querySelector('img');
                if (img) img.src = canvas.toDataURL("image/png");
            }
            document.getElementById('btn-download-qr').classList.remove('hidden');
        }, 150);

        if (navigator.share) {
            await navigator.share({
                title: 'POLSA GRADE Result',
                text: `Check out ${name}'s CGPA result on POLSA GRADE!`,
                url: shareUrl,
            });
        } else {
            await navigator.clipboard.writeText(shareUrl);
            alert("Result link copied to clipboard!");
        }
    } catch (err) {
        console.error("Sharing failed", err);
    }
}

function downloadQRCode() {
    const canvas = document.querySelector('#qrcode-container canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = `POLSA_QR_${document.getElementById('student-name').value || 'Result'}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }
}

// Anonymous Feature Logic
function openAnonymousInbox() {
    showSection('anonymous-section');
    trackUsage('anonymous_inbox');
    const link = `${window.location.origin}${window.location.pathname}?u=${anonId}`;
    document.getElementById('anon-share-link').value = link;
    
    db.ref(`anonymous_messages/${anonId}`).on('value', snap => {
        const container = document.getElementById('anon-messages-list');
        container.innerHTML = '';
        if (!snap.exists()) {
            container.innerHTML = '<p class="empty-msg">No messages yet. Share your link!</p>';
            return;
        }
        const msgs = [];
        snap.forEach(c => {
            let val = c.val();
            val.key = c.key;
            msgs.push(val);
        });
        msgs.reverse().forEach(m => {
            const date = new Date(m.timestamp).toLocaleDateString();
            const encodedMsg = btoa(unescape(encodeURIComponent(JSON.stringify(m))));
            container.innerHTML += `
                <div class="anon-msg-card" onclick="openRevealScreen('${encodedMsg}')">
                    <p>${m.text}</p>
                    <div class="anon-msg-footer">
                        <span><i class="fas fa-clock"></i> ${date}</span>
                        <div class="anon-msg-actions">
                            <button class="report-btn" onclick="reportAnonMsg('${anonId}', '${m.key}', '${btoa(m.text)}')">
                                <i class="fas fa-flag"></i> Report
                            </button>
                            ${m.mood ? `<span class="mood-tag">${m.mood}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
    });
}

function initMoodSelector() {
    const moods = [
        { emoji: '😊', label: 'Friendly' },
        { emoji: '🔥', label: 'Crush' },
        { emoji: '😢', label: 'Sad' },
        { emoji: '🤔', label: 'Question' },
        { emoji: '🎉', label: 'Congrats' }
    ];
    const container = document.getElementById('anon-moods');
    if (!container) return;
    container.innerHTML = moods.map(m => `
        <div class="mood-item" onclick="selectMood(this)" data-mood="${m.label}">
            <span>${m.emoji}</span>
            <small>${m.label}</small>
        </div>
    `).join('');
}

function selectMood(el) {
    document.querySelectorAll('.mood-item').forEach(m => m.classList.remove('active'));
    el.classList.add('active');
}

function openRevealScreen(encodedData) {
    const data = JSON.parse(decodeURIComponent(escape(atob(encodedData))));
    document.getElementById('reveal-text').innerText = data.text;
    document.getElementById('reveal-date').innerText = new Date(data.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('anon-reveal-overlay').classList.remove('hidden');
    window.scrollTo(0, 0); // Ensure modal is centered
}

function closeRevealScreen() {
    document.getElementById('anon-reveal-overlay').classList.add('hidden');
}

function setAnonTheme(theme) {
    const canvas = document.getElementById('anon-capture-area');
    canvas.className = 'anon-card-canvas anon-theme-' + theme;
}

async function downloadAnonImage() {
    const canvasElement = document.getElementById('anon-capture-area');
    const btn = document.querySelector('.reveal-btn.download');
    const original = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    
    try {
        const canvas = await html2canvas(canvasElement, {
            backgroundColor: null,
            scale: 2, // High quality
            useCORS: true
        });
        const link = document.createElement('a');
        link.download = `POLSA_Secret_${Date.now()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    } catch (e) {
        alert("Could not generate image. Please take a screenshot instead.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

async function shareToWhatsApp() {
    const text = document.getElementById('reveal-text').innerText;
    const shareText = `Check out this anonymous message I just got on POLSA GRADE! \n\n"${text}"\n\nGet your own link here: ${window.location.origin}`;
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    
    // If web share API is supported and we can generate a blob, we could share the image
    // But for simplicity and wide compatibility, we share the text link
    window.open(url, '_blank');
    
    // Suggest screenshotting
    setTimeout(() => alert("Don't forget to save the image to post on your Status!"), 1000);
}

async function reportAnonMsg(inboxId, msgId, encodedText) {
    if(!confirm("Report this message as abusive? Admin will review it.")) return;
    const text = atob(encodedText);
    try {
        await db.ref('reports/anonymous_messages').push({
            inboxId, msgId, text, reporterId: deviceId, timestamp: Date.now()
        });
        alert("Message reported successfully.");
    } catch (e) {
        alert("Failed to submit report.");
    }
}

async function copyAnonLink() {
    const link = document.getElementById('anon-share-link').value;
    await navigator.clipboard.writeText(link);
    alert("Link copied! Share it on your Status/Bio.");
}

async function sendAnonymousMessage() {
    const urlParams = new URLSearchParams(window.location.search);
    const recipientId = urlParams.get('u');
    const text = document.getElementById('anon-text').value.trim();
    const mood = document.querySelector('.mood-item.active')?.dataset.mood || '';
    
    if (!text) return alert("Message cannot be empty.");
    if (text.length < 3) return alert("Message too short.");

    // Simple Bad Word Filter
    const banned = ["badword1", "spam", "abuse"]; 
    if (banned.some(word => text.toLowerCase().includes(word))) {
        return alert("Message contains restricted words.");
    }

    const btn = document.getElementById('btn-send-anon');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

    try {
        await db.ref(`anonymous_messages/${recipientId}`).push({
            text,
            mood,
            timestamp: Date.now(),
            deviceId: deviceId // For admin moderation tracking only
        });
        trackUsage('anonymous_sent');
        alert("Message sent anonymously!");
        window.location.href = window.location.origin;
    } catch (e) {
        alert("Failed to send.");
        btn.disabled = false;
        btn.innerText = "Send Message Anonymously";
    }
}

function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const recipientId = urlParams.get('u');
    const resultId = urlParams.get('res');
    const serial = urlParams.get('serial');

    if (recipientId) {
        showSection('anonymous-send-section');
        document.getElementById('anon-send-title').innerText = `Send Secret Message`;
    } else if (resultId || serial) {
        checkSharedResult();
    }
}

function subscribeToNotifications() {
    // Save token to DB for broadcasts
    db.ref(`notification_tokens/${deviceId}`).set(true);
    
    // Listen for broadcasts
    db.ref('polsaSettings/lastNotification').on('value', snap => {
        if (snap.exists()) {
            const data = snap.val();
            // Check if user has already seen this specific notification
            if (localStorage.getItem('last_notif_id') !== data.id) {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then(registration => {
                        const options = {
                            body: data.message,
                            icon: 'logo.png.png',
                            badge: 'logo.png.png',
                            vibrate: [100, 50, 100],
                            data: { 
                                url: data.link || window.location.origin 
                            },
                            actions: [
                                { action: 'open', title: 'View Update' },
                                { action: 'close', title: 'Dismiss' }
                            ],
                            tag: 'polsa-broadcast',
                            renotify: true
                        };

                        const displayTitle = data.type && data.type !== 'Information' 
                            ? `[${data.type}] ${data.title}` 
                            : data.title;

                        registration.showNotification(displayTitle, options);
                        localStorage.setItem('last_notif_id', data.id);
                    });
                }
            }
        }
    });
}

function checkSharedResult() {
    const urlParams = new URLSearchParams(window.location.search);
    const resultId = urlParams.get('res');
    const serial = urlParams.get('serial');

    // Handle verification badge for shared results
    if (serial) {
        db.ref(`stamps/${serial}`).once('value', sSnap => {
            const isValid = sSnap.exists();
            const statusText = isValid ? "✓ VERIFIED OFFICIAL DOCUMENT" : "⚠ INVALID DOCUMENT - AUTHENTICITY NOT GUARANTEED";
            const statusColor = isValid ? "#22b14c" : "#e74c3c";
            
            // Inject verification badge into the UI
            const card = document.querySelector('#cgpa-calc .card');
            if(card && !document.getElementById('verification-badge')) {
                const badge = `<div id="verification-badge" style="background:${statusColor}; color:white; padding:12px; border-radius:8px; margin-bottom:20px; text-align:center; font-weight:bold; font-size:0.85rem; border: 2px solid rgba(255,255,255,0.2);">${statusText}</div>`;
                card.insertAdjacentHTML('afterbegin', badge);
            }
        });
    }
    
    if (resultId) {
        db.ref(`sharedResults/${resultId}`).once('value', (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                showSection('cgpa-calc');
                
                document.getElementById('student-name').value = data.name;
                currentCourses = data.courses || [];
                displayResults(data.gpa);
                
                // UI adjustments for shared view
                document.querySelector('#cgpa-calc h2').innerHTML = `<i class="fas fa-graduation-cap"></i> ${data.name}'s Result`;
                document.querySelectorAll('.student-info, #course-list, .btn-add, .actions').forEach(el => el.classList.add('hidden'));

                // Promotional Branding
                const card = document.querySelector('#cgpa-calc .card');
                if(!document.getElementById('promo-branding')) {
                    card.insertAdjacentHTML('beforeend', `
                        <div id="promo-branding" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; text-align: center;">
                            <p style="font-size: 0.9rem; color: #666;">Verified by <strong>POLSA GRADE</strong></p>
                            <button class="btn-primary" onclick="window.location.href=window.location.origin" style="margin-top: 10px; width: 100%;">Create Your Own Result</button>
                        </div>
                    `);
                }
            }
        });
    }
}

// WhatsApp Channel Popup System
function initWhatsAppPopup() {
    const hasSeenPopup = localStorage.getItem('polsa_wa_popup_seen');
    if (hasSeenPopup) return;

    // Delayed trigger (20 seconds)
    setTimeout(() => {
        const popup = document.getElementById('whatsapp-popup');
        if (popup) {
            popup.classList.remove('hidden');
            setTimeout(() => popup.classList.add('active'), 50);
        }
    }, 20000);
}

function followWhatsApp() {
    window.open('https://whatsapp.com/channel/0029VbBtZK4GZNCop8qW8C2s', '_blank');
    closeWhatsAppPopup();
}

function closeWhatsAppPopup() {
    const popup = document.getElementById('whatsapp-popup');
    if (popup) {
        popup.classList.remove('active');
        setTimeout(() => popup.classList.add('hidden'), 500);
    }
    localStorage.setItem('polsa_wa_popup_seen', 'true');
}

// Digital Library Logic
async function performLibrarySearch() {
    const input = document.getElementById('library-search-input');
    const query = input.value.trim();
    if (!query) return;
    
    const grid = document.getElementById('library-results-grid');
    grid.innerHTML = '<div class="loader"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

    try {
        const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20`);
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json();
        displayBooks(data.docs);
    } catch (err) {
        grid.innerHTML = '<div class="library-error">Failed to fetch books. Check your connection.</div>';
    }
}

async function loadBooksBySubject(subject) {
    // Update input and trigger search
    document.getElementById('library-search-input').value = subject;
    
    // Update UI chips active state
    document.querySelectorAll('.subject-chip').forEach(c => {
        c.classList.remove('active');
        const chipText = c.innerText.toLowerCase();
        const subLower = subject.toLowerCase();
        if (chipText === subLower || 
           (subLower === 'mathematics' && chipText === 'math') ||
           (subLower === 'computers' && chipText === 'it')) {
            c.classList.add('active');
        }
    });
    
    performLibrarySearch();
}

function displayBooks(books) {
    const grid = document.getElementById('library-results-grid');
    grid.innerHTML = '';
    
    if (!books || books.length === 0) {
        grid.innerHTML = '<div class="library-placeholder">No books found, try another search</div>';
        return;
    }

    books.forEach(book => {
        const coverId = book.cover_i;
        const workId = (book.key || '').replace('/works/', '');
        const title = book.title;
        const author = book.author_name ? book.author_name[0] : 'Unknown Author';
        
        const card = document.createElement('div');
        card.className = 'book-card';
        card.onclick = () => viewBookDetails(workId, author);
        card.innerHTML = `
            <div class="book-cover-wrapper">
                <img src="${coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : 'https://via.placeholder.com/150x220?text=No+Cover'}" 
                     onerror="this.src='https://via.placeholder.com/150x220?text=No+Cover'" alt="${title}">
            </div>
            <div class="book-info">
                <h4>${title}</h4>
                <p>${author}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function viewBookDetails(workId, authorName) {
    const overlay = document.getElementById('anon-reveal-overlay');
    const container = document.querySelector('.reveal-container');
    container.innerHTML = '<div class="loader" style="position:relative; top:0; left:0; transform:none;"><i class="fas fa-spinner fa-spin"></i> Loading Details...</div>';
    overlay.classList.remove('hidden');
    history.pushState({ type: 'overlay' }, '', '#details');

    try {
        const response = await fetch(`https://openlibrary.org/works/${workId}.json`);
        if (!response.ok) throw new Error("Details not found");
        const data = await response.json();
        
        let description = "No description available.";
        if (data.description) {
            description = typeof data.description === 'string' ? data.description : (data.description.value || description);
        }

        const subjects = data.subjects ? data.subjects.slice(0, 5).join(', ') : 'N/A';
        const coverId = data.covers ? data.covers[0] : null;

        container.innerHTML = `
            <div class="reveal-header">
                <button class="close-reveal" onclick="closeRevealScreen()"><i class="fas fa-times"></i></button>
                <h3 style="color:white; font-size:1rem; margin-right:40px;">Book Details</h3>
            </div>
            <div class="book-detail-view" style="max-height: 80vh; overflow-y: auto; text-align: left; padding: 10px;">
                <img src="${coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : 'https://via.placeholder.com/200x300?text=No+Cover'}" 
                     class="detail-cover" onerror="this.src='https://via.placeholder.com/200x300?text=No+Cover'" style="display: block; margin: 0 auto 20px; border-radius: 10px; width: 150px;">
                <h2 style="color:white; font-size: 1.4rem; margin-bottom: 5px;">${data.title}</h2>
                <p style="color:var(--accent); font-weight: bold; margin-bottom: 15px;">By ${authorName}</p>
                <div class="detail-meta" style="margin-bottom: 15px;">
                    <span class="mood-tag" style="display: block; width: fit-content;">Subjects: ${subjects}</span>
                </div>
                <p class="detail-desc" style="color:white; line-height:1.6; font-size:0.95rem; margin-bottom: 25px;">${description}</p>
                <div class="reveal-actions">
                    <button class="reveal-btn download" onclick="closeRevealScreen()"><i class="fas fa-arrow-left"></i> Back to Library</button>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<div style="color:white; text-align: center; padding: 40px;">Error loading book details. <br><br> <button class="btn-primary" onclick="closeRevealScreen()">Go Back</button></div>`;
    }
}

const originalCloseReveal = closeRevealScreen;
closeRevealScreen = function() {
    if (window.location.hash === '#details') window.history.back();
    else originalCloseReveal();
};

async function loadRecentBooks() {
    loadBooksBySubject('Education');
}

// Initialize share check
window.addEventListener('load', () => {
    checkUrlParameters();
    initWhatsAppPopup();
});