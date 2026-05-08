#!/usr/bin/env pwsh

# Docker Setup Script for Advitigudagudi
# This script helps set up and run the application locally

param(
    [string]$Action = "start",
    [switch]$Fresh = $false,
    [switch]$Clean = $false
)

# Color output
function Write-Success {
    Write-Host "$args" -ForegroundColor Green
}

function Write-Error-Custom {
    Write-Host "❌ $args" -ForegroundColor Red
}

function Write-Info {
    Write-Host "ℹ️  $args" -ForegroundColor Cyan
}

function Write-Warning-Custom {
    Write-Host "⚠️  $args" -ForegroundColor Yellow
}

# Check if Docker is installed
function Test-Docker {
    try {
        $output = docker --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "✓ Docker is installed: $output"
            return $true
        }
    }
    catch {
        Write-Error-Custom "Docker is not installed or not in PATH"
        return $false
    }
}

# Check if Docker daemon is running
function Test-DockerDaemon {
    try {
        docker ps >$null 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "✓ Docker daemon is running"
            return $true
        }
    }
    catch {
        Write-Error-Custom "Docker daemon is not running. Please start Docker Desktop."
        return $false
    }
}

# Start services
function Start-Services {
    Write-Info "Starting Docker services..."
    
    if ($Fresh) {
        Write-Warning-Custom "Starting with fresh containers (removing existing ones)..."
        docker-compose down 2>$null
    }
    
    docker-compose up -d
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "✓ Services started successfully"
        Write-Info "Waiting for services to be healthy..."
        Start-Sleep -Seconds 5
        Show-ServiceStatus
    }
    else {
        Write-Error-Custom "Failed to start services"
        return $false
    }
}

# Stop services
function Stop-Services {
    Write-Info "Stopping Docker services..."
    docker-compose down
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "✓ Services stopped successfully"
    }
    else {
        Write-Error-Custom "Failed to stop services"
    }
}

# Clean up everything
function Clean-Services {
    Write-Warning-Custom "Removing all containers and volumes..."
    $confirmed = Read-Host "This will remove all data. Are you sure? (yes/no)"
    
    if ($confirmed -eq "yes") {
        docker-compose down -v
        Write-Success "✓ All containers and volumes removed"
    }
    else {
        Write-Info "Cancelled"
    }
}

# Show service status
function Show-ServiceStatus {
    Write-Info "Service Status:"
    Write-Host ""
    docker-compose ps
    Write-Host ""
    Write-Success "✓ Application is ready!"
    Write-Info "Frontend:  http://localhost:3000"
    Write-Info "Backend:   http://localhost:3001"
    Write-Info "Database:  http://localhost:8000"
}

# Show logs
function Show-Logs {
    param([string]$Service = "")
    
    if ($Service) {
        Write-Info "Showing logs for: $Service"
        docker-compose logs -f $Service
    }
    else {
        Write-Info "Showing logs for all services (press Ctrl+C to stop)..."
        docker-compose logs -f
    }
}

# Test endpoints
function Test-Endpoints {
    Write-Info "Testing endpoints..."
    Write-Host ""
    
    # Health check
    Write-Info "Testing health endpoint..."
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -ErrorAction Stop
        Write-Success "✓ Backend is healthy"
    }
    catch {
        Write-Error-Custom "Backend health check failed"
    }
    
    # Get users
    Write-Info "Testing get users endpoint..."
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/users" -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json
        Write-Success "✓ Found $($data.count) users"
    }
    catch {
        Write-Error-Custom "Get users endpoint failed"
    }
    
    Write-Host ""
}

# Create sample data
function Create-SampleData {
    Write-Info "Creating sample users..."
    
    $users = @(
        @{ userId = "user-001"; name = "Alice Johnson"; email = "alice@example.com"; phone = "555-0001" },
        @{ userId = "user-002"; name = "Bob Smith"; email = "bob@example.com"; phone = "555-0002" },
        @{ userId = "user-003"; name = "Carol White"; email = "carol@example.com"; phone = "555-0003" },
        @{ userId = "user-004"; name = "David Brown"; email = "david@example.com"; phone = "555-0004" }
    )
    
    foreach ($user in $users) {
        try {
            $body = $user | ConvertTo-Json
            $response = Invoke-WebRequest -Uri "http://localhost:3001/test-registration" `
                -Method POST `
                -Headers @{ "Content-Type" = "application/json" } `
                -Body $body `
                -ErrorAction Stop
            Write-Success "✓ Created user: $($user.name)"
        }
        catch {
            Write-Error-Custom "Failed to create user: $($user.name)"
        }
    }
    
    Write-Info "Sample data creation complete"
}

# Main menu
function Show-Menu {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host "║   Advitigudagudi Docker Setup Tool    ║" -ForegroundColor Magenta
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Usage: .\docker-setup.ps1 [Action] [Options]"
    Write-Host ""
    Write-Host "Actions:"
    Write-Host "  start         Start all services"
    Write-Host "  stop          Stop all services"
    Write-Host "  restart       Restart all services"
    Write-Host "  logs          Show service logs"
    Write-Host "  status        Show service status"
    Write-Host "  test          Test all endpoints"
    Write-Host "  sample        Create sample user data"
    Write-Host "  clean         Remove all containers and volumes"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Fresh        Start with fresh containers"
    Write-Host "  -Clean        Remove all data before starting"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\docker-setup.ps1 start"
    Write-Host "  .\docker-setup.ps1 start -Fresh"
    Write-Host "  .\docker-setup.ps1 logs -Service user-microservice"
    Write-Host ""
}

# Main execution
Write-Host ""
Write-Success "╔════════════════════════════════════════╗"
Write-Success "║  Advitigudagudi Docker Setup Started  ║"
Write-Success "╚════════════════════════════════════════╝"
Write-Host ""

# Validate prerequisites
if (-not (Test-Docker)) {
    Write-Error-Custom "Docker is required. Please install Docker Desktop."
    exit 1
}

if (-not (Test-DockerDaemon)) {
    Write-Error-Custom "Docker daemon is not running. Please start Docker Desktop."
    exit 1
}

# Execute action
switch ($Action.ToLower()) {
    "start" {
        Start-Services
    }
    "stop" {
        Stop-Services
    }
    "restart" {
        Stop-Services
        Start-Sleep -Seconds 2
        Start-Services
    }
    "status" {
        Show-ServiceStatus
    }
    "logs" {
        Show-Logs $Service
    }
    "test" {
        Test-Endpoints
    }
    "sample" {
        Create-SampleData
    }
    "clean" {
        Clean-Services
    }
    "help" {
        Show-Menu
    }
    default {
        Write-Error-Custom "Unknown action: $Action"
        Show-Menu
        exit 1
    }
}

Write-Host ""
Write-Success "✓ Operation completed successfully"
Write-Host ""
