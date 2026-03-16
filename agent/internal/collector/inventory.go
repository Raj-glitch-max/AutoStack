package collector

import (
	"context"
	"fmt"
	"log"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// InventorySnapshot is a point-in-time snapshot of all workloads in the cluster.
type InventorySnapshot struct {
	CollectedAt     time.Time           `json:"collected_at"`
	Workloads       []WorkloadInfo      `json:"workloads"`
	NetworkPolicies []NetworkPolicyInfo `json:"networkPolicies"`
	PDBs            []PDBInfo           `json:"pdbs"`
	HPAs            []HPAInfo           `json:"hpas"`
}

// WorkloadInfo contains details about a single workload.
type WorkloadInfo struct {
	Name       string          `json:"name"`
	Namespace  string          `json:"namespace"`
	Kind       string          `json:"kind"`
	Replicas   int32           `json:"replicas"`
	Containers []ContainerInfo `json:"containers"`
}

// ContainerInfo contains details about a single container.
type ContainerInfo struct {
	Name            string           `json:"name"`
	Image           string           `json:"image"`
	Resources       *ResourceInfo    `json:"resources,omitempty"`
	SecurityContext *SecurityCtxInfo `json:"securityContext,omitempty"`
	HasLiveness     bool             `json:"livenessProbe"`
	HasReadiness    bool             `json:"readinessProbe"`
}

// ResourceInfo contains CPU/memory requests and limits.
type ResourceInfo struct {
	Requests *ResourceValues `json:"requests,omitempty"`
	Limits   *ResourceValues `json:"limits,omitempty"`
}

// ResourceValues holds CPU and memory values as strings.
type ResourceValues struct {
	CPU    string `json:"cpu,omitempty"`
	Memory string `json:"memory,omitempty"`
}

// SecurityCtxInfo is a simplified view of k8s container SecurityContext.
type SecurityCtxInfo struct {
	Privileged               bool `json:"privileged"`
	RunAsNonRoot             bool `json:"runAsNonRoot"`
	ReadOnlyRootFilesystem   bool `json:"readOnlyRootFilesystem"`
	AllowPrivilegeEscalation bool `json:"allowPrivilegeEscalation"`
}

// NetworkPolicyInfo is a simplified view of a NetworkPolicy.
type NetworkPolicyInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
}

// PDBInfo is a simplified view of a PodDisruptionBudget.
type PDBInfo struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	MinAvailable int32  `json:"minAvailable"`
}

// HPAInfo is a simplified view of a HorizontalPodAutoscaler.
type HPAInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	TargetRef string `json:"targetRef"`
}

// InventoryCollector gathers the full workload inventory from the cluster.
type InventoryCollector struct {
	k8sClient *kubernetes.Clientset
}

// NewInventoryCollector creates a new collector.
func NewInventoryCollector(client *kubernetes.Clientset) *InventoryCollector {
	return &InventoryCollector{k8sClient: client}
}

