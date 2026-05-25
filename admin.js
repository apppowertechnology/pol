// Firebase Configuration
const firebaseConfig = {
    databaseURL: "https://polsa-e6958-default-rtdb.firebaseio.com/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Asset Preloading for Reports
const logoImg = new Image();
logoImg.src = 'logo.png.png';
const adminSignatureImg = new Image();
adminSignatureImg.crossOrigin = "anonymous";
db.ref('polsaSettings/adminSignature').on('value', snap => {
    if (snap.exists()) adminSignatureImg.src = snap.val();
});

// Immediate Password Protection
(function verifyAdminAccess() {
    const sessionActive = localStorage.getItem('polsa_admin_active');
    const pass = sessionActive ? '220099' : prompt("Enter Admin Passcode:");
    if (pass === '220099') {
        localStorage.setItem('polsa_admin_active', 'true');
        document.body.classList.add('authorized');
    } else {
        alert("Access Denied");
        window.location.href = 'index.html';
    }
})();

function logoutAdmin() {
    localStorage.removeItem('polsa_admin_active');
    window.location.href = 'index.html';
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.add('hidden'));
    const target = document.getElementById(`admin-${tab}`);
    if(target) target.classList.remove('hidden');
    document.querySelectorAll('.sidebar nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.sidebar nav button')).find(b => b.getAttribute('onclick')?.includes(tab));
    if(activeBtn) activeBtn.classList.add('active');
}

// Admin Dashboard Logic
function initAdminDashboard() {
    loadStats();
    loadTransTable();
    loadRevenueTrend();
    loadAcademicStats();
    loadAdminSignature();
    loadStampsRegistry();
    loadAnonymousManager();
    loadNotificationCenter();
    loadPremiumControls();
    loadVotingManagement(); // New: Load voting management
    loadPlatformSettings();

    // Load current link
    db.ref('polsaSettings/courtLink').once('value', snap => {
        if(snap.exists()) document.getElementById('input-court-link').value = snap.val();
    });
    
    // Load news link
    db.ref('polsaSettings/newsLink').once('value', snap => {
        document.getElementById('input-news-link').value = snap.exists() ? snap.val() : "https://polsablog.blogspot.com";
    });
    
    // Load social links
    db.ref('polsaSettings/socialLinks').once('value', snap => {
        const links = snap.val() || {};
        Object.keys(links).forEach(key => {
            const input = document.getElementById(`social-${key}`);
            if(input) input.value = links[key];
        });
    });
}

function loadAdminSignature() {
    db.ref('polsaSettings/adminSignature').on('value', snap => {
        const preview = document.getElementById('signature-preview');
        if(preview) {
            const url = snap.val();
            preview.src = url || "";
            preview.style.opacity = url ? "1" : "0.3";
        }
    });
}

async function uploadAdminSignature() {
    const fileInput = document.getElementById('input-signature-file');
    const file = fileInput?.files[0];
    if(!file) return alert("Please select a signature image file first.");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'polsasite');

    try {
        const res = await fetch('https://api.cloudinary.com/v1_1/ddoetcvxy/image/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if(data.secure_url) {
            db.ref('polsaSettings/adminSignature').set(data.secure_url);
            alert("Signature updated successfully!");
        }
    } catch (err) {
        alert("Upload failed. Please check your connection.");
    }
}

async function deleteAdminSignature() {
    if(confirm("Are you sure you want to remove the custom signature and revert to text?")) {
        await db.ref('polsaSettings/adminSignature').remove();
        alert("Custom signature removed.");
    }
}

function loadPremiumControls() {
    db.ref('polsaSettings/premiumControls').on('value', snap => {
        const controls = snap.val() || { cgpaPaymentRequired: true };
        const cgpaToggle = document.getElementById('toggle-cgpa-payment');
        if (cgpaToggle) cgpaToggle.checked = !!controls.cgpaPaymentRequired;
    });
}

async function togglePremiumFeature(key) {
    const el = document.getElementById('toggle-cgpa-payment');
    const val = el.checked;
    await db.ref(`polsaSettings/premiumControls/${key}`).set(val);
    db.ref('adminLogs').push({ action: `Toggle Premium ${key}: ${val}`, timestamp: Date.now() });
}

function saveCourtLink() {
    const link = document.getElementById('input-court-link').value;
    if(!link) return alert("Please enter a link");
    db.ref('polsaSettings/courtLink').set(link);
    alert("Court Link Updated!");
}

function saveNewsLink() {
    const link = document.getElementById('input-news-link').value.trim() || "https://polsablog.blogspot.com";
    db.ref('polsaSettings/newsLink').set(link).then(() => {
        document.getElementById('input-news-link').value = link;
        alert("News Link Updated to Main Source!");
    });
}

