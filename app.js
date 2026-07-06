/**
 * Operations Portal - Application Logic (app.js)
 * ฉบับร่างทอง (Ultimate Version): มีระบบตาข่ายนิรภัยกู้ชีพแอดมิน (ensureAdminStaff) + ระบบเชื่อมโยงหน้าสถิติ + Gantt Chart ครบ 100%
 */

class AttachmentStore {
    constructor() { this.dbName = 'OperationsPortalDB'; this.dbVersion = 1; this.storeName = 'task_attachments'; this.db = null; }
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            request.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName, { keyPath: 'taskId' }); };
        });
    }
    saveAttachment(taskId, files) {
        return new Promise((resolve, reject) => {
            if (!this.db) { reject("Database not initialized"); return; }
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const filesArray = Array.from(files).map(f => ({ fileName: f.name, fileType: f.type, fileData: f }));
            const record = { taskId: taskId, isMultiple: true, files: filesArray };
            const request = store.put(record); request.onsuccess = () => resolve(); request.onerror = (e) => reject(e);
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
        this.staff = []; this.tasks = []; this.messages = [];
        this.currentUser = 'leader'; this.currentView = 'leader-dashboard'; this.isCloudMode = false; this.tasksViewMode = 'table'; 
        this.statusChartInstance = null; this.staffChartInstance = null; this.draggedCardId = null; this.editingStaffId = null; this.chatOpen = false;

        this.initDOMElements(); this.loadData(); this.setupEventListeners(); this.startClock();
        this.attachments = new AttachmentStore();
        this.attachments.init().then(async () => { await this.syncWithCloudflare(); this.render(); if (this.isCloudMode) setInterval(() => this.syncChatOnly(), 2000); })
        .catch(async err => { await this.syncWithCloudflare(); this.render(); });
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

        this.chatWidget = document.getElementById('chatWidget'); this.chatHeader = document.getElementById('chatHeader');
        this.chatBody = document.getElementById('chatBody'); this.chatMessages = document.getElementById('chatMessages');
        this.chatForm = document.getElementById('chatForm'); this.chatInput = document.getElementById('chatInput');
        this.chatToggleIcon = document.getElementById('chatToggleIcon'); this.chatUnreadBadge = document.getElementById('chatUnreadBadge');
    }

    // 🛡️ ระบบตาข่ายนิรภัย: บังคับสร้างบัญชีหัวหน้าและแอดมินกลับคืนมาเสมอถ้าระบบหาไม่เจอ (ป้องกันแอดมินหาย)
    ensureAdminStaff() {
        if (!this.staff.find(m => m.id === 'leader')) this.staff.unshift({ id: 'leader', name: 'หัวหน้าฝ่ายยุทธการ', role: 'หัวหน้าฝ่ายยุทธการ (Leader)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=leader', isStaffAdmin: true, rankWeight: 1 });
        if (!this.staff.find(m => m.id === 'asst-g3')) this.staff.splice(1, 0, { id: 'asst-g3', name: 'ผช.หน.ฝยก.พล.ร.4', role: 'ผช.หน.ฝยก.พล.ร.4 (Asst. G3)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=asstg3', isStaffAdmin: true, rankWeight: 2 });
        if (!this.staff.find(m => m.id === 'dev-chaisith')) this.staff.push({ id: 'dev-chaisith', name: 'จ.ส.ท. ชัยสิทธิ์ ศรีอ่อนทอง', role: 'Powerpoint Wizard / DEV', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=chaisith', isStaffAdmin: true, rankWeight: 70, lineUserId: 'U093959610f37c88a31fe2911a7dd4bdd' });
    }

    loadData() {
        if (!localStorage.getItem('operations_portal_reset_v3')) { localStorage.clear(); localStorage.setItem('operations_portal_reset_v3', 'true'); }
        const storedData = localStorage.getItem('operations_portal_data');
        if (storedData) {
            try {
                const parsed = JSON.parse(storedData);
                this.staff = parsed.staff && parsed.staff.length > 0 ? parsed.staff : DEFAULT_STAFF;
                this.tasks = parsed.tasks ? parsed.tasks : DEFAULT_TASKS;
                this.messages = parsed.messages || []; 
            } catch (e) { this.staff = DEFAULT_STAFF; this.tasks = DEFAULT_TASKS; this.messages = []; }
        } else { this.staff = DEFAULT_STAFF; this.tasks = DEFAULT_TASKS; this.messages = []; }
        
        this.ensureAdminStaff(); // เรียกใช้ตาข่ายนิรภัย!
        this.saveData();
    }

    saveData() { localStorage.setItem('operations_portal_data', JSON.stringify({ staff: this.staff, tasks: this.tasks, messages: this.messages })); }

    async syncWithCloudflare() {
        this.isCloudMode = window.location.protocol.startsWith('http'); if (!this.isCloudMode) return;
        try {
            const staffRes = await fetch('/api/staff'); if (staffRes.ok) { const data = await staffRes.json(); if (data && data.length > 0) this.staff = data; }
            const tasksRes = await fetch('/api/tasks'); if (tasksRes.ok) { const data = await tasksRes.json(); if (data && data.length > 0) this.tasks = data; }
            const chatRes = await fetch('/api/chat'); if (chatRes.ok) { const data = await chatRes.json(); if (data && data.length !== this.messages.length) this.messages = data; }
            this.ensureAdminStaff(); // เรียกใช้ตาข่ายนิรภัย!
            this.saveData();
        } catch (err) {}
    }

    async syncChatOnly() {
        if (!this.isCloudMode) return;
        try {
            const chatRes = await fetch('/api/chat');
            if (chatRes.ok) {
                const data = await chatRes.json();
                if (data && data.length > this.messages.length) {
                    this.messages = data; this.saveData(); this.renderChatMessages();
                    if (this.chatOpen) this.scrollToBottomChat(); else if (this.chatUnreadBadge) { this.chatUnreadBadge.classList.remove('d-none'); this.chatUnreadBadge.textContent = '!'; }
                }
            }
        } catch (err) {}
    }

    setupEventListeners() {
        if(this.roleSelector) this.roleSelector.addEventListener('change', (e) => this.switchRole(e.target.value));
        document.querySelectorAll('.nav-link').forEach(link => { link.addEventListener('click', (e) => { e.preventDefault(); this.switchView(link.getAttribute('data-view')); if(this.sidebar) this.sidebar.classList.remove('show'); }); });
        if(this.toggleSidebarBtn) this.toggleSidebarBtn.addEventListener('click', () => this.sidebar.classList.add('show'));
        if(this.closeSidebarBtn) this.closeSidebarBtn.addEventListener('click', () => this.sidebar.classList.remove('show'));
        if(this.themeToggleBtn) { this.themeToggleBtn.addEventListener('click', () => { document.body.classList.toggle('light-theme'); const isLight = document.body.classList.contains('light-theme'); const icon = this.themeToggleBtn.querySelector('i'); if (icon) icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon'; this.renderCharts(); }); }

        if(this.btnCreateTask) this.btnCreateTask.addEventListener('click', () => this.openCreateTaskModal());
        if(this.btnCancelTaskModal) this.btnCancelTaskModal.addEventListener('click', () => this.closeTaskModal());
        if(this.taskModalCloseBtn) this.taskModalCloseBtn.addEventListener('click', () => this.closeTaskModal());
        if(this.taskDetailCloseBtn) this.taskDetailCloseBtn.addEventListener('click', () => this.closeDetailModal());
        if(this.taskForm) this.taskForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitTaskForm(); });
        if(this.addMemberForm) this.addMemberForm.addEventListener('submit', (e) => { e.preventDefault(); this.addNewMember(); });

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

        if(this.taskStatusInput) this.taskStatusInput.addEventListener('change', () => { if(this.pdfUploadRow) this.pdfUploadRow.style.display = 'grid'; });
        if(this.taskPdfInput) { this.taskPdfInput.addEventListener('change', (e) => { const files = e.target.files; if(this.pdfUploadStatus) { if (files.length === 0) this.pdfUploadStatus.textContent = 'ไม่มีไฟล์'; else if (files.length === 1) this.pdfUploadStatus.textContent = `เลือกแล้ว 1 ไฟล์`; else this.pdfUploadStatus.textContent = `เลือกแล้ว ${files.length} ไฟล์`; } }); }
        window.addEventListener('click', (e) => { if (e.target === this.taskModal) this.closeTaskModal(); if (e.target === this.taskDetailModal) this.closeDetailModal(); });

        if(this.chatHeader) { this.chatHeader.addEventListener('click', () => { if (window.innerWidth <= 768) { this.chatWidget.classList.toggle('mobile-expanded'); this.chatOpen = this.chatWidget.classList.contains('mobile-expanded'); if(this.chatOpen) { this.chatBody.classList.remove('d-none'); if (this.chatUnreadBadge) this.chatUnreadBadge.classList.add('d-none'); this.scrollToBottomChat(); } else { this.chatBody.classList.add('d-none'); } } else { this.toggleChat(); } }); }
        if(this.chatForm) { this.chatForm.addEventListener('submit', (e) => { e.preventDefault(); const text = this.chatInput.value.trim(); if(text) { this.sendMessage(text); this.chatInput.value = ''; } }); }
    }

    startClock() {
        const liveTimeEl = document.getElementById('liveTime');
        const updateTime = () => { if (liveTimeEl) liveTimeEl.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
        updateTime(); setInterval(updateTime, 1000);
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div'); toast.className = `toast toast-${type}`;
        let iconClass = type === 'warning' ? 'fa-triangle-exclamation' : (type === 'danger' ? 'fa-circle-xmark' : (type === 'info' ? 'fa-circle-info' : 'fa-circle-check'));
        toast.innerHTML = `<i class="fas ${iconClass} toast-icon"></i><span class="toast-msg">${message}</span>`;
        if (this.toastContainer) this.toastContainer.appendChild(toast);
        setTimeout(() => { toast.style.animation = 'toast-in 0.3s reverse forwards'; setTimeout(() => toast.remove(), 300); }, 3500);
    }

    switchView(viewName) {
        Object.keys(this.views).forEach(name => { if(!this.views[name]) return; if (name === viewName) { this.views[name].classList.remove('d-none'); this.views[name].classList.add('active'); } else { this.views[name].classList.remove('active'); this.views[name].classList.add('d-none'); } });
        document.querySelectorAll('.nav-link').forEach(link => { if (link.getAttribute('data-view') === viewName) link.classList.add('active'); else link.classList.remove('active'); });
        this.currentView = viewName; let thaiTitle = 'ภาพรวมยุทธการ';
        switch (viewName) { case 'leader-dashboard': thaiTitle = 'แดชบอร์ดภาพรวมยุทธการ'; break; case 'leader-tasks': thaiTitle = 'แฟ้มสะสมภารกิจฝ่ายยุทธการ'; break; case 'leader-team': thaiTitle = 'บัญชีรายชื่อกำลังพล'; break; case 'staff-kanban': thaiTitle = 'กระดานปฏิบัติการทางยุทธการ'; break; case 'staff-tasks': thaiTitle = 'รายการปฏิบัติการเดี่ยว'; break; case 'team-calendar': thaiTitle = 'ปฏิทินยุทธการส่วนกลาง'; break; }
        if (this.pageTitle) this.pageTitle.innerHTML = thaiTitle;
        if (viewName === 'leader-dashboard') this.renderLeaderDashboard(); else if (viewName === 'leader-tasks') { if (this.tasksViewMode === 'gantt') this.renderGanttChart('masterGanttChart', this.getFilteredTasks()); else this.renderMasterTaskListTable(); } else if (viewName === 'leader-team') this.renderTeamMembers(); else if (viewName === 'staff-kanban') this.renderStaffKanban(); else if (viewName === 'staff-tasks') this.renderStaffTaskListTable(); else if (viewName === 'team-calendar') this.renderOutlookSharedCalendar(); 
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
        this.renderChatMessages(); this.showToast(`เปลี่ยนบทบาทเป็น: ${this.currentUserName.textContent}`, 'info');
    }

    render() {
        this.populateRoleSwitcher(); this.populateAssigneeDropdowns(); this.renderChatMessages();
        const member = this.staff.find(m => m.id === this.currentUser);
        if(member && (member.id === 'leader' || member.id === 'asst-g3' || member.id === 'dev-chaisith' || member.isStaffAdmin)) this.switchView('leader-dashboard'); else this.switchView('staff-kanban');
    }

    // ✅ กู้คืนระบบเชื่อมโยงหน้าสถิติไปยังหน้ากรองงานแฟ้มสะสม (ที่ลืมใส่ไป)
    navigateToTasksWithFilter(statusValue) {
        if (this.filterAssignee) this.filterAssignee.value = 'all';
        if (this.filterUrgency) this.filterUrgency.value = 'all';
        if (this.filterSecrecy) this.filterSecrecy.value = 'all';
        if (this.searchTask) this.searchTask.value = '';
        if (this.filterStatus) this.filterStatus.value = statusValue;
        this.switchView('leader-tasks');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    toggleChat() {
        this.chatOpen = !this.chatOpen;
        if(this.chatOpen) { this.chatBody.classList.remove('d-none'); this.chatToggleIcon.className = 'fas fa-chevron-down'; if (this.chatUnreadBadge) this.chatUnreadBadge.classList.add('d-none'); this.scrollToBottomChat(); } 
        else { this.chatBody.classList.add('d-none'); this.chatToggleIcon.className = 'fas fa-chevron-up'; }
    }

    async sendLineAlert(task, actionText) {
        const token = "FImi+2fAsu7TjhlYnK7ohFA7MNQAWFcH+v0WI2xPS/ZykdBVeFio6t88aWKtXzus/f+KBxvY8qjOjx9aCYYiQLdcKROB0zjoiBTr5SUSQyHsxPevurZXYi7uzXVaH5db7EBKrLPEiWU1uuI7eJh5GwdB04t89/1O/w1cDnyilFU=";
        const member = this.staff.find(m => m.id === task.assigneeId); const assigneeName = member ? member.name : 'ไม่ระบุ'; const targetLineId = member ? member.lineUserId : '';
        if (!targetLineId || !targetLineId.startsWith('U')) return;
        const messageText = `🚨 [รายงานภารกิจ ฝยก.พล.ร.4]\n📌 ภารกิจ: ${task.name}\n👤 ผู้รับผิดชอบ: ${assigneeName}\n🔄 การดำเนินการ: ${actionText}\n🚦 สถานะปัจจุบัน: ${task.status}\n⏰ กำหนดส่ง: ${task.deadline}\n\nตรวจสอบรายละเอียดเพิ่มเติมผ่านระบบยุทธการ.NET ครับ 🫡`;
        const payload = { to: targetLineId, messages: [{ type: "text", text: messageText }] };
        if (this.isCloudMode) { try { await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token, payload: payload }) }); } catch (err) {} }
    }

    async sendMessage(text) {
        let senderNameStr = this.currentUserName.textContent;
        const msg = { id: Date.now().toString(), senderId: this.currentUser, senderName: senderNameStr, text: text, time: new Date().toISOString() };
        this.messages.push(msg); this.saveData(); this.renderChatMessages(); this.scrollToBottomChat();
        if (this.isCloudMode) { try { await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }); } catch (err) {} }
    }

    renderChatMessages() {
        if(!this.chatMessages) return; this.chatMessages.innerHTML = '';
        if(this.messages.length === 0) { this.chatMessages.innerHTML = '<div style="text-align:center; color: var(--text-muted); font-size: 12px; margin-top: 50px;">เริ่มทักทายทีมได้เลย!</div>'; return; }
        this.messages.forEach(msg => {
            const isSelf = msg.senderId === this.currentUser; const div = document.createElement('div'); div.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
            const timeStr = new Date(msg.time).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            div.innerHTML = `${!isSelf ? `<span class="chat-msg-sender">${msg.senderName}</span>` : ''} <div>${msg.text}</div> <div style="font-size: 9px; text-align: right; opacity: 0.6; margin-top: 3px;">${timeStr}</div>`;
            this.chatMessages.appendChild(div);
        });
    }

    scrollToBottomChat() { if(this.chatMessages) this.chatMessages.scrollTop = this.chatMessages.scrollHeight; }

    getRankWeight(name) {
        if (!name) return 500;
        if (name.startsWith('พ.ท.')) return 10; if (name.startsWith('พ.ต.')) return 20; if (name.startsWith('ร.อ.')) return 30; if (name.startsWith('ร.ท.')) return 40;
        if (name.startsWith('ร.ต.')) return 50; if (name.startsWith('จ.ส.อ.')) return 60; if (name.startsWith('จ.ส.ท.')) return 70; if (name.startsWith('จ.ส.ต.')) return 80;
        if (name.startsWith('ส.อ.')) return 90; if (name.startsWith('ส.ท.')) return 100; if (name.startsWith('ส.ต.')) return 110; return 500; 
    }

    getFilteredTasks() {
        const fAssignee = this.filterAssignee ? this.filterAssignee.value : 'all'; const fUrgency = this.filterUrgency ? this.filterUrgency.value : 'all';
        const fSecrecy = this.filterSecrecy ? this.filterSecrecy.value : 'all'; const fStatus = this.filterStatus ? this.filterStatus.value : 'all';
        const fSearch = this.searchTask ? this.searchTask.value.toLowerCase().trim() : '';
        return this.tasks.filter(task => {
            const matchAssignee = (fAssignee === 'all') || (task.assigneeId === fAssignee);
            const matchUrgency = (fUrgency === 'all') || (task.urgency === fUrgency);
            const matchSecrecy = (fSecrecy === 'all') || (task.secrecy === fSecrecy);
            let matchStatus = true;
            if (fStatus !== 'all') { if (fStatus === 'overdue') matchStatus = this.isOverdue(task); else matchStatus = (task.status === fStatus); }
            const matchSearch = !fSearch || task.name.toLowerCase().includes(fSearch) || (task.description && task.description.toLowerCase().includes(fSearch));
            return matchAssignee && matchUrgency && matchSecrecy && matchStatus && matchSearch;
        });
    }

    isOverdue(task) { if (task.status === 'เสร็จสิ้น') return false; const now = new Date(); now.setHours(0, 0, 0, 0); const deadline = new Date(task.deadline); deadline.setHours(0, 0, 0, 0); return now > deadline; }
    isDueSoon(task) { if (task.status === 'เสร็จสิ้น') return false; if (this.isOverdue(task)) return false; const now = new Date(); const deadline = new Date(task.deadline); const diffHours = (deadline - now) / (1000 * 60 * 60); return diffHours >= 0 && diffHours <= 24; }

    populateRoleSwitcher() {
        if (!this.roleSelector) return; this.roleSelector.innerHTML = '';
        const groupAdmin = document.createElement('optgroup'); groupAdmin.label = '1. ระดับฝ่ายเสธ & ผู้ดูแลระบบ (Admin)';
        const adminMembers = this.staff.filter(m => m.id === 'leader' || m.id === 'asst-g3' || m.id === 'dev-chaisith' || m.isStaffAdmin);
        adminMembers.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
        adminMembers.forEach(member => { const opt = document.createElement('option'); opt.value = member.id; opt.textContent = member.name + (member.id === 'leader' ? ' (Leader)' : (member.id === 'asst-g3' ? ' (Asst. G3)' : '')); opt.selected = (this.currentUser === member.id); groupAdmin.appendChild(opt); });
        this.roleSelector.appendChild(groupAdmin);
        const groupStaff = document.createElement('optgroup'); groupStaff.label = '2. ระดับเจ้าหน้าที่ฝ่ายยุทธการ';
        const generalStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3' && m.id !== 'dev-chaisith' && !m.isStaffAdmin);
        generalStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
        generalStaff.forEach(member => { const opt = document.createElement('option'); opt.value = member.id; opt.textContent = member.name; opt.selected = (this.currentUser === member.id); groupStaff.appendChild(opt); });
        this.roleSelector.appendChild(groupStaff);
    }

    populateAssigneeDropdowns() {
        if (this.taskAssigneeInput) {
            this.taskAssigneeInput.innerHTML = ''; const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
            workingStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
            workingStaff.forEach(member => { const opt = document.createElement('option'); opt.value = member.id; opt.textContent = `${member.name} - ${member.role}`; this.taskAssigneeInput.appendChild(opt); });
        }
        if (this.filterAssignee) {
            this.filterAssignee.innerHTML = '<option value="all">ทั้งหมด</option>'; const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
            workingStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
            workingStaff.forEach(member => { const opt = document.createElement('option'); opt.value = member.id; opt.textContent = member.name; this.filterAssignee.appendChild(opt); });
        }
    }

    renderLeaderDashboard() {
        if (this.statTotalTasks) this.statTotalTasks.textContent = this.tasks.length;
        if (this.statInProgressTasks) this.statInProgressTasks.textContent = this.tasks.filter(t => t.status === 'กำลังทำ').length;
        if (this.statReviewTasks) this.statReviewTasks.textContent = this.tasks.filter(t => t.status === 'รอการอนุมัติ').length;
        if (this.statCompletedTasks) this.statCompletedTasks.textContent = this.tasks.filter(t => t.status === 'เสร็จสิ้น').length;
        if (this.statOverdueTasks) this.statOverdueTasks.textContent = this.tasks.filter(t => this.isOverdue(t)).length;
        this.renderCharts(); this.renderTeamProgressTable();
    }

    renderTeamProgressTable() {
        const progressArea = document.getElementById('teamProgressTable'); if (!progressArea) return;
        const tableContainer = progressArea.parentElement; if (!tableContainer) return;
        tableContainer.innerHTML = `
            <div class="mobile-staff-progress-box" style="padding: 5px 0;">
                <label for="staffSelectDropdown" style="font-size: 13px; font-weight:600; margin-bottom: 8px; display:block; color:var(--text-primary);">📋 เลือกตรวจสอบความคืบหน้ากำลังพล:</label>
                <select id="staffSelectDropdown" class="form-control" style="width:100%; padding:10px; font-size:14px; border-radius:8px; margin-bottom:15px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--glass-border); font-family:'Prompt', sans-serif;"></select>
                <div id="mobileStaffProgressDisplay" class="glass-card" style="padding:15px; border-radius:10px; display:none; background:rgba(255,255,255,0.02); border:1px solid var(--glass-border);"></div>
            </div>
        `;
        const dropdown = document.getElementById('staffSelectDropdown'); const displayArea = document.getElementById('mobileStaffProgressDisplay');
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3'); workingStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
        dropdown.innerHTML = '<option value="" style="color: #64748b;">-- แตะเลือกรายชื่อเจ้าหน้าที่ --</option>';
        workingStaff.forEach(member => { dropdown.innerHTML += `<option value="${member.id}" style="color: #0f172a; background: #ffffff;">${member.name}</option>`; });
        dropdown.addEventListener('change', (e) => {
            const memberId = e.target.value; if(!memberId) { displayArea.style.display = 'none'; return; }
            const member = this.staff.find(m => m.id === memberId); const memberTasks = this.tasks.filter(t => t.assigneeId === memberId);
            const total = memberTasks.length; const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length; const prog = memberTasks.filter(t => t.status === 'กำลังทำ').length; const review = memberTasks.filter(t => t.status === 'รอการอนุมัติ').length; const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
            displayArea.style.display = 'block';
            displayArea.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;"><img src="${member.avatar}" style="width:45px; height:45px; border-radius:50%;"><div><h4 style="margin:0; font-size:15px; font-weight:700; color:var(--text-primary);">${member.name}</h4><small style="color:var(--text-muted); font-size:12px;">${member.role}</small></div></div>
                <div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:5px;"><span>ความคืบหน้าภารกิจรวม</span> <span style="color:var(--primary);">${percentage}%</span></div><div style="height:10px; background:rgba(255,255,255,0.1); border-radius:5px; overflow:hidden;"><div style="width:${percentage}%; height:100%; background:linear-gradient(90deg, var(--primary), #10b981); border-radius:5px;"></div></div></div>
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; text-align:center; font-size:11px; margin-top:12px;"><div style="background:rgba(148,163,184,0.08); padding:6px; border-radius:6px;"><b style="display:block; font-size:14px; color:var(--text-primary);">${total}</b>งานรวม</div><div style="background:rgba(234,179,8,0.08); padding:6px; border-radius:6px; color:#eab308;"><b style="display:block; font-size:14px;">${prog}</b>ทำอยู่</div><div style="background:rgba(168,85,247,0.08); padding:6px; border-radius:6px; color:#a855f7;"><b style="display:block; font-size:14px;">${review}</b>รอตรวจ</div><div style="background:rgba(16,185,129,0.08); padding:6px; border-radius:6px; color:#10b981;"><b style="display:block; font-size:14px;">${done}</b>สำเร็จ</div></div>
            `;
        });
    }

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
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3'); workingStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
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

    renderOutlookSharedCalendar() {
        const calendarViewArea = document.getElementById('viewTeamCalendar'); if (!calendarViewArea) return;
        const googleCalendarEmbedUrl = "https://calendar.google.com/calendar/embed?src=c7e59cfe55d28e41603548ef57d8d2a558e95487eb64bb81ab642b2ed0948dcf%40group.calendar.google.com&ctz=Asia%2FBangkok"; 
        calendarViewArea.innerHTML = `
            <div class="calendar-wrapper glass-card" style="padding:10px; border-radius:12px; height: calc(100vh - 110px); min-height:550px; display:flex; flex-direction:column; background:var(--card-bg); border:1px solid var(--glass-border); width:100%; box-sizing:border-box;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding:0 5px; flex-wrap: wrap; gap: 8px;">
                    <div style="font-size:14px; font-weight:600; color:var(--text-primary);"><i class="far fa-calendar-alt text-primary"></i> 📆 แผนปฏิทินยุทธการร่วม</div>
                    <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" class="btn btn-primary" style="padding:8px 12px; font-size:12px; border-radius:6px; text-decoration:none; color:#fff; flex-grow:1; text-align:center; font-weight:bold;">
                        <i class="fas fa-external-link-alt"></i> เปิด/แก้ไขแผนงานผ่านแอป
                    </a>
                </div>
                <div style="flex-grow:1; width:100%; border-radius:8px; overflow:hidden; background:#fff;">
                    <iframe src="${googleCalendarEmbedUrl}" style="border:0; width:100%; height:100%;" frameborder="0" scrolling="yes"></iframe>
                </div>
            </div>
        `;
    }

    renderMasterTaskListTable() {
        if (!this.masterTasksTableBody) return; this.masterTasksTableBody.innerHTML = '';
        const filteredTasks = this.getFilteredTasks();
        if (filteredTasks.length === 0) { this.masterTasksTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;"><i class="fas fa-box-open" style="font-size: 30px; margin-bottom: 10px; display: block;"></i>ไม่พบข้อมูลยุทธการที่ค้นหา</td></tr>`; return; }
        filteredTasks.forEach(task => {
            const member = this.staff.find(m => m.id === task.assigneeId) || { name: 'ไม่มีผู้รับผิดชอบ', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=none' };
            const tr = document.createElement('tr');
            let deadlineClass = ''; let overdueBadgeText = '';
            if (this.isOverdue(task)) { deadlineClass = 'deadline-danger'; overdueBadgeText = ' <span class="badge-overdue status-badge">เลยกำหนด</span>'; } else if (this.isDueSoon(task)) { deadlineClass = 'deadline-warning'; overdueBadgeText = ' <span class="badge-progress status-badge">ส่งใน 24 ชม.</span>'; }
            tr.innerHTML = `
                <td><strong>${task.name} ${task.hasAttachment ? '<i class="fas fa-file-pdf text-danger" title="มีไฟล์"></i>' : ''}</strong><div style="font-size: 11px; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px;">${task.description || ''}</div></td>
                <td><div class="table-user"><img src="${member.avatar}" class="avatar-xs"><span class="table-user-name">${member.name}</span></div></td>
                <td>${this.getUrgencyBadge(task.urgency)}</td><td>${this.getSecrecyBadge(task.secrecy)}</td><td>${task.receiveDate || task.startDate}</td><td class="${deadlineClass}">${task.deadline}${overdueBadgeText}</td><td>${this.getStatusBadge(task.status)}</td>
                <td><div style="display: flex; gap: 8px;"><button class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px;" onclick="app.viewTaskDetails('${task.id}')" title="ดูรายละเอียด"><i class="fas fa-eye"></i></button><button class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px; color: var(--primary);" onclick="app.openEditTaskModal('${task.id}')" title="แก้ไข"><i class="fas fa-edit"></i></button><button class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px; color: var(--color-overdue);" onclick="app.deleteTask('${task.id}')" title="ลบงาน"><i class="fas fa-trash"></i></button></div></td>
            `;
            this.masterTasksTableBody.appendChild(tr);
        });
    }

    renderGanttChart(containerId, filteredTasks) {
        const container = document.getElementById(containerId); if (!container) return;
        if (filteredTasks.length === 0) { container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fas fa-box-open" style="font-size:30px; margin-bottom:10px; display:block;"></i>ไม่พบข้อมูล</div>`; return; }
        const parseDate = (str) => { if(!str) return new Date(); const parts = str.split('-'); return new Date(parts[0], parts[1] - 1, parts[2]); };
        let minDate = null; let maxDate = null;
        filteredTasks.forEach(t => { const dStart = parseDate(t.startDate); const dEnd = parseDate(t.deadline); if (!minDate || dStart < minDate) minDate = dStart; if (!maxDate || dEnd > maxDate) maxDate = dEnd; });
        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1; const dates = [];
        for (let i = 0; i < totalDays; i++) { const d = new Date(minDate); d.setDate(d.getDate() + i); dates.push(d); }
        let html = `<div style="display: flex; flex-direction: column; gap: 4px; font-size: 13px; overflow-x: auto;">`;
        html += `<div style="display: flex; align-items: center; background: rgba(148,163,184,0.06); border-bottom: 1px solid var(--glass-border); font-weight: 600; padding: 8px 0; border-radius: 6px 6px 0 0;"><div style="width: 220px; min-width: 220px; padding-left: 12px; color: var(--text-muted); font-size: 12px;">ภารกิจ / ผู้รับผิดชอบ</div><div style="display: flex; flex-grow: 1; position: relative;">`;
        dates.forEach(d => { html += `<div style="width: 50px; min-width: 50px; text-align: center; font-size: 11px; color: var(--text-muted); border-left: 1px solid var(--glass-border);"><div>${d.getDate()}</div><div style="font-size: 8.5px; opacity: 0.6; font-weight: 500;">${d.toLocaleString('th-TH', { month: 'short' })}</div></div>`; });
        html += `</div></div>`;
        filteredTasks.forEach(task => {
            const member = this.staff.find(m => m.id === task.assigneeId) || { name: 'ไม่มีผู้รับผิดชอบ' };
            const dStart = parseDate(task.startDate); const dEnd = parseDate(task.deadline);
            const startIndex = Math.round((dStart - minDate) / (1000 * 60 * 60 * 24)); const duration = Math.round((dEnd - dStart) / (1000 * 60 * 60 * 24)) + 1;
            let barColor = 'var(--color-todo)'; if (task.status === 'กำลังทำ') barColor = 'var(--color-progress)'; if (task.status === 'รอการอนุมัติ') barColor = 'var(--color-review)'; if (task.status === 'เสร็จสิ้น') barColor = 'var(--color-done)'; if (this.isOverdue(task)) barColor = 'var(--color-overdue)';
            html += `<div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--glass-border); transition: background 0.2s;" onmouseover="this.style.background='rgba(148,163,184,0.03)'" onmouseout="this.style.background='transparent'">`;
            html += `<div style="width: 220px; min-width: 220px; padding-left: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;" onclick="app.viewTaskDetails('${task.id}')"><div style="font-weight: 600; color: var(--text-primary); font-size: 13px;">${task.name}</div><small style="color: var(--text-muted); font-size: 10.5px;"><i class="far fa-user"></i> ${member.name}</small></div>`;
            html += `<div style="display: flex; flex-grow: 1; position: relative; height: 32px; background-image: linear-gradient(to right, rgba(148,163,184,0.04) 1px, transparent 1px); background-size: 50px 100%;">`;
            html += `<div style="position: absolute; left: ${startIndex * 50}px; width: ${duration * 50}px; height: 24px; top: 4px; background: ${barColor}; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10.5px; font-weight: 700; padding: 0 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; border: 1px solid rgba(255,255,255,0.1);" title="${task.name}" onclick="app.viewTaskDetails('${task.id}')">${duration >= 2 ? task.status : '•'}</div>`;
            html += `</div></div>`;
        });
        html += `</div>`; container.innerHTML = html;
    }

    renderTeamMembers() {
        if (!this.teamGridCards) return; this.teamGridCards.innerHTML = '';
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
        workingStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
        workingStaff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id); const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length; const active = memberTasks.length - done;
            const card = document.createElement('div'); card.className = 'team-member-card glass-card';
            card.innerHTML = `
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 8px;"><button onclick="app.editMember('${member.id}')" style="background: transparent; border: none; color: #3b82f6; cursor: pointer; font-size: 14px;"><i class="fas fa-user-pen"></i></button><button onclick="app.removeMember('${member.id}')" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px;"><i class="fas fa-user-minus"></i></button></div>
                <div class="member-avatar-box" style="margin-top: 15px;"><img src="${member.avatar}" class="avatar-lg"></div><div class="member-name">${member.name}</div><div class="member-role">${member.role}</div>
                <div class="member-task-stats"><div class="member-stat"><span class="member-stat-num text-warning">${active}</span><span class="member-stat-lbl">งานค้าง</span></div><div class="member-stat" style="border-left: 1px solid var(--glass-border); padding-left: 15px;"><span class="member-stat-num text-success">${done}</span><span class="member-stat-lbl">เสร็จแล้ว</span></div></div>
            `;
            this.teamGridCards.appendChild(card);
        });
        if (this.avatarOptionsContainer) {
            this.avatarOptionsContainer.innerHTML = ''; const seeds = ['sam', 'jack', 'toby', 'leo', 'max', 'milo', 'charlie', 'buddy'];
            seeds.forEach((seed, index) => { const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`; const img = document.createElement('img'); img.src = url; img.className = 'avatar-opt' + (index === 0 ? ' selected' : ''); img.addEventListener('click', () => { document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected')); img.classList.add('selected'); if (this.selectedAvatarInput) this.selectedAvatarInput.value = url; }); this.avatarOptionsContainer.appendChild(img); });
            if (this.selectedAvatarInput) this.selectedAvatarInput.value = `https://api.dicebear.com/7.x/bottts/svg?seed=${seeds[0]}`;
        }
    }

    renderStaffKanban() {
        const member = this.staff.find(m => m.id === this.currentUser); if (!member) return;
        if (this.staffProfileAvatar) this.staffProfileAvatar.src = member.avatar; if (this.staffProfileName) this.staffProfileName.textContent = member.name; if (this.staffProfileRole) this.staffProfileRole.textContent = member.role;
        const userTasks = this.tasks.filter(t => t.assigneeId === this.currentUser);
        const todo = userTasks.filter(t => t.status === 'รอดำเนินการ'); const progress = userTasks.filter(t => t.status === 'กำลังทำ'); const review = userTasks.filter(t => t.status === 'รอการอนุมัติ'); const done = userTasks.filter(t => t.status === 'เสร็จสิ้น');
        if (this.staffStatTodo) this.staffStatTodo.textContent = todo.length; if (this.staffStatProgress) this.staffStatProgress.textContent = progress.length; if (this.staffStatReview) this.staffStatReview.textContent = review.length; if (this.staffStatDone) this.staffStatDone.textContent = done.length;
        if (this.kanbanTodo) this.populateKanbanColumn(this.kanbanTodo, todo); if (this.kanbanProgress) this.populateKanbanColumn(this.kanbanProgress, progress); if (this.kanbanReview) this.populateKanbanColumn(this.kanbanReview, review); if (this.kanbanDone) this.populateKanbanColumn(this.kanbanDone, done);
    }

    populateKanbanColumn(container, taskList) {
        container.innerHTML = '';
        if (taskList.length === 0) {
            container.innerHTML = `<div class="empty-column-placeholder" style="border: 2px dashed rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 25px; text-align: center; font-size: 12px; color: var(--text-muted); pointer-events: none;">ไม่มีภารกิจในคอลัมน์นี้</div>`;
            return;
        }

        taskList.forEach(task => {
            const card = document.createElement('div');
            let secrecyClass = 'kanban-card-normal';
            if (task.secrecy === 'ลับที่สุด') secrecyClass = 'kanban-card-top-secret';
            else if (task.secrecy === 'ลับมาก') secrecyClass = 'kanban-card-secret';
            else if (task.secrecy === 'ลับ') secrecyClass = 'kanban-card-confidential';

            card.className = `kanban-card glass-card ${secrecyClass}`; card.draggable = true; card.dataset.id = task.id;
            let deadlineClass = ''; let dateIcon = 'far fa-calendar-check';
            if (this.isOverdue(task)) { deadlineClass = 'deadline-danger'; dateIcon = 'fas fa-calendar-times'; }
            else if (this.isDueSoon(task)) { deadlineClass = 'deadline-warning'; dateIcon = 'fas fa-hourglass-half'; }

            card.innerHTML = `
                <div class="card-header-meta">${this.getUrgencyBadge(task.urgency)} ${this.getSecrecyBadge(task.secrecy)}</div>
                <h4 class="card-task-title">${task.name} ${task.hasAttachment ? '<i class="fas fa-file-pdf text-danger"></i>' : ''}</h4>
                <p class="card-task-desc">${task.description}</p>
                <div class="card-footer">
                    <div class="card-dates"><span class="card-date-item"><i class="far fa-calendar-plus"></i> เริ่ม: ${task.startDate}</span><span class="card-date-item ${deadlineClass}"><i class="${dateIcon}"></i> ส่ง: ${task.deadline}</span></div>
                    <div class="card-actions"><button class="card-btn-edit" onclick="event.stopPropagation(); app.viewTaskDetails('${task.id}')"><i class="fas fa-expand"></i></button></div>
                </div>
            `;
            card.addEventListener('dragstart', (e) => this.handleDragStart(e, task.id));
            card.addEventListener('dragend', () => this.handleDragEnd(card));
            card.addEventListener('click', () => this.viewTaskDetails(task.id));
            container.appendChild(card);
        });
    }

    handleDragStart(e, taskId) { this.draggedCardId = taskId; e.dataTransfer.setData('text/plain', taskId); setTimeout(() => { const card = document.querySelector(`.kanban-card[data-id="${taskId}"]`); if (card) card.classList.add('dragging'); }, 0); }
    handleDragEnd(card) { card.classList.remove('dragging'); this.draggedCardId = null; }
    handleDragOver(e) { e.preventDefault(); }
    handleDragEnter(e, column) { e.preventDefault(); column.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'; column.style.borderColor = 'var(--primary)'; }
    handleDragLeave(e, column) { column.style.backgroundColor = ''; column.style.borderColor = ''; }
    handleDrop(e, column) {
        e.preventDefault(); column.style.backgroundColor = ''; column.style.borderColor = '';
        const taskId = e.dataTransfer.getData('text/plain') || this.draggedCardId;
        if (!taskId) return;
        const task = this.tasks.find(t => t.id === taskId);
        const newStatus = column.getAttribute('data-status');
        if (task && task.status !== newStatus) {
            const oldStatus = task.status; task.status = newStatus;
            if (!task.history) task.history = [];
            task.history.push({ time: new Date().toISOString(), action: `ย้ายสถานะจาก "${oldStatus}" ไปยัง "${newStatus}" (Drag & Drop)`, user: this.currentUserName.textContent });
            this.sendLineAlert(task, `เปลี่ยนสถานะเป็น "${newStatus}" (ลากวางผ่าน Kanban)`);
            this.saveData(); this.renderStaffKanban();
            if (this.isCloudMode) fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) });
            this.showToast(`ย้ายภารกิจไปยัง "${newStatus}" เรียบร้อย`);
        }
    }

    renderStaffTaskListTable() {
        if (!this.staffTasksTableBody) return;
        this.staffTasksTableBody.innerHTML = '';
        if (this.staffTaskListTitle) this.staffTaskListTitle.innerHTML = `<i class="fas fa-folder-open"></i> รายการยุทธการทั้งหมดของ: ${this.currentUserName.textContent}`;
        const userTasks = this.tasks.filter(t => t.assigneeId === this.currentUser);
        if (userTasks.length === 0) {
            this.staffTasksTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;"><i class="fas fa-box-open" style="font-size: 30px;"></i> ไม่มีภารกิจ</td></tr>`;
            return;
        }
        userTasks.forEach(task => {
            const tr = document.createElement('tr');
            let deadlineClass = ''; let overdueText = '';
            if (this.isOverdue(task)) { deadlineClass = 'deadline-danger'; overdueText = ' <span class="badge-overdue status-badge">เลยกำหนด</span>'; }
            else if (this.isDueSoon(task)) { deadlineClass = 'deadline-warning'; overdueText = ' <span class="badge-progress status-badge">ด่วน (24ชม)</span>'; }
            
            tr.innerHTML = `
                <td><strong>${task.name} ${task.hasAttachment ? '<i class="fas fa-file-pdf text-danger"></i>' : ''}</strong><div style="font-size: 11px; color: var(--text-muted); max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px;">${task.description}</div></td>
                <td>${this.getUrgencyBadge(task.urgency)}</td><td>${this.getSecrecyBadge(task.secrecy)}</td><td>${task.receiveDate || task.startDate}</td>
                <td class="${deadlineClass}">${task.deadline}${overdueText}</td><td>${this.getStatusBadge(task.status)}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 11px;" onclick="app.viewTaskDetails('${task.id}')" title="ดูรายละเอียด"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 11px; color: var(--primary);" onclick="app.openEditTaskModal('${task.id}')" title="แก้ไขงาน"><i class="fas fa-edit"></i></button>
                    </div>
                </td>
            `;
            this.staffTasksTableBody.appendChild(tr);
        });
    }

    openCreateTaskModal() {
        if (!this.taskModal) return;
        this.taskForm.reset(); 
        this.taskModalTitle.innerHTML = '<i class="fas fa-circle-plus"></i> มอบหมายภารกิจยุทธการใหม่'; 
        this.taskIdField.value = '';
        const today = new Date().toISOString().split('T')[0]; 
        this.taskReceiveDateInput.value = today; this.taskStartDateInput.value = today; this.taskDeadlineInput.value = today;
        const isAdmin = (this.currentUser === 'leader' || this.currentUser === 'asst-g3' || this.currentUser === 'dev-chaisith');
        if (isAdmin) {
            this.taskAssigneeInput.value = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3')[0]?.id || '';
            this.taskAssigneeInput.disabled = false;
        } else {
            this.taskAssigneeInput.value = this.currentUser;
            this.taskAssigneeInput.disabled = true; 
        }
        this.taskStatusInput.value = 'รอดำเนินการ'; this.taskStatusInput.disabled = false;
        if(this.pdfUploadRow) this.pdfUploadRow.style.display = 'grid'; 
        if(this.taskPdfInput) this.taskPdfInput.value = ''; 
        if(this.pdfUploadStatus) this.pdfUploadStatus.textContent = 'ไม่มีไฟล์ที่แนบไว้';
        this.taskModal.classList.add('show');
    }

    openEditTaskModal(taskId) {
        if (!this.taskModal) return;
        const task = this.tasks.find(t => t.id === taskId); if (!task) return;
        this.taskModalTitle.innerHTML = '<i class="fas fa-edit"></i> แก้ไขข้อมูลยุทธการ'; this.taskIdField.value = task.id;
        this.taskNameInput.value = task.name; this.taskDescriptionInput.value = task.description; this.taskAssigneeInput.value = task.assigneeId;
        this.taskStatusInput.value = task.status; this.taskUrgencyInput.value = task.urgency; this.taskSecrecyInput.value = task.secrecy;
        this.taskReceiveDateInput.value = task.receiveDate || task.startDate; this.taskStartDateInput.value = task.startDate; this.taskDeadlineInput.value = task.deadline;
        
        const isAdmin = (this.currentUser === 'leader' || this.currentUser === 'asst-g3' || this.currentUser === 'dev-chaisith');
        this.taskAssigneeInput.disabled = !isAdmin; 
        this.taskStatusInput.disabled = false;
        if(this.pdfUploadRow) this.pdfUploadRow.style.display = 'grid'; 
        
        let fNames = '';
        if(task.hasAttachment && task.attachmentName) {
            try { const arr = JSON.parse(task.attachmentName); fNames = Array.isArray(arr) ? arr.join(', ') : task.attachmentName; } catch(e) { fNames = task.attachmentName; }
            if(this.pdfUploadStatus) this.pdfUploadStatus.textContent = `ไฟล์แนบปัจจุบัน: ${fNames}`; 
        } else {
            if(this.pdfUploadStatus) this.pdfUploadStatus.textContent = 'ยังไม่มีไฟล์แนบ';
        }
        if(this.taskPdfInput) this.taskPdfInput.value = ''; 
        this.taskModal.classList.add('show');
    }

    async submitTaskForm() {
        const id = this.taskIdField.value; const name = this.taskNameInput.value.trim(); const description = this.taskDescriptionInput.value.trim();
        const assigneeId = this.taskAssigneeInput.value; const status = this.taskStatusInput.value; const urgency = this.taskUrgencyInput.value;
        const secrecy = this.taskSecrecyInput.value; const receiveDate = this.taskReceiveDateInput.value; const startDate = this.taskStartDateInput.value; const deadline = this.taskDeadlineInput.value;
        
        if (new Date(startDate) < new Date(receiveDate)) { alert('ข้อผิดพลาด: วันที่เริ่มปฏิบัติงาน ต้องไม่ก่อนวันที่เอกสารเข้า'); return; }
        if (new Date(deadline) < new Date(startDate)) { alert('ข้อผิดพลาด: วันกำหนดส่ง ต้องไม่ก่อนวันเริ่มต้นปฏิบัติงาน'); return; }
        
        const now = new Date(); const logUser = this.currentUserName.textContent;
        let finalTaskId = id; let taskObj = null; let lineAlertMessage = '';

        if (id) {
            taskObj = this.tasks.find(t => t.id === id);
            if (taskObj) {
                const changes = [];
                if (taskObj.name !== name) changes.push(`หัวข้อ`);
                if (taskObj.assigneeId !== assigneeId) changes.push(`ผู้รับผิดชอบ`);
                if (taskObj.status !== status) changes.push(`สถานะ`);
                taskObj.name = name; taskObj.description = description; taskObj.assigneeId = assigneeId; taskObj.status = status; taskObj.urgency = urgency; taskObj.secrecy = secrecy; taskObj.receiveDate = receiveDate; taskObj.startDate = startDate; taskObj.deadline = deadline;
                if (!taskObj.history) taskObj.history = [];
                if (changes.length > 0) {
                    taskObj.history.push({ time: now.toISOString(), action: `แก้ไข: ${changes.join(', ')}`, user: logUser });
                    lineAlertMessage = `อัปเดตข้อมูล: ${changes.join(', ')}`;
                }
            }
        } else {
            finalTaskId = `task-${Date.now()}`;
            taskObj = { id: finalTaskId, name, description, assigneeId, status, urgency, secrecy, receiveDate, startDate, deadline, history: [{ time: now.toISOString(), action: `มอบหมายภารกิจเริ่มต้น`, user: logUser }] };
            this.tasks.push(taskObj);
            lineAlertMessage = 'มอบหมายภารกิจชิ้นใหม่ให้ท่าน';
        }

        if (taskObj && this.taskPdfInput && this.taskPdfInput.files.length > 0) {
            const files = this.taskPdfInput.files; const fileNamesArray = Array.from(files).map(f => f.name);
            this.btnSubmitTaskModal.disabled = true; this.btnSubmitTaskModal.innerHTML = '<i class="fas fa-spinner fa-spin"></i> อัปโหลดไฟล์...';

            if (this.isCloudMode) {
                try {
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const base64Data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(file); });
                        const kvKey = files.length === 1 ? finalTaskId : `${finalTaskId}_${i}`;
                        const pdfRes = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: kvKey, fileName: file.name, fileType: file.type, fileData: base64Data }) });
                        if (!pdfRes.ok) throw new Error("Cloud upload fail");
                    }
                    taskObj.hasAttachment = true; taskObj.attachmentName = JSON.stringify(fileNamesArray); 
                    if (!taskObj.history) taskObj.history = []; taskObj.history.push({ time: now.toISOString(), action: `แนบเอกสาร ${files.length} ฉบับ`, user: logUser }); 
                    lineAlertMessage += ` (แนบเอกสาร ${files.length} ฉบับ)`;
                } catch (err) { this.showToast('อัปโหลดไฟล์ไปคลาวด์ล้มเหลว', 'danger'); }
            } else {
                try { 
                    await this.attachments.saveAttachment(finalTaskId, files); 
                    taskObj.hasAttachment = true; taskObj.attachmentName = JSON.stringify(fileNamesArray); 
                    if (!taskObj.history) taskObj.history = []; taskObj.history.push({ time: now.toISOString(), action: `แนบเอกสาร ${files.length} ฉบับ`, user: logUser }); 
                } catch (err) {}
            }
            this.btnSubmitTaskModal.disabled = false; this.btnSubmitTaskModal.innerHTML = 'บันทึกภารกิจ';
        }

        if (lineAlertMessage !== '') this.sendLineAlert(taskObj, lineAlertMessage);
        this.saveData(); this.closeTaskModal();
        if (this.isCloudMode) { try { await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskObj) }); } catch (err) {} }
        this.switchView(this.currentView); this.showToast(id ? 'อัปเดตข้อมูลสำเร็จ' : 'มอบหมายงานสำเร็จ');
    }

    deleteTask(taskId) {
        if (confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกและลบภารกิจนี้?')) {
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            this.attachments.deleteAttachment(taskId).catch(e => e);
            this.saveData();
            if (this.isCloudMode) fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' }).catch(e => e);
            this.switchView(this.currentView); this.showToast('ลบภารกิจเรียบร้อย', 'danger');
        }
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

        if (this.detailOverdueBox) {
            if (this.isOverdue(task)) { this.detailOverdueBox.innerHTML = '<i class="fas fa-triangle-exclamation"></i> ภารกิจนี้เลยกำหนดส่งความมั่นคง!'; this.detailOverdueBox.classList.remove('d-none'); }
            else if (this.isDueSoon(task)) { this.detailOverdueBox.innerHTML = '<i class="fas fa-hourglass-half text-warning"></i> ภารกิจกำลังเข้าใกล้กำหนดส่งพิจารณา'; this.detailOverdueBox.classList.remove('d-none'); this.detailOverdueBox.className = 'meta-item text-warning'; }
            else { this.detailOverdueBox.classList.add('d-none'); }
        }

        this.renderDetailModalFooter(task);

        if (task.hasAttachment && this.detailPdfItem && this.pdfButtonsContainer) {
            this.detailPdfItem.classList.remove('d-none');
            this.pdfButtonsContainer.innerHTML = ''; 
            let fileNamesList = [];
            try { fileNamesList = JSON.parse(task.attachmentName); if (!Array.isArray(fileNamesList)) fileNamesList = [task.attachmentName]; } 
            catch (e) { fileNamesList = [task.attachmentName]; }

            fileNamesList.forEach((fName, index) => {
                const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-secondary';
                btn.style = 'padding: 6px 10px; font-size: 11px; font-weight: 600; text-align: left; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 5px;';
                btn.innerHTML = `<i class="fas fa-file-pdf text-danger"></i> ${fName}`;
                btn.addEventListener('click', async () => {
                    if (this.isCloudMode) {
                        const kvKey = fileNamesList.length === 1 ? task.id : `${task.id}_${index}`;
                        window.open(`/api/pdf?taskId=${kvKey}`, '_blank');
                    } else {
                        btn.disabled = true; const originalHtml = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ดึงไฟล์...';
                        try {
                            const record = await this.attachments.getAttachment(task.id);
                            if (record) {
                                let fileDataToOpen = null;
                                if (record.isMultiple && record.files && record.files[index]) fileDataToOpen = record.files[index].fileData;
                                else if (record.fileData) fileDataToOpen = record.fileData;
                                if (fileDataToOpen) window.open(URL.createObjectURL(fileDataToOpen), '_blank');
                                else alert('ไม่พบข้อมูลไฟล์แนบนี้');
                            } else { alert('ไม่พบไฟล์แนบในฐานข้อมูล'); }
                        } catch (err) {} finally { btn.disabled = false; btn.innerHTML = originalHtml; }
                    }
                });
                this.pdfButtonsContainer.appendChild(btn);
            });
        } else { if(this.detailPdfItem) this.detailPdfItem.classList.add('d-none'); }

        const historyLogContainer = document.getElementById('detailHistoryLog');
        if (historyLogContainer) {
            historyLogContainer.innerHTML = '';
            if (task.history && task.history.length > 0) {
                const sortedHistory = [...task.history].sort((a, b) => new Date(b.time) - new Date(a.time));
                sortedHistory.forEach(log => {
                    const timeStr = new Date(log.time).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
                    historyLogContainer.innerHTML += `<div style="display: flex; gap: 10px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 5px;"><div style="min-width: 110px; font-weight: 600; color: var(--primary);"><i class="far fa-clock"></i> ${timeStr}</div><div><span style="color: var(--text-primary);">${log.user}</span>: ${log.action}</div></div>`;
                });
            } else { historyLogContainer.innerHTML = '<i>ยังไม่มีประวัติการดำเนินการ</i>'; }
        }

        if(this.taskDetailModal) this.taskDetailModal.classList.add('show');
    }

    renderDetailModalFooter(task) {
        if(!this.detailModalFooter) return;
        this.detailModalFooter.innerHTML = '';
        if (this.currentUser === 'leader' || this.currentUser === 'asst-g3' || this.currentUser === 'dev-chaisith' || task.assigneeId === this.currentUser) {
            if (task.status === 'รอการอนุมัติ' && (this.currentUser === 'leader' || this.currentUser === 'asst-g3' || this.currentUser === 'dev-chaisith')) {
                const btnReject = document.createElement('button'); btnReject.className = 'btn btn-secondary'; btnReject.innerHTML = '<i class="fas fa-rotate-left"></i> ส่งกลับปรับปรุง';
                btnReject.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'กำลังทำ', 'ส่งคืนแผนงานแก้ไข')); this.detailModalFooter.appendChild(btnReject);
                const btnApprove = document.createElement('button'); btnApprove.className = 'btn btn-success'; btnApprove.innerHTML = '<i class="fas fa-signature"></i> ลงนามอนุมัติ';
                btnApprove.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'เสร็จสิ้น', 'ลงนามอนุมัติ')); this.detailModalFooter.appendChild(btnApprove);
            } else {
                const btnEdit = document.createElement('button'); btnEdit.className = 'btn btn-primary'; btnEdit.innerHTML = '<i class="fas fa-edit"></i> แก้ไขภารกิจ';
                btnEdit.addEventListener('click', () => { this.closeDetailModal(); this.openEditTaskModal(task.id); }); this.detailModalFooter.appendChild(btnEdit);
                const btnDelete = document.createElement('button'); btnDelete.className = 'btn btn-danger'; btnDelete.innerHTML = '<i class="fas fa-trash"></i> ลบภารกิจ';
                btnDelete.addEventListener('click', () => { this.closeDetailModal(); this.deleteTask(task.id); }); this.detailModalFooter.appendChild(btnDelete);
            }
        } else {
            if (task.status === 'รอดำเนินการ') {
                const btnStart = document.createElement('button'); btnStart.className = 'btn btn-primary'; btnStart.innerHTML = '<i class="fas fa-play"></i> เริ่มปฏิบัติงาน';
                btnStart.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'กำลังทำ', 'เริ่มลงมือปฏิบัติการ')); this.detailModalFooter.appendChild(btnStart);
            } else if (task.status === 'กำลังทำ') {
                const btnReview = document.createElement('button'); btnReview.className = 'btn btn-success'; btnReview.innerHTML = '<i class="fas fa-paper-plane"></i> ส่งรายงาน';
                btnReview.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'รอการอนุมัติ', 'ยื่นเสนอขออนุมัติ')); this.detailModalFooter.appendChild(btnReview);
            } else if (task.status === 'รอการอนุมัติ') {
                const label = document.createElement('span'); label.style.color = 'var(--text-muted)'; label.innerHTML = '<i class="fas fa-hourglass-half"></i> รอหัวหน้าอนุมัติ...'; this.detailModalFooter.appendChild(label);
            } else if (task.status === 'เสร็จสิ้น') {
                const label = document.createElement('span'); label.style.color = 'var(--color-done)'; label.innerHTML = '<i class="fas fa-circle-check"></i> ภารกิจสำเร็จ'; this.detailModalFooter.appendChild(label);
            }
        }
    }

    updateTaskStatusAndHistory(taskId, newStatus, actionDescription) {
        const task = this.tasks.find(t => t.id === taskId); if (!task) return;
        const oldStatus = task.status; task.status = newStatus;
        const now = new Date(); const logUser = this.currentUserName.textContent;
        if (!task.history) task.history = [];
        task.history.push({ time: now.toISOString(), action: `${actionDescription} ("${oldStatus}" -> "${newStatus}")`, user: logUser });
        this.sendLineAlert(task, `สถานะเปลี่ยนเป็น "${newStatus}"`);
        this.saveData(); this.closeDetailModal();
        if (this.isCloudMode) { fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) }).catch(err => err); }
        this.switchView(this.currentView); this.showToast(`บันทึกสถานะ: ${newStatus}`);
    }

    addNewMember() {
        const name = this.memberNameInput.value.trim(); const role = this.memberRoleInput.value.trim(); const avatar = this.selectedAvatarInput.value;
        if (!name || !role) return;
        let memberData;
        if (this.editingStaffId) {
            const index = this.staff.findIndex(m => m.id === this.editingStaffId);
            if (index !== -1) { this.staff[index].name = name; this.staff[index].role = role; this.staff[index].avatar = avatar; memberData = this.staff[index]; }
        } else {
            memberData = { id: `staff-${Date.now()}`, name, role, avatar, lineUserId: '' };
            this.staff.push(memberData);
        }
        this.saveData();
        if (this.isCloudMode && memberData) fetch('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberData) }).catch(err => err);
        const isEdit = !!this.editingStaffId; this.resetMemberForm(); this.populateRoleSwitcher(); this.populateAssigneeDropdowns(); this.renderTeamMembers();
        this.showToast(isEdit ? `แก้ไขข้อมูล "${name}" สำเร็จ` : `เพิ่มกำลังพล "${name}" สำเร็จ`);
    }

    removeMember(memberId) {
        const member = this.staff.find(m => m.id === memberId); if (!member) return;
        const activeTasks = this.tasks.filter(t => t.assigneeId === memberId && t.status !== 'เสร็จสิ้น');
        if (activeTasks.length > 0) { alert(`ไม่สามารถลบได้! "${member.name}" มีภารกิจค้างอยู่ ${activeTasks.length} รายการ`); return; }
        if (confirm(`ต้องการลบกำลังพล "${member.name}" ใช่หรือไม่?`)) {
            this.tasks.forEach(t => { if (t.assigneeId === memberId) t.assigneeId = 'deleted'; });
            this.staff = this.staff.filter(m => m.id !== memberId);
            if (this.isCloudMode) fetch(`/api/staff?id=${memberId}`, { method: 'DELETE' });
            if (this.currentUser === memberId) this.switchRole('leader');
            else { this.saveData(); this.populateRoleSwitcher(); this.populateAssigneeDropdowns(); this.renderTeamMembers(); }
            this.showToast(`ลบกำลังพลสำเร็จ`, 'warning');
        }
    }
    
    editMember(memberId) {
        const member = this.staff.find(m => m.id === memberId); if (!member) return;
        this.editingStaffId = memberId; this.memberNameInput.value = member.name; this.memberRoleInput.value = member.role; this.selectedAvatarInput.value = member.avatar;
        document.querySelectorAll('.avatar-opt').forEach(el => { if (el.src === member.avatar) el.classList.add('selected'); else el.classList.remove('selected'); });
        const formTitle = this.addMemberForm.parentElement.querySelector('.card-title');
        if (formTitle) formTitle.innerHTML = '<i class="fas fa-user-pen"></i> แก้ไขข้อมูลเจ้าหน้าที่';
        const submitBtn = this.addMemberForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
        let cancelBtn = document.getElementById('cancelEditBtn');
        if (!cancelBtn) {
            cancelBtn = document.createElement('button'); cancelBtn.id = 'cancelEditBtn'; cancelBtn.type = 'button'; cancelBtn.className = 'btn btn-secondary btn-block'; cancelBtn.style.marginTop = '10px'; cancelBtn.innerHTML = '<i class="fas fa-times"></i> ยกเลิกการแก้ไข';
            cancelBtn.onclick = () => this.resetMemberForm(); this.addMemberForm.appendChild(cancelBtn);
        }
        cancelBtn.style.display = 'block'; this.addMemberForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    resetMemberForm() {
        this.editingStaffId = null; this.memberNameInput.value = ''; this.memberRoleInput.value = '';
        const firstAvatar = document.querySelector('.avatar-opt');
        if (firstAvatar) { document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected')); firstAvatar.classList.add('selected'); this.selectedAvatarInput.value = firstAvatar.src; }
        const formTitle = this.addMemberForm.parentElement.querySelector('.card-title');
        if (formTitle) formTitle.innerHTML = '<i class="fas fa-user-plus"></i> เพิ่มเจ้าหน้าที่ยุทธการใหม่';
        const submitBtn = this.addMemberForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-plus"></i> เพิ่มเจ้าหน้าที่';
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    getUrgencyBadge(urgency) {
        let badgeClass = 'urgency-normal'; let icon = 'fa-info-circle';
        if (urgency === 'ด่วน') { badgeClass = 'urgency-urgent'; icon = 'fa-triangle-exclamation'; }
        if (urgency === 'ด่วนมาก') { badgeClass = 'urgency-v-urgent'; icon = 'fa-triangle-exclamation'; }
        if (urgency === 'ด่วนที่สุด') { badgeClass = 'urgency-most-urgent'; icon = 'fa-triangle-exclamation'; }
        return `<span class="urgency-badge ${badgeClass}"><i class="fas ${icon}"></i> ${urgency}</span>`;
    }

    getSecrecyBadge(secrecy) {
        let badgeClass = 'secrecy-normal'; let icon = 'fa-lock-open';
        if (secrecy === 'ลับ') { badgeClass = 'secrecy-confidential'; icon = 'fa-key'; } 
        if (secrecy === 'ลับมาก') { badgeClass = 'secrecy-secret'; icon = 'fa-lock'; } 
        if (secrecy === 'ลับที่สุด') { badgeClass = 'secrecy-top-secret'; icon = 'fa-shield-halved'; }
        return `<span class="secrecy-badge ${badgeClass}"><i class="fas ${icon}"></i> ${secrecy}</span>`;
    }

    getStatusBadge(status) {
        let badgeClass = 'badge-todo'; if (status === 'กำลังทำ') badgeClass = 'badge-progress'; if (status === 'รอการอนุมัติ') badgeClass = 'badge-review'; if (status === 'เสร็จสิ้น') badgeClass = 'badge-done';
        return `<span class="status-badge ${badgeClass}">${status}</span>`;
    }

    closeTaskModal() { if(this.taskModal) this.taskModal.classList.remove('show'); }
    closeDetailModal() { if(this.taskDetailModal) this.taskDetailModal.classList.remove('show'); }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new App(); });
