/**
 * RetentaShield — Student Retention early warning system
 * Front-end Interaction Script
 */

// Configure your production backend API URL here after deploying the FastAPI service
const PRODUCTION_API_URL = 'https://retentashield-backend.onrender.com'; 

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : PRODUCTION_API_URL;

// Global application state
const state = {
    // Roster query parameters
    currentPage: 1,
    pageSize: 25,
    totalPages: 1,
    searchQuery: '',
    riskTier: '',
    course: '',
    sortBy: 'risk_score',
    sortOrder: 'desc',

    // Cached elements and lists
    coursesList: [],
    
    // Chart.js instances (stored to destroy & rebuild on update)
    courseChart: null,
    genderChart: null,
    
    // Status polling interval
    healthCheckInterval: null
};

// ==========================================================================
// Initialization & Event Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Initial server check
    checkApiHealth();
    state.healthCheckInterval = setInterval(checkApiHealth, 20000);

    // Load static data & dashboard metrics
    loadDashboardData();

    // Load roster data
    loadStudentsRoster();

    // Register all DOM events
    registerEventListeners();
});

function registerEventListeners() {
    // Search Box Inputs
    const searchInput = document.getElementById('filter-search');
    const clearSearchBtn = document.getElementById('btn-clear-search');
    
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
        
        // Debounce search
        clearTimeout(state.searchTimeout);
        state.searchTimeout = setTimeout(() => {
            state.currentPage = 1;
            loadStudentsRoster();
        }, 400);
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        clearSearchBtn.style.display = 'none';
        state.currentPage = 1;
        loadStudentsRoster();
    });

    // Dropdown filters
    document.getElementById('filter-risk-tier').addEventListener('change', (e) => {
        state.riskTier = e.target.value;
        state.currentPage = 1;
        loadStudentsRoster();
    });

    document.getElementById('filter-course').addEventListener('change', (e) => {
        state.course = e.target.value;
        state.currentPage = 1;
        loadStudentsRoster();
    });

    document.getElementById('sort-by').addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        state.currentPage = 1;
        loadStudentsRoster();
    });

    // Sort order button
    const sortOrderBtn = document.getElementById('btn-toggle-sort-order');
    const sortOrderIcon = document.getElementById('icon-sort-order');
    sortOrderBtn.addEventListener('click', () => {
        if (state.sortOrder === 'desc') {
            state.sortOrder = 'asc';
            sortOrderIcon.className = 'lucide-arrow-up-narrow-wide';
            sortOrderIcon.setAttribute('data-lucide', 'arrow-up-narrow-wide');
        } else {
            state.sortOrder = 'desc';
            sortOrderIcon.className = 'lucide-arrow-down-narrow-wide';
            sortOrderIcon.setAttribute('data-lucide', 'arrow-down-narrow-wide');
        }
        lucide.createIcons(); // refresh icons
        state.currentPage = 1;
        loadStudentsRoster();
    });

    // Reset filters
    document.getElementById('btn-reset-filters').addEventListener('click', () => {
        document.getElementById('filter-search').value = '';
        document.getElementById('filter-risk-tier').value = '';
        document.getElementById('filter-course').value = '';
        document.getElementById('sort-by').value = 'risk_score';
        clearSearchBtn.style.display = 'none';
        
        state.searchQuery = '';
        state.riskTier = '';
        state.course = '';
        state.sortBy = 'risk_score';
        state.sortOrder = 'desc';
        state.currentPage = 1;
        
        sortOrderIcon.className = 'lucide-arrow-down-narrow-wide';
        sortOrderIcon.setAttribute('data-lucide', 'arrow-down-narrow-wide');
        lucide.createIcons();
        
        loadStudentsRoster();
    });

    // Page size selector
    document.getElementById('page-size-select').addEventListener('change', (e) => {
        state.pageSize = parseInt(e.target.value, 10);
        state.currentPage = 1;
        loadStudentsRoster();
    });

    // Pagination buttons
    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            loadStudentsRoster();
        }
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            loadStudentsRoster();
        }
    });

    // Modal close hooks
    document.getElementById('btn-close-detail-modal').addEventListener('click', () => {
        closeModal('modal-student-detail');
    });
    
    document.getElementById('btn-close-simulator-modal').addEventListener('click', () => {
        closeModal('modal-simulator');
    });
    document.getElementById('btn-close-simulator-modal-footer').addEventListener('click', () => {
        closeModal('modal-simulator');
    });

    // Open Simulator
    document.getElementById('btn-open-simulator').addEventListener('click', () => {
        openSimulatorModal();
    });

    // Detail modal tweak button
    document.getElementById('btn-detail-tweak').addEventListener('click', () => {
        const studentIndex = document.getElementById('detail-student-index').textContent;
        closeModal('modal-student-detail');
        openSimulatorModal(studentIndex);
    });

    // Simulator Tab switches
    const tabBtns = document.querySelectorAll('.simulator-tabs .tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.simulator-form-body .tab-panel').forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Template loading hooks in Simulator
    document.getElementById('btn-simulator-load-template').addEventListener('click', (e) => {
        e.preventDefault();
        const indexInput = document.getElementById('simulator-student-template');
        const index = parseInt(indexInput.value, 10);
        if (!isNaN(index) && index >= 0 && index <= 4423) {
            loadStudentFeaturesIntoSimulator(index);
        } else {
            alert('Please enter a valid student index between 0 and 4423.');
        }
    });

    document.getElementById('btn-simulator-random').addEventListener('click', (e) => {
        e.preventDefault();
        const randomIndex = Math.floor(Math.random() * 4424);
        document.getElementById('simulator-student-template').value = randomIndex;
        loadStudentFeaturesIntoSimulator(randomIndex);
    });

    document.getElementById('btn-simulator-demo').addEventListener('click', (e) => {
        e.preventDefault();
        const demoIndex = 3533; // Predefined high risk student index for demo purposes
        document.getElementById('simulator-student-template').value = demoIndex;
        loadStudentFeaturesIntoSimulator(demoIndex);
    });

    document.getElementById('btn-simulator-reset').addEventListener('click', () => {
        document.getElementById('simulator-form').reset();
    });

    // Simulator form submit
    document.getElementById('simulator-form').addEventListener('submit', (e) => {
        e.preventDefault();
        submitSimulation();
    });

    // Close modal on background click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal(e.target.id);
        }
    });
}

