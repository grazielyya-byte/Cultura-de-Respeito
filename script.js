// --- SISTEMA DE CARREGAMENTO (SPLASH SCREEN) ---
        // Fica FORA do módulo do Firebase de propósito: assim, mesmo que a rede da escola
        // bloqueie ou demore a carregar o Firebase, a tela inicial e o botão "Iniciar" continuam funcionando.
        window.addEventListener('DOMContentLoaded', () => {
            let width = 0;
            const loadingBar = document.getElementById('loading-bar');
            const loadingText = document.getElementById('loading-text');
            const btnPlay = document.getElementById('btn-play-game');
            const interval = setInterval(() => {
                if (width >= 100) {
                    clearInterval(interval);
                    loadingBar.style.width = '100%';
                    loadingText.innerText = "Sistema pronto!";
                    setTimeout(() => {
                        document.getElementById('loading-container').classList.add('hidden');
                        btnPlay.classList.remove('hidden');
                    }, 500);
                } else {
                    width += Math.floor(Math.random() * 15) + 5;
                    if (width > 100) width = 100;
                    loadingBar.style.width = width + '%';
                    const phases = ["A conectar ao Firebase...", "A compilar algoritmos morais...", "A carregar avatares...", "Sincronização QG estabelecida!"];
                    loadingText.innerText = phases[Math.floor(width / 30)] || "A concluir...";
                }
            }, 150);

            // Rede de segurança: se por algum motivo a barra travar (ex: aba em segundo plano
            // no celular), força o botão a aparecer depois de um tempo máximo de espera.
            setTimeout(() => {
                if (btnPlay && btnPlay.classList.contains('hidden')) {
                    clearInterval(interval);
                    document.getElementById('loading-container').classList.add('hidden');
                    btnPlay.classList.remove('hidden');
                }
            }, 6000);
        });

        window.startGameFlow = () => {
            const splash = document.getElementById('splash-screen');
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.classList.add('hidden');
            }, 700);
            // playBeepSound só existe depois que o módulo do Firebase carrega.
            // Se ainda não carregou (ou falhou), não deixa isso travar o clique do aluno.
            if (typeof window.playBeepSound === 'function') {
                try { window.playBeepSound('levelup'); } catch (e) { /* som é só um extra, ignora falha */ }
            }
        };

