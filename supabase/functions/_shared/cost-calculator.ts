// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║   AUTOSTACK — REAL AWS COST CALCULATOR                                      ║
// ║   Last updated: 2026-03 | Source: https://aws.amazon.com/pricing/           ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

export type AWSService = 
  | 'app_runner' 
  | 'ecs_fargate' 
  | 'ecs_fargate_spot'
  | 'ecs_fargate_no_alb'
  | 'eks_fargate' 
  | 'eks_ec2'
  | 'cloudfront_s3'

export interface CostEstimate {
  service: string
  monthlyMin: number
  monthlyTypical: number
  monthlyMax: number
  breakdown: CostBreakdownItem[]
  savingsVsEKS: number
  displayPrice: string
}

export interface CostBreakdownItem {
  component: string
  monthlyCost: number
  note: string
}

// AWS Pricing Constants (us-east-1)
const AWS_PRICING = {
  appRunner: {
    perVCPUHourActive: 0.064,
    perGBHourActive: 0.007,
    perVCPUHourIdle: 0.000007,
    perGBHourIdle: 0.000007,
  },
  ecsFargate: {
    perVCPUHour: 0.04048,
    perGBHour: 0.004445,
    spotDiscountFactor: 0.30,
  },
  eks: {
    controlPlanePerHour: 0.10,
    fargateNodePerVCPU: 0.04048,
    fargateNodePerGB: 0.004445,
  },
  alb: {
    perHour: 0.008,
  },
  natGateway: {
    perHour: 0.045,
  },
  ecr: {
    perGBMonth: 0.10,
  },
  cloudfront: {
    perGBTransfer: 0.0085,
    per10KRequests: 0.0075,
  },
  s3: {
    perGBMonth: 0.023,
    perMillionPutRequests: 5.00,
    perMillionGetRequests: 0.40,
  },
}

const HOURS_PER_MONTH = 730

