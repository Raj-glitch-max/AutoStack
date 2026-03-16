# Requirements Document

## Introduction

AutoStack's one-click deployment system enables users to deploy applications from GitHub repositories to AWS infrastructure with real-time progress tracking, automated error detection, and intelligent infrastructure selection. The system analyzes repositories, generates optimized Docker containers, builds images using AWS CodeBuild, provisions appropriate infrastructure (App Runner, ECS Fargate, or EKS), and validates deployments with health checks—all while streaming live progress updates to the frontend.

## Glossary

- **Deployment_Pipeline**: The complete automated workflow from repository analysis to live application URL
- **Build_Agent**: AWS CodeBuild service that builds Docker images from repository code
- **Infrastructure_Provisioner**: Component that creates AWS resources (App Runner, ECS, or EKS) based on application requirements
- **Realtime_Subscriber**: Frontend component that receives live updates via Supabase Realtime CDC
- **Health_Validator**: Component that verifies deployed applications respond correctly before marking deployment as successful
- **Rollback_Manager**: Component that removes all AWS resources when deployment fails
- **Cost_Optimizer**: AI-powered component that selects optimal infrastructure tier based on application characteristics
- **Dockerfile_Generator**: Component that creates production-grade, secure Dockerfiles based on detected language and framework
- **Log_Streamer**: Component that captures and broadcasts build logs in real-time during image building
- **Resource_Tracker**: Component that tags and tracks all AWS resources for teardown capability

## Requirements

### Requirement 1: Database Schema for Deployment Tracking

**User Story:** As a system architect, I want comprehensive database schema for tracking deployment pipeline stages, so that all deployment state is persisted and can drive real-time UI updates.

#### Acceptance Criteria

1. THE Deployment_Pipeline SHALL store current_stage, stage_started_at, build_logs, error_analysis, live_url, ecr_repository_uri, image_tag, and infra_type fields in the deployments table
2. THE Deployment_Pipeline SHALL store infrastructure resource details including app_runner_service_arn, ecs_cluster_arn, ecs_service_arn, alb_arn, alb_dns_name, vpc_id, subnet_ids, and security_group_id
3. THE Deployment_Pipeline SHALL store build pipeline details including codebuild_project_name, codebuild_build_id, health_check_path, retry_count, rollback_available, and previous_image_tag
4. THE Deployment_Pipeline SHALL maintain a separate build_log_entries table with deployment_id, timestamp, level, text, and source columns for scalable log storage
5. THE Deployment_Pipeline SHALL maintain an infra_resources table tracking every AWS resource with deployment_id, org_id, provider, resource_type, resource_id, resource_arn, region, created_at, deleted_at, and deletion_status
6. THE Deployment_Pipeline SHALL support valid stage values: queued, analyzing, cost_selection, provisioning_infra, building_image, pushing_image, deploying, health_checking, active, failed, rolling_back, rolled_back
7. THE Deployment_Pipeline SHALL index build_log_entries by deployment_id and timestamp for efficient real-time queries
8. THE Deployment_Pipeline SHALL index infra_resources by deployment_id and org_id for efficient teardown operations

### Requirement 2: AWS Credential Management

**User Story:** As a security engineer, I want all AWS operations to use organization-specific assumed IAM roles, so that AutoStack never uses its own credentials and maintains proper security boundaries.

#### Acceptance Criteria

1. WHEN accessing AWS services, THE Deployment_Pipeline SHALL assume the organization's IAM role using STS AssumeRole
2. THE Deployment_Pipeline SHALL cache assumed credentials in Redis with 55-minute expiration to avoid repeated STS calls
3. WHEN credentials are cached and expire within 5 minutes, THE Deployment_Pipeline SHALL refresh credentials proactively
4. WHEN an organization has no AWS credentials configured, THE Deployment_Pipeline SHALL return a clear error message indicating AWS account connection is required
5. THE Deployment_Pipeline SHALL pass assumed credentials to all AWS SDK clients (ECR, CodeBuild, App Runner, ECS, EC2, ALB, IAM)
6. THE Deployment_Pipeline SHALL validate credential expiration before each AWS API call to prevent authentication failures

### Requirement 3: Dockerfile Generation