// --- FIREBASE (CARREGADO DE FORMA ASSÍNCRONA E SEGURA) ---
        // Em vez de "import" estático (que quebra o script INTEIRO se a rede da escola
        // bloquear o Firebase), usamos import() dinâmico dentro de um try/catch de verdade.
        // Se falhar, o resto do jogo continua funcionando em modo offline/demonstração.
        let initializeApp, getAuth, signInAnonymously, onAuthStateChanged,
            createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut;
        let getFirestore, doc, getDoc, setDoc, addDoc, collection, onSnapshot, query, where, getDocs;

        let app, auth, db;
        let isFirebaseActive = false;
        let currentUser = null;
        let isInvestigador = false;
        let activeSchoolCode = "";
        let activeSchoolName = "";
        let appId = "cadastro_geral";
        let unsubscribeReports = null;
        let unsubscribeCanvas = null;
        let unsubscribeReflections = null;
        let unsubscribeNotes = null;

        // Gráficos do Chart.js
        let vibesChartInstance = null;
        let delitosChartInstance = null;

        async function initFirebase() {
            try {
                const [appMod, authMod, fsMod] = await Promise.all([
                    import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"),
                    import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"),
                    import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js")
                ]);

                initializeApp = appMod.initializeApp;
                getAuth = authMod.getAuth;
                signInAnonymously = authMod.signInAnonymously;
                onAuthStateChanged = authMod.onAuthStateChanged;
                createUserWithEmailAndPassword = authMod.createUserWithEmailAndPassword;
                signInWithEmailAndPassword = authMod.signInWithEmailAndPassword;
                signOut = authMod.signOut;

                getFirestore = fsMod.getFirestore;
                doc = fsMod.doc;
                getDoc = fsMod.getDoc;
                setDoc = fsMod.setDoc;
                addDoc = fsMod.addDoc;
                collection = fsMod.collection;
                onSnapshot = fsMod.onSnapshot;
                query = fsMod.query;
                where = fsMod.where;
                getDocs = fsMod.getDocs;

                app = initializeApp(window.FIREBASE_CONFIG);
                auth = getAuth(app);
                db = getFirestore(app);
                isFirebaseActive = true;

                const cloudIndicator = document.getElementById('cloud-indicator-dot');
                const cloudText = document.getElementById('cloud-indicator-text');
                if (cloudIndicator) cloudIndicator.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 block";
                if (cloudText) cloudText.innerText = "Online";

                onAuthStateChanged(auth, (user) => {
                    if (user) {
                        currentUser = user;
                        if (!isInvestigador) {
                            fetchInvestigatorProfile(user.uid);
                        }
                        setupRealtimeSync();
                    } else {
                        if (!isInvestigador) {
                            signInAnonymously(auth).catch(err => console.error("Anónimo falhou:", err));
                        } else {
                            currentUser = null;
                        }
                    }
                });
            } catch (error) {
                console.error("Modo Offline Ativo. Detalhes: ", error);
                const cloudIndicator = document.getElementById('cloud-indicator-dot');
                const cloudText = document.getElementById('cloud-indicator-text');
                if (cloudIndicator) cloudIndicator.className = "w-2.5 h-2.5 rounded-full bg-rose-500 block";
                if (cloudText) cloudText.innerText = "Offline";
            }
        }

        initFirebase();

        // --- BUSCA PERFIL INVESTIGADOR ---
        async function fetchInvestigatorProfile(uid) {
            try {
                const docRef = doc(db, 'usuarios', appId, 'public', 'data', 'investigators', uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    activeSchoolCode = data.schoolCode;
                    activeSchoolName = data.institution;
                    isInvestigador = true;
                    document.getElementById('qg-current-school-text').innerText = `${data.institution} (Código: ${data.schoolCode}) • Sincronizado por: ${data.name} (${data.role})`;
                    
                    document.getElementById('sec-school-gate').style.display = 'none';
                    updateSidebarSchoolLabel();
                    toggleQGView(true);
                }
            } catch (err) {
                console.error("Erro ao procurar dados do investigador:", err);
            }
        }

        function updateSidebarSchoolLabel() {
            const label = document.getElementById('sidebar-school-info');
            if (label) {
                label.innerText = activeSchoolName ? `${activeSchoolName}` : "Sem Escola Sincronizada";
            }
        }

        // --- VALIDAÇÃO DO CÓDIGO DA ESCOLA PELO ALUNO ---
        async function validateSchoolCode() {
            const inputVal = document.getElementById('input-school-code').value.trim();
            if (!inputVal) {
                showToast("⚠️", "Insere o código escolar fornecido pelo teu colégio!");
                playBeepSound('error');
                return;
            }

            if (!isFirebaseActive) {
                if (window.offlineSchools && window.offlineSchools[inputVal.toUpperCase()]) {
                    const localSchool = window.offlineSchools[inputVal.toUpperCase()];
                    activeSchoolCode = localSchool.code;
                    activeSchoolName = localSchool.institutionName;
                    proceedToStudentApp();
                    return;
                } else if (inputVal.toUpperCase() === "2567@25") {
                    activeSchoolCode = "2567@25";
                    activeSchoolName = "Colégio 25";
                    proceedToStudentApp();
                    return;
                } else {
                    showToast("⚠️", "Código offline não registado de momento. Regista a escola primeiro ou usa: 2567@25");
                    playBeepSound('error');
                    return;
                }
            }

            try {
                const schoolRef = doc(db, 'usuarios', appId, 'public', 'data', 'schools', inputVal.toUpperCase());
                const schoolSnap = await getDoc(schoolRef);

                if (schoolSnap.exists()) {
                    activeSchoolCode = inputVal.toUpperCase();
                    activeSchoolName = schoolSnap.data().institutionName;
                    proceedToStudentApp();
                } else {
                    showToast("❌", "Código de escola não encontrado!");
                    playBeepSound('error');
                }
            } catch (err) {
                console.error("Erro ao validar código da escola:", err);
                showToast("⚠️", "Erro de ligação. Tenta novamente.");
                playBeepSound('error');
            }
        }
        window.validateSchoolCode = validateSchoolCode;

        function proceedToStudentApp() {
            database.player.schoolCode = activeSchoolCode;
            
            document.getElementById('sec-school-gate').style.display = 'none';

            const targetTab = pendingTab || 'character';
            pendingTab = null;

            document.getElementById('character-school-badge').innerText = `Sincronizado: ${activeSchoolName}`;
            document.getElementById('card-hero-nick').innerText = database.player.nick;
            document.getElementById('card-hero-hp').innerText = `HP: ${playerHp}/100`;

            updateSidebarSchoolLabel();
            playBeepSound('levelup');
            showToast("🏫", `Sessão estabelecida em ${activeSchoolName}!`);
            setupRealtimeSync();

            switchTab(targetTab);
        }

        // --- GERAÇÃO DE CÓDIGO ESCOLAR ÚNICO ---
        function generateSchoolCode(institutionName) {
            const prefix = (institutionName || "ESC")
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-zA-Z]/g, "")
                .toUpperCase()
                .slice(0, 4) || "ESC";
            const suffix = Math.floor(1000 + Math.random() * 9000);
            return `${prefix}${suffix}`;
        }

        // --- REGISTO DA ESCOLA (GERA O CÓDIGO ÚNICO) ---
        function normalizeInstitutionKey(name) {
            return (name || "")
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();
        }

        async function registerSchool(event) {
            event.preventDefault();

            const institution = document.getElementById('school-reg-institution').value.trim();
            if (!institution) {
                showToast("⚠️", "Indica o nome do colégio!");
                playBeepSound('error');
                return;
            }
            const institutionKey = normalizeInstitutionKey(institution);

            if (!isFirebaseActive) {
                if (!window.offlineSchools) window.offlineSchools = {};

                // O código é fixo: se essa escola já foi registada antes, reaproveita o código existente.
                const existingEntry = Object.values(window.offlineSchools).find(s => normalizeInstitutionKey(s.institutionName) === institutionKey);
                if (existingEntry) {
                    showSchoolCodeResult(existingEntry.code, true);
                    showToast("ℹ️", "[Modo Demonstração] Essa escola já tinha um código — ele nunca muda!");
                    playBeepSound('success');
                    return;
                }

                let schoolCode = generateSchoolCode(institution);
                let attempts = 0;
                while (window.offlineSchools[schoolCode] && attempts < 10) {
                    schoolCode = generateSchoolCode(institution);
                    attempts++;
                }

                window.offlineSchools[schoolCode] = {
                    institutionName: institution,
                    code: schoolCode
                };

                showSchoolCodeResult(schoolCode, false);
                showToast("✨", "[Modo Demonstração] Escola registada offline!");
                playBeepSound('levelup');
                return;
            }

            try {
                // O código é fixo: se essa escola já foi registada antes, reaproveita o código existente em vez de criar um novo.
                const schoolsCol = collection(db, 'usuarios', appId, 'public', 'data', 'schools');
                const existingQuery = query(schoolsCol, where('institutionNameKey', '==', institutionKey));
                const existingSnap = await getDocs(existingQuery);

                if (!existingSnap.empty) {
                    const existingCode = existingSnap.docs[0].data().code;
                    showSchoolCodeResult(existingCode, true);
                    showToast("ℹ️", "Essa escola já tinha um código — ele nunca muda!");
                    playBeepSound('success');
                    return;
                }

                let schoolCode = generateSchoolCode(institution);
                let schoolRef = doc(db, 'usuarios', appId, 'public', 'data', 'schools', schoolCode);
                let schoolSnap = await getDoc(schoolRef);
                let attempts = 0;
                while (schoolSnap.exists() && attempts < 10) {
                    schoolCode = generateSchoolCode(institution);
                    schoolRef = doc(db, 'usuarios', appId, 'public', 'data', 'schools', schoolCode);
                    schoolSnap = await getDoc(schoolRef);
                    attempts++;
                }

                await setDoc(schoolRef, {
                    institutionName: institution,
                    institutionNameKey: institutionKey,
                    code: schoolCode,
                    createdBy: currentUser ? currentUser.uid : null,
                    createdTimestamp: new Date().toISOString()
                });

                showSchoolCodeResult(schoolCode, false);
                showToast("✨", "Escola registada com sucesso! Esse código é fixo e nunca vai mudar.");
                playBeepSound('levelup');
            } catch (error) {
                console.error("Erro ao registar escola:", error);
                showToast("❌", "Erro: " + error.message);
                playBeepSound('error');
            }
        }
        window.registerSchool = registerSchool;

        function showSchoolCodeResult(schoolCode, alreadyExisted) {
            const resultBox = document.getElementById('school-code-result');
            const resultValue = document.getElementById('school-code-result-value');
            const resultLabel = document.getElementById('school-code-result-label');
            if (resultBox && resultValue) {
                resultValue.innerText = schoolCode;
                if (resultLabel) {
                    resultLabel.innerText = alreadyExisted
                        ? "Essa escola já tinha esse código — ele é fixo e nunca muda"
                        : "Código gerado — é fixo pra sempre, partilha com os professores";
                }
                resultBox.classList.remove('hidden');
            }
        }

        // --- REGISTO DE PROFESSOR (USA O CÓDIGO JÁ CRIADO PELA ESCOLA) ---
        async function registerInvestigador(event) {
            event.preventDefault();

            const name = document.getElementById('reg-name').value.trim();
            const role = document.getElementById('reg-role').value.trim();
            const schoolCode = document.getElementById('reg-school-code').value.trim().toUpperCase();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;

            if (!isFirebaseActive) {
                if (!window.offlineSchools || !window.offlineSchools[schoolCode]) {
                    showToast("❌", "Código de escola não encontrado! Peça à tua instituição para se registar primeiro.");
                    playBeepSound('error');
                    return;
                }

                if (!window.offlineUsers) window.offlineUsers = {};
                const institution = window.offlineSchools[schoolCode].institutionName;

                window.offlineUsers[email] = {
                    password: password,
                    name: name,
                    role: role,
                    institution: institution,
                    schoolCode: schoolCode
                };

                showToast("✨", "[Modo Demonstração] Professor registado offline!");
                playBeepSound('levelup');

                toggleAuthSubTab('login');
                document.getElementById('qg-email').value = email;
                document.getElementById('qg-password').value = password;
                return;
            }

            try {
                const schoolRef = doc(db, 'usuarios', appId, 'public', 'data', 'schools', schoolCode);
                const schoolSnap = await getDoc(schoolRef);
                if (!schoolSnap.exists()) {
                    showToast("❌", "Código de escola não encontrado! Peça à tua instituição para se registar primeiro.");
                    playBeepSound('error');
                    return;
                }
                const institution = schoolSnap.data().institutionName;

                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                const investigatorRef = doc(db, 'usuarios', appId, 'public', 'data', 'investigators', user.uid);
                await setDoc(investigatorRef, {
                    uid: user.uid,
                    name: name,
                    role: role,
                    institution: institution,
                    schoolCode: schoolCode,
                    email: email
                });

                showToast("✨", "Professor registado com sucesso!");
                playBeepSound('levelup');
                toggleAuthSubTab('login');
            } catch (error) {
                console.error("Erro ao criar conta:", error);
                showToast("❌", "Erro: " + error.message);
                playBeepSound('error');
            }
        }
        window.registerInvestigador = registerInvestigador;

        // --- LOGIN & LOGOUT DO INVESTIGADOR ---
        async function loginInvestigador(event) {
            event.preventDefault();
            const email = document.getElementById('qg-email').value.trim();
            const password = document.getElementById('qg-password').value;

            if (!isFirebaseActive) {
                if (window.offlineUsers && window.offlineUsers[email] && window.offlineUsers[email].password === password) {
                    const data = window.offlineUsers[email];
                    activeSchoolCode = data.schoolCode;
                    activeSchoolName = data.institution;
                    isInvestigador = true;
                    document.getElementById('sec-school-gate').style.display = 'none';
                    
                    document.getElementById('qg-current-school-text').innerText = `${data.institution} (Código: ${data.schoolCode}) • Sincronizado por: ${data.name} (${data.role}) [TESTE]`;
                    updateSidebarSchoolLabel();
                    toggleQGView(true);
                    showToast("🔑", "Sessão iniciada offline!");
                    playBeepSound('levelup');
                } else if (email === "professor@escola.com" && password === "123456") {
                    activeSchoolCode = "2567@25";
                    activeSchoolName = "Colégio 25";
                    isInvestigador = true;
                    document.getElementById('sec-school-gate').style.display = 'none';
                    
                    document.getElementById('qg-current-school-text').innerText = `Colégio 25 (Código: 2567@25) • Prof. Administrador [DEMO]`;
                    updateSidebarSchoolLabel();
                    toggleQGView(true);
                    showToast("🔑", "Sessão iniciada na Demo!");
                    playBeepSound('levelup');
                } else {
                    showToast("❌", "Credenciais incorretas!");
                    playBeepSound('error');
                }
                return;
            }

            try {
                if (auth.currentUser && auth.currentUser.isAnonymous) {
                    currentUser = null;
                }
                await signInWithEmailAndPassword(auth, email, password);
                isInvestigador = true;
                document.getElementById('form-qg-login').reset();
            } catch (error) {
                console.error("Erro ao autenticar:", error);
                showToast("❌", "Credenciais incorretas!");
                playBeepSound('error');
            }
        }
        window.loginInvestigador = loginInvestigador;

        async function logoutInvestigador() {
            if (unsubscribeReports) { unsubscribeReports(); unsubscribeReports = null; }
            if (unsubscribeCanvas) { unsubscribeCanvas(); unsubscribeCanvas = null; }
            if (unsubscribeReflections) { unsubscribeReflections(); unsubscribeReflections = null; }
            if (unsubscribeNotes) { unsubscribeNotes(); unsubscribeNotes = null; }

            isInvestigador = false;
            toggleQGView(false);
            showToast("🔒", "Sessão terminada.");
            playBeepSound('error');

            if (isFirebaseActive) {
                try {
                    currentUser = null;
                    await signOut(auth);
                } catch (error) {
                    console.error("Erro ao fechar sessão:", error);
                }
            }
        }
        window.logoutInvestigador = logoutInvestigador;

        function toggleQGView(showPainel) {
            const loginCard = document.getElementById('qg-auth-box');
            const contentWrapper = document.getElementById('qg-content-wrapper');

            if (!loginCard || !contentWrapper) return;

            if (showPainel) {
                loginCard.classList.add('hidden');
                contentWrapper.classList.remove('hidden');
                updateDashboardCharts();
            } else {
                loginCard.classList.remove('hidden');
                contentWrapper.classList.add('hidden');
            }
        }

        function toggleAuthSubTab(subTab) {
            const sections = {
                login: document.getElementById('auth-sub-login'),
                'register-school': document.getElementById('auth-sub-register-school'),
                'register-teacher': document.getElementById('auth-sub-register-teacher')
            };
            const buttons = {
                login: document.getElementById('btn-sub-login'),
                'register-school': document.getElementById('btn-sub-register-school'),
                'register-teacher': document.getElementById('btn-sub-register-teacher')
            };

            const activeClass = "flex-1 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all bg-indigo-600 text-white";
            const inactiveClass = "flex-1 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all text-slate-400 hover:text-white";

            Object.keys(sections).forEach(key => {
                if (key === subTab) {
                    sections[key].classList.remove('hidden');
                    buttons[key].className = activeClass;
                } else {
                    sections[key].classList.add('hidden');
                    buttons[key].className = inactiveClass;
                }
            });
            playBeepSound('success');
        }
        window.toggleAuthSubTab = toggleAuthSubTab;

        // --- SISTEMAS DE NAVEGAÇÃO DE ABAS ---
        let pendingTab = null;

        window.switchTab = (tab) => {
            document.getElementById('sec-character').classList.add('hidden');
            document.getElementById('sec-game').classList.add('hidden');
            document.getElementById('sec-radar').classList.add('hidden');
            document.getElementById('sec-vent').classList.add('hidden');
            document.getElementById('sec-dashboard').classList.add('hidden');

            if (tab === 'character') {
                if (!activeSchoolCode) {
                    pendingTab = 'character';
                    document.getElementById('sec-school-gate').style.display = 'block';
                } else {
                    document.getElementById('sec-character').classList.remove('hidden');
                }
            } else if (tab === 'game') {
                document.getElementById('sec-game').classList.remove('hidden');
                loadCombatStage();
            } else if (tab === 'radar') {
                if (!activeSchoolCode) {
                    pendingTab = 'radar';
                    document.getElementById('sec-school-gate').style.display = 'block';
                    showToast("🏫", "Entra com o código da tua escola primeiro!");
                } else {
                    document.getElementById('sec-radar').classList.remove('hidden');
                }
            } else if (tab === 'vent') {
                if (!activeSchoolCode) {
                    pendingTab = 'vent';
                    document.getElementById('sec-school-gate').style.display = 'block';
                    showToast("🏫", "Entra com o código da tua escola primeiro!");
                } else {
                    document.getElementById('sec-vent').classList.remove('hidden');
                }
            } else if (tab === 'dashboard') {
                document.getElementById('sec-dashboard').classList.remove('hidden');
                if (isInvestigador) {
                    setTimeout(() => updateDashboardCharts(), 100);
                }
            }
            playBeepSound('success');
        };

        // --- AUXILIARES LOCAIS ---
        let soundEnabled = true;
        window.toggleSound = () => {
            soundEnabled = !soundEnabled;
            showToast(soundEnabled ? '🔊' : '🔇', soundEnabled ? 'Efeitos Sonoros Ligados' : 'Sons Desativados');
        };
        window.playBeepSound = (type) => {
            if (!soundEnabled) return;
            console.log("Som ativo:", type);
        };
        window.showToast = (emoji, msg) => {
            const toast = document.getElementById('toast');
            document.getElementById('toast-icon').innerText = emoji;
            document.getElementById('toast-msg').innerText = msg;
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 3000);
        };

        // --- BASE DE DADOS DO FLUXO DO JOGO E CLIMA ---
        let database = {
            player: {
                nick: "Cyber Fox",
                avatar: "🦊",
                class: "Defensor(a) Digital",
                level: 1,
                xp: 25,
                hp: 100,
                schoolCode: "",
                created: false
            },
            isGameFinished: false,
            badges: ["🌱 Iniciante"],
            radarReports: [
                { space: "Sala de Aula", vibe: "Bem", delito: "Nenhum / Espaço Seguro", schoolCode: "2567@25" },
                { space: "Pátio / Recreio", vibe: "Agitado", delito: "Bullying ou Ofensas", schoolCode: "2567@25" },
                { space: "Casas de Banho", vibe: "Mau", delito: "Vandalismo / Estragar Coisas", schoolCode: "2567@25" }
            ],
            reflectiveResponses: [
                { text: "Já sofri exclusão no início do ano e senti-me muito triste. Resolvi desabafando com a psicóloga da escola.", schoolCode: "2567@25" }
            ],
            qgNotes: {
                source: "",
                solution: "",
                practice: ""
            }
        };

        // --- CONSCIÊNCIA DE COMBATE (DECISÕES CERTAS E ERRADAS COM MORAL) ---
        const modalConsciencia = document.getElementById('modal-consciencia');
        let consciousnessCountdownInterval = null;

        window.fecharModalConsciencia = () => {
            const btnContinuar = document.getElementById('btn-continuar-consciencia');
            if (btnContinuar.disabled) return; // Garante que não avança antes do tempo mínimo de leitura

            modalConsciencia.classList.add('hidden');
            if (consciousnessCountdownInterval) {
                clearInterval(consciousnessCountdownInterval);
                consciousnessCountdownInterval = null;
            }
            executeCombatAction();
        };

        let tempCalculatedDmg = 0;
        let tempTactic = null;
        let tempIsBonus = false;

        function startConsciousnessCountdown(seconds) {
            const btnContinuar = document.getElementById('btn-continuar-consciencia');
            let remaining = seconds;

            btnContinuar.disabled = true;
            btnContinuar.className = "w-full py-3 bg-slate-700 text-slate-400 font-bold rounded-xl text-xs uppercase tracking-wider cursor-not-allowed transition-all";
            btnContinuar.innerText = `Lê a explicação... (${remaining}s)`;

            if (consciousnessCountdownInterval) clearInterval(consciousnessCountdownInterval);

            consciousnessCountdownInterval = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(consciousnessCountdownInterval);
                    consciousnessCountdownInterval = null;
                    btnContinuar.disabled = false;
                    btnContinuar.className = "w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all";
                    btnContinuar.innerText = "Compreendi e Continuar ⚔️";
                } else {
                    btnContinuar.innerText = `Lê a explicação... (${remaining}s)`;
                }
            }, 1000);
        }

        function processTacticDecision(tactic, calculatedDmg, isBonus) {
            tempTactic = tactic;
            tempCalculatedDmg = calculatedDmg;
            tempIsBonus = isBonus;

            document.getElementById('modal-icon').innerText = tactic.success ? '✨' : '❌';
            document.getElementById('modal-titulo').innerText = tactic.success ? 'Escolha Construtiva!' : 'Atenção ao Caminho!';
            document.getElementById('modal-texto').innerText = tactic.explanation;
            
            if (tactic.success) {
                document.getElementById('modal-impacto').className = "p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-xs font-bold text-emerald-400";
                document.getElementById('modal-impacto').innerText = `Impacto Positivo: Causou ${calculatedDmg} de dano ao Espectro!`;
            } else {
                document.getElementById('modal-impacto').className = "p-3 bg-rose-950/30 border border-rose-500/20 rounded-xl text-xs font-bold text-rose-400";
                document.getElementById('modal-impacto').innerText = `Insegurança Aumentada: Perdeste ${tactic.dPlayer} de Vibe (HP).`;
            }

            modalConsciencia.classList.remove('hidden');
            startConsciousnessCountdown(5);
        }

        function executeCombatAction() {
            const boss = getBoss(currentStageIdx);
            const logCont = document.getElementById('battle-log');
            const combatCard = document.getElementById('combat-card-element');

            if (combatCard) {
                combatCard.classList.add('animate-shake');
                setTimeout(() => combatCard.classList.remove('animate-shake'), 400);
            }

            let logEntry = "";

            if (tempTactic.success) {
                currentBossHp -= tempCalculatedDmg;
                if (currentBossHp < 0) currentBossHp = 0;
                playBeepSound('boss_hit');
                logEntry = `<div class="text-emerald-400 font-bold">[EMPATIA] ${database.player.nick} escolheu "${tempTactic.name}"! ${tempTactic.msg}</div>`;
            } else {
                playerHp -= tempTactic.dPlayer;
                if (playerHp < 0) playerHp = 0;
                playBeepSound('error');
                logEntry = `<div class="text-rose-400 font-bold">[AGRESSIVIDADE] Escolheste "${tempTactic.name}". ${tempTactic.msg}</div>`;
            }

            if (logCont) {
                logCont.innerHTML += logEntry;
                logCont.scrollTop = logCont.scrollHeight;
            }

            currentTactics = [];

            if (playerHp <= 0) {
                playBeepSound('error');
                document.getElementById('battleground-container').classList.add('hidden');
                document.getElementById('battle-defeat-screen').classList.remove('hidden');
                return;
            }

            if (currentBossHp <= 0) {
                playBeepSound('levelup');
                addXP(120);

                if (boss.name.includes("Silêncio")) {
                    unlockBadge("🗣️ Rompe-Silêncio");
                    document.getElementById('mission-1-badge').innerText = "✅";
                }
                if (boss.name.includes("Troll")) unlockBadge("💻 Guardião Digital");
                if (boss.name.includes("Gárgula")) unlockBadge("🔨 Protetor do Património");

                document.getElementById('battleground-container').classList.add('hidden');
                
                if (boss.isFinal) {
                    document.getElementById('reflective-intro-text').innerText = boss.reflectiveIntro || "";
                    document.getElementById('modal-reflective-question').classList.remove('hidden');
                } else {
                    document.getElementById('battle-victory-screen').classList.remove('hidden');
                    document.getElementById('victory-title').innerText = `${boss.name} Purificado!`;
                    document.getElementById('victory-desc').innerText = `A tua escolha justa enfraqueceu o espectro e estabeleceu a cooperação.`;
                    document.getElementById('battle-xp-reward').innerText = `+120 XP`;
                }
                return;
            }

            loadCombatStage();
        }

        // --- SUBMETER PERGUNTA REFLEXIVA DO CHEFÃO FINAL ---
        window.submitReflectiveQuestion = async () => {
            const textVal = document.getElementById('textarea-reflective').value.trim();
            if (!textVal) {
                showToast("⚠️", "Escreve um pequeno relato ou sentimento para podermos enviar!");
                return;
            }

            const refData = {
                text: textVal,
                schoolCode: activeSchoolCode || "OFFLINE_CAMP",
                timestamp: new Date().toISOString()
            };

            if (isFirebaseActive && currentUser) {
                try {
                    const colRef = collection(db, 'usuarios', appId, 'public', 'data', 'reflections');
                    await addDoc(colRef, refData);
                } catch (e) {
                    console.error("Erro ao subir reflexão:", e);
                }
            } else {
                database.reflectiveResponses.push(refData);
            }

            document.getElementById('modal-reflective-question').classList.add('hidden');
            finishEntireGameJourney();
        };

        window.skipReflectiveQuestion = () => {
            document.getElementById('modal-reflective-question').classList.add('hidden');
            finishEntireGameJourney();
        };

        // --- DESABAFO ANÓNIMO LIVRE (SEMPRE DISPONÍVEL, SEM DEPENDER DA BATALHA) ---
        window.submitVentMessage = async (event) => {
            event.preventDefault();

            const textarea = document.getElementById('vent-textarea');
            const textVal = textarea.value.trim();
            if (!textVal) {
                showToast("⚠️", "Escreve algo antes de enviar!");
                playBeepSound('error');
                return;
            }

            const refData = {
                text: textVal,
                schoolCode: activeSchoolCode || "OFFLINE_CAMP",
                timestamp: new Date().toISOString(),
                source: "desabafo-livre"
            };

            if (isFirebaseActive && currentUser) {
                try {
                    const colRef = collection(db, 'usuarios', appId, 'public', 'data', 'reflections');
                    await addDoc(colRef, refData);
                } catch (e) {
                    console.error("Erro ao enviar desabafo:", e);
                    showToast("❌", "Não foi possível enviar agora. Tenta de novo em instantes.");
                    playBeepSound('error');
                    return;
                }
            } else {
                database.reflectiveResponses.push(refData);
            }

            textarea.value = "";
            showToast("💬", "Desabafo enviado. Obrigado por confiar nesse espaço!");
            playBeepSound('levelup');
        };

        function finishEntireGameJourney() {
            database.isGameFinished = true;
            
            const tabBtnRadar = document.getElementById('tab-btn-radar');
            tabBtnRadar.innerHTML = "<span>📡</span> <span class='hidden md:inline'>Radar de Clima ✨</span>";
            tabBtnRadar.className = "flex items-center gap-3 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold text-left w-full whitespace-nowrap opacity-100 transition-all border border-emerald-500/20";
            
            showToast("🏆", "Campanha Purificada! Desbloqueaste o teu Radar Escolar!");
            unlockBadge("🌟 Guardião(ã) Escolar");

            document.getElementById('battle-victory-screen').classList.remove('hidden');
            document.getElementById('victory-title').innerText = "🏆 Defensor Lenda da Escola!";
            document.getElementById('victory-desc').innerText = `${chosenFinalBoss ? chosenFinalBoss.name : "O chefão final"} foi curado da insegurança dele! Agora, ajuda a mapear os problemas da escola na aba 'Radar de Clima'.`;
            document.getElementById('battle-xp-reward').innerText = "+250 XP Extra";
        }

        // --- POOL DE TÁTICAS DE CONVIVÊNCIA COM EXPLICAÇÃO ---
        const poolTactics = {
            dialogo: [
                { name: "Chamar Pra Conversar", dBoss: 35, dPlayer: 0, msg: "Conversar sem brigar faz o ódio diminuir.", success: true, explanation: "Boa! Conversar sem acusar ninguém faz as pessoas pararem de se defender com raiva e começarem a se ouvir." },
                { name: "Gritar de Volta", dBoss: 0, dPlayer: 25, msg: "Gritar só deixa tudo pior.", success: false, explanation: "Gritar de volta só deixa a outra pessoa mais brava ainda. Brigar nunca resolve o problema de verdade." },
                { name: "Mandar Mensagens de Apoio", dBoss: 30, dPlayer: 0, msg: "Mensagens boas cortam o poder do Troll.", success: true, explanation: "Muito bom! Quando a turma se une pra apoiar quem tá sofrendo, as palavras ruins perdem a força." },
                { name: "Também Espalhar o Boato", dBoss: 0, dPlayer: 30, msg: "Passar fofoca adiante só piora tudo.", success: false, explanation: "Mandar um print ou fofoca adiante, mesmo 'só pros amigos', continua machucando alguém. A fofoca cresce cada vez que é repassada." },
                { name: "Pedir Ajuda de um Mediador", dBoss: 35, dPlayer: 0, msg: "Uma pessoa neutra ajuda a acalmar tudo.", success: true, explanation: "Ótima ideia! Pedir ajuda a um colega ou professor evita que a conversa vire briga e ajuda a achar uma solução." },
                { name: "Ignorar e Bloquear", dBoss: 25, dPlayer: 0, msg: "Cortar o acesso do Troll tira o poder dele.", success: true, explanation: "Também vale! Nem sempre precisa enfrentar: bloquear e denunciar o perfil também ajuda, sem alimentar a briga." }
            ],
            expressao: [
                { name: "Contar Pra Um Adulto", dBoss: 45, dPlayer: 0, msg: "Falar sobre o problema traz mais segurança.", success: true, explanation: "Corajoso! Contar pra um professor ou responsável não é 'dedurar', é criar uma rede de proteção pra todo mundo." },
                { name: "Ficar do Lado de Quem Exclui", dBoss: 0, dPlayer: 35, msg: "Ficar calado também machuca a turma.", success: false, explanation: "Concordar ou rir enquanto excluem alguém, só pra fazer parte do grupo, é apoiar uma injustiça e enfraquece o teu caráter." },
                { name: "Chamar o Colega Sozinho Pra Perto", dBoss: 40, dPlayer: 0, msg: "Acolher alguém acaba com a solidão dele.", success: true, explanation: "Demais! Chamar quem tá sozinho pra conversar ou brincar junto cura a solidão e deixa a escola mais legal." },
                { name: "Fingir Que Não Viu Nada", dBoss: 0, dPlayer: 30, msg: "Fingir que não viu deixa o problema crescer.", success: false, explanation: "Fingir que não reparou também é uma escolha — e ela deixa a injustiça continuar acontecendo, sem ninguém fazer nada." },
                { name: "Escrever o Que Sente", dBoss: 25, dPlayer: 0, msg: "Colocar os sentimentos no papel ajuda a pensar melhor.", success: true, explanation: "Boa estratégia! Escrever o que você sente ajuda a entender melhor a situação antes de decidir o que fazer." },
                { name: "Usar a Caixinha de Sugestões Anônima", dBoss: 35, dPlayer: 0, msg: "Contar sem se expor também é uma forma de ajudar.", success: true, explanation: "Esperto! Quando é difícil falar cara a cara, usar um canal anônimo garante que o problema chegue até quem pode ajudar." }
            ],
            preservacao: [
                { name: "Fazer um Desenho Legal no Lugar", dBoss: 50, dPlayer: 0, msg: "Deixar o espaço bonito de novo acalma todo mundo.", success: true, explanation: "Demais! Usar a energia pra deixar o espaço bonito (com autorização) recupera o clima bom da escola." },
                { name: "Avisar de Forma Segura", dBoss: 40, dPlayer: 0, msg: "Cuidar da escola é responsabilidade de todo mundo.", success: true, explanation: "Isso! Manter as salas e banheiros limpos garante um lugar bom pra todo mundo estudar." },
                { name: "Ignorar e Sujar Também", dBoss: 0, dPlayer: 25, msg: "Estragar as coisas também prejudica você.", success: false, explanation: "Sujar ou quebrar as coisas da escola também atrapalha o teu próprio dia a dia. Cuidar do espaço é respeitar o esforço de todo mundo." },
                { name: "Filmar Só Pra Rir", dBoss: 0, dPlayer: 30, msg: "Gravar sem fazer nada também é errado.", success: false, explanation: "Filmar alguém estragando as coisas só pra postar como 'piada' incentiva a pessoa a continuar, em vez de ajudar a parar." },
                { name: "Organizar um Mutirão de Limpeza", dBoss: 45, dPlayer: 0, msg: "Trabalhar junto deixa o espaço melhor de novo.", success: true, explanation: "Ótima liderança! Juntar a turma pra cuidar do espaço comum transforma o ambiente e inspira mais gente a cuidar também." },
                { name: "Avisar Alguém da Escola", dBoss: 35, dPlayer: 0, msg: "Avisar rápido evita que piore ainda mais.", success: true, explanation: "Boa! Avisar quem pode resolver rápido evita que o estrago fique maior e mostra que você se importa com o espaço de todos." }
            ],
            inseguranca: [
                { name: "Tentar Entender o Que Ele Sente", dBoss: 55, dPlayer: 0, msg: "Entender a dor dele tira a força dele.", success: true, explanation: "Golpe de mestre! Perceber que ele só ataca porque tá se sentindo fraco ou com medo derruba toda a defesa dele." },
                { name: "Humilhar de Volta", dBoss: 0, dPlayer: 40, msg: "Humilhar alguém só piora tudo.", success: false, explanation: "Tentar humilhar alguém na frente dos outros só deixa a pessoa mais brava e faz ela reagir de um jeito ainda pior." },
                { name: "Propor Conversa Sem Julgar", dBoss: 45, dPlayer: 0, msg: "Conversar sem julgar traz mais paz.", success: true, explanation: "Que legal! Chamar quem cria confusão pra falar sobre o que sente, sem julgar, ajuda ele a se sentir parte da turma de novo." },
                { name: "Falar Mal da Família Dele", dBoss: 0, dPlayer: 35, msg: "Atacar a família de alguém só machuca mais.", success: false, explanation: "Usar a vida pessoal de alguém como arma é cruel e só confirma o medo que alimenta esse comportamento agressivo." },
                { name: "Chamar Pra Um Projeto em Grupo", dBoss: 40, dPlayer: 0, msg: "Incluir em vez de excluir aproxima as pessoas.", success: true, explanation: "Jogada ótima! Dar uma tarefa importante pra quem se sente excluído costuma transformar a raiva em vontade de pertencer." },
                { name: "Chamar o Psicólogo da Escola", dBoss: 45, dPlayer: 0, msg: "Ajuda profissional resolve o problema de verdade.", success: true, explanation: "Muito maduro! Perceber que algumas dores precisam de ajuda especializada é um ato de cuidado, não de fraqueza." }
            ],
            resiliencia: [
                { name: "Respirar Fundo Antes de Agir", dBoss: 20, dPlayer: 0, msg: "Parar um segundo antes de reagir evita raiva.", success: true, explanation: "Ótimo hábito! Parar alguns segundos antes de reagir ajuda a escolher a atitude certa, em vez da primeira reação de raiva." },
                { name: "Explodir de Raiva na Hora", dBoss: 0, dPlayer: 20, msg: "Reagir sem pensar costuma piorar tudo.", success: false, explanation: "Reagir por impulso, sem pensar, costuma piorar a briga e ainda te deixa mais abalado depois." },
                { name: "Pedir Ajuda a um Amigo de Confiança", dBoss: 25, dPlayer: 0, msg: "Dividir o que você sente deixa tudo mais leve.", success: true, explanation: "Muito válido! Ninguém precisa resolver tudo sozinho — contar o que sente pra alguém de confiança te deixa mais forte." }
            ]
        };

        const bosses = [
            {
                name: "Espectro do Silêncio",
                emoji: "🤫",
                weakness: "Expressão",
                weaknessClass: "Empático(a) Ativo(a)",
                hp: 80,
                maxHp: 80,
                desc: "Esse monstro aparece quando você vê algo errado mas fica com medo de falar.",
                weaknessPool: "expressao",
                altPool: "dialogo"
            },
            {
                name: "Troll de Teclado",
                emoji: "👹",
                weakness: "Diálogo",
                weaknessClass: "Defensor(a) Digital",
                hp: 100,
                maxHp: 100,
                desc: "Esse monstro adora espalhar fofoca e maldade nos grupos da turma.",
                weaknessPool: "dialogo",
                altPool: "expressao"
            },
            {
                name: "Gárgula da Depredação",
                emoji: "🔨",
                weakness: "Preservação",
                weaknessClass: "Mediador(a) da Paz",
                hp: 110,
                maxHp: 110,
                desc: "Esse monstro fica mais forte quando alguém suja ou quebra as coisas da escola.",
                weaknessPool: "preservacao",
                altPool: "dialogo"
            }
        ];

        // --- VARIAÇÕES DO CHEFÃO FINAL (SORTEADO, NUNCA É SEMPRE O MESMO) ---
        const finalBossVariants = [
            {
                name: "Titã da Máscara",
                emoji: "🎭",
                weakness: "Insegurança",
                weaknessClass: "Mediador(a) da Paz",
                hp: 140,
                maxHp: 140,
                desc: "O monstro mais perigoso de todos. Ele esconde os problemas que tem em casa atacando os outros e desrespeitando as regras, só pra se sentir mais forte.",
                reflectiveIntro: "O Titã revelou que agia com raiva porque sofria em casa e tinha medo de não ser aceito.",
                weaknessPool: "inseguranca",
                altPool: "dialogo",
                isFinal: true
            },
            {
                name: "Coração de Ferro",
                emoji: "🛡️",
                weakness: "Insegurança",
                weaknessClass: "Mediador(a) da Paz",
                hp: 140,
                maxHp: 140,
                desc: "Esse monstro construiu uma armadura de frieza porque tem muito medo de ser rejeitado pelos outros.",
                reflectiveIntro: "O Coração de Ferro revelou que se fechava e afastava todo mundo porque tinha muito medo de ser rejeitado.",
                weaknessPool: "inseguranca",
                altPool: "dialogo",
                isFinal: true
            },
            {
                name: "Sombra da Raiva",
                emoji: "🔥",
                weakness: "Insegurança",
                weaknessClass: "Mediador(a) da Paz",
                hp: 140,
                maxHp: 140,
                desc: "Esse monstro nasce da raiva que alguém guarda por dentro sem saber como lidar com ela.",
                reflectiveIntro: "A Sombra da Raiva revelou que explodia com os outros porque não sabia lidar com tudo que sentia por dentro.",
                weaknessPool: "inseguranca",
                altPool: "dialogo",
                isFinal: true
            },
            {
                name: "Rei do Orgulho",
                emoji: "👑",
                weakness: "Insegurança",
                weaknessClass: "Mediador(a) da Paz",
                hp: 140,
                maxHp: 140,
                desc: "Esse monstro finge que está tudo bem o tempo todo, só pra ninguém perceber o quanto ele está sofrendo por dentro.",
                reflectiveIntro: "O Rei do Orgulho revelou que fingia estar bem o tempo todo pra ninguém descobrir que ele também sofria.",
                weaknessPool: "inseguranca",
                altPool: "dialogo",
                isFinal: true
            }
        ];

        let chosenFinalBoss = null;
        function getFinalBoss() {
            if (!chosenFinalBoss) {
                chosenFinalBoss = finalBossVariants[Math.floor(Math.random() * finalBossVariants.length)];
            }
            return chosenFinalBoss;
        }

        const TOTAL_STAGES = bosses.length + 1; // 3 chefões fixos + 1 chefão final sorteado

        function getBoss(idx) {
            return idx < bosses.length ? bosses[idx] : getFinalBoss();
        }

        // --- BANCO DE PALAVRAS-CHAVE (CONSTRUÍDO A PARTIR DAS PRÓPRIAS TÁTICAS DO JOGO) ---
        // Usa os termos das táticas certas/erradas de todas as pools para avaliar respostas escritas livremente.
        const STOPWORDS = new Set(["de","da","do","das","dos","com","para","por","uma","um","os","as","que","se","não","ao","aos","a","o","e","em","no","na","nos","nas","ou","é","ser","estar","seu","sua","seus","suas","este","esta","isso","isto","mais","menos","muito","muita","como","quando","porque","também","the"]);

        function normalizeText(text) {
            return (text || "")
                .toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z\s]/g, " ");
        }

        function extractKeywords(text) {
            return normalizeText(text)
                .split(/\s+/)
                .filter(w => w.length > 3 && !STOPWORDS.has(w));
        }

        function buildKeywordBanks() {
            const positive = new Set();
            const negative = new Set();
            Object.values(poolTactics).forEach(pool => {
                pool.forEach(tac => {
                    const words = extractKeywords(`${tac.name} ${tac.msg} ${tac.explanation}`);
                    words.forEach(w => (tac.success ? positive : negative).add(w));
                });
            });
            return { positive, negative };
        }

        const keywordBanks = buildKeywordBanks();

        function analyzeFreeResponse(text) {
            const words = extractKeywords(text);
            let posMatches = 0;
            let negMatches = 0;
            words.forEach(w => {
                if (keywordBanks.positive.has(w)) posMatches++;
                if (keywordBanks.negative.has(w)) negMatches++;
            });
            return { posMatches, negMatches, wordCount: words.length };
        }

        // --- SISTEMA DE COMBATE REAL ---
        let currentStageIdx = 0;
        let playerHp = 100;
        let currentBossHp = 0;
        let currentTactics = [];

        function shuffleArray(arr) {
            const copy = [...arr];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        }

        function pickRandom(pool, count) {
            return shuffleArray(pool).slice(0, count);
        }

        function generateTurnTactics(boss) {
            const weaknessPool = poolTactics[boss.weaknessPool] || [];
            const altPool = poolTactics[boss.altPool] || [];
            const resiliencePool = poolTactics.resiliencia || [];

            const selected = [
                ...pickRandom(weaknessPool, 2),
                ...pickRandom(altPool, 2),
                ...pickRandom(resiliencePool, 1)
            ];
            return shuffleArray(selected);
        }

        // --- CAIXA DE RESPOSTA LIVRE (ANÁLISE POR PALAVRAS-CHAVE) ---
        function resetFreeResponseBox() {
            const input = document.getElementById('battle-freetext-input');
            const btn = document.getElementById('btn-submit-freetext');
            const bar = document.getElementById('freetext-meter-bar');
            const label = document.getElementById('freetext-meter-label');
            if (!input) return;

            input.value = "";
            input.disabled = false;
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            bar.style.width = "50%";
            bar.className = "h-2 rounded-full bg-slate-600 transition-all duration-300";
            label.innerText = "Escreve para ver como a tua atitude está a soar.";
            label.className = "text-[10px] text-slate-500 font-bold";
        }

        function updateFreeResponseMeter() {
            const input = document.getElementById('battle-freetext-input');
            const bar = document.getElementById('freetext-meter-bar');
            const label = document.getElementById('freetext-meter-label');
            if (!input.value.trim()) {
                bar.style.width = "50%";
                bar.className = "h-2 rounded-full bg-slate-600 transition-all duration-300";
                label.innerText = "Escreve para ver como a tua atitude está a soar.";
                label.className = "text-[10px] text-slate-500 font-bold";
                return;
            }

            const { posMatches, negMatches } = analyzeFreeResponse(input.value);
            const total = posMatches + negMatches;
            // 50% = neutro. Cada ponto de diferença desloca a barra para um lado.
            const pct = total === 0 ? 50 : Math.max(5, Math.min(95, 50 + ((posMatches - negMatches) / total) * 50));
            bar.style.width = `${pct}%`;

            if (total === 0) {
                bar.className = "h-2 rounded-full bg-slate-600 transition-all duration-300";
                label.innerText = "Tenta usar palavras mais específicas sobre a atitude que tomarias.";
                label.className = "text-[10px] text-slate-500 font-bold";
            } else if (posMatches > negMatches) {
                bar.className = "h-2 rounded-full bg-emerald-500 transition-all duration-300";
                label.innerText = "A soar a uma atitude mais construtiva! 🌱";
                label.className = "text-[10px] text-emerald-400 font-bold";
            } else if (negMatches > posMatches) {
                bar.className = "h-2 rounded-full bg-rose-500 transition-all duration-300";
                label.innerText = "Cuidado, a soar a uma atitude mais prejudicial. ⚠️";
                label.className = "text-[10px] text-rose-400 font-bold";
            } else {
                bar.className = "h-2 rounded-full bg-amber-500 transition-all duration-300";
                label.innerText = "Está equilibrado — tenta ser mais claro sobre a tua atitude.";
                label.className = "text-[10px] text-amber-400 font-bold";
            }
        }
        window.updateFreeResponseMeter = updateFreeResponseMeter;

        function submitFreeResponse() {
            const input = document.getElementById('battle-freetext-input');
            const btn = document.getElementById('btn-submit-freetext');
            const text = input.value.trim();

            if (text.length < 8) {
                showToast("⚠️", "Escreve uma resposta um pouco mais completa antes de enviar!");
                playBeepSound('error');
                return;
            }

            const boss = getBoss(currentStageIdx);
            const { posMatches, negMatches } = analyzeFreeResponse(text);
            const isBonus = false; // A resposta livre não usa o bónus de classe, é avaliada só pelo conteúdo.

            let syntheticTactic;
            if (posMatches > negMatches) {
                const dBoss = Math.min(60, 25 + posMatches * 8);
                syntheticTactic = {
                    name: "A Tua Resposta",
                    dBoss,
                    dPlayer: 0,
                    success: true,
                    msg: "A tua resposta escrita mostrou uma atitude construtiva.",
                    explanation: "A tua resposta usou mais palavras associadas a atitudes de diálogo, respeito e cuidado do que a atitudes prejudiciais. Continua a pensar em soluções assim!"
                };
            } else if (negMatches > posMatches) {
                const dPlayer = Math.min(45, 15 + negMatches * 8);
                syntheticTactic = {
                    name: "A Tua Resposta",
                    dBoss: 0,
                    dPlayer,
                    success: false,
                    msg: "A tua resposta escrita aproximou-se mais de uma atitude prejudicial.",
                    explanation: "Repara nas palavras que usaste: pareciam apontar para uma reação mais agressiva, de exclusão ou de vingança. Tenta pensar em como resolver o conflito sem magoar ninguém."
                };
            } else {
                syntheticTactic = {
                    name: "A Tua Resposta",
                    dBoss: 0,
                    dPlayer: 10,
                    success: false,
                    msg: "A tua resposta ficou pouco clara sobre que atitude tomarias.",
                    explanation: "Não deu para perceber claramente se a tua atitude seria construtiva ou prejudicial. Tenta ser mais específico sobre o que exatamente farias na situação."
                };
            }

            input.disabled = true;
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');

            processTacticDecision(syntheticTactic, syntheticTactic.dBoss, isBonus);
        }
        window.submitFreeResponse = submitFreeResponse;

        function loadCombatStage() {
            if (!activeSchoolCode) {
                document.getElementById('battleground-container').classList.add('hidden');
                const list = document.getElementById('battle-actions-container');
                if (list) {
                    list.innerHTML = `
                        <div class="col-span-2 text-center py-8 space-y-4">
                            <p class="text-slate-400 font-bold">Introduz primeiro o Código Escolar na aba anterior para poderes aceder à campanha!</p>
                            <button onclick="switchTab('character')" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all">Sincronizar Código</button>
                        </div>
                    `;
                }
                return;
            }

            if (!database.player.created) {
                document.getElementById('battleground-container').classList.add('hidden');
                const list = document.getElementById('battle-actions-container');
                if (list) {
                    list.innerHTML = `
                        <div class="col-span-2 text-center py-8 space-y-4">
                            <p class="text-slate-400 font-bold">Cria o teu Herói primeiro para poderes entrar na Campanha!</p>
                            <button onclick="switchTab('character')" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all">Criar Herói agora</button>
                        </div>
                    `;
                }
                return;
            }

            if (currentStageIdx >= TOTAL_STAGES) {
                document.getElementById('battleground-container').classList.add('hidden');
                document.getElementById('battle-victory-screen').classList.remove('hidden');
                return;
            }

            const boss = getBoss(currentStageIdx);
            if (currentBossHp === 0) currentBossHp = boss.hp;

            document.getElementById('battleground-container').classList.remove('hidden');
            document.getElementById('battle-victory-screen').classList.add('hidden');
            document.getElementById('battle-defeat-screen').classList.add('hidden');

            document.getElementById('battle-boss-name').innerText = boss.name;
            document.getElementById('battle-boss-hp-text').innerText = `${currentBossHp}/${boss.maxHp} HP`;
            document.getElementById('battle-boss-emoji').innerText = boss.emoji;
            document.getElementById('battle-boss-weakness').innerText = `Fraqueza: ${boss.weakness}`;
            document.getElementById('battle-boss-display-title').innerText = boss.name;
            document.getElementById('battle-boss-desc').innerText = boss.desc;

            document.getElementById('battle-hero-hp-text').innerText = `${playerHp}/100 HP`;

            document.getElementById('battle-boss-hp-bar').style.width = `${(currentBossHp / boss.maxHp) * 100}%`;
            document.getElementById('battle-hero-hp-bar').style.width = `${playerHp}%`;

            if (currentTactics.length === 0) {
                currentTactics = generateTurnTactics(boss);
            }

            const actCont = document.getElementById('battle-actions-container');
            if (actCont) {
                actCont.innerHTML = '';
                currentTactics.forEach((tac) => {
                    if (!tac) return;
                    
                    const btn = document.createElement('button');
                    btn.className = "p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-indigo-500 text-left transition-all hover-scale-102 flex flex-col justify-between h-32";
                    
                    const isBonus = database.player.class === boss.weaknessClass && tac.success;
                    const dBossValue = isBonus ? tac.dBoss + 20 : tac.dBoss;

                    btn.onclick = () => processTacticDecision(tac, dBossValue, isBonus);
                    btn.innerHTML = `
                        <div class="space-y-1">
                            <h5 class="font-extrabold text-xs text-white">${tac.name}</h5>
                            <p class="text-[10px] text-slate-500 leading-tight">Escolha de atitude de convivência.</p>
                        </div>
                        <div class="flex justify-end items-center w-full">
                            <span class="text-xs">⚔️</span>
                        </div>
                    `;
                    actCont.appendChild(btn);
                });
            }

            resetFreeResponseBox();
        }
        window.loadCombatStage = loadCombatStage;

        window.nextLevel = () => {
            currentStageIdx++;
            currentBossHp = 0;
            document.getElementById('battle-victory-screen').classList.add('hidden');
            loadCombatStage();
        };

        window.retryCombat = () => {
            playerHp = 100;
            currentBossHp = 0;
            currentTactics = [];
            document.getElementById('battle-defeat-screen').classList.add('hidden');
            loadCombatStage();
        };

        window.addXP = (amount) => {
            database.player.xp += amount;
            if (database.player.xp >= 100) {
                database.player.level++;
                database.player.xp -= 100;
                showToast("⭐", `Subiste para o Nível ${database.player.level}!`);
                playBeepSound('levelup');
            }
        };

        // --- SISTEMA DE EMBLEMAS (COM ATUALIZAÇÃO VISUAL NA SIDEBAR DIREITA) ---
        window.unlockBadge = (badgeName) => {
            if (!database.badges.includes(badgeName)) {
                database.badges.push(badgeName);
                showToast("🏅", `Novo Emblema: ${badgeName}`);
                updateBadgesUI();
            }
        };

        function updateBadgesUI() {
            const container = document.getElementById('badges-collection-grid');
            if (container) {
                container.innerHTML = '';
                database.badges.forEach(b => {
                    const icon = b.split(' ')[0] || "🏅";
                    const title = b.replace(icon, '').trim();
                    const badgeEl = document.createElement('div');
                    badgeEl.className = "p-2 bg-slate-950 border border-indigo-500/10 rounded-xl text-center shadow";
                    badgeEl.innerHTML = `
                        <span class="text-xl block mb-1">${icon}</span>
                        <span class="font-black text-[9px] text-indigo-400 truncate block">${title}</span>
                    `;
                    container.appendChild(badgeEl);
                });
            }
        }

        // --- SUBMETER RESPOSTA AO RADAR (ALUNO) ---
        window.submitRadarResponse = async (event) => {
            event.preventDefault();

            const space = document.getElementById('radar-space').value;
            const vibe = document.querySelector('input[name="radar-vibe"]:checked').value;
            const delito = document.getElementById('radar-delito').value;

            const reportData = {
                space: space,
                vibe: vibe,
                delito: delito,
                schoolCode: activeSchoolCode || "OFFLINE_COL",
                timestamp: new Date().toISOString()
            };

            if (isFirebaseActive && currentUser) {
                try {
                    const colRef = collection(db, 'usuarios', appId, 'public', 'data', 'radarReports');
                    await addDoc(colRef, reportData);
                } catch (e) {
                    console.error("Falha ao salvar radar:", e);
                }
            } else {
                database.radarReports.push(reportData);
                updateDashboardCharts();
            }

            document.getElementById('mission-2-badge').innerText = "✅";
            showToast("📡", "Avaliação anónima enviada com sucesso! Obrigado pela cidadania.");
            document.getElementById('form-radar-percepcao').reset();
            switchTab('character');
        };

        // --- SALVAR ANOTAÇÕES DO INVESTIGADOR ---
        window.saveQGNotes = async () => {
            const source = document.getElementById('input-qg-source').value.trim();
            const solution = document.getElementById('input-qg-solution').value.trim();
            const practice = document.getElementById('textarea-qg-practice').value.trim();

            const notesData = {
                source,
                solution,
                practice,
                schoolCode: activeSchoolCode
            };

            if (isFirebaseActive && currentUser) {
                try {
                    const docRef = doc(db, 'usuarios', appId, 'public', 'data', 'qgNotes', activeSchoolCode);
                    await setDoc(docRef, notesData);
                    showToast("✨", "Plano guardado e sincronizado na nuvem!");
                } catch (e) {
                    console.error(e);
                    showToast("⚠️", "Erro ao guardar.");
                }
            } else {
                database.qgNotes = notesData;
                showToast("✨", "Anotações guardadas localmente.");
            }
        };

        // --- ATUALIZAR GRÁFICOS DO DASHBOARD NO QG ---
        function updateDashboardCharts() {
            if (!isInvestigador) return;

            const filteredReports = database.radarReports.filter(r => r.schoolCode === activeSchoolCode);

            const spaceLabels = ["Sala de Aula", "Pátio / Recreio", "Casas de Banho", "Quadra de Desportos", "Entrada / Saída"];
            const vibeBem = [0, 0, 0, 0, 0];
            const vibeMau = [0, 0, 0, 0, 0];
            const vibeNeutro = [0, 0, 0, 0, 0];
            const vibeAgitado = [0, 0, 0, 0, 0];

            filteredReports.forEach(rep => {
                const idx = spaceLabels.indexOf(rep.space);
                if (idx !== -1) {
                    if (rep.vibe === "Bem") vibeBem[idx]++;
                    else if (rep.vibe === "Mau") vibeMau[idx]++;
                    else if (rep.vibe === "Indiferente") vibeNeutro[idx]++;
                    else if (rep.vibe === "Agitado") vibeAgitado[idx]++;
                }
            });

            const delitosCount = {
                "Nenhum / Espaço Seguro": 0,
                "Bullying ou Ofensas": 0,
                "Vandalismo / Estragar Coisas": 0,
                "Exclusão Social / Solidão": 0,
                "Agressão Verbal / Discussões": 0
            };

            filteredReports.forEach(rep => {
                if (delitosCount[rep.delito] !== undefined) {
                    delitosCount[rep.delito]++;
                }
            });

            const ctxVibes = document.getElementById('chart-vibes').getContext('2d');
            if (vibesChartInstance) vibesChartInstance.destroy();
            vibesChartInstance = new Chart(ctxVibes, {
                type: 'bar',
                data: {
                    labels: ["Sala Aula", "Pátio", "Banho", "Quadra", "Entrada"],
                    datasets: [
                        { label: '😊 Bem', data: vibeBem, backgroundColor: '#10b981' },
                        { label: '🙁 Mau', data: vibeMau, backgroundColor: '#f43f5e' },
                        { label: '😐 Neutro', data: vibeNeutro, backgroundColor: '#64748b' },
                        { label: '⚡ Agitado', data: vibeAgitado, backgroundColor: '#eab308' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { stacked: true, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                        y: { stacked: true, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                    },
                    plugins: {
                        legend: { labels: { color: '#cbd5e1', font: { size: 10 } } }
                    }
                }
            });

            const ctxDelitos = document.getElementById('chart-delitos').getContext('2d');
            if (delitosChartInstance) delitosChartInstance.destroy();
            delitosChartInstance = new Chart(ctxDelitos, {
                type: 'pie',
                data: {
                    labels: ["Seguro", "Bullying", "Vandalismo", "Exclusão", "Agressão V."],
                    datasets: [{
                        data: Object.values(delitosCount),
                        backgroundColor: ['#10b981', '#a855f7', '#f43f5e', '#3b82f6', '#f97316']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 9 } } }
                    }
                }
            });

            const refCont = document.getElementById('dashboard-reflective-placeholder');
            if (refCont) {
                refCont.innerHTML = '';
                const filteredReflections = database.reflectiveResponses.filter(r => r.schoolCode === activeSchoolCode);
                if (filteredReflections.length === 0) {
                    refCont.innerHTML = `<p class="italic">Nenhum relato anónimo enviado até ao momento.</p>`;
                } else {
                    filteredReflections.forEach(ref => {
                        const div = document.createElement('div');
                        div.className = "p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1";
                        div.innerHTML = `
                            <p class="font-medium text-slate-300">"${ref.text}"</p>
                            <span class="block text-[9px] text-slate-600">Enviado em segurança de forma anónima</span>
                        `;
                        refCont.appendChild(div);
                    });
                }
            }
        }

        // --- ESCUTADORES EM TEMPO REAL ---
        function setupRealtimeSync() {
            if (unsubscribeReports) { unsubscribeReports(); unsubscribeReports = null; }
            if (unsubscribeCanvas) { unsubscribeCanvas(); unsubscribeCanvas = null; }
            if (unsubscribeReflections) { unsubscribeReflections(); unsubscribeReflections = null; }
            if (unsubscribeNotes) { unsubscribeNotes(); unsubscribeNotes = null; }

            if (!isFirebaseActive || !currentUser || !activeSchoolCode) return;

            const reportsCol = collection(db, 'usuarios', appId, 'public', 'data', 'radarReports');
            unsubscribeReports = onSnapshot(reportsCol, (snapshot) => {
                const cloudReports = [];
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.schoolCode === activeSchoolCode) {
                        cloudReports.push(data);
                    }
                });
                database.radarReports = cloudReports;
                if (isInvestigador) updateDashboardCharts();
            });

            const reflectionsCol = collection(db, 'usuarios', appId, 'public', 'data', 'reflections');
            unsubscribeReflections = onSnapshot(reflectionsCol, (snapshot) => {
                const cloudRef = [];
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.schoolCode === activeSchoolCode) {
                        cloudRef.push(data);
                    }
                });
                database.reflectiveResponses = cloudRef;
                if (isInvestigador) updateDashboardCharts();
            });

            const notesDoc = doc(db, 'usuarios', appId, 'public', 'data', 'qgNotes', activeSchoolCode);
            unsubscribeNotes = onSnapshot(notesDoc, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    document.getElementById('input-qg-source').value = data.source || "";
                    document.getElementById('input-qg-solution').value = data.solution || "";
                    document.getElementById('textarea-qg-practice').value = data.practice || "";
                }
            });
        }

        // --- SISTEMAS DE CUSTOMIZAÇÃO DO HERÓI ---
        const avataresDisponiveis = [
            { emoji: "🦊", nome: "Fox" },
            { emoji: "🐼", nome: "Panda" },
            { emoji: "🐨", nome: "Koala" },
            { emoji: "🦁", nome: "Lion" },
            { emoji: "👾", nome: "Ghost" },
            { emoji: "🦄", nome: "Unicorn" },
            { emoji: "🦉", nome: "Owl" },
            { emoji: "🐯", nome: "Tiger" }
        ];

        const classesDisponiveis = [
            { nome: "Defensor(a) Digital", desc: "Ajuda a parar brigas e bullying nos grupos da escola.", icon: "💻", bonus: "Bônus contra Trolls" },
            { nome: "Mediador(a) da Paz", desc: "Ajuda a resolver brigas e discussões de um jeito justo.", icon: "⚖️", bonus: "Bônus contra chefões" },
            { nome: "Empático(a) Ativo(a)", desc: "Acolhe quem está sozinho e ajuda a diminuir a solidão.", icon: "🧠", bonus: "Bônus contra Silêncio" }
        ];

        let selectedAvatarIdx = 0;
        let selectedClassIdx = 0;

        function renderCharacterCreator() {
            const avsCont = document.getElementById('avatars-container');
            if (!avsCont) return;
            avsCont.innerHTML = '';
            avataresDisponiveis.forEach((av, i) => {
                const btn = document.createElement('button');
                btn.className = `p-3 rounded-2xl bg-slate-950 border text-center transition-all flex flex-col items-center justify-center gap-1 hover:border-indigo-500 ${selectedAvatarIdx === i ? 'border-indigo-500 bg-indigo-500/10 scale-105' : 'border-slate-800'}`;
                btn.onclick = () => { selectedAvatarIdx = i; renderCharacterCreator(); playBeepSound('success'); };
                btn.innerHTML = `
                    <span class="text-2xl">${av.emoji}</span>
                    <span class="text-[9px] font-bold text-slate-400">${av.nome}</span>
                `;
                avsCont.appendChild(btn);
            });

            const clsCont = document.getElementById('classes-container');
            if (!clsCont) return;
            clsCont.innerHTML = '';
            classesDisponiveis.forEach((cls, i) => {
                const active = selectedClassIdx === i;
                const card = document.createElement('button');
                card.className = `p-4 text-left rounded-2xl border bg-slate-950 transition-all space-y-2 flex flex-col justify-between hover:border-indigo-500 ${active ? 'border-indigo-500 bg-indigo-500/10 scale-102' : 'border-slate-800'}`;
                card.onclick = () => { selectedClassIdx = i; renderCharacterCreator(); playBeepSound('success'); };
                card.innerHTML = `
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">${cls.icon}</span>
                            <h4 class="font-bold text-sm text-white">${cls.nome}</h4>
                        </div>
                        <p class="text-[11px] text-slate-400 leading-relaxed">${cls.desc}</p>
                    </div>
                    <span class="inline-block text-[9px] font-black uppercase text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">${cls.bonus}</span>
                `;
                clsCont.appendChild(card);
            });
        }

        function updateCharacterTabUI() {
            const card = document.getElementById('active-character-card');
            const form = document.getElementById('character-creator-form');
            if (!card || !form) return;

            if (database.player.created) {
                card.classList.remove('hidden');
                form.classList.add('hidden');
                
                document.getElementById('card-hero-avatar').innerText = database.player.avatar;
                document.getElementById('card-hero-nick').innerText = database.player.nick;
                document.getElementById('card-hero-class').innerText = database.player.class;
                document.getElementById('card-hero-lvl').innerText = `Lvl ${database.player.level}`;
                document.getElementById('card-hero-hp').innerText = `HP: ${playerHp}/100`;
            } else {
                card.classList.add('hidden');
                form.classList.remove('hidden');
            }
        }

        function showEditCharacterForm() {
            database.player.created = false;
            updateCharacterTabUI();
            playBeepSound('success');
        }
        window.showEditCharacterForm = showEditCharacterForm;

        function confirmCharacter() {
            const nickInput = document.getElementById('input-nick').value.trim();
            if (!nickInput) {
                showToast("⚠️", "Digita uma alcunha antes de avançar!");
                playBeepSound('error');
                return;
            }

            database.player.nick = nickInput;
            database.player.avatar = avataresDisponiveis[selectedAvatarIdx].emoji;
            database.player.class = classesDisponiveis[selectedClassIdx].nome;
            database.player.created = true;

            document.getElementById('combat-profile-avatar').innerText = database.player.avatar;
            document.getElementById('combat-profile-nick').innerText = database.player.nick;
            document.getElementById('combat-profile-class').innerText = database.player.class;
            document.getElementById('battle-hero-name').innerText = `Tu (${database.player.nick})`;

            playBeepSound('levelup');
            showToast("🎖️", "Herói criado! Entra em Combate.");
            updateCharacterTabUI();
            switchTab('game');
        }
        window.confirmCharacter = confirmCharacter;

        renderCharacterCreator();
        updateCharacterTabUI();
        updateBadgesUI();
