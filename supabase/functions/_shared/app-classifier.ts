// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║   AUTOSTACK — APPLICATION CLASSIFIER                                        ║
// ║   Analyzes repo and selects optimal AWS infrastructure                      ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { AWSService, CostEstimate, calculateMonthlyCost } from './cost-calculator.ts'

export type AppTier = 'static' | 'micro' | 'standard' | 'production' | 'enterprise'
export type AppType = 'static-site' | 'api' | 'fullstack' | 'worker' | 'scheduled'

export interface AppClassification {
  tier: AppTier
  appType: AppType
  language: string
  framework: string
  port: number
  buildCommand: string
  startCommand: string
  installCommand: string
  healthCheckPath: string
  hasDatabase: boolean
  hasQueue: boolean
  hasWebsockets: boolean
  hasFileStorage: boolean
  isStateful: boolean
  needsVPC: boolean
  estimatedCPU: number
  estimatedMemory: number
  trafficProfile: 'low' | 'medium' | 'high' | 'unknown'
  recommendedService: AWSService
  monthlyEstimate: CostEstimate
  detectionConfidence: number
  runtimeVersion?: string
}

interface StackDetection {
  language: string
  framework: string
  port: number
  runtimeVersion?: string
}

interface InfraRequirements {
  hasDatabase: boolean
  hasQueue: boolean
  hasWebsockets: boolean
  hasFileStorage: boolean
  isStateful: boolean
  needsVPC: boolean
}

interface Resources {
  cpu: number
  memory: number
}

interface Commands {
  install: string
  build: string | null
  start: string
  healthCheck: string
  runtimeVersion?: string
}

export async function classifyApplication(
  files: Map<string, string>,
  repoSize: number,
  fileCount: number
): Promise<AppClassification> {
  
  const stack = detectStack(files)
  const appType = detectAppType(files, stack)
  const resources = estimateResources(stack, files, appType)
  const requirements = detectInfraRequirements(files, stack)
  const service = selectAWSService(appType, resources, requirements, files)
  const commands = detectCommands(files, stack)
  const cost = calculateMonthlyCost(service, resources.cpu, resources.memory)

  return {
    tier: getTier(service),
    appType,
    language: stack.language,
    framework: stack.framework,
    port: stack.port,
    buildCommand: commands.build || '',
    startCommand: commands.start,
    installCommand: commands.install,
    healthCheckPath: commands.healthCheck,
    hasDatabase: requirements.hasDatabase,
    hasQueue: requirements.hasQueue,
    hasWebsockets: requirements.hasWebsockets,
    hasFileStorage: requirements.hasFileStorage,
    isStateful: requirements.isStateful,
    needsVPC: requirements.needsVPC,
    estimatedCPU: resources.cpu,
    estimatedMemory: resources.memory,
    trafficProfile: 'unknown',
    recommendedService: service,
    monthlyEstimate: cost,
    detectionConfidence: 0.85,
    runtimeVersion: commands.runtimeVersion || stack.runtimeVersion,
  }
}

