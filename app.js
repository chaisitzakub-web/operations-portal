/**
 * Operations Portal - Application Logic (app.js)
 * เวอร์ชันปรับปรุงล่าสุด: ซ่อมแซมกราฟแท่ง แก้ไขสี Dropdown รายชื่อ และผูกท่อ Google Calendar สมบูรณ์แบบ
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
                    
                    if (this.chatOpen) {
                        this.scrollToBottomChat();
                    } else if (this.chatUnreadBadge) {
                        this.chatUnreadBadge.classList.remove('d-none');
                        this.chatUnreadBadge.textContent = '!';
                    }
                }
            }
        } catch (err) {}
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
        this.closeSidebarBtn.addEventListener('click', () => th
