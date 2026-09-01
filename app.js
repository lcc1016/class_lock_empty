/**
 * ============================================================
 *  民雄國中課表查詢系統 - 核心邏輯 (app.js)
 * ============================================================
 */

// ── 全域變數定義 ──────────────────────────────────────────────
const DAYS = ['一', '二', '三', '四', '五'];
let scheduleData = [];
let subjectTeachers = {};
let currentViewMode = 'class'; // 'class' 或 'teacher'
let lastQueryTarget = '';

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
    return String(subj).trim();
}

// 統一清洗班級格式 (去除 .0、前後空格)
function normalizeClassName(c) {
    if (c === null || c === undefined) return '';
    let str = String(c).trim();
    if (str.endsWith('.0')) {
        str = str.slice(0, -2);
    }
    return str;
}

function showLoading(show) {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function showAlert(elementId, msg) {
    const el = document.getElementById(elementId);
    if (el) {
        if (msg) {
            el.textContent = msg;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }
}

// ── 判斷班級是否精準匹配 ───────────────────────────────────────
function isClassMatch(rawClassStr, targetClass) {
    if (!rawClassStr || !targetClass) return false;
    const target = normalizeClassName(targetClass);
    const classes = String(rawClassStr).split(/[\s/,\u3001]+/).map(normalizeClassName);
    return classes.includes(target);
}

// ── CSV 解析器 (相容浮點數與欄位空格) ──────────────────────────
function parseCSV(text) {
    let cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r\n|\n/);
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = {};
        const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || line.split(',');

        headers.forEach((h, idx) => {
            let val = matches[idx] ? matches[idx].trim() : '';
            val = val.replace(/^"|"$/g, '');
            row[h] = val;
        });

        const tName = (row.teachername || row.teacherName || '').trim();
        if (tName) {
            row.teachername = tName;
            row.teacherName = tName;
            result.push(row);
        }
    }
    return result;
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

function switchTab(tab) {
    currentViewMode = tab;
    const btnClass = document.getElementById('tabClass');
    const btnTeacher = document.getElementById('tabTeacher');
    const panelClass = document.getElementById('panelClass');
    const panelTeacher = document.getElementById('panelTeacher');

    if (tab === 'class') {
        btnClass?.classList.add('active');
        btnTeacher?.classList.remove('active');
        if (panelClass) panelClass.style.display = 'block';
        if (panelTeacher) panelTeacher.style.display = 'none';
    } else {
        btnTeacher?.classList.add('active');
        btnClass?.classList.remove('active');
        if (panelTeacher) panelTeacher.style.display = 'block';
        if (panelClass) panelClass.style.display = 'none';
    }
}

// ── 登入與資料載入處理 ────────────────────────────────────────
async function handleLogin(e) {
    if (e) e.preventDefault();

    const semesterSelect = document.getElementById('semesterSelect');
    const selectedSemester = semesterSelect ? semesterSelect.value : '';

    if (!selectedSemester) {
        alert('請選擇學期！');
        return;
    }

    const currentSemEl = document.getElementById('currentSemester');
    if (currentSemEl) currentSemEl.textContent = selectedSemester;

    showLoading(true);
    const success = await loadScheduleData(selectedSemester);
    showLoading(false);

    if (success) {
        showView('queryView');
    } else {
        showAlert('loginError', '課表資料載入失敗，請確認 CSV 檔案是否存在！');
    }
}

async function loadScheduleData(semester) {
    try {
        if (typeof CONFIG === 'undefined' || !CONFIG.SEMESTERS || !CONFIG.SEMESTERS[semester]) {
            console.error('找不到對應學期的設定');
            return false;
        }

        const semConfig = CONFIG.SEMESTERS[semester];
        const csvUrl = typeof semConfig === 'string' ? semConfig : semConfig.csv;

        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const csvText = await res.text();
        scheduleData = parseCSV(csvText);

        parseSubjectTeachers();
        populateQuerySelects();
        return true;
    } catch (err) {
        console.error('載入課表失敗:', err);
        return false;
    }
}

// 解析科目與對應教師關係
function parseSubjectTeachers() {
    subjectTeachers = {};
    const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    scheduleData.forEach(row => {
        const teacher = row.teachername;
        if (!teacher) return;

        for (let d = 1; d <= 5; d++) {
            for (let p of PERIODS) {
                const subj = row[`s${d}${p}`];
                if (subj && String(subj).trim() !== '') {
                    const normSubj = normalizeSubject(subj);
                    if (!subjectTeachers[normSubj]) {
                        subjectTeachers[normSubj] = new Set();
                    }
                    subjectTeachers[normSubj].add(teacher);
                }
            }
        }
    });

    Object.keys(subjectTeachers).forEach(k => {
        subjectTeachers[k] = [...subjectTeachers[k]].sort();
    });
}

// ── 填入班級與科目選單 ────────────────────────────────────────
function populateQuerySelects() {
    const sel7 = document.getElementById('sel7');
    const sel8 = document.getElementById('sel8');
    const sel9 = document.getElementById('sel9');
    const selSp = document.getElementById('selSp');
    const subjectSelect = document.getElementById('subjectSelect');

    const classes = new Set();
    const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    scheduleData.forEach(row => {
        for (let d = 1; d <= 5; d++) {
            for (let p of PERIODS) {
                const cStr = row[`c${d}${p}`];
                if (cStr) {
                    String(cStr).split(/[\s/,\u3001]+/).forEach(c => {
                        const normC = normalizeClassName(c);
                        if (normC) classes.add(normC);
                    });
                }
            }
        }
    });

    const classList = [...classes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    [sel7, sel8, sel9, selSp].forEach(s => {
        if (s) s.innerHTML = '<option value="">— 選擇班級 —</option>';
    });

    classList.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;

        if (c.startsWith('7')) sel7?.appendChild(opt);
        else if (c.startsWith('8')) sel8?.appendChild(opt);
        else if (c.startsWith('9')) sel9?.appendChild(opt);
        else selSp?.appendChild(opt);
    });

    if (subjectSelect) {
        subjectSelect.innerHTML = '<option value="">— 選擇科目 —</option>';
        Object.keys(subjectTeachers).sort().forEach(subj => {
            const opt = document.createElement('option');
            opt.value = subj;
            opt.textContent = subj;
            subjectSelect.appendChild(opt);
        });
    }

    const teacherSelect = document.getElementById('teacherSelect');
    if (teacherSelect) {
        teacherSelect.innerHTML = '<option value="">— 選擇教師 —</option>';
        const allTeachers = [...new Set(scheduleData.map(r => r.teachername))].sort();
        allTeachers.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            teacherSelect.appendChild(opt);
        });
    }
}

