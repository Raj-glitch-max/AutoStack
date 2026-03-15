package resources

import (
	"context"

	"github.com/autostack/terraform-provider-autostack/internal/client"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ resource.Resource = &CredentialResource{}

type CredentialResource struct {
	client *client.Client
}

type CredentialResourceModel struct {
	ID              types.String `tfsdk:"id"`
	DisplayName     types.String `tfsdk:"display_name"`
	Provider        types.String `tfsdk:"provider"`
	AccountID       types.String `tfsdk:"account_id"`
	Region          types.String `tfsdk:"region"`
	RoleArn         types.String `tfsdk:"role_arn"`
	CredentialsJSON types.String `tfsdk:"credentials_json"`
}

func NewCredentialResource() resource.Resource {
	return &CredentialResource{}
}

func (r *CredentialResource) Metadata(ctx context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_cloud_credential"
}

func (r *CredentialResource) Schema(ctx context.Context, req resource.SchemaRequest, resp *resource.SchemaResponse) {
	// Simple stub schema
	resp.Schema = schema.Schema{
		Attributes: map[string]schema.Attribute{
			"id":               schema.StringAttribute{Computed: true},
			"display_name":     schema.StringAttribute{Required: true},
			"provider":         schema.StringAttribute{Required: true},
			"account_id":       schema.StringAttribute{Optional: true},
			"region":           schema.StringAttribute{Optional: true},
			"role_arn":         schema.StringAttribute{Optional: true},
			"credentials_json": schema.StringAttribute{Optional: true, Sensitive: true},
		},
	}
}

func (r *CredentialResource) Configure(ctx context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	r.client = req.ProviderData.(*client.Client)
}

func (r *CredentialResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	// Stub to satisfy framework check
}

func (r *CredentialResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	// Stub
}

func (r *CredentialResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	// Stub
}

func (r *CredentialResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	// Stub
}