// ==========================================================================
// Health & Status Checking
// ==========================================================================
async function checkApiHealth() {
    const statusBadge = document.getElementById('api-status');
    const statusText = statusBadge.querySelector('.status-text');
    
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            statusBadge.className = 'status-badge status-online';
            statusText.textContent = 'API: Connected';
        } else {
            throw new Error('Healthy check endpoint returned error status');
        }
    } catch (err) {
        statusBadge.className = 'status-badge status-offline';
        statusText.textContent = 'API: Disconnected';
        console.error('API connection failed:', err);
    }
}

// ==========================================================================
// Dashboard Data Loading & Chart Rendering
// ==========================================================================
async function loadDashboardData() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard-summary`);
        if (!response.ok) throw new Error('Failed to load dashboard summary');
        const data = await response.json();

        // Populate KPIs
        document.getElementById('val-total-students').textContent = data.total_students.toLocaleString();
        
        const high = data.risk_tiers.high;
        const medium = data.risk_tiers.medium;
        const low = data.risk_tiers.low;
        
        document.getElementById('val-high-risk').textContent = high.toLocaleString();
        document.getElementById('val-high-risk-pct').textContent = `${((high / data.total_students) * 100).toFixed(1)}% of cohort`;
        
        document.getElementById('val-medium-risk').textContent = medium.toLocaleString();
        document.getElementById('val-medium-risk-pct').textContent = `${((medium / data.total_students) * 100).toFixed(1)}% of cohort`;
        
        document.getElementById('val-low-risk').textContent = low.toLocaleString();
        document.getElementById('val-low-risk-pct').textContent = `${((low / data.total_students) * 100).toFixed(1)}% of cohort`;
        
        document.getElementById('val-model-performance').textContent = `${data.model_accuracy.toFixed(1)}% / ${data.model_f1.toFixed(1)}%`;

        // Cache courses list and update Course Filter dropdown options
        state.coursesList = data.course_breakdown.map(item => item.label);
        populateCourseFilterOptions(state.coursesList);

        // Render charts
        renderCourseRiskChart(data.course_breakdown);
        renderGenderRiskChart(data.gender_breakdown);

    } catch (err) {
        console.error('Error fetching dashboard summary:', err);
    }
}

function populateCourseFilterOptions(courses) {
    const filterSelect = document.getElementById('filter-course');
    const simulatorSelect = document.getElementById('sim-course');
    
    // Clear dynamic options in filter select
    filterSelect.innerHTML = '<option value="">All Courses</option>';
    
    // Sort courses alphabetically
    const sortedCourses = [...courses].sort();
    
    sortedCourses.forEach(course => {
        const option = document.createElement('option');
        option.value = course;
        option.textContent = course;
        filterSelect.appendChild(option);
    });
}

function renderCourseRiskChart(courseBreakdown) {
    const ctx = document.getElementById('chart-courses').getContext('2d');
    
    // Destroy existing chart if it exists to prevent overlapping
    if (state.courseChart) {
        state.courseChart.destroy();
    }
    
    // Top 8 courses by enrollment to avoid chart clutter
    const displayItems = courseBreakdown.slice(0, 8);
    
    const labels = displayItems.map(item => {
        // truncate long names
        return item.label.length > 25 ? item.label.slice(0, 25) + '...' : item.label;
    });
    
    const dataLow = displayItems.map(item => item.low);
    const dataMedium = displayItems.map(item => item.medium);
    const dataHigh = displayItems.map(item => item.high);

    state.courseChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Low Risk',
                    data: dataLow,
                    backgroundColor: '#16a34a',
                    borderRadius: 4
                },
                {
                    label: 'Medium Risk',
                    data: dataMedium,
                    backgroundColor: '#d97706',
                    borderRadius: 4
                },
                {
                    label: 'High Risk',
                    data: dataHigh,
                    backgroundColor: '#004E64', // primary teal
                    borderRadius: 4
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: 'Plus Jakarta Sans', weight: '600', size: 11 },
                        padding: 15
                    }
                },
                tooltip: {
                    mode: 'y',
                    intersect: false,
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleFont: { family: 'Plus Jakarta Sans', weight: 'bold' },
                    bodyFont: { family: 'Plus Jakarta Sans' }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: 'rgba(0, 0, 0, 0.04)' },
                    ticks: { font: { family: 'Plus Jakarta Sans', size: 10 } }
                },
                y: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { font: { family: 'Plus Jakarta Sans', weight: '500', size: 11 } }
                }
            }
        }
    });
}

function renderGenderRiskChart(genderBreakdown) {
    const ctx = document.getElementById('chart-gender').getContext('2d');
    
    if (state.genderChart) {
        state.genderChart.destroy();
    }
    
    // We want to display gender breakdown. 
    // Let's display the overall cohort size per gender (Male vs Female) inside the doughnut.
    // BreakdownItem: { label: str, total: int, high: int, medium: int, low: int }
    const labels = genderBreakdown.map(item => item.label);
    const totals = genderBreakdown.map(item => item.total);
    const highRisks = genderBreakdown.map(item => item.high);

    state.genderChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: totals,
                backgroundColor: [
                    '#004E64', // Teal (Male or Female)
                    '#cbd5dc'  // Gray-Blue
                ],
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: 'Plus Jakarta Sans', weight: '600', size: 11 },
                        padding: 10
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleFont: { family: 'Plus Jakarta Sans', weight: 'bold' },
                    bodyFont: { family: 'Plus Jakarta Sans' },
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const item = genderBreakdown[index];
                            const highCount = item.high;
                            const highPct = ((highCount / item.total) * 100).toFixed(1);
                            return `${context.label}: ${context.raw.toLocaleString()} students (${highPct}% High Risk)`;
                        }
                    }
                }
            }
        }
    });
}

// ==========================================================================
// Student Roster / Table Management
// ==========================================================================
async function loadStudentsRoster() {
    const tableBody = document.getElementById('table-body');
    
    // Construct query parameters
    const params = new URLSearchParams({
        page: state.currentPage,
        page_size: state.pageSize,
        sort_by: state.sortBy,
        sort_order: state.sortOrder
    });
    
    if (state.riskTier) params.append('risk_tier', state.riskTier);
    if (state.course) params.append('course', state.course);
    if (state.searchQuery) params.append('search', state.searchQuery);

    try {
        const response = await fetch(`${API_BASE_URL}/students?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to load students list');
        const data = await response.json();

        // Calculate pages
        state.totalPages = Math.ceil(data.total / state.page_size) || 1;
        
        // Update summary counts
        document.getElementById('val-visible-students').textContent = data.students.length;
        document.getElementById('val-filtered-total').textContent = data.total.toLocaleString();
        
        // Render
        renderStudentsTable(data.students);
        updatePaginationUI();

    } catch (err) {
        console.error('Error fetching roster:', err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: #ef4444; padding: 24px;">
                    <i data-lucide="alert-circle" style="display:inline-block; vertical-align:middle; margin-right:8px;"></i>
                    Failed to connect to API. Please ensure the backend server is running.
                </td>
            </tr>
        `;
        lucide.createIcons();
    }
}

function renderStudentsTable(students) {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = '';
    
    if (students.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">
                    No matching student records found.
                </td>
            </tr>
        `;
        return;
    }

    students.forEach(student => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-student-index', student.index);
        
        // Risk tier details
        let badgeClass = 'badge-low';
        let barColor = 'var(--risk-low)';
        if (student.risk_tier === 'High') {
            badgeClass = 'badge-high';
            barColor = 'var(--risk-high)';
        } else if (student.risk_tier === 'Medium') {
            badgeClass = 'badge-medium';
            barColor = 'var(--risk-medium)';
        }

        // Curricular stats string
        const approvedUnits = `S1: ${student.cu_1st_approved} | S2: ${student.cu_2nd_approved}`;

        tr.innerHTML = `
            <td class="bold font-mono">#${student.index}</td>
            <td class="bold" title="${student.course}">${student.course}</td>
            <td>${student.gender}</td>
            <td>${student.age} yrs</td>
            <td>${student.admission_grade.toFixed(1)}</td>
            <td>
                <div class="risk-score-cell-wrapper">
                    <span class="risk-text-value ${student.risk_tier === 'High' ? 'bold color-primary' : ''}">${student.risk_score.toFixed(1)}%</span>
                    <div class="table-risk-bar-track">
                        <div class="table-risk-bar-fill" style="width: ${student.risk_score}%; background-color: ${barColor}"></div>
                    </div>
                </div>
            </td>
            <td>
                <span class="tier-badge ${badgeClass}">${student.risk_tier}</span>
            </td>
            <td>
                <button class="btn btn-secondary btn-icon-only btn-view-detail" title="View retention profile">
                    <i data-lucide="eye"></i>
                </button>
            </td>
        `;

        // Row and view button click opens detailed modal
        tr.addEventListener('click', (e) => {
            // Avoid triggering detail modal twice if button is clicked
            if (e.target.closest('.btn-view-detail')) return;
            showStudentDetails(student.index);
        });

        tr.querySelector('.btn-view-detail').addEventListener('click', () => {
            showStudentDetails(student.index);
        });

        tableBody.appendChild(tr);
    });

    lucide.createIcons();
}

