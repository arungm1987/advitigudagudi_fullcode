# Project Blueprint: Micro-Frontend (MFE) Ecosystem & Interview Mastery

## 1. Context & Evolution
This project began as a **Webpack Module Federation** MFE intended for AWS CodeCommit. After encountering significant "Permission Denied" hurdles with AWS SSH/IAM authentication, the decision was made to move the source of truth to **GitHub**.

**Current Status:**
- **Frontend:** `sample-mfe` (Webpack Module Federation) pushed to `https://github.com/arungm1987/aws-sample-mfe.git`.
- **Backend:** Two Node.js/Express microservices (to be containerized).
- **Target Domain:** `advitigudagudi.com`.
- **Deployment Strategy:** GitHub -> AWS CodePipeline -> Amazon ECR -> AWS ECS.

## 2. Technical Architecture
We are building a "Mini-Internet" on a local machine using **Docker** to ensure architectural parity with the cloud.
- **Service A (MFE):** The entry point, consuming data/components via Module Federation.
- **Service B (Backend 1):** Node.js Express API.
- **Service C (Backend 2):** Node.js Express API.

## 3. Interview Mastery Core Concepts (The "Brutal" Deep Dive)

### A. Docker Concepts
- **Image vs. Container:** The "Blueprint" vs. the "Running Instance."
- **Layering:** How Docker caches steps to speed up builds (and how to optimize them).
- **Networking:** How to make containers talk to each other using Service Discovery instead of hardcoded IPs.
- **Volumes:** Persisting data and "Hot Reloading" code from local folders into a container.

### B. Git Concepts
- **The Three Trees:** Working Directory, Staging Area (Index), and HEAD.
- **Remote Management:** How we switched from CodeCommit to GitHub and handled "non-fast-forward" errors.
- **Branching & Merging:** Rebase vs. Merge and when to use each in a professional team.

### C. Node.js & Express Concepts
- **The Event Loop:** How Node handles thousands of concurrent connections on a single thread.
- **Middleware:** The "Assembly Line" of an Express request (Auth, Logging, Validation).
- **CORS:** Why MFEs fail to talk to backends and how to fix it properly.

## 4. Immediate Roadmap (The "End-of-Day" Goal)
1. **Dockerize all 3 services:** Write 3 Dockerfiles.
2. **Orchestrate:** Use `docker-compose` to lift the entire stack with one command.
3. **Local Test:** Verify the MFE can fetch data from both backend services.
4. **Mastery Check:** Be able to explain the exact path of a packet from the browser into the Docker network.

---
**Prompt for AI Models:**
"I am building a Micro-Frontend (MFE) ecosystem using Webpack Module Federation and two Node.js Express backends. My code is hosted on GitHub. We are using Docker for local development and testing before deploying to AWS via CodePipeline/ECR. I need to be 'interview-ready' on Docker, Git, and Node.js concepts by the end of today. Help me build, run, and master this stack locally, focusing on architectural understanding and professional best practices."
