/**
 * Operations Portal - Application Logic (app.js)
 * Systems: State Management, LocalStorage Persistence, Drag & Drop, Chart.js, Role Switcher
 */

// --- ATTACHMENTS FILE DATABASE (INDEXEDDB) ---
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
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'taskId' });
                }
            };
        });
    }

    saveAttachment(taskId, file) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject("Database not initialized");
                return;
            }
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const record = {
                taskId: taskId,
                fileName: file.name,
                fileType: file.type,
                fileData: file
            };

            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }

    getAttachment(taskId) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject("Database not initialized");
                return;
            }
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(taskId);
            
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e);
        });
    }

    deleteAttachment(taskId) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject("Database not initialized");
                return;
            }
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(taskId);
            
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }
}

// --- INITIAL STATES & DATA SEEDING ---
const DEFAULT_STAFF = [
    { id: 'staff-1', name: 'พ.ต. สมศักดิ์ รักชาติ', role: 'หัวหน้าชุดวางแผนยุทธการ', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=somsak' },
    { id: 'staff-2', name: 'ร.อ. วิชัย กล้าหาญ', role: 'นายทหารปฏิบัติการข่าวกรอง', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=wichai' },
    { id: 'staff-3', name: 'ร.ท. หญิง อารีรัตน์ ใจดี', role: 'นายทหารสื่อสารและการประสานงาน', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=areerat' }
];

const DEFAULT_TASKS = [
    {
        id: 'task-101',
        name: 'วางแผนลาดตระเวนเส้นทางชายแดนภาคเหนือ',
        description: 'จัดทำแผนยุทธการลาดตระเวนร่วมกับกองกำลังป้องกันชายแดน เพื่อสกัดกั้นการลักลอบเข้าเมืองโดยผิดกฎหมายและการขนส่งสิ่งของผิดกฎหมาย',
        assigneeId: 'staff-1',
        urgency: 'ด่วนที่สุด',
        secrecy: 'ลับมาก',
        startDate: '2026-06-25',
        deadline: '2026-07-02',
        status: 'กำลังทำ',
        history: [
            { time: '2026-06-25T08:30:00.000Z', action: 'สร้างภารกิจและมอบหมายงาน', user: 'หัวหน้าฝ่ายยุทธการ' },
            { time: '2026-06-25T09:00:00.000Z', action: 'เปลี่ยนสถานะเป็น กำลังทำ', user: 'พ.ต. สมศักดิ์ รักชาติ' }
        ]
    },
    {
        id: 'task-102',
        name: 'รายงานการประเมินภัยคุกคามทางไซเบอร์ไตรมาส 2',
        description: 'วิเคราะห์สถิติความพยายามโจมตีระบบเครือข่ายความมั่นคง และจัดทำข้อเสนอแนะในการปรับปรุงระบบป้องกันไฟร์วอลล์',
        assigneeId: 'staff-2',
        urgency: 'ด่วนมาก',
        secrecy: 'ลับที่สุด',
        startDate: '2026-06-20',
        deadline: '2026-06-28',
        status: 'รอการอนุมัติ',
        history: [
            { time: '2026-06-20T10:00:00.000Z', action: 'สร้างภารกิจและมอบหมายงาน', user: 'หัวหน้าฝ่ายยุทธการ' },
            { time: '2026-06-20T13:45:00.000Z', action: 'เปลี่ยนสถานะเป็น กำลังทำ', user: 'ร.อ. วิชัย กล้าหาญ' },
            { time: '2026-06-27T16:20:00.000Z', action: 'ส่งรายงานขออนุมัติงานยุทธการ', user: 'ร.อ. วิชัย กล้าหาญ' }
        ]
    },
    {
        id: 'task-103',
        name: 'ประสานงานฝึกร่วมคอบร้าโกลด์ประจำปี',
        description: 'จัดทำเอกสารความร่วมมือและการจัดสรรกำลังพลเข้าร่วมการฝึก ณ กองอำนวยการฝึกร่วม',
        assigneeId: 'staff-3',
        urgency: 'ด่วน',
        secrecy: 'ปกติ',
        startDate: '2026-06-26',
        deadline: '2026-07-15',
        status: 'รอดำเนินการ',
        history: [
            { time: '2026-06-26T11:15:00.000Z', action: 'สร้างภารกิจและมอบหมายงาน', user: 'หัวหน้าฝ่ายยุทธการ' }
        ]
    },
    {
        id: 'task-104',
        name: 'จัดทำแผนรักษาความปลอดภัยบุคคลสำคัญในพิธีเปิดหน่วยใหม่',
        description: 'ประสานงานฝ่ายสถานที่ กำหนดจุดรักษาการณ์ เส้นทางเดินรถ และจุดเผชิญเหตุฉุกเฉิน',
        assigneeId: 'staff-1',
        urgency: 'ด่วนที่สุด',
        secrecy: 'ลับ',
        startDate: '2026-06-18',
        deadline: '2026-06-26',
        status: 'เสร็จสิ้น',
        history: [
            { time: '2026-06-18T09:00:00.000Z', action: 'สร้างภารกิจและมอบหมายงาน', user: 'หัวหน้าฝ่ายยุทธการ' },
            { time: '2026-06-18T10:30:00.000Z', action: 'เปลี่ยนสถานะเป็น กำลังทำ', user: 'พ.ต. สมศักดิ์ รักชาติ' },
            { time: '2026-06-24T15:00:00.000Z', action: 'ส่งรายงานขออนุมัติงานยุทธการ', user: 'พ.ต. สมศักดิ์ รักชาติ' },
            { time: '2026-06-25T08:00:00.000Z', action: 'อนุมัติภารกิจเสร็จสมบูรณ์', user: 'หัวหน้าฝ่ายยุทธการ' }
        ]
    },
    {
        id: 'task-105',
        name: 'การปรับปรุงรหัสสื่อสารดาวเทียมทางทหาร',
        description: 'สลับเปลี่ยนกุญแจเข้ารหัสลับชุดใหม่สำหรับวิทยุสื่อสารดาวเทียมในเครือข่ายยุทธการทั้งหมด',
        assigneeId: 'staff-3',
        urgency: 'ด่วนที่สุด',
        secrecy: 'ลับที่สุด',
        startDate: '2026-06-28',
        deadline: '2026-06-30',
        status: 'กำลังทำ',
        history: [
            { time: '2026-06-28T08:00:00.000Z', action: 'สร้างภารกิจและมอบหมายงาน', user: 'หัวหน้าฝ่ายยุทธการ' },
            { time: '2026-06-28T09:12:00.000Z', action: 'เปลี่ยนสถานะเป็น กำลังทำ', user: 'ร.ท. หญิง อารีรัตน์ ใจดี' }
        ]
    }
];

class App {
    constructor() {
        this.staff = [];
        this.tasks = [];
        this.currentUser = 'leader'; // 'leader' or 'staff-1', 'staff-2' etc.
        this.currentView = 'leader-dashboard';
        this.isCloudMode = false;
        
        // Chart instances
        this.statusChartInstance = null;
        this.staffChartInstance = null;
        
        // Drag and Drop active target card
        this.draggedCardId = null;
        // Track editing staff
        this.editingStaffId = null; 

        // Initialize DOM Elements
        this.initDOMElements();
        // Load data from LocalStorage or seed defaults
        this.loadData();
        // Set up Event Listeners
        this.setupEventListeners();
        // Start live clock
        this.startClock();

        // Initialize IndexedDB Attachment Store
        this.attachments = new AttachmentStore();
        this.attachments.init().then(async () => {
            console.log("IndexedDB Initialized.");
            // Sync with Cloudflare Pages API
            await this.syncWithCloudflare();
            // We render after DB is loaded to ensure files indicator can function
            this.render();
        }).catch(async err => {
            console.error("IndexedDB initialization failed", err);
            await this.syncWithCloudflare();
            // Fallback render
            this.render();
        });
    }

    initDOMElements() {
        // Layout Elements
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

        // Views
        this.views = {
            'leader-dashboard': document.getElementById('viewLeaderDashboard'),
            'leader-tasks': document.getElementById('viewLeaderTasks'),
            'leader-team': document.getElementById('viewLeaderTeam'),
            'staff-kanban': document.getElementById('viewStaffKanban'),
            'staff-tasks': document.getElementById('viewStaffTasks')
        };

        // Leader Dashboard Statistics Elements
        this.statTotalTasks = document.getElementById('statTotalTasks');
        this.statInProgressTasks = document.getElementById('statInProgressTasks');
        this.statReviewTasks = document.getElementById('statReviewTasks');
        this.statCompletedTasks = document.getElementById('statCompletedTasks');
        this.statOverdueTasks = document.getElementById('statOverdueTasks');
        this.teamProgressTableBody = document.querySelector('#teamProgressTable tbody');

        // Leader Task Filter Elements
        this.filterAssignee = document.getElementById('filterAssignee');
        this.filterUrgency = document.getElementById('filterUrgency');
        this.filterSecrecy = document.getElementById('filterSecrecy');
        this.filterStatus = document.getElementById('filterStatus');
        this.searchTask = document.getElementById('searchTask');
        this.masterTasksTableBody = document.querySelector('#masterTasksTable tbody');

        // Leader Team Management Elements
        this.addMemberForm = document.getElementById('addMemberForm');
        this.memberNameInput = document.getElementById('memberName');
        this.memberRoleInput = document.getElementById('memberRole');
        this.avatarOptionsContainer = document.getElementById('avatarOptions');
        this.selectedAvatarInput = document.getElementById('selectedAvatar');
        this.teamGridCards = document.getElementById('teamGridCards');

        // Staff Kanban Elements
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

        // Task Form Modal Elements
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

        // Task Detail Modal Elements
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

        // PDF Attachment Elements
        this.pdfUploadRow = document.getElementById('pdfUploadRow');
        this.taskPdfInput = document.getElementById('taskPdf');
        this.pdfUploadStatus = document.getElementById('pdfUploadStatus');
        this.detailPdfItem = document.getElementById('detailPdfItem');
        this.btnViewPdf = document.getElementById('btnViewPdf');

        // Toast
        this.toastContainer = document.getElementById('toastContainer');
    }

    loadData() {
        const storedData = localStorage.getItem('operations_portal_data');
        if (storedData) {
            try {
                const parsed = JSON.parse(storedData);
                this.staff = parsed.staff || DEFAULT_STAFF;
                this.tasks = parsed.tasks || DEFAULT_TASKS;
            } catch (e) {
                console.error("Error parsing stored data, resetting to defaults", e);
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
        const dataToStore = {
            staff: this.staff,
            tasks: this.tasks
        };
        localStorage.setItem('operations_portal_data', JSON.stringify(dataToStore));
    }

    async syncWithCloudflare() {
        this.isCloudMode = window.location.protocol.startsWith('http');
        if (!this.isCloudMode) {
            console.log("Local File Mode. Storing data in LocalStorage + IndexedDB.");
            return;
        }

        console.log("Cloud Mode. Syncing with Cloudflare D1/KV.");
        try {
            // Fetch staff
            const staffRes = await fetch('/api/staff');
            if (staffRes.ok) {
                const staffData = await staffRes.json();
                if (staffData && staffData.length > 0) {
                    this.staff = staffData;
                }
            }

            // Fetch tasks
            const tasksRes = await fetch('/api/tasks');
            if (tasksRes.ok) {
                const tasksData = await tasksRes.json();
                if (tasksData && tasksData.length > 0) {
                    this.tasks = tasksData;
                }
            }
            
            // Cache in LocalStorage
            this.saveData();
        } catch (err) {
            console.error("Cloudflare sync failed, using LocalStorage cache:", err);
            this.showToast("การเชื่อมต่อคลาวด์ขัดข้อง กำลังใช้งานฐานข้อมูลสำรองในเครื่อง", "warning");
        }
    }

    setupEventListeners() {
        // Role Selection
        this.roleSelector.addEventListener('change', (e) => {
            this.switchRole(e.target.value);
        });

        // Sidebar Navigation links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                this.switchView(view);
                // Close sidebar on mobile
                this.sidebar.classList.remove('show');
            });
        });

        // Mobile Sidebar toggler
        this.toggleSidebarBtn.addEventListener('click', () => {
            this.sidebar.classList.add('show');
        });

        this.closeSidebarBtn.addEventListener('click', () => {
            this.sidebar.classList.remove('show');
        });

        // Theme Toggle
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
            // Re-render charts for theme compatibility
            this.renderCharts();
        });

        // Open Task Create Modal
        this.btnCreateTask.addEventListener('click', () => {
            this.openCreateTaskModal();
        });

        // Close Modals
        this.btnCancelTaskModal.addEventListener('click', () => this.closeTaskModal());
        this.taskModalCloseBtn.addEventListener('click', () => this.closeTaskModal());
        this.taskDetailCloseBtn.addEventListener('click', () => this.closeDetailModal());

        // Submit Task Form
        this.taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitTaskForm();
        });

        // Add Member Form
        this.addMemberForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addNewMember();
        });

        // Drag and Drop Column Listeners
        const columns = document.querySelectorAll('.kanban-column');
        columns.forEach(column => {
            column.addEventListener('dragover', (e) => this.handleDragOver(e));
            column.addEventListener('dragenter', (e) => this.handleDragEnter(e, column));
            column.addEventListener('dragleave', (e) => this.handleDragLeave(e, column));
            column.addEventListener('drop', (e) => this.handleDrop(e, column));
        });

        // Filters listeners (Leader Tasks view)
        const filters = [this.filterAssignee, this.filterUrgency, this.filterSecrecy, this.filterStatus];
        filters.forEach(filter => {
            filter.addEventListener('change', () => this.renderMasterTaskListTable());
        });
        this.searchTask.addEventListener('input', () => this.renderMasterTaskListTable());

        // Show/Hide PDF Upload field based on status select
        this.taskStatusInput.addEventListener('change', () => {
            this.pdfUploadRow.style.display = (this.taskStatusInput.value === 'เสร็จสิ้น') ? 'grid' : 'none';
        });

        // File selection status update
        this.taskPdfInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            this.pdfUploadStatus.textContent = file ? `เลือกไฟล์แล้ว: ${file.name}` : 'ไม่มีไฟล์ที่แนบไว้';
        });

        // Close modals on clicking backdrop
        window.addEventListener('click', (e) => {
            if (e.target === this.taskModal) this.closeTaskModal();
            if (e.target === this.taskDetailModal) this.closeDetailModal();
        });
    }

    startClock() {
        const liveTimeEl = document.getElementById('liveTime');
        const updateTime = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            liveTimeEl.textContent = timeStr;
        };
        updateTime();
        setInterval(updateTime, 1000);
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconClass = 'fa-circle-check';
        if (type === 'warning') iconClass = 'fa-triangle-exclamation';
        if (type === 'danger') iconClass = 'fa-circle-xmark';
        if (type === 'info') iconClass = 'fa-circle-info';

        toast.innerHTML = `
            <i class="fas ${iconClass} toast-icon"></i>
            <span class="toast-msg">${message}</span>
        `;
        
        this.toastContainer.appendChild(toast);
        
        // Remove toast after 3.5 seconds
        setTimeout(() => {
            toast.style.animation = 'toast-in 0.3s reverse forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3500);
    }

    // --- VIEW CONTROLLER ---
    switchView(viewName) {
        // Toggle view elements
        Object.keys(this.views).forEach(name => {
            if (name === viewName) {
                this.views[name].classList.remove('d-none');
                this.views[name].classList.add('active');
            } else {
                this.views[name].classList.remove('active');
                this.views[name].classList.add('d-none');
            }
        });

        // Set Nav Links active
        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('data-view') === viewName) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        this.currentView = viewName;

        // Set Page Title
        let thaiTitle = 'ภาพรวมยุทธการ';
        switch (viewName) {
            case 'leader-dashboard': thaiTitle = 'แดชบอร์ดภาพรวมยุทธการ'; break;
            case 'leader-tasks': thaiTitle = 'แฟ้มสะสมภารกิจฝ่ายยุทธการ'; break;
            case 'leader-team': thaiTitle = 'บัญชีรายชื่อกำลังพล'; break;
            case 'staff-kanban': thaiTitle = 'กระดานปฏิบัติการทางยุทธการ'; break;
            case 'staff-tasks': thaiTitle = 'รายการปฏิบัติการเดี่ยว'; break;
        }
        this.pageTitle.innerHTML = thaiTitle;

        // Trigger view-specific rendering
        if (viewName === 'leader-dashboard') {
            this.renderLeaderDashboard();
        } else if (viewName === 'leader-tasks') {
            this.renderMasterTaskListTable();
        } else if (viewName === 'leader-team') {
            this.renderTeamMembers();
        } else if (viewName === 'staff-kanban') {
            this.renderStaffKanban();
        } else if (viewName === 'staff-tasks') {
            this.renderStaffTaskListTable();
        }
    }

    switchRole(roleVal) {
        this.currentUser = roleVal;
        
        // Populate profile bottom UI
        if (roleVal === 'leader') {
            this.currentUserName.textContent = 'หัวหน้าฝ่ายยุทธการ';
            this.currentUserRoleText.textContent = 'ผู้บังคับบัญชา';
            this.currentUserAvatar.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=leader';
            
            // Adjust Nav bar menu groups
            this.leaderNav.classList.remove('d-none');
            this.staffNav.classList.add('d-none');

            // Show task creation
            this.btnCreateTask.classList.remove('d-none');

            // Default view to dashboard
            this.switchView('leader-dashboard');
        } else {
            const member = this.staff.find(m => m.id === roleVal);
            if (member) {
                this.currentUserName.textContent = member.name;
                this.currentUserRoleText.textContent = member.role;
                this.currentUserAvatar.src = member.avatar;

                // Adjust Nav bar menu groups
                this.leaderNav.classList.add('d-none');
                this.staffNav.classList.remove('d-none');

                // Hide create task from sidebar header if not Leader, wait, we let them create for themselves, but let's hide the top header button, and they can add on Kanban column or we keep it and autoassign. Let's hide the top-header "+ สร้างภารกิจ" button for staff to ensure operations are structured.
                this.btnCreateTask.classList.add('d-none');

                // Default view to staff kanban
                this.switchView('staff-kanban');
            }
        }
        this.showToast(`เปลี่ยนการทำงานเป็น: ${this.currentUserName.textContent}`, 'info');
    }

    // --- RENDER CONTROLLERS ---
    render() {
        this.populateRoleSwitcher();
        this.populateAssigneeDropdowns();
        
        if (this.currentUser === 'leader') {
            this.switchView('leader-dashboard');
        } else {
            this.switchView('staff-kanban');
        }
    }

    populateRoleSwitcher() {
        this.roleSelector.innerHTML = '';
        
        // Add Leader Option
        const optLeader = document.createElement('option');
        optLeader.value = 'leader';
        optLeader.textContent = 'หัวหน้าฝ่ายยุทธการ (Leader)';
        optLeader.selected = (this.currentUser === 'leader');
        this.roleSelector.appendChild(optLeader);

        // Add Staff Options
        this.staff.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = `${member.name} (เจ้าหน้าที่)`;
            opt.selected = (this.currentUser === member.id);
            this.roleSelector.appendChild(opt);
        });
    }

    populateAssigneeDropdowns() {
        // For task form
        this.taskAssigneeInput.innerHTML = '';
        this.staff.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = `${member.name} - ${member.role}`;
            this.taskAssigneeInput.appendChild(opt);
        });

        // For filter bar
        this.filterAssignee.innerHTML = '<option value="all">ทั้งหมด</option>';
        this.staff.forEach(member => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = member.name;
            this.filterAssignee.appendChild(opt);
        });
    }

    // Check if task is overdue
    isOverdue(task) {
        if (task.status === 'เสร็จสิ้น') return false;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const deadline = new Date(task.deadline);
        deadline.setHours(0, 0, 0, 0);
        return now > deadline;
    }

    // Check if task is due in 24 hours
    isDueSoon(task) {
        if (task.status === 'เสร็จสิ้น') return false;
        if (this.isOverdue(task)) return false;
        
        const now = new Date();
        const deadline = new Date(task.deadline);
        const diffTime = deadline - now;
        const diffHours = diffTime / (1000 * 60 * 60);
        return diffHours >= 0 && diffHours <= 24;
    }

    // --- LEADER VIEWS: DASHBOARD & STATS ---
    renderLeaderDashboard() {
        // Calculate Statistics
        const total = this.tasks.length;
        const inProgress = this.tasks.filter(t => t.status === 'กำลังทำ').length;
        const underReview = this.tasks.filter(t => t.status === 'รอการอนุมัติ').length;
        const completed = this.tasks.filter(t => t.status === 'เสร็จสิ้น').length;
        const overdue = this.tasks.filter(t => this.isOverdue(t)).length;

        // Render Summary Cards
        this.statTotalTasks.textContent = total;
        this.statInProgressTasks.textContent = inProgress;
        this.statReviewTasks.textContent = underReview;
        this.statCompletedTasks.textContent = completed;
        this.statOverdueTasks.textContent = overdue;

        // Render Charts
        this.renderCharts();

        // Render Team progress table
        this.renderTeamProgressTable();
    }

    renderCharts() {
        // Destroy existing chart instances first to avoid hover flickering
        if (this.statusChartInstance) this.statusChartInstance.destroy();
        if (this.staffChartInstance) this.staffChartInstance.destroy();

        // Check if elements are visible (in viewport/DOM)
        const statusChartCanvas = document.getElementById('statusChart');
        const staffChartCanvas = document.getElementById('staffChart');
        if (!statusChartCanvas || !staffChartCanvas) return;

        // Theme colors for Chart Text
        const isLightTheme = document.body.classList.contains('light-theme');
        const textColor = isLightTheme ? '#4b5563' : '#9ca3af';
        const gridColor = isLightTheme ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';

        // 1. Status Chart (Doughnut)
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
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: { family: 'Prompt', size: 12 }
                        }
                    }
                }
            }
        });

        // 2. Staff Tasks Chart (Stacked Horizontal Bar: Completed vs Total)
        const staffNames = [];
        const completedData = [];
        const incompletedData = [];

        this.staff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id);
            const comp = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            const incomp = memberTasks.length - comp;

            staffNames.push(member.name.split(' ').slice(0, 2).join(' ')); // Short name (Rank + Name)
            completedData.push(comp);
            incompletedData.push(incomp);
        });

        this.staffChartInstance = new Chart(staffChartCanvas, {
            type: 'bar',
            data: {
                labels: staffNames,
                datasets: [
                    {
                        label: 'เสร็จสิ้น (Done)',
                        data: completedData,
                        backgroundColor: '#10b981',
                        borderRadius: 4
                    },
                    {
                        label: 'กำลังปฏิบัติ/รออนุมัติ/รอดำเนินการ',
                        data: incompletedData,
                        backgroundColor: '#3b82f6',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Prompt' } }
                    },
                    y: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: textColor, font: { family: 'Prompt' } }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: { family: 'Prompt', size: 12 }
                        }
                    }
                }
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

    // --- LEADER VIEW: ALL TASKS TABLE ---
    renderMasterTaskListTable() {
        this.masterTasksTableBody.innerHTML = '';
        
        // Fetch Filter values
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
                if (fStatus === 'overdue') {
                    matchStatus = this.isOverdue(task);
                } else {
                    matchStatus = (task.status === fStatus);
                }
            }

            const matchSearch = !fSearch || 
                task.name.toLowerCase().includes(fSearch) || 
                task.description.toLowerCase().includes(fSearch);

            return matchAssignee && matchUrgency && matchSecrecy && matchStatus && matchSearch;
        });

        if (filteredTasks.length === 0) {
            this.masterTasksTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
                        <i class="fas fa-box-open" style="font-size: 30px; margin-bottom: 10px; display: block;"></i>
                        ไม่พบข้อมูลยุทธการที่ต้องการค้นหา
                    </td>
                </tr>
            `;
            return;
        }

        filteredTasks.forEach(task => {
            const member = this.staff.find(m => m.id === task.assigneeId) || { name: 'ไม่มีผู้รับผิดชอบ', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=none' };
            const tr = document.createElement('tr');
            
            // Format deadline alert status
            let deadlineClass = '';
            let overdueBadgeText = '';
            if (this.isOverdue(task)) {
                deadlineClass = 'deadline-danger';
                overdueBadgeText = ' <span class="badge-overdue status-badge">เลยกำหนดส่ง</span>';
            } else if (this.isDueSoon(task)) {
                deadlineClass = 'deadline-warning';
                overdueBadgeText = ' <span class="badge-progress status-badge">ส่งใน 24 ชม.</span>';
            }

            // Badges
            const urgencyBadge = this.getUrgencyBadge(task.urgency);
            const secrecyBadge = this.getSecrecyBadge(task.secrecy);
            const statusBadge = this.getStatusBadge(task.status);

            tr.innerHTML = `
                <td>
                    <strong>${task.name} ${task.hasAttachment ? '<i class="fas fa-file-pdf text-danger" title="มีไฟล์เอกสารแนบ" style="margin-left: 5px;"></i>' : ''}</strong>
                    <div style="font-size: 11px; color: var(--text-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px;">
                        ${task.description}
                    </div>
                </td>
                <td>
                    <div class="table-user">
                        <img src="${member.avatar}" alt="Avatar" class="avatar-xs">
                        <span class="table-user-name">${member.name}</span>
                    </div>
                </td>
                <td>${urgencyBadge}</td>
                <td>${secrecyBadge}</td>
                <td>${task.startDate}</td>
                <td class="${deadlineClass}">
                    ${task.deadline}
                    ${overdueBadgeText}
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px;" onclick="app.viewTaskDetails('${task.id}')" title="ดูรายละเอียด">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px; color: var(--primary);" onclick="app.openEditTaskModal('${task.id}')" title="แก้ไข">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px; color: var(--color-overdue);" onclick="app.deleteTask('${task.id}')" title="ลบงาน">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            this.masterTasksTableBody.appendChild(tr);
        });
    }

    // --- LEADER VIEW: TEAM MEMBERS MANAGEMENT ---
    renderTeamMembers() {
        // Render current cards
        this.teamGridCards.innerHTML = '';
        
        this.staff.forEach(member => {
            const memberTasks = this.tasks.filter(t => t.assigneeId === member.id);
            const done = memberTasks.filter(t => t.status === 'เสร็จสิ้น').length;
            const active = memberTasks.length - done;

            const card = document.createElement('div');
            card.className = 'team-member-card glass-card';
            card.innerHTML = `
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 8px;">
                    <button onclick="app.editMember('${member.id}')" title="แก้ไขข้อมูลเจ้าหน้าที่" style="background: transparent; border: none; color: #3b82f6; cursor: pointer; font-size: 16px;">
                        <i class="fas fa-user-pen"></i>
                    </button>
                    <button class="btn-remove-member" onclick="app.removeMember('${member.id}')" title="ลบกำลังพลออกจากระบบ" style="position: static; margin: 0;">
                        <i class="fas fa-user-minus"></i>
                    </button>
                </div>
                <div class="member-avatar-box" style="margin-top: 15px;">
                    <img src="${member.avatar}" alt="Avatar" class="avatar-lg">
                </div>
                <div class="member-name">${member.name}</div>
                <div class="member-role">${member.role}</div>
                <div class="member-task-stats">
                    <div class="member-stat">
                        <span class="member-stat-num text-warning">${active}</span>
                        <span class="member-stat-lbl">งานค้าง</span>
                    </div>
                    <div class="member-stat" style="border-left: 1px solid var(--glass-border); padding-left: 15px;">
                        <span class="member-stat-num text-success">${done}</span>
                        <span class="member-stat-lbl">เสร็จแล้ว</span>
                    </div>
                </div>
            `;
            this.teamGridCards.appendChild(card);
        });

        // Seed avatar choices in the form
        this.avatarOptionsContainer.innerHTML = '';
        const seeds = ['sam', 'jack', 'toby', 'leo', 'max', 'milo', 'charlie', 'buddy'];
        seeds.forEach((seed, index) => {
            const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Avatar option';
            img.className = 'avatar-opt' + (index === 0 ? ' selected' : '');
            img.addEventListener('click', () => {
                document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected'));
                img.classList.add('selected');
                this.selectedAvatarInput.value = url;
            });
            this.avatarOptionsContainer.appendChild(img);
        });
        // Default value
        this.selectedAvatarInput.value = `https://api.dicebear.com/7.x/bottts/svg?seed=${seeds[0]}`;
    }

    addNewMember() {
        const name = this.memberNameInput.value.trim();
        const role = this.memberRoleInput.value.trim();
        const avatar = this.selectedAvatarInput.value;

        if (!name || !role) return;

        let memberData;

        if (this.editingStaffId) {
            // โหมดแก้ไข (Edit Mode)
            const index = this.staff.findIndex(m => m.id === this.editingStaffId);
            if (index !== -1) {
                this.staff[index].name = name;
                this.staff[index].role = role;
                this.staff[index].avatar = avatar;
                memberData = this.staff[index];
            }
        } else {
            // โหมดเพิ่มใหม่ (Add Mode)
            memberData = {
                id: `staff-${Date.now()}`,
                name,
                role,
                avatar
            };
            this.staff.push(memberData);
        }

        this.saveData();
        
        if (this.isCloudMode && memberData) {
            fetch('/api/staff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(memberData)
            }).catch(err => console.error("Error syncing staff to D1", err));
        }
        
        const isEdit = !!this.editingStaffId;
        this.resetMemberForm(); // ล้างฟอร์ม
        
        this.populateRoleSwitcher();
        this.populateAssigneeDropdowns();
        this.renderTeamMembers();
        
        this.showToast(isEdit ? `แก้ไขข้อมูล "${name}" สำเร็จ` : `เพิ่มรายชื่อเจ้าหน้าที่ "${name}" สำเร็จ`);
    }

    removeMember(memberId) {
        const member = this.staff.find(m => m.id === memberId);
        if (!member) return;

        // Check if member has active tasks
        const activeTasks = this.tasks.filter(t => t.assigneeId === memberId && t.status !== 'เสร็จสิ้น');
        if (activeTasks.length > 0) {
            alert(`ไม่สามารถลบรายชื่อได้ เนื่องจาก "${member.name}" ยังมีภารกิจค้างปฏิบัติอยู่จำนวน ${activeTasks.length} รายการ กรุณามอบหมายงานใหม่ให้เจ้าหน้าที่ท่านอื่นก่อนลบ`);
            return;
        }

        if (confirm(`คุณต้องการลบรายชื่อ "${member.name}" ออกจากระบบหรือไม่?`)) {
            // Re-assign completed tasks to a dummy id or delete them. Let's keep them and mark assignee as 'deleted'
            this.tasks.forEach(t => {
                if (t.assigneeId === memberId) {
                    t.assigneeId = 'deleted';
                }
            });

            this.staff = this.staff.filter(m => m.id !== memberId);
            
            if (this.isCloudMode) {
                fetch(`/api/staff?id=${memberId}`, { method: 'DELETE' })
                    .catch(err => console.error("Error deleting staff from D1", err));
            }
            
            // If current logged-in user is deleted, force switch to Leader
            if (this.currentUser === memberId) {
                this.switchRole('leader');
            } else {
                this.saveData();
                this.populateRoleSwitcher();
                this.populateAssigneeDropdowns();
                this.renderTeamMembers();
            }
            this.showToast(`ลบรายชื่อเจ้าหน้าที่สำเร็จ`, 'warning');
        }
    }
    
    editMember(memberId) {
        const member = this.staff.find(m => m.id === memberId);
        if (!member) return;

        // บันทึก ID ที่กำลังแก้ไข และดึงข้อมูลเดิมไปใส่ในฟอร์ม
        this.editingStaffId = memberId;
        this.memberNameInput.value = member.name;
        this.memberRoleInput.value = member.role;
        this.selectedAvatarInput.value = member.avatar;

        // อัปเดตไฮไลท์ภาพอวตาร
        document.querySelectorAll('.avatar-opt').forEach(el => {
            if (el.src === member.avatar) el.classList.add('selected');
            else el.classList.remove('selected');
        });

        // เปลี่ยนหน้าตาฟอร์มให้รู้ว่ากำลัง "แก้ไข"
        const formTitle = this.addMemberForm.parentElement.querySelector('.card-title');
        if (formTitle) formTitle.innerHTML = '<i class="fas fa-user-pen"></i> แก้ไขข้อมูลเจ้าหน้าที่';
        
        const submitBtn = this.addMemberForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
        
        // สร้างปุ่มยกเลิก (ถ้ายังไม่มี)
        let cancelBtn = document.getElementById('cancelEditBtn');
        if (!cancelBtn) {
            cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancelEditBtn';
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-secondary btn-block';
            cancelBtn.style.marginTop = '10px';
            cancelBtn.innerHTML = '<i class="fas fa-times"></i> ยกเลิกการแก้ไข';
            cancelBtn.onclick = () => this.resetMemberForm();
            this.addMemberForm.appendChild(cancelBtn);
        }
        cancelBtn.style.display = 'block';

        // เลื่อนหน้าจอไปหาฟอร์ม
        this.addMemberForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    resetMemberForm() {
        this.editingStaffId = null;
        this.memberNameInput.value = '';
        this.memberRoleInput.value = '';
        
        // รีเซ็ตอวตารกลับไปตัวแรกสุด
        const firstAvatar = document.querySelector('.avatar-opt');
        if (firstAvatar) {
            document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected'));
            firstAvatar.classList.add('selected');
            this.selectedAvatarInput.value = firstAvatar.src;
        }

        // คืนค่าหน้าตาฟอร์มกลับเป็นโหมด "เพิ่มใหม่"
        const formTitle = this.addMemberForm.parentElement.querySelector('.card-title');
        if (formTitle) formTitle.innerHTML = '<i class="fas fa-user-plus"></i> เพิ่มเจ้าหน้าที่ยุทธการคนใหม่';
        
        const submitBtn = this.addMemberForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-plus"></i> เพิ่มเจ้าหน้าที่เข้าระบบ';

        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    // --- STAFF VIEW: KANBAN BOARD & DRAG-DROP ---
    renderStaffKanban() {
        const member = this.staff.find(m => m.id === this.currentUser);
        if (!member) return;

        // Profile Header Info
        this.staffProfileAvatar.src = member.avatar;
        this.staffProfileName.textContent = member.name;
        this.staffProfileRole.textContent = member.role;

        // Fetch user tasks
        const userTasks = this.tasks.filter(t => t.assigneeId === this.currentUser);

        // Update stats
        const todo = userTasks.filter(t => t.status === 'รอดำเนินการ');
        const progress = userTasks.filter(t => t.status === 'กำลังทำ');
        const review = userTasks.filter(t => t.status === 'รอการอนุมัติ');
        const done = userTasks.filter(t => t.status === 'เสร็จสิ้น');

        this.staffStatTodo.textContent = todo.length;
        this.staffStatProgress.textContent = progress.length;
        this.staffStatReview.textContent = review.length;
        this.staffStatDone.textContent = done.length;

        document.getElementById('countTodo').textContent = todo.length;
        document.getElementById('countProgress').textContent = progress.length;
        document.getElementById('countReview').textContent = review.length;
        document.getElementById('countDone').textContent = done.length;

        // Populate Columns
        this.populateKanbanColumn(this.kanbanTodo, todo);
        this.populateKanbanColumn(this.kanbanProgress, progress);
        this.populateKanbanColumn(this.kanbanReview, review);
        this.populateKanbanColumn(this.kanbanDone, done);
    }

    populateKanbanColumn(container, taskList) {
        container.innerHTML = '';
        if (taskList.length === 0) {
            container.innerHTML = `
                <div class="empty-column-placeholder" style="border: 2px dashed rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 25px; text-align: center; font-size: 12px; color: var(--text-muted); pointer-events: none;">
                    ไม่มีภารกิจในคอลัมน์นี้
                </div>
            `;
            return;
        }

        taskList.forEach(task => {
            const card = document.createElement('div');
            
            // Get secrecy class
            let secrecyClass = 'kanban-card-normal';
            if (task.secrecy === 'ลับที่สุด') secrecyClass = 'kanban-card-top-secret';
            else if (task.secrecy === 'ลับมาก') secrecyClass = 'kanban-card-secret';
            else if (task.secrecy === 'ลับ') secrecyClass = 'kanban-card-confidential';

            card.className = `kanban-card glass-card ${secrecyClass}`;
            card.draggable = true;
            card.dataset.id = task.id;

            // Handle overdue styling
            let deadlineClass = '';
            let dateIcon = 'far fa-calendar-check';
            if (this.isOverdue(task)) {
                deadlineClass = 'deadline-danger';
                dateIcon = 'fas fa-calendar-times';
            } else if (this.isDueSoon(task)) {
                deadlineClass = 'deadline-warning';
                dateIcon = 'fas fa-hourglass-half';
            }

            card.innerHTML = `
                <div class="card-header-meta">
                    ${this.getUrgencyBadge(task.urgency)}
                    ${this.getSecrecyBadge(task.secrecy)}
                </div>
                <h4 class="card-task-title">${task.name} ${task.hasAttachment ? '<i class="fas fa-file-pdf text-danger" title="มีไฟล์เอกสารแนบ" style="margin-left: 5px;"></i>' : ''}</h4>
                <p class="card-task-desc">${task.description}</p>
                <div class="card-footer">
                    <div class="card-dates">
                        <span class="card-date-item"><i class="far fa-calendar-plus"></i> เริ่ม: ${task.startDate}</span>
                        <span class="card-date-item ${deadlineClass}"><i class="${dateIcon}"></i> ส่ง: ${task.deadline}</span>
                    </div>
                    <div class="card-actions">
                        <button class="card-btn-edit" onclick="event.stopPropagation(); app.viewTaskDetails('${task.id}')" title="ดูรายละเอียดภารกิจ">
                            <i class="fas fa-expand"></i>
                        </button>
                    </div>
                </div>
            `;

            // Drag events
            card.addEventListener('dragstart', (e) => this.handleDragStart(e, task.id));
            card.addEventListener('dragend', () => this.handleDragEnd(card));
            card.addEventListener('click', () => this.viewTaskDetails(task.id));

            container.appendChild(card);
        });
    }

    // --- DRAG AND DROP HANDLERS ---
    handleDragStart(e, taskId) {
        this.draggedCardId = taskId;
        e.dataTransfer.setData('text/plain', taskId);
        // Delay to allow opacity style
        setTimeout(() => {
            const card = document.querySelector(`.kanban-card[data-id="${taskId}"]`);
            if (card) card.classList.add('dragging');
        }, 0);
    }

    handleDragEnd(card) {
        card.classList.remove('dragging');
        this.draggedCardId = null;
    }

    handleDragOver(e) {
        e.preventDefault(); // Required to allow drop
    }

    handleDragEnter(e, column) {
        e.preventDefault();
        column.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        column.style.borderColor = 'var(--primary)';
    }

    handleDragLeave(e, column) {
        column.style.backgroundColor = '';
        column.style.borderColor = '';
    }

    handleDrop(e, column) {
        e.preventDefault();
        column.style.backgroundColor = '';
        column.style.borderColor = '';

        const taskId = e.dataTransfer.getData('text/plain') || this.draggedCardId;
        if (!taskId) return;

        const task = this.tasks.find(t => t.id === taskId);
        const newStatus = column.getAttribute('data-status');

        if (task && task.status !== newStatus) {
            const oldStatus = task.status;
            
            // Check if status requires review. Let's update and log
            task.status = newStatus;
            
            // Push activity log
            const now = new Date();
            const logEntry = {
                time: now.toISOString(),
                action: `ย้ายสถานะจาก "${oldStatus}" ไปยัง "${newStatus}" (Drag & Drop)`,
                user: this.currentUserName.textContent
            };
            task.history.push(logEntry);
            
            this.saveData();
            this.renderStaffKanban();
            
            if (this.isCloudMode) {
                fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(task)
                }).catch(err => console.error("Error syncing drag-drop status to D1", err));
            }
            
            this.showToast(`ย้ายภารกิจไปยัง "${newStatus}" เรียบร้อย`);
        }
    }

    // --- STAFF VIEW: MY TASKS LIST TABLE ---
    renderStaffTaskListTable() {
        this.staffTasksTableBody.innerHTML = '';
        this.staffTaskListTitle.innerHTML = `<i class="fas fa-folder-open"></i> รายการยุทธการทั้งหมดของ: ${this.currentUserName.textContent}`;

        const userTasks = this.tasks.filter(t => t.assigneeId === this.currentUser);

        if (userTasks.length === 0) {
            this.staffTasksTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">
                        <i class="fas fa-box-open" style="font-size: 30px; margin-bottom: 10px; display: block;"></i>
                        ไม่มีภารกิจทางยุทธการในบัญชี
                    </td>
                </tr>
            `;
            return;
        }

        userTasks.forEach(task => {
            const tr = document.createElement('tr');
            
            let deadlineClass = '';
            let overdueText = '';
            if (this.isOverdue(task)) {
                deadlineClass = 'deadline-danger';
                overdueText = ' <span class="badge-overdue status-badge">เลยกำหนด</span>';
            } else if (this.isDueSoon(task)) {
                deadlineClass = 'deadline-warning';
                overdueText = ' <span class="badge-progress status-badge">ด่วน (24ชม)</span>';
            }

            tr.innerHTML = `
                <td>
                    <strong>${task.name} ${task.hasAttachment ? '<i class="fas fa-file-pdf text-danger" title="มีไฟล์เอกสารแนบ" style="margin-left: 5px;"></i>' : ''}</strong>
                    <div style="font-size: 11px; color: var(--text-muted); max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px;">
                        ${task.description}
                    </div>
                </td>
                <td>${this.getUrgencyBadge(task.urgency)}</td>
                <td>${this.getSecrecyBadge(task.secrecy)}</td>
                <td>${task.startDate}</td>
                <td class="${deadlineClass}">${task.deadline}${overdueText}</td>
                <td>${this.getStatusBadge(task.status)}</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="app.viewTaskDetails('${task.id}')">
                        <i class="fas fa-expand"></i> ตรวจรายละเอียด
                    </button>
                </td>
            `;
            this.staffTasksTableBody.appendChild(tr);
        });
    }

    // --- TASK MANAGEMENT: CREATE, EDIT, DELETE ---
    openCreateTaskModal() {
        this.taskForm.reset();
        this.taskModalTitle.innerHTML = '<i class="fas fa-circle-plus"></i> มอบหมายภารกิจยุทธการใหม่';
        this.taskIdField.value = '';
        
        // Setup Date inputs to default to today
        const today = new Date().toISOString().split('T')[0];
        this.taskStartDateInput.value = today;
        this.taskDeadlineInput.value = today;

        // If staff is triggering this modal (via custom trigger), locked assignee to self
        if (this.currentUser !== 'leader') {
            this.taskAssigneeInput.value = this.currentUser;
            this.taskAssigneeInput.disabled = true;
        } else {
            this.taskAssigneeInput.disabled = false;
        }

        this.taskStatusInput.value = 'รอดำเนินการ';
        this.taskStatusInput.disabled = false;

        // Hide PDF upload row by default
        this.pdfUploadRow.style.display = 'none';
        this.taskPdfInput.value = '';
        this.pdfUploadStatus.textContent = 'ไม่มีไฟล์ที่แนบไว้';

        this.taskModal.classList.add('show');
    }

    openEditTaskModal(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.taskModalTitle.innerHTML = '<i class="fas fa-edit"></i> แก้ไขข้อมูลยุทธการ';
        this.taskIdField.value = task.id;
        this.taskNameInput.value = task.name;
        this.taskDescriptionInput.value = task.description;
        this.taskAssigneeInput.value = task.assigneeId;
        this.taskStatusInput.value = task.status;
        this.taskUrgencyInput.value = task.urgency;
        this.taskSecrecyInput.value = task.secrecy;
        this.taskStartDateInput.value = task.startDate;
        this.taskDeadlineInput.value = task.deadline;

        this.taskAssigneeInput.disabled = false;
        this.taskStatusInput.disabled = false;

        // Show PDF upload row if task is completed
        if (task.status === 'เสร็จสิ้น') {
            this.pdfUploadRow.style.display = 'grid';
            this.pdfUploadStatus.textContent = task.hasAttachment ? `ไฟล์แนบปัจจุบัน: ${task.attachmentName || 'รายงาน.pdf'}` : 'ยังไม่มีไฟล์แนบ';
        } else {
            this.pdfUploadRow.style.display = 'none';
        }
        this.taskPdfInput.value = '';

        this.taskModal.classList.add('show');
    }

    closeTaskModal() {
        this.taskModal.classList.remove('show');
    }

    async submitTaskForm() {
        const id = this.taskIdField.value;
        const name = this.taskNameInput.value.trim();
        const description = this.taskDescriptionInput.value.trim();
        const assigneeId = this.taskAssigneeInput.value;
        const status = this.taskStatusInput.value;
        const urgency = this.taskUrgencyInput.value;
        const secrecy = this.taskSecrecyInput.value;
        const startDate = this.taskStartDateInput.value;
        const deadline = this.taskDeadlineInput.value;

        // Simple validation
        if (new Date(deadline) < new Date(startDate)) {
            alert('ข้อผิดพลาด: วันกำหนดส่ง (Deadline) ไม่สามารถอยู่ก่อนวันเริ่มต้นปฏิบัติงานได้');
            return;
        }

        const now = new Date();
        const logUser = this.currentUser === 'leader' ? 'หัวหน้าฝ่ายยุทธการ' : this.currentUserName.textContent;

        let finalTaskId = id;
        let taskObj = null;

        if (id) {
            // Edit Mode
            taskObj = this.tasks.find(t => t.id === id);
            if (taskObj) {
                // Log changes
                const changes = [];
                if (taskObj.name !== name) changes.push(`เปลี่ยนชื่องานเป็น "${name}"`);
                if (taskObj.assigneeId !== assigneeId) {
                    const newAssignee = this.staff.find(m => m.id === assigneeId)?.name || 'ผู้ใช้ที่ถูกลบ';
                    changes.push(`มอบหมายงานให้: ${newAssignee}`);
                }
                if (taskObj.status !== status) changes.push(`เปลี่ยนสถานะเป็น: ${status}`);
                if (taskObj.urgency !== urgency) changes.push(`ระดับความเร่งด่วน: ${urgency}`);
                if (taskObj.secrecy !== secrecy) changes.push(`ชั้นความลับ: ${secrecy}`);
                if (taskObj.deadline !== deadline) changes.push(`ปรับกำหนดส่งเป็น: ${deadline}`);

                taskObj.name = name;
                taskObj.description = description;
                taskObj.assigneeId = assigneeId;
                taskObj.status = status;
                taskObj.urgency = urgency;
                taskObj.secrecy = secrecy;
                taskObj.startDate = startDate;
                taskObj.deadline = deadline;

                if (changes.length > 0) {
                    taskObj.history.push({
                        time: now.toISOString(),
                        action: `แก้ไขข้อมูล: ${changes.join(', ')}`,
                        user: logUser
                    });
                }
            }
        } else {
            // Create Mode
            const newTaskId = `task-${Date.now()}`;
            finalTaskId = newTaskId;
            taskObj = {
                id: newTaskId,
                name,
                description,
                assigneeId,
                status,
                urgency,
                secrecy,
                startDate,
                deadline,
                history: [
                    { time: now.toISOString(), action: `มอบหมายภารกิจเริ่มต้นให้เจ้าหน้าที่`, user: logUser }
                ]
            };
            this.tasks.push(taskObj);
        }

        // Handle PDF attachment if status is "เสร็จสิ้น" and file is chosen
        if (taskObj && status === 'เสร็จสิ้น' && this.taskPdfInput.files.length > 0) {
            const file = this.taskPdfInput.files[0];
            
            if (this.isCloudMode) {
                // Cloud Mode PDF upload
                try {
                    const base64Data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = (e) => reject(e);
                        reader.readAsDataURL(file);
                    });

                    const pdfRes = await fetch('/api/pdf', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            taskId: finalTaskId,
                            fileName: file.name,
                            fileType: file.type,
                            fileData: base64Data
                        })
                    });

                    if (pdfRes.ok) {
                        taskObj.hasAttachment = true;
                        taskObj.attachmentName = file.name;
                        taskObj.history.push({
                            time: now.toISOString(),
                            action: `อัปโหลดไฟล์เอกสารยุทธการขึ้นระบบคลาวด์: ${file.name}`,
                            user: logUser
                        });
                    } else {
                        throw new Error("Cloud upload response not OK");
                    }
                } catch (err) {
                    console.error("Failed to upload PDF to Cloudflare KV", err);
                    this.showToast('เกิดข้อผิดพลาดในการอัปโหลดไฟล์ไปยังเซิร์ฟเวอร์คลาวด์', 'danger');
                }
            } else {
                // Offline Local Mode
                try {
                    await this.attachments.saveAttachment(finalTaskId, file);
                    taskObj.hasAttachment = true;
                    taskObj.attachmentName = file.name;
                    taskObj.history.push({
                        time: now.toISOString(),
                        action: `อัปโหลดไฟล์เอกสารยุทธการ: ${file.name}`,
                        user: logUser
                    });
                } catch (err) {
                    console.error("Failed to save PDF in IndexedDB", err);
                    this.showToast('เกิดข้อผิดพลาดในการบันทึกเอกสาร PDF', 'danger');
                }
            }
        }

        this.saveData();
        this.closeTaskModal();
        
        if (this.isCloudMode) {
            try {
                await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(taskObj)
                });
            } catch (err) {
                console.error("Failed to sync task with Cloudflare D1", err);
                this.showToast("ไม่สามารถอัปเดตข้อมูลไปยังเซิร์ฟเวอร์ยุทธการได้ ข้อมูลจะถูกบันทึกสำรองในเครื่อง", "warning");
            }
        }

        // Refresh Current View
        this.switchView(this.currentView);
        this.showToast(id ? 'อัปเดตข้อมูลภารกิจยุทธการสำเร็จ' : 'บันทึกและมอบหมายงานยุทธการสำเร็จ');
    }

    deleteTask(taskId) {
        if (confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกและลบภารกิจนี้ออกจากฐานข้อมูลทางยุทธการ?')) {
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            // Clean up IndexedDB
            this.attachments.deleteAttachment(taskId).catch(err => console.error("Error deleting PDF", err));
            this.saveData();

            if (this.isCloudMode) {
                fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
                    .catch(err => console.error("Error deleting task on D1", err));
            }

            this.switchView(this.currentView);
            this.showToast('ลบและยกเลิกภารกิจเรียบร้อย', 'danger');
        }
    }

    // --- DETAILED TASK VIEWS & SYSTEM INTERACTIONS ---
    viewTaskDetails(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const member = this.staff.find(m => m.id === task.assigneeId) || { name: 'ไม่มีผู้รับผิดชอบ', role: 'N/A', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=none' };

        // Detail Modal Info binding
        this.detailTitle.textContent = task.name;
        this.detailDescription.textContent = task.description || 'ไม่มีรายละเอียดระบุไว้';
        
        // Secrecy Badge
        this.detailSecrecyBadge.textContent = task.secrecy;
        this.detailSecrecyBadge.className = 'detail-secrecy-badge';
        if (task.secrecy === 'ลับที่สุด') this.detailSecrecyBadge.classList.add('secrecy-top-secret');
        else if (task.secrecy === 'ลับมาก') this.detailSecrecyBadge.classList.add('secrecy-secret');
        else if (task.secrecy === 'ลับ') this.detailSecrecyBadge.classList.add('secrecy-confidential');
        else this.detailSecrecyBadge.classList.add('secrecy-normal');

        // Assignee Info
        this.detailAssigneeAvatar.src = member.avatar;
        this.detailAssigneeName.textContent = member.name;

        // Badges
        this.detailStatusBadge.innerHTML = this.getStatusBadge(task.status);
        this.detailUrgencyBadge.innerHTML = this.getUrgencyBadge(task.urgency);

        // Dates
        this.detailStartDate.textContent = task.startDate;
        this.detailDeadline.textContent = task.deadline;

        // Overdue status check
        if (this.isOverdue(task)) {
            this.detailOverdueBox.innerHTML = '<i class="fas fa-triangle-exclamation"></i> ภารกิจนี้เลยกำหนดส่งความมั่นคง!';
            this.detailOverdueBox.classList.remove('d-none');
        } else if (this.isDueSoon(task)) {
            this.detailOverdueBox.innerHTML = '<i class="fas fa-hourglass-half text-warning"></i> ภารกิจกำลังเข้าใกล้กำหนดส่งพิจารณา';
            this.detailOverdueBox.classList.remove('d-none');
            this.detailOverdueBox.className = 'meta-item text-warning';
        } else {
            this.detailOverdueBox.classList.add('d-none');
        }

        // Render Action logs
        this.renderActivityLog(task.history);

        // Render Context Action Buttons (Leader Actions vs Staff Actions)
        this.renderDetailModalFooter(task);

        // PDF View bind
        if (task.hasAttachment) {
            this.detailPdfItem.classList.remove('d-none');
            // Recreate button listener to clear previous event bindings
            const newBtnView = this.btnViewPdf.cloneNode(true);
            this.btnViewPdf.parentNode.replaceChild(newBtnView, this.btnViewPdf);
            this.btnViewPdf = newBtnView;
            
            // --- อัปเดตส่วนนี้เพื่อเปิดไฟล์จาก Cloudflare แทน IndexedDB ---
            this.btnViewPdf.addEventListener('click', async () => {
                if (this.isCloudMode) {
                    // โหมดออนไลน์: ให้เปิดไฟล์ PDF จาก API โดยตรง
                    window.open(`/api/pdf?taskId=${task.id}`, '_blank');
                } else {
                    // โหมดออฟไลน์: ดึงไฟล์จาก IndexedDB ในเครื่อง
                    this.btnViewPdf.disabled = true;
                    this.btnViewPdf.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังดึงไฟล์...';
                    try {
                        const record = await this.attachments.getAttachment(task.id);
                        if (record && record.fileData) {
                            const url = URL.createObjectURL(record.fileData);
                            window.open(url, '_blank');
                        } else {
                            alert('ไม่พบไฟล์แนบในฐานข้อมูล เครื่องนี้อาจจะไม่มีไฟล์ดังกล่าว หรือข้อมูลเสียหาย');
                        }
                    } catch (err) {
                        console.error("Error viewing PDF", err);
                        alert('เกิดข้อผิดพลาดในการโหลดไฟล์ PDF');
                    } finally {
                        this.btnViewPdf.disabled = false;
                        this.btnViewPdf.innerHTML = '<i class="fas fa-file-pdf text-danger"></i> เปิดดูเอกสาร PDF';
                    }
                }
            });
            // --------------------------------------------------------
            
        } else {
            this.detailPdfItem.classList.add('d-none');
        }

        this.taskDetailModal.classList.add('show');
    }

    renderActivityLog(history) {
        this.detailActivityLog.innerHTML = '';
        // Sort history by time descending (most recent first)
        const sortedHistory = [...history].sort((a, b) => new Date(b.time) - new Date(a.time));

        sortedHistory.forEach((log, index) => {
            const date = new Date(log.time);
            const formattedTime = date.toLocaleString('th-TH', { 
                day: '2-digit', month: 'short', year: '2-digit', 
                hour: '2-digit', minute: '2-digit' 
            });

            const item = document.createElement('div');
            item.className = 'activity-item' + (index === 0 ? ' active-step' : '');
            item.innerHTML = `
                <strong>${log.action}</strong>
                <span class="activity-time">${formattedTime} • ปฏิบัติโดย: ${log.user}</span>
            `;
            this.detailActivityLog.appendChild(item);
        });
    }

    renderDetailModalFooter(task) {
        this.detailModalFooter.innerHTML = '';

        if (this.currentUser === 'leader') {
            // Leader Actions
            if (task.status === 'รอการอนุมัติ') {
                const btnReject = document.createElement('button');
                btnReject.className = 'btn btn-secondary';
                btnReject.innerHTML = '<i class="fas fa-rotate-left"></i> ส่งกลับปรับปรุงยุทธการ';
                btnReject.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'กำลังทำ', 'ส่งกลับเพื่อทบทวนแผนงานยุทธการ'));
                this.detailModalFooter.appendChild(btnReject);

                const btnApprove = document.createElement('button');
                btnApprove.className = 'btn btn-success';
                btnApprove.innerHTML = '<i class="fas fa-signature"></i> ลงนามอนุมัติงานยุทธการ';
                btnApprove.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'เสร็จสิ้น', 'หัวหน้าฝ่ายอนุมัติภารกิจเสร็จสิ้นเรียบร้อย'));
                this.detailModalFooter.appendChild(btnApprove);
            } else {
                // Regular controls
                const btnEdit = document.createElement('button');
                btnEdit.className = 'btn btn-primary';
                btnEdit.innerHTML = '<i class="fas fa-edit"></i> แก้ไขภารกิจ';
                btnEdit.addEventListener('click', () => {
                    this.closeDetailModal();
                    this.openEditTaskModal(task.id);
                });
                this.detailModalFooter.appendChild(btnEdit);

                const btnDelete = document.createElement('button');
                btnDelete.className = 'btn btn-danger';
                btnDelete.innerHTML = '<i class="fas fa-trash"></i> ยกเลิกภารกิจ';
                btnDelete.addEventListener('click', () => {
                    this.closeDetailModal();
                    this.deleteTask(task.id);
                });
                this.detailModalFooter.appendChild(btnDelete);
            }
        } else {
            // Staff Actions (For their own tasks)
            if (task.status === 'รอดำเนินการ') {
                const btnStart = document.createElement('button');
                btnStart.className = 'btn btn-primary';
                btnStart.innerHTML = '<i class="fas fa-play"></i> เริ่มปฏิบัติภารกิจ';
                btnStart.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'กำลังทำ', 'รับเรื่องและเริ่มปฏิบัติการ'));
                this.detailModalFooter.appendChild(btnStart);
            } else if (task.status === 'กำลังทำ') {
                const btnReview = document.createElement('button');
                btnReview.className = 'btn btn-success';
                btnReview.innerHTML = '<i class="fas fa-paper-plane"></i> ส่งรายงานแผนต่อหัวหน้า';
                btnReview.addEventListener('click', () => this.updateTaskStatusAndHistory(task.id, 'รอการอนุมัติ', 'ร่างแผนงานเรียบร้อยและส่งขอการอนุมัติยุทธการ'));
                this.detailModalFooter.appendChild(btnReview);
            } else if (task.status === 'รอการอนุมัติ') {
                const label = document.createElement('span');
                label.style.fontSize = '12px';
                label.style.color = 'var(--text-muted)';
                label.innerHTML = '<i class="fas fa-hourglass-half"></i> รายงานฉบับยุทธการกำลังรอผู้บังคับบัญชาอนุมัติ...';
                this.detailModalFooter.appendChild(label);
            } else if (task.status === 'เสร็จสิ้น') {
                const label = document.createElement('span');
                label.style.fontSize = '12px';
                label.style.color = 'var(--color-done)';
                label.innerHTML = '<i class="fas fa-circle-check"></i> ภารกิจบรรลุผลสำเร็จลุล่วงแล้ว (เสร็จสิ้น)';
                this.detailModalFooter.appendChild(label);
            }
        }
    }

    updateTaskStatusAndHistory(taskId, newStatus, actionDescription) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const oldStatus = task.status;
        task.status = newStatus;

        const now = new Date();
        const logUser = this.currentUser === 'leader' ? 'หัวหน้าฝ่ายยุทธการ' : this.currentUserName.textContent;
        
        task.history.push({
            time: now.toISOString(),
            action: `${actionDescription} (จาก "${oldStatus}" -> "${newStatus}")`,
            user: logUser
        });

        this.saveData();
        this.closeDetailModal();

        if (this.isCloudMode) {
            fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task)
            }).catch(err => console.error("Error syncing status update to D1", err));
        }

        this.switchView(this.currentView);
        this.showToast(`บันทึกรายงานสถานะการปฏิบัติงาน: ${newStatus}`);
    }

    closeDetailModal() {
        this.taskDetailModal.classList.remove('show');
    }

    // --- HTML RENDER HELPERS ---
    getUrgencyBadge(urgency) {
        let badgeClass = 'urgency-urgent';
        if (urgency === 'ด่วนมาก') badgeClass = 'urgency-v-urgent';
        if (urgency === 'ด่วนที่สุด') badgeClass = 'urgency-most-urgent';
        return `<span class="urgency-badge ${badgeClass}"><i class="fas fa-triangle-exclamation"></i> ${urgency}</span>`;
    }

    getSecrecyBadge(secrecy) {
        let badgeClass = 'secrecy-normal';
        let icon = 'fa-lock-open';
        
        if (secrecy === 'ลับ') { badgeClass = 'secrecy-confidential'; icon = 'fa-key'; }
        if (secrecy === 'ลับมาก') { badgeClass = 'secrecy-secret'; icon = 'fa-lock'; }
        if (secrecy === 'ลับที่สุด') { badgeClass = 'secrecy-top-secret'; icon = 'fa-shield-halved'; }
        
        return `<span class="secrecy-badge ${badgeClass}"><i class="fas ${icon}"></i> ${secrecy}</span>`;
    }

    getStatusBadge(status) {
        let badgeClass = 'badge-todo';
        if (status === 'กำลังทำ') badgeClass = 'badge-progress';
        if (status === 'รอการอนุมัติ') badgeClass = 'badge-review';
        if (status === 'เสร็จสิ้น') badgeClass = 'badge-done';
        return `<span class="status-badge ${badgeClass}">${status}</span>`;
    }
}

// Instantiate App
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
});
