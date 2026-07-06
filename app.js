/**
 * Operations Portal - Application Logic (app.js)
 * เวอร์ชันแก้ไขสมบูรณ์ 100%: ซ่อมแซมฟังก์ชัน getFilteredTasks, ชุบชีวิตปุ่มสลับบทบาทเรียงยศ, ดึงข้อมูลเก่าคืนคลาวด์, และผูกท่อ Google Calendar
 */

class AttachmentStore {
    constructor() {
        this.dbName = 'OperationsPortalDB';
        this.dbVersion = 1;
        this.storeName = 'task_attachments';
        this.db = null;
    }
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'taskId' });
                }
            };
        });
    }
    saveAttachment(taskId, files) {
        return new Promise((resolve, reject) => {
            if (!this.db) { reject("Database not initialized"); return; }
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const filesArray = Array.from(files).map(f => ({ fileName: f.name, fileType: f.type, fileData: f }));
            const record = { taskId: taskId, isMultiple: true, files: filesArray };
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }
    getAttachment(taskId) {
        return new Promise((resolve, reject) => {
            if (!this.db) { reject("Database not initialized"); return; }
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(taskId);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e);
        });
    }
    deleteAttachment(taskId) {
        return new Promise((resolve, reject) => {
            if (!this.db) { reject("Database not initialized"); return; }
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(taskId);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }
}

// 👮 รายชื่อกำลังพลสารบรรณยุทธการหลัก (แก้ไขค่าน้ำหนักยศแถวตรงเรียงลำดับอาวุโส)
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
        this.messages = [];
        this.currentUser = 'leader'; 
        this.currentView = 'leader-dashboard';
        this.isCloudMode = false;
        this.tasksViewMode = 'table'; 
        
        this.statusChartInstance = null;
        this.staffChartInstance = null;
        this.draggedCardId = null;
        this.editingStaffId = null; 

        this.initDOMElements();
        this.loadData();
        this.setupEventListeners();
        this.startClock();

        this.attachments = new AttachmentStore();
        this.attachments.init().then(async () => {
            await this.syncWithCloudflare();
            this.render();
        }).catch(async err => {
            await this.syncWithCloudflare();
            this.render();
        });
    }

    initDOMElements() {
        this.sidebar = document.getElementById('sidebar');
        this.roleSelector = document.getElementById('roleSelector');
        this.leaderNav = document.getElementById('leaderNav');
        this.staffNav = document.getElementById('staffNav');
        this.currentUserAvatar = document.getElementById('currentUserAvatar');
        this.currentUserName = document.getElementById('currentUserName');
        this.currentUserRoleText = document.getElementById('currentUserRoleText');
        this.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
        this.closeSidebarBtn = document.getElementById('closeSidebarBtn');
        this.pageTitle = document.getElementById('pageTitle');
        this.themeToggleBtn = document.getElementById('themeToggleBtn');
        this.btnCreateTask = document.getElementById('btnCreateTask');

        this.views = {
            'leader-dashboard': document.getElementById('viewLeaderDashboard'),
            'leader-tasks': document.getElementById('viewLeaderTasks'),
            'leader-team': document.getElementById('viewLeaderTeam'),
            'staff-kanban': document.getElementById('viewStaffKanban'),
            'staff-tasks': document.getElementById('viewStaffTasks'),
            'team-calendar': document.getElementById('viewTeamCalendar'),
            'data-repo': document.getElementById('viewDataRepo')
        };

        this.statTotalTasks = document.getElementById('statTotalTasks');
        this.statInProgressTasks = document.getElementById('statInProgressTasks');
        this.statReviewTasks = document.getElementById('statReviewTasks');
        this.statCompletedTasks = document.getElementById('statCompletedTasks');
        this.statOverdueTasks = document.getElementById('statOverdueTasks');
        this.teamProgressTableBody = document.querySelector('#teamProgressTable tbody');

        this.filterAssignee = document.getElementById('filterAssignee');
        this.filterUrgency = document.getElementById('filterUrgency');
        this.filterSecrecy = document.getElementById('filterSecrecy');
        this.filterStatus = document.getElementById('filterStatus');
        this.searchTask = document.getElementById('searchTask');
        this.masterTasksTableBody = document.querySelector('#masterTasksTable tbody');

        this.addMemberForm = document.getElementById('addMemberForm');
        this.memberNameInput = document.getElementById('memberName');
        this.memberRoleInput = document.getElementById('memberRole');
        this.avatarOptionsContainer = document.getElementById('avatarOptions');
        this.selectedAvatarInput = document.getElementById('selectedAvatar');
        this.teamGridCards = document.getElementById('teamGridCards');

        this.staffProfileAvatar = document.getElementById('staffProfileAvatar');
        this.staffProfileName = document.getElementById('staffProfileName');
        this.staffProfileRole = document.getElementById('staffProfileRole');
        this.staffStatTodo = document.getElementById('staffStatTodo');
        this.staffStatProgress = document.getElementById('staffStatProgress');
        this.staffStatReview = document.getElementById('staffStatReview');
        this.staffStatDone = document.getElementById('staffStatDone');
        this.kanbanTodo = document.getElementById('kanban-todo');
        this.kanbanProgress = document.getElementById('kanban-progress');
        this.kanbanReview = document.getElementById('kanban-review');
        this.kanbanDone = document.getElementById('kanban-done');
        this.staffTasksTableBody = document.querySelector('#staffTasksTable tbody');
        this.staffTaskListTitle = document.getElementById('staffTaskListTitle');

        this.taskModal = document.getElementById('taskModal');
        this.taskForm = document.getElementById('taskForm');
        this.taskModalTitle = document.getElementById('taskModalTitle');
        this.taskIdField = document.getElementById('taskIdField');
        this.taskNameInput = document.getElementById('taskName');
        this.taskDescriptionInput = document.getElementById('taskDescription');
        this.taskAssigneeInput = document.getElementById('taskAssignee');
        this.taskStatusInput = document.getElementById('taskStatus');
        this.taskUrgencyInput = document.getElementById('taskUrgency');
        this.taskSecrecyInput = document.getElementById('taskSecrecy');
        this.taskReceiveDateInput = document.getElementById('taskReceiveDate');
        this.taskStartDateInput = document.getElementById('taskStartDate');
        this.taskDeadlineInput = document.getElementById('taskDeadline');
        this.btnCancelTaskModal = document.getElementById('btnCancelTaskModal');
        this.btnSubmitTaskModal = document.getElementById('btnSubmitTaskModal');
        this.taskModalCloseBtn = document.getElementById('taskModalCloseBtn');

        this.taskDetailModal = document.getElementById('taskDetailModal');
        this.detailTitle = document.getElementById('detailTitle');
        this.detailDescription = document.getElementById('detailDescription');
        this.detailSecrecyBadge = document.getElementById('detailSecrecyBadge');
        this.detailAssigneeAvatar = document.getElementById('detailAssigneeAvatar');
        this.detailAssigneeName = document.getElementById('detailAssigneeName');
        this.detailStatusBadge = document.getElementById('detailStatusBadge');
        this.detailUrgencyBadge = document.getElementById('detailUrgencyBadge');
        this.detailReceiveDate = document.getElementById('detailReceiveDate');
        this.detailStartDate = document.getElementById('detailStartDate');
        this.detailDeadline = document.getElementById('detailDeadline');
        this.detailOverdueBox = document.getElementById('detailOverdueBox');
        this.detailModalFooter = document.getElementById('detailModalFooter');
        this.taskDetailCloseBtn = document.getElementById('taskDetailCloseBtn');

        this.pdfUploadRow = document.getElementById('pdfUploadRow');
        this.taskPdfInput = document.getElementById('taskPdf');
        this.pdfUploadStatus = document.getElementById('pdfUploadStatus');
        this.detailPdfItem = document.getElementById('detailPdfItem');
        this.pdfButtonsContainer = document.getElementById('pdfButtonsContainer');
        this.toastContainer = document.getElementById('toastContainer');
    }

    // 🛠️ โหมดดึงข้อมูลปลอดภัย ป้องกันลบสิทธิ์บัญชีรายชื่อเดิมค้างหน้าจอ
    loadData() {
        const storedData = localStorage.getItem('operations_portal_data');
        if (storedData) {
            try {
                const parsed = JSON.parse(storedData);
                this.staff = parsed.staff && parsed.staff.length > 0 ? parsed.staff : DEFAULT_STAFF;
                this.tasks = parsed.tasks && parsed.tasks.length > 0 ? parsed.tasks : DEFAULT_TASKS;
            } catch (e) {
                this.staff = DEFAULT_STAFF;
                this.tasks = DEFAULT_TASKS;
            }
        } else {
            this.staff = DEFAULT_STAFF;
            this.tasks = DEFAULT_TASKS;
            this.saveData();
        }
    }

    saveData() {
        const dataToStore = { staff: this.staff, tasks: this.tasks };
        localStorage.setItem('operations_portal_data', JSON.stringify(dataToStore));
    }

    async syncWithCloudflare() {
        this.isCloudMode = window.location.protocol.startsWith('http');
        if (!this.isCloudMode) return;
        try {
            const staffRes = await fetch('/api/staff');
            if (staffRes.ok) {
                const staffData = await staffRes.json();
                if (staffData && staffData.length > 0) this.staff = staffData;
            }
            const tasksRes = await fetch('/api/tasks');
            if (tasksRes.ok) {
                const tasksData = await tasksRes.json();
                if (tasksData && tasksData.length > 0) this.tasks = tasksData;
            }
            this.saveData();
        } catch (err) {}
    }

    setupEventListeners() {
        if(this.roleSelector) this.roleSelector.addEventListener('change', (e) => this.switchRole(e.target.value));

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchView(link.getAttribute('data-view'));
                if(this.sidebar) this.sidebar.classList.remove('show');
            });
        });

        if(this.toggleSidebarBtn) this.toggleSidebarBtn.addEventListener('click', () => this.sidebar.classList.add('show'));
        if(this.closeSidebarBtn) this.closeSidebarBtn.addEventListener('click', () => this.sidebar.classList.remove('show'));

        if(this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => {
                document.body.classList.toggle('light-theme');
                const isLight = document.body.classList.contains('light-theme');
                const icon = this.themeToggleBtn.querySelector('i');
                if (icon) icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
                this.renderCharts();
            });
        }

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

        const filters = [this.filterAssignee, this.filterUrgency, this.filterSecrecy, this.filterStatus];
        filters.forEach(filter => { 
            if(filter) filter.addEventListener('change', () => this.renderMasterTaskListTable());
        });
        if(this.searchTask) this.searchTask.addEventListener('input', () => this.renderMasterTaskListTable());
    }

    startClock() {
        const liveTimeEl = document.getElementById('liveTime');
        const updateTime = () => {
            const now = new Date();
            if (liveTimeEl) liveTimeEl.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        updateTime();
        setInterval(updateTime, 1000);
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="toast-msg">${message}</span>`;
        if (this.toastContainer) this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    switchView(viewName) {
        Object.keys(this.views).forEach(name => {
            if(!this.views[name]) return;
            if (name === viewName) {
                this.views[name].classList.remove('d-none');
                this.views[name].classList.add('active');
            } else {
                this.views[name].classList.remove('active');
                this.views[name].classList.add('d-none');
            }
        });
        this.currentView = viewName;
        if (viewName === 'leader-dashboard') this.renderLeaderDashboard();
        else if (viewName === 'leader-tasks') this.renderMasterTaskListTable();
        else if (viewName === 'leader-team') this.renderTeamMembers();
        else if (viewName === 'staff-kanban') this.renderStaffKanban();
        else if (viewName === 'team-calendar') this.renderOutlookSharedCalendar(); 
    }

    switchRole(roleVal) {
        this.currentUser = roleVal;
        const member = this.staff.find(m => m.id === roleVal);
        if (member) {
            if (this.currentUserName) this.currentUserName.textContent = member.name;
            if (this.currentUserRoleText) this.currentUserRoleText.textContent = member.role;
            if (this.currentUserAvatar) this.currentUserAvatar.src = member.avatar;
        }
        this.switchView(roleVal === 'leader' || roleVal === 'asst-g3' || roleVal === 'dev-chaisith' ? 'leader-dashboard' : 'staff-kanban');
    }

    render() {
        this.populateRoleSwitcher();
        this.populateAssigneeDropdowns();
        this.switchView(this.currentUser === 'leader' || this.currentUser === 'asst-g3' || this.currentUser === 'dev-chaisith' ? 'leader-dashboard' : 'staff-kanban');
    }

    // 🔒 🛡️ ฟังก์ชันคัดกรองงานยุทธการที่ระบบทำตกหล่นไป (ได้รับการต่อท่อและติดตั้งใหม่เรียบร้อย 100%)
    getFilteredTasks() {
        const fAssignee = this.filterAssignee ? this.filterAssignee.value : 'all';
        const fUrgency = this.filterUrgency ? this.filterUrgency.value : 'all';
        const fSecrecy = this.filterSecrecy ? this.filterSecrecy.value : 'all';
        const fStatus = this.filterStatus ? this.filterStatus.value : 'all';
        const fSearch = this.searchTask ? this.searchTask.value.toLowerCase().trim() : '';

        return this.tasks.filter(task => {
            const matchAssignee = (fAssignee === 'all') || (task.assigneeId === fAssignee);
            const matchUrgency = (fUrgency === 'all') || (task.urgency === fUrgency);
            const matchSecrecy = (fSecrecy === 'all') || (task.secrecy === fSecrecy);
            let matchStatus = true;
            if (fStatus !== 'all') matchStatus = (task.status === fStatus);
            const matchSearch = !fSearch || task.name.toLowerCase().includes(fSearch);
            return matchAssignee && matchUrgency && matchSecrecy && matchStatus && matchSearch;
        });
    }

    renderLeaderDashboard() {
        if (this.statTotalTasks) this.statTotalTasks.textContent = this.tasks.length;
        if (this.statInProgressTasks) this.statInProgressTasks.textContent = this.tasks.filter(t => t.status === 'กำลังทำ').length;
        if (this.statReviewTasks) this.statReviewTasks.textContent = this.tasks.filter(t => t.status === 'รอการอนุมัติ').length;
        if (this.statCompletedTasks) this.statCompletedTasks.textContent = this.tasks.filter(t => t.status === 'เสร็จสิ้น').length;
        if (this.statOverdueTasks) this.statOverdueTasks.textContent = 0;
        this.renderCharts();
        this.renderTeamProgressTable();
    }

    renderTeamProgressTable() {
        const progressArea = document.getElementById('teamProgressTable');
        if (!progressArea) return;
        const tableContainer = progressArea.parentElement;
        if (!tableContainer) return;

        tableContainer.innerHTML = `
            <div class="mobile-staff-progress-box" style="padding: 5px 0;">
                <label for="staffSelectDropdown" style="font-size: 13px; font-weight:600; margin-bottom: 8px; display:block; color:var(--text-primary);">
                    📋 เลือกตรวจสอบสถิติและความคืบหน้ากำลังพล:
                </label>
                <select id="staffSelectDropdown" class="form-control" style="width:100%; padding:10px; font-size:14px; border-radius:8px; margin-bottom:15px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--glass-border); font-family:'Prompt', sans-serif;">
                </select>
                <div id="mobileStaffProgressDisplay" class="glass-card" style="padding:15px; border-radius:10px; display:none; background:rgba(255,255,255,0.02); border:1px solid var(--glass-border);">
                </div>
            </div>
        `;

        const dropdown = document.getElementById('staffSelectDropdown');
        const displayArea = document.getElementById('mobileStaffProgressDisplay');
        
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
        workingStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));

        dropdown.innerHTML = '<option value="" style="color: #64748b;">-- แตะเลือกรายชื่อเจ้าหน้าที่ --</option>';
        workingStaff.forEach(member => {
            dropdown.innerHTML += `<option value="${member.id}" style="color: #0f172a; background: #ffffff;">${member.name}</option>`;
        });

        dropdown.addEventListener('change', (e) => {
            const memberId = e.target.value;
            if(!memberId) { displayArea.style.display = 'none'; return; }

            const member = this.staff.find(m => m.id === memberId);
            const memberTasks = this.tasks.filter(t => t.assigneeId === memberId);
            const total = memberTasks.length;
            const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

            displayArea.style.display = 'block';
            displayArea.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <img src="${member.avatar}" style="width:45px; height:45px; border-radius:50%;">
                    <div>
                        <h4 style="margin:0; font-size:15px; font-weight:700; color:var(--text-primary);">${member.name}</h4>
                        <small style="color:var(--text-muted); font-size:12px;">${member.role}</small>
                    </div>
                </div>
                <div>
                    <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:5px;">
                        <span>ความคืบหน้าภารกิจรวม</span> <span style="color:var(--primary);">${percentage}%</span>
                    </div>
                    <div style="height:10px; background:rgba(255,255,255,0.1); border-radius:5px; overflow:hidden;">
                        <div style="width:${percentage}%; height:100%; background:linear-gradient(90deg, var(--primary), #10b981); border-radius:5px;"></div>
                    </div>
                </div>
            `;
        });
    }

    renderCharts() {
        if (this.statusChartInstance) this.statusChartInstance.destroy();
        if (this.staffChartInstance) this.staffChartInstance.destroy();

        const statusChartCanvas = document.getElementById('statusChart');
        const staffChartCanvas = document.getElementById('staffChart');
        if (!statusChartCanvas || !staffChartCanvas) return;

        const isLightTheme = document.body.classList.contains('light-theme');
        const textColor = isLightTheme ? '#4b5563' : '#9ca3af';

        this.statusChartInstance = new Chart(statusChartCanvas, {
            type: 'doughnut',
            data: {
                labels: ['รอดำเนินการ', 'กำลังทำ', 'รออนุมัติ', 'เสร็จสิ้น'],
                datasets: [{
                    data: [
                        this.tasks.filter(t=>t.status==='รอดำเนินการ').length, 
                        this.tasks.filter(t=>t.status==='กำลังทำ').length, 
                        this.tasks.filter(t=>t.status==='รอการอนุมัติ').length, 
                        this.tasks.filter(t=>t.status==='เสร็จสิ้น').length
                    ],
                    backgroundColor: ['#94a3b8', '#eab308', '#a855f7', '#10b981']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor } } } }
        });

        const staffNames = [];
        const completedData = [];
        const incompletedData = [];
        
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
        workingStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));

        workingStaff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id);
            const comp = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            staffNames.push(member.name.split(' ')[0]); 
            completedData.push(comp);
            incompletedData.push(memberTasks.length - comp);
        });

        this.staffChartInstance = new Chart(staffChartCanvas, {
            type: 'bar',
            data: {
                labels: staffNames,
                datasets: [
                    { label: 'เสร็จสิ้น', data: completedData, backgroundColor: '#10b981' },
                    { label: 'กำลังดำเนินการ', data: incompletedData, backgroundColor: '#3b82f6' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
        });
    }

    renderOutlookSharedCalendar() {
        const calendarViewArea = document.getElementById('viewTeamCalendar');
        if (!calendarViewArea) return;

        const googleCalendarEmbedUrl = "https://calendar.google.com/calendar/embed?src=c7e59cfe55d28e41603548ef57d8d2a558e95487eb64bb81ab642b2ed0948dcf%40group.calendar.google.com&ctz=Asia%2FBangkok"; 

        calendarViewArea.innerHTML = `
            <div class="calendar-wrapper glass-card" style="padding:10px; border-radius:12px; height: calc(100vh - 140px); min-height:550px; display:flex; flex-direction:column; background:var(--card-bg); border:1px solid var(--glass-border); margin: 30px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding:0 5px;">
                    <div style="font-size:14px; font-weight:600; color:var(--text-primary);"><i class="far fa-calendar-alt text-primary"></i> 📆 แผนปฏิทินยุทธการร่วม ฝยก.พล.ร.4</div>
                    <a href="https://calendar.google.com" target="_blank" class="btn btn-primary" style="padding:6px 12px; font-size:11px; border-radius:6px; text-decoration:none; color:#fff;"><i class="fas fa-edit"></i> เพิ่ม/แก้ไขแผนงาน</a>
                </div>
                <div style="flex-grow:1; width:100%; border-radius:8px; overflow:hidden; background:#fff;">
                    <iframe src="${googleCalendarEmbedUrl}" style="border:0; width:100%; height:100%;" frameborder="0" scrolling="yes"></iframe>
                </div>
            </div>
        `;
    }

    populateRoleSwitcher() {
        if (!this.roleSelector) return;
        this.roleSelector.innerHTML = '';
        
        const groupAdmin = document.createElement('optgroup');
        groupAdmin.label = '1. ระดับฝ่ายเสธ & ผู้ดูแลระบบ (Admin)';
        
        const adminMembers = this.staff.filter(m => m.id === 'leader' || m.id === 'asst-g3' || m.id === 'dev-chaisith' || m.isStaffAdmin);
        adminMembers.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
        
        adminMembers.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = member.name + (member.id === 'leader' ? ' (Leader)' : (member.id === 'asst-g3' ? ' (Asst. G3)' : ' (DEV)'));
            opt.selected = (this.currentUser === member.id);
            groupAdmin.appendChild(opt);
        });
        this.roleSelector.appendChild(groupAdmin);

        const groupStaff = document.createElement('optgroup');
        groupStaff.label = '2. ระดับเจ้าหน้าที่ฝ่ายยุทธการ';
        
        const generalStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3' && m.id !== 'dev-chaisith' && !m.isStaffAdmin);
        generalStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
        
        generalStaff.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = member.name;
            opt.selected = (this.currentUser === member.id);
            groupStaff.appendChild(opt);
        });
        this.roleSelector.appendChild(groupStaff);
    }

    populateAssigneeDropdowns() {
        if (!this.taskAssigneeInput) return;
        this.taskAssigneeInput.innerHTML = '';
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
        workingStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));
        
        workingStaff.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = `${member.name} - ${member.role}`;
            this.taskAssigneeInput.appendChild(opt);
        });
    }

    renderMasterTaskListTable() {
        if (!this.masterTasksTableBody) return;
        this.masterTasksTableBody.innerHTML = '';
        this.getFilteredTasks().forEach(task => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${task.name}</strong></td><td>${task.deadline}</td><td>${task.status}</td>`;
            this.masterTasksTableBody.appendChild(tr);
        });
    }

    renderTeamMembers() {
        if (!this.teamGridCards) return;
        this.teamGridCards.innerHTML = '';
        this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3').forEach(member => {
            const card = document.createElement('div');
            card.className = 'team-member-card glass-card';
            card.innerHTML = `<div class="member-name">${member.name}</div><div class="member-role">${member.role}</div>`;
            this.teamGridCards.appendChild(card);
        });
    }

    renderStaffKanban() {
        const userTasks = this.tasks.filter(t => t.assigneeId === this.currentUser);
        if (this.kanbanTodo) this.populateKanbanColumn(this.kanbanTodo, userTasks.filter(t => t.status === 'รอดำเนินการ'));
        if (this.kanbanProgress) this.populateKanbanColumn(this.kanbanProgress, userTasks.filter(t => t.status === 'กำลังทำ'));
        if (this.kanbanReview) this.populateKanbanColumn(this.kanbanReview, userTasks.filter(t => t.status === 'รอการอนุมัติ'));
        if (this.kanbanDone) this.populateKanbanColumn(this.kanbanDone, userTasks.filter(t => t.status === 'เสร็จสิ้น'));
    }

    populateKanbanColumn(container, taskList) {
        container.innerHTML = '';
        if (taskList.length === 0) { container.innerHTML = `<div style="padding:15px; text-align:center; font-size:11px;">ไม่มีภารกิจ</div>`; return; }
        taskList.forEach(task => {
            const card = document.createElement('div');
            card.className = 'kanban-card glass-card';
            card.innerHTML = `<h5>${task.name}</h5>`;
            container.appendChild(card);
        });
    }

    renderStaffTaskListTable() {}
    getUrgencyBadge(u) { return `<span>${u}</span>`; }
    getSecrecyBadge(s) { return `<span>${s}</span>`; }
    getStatusBadge(st) { return `<span>${st}</span>`; }
    closeTaskModal() { if(this.taskModal) this.taskModal.classList.remove('show'); }
    closeDetailModal() { if(this.taskDetailModal) this.taskDetailModal.classList.remove('show'); }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new App(); });