function saveSocialLinks() {
    const links = {};
    ['facebook', 'instagram', 'x', 'tiktok', 'whatsapp', 'youtube'].forEach(p => {
        links[p] = document.getElementById(`social-${p}`).value;
    });
    db.ref('polsaSettings/socialLinks').set(links);
    alert("Social Links Saved!");
}

function loadStats() {
    db.ref('transactions').on('value', snap => {
        let rev = 0, success = 0, failed = 0;
        snap.forEach(child => {
            const t = child.val();
            if (t.status === 'success' && typeof t.amount === 'number') { rev += t.amount; success++; } // Ensure amount is a number
            else failed++;
        });
        document.getElementById('stat-revenue').innerText = `₦${rev}`;
        document.getElementById('stat-success').innerText = success;
        document.getElementById('stat-failed').innerText = failed;
    });

    db.ref('analytics/totalUsage').on('value', snap => {
        const data = snap.val() || {};
        let sum = 0; Object.values(data).forEach(v => sum += v);
        document.getElementById('stat-usage').innerText = sum;
        renderUsageChart(data);
    });
}

function renderUsageChart(data) {
    const canvas = document.getElementById('usageChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.polsaChart) window.polsaChart.destroy();
    window.polsaChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(data).map(k => k.replace('_', ' ')),
            datasets: [{ label: 'Usage', data: Object.values(data), backgroundColor: '#22b14c' }]
        },
        options: { scales: { y: { beginAtZero: true, grid: { color: '#333' } } } }
    });
}

function loadRevenueTrend() {
    db.ref('transactions').on('value', snap => {
        const dailyRevenue = {};
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

        snap.forEach(child => {
            const t = child.val();
            // Only aggregate successful transactions from the last 30 days
            if (t.status === 'success' && t.timestamp && t.timestamp >= thirtyDaysAgo) {
                const dateKey = new Date(t.timestamp).toLocaleDateString('en-CA'); // Format: YYYY-MM-DD
                dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + t.amount;
            }
        });

        const labels = [];
        const values = [];
        // Generate last 30 days labels even if there was no revenue
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateKey = date.toLocaleDateString('en-CA');
            labels.push(dateKey);
            values.push(dailyRevenue[dateKey] || 0);
        }
        renderRevenueChart(labels, values);
    });
}

function renderRevenueChart(labels, values) {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.revTrendChart) window.revTrendChart.destroy();
    window.revTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Daily Revenue (₦)',
                data: values,
                borderColor: '#ffd700',
                backgroundColor: 'rgba(255, 215, 0, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true, grid: { color: '#333' }, ticks: { color: '#888' } },
                x: { ticks: { color: '#888' }, grid: { display: false } }
            },
            plugins: { legend: { labels: { color: '#fff' } } }
        }
    });
}

function loadAcademicStats() {
    db.ref('sharedResults').on('value', snap => {
        let first = 0, upper = 0, lower = 0, thirdPass = 0;
        snap.forEach(child => {
            const res = child.val();
            const gpa = parseFloat(res.gpa);
            if (gpa >= 4.5) first++;
            else if (gpa >= 3.5) upper++;
            else if (gpa >= 2.4) lower++;
            else thirdPass++;
        });
        document.getElementById('stat-first').innerText = first;
        document.getElementById('stat-2-1').innerText = upper;
        document.getElementById('stat-2-2').innerText = lower;
        document.getElementById('stat-3rd').innerText = thirdPass;
        document.getElementById('stat-high-perf').innerText = first + upper;
        document.getElementById('stat-low-perf').innerText = lower + thirdPass;
    });
}

