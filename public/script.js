
const socket = io();

// عناصر اللعبة
const tiktokConnection = document.getElementById('tiktokConnection');
const usernameInput = document.getElementById('usernameInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const commentsList = document.getElementById('commentsList');
const floatingTexts = document.getElementById('floatingTexts');

// متغيرات اللعبة الثلاثية الأبعاد
let scene, perspectiveCamera, orthographicCamera, renderer, player, enemies = [], bullets = [], particles = [];
let gameRunning = false;
let isConnected = false;
let score = 0;
let playerHealth = 100;
let enemiesKilled = 0;
let lastShot = 0;
let cameraAngle = 0;
let targetEnemy = null;
let cameraMode = 'third';
let audioEnabled = true;
let sounds = {};
let playerRotationTarget = 0;
let playerCurrentRotation = 0;
let activeCamera;
let audioContext;
let muzzleFlashLight;
let speechEnabled = false;
let speechSynthesis = window.speechSynthesis;
let arabicVoice = null;
let englishVoice = null;

// إعداد الأصوات للقراءة
function initSpeechVoices() {
    const voices = speechSynthesis.getVoices();
    
    // البحث عن صوت عربي
    arabicVoice = voices.find(voice => 
        voice.lang.includes('ar') || 
        voice.name.includes('Arabic') ||
        voice.name.includes('عربي')
    ) || voices.find(voice => voice.lang.includes('ar'));
    
    // البحث عن صوت إنجليزي
    englishVoice = voices.find(voice => 
        voice.lang.includes('en') || 
        voice.name.includes('English')
    ) || voices.find(voice => voice.lang.includes('en'));
    
    console.log('Arabic voice:', arabicVoice?.name);
    console.log('English voice:', englishVoice?.name);
}

// تحديد لغة النص
function detectLanguage(text) {
    // فحص وجود حروف عربية
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F]/;
    return arabicPattern.test(text) ? 'arabic' : 'english';
}

// قراءة النص بالصوت المناسب
function speakText(text, language = null) {
    if (!speechEnabled || !text.trim()) return;
    
    // إيقاف أي قراءة سابقة
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // تحديد اللغة تلقائياً إذا لم تُحدد
    if (!language) {
        language = detectLanguage(text);
    }
    
    // تطبيق الصوت المناسب
    if (language === 'arabic' && arabicVoice) {
        utterance.voice = arabicVoice;
        utterance.lang = 'ar-SA';
    } else if (language === 'english' && englishVoice) {
        utterance.voice = englishVoice;
        utterance.lang = 'en-US';
    }
    
    // إعدادات الصوت
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    
    speechSynthesis.speak(utterance);
}

function toggleSpeech() {
    speechEnabled = !speechEnabled;
    const button = document.getElementById('speechToggle');
    
    if (speechEnabled) {
        button.textContent = '🔇 إيقاف التحدث';
        button.classList.add('active');
        
        // اختبار القراءة
        const testText = 'تم تفعيل قراءة النصوص. Speech synthesis activated.';
        speakText(testText);
        
    } else {
        button.textContent = '🎤 التحدث';
        button.classList.remove('active');
        speechSynthesis.cancel();
    }
}

// إعداد الأصوات الافتراضية
function initDefaultSounds() {
    // إنشاء أصوات افتراضية باستخدام Web Audio API
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    sounds.shoot = createTone(800, 0.1);
    sounds.explosion = createTone(200, 0.3);
    sounds.hit = createTone(400, 0.2);
}

function createTone(frequency, duration) {
    if (!audioContext) return null;
    
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
        data[i] = Math.sin(2 * Math.PI * frequency * i / audioContext.sampleRate) * 0.3;
    }
    
    return buffer;
}

function playSound(buffer, volume = 1.0) {
    if (!audioEnabled || !buffer || !audioContext) return;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
}

function toggleAudio() {
    audioEnabled = !audioEnabled;
    document.getElementById('audioToggle').textContent = audioEnabled ? '🔊 الأصوات' : '🔇 صامت';
}

// إعداد اللعبة ثلاثية الأبعاد
function initGame() {
    // إنشاء المشهد
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    
    // إعداد الكاميرات
    perspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    perspectiveCamera.position.set(0, 15, 20);
    
    const aspectRatio = window.innerWidth / window.innerHeight;
    const frustumSize = 40;
    orthographicCamera = new THREE.OrthographicCamera(
        frustumSize * aspectRatio / -2,
        frustumSize * aspectRatio / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        1000
    );
    orthographicCamera.position.set(0, 50, 0);
    orthographicCamera.lookAt(0, 0, 0);

    activeCamera = perspectiveCamera;

    // إعداد المُرسل
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('gameContainer').appendChild(renderer.domElement);
    
    // إضافة الإضاءة
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 25);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // إنشاء الأرضية
    createGround();
    
    // إنشاء الشخصية
    createPlayer();
    
    // إعداد الأصوات
    initDefaultSounds();
    
    // بدء حلقة الرسم
    animate();
}

