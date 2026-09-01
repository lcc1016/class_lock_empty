/**
 * ============================================================
 *  民雄國中課表查詢系統 - 核心邏輯 (app.js)
 * ============================================================
 */

// ── 全域變數定義 ──────────────────────────────────────────────
const DAYS = ['一', '二', '三', '四', '五'];
let scheduleData = [];
let subjectTeachers = {};

// ── 工具函式 ─────────────────────────────────────────────────
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeSubject(subj) {
    if (!subj) return '';
    return subj.trim();
}

// ── 視圖與頁面切換邏輯 ─────────────────────────────────────────
function showView(viewId) {
    document.querySelectorAll('.view').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active', 'result-active');
    });

    const target = document.getElementById(viewId);
    if (target) {
        if (viewId === 'loginView') {
            target.style.display = 'flex';
        } else if (viewId === 'resultView') {
            target.style.display = 'block';
            target.classList.add('result-active');
        } else {
            target.style.display = 'block';
        }
        target.classList.add('active');
    }
}

// ── 登入 / 登出事件處理 ────────────────────────────────────────
function handleLogin(e) {
    if (e) e.preventDefault(); // 阻止表單預設刷新頁面

    const semesterSelect = document.getElementById('semesterSelect');
    const selectedSemester = semesterSelect ? semesterSelect.value : '';

    if (!selectedSemester) {
        alert('請選擇學期！');
        return;
    }

    // 更新查詢頁面的學期 Badge 標籤
    const currentSemEl = document.getElementById('currentSemester');
    if (currentSemEl) {
        currentSemEl.textContent = selectedSemester;
    }

    // 切換至查詢視圖
    showView('queryView');
}

function logout() {
    showView('loginView');
}

function goBack() {
    showView('queryView');
}

function showQueryView() {
    showView('queryView');
}

// ── 學期選單初始化 ─────────────────────────────────────────────
function populateSemesterSelect() {
    const semesterSelect = document.getElementById('semesterSelect');
    if (!semesterSelect) return;

    semesterSelect.innerHTML = ''; // 清空選項

    if (typeof CONFIG !== 'undefined' && CONFIG.SEMESTERS) {
        Object.keys(CONFIG.SEMESTERS).forEach(sem => {
            const opt = document.createElement('option');
            opt.value = sem;
            opt.textContent = sem;
            semesterSelect.appendChild(opt);
        });
    }

    // 防呆：若無設定則補上預設選項
    if (semesterSelect.options.length === 0) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '115-1';
        defaultOpt.textContent = '115-1';
        semesterSelect.appendChild(defaultOpt);
    }
}

// ── 代課名單查詢邏輯 (同科目空堂 / 同班級任課教師空堂) ─────────
function getSameSubjectFreeTeachers(subject, day, period) {
    if (!subject) return [];
    const baseSubj = normalizeSubject(subject);
    const candidateTeachers = subjectTeachers[baseSubj] || [];

    return candidateTeachers.filter(tName => {
        const row = scheduleData.find(r => r.teachername === tName);
        if (!row) return false;
        const subjInSlot = row[`s${day}${period}`];
        return !subjInSlot || subjInSlot.trim() === '';
    });
}

function getClassFreeTeachers(className, day, period) {
    if (!className) return [];
    const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    const classTeachers = new Set();
    scheduleData.forEach(row => {
        for (let d = 1; d <= 5; d++) {
            for (let p of PERIODS) {
                const cStr = row[`c${d}${p}`];
                if (cStr && cStr.split(/[\s/]+/).includes(className)) {
                    classTeachers.add(row.teachername);
                }
            }
        }
    });

    return [...classTeachers].filter(tName => {
        const row = scheduleData.find(r => r.teachername === tName);
        if (!row) return false;
        const subjInSlot = row[`s${day}${period}`];
        return !subjInSlot || subjInSlot.trim() === '';
    }).sort();
}

