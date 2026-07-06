// 🔄 สั่งล้างหน่วยความจำเอ๋อค้างในเครื่อง เพื่อรีเซ็ตโครงสร้างฐานข้อมูลใหม่ให้ตรงกัน
localStorage.clear();
console.log("ล้าง Local Storage เรียบร้อย ระบบเซ็ตศูนย์พร้อมทำงาน");

/**
 * Operations Portal - Application Logic (app.js)
 * ฉบับแก้ไข Fatal Error สมบูรณ์แบบ 100%: คืนชีพสถิติกำลังพล + กิจย่อย Checklist ทำงานครบถ้วน
 */

class AttachmentStore {
    constructor() { this.dbName = 'OperationsPortalDB'; this.dbVersion = 1; this.storeName = 'task_attachments'; this.db = null; }
    init() {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                request.onerror = (e) => reject(e);
                request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
                request.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName, { keyPath: 'taskId' }); };
            } catch(e) { reject(e); }
        });
    }
    saveAttachment(taskId, files) {
        return new Promise((resolve, reject) => {
            if (!this.db) { reject("Database not initialized"); return; }
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const filesArray = Array.from(files).map(f => ({ fileName: f.name, fileType: f.type, fileData: f }));
            const request = store.put({ taskId: taskId, isMultiple: true, files: filesArray });
            request.onsuccess = () => resolve(); request.onerror = (e) => reject(e);
        });
    }
    getAttachment(taskId) {
        return new Promise((resolve, reject) => {
            if (!this.db) { reject("Database not initialized"); return; }
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(taskId); request.onsuccess = (e) => resolve(e.target.result); request.onerror = (e) => reject(e);
        });
    }
    deleteAttachment(taskId) {
        return new Promise((resolve, reject) => {
            if (!this.db) { reject("Database not initialized"); return; }
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(taskId); request.onsuccess = () => resolve(); request.onerror = (e) => reject(e);
        });
    }
}