**User Story:** As a developer, I want production-grade Dockerfiles automatically generated for my application, so that I don't need Docker expertise to deploy.

#### Acceptance Criteria

1. WHEN an application is classified as Node.js, THE Dockerfile_Generator SHALL create a multi-stage Dockerfile with dependency caching, production-only dependencies, and non-root user
2. WHEN an application is classified as Python, THE Dockerfile_Generator SHALL create a Dockerfile with virtual environment, gunicorn/uvicorn support, and non-root user
3. WHEN an application is classified as Go, THE Dockerfile_Generator SHALL create a Dockerfile with static binary compilation and distroless runtime image
4. WHEN an application is classified as Java, THE Dockerfile_Generator SHALL create a Dockerfile with Maven/Gradle build stage and JRE-only runtime
5. WHEN an application is a static site (React/Vite/Angular), THE Dockerfile_Generator SHALL create a Dockerfile with build stage and nginx serving with SPA routing support
6. THE Dockerfile_Generator SHALL include health check commands in all generated Dockerfiles using the detected health check path
7. THE Dockerfile_Generator SHALL configure appropriate port exposure based on application classification
8. THE Dockerfile_Generator SHALL use tini as PID 1 for Node.js applications to handle signals correctly
9. THE Dockerfile_Generator SHALL set appropriate environment variables (NODE_ENV=production, PORT, PYTHONUNBUFFERED)
10. THE Dockerfile_Generator SHALL use appropriate base image versions (node:20-alpine, python:3.12-slim, golang:1.22-alpine, eclipse-temurin:21)

### Requirement 4: ECR Repository and CodeBuild Setup

**User Story:** As a deployment engineer, I want ECR repositories and CodeBuild projects automatically created in the user's AWS account, so that Docker images can be built and stored securely.

#### Acceptance Criteria

1. WHEN setting up build pipeline, THE Build_Agent SHALL create an ECR repository named autostack/{app_name} if it does not exist
2. WHEN an ECR repository already exists, THE Build_Agent SHALL reuse the existing repository
3. THE Build_Agent SHALL enable image scanning on push for all ECR repositories
4. THE Build_Agent SHALL tag ECR repositories with autostack:deployment, autostack:org, and autostack:app tags
5. THE Build_Agent SHALL create or reuse an IAM role named AutoStackCodeBuildRole with AmazonEC2ContainerRegistryPowerUser and CloudWatchLogsFullAccess policies
6. WHEN creating IAM roles, THE Build_Agent SHALL wait 10 seconds for IAM eventual consistency before proceeding
7. THE Build_Agent SHALL create a CodeBuild project with GitHub source, embedded buildspec, and privileged mode enabled for Docker builds
8. THE Build_Agent SHALL configure CodeBuild with appropriate compute type based on application language (BUILD_GENERAL1_MEDIUM for Java, BUILD_GENERAL1_SMALL for others)
9. THE Build_Agent SHALL embed the AI-generated Dockerfile content in the buildspec to avoid requiring Dockerfile in repository
10. THE Build_Agent SHALL configure CodeBuild environment variables for AWS_DEFAULT_REGION, ECR_REPO_URI, and APP_PORT
11. THE Build_Agent SHALL track all created resources (ECR repository, CodeBuild project) in infra_resources table
12. THE Build_Agent SHALL update deployment record with ecr_repository_uri and codebuild_project_name

### Requirement 5: Docker Image Building with Real-Time Log Streaming

**User Story:** As a developer, I want to see my Docker build progress in real-time, so that I can monitor the build process and diagnose issues immediately.

#### Acceptance Criteria