function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x2d5a27,
        transparent: true,
        opacity: 0.9
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // إضافة تفاصيل للأرضية
    for(let i = 0; i < 50; i++) {
        const grassGeometry = new THREE.ConeGeometry(0.1, 0.5, 4);
        const grassMaterial = new THREE.MeshLambertMaterial({ color: 0x1e4d1a });
        const grass = new THREE.Mesh(grassGeometry, grassMaterial);
        grass.position.set(
            (Math.random() - 0.5) * 180,
            0.25,
            (Math.random() - 0.5) * 180
        );
        scene.add(grass);
    }
}

function createPlayer() {
    const playerGroup = new THREE.Group();
    
    // جسم الشخصية
    const bodyGeometry = new THREE.BoxGeometry(1, 2, 0.8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x00AADD });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    body.castShadow = true;
    playerGroup.add(body);
    
    // رأس الشخصية
    const headGeometry = new THREE.SphereGeometry(0.4);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFFDBAC });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.4;
    head.castShadow = true;
    playerGroup.add(head);

    // الأذرع والأرجل
    const armGeometry = new THREE.BoxGeometry(0.3, 1, 0.3);
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0x00AADD });
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.65, 1.5, 0);
    rightArm.castShadow = true;
    playerGroup.add(rightArm);

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.65, 1.5, 0);
    leftArm.castShadow = true;
    playerGroup.add(leftArm);

    const legGeometry = new THREE.BoxGeometry(0.4, 1.2, 0.4);
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.25, 0.6, 0);
    rightLeg.castShadow = true;
    playerGroup.add(rightLeg);

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.25, 0.6, 0);
    leftLeg.castShadow = true;
    playerGroup.add(leftLeg);
    
    // السلاح
    const weaponGeometry = new THREE.BoxGeometry(0.1, 0.1, 1);
    const weaponMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
    weapon.position.set(0.6, 1.5, 0.5);
    weapon.castShadow = true;
    playerGroup.add(weapon);

    // ضوء البرق
    muzzleFlashLight = new THREE.PointLight(0xFFA500, 5, 2);
    muzzleFlashLight.position.set(0.6, 1.5, 1.0);
    muzzleFlashLight.visible = false;
    playerGroup.add(muzzleFlashLight);
    
    player = playerGroup;
    scene.add(player);
}

function createEnemyFromComment(username, message) {
    const enemyGroup = new THREE.Group();
    
    // جسم العدو
    const bodyGeometry = new THREE.BoxGeometry(0.9, 1.5, 0.9);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xCC0000 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.75;
    body.castShadow = true;
    enemyGroup.add(body);
    
    // رأس العدو
    const headGeometry = new THREE.SphereGeometry(0.35);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0x8B0000 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.75;
    head.castShadow = true;
    enemyGroup.add(head);

    // إضافة أشواك
    const spikeGeometry = new THREE.ConeGeometry(0.15, 0.5, 4);
    const spikeMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });

    for(let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
        const angle = (i / 4) * Math.PI * 2;
        spike.position.set(
            Math.cos(angle) * 0.45, 
            1.2, 
            Math.sin(angle) * 0.45
        );
        spike.rotation.z = angle - Math.PI / 2;
        spike.castShadow = true;
        enemyGroup.add(spike);
    }

    // إضافة نص الاسم فوق العدو
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.fillStyle = 'white';
    context.font = 'bold 20px Arial';
    context.textAlign = 'center';
    context.fillText(username, canvas.width / 2, 30);
    
    // إضافة التعليق
    context.font = '12px Arial';
    context.fillStyle = '#ffff00';
    const shortMessage = message.length > 20 ? message.substring(0, 20) + '...' : message;
    context.fillText(shortMessage, canvas.width / 2, 50);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const nameSprite = new THREE.Sprite(spriteMaterial);
    nameSprite.position.set(0, 3, 0);
    nameSprite.scale.set(4, 1, 1);
    enemyGroup.add(nameSprite);
    
    // موضع عشوائي حول اللاعب
    const angle = Math.random() * Math.PI * 2;
    const distance = 15 + Math.random() * 25;
    enemyGroup.position.set(
        Math.cos(angle) * distance,
        0,
        Math.sin(angle) * distance
    );
    
    enemyGroup.userData = { 
        health: 3, 
        speed: 0.03 + Math.random() * 0.02,
        username: username,
        message: message
    };
    
    return enemyGroup;
}