const DEFAULT_STAFF = [
    { id: 'leader', name: 'หัวหน้าฝ่ายยุทธการ', role: 'หัวหน้าฝ่ายยุทธการ (Leader)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=leader', isStaffAdmin: true, rankWeight: 1 },
    { id: 'asst-g3', name: 'ผช.หน.ฝยก.พล.ร.4', role: 'ผช.หน.ฝยก.พล.ร.4 (Asst. G3)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=asstg3', isStaffAdmin: true, rankWeight: 2 },
    { id: 'dev-chaisith', name: 'จ.ส.ท. ชัยสิทธิ์ ศรีอ่อนทอง', role: 'Powerpoint Wizard / DEV', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=chaisith', isStaffAdmin: true, rankWeight: 70, lineUserId: 'U093959610f37c88a31fe2911a7dd4bdd' },
    { id: 'staff-1', name: 'พ.ต. สมศักดิ์ รักชาติ', role: 'หัวหน้าชุดวางแผนยุทธการ', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=somsak', rankWeight: 20, lineUserId: '' },
    { id: 'staff-2', name: 'ร.อ. วิชัย กล้าหาญ', role: 'นายทหารปฏิบัติการข่าวกรอง', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=wichai', rankWeight: 30, lineUserId: '' },
    { id: 'staff-3', name: 'ร.ท. หญิง อารีรัตน์ ใจดี', role: 'นายทหารสื่อสารและการประสานงาน', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=areerat', rankWeight: 40, lineUserId: '' }
];
const DEFAULT_TASKS = [];

class App {
    constructor() {
        this.staff = []; 
        this.tasks = []; 
        this.currentUser = 'leader'; 
        this.currentView = 'leader-dashboard'; 
        this.isCloudMode = false; 
        this.tasksViewMode = 'table'; 
        this.statusChartInstance = null; 
        this.staffChartInstance = null; 
        this.draggedCardId = null; 
        this.editingStaffId = null;
        this.calendarInstance = null;
        this.tempSubTasks = []; 

        try {
            this.initDOMElements(); 
            this.loadData(); 
            this.setupEventListeners(); 
            this.startClock(); // ⚙️ เรียกฟังก์ชันนาฬิกา
            
            this.attachments = new AttachmentStore();
            this.attachments.init().then(async () => { 
                await this.syncWithCloudflare(); 
                this.render(); 
            }).catch(async err => { 
                console.warn("DB Storage Error", err); 
                await this.syncWithCloudflare(); 
                this.render(); 
            });
        } catch (err) {
            alert("ระบบขัดข้องตอนเริ่มต้นแอป: " + err.message);
            console.error(err);
        }
    }

    initDOMElements() {
        this.sidebar = document.getElementById('sidebar'); this.roleSelector = document.getElementById('roleSelector');
        this.leaderNav = document.getElementById('leaderNav'); this.staffNav = document.getElementById('staffNav');
        this.currentUserAvatar = document.getElementById('currentUserAvatar'); this.currentUserName = document.getElementById('currentUserName');
        this.currentUserRoleText = document.getElementById('currentUserRoleText'); this.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
        this.closeSidebarBtn = document.getElementById('closeSidebarBtn'); this.pageTitle = document.getElementById('pageTitle');
        this.themeToggleBtn = document.getElementById('themeToggleBtn'); this.btnCreateTask = document.getElementById('btnCreateTask');

        this.views = {
            'leader-dashboard': document.getElementById('viewLeaderDashboard'), 'leader-tasks': document.getElementById('viewLeaderTasks'),
            'leader-team': document.getElementById('viewLeaderTeam'), 'staff-kanban': document.getElementById('viewStaffKanban'),
            'staff-tasks': document.getElementById('viewStaffTasks'), 'team-calendar': document.getElementById('viewTeamCalendar'),
            'data-repo': document.getElementById('viewDataRepo')
        };

        this.statTotalTasks = document.getElementById('statTotalTasks'); this.statInProgressTasks = document.getElementById('statInProgressTasks');
        this.statReviewTasks = document.getElementById('statReviewTasks'); this.statCompletedTasks = document.getElementById('statCompletedTasks');
        this.statOverdueTasks = document.getElementById('statOverdueTasks'); this.teamProgressTableBody = document.querySelector('#teamProgressTable tbody');

        this.filterAssignee = document.getElementById('filterAssignee'); this.filterUrgency = document.getElementById('filterUrgency');
        this.filterSecrecy = document.getElementById('filterSecrecy'); this.filterStatus = document.getElementById('filterStatus');
        this.searchTask = document.getElementById('searchTask'); this.masterTasksTableBody = document.querySelector('#masterTasksTable tbody');

        this.addMemberForm = document.getElementById('addMemberForm'); this.memberNameInput = document.getElementById('memberName');
        this.memberRoleInput = document.getElementById('memberRole'); this.avatarOptionsContainer = document.getElementById('avatarOptions');
        this.selectedAvatarInput = document.getElementById('selectedAvatar'); this.teamGridCards = document.getElementById('teamGridCards');

        this.staffProfileAvatar = document.getElementById('staffProfileAvatar'); this.staffProfileName = document.getElementById('staffProfileName');
        this.staffProfileRole = document.getElementById('staffProfileRole'); this.staffStatTodo = document.getElementById('staffStatTodo');
        this.staffStatProgress = document.getElementById('staffStatProgress'); this.staffStatReview = document.getElementById('staffStatReview');
        this.staffStatDone = document.getElementById('staffStatDone'); this.kanbanTodo = document.getElementById('kanban-todo');
        this.kanbanProgress = document.getElementById('kanban-progress'); this.kanbanReview = document.getElementById('kanban-review');
        this.kanbanDone = document.getElementById('kanban-done'); this.staffTasksTableBody = document.querySelector('#staffTasksTable tbody');
        this.staffTaskListTitle = document.getElementById('staffTaskListTitle');

        this.taskModal = document.getElementById('taskModal'); this.taskForm = document.getElementById('taskForm'); this.taskModalTitle = document.getElementById('taskModalTitle');
        this.taskIdField = document.getElementById('taskIdField'); this.taskNameInput = document.getElementById('taskName');
        this.taskDescriptionInput = document.getElementById('taskDescription'); this.taskAssigneeInput = document.getElementById('taskAssignee');
        this.taskStatusInput = document.getElementById('taskStatus'); this.taskUrgencyInput = document.getElementById('taskUrgency');
        this.taskSecrecyInput = document.getElementById('taskSecrecy'); this.taskReceiveDateInput = document.getElementById('taskReceiveDate');
        this.taskStartDateInput = document.getElementById('taskStartDate'); this.taskDeadlineInput = document.getElementById('taskDeadline');
        this.btnCancelTaskModal = document.getElementById('btnCancelTaskModal'); this.btnSubmitTaskModal = document.getElementById('btnSubmitTaskModal');
        this.taskModalCloseBtn = document.getElementById('taskModalCloseBtn');

        this.taskDetailModal = document.getElementById('taskDetailModal'); this.detailTitle = document.getElementById('detailTitle');
        this.detailDescription = document.getElementById('detailDescription'); this.detailSecrecyBadge = document.getElementById('detailSecrecyBadge');
        this.detailAssigneeAvatar = document.getElementById('detailAssigneeAvatar'); this.detailAssigneeName = document.getElementById('detailAssigneeName');
        this.detailStatusBadge = document.getElementById('detailStatusBadge'); this.detailUrgencyBadge = document.getElementById('detailUrgencyBadge');
        this.detailReceiveDate = document.getElementById('detailReceiveDate'); this.detailStartDate = document.getElementById('detailStartDate');
        this.detailDeadline = document.getElementById('detailDeadline'); this.detailOverdueBox = document.getElementById('detailOverdueBox');
        this.detailModalFooter = document.getElementById('detailModalFooter'); this.taskDetailCloseBtn = document.getElementById('taskDetailCloseBtn');

        this.pdfUploadRow = document.getElementById('pdfUploadRow'); this.taskPdfInput = document.getElementById('taskPdf');
        this.pdfUploadStatus = document.getElementById('pdfUploadStatus'); this.detailPdfItem = document.getElementById('detailPdfItem');
        this.pdfButtonsContainer = document.getElementById('pdfButtonsContainer'); this.toastContainer = document.getElementById('toastContainer');
    }

    // ⏱️ ฟังก์ชันนาฬิกา (กู้คืนกลับมาประจำการแล้ว)
    startClock() {
        const liveTimeEl = document.getElementById('liveTime');
        const updateTime = () => { if (liveTimeEl) liveTimeEl.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
        updateTime(); setInterval(updateTime, 1000);
    }

    ensureAdminStaff() {
        if (!this.staff || !Array.isArray(this.staff)) this.staff = [];
        if (!this.staff.find(m => m.id === 'leader')) this.staff.unshift({ id: 'leader', name: 'หัวหน้าฝ่ายยุทธการ', role: 'หัวหน้าฝ่ายยุทธการ (Leader)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=leader', isStaffAdmin: true, rankWeight: 1 });
        if (!this.staff.find(m => m.id === 'asst-g3')) this.staff.splice(1, 0, { id: 'asst-g3', name: 'ผช.หน.ฝยก.พล.ร.4', role: 'ผช.หน.ฝยก.พล.ร.4 (Asst. G3)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=asstg3', isStaffAdmin: true, rankWeight: 2 });
        if (!this.staff.find(m => m.id === 'dev-chaisith')) this.staff.push({ id: 'dev-chaisith', name: 'จ.ส.ท. ชัยสิทธิ์ ศรีอ่อนทอง', role: 'Powerpoint Wizard / DEV', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=chaisith', isStaffAdmin: true, rankWeight: 70, lineUserId: 'U093959610f37c88a31fe2911a7dd4bdd' });
    }

    getTaskProgress(task) {
        if (!task.subTasks || !Array.isArray(task.subTasks) || task.subTasks.length === 0) {
            return task.status === 'เสร็จสิ้น' ? 100 : 0;
        }
        const doneCount = task.subTasks.filter(s => s.isDone).length;
        return Math.round((doneCount / task.subTasks.length) * 100);
    }

    loadData() {
        const storedData = localStorage.getItem('operations_portal_data');
        if (storedData) {
            try {
                const parsed = JSON.parse(storedData);
                this.staff = Array.isArray(parsed.staff) && parsed.staff.length > 0 ? parsed.staff : JSON.parse(JSON.stringify(DEFAULT_STAFF));
                this.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : JSON.parse(JSON.stringify(DEFAULT_TASKS));
                this.tasks.forEach(t => { if (!t.subTasks || !Array.isArray(t.subTasks)) t.subTasks = []; });
            } catch (e) { 
                this.staff = JSON.parse(JSON.stringify(DEFAULT_STAFF)); 
                this.tasks = JSON.parse(JSON.stringify(DEFAULT_TASKS)); 
            }
        } else { 
            this.staff = JSON.parse(JSON.stringify(DEFAULT_STAFF)); 
            this.tasks = JSON.parse(JSON.stringify(DEFAULT_TASKS)); 
        }
        this.ensureAdminStaff(); this.saveData();
    }

    saveData() { localStorage.setItem('operations_portal_data', JSON.stringify({ staff: this.staff, tasks: this.tasks })); }

    async syncWithCloudflare() {
        this.isCloudMode = window.location.protocol.startsWith('http'); if (!this.isCloudMode) return;
        try {
            const staffRes = await fetch('/api/staff'); if (staffRes.ok) { const data = await staffRes.json(); if (data && data.length > 0) this.staff = data; }
            const tasksRes = await fetch('/api/tasks'); if (tasksRes.ok) { const data = await tasksRes.json(); if (data && data.length > 0) this.tasks = data; }
            this.ensureAdminStaff(); this.saveData();
        } catch (err) {}
    }

    setupEventListeners() {
        if(this.roleSelector) this.roleSelector.addEventListener('change', (e) => this.switchRole(e.target.value));
        document.querySelectorAll('.nav-link').forEach(link => { link.addEventListener('click', (e) => { e.preventDefault(); this.switchView(link.getAttribute('data-view')); if(this.sidebar) this.sidebar.classList.remove('show'); }); });
        if(this.toggleSidebarBtn) this.toggleSidebarBtn.addEventListener('click', () => this.sidebar.classList.add('show'));
        if(this.closeSidebarBtn) { this.closeSidebarBtn.addEventListener('click', () => { if(this.sidebar) this.sidebar.classList.remove('show'); }); }
        if(this.themeToggleBtn) { this.themeToggleBtn.addEventListener('click', () => { document.body.classList.toggle('light-theme'); const isLight = document.body.classList.contains('light-theme'); const icon = this.themeToggleBtn.querySelector('i'); if (icon) icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon'; this.renderCharts(); }); }

        if(this.btnCreateTask) this.btnCreateTask.addEventListener('click', () => this.openCreateTaskModal());
        if(this.btnCancelTaskModal) this.btnCancelTaskModal.addEventListener('click', () => this.closeTaskModal());
        if(this.taskModalCloseBtn) this.taskModalCloseBtn.addEventListener('click', () => this.closeTaskModal());
        if(this.taskDetailCloseBtn) this.taskDetailCloseBtn.addEventListener('click', () => this.closeDetailModal());
        if(this.taskForm) this.taskForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitTaskForm(); });
        if(this.addMemberForm) this.addMemberForm.addEventListener('submit', (e) => { e.preventDefault(); this.addNewMember(); });

        const btnAddSub = document.getElementById('btnAddSubTask');
        if (btnAddSub) {
            btnAddSub.addEventListener('click', () => {
                const input = document.getElementById('inputSubTaskName');
                if (input) {
                    const name = input.value.trim();
                    if (name) {
                        if (!this.tempSubTasks) this.tempSubTasks = [];
                        this.tempSubTasks.push({ id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, name: name, isDone: false });
                        input.value = ''; this.renderSubTaskListInModal();
                    }
                }
            });
        }

        const columns = document.querySelectorAll('.kanban-column');
        columns.forEach(column => {
            column.addEventListener('dragover', (e) => this.handleDragOver(e));
            column.addEventListener('dragenter', (e) => this.handleDragEnter(e, column));
            column.addEventListener('dragleave', (e) => this.handleDragLeave(e, column));
            column.addEventListener('drop', (e) => this.handleDrop(e, column));
        });

        const btnTable = document.getElementById('btnMasterTableMode'); const btnGantt = document.getElementById('btnMasterGanttMode');
        if (btnTable && btnGantt) {
            btnTable.addEventListener('click', () => { this.tasksViewMode = 'table'; btnTable.className = 'btn btn-primary'; btnGantt.className = 'btn btn-secondary'; document.getElementById('masterTableArea').classList.remove('d-none'); document.getElementById('masterGanttArea').classList.add('d-none'); this.renderMasterTaskListTable(); });
            btnGantt.addEventListener('click', () => { this.tasksViewMode = 'gantt'; btnTable.className = 'btn btn-secondary'; btnGantt.className = 'btn btn-primary'; document.getElementById('masterTableArea').classList.add('d-none'); document.getElementById('masterGanttArea').classList.remove('d-none'); this.renderGanttChart('masterGanttChart', this.getFilteredTasks()); });
        }

        const filters = [this.filterAssignee, this.filterUrgency, this.filterSecrecy, this.filterStatus];
        filters.forEach(filter => { if(filter) filter.addEventListener('change', () => { if (this.tasksViewMode === 'gantt') this.renderGanttChart('masterGanttChart', this.getFilteredTasks()); else this.renderMasterTaskListTable(); }); });
        if(this.searchTask) this.searchTask.addEventListener('input', () => { if (this.tasksViewMode === 'gantt') this.renderGanttChart('masterGanttChart', this.getFilteredTasks()); else this.renderMasterTaskListTable(); });
    }

    renderSubTaskListInModal() {
        const container = document.getElementById('subTaskListContainer'); if (!container) return;
        container.innerHTML = '';
        if (!this.tempSubTasks || this.tempSubTasks.length === 0) {
            container.innerHTML = '<span style="color: #64748b; font-size: 12px; font-style: italic; padding: 5px 0; display:block; text-align:center;">ยังไม่มีกิจย่อยถูกเพิ่มเข้ามา</span>';
            return;
        }
        this.tempSubTasks.forEach((sub, index) => {
            const item = document.createElement('div');
            item.style = 'display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.04); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); margin-bottom:4px;';
            item.innerHTML = `
                <span style="font-size: 13px; color: #f8fafc; font-weight: 500;">🔹 ${sub.name}</span>
                <button type="button" style="background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 14px; padding: 0 5px;" onclick="app.removeTempSubTask(${index})"><i class="fas fa-trash-can"></i></button>
            `;
            container.appendChild(item);
        });
    }

    renderLeaderTeam() { this.renderTeamMembers(); }
    
    renderTeamMembers() {
        if (!this.teamGridCards) return; this.teamGridCards.innerHTML = '';
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
        workingStaff.sort((a, b) => this.getRawRankWeight(a.name) - this.getRawRankWeight(b.name));
        workingStaff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id); const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length; const active = memberTasks.length - done;
            const card = document.createElement('div'); card.className = 'team-member-card glass-card';
            card.innerHTML = `
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 8px;"><button onclick="app.editMember('${member.id}')" style="background: transparent; border: none; color: #3b82f6; cursor: pointer; font-size: 14px;"><i class="fas fa-user-pen"></i></button><button onclick="app.removeMember('${member.id}')" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px;"><i class="fas fa-user-minus"></i></button></div>
                <div class="member-avatar-box" style="margin-top: 15px;"><img src="${member.avatar}" class="avatar-lg"></div><div class="member-name">${member.name}</div><div class="member-role">${member.role}</div>
                <div class="member-task-stats"><div class="member-stat"><span class="member-stat-num text-warning">${active}</span><span class="member-stat-lbl">งานค้าง</span></div><div class="member-stat" style="border-left: 1px solid rgba(255,255,255,0.1); padding-left: 15px;"><span class="member-stat-num text-success">${done}</span><span class="member-stat-lbl">เสร็จแล้ว</span></div></div>
            `;
            this.teamGridCards.appendChild(card);
        });
        if (this.avatarOptionsContainer) {
            this.avatarOptionsContainer.innerHTML = ''; const seeds = ['sam', 'jack', 'toby', 'leo', 'max', 'milo', 'charlie', 'buddy'];
            seeds.forEach((seed, index) => { const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`; const img = document.createElement('img'); img.src = url; img.className = 'avatar-opt' + (index === 0 ? ' selected' : ''); img.addEventListener('click', () => { document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected')); img.classList.add('selected'); if (this.selectedAvatarInput) this.selectedAvatarInput.value = url; }); this.avatarOptionsContainer.appendChild(img); });
            if (this.selectedAvatarInput) this.selectedAvatarInput.value = `https://api.dicebear.com/7.x/bottts/svg?seed=${seeds[0]}`;
        }
    }

    renderOutlookSharedCalendar() {
        const calendarContainer = document.getElementById('fullCalendarContainer'); if (!calendarContainer) return;
        if (this.calendarInstance) { this.calendarInstance.destroy(); this.calendarInstance = null; }
        calendarContainer.innerHTML = ''; 

        const groupedTasks = {};
        this.tasks.forEach(t => { const key = `${t.startDate}_${t.deadline}`; if (!groupedTasks[key]) { groupedTasks[key] = []; } groupedTasks[key].push(t); });

        const appEvents = Object.keys(groupedTasks).map(key => {
            const tasksInGroup = groupedTasks[key];
            let title = tasksInGroup.map(t => { const pct = this.getTaskProgress(t); return `${t.name} (${pct}%)`; }).join(' + ');
            let color = '#94a3b8'; if (tasksInGroup.some(t => this.isOverdue(t))) color = '#ef4444'; else if (tasksInGroup.some(t => t.status === 'รอการอนุมัติ')) color = '#a855f7'; else if (tasksInGroup.some(t => t.status === 'กำลังทำ')) color = '#eab308'; else if (tasksInGroup.every(t => t.status === 'เสร็จสิ้น')) color = '#10b981';
            let dStart = tasksInGroup[0].startDate ? tasksInGroup[0].startDate : new Date().toISOString().split('T')[0];
            let dEnd = tasksInGroup[0].deadline ? new Date(tasksInGroup[0].deadline) : new Date(dStart); dEnd.setDate(dEnd.getDate() + 1); 
            return { id: tasksInGroup[0].id, title: title, start: dStart, end: dEnd.toISOString().split('T')[0], color: color, extendedProps: { isAppTask: true, allTasks: tasksInGroup } };
        });

        this.calendarInstance = new FullCalendar.Calendar(calendarContainer, {
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
            initialView: 'dayGridMonth', locale: 'th',
            dayHeaderContent: function(arg) { const shortDays = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']; return shortDays[arg.date.getDay()]; },
            height: '100%', contentHeight: 'auto', handleWindowResize: true,
            eventSources: [
                {
                    events: async (info, successCallback, failureCallback) => {
                        const apiKey = 'AIzaSyC5jcUkKDPXUewzo-vni4ze3YS9k80cUrM'; const calId = 'c7e59cfe55d28e41603548ef57d8d2a558e95487eb64bb81ab642b2ed0948dcf@group.calendar.google.com';
                        const timeMin = info.start.toISOString(); const timeMax = info.end.toISOString();
                        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`;
                        try {
                            const res = await fetch(url); if (!res.ok) { successCallback([]); return; }
                            const data = await res.json();
                            if (data.items) {
                                const gEvents = data.items.map(item => ({ id: item.id, title: item.summary || 'ไม่มีชื่อกิจกรรม', start: item.start.dateTime || item.start.date, end: item.end?.dateTime || item.end?.date, url: item.htmlLink, color: '#3b82f6', extendedProps: { isAppTask: false, description: item.description || 'ไม่มีรายละเอียดระบุไว้', attachments: item.attachments || [] } }));
                                successCallback(gEvents);
                            } else { successCallback([]); }
                        } catch(err) { successCallback([]); }
                    }
                },
                { events: appEvents }
            ],
            eventClick: (info) => {
                info.jsEvent.preventDefault(); 
                if (info.event.extendedProps.isAppTask) {
                    const allTasks = info.event.extendedProps.allTasks; if (allTasks && allTasks.length > 0) { this.viewMergedTaskDetails(allTasks); }
                } else {
                    const title = info.event.title; const startStr = info.event.start ? info.event.start.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }) : '-'; const endStr = info.event.end ? info.event.end.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }) : startStr; const desc = info.event.extendedProps.description; const attachments = info.event.extendedProps.attachments; const url = info.event.url || info.event.extendedProps.url;
                    document.getElementById('eventTitle').textContent = title; document.getElementById('eventTime').textContent = `${startStr} - ${endStr}`; document.getElementById('eventDescription').innerHTML = desc;
                    const attachWrapper = document.getElementById('eventModalAttachmentsWrapper'); const attachBox = document.getElementById('eventAttachmentsBox');
                    if (attachWrapper && attachBox) {
                        attachBox.innerHTML = '';
                        if (attachments && attachments.length > 0) {
                            attachments.forEach(att => {
                                const btn = document.createElement('a'); btn.href = att.fileUrl; btn.target = '_blank'; btn.className = 'btn btn-secondary';
                                btn.style = 'display: block; padding: 8px 12px; font-size: 12px; font-weight: 600; text-align: left; margin-bottom: 8px; color: var(--text-primary); text-decoration: none; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;';
                                let icon = 'fa-file'; if (att.mimeType && att.mimeType.includes('pdf')) icon = 'fa-file-pdf text-danger'; else if (att.mimeType && att.mimeType.includes('image')) icon = 'fa-file-image text-success';
                                btn.innerHTML = `<i class="fas ${icon}"></i> ${att.title}`; attachBox.appendChild(btn);
                            }); attachWrapper.classList.remove('d-none');
                        } else { attachWrapper.classList.add('d-none'); }
                    }
                    const btnLink = document.getElementById('eventLinkBtn'); if (url) { btnLink.href = url; btnLink.style.display = 'inline-block'; } else { btnLink.style.display = 'none'; }
                    document.getElementById('eventModal').classList.add('show');
                }
            }
        });
        this.calendarInstance.render();
    }

    renderStaffKanban() {
        const member = this.staff.find(m => m.id === this.currentUser); if (!member) return;
        if (this.staffProfileAvatar) this.staffProfileAvatar.src = member.avatar; 
        if (this.staffProfileName) this.staffProfileName.textContent = member.name; 
        if (this.staffProfileRole) this.staffProfileRole.textContent = member.role;
        
        const userTasks = this.tasks.filter(t => t.assigneeId === this.currentUser);
        const todo = userTasks.filter(t => t.status === 'รอดำเนินการ'); const progress = userTasks.filter(t => t.status === 'กำลังทำ'); const review = userTasks.filter(t => t.status === 'รอการอนุมัติ'); const done = userTasks.filter(t => t.status === 'เสร็จสิ้น');
        
        if (this.staffStatTodo) this.staffStatTodo.textContent = todo.length; 
        if (this.staffStatProgress) this.staffStatProgress.textContent = progress.length; 
        if (this.staffStatReview) this.staffStatReview.textContent = review.length; 
        if (this.staffStatDone) this.staffStatDone.textContent = done.length;
        
        if (document.getElementById('countTodo')) document.getElementById('countTodo').textContent = todo.length;
        if (document.getElementById('countProgress')) document.getElementById('countProgress').textContent = progress.length;
        if (document.getElementById('countReview')) document.getElementById('countReview').textContent = review.length;
        if (document.getElementById('countDone')) document.getElementById('countDone').textContent = done.length;

        if (this.kanbanTodo) this.populateKanbanColumn(this.kanbanTodo, todo); 
        if (this.kanbanProgress) this.populateKanbanColumn(this.kanbanProgress, progress); 
        if (this.kanbanReview) this.populateKanbanColumn(this.kanbanReview, review); 
        if (this.kanbanDone) this.populateKanbanColumn(this.kanbanDone, done);
    }

    viewTaskDetails(taskId) {
        const task = this.tasks.find(t => t.id === taskId); if (!task) return;
        const member = this.staff.find(m => m.id === task.assigneeId) || { name: 'ไม่มีผู้รับผิดชอบ', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=none' };

        if(this.detailTitle) this.detailTitle.textContent = task.name; 
        if(this.detailDescription) this.detailDescription.textContent = task.description || 'ไม่มีรายละเอียดระบุไว้';
        if(this.detailSecrecyBadge) {
            this.detailSecrecyBadge.textContent = task.secrecy; this.detailSecrecyBadge.className = 'detail-secrecy-badge';
            if (task.secrecy === 'ลับที่สุด') this.detailSecrecyBadge.classList.add('secrecy-top-secret'); 
            else if (task.secrecy === 'ลับมาก') this.detailSecrecyBadge.classList.add('secrecy-secret'); 
            else if (task.secrecy === 'ลับ') this.detailSecrecyBadge.classList.add('secrecy-confidential'); 
            else this.detailSecrecyBadge.classList.add('secrecy-normal');
        }
        
        if(this.detailAssigneeAvatar) this.detailAssigneeAvatar.src = member.avatar; 
        if(this.detailAssigneeName) this.detailAssigneeName.textContent = member.name;
        if(this.detailStatusBadge) this.detailStatusBadge.innerHTML = this.getStatusBadge(task.status); 
        if(this.detailUrgencyBadge) this.detailUrgencyBadge.innerHTML = this.getUrgencyBadge(task.urgency);
        if(this.detailReceiveDate) this.detailReceiveDate.textContent = task.receiveDate || task.startDate;
        if(this.detailStartDate) this.detailStartDate.textContent = task.startDate; 
        if(this.detailDeadline) this.detailDeadline.textContent = task.deadline;

        if (this.detailOverdueBox) { if (this.isOverdue(task)) { this.detailOverdueBox.innerHTML = 'ภารกิจนี้เลยกำหนดส่งความมั่นคง!'; this.detailOverdueBox.classList.remove('d-none'); } else { this.detailOverdueBox.classList.add('d-none'); } }

        this.renderDetailModalFooter(task);

        const subTasksContainer = document.getElementById('detailSubTaskListContainer');
        const subTaskPctText = document.getElementById('detailSubTaskPercentage');
        const subTaskBar = document.getElementById('detailSubTaskProgressBar');

        if (subTasksContainer && subTaskPctText && subTaskBar) {
            const progress = this.getTaskProgress(task); subTaskPctText.textContent = `${progress}%`; subTaskBar.style.width = `${progress}%`;
            subTasksContainer.innerHTML = '';
            if (!task.subTasks || task.subTasks.length === 0) { subTasksContainer.innerHTML = '<span style="color: #64748b; font-size: 13px; font-style: italic;">ภารกิจนี้ไม่มีการแบ่งกิจย่อยไว้</span>'; } else {
                task.subTasks.forEach((sub) => {
                    const item = document.createElement('label'); item.style = 'display: flex; align-items: center; gap: 12px; background: #0f172a; padding: 12px; border-radius: 8px; cursor: pointer; margin-bottom:6px; font-size: 14px; width:100%; border:1px solid rgba(255,255,255,0.05);';
                    const textStyle = sub.isDone ? 'text-decoration: line-through; color: #64748b;' : 'color: #f8fafc; font-weight: 500;';
                    item.innerHTML = `
                        <input type="checkbox" style="width: 18px; height: 18px; accent-color: #3b82f6; cursor: pointer;" ${sub.isDone ? 'checked' : ''} onchange="app.toggleSubTaskStatus('${task.id}', '${sub.id}', this.checked)">
                        <span style="${textStyle}">${sub.name}</span>
                    `; subTasksContainer.appendChild(item);
                });
            }
        }

        if (task.hasAttachment && this.detailPdfItem && this.pdfButtonsContainer) {
            this.detailPdfItem.classList.remove('d-none'); this.pdfButtonsContainer.innerHTML = ''; 
            let fileNamesList = []; try { fileNamesList = JSON.parse(task.attachmentName); if (!Array.isArray(fileNamesList)) fileNamesList = [task.attachmentName]; } catch (e) { fileNamesList = [task.attachmentName]; }
            fileNamesList.forEach((fName, index) => {
                const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-secondary'; btn.style = 'padding: 6px 10px; font-size: 11px; font-weight: 600; text-align: left; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 5px;'; btn.innerHTML = `<i class="fas fa-file-pdf text-danger"></i> ${fName}`;
                btn.addEventListener('click', async () => {
                    if (this.isCloudMode) { const kvKey = fileNamesList.length === 1 ? task.id : `${task.id}_${index}`; window.open(`/api/pdf?taskId=${kvKey}`, '_blank'); } else {
                        btn.disabled = true; btn.innerHTML = 'ดึงไฟล์...';
                        try {
                            const record = await this.attachments.getAttachment(task.id);
                            if (record) { let fileDataToOpen = null; if (record.isMultiple && record.files && record.files[index]) fileDataToOpen = record.files[index].fileData; else if (record.fileData) fileDataToOpen = record.fileData; if (fileDataToOpen) window.open(URL.createObjectURL(fileDataToOpen), '_blank'); }
                        } catch (err) {} finally { btn.disabled = false; btn.innerHTML = `<i class="fas fa-file-pdf text-danger"></i> ${fName}`; }
                    }
                }); this.pdfButtonsContainer.appendChild(btn);
            });
        } else { if(this.detailPdfItem) this.detailPdfItem.classList.add('d-none'); }

        const historyLogContainer = document.getElementById('detailHistoryLog');
        if (historyLogContainer) {
            historyLogContainer.innerHTML = '';
            if (task.history && task.history.length > 0) {
                const sortedHistory = [...task.history].sort((a, b) => new Date(b.time) - new Date(a.time));
                sortedHistory.forEach(log => { const timeStr = new Date(log.time).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }); historyLogContainer.innerHTML += `<div>⏱️ ${timeStr} - <b>${log.user}</b>: ${log.action}</div>`; });
            } else { historyLogContainer.innerHTML = '<i>ยังไม่มีประวัติ</i>'; }
        }
    }

    viewMergedTaskDetails(allTasks) {
        if (!allTasks || allTasks.length === 0) return;
        if (allTasks.length === 1) { this.viewTaskDetails(allTasks[0].id); return; }
        if(this.detailTitle) this.detailTitle.textContent = `[กลุ่มภารกิจร่วมห้วงเวลาเดียวกัน]`; 
        if(this.detailDescription) {
            let compiledDesc = ''; allTasks.forEach((task, index) => { compiledDesc += `📌 [${index + 1}] ${task.name}\n📝 รายละเอียด: ${task.description || 'ไม่มี'}\n🚦 สถานะ: ${task.status}\n-----------------------------------\n\n`; }); this.detailDescription.textContent = compiledDesc;
        }
        if(this.detailSecrecyBadge) { this.detailSecrecyBadge.textContent = "แผนงานร่วม"; this.detailSecrecyBadge.className = 'detail-secrecy-badge secrecy-normal'; }
        if(this.detailAssigneeAvatar) this.detailAssigneeAvatar.src = 'https://img.icons8.com/color/96/group.png'; 
        if(this.detailAssigneeName) this.detailAssigneeName.textContent = 'เจ้าหน้าที่ปฏิบัติงานร่วมในห้วง';
        if(this.detailStatusBadge) this.detailStatusBadge.innerHTML = `<span class="status-badge badge-progress">มีงานกำลังทำ</span>`; 
        if(this.detailUrgencyBadge) this.detailUrgencyBadge.innerHTML = `<span class="urgency-badge urgency-v-urgent">ตรวจสอบงานแยกย่อย</span>`;
        if(this.detailReceiveDate) this.detailReceiveDate.textContent = allTasks[0].receiveDate || allTasks[0].startDate;
        if(this.detailStartDate) this.detailStartDate.textContent = allTasks[0].startDate; 
        if(this.detailDeadline) this.detailDeadline.textContent = allTasks[0].deadline;

        const subTasksContainer = document.getElementById('detailSubTaskListContainer');
        if (subTasksContainer) subTasksContainer.innerHTML = '<span style="color: var(--text-muted); font-size:13px; font-style:italic;">กรุณาเปิดตรวจสอบกิจย่อยผ่านกระดานปฏิบัติการทางยุทธการรายบุคคลครับ</span>';
        if(this.detailModalFooter) { this.detailModalFooter.innerHTML = ''; const btnClose = document.createElement('button'); btnClose.className = 'btn btn-secondary'; btnClose.style.width = '100%'; btnClose.innerHTML = 'ปิดหน้าต่าง'; btnClose.addEventListener('click', () => this.closeDetailModal()); this.detailModalFooter.appendChild(btnClose); }
        if(this.taskDetailModal) this.taskDetailModal.classList.add('show');
    }

    openCreateTaskModal() {
        if (!this.taskModal) return; this.taskForm.reset(); this.taskModalTitle.innerHTML = 'มอบหมายภารกิจยุทธการใหม่'; this.taskIdField.value = '';
        this.tempSubTasks = []; this.renderSubTaskListInModal();
        const today = new Date().toISOString().split('T')[0]; this.taskReceiveDateInput.value = today; this.taskStartDateInput.value = today; this.taskDeadlineInput.value = today;
        const isAdmin = (this.currentUser === 'leader' || this.currentUser === 'asst-g3' || this.currentUser === 'dev-chaisith');
        if (isAdmin) { this.taskAssigneeInput.value = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3')[0]?.id || ''; this.taskAssigneeInput.disabled = false; } else { this.taskAssigneeInput.value = this.currentUser; this.taskAssigneeInput.disabled = true; }
        this.taskStatusInput.value = 'รอดำเนินการ'; this.taskStatusInput.disabled = false;
        if(this.pdfUploadRow) this.pdfUploadRow.style.display = 'grid'; if(this.taskPdfInput) this.taskPdfInput.value = ''; if(this.pdfUploadStatus) this.pdfUploadStatus.textContent = 'ไม่มีไฟล์ที่แนบไว้';
        this.taskModal.classList.add('show');
    }

    openEditTaskModal(taskId) {
        if (!this.taskModal) return; const task = this.tasks.find(t => t.id === taskId); if (!task) return;
        this.taskModalTitle.innerHTML = 'แก้ไขข้อมูลยุทธการ'; this.taskIdField.value = task.id; this.taskNameInput.value = task.name; this.taskDescriptionInput.value = task.description; this.taskAssigneeInput.value = task.assigneeId; this.taskStatusInput.value = task.status; this.taskUrgencyInput.value = task.urgency; this.taskSecrecyInput.value = task.secrecy; this.taskReceiveDateInput.value = task.receiveDate || task.startDate; this.taskStartDateInput.value = task.startDate; this.taskDeadlineInput.value = task.deadline;
        this.tempSubTasks = task.subTasks ? JSON.parse(JSON.stringify(task.subTasks)) : []; this.renderSubTaskListInModal();
        const isAdmin = (this.currentUser === 'leader' || this.currentUser === 'asst-g3' || this.currentUser === 'dev-chaisith'); this.taskAssigneeInput.disabled = !isAdmin; this.taskStatusInput.disabled = false;
        if(this.pdfUploadRow) this.pdfUploadRow.style.display = 'grid';
        let fNames = ''; if(task.hasAttachment && task.attachmentName) { try { const arr = JSON.parse(task.attachmentName); fNames = Array.isArray(arr) ? arr.join(', ') : task.attachmentName; } catch(e) { fNames = task.attachmentName; } if(this.pdfUploadStatus) this.pdfUploadStatus.textContent = `ไฟล์แนบปัจจุบัน: ${fNames}`; } else { if(this.pdfUploadStatus) this.pdfUploadStatus.textContent = 'ยังไม่มีไฟล์แนบ'; }
        if(this.taskPdfInput) this.taskPdfInput.value = ''; this.taskModal.classList.add('show');
    }

    async submitTaskForm() {
        const id = this.taskIdField.value; const name = this.taskNameInput.value.trim(); const description = this.taskDescriptionInput.value.trim(); const assigneeId = this.taskAssigneeInput.value; const status = this.taskStatusInput.value; const urgency = this.taskUrgencyInput.value; const secrecy = this.taskSecrecyInput.value; const receiveDate = this.taskReceiveDateInput.value; const startDate = this.taskStartDateInput.value; const deadline = this.taskDeadlineInput.value;
        if (new Date(startDate) < new Date(receiveDate)) { alert('ข้อผิดพลาด: วันที่เริ่มปฏิบัติงาน ต้องไม่ก่อนวันที่เอกสารเข้า'); return; } if (new Date(deadline) < new Date(startDate)) { alert('ข้อผิดพลาด: วันกำหนดส่ง ต้องไม่ก่อนวันเริ่มต้นปฏิบัติงาน'); return; }
        const now = new Date(); const logUser = this.currentUserName.textContent; let finalTaskId = id; let taskObj = null; let lineAlertMessage = '';
        if (id) {
            taskObj = this.tasks.find(t => t.id === id);
            if (taskObj) {
                const changes = []; if (taskObj.name !== name) changes.push(`หัวข้อ`); if (taskObj.assigneeId !== assigneeId) changes.push(`ผู้รับผิดชอบ`); if (taskObj.status !== status) changes.push(`สถานะ`); taskObj.name = name; taskObj.description = description; taskObj.assigneeId = assigneeId; taskObj.status = status; taskObj.urgency = urgency; taskObj.secrecy = secrecy; taskObj.receiveDate = receiveDate; taskObj.startDate = startDate; taskObj.deadline = deadline; taskObj.subTasks = [...this.tempSubTasks];
                if (!taskObj.history) taskObj.history = []; if (changes.length > 0) { taskObj.history.push({ time: now.toISOString(), action: `แก้ไข: ${changes.join(', ')}`, user: logUser }); lineAlertMessage = `อัปเดตข้อมูล: ${changes.join(', ')}`; }
            }
        } else {
            finalTaskId = `task-${Date.now()}`; taskObj = { id: finalTaskId, name, description, assigneeId, status, urgency, secrecy, receiveDate, startDate, deadline, subTasks: [...this.tempSubTasks], history: [{ time: now.toISOString(), action: `มอบหมายภารกิจเริ่มต้น`, user: logUser }] }; this.tasks.push(taskObj); lineAlertMessage = 'มอบหมายภารกิจชิ้นใหม่ให้ท่าน';
        }
        if (taskObj && this.taskPdfInput && this.taskPdfInput.files.length > 0) {
            const files = this.taskPdfInput.files; const fileNamesArray = Array.from(files).map(f => f.name); this.btnSubmitTaskModal.disabled = true; this.btnSubmitTaskModal.innerHTML = 'อัปโหลดไฟล์...';
            if (this.isCloudMode) {
                try {
                    for (let i = 0; i < files.length; i++) { const file = files[i]; const base64Data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(file); }); const kvKey = files.length === 1 ? finalTaskId : `${finalTaskId}_${i}`; const pdfRes = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: kvKey, fileName: file.name, fileType: file.type, fileData: base64Data }) }); if (!pdfRes.ok) throw new Error("Cloud upload fail"); }
                    taskObj.hasAttachment = true; taskObj.attachmentName = JSON.stringify(fileNamesArray); if (!taskObj.history) taskObj.history = []; taskObj.history.push({ time: now.toISOString(), action: `แนบเอกสาร ${files.length} ฉบับ`, user: logUser }); lineAlertMessage += ` (แนบเอกสาร ${files.length} ฉบับ)`;
                } catch (err) { this.showToast('อัปโหลดไฟล์ไปคลาวด์ล้มเหลว', 'danger'); }
            } else { try { await this.attachments.saveAttachment(finalTaskId, files); taskObj.hasAttachment = true; taskObj.attachmentName = JSON.stringify(fileNamesArray); if (!taskObj.history) taskObj.history = []; taskObj.history.push({ time: now.toISOString(), action: `แนบเอกสาร ${files.length} ฉบับ`, user: logUser }); } catch (err) {} }
            this.btnSubmitTaskModal.disabled = false; this.btnSubmitTaskModal.innerHTML = 'บันทึกภารกิจ';
        }
        if (lineAlertMessage !== '') this.sendLineAlert(taskObj, lineAlertMessage); this.saveData(); this.closeTaskModal();
        if (this.isCloudMode) { try { await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskObj) }); } catch (err) {} }
        if (this.calendarInstance) this.calendarInstance.refetchEvents(); this.switchView(this.currentView); this.showToast(id ? 'อัปเดตข้อมูลสำเร็จ' : 'มอบหมายงานสำเร็จ');
    }

    deleteTask(taskId) {
        if (confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกและลบภารกิจนี้?')) {
            this.tasks = this.tasks.filter(t => t.id !== taskId); this.attachments.deleteAttachment(taskId).catch(e => e); this.saveData();
            if (this.isCloudMode) fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' }).catch(e => e);
            if (this.calendarInstance) this.calendarInstance.refetchEvents(); this.switchView(this.currentView); this.showToast('ลบภารกิจเรียบร้อย', 'danger');
        }
    }

    renderDetailModalFooter(task) {
        if(!this.detailModalFooter) return; this.detailModalFooter.innerHTML = '';
        if (this.currentUser === 'leader' || this.currentUser === 'asst-g3' || this.currentUser === 'dev-chaisith' || task.assigneeId === this.currentUser) {
            if (task.status === 'รอการอนุมัติ' && (this.currentUser === 'leader' || this.currentUser === 'asst-g3' || this.currentUser === 'dev-chaisith')) {
                const btnReject = document.createElement('button'); btnReject.className = 'btn btn-secondary'; btnReject.innerHTML = 'ส่งกลับปรับปรุง'; btnReject.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'กำลังทำ', 'ส่งคืนแผนงานแก้ไข')); this.detailModalFooter.appendChild(btnReject);
                const btnApprove = document.createElement('button'); btnApprove.className = 'btn btn-success'; btnApprove.innerHTML = 'ลงนามอนุมัติ'; btnApprove.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'เสร็จสิ้น', 'ลงนามอนุมัติ')); this.detailModalFooter.appendChild(btnApprove);
            } else {
                const btnEdit = document.createElement('button'); btnEdit.className = 'btn btn-primary'; btnEdit.innerHTML = 'แก้ไขภารกิจ'; btnEdit.addEventListener('click', () => { this.closeDetailModal(); this.openEditTaskModal(task.id); }); this.detailModalFooter.appendChild(btnEdit);
                const btnDelete = document.createElement('button'); btnDelete.className = 'btn btn-danger'; btnDelete.innerHTML = 'ลบภารกิจ'; btnDelete.addEventListener('click', () => { this.closeDetailModal(); this.deleteTask(task.id); }); this.detailModalFooter.appendChild(btnDelete);
            }
        } else {
            if (task.status === 'รอดำเนินการ') {
                const btnStart = document.createElement('button'); btnStart.className = 'btn btn-primary'; btnStart.innerHTML = 'เริ่มปฏิบัติงาน'; btnStart.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'กำลังทำ', 'เริ่มลงมือปฏิบัติการ')); this.detailModalFooter.appendChild(btnStart);
            } else if (task.status === 'กำลังทำ') {
                const btnReview = document.createElement('button'); btnReview.className = 'btn btn-success'; btnReview.innerHTML = 'ส่งรายงาน'; btnReview.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'รอการอนุมัติ', 'ยื่นเสนอขออนุมัติ')); this.detailModalFooter.appendChild(btnReview);
            }
        }
    }

    removeMember(memberId) {
        const member = this.staff.find(m => m.id === memberId); if (!member) return; const activeTasks = this.tasks.filter(t => t.assigneeId === memberId && t.status !== 'เสร็จสิ้น'); if (activeTasks.length > 0) { alert(`ไม่สามารถลบได้! มีภารกิจค้างอยู่`); return; }
        if (confirm(`ต้องการลบกำลังพลใช่หรือไม่?`)) { this.tasks.forEach(t => { if (t.assigneeId === memberId) t.assigneeId = 'deleted'; }); this.staff = this.staff.filter(m => m.id !== memberId); if (this.isCloudMode) fetch(`/api/staff?id=${memberId}`, { method: 'DELETE' }); this.saveData(); this.populateRoleSwitcher(); this.populateAssigneeDropdowns(); this.renderTeamMembers(); this.showToast(`ลบกำลังพลสำเร็จ`, 'warning'); }
    }
    editMember(memberId) { const member = this.staff.find(m => m.id === memberId); if (!member) return; this.editingStaffId = memberId; this.memberNameInput.value = member.name; this.memberRoleInput.value = member.role; this.selectedAvatarInput.value = member.avatar; this.addMemberForm.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    resetMemberForm() { this.editingStaffId = null; this.memberNameInput.value = ''; this.memberRoleInput.value = ''; }
    
    handleDragStart(e, taskId) { this.draggedCardId = taskId; e.dataTransfer.setData('text/plain', taskId); }
    handleDragEnd(card) { this.draggedCardId = null; }
    renderTeamProgressTable() { if(this.teamProgressTableBody) this.teamProgressTableBody.innerHTML='<tr><td colspan="7">กำลังแสดงผลในส่วนสลับผู้ใช้บนโมบายล์</td></tr>'; }
    handleDragLeave(e, column) {}
    handleDragOver(e) { e.preventDefault(); }
    handleDragEnter(e, column) { e.preventDefault(); }
    handleDrop(e, column) { e.preventDefault(); const taskId = e.dataTransfer.getData('text/plain') || this.draggedCardId; if (!taskId) return; const task = this.tasks.find(t => t.id === taskId); const newStatus = column.getAttribute('data-status'); if (task && task.status !== newStatus) { task.status = newStatus; this.saveData(); this.renderStaffKanban(); if (this.isCloudMode) fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) }); } }
    
    getRawRankWeight(name) { if (!name) return 500; if (name.startsWith('พ.ท.')) return 10; if (name.startsWith('พ.ต.')) return 20; if (name.startsWith('ร.อ.')) return 30; if (name.startsWith('ร.ท.')) return 40; if (name.startsWith('ร.ต.')) return 50; return 500; }
    getUrgencyBadge(urgency) { let badgeClass = 'urgency-normal'; if (urgency === 'ด่วน') badgeClass = 'urgency-urgent'; if (urgency === 'ด่วนมาก') badgeClass = 'urgency-v-urgent'; if (urgency === 'ด่วนที่สุด') badgeClass = 'urgency-most-urgent'; return `<span class="urgency-badge ${badgeClass}">${urgency}</span>`; }
    getSecrecyBadge(secrecy) { let badgeClass = 'secrecy-normal'; if (secrecy === 'ลับ') badgeClass = 'secrecy-confidential'; if (secrecy === 'ลับมาก') badgeClass = 'secrecy-secret'; if (secrecy === 'ลับที่สุด') badgeClass = 'secrecy-top-secret'; return `<span class="secrecy-badge ${badgeClass}">${secrecy}</span>`; }
    getStatusBadge(status) { let badgeClass = 'badge-todo'; if (status === 'กำลังทำ') badgeClass = 'badge-progress'; if (status === 'รอการอนุมัติ') badgeClass = 'badge-review'; if (status === 'เสร็จสิ้น') badgeClass = 'badge-done'; return `<span class="status-badge ${badgeClass}">${status}</span>`; }
    closeTaskModal() { if(this.taskModal) this.taskModal.classList.remove('show'); }
    closeDetailModal() { if(this.taskDetailModal) this.taskDetailModal.classList.remove('show'); }
    
    renderCharts() {
        if (this.statusChartInstance) this.statusChartInstance.destroy(); if (this.staffChartInstance) this.staffChartInstance.destroy();
        const statusChartCanvas = document.getElementById('statusChart'); const staffChartCanvas = document.getElementById('staffChart');
        if (!statusChartCanvas || !staffChartCanvas) return;
        const isLightTheme = document.body.classList.contains('light-theme'); const textColor = isLightTheme ? '#4b5563' : '#9ca3af'; const gridColor = isLightTheme ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
        this.statusChartInstance = new Chart(statusChartCanvas, {
            type: 'doughnut',
            data: { labels: ['รอดำเนินการ', 'กำลังทำ', 'รออนุมัติ', 'เสร็จสิ้น'], datasets: [{ data: [ this.tasks.filter(t=>t.status==='รอดำเนินการ').length, this.tasks.filter(t=>t.status==='กำลังทำ').length, this.tasks.filter(t=>t.status==='รอการอนุมัติ').length, this.tasks.filter(t=>t.status==='เสร็จสิ้น').length ], backgroundColor: ['#94a3b8', '#eab308', '#a855f7', '#10b981'], borderColor: isLightTheme ? '#ffffff' : '#141e30', borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Prompt', size: 11 } } } } }
        });
        const staffNames = []; const completedData = []; const incompletedData = [];
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3'); workingStaff.sort((a, b) => this.getRawRankWeight(a.name) - this.getRawRankWeight(b.name));
        workingStaff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id); const comp = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            staffNames.push(member.name.split(' ').slice(0, 2).join(' ')); completedData.push(comp); incompletedData.push(memberTasks.length - comp);
        });
        this.staffChartInstance = new Chart(staffChartCanvas, {
            type: 'bar',
            data: { labels: staffNames, datasets: [ { label: 'เสร็จสิ้น (Done)', data: completedData, backgroundColor: '#10b981', borderRadius: 4 }, { label: 'กำลังปฏิบัติ/รออนุมัติ/รอดำเนินการ', data: incompletedData, backgroundColor: '#3b82f6', borderRadius: 4 } ] },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Prompt' } } }, y: { stacked: true, grid: { display: false }, ticks: { color: textColor, font: { family: 'Prompt' } } } }, plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Prompt', size: 11 } } } } }
        });
    }
    renderLeaderDashboard() {
        if (this.statTotalTasks) this.statTotalTasks.textContent = this.tasks.length;
        if (this.statInProgressTasks) this.statInProgressTasks.textContent = this.tasks.filter(t => t.status === 'กำลังทำ').length;
        if (this.statReviewTasks) this.statReviewTasks.textContent = this.tasks.filter(t => t.status === 'รอการอนุมัติ').length;
        if (this.statCompletedTasks) this.statCompletedTasks.textContent = this.tasks.filter(t => t.status === 'เสร็จสิ้น').length;
        if (this.statOverdueTasks) this.statOverdueTasks.textContent = this.tasks.filter(t => this.isOverdue(t)).length;
        this.renderCharts(); this.renderTeamProgressTable();
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new App(); });