1. WHEN starting a build, THE Log_Streamer SHALL start a CodeBuild job with the specified branch
2. THE Log_Streamer SHALL update deployment stage to building_image immediately when build starts
3. THE Log_Streamer SHALL poll CodeBuild status every 5 seconds to detect status changes
4. THE Log_Streamer SHALL fetch new CloudWatch log events every 5 seconds during build
5. THE Log_Streamer SHALL classify log lines as error, warn, success, step, or info based on content patterns
6. THE Log_Streamer SHALL batch insert log entries to build_log_entries table for efficiency
7. THE Log_Streamer SHALL limit stored logs to last 500 lines per deployment to prevent unbounded growth
8. WHEN build status changes, THE Log_Streamer SHALL append a status update log entry with appropriate level
9. WHEN build succeeds, THE Log_Streamer SHALL extract image tag from resolved source version and update deployment record
10. WHEN build succeeds, THE Log_Streamer SHALL trigger infrastructure provisioning automatically
11. WHEN build fails, THE Log_Streamer SHALL analyze error logs and store error_analysis in deployment record
12. WHEN build fails and auto-fix is available, THE Log_Streamer SHALL apply the fix and retry automatically
13. THE Log_Streamer SHALL handle CloudWatch logs not being immediately available gracefully without failing
14. THE Log_Streamer SHALL continue streaming until build reaches terminal state (SUCCEEDED, FAILED, TIMED_OUT, STOPPED)

### Requirement 6: App Runner Infrastructure Provisioning

**User Story:** As a developer deploying a simple application, I want automatic App Runner provisioning, so that I get the fastest, cheapest deployment with auto-scaling to zero.

#### Acceptance Criteria

1. WHEN infra_type is app_runner, THE Infrastructure_Provisioner SHALL create an AWS App Runner service
2. THE Infrastructure_Provisioner SHALL configure App Runner with ECR image repository and authentication
3. THE Infrastructure_Provisioner SHALL set port configuration from deployment.port field
4. THE Infrastructure_Provisioner SHALL configure runtime environment variables (PORT, NODE_ENV=production)
5. THE Infrastructure_Provisioner SHALL enable auto-deployments when ECR image is updated
6. THE Infrastructure_Provisioner SHALL configure CPU and memory based on deployment.cpu_millicores and deployment.memory_mb
7. THE Infrastructure_Provisioner SHALL configure health check with protocol HTTP, path from deployment.health_check_path, interval 10s, timeout 5s
8. THE Infrastructure_Provisioner SHALL tag App Runner service with autostack:deployment and autostack:org tags
9. THE Infrastructure_Provisioner SHALL track App Runner service in infra_resources table
10. THE Infrastructure_Provisioner SHALL poll App Runner status every 15 seconds until status is RUNNING
11. WHEN App Runner status is RUNNING, THE Infrastructure_Provisioner SHALL extract service URL and trigger health checks
12. WHEN App Runner status is CREATE_FAILED, THE Infrastructure_Provisioner SHALL mark deployment as failed
13. WHEN App Runner does not reach RUNNING within 10 minutes, THE Infrastructure_Provisioner SHALL timeout and mark deployment as failed

### Requirement 7: ECS Fargate Infrastructure Provisioning

**User Story:** As a developer deploying a production application, I want automatic ECS Fargate + ALB provisioning, so that I get high availability, load balancing, and zero-downtime deployments.

#### Acceptance Criteria

1. WHEN infra_type is ecs_fargate, THE Infrastructure_Provisioner SHALL create a VPC with CIDR 10.0.0.0/16
2. THE Infrastructure_Provisioner SHALL create public and private subnets in 2 availability zones
3. THE Infrastructure_Provisioner SHALL create and attach an Internet Gateway to the VPC
4. THE Infrastructure_Provisioner SHALL create route tables with routes to Internet Gateway for public subnets
5. THE Infrastructure_Provisioner SHALL create an ALB security group allowing HTTP (80) and HTTPS (443) from internet
6. THE Infrastructure_Provisioner SHALL create an app security group allowing traffic only from ALB on application port
7. THE Infrastructure_Provisioner SHALL create an Application Load Balancer in public subnets with internet-facing scheme
8. THE Infrastructure_Provisioner SHALL create a target group with health check configuration from deployment record
9. THE Infrastructure_Provisioner SHALL create an HTTP listener forwarding to target group
10. THE Infrastructure_Provisioner SHALL create an ECS cluster with FARGATE and FARGATE_SPOT capacity providers
11. THE Infrastructure_Provisioner SHALL register a task definition with awsvpc network mode, Fargate compatibility, and appropriate CPU/memory
12. THE Infrastructure_Provisioner SHALL configure task definition with CloudWatch logs using awslogs driver
13. THE Infrastructure_Provisioner SHALL configure task definition with health check command using curl
14. THE Infrastructure_Provisioner SHALL create an ECS service with desired count 2 for high availability
15. THE Infrastructure_Provisioner SHALL configure ECS service with load balancer integration to target group
16. THE Infrastructure_Provisioner SHALL configure deployment settings with maximumPercent 200 and minimumHealthyPercent 100 for zero-downtime deployments
17. THE Infrastructure_Provisioner SHALL assign public IPs to tasks (simplified deployment without NAT Gateway)
18. THE Infrastructure_Provisioner SHALL track all created resources (VPC, subnets, IGW, security groups, ALB, target group, ECS cluster, ECS service) in infra_resources table
19. THE Infrastructure_Provisioner SHALL poll ECS service status every 20 seconds until at least 1 task is running
20. WHEN at least 1 ECS task is running, THE Infrastructure_Provisioner SHALL trigger health checks using ALB DNS name
21. WHEN ECS tasks do not start within 10 minutes, THE Infrastructure_Provisioner SHALL timeout and mark deployment as failed