function updatePaginationUI() {
    document.getElementById('val-current-page').textContent = state.currentPage;
    document.getElementById('val-total-pages').textContent = state.totalPages;
    
    document.getElementById('btn-prev-page').disabled = (state.currentPage === 1);
    document.getElementById('btn-next-page').disabled = (state.currentPage === state.totalPages);
}

// ==========================================================================
// Student Detailed Prediction Modal
// ==========================================================================
async function showStudentDetails(index) {
    openModal('modal-student-detail');
    
    // Populate loading states first
    document.getElementById('modal-student-title').textContent = `Loading Student Profile #${index}...`;
    document.getElementById('detail-student-index').textContent = `#${index}`;
    document.getElementById('detail-student-course').textContent = 'Loading...';
    document.getElementById('detail-student-gender').textContent = 'Loading...';
    document.getElementById('detail-student-age').textContent = 'Loading...';
    document.getElementById('detail-student-admission').textContent = 'Loading...';
    document.getElementById('detail-student-cu1-app').textContent = '-';
    document.getElementById('detail-student-cu2-app').textContent = '-';
    
    document.getElementById('detail-risk-score-val').textContent = '0%';
    document.getElementById('detail-gauge-circle').style.background = 'conic-gradient(var(--bg-secondary) 0%, var(--bg-secondary) 100%)';
    
    document.getElementById('val-prob-dropout').textContent = '0.0%';
    document.getElementById('bar-prob-dropout').style.width = '0%';
    document.getElementById('val-prob-enrolled').textContent = '0.0%';
    document.getElementById('bar-prob-enrolled').style.width = '0%';
    document.getElementById('val-prob-graduate').textContent = '0.0%';
    document.getElementById('bar-prob-graduate').style.width = '0%';
    
    document.getElementById('detail-factors-container').innerHTML = '<p class="text-muted">Loading factors...</p>';
    document.getElementById('detail-intervention-banner').className = 'modal-footer intervention-banner';
    document.getElementById('detail-intervention-category').textContent = 'Analyzing';
    document.getElementById('detail-intervention-urgency').textContent = '';
    document.getElementById('detail-intervention-action').textContent = 'Retrieving retention recommendations...';

    try {
        // First fetch basic info from local directory search or metadata
        // In app.py, students list matches indexes. Let's find student row in current table or make a search
        const studentRes = await fetch(`${API_BASE_URL}/students?search=${index}`);
        let basicInfo = null;
        if (studentRes.ok) {
            const listData = await studentRes.json();
            if (listData.students.length > 0) {
                basicInfo = listData.students[0];
            }
        }

        // Fetch complete prediction detail
        const response = await fetch(`${API_BASE_URL}/students/${index}`);
        if (!response.ok) throw new Error('Student prediction details not found');
        const data = await response.json();

        // Fill basic details
        document.getElementById('modal-student-title').textContent = `Retention Analysis: Student #${index}`;
        
        if (basicInfo) {
            document.getElementById('detail-student-course').textContent = basicInfo.course;
            document.getElementById('detail-student-gender').textContent = basicInfo.gender;
            document.getElementById('detail-student-age').textContent = `${basicInfo.age} years`;
            document.getElementById('detail-student-admission').textContent = basicInfo.admission_grade.toFixed(1);
            document.getElementById('detail-student-cu1-app').textContent = `${basicInfo.cu_1st_approved} modules`;
            document.getElementById('detail-student-cu2-app').textContent = `${basicInfo.cu_2nd_approved} modules`;
        } else {
            document.getElementById('detail-student-course').textContent = 'Refer to simulator';
            document.getElementById('detail-student-gender').textContent = '-';
            document.getElementById('detail-student-age').textContent = '-';
            document.getElementById('detail-student-admission').textContent = '-';
        }

        // Set Risk Tier Badge
        const badge = document.getElementById('detail-risk-badge');
        badge.textContent = `${data.risk_tier} RISK`;
        badge.className = `risk-badge badge-${data.risk_tier.toLowerCase()}`;
        
        // Define risk color based on tier
        let riskColor = 'var(--risk-low)';
        if (data.risk_tier === 'High') {
            riskColor = 'var(--risk-high)';
        } else if (data.risk_tier === 'Medium') {
            riskColor = 'var(--risk-medium)';
        }

        // Animate Radial Gauge
        document.getElementById('detail-risk-score-val').textContent = `${data.risk_score.toFixed(1)}%`;
        document.getElementById('detail-gauge-circle').style.background = `conic-gradient(${riskColor} ${data.risk_score}%, var(--bg-secondary) ${data.risk_score}%)`;

        // Fill Probabilities
        document.getElementById('val-prob-dropout').textContent = `${data.probabilities.Dropout.toFixed(1)}%`;
        document.getElementById('bar-prob-dropout').style.width = `${data.probabilities.Dropout}%`;
        
        const enrolledProb = data.probabilities.Enrolled;
        const enrolledContainer = document.getElementById('container-prob-enrolled');
        if (enrolledProb !== undefined) {
            if (enrolledContainer) enrolledContainer.style.display = 'block';
            document.getElementById('val-prob-enrolled').textContent = `${enrolledProb.toFixed(1)}%`;
            document.getElementById('bar-prob-enrolled').style.width = `${enrolledProb}%`;
        } else {
            if (enrolledContainer) enrolledContainer.style.display = 'none';
        }
        
        document.getElementById('val-prob-graduate').textContent = `${data.probabilities.Graduate.toFixed(1)}%`;
        document.getElementById('bar-prob-graduate').style.width = `${data.probabilities.Graduate}%`;

        // Fill Factors List
        const factorsContainer = document.getElementById('detail-factors-container');
        factorsContainer.innerHTML = '';
        
        data.top_factors.forEach(factor => {
            const factorDiv = document.createElement('div');
            factorDiv.className = 'factor-item';
            factorDiv.innerHTML = `
                <div class="factor-header">
                    <span class="factor-label" title="${factor.feature}">${factor.label}</span>
                    <span class="factor-weight">${factor.contribution_pct.toFixed(1)}%</span>
                </div>
                <div class="factor-bar-track">
                    <div class="factor-bar-fill" style="width: ${factor.contribution_pct}%;"></div>
                </div>
                <span class="factor-category-tag">${factor.category}</span>
            `;
            factorsContainer.appendChild(factorDiv);
        });

        // Fill Intervention Banner
        document.getElementById('detail-intervention-category').textContent = data.intervention.category;
        document.getElementById('detail-intervention-urgency').textContent = data.intervention.urgency;
        document.getElementById('detail-intervention-action').textContent = data.intervention.action;
        
        // Dynamic banner border accents
        const banner = document.getElementById('detail-intervention-banner');
        banner.style.borderTopColor = riskColor;
        
        // Set icon based on category
        const iconElement = document.getElementById('intervention-icon');
        let iconName = 'heart-handshake';
        const cat = data.intervention.category.toLowerCase();
        if (cat.includes('academic')) {
            iconName = 'graduation-cap';
        } else if (cat.includes('financial')) {
            iconName = 'credit-card';
        } else if (cat.includes('personal') || cat.includes('demographic')) {
            iconName = 'user';
        } else if (cat.includes('family')) {
            iconName = 'users';
        } else if (cat.includes('macro')) {
            iconName = 'trending-up';
        }
        iconElement.setAttribute('data-lucide', iconName);
        lucide.createIcons();

    } catch (err) {
        console.error(err);
        document.getElementById('modal-student-title').textContent = 'Analysis Load Failure';
        document.getElementById('detail-factors-container').innerHTML = `
            <div style="color: #ef4444; padding: 12px; font-weight:600;">
                Failed to load prediction details for student #${index}.
            </div>
        `;
    }
}

