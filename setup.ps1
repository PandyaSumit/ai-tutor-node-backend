# setup.ps1 - Windows setup script for AI Tutor Platform
# Run with: powershell -ExecutionPolicy Bypass -File setup.ps1

Write-Host "AI Tutor Platform Setup Script (Windows)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check Node.js
Write-Host "`nChecking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js not found. Please install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check npm
Write-Host "`nChecking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "npm installed: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "npm not found" -ForegroundColor Red
    exit 1
}

# Check MongoDB
Write-Host "`nChecking MongoDB..." -ForegroundColor Yellow
try {
    $mongoCheck = Get-Service MongoDB -ErrorAction SilentlyContinue
    if ($mongoCheck) {
        Write-Host "MongoDB service found" -ForegroundColor Green
        if ($mongoCheck.Status -eq 'Running') {
            Write-Host "MongoDB is running" -ForegroundColor Green
        } else {
            Write-Host "MongoDB service exists but not running" -ForegroundColor Yellow
            Write-Host "Start it with: net start MongoDB" -ForegroundColor Yellow
        }
    } else {
        Write-Host "MongoDB not found" -ForegroundColor Red
        Write-Host "Install from: https://www.mongodb.com/try/download/community" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not check MongoDB service" -ForegroundColor Yellow
}

# Check Redis
Write-Host "`nChecking Redis..." -ForegroundColor Yellow
try {
    $redisProcess = Get-Process redis-server -ErrorAction SilentlyContinue
    if ($redisProcess) {
        Write-Host "Redis is running" -ForegroundColor Green
    } else {
        Write-Host "Redis not running - REQUIRED for Socket.IO!" -ForegroundColor Red
        Write-Host "Install Redis:" -ForegroundColor Yellow
        Write-Host "1. Enable WSL2: wsl --install" -ForegroundColor White
        Write-Host "2. In WSL: sudo apt-get install redis-server" -ForegroundColor White
        Write-Host "3. Start: sudo service redis-server start" -ForegroundColor White
        Write-Host "Or use Redis for Windows: https://github.com/microsoftarchive/redis/releases" -ForegroundColor White
    }
} catch {
    Write-Host "Redis not found - REQUIRED!" -ForegroundColor Red
}

# Install dependencies
Write-Host "`nInstalling npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "Error installing dependencies" -ForegroundColor Red
    exit 1
}

# Check .env
Write-Host "`nChecking .env file..." -ForegroundColor Yellow
if (Test-Path .env) {
    Write-Host ".env file exists" -ForegroundColor Green
    
    $envContent = Get-Content .env -Raw
    if ($envContent -match "JWT_SECRET=your_super_secret") {
        Write-Host "WARNING: Please update JWT_SECRET in .env" -ForegroundColor Yellow
    }
} else {
    Write-Host ".env file not found" -ForegroundColor Yellow
    if (Test-Path .env.example) {
        Copy-Item .env.example .env
        Write-Host "Created .env from .env.example" -ForegroundColor Green
        Write-Host "Please update the values in .env" -ForegroundColor Yellow
    }
}

# Generate secrets
Write-Host "`nGenerating secure secrets..." -ForegroundColor Yellow
$jwtSecret = node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
$sessionSecret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$apiKey = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

Write-Host "`nGenerated secrets (save these):" -ForegroundColor Green
Write-Host "JWT_SECRET=$jwtSecret" -ForegroundColor White
Write-Host "SESSION_SECRET=$sessionSecret" -ForegroundColor White
Write-Host "PYTHON_API_KEY=$apiKey" -ForegroundColor White

# TypeScript check
Write-Host "`nChecking TypeScript compilation..." -ForegroundColor Yellow
npx tsc --noEmit
if ($LASTEXITCODE -eq 0) {
    Write-Host "TypeScript compilation successful" -ForegroundColor Green
} else {
    Write-Host "TypeScript errors found. Please fix them before running." -ForegroundColor Red
}

# Summary
Write-Host "`n==================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Update .env with the generated secrets above"
Write-Host "2. Start MongoDB: net start MongoDB"
Write-Host "3. Start Redis (in WSL): sudo service redis-server start"
Write-Host "4. Setup Python FastAPI service"
Write-Host "5. Run: npm run dev"
Write-Host "`nCheck health: curl http://localhost:5000/health"

$response = Read-Host "`nStart development server now? (y/n)"
if ($response -eq 'y' -or $response -eq 'Y') {
    npm run dev
}