### Requirement 8: Health Validation

**User Story:** As a deployment engineer, I want automated health checks before marking deployments as successful, so that users only see "deployment complete" when the application is actually responding.

#### Acceptance Criteria

1. WHEN infrastructure provisioning completes, THE Health_Validator SHALL update deployment stage to health_checking
2. THE Health_Validator SHALL attempt to fetch {base_url}/health endpoint every 10 seconds
3. THE Health_Validator SHALL use 5-second timeout for each health check request
4. THE Health_Validator SHALL retry health checks up to 12 times (2 minutes total)
5. WHEN health check returns HTTP 200, THE Health_Validator SHALL verify root path is also accessible
6. WHEN both health check and root path succeed, THE Health_Validator SHALL update deployment stage to active and set live_url
7. WHEN health checks succeed, THE Health_Validator SHALL send deployment_success notification
8. WHEN health checks fail after 2 minutes, THE Health_Validator SHALL mark deployment as failed with health_check_failure error analysis
9. THE Health_Validator SHALL log each health check attempt with result to build_log_entries
10. THE Health_Validator SHALL include response time in successful health check logs
11. THE Health_Validator SHALL provide actionable error messages when health checks fail (e.g., "Check that your app listens on PORT environment variable")

### Requirement 9: Real-Time Progress Tracking

**User Story:** As a user, I want to see real-time deployment progress updates, so that I know exactly what's happening and can diagnose issues immediately.

#### Acceptance Criteria

1. WHEN deployment stage changes, THE Deployment_Pipeline SHALL update deployments table which triggers Supabase Realtime CDC broadcast
2. WHEN build log entries are inserted, THE Deployment_Pipeline SHALL trigger Realtime broadcast to subscribed clients
3. THE Realtime_Subscriber SHALL subscribe to postgres_changes events on deployments table filtered by deployment_id
4. THE Realtime_Subscriber SHALL subscribe to postgres_changes events on build_log_entries table filtered by deployment_id
5. THE Realtime_Subscriber SHALL display stage progress with visual indicators (pending, in-progress, complete, failed)
6. THE Realtime_Subscriber SHALL display elapsed time for current stage
7. THE Realtime_Subscriber SHALL display build logs in terminal-style UI with syntax highlighting by log level
8. THE Realtime_Subscriber SHALL auto-scroll build logs as new entries arrive
9. THE Realtime_Subscriber SHALL allow users to disable auto-scroll
10. THE Realtime_Subscriber SHALL show "LIVE" indicator when build is in progress
11. WHEN deployment reaches active stage, THE Realtime_Subscriber SHALL display success state with clickable live URL
12. WHEN deployment reaches failed stage, THE Realtime_Subscriber SHALL display error card with error analysis and suggested fixes
13. THE Realtime_Subscriber SHALL limit displayed logs to last 500 lines for performance
14. THE Realtime_Subscriber SHALL format log timestamps in HH:MM:SS format

### Requirement 10: Resource Tagging and Tracking

**User Story:** As a system administrator, I want all AWS resources tagged consistently, so that I can track costs, perform teardown, and maintain resource inventory.

