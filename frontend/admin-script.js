/* =========================
   📈 NEON ANALYTICS ENGINE
========================= */
const NEON_GREEN = '#39ff14';
const NEON_BLUE = '#00f3ff';
const NEON_PURPLE = '#bc13fe';
const GLASS_BG = 'rgba(255, 255, 255, 0.1)';

async function loadAnalytics() {
    try {
        const res = await fetch('/analytics/data');
        const data = await res.json();

        // 1. Update Numbers
        const totalUsers = data.deptData.reduce((acc, curr) => acc + curr.count, 0);
        const totalSaved = data.topicData.reduce((acc, curr) => acc + curr.count, 0); // Approx
        document.getElementById('total-users').innerText = totalUsers;
        document.getElementById('total-saved').innerText = totalSaved; // Or fetch real count

        // 2. Render Dept Chart (Pie)
        const ctxDept = document.getElementById('deptChart').getContext('2d');
        new Chart(ctxDept, {
            type: 'doughnut',
            data: {
                labels: data.deptData.map(d => d.department),
                datasets: [{
                    data: data.deptData.map(d => d.count),
                    backgroundColor: [NEON_GREEN, NEON_BLUE, NEON_PURPLE, '#ff0055', '#ffde00'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'right', labels: { color: '#94a3b8' } }
                }
            }
        });

        // 3. Render Topics Chart (Bar)
        const ctxTopic = document.getElementById('topicChart').getContext('2d');
        new Chart(ctxTopic, {
            type: 'bar',
            data: {
                labels: data.topicData.map(t => t.topic),
                datasets: [{
                    label: 'Saved Articles',
                    data: data.topicData.map(t => t.count),
                    backgroundColor: NEON_BLUE,
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { grid: { color: GLASS_BG }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                },
                plugins: { legend: { display: false } }
            }
        });

        // 4. Timeline (Line)
        const ctxTime = document.getElementById('timelineChart').getContext('2d');
        new Chart(ctxTime, {
            type: 'line',
            data: {
                labels: data.timelineData.map(t => t.date),
                datasets: [{
                    label: 'Activity',
                    data: data.timelineData.map(t => t.count),
                    borderColor: NEON_GREEN,
                    backgroundColor: 'rgba(57, 255, 20, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { grid: { color: GLASS_BG }, ticks: { color: '#94a3b8' } },
                    x: { grid: { color: GLASS_BG }, ticks: { color: '#94a3b8' } }
                },
                plugins: { legend: { display: false } }
            }
        });

    } catch (err) {
        console.error("Analytics Error:", err);
    }
}

// Init
document.addEventListener('DOMContentLoaded', loadAnalytics);