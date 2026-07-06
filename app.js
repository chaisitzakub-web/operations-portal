/**
 * Operations Portal - Application Logic (app.js)
 * โค้ดฉบับเต็มถาวร 100%: ล็อกระบบสลับเมนู + ปฏิทิน Checkbox ความคืบหน้ากิจย่อยสมบูรณ์สูงสุด
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
        this.staff = []; this.tasks = []; 
        this.currentUser = 'leader'; this.currentView = 'leader-dashboard'; this.isCloudMode = false; this.tasksViewMode = 'table'; 
        this.statusChartInstance = null; this.staffChartInstance = null; this.draggedCardId = null; this.editingStaffId = null;
        this.calendarInstance = null; this.tempSubTasks = []; 

        try {
            this.initDOMElements(); this.loadData(); this.setupEventListeners(); this.startClock();
            this.attachments = new AttachmentStore();
            this.attachments.init().then(async () => { await this.syncWithCloudflare(); this.render(); })
            .catch(async err => { await this.syncWithCloudflare(); this.render(); });
        } catch (err) { alert("ระบบขัดข้องตอนเริ่มต้นแอป: " + err.message); }
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

    startClock() {
        const liveTimeEl = document.getElementById('liveTime');
        const updateTime = () => { if (liveTimeEl) liveTimeEl.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
        updateTime(); setInterval(updateTime, 1000);
    }

    getTaskProgress(task) {
        if (!task || !task.subTasks || !Array.isArray(task.subTasks) || task.subTasks.length === 0) {
            return (task && task.status === 'เสร็จสิ้น') ? 100 : 0;
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
                this.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
                this.tasks.forEach(t => { if (!t.subTasks || !Array.isArray(t.subTasks)) t.subTasks = []; });
            } catch (e) { this.staff = JSON.parse(JSON.stringify(DEFAULT_STAFF)); this.tasks = []; }
        } else { this.staff = JSON.parse(JSON.stringify(DEFAULT_STAFF)); this.tasks = []; }
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

    switchView(viewName) {
        Object.keys(this.views).forEach(name => { 
            if(!this.views[name]) return; 
            if (name === viewName) { this.views[name].classList.remove('d-none'); this.views[name].classList.add('active'); } 
            else { this.views[name].classList.remove('active'); this.views[name].classList.add('d-none'); } 
        });
        document.querySelectorAll('.nav-link').forEach(link => { if (link.getAttribute('data-view') === viewName) link.classList.add('active'); else link.classList.remove('active'); });
        this.currentView = viewName; let thaiTitle = 'ภาพรวมยุทธการ';
        switch (viewName) { case 'leader-dashboard': thaiTitle = 'แดชบอร์ดภาพรวมยุทธการ'; break; case 'leader-tasks': thaiTitle = 'แฟ้มสะสมภารกิจฝ่ายยุทธการ'; break; case 'leader-team': thaiTitle = 'บัญชีรายชื่อกำลังพล'; break; case 'staff-kanban': thaiTitle = 'กระดานปฏิบัติการทางยุทธการ'; break; case 'staff-tasks': thaiTitle = 'รายการปฏิบัติการเดี่ยว'; break; case 'team-calendar': thaiTitle = 'ปฏิทินยุทธการส่วนกลาง'; break; }
        if (this.pageTitle) this.pageTitle.innerHTML = thaiTitle;
        
        if (viewName === 'leader-dashboard') this.renderLeaderDashboard(); 
        else if (viewName === 'leader-tasks') this.renderMasterTaskListTable(); 
        else if (viewName === 'leader-team') this.renderTeamMembers(); 
        else if (viewName === 'staff-kanban') this.renderStaffKanban(); 
        else if (viewName === 'staff-tasks') this.renderStaffTaskListTable(); 
        else if (viewName === 'team-calendar') this.renderOutlookSharedCalendar(); 
    }

    switchRole(roleVal) {
        this.currentUser = roleVal; const member = this.staff.find(m => m.id === roleVal);
        if (member) {
            if (this.currentUserName) this.currentUserName.textContent = member.name;
            if (this.currentUserRoleText) this.currentUserRoleText.textContent = member.role.split(' (')[0];
            if (this.currentUserAvatar) this.currentUserAvatar.src = member.avatar;
            if (roleVal === 'leader' || roleVal === 'asst-g3' || roleVal === 'dev-chaisith' || member.isStaffAdmin) {
                if(this.leaderNav) this.leaderNav.classList.remove('d-none'); if(this.staffNav) this.staffNav.classList.add('d-none'); if(this.btnCreateTask) this.btnCreateTask.classList.remove('d-none');
                this.switchView('leader-dashboard');
            } else {
                if(this.leaderNav) this.leaderNav.classList.add('d-none'); if(this.staffNav) this.staffNav.classList.remove('d-none'); if(this.btnCreateTask) this.btnCreateTask.classList.remove('d-none');
                this.switchView('staff-kanban');
            }
        }
    }

    setupEventListeners() {
        if(this.roleSelector) this.roleSelector.addEventListener('change', (e) => this.switchRole(e.target.value));
        document.querySelectorAll('.nav-link').forEach(link => { link.addEventListener('click', (e) => { e.preventDefault(); this.switchView(link.getAttribute('data-view')); }); });
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
                        this.tempSubTasks.push({ id: `sub-${Date.now()}`, name: name, isDone: false });
                        input.value = ''; this.renderSubTaskListInModal();
                    }
                }
            });
        }
    }

    renderSubTaskListInModal() {
        const container = document.getElementById('subTaskListContainer'); if (!container) return;
        container.innerHTML = '';
        this.tempSubTasks.forEach((sub, index) => {
            const item = document.createElement('div');
            item.style = 'display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.04); padding: 8px 12px; border-radius: 6px; margin-bottom:4px;';
            item.innerHTML = `<span>🔹 ${sub.name}</span><button type="button" style="background:transparent; border:none; color:#ef4444; cursor:pointer;" onclick="app.removeTempSubTask(${index})"><i class="fas fa-trash-can"></i></button>`;
            container.appendChild(item);
        });
    }

    removeTempSubTask(index) { if (this.tempSubTasks && this.tempSubTasks[index]) { this.tempSubTasks.splice(index, 1); this.renderSubTaskListInModal(); } }

    toggleSubTaskStatus(taskId, subId, isChecked) {
        const task = this.tasks.find(t => t.id === taskId); if (!task || !task.subTasks) return;
        const sub = task.subTasks.find(s => s.id === subId);
        if (sub) {
            sub.isDone = isChecked; const progress = this.getTaskProgress(task);
            const pctText = document.getElementById('detailSubTaskPercentage'); const pBar = document.getElementById('detailSubTaskProgressBar');
            if(pctText) pctText.textContent = `${progress}%`; if(pBar) pBar.style.width = `${progress}%`;
            this.saveData(); this.switchView(this.currentView); this.viewTaskDetails(taskId);
        }
    }

    renderTeamMembers() {
        if (!this.teamGridCards) return; this.teamGridCards.innerHTML = '';
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
        workingStaff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id); const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length; const active = memberTasks.length - done;
            const card = document.createElement('div'); card.className = 'team-member-card glass-card';
            card.innerHTML = `
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 8px;"><button type="button" onclick="app.editMember('${member.id}')" style="background: transparent; border: none; color: #3b82f6; cursor: pointer;"><i class="fas fa-user-pen"></i></button><button type="button" onclick="app.removeMember('${member.id}')" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer;"><i class="fas fa-user-minus"></i></button></div>
                <div class="member-avatar-box" style="margin-top: 15px;"><img src="${member.avatar}" class="avatar-lg"></div><div class="member-name">${member.name}</div><div class="member-role">${member.role}</div>
                <div class="member-task-stats"><div class="member-stat"><span class="member-stat-num text-warning">${active}</span><span class="member-stat-lbl">งานค้าง</span></div><div class="member-stat" style="border-left: 1px solid rgba(255,255,255,0.1); padding-left: 15px;"><span class="member-stat-num text-success">${done}</span><span class="member-stat-lbl">เสร็จแล้ว</span></div></div>
            `;
            this.teamGridCards.appendChild(card);
        });
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
                        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?key=${apiKey}&timeMin=${info.start.toISOString()}&timeMax=${info.end.toISOString()}&singleEvents=true`;
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
                                const btn = document.createElement('a'); btn.href = att.fileUrl; btn.target = '_blank'; btn.className = 'btn btn-secondary'; btn.innerHTML = `<i class="fas fa-file"></i> ${att.title}`; attachBox.appendChild(btn);
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

        this.renderDetailModalFooter(task);

        const subTasksContainer = document.getElementById('detailSubTaskListContainer');
        const subTaskPctText = document.getElementById('detailSubTaskPercentage');
        const subTaskBar = document.getElementById('detailSubTaskProgressBar');

        if (subTasksContainer && subTaskPctText && subTaskBar) {
            const progress = this.getTaskProgress(task); subTaskPctText.textContent = `${progress}%`; subTaskBar.style.width = `${progress}%`;
            subTasksContainer.innerHTML = '';
            if (!task.subTasks || task.subTasks.length === 0) { subTasksContainer.innerHTML = '<span>ภารกิจนี้ไม่มีการแบ่งกิจย่อยไว้</span>'; } else {
                task.subTasks.forEach((sub) => {
                    const item = document.createElement('label'); item.style = 'display: flex; align-items: center; gap: 12px; background: #0f172a; padding: 12px; border-radius: 8px; cursor: pointer; margin-bottom:6px; font-size: 14px; width:100%; border:1px solid rgba(255,255,255,0.05);';
                    const textStyle = sub.isDone ? 'text-decoration: line-through; color: #64748b;' : 'color: #f8fafc; font-weight: 500;';
                    item.innerHTML = `<input type="checkbox" style="width: 18px; height: 18px; accent-color: #3b82f6; cursor: pointer;" ${sub.isDone ? 'checked' : ''} onchange="app.toggleSubTaskStatus('${task.id}', '${sub.id}', this.checked)"><span style="${textStyle}">${sub.name}</span>`; subTasksContainer.appendChild(item);
                });
            }
        }
        if(this.taskDetailModal) this.taskDetailModal.classList.add('show');
    }

    viewMergedTaskDetails(allTasks) {
        if (!allTasks || allTasks.length === 0) return;
        if(this.detailTitle) this.detailTitle.textContent = `[กลุ่มภารกิจร่วมห้วงเวลาเดียวกัน]`; 
        if(this.detailDescription) {
            let compiledDesc = ''; allTasks.forEach((task, index) => { compiledDesc += `📌 [${index + 1}] ${task.name}\n`; }); this.detailDescription.textContent = compiledDesc;
        }
        if(this.detailModalFooter) { this.detailModalFooter.innerHTML = ''; const btnClose = document.createElement('button'); btnClose.className = 'btn btn-secondary'; btnClose.style.width = '100%'; btnClose.innerHTML = 'ปิดหน้าต่าง'; btnClose.addEventListener('click', () => this.closeDetailModal()); this.detailModalFooter.appendChild(btnClose); }
        if(this.taskDetailModal) this.taskDetailModal.classList.add('show');
    }

    ensureAdminStaff() {
        if (!this.staff || !Array.isArray(this.staff)) this.staff = [];
        if (!this.staff.find(m => m.id === 'leader')) this.staff.unshift({ id: 'leader', name: 'หัวหน้าฝ่ายยุทธการ', role: 'หัวหน้าฝ่ายยุทธการ (Leader)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=leader', isStaffAdmin: true, rankWeight: 1 });
        if (!this.staff.find(m => m.id === 'asst-g3')) this.staff.splice(1, 0, { id: 'asst-g3', name: 'ผช.หน.ฝยก.พล.ร.4', role: 'ผช.หน.ฝยก.พล.ร.4 (Asst. G3)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=asstg3', isStaffAdmin: true, rankWeight: 2 });
        if (!this.staff.find(m => m.id === 'dev-chaisith')) this.staff.push({ id: 'dev-chaisith', name: 'จ.ส.ท. ชัยสิทธิ์ ศรีอ่อนทอง', role: 'Powerpoint Wizard / DEV', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=chaisith', isStaffAdmin: true, rankWeight: 70, lineUserId: 'U093959610f37c88a31fe2911a7dd4bdd' });
    }

    openCreateTaskModal() {
        if (!this.taskModal) return; this.taskForm.reset(); this.taskModalTitle.innerHTML = 'มอบหมายภารกิจยุทธการใหม่'; this.taskIdField.value = '';
        this.tempSubTasks = []; this.renderSubTaskListInModal();
        if(this.taskReceiveDateInput) { const today = new Date().toISOString().split('T')[0]; this.taskReceiveDateInput.value = today; this.taskStartDateInput.value = today; this.taskDeadlineInput.value = today; }
        this.taskModal.classList.add('show');
    }

    openEditTaskModal(taskId) {
        if (!this.taskModal) return; const task = this.tasks.find(t => t.id === taskId); if (!task) return;
        this.taskModalTitle.innerHTML = 'แก้ไขข้อมูลยุทธการ'; this.taskIdField.value = task.id; this.taskNameInput.value = task.name; this.taskDescriptionInput.value = task.description; this.taskAssigneeInput.value = task.assigneeId; this.taskStatusInput.value = task.status; this.taskUrgencyInput.value = task.urgency; this.taskSecrecyInput.value = task.secrecy;
        if(this.taskReceiveDateInput) { this.taskReceiveDateInput.value = task.receiveDate || task.startDate; this.taskStartDateInput.value = task.startDate; this.taskDeadlineInput.value = task.deadline; }
        this.tempSubTasks = task.subTasks ? JSON.parse(JSON.stringify(task.subTasks)) : []; this.renderSubTaskListInModal();
        this.taskModal.classList.add('show');
    }

    async submitTaskForm() {
        const id = this.taskIdField.value; const name = this.taskNameInput.value.trim(); const description = this.taskDescriptionInput.value.trim(); const assigneeId = this.taskAssigneeInput.value; const status = this.taskStatusInput.value; const urgency = this.taskUrgencyInput.value; const secrecy = this.taskSecrecyInput.value;
        const receiveDate = this.taskReceiveDateInput ? this.taskReceiveDateInput.value : ''; const startDate = this.taskStartDateInput ? this.taskStartDateInput.value : ''; const deadline = this.taskDeadlineInput ? this.taskDeadlineInput.value : '';
        let taskObj = null;
        if (id) {
            taskObj = this.tasks.find(t => t.id === id);
            if (taskObj) { taskObj.name = name; taskObj.description = description; taskObj.assigneeId = assigneeId; taskObj.status = status; taskObj.urgency = urgency; taskObj.secrecy = secrecy; taskObj.receiveDate = receiveDate; taskObj.startDate = startDate; taskObj.deadline = deadline; taskObj.subTasks = [...this.tempSubTasks]; }
        } else {
            taskObj = { id: `task-${Date.now()}`, name, description, assigneeId, status, urgency, secrecy, receiveDate, startDate, deadline, subTasks: [...this.tempSubTasks] }; this.tasks.push(taskObj);
        }
        this.saveData(); this.closeTaskModal(); this.render();
    }

    deleteTask(taskId) { if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบภารกิจนี้?')) { this.tasks = this.tasks.filter(t => t.id !== taskId); this.saveData(); this.render(); } }

    renderDetailModalFooter(task) {
        if(!this.detailModalFooter) return; this.detailModalFooter.innerHTML = '';
        const btnEdit = document.createElement('button'); btnEdit.className = 'btn btn-primary'; btnEdit.innerHTML = 'แก้ไขภารกิจ'; btnEdit.addEventListener('click', () => { this.closeDetailModal(); this.openEditTaskModal(task.id); }); this.detailModalFooter.appendChild(btnEdit);
    }

    renderTeamProgressTable() {
        if (!this.teamProgressTableBody) return; this.teamProgressTableBody.innerHTML = '';
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
        workingStaff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id); const total = memberTasks.length; const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            let totalProgressSum = 0; memberTasks.forEach(t => { totalProgressSum += this.getTaskProgress(t); }); const percentage = total > 0 ? Math.round(totalProgressSum / total) : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><b>${member.name}</b></td><td>${total}</td><td>${memberTasks.filter(t=>t.status==='รอดำเนินการ').length}</td><td>${memberTasks.filter(t=>t.status==='กำลังทำ').length}</td><td>${memberTasks.filter(t=>t.status==='รอการอนุมัติ').length}</td><td>${done}</td><td>${percentage}%</td>`;
            this.teamProgressTableBody.appendChild(tr);
        });
    }

    renderMasterTaskListTable() {
        if (!this.masterTasksTableBody) return; this.masterTasksTableBody.innerHTML = '';
        this.tasks.forEach(task => {
            const member = this.staff.find(m => m.id === task.assigneeId) || { name: 'ไม่มีผู้รับผิดชอบ' }; const tr = document.createElement('tr'); const progress = this.getTaskProgress(task);
            tr.innerHTML = `<td><strong style="cursor:pointer; color:var(--primary);" onclick="app.viewTaskDetails('${task.id}')">${task.name} (${progress}%)</strong></td><td>${member.name}</td><td>${task.urgency}</td><td>${task.secrecy}</td><td>${task.startDate}</td><td>${task.deadline}</td><td>${task.status}</td><td><button class="btn btn-danger" onclick="app.deleteTask('${task.id}')">ลบ</button></td>`;
            this.masterTasksTableBody.appendChild(tr);
        });
    }

    renderStaffTaskListTable() {
        if (!this.staffTasksTableBody) return; this.staffTasksTableBody.innerHTML = '';
        const userTasks = this.tasks.filter(t => t.assigneeId === this.currentUser);
        userTasks.forEach(task => {
            const tr = document.createElement('tr'); const progress = this.getTaskProgress(task);
            tr.innerHTML = `<td><strong style="cursor:pointer; color:var(--primary);" onclick="app.viewTaskDetails('${task.id}')">${task.name} (${progress}%)</strong></td><td>${task.urgency}</td><td>${task.secrecy}</td><td>${task.startDate}</td><td>${task.deadline}</td><td>${task.status}</td><td><button class="btn btn-primary" onclick="app.viewTaskDetails('${task.id}')">ดู</button></td>`;
            this.staffTasksTableBody.appendChild(tr);
        });
    }

    populateKanbanColumn(container, taskList) {
        container.innerHTML = '';
        if (taskList.length === 0) { container.innerHTML = '<div style="padding:15px; color:var(--text-muted); text-align:center;">ไม่มีภารกิจ</div>'; return; }
        taskList.forEach(task => {
            const card = document.createElement('div'); card.className = 'kanban-card glass-card'; card.style = 'padding:15px; margin-bottom:10px; cursor:pointer;';
            const progress = this.getTaskProgress(task);
            card.innerHTML = `<h4>${task.name} (${progress}%)</h4><p>${task.description || ''}</p><small>ส่ง: ${task.deadline}</small>`;
            card.addEventListener('click', () => this.viewTaskDetails(task.id));
            container.appendChild(card);
        });
    }

    getRawRankWeight(name) { return 500; }
    getUrgencyBadge(urgency) { return `<span>${urgency}</span>`; }
    getSecrecyBadge(secrecy) { return `<span>${secrecy}</span>`; }
    getStatusBadge(status) { return `<span>${status}</span>`; }
    closeTaskModal() { if(this.taskModal) this.taskModal.classList.remove('show'); }
    closeDetailModal() { if(this.taskDetailModal) this.taskDetailModal.classList.remove('show'); }
    renderCharts() {
        if (this.statusChartInstance) this.statusChartInstance.destroy(); if (this.staffChartInstance) this.staffChartInstance.destroy();
        const statusChartCanvas = document.getElementById('statusChart'); if (!statusChartCanvas) return;
        this.statusChartInstance = new Chart(statusChartCanvas, { type: 'doughnut', data: { labels: ['รอดำเนินการ', 'กำลังทำ', 'เสร็จสิ้น'], datasets: [{ data: [this.tasks.filter(t=>t.status==='รอดำเนินการ').length, this.tasks.filter(t=>t.status==='กำลังทำ').length, this.tasks.filter(t=>t.status==='เสร็จสิ้น').length], backgroundColor: ['#94a3b8', '#eab308', '#10b981'] }] }, options: { responsive: true, maintainAspectRatio: false } });
    }
    renderLeaderDashboard() {
        if (this.statTotalTasks) this.statTotalTasks.textContent = this.tasks.length;
        if (this.statInProgressTasks) this.statInProgressTasks.textContent = this.tasks.filter(t => t.status === 'กำลังทำ').length;
        if (this.statCompletedTasks) this.statCompletedTasks.textContent = this.tasks.filter(t => t.status === 'เสร็จสิ้น').length;
        this.renderCharts(); this.renderTeamProgressTable();
    }
    populateRoleSwitcher() {
        if (!this.roleSelector) return; this.roleSelector.innerHTML = '';
        const groupAdmin = document.createElement('optgroup'); groupAdmin.label = 'ระดับเจ้าหน้าที่';
        this.staff.forEach(member => { const opt = document.createElement('option'); opt.value = member.id; opt.textContent = member.name; if(this.currentUser === member.id) opt.selected = true; groupAdmin.appendChild(opt); });
        this.roleSelector.appendChild(groupAdmin);
    }
    populateAssigneeDropdowns() {
        if (this.taskAssigneeInput) { this.taskAssigneeInput.innerHTML = ''; this.staff.forEach(member => { const opt = document.createElement('option'); opt.value = member.id; opt.textContent = member.name; this.taskAssigneeInput.appendChild(opt); }); }
    }
    render() { this.populateRoleSwitcher(); this.populateAssigneeDropdowns(); this.switchView(this.currentView); }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new App(); });
