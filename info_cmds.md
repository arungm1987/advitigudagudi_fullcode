# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop everything
docker-compose down

# Start fresh (remove all data)
docker-compose down -v && docker-compose up -d