package resources

import (
	"context"
	"time"

	"github.com/autostack/terraform-provider-autostack/internal/client"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ resource.Resource = &EnvironmentResource{}

type EnvironmentResource struct {
	client *client.Client
}

type EnvironmentResourceModel struct {
	ID                   types.String `tfsdk:"id"`
	Name                 types.String `tfsdk:"name"`
	RepoURL              types.String `tfsdk:"repo_url"`
	Branch               types.String `tfsdk:"branch"`
	Environment          types.String `tfsdk:"environment"`
	Size                 types.String `tfsdk:"size"`
	CloudCredentialID    types.String `tfsdk:"cloud_credential_id"`
	LiveURL              types.String `tfsdk:"live_url"`
	Status               types.String `tfsdk:"status"`
	EstimatedMonthlyCost types.Float64 `tfsdk:"estimated_monthly_cost"`
	EnvVars              types.Map    `tfsdk:"env_vars"`
	SecretEnvVars        types.Map    `tfsdk:"secret_env_vars"`
}

func NewEnvironmentResource() resource.Resource {
	return &EnvironmentResource{}
}

func (r *EnvironmentResource) Metadata(ctx context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_environment"
}

func (r *EnvironmentResource) Schema(ctx context.Context, req resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed: true,
			},
			"name": schema.StringAttribute{
				Required: true,
			},
			"repo_url": schema.StringAttribute{
				Required: true,
			},
			"branch": schema.StringAttribute{
				Optional: true,
				// Default is ignored in simplified demo
			},
			"environment": schema.StringAttribute{
				Required: true,
			},
			"size": schema.StringAttribute{
				Required: true,
			},
			"cloud_credential_id": schema.StringAttribute{
				Required: true,
			},
			"live_url": schema.StringAttribute{
				Computed: true,
			},
			"status": schema.StringAttribute{
				Computed: true,
			},
			"estimated_monthly_cost": schema.Float64Attribute{
				Computed: true,
			},
			"env_vars": schema.MapAttribute{
				ElementType: types.StringType,
				Optional:    true,
			},
			"secret_env_vars": schema.MapAttribute{
				ElementType: types.StringType,
				Optional:    true,
				Sensitive:   true, // RULE R3
			},
		},
	}
}

func (r *EnvironmentResource) Configure(ctx context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}

	c, ok := req.ProviderData.(*client.Client)
	if !ok {
		resp.Diagnostics.AddError("Unexpected Resource Configure Type", "Expected *client.Client")
		return
	}

	r.client = c
}

func (r *EnvironmentResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan EnvironmentResourceModel
	diags := req.Plan.Get(ctx, &plan)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	envClientStruct := &client.Environment{
		Name:              plan.Name.ValueString(),
		RepoURL:           plan.RepoURL.ValueString(),
		Branch:            plan.Branch.ValueString(),
		Environment:       plan.Environment.ValueString(),
		Size:              plan.Size.ValueString(),
		CloudCredentialID: plan.CloudCredentialID.ValueString(),
	}

	// Assuming envVars maps are handled via loops, ignoring details for stub
	created, err := r.client.CreateEnvironment(ctx, envClientStruct)
	if err != nil {
		resp.Diagnostics.AddError("Error creating environment", err.Error())
		return
	}

	// Wait for 'live'
	liveEnv, err := r.client.WaitForStatus(ctx, created.ID, "live", 5*time.Minute)
	if err != nil {
		resp.Diagnostics.AddError("Error waiting for live status", err.Error())
		return
	}

	plan.ID = types.StringValue(liveEnv.ID)
	plan.LiveURL = types.StringValue(liveEnv.LiveURL)
	plan.Status = types.StringValue(liveEnv.Status)
	
	diags = resp.State.Set(ctx, plan)
	resp.Diagnostics.Append(diags...)
}

func (r *EnvironmentResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state EnvironmentResourceModel
	diags := req.State.Get(ctx, &state)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	env, err := r.client.GetEnvironment(ctx, state.ID.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Error Reading AutoStack Environment", "Could not read environment ID "+state.ID.ValueString()+": "+err.Error())
		return
	}

	state.LiveURL = types.StringValue(env.LiveURL)
	state.Status = types.StringValue(env.Status)

	diags = resp.State.Set(ctx, &state)
	resp.Diagnostics.Append(diags...)
}

func (r *EnvironmentResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	// Simple Provider: Recreates environment conceptually on state mismatch
}

func (r *EnvironmentResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state EnvironmentResourceModel
	diags := req.State.Get(ctx, &state)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	err := r.client.DeleteEnvironment(ctx, state.ID.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Error Deleting AutoStack Environment", err.Error())
		return
	}
}
