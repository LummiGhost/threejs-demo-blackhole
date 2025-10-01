import * as THREE from 'three';

class BlackHoleVisualizer {
    constructor() {
        this.init();
        this.createScene();
        this.createCamera();
        this.createRenderer();
        this.createControls();
        
        // 在相机创建后再创建黑洞和其他效果
        this.createBlackHole();
        this.createAccretionDisk();
        this.createGravitationalLensing();
        
        this.setupEventListeners();
        this.animate();
        
        // 隐藏加载界面，显示控制信息
        this.hideLoading();
    }
    
    init() {
        // 基本参数
        this.container = document.body;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        
        // 物理常数 (简化)
        this.blackHoleRadius = 2.0;  // 史瓦西半径
        this.eventHorizonRadius = this.blackHoleRadius * 1.5;
        this.accretionDiskInnerRadius = this.blackHoleRadius * 3;
        this.accretionDiskOuterRadius = this.blackHoleRadius * 12;
        
        // 动画参数
        this.time = 0;
        this.rotationSpeed = 0.01;
        
        // 用户交互状态
        this.mouse = new THREE.Vector2();
        this.isMouseDown = false;
        this.lastMousePosition = new THREE.Vector2();
        
        // 动画状态
        this.autoRotate = false;
        this.autoRotateSpeed = 0.5;
        
        // 性能监控
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 60;

        // 图层设置 (0: 前景, 1: 背景)
        this.foregroundLayer = 0;
        this.backgroundLayer = 1;

        // 引力透镜辅助数据
        this.blackHoleScreenPosition = new THREE.Vector2(0.5, 0.5);
        this.blackHoleScreenRadius = 0.1;
        this.lensStrengthBase = 1.2;
        this._lensTmpVecA = new THREE.Vector3();
        this._lensTmpVecB = new THREE.Vector3();
        this._lensTmpVecC = new THREE.Vector3();
        this._lensTmpVecD = new THREE.Vector3();
    }
    
    createScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000008); // 深空背景
        
        // 添加环境光
        const ambientLight = new THREE.AmbientLight(0x404040, 0.1);
        this.scene.add(ambientLight);
        
        // 添加来自吸积盘的点光源
        this.diskLight = new THREE.PointLight(0xff6600, 2, 100);
        this.diskLight.position.set(0, 5, 0);
        this.scene.add(this.diskLight);
        
        // 添加星空背景
        this.createStarField();
    }
    
    createStarField() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 10000;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount; i++) {
            const i3 = i * 3;
            
            // 在球面上均匀分布星星
            const radius = 1000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            
            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);
            
            // 随机颜色 (偏白色和蓝白色)
            const brightness = 0.5 + Math.random() * 0.5;
            colors[i3] = brightness;
            colors[i3 + 1] = brightness;
            colors[i3 + 2] = brightness + Math.random() * 0.2;
        }
        
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const starMaterial = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });
        
        this.stars = new THREE.Points(starGeometry, starMaterial);
        this.stars.layers.set(this.backgroundLayer);
        this.scene.add(this.stars);
    }
    
    createBlackHole() {
        // 创建事件视界 (完全黑色的球体)
        const eventHorizonGeometry = new THREE.SphereGeometry(this.eventHorizonRadius, 64, 32);
        const eventHorizonMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 1.0
        });
        
        this.eventHorizon = new THREE.Mesh(eventHorizonGeometry, eventHorizonMaterial);
        this.scene.add(this.eventHorizon);
        
        // 创建黑洞光晕效果 (引力红移)
        const glowGeometry = new THREE.SphereGeometry(this.eventHorizonRadius * 1.1, 32, 16);
        const glowMaterial = new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.BackSide,
            uniforms: {
                time: { value: 0 },
                viewVector: { value: this.camera.position }
            },
            vertexShader: `
                uniform vec3 viewVector;
                varying float intensity;
                void main() {
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    vec3 actual_normal = vec3(modelMatrix * vec4(normal, 0.0));
                    intensity = pow(0.7 - dot(normalize(viewVector), actual_normal), 2.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying float intensity;
                void main() {
                    float pulsation = sin(time * 2.0) * 0.1 + 0.9;
                    vec3 glow = vec3(1.0, 0.5, 0.0) * intensity * pulsation;
                    gl_FragColor = vec4(glow, intensity * 0.3);
                }
            `
        });
        
        this.blackHoleGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.scene.add(this.blackHoleGlow);
        
        // 创建引力扭曲效果的可视化环
        const distortionRings = [];
        for (let i = 0; i < 3; i++) {
            const ringRadius = this.eventHorizonRadius * (2 + i * 0.5);
            const ringGeometry = new THREE.RingGeometry(ringRadius * 0.95, ringRadius * 1.05, 64);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(0.05, 0.8, 0.3 + i * 0.1),
                transparent: true,
                opacity: 0.1 - i * 0.02,
                side: THREE.DoubleSide
            });
            
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = Math.PI / 2;
            distortionRings.push(ring);
            this.scene.add(ring);
        }
        
        this.distortionRings = distortionRings;
    }
    
    createAccretionDisk() {
        // 创建主吸积盘
        const diskGeometry = new THREE.RingGeometry(
            this.accretionDiskInnerRadius, 
            this.accretionDiskOuterRadius, 
            128, 
            32
        );
        
        // 为吸积盘创建自定义着色器
        const diskMaterial = new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            uniforms: {
                time: { value: 0 },
                innerRadius: { value: this.accretionDiskInnerRadius },
                outerRadius: { value: this.accretionDiskOuterRadius },
                blackHolePos: { value: new THREE.Vector3(0, 0, 0) }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vDistance;
                uniform float innerRadius;
                uniform float outerRadius;
                uniform vec3 blackHolePos;
                
                void main() {
                    vUv = uv;
                    vPosition = position;
                    vDistance = distance(position, blackHolePos);
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float innerRadius;
                uniform float outerRadius;
                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vDistance;
                
                // 噪声函数
                float random(vec2 st) {
                    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                }
                
                float noise(vec2 st) {
                    vec2 i = floor(st);
                    vec2 f = fract(st);
                    float a = random(i);
                    float b = random(i + vec2(1.0, 0.0));
                    float c = random(i + vec2(0.0, 1.0));
                    float d = random(i + vec2(1.0, 1.0));
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
                }
                
                void main() {
                    float radius = length(vPosition.xz);
                    float normalizedRadius = (radius - innerRadius) / (outerRadius - innerRadius);
                    
                    // 基于半径的温度梯度 (越接近黑洞越热)
                    float temperature = 1.0 - normalizedRadius;
                    
                    // 角度计算用于螺旋模式
                    float angle = atan(vPosition.z, vPosition.x);
                    float spiralPattern = sin(angle * 3.0 + time * 2.0 - radius * 0.5) * 0.5 + 0.5;
                    
                    // 多层次噪声
                    float noiseScale = 8.0;
                    float turbulence = noise(vPosition.xz * noiseScale + time * 0.5) * 0.6 +
                                     noise(vPosition.xz * noiseScale * 2.0 + time * 0.3) * 0.3 +
                                     noise(vPosition.xz * noiseScale * 4.0 + time * 0.1) * 0.1;
                    
                    // 温度色彩映射 (从红色到黄色到白色)
                    vec3 coldColor = vec3(0.8, 0.2, 0.1);  // 深红
                    vec3 warmColor = vec3(1.0, 0.6, 0.2);  // 橙色
                    vec3 hotColor = vec3(1.0, 0.9, 0.7);   // 黄白色
                    
                    vec3 color;
                    if (temperature > 0.6) {
                        color = mix(warmColor, hotColor, (temperature - 0.6) / 0.4);
                    } else {
                        color = mix(coldColor, warmColor, temperature / 0.6);
                    }
                    
                    // 结合螺旋模式和湍流
                    float intensity = temperature * spiralPattern * turbulence * 2.0;
                    
                    // 边缘渐变
                    float edgeFade = smoothstep(0.0, 0.1, normalizedRadius) * 
                                    smoothstep(1.0, 0.9, normalizedRadius);
                    
                    intensity *= edgeFade;
                    
                    gl_FragColor = vec4(color * intensity, intensity * 0.8);
                }
            `
        });
        
        this.accretionDisk = new THREE.Mesh(diskGeometry, diskMaterial);
        this.accretionDisk.rotation.x = Math.PI / 2; // 使其水平
        this.scene.add(this.accretionDisk);
        
        // 创建粒子系统用于增强效果
        this.createAccretionParticles();
    }
    
    createAccretionParticles() {
        const particleCount = 5000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const velocities = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            
            // 在吸积盘范围内随机分布
            const radius = this.accretionDiskInnerRadius + 
                          Math.random() * (this.accretionDiskOuterRadius - this.accretionDiskInnerRadius);
            const theta = Math.random() * Math.PI * 2;
            const height = (Math.random() - 0.5) * 0.5; // 薄盘结构
            
            positions[i3] = radius * Math.cos(theta);
            positions[i3 + 1] = height;
            positions[i3 + 2] = radius * Math.sin(theta);
            
            // 基于温度的颜色 (越靠近黑洞越热)
            const normalizedRadius = (radius - this.accretionDiskInnerRadius) / 
                                    (this.accretionDiskOuterRadius - this.accretionDiskInnerRadius);
            const temperature = 1.0 - normalizedRadius;
            
            if (temperature > 0.7) {
                colors[i3] = 1.0;     // R
                colors[i3 + 1] = 0.9; // G
                colors[i3 + 2] = 0.7; // B
            } else if (temperature > 0.4) {
                colors[i3] = 1.0;     // R
                colors[i3 + 1] = 0.6; // G
                colors[i3 + 2] = 0.2; // B
            } else {
                colors[i3] = 0.8;     // R
                colors[i3 + 1] = 0.2; // G
                colors[i3 + 2] = 0.1; // B
            }
            
            sizes[i] = 0.5 + Math.random() * 1.5;
            
            // 轨道速度 (越接近黑洞越快)
            const orbitalSpeed = Math.sqrt(1.0 / radius) * 0.1;
            velocities[i3] = -orbitalSpeed * Math.sin(theta);
            velocities[i3 + 1] = 0;
            velocities[i3 + 2] = orbitalSpeed * Math.cos(theta);
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        
        this.accretionParticles = new THREE.Points(geometry, material);
        this.accretionParticles.userData = { velocities: velocities };
        this.scene.add(this.accretionParticles);
    }
    
    createGravitationalLensing() {
        // 创建背景星空的渲染目标
        this.backgroundRenderTarget = new THREE.WebGLRenderTarget(
            this.width, 
            this.height,
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                depthBuffer: false
            }
        );
        this.backgroundRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;
        
        // 创建用于引力透镜效果的场景
        this.lensScene = new THREE.Scene();
        this.lensCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // 引力透镜着色器
        const lensMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tBackground: { value: this.backgroundRenderTarget.texture },
                blackHolePos: { value: this.blackHoleScreenPosition.clone() },
                blackHoleRadius: { value: this.blackHoleScreenRadius },
                lensStrength: { value: this.lensStrengthBase },
                resolution: { value: new THREE.Vector2(this.width, this.height) },
                time: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tBackground;
                uniform vec2 blackHolePos;
                uniform float blackHoleRadius;
                uniform float lensStrength;
                uniform vec2 resolution;
                uniform float time;
                varying vec2 vUv;
                
                void main() {
                    vec2 delta = vUv - blackHolePos;
                    float distance = length(delta);
                    float eventHorizon = blackHoleRadius;
                    float influenceRadius = eventHorizon * 8.0;

                    if (distance < eventHorizon) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                    }

                    float falloff = 1.0 - smoothstep(eventHorizon, influenceRadius, distance);
                    float safeDistance = max(distance, eventHorizon * 0.75);
                    vec2 direction = distance > 0.0 ? delta / distance : vec2(0.0, 0.0);
                    float deflection = lensStrength * (eventHorizon * eventHorizon) / (safeDistance * safeDistance + eventHorizon * eventHorizon);
                    vec2 warpedUV = vUv - direction * deflection;
                    warpedUV = clamp(warpedUV, vec2(0.001), vec2(0.999));

                    vec2 finalUV = mix(vUv, warpedUV, falloff);
                    vec2 aberration = direction * deflection * 0.1;
                    vec3 color;
                    color.r = texture2D(tBackground, clamp(finalUV + aberration, vec2(0.001), vec2(0.999))).r;
                    color.g = texture2D(tBackground, clamp(finalUV, vec2(0.001), vec2(0.999))).g;
                    color.b = texture2D(tBackground, clamp(finalUV - aberration, vec2(0.001), vec2(0.999))).b;
                    float brightness = 1.0 + falloff * 0.15;
                    gl_FragColor = vec4(color * brightness, 1.0);
                }
            `
        });
        
        // 创建全屏四边形
        const lensGeometry = new THREE.PlaneGeometry(2, 2);
        this.lensMesh = new THREE.Mesh(lensGeometry, lensMaterial);
        this.lensMesh.frustumCulled = false;
        this.lensScene.add(this.lensMesh);
        this.lensMaterial = lensMaterial;
        
        // 修改渲染器设置以支持多通道渲染
        this.enableLensing = true;
    }
    
    createCamera() {
        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 2000);
        this.camera.position.set(0, 15, 30);
        this.camera.lookAt(0, 0, 0);

        // 默认启用前景与背景图层
        this.camera.layers.enable(this.foregroundLayer);
        this.camera.layers.enable(this.backgroundLayer);
    }
    
    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        this.container.appendChild(this.renderer.domElement);
    }
    
    createControls() {
        // 简单的鼠标控制
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
        this.cameraRadius = 30;
        this.cameraTheta = 0;
        this.cameraPhi = Math.PI / 2;
    }
    
    setupEventListeners() {
        window.addEventListener('resize', this.onWindowResize.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mouseup', this.onMouseUp.bind(this));
        window.addEventListener('wheel', this.onMouseWheel.bind(this));
        window.addEventListener('keydown', this.onKeyDown.bind(this));
    }
    
    onWindowResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(this.width, this.height);
        
        // 更新渲染目标大小
        if (this.backgroundRenderTarget) {
            this.backgroundRenderTarget.setSize(this.width, this.height);
        }
        
        // 更新透镜效果的分辨率
        if (this.lensMesh) {
            this.lensMesh.material.uniforms.resolution.value.set(this.width, this.height);
        }
    }
    
    onMouseMove(event) {
        const deltaX = event.clientX - this.lastMousePosition.x;
        const deltaY = event.clientY - this.lastMousePosition.y;
        
        if (this.isMouseDown) {
            this.cameraTheta -= deltaX * 0.01;
            this.cameraPhi += deltaY * 0.01;
            this.cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraPhi));
        }
        
        this.lastMousePosition.set(event.clientX, event.clientY);
    }
    
    onMouseDown(event) {
        this.isMouseDown = true;
        this.lastMousePosition.set(event.clientX, event.clientY);
    }
    
    onMouseUp() {
        this.isMouseDown = false;
    }
    
    onMouseWheel(event) {
        this.cameraRadius += event.deltaY * 0.01;
        this.cameraRadius = Math.max(5, Math.min(100, this.cameraRadius));
    }
    
    onKeyDown(event) {
        if (event.code === 'Space') {
            // 重置相机位置
            this.cameraRadius = 30;
            this.cameraTheta = 0;
            this.cameraPhi = Math.PI / 2;
            event.preventDefault();
        } else if (event.code === 'KeyA') {
            // 切换自动旋转
            this.autoRotate = !this.autoRotate;
            event.preventDefault();
        } else if (event.code === 'KeyL') {
            // 切换引力透镜效果
            this.enableLensing = !this.enableLensing;
            event.preventDefault();
        }
    }
    
    updateCamera() {
        // 自动旋转
        if (this.autoRotate) {
            this.cameraTheta += this.autoRotateSpeed * 0.01;
        }
        
        const x = this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
        const y = this.cameraRadius * Math.cos(this.cameraPhi);
        const z = this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
        
        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.cameraTarget);
    }

    updateLensingUniforms() {
        if (!this.lensMesh || !this.eventHorizon || !this.camera) {
            return;
        }

        const uniforms = this.lensMesh.material.uniforms;

        const centerWorld = this.eventHorizon.getWorldPosition(this._lensTmpVecA);
        this._lensTmpVecB.set(this.eventHorizonRadius, 0, 0);
        this.eventHorizon.localToWorld(this._lensTmpVecB);
        this._lensTmpVecC.set(0, this.eventHorizonRadius, 0);
        this.eventHorizon.localToWorld(this._lensTmpVecC);

        const centerNDC = this._lensTmpVecD.copy(centerWorld).project(this.camera);
        this._lensTmpVecB.project(this.camera);
        this._lensTmpVecC.project(this.camera);

        const radiusX = Math.abs(this._lensTmpVecB.x - centerNDC.x) * 0.5;
        const radiusY = Math.abs(this._lensTmpVecC.y - centerNDC.y) * 0.5;
        const radius = Math.max(0.0005, Math.max(radiusX, radiusY));

        this.blackHoleScreenPosition.set(
            centerNDC.x * 0.5 + 0.5,
            -centerNDC.y * 0.5 + 0.5
        );
        this.blackHoleScreenRadius = radius;

        uniforms.blackHolePos.value.copy(this.blackHoleScreenPosition);
        uniforms.blackHoleRadius.value = this.blackHoleScreenRadius;

        const cameraDistance = this.camera.position.distanceTo(centerWorld);
        const strength = this.lensStrengthBase * THREE.MathUtils.clamp(30 / cameraDistance, 0.6, 2.5);
        uniforms.lensStrength.value = strength;
    }
    
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        // 性能监控
        this.frameCount++;
        const currentTime = performance.now();
        if (currentTime - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = currentTime;
            this.updatePerformanceInfo();
        }
        
        this.time += 0.016; // ~60fps
        
        // 更新相机
        this.updateCamera();
        
        // 星空缓慢旋转
        if (this.stars) {
            this.stars.rotation.y += 0.0001;
        }
        
        // 更新黑洞效果
        if (this.blackHoleGlow) {
            this.blackHoleGlow.material.uniforms.time.value = this.time;
            this.blackHoleGlow.material.uniforms.viewVector.value = this.camera.position;
        }
        
        // 更新扭曲环的动画
        if (this.distortionRings) {
            this.distortionRings.forEach((ring, index) => {
                ring.rotation.z += (0.001 + index * 0.0005);
                ring.material.opacity = (0.1 - index * 0.02) * (0.8 + 0.2 * Math.sin(this.time * 2 + index));
            });
        }
        
        // 更新吸积盘
        if (this.accretionDisk) {
            this.accretionDisk.material.uniforms.time.value = this.time;
            this.accretionDisk.rotation.z += 0.002; // 缓慢旋转
        }
        
        // 更新光源
        if (this.diskLight) {
            // 光源轻微摆动模拟吸积盘的动态发光
            this.diskLight.intensity = 2 + Math.sin(this.time * 3) * 0.5;
            this.diskLight.position.y = 5 + Math.sin(this.time * 2) * 1;
        }
        
        // 更新吸积盘粒子
        if (this.accretionParticles) {
            const positions = this.accretionParticles.geometry.attributes.position.array;
            const velocities = this.accretionParticles.userData.velocities;
            
            for (let i = 0; i < positions.length; i += 3) {
                // 更新位置
                positions[i] += velocities[i] * 0.016;
                positions[i + 1] += velocities[i + 1] * 0.016;
                positions[i + 2] += velocities[i + 2] * 0.016;
                
                // 检查粒子是否太接近黑洞或太远
                const radius = Math.sqrt(positions[i] * positions[i] + positions[i + 2] * positions[i + 2]);
                
                if (radius < this.accretionDiskInnerRadius || radius > this.accretionDiskOuterRadius) {
                    // 重新生成粒子
                    const newRadius = this.accretionDiskInnerRadius + 
                                    Math.random() * (this.accretionDiskOuterRadius - this.accretionDiskInnerRadius);
                    const theta = Math.random() * Math.PI * 2;
                    
                    positions[i] = newRadius * Math.cos(theta);
                    positions[i + 1] = (Math.random() - 0.5) * 0.5;
                    positions[i + 2] = newRadius * Math.sin(theta);
                    
                    const orbitalSpeed = Math.sqrt(1.0 / newRadius) * 0.1;
                    velocities[i] = -orbitalSpeed * Math.sin(theta);
                    velocities[i + 1] = 0;
                    velocities[i + 2] = orbitalSpeed * Math.cos(theta);
                }
            }
            
            this.accretionParticles.geometry.attributes.position.needsUpdate = true;
        }
        
        // 渲染场景
        this.render();
    }
    
    render() {
        if (this.enableLensing && this.backgroundRenderTarget && this.lensScene) {
            this.updateLensingUniforms();

            // 第一步：仅渲染背景层 (星空) 到纹理
            this.camera.layers.set(this.backgroundLayer);
            this.renderer.setRenderTarget(this.backgroundRenderTarget);
            this.renderer.clear(true, true, true);
            this.renderer.render(this.scene, this.camera);
            this.renderer.setRenderTarget(null);

            // 更新透镜效果的 uniforms
            const lensUniforms = this.lensMesh.material.uniforms;
            lensUniforms.tBackground.value = this.backgroundRenderTarget.texture;
            lensUniforms.time.value = this.time;

            // 第二步：将引力透镜结果渲染到屏幕
            this.renderer.autoClear = true;
            this.renderer.render(this.lensScene, this.lensCamera);

            // 第三步：叠加前景对象 (黑洞、吸积盘等)
            this.camera.layers.set(this.foregroundLayer);
            this.renderer.autoClear = false;
            this.renderer.clearDepth();
            this.renderer.render(this.scene, this.camera);
            this.renderer.autoClear = true;

            // 恢复相机可见层到默认状态 (前景+背景)
            this.camera.layers.enable(this.foregroundLayer);
            this.camera.layers.enable(this.backgroundLayer);
        } else {
            // 正常渲染时包含前景与背景
            this.camera.layers.enable(this.foregroundLayer);
            this.camera.layers.enable(this.backgroundLayer);
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    updatePerformanceInfo() {
        const info = document.getElementById('info');
        if (info) {
            const performanceInfo = info.querySelector('.performance');
            if (performanceInfo) {
                performanceInfo.textContent = `FPS: ${this.fps}`;
            } else {
                const p = document.createElement('p');
                p.className = 'performance';
                p.textContent = `FPS: ${this.fps}`;
                info.appendChild(p);
            }
        }
    }
    
    hideLoading() {
        const loading = document.getElementById('loading');
        const info = document.getElementById('info');
        const controls = document.getElementById('controls');
        
        if (loading) loading.classList.add('hidden');
        if (info) info.classList.remove('hidden');
        if (controls) controls.classList.remove('hidden');
    }
}

// 初始化应用
window.addEventListener('DOMContentLoaded', () => {
    new BlackHoleVisualizer();
});