function detectStack(files: Map<string, string>): StackDetection {
  const pkg = files.has('package.json') 
    ? JSON.parse(files.get('package.json')!) 
    : null

  // Node.js detection
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    
    const framework = 
      deps['next'] ? 'Next.js' :
      deps['@remix-run/react'] ? 'Remix' :
      deps['nuxt'] ? 'Nuxt' :
      deps['express'] ? 'Express' :
      deps['fastify'] ? 'Fastify' :
      deps['koa'] ? 'Koa' :
      deps['nestjs'] ? 'NestJS' :
      deps['react-scripts'] ? 'Create React App' :
      deps['react'] ? 'React' :
      deps['vue'] ? 'Vue' :
      deps['@angular/core'] ? 'Angular' :
      'Node.js'

    const port = detectPort(files, 'node')
    const nodeVersion = detectNodeVersion(files, pkg)

    return { language: 'Node.js', framework, port, runtimeVersion: nodeVersion }
  }

  // Python detection
  if (files.has('requirements.txt') || files.has('pyproject.toml')) {
    const content = (files.get('requirements.txt') || '').toLowerCase()
    
    const framework =
      content.includes('django') ? 'Django' :
      content.includes('flask') ? 'Flask' :
      content.includes('fastapi') ? 'FastAPI' :
      content.includes('starlette') ? 'Starlette' :
      'Python'

    const port = detectPort(files, 'python')
    const pythonVersion = detectPythonVersion(files)

    return { language: 'Python', framework, port, runtimeVersion: pythonVersion }
  }

  // Go detection
  if (files.has('go.mod')) {
    const modContent = files.get('go.mod') || ''
    const goVersion = modContent.match(/^go (.+)$/m)?.[1] || '1.21'
    const port = detectPort(files, 'go')

    return { language: 'Go', framework: 'Go', port, runtimeVersion: goVersion }
  }

  // Java/Spring Boot
  if (files.has('pom.xml') || files.has('build.gradle')) {
    const port = detectPort(files, 'java')
    return { language: 'Java', framework: 'Spring Boot', port, runtimeVersion: '17' }
  }

  // Ruby
  if (files.has('Gemfile')) {
    const port = detectPort(files, 'ruby')
    const rubyVersion = detectRubyVersion(files)
    return { language: 'Ruby', framework: 'Rails', port, runtimeVersion: rubyVersion }
  }

  // Default
  return { language: 'Unknown', framework: 'Unknown', port: 8080 }
}

function detectAppType(files: Map<string, string>, stack: StackDetection): AppType {
  const pkg = files.has('package.json') ? JSON.parse(files.get('package.json')!) : null

  // Static site detection
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const scripts = pkg.scripts || {}

    // Next.js static export
    if (deps['next'] && scripts.build?.includes('next build') && scripts.export) {
      return 'static-site'
    }

    // Pure frontend frameworks
    if ((deps['react-scripts'] || deps['vite']) && !deps['express'] && !deps['fastify']) {
      return 'static-site'
    }
  }

  // Worker/scheduled job detection
  if (files.has('Procfile')) {
    const procfile = files.get('Procfile') || ''
    if (procfile.includes('worker:') && !procfile.includes('web:')) {
      return 'worker'
    }
  }

  // API detection
  if (stack.framework === 'Express' || stack.framework === 'Fastify' || 
      stack.framework === 'Flask' || stack.framework === 'FastAPI') {
    return 'api'
  }

  // Fullstack detection
  if (stack.framework === 'Next.js' || stack.framework === 'Remix' || 
      stack.framework === 'Django' || stack.framework === 'Rails') {
    return 'fullstack'
  }

  return 'api'
}

function estimateResources(stack: StackDetection, files: Map<string, string>, appType: AppType): Resources {
  // Static sites don't need compute
  if (appType === 'static-site') {
    return { cpu: 0, memory: 0 }
  }

  // Base resources by language
  let cpu = 256
  let memory = 512

  if (stack.language === 'Node.js') {
    cpu = 512
    memory = 1024
  } else if (stack.language === 'Python') {
    cpu = 512
    memory = 1024
  } else if (stack.language === 'Go') {
    cpu = 256
    memory = 512
  } else if (stack.language === 'Java') {
    cpu = 1024
    memory = 2048
  }

  // Adjust for framework complexity
  if (stack.framework === 'Next.js' || stack.framework === 'Django') {
    cpu *= 1.5
    memory *= 1.5
  }

  return { 
    cpu: Math.round(cpu), 
    memory: Math.round(memory) 
  }
}

