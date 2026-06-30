/**
 * Operations Portal - Application Logic (app.js)
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
    // อัปเดตให้รองรับอาร์เรย์ไฟล์
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

const DEFAULT_STAFF = [
    { id: 'staff-1', name: 'พ.ต. สมศักดิ์ รักชาติ', role: 'หัวหน้าชุดวางแผนยุทธการ', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=somsak' },
    { id: 'staff-2', name: 'ร.อ. วิชัย กล้าหาญ', role: 'นายทหารปฏิบัติการข่าวกรอง', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=wichai' },
    { id: 'staff-3', name: 'ร.ท. หญิง อารีรัตน์ ใจดี', role: 'นายทหารสื่อสารและการประสานงาน', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=areerat' }
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
            // เริ่มต้นระบบ Polling เช็กแชททุกๆ 2 วินาที (2000 ms)
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
        this.detailStartDate = document.getElementById('detailStartDate');
        this.detailDeadline = document.getElementById('detailDeadline');
        this.detailOverdueBox = document.getElementById('detailOverdueBox');
        this.detailActivityLog = document.getElementById('detailActivityLog');
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
            
            const chatRes = await fetch('/api/chat');
            if (chatRes.ok) {
                const chatData = await chatRes.json();
                if (chatData && chatData.length !== this.messages.length) {
                    this.messages = chatData;
                }
            }

            this.saveData();
        } catch (err) {
            console.error("Cloudflare sync failed", err);
            this.showToast("การเชื่อมต่อคลาวด์ขัดข้อง กำลังใช้งานฐานข้อมูลสำรองในเครื่อง", "warning");
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
                    
                    if (this.chatOpen) {
                        this.scrollToBottomChat();
                    } else if (this.chatUnreadBadge) {
                        this.chatUnreadBadge.classList.remove('d-none');
                        this.chatUnreadBadge.textContent = '!';
                    }
                }
            }
        } catch (err) {
            // ปล่อยผ่านเงียบๆ ไม่ต้องแจ้ง Error ถ้าแค่เน็ตกระตุกชั่วคราว
        }
    }

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

        const filters = [this.filterAssignee, this.filterUrgency, this.filterSecrecy, this.filterStatus];
        filters.forEach(filter => { filter.addEventListener('change', () => this.renderMasterTaskListTable()); });
        this.searchTask.addEventListener('input', () => this.renderMasterTaskListTable());

        this.taskStatusInput.addEventListener('change', () => {
            this.pdfUploadRow.style.display = (this.taskStatusInput.value === 'เสร็จสิ้น') ? 'grid' : 'none';
        });

        this.taskPdfInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length === 0) {
                this.pdfUploadStatus.textContent = 'ไม่มีไฟล์ที่แนบไว้';
            } else if (files.length === 1) {
                this.pdfUploadStatus.textContent = `เลือกไฟล์แล้ว: ${files[0].name}`;
            } else {
                this.pdfUploadStatus.textContent = `เลือกไฟล์แล้ว ${files.length} ไฟล์`;
            }
        });

        window.addEventListener('click', (e) => {
            if (e.target === this.taskModal) this.closeTaskModal();
            if (e.target === this.taskDetailModal) this.closeDetailModal();
        });

        if(this.chatHeader) { this.chatHeader.addEventListener('click', () => this.toggleChat()); }
        if(this.chatForm) {
            this.chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const text = this.chatInput.value.trim();
                if(text) { this.sendMessage(text); this.chatInput.value = ''; }
            });
        }
    }

    startClock() {
        const liveTimeEl = document.getElementById('liveTime');
        const updateTime = () => {
            const now = new Date();
            liveTimeEl.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        updateTime();
        setInterval(updateTime, 1000);
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        let iconClass = type === 'warning' ? 'fa-triangle-exclamation' : (type === 'danger' ? 'fa-circle-xmark' : (type === 'info' ? 'fa-circle-info' : 'fa-circle-check'));
        toast.innerHTML = `<i class="fas ${iconClass} toast-icon"></i><span class="toast-msg">${message}</span>`;
        this.toastContainer.appendChild(toast);
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
            case 'data-repo': thaiTitle = 'คลังข้อมูลส่วนกลาง (Google Drive)'; break;
        }
        this.pageTitle.innerHTML = thaiTitle;

        if (viewName === 'leader-dashboard') this.renderLeaderDashboard();
        else if (viewName === 'leader-tasks') this.renderMasterTaskListTable();
        else if (viewName === 'leader-team') this.renderTeamMembers();
        else if (viewName === 'staff-kanban') this.renderStaffKanban();
        else if (viewName === 'staff-tasks') this.renderStaffTaskListTable();
    }

    switchRole(roleVal) {
        this.currentUser = roleVal;
        if (roleVal === 'leader') {
            this.currentUserName.textContent = 'หัวหน้าฝ่ายยุทธการ';
            this.currentUserRoleText.textContent = 'ผู้บังคับบัญชา';
            this.currentUserAvatar.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=leader';
            this.leaderNav.classList.remove('d-none');
            this.staffNav.classList.add('d-none');
            this.btnCreateTask.classList.remove('d-none');
            this.switchView('leader-dashboard');
        } else {
            const member = this.staff.find(m => m.id === roleVal);
            if (member) {
                this.currentUserName.textContent = member.name;
                this.currentUserRoleText.textContent = member.role;
                this.currentUserAvatar.src = member.avatar;
                this.leaderNav.classList.add('d-none');
                this.staffNav.classList.remove('d-none');
                this.btnCreateTask.classList.add('d-none');
                this.switchView('staff-kanban');
            }
        }
        this.renderChatMessages(); 
        this.showToast(`เปลี่ยนการทำงานเป็น: ${this.currentUserName.textContent}`, 'info');
    }

    render() {
        this.populateRoleSwitcher();
        this.populateAssigneeDropdowns();
        this.renderChatMessages(); 
        if (this.currentUser === 'leader') this.switchView('leader-dashboard');
        else this.switchView('staff-kanban');
    }

    toggleChat() {
        this.chatOpen = !this.chatOpen;
        if(this.chatOpen) {
            this.chatBody.classList.remove('d-none');
            this.chatToggleIcon.className = 'fas fa-chevron-down';
            if (this.chatUnreadBadge) this.chatUnreadBadge.classList.add('d-none');
            this.scrollToBottomChat();
        } else {
            this.chatBody.classList.add('d-none');
            this.chatToggleIcon.className = 'fas fa-chevron-up';
        }
    }

    async sendMessage(text) {
        const msg = {
            id: Date.now().toString(),
            senderId: this.currentUser,
            senderName: this.currentUser === 'leader' ? 'หัวหน้าฝ่ายยุทธการ' : this.currentUserName.textContent,
            text: text,
            time: new Date().toISOString()
        };
        
        this.messages.push(msg);
        this.saveData();
        this.renderChatMessages();
        this.scrollToBottomChat();

        if (this.isCloudMode) {
            try {
                await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(msg)
                });
            } catch (err) {
                console.error("Failed to send message", err);
            }
        }
    }

    renderChatMessages() {
        if(!this.chatMessages) return;
        this.chatMessages.innerHTML = '';
        if(this.messages.length === 0) {
            this.chatMessages.innerHTML = '<div style="text-align:center; color: var(--text-muted); font-size: 12px; margin-top: 50px;">ยังไม่มีข้อความในระบบ เริ่มทักทายทีมได้เลย!</div>';
            return;
        }

        this.messages.forEach(msg => {
            const isSelf = msg.senderId === this.currentUser;
            const div = document.createElement('div');
            div.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
            const timeStr = new Date(msg.time).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            
            div.innerHTML = `
                ${!isSelf ? `<span class="chat-msg-sender">${msg.senderName}</span>` : ''}
                <div>${msg.text}</div>
                <div style="font-size: 9px; text-align: right; opacity: 0.6; margin-top: 3px;">${timeStr}</div>
            `;
            this.chatMessages.appendChild(div);
        });
    }

    scrollToBottomChat() {
        if(this.chatMessages) {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
    }

    populateRoleSwitcher() {
        this.roleSelector.innerHTML = '';
        const optLeader = document.createElement('option');
        optLeader.value = 'leader';
        optLeader.textContent = 'หัวหน้าฝ่ายยุทธการ (Leader)';
        optLeader.selected = (this.currentUser === 'leader');
        this.roleSelector.appendChild(optLeader);
        this.staff.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = `${member.name} (เจ้าหน้าที่)`;
            opt.selected = (this.currentUser === member.id);
            this.roleSelector.appendChild(opt);
        });
    }

    populateAssigneeDropdowns() {
        this.taskAssigneeInput.innerHTML = '';
        this.staff.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = `${member.name} - ${member.role}`;
            this.taskAssigneeInput.appendChild(opt);
        });
        this.filterAssignee.innerHTML = '<option value="all">ทั้งหมด</option>';
        this.staff.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = member.name;
            this.filterAssignee.appendChild(opt);
        });
    }

    isOverdue(task) {
        if (task.status === 'เสร็จสิ้น') return false;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const deadline = new Date(task.deadline);
        deadline.setHours(0, 0, 0, 0);
        return now > deadline;
    }

    isDueSoon(task) {
        if (task.status === 'เสร็จสิ้น') return false;
        if (this.isOverdue(task)) return false;
        const now = new Date();
        const deadline = new Date(task.deadline);
        const diffHours = (deadline - now) / (1000 * 60 * 60);
        return diffHours >= 0 && diffHours <= 24;
    }

    renderLeaderDashboard() {
        const total = this.tasks.length;
        const inProgress = this.tasks.filter(t => t.status === 'กำลังทำ').length;
        const underReview = this.tasks.filter(t => t.status === 'รอการอนุมัติ').length;
        const completed = this.tasks.filter(t => t.status === 'เสร็จสิ้น').length;
        const overdue = this.tasks.filter(t => this.isOverdue(t)).length;

        this.statTotalTasks.textContent = total;
        this.statInProgressTasks.textContent = inProgress;
        this.statReviewTasks.textContent = underReview;
        this.statCompletedTasks.textContent = completed;
        this.statOverdueTasks.textContent = overdue;

        this.renderCharts();
        this.renderTeamProgressTable();
    }

    renderCharts() {
        if (this.statusChartInstance) this.statusChartInstance.destroy();
        if (this.staffChartInstance) this.staffChartInstance.destroy();

        const statusChartCanvas = document.getElementById('statusChart');
        const staffChartCanvas = document.getElementById('staffChart');
        if (!statusChartCanvas || !staffChartCanvas) return;

        const isLightTheme = document.body.classList.contains('light-theme');
        const textColor = isLightTheme ? '#4b5563' : '#9ca3af';
        const gridColor = isLightTheme ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';

        const todoCount = this.tasks.filter(t => t.status === 'รอดำเนินการ').length;
        const inProgCount = this.tasks.filter(t => t.status === 'กำลังทำ').length;
        const reviewCount = this.tasks.filter(t => t.status === 'รอการอนุมัติ').length;
        const doneCount = this.tasks.filter(t => t.status === 'เสร็จสิ้น').length;

        this.statusChartInstance = new Chart(statusChartCanvas, {
            type: 'doughnut',
            data: {
                labels: ['รอดำเนินการ', 'กำลังทำ', 'รออนุมัติ', 'เสร็จสิ้น'],
                datasets: [{
                    data: [todoCount, inProgCount, reviewCount, doneCount],
                    backgroundColor: ['#94a3b8', '#eab308', '#a855f7', '#10b981'],
                    borderColor: isLightTheme ? '#ffffff' : '#141e30',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Prompt', size: 12 } } } }
            }
        });

        const staffNames = [];
        const completedData = [];
        const incompletedData = [];

        this.staff.forEach(member => {
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
                plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Prompt', size: 12 } } } }
            }
        });
    }

    renderTeamProgressTable() {
        this.teamProgressTableBody.innerHTML = '';
        this.staff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id);
            const total = memberTasks.length;
            const todo = memberTasks.filter(t => t.status === 'รอดำเนินการ').length;
            const prog = memberTasks.filter(t => t.status === 'กำลังทำ').length;
            const review = memberTasks.filter(t => t.status === 'รอการอนุมัติ').length;
            const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="table-user">
                        <img src="${member.avatar}" alt="Avatar" class="avatar-xs">
                        <div>
                            <div class="table-user-name">${member.name}</div>
                            <small class="text-muted">${member.role}</small>
                        </div>
                    </div>
                </td>
                <td><strong>${total}</strong></td>
                <td><span class="text-muted">${todo}</span></td>
                <td><span class="text-warning">${prog}</span></td>
                <td><span class="text-info">${review}</span></td>
                <td><span class="text-success">${done}</span></td>
                <td style="min-width: 150px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-weight: 600; font-size: 13px; width: 35px;">${percentage}%</span>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                </td>
            `;
            this.teamProgressTableBody.appendChild(tr);
        });
    }

    renderMasterTaskListTable() {
        this.masterTasksTableBody.innerHTML = '';
        const fAssignee = this.filterAssignee.value;
        const fUrgency = this.filterUrgency.value;
        const fSecrecy = this.filterSecrecy.value;
        const fStatus = this.filterStatus.value;
        const fSearch = this.searchTask.value.toLowerCase().trim();

        const filteredTasks = this.tasks.filter(task => {
            const matchAssignee = (fAssignee === 'all') || (task.assigneeId === fAssignee);
            const matchUrgency = (fUrgency === 'all') || (task.urgency === fUrgency);
            const matchSecrecy = (fSecrecy === 'all') || (task.secrecy === fSecrecy);
            let matchStatus = true;
            if (fStatus !== 'all') {
                if (fStatus === 'overdue') matchStatus = this.isOverdue(task);
                else matchStatus = (task.status === fStatus);
            }
            const matchSearch = !fSearch || task.name.toLowerCase().includes(fSearch) || task.description.toLowerCase().includes(fSearch);
            return matchAssignee && matchUrgency && matchSecrecy && matchStatus && matchSearch;
        });

        if (filteredTasks.length === 0) {
            this.masterTasksTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;"><i class="fas fa-box-open" style="font-size: 30px; margin-bottom: 10px; display: block;"></i>ไม่พบข้อมูลยุทธการที่ต้องการค้นหา</td></tr>`;
            return;
        }

        filteredTasks.forEach(task => {
            const member = this.staff.find(m => m.id === task.assigneeId) || { name: 'ไม่มีผู้รับผิดชอบ', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=none' };
            const tr = document.createElement('tr');
            
            let deadlineClass = '';
            let overdueBadgeText = '';
            if (this.isOverdue(task)) { deadlineClass = 'deadline-danger'; overdueBadgeText = ' <span class="badge-overdue status-badge">เลยกำหนดส่ง</span>'; }
            else if (this.isDueSoon(task)) { deadlineClass = 'deadline-warning'; overdueBadgeText = ' <span class="badge-progress status-badge">ส่งใน 24 ชม.</span>'; }

            tr.innerHTML = `
                <td>
                    <strong>${task.name} ${task.hasAttachment ? '<i class="fas fa-file-pdf text-danger" title="มีไฟล์เอกสารแนบ" style="margin-left: 5px;"></i>' : ''}</strong>
                    <div style="font-size: 11px; color: var(--text-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px;">${task.description}</div>
                </td>
                <td><div class="table-user"><img src="${member.avatar}" alt="Avatar" class="avatar-xs"><span class="table-user-name">${member.name}</span></div></td>
                <td>${this.getUrgencyBadge(task.urgency)}</td>
                <td>${this.getSecrecyBadge(task.secrecy)}</td>
                <td>${task.startDate}</td>
                <td class="${deadlineClass}">${task.deadline}${overdueBadgeText}</td>
                <td>${this.getStatusBadge(task.status)}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px;" onclick="app.viewTaskDetails('${task.id}')" title="ดูรายละเอียด"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px; color: var(--primary);" onclick="app.openEditTaskModal('${task.id}')" title="แก้ไข"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px; color: var(--color-overdue);" onclick="app.deleteTask('${task.id}')" title="ลบงาน"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            this.masterTasksTableBody.appendChild(tr);
        });
    }

    renderTeamMembers() {
        this.teamGridCards.innerHTML = '';
        this.staff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id);
            const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            const active = memberTasks.length - done;

            const card = document.createElement('div');
            card.className = 'team-member-card glass-card';
            card.innerHTML = `
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 8px;">
                    <button onclick="app.editMember('${member.id}')" title="แก้ไขข้อมูลเจ้าหน้าที่" style="background: transparent; border: none; color: #3b82f6; cursor: pointer; font-size: 16px;"><i class="fas fa-user-pen"></i></button>
                    <button class="btn-remove-member" onclick="app.removeMember('${member.id}')" title="ลบกำลังพลออกจากระบบ" style="position: static; margin: 0;"><i class="fas fa-user-minus"></i></button>
                </div>
                <div class="member-avatar-box" style="margin-top: 15px;"><img src="${member.avatar}" alt="Avatar" class="avatar-lg"></div>
                <div class="member-name">${member.name}</div>
                <div class="member-role">${member.role}</div>
                <div class="member-task-stats">
                    <div class="member-stat"><span class="member-stat-num text-warning">${active}</span><span class="member-stat-lbl">งานค้าง</span></div>
                    <div class="member-stat" style="border-left: 1px solid var(--glass-border); padding-left: 15px;"><span class="member-stat-num text-success">${done}</span><span class="member-stat-lbl">เสร็จแล้ว</span></div>
                </div>
            `;
            this.teamGridCards.appendChild(card);
        });

        this.avatarOptionsContainer.innerHTML = '';
        const seeds = ['sam', 'jack', 'toby', 'leo', 'max', 'milo', 'charlie', 'buddy'];
        seeds.forEach((seed, index) => {
            const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
            const img = document.createElement('img');
            img.src = url;
            img.className = 'avatar-opt' + (index === 0 ? ' selected' : '');
            img.addEventListener('click', () => {
                document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected'));
                img.classList.add('selected');
                this.selectedAvatarInput.value = url;
            });
            this.avatarOptionsContainer.appendChild(img);
        });
        this.selectedAvatarInput.value = `https://api.dicebear.com/7.x/bottts/svg?seed=${seeds[0]}`;
    }

    addNewMember() {
        const name = this.memberNameInput.value.trim();
        const role = this.memberRoleInput.value.trim();
        const avatar = this.selectedAvatarInput.value;
        if (!name || !role) return;

        let memberData;
        if (this.editingStaffId) {
            const index = this.staff.findIndex(m => m.id === this.editingStaffId);
            if (index !== -1) {
                this.staff[index].name = name;
                this.staff[index].role = role;
                this.staff[index].avatar = avatar;
                memberData = this.staff[index];
            }
        } else {
            memberData = { id: `staff-${Date.now()}`, name, role, avatar };
            this.staff.push(memberData);
        }

        this.saveData();
        if (this.isCloudMode && memberData) {
            fetch('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberData) }).catch(err => console.error(err));
        }
        
        const isEdit = !!this.editingStaffId;
        this.resetMemberForm(); 
        this.populateRoleSwitcher();
        this.populateAssigneeDropdowns();
        this.renderTeamMembers();
        this.showToast(isEdit ? `แก้ไขข้อมูล "${name}" สำเร็จ` : `เพิ่มรายชื่อเจ้าหน้าที่ "${name}" สำเร็จ`);
    }

    removeMember(memberId) {
        const member = this.staff.find(m => m.id === memberId);
        if (!member) return;
        const activeTasks = this.tasks.filter(t => t.assigneeId === memberId && t.status !== 'เสร็จสิ้น');
        if (activeTasks.length > 0) { alert(`ไม่สามารถลบรายชื่อได้ เนื่องจาก "${member.name}" ยังมีภารกิจค้างอยู่ ${activeTasks.length} รายการ`); return; }

        if (confirm(`ต้องการลบรายชื่อ "${member.name}" ใช่หรือไม่?`)) {
            this.tasks.forEach(t => { if (t.assigneeId === memberId) t.assigneeId = 'deleted'; });
            this.staff = this.staff.filter(m => m.id !== memberId);
            if (this.isCloudMode) fetch(`/api/staff?id=${memberId}`, { method: 'DELETE' });
            if (this.currentUser === memberId) this.switchRole('leader');
            else { this.saveData(); this.populateRoleSwitcher(); this.populateAssigneeDropdowns(); this.renderTeamMembers(); }
            this.showToast(`ลบรายชื่อสำเร็จ`, 'warning');
        }
    }
    
    editMember(memberId) {
        const member = this.staff.find(m => m.id === memberId);
        if (!member) return;
        this.editingStaffId = memberId;
        this.memberNameInput.value = member.name;
        this.memberRoleInput.value = member.role;
        this.selectedAvatarInput.value = member.avatar;
        document.querySelectorAll('.avatar-opt').forEach(el => {
            if (el.src === member.avatar) el.classList.add('selected');
            else el.classList.remove('selected');
        });
        const formTitle = this.addMemberForm.parentElement.querySelector('.card-title');
        if (formTitle) formTitle.innerHTML = '<i class="fas fa-user-pen"></i> แก้ไขข้อมูลเจ้าหน้าที่';
        const submitBtn = this.addMemberForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
        
        let cancelBtn = document.getElementById('cancelEditBtn');
        if (!cancelBtn) {
            cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancelEditBtn'; cancelBtn.type = 'button'; cancelBtn.className = 'btn btn-secondary btn-block';
            cancelBtn.style.marginTop = '10px'; cancelBtn.innerHTML = '<i class="fas fa-times"></i> ยกเลิกการแก้ไข';
            cancelBtn.onclick = () => this.resetMemberForm();
            this.addMemberForm.appendChild(cancelBtn);
        }
        cancelBtn.style.display = 'block';
        this.addMemberForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    resetMemberForm() {
        this.editingStaffId = null;
        this.memberNameInput.value = ''; this.memberRoleInput.value = '';
        const firstAvatar = document.querySelector('.avatar-opt');
        if (firstAvatar) {
            document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected'));
            firstAvatar.classList.add('selected');
            this.selectedAvatarInput.value = firstAvatar.src;
        }
        const formTitle = this.addMemberForm.parentElement.querySelector('.card-title');
        if (formTitle) formTitle.innerHTML = '<i class="fas fa-user-plus"></i> เพิ่มเจ้าหน้าที่ยุทธการคนใหม่';
        const submitBtn = this.addMemberForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-plus"></i> เพิ่มเจ้าหน้าที่เข้าระบบ';
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    renderStaffKanban() {
        const member = this.staff.find(m => m.id === this.currentUser);
        if (!member) return;
        this.staffProfileAvatar.src = member.avatar;
        this.staffProfileName.textContent = member.name;
        this.staffProfileRole.textContent = member.role;

        const userTasks = this.tasks.filter(t => t.assigneeId === this.currentUser);
        const todo = userTasks.filter(t => t.status === 'รอดำเนินการ');
        const progress = userTasks.filter(t => t.status === 'กำลังทำ');
        const review = userTasks.filter(t => t.status === 'รอการอนุมัติ');
        const done = userTasks.filter(t => t.status === 'เสร็จสิ้น');

        this.staffStatTodo.textContent = todo.length; this.staffStatProgress.textContent = progress.length;
        this.staffStatReview.textContent = review.length; this.staffStatDone.textContent = done.length;
        document.getElementById('countTodo').textContent = todo.length; document.getElementById('countProgress').textContent = progress.length;
        document.getElementById('countReview').textContent = review.length; document.getElementById('countDone').textContent = done.length;

        this.populateKanbanColumn(this.kanbanTodo, todo); this.populateKanbanColumn(this.kanbanProgress, progress);
        this.populateKanbanColumn(this.kanbanReview, review); this.populateKanbanColumn(this.kanbanDone, done);
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
            task.history.push({ time: new Date().toISOString(), action: `ย้ายสถานะจาก "${oldStatus}" ไปยัง "${newStatus}" (Drag & Drop)`, user: this.currentUserName.textContent });
            this.saveData(); this.renderStaffKanban();
            if (this.isCloudMode) fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) });
            this.showToast(`ย้ายภารกิจไปยัง "${newStatus}" เรียบร้อย`);
        }
    }

    renderStaffTaskListTable() {
        this.staffTasksTableBody.innerHTML = '';
        this.staffTaskListTitle.innerHTML = `<i class="fas fa-folder-open"></i> รายการยุทธการทั้งหมดของ: ${this.currentUserName.textContent}`;
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
                <td>${this.getUrgencyBadge(task.urgency)}</td><td>${this.getSecrecyBadge(task.secrecy)}</td><td>${task.startDate}</td>
                <td class="${deadlineClass}">${task.deadline}${overdueText}</td><td>${this.getStatusBadge(task.status)}</td>
                <td><button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="app.viewTaskDetails('${task.id}')"><i class="fas fa-expand"></i> ตรวจรายละเอียด</button></td>
            `;
            this.staffTasksTableBody.appendChild(tr);
        });
    }

    openCreateTaskModal() {
        this.taskForm.reset(); this.taskModalTitle.innerHTML = '<i class="fas fa-circle-plus"></i> มอบหมายภารกิจยุทธการใหม่'; this.taskIdField.value = '';
        const today = new Date().toISOString().split('T')[0]; this.taskStartDateInput.value = today; this.taskDeadlineInput.value = today;
        if (this.currentUser !== 'leader') { this.taskAssigneeInput.value = this.currentUser; this.taskAssigneeInput.disabled = true; }
        else { this.taskAssigneeInput.disabled = false; }
        this.taskStatusInput.value = 'รอดำเนินการ'; this.taskStatusInput.disabled = false;
        this.pdfUploadRow.style.display = 'none'; this.taskPdfInput.value = ''; this.pdfUploadStatus.textContent = 'ไม่มีไฟล์ที่แนบไว้';
        this.taskModal.classList.add('show');
    }

    openEditTaskModal(taskId) {
        const task = this.tasks.find(t => t.id === taskId); if (!task) return;
        this.taskModalTitle.innerHTML = '<i class="fas fa-edit"></i> แก้ไขข้อมูลยุทธการ'; this.taskIdField.value = task.id;
        this.taskNameInput.value = task.name; this.taskDescriptionInput.value = task.description; this.taskAssigneeInput.value = task.assigneeId;
        this.taskStatusInput.value = task.status; this.taskUrgencyInput.value = task.urgency; this.taskSecrecyInput.value = task.secrecy;
        this.taskStartDateInput.value = task.startDate; this.taskDeadlineInput.value = task.deadline;
        this.taskAssigneeInput.disabled = false; this.taskStatusInput.disabled = false;
        
        if (task.status === 'เสร็จสิ้น') { 
            this.pdfUploadRow.style.display = 'grid'; 
            let fNames = '';
            if(task.hasAttachment && task.attachmentName) {
                try {
                    const arr = JSON.parse(task.attachmentName);
                    fNames = Array.isArray(arr) ? arr.join(', ') : task.attachmentName;
                } catch(e) { fNames = task.attachmentName; }
            }
            this.pdfUploadStatus.textContent = task.hasAttachment ? `ไฟล์แนบปัจจุบัน: ${fNames}` : 'ยังไม่มีไฟล์แนบ'; 
        }
        else { this.pdfUploadRow.style.display = 'none'; }
        
        this.taskPdfInput.value = ''; this.taskModal.classList.add('show');
    }

    closeTaskModal() { this.taskModal.classList.remove('show'); }

    async submitTaskForm() {
        const id = this.taskIdField.value; const name = this.taskNameInput.value.trim(); const description = this.taskDescriptionInput.value.trim();
        const assigneeId = this.taskAssigneeInput.value; const status = this.taskStatusInput.value; const urgency = this.taskUrgencyInput.value;
        const secrecy = this.taskSecrecyInput.value; const startDate = this.taskStartDateInput.value; const deadline = this.taskDeadlineInput.value;
        if (new Date(deadline) < new Date(startDate)) { alert('ข้อผิดพลาด: วันกำหนดส่ง (Deadline) ไม่สามารถอยู่ก่อนวันเริ่มต้นปฏิบัติงานได้'); return; }
        const now = new Date(); const logUser = this.currentUser === 'leader' ? 'หัวหน้าฝ่ายยุทธการ' : this.currentUserName.textContent;
        let finalTaskId = id; let taskObj = null;

        if (id) {
            taskObj = this.tasks.find(t => t.id === id);
            if (taskObj) {
                const changes = [];
                if (taskObj.name !== name) changes.push(`เปลี่ยนชื่องานเป็น "${name}"`);
                if (taskObj.assigneeId !== assigneeId) changes.push(`มอบหมายงานให้: ${this.staff.find(m => m.id === assigneeId)?.name}`);
                if (taskObj.status !== status) changes.push(`เปลี่ยนสถานะเป็น: ${status}`);
                taskObj.name = name; taskObj.description = description; taskObj.assigneeId = assigneeId; taskObj.status = status;
                taskObj.urgency = urgency; taskObj.secrecy = secrecy; taskObj.startDate = startDate; taskObj.deadline = deadline;
                if (changes.length > 0) taskObj.history.push({ time: now.toISOString(), action: `แก้ไขข้อมูล: ${changes.join(', ')}`, user: logUser });
            }
        } else {
            finalTaskId = `task-${Date.now()}`;
            taskObj = { id: finalTaskId, name, description, assigneeId, status, urgency, secrecy, startDate, deadline, history: [{ time: now.toISOString(), action: `มอบหมายภารกิจเริ่มต้นให้เจ้าหน้าที่`, user: logUser }] };
            this.tasks.push(taskObj);
        }

        if (taskObj && status === 'เสร็จสิ้น' && this.taskPdfInput.files.length > 0) {
            const files = this.taskPdfInput.files;
            const fileNamesArray = Array.from(files).map(f => f.name);
            
            this.btnSubmitTaskModal.disabled = true;
            this.btnSubmitTaskModal.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังอัปโหลดไฟล์...';

            if (this.isCloudMode) {
                try {
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const base64Data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(file); });
                        const kvKey = files.length === 1 ? finalTaskId : `${finalTaskId}_${i}`;
                        const pdfRes = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: kvKey, fileName: file.name, fileType: file.type, fileData: base64Data }) });
                        if (!pdfRes.ok) throw new Error("Cloud upload response not OK");
                    }
                    
                    taskObj.hasAttachment = true; 
                    taskObj.attachmentName = JSON.stringify(fileNamesArray); 
                    taskObj.history.push({ time: now.toISOString(), action: `อัปโหลดไฟล์เอกสารยุทธการ จำนวน ${files.length} ฉบับ`, user: logUser }); 
                } catch (err) { 
                    console.error(err); this.showToast('เกิดข้อผิดพลาดในการอัปโหลดไฟล์ไปยังเซิร์ฟเวอร์คลาวด์', 'danger'); 
                }
            } else {
                try { 
                    await this.attachments.saveAttachment(finalTaskId, files); 
                    taskObj.hasAttachment = true; 
                    taskObj.attachmentName = JSON.stringify(fileNamesArray); 
                    taskObj.history.push({ time: now.toISOString(), action: `อัปโหลดไฟล์เอกสารยุทธการ จำนวน ${files.length} ฉบับ`, user: logUser }); 
                } catch (err) { console.error(err); }
            }
            
            this.btnSubmitTaskModal.disabled = false;
            this.btnSubmitTaskModal.innerHTML = 'บันทึกภารกิจ';
        }

        this.saveData(); this.closeTaskModal();
        if (this.isCloudMode) { try { await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskObj) }); } catch (err) { console.error(err); } }
        this.switchView(this.currentView); this.showToast(id ? 'อัปเดตข้อมูลสำเร็จ' : 'บันทึกและมอบหมายงานสำเร็จ');
    }

    deleteTask(taskId) {
        if (confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกและลบภารกิจนี้?')) {
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            this.attachments.deleteAttachment(taskId).catch(e => e);
            this.saveData();
            if (this.isCloudMode) fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' }).catch(e => e);
            this.switchView(this.currentView); this.showToast('ลบและยกเลิกภารกิจเรียบร้อย', 'danger');
        }
    }

    viewTaskDetails(taskId) {
        const task = this.tasks.find(t => t.id === taskId); if (!task) return;
        const member = this.staff.find(m => m.id === task.assigneeId) || { name: 'ไม่มีผู้รับผิดชอบ', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=none' };

        this.detailTitle.textContent = task.name; this.detailDescription.textContent = task.description || 'ไม่มีรายละเอียดระบุไว้';
        this.detailSecrecyBadge.textContent = task.secrecy; this.detailSecrecyBadge.className = 'detail-secrecy-badge';
        if (task.secrecy === 'ลับที่สุด') this.detailSecrecyBadge.classList.add('secrecy-top-secret'); else if (task.secrecy === 'ลับมาก') this.detailSecrecyBadge.classList.add('secrecy-secret'); else if (task.secrecy === 'ลับ') this.detailSecrecyBadge.classList.add('secrecy-confidential'); else this.detailSecrecyBadge.classList.add('secrecy-normal');
        
        this.detailAssigneeAvatar.src = member.avatar; this.detailAssigneeName.textContent = member.name;
        this.detailStatusBadge.innerHTML = this.getStatusBadge(task.status); this.detailUrgencyBadge.innerHTML = this.getUrgencyBadge(task.urgency);
        this.detailStartDate.textContent = task.startDate; this.detailDeadline.textContent = task.deadline;

        if (this.isOverdue(task)) { this.detailOverdueBox.innerHTML = '<i class="fas fa-triangle-exclamation"></i> ภารกิจนี้เลยกำหนดส่งความมั่นคง!'; this.detailOverdueBox.classList.remove('d-none'); }
        else if (this.isDueSoon(task)) { this.detailOverdueBox.innerHTML = '<i class="fas fa-hourglass-half text-warning"></i> ภารกิจกำลังเข้าใกล้กำหนดส่งพิจารณา'; this.detailOverdueBox.classList.remove('d-none'); this.detailOverdueBox.className = 'meta-item text-warning'; }
        else { this.detailOverdueBox.classList.add('d-none'); }

        this.renderActivityLog(task.history); this.renderDetailModalFooter(task);

        // --- สร้างลิงก์สำหรับ Google Calendar และ Outlook ---
        const titleCal = encodeURIComponent(`[ยุทธการ] ${task.name}`);
        const detailsCal = encodeURIComponent(`รายละเอียด:\n${task.description}\n\nสถานะ: ${task.status}\nความเร่งด่วน: ${task.urgency}\nชั้นความลับ: ${task.secrecy}`);
        
        const startStr = task.startDate.replace(/-/g, '');
        const endDateObj = new Date(task.deadline);
        endDateObj.setDate(endDateObj.getDate() + 1);
        const endStr = endDateObj.toISOString().split('T')[0].replace(/-/g, '');

        const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titleCal}&details=${detailsCal}&dates=${startStr}/${endStr}`;
        const outlookCalUrl = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${titleCal}&body=${detailsCal}&startdt=${task.startDate}T00:00:00&enddt=${task.deadline}T23:59:59&allday=true`;

        const btnGoogle = document.getElementById('btnGoogleCal');
        const btnOutlook = document.getElementById('btnOutlookCal');
        if(btnGoogle) btnGoogle.href = googleCalUrl;
        if(btnOutlook) btnOutlook.href = outlookCalUrl;
        // ----------------------------------------------------

        if (task.hasAttachment) {
            this.detailPdfItem.classList.remove('d-none');
            if (this.pdfButtonsContainer) {
                this.pdfButtonsContainer.innerHTML = ''; 
                
                let fileNamesList = [];
                try {
                    fileNamesList = JSON.parse(task.attachmentName);
                    if (!Array.isArray(fileNamesList)) fileNamesList = [task.attachmentName];
                } catch (e) {
                    fileNamesList = [task.attachmentName];
                }

                fileNamesList.forEach((fName, index) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn btn-secondary';
                    btn.style = 'padding: 6px 10px; font-size: 11px; font-weight: 600; text-align: left; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                    btn.innerHTML = `<i class="fas fa-file-pdf text-danger"></i> เปิดดู: ${fName}`;
                    
                    btn.addEventListener('click', async () => {
                        if (this.isCloudMode) {
                            const kvKey = fileNamesList.length === 1 ? task.id : `${task.id}_${index}`;
                            window.open(`/api/pdf?taskId=${kvKey}`, '_blank');
                        } else {
                            btn.disabled = true;
                            const originalHtml = btn.innerHTML;
                            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังดึงไฟล์...';
                            try {
                                const record = await this.attachments.getAttachment(task.id);
                                if (record) {
                                    let fileDataToOpen = null;
                                    if (record.isMultiple && record.files && record.files[index]) fileDataToOpen = record.files[index].fileData;
                                    else if (record.fileData) fileDataToOpen = record.fileData;

                                    if (fileDataToOpen) window.open(URL.createObjectURL(fileDataToOpen), '_blank');
                                    else alert('ไม่พบข้อมูลไฟล์แนบนี้ในเครื่อง');
                                } else { alert('ไม่พบไฟล์แนบในฐานข้อมูล เครื่องนี้อาจจะไม่มีไฟล์ดังกล่าว หรือข้อมูลเสียหาย'); }
                            } catch (err) { alert('เกิดข้อผิดพลาดในการโหลดไฟล์ PDF'); } finally { btn.disabled = false; btn.innerHTML = originalHtml; }
                        }
                    });
                    this.pdfButtonsContainer.appendChild(btn);
                });
            }
        } else { this.detailPdfItem.classList.add('d-none'); }
        this.taskDetailModal.classList.add('show');
    }

    renderActivityLog(history) {
        this.detailActivityLog.innerHTML = '';
        const sortedHistory = [...history].sort((a, b) => new Date(b.time) - new Date(a.time));
        sortedHistory.forEach((log, index) => {
            const date = new Date(log.time); const formattedTime = date.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
            const item = document.createElement('div'); item.className = 'activity-item' + (index === 0 ? ' active-step' : '');
            item.innerHTML = `<strong>${log.action}</strong><span class="activity-time">${formattedTime} • ปฏิบัติโดย: ${log.user}</span>`;
            this.detailActivityLog.appendChild(item);
        });
    }

    renderDetailModalFooter(task) {
        this.detailModalFooter.innerHTML = '';
        if (this.currentUser === 'leader') {
            if (task.status === 'รอการอนุมัติ') {
                const btnReject = document.createElement('button'); btnReject.className = 'btn btn-secondary'; btnReject.innerHTML = '<i class="fas fa-rotate-left"></i> ส่งกลับปรับปรุงยุทธการ';
                btnReject.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'กำลังทำ', 'ส่งกลับเพื่อทบทวนแผนงานยุทธการ')); this.detailModalFooter.appendChild(btnReject);
                const btnApprove = document.createElement('button'); btnApprove.className = 'btn btn-success'; btnApprove.innerHTML = '<i class="fas fa-signature"></i> ลงนามอนุมัติงานยุทธการ';
                btnApprove.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'เสร็จสิ้น', 'หัวหน้าฝ่ายอนุมัติภารกิจเสร็จสิ้นเรียบร้อย')); this.detailModalFooter.appendChild(btnApprove);
            } else {
                const btnEdit = document.createElement('button'); btnEdit.className = 'btn btn-primary'; btnEdit.innerHTML = '<i class="fas fa-edit"></i> แก้ไขภารกิจ';
                btnEdit.addEventListener('click', () => { this.closeDetailModal(); this.openEditTaskModal(task.id); }); this.detailModalFooter.appendChild(btnEdit);
                const btnDelete = document.createElement('button'); btnDelete.className = 'btn btn-danger'; btnDelete.innerHTML = '<i class="fas fa-trash"></i> ยกเลิกภารกิจ';
                btnDelete.addEventListener('click', () => { this.closeDetailModal(); this.deleteTask(task.id); }); this.detailModalFooter.appendChild(btnDelete);
            }
        } else {
            if (task.status === 'รอดำเนินการ') {
                const btnStart = document.createElement('button'); btnStart.className = 'btn btn-primary'; btnStart.innerHTML = '<i class="fas fa-play"></i> เริ่มปฏิบัติภารกิจ';
                btnStart.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'กำลังทำ', 'รับเรื่องและเริ่มปฏิบัติการ')); this.detailModalFooter.appendChild(btnStart);
            } else if (task.status === 'กำลังทำ') {
                const btnReview = document.createElement('button'); btnReview.className = 'btn btn-success'; btnReview.innerHTML = '<i class="fas fa-paper-plane"></i> ส่งรายงานแผนต่อหัวหน้า';
                btnReview.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'รอการอนุมัติ', 'ร่างแผนงานเรียบร้อยและส่งขอการอนุมัติยุทธการ')); this.detailModalFooter.appendChild(btnReview);
            } else if (task.status === 'รอการอนุมัติ') {
                const label = document.createElement('span'); label.style.fontSize = '12px'; label.style.color = 'var(--text-muted)'; label.innerHTML = '<i class="fas fa-hourglass-half"></i> รายงานกำลังรออนุมัติ...'; this.detailModalFooter.appendChild(label);
            } else if (task.status === 'เสร็จสิ้น') {
                const label = document.createElement('span'); label.style.fontSize = '12px'; label.style.color = 'var(--color-done)'; label.innerHTML = '<i class="fas fa-circle-check"></i> ภารกิจบรรลุผลสำเร็จลุล่วงแล้ว'; this.detailModalFooter.appendChild(label);
            }
        }
    }

    updateTaskStatusAndHistory(taskId, newStatus, actionDescription) {
        const task = this.tasks.find(t => t.id === taskId); if (!task) return;
        const oldStatus = task.status; task.status = newStatus;
        const now = new Date(); const logUser = this.currentUser === 'leader' ? 'หัวหน้าฝ่ายยุทธการ' : this.currentUserName.textContent;
        task.history.push({ time: now.toISOString(), action: `${actionDescription} (จาก "${oldStatus}" -> "${newStatus}")`, user: logUser });
        this.saveData(); this.closeDetailModal();
        if (this.isCloudMode) { fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) }).catch(err => err); }
        this.switchView(this.currentView); this.showToast(`บันทึกสถานะ: ${newStatus}`);
    }

    closeDetailModal() { this.taskDetailModal.classList.remove('show'); }

    getUrgencyBadge(urgency) {
        let badgeClass = 'urgency-urgent'; if (urgency === 'ด่วนมาก') badgeClass = 'urgency-v-urgent'; if (urgency === 'ด่วนที่สุด') badgeClass = 'urgency-most-urgent';
        return `<span class="urgency-badge ${badgeClass}"><i class="fas fa-triangle-exclamation"></i> ${urgency}</span>`;
    }

    getSecrecyBadge(secrecy) {
        let badgeClass = 'secrecy-normal'; let icon = 'fa-lock-open';
        if (secrecy === 'ลับ') { badgeClass = 'secrecy-confidential'; icon = 'fa-key'; } if (secrecy === 'ลับมาก') { badgeClass = 'secrecy-secret'; icon = 'fa-lock'; } if (secrecy === 'ลับที่สุด') { badgeClass = 'secrecy-top-secret'; icon = 'fa-shield-halved'; }
        return `<span class="secrecy-badge ${badgeClass}"><i class="fas ${icon}"></i> ${secrecy}</span>`;
    }

    getStatusBadge(status) {
        let badgeClass = 'badge-todo'; if (status === 'กำลังทำ') badgeClass = 'badge-progress'; if (status === 'รอการอนุมัติ') badgeClass = 'badge-review'; if (status === 'เสร็จสิ้น') badgeClass = 'badge-done';
        return `<span class="status-badge ${badgeClass}">${status}</span>`;
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new App(); });