// ==========================================================================
// Predictor Simulator Management
// ==========================================================================
function openSimulatorModal(tweakIndex = null) {
    openModal('modal-simulator');
    
    // Set default tab
    document.querySelectorAll('.simulator-tabs .tab-btn').forEach((btn, idx) => {
        if (idx === 0) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    document.querySelectorAll('.simulator-form-body .tab-panel').forEach((panel, idx) => {
        if (idx === 0) panel.classList.add('active');
        else panel.classList.remove('active');
    });

    if (tweakIndex !== null) {
        const numericIndex = parseInt(tweakIndex.toString().replace('#', ''), 10);
        if (!isNaN(numericIndex)) {
            document.getElementById('simulator-student-template').value = numericIndex;
            loadStudentFeaturesIntoSimulator(numericIndex);
        } else {
            // If tweaking a simulated run, the current tweaked values are already in the form.
            // Do not call the API to overwrite them, just clear the template input box.
            document.getElementById('simulator-student-template').value = '';
        }
    } else {
        // Pre-fill with a random student automatically so form is never empty
        const randomIndex = Math.floor(Math.random() * 4424);
        document.getElementById('simulator-student-template').value = randomIndex;
        loadStudentFeaturesIntoSimulator(randomIndex);
    }
}

async function loadStudentFeaturesIntoSimulator(index) {
    const btnLoad = document.getElementById('btn-simulator-load-template');
    const prevText = btnLoad.textContent;
    btnLoad.textContent = 'Loading...';
    btnLoad.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/students/${index}/features`);
        if (!response.ok) throw new Error('Features endpoint returned error status');
        const features = await response.json();

        // Populate all inputs in the form
        const form = document.getElementById('simulator-form');
        
        // Iterate through all key-values in features and set inputs
        for (const [key, value] of Object.entries(features)) {
            // Find input element with name matching raw feature name
            const input = form.querySelector(`[name="${key}"]`);
            if (input) {
                if (input.tagName === 'SELECT') {
                    // Normalize comparison (e.g. 1.0 vs 1)
                    const targetVal = parseFloat(value);
                    let optionExists = false;
                    for (let i = 0; i < input.options.length; i++) {
                        if (parseFloat(input.options[i].value) === targetVal) {
                            optionExists = true;
                            input.value = input.options[i].value;
                            break;
                        }
                    }
                    if (!optionExists) {
                        // Create option dynamically
                        const opt = document.createElement('option');
                        opt.value = String(targetVal);
                        opt.textContent = `Other (Code ${targetVal})`;
                        input.appendChild(opt);
                        input.value = String(targetVal);
                    }
                } else {
                    input.value = value;
                }
            }
        }
        console.log(`Loaded student features template for index #${index}`);

    } catch (err) {
        console.warn('Could not load raw student features from backend. Falling back to default form.', err);
        // Let's populate some sensible mock data based on averages if the endpoint fails
        fillsensibleMockValues();
    } finally {
        btnLoad.textContent = prevText;
        btnLoad.disabled = false;
    }
}

function fillsensibleMockValues() {
    // Falls back if endpoint fails
    const form = document.getElementById('simulator-form');
    const defaults = {
        "Marital Status": "1",
        "Application mode": "17",
        "Application order": "1",
        "Course": "171",
        "Daytime/evening attendance": "1",
        "Previous qualification": "1",
        "Previous qualification (grade)": "125.0",
        "Nacionality": "1",
        "Mother's qualification": "1",
        "Father's qualification": "1",
        "Mother's occupation": "1",
        "Father's occupation": "1",
        "Admission grade": "120.0",
        "Displaced": "0",
        "Educational special needs": "0",
        "Debtor": "0",
        "Tuition fees up to date": "1",
        "Gender": "0",
        "Scholarship holder": "0",
        "Age at enrollment": "20",
        "International": "0",
        "Curricular units 1st sem (credited)": "0",
        "Curricular units 1st sem (enrolled)": "6",
        "Curricular units 1st sem (evaluations)": "8",
        "Curricular units 1st sem (approved)": "5",
        "Curricular units 1st sem (grade)": "12.0",
        "Curricular units 1st sem (without evaluations)": "0",
        "Curricular units 2nd sem (credited)": "0",
        "Curricular units 2nd sem (enrolled)": "6",
        "Curricular units 2nd sem (evaluations)": "8",
        "Curricular units 2nd sem (approved)": "5",
        "Curricular units 2nd sem (grade)": "11.5",
        "Curricular units 2nd sem (without evaluations)": "0",
        "Unemployment rate": "11.0",
        "Inflation rate": "1.4",
        "GDP": "1.5"
    };

    for (const [key, val] of Object.entries(defaults)) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) input.value = val;
    }
}