async function exportFirstClassCSV() {
    const snap = await db.ref('sharedResults').once('value');
    const firstClass = [];
    snap.forEach(child => {
        const data = child.val();
        if (parseFloat(data.gpa) >= 4.5) {
            firstClass.push({ name: data.name, gpa: data.gpa });
        }
    });

    if (firstClass.length === 0) return alert("No First Class students found.");

    const csvRows = [["Name", "GPA"]];
    firstClass.forEach(s => csvRows.push([`"${s.name}"`, s.gpa]));
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "First_Class_Students.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function triggerNativeDownload(doc, filename) {
    try {
        const blob = doc.output('blob');
        if (blob.size < 100) throw new Error("Generated PDF is empty");
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        
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

async function exportFirstClassPDF(btn = null) {
    let originalText = "";
    if (btn) {
        originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
    }
    const snap = await db.ref('sharedResults').once('value');
    const firstClass = [];
    snap.forEach(child => {
        const data = child.val();
        if (parseFloat(data.gpa) >= 4.5) {
            firstClass.push([data.name, data.gpa]);
        }
    });

    if (firstClass.length === 0) {
        alert("No First Class students found.");
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        return;
    }

    try {
    const doc = new window.jspdf.jsPDF();
    doc.setFontSize(18);
    doc.text("List of First Class Students", 14, 20);
    doc.autoTable({ head: [['Name', 'GPA']], body: firstClass, startY: 30 });
    
    const filename = `POLSA_GRADE_Result_FirstClass_${Date.now()}.pdf`;
    if (triggerNativeDownload(doc, filename)) {
        alert("PDF successfully downloaded to your device.");
    }
    } catch (e) {
        alert("Download failed. Please try again or check browser permissions.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

async function generateOfficialAcademicReport(category = 'FULL', btn = null) {
    let originalText = "";
    if (btn) {
        originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
    }

    const qrDiv = document.createElement('div');
    try {
        const doc = new window.jspdf.jsPDF();
        const snap = await db.ref('sharedResults').once('value');
        
        const stats = { 'First Class': 0, 'Second Class Upper': 0, 'Second Class Lower': 0, 'Third Class / Pass': 0 };
        const students = [];
        const serial = "PGS-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 900000 + 100000);
        const verifId = Math.random().toString(36).substr(2, 6).toUpperCase();
        const margin = 20;
        let currentY = 15;

        snap.forEach(child => {
            const data = child.val();
            const gpa = parseFloat(data.gpa);
            let cls = "Third Class / Pass";
            if (gpa >= 4.5) cls = 'First Class';
            else if (gpa >= 3.5) cls = 'Second Class Upper';
            else if (gpa >= 2.4) cls = 'Second Class Lower';
            
            stats[cls]++;
            if (category === 'FULL' || cls === category) {
                students.push([data.name, data.gpa, cls]);
            }
        });

        if (students.length === 0) {
            alert(`No student records found for the category: ${category}`);
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            return;
        }

        // Register Stamp in Database
        await db.ref(`stamps/${serial}`).set({
            serial,
            verifId,
            type: 'Institutional Report',
            subject: category === 'FULL' ? 'All Students' : category,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            date: new Date().toLocaleString()
        });

        // 1. Header Section (Center Aligned)
        if (logoImg.complete) doc.addImage(logoImg, 'PNG', 105 - 12.5, currentY, 25, 25);
        currentY += 32;
        doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(0, 104, 55);
        doc.text("POLSA GRADE OFFICIAL SYSTEM", 105, currentY, { align: "center" });
        currentY += 8;
        doc.setFontSize(12); doc.setTextColor(80);
        const title = category === 'FULL' ? "Official Academic Performance Report" : `${category} Category Report`;
        doc.text(title.toUpperCase(), 105, currentY, { align: "center" });
        currentY += 6;
        doc.setFontSize(9); doc.text(`Generated: ${new Date().toLocaleString()} | Report Serial: ${serial}`, 105, currentY, { align: "center" });
        currentY += 5;
        doc.setDrawColor(0, 104, 55); doc.setLineWidth(0.5);
        doc.line(margin, currentY, 210 - margin, currentY);
        currentY += 15;

        // 2. Watermark
        doc.saveGraphicsState();
        doc.setTextColor(245, 245, 245); doc.setFontSize(50);
        doc.text("POLSA GRADE OFFICIAL SYSTEM", 105, 150, { align: "center", angle: 45 });
        doc.restoreGraphicsState();

        // 3. Summary Section (For FULL report)
        if (category === 'FULL') {
            doc.setFontSize(11); doc.setTextColor(0); doc.text("INSTITUTIONAL PERFORMANCE SUMMARY", margin, currentY);
            doc.autoTable({
                startY: currentY + 5, margin: { left: margin, right: margin },
                head: [['Classification', 'Total Students Registered']],
                body: Object.entries(stats),
                theme: 'striped', headStyles: { fillColor: [0, 104, 55] }
            });
            currentY = doc.lastAutoTable.finalY + 15;
        }

        // 4. Detailed Data Table
        doc.setFontSize(11); doc.setTextColor(0);
        doc.text(category === 'FULL' ? "COMPLETE ACADEMIC RECORDS" : `RECORDS FOR ${category.toUpperCase()}`, margin, currentY);
        doc.autoTable({
            startY: currentY + 5, margin: { left: margin, right: margin },
            head: [['Student Name', 'CGPA', 'Classification']],
            body: students,
            theme: 'grid', headStyles: { fillColor: [40, 40, 40] },
            styles: { fontSize: 9 }
        });

        // 5. Official Authorization & Signature Block
        if (doc.lastAutoTable.finalY + 80 > 280) doc.addPage();
        const footerStart = 215;

        doc.setDrawColor(0, 104, 55); doc.setLineWidth(0.3);
        doc.line(margin, footerStart, 210 - margin, footerStart);

        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(0, 104, 55);
        doc.text("Official Authorization Section", margin, footerStart + 7);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(80);
        doc.text("This document is officially generated and verified by the POLSA GRADE OFFICIAL SYSTEM.", margin, footerStart + 12);

        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
        doc.text("Approved and Signed by:", margin, footerStart + 22);

        // Add platform link professionally in footer area
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
        doc.text("Official Portal: www.polsablog.name.ng", 105, 290, { align: "center" });

        if (adminSignatureImg.complete && adminSignatureImg.naturalWidth !== 0) {
            doc.addImage(adminSignatureImg, 'PNG', margin, footerStart + 23, 40, 12);
        }
        
        doc.setDrawColor(0); doc.setLineWidth(0.5);
        doc.line(margin, footerStart + 36, margin + 65, footerStart + 36); 
        
        doc.setFont("helvetica", "bold"); doc.setFontSize(10);
        doc.text("Nwigwe Goodness", margin, footerStart + 41);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);
        doc.text("Administrator, POLSA GRADE System", margin, footerStart + 46);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, footerStart + 51);

        // Official Digital Stamp (Twisted effect)
        drawOfficialStamp(doc, 133, footerStart + 32, serial, verifId);

        // QR Verification
        qrDiv.style.display = 'none';
        document.body.appendChild(qrDiv);
        
        // Link QR to verification endpoint
        const verifyUrl = `${window.location.origin}/index.html?serial=${serial}`;
        new QRCode(qrDiv, { text: verifyUrl, width: 100, height: 100 });
        
        setTimeout(async () => {
            if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizing...';
            
            const canvas = qrDiv.querySelector('canvas');
            if (canvas) {
                doc.addImage(canvas.toDataURL(), 'PNG', 165, footerStart + 18, 25, 25);
                doc.setFontSize(7); doc.text("Scan to Verify", 177.5, footerStart + 47, {align:'center'});
            }
            
            const filename = `POLSA_GRADE_Result_Report_${Date.now()}.pdf`;
            if (triggerNativeDownload(doc, filename)) {
                alert("PDF successfully downloaded to your device.");
            } else {
                alert("Download failed. Please try again or check browser permissions.");
            }
            
            if (document.body.contains(qrDiv)) document.body.removeChild(qrDiv);
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        }, 300);
    } catch (err) {
        console.error("POLSA Report Engine Error:", err);
        alert(`Failed to generate report: ${err.message || 'Unknown error'}`);
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        if (document.body.contains(qrDiv)) document.body.removeChild(qrDiv);
    }
}

function drawOfficialStamp(doc, x, y, serial, verifId) {
    const crimson = [220, 20, 60]; 
    const points = 36; 
    const outerR = 21;
    const innerR = 18;

    if (doc.GState) {
        doc.setGState(new doc.GState({ opacity: 0.15 }));
        doc.setFillColor(0, 0, 0);
        doc.circle(x + 0.8, y + 0.8, outerR, 'F');
        doc.setGState(new doc.GState({ opacity: 0.9 })); 
    }

    doc.setFillColor(...crimson);
    doc.setDrawColor(...crimson);

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
    doc.circle(x, y, innerR, 'FD'); 

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.circle(x, y, innerR - 1.5, 'S');

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

function loadStampsRegistry() {
    db.ref('stamps').on('value', snap => {
        const tbody = document.getElementById('stamps-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        const stamps = [];
        snap.forEach(child => stamps.push(child.val()));
        // Sort by newest first and add actions
        stamps.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach(s => {
            let actionBtn = '';
            if (s.resultId) {
                actionBtn = `<button class="btn-primary" style="padding:4px 8px; font-size:0.7rem;" onclick="window.open('index.html?res=${s.resultId}', '_blank')">View Result</button>`;
            }
            
            const deleteBtn = `<button class="btn-secondary" style="padding:4px 8px; font-size:0.7rem; border-color:#e74c3c; color:#e74c3c; margin-left:5px;" onclick="deleteStamp('${s.serial}')">Delete</button>`;

            tbody.innerHTML += `
                <tr>
                    <td style="color:#ffd700; font-weight:bold;">${s.serial}</td>
                    <td>${s.type}</td>
                    <td>${s.subject || 'N/A'}</td>
                    <td>${s.date}</td>
                    <td style="display:flex; align-items:center;">${actionBtn}${deleteBtn}</td>
                </tr>
            `;
        });
    });
}

async function deleteStamp(serial) {
    if(confirm(`Remove tracking record for stamp ${serial}?`)) {
        await db.ref(`stamps/${serial}`).remove();
        alert("Stamp record removed.");
    }
}

function filterStamps() {
    const query = document.getElementById('search-stamps').value.toLowerCase();
    const rows = document.querySelectorAll('#stamps-body tr');
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
    });
}

function loadTransTable() {
    db.ref('transactions').limitToLast(20).on('value', snap => {
        const tbody = document.getElementById('trans-body');
        tbody.innerHTML = '';
        snap.forEach(child => {
            const t = child.val();
            const ref = (t.ref || "N/A").slice(0, 8);
            const datePart = (t.date || "").split(',')[0] || "N/A";
            tbody.innerHTML += `<tr><td>${ref}</td><td>${t.status}</td><td>₦${t.amount}</td><td>${datePart}</td></tr>`;
        });
    });
}

// Platform Settings Logic
function loadPlatformSettings() {
    // Feature Toggles
    const features = [
        { id: 'cgpa', label: 'CGPA Calculator', icon: 'graduation-cap' },
        { id: 'period', label: 'Ovulation Calculator', icon: 'calendar-alt' },
        { id: 'news', label: 'News Section', icon: 'newspaper' },
        { id: 'anonymous', label: 'Anonymous Messages', icon: 'user-secret' },
        { id: 'court', label: 'Goes To Court', icon: 'gavel' },
        { id: 'library', label: 'Digital Library', icon: 'book' },
        { id: 'voting', label: 'POLSA AWARD', icon: 'poll' },
        { id: 'installBtn', label: 'Install App Button', icon: 'download' },
        { id: 'notifications', label: 'Push Notifications', icon: 'bell' },
        { id: 'pdfDownload', label: 'PDF Downloads', icon: 'file-pdf' }
    ];

    const container = document.getElementById('feature-toggles-container');
    if (container) {
        container.innerHTML = features.map(f => `
            <div class="control-item">
                <span><i class="fas fa-${f.icon}"></i> ${f.label}</span>
                <label class="switch">
                    <input type="checkbox" id="toggle-${f.id}" onchange="toggleFeature('${f.id}')">
                    <span class="slider"></span>
                </label>
            </div>
        `).join('');
    }

    db.ref('featureSettings').once('value', snap => {
        const s = snap.val() || {};
        features.forEach(f => {
            const el = document.getElementById(`toggle-${f.id}`);
            if (el) el.checked = s[f.id] !== false; // Default true
        });
    });

    // Maintenance Mode
    db.ref('polsaSettings/maintenanceMode').on('value', snap => {
        const el = document.getElementById('toggle-maintenance');
        if (el) el.checked = !!snap.val();
    });

    // Analytics
    db.ref('analytics/totalVisits').on('value', snap => {
        document.getElementById('stat-total-visits').innerText = snap.val() || 0;
    });

    // Analytics - Today's Visits
    const today = new Date().toISOString().split('T')[0];
    db.ref('analytics/dailyVisits').child(today).on('value', snap => {
        const el = document.getElementById('stat-daily-visits');
        if(el) el.innerText = snap.val() || 0;
    });

    // Analytics - Weekly Visits (Last 7 Days)
    db.ref('analytics/dailyVisits').limitToLast(7).on('value', snap => {
        let weekly = 0;
        snap.forEach(d => weekly += d.val());
        const el = document.getElementById('stat-weekly-visits');
        if(el) el.innerText = weekly;
    });

    db.ref('analytics/totalUsage').on('value', snap => {
        const data = snap.val() || {};
        const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
        if (sorted[0] && document.getElementById('stat-most-used')) {
            document.getElementById('stat-most-used').innerText = sorted[0][0].replace('_', ' ').toUpperCase();
        }
        
        renderClicksChart(data);
    });
}

function renderClicksChart(data) {
    const ctx = document.getElementById('clicksChart')?.getContext('2d');
    if (!ctx) return;
    if (window.clicksChart) window.clicksChart.destroy();
    window.clicksChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data).map(k => k.replace('_', ' ').toUpperCase()),
            datasets: [{
                data: Object.values(data),
                backgroundColor: ['#22b14c', '#ffd700', '#3498db', '#e74c3c', '#9b59b6', '#f1c40f']
            }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#fff', font: { size: 10 } } } } }
    });
}

async function toggleMaintenanceMode() {
    const val = document.getElementById('toggle-maintenance').checked;
    await db.ref('polsaSettings/maintenanceMode').set(val);
    db.ref('adminLogs').push({ action: `Toggle Maintenance: ${val}`, timestamp: Date.now() });
}

function toggleFeature(feature) {
    const val = document.getElementById(`toggle-${feature}`).checked;
    db.ref(`featureSettings/${feature}`).set(val);
    db.ref('adminLogs').push({ action: `Toggle ${feature}: ${val}`, timestamp: Date.now() });
}

// Anonymous Manager
let allAnonMessages = [];
function loadAnonymousManager() {
    const container = document.getElementById('admin-anonymous');
    if (container && !document.getElementById('anon-search-container')) {
        const searchHTML = `
            <div id="anon-search-container" class="admin-search-bar">
                <i class="fas fa-search"></i>
                <input type="text" id="search-anon" placeholder="Search messages or Inbox IDs..." onkeyup="filterAnonMessages()">
            </div>
        `;
        container.insertAdjacentHTML('afterbegin', searchHTML);
    }

    db.ref('anonymous_messages').on('value', snap => {
        allAnonMessages = [];
        snap.forEach(userInbox => {
            const inboxId = userInbox.key;
            userInbox.forEach(msgSnap => {
                allAnonMessages.push({
                    ...msgSnap.val(),
                    inboxId,
                    msgKey: msgSnap.key
                });
            });
        });
        renderAnonTable(allAnonMessages);
    });
}

function renderAnonTable(messages) {
    const tbody = document.getElementById('anon-admin-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    // Sort newest first
    messages.sort((a, b) => b.timestamp - a.timestamp).forEach(m => {
        tbody.innerHTML += `
            <tr class="modern-tr">
                <td><span class="id-badge">${m.inboxId}</span></td>
                <td class="msg-cell">${m.text}</td>
                <td><span class="date-label">${new Date(m.timestamp).toLocaleDateString()}</span></td>
                <td class="action-cell">
                    <button class="admin-btn-delete" onclick="deleteAnonMsg('${m.inboxId}', '${m.msgKey}')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

function filterAnonMessages() {
    const query = document.getElementById('search-anon').value.toLowerCase();
    const filtered = allAnonMessages.filter(m => 
        m.text.toLowerCase().includes(query) || 
        m.inboxId.toLowerCase().includes(query)
    );
    renderAnonTable(filtered);
}

async function deleteAnonMsg(inboxId, msgId) {
    if(confirm("Delete this message?")) {
        await db.ref(`anonymous_messages/${inboxId}/${msgId}`).remove();
    }
}

// Notification Center
function loadNotificationCenter() {
    db.ref('notification_tokens').on('value', snap => {
        const countEl = document.getElementById('total-notif-tokens');
        if(countEl) countEl.innerText = snap.numChildren();
    });

    // Load and render Notification History
    db.ref('notificationHistory').on('value', snap => {
        const tbody = document.getElementById('notif-history-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        const items = [];
        snap.forEach(child => items.push({key: child.key, ...child.val()}));
        items.reverse().forEach(item => {
            tbody.innerHTML += `
                <tr class="modern-tr">
                    <td><div class="notif-type-tag type-${(item.type || 'info').toLowerCase()}">${item.type || 'Info'}</div></td>
                    <td>
                        <div class="notif-title-cell">${item.title}</div>
                        <div class="notif-body-preview">${item.message.substring(0, 45)}...</div>
                    </td>
                    <td><span class="date-label">${item.date || new Date(item.timestamp).toLocaleDateString()}</span></td>
                    <td class="action-cell">
                        <button class="admin-btn-action" onclick="resendNotif('${item.key}')" title="Resend Notification"><i class="fas fa-redo"></i></button>
                        <button class="admin-btn-delete" onclick="deleteNotifFromHistory('${item.key}')" title="Delete History"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    });
}

async function sendBroadcast() {
    const title = document.getElementById('notif-title').value;
    const message = document.getElementById('notif-body').value;
    const type = document.getElementById('notif-type')?.value || 'Information';
    const link = document.getElementById('notif-link')?.value || '';

    if(!title || !message) return alert("Please fill in both the title and the message body.");

    const notifId = Date.now().toString();
    const notifData = {
        id: notifId,
        title,
        message,
        type,
        link,
        timestamp: Date.now(),
        date: new Date().toLocaleString()
    };

    // Trigger live popup for all active users
    await db.ref('polsaSettings/lastNotification').set(notifData);
    // Save to historical records
    await db.ref('notificationHistory').child(notifId).set(notifData);
    
    alert("Real-time Broadcast Triggered Successfully!");
    
    // Reset Form
    document.getElementById('notif-title').value = '';
    document.getElementById('notif-body').value = '';
    if(document.getElementById('notif-link')) document.getElementById('notif-link').value = '';
}

async function resendNotif(id) {
    const snap = await db.ref(`notificationHistory/${id}`).once('value');
    if(!snap.exists()) return;
    
    const data = snap.val();
    data.id = Date.now().toString(); // New ID to re-trigger listeners
    data.timestamp = Date.now();
    data.date = new Date().toLocaleString();
    
    await db.ref('polsaSettings/lastNotification').set(data);
    alert("Notification Resent to all devices!");
}

async function deleteNotifFromHistory(id) {
    if(confirm("Permanently delete this notification from history?")) {
        await db.ref(`notificationHistory/${id}`).remove();
    }
}

// Voting Management Logic
function loadVotingManagement() {
    // Load Vote Price
    db.ref('votingSettings/pricePerVote').on('value', snap => {
        const val = snap.val() || 100;
        if (document.getElementById('input-vote-price')) document.getElementById('input-vote-price').value = val;
    });

    // 1. Categories Sync
    db.ref('voting/categories').on('value', snap => {
        const tbody = document.getElementById('voting-categories-tbody');
        const select = document.getElementById('contestant-category-select');
        const manualSelect = document.getElementById('manual-vote-category-select');
        if(!tbody || (!select && !manualSelect)) return;

        tbody.innerHTML = '';
        const currentVal = select ? select.value : "";
        const currentManualVal = manualSelect ? manualSelect.value : "";

        if (select) select.innerHTML = '<option value="">-- Select a Category --</option>';
        if (manualSelect) manualSelect.innerHTML = '<option value="">-- Select a Category --</option>';

        snap.forEach(child => {
            const cat = child.val();
            const id = child.key;

            tbody.innerHTML += `
                <tr class="modern-tr">
                    <td style="font-weight:bold;">${cat.name}</td>
                    <td>
                        <button class="admin-btn-delete" onclick="deleteVotingCategory('${id}')">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
            const option = `<option value="${id}">${cat.name}</option>`;
            if (select) select.innerHTML += option;
            if (manualSelect) manualSelect.innerHTML += option;
        });
        if (select) select.value = currentVal;
        if (manualSelect) manualSelect.value = currentManualVal;
    });

    // 2. Voting Stats
    db.ref('voting/categories').on('value', snap => {
        let totalVotes = 0;
        let activeCats = 0;
        let mostVotedName = "N/A";
        let maxVotes = -1;

        snap.forEach(catSnap => {
            activeCats++;
            const contestants = catSnap.val().contestants || {};
            Object.values(contestants).forEach(c => {
                totalVotes += (c.votes || 0);
                if ((c.votes || 0) > maxVotes) {
                    maxVotes = c.votes;
                    mostVotedName = c.name;
                }
            });
        });

        document.getElementById('stat-total-votes').innerText = totalVotes;
        document.getElementById('stat-voting-revenue').innerText = `₦${totalVotes * 100}`;
        document.getElementById('stat-active-categories').innerText = activeCats;
        document.getElementById('stat-most-voted').innerText = mostVotedName;
    });
}

function saveVotePrice() {
    const input = document.getElementById('input-vote-price');
    const price = parseInt(input.value);
    if (isNaN(price) || price < 1) return alert("Please enter a valid price (minimum ₦1).");
    db.ref('votingSettings/pricePerVote').set(price);
    alert("Vote price updated successfully!");
}

function saveVotingCategory() {
    const name = document.getElementById('voting-category-name').value.trim();
    if (!name) return alert("Please enter a category name.");

    db.ref('voting/categories').push({
        name: name,
        status: 'active',
        timestamp: Date.now()
    }).then(() => {
        document.getElementById('voting-category-name').value = '';
        alert("Category added successfully!");
    });
}

async function deleteVotingCategory(id) {
    if(confirm("Delete this category and all its contestants? This cannot be undone.")) {
        await db.ref(`voting/categories/${id}`).remove();
    }
}

function loadContestantsForAdmin() {
    cancelContestantEdit();
    const categoryId = document.getElementById('contestant-category-select').value;
    const formArea = document.getElementById('contestant-form-area');
    const listArea = document.getElementById('contestants-list-admin');

    if (!categoryId) {
        formArea.classList.add('hidden');
        listArea.innerHTML = '';
        return;
    }

    formArea.classList.remove('hidden');
    db.ref(`voting/categories/${categoryId}/contestants`).on('value', snap => {
        listArea.innerHTML = '';
        if (!snap.exists()) {
            listArea.innerHTML = '<p style="color:#666; font-size:0.8rem;">No contestants in this category.</p>';
            return;
        }
        snap.forEach(child => {
            const c = child.val();
            const id = child.key;
            listArea.innerHTML += `
                <div class="contestant-card-admin">
                    <img src="${c.imageUrl || 'https://via.placeholder.com/150'}" alt="${c.name}">
                    <div style="flex:1;">
                        <h4>${c.name}</h4>
                        <p>${c.level}</p>
                        <p style="color:var(--light-green); font-weight:bold;">Votes: ${c.votes || 0}</p>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="admin-btn-action" onclick="editContestant('${categoryId}', '${id}')" title="Edit Contestant">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="admin-btn-delete" onclick="deleteContestant('${categoryId}', '${id}')" title="Delete Contestant">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    });
}

async function deleteContestant(catId, conId) {
    if(confirm("Remove this contestant from the category?")) {
        await db.ref(`voting/categories/${catId}/contestants/${conId}`).remove();
    }
}

// Edit State Tracking
let editingContestantId = null;
let editingCategoryId = null;

function editContestant(catId, conId) {
    db.ref(`voting/categories/${catId}/contestants/${conId}`).once('value', snap => {
        const c = snap.val();
        if(!c) return;
        
        editingContestantId = conId;
        editingCategoryId = catId;
        
        document.getElementById('contestant-name').value = c.name;
        document.getElementById('contestant-level').value = c.level;
        
        const preview = document.getElementById('contestant-img-preview');
        preview.src = c.imageUrl || 'https://via.placeholder.com/150';
        preview.classList.remove('hidden');
        
        const btn = document.getElementById('btn-upload-contestant');
        btn.innerText = 'Update Contestant';
        document.getElementById('btn-cancel-contestant-edit').classList.remove('hidden');
        
        // Smooth scroll to form
        window.scrollTo({ top: document.getElementById('contestant-form-area').offsetTop - 100, behavior: 'smooth' });
    });
}

function cancelContestantEdit() {
    editingContestantId = null;
    editingCategoryId = null;
    
    document.getElementById('contestant-name').value = '';
    document.getElementById('contestant-image-upload').value = '';
    document.getElementById('contestant-img-preview').classList.add('hidden');
    
    document.getElementById('btn-upload-contestant').innerText = 'Upload Contestant';
    document.getElementById('btn-cancel-contestant-edit').classList.add('hidden');
}

async function addContestant() {
    const categoryId = document.getElementById('contestant-category-select').value;
    const name = document.getElementById('contestant-name').value.trim();
    const level = document.getElementById('contestant-level').value;
    const fileInput = document.getElementById('contestant-image-upload');
    const file = fileInput.files[0];
    const btn = document.getElementById('btn-upload-contestant');

    if (!name || (!editingContestantId && !file)) {
        return alert("Please enter contestant name and select an image.");
    }

    btn.disabled = true;
    btn.innerHTML = editingContestantId ? '<i class="fas fa-spinner fa-spin"></i> Updating...' : '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    let imageUrl = null;

    // If a new file is selected, upload to Cloudinary
    if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'polsasite');

        try {
            const res = await fetch('https://api.cloudinary.com/v1_1/ddoetcvxy/image/upload', { method: 'POST', body: formData });
            const data = await res.json();
            imageUrl = data.secure_url;
        } catch (err) {
            alert("Image upload failed. Check connection.");
            btn.disabled = false;
            btn.innerHTML = editingContestantId ? 'Update Contestant' : 'Upload Contestant';
            return;
        }
    }

    try {
        const contestantData = {
            name,
            level,
            timestamp: Date.now()
        };
        if (imageUrl) contestantData.imageUrl = imageUrl;
        
        if (editingContestantId) {
            // Update existing
            await db.ref(`voting/categories/${editingCategoryId}/contestants/${editingContestantId}`).update(contestantData);
            
            // If category changed, move the contestant record
            if (editingCategoryId !== categoryId) {
                const snap = await db.ref(`voting/categories/${editingCategoryId}/contestants/${editingContestantId}`).once('value');
                await db.ref(`voting/categories/${categoryId}/contestants`).push(snap.val());
                await db.ref(`voting/categories/${editingCategoryId}/contestants/${editingContestantId}`).remove();
            }
            alert("Contestant updated successfully!");
        } else {
            // Create new
            contestantData.votes = 0;
            await db.ref(`voting/categories/${categoryId}/contestants`).push(contestantData);
            alert("Contestant uploaded successfully!");
        }
        cancelContestantEdit();
    } catch (err) {
        alert("Upload failed. Please check connection.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Upload Contestant';
    }
}

// Manual Vote Management Functions
function loadManualContestants() {
    const categoryId = document.getElementById('manual-vote-category-select').value;
    const formArea = document.getElementById('manual-contestant-form-area');
    const select = document.getElementById('manual-vote-contestant-select');

    if (!categoryId) {
        formArea.classList.add('hidden');
        return;
    }

    formArea.classList.remove('hidden');
    db.ref(`voting/categories/${categoryId}/contestants`).on('value', snap => {
        select.innerHTML = '<option value="">-- Select a Contestant --</option>';
        if (!snap.exists()) return;
        snap.forEach(child => {
            select.innerHTML += `<option value="${child.key}">${child.val().name}</option>`;
        });
    });
}

async function addManualVotes() {
    const categoryId = document.getElementById('manual-vote-category-select').value;
    const contestantId = document.getElementById('manual-vote-contestant-select').value;
    const votesToAdd = parseInt(document.getElementById('input-manual-votes').value);

    if (!categoryId || !contestantId || isNaN(votesToAdd) || votesToAdd < 1) {
        return alert("Please select category, contestant and enter a valid number of votes.");
    }

    if (!confirm(`Add ${votesToAdd} manual votes to this contestant?`)) return;

    try {
        const votesRef = db.ref(`voting/categories/${categoryId}/contestants/${contestantId}/votes`);
        await votesRef.transaction(currentVotes => (currentVotes || 0) + votesToAdd);
        
        db.ref('adminLogs').push({
            action: `Manual Votes: +${votesToAdd} to ${contestantId}`,
            timestamp: Date.now()
        });

        alert("Votes updated successfully!");
        document.getElementById('input-manual-votes').value = '';
    } catch (err) {
        alert("Action failed. Please check connection.");
    }
}

// Initialize
window.onload = initAdminDashboard;