#### Acceptance Criteria

1. THE Resource_Tracker SHALL tag every created AWS resource with autostack:deployment tag containing deployment_id
2. THE Resource_Tracker SHALL tag every created AWS resource with autostack:org tag containing org_id
3. THE Resource_Tracker SHALL tag every created AWS resource with autostack:app tag containing app_name where applicable
4. THE Resource_Tracker SHALL insert a record into infra_resources table for every created AWS resource
5. THE Resource_Tracker SHALL store resource_type (vpc, subnet, security_group, ecr, codebuild, app_runner, ecs_cluster, ecs_service, alb, igw)
6. THE Resource_Tracker SHALL store resource_id (AWS resource identifier)
7. THE Resource_Tracker SHALL store resource_arn when available
8. THE Resource_Tracker SHALL store region for all resources
9. THE Resource_Tracker SHALL enable querying all resources by deployment_id for teardown operations
10. THE Resource_Tracker SHALL enable querying all resources by org_id for cost tracking and inventory

### Requirement 11: Error Detection and Analysis

**User Story:** As a developer, I want intelligent error detection and actionable fix suggestions, so that I can quickly resolve deployment failures.

#### Acceptance Criteria

1. WHEN a build fails, THE Deployment_Pipeline SHALL analyze all build log entries to identify root cause
2. THE Deployment_Pipeline SHALL classify errors into categories (build_error, dependency_error, dockerfile_error, health_check_failure, pipeline_error)
3. THE Deployment_Pipeline SHALL extract exact error messages from logs
4. THE Deployment_Pipeline SHALL generate human-readable error explanations
5. THE Deployment_Pipeline SHALL provide specific suggested fixes for common error patterns
6. THE Deployment_Pipeline SHALL estimate fix time (e.g., "Requires code change", "5 minutes", "Contact support")
7. THE Deployment_Pipeline SHALL indicate whether auto-fix is available
8. WHEN auto-fix is available, THE Deployment_Pipeline SHALL provide auto-fix action and description
9. THE Deployment_Pipeline SHALL store error_analysis as JSONB in deployments table
10. THE Deployment_Pipeline SHALL increment retry_count when deployment fails
11. THE Deployment_Pipeline SHALL support pattern matching for common errors (missing dependencies, port conflicts, memory issues)

### Requirement 12: Rollback and Teardown

**User Story:** As a deployment engineer, I want automatic rollback on failure, so that failed deployments don't leave orphaned resources in user AWS accounts.

#### Acceptance Criteria

1. WHEN deployment fails during provisioning, THE Rollback_Manager SHALL query infra_resources table for all resources with deployment_id
2. THE Rollback_Manager SHALL delete resources in reverse dependency order (services before clusters, subnets before VPCs)
3. THE Rollback_Manager SHALL update deployment stage to rolling_back during rollback process
4. THE Rollback_Manager SHALL log each resource deletion to build_log_entries
5. WHEN rollback completes, THE Rollback_Manager SHALL update deployment stage to rolled_back
6. THE Rollback_Manager SHALL update infra_resources records with deleted_at timestamp and deletion_status
7. THE Rollback_Manager SHALL handle deletion failures gracefully and continue with remaining resources
8. THE Rollback_Manager SHALL support manual teardown triggered by user
9. THE Rollback_Manager SHALL verify resource deletion by checking AWS API before marking as deleted
10. THE Rollback_Manager SHALL leave deployment record intact for audit trail even after rollback

### Requirement 13: Deployment Orchestration

**User Story:** As a system architect, I want a single orchestrator function coordinating all deployment agents, so that the deployment pipeline is maintainable and follows single responsibility principle.

#### Acceptance Criteria