// Collect gathers a point-in-time inventory of all workloads.
func (ic *InventoryCollector) Collect(ctx context.Context) (*InventorySnapshot, error) {
	snapshot := &InventorySnapshot{CollectedAt: time.Now()}

	// Deployments
	deployments, err := ic.k8sClient.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("deployment list failed: %w", err)
	}
	for i := range deployments.Items {
		d := &deployments.Items[i]
		if systemNamespaces[d.Namespace] {
			continue
		}
		replicas := int32(1)
		if d.Spec.Replicas != nil {
			replicas = *d.Spec.Replicas
		}
		snapshot.Workloads = append(snapshot.Workloads, extractWorkload(d.Name, d.Namespace, "Deployment", replicas, d.Spec.Template.Spec.Containers))
	}

	// StatefulSets
	statefulsets, err := ic.k8sClient.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("statefulset list failed: %w", err)
	}
	for i := range statefulsets.Items {
		s := &statefulsets.Items[i]
		if systemNamespaces[s.Namespace] {
			continue
		}
		replicas := int32(1)
		if s.Spec.Replicas != nil {
			replicas = *s.Spec.Replicas
		}
		snapshot.Workloads = append(snapshot.Workloads, extractWorkload(s.Name, s.Namespace, "StatefulSet", replicas, s.Spec.Template.Spec.Containers))
	}

	// DaemonSets
	daemonsets, err := ic.k8sClient.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("daemonset list failed: %w", err)
	}
	for i := range daemonsets.Items {
		d := &daemonsets.Items[i]
		if systemNamespaces[d.Namespace] {
			continue
		}
		snapshot.Workloads = append(snapshot.Workloads, extractWorkload(d.Name, d.Namespace, "DaemonSet", d.Status.DesiredNumberScheduled, d.Spec.Template.Spec.Containers))
	}

	// NetworkPolicies
	netpols, err := ic.k8sClient.NetworkingV1().NetworkPolicies("").List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("[Inventory] NetworkPolicy list error (non-fatal): %v", err)
	} else {
		for i := range netpols.Items {
			np := &netpols.Items[i]
			if systemNamespaces[np.Namespace] {
				continue
			}
			snapshot.NetworkPolicies = append(snapshot.NetworkPolicies, NetworkPolicyInfo{
				Name: np.Name, Namespace: np.Namespace,
			})
		}
	}

	// PodDisruptionBudgets
	pdbs, err := ic.k8sClient.PolicyV1().PodDisruptionBudgets("").List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("[Inventory] PDB list error (non-fatal): %v", err)
	} else {
		for i := range pdbs.Items {
			pdb := &pdbs.Items[i]
			if systemNamespaces[pdb.Namespace] {
				continue
			}
			minA := int32(0)
			if pdb.Spec.MinAvailable != nil {
				minA = pdb.Spec.MinAvailable.IntVal
			}
			snapshot.PDBs = append(snapshot.PDBs, PDBInfo{
				Name: pdb.Name, Namespace: pdb.Namespace, MinAvailable: minA,
			})
		}
	}

	// HPAs
	hpas, err := ic.k8sClient.AutoscalingV2().HorizontalPodAutoscalers("").List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("[Inventory] HPA list error (non-fatal): %v", err)
	} else {
		for i := range hpas.Items {
			hpa := &hpas.Items[i]
			if systemNamespaces[hpa.Namespace] {
				continue
			}
			snapshot.HPAs = append(snapshot.HPAs, HPAInfo{
				Name: hpa.Name, Namespace: hpa.Namespace,
				TargetRef: fmt.Sprintf("%s/%s", hpa.Spec.ScaleTargetRef.Kind, hpa.Spec.ScaleTargetRef.Name),
			})
		}
	}

	return snapshot, nil
}

// RunLoop periodically collects inventory and sends it via the callback.
func (ic *InventoryCollector) RunLoop(ctx context.Context, interval time.Duration, send func(*InventorySnapshot) error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			snapshot, err := ic.Collect(ctx)
			if err != nil {
				log.Printf("[Inventory] Collection error: %v", err)
				continue
			}
			if err := send(snapshot); err != nil {
				log.Printf("[Inventory] Send error: %v", err)
			} else {
				log.Printf("[Inventory] Sent: %d workloads, %d netpols, %d PDBs, %d HPAs",
					len(snapshot.Workloads), len(snapshot.NetworkPolicies), len(snapshot.PDBs), len(snapshot.HPAs))
			}
		}
	}
}

// extractWorkload converts K8s container specs to our WorkloadInfo struct.
func extractWorkload(name, namespace, kind string, replicas int32, containers []corev1.Container) WorkloadInfo {
	info := WorkloadInfo{
		Name:      name,
		Namespace: namespace,
		Kind:      kind,
		Replicas:  replicas,
	}

	for i := range containers {
		c := &containers[i]
		ci := ContainerInfo{
			Name:         c.Name,
			Image:        c.Image,
			HasLiveness:  c.LivenessProbe != nil,
			HasReadiness: c.ReadinessProbe != nil,
		}

		// Resources
		if c.Resources.Requests != nil || c.Resources.Limits != nil {
			ri := &ResourceInfo{}
			if c.Resources.Requests != nil {
				ri.Requests = &ResourceValues{
					CPU:    c.Resources.Requests.Cpu().String(),
					Memory: c.Resources.Requests.Memory().String(),
				}
			}
			if c.Resources.Limits != nil {
				ri.Limits = &ResourceValues{
					CPU:    c.Resources.Limits.Cpu().String(),
					Memory: c.Resources.Limits.Memory().String(),
				}
			}
			ci.Resources = ri
		}

		// Security context
		if c.SecurityContext != nil {
			sci := &SecurityCtxInfo{}
			if c.SecurityContext.Privileged != nil {
				sci.Privileged = *c.SecurityContext.Privileged
			}
			if c.SecurityContext.RunAsNonRoot != nil {
				sci.RunAsNonRoot = *c.SecurityContext.RunAsNonRoot
			}
			if c.SecurityContext.ReadOnlyRootFilesystem != nil {
				sci.ReadOnlyRootFilesystem = *c.SecurityContext.ReadOnlyRootFilesystem
			}
			if c.SecurityContext.AllowPrivilegeEscalation != nil {
				sci.AllowPrivilegeEscalation = *c.SecurityContext.AllowPrivilegeEscalation
			}
			ci.SecurityContext = sci
		}

		info.Containers = append(info.Containers, ci)
	}

	return info
}