function detectInfraRequirements(files: Map<string, string>, stack: StackDetection): InfraRequirements {
  const allContent = Array.from(files.values()).join('\n').toLowerCase()
  const pkg = files.has('package.json') ? JSON.parse(files.get('package.json')!) : { dependencies: {} }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  return {
    hasDatabase: !!(
      deps['pg'] || deps['mysql2'] || deps['mongoose'] || deps['prisma'] ||
      deps['sequelize'] || deps['typeorm'] || deps['drizzle-orm'] ||
      allContent.includes('postgres') || allContent.includes('mysql') ||
      allContent.includes('mongodb') || allContent.includes('database_url')
    ),
    hasQueue: !!(
      deps['bull'] || deps['bullmq'] || deps['bee-queue'] || deps['agenda'] ||
      allContent.includes('redis') || allContent.includes('rabbitmq') ||
      allContent.includes('sqs')
    ),
    hasWebsockets: !!(
      deps['socket.io'] || deps['ws'] || deps['uwebsockets.js'] ||
      allContent.includes('websocket') || allContent.includes('socket.io')
    ),
    hasFileStorage: !!(
      deps['multer'] || deps['formidable'] || allContent.includes('s3') ||
      allContent.includes('uploadfile') || allContent.includes('multipart')
    ),
    isStateful: !!(
      deps['express-session'] || allContent.includes('session') ||
      allContent.includes('sticky') || allContent.includes('stateful')
    ),
    needsVPC: false,
  }
}

function selectAWSService(
  appType: AppType, 
  resources: Resources, 
  requirements: InfraRequirements,
  files: Map<string, string>
): AWSService {
  
  // Static sites always use S3 + CloudFront
  if (appType === 'static-site') {
    return 'cloudfront_s3'
  }

  // Workers/scheduled jobs use ECS Fargate without ALB
  if (appType === 'worker' || appType === 'scheduled') {
    return 'ecs_fargate_no_alb'
  }

  // Check for Kubernetes configs
  const hasK8sConfigs = Array.from(files.keys()).some(f =>
    f.includes('kubernetes/') || f.includes('k8s/') || 
    (f.endsWith('.yaml') && files.get(f)?.includes('kind:'))
  )

  if (hasK8sConfigs) {
    return 'eks_fargate'
  }

  // Simple API with no stateful requirements → App Runner
  if (
    !requirements.isStateful &&
    !requirements.hasWebsockets &&
    resources.cpu <= 1000 &&
    resources.memory <= 2048
  ) {
    return 'app_runner'
  }

  // Websockets require sticky sessions → ECS with ALB
  if (requirements.hasWebsockets) {
    return 'ecs_fargate'
  }

  // Larger apps → ECS Fargate
  if (resources.cpu <= 4096 && resources.memory <= 8192) {
    return 'ecs_fargate'
  }

  // Default: ECS Fargate is almost always right
  return 'ecs_fargate'
}