1. WHEN user clicks deploy, THE Deployment_Pipeline SHALL create deployment record immediately and return deployment_id within 3 seconds
2. THE Deployment_Pipeline SHALL execute long-running work asynchronously using EdgeRuntime.waitUntil
3. THE Deployment_Pipeline SHALL coordinate agents in sequence: Dockerfile generation → ECR/CodeBuild setup → Image building → Infrastructure provisioning → Health validation
4. THE Deployment_Pipeline SHALL pass classification data from analysis phase to Dockerfile generator
5. THE Deployment_Pipeline SHALL pass ECR repository URI from setup phase to build phase
6. THE Deployment_Pipeline SHALL pass image tag from build phase to provisioning phase
7. THE Deployment_Pipeline SHALL pass live URL from provisioning phase to health validation phase
8. WHEN any agent fails, THE Deployment_Pipeline SHALL catch error, update deployment stage to failed, and store error analysis
9. THE Deployment_Pipeline SHALL respect 8-second function execution limit by delegating long work to async processes
10. THE Deployment_Pipeline SHALL enable frontend to start subscribing to Realtime updates immediately after receiving deployment_id

### Requirement 14: Integration with Existing Systems

**User Story:** As a system integrator, I want seamless integration with existing AutoStack components, so that the deployment pipeline leverages existing functionality without duplication.

#### Acceptance Criteria

1. THE Deployment_Pipeline SHALL use existing die-analyze function output for application classification
2. THE Deployment_Pipeline SHALL use existing app-classifier.ts for language and framework detection
3. THE Deployment_Pipeline SHALL use existing cost-calculator.ts for infrastructure sizing recommendations
4. THE Deployment_Pipeline SHALL use existing optimize-cost function for AI-powered cost optimization
5. THE Deployment_Pipeline SHALL use existing aws-assume-role function for credential verification
6. THE Deployment_Pipeline SHALL integrate with existing DeploymentFlow.jsx for multi-phase deployment UX
7. THE Deployment_Pipeline SHALL integrate with existing CostEstimateCard.jsx for cost comparison display
8. THE Deployment_Pipeline SHALL replace fake progress in OnboardingPage.jsx with real Realtime subscriptions
9. THE Deployment_Pipeline SHALL use existing GitHub App integration for repository access
10. THE Deployment_Pipeline SHALL use existing infra-provision function for EKS deployments when k8s/ configs are detected

### Requirement 15: Performance and Scalability

**User Story:** As a platform engineer, I want the deployment pipeline to meet strict performance targets, so that users get fast, reliable deployments.

#### Acceptance Criteria

1. THE Deployment_Pipeline SHALL return deployment_id within 3 seconds of user clicking deploy
2. THE Deployment_Pipeline SHALL complete simple Node.js app deployment to App Runner within 8 minutes
3. THE Deployment_Pipeline SHALL complete standard app deployment to ECS Fargate within 12 minutes
4. THE Deployment_Pipeline SHALL stream build logs with maximum 5-second latency
5. THE Deployment_Pipeline SHALL update deployment stage with maximum 2-second latency
6. THE Deployment_Pipeline SHALL handle concurrent deployments for different organizations without interference
7. THE Deployment_Pipeline SHALL cache AWS credentials for 55 minutes to minimize STS API calls
8. THE Deployment_Pipeline SHALL batch insert build log entries to minimize database writes
9. THE Deployment_Pipeline SHALL limit stored logs to 500 lines per deployment to prevent unbounded growth
10. THE Deployment_Pipeline SHALL use appropriate CodeBuild compute types to balance cost and build speed

### Requirement 16: Security and Compliance

**User Story:** As a security engineer, I want the deployment pipeline to follow security best practices, so that user applications and AWS accounts remain secure.

#### Acceptance Criteria

1. THE Deployment_Pipeline SHALL never use AutoStack's AWS credentials for user deployments
2. THE Deployment_Pipeline SHALL always assume organization-specific IAM roles for AWS operations
3. THE Deployment_Pipeline SHALL generate Dockerfiles with non-root users
4. THE Deployment_Pipeline SHALL enable ECR image scanning on push
5. THE Deployment_Pipeline SHALL configure security groups with least-privilege access (app only accessible from ALB)
6. THE Deployment_Pipeline SHALL use HTTPS for all external API calls
7. THE Deployment_Pipeline SHALL validate user authentication before accepting deployment requests
8. THE Deployment_Pipeline SHALL sanitize app names to prevent injection attacks
9. THE Deployment_Pipeline SHALL use distroless images for Go applications to minimize attack surface
10. THE Deployment_Pipeline SHALL configure health checks with appropriate timeouts to prevent resource exhaustion
