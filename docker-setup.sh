#!/bin/bash

# Docker Setup Script for Advitigudagudi (Unix/Mac)
# This script helps set up and run the application locally

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker Desktop."
        exit 1
    fi
    print_success "Docker is installed: $(docker --version)"
}

# Check if Docker daemon is running
check_docker_daemon() {
    if ! docker ps &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker Desktop."
        exit 1
    fi
    print_success "Docker daemon is running"
}

# Start services
start_services() {
    print_info "Starting Docker services..."
    
    if [ "$FRESH" = true ]; then
        print_warning "Starting with fresh containers (removing existing ones)..."
        docker-compose down 2>/dev/null || true
    fi
    
    docker-compose up -d
    
    print_success "Services started successfully"
    print_info "Waiting for services to be healthy..."
    sleep 5
    show_status
}

# Stop services
stop_services() {
    print_info "Stopping Docker services..."
    docker-compose down
    print_success "Services stopped successfully"
}

# Clean up everything
clean_services() {
    print_warning "This will remove all containers and volumes (data will be lost)."
    read -p "Are you sure? (yes/no): " confirmed
    
    if [ "$confirmed" = "yes" ]; then
        docker-compose down -v
        print_success "All containers and volumes removed"
    else
        print_info "Cancelled"
    fi
}

# Show service status
show_status() {
    echo ""
    print_info "Service Status:"
    echo ""
    docker-compose ps
    echo ""
    print_success "Application is ready!"
    print_info "Frontend:  http://localhost:3000"
    print_info "Backend:   http://localhost:3001"
    print_info "Database:  http://localhost:8000"
}

# Show logs
show_logs() {
    if [ -z "$1" ]; then
        print_info "Showing logs for all services (press Ctrl+C to stop)..."
        docker-compose logs -f
    else
        print_info "Showing logs for: $1"
        docker-compose logs -f "$1"
    fi
}

# Test endpoints
test_endpoints() {
    echo ""
    print_info "Testing endpoints..."
    echo ""
    
    # Health check
    print_info "Testing health endpoint..."
    if curl -s http://localhost:3001/health > /dev/null; then
        print_success "Backend is healthy"
    else
        print_error "Backend health check failed"
    fi
    
    # Get users
    print_info "Testing get users endpoint..."
    if response=$(curl -s http://localhost:3001/users); then
        count=$(echo "$response" | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "0")
        print_success "Found $count users"
    else
        print_error "Get users endpoint failed"
    fi
    
    echo ""
}

# Create sample data
create_sample_data() {
    print_info "Creating sample users..."
    
    users=(
        '{"userId":"user-001","name":"Alice Johnson","email":"alice@example.com","phone":"555-0001"}'
        '{"userId":"user-002","name":"Bob Smith","email":"bob@example.com","phone":"555-0002"}'
        '{"userId":"user-003","name":"Carol White","email":"carol@example.com","phone":"555-0003"}'
        '{"userId":"user-004","name":"David Brown","email":"david@example.com","phone":"555-0004"}'
    )
    
    for user in "${users[@]}"; do
        if curl -s -X POST http://localhost:3001/test-registration \
            -H "Content-Type: application/json" \
            -d "$user" > /dev/null; then
            name=$(echo "$user" | grep -o '"name":"[^"]*' | cut -d'"' -f4)
            print_success "Created user: $name"
        fi
    done
    
    print_info "Sample data creation complete"
}

# Show help
show_help() {
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║   Advitigudagudi Docker Setup Tool    ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    echo "Usage: $0 [Action] [Options]"
    echo ""
    echo "Actions:"
    echo "  start         Start all services"
    echo "  stop          Stop all services"
    echo "  restart       Restart all services"
    echo "  logs          Show service logs"
    echo "  status        Show service status"
    echo "  test          Test all endpoints"
    echo "  sample        Create sample user data"
    echo "  clean         Remove all containers and volumes"
    echo ""
    echo "Options:"
    echo "  --fresh       Start with fresh containers"
    echo "  --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 start --fresh"
    echo "  $0 logs"
    echo ""
}

# Parse arguments
ACTION="${1:-start}"
FRESH=false

if [[ "$*" == *"--fresh"* ]]; then
    FRESH=true
fi

if [[ "$*" == *"--help"* ]] || [[ "$ACTION" == "help" ]]; then
    show_help
    exit 0
fi

# Main execution
echo ""
print_success "╔════════════════════════════════════════╗"
print_success "║  Advitigudagudi Docker Setup Started  ║"
print_success "╚════════════════════════════════════════╝"
echo ""

# Validate prerequisites
check_docker
check_docker_daemon

# Execute action
case "$ACTION" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        sleep 2
        start_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$2"
        ;;
    test)
        test_endpoints
        ;;
    sample)
        create_sample_data
        ;;
    clean)
        clean_services
        ;;
    *)
        print_error "Unknown action: $ACTION"
        show_help
        exit 1
        ;;
esac

echo ""
print_success "Operation completed successfully"
echo ""