// ── 課表表格渲染 (含左右選單) ──────────────────────────────────
function buildScheduleTable(cells, mode, currentTargetName) {
    const periods = (typeof CONFIG !== 'undefined' && CONFIG.PERIOD_TIMES) || [];
    const hasEarly = Object.keys(cells).some(k => k.endsWith('-0'));

    let html = '<table class="schedule-table"><thead><tr>';
    html += '<th class="th-period">節次</th>';
    DAYS.forEach(d => html += `<th>${d}</th>`);
    html += '</tr></thead><tbody>';

    if (hasEarly) {
        const et = periods[0] || { start: '07:35', end: '08:10' };
        html += `<tr><td class="td-period">
            <div class="period-num">早自習</div>
            <div class="period-time">${et.start}<br>${et.end}</div>
        </td>`;
        for (let d = 1; d <= 5; d++) {
            html += renderCell(cells[`${d}-0`], mode, d, 0, currentTargetName);
        }
        html += '</tr>';
    }

    for (let p = 1; p <= 8; p++) {
        const pt = periods[p] || { start: '', end: '' };
        html += `<tr><td class="td-period"><div class="period-num">第${p}節</div>`;
        if (pt.start && pt.start !== '——') {
            html += `<div class="period-time">${pt.start}<br>${pt.end}</div>`;
        }
        html += '</td>';
        for (let d = 1; d <= 5; d++) {
            html += renderCell(cells[`${d}-${p}`], mode, d, p, currentTargetName);
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

function renderCell(cell, mode, day, period, currentTargetName) {
    if (!cell) return '<td class="td-empty"></td>';

    const itemsHtml = (cell.items || []).map(item => {
        if (mode === 'class') {
            return `<div class="cell-link" onclick="displayTeacherSchedule('${escHtml(item)}')">${escHtml(item)}</div>`;
        } else {
            return `<div class="cell-link" onclick="displayClassSchedule('${escHtml(item)}')">${escHtml(item)}</div>`;
        }
    }).join(' ');

    const lockBadge = cell.isLocked ? `<span class="lock-tag" title="此課程已綁定，不可調課">🔒 綁課</span>` : '';
    const cellClass = cell.isLocked ? 'td-cell cell-locked' : 'td-cell';

    // ── 建立左框：同科目空堂教師 ──
    const sameSubjFree = getSameSubjectFreeTeachers(cell.subject, day, period);
    let leftSelect = `<select class="sub-select left-select" onchange="if(this.value) displayTeacherSchedule(this.value)" title="同科目空堂代課教師">
        <option value="">代(科)</option>`;
    sameSubjFree.forEach(t => {
        leftSelect += `<option value="${escHtml(t)}">${escHtml(t)}</option>`;
    });
    leftSelect += `</select>`;

    // ── 建立右框：同班級其他任課教師空堂 ──
    const targetClass = mode === 'class' ? currentTargetName : (cell.items[0] || '');
    const classFree = getClassFreeTeachers(targetClass, day, period);
    let rightSelect = `<select class="sub-select right-select" onchange="if(this.value) displayTeacherSchedule(this.value)" title="同班級任課教師空堂代課">
        <option value="">代(班)</option>`;
    classFree.forEach(t => {
        rightSelect += `<option value="${escHtml(t)}">${escHtml(t)}</option>`;
    });
    rightSelect += `</select>`;

    return `<td class="${cellClass}">
        <div class="cell-wrapper">
            ${leftSelect}
            <div class="cell-content">
                <div class="cell-subject">${escHtml(cell.subject)} ${lockBadge}</div>
                <div class="cell-items-container">${itemsHtml}</div>
            </div>
            ${rightSelect}
        </div>
    </td>`;
}

// 列印功能
function printSchedule() {
    window.print();
}

// ── 頁面初始化與事件綁定 ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // 1. 設定網頁 Title
    if (typeof CONFIG !== 'undefined' && CONFIG.SCHOOL_NAME) {
        document.title = `${CONFIG.SCHOOL_NAME} 課表查詢`;
    }

    // 2. 初始化學期下拉選單
    populateSemesterSelect();

    // 3. 綁定登入表單事件
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // 4. 顯示登入畫面
    showView('loginView');
});