function createBullet(startPos, direction) {
    const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xFFD700,
        emissive: 0xFFFF00,
        emissiveIntensity: 1.5
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(startPos);
    bullet.userData = { 
        direction: direction.clone().normalize(),
        speed: 1.0,
        life: 100
    };
    
    playSound(sounds.shoot, 0.3);

    if (muzzleFlashLight) {
        muzzleFlashLight.visible = true;
        setTimeout(() => {
            muzzleFlashLight.visible = false;
        }, 75);
    }
    
    scene.add(bullet);
    bullets.push(bullet);
}

function createExplosion(position) {
    playSound(sounds.explosion, 0.5);
    
    for(let i = 0; i < 15; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.05 + Math.random() * 0.05);
        const particleMaterial = new THREE.MeshLambertMaterial({ 
            color: Math.random() > 0.5 ? 0xFF4444 : 0xFF8800,
            transparent: true,
            opacity: 1
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.copy(position);
        particle.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.4,
                Math.random() * 0.4,
                (Math.random() - 0.5) * 0.4
            ),
            life: 40 + Math.random() * 20
        };
        
        scene.add(particle);
        particles.push(particle);
    }
}

function findNearestEnemy() {
    let nearest = null;
    let minDistance = Infinity;
    
    enemies.forEach(enemy => {
        const distance = player.position.distanceTo(enemy.position);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = enemy;
        }
    });
    
    return nearest;
}