export function calculateMonthlyCost(
  service: AWSService,
  cpu: number,
  memory: number,
  expectedReqPerMonth: number = 1_000_000
): CostEstimate {
  const cpuVCPU = cpu / 1000
  const memoryGB = memory / 1024

  switch (service) {
    case 'app_runner': {
      const activeHours = HOURS_PER_MONTH * 0.20
      const idleHours = HOURS_PER_MONTH * 0.80

      const computeCost = 
        (cpuVCPU * AWS_PRICING.appRunner.perVCPUHourActive * activeHours) +
        (memoryGB * AWS_PRICING.appRunner.perGBHourActive * activeHours) +
        (cpuVCPU * AWS_PRICING.appRunner.perVCPUHourIdle * idleHours) +
        (memoryGB * AWS_PRICING.appRunner.perGBHourIdle * idleHours)

      const ecrStorage = 0.50
      const totalMin = computeCost * 0.5
      const totalTypical = computeCost + ecrStorage
      const totalMax = computeCost * 2.5

      const eksBaseline = 73 + 32

      return {
        service: 'AWS App Runner',
        monthlyMin: Math.round(totalMin * 100) / 100,
        monthlyTypical: Math.round(totalTypical * 100) / 100,
        monthlyMax: Math.round(totalMax * 100) / 100,
        breakdown: [
          { 
            component: 'App Runner compute', 
            monthlyCost: Math.round(computeCost * 100) / 100, 
            note: 'Scales to zero when idle' 
          },
          { 
            component: 'ECR image storage', 
            monthlyCost: ecrStorage, 
            note: 'Container image storage' 
          },
        ],
        savingsVsEKS: Math.round((eksBaseline - totalTypical) * 100) / 100,
        displayPrice: `$${Math.round(totalMin)} - $${Math.round(totalMax)}/month`,
      }
    }

    case 'ecs_fargate':
    case 'ecs_fargate_spot': {
      const isSpot = service === 'ecs_fargate_spot'
      const computeCost = 
        (cpuVCPU * AWS_PRICING.ecsFargate.perVCPUHour * HOURS_PER_MONTH) +
        (memoryGB * AWS_PRICING.ecsFargate.perGBHour * HOURS_PER_MONTH)
      
      const finalComputeCost = isSpot 
        ? computeCost * AWS_PRICING.ecsFargate.spotDiscountFactor 
        : computeCost

      const albCost = AWS_PRICING.alb.perHour * HOURS_PER_MONTH
      const natCost = AWS_PRICING.natGateway.perHour * HOURS_PER_MONTH
      const ecrStorage = 0.50

      const total = finalComputeCost + albCost + natCost + ecrStorage
      const eksBaseline = 73 + 32

      return {
        service: isSpot ? 'ECS Fargate Spot' : 'ECS Fargate',
        monthlyMin: Math.round(total * 0.8 * 100) / 100,
        monthlyTypical: Math.round(total * 100) / 100,
        monthlyMax: Math.round(total * 2 * 100) / 100,
        breakdown: [
          { 
            component: isSpot ? 'Fargate Spot compute' : 'Fargate compute', 
            monthlyCost: Math.round(finalComputeCost * 100) / 100, 
            note: `${cpuVCPU} vCPU, ${memoryGB.toFixed(1)}GB${isSpot ? ' (70% discount)' : ''}` 
          },
          { 
            component: 'Application Load Balancer', 
            monthlyCost: Math.round(albCost * 100) / 100, 
            note: 'HTTPS termination' 
          },
          { 
            component: 'NAT Gateway', 
            monthlyCost: Math.round(natCost * 100) / 100, 
            note: 'Outbound internet access' 
          },
          { 
            component: 'ECR storage', 
            monthlyCost: ecrStorage, 
            note: 'Container image' 
          },
        ],
        savingsVsEKS: Math.round((eksBaseline - total) * 100) / 100,
        displayPrice: `$${Math.round(total * 0.8)} - $${Math.round(total * 2)}/month`,
      }
    }

    case 'ecs_fargate_no_alb': {
      const computeCost = 
        (cpuVCPU * AWS_PRICING.ecsFargate.perVCPUHour * HOURS_PER_MONTH) +
        (memoryGB * AWS_PRICING.ecsFargate.perGBHour * HOURS_PER_MONTH)
      
      const natCost = AWS_PRICING.natGateway.perHour * HOURS_PER_MONTH
      const ecrStorage = 0.50

      const total = computeCost + natCost + ecrStorage
      const eksBaseline = 73 + 32

      return {
        service: 'ECS Fargate (worker)',
        monthlyMin: Math.round(total * 0.8 * 100) / 100,
        monthlyTypical: Math.round(total * 100) / 100,
        monthlyMax: Math.round(total * 1.5 * 100) / 100,
        breakdown: [
          { 
            component: 'Fargate compute', 
            monthlyCost: Math.round(computeCost * 100) / 100, 
            note: `${cpuVCPU} vCPU, ${memoryGB.toFixed(1)}GB` 
          },
          { 
            component: 'NAT Gateway', 
            monthlyCost: Math.round(natCost * 100) / 100, 
            note: 'Outbound internet access' 
          },
          { 
            component: 'ECR storage', 
            monthlyCost: ecrStorage, 
            note: 'Container image' 
          },
        ],
        savingsVsEKS: Math.round((eksBaseline - total) * 100) / 100,
        displayPrice: `$${Math.round(total * 0.8)} - $${Math.round(total * 1.5)}/month`,
      }
    }

    case 'cloudfront_s3': {
      const s3Cost = 0.50
      const cloudfrontCost = 1.00
      const total = s3Cost + cloudfrontCost
      const eksBaseline = 73 + 32

      return {
        service: 'S3 + CloudFront',
        monthlyMin: 0.10,
        monthlyTypical: Math.round(total * 100) / 100,
        monthlyMax: 5.00,
        breakdown: [
          { 
            component: 'S3 storage + requests', 
            monthlyCost: s3Cost, 
            note: 'Static file hosting' 
          },
          { 
            component: 'CloudFront CDN', 
            monthlyCost: cloudfrontCost, 
            note: 'Global distribution + HTTPS' 
          },
        ],
        savingsVsEKS: Math.round((eksBaseline - total) * 100) / 100,
        displayPrice: '$0.10 - $5/month',
      }
    }

    case 'eks_fargate':
    case 'eks_ec2': {
      const controlPlaneCost = AWS_PRICING.eks.controlPlanePerHour * HOURS_PER_MONTH
      const nodeCost = 
        (cpuVCPU * AWS_PRICING.eks.fargateNodePerVCPU * HOURS_PER_MONTH) +
        (memoryGB * AWS_PRICING.eks.fargateNodePerGB * HOURS_PER_MONTH)
      
      const albCost = AWS_PRICING.alb.perHour * HOURS_PER_MONTH
      const natCost = AWS_PRICING.natGateway.perHour * HOURS_PER_MONTH
      const total = controlPlaneCost + nodeCost + albCost + natCost

      return {
        service: 'Amazon EKS',
        monthlyMin: Math.round(total * 100) / 100,
        monthlyTypical: Math.round(total * 1.3 * 100) / 100,
        monthlyMax: Math.round(total * 3 * 100) / 100,
        breakdown: [
          { 
            component: 'EKS control plane', 
            monthlyCost: Math.round(controlPlaneCost * 100) / 100, 
            note: 'Fixed cost regardless of workload' 
          },
          { 
            component: 'Fargate nodes', 
            monthlyCost: Math.round(nodeCost * 100) / 100, 
            note: `${cpuVCPU} vCPU, ${memoryGB.toFixed(1)}GB` 
          },
          { 
            component: 'Application Load Balancer', 
            monthlyCost: Math.round(albCost * 100) / 100, 
            note: 'HTTPS termination' 
          },
          { 
            component: 'NAT Gateway', 
            monthlyCost: Math.round(natCost * 100) / 100, 
            note: 'Outbound internet access' 
          },
        ],
        savingsVsEKS: 0,
        displayPrice: `$${Math.round(total)} - $${Math.round(total * 3)}/month`,
      }
    }

    default:
      throw new Error(`Unknown service: ${service}`)
  }
}