function onSubjectChange() {
    const subjSelect = document.getElementById('subjectSelect');
    const subj = subjSelect ? subjSelect.value : '';
    const teacherSelect = document.getElementById('teacherSelect');
    if (!teacherSelect) return;

    teacherSelect.innerHTML = '<option value="">— 選擇教師 —</option>';
    
    if (subj && subjectTeachers[subj]) {
        subjectTeachers[subj].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            teacherSelect.appendChild(opt);
        });
    } else {
        const allTeachers = [...new Set(scheduleData.map(r => r.teachername))].sort();
        allTeachers.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            teacherSelect.appendChild(opt);
        });
    }
}

// ── 查詢提交處理 ──────────────────────────────────────────────
function submitClassQuery() {
    showAlert('classError', '');
    const c = ['sel7', 'sel8', 'sel9', 'selSp']
        .map(id => document.getElementById(id)?.value)
        .find(v => v);

    if (!c) {
        showAlert('classError', '請至少選擇一個班級！');
        return;
    }
    displayClassSchedule(c);
}

function submitTeacherQuery() {
    showAlert('teacherError', '');
    const t = document.getElementById('teacherSelect')?.value;
    if (!t) {
        showAlert('teacherError', '請選擇教師！');
        return;
    }
    displayTeacherSchedule(t);
}

// ── 班級課表繪製邏輯 ──────────────────────────────────────────
function displayClassSchedule(className) {
    const targetClass = normalizeClassName(className);
    lastQueryTarget = targetClass;
    const cells = {};

    scheduleData.forEach(row => {
        const teacher = row.teachername;
        for (let d = 1; d <= 5; d++) {
            for (let p = 0; p <= 9; p++) {
                const cStr = row[`c${d}${p}`];
                if (cStr && isClassMatch(cStr, targetClass)) {
                    const key = `${d}-${p}`;
                    const subj = row[`s${d}${p}`] || '';
                    if (!cells[key]) {
                        cells[key] = {
                            subject: subj,
                            items: [],
                            isLocked: row[`l${d}${p}`] === 1 || row[`l${d}${p}`] === '1'
                        };
                    }
                    if (teacher && !cells[key].items.includes(teacher)) {
                        cells[key].items.push(teacher);
                    }
                }
            }
        }
    });

    const titleEl = document.getElementById('scheduleTitle');
    if (titleEl) titleEl.textContent = `${targetClass} 課表`;

    const container = document.getElementById('scheduleTableContainer');
    if (container) container.innerHTML = buildScheduleTable(cells, 'class', targetClass);

    showView('resultView');
}