function setCameraMode(mode, button) {
    cameraMode = mode;
    
    if (mode === 'first' || mode === 'third') {
        activeCamera = perspectiveCamera;
    } else if (mode === 'top') {
        activeCamera = orthographicCamera;
    }

    document.querySelectorAll('.camera-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    button.classList.add('active');
}

function updateCamera() {
    if (!player) return;
    
    switch(cameraMode) {
        case 'first':
            const firstPersonPos = player.position.clone();
            firstPersonPos.y += 2.2;
            
            if (targetEnemy) {
                const lookDirection = new THREE.Vector3();
                lookDirection.subVectors(targetEnemy.position, firstPersonPos);
                lookDirection.normalize();
                
                const targetPos = firstPersonPos.clone().add(lookDirection.multiplyScalar(5));
                activeCamera.position.lerp(firstPersonPos, 0.1);
                activeCamera.lookAt(targetPos);
            } else {
                activeCamera.position.lerp(firstPersonPos, 0.1);
            }
            break;
            
        case 'top':
            const topPos = player.position.clone();
            topPos.y = 50;
            
            activeCamera.position.lerp(topPos, 0.05);
            activeCamera.lookAt(player.position);
            break;
            
        case 'third':
        default:
            const targetCameraPos = new THREE.Vector3();
            targetCameraPos.copy(player.position);
            targetCameraPos.add(new THREE.Vector3(
                Math.sin(cameraAngle) * 15,
                10,
                Math.cos(cameraAngle) * 15
            ));
            
            activeCamera.position.lerp(targetCameraPos, 0.02);
            activeCamera.lookAt(player.position);
            break;
    }
    activeCamera.updateProjectionMatrix();
}

function updateGame() {
    if (!gameRunning) return;
    
    targetEnemy = findNearestEnemy();
    
    if (targetEnemy) {
        const direction = new THREE.Vector3();
        direction.subVectors(targetEnemy.position, player.position);
        
        playerRotationTarget = Math.atan2(direction.x, direction.z);
        
        updateCamera();
        
        const now = Date.now();
        if (now - lastShot > 300) {
            const bulletStart = player.position.clone();
            bulletStart.y += 1.5;
            bulletStart.add(new THREE.Vector3(0.6, 0, 0.5));

            direction.normalize();
            createBullet(bulletStart, direction);
            lastShot = now;
        }
    }
    
    const rotationDiff = playerRotationTarget - playerCurrentRotation;
    const adjustedDiff = ((rotationDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
    playerCurrentRotation += adjustedDiff * 0.1;
    player.rotation.y = playerCurrentRotation;
    
    // تحديث الأعداء
    enemies.forEach((enemy, index) => {
        const direction = new THREE.Vector3();
        direction.subVectors(player.position, enemy.position);
        direction.normalize();
        direction.multiplyScalar(enemy.userData.speed);
        enemy.position.add(direction);
        
        enemy.lookAt(player.position);
        
        const distance = player.position.distanceTo(enemy.position);
        if (distance < 2) {
            playerHealth = Math.max(0, playerHealth - 10);
            updateUI();
            
            playSound(sounds.hit, 0.7);
            
            scene.remove(enemy);
            enemies.splice(index, 1);
            
            if (playerHealth <= 0) {
                gameOver();
            }
        }
    });
    
    // تحديث الرصاصات
    bullets.forEach((bullet, index) => {
        bullet.position.add(
            bullet.userData.direction.clone().multiplyScalar(bullet.userData.speed)
        );
        bullet.userData.life--;
        
        bullet.rotation.x += 0.3;
        bullet.rotation.y += 0.2;
        
        enemies.forEach((enemy, enemyIndex) => {
            const distance = bullet.position.distanceTo(enemy.position);
            if (distance < 1) {
                enemy.userData.health--;
                
                createExplosion(bullet.position);
                
                scene.remove(bullet);
                bullets.splice(index, 1);
                
                if (enemy.userData.health <= 0) {
                    scene.remove(enemy);
                    enemies.splice(enemyIndex, 1);
                    score += 10;
                    enemiesKilled++;
                    updateUI();
                    
                    // تأثير نص طائر
                    showFloatingText(
                        `قتل ${enemy.userData.username}!`, 
                        bullet.position, 
                        'floating-kill'
                    );
                }
            }
        });
        
        if (bullet.userData.life <= 0) {
            scene.remove(bullet);
            bullets.splice(index, 1);
        }
    });
    
    // تحديث الجسيمات
    particles.forEach((particle, index) => {
        particle.position.add(particle.userData.velocity);
        particle.userData.velocity.y -= 0.01;
        particle.userData.life--;
        
        const opacity = particle.userData.life / 60;
        particle.material.opacity = opacity;
        
        if (particle.userData.life <= 0) {
            scene.remove(particle);
            particles.splice(index, 1);
        }
    });
    
    if (cameraMode === 'third') {
        cameraAngle += 0.005;
    }
}

function updateUI() {
    document.getElementById('score').textContent = `النقاط: ${score}`;
    document.getElementById('health').style.width = `${playerHealth}%`;
    document.getElementById('enemyCount').textContent = `الأعداء: ${enemies.length}`;
}

function gameOver() {
    gameRunning = false;
    document.getElementById('finalScore').textContent = score;
    document.getElementById('enemiesKilled').textContent = enemiesKilled;
    document.getElementById('gameOver').style.display = 'block';
}

function restartGame() {
    gameRunning = true;
    score = 0;
    playerHealth = 100;
    enemiesKilled = 0;
    playerRotationTarget = 0;
    playerCurrentRotation = 0;
    
    enemies.forEach(enemy => scene.remove(enemy));
    bullets.forEach(bullet => scene.remove(bullet));
    particles.forEach(particle => scene.remove(particle));
    
    enemies = [];
    bullets = [];
    particles = [];
    
    player.position.set(0, 0, 0);
    player.rotation.set(0, 0, 0);
    
    document.getElementById('gameOver').style.display = 'none';
    updateUI();
}

function animate() {
    requestAnimationFrame(animate);
    updateGame();
    renderer.render(scene, activeCamera);
}

function showFloatingText(text, position, className) {
    const floatingDiv = document.createElement('div');
    floatingDiv.textContent = text;
    floatingDiv.className = `floating-text ${className}`;
    
    // تحويل الموضع ثلاثي الأبعاد إلى إحداثيات الشاشة
    const vector = position.clone();
    vector.project(activeCamera);
    
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (vector.y * -0.5 + 0.5) * window.innerHeight;
    
    floatingDiv.style.left = x + 'px';
    floatingDiv.style.top = y + 'px';
    
    floatingTexts.appendChild(floatingDiv);
    
    setTimeout(() => {
        if (floatingDiv.parentNode) {
            floatingDiv.parentNode.removeChild(floatingDiv);
        }
    }, 3000);
}

function addCommentToList(username, message) {
    const commentItem = document.createElement('div');
    commentItem.className = 'comment-item comment-new';
    
    commentItem.innerHTML = `
        <div class="comment-user">${username}</div>
        <div class="comment-text">${message}</div>
    `;
    
    commentsList.insertBefore(commentItem, commentsList.firstChild);
    
    // إزالة التعليقات القديمة
    while (commentsList.children.length > 20) {
        commentsList.removeChild(commentsList.lastChild);
    }
    
    // إزالة تأثير الجديد بعد ثانيتين
    setTimeout(() => {
        commentItem.classList.remove('comment-new');
    }, 2000);
}

// الأحداث
connectBtn.addEventListener('click', connectToTikTok);
disconnectBtn.addEventListener('click', disconnectFromTikTok);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectToTikTok();
});

function connectToTikTok() {
    const username = usernameInput.value.trim();
    if (!username) {
        alert('يرجى إدخال اسم المستخدم');
        return;
    }

    updateConnectionStatus('جاري الاتصال...', false);
    connectBtn.disabled = true;

    socket.emit('connect_tiktok', username);
}

function disconnectFromTikTok() {
    socket.emit('disconnect_tiktok');
    isConnected = false;
    gameRunning = false;
    updateConnectionStatus('غير متصل', false);
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    usernameInput.disabled = false;
    tiktokConnection.style.display = 'block';
}

function updateConnectionStatus(message, connected) {
    connectionStatus.textContent = message;
    connectionStatus.style.color = connected ? '#4CAF50' : '#F44336';
}

// Socket events
socket.on('tiktok_connected', (data) => {
    if (data.success) {
        isConnected = true;
        gameRunning = true;
        updateConnectionStatus('متصل بـ ' + data.username, true);
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        usernameInput.disabled = true;
        tiktokConnection.style.display = 'none';
        updateUI();
    } else {
        updateConnectionStatus('فشل الاتصال: ' + data.error, false);
        connectBtn.disabled = false;
    }
});

socket.on('chat_message', (data) => {
    if (!gameRunning) return;
    
    // إضافة التعليق للقائمة
    addCommentToList(data.nickname || data.username, data.message);
    
    // قراءة التعليق بالصوت
    const speechText = `${data.nickname || data.username} يقول: ${data.message}`;
    speakText(speechText);
    
    // إنشاء عدو من التعليق
    const enemy = createEnemyFromComment(
        data.nickname || data.username, 
        data.message
    );
    scene.add(enemy);
    enemies.push(enemy);
    
    // تأثير نص طائر
    showFloatingText(
        `عدو جديد: ${data.nickname || data.username}`, 
        enemy.position, 
        'floating-enemy'
    );
    
    updateUI();
});

socket.on('gift_received', (data) => {
    if (!gameRunning) return;
    
    // الهدايا تعطي قوة إضافية للاعب
    const bonusDamage = Math.min(data.diamondCount || 10, 50);
    
    // قراءة إشعار الهدية
    const giftText = `${data.nickname || data.username} أرسل هدية ${data.giftName}! قوة إضافية ${bonusDamage}`;
    speakText(giftText);
    
    showFloatingText(
        `🎁 ${data.nickname || data.username}: +${bonusDamage} قوة!`, 
        player.position, 
        'floating-gift'
    );
    
    // تطبيق ضرر إضافي على الأعداء القريبة
    enemies.forEach(enemy => {
        const distance = player.position.distanceTo(enemy.position);
        if (distance < 10) {
            enemy.userData.health -= 1;
            if (enemy.userData.health <= 0) {
                createExplosion(enemy.position);
                scene.remove(enemy);
                const index = enemies.indexOf(enemy);
                enemies.splice(index, 1);
                score += 5;
                enemiesKilled++;
            }
        }
    });
    
    updateUI();
});

socket.on('like_received', (data) => {
    if (!gameRunning) return;
    
    // الإعجابات تعطي صحة إضافية
    const healAmount = Math.min(data.likeCount || 1, 10);
    playerHealth = Math.min(playerHealth + healAmount, 100);
    
    // قراءة إشعار الإعجاب
    const likeText = `${data.nickname || data.username} أعجب بالمحتوى! صحة إضافية ${healAmount}`;
    speakText(likeText);
    
    showFloatingText(
        `❤️ +${healAmount} صحة!`, 
        player.position, 
        'floating-gift'
    );
    
    updateUI();
});

socket.on('tiktok_error', (error) => {
    if (error && error.message) {
        console.log('TikTok Error:', error.message);
        updateConnectionStatus('خطأ في الاتصال: ' + error.message, false);
    }
});

socket.on('stream_ended', () => {
    disconnectFromTikTok();
});

// التعامل مع تغيير حجم النافذة
window.addEventListener('resize', () => {
    perspectiveCamera.aspect = window.innerWidth / window.innerHeight;
    perspectiveCamera.updateProjectionMatrix();

    const aspectRatio = window.innerWidth / window.innerHeight;
    const frustumSize = 40;
    orthographicCamera.left = frustumSize * aspectRatio / -2;
    orthographicCamera.right = frustumSize * aspectRatio / 2;
    orthographicCamera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
});

// تهيئة أصوات القراءة
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = initSpeechVoices;
} else {
    initSpeechVoices();
}

// بدء اللعبة
initGame();
updateConnectionStatus('غير متصل', false);