function detectCommands(files: Map<string, string>, stack: StackDetection): Commands {
  const pkg = files.has('package.json') ? JSON.parse(files.get('package.json')!) : null

  // Node.js
  if (pkg) {
    const scripts = pkg.scripts || {}
    const deps = pkg.dependencies || {}

    return {
      install: 'npm ci --only=production',
      build: scripts.build || (
        deps['next'] ? 'npm run build' :
        deps['react-scripts'] ? 'npm run build' :
        deps['vite'] ? 'npm run build' :
        pkg.devDependencies?.['typescript'] ? 'npm run build' :
        null
      ),
      start: scripts.start || (
        deps['next'] ? 'npm start' :
        pkg.main ? `node ${pkg.main}` :
        'node index.js'
      ),
      healthCheck: detectHealthCheckPath(files, stack),
      runtimeVersion: detectNodeVersion(files, pkg),
    }
  }

  // Python
  if (files.has('requirements.txt') || files.has('pyproject.toml')) {
    const content = (files.get('requirements.txt') || '').toLowerCase()

    return {
      install: 'pip install -r requirements.txt --no-cache-dir',
      build: null,
      start: (
        content.includes('gunicorn') ? 'gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app' :
        content.includes('uvicorn') ? 'uvicorn main:app --host 0.0.0.0 --port $PORT' :
        content.includes('flask') ? 'gunicorn app:app' :
        content.includes('django') ? 'gunicorn project.wsgi:application' :
        'python main.py'
      ),
      healthCheck: '/health',
      runtimeVersion: detectPythonVersion(files),
    }
  }

  // Go
  if (files.has('go.mod')) {
    return {
      install: 'go mod download',
      build: 'go build -o server ./...',
      start: './server',
      healthCheck: '/health',
      runtimeVersion: files.get('go.mod')?.match(/^go (.+)$/m)?.[1] || '1.21',
    }
  }

  // Java
  if (files.has('pom.xml') || files.has('build.gradle')) {
    const isMaven = files.has('pom.xml')
    return {
      install: isMaven ? 'mvn dependency:resolve' : 'gradle dependencies',
      build: isMaven ? 'mvn package -DskipTests -q' : 'gradle bootJar',
      start: 'java -jar target/*.jar',
      healthCheck: '/actuator/health',
      runtimeVersion: '17',
    }
  }

  // Ruby
  if (files.has('Gemfile')) {
    return {
      install: 'bundle install --without development test',
      build: files.has('Rakefile') ? 'bundle exec rake assets:precompile' : null,
      start: 'bundle exec rails server -b 0.0.0.0',
      healthCheck: '/health',
      runtimeVersion: detectRubyVersion(files),
    }
  }

  // Default
  return {
    install: 'echo "No install step detected"',
    build: null,
    start: 'echo "Could not detect start command"',
    healthCheck: '/',
  }
}

function detectHealthCheckPath(files: Map<string, string>, stack: StackDetection): string {
  const commonHealthPaths = ['/health', '/healthz', '/api/health', '/ping', '/_health', '/status']

  for (const [filename, content] of files.entries()) {
    if (!filename.endsWith('.js') && !filename.endsWith('.ts') &&
        !filename.endsWith('.py') && !filename.endsWith('.go')) continue

    for (const path of commonHealthPaths) {
      if (content.includes(`'${path}'`) || content.includes(`"${path}"`)) {
        return path
      }
    }
  }

  return '/health'
}

function detectPort(files: Map<string, string>, language: string): number {
  // Check for explicit PORT env var usage
  for (const content of files.values()) {
    const portMatch = content.match(/PORT\s*=\s*(\d+)/)
    if (portMatch) return parseInt(portMatch[1])
  }

  // Language defaults
  if (language === 'node') return 3000
  if (language === 'python') return 8000
  if (language === 'go') return 8080
  if (language === 'java') return 8080
  if (language === 'ruby') return 3000

  return 8080
}

function detectNodeVersion(files: Map<string, string>, pkg: any): string {
  if (files.has('.nvmrc')) {
    return files.get('.nvmrc')!.trim()
  }
  if (files.has('.node-version')) {
    return files.get('.node-version')!.trim()
  }
  if (pkg?.engines?.node) {
    return pkg.engines.node.replace(/[^0-9.]/g, '')
  }
  return '20'
}

function detectPythonVersion(files: Map<string, string>): string {
  if (files.has('.python-version')) {
    return files.get('.python-version')!.trim()
  }
  if (files.has('runtime.txt')) {
    const runtime = files.get('runtime.txt')!.trim()
    const match = runtime.match(/python-(.+)/)
    if (match) return match[1]
  }
  return '3.11'
}

function detectRubyVersion(files: Map<string, string>): string {
  if (files.has('.ruby-version')) {
    return files.get('.ruby-version')!.trim()
  }
  return '3.2'
}

function getTier(service: AWSService): AppTier {
  if (service === 'cloudfront_s3') return 'static'
  if (service === 'app_runner') return 'micro'
  if (service === 'ecs_fargate' || service === 'ecs_fargate_spot') return 'standard'
  if (service === 'ecs_fargate_no_alb') return 'standard'
  if (service === 'eks_fargate' || service === 'eks_ec2') return 'enterprise'
  return 'standard'
}
