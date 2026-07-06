/**
 * Operations Portal - Application Logic (app.js)
 * เวอร์ชันปรับปรุงล่าสุด: ซ่อมแซมโค้ดขาดตอน, กราฟแท่งขวามือ, สี Dropdown และผูกท่อ Google Calendar สมบูรณ์แบบ
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
            
            const filesArray = Array.from(files).map(f => ({
                fileName: f.name,
                fileType: f.type,
                fileData: f 
            }));

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

// 👮 รายชื่อระดับฝ่ายเสธ ผู้ดูแลระบบ และกำลังพลเริ่มต้น
const DEFAULT_STAFF = [
    { id: 'leader', name: 'หัวหน้าฝ่ายยุทธการ', role: 'หัวหน้าฝ่ายยุทธการ (Leader)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=leader', isStaffAdmin: true, rankWeight: 1 },
    { id: 'asst-g3', name: 'ผช.หน.ฝยก.พล.ร.4', role: 'ผช.หน.ฝยก.พล.ร.4 (Asst. G3)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=asstg3', isStaffAdmin: true, rankWeight: 2 },
    { id: 'dev-chaisith', name: 'จ.ส.ท. ชัยสิทธิ์ ศรีอ่อนทอง', role: 'Powerpoint Wizard / DEV', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=chaisith', isStaffAdmin: true, rankWeight: 3, lineUserId: 'U093959610f37c88a31fe2911a7dd4bdd' },
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
        this.chatOpen = false;

        this.initDOMElements();
        this.loadData();
        this.setupEventListeners();
        this.startClock();

        this.attachments = new AttachmentStore();
        this.attachments.init().then(async () => {
            await this.syncWithCloudflare();
            this.render();
            if (this.isCloudMode) {
                setInterval(() => { this.syncChatOnly(); }, 2000);
            }
        }).catch(async err => {
            console.error("IndexedDB initialization failed", err);
            await this.syncWithCloudflare();
            this.render();
            if (this.isCloudMode) {
                setInterval(() => { this.syncChatOnly(); }, 2000);
            }
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

        this.chatWidget = document.getElementById('chatWidget');
        this.chatHeader = document.getElementById('chatHeader');
        this.chatBody = document.getElementById('chatBody');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatForm = document.getElementById('chatForm');
        this.chatInput = document.getElementById('chatInput');
        this.chatToggleIcon = document.getElementById('chatToggleIcon');
        this.chatUnreadBadge = document.getElementById('chatUnreadBadge');
    }

    loadData() {
        const storedData = localStorage.getItem('operations_portal_data');
        if (storedData) {
            try {
                const parsed = JSON.parse(storedData);
                this.staff = parsed.staff || DEFAULT_STAFF;
                
                if (!this.staff.find(m => m.id === 'leader')) {
                    this.staff.unshift({ id: 'leader', name: 'หัวหน้าฝ่ายยุทธการ', role: 'หัวหน้าฝ่ายยุทธการ (Leader)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=leader', isStaffAdmin: true });
                }
                if (!this.staff.find(m => m.id === 'asst-g3')) {
                    this.staff.splice(1, 0, { id: 'asst-g3', name: 'ผช.หน.ฝยก.พล.ร.4', role: 'ผช.หน.ฝยก.พล.ร.4 (Asst. G3)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=asstg3', isStaffAdmin: true });
                }
                if (!this.staff.find(m => m.id === 'dev-chaisith')) {
                    const chaisithObj = this.staff.find(m => m.name.includes('ชัยสิทธิ์'));
                    if(!chaisithObj) {
                        this.staff.splice(2, 0, { id: 'dev-chaisith', name: 'จ.ส.ท. ชัยสิทธิ์ ศรีอ่อนทอง', role: 'Powerpoint Wizard / DEV', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=chaisith', isStaffAdmin: true, lineUserId: 'U093959610f37c88a31fe2911a7dd4bdd' });
                    }
                }

                this.tasks = parsed.tasks || DEFAULT_TASKS;
                this.messages = parsed.messages || []; 
            } catch (e) {
                console.error("Error parsing stored data", e);
                this.staff = DEFAULT_STAFF;
                this.tasks = DEFAULT_TASKS;
                this.messages = [];
            }
        } else {
            this.staff = DEFAULT_STAFF;
            this.tasks = DEFAULT_TASKS;
            this.messages = [];
            this.saveData();
        }
    }

    saveData() {
        const dataToStore = { staff: this.staff, tasks: this.tasks, messages: this.messages };
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
        } catch (err) {
            console.error("Cloudflare sync failed", err);
        }
    }

    async syncChatOnly() {
        if (!this.isCloudMode) return;
        try {
            const chatRes = await fetch('/api/chat');
            if (chatRes.ok) {
                const chatData = await chatRes.json();
                if (chatData && chatData.length > this.messages.length) {
                    this.messages = chatData;
                    this.saveData();
                    this.renderChatMessages();
                }
            }
        } catch (err) {}
    }

    // 🛠️ จุดเชื่อมต่อกลไกดักฟังคำสั่งหน้าเว็บ (ส่วนที่ระบบตัดขาดตอนก่อนหน้า ได้รับการแก้ไขแล้ว)
    setupEventListeners() {
        this.roleSelector.addEventListener('change', (e) => this.switchRole(e.target.value));

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchView(link.getAttribute('data-view'));
                this.sidebar.classList.remove('show');
            });
        });

        this.toggleSidebarBtn.addEventListener('click', () => this.sidebar.classList.add('show'));
        this.closeSidebarBtn.addEventListener('click', () => this.sidebar.classList.remove('show'));

        this.themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            const isLight = document.body.classList.contains('light-theme');
            const icon = this.themeToggleBtn.querySelector('i');
            if (isLight) {
                icon.className = 'fas fa-sun';
                document.body.classList.remove('dark-theme');
            } else {
                icon.className = 'fas fa-moon';
                document.body.classList.add('dark-theme');
            }
            this.renderCharts();
        });

        this.btnCreateTask.addEventListener('click', () => this.openCreateTaskModal());
        this.btnCancelTaskModal.addEventListener('click', () => this.closeTaskModal());
        this.taskModalCloseBtn.addEventListener('click', () => this.closeTaskModal());
        this.taskDetailCloseBtn.addEventListener('click', () => this.closeDetailModal());
        this.taskForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitTaskForm(); });
        this.addMemberForm.addEventListener('submit', (e) => { e.preventDefault(); this.addNewMember(); });

        const columns = document.querySelectorAll('.kanban-column');
        columns.forEach(column => {
            column.addEventListener('dragover', (e) => this.handleDragOver(e));
            column.addEventListener('dragenter', (e) => this.handleDragEnter(e, column));
            column.addEventListener('dragleave', (e) => this.handleDragLeave(e, column));
            column.addEventListener('drop', (e) => this.handleDrop(e, column));
        });

        const btnTable = document.getElementById('btnMasterTableMode');
        const btnGantt = document.getElementById('btnMasterGanttMode');
        if (btnTable && btnGantt) {
            btnTable.addEventListener('click', () => {
                this.tasksViewMode = 'table';
                btnTable.className = 'btn btn-primary';
                btnGantt.className = 'btn btn-secondary';
                document.getElementById('masterTableArea').classList.remove('d-none');
                document.getElementById('masterGanttArea').classList.add('d-none');
                this.renderMasterTaskListTable();
            });
            btnGantt.addEventListener('click', () => {
                this.tasksViewMode = 'gantt';
                btnTable.className = 'btn btn-secondary';
                btnGantt.className = 'btn btn-primary';
                document.getElementById('masterTableArea').classList.add('d-none');
                document.getElementById('masterGanttArea').classList.remove('d-none');
                this.renderGanttChart('masterGanttChart', this.getFilteredTasks());
            });
        }

        const filters = [this.filterAssignee, this.filterUrgency, this.filterSecrecy, this.filterStatus];
        filters.forEach(filter => { 
            filter.addEventListener('change', () => {
                if (this.tasksViewMode === 'gantt') this.renderGanttChart('masterGanttChart', this.getFilteredTasks());
                else this.renderMasterTaskListTable();
            }); 
        });
        this.searchTask.addEventListener('input', () => {
            if (this.tasksViewMode === 'gantt') this.renderGanttChart('masterGanttChart', this.getFilteredTasks());
            else this.renderMasterTaskListTable();
        });

        this.taskStatusInput.addEventListener('change', () => { this.pdfUploadRow.style.display = 'grid'; });
        this.taskPdfInput.addEventListener('change', (e) => {
            const files = e.target.files;
            this.pdfUploadStatus.textContent = files.length === 1 ? `เลือกไฟล์แล้ว: ${files[0].name}` : `เลือกไฟล์แล้ว ${files.length} ไฟล์`;
        });

        window.addEventListener('click', (e) => {
            if (e.target === this.taskModal) this.closeTaskModal();
            if (e.target === this.taskDetailModal) this.closeDetailModal();
        });
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
        let iconClass = type === 'warning' ? 'fa-triangle-exclamation' : (type === 'danger' ? 'fa-circle-xmark' : (type === 'info' ? 'fa-circle-info' : 'fa-circle-check'));
        toast.innerHTML = `<i class="fas ${iconClass} toast-icon"></i><span class="toast-msg">${message}</span>`;
        if (this.toastContainer) this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toast-in 0.3s reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
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

        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('data-view') === viewName) link.classList.add('active');
            else link.classList.remove('active');
        });

        this.currentView = viewName;
        let thaiTitle = 'ภาพรวมยุทธการ';
        switch (viewName) {
            case 'leader-dashboard': thaiTitle = 'แดชบอร์ดภาพรวมยุทธการ'; break;
            case 'leader-tasks': thaiTitle = 'แฟ้มสะสมภารกิจฝ่ายยุทธการ'; break;
            case 'leader-team': thaiTitle = 'บัญชีรายชื่อกำลังพล'; break;
            case 'staff-kanban': thaiTitle = 'กระดานปฏิบัติการทางยุทธการ'; break;
            case 'staff-tasks': thaiTitle = 'รายการปฏิบัติการเดี่ยว'; break;
            case 'team-calendar': thaiTitle = 'ปฏิทินยุทธการส่วนกลาง'; break;
            case 'data-repo': thaiTitle = 'คลังข้อมูลส่วนกลาง (Google Drive)'; break;
        }
        if (this.pageTitle) this.pageTitle.innerHTML = thaiTitle;

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

    renderLeaderDashboard() {
        const total = this.tasks.length;
        const inProgress = this.tasks.filter(t => t.status === 'กำลังทำ').length;
        const underReview = this.tasks.filter(t => t.status === 'รอการอนุมัติ').length;
        const completed = this.tasks.filter(t => t.status === 'เสร็จสิ้น').length;
        const overdue = this.tasks.filter(t => this.isOverdue(t)).length;

        if (this.statTotalTasks) this.statTotalTasks.textContent = total;
        if (this.statInProgressTasks) this.statInProgressTasks.textContent = inProgress;
        if (this.statReviewTasks) this.statReviewTasks.textContent = underReview;
        if (this.statCompletedTasks) this.statCompletedTasks.textContent = completed;
        if (this.statOverdueTasks) this.statOverdueTasks.textContent = overdue;

        this.renderCharts();
        this.renderTeamProgressTable();
    }

    // 📱 สลับโหมดกล่องตรวจงานรายบุคคลแบบยืดหยุ่น (แก้ไขสีขาวชนขาวของ Dropdown)
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

        dropdown.innerHTML = '<option value="" style="color: #64748b;">-- แตะเลือกรายชื่อเจ้าหน้าที่ --</option>';
        workingStaff.forEach(member => {
            dropdown.innerHTML += `<option value="${member.id}" style="color: #0f172a; background: #ffffff;">${member.name}</option>`;
        });

        dropdown.addEventListener('change', (e) => {
            const memberId = e.target.value;
            if(!memberId) {
                displayArea.style.display = 'none';
                return;
            }

            const member = this.staff.find(m => m.id === memberId);
            const memberTasks = this.tasks.filter(t => t.assigneeId === memberId);
            const total = memberTasks.length;
            const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            const prog = memberTasks.filter(t => t.status === 'กำลังทำ').length;
            const todo = memberTasks.filter(t => t.status === 'รอดำเนินการ');
            const review = memberTasks.filter(t => t.status === 'รอการอนุมัติ').length;
            const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

            displayArea.style.display = 'block';
            displayArea.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <img src="${member.avatar}" class="avatar-sm" style="width:45px; height:45px; border-radius:50%;">
                    <div>
                        <h4 style="margin:0; font-size:15px; font-weight:700; color:var(--text-primary);">${member.name}</h4>
                        <small style="color:var(--text-muted); font-size:12px;">${member.role}</small>
                    </div>
                </div>
                <div style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:5px;">
                        <span>ความคืบหน้าภารกิจรวม</span>
                        <span style="color:var(--primary);">${percentage}%</span>
                    </div>
                    <div style="height:10px; background:rgba(255,255,255,0.1); border-radius:5px; overflow:hidden;">
                        <div style="width:${percentage}%; height:100%; background:linear-gradient(90deg, var(--primary), #10b981); border-radius:5px;"></div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; text-align:center; font-size:11px; margin-top:12px;">
                    <div style="background:rgba(148,163,184,0.08); padding:6px; border-radius:6px;"><b style="display:block; font-size:14px; color:var(--text-primary);">${total}</b>งานรวม</div>
                    <div style="background:rgba(234,179,8,0.08); padding:6px; border-radius:6px; color:#eab308;"><b style="display:block; font-size:14px;">${prog}</b>ทำอยู่</div>
                    <div style="background:rgba(168,85,247,0.08); padding:6px; border-radius:6px; color:#a855f7;"><b style="display:block; font-size:14px;">${review}</b>รอตรวจ</div>
                    <div style="background:rgba(16,185,129,0.08); padding:6px; border-radius:6px; color:#10b981;"><b style="display:block; font-size:14px;">${done}</b>สำเร็จ</div>
                </div>
            `;
        });
    }

    // 📊 ฟังก์ชันควบคุมและประมวลผลกราฟแท่ง (Staff Bar Chart ขวามือ ได้รับการกู้คืนแล้ว)
    renderCharts() {
        if (this.statusChartInstance) this.statusChartInstance.destroy();
        if (this.staffChartInstance) this.staffChartInstance.destroy();

        const statusChartCanvas = document.getElementById('statusChart');
        const staffChartCanvas = document.getElementById('staffChart');
        if (!statusChartCanvas || !staffChartCanvas) return;

        const isLightTheme = document.body.classList.contains('light-theme');
        const textColor = isLightTheme ? '#4b5563' : '#9ca3af';
        const gridColor = isLightTheme ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';

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
                    backgroundColor: ['#94a3b8', '#eab308', '#a855f7', '#10b981'],
                    borderColor: isLightTheme ? '#ffffff' : '#141e30',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Prompt', size: 11 } } } }
            }
        });

        // 📊 วาดกราฟแท่งความรับผิดชอบรายกำลังพลฝั่งขวา
        const staffNames = [];
        const completedData = [];
        const incompletedData = [];

        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
        workingStaff.sort((a, b) => this.getRankWeight(a.name) - this.getRankWeight(b.name));

        workingStaff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id);
            const comp = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            const incomp = memberTasks.length - comp;
            staffNames.push(member.name.split(' ').slice(0, 2).join(' ')); 
            completedData.push(comp);
            incompletedData.push(incomp);
        });

        this.staffChartInstance = new Chart(staffChartCanvas, {
            type: 'bar',
            data: {
                labels: staffNames,
                datasets: [
                    { label: 'เสร็จสิ้น (Done)', data: completedData, backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'กำลังปฏิบัติ/รออนุมัติ/รอดำเนินการ', data: incompletedData, backgroundColor: '#3b82f6', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                scales: {
                    x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Prompt' } } },
                    y: { stacked: true, grid: { display: false }, ticks: { color: textColor, font: { family: 'Prompt' } } }
                },
                plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Prompt', size: 11 } } } }
            }
        });
    }

    // 📆 ล็อกท่อฝังปฏิทินยุทธการด้วย Google Calendar (ปลอดภัย ไม่ติดซองจดหมายสีฟ้า)
    renderOutlookSharedCalendar() {
        const calendarViewArea = this.views['team-calendar'];
        if (!calendarViewArea) return;

        const googleCalendarEmbedUrl = "https://calendar.google.com/calendar/embed?src=c7e59cfe55d28e41603548ef57d8d2a558e95487eb64bb81ab642b2ed0948dcf%40group.calendar.google.com&ctz=Asia%2FBangkok"; 

        calendarViewArea.innerHTML = `
            <div class="calendar-wrapper glass-card" style="padding:10px; border-radius:12px; height: calc(100vh - 140px); min-height:550px; display:flex; flex-direction:column; background:var(--card-bg); border:1px solid var(--glass-border);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding:0 5px; flex-wrap: wrap; gap: 8px;">
                    <div style="font-size:14px; font-weight:600; color:var(--text-primary);"><i class="far fa-calendar-alt text-primary"></i> 📆 แผนปฏิทินปฏิบัติงานยุทธการร่วม ฝยก.พล.ร.4</div>
                    <a href="https://calendar.google.com" target="_blank" class="btn btn-primary" style="padding:6px 12px; font-size:11px; border-radius:6px; font-weight:600; text-decoration:none; display:inline-block;"><i class="fas fa-edit"></i> เปิดเข้า Google Calendar เพื่อเพิ่ม/แก้ไขแผนงาน</a>
                </div>
                <div style="flex-grow:1; width:100%; border-radius:8px; overflow:hidden; background:#fff; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                    <iframe src="${googleCalendarEmbedUrl}" style="border:0; width:100%; height:100%;" frameborder="0" scrolling="yes"></iframe>
                </div>
            </div>
        `;
    }

    renderMasterTaskListTable() {
        if (!this.masterTasksTableBody) return;
        this.masterTasksTableBody.innerHTML = '';
        const filteredTasks = this.getFilteredTasks();
        if (filteredTasks.length === 0) {
            this.masterTasksTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">ไม่พบข้อมูล</td></tr>`;
            return;
        }
        filteredTasks.forEach(task => {
            const member = this.staff.find(m => m.id === task.assigneeId) || { name: 'ไม่มีผู้รับผิดชอบ', avatar: '' };
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${task.name}</strong></td>
                <td>${member.name}</td>
                <td>${this.getUrgencyBadge(task.urgency)}</td>
                <td>${this.getSecrecyBadge(task.secrecy)}</td>
                <td>${task.startDate}</td>
                <td>${task.deadline}</td>
                <td>${this.getStatusBadge(task.status)}</td>
                <td><button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="app.viewTaskDetails('${task.id}')"><i class="fas fa-eye"></i></button></td>
            `;
            this.masterTasksTableBody.appendChild(tr);
        });
    }

    renderTeamMembers() {
        if (!this.teamGridCards) return;
        this.teamGridCards.innerHTML = '';
        const workingStaff = this.staff.filter(m => m.id !== 'leader' && m.id !== 'asst-g3');
        workingStaff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id);
            const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            const active = memberTasks.length - done;

            const card = document.createElement('div');
            card.className = 'team-member-card glass-card';
            card.innerHTML = `
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 8px;">
                    <button onclick="app.editMember('${member.id}')" style="background: transparent; border: none; color: #3b82f6; cursor: pointer;"><i class="fas fa-user-pen"></i></button>
                    <button onclick="app.removeMember('${member.id}')" style="background: transparent; border: none; color: red; cursor: pointer;"><i class="fas fa-user-minus"></i></button>
                </div>
                <div class="member-avatar-box" style="margin-top: 15px;"><img src="${member.avatar}" class="avatar-lg"></div>
                <div class="member-name">${member.name}</div>
                <div class="member-role">${member.role}</div>
                <div class="member-task-stats">
                    <div><span class="text-warning">${active}</span> งานค้าง</div>
                    <div style="border-left: 1px solid var(--glass-border); padding-left: 10px;"><span class="text-success">${done}</span> เสร็จแล้ว</div>
                </div>
            `;
            this.teamGridCards.appendChild(card);
        });
    }

    renderStaffKanban() {
        const member = this.staff.find(m => m.id === this.currentUser);
        if (!member) return;
        if (this.staffProfileAvatar) this.staffProfileAvatar.src = member.avatar;
        if (this.staffProfileName) this.staffProfileName.textContent = member.name;
        if (this.staffProfileRole) this.staffProfileRole.textContent = member.role;

        const userTasks = this.tasks.filter(t => t.assigneeId === this.currentUser);
        if (this.staffStatTodo) this.staffStatTodo.textContent = userTasks.filter(t => t.status === 'รอดำเนินการ').length;
        if (this.staffStatProgress) this.staffStatProgress.textContent = userTasks.filter(t => t.status === 'กำลังทำ').length;
        if (this.staffStatReview) this.staffStatReview.textContent = userTasks.filter(t => t.status === 'รอการอนุมัติ').length;
        if (this.staffStatDone) this.staffStatDone.textContent = userTasks.filter(t => t.status === 'เสร็จสิ้น').length;

        if (this.kanbanTodo) this.populateKanbanColumn(this.kanbanTodo, userTasks.filter(t => t.status === 'รอดำเนินการ'));
        if (this.kanbanProgress) this.populateKanbanColumn(this.kanbanProgress, userTasks.filter(t => t.status === 'กำลังทำ'));
        if (this.kanbanReview) this.populateKanbanColumn(this.kanbanReview, userTasks.filter(t => t.status === 'รอการอนุมัติ'));
        if (this.kanbanDone) this.populateKanbanColumn(this.kanbanDone, userTasks.filter(t => t.status === 'เสร็จสิ้น'));
    }

    populateKanbanColumn(container, taskList) {
        container.innerHTML = '';
        if (taskList.length === 0) {
            container.innerHTML = `<div style="padding: 15px; text-align: center; font-size: 11px; color: var(--text-muted);">ไม่มีภารกิจ</div>`;
            return;
        }
        taskList.forEach(task => {
            const card = document.createElement('div');
            card.className = 'kanban-card glass-card';
            card.innerHTML = `<h5>${task.name}</h5><p style="font-size:12px; margin:5px 0;">${task.description || ''}</p><small style="display:block; margin-top:5px; opacity:0.7;"><i class="far fa-calendar-times"></i> ส่ง: ${task.deadline}</small>`;
            card.addEventListener('click', () => this.viewTaskDetails(task.id));
            container.appendChild(card);
        });
    }

    renderStaffTaskListTable() { if(this.staffTasksTableBody) this.staffTasksTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">เปิดทำงานบนระบบบอร์ดคัมบังด้านบนเพื่อความง่ายต่อสมาร์ตโฟนครับ</td></tr>'; }
    getUrgencyBadge(u) { return `<span class="badge" style="background: #eab308; color:#000; padding:2px 6px; border-radius:4px; font-size:11px;">${u}</span>`; }
    getSecrecyBadge(s) { return `<span class="badge" style="background: #3b82f6; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${s}</span>`; }
    getStatusBadge(st) { return `<span class="badge" style="background: #10b981; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${st}</span>`; }
    closeDetailModal() { if (this.taskDetailModal) this.taskDetailModal.classList.remove('show'); }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new App(); });