// ── 教師課表繪製邏輯 ──────────────────────────────────────────
function displayTeacherSchedule(teacherName) {
    const tName = String(teacherName).trim();
    lastQueryTarget = tName;
    const cells = {};
    const row = scheduleData.find(r => r.teachername === tName);

    if (row) {
        for (let d = 1; d <= 5; d++) {
            for (let p = 0; p <= 9; p++) {
                const subj = row[`s${d}${p}`];
                const cStr = row[`c${d}${p}`];
                if (subj || cStr) {
                    const key = `${d}-${p}`;
                    cells[key] = {
                        subject: subj || '',
                        items: cStr ? String(cStr).split(/[\s/,\u3001]+/).map(normalizeClassName).filter(Boolean) : [],
                        isLocked: row[`l${d}${p}`] === 1 || row[`l${d}${p}`] === '1'
                    };
                }
            }
        }
    }

    const titleEl = document.getElementById('scheduleTitle');
    if (titleEl) titleEl.textContent = `${tName} 老師課表`;

    const container = document.getElementById('scheduleTableContainer');
    if (container) container.innerHTML = buildScheduleTable(cells, 'teacher', tName);

    showView('resultView');
}

// ── 代課名單查詢邏輯 ──────────────────────────────────────────
function getSameSubjectFreeTeachers(subject, day, period) {
    if (!subject) return [];
    const baseSubj = normalizeSubject(subject);
    const candidateTeachers = subjectTeachers[baseSubj] || [];

    return candidateTeachers.filter(tName => {
        const row = scheduleData.find(r => r.teachername === tName);
        if (!row) return false;
        const subjInSlot = row[`s${day}${period}`];
        return !subjInSlot || String(subjInSlot).trim() === '';
    });
}

function getClassFreeTeachers(className, day, period) {
    if (!className) return [];
    const targetClass = normalizeClassName(className);
    const classTeachers = new Set();

    scheduleData.forEach(row => {
        const tName = row.teachername;
        for (let d = 1; d <= 5; d++) {
            for (let p = 0; p <= 9; p++) {
                const cStr = row[`c${d}${p}`];
                if (cStr && isClassMatch(cStr, targetClass) && tName) {
                    classTeachers.add(tName);
                }
            }
        }
    });

    return [...classTeachers].filter(tName => {
        const row = scheduleData.find(r => r.teachername === tName);
        if (!row) return false;
        const subjInSlot = row[`s${day}${period}`];
        return !subjInSlot || String(subjInSlot).trim() === '';
    }).sort();
}

// ── 課表表格渲染 (精確 1:1 對齊節次與 CSV 欄位) ──────────────────
function buildScheduleTable(cells, mode, currentTargetName) {
    const periods = (typeof CONFIG !== 'undefined' && CONFIG.PERIOD_TIMES) || [];
    
    let html = '<table class="schedule-table"><thead><tr>';
    html += '<th class="th-period">節次</th>';
    DAYS.forEach(d => html += `<th>${d}</th>`);
    html += '</tr></thead><tbody>';

    // 1. 早自習 (p = 0，即 c10, c20, c30...)
    const hasEarly = Object.keys(cells).some(k => k.endsWith('-0'));
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

    // 2. 正式課表 第 1 節 ~ 第 8 節 (p = 1 ~ 8，即 c11~c18...)
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

    const sameSubjFree = getSameSubjectFreeTeachers(cell.subject, day, period);
    let leftSelect = `<select class="sub-select left-select" onchange="if(this.value) displayTeacherSchedule(this.value)" title="同科目空堂代課教師">
        <option value="">代(科)</option>`;
    sameSubjFree.forEach(t => {
        leftSelect += `<option value="${escHtml(t)}">${escHtml(t)}</option>`;
    });
    leftSelect += `</select>`;

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

function logout() { showView('loginView'); }
function goBack() { showView('queryView'); }
function showQueryView() { showView('queryView'); }
function printSchedule() { window.print(); }

// ── 頁面初始化與事件綁定 ──────────────────────────────────────
function populateSemesterSelect() {
    const semesterSelect = document.getElementById('semesterSelect');
    if (!semesterSelect) return;

    semesterSelect.innerHTML = '';
    if (typeof CONFIG !== 'undefined' && CONFIG.SEMESTERS) {
        Object.keys(CONFIG.SEMESTERS).forEach(sem => {
            const opt = document.createElement('option');
            opt.value = sem;
            opt.textContent = sem;
            semesterSelect.appendChild(opt);
        });
    }

    if (semesterSelect.options.length === 0) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '115-1';
        defaultOpt.textContent = '115-1';
        semesterSelect.appendChild(defaultOpt);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof CONFIG !== 'undefined' && CONFIG.SCHOOL_NAME) {
        document.title = `${CONFIG.SCHOOL_NAME} 課表查詢`;
    }

    populateSemesterSelect();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    showView('loginView');
});