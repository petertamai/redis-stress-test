services:
  redis:
    image: redis:7-alpine

    # ==================== KERNEL TUNING (CRITICAL FOR 65K CONNECTIONS) ====================
    # Note: vm.overcommit_memory must be set on HOST (already done in /etc/sysctl.conf)
    # Only namespaced sysctls can be set here
    sysctls:
      net.core.somaxconn: 65535
      net.ipv4.tcp_max_syn_backlog: 65535

    # ==================== RESOURCE LIMITS ====================
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: '6'
          memory: 2G
        reservations:
          cpus: '2'
          memory: 2G
      restart_policy:
        condition: unless-stopped

    # ==================== FILE LIMITS ====================
    ulimits:
      nofile:
        soft: 100000
        hard: 100000

    # ==================== ENVIRONMENT VARIABLES ====================
    environment:
      # Memory configuration
      MAXMEMORY_MB: "2000"
      MAXMEMORY_POLICY: "noeviction"  # CRITICAL for BullMQ: prevents job data loss

      # Connection limits
      MAXCLIENTS: "65000"
      TCP_BACKLOG: "65535"
      TCP_KEEPALIVE: "300"

      # Multi-threading
      IO_THREADS: "4"
      IO_THREADS_DO_READS: "yes"

      # Persistence (disabled for max speed)
      APPENDONLY: "no"
      NOSAVE: "1"

      # Security - SET THIS IN EASYPANEL UI
      REDIS_PASSWORD: "WAKooms696"

      # Logging
      LOGLEVEL: "notice"

    # ==================== PERSISTENT STORAGE ====================
    volumes:
      - redis-data:/data

    # ==================== PORT MAPPING ====================
    # Internal port: 8899 (inside container)
    # External port: 9999 (accessible from host/other services)
    ports:
      - "9999:8899"

    # ==================== HEALTH CHECK ====================
    healthcheck:
      test: ["CMD", "redis-cli", "-p", "8899", "-a", "WAKooms696", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 10s

    # ==================== CUSTOM COMMAND ====================
    command:
      - redis-server
      - --port
      - "8899"
      - --requirepass
      - WAKooms696
      - --dir
      - /data
      - --maxmemory
      - 2000mb
      - --maxmemory-policy
      - noeviction
      - --appendonly
      - "no"
      - --save
      - ""
      - --protected-mode
      - "no"
      - --bind
      - 0.0.0.0
      - --tcp-backlog
      - "65535"
      - --maxclients
      - "65000"
      - --tcp-keepalive
      - "300"
      - --io-threads
      - "4"
      - --io-threads-do-reads
      - "yes"
      - --loglevel
      - notice
      - --lazyfree-lazy-eviction
      - "no"
      - --lazyfree-lazy-expire
      - "no"
      - --lazyfree-lazy-server-del
      - "no"
      - --lazyfree-lazy-user-del
      - "no"
      - --slowlog-log-slower-than
      - "1000000"
      - --slowlog-max-len
      - "128"
      - --notify-keyspace-events
      - ""

volumes:
  redis-data:
    driver: local