async function submitSimulation() {
    const btnSubmit = document.getElementById('btn-simulator-submit');
    const submitTextSpan = btnSubmit.querySelector('span');
    const prevText = submitTextSpan.textContent;
    
    submitTextSpan.textContent = 'Simulating...';
    btnSubmit.disabled = true;

    // Gather features
    const form = document.getElementById('simulator-form');
    const payload = {};

    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
        payload[key] = parseFloat(value);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/predict`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Prediction API returned an error');
        const data = await response.json();

        // Close Simulator Modal
        closeModal('modal-simulator');

        // Open detailed view modal and populate it with simulated values!
        openModal('modal-student-detail');
        
        // Populate layout as simulated run
        document.getElementById('modal-student-title').textContent = `Simulation Results (Custom Student)`;
        document.getElementById('detail-student-index').textContent = `Simulated`;
        
        // Course name from code
        const courseCode = payload['Course'];
        const courseName = document.querySelector(`#sim-course option[value="${courseCode}"]`)?.textContent || `Course ${courseCode}`;
        document.getElementById('detail-student-course').textContent = courseName;
        
        document.getElementById('detail-student-gender').textContent = payload['Gender'] === 1 ? 'Male' : 'Female';
        document.getElementById('detail-student-age').textContent = `${payload['Age at enrollment']} years`;
        document.getElementById('detail-student-admission').textContent = payload['Admission grade'].toFixed(1);
        document.getElementById('detail-student-cu1-app').textContent = `${payload['Curricular units 1st sem (approved)']} modules`;
        document.getElementById('detail-student-cu2-app').textContent = `${payload['Curricular units 2nd sem (approved)']} modules`;

        // Badge
        const badge = document.getElementById('detail-risk-badge');
        badge.textContent = `${data.risk_tier} RISK`;
        badge.className = `risk-badge badge-${data.risk_tier.toLowerCase()}`;
        
        let riskColor = 'var(--risk-low)';
        if (data.risk_tier === 'High') {
            riskColor = 'var(--risk-high)';
        } else if (data.risk_tier === 'Medium') {
            riskColor = 'var(--risk-medium)';
        }

        // Radial gauge
        document.getElementById('detail-risk-score-val').textContent = `${data.risk_score.toFixed(1)}%`;
        document.getElementById('detail-gauge-circle').style.background = `conic-gradient(${riskColor} ${data.risk_score}%, var(--bg-secondary) ${data.risk_score}%)`;

        // Fill Probabilities
        document.getElementById('val-prob-dropout').textContent = `${data.probabilities.Dropout.toFixed(1)}%`;
        document.getElementById('bar-prob-dropout').style.width = `${data.probabilities.Dropout}%`;
        
        const enrolledProb = data.probabilities.Enrolled;
        const enrolledContainer = document.getElementById('container-prob-enrolled');
        if (enrolledProb !== undefined) {
            if (enrolledContainer) enrolledContainer.style.display = 'block';
            document.getElementById('val-prob-enrolled').textContent = `${enrolledProb.toFixed(1)}%`;
            document.getElementById('bar-prob-enrolled').style.width = `${enrolledProb}%`;
        } else {
            if (enrolledContainer) enrolledContainer.style.display = 'none';
        }
        
        document.getElementById('val-prob-graduate').textContent = `${data.probabilities.Graduate.toFixed(1)}%`;
        document.getElementById('bar-prob-graduate').style.width = `${data.probabilities.Graduate}%`;

        // Factors
        const factorsContainer = document.getElementById('detail-factors-container');
        factorsContainer.innerHTML = '';
        data.top_factors.forEach(factor => {
            const factorDiv = document.createElement('div');
            factorDiv.className = 'factor-item';
            factorDiv.innerHTML = `
                <div class="factor-header">
                    <span class="factor-label">${factor.label}</span>
                    <span class="factor-weight">${factor.contribution_pct.toFixed(1)}%</span>
                </div>
                <div class="factor-bar-track">
                    <div class="factor-bar-fill" style="width: ${factor.contribution_pct}%;"></div>
                </div>
                <span class="factor-category-tag">${factor.category}</span>
            `;
            factorsContainer.appendChild(factorDiv);
        });

        // Intervention
        document.getElementById('detail-intervention-category').textContent = data.intervention.category;
        document.getElementById('detail-intervention-urgency').textContent = data.intervention.urgency;
        document.getElementById('detail-intervention-action').textContent = data.intervention.action;
        
        const banner = document.getElementById('detail-intervention-banner');
        banner.style.borderTopColor = riskColor;
        
        const iconElement = document.getElementById('intervention-icon');
        let iconName = 'heart-handshake';
        const cat = data.intervention.category.toLowerCase();
        if (cat.includes('academic')) {
            iconName = 'graduation-cap';
        } else if (cat.includes('financial')) {
            iconName = 'credit-card';
        } else if (cat.includes('personal') || cat.includes('demographic')) {
            iconName = 'user';
        } else if (cat.includes('family')) {
            iconName = 'users';
        } else if (cat.includes('macro')) {
            iconName = 'trending-up';
        }
        iconElement.setAttribute('data-lucide', iconName);
        lucide.createIcons();

    } catch (err) {
        console.error('Simulation run failed:', err);
        alert('Simulator prediction failed. Please make sure the backend is active.');
    } finally {
        submitTextSpan.textContent = prevText;
        btnSubmit.disabled = false;
    }
}

// ==========================================================================
// Modal Window Helpers
// ==========================================================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden'; // Lock background scroll
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        
        // Restore background scroll only if no other modals are active
        const activeModals = document.querySelectorAll('.modal-overlay.active');
        if (activeModals.length === 0) {
            document.body.style.overflow = '';
        }
    }
}
